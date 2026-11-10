// xim 스튜디오 — 유튜브 발표자료 제작을 웹에서 (기획: xim/studio-plan.md)
//
//   /api/studio/*            운영자 API (로그인 뒤) — 작업 만들기 · 진행 · 선택 · 결과 · 기록 · 설정
//   /studio/show/<작업id>     방송용 슬라이드쇼 (주소를 아는 사람만, 로그인 없음 — 어디서든 띄워 놓고 찍는다)
//   /studio/a/<자산id>        그림 (R2, 1년 캐시)
//   StudioMain (Workflow)    단계 실행 — 글은 Claude API, 그림은 OpenAI 이미지 API. PC 필요 없음.
//
//   비밀값: ANTHROPIC_API_KEY · OPENAI_API_KEY (wrangler secret, 리포에 없음)
//   보관 규칙: 그림은 최근 10개 작업 분만 R2 에 둔다. 글은 계속.
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import * as P from './studio-prompts.js';
import { slideHtml, SLIDE_CSS } from '../js/slide-template.js';

// 실행 엔진 (options.engine)
//   cloud(기본) — GitHub Actions 에서 Claude Code 가 구독 토큰으로 글 단계를 돌리고 결과를 helper API 로 올린다. 추가 비용 없음, PC 불필요.
//                 슬라이드 · 썸네일은 웹 템플릿(xim/js/slide-template.js · studio.js drawThumb)이 그린다 — ChatGPT 안 씀 (사용자 결정 2026-11-09).
//   api / none  — Claude API · OpenAI 이미지 API (유료, 보류). Workflow StudioMain.
//   pc          — PC 도우미(미구현, 예비).
const RUN_WORKFLOW = 'studio-run.yml';

const KEEP_JOBS = 10;                      // 그림을 보관할 최근 작업 수
const NEWS_HOURS = 8;                      // 뉴스 후보 범위: 제작 시각 기준 최근 N시간 (사용자 지시 2026-11-09: 12 → 8)
const CLAUDE_MODEL = 'claude-opus-5-5';
const PRICE = { in: 4 / 1e6, out: 20 / 1e6 };   // 달러 / 토큰 (Opus 5.5)
const IMAGE_PRICE = 0.17;                   // 장당 대략(고품질) — 설정에서 모델을 바꾸면 달라진다. 표시용.
const now = () => Date.now();
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

// ───────────────────────── DB 도우미 ─────────────────────────
const getJob = (db, id) => db.prepare('SELECT * FROM studio_jobs WHERE id = ?').bind(id).first();
async function setJob(db, id, fields) {
  const keys = Object.keys(fields);
  await db.prepare(`UPDATE studio_jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => fields[k]), now(), id).run();
}
async function latestDoc(db, jobId, kind) {
  return db.prepare('SELECT * FROM studio_docs WHERE job_id = ? AND kind = ? ORDER BY version DESC LIMIT 1').bind(jobId, kind).first();
}
async function saveDoc(db, jobId, kind, body) {
  const prev = await latestDoc(db, jobId, kind);
  const v = (prev?.version || 0) + 1;
  await db.prepare('INSERT INTO studio_docs (job_id, kind, version, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(jobId, kind, v, typeof body === 'string' ? body : JSON.stringify(body), now()).run();
  return v;
}
const docJson = (d) => { try { return d ? JSON.parse(d.body) : null; } catch { return null; } };
async function stepStart(db, jobId, step, note = '') {
  await db.prepare("UPDATE studio_steps SET status = 'failed', finished_at = ? WHERE job_id = ? AND step = ? AND status = 'running'").bind(now(), jobId, step).run();
  const r = await db.prepare("INSERT INTO studio_steps (job_id, step, status, note, started_at) VALUES (?, ?, 'running', ?, ?)").bind(jobId, step, note, now()).run();
  await setJob(db, jobId, { step, status: 'running' });
  return r.meta.last_row_id;
}
async function stepEnd(db, id, jobId, status, note = '', usage = null) {
  const cost = usage ? (usage.in || 0) * PRICE.in + (usage.out || 0) * PRICE.out + (usage.images || 0) * IMAGE_PRICE : 0;
  await db.prepare('UPDATE studio_steps SET status = ?, note = ?, tokens_in = ?, tokens_out = ?, cost = ?, finished_at = ? WHERE id = ?')
    .bind(status, String(note || '').slice(0, 2000), usage?.in || 0, usage?.out || 0, cost, now(), id).run();
  if (cost) await db.prepare('UPDATE studio_jobs SET cost = cost + ? WHERE id = ?').bind(cost, jobId).run();
}
async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM studio_settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return {
    slide_style: s.slide_style || P.DEFAULT_SLIDE_STYLE,
    thumb_style_사섬: s['thumb_style_사섬'] || P.DEFAULT_THUMB_STYLE.사섬,
    thumb_style_순섬: s['thumb_style_순섬'] || P.DEFAULT_THUMB_STYLE.순섬,
    image_model: s.image_model || 'gpt-image-1',
    image_quality: s.image_quality || 'high',
    daily_limit: +(s.daily_limit || 12),
    greeting_사섬: s['greeting_사섬'] || '내 돈이 몰래 불어나는 진짜 비트코인 뉴스, 안녕하세요, 사적인 자산왕입니다.',
    greeting_순섬: s['greeting_순섬'] || '돈 버는 지식만 순수하게 뽑아내는 뉴스 장인, 안녕하세요, 순수한 크립토입니다.',
    cloud_text: s.cloud_text === 'on' ? 'on' : 'off',
    claude_account: s.claude_account || 'master@webchon.com',      // 제작 조건: Claude Code 가 이 계정으로 로그인돼 있어야 (사용자 지시 2026-11-09)
    chatgpt_account: s.chatgpt_account || 'xiangdolee@gmail.com',  // 제작 조건: 자동화 엣지 프로필의 ChatGPT 계정   // on = 글 단계를 GitHub Actions(Claude 구독 토큰)에서, off = PC 도우미가 전부
  };
}
const SETTING_KEYS = ['slide_style', 'thumb_style_사섬', 'thumb_style_순섬', 'image_model', 'image_quality', 'daily_limit', 'greeting_사섬', 'greeting_순섬', 'cloud_text', 'claude_account', 'chatgpt_account'];

// ───────────────────────── R2 그림 ─────────────────────────
async function putAsset(env, jobId, kind, idx, bytes, mime, meta = {}, dims = {}) {
  const id = hex(12);
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
  const key = `studio/${jobId || 'up'}/${kind}-${idx}-${id}.${ext}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' } });
  await env.DB.prepare('INSERT INTO studio_assets (id, job_id, kind, idx, r2_key, mime, size, width, height, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, jobId, kind, idx, key, mime, bytes.byteLength, dims.w || 0, dims.h || 0, JSON.stringify(meta), now()).run();
  return id;
}
async function dropAsset(env, a) { await env.FILES.delete(a.r2_key).catch(() => {}); await env.DB.prepare('DELETE FROM studio_assets WHERE id = ?').bind(a.id).run(); }
const jobAssets = async (db, jobId) => (await db.prepare('SELECT * FROM studio_assets WHERE job_id = ? ORDER BY kind, idx, created_at').bind(jobId).all()).results;
async function readAssetB64(env, a) {
  const o = await env.FILES.get(a.r2_key);
  if (!o) return null;
  const buf = new Uint8Array(await o.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), mime: a.mime };
}
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// 보관 규칙: 최근 KEEP_JOBS 개(끝난 작업 기준)만 그림을 남기고, 그 뒤 작업의 그림은 지운다
async function purgeOld(env) {
  const db = env.DB;
  const { results } = await db.prepare("SELECT id FROM studio_jobs WHERE status IN ('done','failed','stopped') AND assets_purged = 0 ORDER BY created_at DESC").all();
  const old = results.slice(KEEP_JOBS);
  for (const j of old) {
    for (const a of await jobAssets(db, j.id)) await dropAsset(env, a);
    await setJob(db, j.id, { assets_purged: 1 });
  }
  // 작업에 안 붙은 업로드(하루 지난 것) 정리
  for (const a of (await db.prepare("SELECT * FROM studio_assets WHERE job_id = '' AND created_at < ?").bind(now() - 86400000).all()).results) await dropAsset(env, a);
  return old.length;
}

// ───────────────────────── Claude API ─────────────────────────
async function claude(env, { system, messages, schema, tools, maxTokens = 16000, effort }) {
  if (!env.ANTHROPIC_API_KEY) throw new NonRetryableError('ANTHROPIC_API_KEY 가 없습니다. 키를 넣어 주세요.');
  const body = { model: CLAUDE_MODEL, max_tokens: maxTokens, messages, fallbacks: 'default' };
  if (system) body.system = system;
  if (tools) body.tools = tools;
  body.output_config = {};
  if (schema) body.output_config.format = { type: 'json_schema', schema };
  if (effort) body.output_config.effort = effort;
  const usage = { in: 0, out: 0 };
  let msgs = messages;
  for (let turn = 0; turn < 4; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      body: JSON.stringify({ ...body, messages: msgs }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 401 || res.status === 403 || res.status === 400) throw new NonRetryableError(`Claude API ${res.status}: ${t.slice(0, 300)}`);
      throw new Error(`Claude API ${res.status}: ${t.slice(0, 300)}`);
    }
    const out = await res.json();
    usage.in += out.usage?.input_tokens || 0; usage.out += out.usage?.output_tokens || 0;
    if (out.stop_reason === 'refusal') throw new NonRetryableError(`Claude 가 요청을 거절했습니다 (${out.stop_details?.category || '사유 없음'}).`);
    if (out.stop_reason === 'pause_turn') { msgs = [...msgs, { role: 'assistant', content: out.content }]; continue; }   // 서버 도구가 아직 도는 중
    const text = out.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    let parsed = null;
    if (schema) { try { parsed = JSON.parse(text); } catch { throw new Error('Claude 응답이 JSON 이 아닙니다: ' + text.slice(0, 200)); } }
    return { text, json: parsed, usage };
  }
  throw new Error('Claude 응답이 끝나지 않았습니다 (pause_turn 반복).');
}
const imgBlock = (b64, mime) => ({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });

// ───────────────────────── OpenAI 이미지 API ─────────────────────────
//   참고 사진이 있으면 /images/edits (참고 이미지 + 프롬프트), 없으면 /images/generations. 결과는 webp 로 받는다.
async function openaiImage(env, settings, { prompt, size, refs = [] }) {
  if (!env.OPENAI_API_KEY) throw new NonRetryableError('OPENAI_API_KEY 가 없습니다. 키를 넣어 주세요.');
  const headers = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  let res;
  if (refs.length) {
    const fd = new FormData();
    fd.set('model', settings.image_model); fd.set('prompt', prompt); fd.set('size', size); fd.set('quality', settings.image_quality); fd.set('output_format', 'webp'); fd.set('n', '1');
    refs.forEach((r, i) => fd.append('image[]', new Blob([r.bytes], { type: r.mime }), `ref${i}.${r.mime === 'image/png' ? 'png' : r.mime === 'image/jpeg' ? 'jpg' : 'webp'}`));
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: fd });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.image_model, prompt, size, quality: settings.image_quality, output_format: 'webp', n: 1 }),
    });
  }
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401 || res.status === 403) throw new NonRetryableError(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
  }
  const out = await res.json();
  const b64 = out.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 응답에 이미지가 없습니다.');
  const [w, h] = size.split('x').map(Number);
  return { bytes: b64ToBytes(b64), mime: 'image/webp', w, h };
}

