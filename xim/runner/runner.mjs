// xim 스튜디오 실행기 — Claude Code(구독)로 글 단계를, PC 에서는 ChatGPT(구독, 엣지)로 그림 단계를 돌려 결과를 xim 에 올린다.
//
//   node xim/runner/runner.mjs --mode pc                          PC 도우미: xim 을 5초마다 보며 일감(글 · 그림)을 처리한다. 켜 두면 된다.
//   node xim/runner/runner.mjs --mode cloud --job <id> --stage run|articles|redo-slide
//                                                                 GitHub Actions: 글 단계만 (그림은 'images' 상태로 PC 에 넘긴다)
//   node xim/runner/runner.mjs --catalog                          인물 사진 87장 분류표(표정 · 제스처) 만들기 — 한 번만
//   node xim/runner/runner.mjs --login                            자동화용 엣지 창을 띄운다 → ChatGPT 로그인 뒤 창을 닫으면 끝
//
//   설정: 환경변수 XIM_URL · STUDIO_HELPER_TOKEN · DOCS(엔진 폴더, PC 전용) · BROWSER_EXE
//         또는 <DOCS>/tools/_xim_helper.json { url, token, browser:'edge'|'brave', docs }
//   비밀값 · 토큰은 리포에 두지 않는다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as P from '../_worker/studio-prompts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d = '') => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? '') : d; };
const has = (k) => args.includes(k);
const MODE = has('--setup') ? 'setup' : has('--catalog') ? 'catalog' : has('--login') ? 'login' : opt('--mode', 'pc');

