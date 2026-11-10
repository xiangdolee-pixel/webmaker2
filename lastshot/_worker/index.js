// lastshot — 게임 화면은 정적 파일. 여기서는 계정(자체 가입 · 로그인, 쿠키 ls_sess) · 진행 저장 · 랭킹(난이도별 1~50위)
//   POST /api/signup { login_id, nickname, password, remember?, level?, best?, diff? } → me   (level… = 이 브라우저에서 이미 하던 진행을 계정의 시작 진행으로)
//   POST /api/login  { login_id, password, remember? }                     → me   (remember 기본 켜짐: 쿠키 180일 · 끄면 브라우저 닫을 때까지 + 세션 1일)
//   POST /api/logout                                                        → { ok }
//   GET  /api/me                                                            → { nickname, level, best, diff, run, fail_lv, fails, state }  (세션 없으면 401)
//   PUT  /api/progress { level, best, diff, run, fail_lv, fails, state }   → me  (로그인 필수. state = 판 중간 스냅샷 JSON 문자열(100KB 상한, 넘으면 그 칸은 저장 안 함) · null 이면 지움 · 안 보내면 그대로)
//   GET  /api/rank?diff=easy|normal|hard         → { diff, top: [{ id, name, score, level }] }  (공개. 점수 높은 차례, 같으면 먼저 넣은 사람)
//   POST /api/rank { score, level, diff }        → { id, rank, diff, top }  (로그인 필수, 이름 = 계정 닉네임)
//   diff 가 세 값 밖이면 normal. 그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
//   바인딩: DB(D1 lastshot, 표는 schema.sql). 비밀번호 = PBKDF2(SHA-256, 100,000회, salt 16바이트). 세션 = 랜덤 32바이트 토큰, 180일.
import site from '../../xim/_worker/site-worker.js';

const TOP = 50;               // 난이도마다 상위 50 만 남긴다
const MAX_SCORE = 50000000;   // 말이 안 되는 점수는 받지 않는다
const DIFFS = ['easy', 'normal', 'hard'];
const diffOf = (v) => (DIFFS.includes(v) ? v : 'normal');
const SESS_DAYS = 180, PBKDF2_ITER = 100000;   // Workers 의 PBKDF2 한도가 100,000 회
const COOKIE = 'ls_sess';
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const top = async (db, diff) => (await db.prepare('SELECT id, name, score, level FROM scores WHERE diff = ? ORDER BY score DESC, id LIMIT ?').bind(diff, TOP).all()).results;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));
const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
const clampLv = (v, d = 1) => Math.max(1, Math.min(9999, Math.floor(Number(v)) || d));
const ipOf = (request) => request.headers.get('CF-Connecting-IP') || '';

async function readJson(request) {
  // 다른 사이트 폼으로 몰래 보내지 못하게 JSON 만
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw json({ error: 'JSON 으로 보내 주세요.' }, 400);
  try { return await request.json(); } catch { throw json({ error: '내용을 읽을 수 없습니다.' }, 400); }
}
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
const sameHex = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const STATE_MAX = 100000;
const me = (u) => ({ nickname: u.nickname, level: u.level, best: u.best, diff: diffOf(u.diff), run: Math.max(0, u.run | 0), fail_lv: u.fail_lv | 0, fails: u.fails | 0, state: u.state || null });

