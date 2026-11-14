// 길성경 장 듣기 음성 만들기 (2026-11-14)
//   node roadbible/_dev/make-audio.mjs 창세기/1 잠언/1-31
//   → '내 목소리'(clone)에 작업을 넣고([길성경] 제목 = 자동 삭제 안 됨), 다 되면 받아서
//     -16 LUFS(loudnorm 2패스) · Opus 20k 모노 webm 으로 roadbible/assets/audio/<이름>.webm 에 둔다.
//   첫 줄은 장 이름을 한글 수사로: "창세기 일장." / 시편만 "시편 일편."
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..');
const SEC = JSON.parse(fs.readFileSync(path.join(ROOT, '_pc', 'clone', 'secrets.json'), 'utf8'));
const API = SEC.worker_url.replace(/\/$/, '');
const H = { 'X-Agent-Token': SEC.agent_token, 'Content-Type': 'application/json' };
const OUT = path.join(ROOT, 'roadbible', 'assets', 'audio');
const SLUG = { 창세기: 'genesis', 잠언: 'proverbs', 시편: 'psalms', 전도서: 'ecclesiastes', 아가: 'song', 로마서: 'romans' };
const log = (...a) => console.log(new Date().toLocaleTimeString('ko-KR'), ...a);

const src = fs.readFileSync(path.join(ROOT, 'roadbible', 'bible-data.js'), 'utf8');
const win = {}; new Function('window', src)(win);   // bible-data.js 는 window.BIBLE_TEXT = … 여러 줄
const BIBLE = win.BIBLE_TEXT;

// 한글 수사(1~999): 1 일, 10 십, 11 십일, 20 이십, 100 백, 150 백오십
const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
function sino(n) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  return (h ? (h > 1 ? D[h] : '') + '백' : '') + (t ? (t > 1 ? D[t] : '') + '십' : '') + D[o];
}

const targets = [];
for (const a of process.argv.slice(2)) {
  const [book, range] = a.split('/');
  const [s, e] = range.split('-').map(Number);
  for (let c = s; c <= (e || s); c++) targets.push({ book, chap: c });
}

async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: H, body: body && JSON.stringify(body), signal: AbortSignal.timeout(p.startsWith('/audio/') ? 900000 : 120000) });   // 음성 원본(10MB 안팎)은 넉넉히   // 걸려서 멈추지 않게
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.headers.get('content-type')?.includes('json') ? r.json() : r;
}

// 1) 작업 넣기 (이미 만든 파일이 있으면 건너뜀). RESUME=<audio-jobs-….json> 이면 새로 넣지 않고 그 작업들을 이어서 받는다
const jobs = process.env.RESUME ? JSON.parse(fs.readFileSync(process.env.RESUME, 'utf8')).filter((j) => !fs.existsSync(path.join(OUT, `${j.name}.webm`))) : [];
for (const t of process.env.RESUME ? [] : targets) {
  const name = `${SLUG[t.book]}-${t.chap}`;
  if (fs.existsSync(path.join(OUT, `${name}.webm`)) && !process.env.FORCE) { log('있음, 건너뜀', name); continue; }
  const verses = (BIBLE[`${t.book}/${t.chap}`] || []).filter(Boolean).map((v) => v.replace(/[⟪⟫]/g, ''));
  if (!verses.length) { log('본문 없음', t.book, t.chap); continue; }
  const head = `${t.book} ${sino(t.chap)}${t.book === '시편' ? '편' : '장'}.`;
  const text = `${head}\n\n${verses.join('\n')}`;
  const { job } = await call('POST', '/api/jobs', { text, speed: 1, video: false });
  jobs.push({ ...t, name, id: job.id, head });
  log('넣음', name, job.id, head, `${text.length}자`);
}
if (!process.env.RESUME) fs.writeFileSync(path.join(OUT, '..', '..', '_dev', `audio-jobs-${Date.now()}.json`), JSON.stringify(jobs, null, 2));
// 제목을 [길성경] … 으로 — clone 의 자동 삭제(purgeOld)에서 빠진다
if (jobs.length && !process.env.RESUME) {
  const sql = jobs.map((j) => `UPDATE jobs SET title='[길성경] ${j.book} ${j.chap}${j.book === '시편' ? '편' : '장'}' WHERE id='${j.id}';`).join(' ');
  const f = path.join(tmpdir(), 'rb-audio-title.sql'); fs.writeFileSync(f, sql);
  execFileSync('node', ['deploy.mjs', '--wrangler', 'd1', 'execute', 'clone', '--remote', '--file', f, '-y'], { cwd: ROOT, stdio: 'ignore', shell: true });
  log('제목 [길성경] 으로 바꿈', jobs.length);
}

// 2) 다 되는 대로 받아서 압축
const tmp = fs.mkdtempSync(path.join(tmpdir(), 'rb-audio-'));
const left = new Set(jobs.map((j) => j.id));
while (left.size) {
  for (const j of jobs) {
    if (!left.has(j.id)) continue;
    let job; try { ({ job } = await call('GET', '/api/jobs/' + j.id)); } catch (e) { log('확인 실패(다음에 다시)', j.name, e.message); continue; }
    if (job.status === 'failed') { log('실패', j.name, job.error || ''); left.delete(j.id); continue; }
    if (job.status !== 'done') continue;
    try {
    const wav = path.join(tmp, `${j.name}.wav`);
    // 원본 받기는 curl 로(끊긴 연결에서 몇 분씩 매달리던 것 — 2026-11-14): 5분 제한 · 3번 다시
    execFileSync('curl', ['-sS', '-f', '--retry', '3', '--retry-all-errors', '-m', '300', '-H', `X-Agent-Token: ${SEC.agent_token}`, '-o', wav, `${API}/audio/${j.id}.wav`]);
    const err = (() => { try { return execFileSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { return String(e.stderr || ''); } })();
    let jn = {}; try { jn = JSON.parse((err.match(/\{[\s\S]*?\}/g) || []).pop()); } catch { /* 1패스로 */ }
    const af = jn.input_i ? `loudnorm=I=-16:TP=-1.5:LRA=7:measured_I=${jn.input_i}:measured_TP=${jn.input_tp}:measured_LRA=${jn.input_lra}:measured_thresh=${jn.input_thresh}:offset=${jn.target_offset}:linear=true` : 'loudnorm=I=-16:TP=-1.5:LRA=7';
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', af, '-ar', '48000', '-ac', '1', '-c:a', 'libopus', '-b:a', '20k', '-application', 'audio', '-f', 'webm', path.join(OUT, `${j.name}.webm.part`)]);
    fs.renameSync(path.join(OUT, `${j.name}.webm.part`), path.join(OUT, `${j.name}.webm`));   // 다 만든 뒤에만 이름을 바꿔 반쯤 된 파일이 남지 않게
    fs.unlinkSync(wav);
    left.delete(j.id);
    log('완료', j.name, `${Math.round(fs.statSync(path.join(OUT, `${j.name}.webm`)).size / 1024)}KB`, `남은 ${left.size}`);
    } catch (e) { log('받기 · 압축 실패(다음에 다시)', j.name, e.message); }   // 한 장이 실패해도 전체가 멈추지 않게
  }
  if (left.size) await new Promise((r) => setTimeout(r, 30000));
}
log('모두 끝');
