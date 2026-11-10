// clone — 내 목소리 읽어주기 (Worker)
//   화면(정적 파일)은 ASSETS 가, /api/* 와 /audio/* 는 이 Worker 가 맡는다.
//   음성 생성은 Cloudflare 가 하지 않는다 — 사용자 PC 의 처리기(D:\ws\clone\agent\agent.py)가 대기열(D1)을 가져가
//   내 목소리 모델(GPT-SoVITS)로 만들고 음량을 고르게 맞춘 뒤 결과 WAV 를 올린다(R2). PC 가 꺼져 있으면 켜질 때 처리.
//   비밀값(wrangler secret): CLONE_PASS(화면 로그인 비밀번호) · AGENT_TOKEN(PC 처리기 인증)
//
//   화면 API(쿠키 clone_sess):  POST /api/login {pass} · POST /api/logout · GET /api/me
//     GET /api/jobs · POST /api/jobs {text, speed?} · GET /api/jobs/:id · DELETE /api/jobs/:id · POST /api/jobs/:id/retry
//     GET /audio/:id.wav (Range 지원)
//   처리기 API(헤더 X-Agent-Token):  POST /api/agent/claim {info} → 가장 오래된 대기 작업 하나(없으면 null)
//     POST /api/agent/heartbeat · PUT /api/agent/jobs/:id/result?seconds&lufs&lra&tp&sentences&engine (본문 = wav) · POST /api/agent/jobs/:id/fail {error}

const MAX_CHARS = 6000;
const STALE_MS = 60 * 60 * 1000; // running 인 채 1시간 지나면 다시 대기열로(PC 가 중간에 꺼진 경우)
const COOKIE = 'clone_sess';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const now = () => Date.now();

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const sameText = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const cookieOf = (request, name) => (request.headers.get('Cookie') || '').split(/;\s*/).map((c) => c.split('=')).find((c) => c[0] === name)?.[1] || '';

async function sessionToken(env) { return hmac(env.CLONE_PASS, 'clone-session-v1'); }
async function requireUser(request, env) {
  // xim 이 서비스 바인딩으로 대신 부를 때는 처리기 토큰(X-Agent-Token)으로 통과 — xim 쪽에서 이미 운영자 로그인을 확인했다
  const agent = request.headers.get('X-Agent-Token') || '';
  if (agent && env.AGENT_TOKEN && sameText(agent, env.AGENT_TOKEN)) return;
  if (!env.CLONE_PASS) throw new HttpError(503, '비밀번호(CLONE_PASS)가 아직 설정되지 않았습니다.');
  const tok = cookieOf(request, COOKIE);
  if (!tok || !sameText(tok, await sessionToken(env))) throw new HttpError(401, '로그인이 필요합니다.');
}
function requireAgent(request, env) {
  if (!env.AGENT_TOKEN) throw new HttpError(503, '처리기 토큰(AGENT_TOKEN)이 아직 설정되지 않았습니다.');
  const t = request.headers.get('X-Agent-Token') || '';
  if (!t || !sameText(t, env.AGENT_TOKEN)) throw new HttpError(401, '처리기 인증 실패');
}
async function body(request) { try { return (await request.json()) || {}; } catch { throw new HttpError(400, 'JSON 본문이 필요합니다.'); } }
const titleOf = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 160); // 목록 제목 = 원고 앞부분(전체는 /text)
const newId = () => { const t = new Date(); const d = `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`; return `${d}-${crypto.randomUUID().slice(0, 8)}`; };
// 사자왕 영상 1초를 만드는 데 걸린 초(최근 10건 중간값). 기본 6(2026-11-10 GTX 1070 측정 전 어림)
async function videoPace(db) {
  const { results } = await db.prepare("SELECT seconds, done_at, video_at FROM jobs WHERE video_status = 'done' AND video_at > done_at AND seconds > 1 ORDER BY video_at DESC LIMIT 10").all();
  // 마이크 가림 방식(2026-11-10)은 음성 1초당 0.1~0.5초면 끝난다(립싱크 때는 6~12초였다)
  const v = results.map((r) => (r.video_at - r.done_at) / 1000 / r.seconds).filter((x) => x > 0.02 && x < 60).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0.5;
}
const JOB_COLS = 'id, created_at, started_at, done_at, status, title, chars, speed, seconds, lufs, lra, tp, sentences, engine, error, attempts, video, video_status, video_at, video_error';