// ───────────────────────── RSS 후보 (news_rss.py 를 Worker 로) ─────────────────────────
const FEEDS = [
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', '코인데스크', '해외·미국', '🇺🇸'],
  ['Cointelegraph', 'https://cointelegraph.com/rss', '코인텔레그래프', '해외·미국', '🇺🇸'],
  ['TheBlock', 'https://www.theblock.co/rss.xml', '더블록', '해외·미국', '🇺🇸'],
  ['Decrypt', 'https://decrypt.co/feed', '디크립트', '해외·미국', '🇺🇸'],
  ['CryptoSlate', 'https://cryptoslate.com/feed/', '크립토슬레이트', '해외·미국', '🇺🇸'],
  ['BitcoinMagazine', 'https://bitcoinmagazine.com/feed', '비트코인매거진', '해외·미국', '🇺🇸'],
  ['블록미디어', 'https://www.blockmedia.co.kr/feed', 'Blockmedia', '국내', '🇰🇷'],
  ['토큰포스트', 'https://www.tokenpost.kr/rss', 'TokenPost', '국내', '🇰🇷'],
  ['비인크립토', 'https://kr.beincrypto.com/feed/', 'BeInCrypto', '해외·글로벌(한국어판)', '🌐'],
];
const KW_CORE = ['bitcoin', 'btc', 'ethereum', ' eth ', 'crypto', 'etf', 'sec ', 'cftc', 'fed ', 'federal reserve', 'cpi', 'inflation', 'rate cut', 'stablecoin', 'regulation', 'regulator', '비트코인', '이더리움', '가상자산', '암호화폐', '스테이블코인', '금리', '규제', '연준'];
const KW_EVENT = ['hack', 'exploit', 'breach', 'lawsuit', 'sues', 'sued', 'ban ', 'approve', 'launch', 'surge', 'crash', 'plunge', 'soar', 'record', 'billion', 'million', 'halt', 'outage', 'unlock', 'layoff', 'acquire', 'ipo', 'filing', 'vote', 'ruling', '해킹', '상장', '급등', '급락', '폭락', '폭등', '승인', '소송', '제재', '출시', '사상 최고', '억달러', '조원', '상장폐지', '압수'];
const KW_ACTOR = ['binance', 'coinbase', 'blackrock', 'fidelity', 'tether', 'ripple', 'xrp', 'solana', 'kraken', 'grayscale', 'strategy', 'microstrategy', 'circle', 'trump', 'polygon', 'bank of', '업비트', '빗썸', '코인원', '금융위', '금감원', '한국은행', '바이낸스', '코인베이스', '블랙록', '테더', '리플', '솔라나', '트럼프', '국민연금'];
const KW_NOISE = ['price prediction', 'how to', 'beginner', 'guide to', 'sponsored', 'best crypto', 'casino', 'presale', 'top 5', 'top 10', 'review:', '프리세일', '카지노', '에어드랍 이벤트', '가격 전망', '매수 추천', '시세브리핑', '뉴스브리핑'];
const unesc = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i')); return m ? m[1] : ''; };
function score(title, summary) {
  const t = title.toLowerCase(), s = summary.toLowerCase();
  let sc = 0;
  for (const [kws, w] of [[KW_CORE, 3], [KW_EVENT, 2], [KW_ACTOR, 2]]) for (const k of kws) { if (t.includes(k)) sc += w * 2; else if (s.includes(k)) sc += w; }
  for (const k of KW_NOISE) if (t.includes(k) || s.includes(k)) sc -= 10;
  return sc;
}
const kst = (ms) => { const d = new Date(ms + 9 * 3600000); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} KST`; };
async function rssCandidates(hours = 12) {
  const since = now() - hours * 3600000;
  const all = [];
  await Promise.all(FEEDS.map(async ([name, url, alt, region, flag]) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 xim-studio/1.0' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return;
      const xml = await res.text();
      const items = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
      for (const it of items) {
        const title = unesc(tag(it, 'title'));
        const link = unesc(tag(it, 'link')) || (it.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '');
        const date = Date.parse(unesc(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date')));
        if (!title || !link || !date || date < since) continue;
        const summary = unesc(tag(it, 'description') || tag(it, 'summary') || tag(it, 'content:encoded')).slice(0, 180);
        all.push({ source: name, label: `${flag} ${name}(${alt}·${region})`, kr: region === '국내', title, url: link, published: date, published_kst: kst(date), summary, score: score(title, summary) });
      }
    } catch { /* 피드 하나 실패는 넘어간다 */ }
  }));
  all.sort((a, b) => b.score - a.score || b.published - a.published);
  const kr = all.filter((x) => x.kr).slice(0, 8);
  const picked = [...kr];
  for (const x of all) { if (picked.length >= 28) break; if (!picked.includes(x)) picked.push(x); }
  picked.sort((a, b) => b.published - a.published);
  return picked.map((x, i) => ({ n: i + 1, ...x }));
}

// ───────────────────────── 📌 블록 ─────────────────────────
const splitBlocks = (text) => String(text || '').split(/\n(?=📌)/).map((b) => b.trim()).filter((b) => b.startsWith('📌'));

// ───────────────────────── Workflow: 단계 실행 ─────────────────────────
export class StudioMain extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, task = 'run' } = event.payload;
    const env = this.env, db = env.DB;
    const job = await getJob(db, jobId);
    if (!job) throw new NonRetryableError('작업이 없습니다.');
    const opt = JSON.parse(job.options || '{}');
    const settings = await getSettings(db);
    const S = (name, fn, note) => step.do(name, { retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' }, timeout: '12 minutes' }, async () => {
      const sid = await stepStart(db, jobId, name, note);
      try { const r = await fn(); await stepEnd(db, sid, jobId, 'done', r?.note || '', r?.usage); return r?.out ?? null; }
      catch (e) { await stepEnd(db, sid, jobId, 'failed', e.message); throw e; }
    });
    try {
      if (task === 'redo') await this.redo(S, step, job, opt, settings, event.payload);
      else if (job.kind === 'main') await this.runMain(S, step, job, opt, settings);
      else if (job.kind === 'thumb') await this.runThumbOnly(S, step, job, opt, settings);
      else throw new NonRetryableError('아직 준비되지 않은 종류입니다: ' + job.kind);
      if (task !== 'redo') { await setJob(db, jobId, { status: 'done', step: '', finished_at: now() }); await step.do('auto-video', async () => { await autoVideo(env, db, jobId); }); }
      else await setJob(db, jobId, { status: 'done', step: '' });
      await step.do('purge', async () => { await purgeOld(env); });
    } catch (e) {
      const cur = await getJob(db, jobId);
      if (cur?.status !== 'stopped') await setJob(db, jobId, { status: 'failed', step: '', error: String(e.message || e).slice(0, 500), finished_at: now() });
      throw e;
    }
  }

  // 본편: 뉴스 후보 → Top15 → (6개 고르기) → 기사 6 → 팩트체크 → 유튜브 패키지 → 슬라이드 → 검수 → 썸네일
  async runMain(S, step, job, opt, settings) {
    const env = this.env, db = env.DB, jobId = job.id;
    let blocks;
    if (job.source === 'rss') {
      const cands = await S('rss', async () => { const c = await rssCandidates(NEWS_HOURS); if (c.length < 3) throw new Error(`RSS 후보가 ${c.length}건뿐입니다.`); await saveDoc(db, jobId, 'candidates', c); return { out: c, note: `${c.length}건` }; });
      const top = await S('top15', async () => {
        const list = cands.map((c) => `[${c.n}] ${c.title}\n    ${c.label} | ${c.published_kst}\n    ${c.url}\n    ${c.summary}`).join('\n');
        const r = await claude(env, { system: P.TOP15_SYSTEM, schema: P.TOP15_SCHEMA, messages: [{ role: 'user', content: `기준 시각: ${kst(now())} (최근 ${NEWS_HOURS}시간)\n\n후보 목록:\n${list}` }] });
        const t = r.json; t.items = t.items.slice(0, 12);
        await saveDoc(db, jobId, 'top15', t);
        return { out: t, usage: r.usage, note: `${t.items.length}개 · 추천 ${t.picks.join(',')}` };
      });
      let chosen = top.picks.slice(0, 6);
      if (opt.pick === 'manual') {
        await setJob(db, jobId, { status: 'pick', step: 'pick' });
        const ev = await step.waitForEvent('pick', { type: 'pick', timeout: '3 days' });
        chosen = (ev.payload?.chosen || []).map(Number).filter((n) => top.items.some((i) => i.n === n)).slice(0, 6);
        if (!chosen.length) throw new NonRetryableError('고른 기사가 없습니다.');
        await saveDoc(db, jobId, 'chosen', chosen);
      }
      const items = chosen.map((n) => top.items.find((i) => i.n === n)).filter(Boolean);
      const arts = await Promise.all(items.map((it, i) => S(`article-${i + 1}`, async () => {
        const r = await claude(env, {
          messages: [{ role: 'user', content: P.ARTICLE_FROM_URL(it.url, `${it.title} — ${it.summary}`) }],
          tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 }],
        });
        const text = r.text.replace(/^```[\w]*\n?|```$/g, '').trim();
        if (!text.startsWith('📌')) throw new Error('대본 형식이 아닙니다(📌 없음).');
        return { out: text, usage: r.usage, note: text.split('\n')[0].slice(0, 60) };
      }, it.title)));
      blocks = arts;
    } else if (job.source === 'capture') {
      const caps = (await jobAssets(db, jobId)).filter((a) => a.kind === 'capture').sort((a, b) => a.idx - b.idx);
      if (!caps.length) throw new NonRetryableError('캡쳐 이미지가 없습니다.');
      blocks = await Promise.all(caps.map((a, i) => S(`article-${i + 1}`, async () => {
        const img = await readAssetB64(env, a);
        const r = await claude(env, { messages: [{ role: 'user', content: [imgBlock(img.b64, img.mime), { type: 'text', text: P.ARTICLE_FROM_IMAGE }] }] });
        const text = r.text.replace(/^```[\w]*\n?|```$/g, '').trim();
        if (!text.startsWith('📌')) throw new Error('대본 형식이 아닙니다(📌 없음).');
        return { out: text, usage: r.usage, note: text.split('\n')[0].slice(0, 60) };
      })));
    } else {
      const text = opt.text || '';
      if (!text.trim()) throw new NonRetryableError('글이 비어 있습니다.');
      blocks = [await S('article-1', async () => {
        const r = await claude(env, { messages: [{ role: 'user', content: P.ARTICLE_FROM_TEXT(text) }] });
        const t = r.text.replace(/^```[\w]*\n?|```$/g, '').trim();
        return { out: t, usage: r.usage, note: t.split('\n')[0].slice(0, 60) };
      })];
    }
    await step.do('save-articles', async () => { await saveDoc(db, jobId, 'articles', blocks.join('\n\n')); });

    const fact = await S('factcheck', async () => {
      const r = await claude(env, { system: P.FACTCHECK_SYSTEM, schema: P.FACTCHECK_SCHEMA, messages: [{ role: 'user', content: blocks.map((b, i) => `[블록 ${i + 1}]\n${b}`).join('\n\n') }] });
      const f = r.json;
      if (!Array.isArray(f.fixed_blocks) || f.fixed_blocks.length !== blocks.length) f.fixed_blocks = blocks;
      await saveDoc(db, jobId, 'factcheck', f);
      return { out: f, usage: r.usage, note: f.summary.slice(0, 120) };
    });
    const fixed = fact.fixed_blocks;

    const summary = await S('summary', async () => {
      const r = await claude(env, { system: P.SUMMARY_SYSTEM, schema: P.SUMMARY_SCHEMA, messages: [{ role: 'user', content: `[사람 이름] ${fact.people.join(', ') || '없음'}\n\n${fixed.join('\n\n')}` }] });
      const s = r.json;
      await saveDoc(db, jobId, 'summary', s);
      await setJob(db, jobId, { title: (s.titles?.[0] || '').slice(0, 120) });
      return { out: s, usage: r.usage, note: s.titles?.[0] || '' };
    });
    // 방송 대본(슬라이드쇼 오른쪽): 첫 장 앞에 인사말 + 인트로
    await step.do('show-texts', async () => {
      const texts = fixed.map((b) => b.replace(/^📌\s*/, '📌'));
      texts[0] = `${settings[`greeting_${job.channel}`] || ''}\n${summary.intro || ''}\n\n${texts[0]}`.trim();
      await saveDoc(db, jobId, 'show_texts', texts);
    });

    // 슬라이드 (그림 키가 없으면 건너뛰고 기록만 남긴다)
    if (env.OPENAI_API_KEY && opt.engine !== 'none') {
      await Promise.all(fixed.map((b, i) => S(`slide-${i + 1}`, () => this.makeSlide(settings, jobId, i + 1, b))));
      await Promise.all(fixed.map((b, i) => S(`review-${i + 1}`, () => this.reviewSlide(settings, jobId, i + 1, b))));
      // 썸네일
      let pick = { title: summary.titles?.[0] || job.title, emotion: '자동', gesture: '자동', badgeName: '', badgeRole: '', face: 'emoji:auto' };
      if (opt.thumb === 'manual') {
        await setJob(db, jobId, { status: 'thumb', step: 'thumb' });
        const ev = await step.waitForEvent('thumb', { type: 'thumb', timeout: '3 days' });
        pick = { ...pick, ...(ev.payload || {}) };
        await saveDoc(db, jobId, 'thumb_pick', pick);
      }
      await S('thumb', () => this.makeThumb(settings, job, pick));
    } else {
      await step.do('slides-skipped', async () => {
        const sid = await stepStart(db, jobId, 'slides', '');
        await stepEnd(db, sid, jobId, 'skipped', env.OPENAI_API_KEY ? '그림 엔진 꺼짐' : 'OPENAI_API_KEY 가 없어 그림 단계를 건너뜀');
      });
    }
  }

  async runThumbOnly(S, step, job, opt, settings) {
    const pick = { title: opt.title || job.title, emotion: opt.emotion || '자동', gesture: opt.gesture || '자동', badgeName: opt.badgeName || '', badgeRole: opt.badgeRole || '', face: opt.face || 'emoji:auto' };
    await S('thumb', () => this.makeThumb(settings, job, pick));
  }

  // 다시 만들기: { what: 'slide'|'thumb', idx, ...선택 }
  async redo(S, step, job, opt, settings, p) {
    const db = this.env.DB;
    if (p.what === 'slide') {
      const fixed = docJson(await latestDoc(db, job.id, 'factcheck'))?.fixed_blocks || splitBlocks((await latestDoc(db, job.id, 'articles'))?.body);
      const b = fixed[p.idx - 1];
      if (!b) throw new NonRetryableError('그 번호의 원고가 없습니다.');
      for (const a of (await jobAssets(db, job.id)).filter((a) => a.kind === 'slide' && a.idx === p.idx)) await dropAsset(this.env, a);
      await S(`slide-${p.idx}`, () => this.makeSlide(settings, job.id, p.idx, b, p.note || ''));
      await S(`review-${p.idx}`, () => this.reviewSlide(settings, job.id, p.idx, b));
    } else if (p.what === 'thumb') {
      const prev = docJson(await latestDoc(db, job.id, 'thumb_pick')) || {};
      const pick = { ...prev, ...(p.pick || {}) };
      if (!pick.title) pick.title = job.title;
      await saveDoc(db, job.id, 'thumb_pick', pick);
      for (const a of (await jobAssets(db, job.id)).filter((a) => a.kind === 'thumb')) await dropAsset(this.env, a);
      await S('thumb', () => this.makeThumb(settings, job, pick));
    } else throw new NonRetryableError('모르는 다시 만들기: ' + p.what);
  }

  async makeSlide(settings, jobId, idx, block, extra = '') {
    const prompt = P.SLIDE_PROMPT(block, settings.slide_style) + (extra ? `\n\n추가 요청: ${extra}` : '');
    const img = await openaiImage(this.env, settings, { prompt, size: '1536x1024' });
    const id = await putAsset(this.env, jobId, 'slide', idx, img.bytes, img.mime, { prompt: prompt.slice(0, 4000), model: settings.image_model }, img);
    return { out: id, usage: { images: 1 }, note: `${img.w}x${img.h}` };
  }

  async reviewSlide(settings, jobId, idx, block) {
    const env = this.env, db = env.DB;
    const a = (await jobAssets(db, jobId)).filter((x) => x.kind === 'slide' && x.idx === idx).pop();
    if (!a) return { note: '그림 없음' };
    const img = await readAssetB64(env, a);
    const r = await claude(env, { system: P.REVIEW_SLIDE_SYSTEM, schema: P.REVIEW_SCHEMA, effort: 'low', messages: [{ role: 'user', content: [imgBlock(img.b64, img.mime), { type: 'text', text: `원고 블록:\n${block}` }] }] });
    const meta = { ...JSON.parse(a.meta || '{}'), review: r.json };
    await db.prepare('UPDATE studio_assets SET meta = ? WHERE id = ?').bind(JSON.stringify(meta), a.id).run();
    if (!r.json.pass) {
      // 불합격이면 한 번만 다시 만든다 (그래도 불합격이면 표시만 남긴다)
      await dropAsset(env, a);
      const prompt = P.SLIDE_PROMPT(block, settings.slide_style) + `\n\n이전 시도의 문제(반드시 고칠 것): ${r.json.reason}`;
      const img2 = await openaiImage(env, settings, { prompt, size: '1536x1024' });
      const id2 = await putAsset(env, jobId, 'slide', idx, img2.bytes, img2.mime, { prompt: prompt.slice(0, 4000), model: settings.image_model, retry_of: r.json.reason }, img2);
      const b = await readAssetB64(env, { r2_key: (await db.prepare('SELECT r2_key FROM studio_assets WHERE id = ?').bind(id2).first()).r2_key, mime: img2.mime });
      const r2 = await claude(env, { system: P.REVIEW_SLIDE_SYSTEM, schema: P.REVIEW_SCHEMA, effort: 'low', messages: [{ role: 'user', content: [imgBlock(b.b64, b.mime), { type: 'text', text: `원고 블록:\n${block}` }] }] });
      await db.prepare('UPDATE studio_assets SET meta = json_set(meta, \'$.review\', json(?)) WHERE id = ?').bind(JSON.stringify(r2.json), id2).run();
      return { usage: { in: r.usage.in + r2.usage.in, out: r.usage.out + r2.usage.out, images: 1 }, note: `1차 불합격(${r.json.reason}) → 재생성 ${r2.json.pass ? '합격' : '불합격: ' + r2.json.reason}` };
    }
    return { usage: r.usage, note: '합격' };
  }

  async makeThumb(settings, job, pick) {
    const env = this.env, db = env.DB;
    const refs = [];
    let face = pick.face || '';
    if (face === 'emoji:auto') face = `emoji:${String(1 + Math.floor(Math.random() * 87)).padStart(3, '0')}`;
    if (face.startsWith('emoji:')) {
      const o = await env.FILES.get(`studio/faces/${face.slice(6)}.webp`);
      if (o) refs.push({ bytes: new Uint8Array(await o.arrayBuffer()), mime: 'image/webp' });
    } else if (face.startsWith('asset:')) {
      const a = await db.prepare('SELECT * FROM studio_assets WHERE id = ?').bind(face.slice(6)).first();
      if (a) { const o = await env.FILES.get(a.r2_key); if (o) refs.push({ bytes: new Uint8Array(await o.arrayBuffer()), mime: a.mime }); }
    }
    const prompt = P.thumbPrompt({ title: pick.title, channel: job.channel, emotion: pick.emotion, gesture: pick.gesture, badgeName: pick.badgeName, badgeRole: pick.badgeRole, styleRules: settings[`thumb_style_${job.channel}`], hasFace: refs.length > 0 });
    const img = await openaiImage(env, settings, { prompt, size: '1536x1024', refs });
    const id = await putAsset(env, job.id, 'thumb', 1, img.bytes, img.mime, { prompt: prompt.slice(0, 4000), model: settings.image_model, pick, face }, img);
    // 검수 1회 (불합격이면 표시만 — 재생성은 사용자가 '다시 만들기' 로)
    const b = await readAssetB64(env, { r2_key: (await db.prepare('SELECT r2_key FROM studio_assets WHERE id = ?').bind(id).first()).r2_key, mime: img.mime });
    const r = await claude(env, { system: P.REVIEW_THUMB_SYSTEM, schema: P.REVIEW_SCHEMA, effort: 'low', messages: [{ role: 'user', content: [imgBlock(b.b64, b.mime), { type: 'text', text: `요구: 제목 "${pick.title}", 표정 ${pick.emotion || '자동'}, 제스처 ${pick.gesture || '자동'}, 명찰 ${pick.badgeName ? `"${pick.badgeName}" / "${pick.badgeRole || ''}"` : '없음'}, 인물 ${refs.length ? '있음' : '없음'}` }] }] });
    await db.prepare('UPDATE studio_assets SET meta = json_set(meta, \'$.review\', json(?)) WHERE id = ?').bind(JSON.stringify(r.json), id).run();
    return { out: id, usage: { ...r.usage, images: 1 }, note: r.json.pass ? '합격' : `불합격: ${r.json.reason}` };
  }
}

// 최근 회차에서 이미 다룬 기사 — Top15 를 고를 때 같은 사건을 빼기 위해 (사용자 지시 2026-11-09: Top15 단계의 목적)
//   최근 7일 · 15개 작업의 '선택된 기사'(chosen 또는 추천 6개)의 제목 · 주소 · 날짜. 없으면 기사 📌 제목으로.
async function recentlyCovered(db, exceptId) {
  const { results } = await db.prepare("SELECT id, created_at FROM studio_jobs WHERE id != ? AND kind = 'main' AND created_at > ? ORDER BY created_at DESC LIMIT 15").bind(exceptId, now() - 7 * 86400000).all();
  const out = [];
  for (const j of results) {
    const top = docJson(await latestDoc(db, j.id, 'top15'));
    const chosen = docJson(await latestDoc(db, j.id, 'chosen')) || top?.picks || [];
    const when = kst(j.created_at).slice(0, 11);
    if (top?.items?.length) for (const n of chosen) { const it = top.items.find((i) => i.n === n); if (it) out.push({ when, title: it.title, url: it.url }); }
    else { const a = await latestDoc(db, j.id, 'articles'); for (const b of splitBlocks(a?.body)) out.push({ when, title: b.split('\n')[0].replace(/^📌\s*/, ''), url: '' }); }
  }
  return out.slice(0, 60);
}

// 방송 대본(슬라이드쇼 오른쪽) = 인사말 + 인트로 + 첫 블록, 나머지 블록 그대로
async function buildShowTexts(db, job, fixed, intro) {
  const settings = await getSettings(db);
  const texts = fixed.map((b) => b.replace(/^📌\s*/, '📌'));
  if (texts.length) texts[0] = `${settings[`greeting_${job.channel}`] || ''}\n${intro || ''}\n\n${texts[0]}`.trim();
  await saveDoc(db, job.id, 'show_texts', texts);
}
// GitHub Actions 깨우기 (studio-run.yml) — 실패해도 작업은 남기고 오류만 적는다
async function dispatchRun(env, gh, job, stage) {
  try { await gh(`/actions/workflows/${RUN_WORKFLOW}/dispatches`, { ref: 'main', inputs: { job_id: job.id, stage } }); await setJob(env.DB, job.id, { error: '' }); }
  catch (e) { await setJob(env.DB, job.id, { status: 'failed', error: `GitHub Actions 를 깨우지 못했습니다: ${e.message}`, finished_at: now() }); }
}

// ───────────────────────── 도우미(Actions 러너) API — 토큰으로 인증, 로그인 없음 ─────────────────────────
export async function studioHelper(request, env, url, path, method) {
  const db = env.DB;
  if (!env.STUDIO_HELPER_TOKEN || request.headers.get('X-Studio-Token') !== env.STUDIO_HELPER_TOKEN) throw new HttpError(401, '도우미 토큰이 맞지 않습니다.');
  await db.prepare("INSERT INTO studio_settings (key, value) VALUES ('helper_seen', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(now())).run();
  const readJson = async () => { try { return await request.json(); } catch { throw bad('JSON 으로 보내 주세요.'); } };
  let mm;
  if (path === '/api/studio/helper/ping') {
    if (method === 'POST') { try { const d = await request.json(); if (d && d.info) await db.prepare("INSERT INTO studio_settings (key, value) VALUES ('helper_info', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(d.info).slice(0, 8000)).run(); } catch { /* 본문 없음 */ } }
    return json({ ok: true, at: now() });
  }
  // 다음 일감 하나를 집어 간다. want=text,images — text: 글부터(queued), images: 그림만(images 상태). 가져가면 running 으로 바꿔 두 번 집지 않게 한다
  if (path === '/api/studio/helper/next' && method === 'POST') {
    const want = (url.searchParams.get('want') || 'text,images').split(',');
    // 유튜브 올리기(2026-11-10): 카드의 "유튜브에 올리기" 가 options.yt = {status:'queued', title, visibility} 를 남기면 PC 도우미가 엣지로 올린다
    if (want.includes('youtube')) {
      // 새 발표자료 "유튜브 채널에 올리기"(yt_auto): 영상(clone)이 끝났는지 보고 끝났으면 유튜브 대기열에 올린다
      if (env.CLONE && env.CLONE_TOKEN) {
        // yt 가 '영상 실패' 로 적혔어도 영상 작업을 다시 돌려 성공하면 유튜브도 되살린다 (2026-11-11: TTS 실패 → 재시도 성공했는데 업로드가 안 되던 것)
        const auto = (await db.prepare("SELECT id FROM studio_jobs WHERE status = 'done' AND json_extract(options, '$.yt_auto') = 1 AND json_extract(options, '$.video_job') IS NOT NULL AND (json_extract(options, '$.yt') IS NULL OR (json_extract(options, '$.yt.auto') = 1 AND json_extract(options, '$.yt.status') = 'failed' AND COALESCE(json_extract(options, '$.yt.url'), '') = '')) ORDER BY created_at DESC LIMIT 3").all()).results;
        for (const a of auto) {
          const job = await getJob(db, a.id); const jo = JSON.parse(job.options || '{}');
          const hadFailed = jo.yt?.status === 'failed';
          try {
            const res = await env.CLONE.fetch(new Request(`https://clone/api/jobs/${jo.video_job}`, { headers: { 'X-Agent-Token': env.CLONE_TOKEN } }));
            const v = (await res.json().catch(() => ({}))).job;
            if (v && v.status === 'done' && v.video_status === 'done') {
              const summary = docJson(await latestDoc(db, job.id, 'summary')) || {};
              const pick = docJson(await latestDoc(db, job.id, 'thumb_pick')) || {};
              jo.yt = { status: 'queued', title: String(pick.title || summary.titles?.[0] || job.title || '').slice(0, 100), visibility: '비공개', publish: true, at: now(), url: '', error: '', auto: true };
              await setJob(db, job.id, { options: JSON.stringify(jo) });
            } else if (v && (v.status === 'failed' || v.video_status === 'failed') && !hadFailed) {
              jo.yt = { status: 'failed', error: '영상이 실패해 유튜브에 올리지 못했습니다 — 내 목소리에서 영상을 다시 만들면 자동으로 다시 올립니다', at: now(), auto: true }; await setJob(db, job.id, { options: JSON.stringify(jo) });
            }
          } catch { /* 다음 폴링 때 */ }
        }
      }
      const trow = await db.prepare("SELECT id FROM studio_jobs WHERE json_extract(options, '$.yt.tg.status') = 'queued' ORDER BY json_extract(options, '$.yt.tg.at') ASC LIMIT 1").first();
      if (trow) {
        const job = await getJob(db, trow.id); const jo = JSON.parse(job.options || '{}');
        jo.yt.tg = { ...jo.yt.tg, status: 'running', started_at: now() };
        await setJob(db, job.id, { options: JSON.stringify(jo) });
        return json({ job: { ...job, options: jo, phase: 'telegram' }, telegram: { url: jo.yt.url || '', title: jo.yt.title || job.title, channel_name: job.channel === '순섬' ? '순수한크립토' : '사적인자산왕' } });
      }
      const prow = await db.prepare("SELECT id FROM studio_jobs WHERE json_extract(options, '$.yt.status') = 'review' AND json_extract(options, '$.yt.next_check') <= ? ORDER BY json_extract(options, '$.yt.next_check') ASC LIMIT 1").bind(now()).first();
      if (prow) {
        const job = await getJob(db, prow.id); const jo = JSON.parse(job.options || '{}');
        jo.yt = { ...jo.yt, next_check: now() + 5 * 60000 };   // 도우미가 죽어도 5분 뒤 다시 (사용자 2026-11-11: 10분 → 5분)
        await setJob(db, job.id, { options: JSON.stringify(jo) });
        return json({ job: { ...job, options: jo, phase: 'youtube-publish' }, youtube: { video_id: jo.yt.video_id || '', url: jo.yt.url || '', title: jo.yt.title || job.title, channel_name: job.channel === '순섬' ? '순수한크립토' : '사적인자산왕' } });
      }
      const yrow = await db.prepare("SELECT id FROM studio_jobs WHERE json_extract(options, '$.yt.status') = 'queued' ORDER BY json_extract(options, '$.yt.at') ASC LIMIT 1").first();
      if (yrow) {
        const job = await getJob(db, yrow.id);
        const jo = JSON.parse(job.options || '{}');
        jo.yt = { ...jo.yt, status: 'running', started_at: now(), error: '' };
        await setJob(db, job.id, { options: JSON.stringify(jo) });
        const summary = docJson(await latestDoc(db, job.id, 'summary')) || {};
        const thumb = (await jobAssets(db, job.id)).filter((a) => a.kind === 'thumb').pop();
        return json({ job: { ...job, options: jo, phase: 'youtube' }, youtube: { video_job: jo.video_job || '', title: jo.yt.title || summary.titles?.[0] || job.title, more: summary.description || '', visibility: jo.yt.visibility || '비공개', thumb_url: thumb ? `/studio/a/${thumb.id}` : '', channel_name: job.channel === '순섬' ? '순수한크립토' : '사적인자산왕' } });
      }
    }
    const st = [];
    if (want.includes('images')) st.push('images');
    if (want.includes('text')) st.push('queued');
    if (!st.length) return json({ job: null });
    const row = await db.prepare(`SELECT id, status FROM studio_jobs WHERE status IN (${st.map(() => '?').join(',')}) AND json_extract(options, '$.engine') IN ('cloud', 'pc') ORDER BY created_at ASC LIMIT 1`).bind(...st).first();
    if (!row) return json({ job: null });
    await setJob(db, row.id, { status: 'running', step: row.status === 'images' ? 'slides' : 'claim', error: '' });
    const job = await getJob(db, row.id);
    const docs = (await db.prepare('SELECT kind, MAX(version) AS version, body FROM studio_docs WHERE job_id = ? GROUP BY kind').bind(job.id).all()).results;
    const caps = (await jobAssets(db, job.id)).filter((a) => a.kind === 'capture').map((a) => ({ idx: a.idx, url: `/studio/a/${a.id}`, mime: a.mime }));
    const have = (await jobAssets(db, job.id)).filter((a) => a.kind !== 'capture').map((a) => ({ kind: a.kind, idx: a.idx }));
    return json({ job: { ...job, options: JSON.parse(job.options || '{}'), phase: row.status === 'images' ? 'images' : 'text' }, docs: Object.fromEntries(docs.map((d) => [d.kind, d.body])), captures: caps, assets: have, settings: await getSettings(db), face_catalog: (await db.prepare("SELECT value FROM studio_settings WHERE key = 'face_catalog'").first())?.value || '' });
  }
  // PC 도우미가 올릴 영상 받기 — clone(내 목소리) R2 의 video/<작업id>.mp4 를 그대로 넘겨 준다
  if ((mm = path.match(/^\/api\/studio\/helper\/video\/([\w-]+)$/)) && method === 'GET') {
    if (!env.CLONE || !env.CLONE_TOKEN) throw new HttpError(503, '내 목소리(clone)가 연결되지 않았습니다.');
    const headers = new Headers({ 'X-Agent-Token': env.CLONE_TOKEN });
    if (request.headers.has('Range')) headers.set('Range', request.headers.get('Range'));
    const res = await env.CLONE.fetch(new Request(`https://clone/video/${mm[1]}.mp4`, { headers }));
    return new Response(res.body, { status: res.status, headers: res.headers });
  }
  if ((mm = path.match(/^\/api\/studio\/helper\/face\/(\d{3})$/))) {
    const o = await env.FILES.get(`studio/faces/${mm[1]}.webp`);
    return o ? new Response(o.body, { headers: { 'Content-Type': 'image/webp' } }) : new Response('없음', { status: 404 });
  }
  if ((mm = path.match(/^\/api\/studio\/helper\/settings\/([a-z_]+)$/)) && method === 'PUT') {
    const d = await readJson();
    await db.prepare('INSERT INTO studio_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(mm[1], typeof d.value === 'string' ? d.value : JSON.stringify(d.value)).run();
    return json({ ok: true });
  }
  if ((mm = path.match(/^\/api\/studio\/helper\/jobs\/([a-f0-9]{20})(?:\/([a-z_]+)(?:\/([a-z0-9_]+))?)?$/))) {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const sub = mm[2] || '', arg = mm[3] || '';
    if (!sub && method === 'GET') {
      const docs = (await db.prepare('SELECT kind, MAX(version) AS version, body FROM studio_docs WHERE job_id = ? GROUP BY kind').bind(job.id).all()).results;
      const caps = (await jobAssets(db, job.id)).filter((a) => a.kind === 'capture').map((a) => ({ idx: a.idx, url: `/studio/a/${a.id}`, mime: a.mime }));
      const catalog = (await db.prepare("SELECT value FROM studio_settings WHERE key = 'face_catalog'").first())?.value || '';
      const have = (await jobAssets(db, job.id)).filter((a) => a.kind !== 'capture').map((a) => ({ kind: a.kind, idx: a.idx }));
      return json({ job: { ...job, options: JSON.parse(job.options || '{}') }, docs: Object.fromEntries(docs.map((d) => [d.kind, d.body])), captures: caps, assets: have, settings: await getSettings(db), face_catalog: catalog });
    }
    if (sub === 'rss' && method === 'POST') {
      const c = await rssCandidates(NEWS_HOURS);
      await saveDoc(db, job.id, 'candidates', c);
      return json({ candidates: c, now_kst: kst(now()), hours: NEWS_HOURS, covered: await recentlyCovered(db, job.id) });
    }
    if (sub === 'step' && method === 'POST') {
      const d = await readJson();
      const step = String(d.step || '').slice(0, 40);
      if (d.status === 'running') { const id = await stepStart(db, job.id, step, String(d.note || '').slice(0, 300)); return json({ id }); }
      const row = await db.prepare("SELECT id FROM studio_steps WHERE job_id = ? AND step = ? AND status = 'running' ORDER BY id DESC LIMIT 1").bind(job.id, step).first();
      if (row) await stepEnd(db, row.id, job.id, ['done', 'failed', 'skipped'].includes(d.status) ? d.status : 'done', d.note || '', d.usage || null);
      return json({ ok: true });
    }
    if (sub === 'yt' && method === 'POST') {   // 유튜브 올리기 결과 {status: done|failed|login|published|reviewing, url, error}
      const d = await readJson();
      const jo = JSON.parse(job.options || '{}');
      const y = jo.yt || {};
      const st = String(d.status || '');
      if (st === 'done') {
        const url = String(d.url || '').slice(0, 200);
        const vidm = url.match(/(?:youtu\.be\/|v=|\/video\/)([\w-]{6,})/);
        const review = (y.visibility || '비공개') === '비공개' && y.publish !== false;   // 비공개로 올렸고 "검토 끝나면 공개" 가 켜져 있으면 검토 단계로
        jo.yt = { ...y, status: review ? 'review' : 'done', url, video_id: vidm ? vidm[1] : (y.video_id || ''), error: '', uploaded_at: now(), finished_at: review ? null : now(), next_check: review ? now() + 5 * 60000 : null, checks: 0 };
      } else if (st === 'published') {
        jo.yt = { ...y, status: 'done', visibility: '공개', error: '', published_at: now(), finished_at: now(), tg: (y.telegram !== false && jo.tg_auto !== false) ? { status: 'queued', at: now() } : (y.tg || null) };   // 공개되면 텔레그램 공식채널에 링크(사용자 2026-11-10)
      } else if (st === 'tg_done' || st === 'tg_failed') {
        jo.yt = { ...y, tg: { ...(y.tg || {}), status: st === 'tg_done' ? 'done' : 'failed', error: String(d.error || '').slice(0, 300), message_id: d.message_id || null, finished_at: now() } };
      } else if (st === 'reviewing') {
        const n = (y.checks || 0) + 1;
        jo.yt = n >= 144 ? { ...y, status: 'done', error: '12시간 동안 검토가 끝나지 않아 비공개로 둡니다', finished_at: now() } : { ...y, status: 'review', checks: n, next_check: now() + 5 * 60000, error: '' };
      } else if (y.status === 'review' && (st === 'failed' || st === 'login')) {
        const n = (y.fails || 0) + 1;   // 공개 전환 실패는 3번까지 다시, 그 뒤 포기(비공개로 남음)
        jo.yt = n >= 3 ? { ...y, status: 'done', error: `공개 전환 실패: ${String(d.error || '').slice(0, 200)} — 유튜브에서 직접 공개로 바꿔 주세요`, finished_at: now() } : { ...y, status: 'review', fails: n, next_check: now() + 5 * 60000, error: String(d.error || '').slice(0, 300) };
      } else if (st === 'failed' && !y.retried) {
        jo.yt = { ...y, status: 'queued', retried: true, at: now(), error: `1차 실패(다시 시도): ${String(d.error || '').slice(0, 200)}` };   // 업로드 중 일시 오류(파일 선택 시간 초과 등)는 한 번 자동으로 다시
      } else {
        jo.yt = { ...y, status: ['failed', 'login'].includes(st) ? st : 'failed', error: String(d.error || '').slice(0, 400), finished_at: now() };
      }
      await setJob(db, job.id, { options: JSON.stringify(jo) });
      return json({ ok: true });
    }
    if (sub === 'status' && method === 'POST') {
      const d = await readJson();
      const st = ['queued', 'running', 'pick', 'thumb', 'images', 'done', 'failed', 'stopped'].includes(d.status) ? d.status : job.status;
      const f = { status: st, step: String(d.step || '').slice(0, 40), error: String(d.error || '').slice(0, 500) };
      if (d.title) f.title = String(d.title).slice(0, 120);
      if (d.clear_redo) { const o = JSON.parse(job.options || '{}'); delete o.redo; f.options = JSON.stringify(o); }
      if (['done', 'failed', 'stopped'].includes(st)) f.finished_at = now();
      await setJob(db, job.id, f);
      if (st === 'done') { await autoVideo(env, db, job.id); await purgeOld(env); }
      return json({ ok: true });
    }
    // 그림 올리기 (PC 도우미): 본문 = webp/png 바이트, ?kind=slide|thumb&idx=N. 같은 자리의 전 그림은 지운다
    if (sub === 'asset' && method === 'POST') {
      const kind = url.searchParams.get('kind') === 'thumb' ? 'thumb' : 'slide';
      const idx = Math.max(1, Math.min(12, +(url.searchParams.get('idx') || 1)));
      const mime = request.headers.get('Content-Type') || '';
      if (!/^image\/(webp|png|jpeg)$/.test(mime)) throw bad('이미지만 올릴 수 있습니다.');
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > 8 * 1024 * 1024) throw bad('8MB 이하로 올려 주세요.');
      for (const a of (await jobAssets(db, job.id)).filter((a) => a.kind === kind && a.idx === idx)) await dropAsset(env, a);
      let meta = {}; try { meta = JSON.parse(request.headers.get('X-Meta') || '{}'); } catch { /* 없음 */ }
      const id = await putAsset(env, job.id, kind, idx, bytes, mime, { source: 'pc-chatgpt', ...meta }, { w: +(url.searchParams.get('w') || 0), h: +(url.searchParams.get('h') || 0) });
      return json({ id, url: `/studio/a/${id}` });
    }
    if (sub === 'doc' && arg && method === 'PUT') {
      const d = await readJson();
      const body = typeof d.body === 'string' ? d.body : JSON.stringify(d.body);
      if (!body || body.length > 400000) throw bad('내용이 비었거나 너무 깁니다.');
      const v = await saveDoc(db, job.id, arg, body);
      if (arg === 'summary') {
        const s = typeof d.body === 'string' ? JSON.parse(d.body) : d.body;
        const fact = docJson(await latestDoc(db, job.id, 'factcheck'));
        const fixed = fact?.fixed_blocks || splitBlocks((await latestDoc(db, job.id, 'articles'))?.body);
        if (fixed?.length) await buildShowTexts(db, job, fixed, s.intro);
        if (s.titles?.[0]) await setJob(db, job.id, { title: String(s.titles[0]).slice(0, 120) });
      }
      return json({ ok: true, version: v });
    }
  }
  throw new HttpError(404, '없는 주소입니다.');
}