// ───────── 설정 ─────────
const cfgFile = [process.env.DOCS && path.join(process.env.DOCS, 'tools', '_xim_helper.json'), 'D:\\ws\\docs\\tools\\_xim_helper.json'].filter(Boolean).find((f) => fs.existsSync(f));
const cfg = cfgFile ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
const XIM = (process.env.XIM_URL || cfg.url || 'https://xim.xiangdolee.workers.dev').replace(/\/$/, '');
const TOKEN = process.env.STUDIO_HELPER_TOKEN || cfg.token || '';
const DOCS = process.env.DOCS || cfg.docs || '';
const BROWSER = process.env.BROWSER_EXE || (cfg.browser === 'brave' ? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const PROFILE = DOCS ? path.join(DOCS, 'tools', cfg.browser === 'brave' ? '_brave_profile' : '_edge_profile') : '';
const WORK_ROOT = DOCS ? path.join(DOCS, 'xim') : path.join(process.cwd(), 'work');
const MARKER = '=====[교정된 최종 원고]=====';
if (!TOKEN && MODE !== 'setup') { console.error('STUDIO_HELPER_TOKEN 이 없습니다 — 먼저  node xim/runner/runner.mjs --setup --token <토큰>  (토큰은 xim 스튜디오 > 설정 > 다른 PC 설치)'); process.exit(1); }

const log = (...a) => console.log(new Date().toLocaleTimeString('ko-KR', { hour12: false }), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── xim API ─────────
async function api(p, { method = 'GET', body, raw, headers = {} } = {}) {
  const res = await fetch(XIM + p, { method, headers: { 'X-Studio-Token': TOKEN, ...(raw ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw ? raw : body !== undefined ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const out = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  if (!res.ok) throw new Error(`xim ${method} ${p} → ${res.status} ${out?.error || ''}`);
  return out;
}
const J = (id) => ({
  get: () => api(`/api/studio/helper/jobs/${id}`),
  step: (step, status, note = '', usage) => api(`/api/studio/helper/jobs/${id}/step`, { method: 'POST', body: { step, status, note, usage } }).catch((e) => log('(step 보고 실패)', e.message)),
  status: (status, step = '', extra = {}) => api(`/api/studio/helper/jobs/${id}/status`, { method: 'POST', body: { status, step, ...extra } }),
  doc: (kind, body) => api(`/api/studio/helper/jobs/${id}/doc/${kind}`, { method: 'PUT', body: { body } }),
  rss: () => api(`/api/studio/helper/jobs/${id}/rss`, { method: 'POST', body: {} }),
  asset: (kind, idx, bytes, mime, w, h) => api(`/api/studio/helper/jobs/${id}/asset?kind=${kind}&idx=${idx}&w=${w || 0}&h=${h || 0}`, { method: 'POST', raw: bytes, headers: { 'Content-Type': mime } }),
});
async function download(urlPath, dest) {
  const res = await fetch(XIM + urlPath, { headers: { 'X-Studio-Token': TOKEN } });
  if (!res.ok) throw new Error(`내려받기 실패 ${urlPath} ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// ───────── Claude Code (구독) ─────────
//   프롬프트는 stdin 으로 넘긴다(윈도우 명령줄 길이 제한). --output-format json 의 result 가 답.
const claudeBin = (() => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' }); const l = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); return l.find((x) => /\.cmd$/i.test(x)) || l[0] || 'claude'; })();
async function claude(prompt, { cwd, timeoutMin = 25, label = 'claude' } = {}) {
  const t0 = Date.now();
  const extra = cwd ? ['--add-dir', cwd] : [];
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin, ['-p', '--output-format', 'json', '--dangerously-skip-permissions', ...extra], { cwd: cwd || process.cwd(), shell: process.platform === 'win32', windowsHide: true, env: { ...process.env } });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); else child.kill('SIGKILL'); } catch { /* */ } reject(new Error(`${label}: ${timeoutMin}분 안에 끝나지 않음`)); }, timeoutMin * 60000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let result = out;
      try { const j = JSON.parse(out); result = j.result ?? j.content ?? out; if (j.is_error) return reject(new Error(`${label}: ${String(result).slice(0, 300)}`)); } catch { /* 일반 텍스트 */ }
      if (code !== 0 && !result) return reject(new Error(`${label}: claude 종료코드 ${code} ${err.slice(0, 300)}`));
      log(`  ${label} ${Math.round((Date.now() - t0) / 1000)}초`);
      resolve(String(result));
    });
    child.stdin.end(prompt);
  });
}
function parseJson(text, label = '응답') {
  let s = String(text).replace(/```[a-z]*\n?/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error(`${label}이 JSON 이 아닙니다: ${s.slice(0, 200)}`);
  return JSON.parse(s.slice(a, b + 1));
}
// JSON 스키마 → 모양 예시 (claude -p 는 output_config 가 없어 모양을 글로 못 박는다)
function shape(schema) {
  if (!schema || typeof schema !== 'object') return '…';
  if (schema.type === 'object') return '{ ' + Object.entries(schema.properties || {}).map(([k, v]) => `"${k}": ${shape(v)}`).join(', ') + ' }';
  if (schema.type === 'array') return `[ ${shape(schema.items)}, … ]`;
  if (schema.type === 'integer' || schema.type === 'number') return '0';
  if (schema.type === 'boolean') return 'true|false';
  return '"…"';
}
const SHAPE = (schema) => `

★ 출력 JSON 모양(키 이름 · 구조를 정확히 이렇게, 다른 키 금지): ${shape(schema)}`;
const JSON_ONLY = '\n\n★ 출력 규칙: 설명 · 머리말 · 코드펜스 없이 JSON 객체 하나만 출력한다. 파일을 만들거나 질문하지 않는다. 사용자에게 묻지 말고 끝까지 스스로 판단한다.';
const splitBlocks = (text) => String(text || '').split(/\n(?=📌)/).map((b) => b.trim()).filter((b) => b.startsWith('📌'));

// ───────── 글 단계 ─────────
async function stepRun(j, name, note, fn) {
  await j.step(name, 'running', note);
  try { const r = await fn(); await j.step(name, 'done', typeof r === 'string' ? r : ''); return r; }
  catch (e) { await j.step(name, 'failed', e.message); throw e; }
}
async function assertAlive(j) {
  const { job } = await j.get();
  if (job.status === 'stopped') throw new Error('STOPPED');
  return job;
}
const kstNow = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(5, 16).replace('T', ' ') + ' KST';

async function runText(payload, work, { stage = 'run' } = {}) {
  const job = payload.job, j = J(job.id), docs = payload.docs || {};
  const parse = (k) => { try { return docs[k] ? JSON.parse(docs[k]) : null; } catch { return null; } };
  fs.mkdirSync(work, { recursive: true });
  let blocks = docs.articles ? splitBlocks(docs.articles) : null;

  if (!blocks) {
    if (job.source === 'rss') {
      let top = parse('top15'), chosen = parse('chosen');
      if (top && !(top.items || []).length) top = null;   // 모양이 어긋난 예전 결과는 버린다
      if (!top) {
        let covered = [];   // 최근 회차에서 이미 다룬 기사 — 같은 사건은 뺀다 (Top15 단계의 목적)
        let hours = 8;
        const cands = await stepRun(j, 'rss', '', async () => { const r = await j.rss(); covered = r.covered || []; hours = r.hours || 8; if (r.candidates.length < 3) throw new Error(`RSS 후보가 ${r.candidates.length}건뿐입니다.`); return r.candidates; });
        top = await stepRun(j, 'top15', '', async () => {
          const list = cands.map((c) => `[${c.n}] ${c.title}\n    ${c.label} | ${c.published_kst}\n    ${c.url}\n    ${c.summary}`).join('\n');
          const t = parseJson(await claude(`${P.TOP15_SYSTEM}\n\n기준 시각: ${kstNow()} (최근 ${hours}시간 — 제작 시각 기준)\n\n후보 목록:\n${list}${covered.length ? `\n\n★ 이미 다룬 뉴스(최근 회차) — 아래와 같은 사건 · 같은 소재의 후속 재보도는 Top15 와 추천에서 모두 뺀다(수치만 갱신된 같은 이야기도 같은 사건으로 본다). 정말 새로운 전개(새 결정 · 큰 변화)일 때만 예외:\n${covered.map((c) => `- [${c.when}] ${c.title}${c.url ? ` (${c.url})` : ''}`).join('\n')}` : ''}\n\n★ items[].n 과 picks 의 숫자는 후보 목록의 [n] 번호를 그대로 쓴다(새로 매기지 않는다). items 는 고른 15개 전부.${SHAPE(P.TOP15_SCHEMA)}${JSON_ONLY}`, { label: 'Top15' }), 'Top15');
          t.items = (t.items || []).slice(0, 15);
          t.picks = (t.picks || []).map((x) => (typeof x === 'object' && x ? (x.n ?? x.candidate ?? x.no) : x)).map(Number).filter(Boolean);
          if (!t.items.length) throw new Error('Top15 결과에 items 가 없습니다.');
          await j.doc('top15', t);
          return t;
        });
        await j.step('top15', 'done', `${top.items.length}개 · 추천 ${(top.picks || []).join(',')}`);
      }
      if (job.options.pick === 'manual' && !chosen) { await j.status('pick', 'pick'); log('  6개 고르기 대기 → 사용자가 고르면 다시 이어진다'); return 'wait'; }
      const picks = (chosen || top.picks || []).slice(0, 6);
      const items = picks.map((n) => top.items.find((i) => i.n === n)).filter(Boolean);
      if (!items.length) throw new Error('고른 기사가 없습니다.');
      await assertAlive(j);
      blocks = await stepRun(j, 'articles', `${items.length}개`, async () => {
        const list = items.map((it, i) => `${i + 1}. ${it.title}\n   URL: ${it.url}\n   요지: ${it.summary}`).join('\n');
        const prompt = `아래 기사 ${items.length}개로 한국어 유튜브 해설 대본 ${items.length}개를 쓴다.
★ 속도 규칙: Agent 도구(general-purpose)를 기사 수만큼 한 메시지에 동시에 띄워 병렬로 처리한다(기사 1개 = 에이전트 1개). 각 에이전트는 URL 을 WebFetch 로 1회만 읽고 대본 텍스트만 돌려준다. 원문을 메인에 쌓지 않는다.
각 대본 형식 · 문체:
${P.ARTICLE_FORMAT}
결과: 대본 ${items.length}개를 위 순서대로, 블록 사이 빈 줄 1개로 이어 붙여 출력한다. 각 블록은 📌 로 시작한다. 다른 설명 · 머리말 · 코드펜스 없이 대본만.

${list}`;
        const out = await claude(prompt, { label: '기사' });
        const b = splitBlocks(out.replace(/```[a-z]*\n?/g, ''));
        if (b.length < Math.min(items.length, 1)) throw new Error(`대본 블록이 ${b.length}개뿐입니다.`);
        await j.doc('articles', b.join('\n\n'));
        return b;
      });
    } else if (job.source === 'capture') {
      const caps = payload.captures || [];
      if (!caps.length) throw new Error('캡쳐 이미지가 없습니다.');
      blocks = await stepRun(j, 'articles', `캡쳐 ${caps.length}장`, async () => {
        const files = [];
        for (const c of caps) files.push(await download(c.url, path.join(work, 'shot', `${c.idx}.${c.mime.includes('png') ? 'png' : c.mime.includes('jpeg') ? 'jpg' : 'webp'}`)));
        const prompt = `${work}\\shot\\ 폴더의 캡쳐 이미지 ${files.length}장을 Read 로 각각 보고, 이미지 1장 = 대본 1개로 한국어 유튜브 해설 대본을 쓴다(파일 이름 숫자 순서). 캡쳐에 적힌 숫자 · 인물 · 날짜만 쓰고 없는 사실을 지어내지 않는다.
파일: ${files.join(', ')}
각 대본 형식 · 문체:
${P.ARTICLE_FORMAT}
결과: 대본 ${files.length}개를 순서대로, 블록 사이 빈 줄 1개로 이어 붙여 출력. 각 블록은 📌 로 시작. 설명 · 코드펜스 없이 대본만.`;
        const b = splitBlocks((await claude(prompt, { cwd: work, label: '기사(캡쳐)' })).replace(/```[a-z]*\n?/g, ''));
        if (!b.length) throw new Error('대본 블록이 없습니다.');
        await j.doc('articles', b.join('\n\n'));
        return b;
      });
    } else {
      blocks = await stepRun(j, 'articles', '글 직접', async () => {
        const b = splitBlocks((await claude(P.ARTICLE_FROM_TEXT(job.options.text || ''), { label: '기사(글)' })).replace(/```[a-z]*\n?/g, ''));
        if (!b.length) throw new Error('대본 블록이 없습니다.');
        await j.doc('articles', b.join('\n\n'));
        return b;
      });
    }
  }

  let fact = parse('factcheck');
  if (!fact) {
    await assertAlive(j);
    fact = await stepRun(j, 'factcheck', '', async () => {
      const f = parseJson(await claude(`${P.FACTCHECK_SYSTEM}\n\n${blocks.map((b, i) => `[블록 ${i + 1}]\n${b}`).join('\n\n')}${SHAPE(P.FACTCHECK_SCHEMA)}${JSON_ONLY}`, { label: '팩트체크' }), '팩트체크');
      if (!Array.isArray(f.fixed_blocks) || f.fixed_blocks.length !== blocks.length) f.fixed_blocks = blocks;
      await j.doc('factcheck', f);
      return f;
    });
    await j.step('factcheck', 'done', String(fact.summary || '').slice(0, 120));
  }
  let summary = parse('summary');
  if (!summary) {
    await assertAlive(j);
    summary = await stepRun(j, 'summary', '', async () => {
      const s = parseJson(await claude(`${P.SUMMARY_SYSTEM}\n\n[사람 이름] ${(fact.people || []).join(', ') || '없음'}\n\n${fact.fixed_blocks.join('\n\n')}${SHAPE(P.SUMMARY_SCHEMA)}${JSON_ONLY}`, { label: '유튜브 패키지' }), '유튜브 패키지');
      await j.doc('summary', s);
      return s;
    });
    await j.step('summary', 'done', summary.titles?.[0] || '');
  }
  // 썸네일 값 — 자동이면 Claude 가 고르고, 수동이면 사용자가 고를 때까지 기다린다
  let pick = parse('thumb_pick');
  if (!pick) {
    if (job.options.thumb === 'manual') { await j.status('thumb', 'thumb'); log('  썸네일 선택 대기'); return 'wait'; }
    pick = await stepRun(j, 'thumb-pick', '', async () => {
      const catalog = payload.face_catalog ? JSON.parse(payload.face_catalog) : null;
      const faces = catalog?.faces?.length ? catalog.faces.map((f) => `${f.n}: ${f.emotion} / ${f.gesture} — ${f.desc}`).join('\n') : '(분류표 없음 — face 는 "auto" 로)';
      const p = parseJson(await claude(`${P.THUMB_PICK_SYSTEM}\n\n추천 제목:\n${(summary.titles || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n등장 인물:\n${(summary.people || []).join('\n') || '없음'}\n\n인물 사진 목록:\n${faces}\n\n★ 출력 JSON 모양: { "title": "…", "title_lines": ["…"], "accent_words": ["…"], "face": "001", "emotion": "…", "gesture": "…", "badge_name": "…", "badge_role": "…" }${JSON_ONLY}`, { label: '썸네일 값' }), '썸네일 값');
      const out = { title: p.title || summary.titles?.[0] || '', title_lines: p.title_lines || [], accent_words: p.accent_words || [], emotion: p.emotion || '자동', gesture: p.gesture || '자동', badgeName: p.badge_name || '', badgeRole: p.badge_role || '', face: /^\d{3}$/.test(p.face || '') ? `emoji:${p.face}` : 'emoji:auto' };
      await j.doc('thumb_pick', out);
      return out;
    });
  }
  return 'images';
}

// ───────── 그림 단계 (PC · ChatGPT) ─────────
function py(argsArr, { cwd, env = {}, timeoutMin = 30, label = 'python' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-u', ...argsArr], { cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...env }, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; process.stdout.write(s); });
    child.stderr.on('data', (d) => { const s = d.toString(); out += s; process.stderr.write(s); });
    const timer = setTimeout(() => { try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); } catch { /* */ } reject(new Error(`${label}: ${timeoutMin}분 초과`)); }, timeoutMin * 60000);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}
const engineEnv = () => ({ BROWSER_EXE: BROWSER, BRAVE_USER_DATA: PROFILE, KEEP_CF_COOKIES: '1' });

async function toWebp(src) {
  const dst = src.replace(/\.[a-z]+$/i, '.webp');
  const r = spawnSync('python', ['-c', `from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.save(sys.argv[2],'WEBP',quality=90,method=4);print(im.size[0],im.size[1])`, src, dst], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('webp 변환 실패: ' + r.stderr.slice(0, 200));
  const [w, h] = r.stdout.trim().split(/\s+/).map(Number);
  return { file: dst, w, h };
}

async function runImages(payload, work) {
  if (!DOCS) throw new Error('그림 단계는 PC 도우미(DOCS 설정)에서만 됩니다.');
  const job = payload.job, j = J(job.id), docs = payload.docs || {};
  const parse = (k) => { try { return docs[k] ? JSON.parse(docs[k]) : null; } catch { return null; } };
  const fact = parse('factcheck');
  const blocks = fact?.fixed_blocks || splitBlocks(docs.articles);
  if (!blocks?.length) throw new Error('원고가 없어 그림을 만들 수 없습니다.');
  fs.mkdirSync(path.join(work, 'shot2'), { recursive: true });
  fs.writeFileSync(path.join(work, '02_FactChecker.txt'), `${MARKER}\n\n${blocks.join('\n\n')}\n`, 'utf8');
  const redo = job.options.redo;
  const onlyNums = redo?.what === 'slide' ? [String(redo.idx)] : [];
  const pick = parse('thumb_pick');
  const withThumb = !onlyNums.length && !!pick && !(payload.assetsHaveThumb);

  // 썸네일 잡 파일 — Claude 가 인물 사진을 보고 6.1 '실행 방법' 대로 프롬프트를 쓴다
  if (withThumb) {
    await stepRun(j, 'thumb-prompt', pick.title, async () => {
      let face = '';
      if ((pick.face || '').startsWith('person:')) {
        // 기사 속 인물: 구글 이미지에서 사진 1장 (tools/img_search.py — 이름(영문 우선)으로, 실패하면 내 사진으로)
        const name = pick.face.slice(7).trim(); const dest = path.join(work, 'face.png');
        const r = await py(['tools\\img_search.py', name, dest], { cwd: DOCS, timeoutMin: 4, label: '인물 사진 검색' });
        if (r.code === 0 && fs.existsSync(dest)) face = dest; else log(`  인물 사진 검색 실패(${name}) → 내 사진으로`);
      }
      if (!face && (pick.face || '').startsWith('emoji:') && pick.face !== 'emoji:auto') face = await download(`/api/studio/helper/face/${pick.face.slice(6)}`, path.join(work, 'face.webp'));
      else if (!face && (pick.face || '').startsWith('asset:')) face = await download(`/studio/a/${pick.face.slice(6)}`, path.join(work, 'face.webp'));
      if (!face) face = await download(`/api/studio/helper/face/${String(1 + Math.floor(Math.random() * 87)).padStart(3, '0')}`, path.join(work, 'face.webp'));
      const outPng = path.join(work, '06_thumbnail.png');
      const prompt = `${DOCS}\\6.1_thumbnail.md 의 '실행 방법 — 고정 엔진 + 잡 파일' 절차대로 tools\\_thumb_job.json 의 내용을 JSON 으로 만든다. 파일을 쓰지 말고 JSON 만 출력한다.
1) 인물 원본 ${face} 를 Read 로 직접 보고 외형(머리 · 모자 · 선글라스 · 수염 · 의상)을 파악한다 — 프롬프트에 "이 외형은 그대로 유지" 라고 못 박는 근거다.
2) 값: title="${pick.title}", title_lines=${JSON.stringify(pick.title_lines || [])} (비어 있으면 3~4줄로 4~8자씩 끊어 직접), channel="${job.channel}스타일", badge_name="${pick.badgeName || ''}", badge_role="${pick.badgeRole || ''}", emotion="${pick.emotion || '자동'}", gesture="${pick.gesture || '자동'}", face_file="${face.replace(/\\/g, '/')}", out="${outPng.replace(/\\/g, '/')}".
3) prompt 와 pose_fix_prompt 는 6.1 의 5 · 6 · 실행 방법 절 규칙 그대로 쓰되, 표정 · 손동작 · 명찰 · 제목 크기 문구는 직접 쓰지 말고 {FACE_RULE} {HAND_RULE} {BADGE_RULE} {TITLE_RULE} 자리표시를 쓴다. 배경 장면은 제목 내용에 맞게 한두 문장으로 구체적으로. "${job.channel}스타일" 을 한 단어로 붙여 쓴다. 제목 철자 검증 문구를 넣는다. 배경에 제목 · 명찰 외 글자 · 로고 · 워터마크 금지 문구를 넣는다.${JSON_ONLY}`;
      const jobJson = parseJson(await claude(prompt, { cwd: work, label: '썸네일 프롬프트', timeoutMin: 10 }), '썸네일 잡');
      jobJson.face_file = face; jobJson.out = outPng; jobJson.title = pick.title; jobJson.channel = `${job.channel}스타일`;
      fs.writeFileSync(path.join(DOCS, 'tools', '_thumb_job.json'), JSON.stringify(jobJson, null, 2), 'utf8');
      return jobJson.emotion + ' · ' + jobJson.gesture;
    });
  }

  // 슬라이드(+썸네일) — ChatGPT 엔진 그대로
  await assertAlive(j);
  const names = onlyNums.length ? onlyNums.map((n) => `slide-${n}`) : blocks.map((_, i) => `slide-${i + 1}`);
  for (const n of names) await j.step(n, 'running', 'ChatGPT');
  if (withThumb) await j.step('thumb', 'running', 'ChatGPT');
  const r = await py(['tools\\gpt_slide_text.py', ...(withThumb ? ['--with-thumb'] : []), '--result', work, ...onlyNums], { cwd: DOCS, env: engineEnv(), timeoutMin: 40, label: '슬라이드' });
  if (r.code === 2 || /LOGIN_REQUIRED/.test(r.out)) {
    for (const n of names) await j.step(n, 'failed', 'ChatGPT 로그인 필요');
    throw new Error('LOGIN_REQUIRED');
  }
  if (r.code !== 0 && !names.some((n) => fs.existsSync(path.join(work, 'shot2', `${n.replace('slide-', '')}.png`)))) {
    // 브라우저가 안 뜨는 등 엔진 자체가 실패 — 그림 대기로 되돌려 다음에 다시 시도
    const tail = r.out.trim().split(/\r?\n/).filter((l) => !/dbg|Warning/.test(l)).slice(-3).join(' | ');
    for (const n of names) await j.step(n, 'failed', tail.slice(0, 200));
    if (withThumb) await j.step('thumb', 'failed', '엔진 실패');
    throw new Error('ENGINE_FAILED: ' + tail.slice(0, 300));
  }
  // 검수 (03.5 합격 기준) → 불합격 번호만 1회 재생성
  const nums = onlyNums.length ? onlyNums.map(Number) : blocks.map((_, i) => i + 1);
  const made = nums.filter((n) => fs.existsSync(path.join(work, 'shot2', `${n}.png`)));
  if (made.length) {
    await j.step('review', 'running', `${made.length}장`);
    let fails = [];
    try {
      const rv = parseJson(await claude(`${P.REVIEW_SLIDE_SYSTEM}\n\n슬라이드 이미지 ${made.map((n) => `${work}\\shot2\\${n}.png`).join(', ')} 를 Read 로 각각 보고 판정한다. 각 번호의 원고 블록:\n${made.map((n) => `[${n}]\n${blocks[n - 1]}`).join('\n\n')}\n\n출력: { "results": [ { "n": 번호, "pass": true|false, "reason": "" } ] }${JSON_ONLY}`, { cwd: work, label: '검수', timeoutMin: 10 }), '검수');
      const bad = (rv.results || []).filter((x) => x.pass === false);
      fails = bad.map((x) => x.n);
      await j.step('review', 'done', fails.length ? `불합격 → 재생성: ${bad.map((x) => `${x.n}번(${String(x.reason || '').slice(0, 60)})`).join(' · ')}` : '전부 합격');
    } catch (e) { await j.step('review', 'failed', e.message); }
    if (fails.length) await py(['tools\\gpt_slide_text.py', '--result', work, ...fails.map(String)], { cwd: DOCS, env: engineEnv(), timeoutMin: 25, label: '재생성' });
  }
  // 예전과 같은 산출물 파일도 작업 폴더에 남긴다: 01/03 txt + 04_slideshow.html (04_PPTMaker.md 규격, make_slideshow.py)
  try {
    const summary = parse('summary');
    fs.writeFileSync(path.join(work, '01_ArticleMaker.txt'), splitBlocks(docs.articles).join('\n\n') + '\n', 'utf8');
    if (summary) fs.writeFileSync(path.join(work, '03_Summary.txt'), `## 제목 추천\n\n${(summary.titles || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n---\n\n## 인트로 대본\n\n${summary.intro || ''}\n\n---\n\n## 유튜브 더보기란\n\n${summary.description || ''}\n\n---\n\n## 등장 인물\n\n${(summary.people || []).map((p) => `- ${p}`).join('\n') || '- 없음'}\n`, 'utf8');
    const sh = await py(['tools\\make_slideshow.py', work], { cwd: DOCS, timeoutMin: 2, label: '슬라이드쇼 파일' });
    if (sh.code === 0) log(`  04_slideshow.html → ${path.join(work, '04_slideshow.html')}`);
  } catch (e) { log('  (슬라이드쇼 파일 생략)', e.message); }
  // 올리기
  for (const n of nums) {
    const png = path.join(work, 'shot2', `${n}.png`);
    if (!fs.existsSync(png)) { await j.step(`slide-${n}`, 'failed', '그림이 안 나옴'); continue; }
    const { file, w, h } = await toWebp(png);
    await j.asset('slide', n, fs.readFileSync(file), 'image/webp', w, h);
    await j.step(`slide-${n}`, 'done', `${w}x${h}`);
  }
  if (withThumb) {
    const png = path.join(work, '06_thumbnail.png');
    if (fs.existsSync(png)) { const { file, w, h } = await toWebp(png); await j.asset('thumb', 1, fs.readFileSync(file), 'image/webp', w, h); await j.step('thumb', 'done', `${w}x${h}`); }
    else await j.step('thumb', 'failed', '썸네일이 안 나옴 (gpt_slide_text 종료코드 ' + r.code + ')');
  }
}

// ───────── 모드 ─────────
async function processJob(payload) {
  const job = payload.job, j = J(job.id);
  const work = path.join(WORK_ROOT, job.id);
  log(`▶ ${job.id} ${job.kind} ${job.channel} ${job.source} (${job.phase})`);
  try {
    if (job.phase === 'text') {
      const r = await runText(payload, work);
      if (r === 'wait') return;
      if (MODE === 'cloud') { await j.status('images', 'slides'); log('  글 끝 → 그림은 PC 도우미가'); return; }
      const fresh = await j.get();
      await runImages({ ...fresh, job: { ...fresh.job, options: fresh.job.options, phase: 'images' } }, work);
    } else {
      await runImages(payload, work);
    }
    await j.status('done', '', { clear_redo: true });
    log(`✅ ${job.id} 완료`);
  } catch (e) {
    if (e.message === 'STOPPED') { log('  사용자가 멈춤'); return; }
    if (e.message === 'LOGIN_REQUIRED') { await j.status('images', 'slides', { error: 'ChatGPT 로그인이 필요합니다 — PC 에서 스튜디오_ChatGPT로그인.bat 로 로그인하면 다시 시도됩니다.' }); loginNeeded = true; lastReport = Date.now() - 20 * 60000; return; }   // 10분 뒤 다시 점검
    if (e.message.startsWith('ENGINE_FAILED')) { await j.status('images', 'slides', { error: `그림 엔진 실패 — 잠시 뒤 다시 시도합니다. ${e.message.slice(15, 200)}` }); engineFailAt = Date.now(); return; }
    log('❌', e.message);
    await j.status('failed', '', { error: e.message }).catch(() => {});
  }
}
let loginNeeded = false;
let engineFailAt = 0;   // 그림 엔진이 실패하면 2분 뒤에 다시 그림 일감을 집는다

// 제작 조건 보고 — 도우미가 시작할 때 · 30분마다 · 그림 작업 뒤에 xim 에 올린다 (스튜디오 첫 화면 '제작 조건' 표시)
let lastReport = 0;
async function reportEnv(force = false) {
  if (!force && Date.now() - lastReport < 30 * 60000) return;
  lastReport = Date.now();
  const info = { at: Date.now(), node: process.version, browser: path.basename(BROWSER), docs: DOCS, profile: PROFILE, pc: os.hostname() };
  try {
    const c = spawnSync(claudeBin, ['auth', 'status', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 60000 });
    const j = JSON.parse((c.stdout || '').slice((c.stdout || '').indexOf('{')));
    info.claude = { loggedIn: !!j.loggedIn, email: j.email || '', plan: j.subscriptionType || '', expires: j.loginExpiresAt || '' };
  } catch (e) { info.claude = { loggedIn: false, error: String(e.message).slice(0, 120) }; }
  try {
    const p = spawnSync('python', ['-u', 'tools\\chatgpt_login_check.py'], { cwd: DOCS, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...engineEnv() }, timeout: 150000, windowsHide: true });
    const line = (p.stdout || '').trim().split(/\r?\n/).reverse().find((l) => l.startsWith('{')) || '{}';
    info.chatgpt = JSON.parse(line);
  } catch (e) { info.chatgpt = { loggedIn: false, error: String(e.message).slice(0, 120) }; }
  info.engine = fs.existsSync(path.join(DOCS, 'tools', 'gpt_slide_text.py'));
  info.browserOk = fs.existsSync(BROWSER);
  try { await api('/api/studio/helper/ping', { method: 'POST', body: { info } }); log(`  제작 조건 보고: Claude ${info.claude.email || '로그인 안 됨'} · ChatGPT ${info.chatgpt.loggedIn ? (info.chatgpt.email || '로그인됨') : '로그인 안 됨'}`); } catch (e) { log('(조건 보고 실패)', e.message); }
  if (info.chatgpt && info.chatgpt.loggedIn) loginNeeded = false;
}

async function pcLoop() {
  if (!DOCS) { console.error('PC 모드는 DOCS(엔진 폴더) 설정이 필요합니다.'); process.exit(1); }
  log(`PC 도우미 시작 — ${XIM} · 엔진 ${DOCS} · 브라우저 ${path.basename(BROWSER)}`);
  await reportEnv(true);
  for (;;) {
    try {
      await reportEnv();
      const imagesOk = !loginNeeded && Date.now() - engineFailAt > 120000;
      const r = await api(`/api/studio/helper/next?want=${imagesOk ? 'text,images' : 'text'}`, { method: 'POST', body: {} });
      if (r.job) { await processJob(r); continue; }
    } catch (e) { log('(대기 중 오류)', e.message); }
    await sleep(5000);
  }
}
async function cloudOnce() {
  const id = opt('--job'); if (!/^[a-f0-9]{20}$/.test(id)) { console.error('--job <id> 가 필요합니다.'); process.exit(1); }
  const payload = await api(`/api/studio/helper/jobs/${id}`);
  payload.job.phase = 'text';
  await J(id).status('running', 'claim');
  await processJob(payload);
}
async function catalog() {
  const work = path.join(WORK_ROOT, '_faces'); fs.mkdirSync(work, { recursive: true });
  const nums = Array.from({ length: 87 }, (_, i) => String(i + 1).padStart(3, '0'));
  for (const n of nums) if (!fs.existsSync(path.join(work, `${n}.webp`))) await download(`/api/studio/helper/face/${n}`, path.join(work, `${n}.webp`));
  const all = [];
  for (let i = 0; i < nums.length; i += 15) {
    const part = nums.slice(i, i + 15);
    log(`분류 ${part[0]}~${part[part.length - 1]}`);
    const r = parseJson(await claude(`${P.FACE_CATALOG_SYSTEM}\n\n사진 파일(Read 로 하나씩 본다): ${part.map((n) => `${work}\\${n}.webp`).join(', ')} — n 은 파일 이름 숫자.${JSON_ONLY}`, { cwd: work, label: '분류', timeoutMin: 15 }), '분류');
    all.push(...(r.faces || []));
  }
  await api('/api/studio/helper/settings/face_catalog', { method: 'PUT', body: { value: { faces: all, made_at: Date.now() } } });
  log(`분류표 ${all.length}장 저장`);
}
function login() {
  if (!PROFILE) { console.error('DOCS 설정이 필요합니다.'); process.exit(1); }
  fs.mkdirSync(PROFILE, { recursive: true });
  log(`자동화용 브라우저를 띄웁니다 → 뜨는 창에서 ChatGPT 에 로그인한 뒤 창을 닫아 주세요.`);
  spawn(BROWSER, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--window-size=1200,900', 'https://chatgpt.com/'], { detached: true, stdio: 'ignore' }).unref();
}

// ───────── 다른 PC 세팅: 점검 + 설정 파일 ─────────
//   node xim/runner/runner.mjs --setup --token <토큰> [--docs D:\ws\docs] [--browser edge|brave]
async function setup() {
  const ok = (b, label, hint = '') => console.log(`  ${b ? '✅' : '❌'} ${label}${!b && hint ? ` — ${hint}` : ''}`);
  console.log('xim 스튜디오 PC 도우미 — 설치 점검');
  const docs = opt('--docs', DOCS || 'D:\\ws\\docs');
  const browser = opt('--browser', cfg.browser || 'edge');
  const token = opt('--token', TOKEN);
  const which = (c) => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : ''; };
  ok(true, `Node ${process.version}`);
  const py3 = which('python'); ok(!!py3, 'Python', 'python.org 에서 3.10+ 설치 (PATH 추가)');
  if (py3) { const r = spawnSync('python', ['-c', 'import playwright, PIL; print("ok")'], { encoding: 'utf8' }); ok(/ok/.test(r.stdout), 'Python 패키지 playwright · pillow', `pip install -r "${docs}\\tools\\requirements.txt"`); }
  const cl = which('claude'); ok(!!cl, 'Claude Code (claude)', 'npm install -g @anthropic-ai/claude-code 뒤 claude 실행해서 로그인');
  if (cl) { const r = spawnSync(cl, ['-p', '1+1=? 숫자만', '--output-format', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 90000 }); ok(/"result"/.test(r.stdout || ''), 'Claude Code 로그인 상태', 'claude 를 한 번 실행해 로그인'); }
  const exe = browser === 'brave' ? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  ok(fs.existsSync(exe), `브라우저 ${path.basename(exe)}`, `${exe} 가 없습니다`);
  ok(fs.existsSync(path.join(docs, 'tools', 'gpt_slide_text.py')), `엔진 폴더 ${docs}`, 'ws 저장소(비공개)를 받아 docs 폴더가 있어야 합니다');
  ok(!!token, '도우미 토큰', 'xim 스튜디오 > 설정 > 다른 PC 설치 의 명령을 그대로 실행하세요');
  if (!token) return;
  try { const r = await fetch(`${XIM}/api/studio/helper/ping`, { method: 'POST', headers: { 'X-Studio-Token': token } }); ok(r.ok, `xim 연결 (${XIM})`, `응답 ${r.status} — 토큰이 다릅니다`); if (!r.ok) return; } catch (e) { ok(false, 'xim 연결', e.message); return; }
  const file = path.join(docs, 'tools', '_xim_helper.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ url: XIM, token, browser, docs: docs.replace(/\\/g, '/') }, null, 2), 'utf8');
  console.log(`  ✅ 설정 저장 ${file}`);
  const prof = path.join(docs, 'tools', browser === 'brave' ? '_brave_profile' : '_edge_profile');
  ok(fs.existsSync(path.join(prof, 'Default', 'Network', 'Cookies')), 'ChatGPT 로그인(자동화 프로필)', `node xim/runner/runner.mjs --login  → 뜨는 창에서 chatgpt.com 로그인 뒤 창 닫기`);
  console.log('\n다음: 1) 로그인이 ❌ 면 위 --login 실행  2) 도우미 시작: node xim/runner/runner.mjs --mode pc  (또는 docs\\tools\\스튜디오도우미_시작.bat)');
}

if (MODE === 'setup') setup().catch((e) => { console.error(e.message); process.exit(1); });
else if (MODE === 'login') login();
else if (MODE === 'catalog') catalog().catch((e) => { console.error(e.message); process.exit(1); });
else if (MODE === 'cloud') cloudOnce().catch((e) => { console.error(e.message); process.exit(1); });
else pcLoop();