/* ── 세션 ── */
const cookieToken = (request) => { const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)ls_sess=([a-f0-9]{64})/); return m ? m[1] : ''; };
async function userOf(db, request) {
  const token = cookieToken(request);
  if (!token) return null;
  const u = await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?').bind(token, Date.now()).first();
  return u || null;
}
async function newSession(db, userId, remember) {   // 로그인 유지(기본): 180일. 끄면 만료 없는 세션 쿠키(브라우저 닫으면 끝) + 표에는 1일
  const token = hex(crypto.getRandomValues(new Uint8Array(32))), days = remember ? SESS_DAYS : 1;
  await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, userId, Date.now() + days * 86400000).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();   // 지난 세션 정리
  return { 'Set-Cookie': `${COOKIE}=${token}; Path=/;${remember ? ` Max-Age=${SESS_DAYS * 86400};` : ''} HttpOnly; Secure; SameSite=Lax` };
}
const rememberOf = (v) => v.remember !== false && v.remember !== 0 && v.remember !== 'false';   // 안 보내면 켜진 것으로
const clearCookie = { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` };

/* ── 계정 ── */
function checkLoginId(v) {
  const id = String(v ?? '').trim().toLowerCase();
  if (id.length < 3 || id.length > 40) return { error: '아이디(또는 이메일)는 3~40자로 넣어 주세요.' };
  if (!/^[a-z0-9._@+-]+$/.test(id)) return { error: '아이디는 영문 · 숫자 · . _ @ + - 만 쓸 수 있어요.' };
  return { id };
}
function checkPw(v) {
  const pw = String(v ?? '');
  if (pw.length < 6) return '비밀번호는 6자 이상으로 넣어 주세요.';
  if (pw.length > 72) return '비밀번호가 너무 길어요(72자까지).';
  return '';
}
async function tooManyFails(db, ip) {   // 같은 곳에서 로그인 실패가 1분에 10번 넘으면 잠시 막는다
  const r = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE ip = ? AND at > ?').bind(ip, Date.now() - 60000).first();
  return r.n >= 10;
}
async function noteFail(db, ip) {
  await db.prepare('INSERT INTO login_fails (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
  await db.prepare('DELETE FROM login_fails WHERE at < ?').bind(Date.now() - 3600000).run();
}
async function signup(request, env) {
  const db = env.DB, v = await readJson(request), ip = ipOf(request);
  const { id, error } = checkLoginId(v.login_id);
  if (error) return json({ error }, 400);
  const nickname = cleanName(v.nickname);
  if (!nickname) return json({ error: '닉네임을 넣어 주세요(10자까지).' }, 400);
  const pwErr = checkPw(v.password);
  if (pwErr) return json({ error: pwErr }, 400);
  if (await tooManyFails(db, ip)) return json({ error: '잠시 뒤에 다시 해 주세요.' }, 429);
  if (await db.prepare('SELECT id FROM users WHERE login_id = ?').bind(id).first()) { await noteFail(db, ip); return json({ error: '이미 쓰고 있는 아이디예요. 로그인 탭에서 들어와 주세요.' }, 409); }
  const salt = crypto.getRandomValues(new Uint8Array(16)), hash = await pbkdf2(String(v.password), salt);
  const level = clampLv(v.level), best = Math.max(level, clampLv(v.best)), diff = diffOf(v.diff), now = Date.now();
  let r;
  try { r = await db.prepare('INSERT INTO users (login_id, nickname, pw_hash, pw_salt, level, best, diff, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, nickname, hash, hex(salt), level, best, diff, now, now).run(); }
  catch (e) { if (/UNIQUE/i.test(String(e))) return json({ error: '이미 쓰고 있는 아이디예요. 로그인 탭에서 들어와 주세요.' }, 409); throw e; }
  const headers = await newSession(db, r.meta.last_row_id, rememberOf(v));
  return json(me({ nickname, level, best, diff }), 200, headers);
}
async function login(request, env) {
  const db = env.DB, v = await readJson(request), ip = ipOf(request);
  const { id, error } = checkLoginId(v.login_id);
  if (error) return json({ error }, 400);
  if (await tooManyFails(db, ip)) return json({ error: '로그인 시도가 너무 많아요. 1분 뒤에 다시 해 주세요.' }, 429);
  const u = await db.prepare('SELECT * FROM users WHERE login_id = ?').bind(id).first();
  const ok = u && sameHex(await pbkdf2(String(v.password ?? ''), unhex(u.pw_salt)), u.pw_hash);
  if (!ok) { await noteFail(db, ip); return json({ error: '아이디 또는 비밀번호가 맞지 않아요.' }, 401); }
  await db.prepare('UPDATE users SET last_at = ? WHERE id = ?').bind(Date.now(), u.id).run();
  const headers = await newSession(db, u.id, rememberOf(v));
  return json(me(u), 200, headers);
}
async function logout(request, env) {
  const token = cookieToken(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, clearCookie);
}
async function progress(request, env, u) {
  const v = await readJson(request);
  const level = clampLv(v.level, u.level), best = Math.max(u.best, level, clampLv(v.best, 1)), diff = diffOf(v.diff ?? u.diff);
  const num = (x, d) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(2147483647, Math.floor(Number(x)))) : d);
  const run = num(v.run, u.run), fail_lv = num(v.fail_lv, u.fail_lv), fails = Math.min(99, num(v.fails, u.fails));
  let state = u.state;
  if (v.state === null) state = null;
  else if (typeof v.state === 'string' && v.state.length <= STATE_MAX) state = v.state;   // 너무 크면 그 칸은 그대로 둔다
  await env.DB.prepare('UPDATE users SET level = ?, best = ?, diff = ?, run = ?, fail_lv = ?, fails = ?, state = ?, last_at = ? WHERE id = ?').bind(level, best, diff, run, fail_lv, fails, state, Date.now(), u.id).run();
  return json(me({ nickname: u.nickname, level, best, diff, run, fail_lv, fails, state }));
}

/* ── 랭킹 ── */
async function rank(request, env, url, u) {
  const db = env.DB;
  if (request.method === 'GET') { const diff = diffOf(url.searchParams.get('diff')); return json({ diff, top: await top(db, diff) }); }
  if (request.method !== 'POST') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  if (!u) return json({ error: '로그인해야 랭킹에 올릴 수 있어요.' }, 401);
  const v = await readJson(request);
  const name = cleanName(u.nickname) || '이름없음';
  const score = Math.floor(Number(v.score));
  const level = clampLv(v.level);
  const diff = diffOf(v.diff);
  if (!(score > 0 && score <= MAX_SCORE)) return json({ error: '점수가 올바르지 않습니다.' }, 400);
  const ip = ipOf(request);
  // 같은 곳에서 너무 자주 넣지 못하게 (1분에 5번)
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip = ? AND created_at > ?').bind(ip, Date.now() - 60000).first();
  if (recent.n >= 5) return json({ error: '잠시 뒤에 다시 넣어 주세요.' }, 429);
  // 그 난이도 50위 안에 드는 점수만 남긴다
  const list = await top(db, diff);
  if (list.length >= TOP && score <= list[list.length - 1].score) return json({ error: `아쉽게도 ${TOP}위 안에 들지 못했어요.`, diff, top: list }, 409);
  const r = await db.prepare('INSERT INTO scores (name, score, level, diff, user_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(name, score, level, diff, u.id, ip, Date.now()).run();
  const id = r.meta.last_row_id;
  // 그 난이도에서 50위 밖으로 밀린 기록 정리
  await db.prepare('DELETE FROM scores WHERE diff = ? AND id NOT IN (SELECT id FROM scores WHERE diff = ? ORDER BY score DESC, id LIMIT ?)').bind(diff, diff, TOP).run();
  const now = await top(db, diff);
  return json({ id, rank: now.findIndex((x) => x.id === id) + 1, diff, top: now });
}

async function api(request, env, url) {
  const p = url.pathname, m = request.method;
  if (p === '/api/rank') return rank(request, env, url, m === 'POST' ? await userOf(env.DB, request) : null);
  if (p === '/api/signup' && m === 'POST') return signup(request, env);
  if (p === '/api/login' && m === 'POST') return login(request, env);
  if (p === '/api/logout' && m === 'POST') return logout(request, env);
  if (p === '/api/me' || p === '/api/progress') {
    const u = await userOf(env.DB, request);
    if (!u) return json({ error: '로그인이 필요해요.' }, 401, cookieToken(request) ? clearCookie : {});
    if (p === '/api/me' && m === 'GET') return json(me(u));
    if (p === '/api/progress' && m === 'PUT') return progress(request, env, u);
  }
  return json({ error: '지원하지 않는 요청입니다.' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (e) { if (e instanceof Response) return e; console.error(e); return json({ error: '서버 오류가 났습니다.' }, 500); }
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