// 작업 만들기 (운영자 API · 예약 공용)
async function createJob(env, gh, d) {
  const db = env.DB;
  const kind = ['main', 'thumb', 'phone'].includes(d.kind) ? d.kind : 'main';
  if (kind === 'phone') throw bad('폰UI 쇼츠는 다음 단계에서 열립니다.');
  const channel = d.channel === '순섬' ? '순섬' : '사섬';
  const source = ['rss', 'capture', 'text'].includes(d.source) ? d.source : 'rss';
  const settings = await getSettings(db);
  const today = await db.prepare('SELECT COUNT(*) AS n FROM studio_jobs WHERE created_at > ?').bind(now() - 86400000).first();
  if (today.n >= settings.daily_limit) throw bad(`하루 최대 ${settings.daily_limit}회를 넘었습니다(과금 안전장치). 설정에서 바꿀 수 있습니다.`);
  const engine = ['cloud', 'pc', 'api', 'none'].includes(d.engine) ? d.engine : 'cloud';
  if (['api', 'none'].includes(engine) && !env.ANTHROPIC_API_KEY) throw bad('API 방식은 ANTHROPIC_API_KEY 가 있어야 합니다. 기본(클라우드 · 구독)으로 하세요.');
  if (engine === 'cloud' && !env.STUDIO_HELPER_TOKEN) throw bad('도우미 토큰(STUDIO_HELPER_TOKEN)이 아직 없습니다.');
  const options = { pick: d.pick === 'manual' ? 'manual' : 'auto', thumb: d.thumb === 'manual' ? 'manual' : 'auto', engine, text: String(d.text || '').slice(0, 20000), video_auto: d.video !== false && d.video !== 'false' && d.video !== 0, yt_auto: d.youtube !== false && d.youtube !== 'false' && d.youtube !== 0, tg_auto: d.youtube !== false && d.youtube !== 'false' && d.youtube !== 0 };   // 완성되면 영상도 · 영상이 되면 유튜브도(기본 켬, 사용자 지시 2026-11-10)
  if (d.scheduled) options.scheduled = String(d.scheduled).slice(0, 40);
  if (kind === 'thumb') Object.assign(options, { title: String(d.title || '').slice(0, 200), emotion: d.emotion || '자동', gesture: d.gesture || '자동', badgeName: String(d.badgeName || '').slice(0, 60), badgeRole: String(d.badgeRole || '').slice(0, 80), face: d.face || 'emoji:auto' });
  if (kind === 'thumb' && !options.title) throw bad('썸네일 제목을 넣어 주세요.');
  const id = hex(10);
  await db.prepare('INSERT INTO studio_jobs (id, kind, channel, source, options, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, kind, channel, source, JSON.stringify(options), 'queued', now(), now()).run();
  const caps = Array.isArray(d.captures) ? d.captures.filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 6) : [];
  for (let i = 0; i < caps.length; i++) await db.prepare("UPDATE studio_assets SET job_id = ?, idx = ? WHERE id = ? AND job_id = ''").bind(id, i + 1, caps[i]).run();
  if (source === 'capture' && !caps.length) { await db.prepare('DELETE FROM studio_jobs WHERE id = ?').bind(id).run(); throw bad('캡쳐 이미지를 올려 주세요.'); }
  if (engine === 'cloud' && settings.cloud_text === 'on') await dispatchRun(env, gh, { id }, 'run');
  else if (engine !== 'pc' && engine !== 'cloud') {
    const inst = await env.STUDIO_WF.create({ id: `job-${id}-${hex(3)}`, params: { jobId: id } });
    await setJob(db, id, { wf_id: inst.id });
  }
  return id;
}
async function getSchedules(db) {
  const row = await db.prepare("SELECT value FROM studio_settings WHERE key = 'schedules'").first();
  if (row) { try { return JSON.parse(row.value); } catch { /* 아래 기본값 */ } }
  // 기본: 아침 7:10 순섬(순수한 크립토), 저녁 8:00 사섬(사적인 자산왕) — 사용자 지시 2026-11-09
  return [{ id: 'a1b2c3', time: '07:10', channel: '순섬', on: true, last: '' }, { id: 'd4e5f6', time: '20:00', channel: '사섬', on: true, last: '' }];
}
const kstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const kstHM = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);
// Cron(5분마다): 예약 시각이 지났고 오늘 아직 안 만든 예약 → 작업 만들기 (PC 가 꺼져 있어도 '대기' 로 쌓인다)
export async function studioScheduled(env, gh) {
  const db = env.DB;
  const list = await getSchedules(db);
  const today = kstDate(now()), hm = kstHM(now());
  let changed = false;
  const minutes = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  for (const s of list) {
    if (!s.on || s.last === today || s.time > hm) continue;
    // 예약 시각에서 60분 넘게 지났으면 그날은 건너뛴다 (늦은 밤에 아침 예약이 뒤늦게 도는 일 방지 — 2026-11-09 실측)
    if (minutes(hm) - minutes(s.time) > 60) { s.last = today; changed = true; continue; }
    try {
      const id = await createJob(env, gh, { kind: 'main', channel: s.channel, source: 'rss', pick: s.pick === 'manual' ? 'manual' : 'auto', thumb: s.thumb === 'manual' ? 'manual' : 'auto', engine: 'cloud', scheduled: `${s.time} ${s.channel}`, video: s.video !== false, youtube: s.youtube !== false && s.video !== false });
      await db.prepare("INSERT INTO audit_log (action, target, detail, ip, created_at) VALUES ('STUDIO_JOB', ?, ?, '예약', ?)").bind(`스튜디오 예약 ${s.time}`, `${s.channel} · ${id}`, now()).run().catch(() => {});
    } catch (e) { console.error('예약 작업 실패', s.time, e.message); }
    s.last = today; changed = true;
  }
  if (changed) await db.prepare("INSERT INTO studio_settings (key, value) VALUES ('schedules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(list)).run();
}

// ───────────────────────── 운영자 API ─────────────────────────

// 스튜디오 영상 만들기(2026-11-10): show_texts + 슬라이드 그림 → clone(내 목소리) 스튜디오 작업. 카드 버튼과 "완성되면 자동"(options.video_auto) 둘 다 여기로
export async function startStudioVideo(env, db, job, speed = 0.95) {
  if (!env.CLONE || !env.CLONE_TOKEN) throw new HttpError(503, '내 목소리(clone)가 아직 연결되지 않았습니다.');
  const texts = docJson(await latestDoc(db, job.id, 'show_texts')) || [];
  const slides = (await jobAssets(db, job.id)).filter((a) => a.kind === 'slide');
  const origin = 'https://xim.plators.com';
  const list = texts.map((t, i) => { const a = slides.filter((s) => s.idx === i + 1).pop(); return a ? { idx: i + 1, image: `${origin}/studio/a/${a.id}`, text: String(t || '') } : null; }).filter((x) => x && x.text.trim());
  if (!list.length) throw bad('슬라이드 그림과 원고가 아직 없습니다.');
  const res = await env.CLONE.fetch(new Request('https://clone/api/jobs', { method: 'POST', headers: { 'X-Agent-Token': env.CLONE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed, studio: { job_id: job.id, title: job.title || '', slides: list } }) }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, out.error || '내 목소리 작업을 만들지 못했습니다.');
  const jo = JSON.parse(job.options || '{}');
  await setJob(db, job.id, { options: JSON.stringify({ ...jo, video_job: out.job?.id || '', video_at: now() }) });
  return { id: out.job?.id || '', slides: list.length, chars: list.reduce((n, x) => n + x.text.length, 0) };
}
// 발표자료가 끝났을 때(도우미 보고 · Workflow) — 새 발표자료에서 "영상도 바로 만들기" 를 켰으면(기본) 자동으로 영상 작업을 건다
async function autoVideo(env, db, jobId) {
  try {
    const job = await getJob(db, jobId);
    const jo = JSON.parse(job?.options || '{}');
    if (!job || job.kind !== 'main' || jo.video_auto === false || jo.video_job) return;
    await startStudioVideo(env, db, job);
  } catch (e) { try { await setJob(db, jobId, { error: `영상 자동 시작 실패: ${String(e.message || e).slice(0, 200)}` }); } catch { /* 무시 */ } }
}

export async function studioApi(request, env, url, ctx, path, method, bodyFn, audit, gh) {
  const db = env.DB;
  const m = (re) => path.match(re);

  if (path === '/api/studio/options' && method === 'GET') {
    const settings = await getSettings(db);
    const seen = +((await db.prepare("SELECT value FROM studio_settings WHERE key = 'helper_seen'").first())?.value || 0);
    return json({ emotions: P.THUMB_EMOTIONS, gestures: P.THUMB_GESTURES, faces: Array.from({ length: 87 }, (_, i) => String(i + 1).padStart(3, '0')), settings, keys: { anthropic: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, helper: !!env.STUDIO_HELPER_TOKEN }, helper_seen: seen });
  }
  // 다른 PC 에 도우미를 깔 때 붙여 넣을 토큰 (운영자 로그인 뒤에만)
  if (path === '/api/studio/helper-token' && method === 'GET') return json({ token: env.STUDIO_HELPER_TOKEN || '', url: url.origin });
  if (path === '/api/studio/helper-status' && method === 'GET') {
    const seen = +((await db.prepare("SELECT value FROM studio_settings WHERE key = 'helper_seen'").first())?.value || 0);
    const tot = await db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS n, COUNT(DISTINCT job_id) AS jobs FROM studio_assets').first();
    let info = null; try { info = JSON.parse((await db.prepare("SELECT value FROM studio_settings WHERE key = 'helper_info'").first())?.value || 'null'); } catch { /* 없음 */ }
    const st = await getSettings(db);
    return json({ helper_seen: seen, online: now() - seen < 40000, total_bytes: tot.bytes, total_files: tot.n, kept_jobs: tot.jobs, keep: KEEP_JOBS, info, expected: { claude: st.claude_account, chatgpt: st.chatgpt_account }, token_ok: !!env.STUDIO_HELPER_TOKEN, schedules: (await getSchedules(db)).filter((x) => x.on) });
  }
  if (path === '/api/studio/settings' && method === 'PUT') {
    const data = await bodyFn(request);
    const stmts = [];
    for (const k of SETTING_KEYS) if (k in data) stmts.push(db.prepare('INSERT INTO studio_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(data[k] ?? '').slice(0, 4000)));
    if (stmts.length) await db.batch(stmts);
    await audit?.('STUDIO_SETTINGS', '스튜디오 설정', Object.keys(data).join(', '));
    return json({ ok: true, settings: await getSettings(db) });
  }
  let mm;
  if ((mm = m(/^\/api\/studio\/face\/(\d{3})$/)) && method === 'GET') {
    const o = await env.FILES.get(`studio/faces/${mm[1]}.webp`);
    if (!o) return new Response('없음', { status: 404 });
    return new Response(o.body, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=86400' } });
  }

  // 업로드(캡쳐 · 인물 사진): 브라우저가 webp 로 줄여 보낸다. 본문 = 이미지 바이트
  if (path === '/api/studio/upload' && method === 'POST') {
    const mime = request.headers.get('Content-Type') || '';
    if (!/^image\/(webp|png|jpeg)$/.test(mime)) throw bad('webp · png · jpg 이미지만 올릴 수 있습니다.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 6 * 1024 * 1024) throw bad('6MB 이하로 올려 주세요.');
    const kind = url.searchParams.get('kind') === 'face' ? 'face_upload' : 'capture';
    const id = await putAsset(env, '', kind, 0, bytes, mime, { name: request.headers.get('X-Name') || '' });
    return json({ id, url: `/studio/a/${id}` });
  }

  if (path === '/api/studio/jobs' && method === 'GET') {
    const limit = Math.min(100, +(url.searchParams.get('limit') || 40));
    const { results } = await db.prepare('SELECT id, kind, channel, source, status, step, title, error, cost, assets_purged, options, created_at, updated_at, finished_at, (SELECT COALESCE(SUM(size), 0) FROM studio_assets a WHERE a.job_id = studio_jobs.id) AS bytes, (SELECT MIN(started_at) FROM studio_steps s WHERE s.job_id = studio_jobs.id AND s.step != "claim") AS started_at FROM studio_jobs ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    const thumbs = results.length ? (await db.prepare(`SELECT job_id, id FROM studio_assets WHERE kind = 'thumb' AND job_id IN (${results.map(() => '?').join(',')})`).bind(...results.map((r) => r.id)).all()).results : [];
    const tmap = Object.fromEntries(thumbs.map((t) => [t.job_id, t.id]));
    return json(results.map((r) => ({ ...r, options: JSON.parse(r.options || '{}'), thumb: tmap[r.id] ? `/studio/a/${tmap[r.id]}` : '' })));
  }

  // 예약표 (최대 3개): [{ id, time:'07:10', channel, on, last:'YYYY-MM-DD' }] — Cron(5분마다)이 보고 작업을 만든다
  if (path === '/api/studio/schedules' && method === 'GET') {
    // 한 번 만드는 데 걸리는 시간: 최근 완료된 본편(자동 선택 · 자동 썸네일)의 시작→완료, 최근 10개 평균 · 마지막
    const { results } = await db.prepare("SELECT created_at, finished_at FROM studio_jobs WHERE kind = 'main' AND status = 'done' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 10").all();
    const mins = results.map((r) => Math.round((r.finished_at - r.created_at) / 60000)).filter((m) => m > 0 && m < 240);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0;
    return json({ schedules: await getSchedules(db), now_kst: kst(now()), duration: { avg_min: avg, last_min: mins[0] || 0, n: mins.length } });
  }
  if (path === '/api/studio/schedules' && method === 'PUT') {
    const d = await bodyFn(request);
    const list = (Array.isArray(d.schedules) ? d.schedules : []).slice(0, 3).map((x, i) => ({
      id: /^[a-f0-9]{6}$/.test(x.id || '') ? x.id : hex(3),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time || '') ? x.time : ['07:10', '20:00', '12:00'][i],
      channel: x.channel === '순섬' ? '순섬' : '사섬',
      on: !!x.on,
      last: String(x.last || ''),
      // 세부 설정(2026-11-10 사용자 지시): 새 발표자료와 같은 선택지. 기본 = 자동 선택 · 자동 썸네일 · 영상 만들기 · 유튜브(검토 뒤 공개 · 텔레그램)까지
      pick: x.pick === 'manual' ? 'manual' : 'auto',
      thumb: x.thumb === 'manual' ? 'manual' : 'auto',
      video: x.video !== false && x.video !== 'false' && x.video !== 0,
      youtube: x.youtube !== false && x.youtube !== 'false' && x.youtube !== 0,
    }));
    // 저장 시점에 이미 지난 시각은 오늘은 건너뛴다(저장하자마자 바로 도는 일 방지)
    const tod = kstDate(now()), nowHM = kstHM(now());
    for (const x of list) if (x.on && x.time <= nowHM && !x.last) x.last = tod;
    await db.prepare("INSERT INTO studio_settings (key, value) VALUES ('schedules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(list)).run();
    await audit?.('STUDIO_SCHEDULE', '스튜디오 예약', list.filter((x) => x.on).map((x) => `${x.time} ${x.channel}`).join(', ') || '없음');
    return json({ schedules: list });
  }

  if (path === '/api/studio/jobs' && method === 'POST') {
    const d = await bodyFn(request);
    const id = await createJob(env, gh, d);
    await audit?.('STUDIO_JOB', `스튜디오 ${d.kind || 'main'}`, `${d.channel || '사섬'} · ${d.source || 'rss'} · ${id}`);
    return json({ id });
  }
  if (false) {
    const d = null;
    const kind = ['main', 'thumb', 'phone'].includes(d.kind) ? d.kind : 'main';
    if (kind === 'phone') throw bad('폰UI 쇼츠는 다음 단계에서 열립니다.');
    const channel = d.channel === '순섬' ? '순섬' : '사섬';
    const source = ['rss', 'capture', 'text'].includes(d.source) ? d.source : 'rss';
    const settings = await getSettings(db);
    const today = await db.prepare('SELECT COUNT(*) AS n FROM studio_jobs WHERE created_at > ?').bind(now() - 86400000).first();
    if (today.n >= settings.daily_limit) throw bad(`하루 최대 ${settings.daily_limit}회를 넘었습니다(과금 안전장치). 설정에서 바꿀 수 있습니다.`);
    const engine = ['cloud', 'pc', 'api', 'none'].includes(d.engine) ? d.engine : 'cloud';
    if (['api', 'none'].includes(engine) && !env.ANTHROPIC_API_KEY) throw bad('API 방식은 ANTHROPIC_API_KEY 가 있어야 합니다. 기본(클라우드 · 구독)으로 하세요.');
    if (engine === 'cloud' && !env.STUDIO_HELPER_TOKEN) throw bad('도우미 토큰(STUDIO_HELPER_TOKEN)이 아직 없습니다.');
    const options = { pick: d.pick === 'manual' ? 'manual' : 'auto', thumb: d.thumb === 'manual' ? 'manual' : 'auto', engine, text: String(d.text || '').slice(0, 20000), video_auto: d.video !== false && d.video !== 'false' && d.video !== 0, yt_auto: d.youtube !== false && d.youtube !== 'false' && d.youtube !== 0, tg_auto: d.youtube !== false && d.youtube !== 'false' && d.youtube !== 0 };   // 완성되면 영상도 · 영상이 되면 유튜브도(기본 켬, 사용자 지시 2026-11-10)
    if (kind === 'thumb') Object.assign(options, { title: String(d.title || '').slice(0, 200), emotion: d.emotion || '자동', gesture: d.gesture || '자동', badgeName: String(d.badgeName || '').slice(0, 60), badgeRole: String(d.badgeRole || '').slice(0, 80), face: d.face || 'emoji:auto' });
    if (kind === 'thumb' && !options.title) throw bad('썸네일 제목을 넣어 주세요.');
    const id = hex(10);
    await db.prepare('INSERT INTO studio_jobs (id, kind, channel, source, options, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, kind, channel, source, JSON.stringify(options), 'queued', now(), now()).run();
    // 올린 캡쳐를 이 작업에 붙인다
    const caps = Array.isArray(d.captures) ? d.captures.filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 6) : [];
    for (let i = 0; i < caps.length; i++) await db.prepare("UPDATE studio_assets SET job_id = ?, idx = ? WHERE id = ? AND job_id = ''").bind(id, i + 1, caps[i]).run();
    if (source === 'capture' && !caps.length) { await db.prepare('DELETE FROM studio_jobs WHERE id = ?').bind(id).run(); throw bad('캡쳐 이미지를 올려 주세요.'); }
    if (engine === 'cloud' && settings.cloud_text === 'on') await dispatchRun(env, gh, { id }, 'run');
    else if (engine !== 'pc') {
      const inst = await env.STUDIO_WF.create({ id: `job-${id}-${hex(3)}`, params: { jobId: id } });
      await setJob(db, id, { wf_id: inst.id });
    }
  }

  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})$/))) {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    if (method === 'GET') {
      const steps = (await db.prepare('SELECT * FROM studio_steps WHERE job_id = ? ORDER BY id').bind(job.id).all()).results;
      const docs = (await db.prepare('SELECT kind, MAX(version) AS version, body FROM studio_docs WHERE job_id = ? GROUP BY kind').bind(job.id).all()).results;
      const assets = (await jobAssets(db, job.id)).map((a) => ({ ...a, url: `/studio/a/${a.id}`, meta: JSON.parse(a.meta || '{}') }));
      // 혹시 Workflow 가 죽어 상태가 안 바뀌었으면 Workflow 상태로 맞춘다
      if (['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status) && job.wf_id) {
        try { const st = await (await env.STUDIO_WF.get(job.wf_id)).status(); if (st.status === 'errored' || st.status === 'terminated') { await setJob(db, job.id, { status: st.status === 'errored' ? 'failed' : 'stopped', error: String(st.error?.message || st.error || '').slice(0, 500), finished_at: now() }); Object.assign(job, { status: st.status === 'errored' ? 'failed' : 'stopped' }); } } catch { /* 없으면 그대로 */ }
      }
      return json({ job: { ...job, options: JSON.parse(job.options || '{}') }, steps, docs: Object.fromEntries(docs.map((d) => [d.kind, { version: d.version, body: d.body }])), assets, show_url: `/studio/show/${job.id}` });
    }
    if (method === 'DELETE') {
      for (const a of await jobAssets(db, job.id)) await dropAsset(env, a);
      if (job.wf_id && ['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status)) { try { await (await env.STUDIO_WF.get(job.wf_id)).terminate(); } catch { /* 이미 끝남 */ } }
      await db.prepare('DELETE FROM studio_jobs WHERE id = ?').bind(job.id).run();
      await audit?.('STUDIO_DELETE', '스튜디오 삭제', job.title || job.id);
      return json({ ok: true });
    }
  }
  // 유튜브에 올리기(2026-11-10): 완성된 영상(options.video_job)을 PC 도우미가 엣지(자동화 프로필, 사적인자산왕 로그인)로 올린다. 제목 · 더보기란 · 썸네일은 유튜브 탭 내용 그대로
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/youtube$/)) && method === 'POST') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const jo = JSON.parse(job.options || '{}');
    if (!jo.video_job) throw bad('먼저 "영상 만들기" 로 영상을 만들어 주세요.');
    if (jo.yt && ['queued', 'running'].includes(jo.yt.status)) throw bad('이미 올리는 중입니다.');
    const d = await bodyFn(request).catch(() => ({}));
    const summary = docJson(await latestDoc(db, job.id, 'summary')) || {};
    const title = String(d.title || summary.titles?.[0] || job.title || '').slice(0, 100);
    if (!title) throw bad('제목이 없습니다.');
    jo.yt = { status: 'queued', title, visibility: ['공개', '일부공개', '비공개'].includes(d.visibility) ? d.visibility : '비공개', publish: d.publish !== false && d.publish !== 'false', telegram: d.telegram !== false && d.telegram !== 'false', at: now(), url: '', error: '' };   // publish: 비공개로 올린 뒤 검토가 끝나면 공개로 · telegram: 공개되면 공식채널에 링크(둘 다 기본 켬)
    await setJob(db, job.id, { options: JSON.stringify(jo) });
    await audit?.('STUDIO_YOUTUBE', '유튜브 올리기', `${title} · ${jo.yt.visibility}`);
    return json({ ok: true, yt: jo.yt });
  }
  // 영상 만들기(2026-11-10 사용자 지시): 슬라이드 전부를 사자왕이 읽는 1280x720 자막 영상 — clone(내 목소리) 에 스튜디오 작업으로 넘긴다. 진행 · 결과는 xim "내 목소리" 목록에서 본다
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/video$/)) && method === 'POST') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const d = await bodyFn(request).catch(() => ({}));
    const r = await startStudioVideo(env, db, job, d.speed || 0.95);
    await audit?.('STUDIO_VIDEO', '스튜디오 영상', `${job.title || job.id} → ${r.id}`);
    return json(r);
  }
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/(pick|thumb|stop|redo)$/)) && method === 'POST') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const d = await bodyFn(request);
    const jo = JSON.parse(job.options || '{}');
    const pc = jo.engine === 'pc', cloud = jo.engine === 'cloud';
    const inst = !pc && !cloud && job.wf_id ? await env.STUDIO_WF.get(job.wf_id) : null;
    if (mm[2] === 'stop') {
      if (inst) { try { await inst.terminate(); } catch { /* 이미 끝남 */ } }
      await setJob(db, job.id, { status: 'stopped', step: '', finished_at: now() });   // pc 도우미는 상태를 보고 claude 를 끊는다
      return json({ ok: true });
    }
    if (mm[2] === 'pick') {
      if (job.status !== 'pick') throw bad('지금은 고르기 단계가 아닙니다.');
      const chosen = (d.chosen || []).map(Number).filter(Boolean).slice(0, 6);
      if (chosen.length < 1) throw bad('기사를 골라 주세요.');
      await saveDoc(db, job.id, 'chosen', chosen);
      if (inst) await inst.sendEvent({ type: 'pick', payload: { chosen } });
      await setJob(db, job.id, { status: 'running', step: 'articles' });
      if (cloud && (await getSettings(db)).cloud_text === 'on') await dispatchRun(env, gh, job, 'articles');
      return json({ ok: true });
    }
    if (mm[2] === 'thumb') {
      if (job.status !== 'thumb') throw bad('지금은 썸네일 선택 단계가 아닙니다.');
      const pick = thumbPickFields(d);
      await saveDoc(db, job.id, 'thumb_pick', pick);
      if (inst) { await inst.sendEvent({ type: 'thumb', payload: pick }); await setJob(db, job.id, { status: 'running', step: 'thumb' }); }
      else await setJob(db, job.id, { status: 'images', step: 'thumb' });   // 그림(슬라이드 · 썸네일)은 PC 도우미가 ChatGPT 로 만든다
      return json({ ok: true });
    }
    if (mm[2] === 'redo') {
      if (['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status)) throw bad('작업이 끝난 뒤에 다시 만들 수 있습니다.');
      const what = d.what === 'thumb' ? 'thumb' : 'slide';
      const payload = { jobId: job.id, task: 'redo', what, idx: Math.max(1, Math.min(12, +(d.idx || 1))), note: String(d.note || '').slice(0, 500), pick: what === 'thumb' ? thumbPickFields(d.pick || {}) : null };
      if (pc || cloud) {
        if (what === 'thumb') { await saveDoc(db, job.id, 'thumb_pick', { ...(docJson(await latestDoc(db, job.id, 'thumb_pick')) || {}), ...payload.pick }); return json({ ok: true }); }   // 템플릿 썸네일: 값만 바꾸면 끝
        await setJob(db, job.id, { options: JSON.stringify({ ...jo, redo: { what, idx: payload.idx, note: payload.note } }), status: 'running', step: `slide-${payload.idx}`, error: '' });
        if (cloud && (await getSettings(db)).cloud_text === 'on') await dispatchRun(env, gh, job, 'redo-slide');
        else await setJob(db, job.id, { status: 'images' });   // PC 도우미가 그 장만 다시 만든다
        return json({ ok: true });
      }
      const i2 = await env.STUDIO_WF.create({ id: `redo-${job.id}-${hex(3)}`, params: payload });
      await setJob(db, job.id, { wf_id: i2.id, status: 'running', step: what, error: '' });
      return json({ ok: true });
    }
  }
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/rethumb$/)) && method === 'POST') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    for (const a of (await jobAssets(db, job.id)).filter((a) => a.kind === 'thumb')) await dropAsset(env, a);
    await setJob(db, job.id, { status: 'images', step: 'thumb', error: '' });
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/docs\/(articles|show_texts|summary|factcheck|slides|thumb_pick)$/)) && method === 'PUT') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const d = await bodyFn(request);
    const body = typeof d.body === 'string' ? d.body : JSON.stringify(d.body);
    if (!body || body.length > 200000) throw bad('내용이 비었거나 너무 깁니다.');
    const v = await saveDoc(db, job.id, mm[2], body);
    return json({ ok: true, version: v });
  }
  // 브라우저가 그린 썸네일(webp)을 작업의 썸네일 파일로 저장 (목록 카드 · 내려받기용). 전 것은 지운다.
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/thumb-image$/)) && method === 'POST') {
    const job = await getJob(db, mm[1]);
    if (!job) throw new HttpError(404, '작업이 없습니다.');
    const mime = request.headers.get('Content-Type') || '';
    if (!/^image\/(webp|png|jpeg)$/.test(mime)) throw bad('이미지만 올릴 수 있습니다.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 4 * 1024 * 1024) throw bad('4MB 이하로 올려 주세요.');
    for (const a of (await jobAssets(db, job.id)).filter((a) => a.kind === 'thumb')) await dropAsset(env, a);
    const id = await putAsset(env, job.id, 'thumb', 1, bytes, mime, { source: 'template' }, { w: 1280, h: 720 });
    return json({ id, url: `/studio/a/${id}` });
  }
  if ((mm = m(/^\/api\/studio\/jobs\/([a-f0-9]{20})\/docs\/([a-z_]+)\/versions$/)) && method === 'GET') {
    const { results } = await db.prepare('SELECT version, body, created_at FROM studio_docs WHERE job_id = ? AND kind = ? ORDER BY version DESC LIMIT 20').bind(mm[1], mm[2]).all();
    return json(results);
  }
  throw new HttpError(404, '없는 주소입니다.');
}
function thumbPickFields(d) {
  const o = {};
  if (d.title) o.title = String(d.title).slice(0, 200);
  o.emotion = String(d.emotion || '자동').slice(0, 40);
  o.gesture = String(d.gesture || '자동').slice(0, 40);
  o.badgeName = String(d.badgeName || '').slice(0, 60);
  o.badgeRole = String(d.badgeRole || '').slice(0, 80);
  o.face = /^(emoji:(\d{3}|auto)|asset:[a-f0-9]{24}|person:[^|<>"]{1,80}|)$/.test(d.face || '') ? (d.face || '') : 'emoji:auto';   // person:<이름> = 기사 속 인물 사진을 PC 도우미가 검색
  return o;
}

// ───────────────────────── 공개 주소: 그림 · 슬라이드쇼 ─────────────────────────
export async function studioPublic(request, env, url) {
  const db = env.DB;
  let mm;
  if ((mm = url.pathname.match(/^\/studio\/a\/([a-f0-9]{24})$/))) {
    const a = await db.prepare('SELECT r2_key, mime FROM studio_assets WHERE id = ?').bind(mm[1]).first();
    if (!a) return new Response('없음', { status: 404 });
    const o = await env.FILES.get(a.r2_key);
    if (!o) return new Response('없음', { status: 404 });
    return new Response(o.body, { headers: { 'Content-Type': a.mime, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if ((mm = url.pathname.match(/^\/studio\/show\/([a-f0-9]{20})(\/save)?$/))) {
    const job = await getJob(db, mm[1]);
    if (!job) return new Response('없는 작업입니다.', { status: 404 });
    if (mm[2]) {
      if (request.method !== 'POST') return new Response('POST', { status: 405 });
      let d; try { d = await request.json(); } catch { return json({ error: 'JSON' }, 400); }
      if (!Array.isArray(d.texts) || d.texts.length > 20) return json({ error: '형식' }, 400);
      const v = await saveDoc(db, job.id, 'show_texts', d.texts.map((t) => String(t).slice(0, 20000)));
      return json({ ok: true, version: v });
    }
    const texts = docJson(await latestDoc(db, job.id, 'show_texts')) || splitBlocks((await latestDoc(db, job.id, 'articles'))?.body) || [];
    const slides = (await jobAssets(db, job.id)).filter((a) => a.kind === 'slide');
    const imgs = texts.map((_, i) => { const a = slides.filter((s) => s.idx === i + 1).pop(); return a ? `/studio/a/${a.id}` : ''; });
    return new Response(showHtml(job, texts, imgs), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return null;
}

// 04_PPTMaker.md 스펙 그대로: 왼쪽 1400px 슬라이드 · 오른쪽 500px 대본 · 큰 페이지 버튼 · 타이머 · 좌우 커서 · 본문 편집 · Ctrl+S 저장(서버로)
function showHtml(job, texts, imgs) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const data = JSON.stringify({ texts, imgs, id: job.id }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>${esc(job.title || '슬라이드쇼')}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:#e9e9e9}
body{font-family:"Pretendard Variable",Pretendard,"Malgun Gothic","Noto Sans KR",sans-serif}
.stage{display:flex;align-items:flex-start;gap:0}
.left{width:1400px;flex:0 0 1400px}
.slide-frame{width:1400px;height:787.5px;background:#000;overflow:hidden}
.slide-frame img{width:1400px;height:787.5px;display:block;object-fit:cover;border-radius:0}
.slide-frame .none{width:1400px;height:787.5px;display:grid;place-items:center;color:#777;font-size:28px}
.right{width:500px;flex:0 0 500px}
.textbox{width:500px;height:787.5px;overflow-y:auto;background:#fff;border-left:1px solid #d0d0d0;padding:26px 28px;font-size:19pt;font-weight:600;line-height:1.55;color:#111;outline:none;white-space:pre-wrap;word-break:keep-all}
.nav{width:500px;margin-top:10px;display:flex;gap:12px;align-items:center;justify-content:center}
.nav button{font-family:inherit;font-size:26px;font-weight:700;padding:14px 30px;border:1px solid #bbb;border-radius:10px;background:#fff;cursor:pointer}
.nav button:disabled{opacity:.35;cursor:default}
.nav .page{font-size:26px;font-weight:700;color:#444;min-width:110px;text-align:center}
.timer{width:500px;margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:8px}
.timer .disp{font-size:60px;font-weight:700;line-height:1;color:#111;font-variant-numeric:tabular-nums;letter-spacing:1px}
.timer .btns{display:flex;gap:12px}
.timer .btns button{font-family:inherit;font-size:20px;font-weight:700;padding:8px 22px;border:1px solid #bbb;border-radius:10px;background:#fff;cursor:pointer}
.savemsg{width:500px;margin-top:6px;min-height:18px;text-align:center;font-size:14px;color:#2f7d32}
</style>
</head>
<body>
<div class="stage">
  <div class="left"><div class="slide-frame" id="frame"></div></div>
  <div class="right">
    <div class="textbox" id="textbox" contenteditable="true" spellcheck="false"></div>
    <div class="nav"><button id="btnPrev" type="button">◀ 이전</button><div class="page" id="pageLabel"></div><button id="btnNext" type="button">다음 ▶</button></div>
    <div class="timer"><div class="disp" id="timerDisp">00:00</div><div class="btns"><button id="btnTimer" type="button">시작</button><button id="btnReset" type="button">리셋</button></div></div>
    <div class="savemsg" id="saveMsg"></div>
  </div>
</div>
<script id="data" type="application/json">${data}</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);let texts=D.texts,N=texts.length,cur=0;
const frame=document.getElementById('frame'),box=document.getElementById('textbox'),lbl=document.getElementById('pageLabel'),bPrev=document.getElementById('btnPrev'),bNext=document.getElementById('btnNext'),msg=document.getElementById('saveMsg');
function commitEdit(){texts[cur]=box.innerText.replace(/\\n{3,}/g,'\\n\\n');}
function show(i){cur=i;frame.innerHTML=D.imgs[i]?'<img src="'+D.imgs[i]+'" alt="">':'<div class="none">슬라이드 '+(i+1)+' 그림 없음</div>';box.innerText=texts[i]||'';box.scrollTop=0;lbl.textContent=(i+1)+' / '+N;bPrev.disabled=i===0;bNext.disabled=i===N-1;}
bPrev.addEventListener('click',()=>{if(cur>0){commitEdit();show(cur-1);}});
bNext.addEventListener('click',()=>{if(cur<N-1){commitEdit();show(cur+1);}});
box.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain'));});
box.addEventListener('input',commitEdit);
const tDisp=document.getElementById('timerDisp'),tBtn=document.getElementById('btnTimer');let tSec=0,tId=null;
const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
tBtn.addEventListener('click',()=>{if(tId){clearInterval(tId);tId=null;tBtn.textContent='시작';}else{tId=setInterval(()=>{tSec++;tDisp.textContent=fmt(tSec);},1000);tBtn.textContent='정지';}});
document.getElementById('btnReset').addEventListener('click',()=>{if(tId){clearInterval(tId);tId=null;tBtn.textContent='시작';}tSec=0;tDisp.textContent='00:00';});
let dir=0,raf=null;function stepScroll(){if(dir){box.scrollTop+=dir*14;raf=requestAnimationFrame(stepScroll);}else raf=null;}
document.addEventListener('keydown',e=>{const inBox=document.activeElement===box;if(e.key==='ArrowLeft'&&!inBox)bPrev.click();else if(e.key==='ArrowRight'&&!inBox)bNext.click();else if(e.key==='ArrowUp'&&!inBox){e.preventDefault();dir=-1;if(!raf)stepScroll();}else if(e.key==='ArrowDown'&&!inBox){e.preventDefault();dir=1;if(!raf)stepScroll();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();commitEdit();fetch(location.pathname+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts})}).then(r=>r.json()).then(r=>{msg.textContent=r.ok?'저장됨 (버전 '+r.version+') '+new Date().toLocaleTimeString():'저장 실패';setTimeout(()=>msg.textContent='',3000);}).catch(()=>{msg.textContent='저장 실패';});}});
document.addEventListener('keyup',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown')dir=0;});
show(0);
</script>
</body>
</html>`;
}