async function agentStatus(db) {
  const row = await db.prepare('SELECT seen_at, info FROM agent WHERE id = ?').bind('pc').first();
  const online = !!row && now() - row.seen_at < 90 * 1000;
  return { online, seen_at: row?.seen_at || null, info: row?.info || '' };
}
// 글자당 걸리는 시간(초) — 최근 완료 10건의 중간값. 화면의 "예상 시간" 에 쓴다. 기록이 없으면 0.3초/자.
async function pace(db) {
  const { results } = await db.prepare("SELECT chars, started_at, done_at FROM jobs WHERE status = 'done' AND started_at IS NOT NULL AND done_at > started_at AND chars > 0 ORDER BY done_at DESC LIMIT 10").all();
  const v = results.map((r) => (r.done_at - r.started_at) / 1000 / r.chars).sort((a, b) => a - b);
  return v.length ? Math.max(0.05, Math.min(3, v[Math.floor(v.length / 2)])) : 0.3;
}
async function touchAgent(db, info) {
  await db.prepare("INSERT INTO agent (id, seen_at, info) VALUES ('pc', ?, ?) ON CONFLICT(id) DO UPDATE SET seen_at = excluded.seen_at, info = CASE WHEN excluded.info = '' THEN agent.info ELSE excluded.info END").bind(now(), String(info || '').slice(0, 200)).run();
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  const db = env.DB;

  // ───── 화면 로그인 ─────
  if (path === '/api/login' && method === 'POST') {
    if (!env.CLONE_PASS) throw new HttpError(503, '비밀번호(CLONE_PASS)가 아직 설정되지 않았습니다.');
    const { pass } = await body(request);
    const ok = sameText(await hmac('clone-login', String(pass ?? '').slice(0, 200)), await hmac('clone-login', env.CLONE_PASS));
    if (!ok) { await new Promise((r) => setTimeout(r, 800)); throw new HttpError(401, '비밀번호가 맞지 않습니다.'); }
    const tok = await sessionToken(env);
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${tok}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Lax` });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  if (path === '/api/me' && method === 'GET') {
    try { await requireUser(request, env); } catch (e) { if (e.status === 401) return json({ ok: false }); throw e; }
    return json({ ok: true, agent: await agentStatus(db), max_chars: MAX_CHARS });
  }

  // ───── PC 처리기 ─────
  if (path.startsWith('/api/agent/')) {
    requireAgent(request, env);
    if (path === '/api/agent/heartbeat' && method === 'POST') { const { info } = await body(request).catch(() => ({})); await touchAgent(db, info); return json({ ok: true }); }
    if (path === '/api/agent/claim' && method === 'POST') {
      const { info } = await body(request).catch(() => ({}));
      await touchAgent(db, info);
      // 1시간 넘게 running 인 것은 PC 가 중간에 꺼진 것 → 다시 대기열로
      await db.prepare("UPDATE jobs SET status = 'queued', started_at = NULL WHERE status = 'running' AND started_at < ?").bind(now() - STALE_MS).run();
      const job = await db.prepare(`UPDATE jobs SET status = 'running', started_at = ?1, attempts = attempts + 1, error = NULL
        WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) RETURNING id, text, speed, attempts, video, studio`).bind(now()).first();
      if (job && job.studio) { try { job.studio = JSON.parse(job.studio); } catch { job.studio = null; } }
      return json({ job: job || null });
    }
    const m = path.match(/^\/api\/agent\/jobs\/([\w-]+)\/(result|fail|timings|video|video-fail)$/);
    if (m && m[2] === 'result' && method === 'PUT') {
      const id = m[1];
      const job = await db.prepare('SELECT id, status FROM jobs WHERE id = ?').bind(id).first();
      if (!job) throw new HttpError(404, '없는 작업');
      const q = (k) => { const v = parseFloat(url.searchParams.get(k)); return Number.isFinite(v) ? v : null; };
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength < 1000) throw new HttpError(400, '음성 파일이 비어 있습니다.');
      await env.AUDIO.put(`audio/${id}.wav`, bytes, { httpMetadata: { contentType: 'audio/wav' } });
      await db.prepare(`UPDATE jobs SET status = 'done', done_at = ?, seconds = ?, lufs = ?, lra = ?, tp = ?, sentences = ?, engine = ?, error = NULL WHERE id = ?`)
        .bind(now(), q('seconds'), q('lufs'), q('lra'), q('tp'), q('sentences'), (url.searchParams.get('engine') || '').slice(0, 80), id).run();
      await touchAgent(db, '');
      return json({ ok: true });
    }
    if (m && m[2] === 'timings' && method === 'PUT') { // 문장별 시작 · 끝 시각 [{s, e, t}] — 화면에서 읽는 문장 표시
      const { timings } = await body(request).catch(() => ({}));
      if (!Array.isArray(timings)) throw new HttpError(400, 'timings 배열이 필요합니다.');
      const clean = timings.slice(0, 400).map((x) => ({ s: +x.s || 0, e: +x.e || 0, t: String(x.t || '').slice(0, 400) }));
      await db.prepare('UPDATE jobs SET timings = ? WHERE id = ?').bind(JSON.stringify(clean), m[1]).run();
      return json({ ok: true });
    }
    if (m && m[2] === 'fail' && method === 'POST') {
      const { error } = await body(request).catch(() => ({}));
      await db.prepare("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?").bind(String(error || '알 수 없는 오류').slice(0, 500), m[1]).run();
      await touchAgent(db, '');
      return json({ ok: true });
    }
    // 사자왕 영상(립싱크 mp4) — 음성 결과 뒤에 올라온다. R2 video/<id>.mp4
    if (m && m[2] === 'video' && method === 'PUT') {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength < 10000) throw new HttpError(400, '영상 파일이 비어 있습니다.');
      await env.AUDIO.put(`video/${m[1]}.mp4`, bytes, { httpMetadata: { contentType: 'video/mp4' } });
      await db.prepare("UPDATE jobs SET video_status = 'done', video_at = ?, video_error = NULL WHERE id = ?").bind(now(), m[1]).run();
      await touchAgent(db, '');
      return json({ ok: true });
    }
    if (m && m[2] === 'video-fail' && method === 'POST') {
      const { error } = await body(request).catch(() => ({}));
      await db.prepare("UPDATE jobs SET video_status = 'failed', video_error = ? WHERE id = ?").bind(String(error || '알 수 없는 오류').slice(0, 500), m[1]).run();
      return json({ ok: true });
    }
    throw new HttpError(404, '없는 주소');
  }

  // ───── 화면 API (로그인 필요) ─────
  if (path.startsWith('/api/') || path.startsWith('/audio/') || path.startsWith('/video/')) await requireUser(request, env);

  if (path === '/api/jobs' && method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 50));
    const { results } = await db.prepare(`SELECT ${JOB_COLS} FROM jobs ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return json({ jobs: results, agent: await agentStatus(db), sec_per_char: await pace(db), video_sec_per_sec: await videoPace(db) });
  }
  if (path === '/api/jobs' && method === 'POST') {
    const { text, speed, video, studio } = await body(request);
    // 스튜디오 영상(2026-11-10): xim 스튜디오 카드 "영상 만들기" → {studio: {job_id, title, slides: [{idx, image, text}]}}. 슬라이드마다 원고를 읽고 1~2초 쉬며 넘어가는 1280x720 자막 영상
    let st = null, t;
    if (studio && Array.isArray(studio.slides) && studio.slides.length) {
      const slides = studio.slides.map((s, i) => ({ idx: +s.idx || i + 1, image: String(s.image || ''), text: String(s.text || '').replace(/\r\n?/g, '\n').trim() })).filter((s) => s.text && /^https?:\/\//.test(s.image));
      if (!slides.length) throw new HttpError(400, '슬라이드 그림과 원고가 없습니다.');
      st = { job_id: String(studio.job_id || '').slice(0, 40), title: String(studio.title || '').slice(0, 200), slides };
      t = slides.map((s) => s.text).join('\n\n');
      if (t.length > MAX_CHARS * 4) throw new HttpError(400, `원고가 너무 깁니다(${t.length.toLocaleString('ko-KR')}자).`);
    } else {
      t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
      if (!t) throw new HttpError(400, '읽을 글을 넣어 주세요.');
      if (t.length > MAX_CHARS) throw new HttpError(400, `한 번에 ${MAX_CHARS.toLocaleString('ko-KR')}자까지만 됩니다. (지금 ${t.length.toLocaleString('ko-KR')}자)`);
    }
    const sp = Math.min(1.3, Math.max(0.8, parseFloat(speed) || 1));
    const id = newId();
    const wantVideo = st || video === true || video === 1 || video === '1' || video === 'on' ? 1 : 0;   // 사자왕 영상도 함께(음성 뒤에 만들어짐)
    const title = st ? `[스튜디오 영상] ${st.title || titleOf(t)}` : titleOf(t);
    await db.prepare('INSERT INTO jobs (id, created_at, status, title, text, chars, speed, video, video_status, studio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, now(), 'queued', title, t, t.length, sp, wantVideo, wantVideo ? 'pending' : null, st ? JSON.stringify(st) : null).run();
    const job = await db.prepare(`SELECT ${JOB_COLS} FROM jobs WHERE id = ?`).bind(id).first();
    return json({ job, agent: await agentStatus(db) }, 201);
  }
  let m = path.match(/^\/api\/jobs\/([\w-]+)(?:\/(retry|text))?$/);
  if (m) {
    const id = m[1];
    if (!m[2] && method === 'GET') { const job = await db.prepare(`SELECT ${JOB_COLS} FROM jobs WHERE id = ?`).bind(id).first(); if (!job) throw new HttpError(404, '없는 작업'); return json({ job }); }
    if (m[2] === 'text' && method === 'GET') { const row = await db.prepare('SELECT text, timings FROM jobs WHERE id = ?').bind(id).first(); if (!row) throw new HttpError(404, '없는 작업'); let timings = null; try { timings = row.timings ? JSON.parse(row.timings) : null; } catch { /* 옛 기록 */ } return json({ text: row.text, timings }); }
    if (!m[2] && method === 'DELETE') { await db.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run(); ctx.waitUntil(Promise.all([env.AUDIO.delete(`audio/${id}.wav`), env.AUDIO.delete(`video/${id}.mp4`)])); return json({ ok: true }); }
    if (m[2] === 'retry' && method === 'POST') { await db.prepare("UPDATE jobs SET status = 'queued', started_at = NULL, done_at = NULL, error = NULL, video_status = CASE WHEN video = 1 THEN 'pending' ELSE NULL END, video_at = NULL, video_error = NULL WHERE id = ? AND status IN ('failed', 'done', 'running')").bind(id).run(); const job = await db.prepare(`SELECT ${JOB_COLS} FROM jobs WHERE id = ?`).bind(id).first(); return json({ job }); }
  }
  m = path.match(/^\/audio\/([\w-]+)\.wav$/);
  if (m && (method === 'GET' || method === 'HEAD')) {
    const key = `audio/${m[1]}.wav`;
    const range = request.headers.get('Range');
    const obj = range ? await env.AUDIO.get(key, { range: request.headers }) : await env.AUDIO.get(key);
    if (!obj) throw new HttpError(404, '아직 음성이 없습니다.');
    const h = new Headers({ 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ETag: obj.httpEtag,
      'Content-Disposition': `${url.searchParams.has('dl') ? 'attachment' : 'inline'}; filename="clone-${m[1]}.wav"` });
    if (range && obj.range) {
      const r = obj.range; const start = r.offset ?? 0; const len = r.length ?? (obj.size - start);
      h.set('Content-Range', `bytes ${start}-${start + len - 1}/${obj.size}`); h.set('Content-Length', String(len));
      return new Response(method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
    }
    h.set('Content-Length', String(obj.size));
    return new Response(method === 'HEAD' ? null : obj.body, { status: 200, headers: h });
  }
  // 사자왕 영상(립싱크 mp4) — R2 video/<이름>.mp4, Range 지원(폰 · 브라우저 재생 탐색용). 시험 영상도 여기로 올려 xim 로그인 뒤 본다
  m = path.match(/^\/video\/([\w-]+)\.mp4$/);
  if (m && (method === 'GET' || method === 'HEAD')) {
    const key = `video/${m[1]}.mp4`;
    const range = request.headers.get('Range');
    const obj = range ? await env.AUDIO.get(key, { range: request.headers }) : await env.AUDIO.get(key);
    if (!obj) throw new HttpError(404, '아직 영상이 없습니다.');
    const h = new Headers({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ETag: obj.httpEtag,
      'Content-Disposition': `${url.searchParams.has('dl') ? 'attachment' : 'inline'}; filename="sajawang-${m[1]}.mp4"` });
    if (range && obj.range) {
      const r = obj.range; const start = r.offset ?? 0; const len = r.length ?? (obj.size - start);
      h.set('Content-Range', `bytes ${start}-${start + len - 1}/${obj.size}`); h.set('Content-Length', String(len));
      return new Response(method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
    }
    h.set('Content-Length', String(obj.size));
    return new Response(method === 'HEAD' ? null : obj.body, { status: 200, headers: h });
  }
  if (path.startsWith('/api/')) throw new HttpError(404, '없는 주소');
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try { return await handle(request, env, ctx); } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e); return json({ error: '서버 오류: ' + (e.message || e) }, 500);
    }
  },
};
