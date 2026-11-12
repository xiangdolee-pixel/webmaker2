// 홈페이지 제작 계약서 (사용자 지시 2026-11-12)
//
//   운영자(xim '계약서' 메뉴, 로그인 뒤)   /api/contracts*        만들기 · 고치기 · 지우기, 을 정보 · 사인 그림
//   갑(고객, 로그인 없음)                  sign.plators.com/<5자>  계약서 보기 → 직접 서명 → 완료 → PDF 내려받기
//                                          /api/sign/<5자>         그 화면이 읽고(GET) 서명을 보낸다(POST)
//   (sign 주소를 아직 못 붙였을 때도 시험할 수 있게 xim 주소의 /sign/<5자> 도 같은 화면)
//
//   서명이 끝난 계약서는 글자 · 금액을 고칠 수 없다(서명한 내용 그대로 남게). 서명 때 내용 지문(sha256)을 함께 남긴다.

export const SIGN_HOST = 'sign.plators.com';
const CODE_RE = /^[A-Za-z0-9]{5}$/;
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const EUL_KEY = 'contract_eul';
const EUL_DEFAULT = { name: '박민진', phone: '010-8381-5303', sign: '' };
const MAX_SIGN = 400 * 1024;          // 서명 그림(data URL) 최대 크기
const FAIL_WINDOW = 10 * 60000;       // 없는 계약서 주소를 10분에
const FAIL_MAX = 20;                  //   20번 넘게 두드리면 잠깐 막는다(주소 찍어 보기 방지)

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const now = () => Date.now();
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
const money = (v) => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0); if (n < 0 || n > 10_000_000_000) throw bad('금액을 확인해 주세요.'); return n; };
const dateStr = (v) => { const s = str(v, 10); if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad('계약일을 확인해 주세요.'); return s; };
const pngData = (v) => { const s = String(v ?? ''); if (!s) return ''; if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) throw bad('서명 그림을 읽을 수 없습니다.'); if (s.length > MAX_SIGN) throw bad('서명 그림이 너무 큽니다.'); return s; };

async function sha256(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function newCode() {
  for (;;) {
    const r = crypto.getRandomValues(new Uint8Array(5));
    const c = [...r].map((x) => B62[x % 62]).join('');
    if (/\d/.test(c) && /[A-Za-z]/.test(c)) return c;   // 글자 · 숫자 섞인 것만 (정적 파일 이름과 겹치지 않게)
  }
}
async function getEul(db) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(EUL_KEY).first();
  try { return { ...EUL_DEFAULT, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...EUL_DEFAULT }; }
}
// 서명 때 남기는 내용 지문 — 계약서 글자 · 금액 · 당사자가 그대로인지 확인용
const docHash = (c, eul) => sha256(JSON.stringify([c.code, c.client_name, c.client_phone, c.build_fee, c.yearly_fee, c.contract_date, c.body, eul.name, eul.phone]));

const LIST_COLS = 'id, code, client_name, client_phone, build_fee, yearly_fee, contract_date, status, viewed_at, signed_at, created_at, updated_at';

// ───────── 운영자 API (로그인 확인은 index.js 가 먼저 한다) ─────────
export async function contractsApi(request, env, path, method, readBody, audit) {
  const db = env.DB;
  if (path === '/api/contracts' && method === 'GET') {
    const { results } = await db.prepare(`SELECT ${LIST_COLS} FROM contracts ORDER BY id DESC LIMIT 500`).all();
    const eul = await getEul(db);
    return json({ items: results, eul: { name: eul.name, phone: eul.phone, sign: eul.sign }, host: SIGN_HOST });
  }
  if (path === '/api/contracts' && method === 'POST') {
    const b = await readBody(request);
    const name = str(b.client_name, 60);
    if (!name) throw bad('갑(고객) 이름을 넣어 주세요.');
    const body = str(b.body, 20000);
    if (!body) throw bad('계약서 내용이 비어 있습니다.');
    let code;
    for (let i = 0; i < 8; i++) { code = newCode(); if (!(await db.prepare('SELECT 1 FROM contracts WHERE code = ?').bind(code).first())) break; }
    const t = now();
    const r = await db.prepare(`INSERT INTO contracts (code, client_name, client_phone, build_fee, yearly_fee, contract_date, body, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'wait', ?, ?)`)
      .bind(code, name, str(b.client_phone, 40), money(b.build_fee), money(b.yearly_fee), dateStr(b.contract_date), body, t, t).run();
    await audit('CONTRACT_NEW', name, `sign/${code}`);
    return json({ id: r.meta.last_row_id, code });
  }
  if (path === '/api/contracts/eul' && method === 'PUT') {
    const b = await readBody(request);
    const old = await getEul(db);
    const eul = { name: str(b.name, 60) || old.name, phone: str(b.phone, 40), sign: b.sign === undefined ? old.sign : pngData(b.sign) };
    await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(EUL_KEY, JSON.stringify(eul)).run();
    await audit('CONTRACT_EUL', eul.name, b.sign === undefined ? '정보' : '사인 그림');
    return json({ ok: true });
  }
  const m = path.match(/^\/api\/contracts\/(\d+)$/);
  if (!m) return null;
  const id = +m[1];
  const c = await db.prepare('SELECT * FROM contracts WHERE id = ?').bind(id).first();
  if (!c) throw new HttpError(404, '없는 계약서입니다.');
  if (method === 'GET') return json(c);
  if (method === 'PATCH') {
    if (c.status === 'signed') throw bad('서명이 끝난 계약서는 고칠 수 없습니다.');
    const b = await readBody(request);
    const name = b.client_name === undefined ? c.client_name : str(b.client_name, 60);
    if (!name) throw bad('갑(고객) 이름을 넣어 주세요.');
    const body = b.body === undefined ? c.body : str(b.body, 20000);
    if (!body) throw bad('계약서 내용이 비어 있습니다.');
    await db.prepare('UPDATE contracts SET client_name = ?, client_phone = ?, build_fee = ?, yearly_fee = ?, contract_date = ?, body = ?, updated_at = ? WHERE id = ?')
      .bind(name, b.client_phone === undefined ? c.client_phone : str(b.client_phone, 40),
        b.build_fee === undefined ? c.build_fee : money(b.build_fee), b.yearly_fee === undefined ? c.yearly_fee : money(b.yearly_fee),
        b.contract_date === undefined ? c.contract_date : dateStr(b.contract_date), body, now(), id).run();
    await audit('CONTRACT_EDIT', name, `sign/${c.code}`);
    return json({ ok: true });
  }
  if (method === 'DELETE') {
    await db.prepare('DELETE FROM contracts WHERE id = ?').bind(id).run();
    await audit('CONTRACT_DEL', c.client_name, `sign/${c.code}${c.status === 'signed' ? ' (서명 완료본)' : ''}`);
    return json({ ok: true });
  }
  return null;
}

// ───────── 갑(고객) 화면 · API — 로그인 없음, 주소(5자)를 아는 사람만 ─────────
export const isSignHost = (url) => url.hostname === SIGN_HOST;

// 반환: Response, 또는 null(이 길이 아님)
export async function contractsPublic(request, env, url, staticFile) {
  const p = url.pathname;
  const onSign = isSignHost(url);
  let m = p.match(/^\/api\/sign\/([A-Za-z0-9]{5})$/);
  if (m) return signApi(request, env, m[1]);
  if (onSign && (p.startsWith('/css/') || p.startsWith('/js/'))) return staticFile(request, env, url);
  m = onSign ? p.match(/^\/([A-Za-z0-9]{5})\/?$/) : p.match(/^\/sign\/([A-Za-z0-9]{5})\/?$/);
  if (m) return signPage(request, env, url, staticFile);
  if (onSign) return new Response('없는 주소입니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  return null;
}

// 서명 화면(sign.html) — 계약서 내용은 화면이 /api/sign/<5자> 로 읽는다
async function signPage(request, env, url, staticFile) {
  const res = await staticFile(new Request(new URL('/sign', url), request), env, new URL('/sign', url));
  const r = new Response(res.body, res);
  r.headers.set('Cache-Control', 'no-cache');
  r.headers.set('X-Robots-Tag', 'noindex');
  r.headers.set('Referrer-Policy', 'no-referrer');   // 서명 주소가 다른 곳으로 새지 않게
  return r;
}

async function signApi(request, env, code) {
  const db = env.DB;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = `sign:${ip}`;
  await db.prepare('DELETE FROM login_fails WHERE at < ?').bind(now() - FAIL_WINDOW).run();
  const fails = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE key = ?').bind(key).first();
  if (fails.n >= FAIL_MAX) return json({ error: '잠시 뒤에 다시 열어 주세요.' }, 429);
  const c = CODE_RE.test(code) ? await db.prepare('SELECT * FROM contracts WHERE code = ?').bind(code).first() : null;
  if (!c) {
    await db.prepare('INSERT INTO login_fails (key, at) VALUES (?, ?)').bind(key, now()).run();
    return json({ error: '없는 계약서 주소입니다. 받은 주소를 다시 확인해 주세요.' }, 404);
  }
  let eul = await getEul(db);
  if (c.status === 'signed' && c.eul_snapshot) { try { eul = { ...eul, ...JSON.parse(c.eul_snapshot) }; } catch { /* 지금 값 */ } }   // 서명된 계약서는 서명 때의 을 정보 그대로
  if (request.method === 'GET') {
    if (!c.viewed_at && c.status !== 'signed') await db.prepare('UPDATE contracts SET viewed_at = ? WHERE id = ?').bind(now(), c.id).run();
    return json({
      code: c.code, client_name: c.client_name, client_phone: c.client_phone, build_fee: c.build_fee, yearly_fee: c.yearly_fee,
      contract_date: c.contract_date, body: c.body, status: c.status, signed_at: c.signed_at, client_sign: c.client_sign, doc_hash: c.doc_hash,
      eul: { name: eul.name, phone: eul.phone, sign: eul.sign }, host: SIGN_HOST,
    });
  }
  if (request.method === 'POST') {
    if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('JSON 으로 보내 주세요.');
    if (c.status === 'signed') throw bad('이미 서명이 끝난 계약서입니다.');
    let b; try { b = await request.json(); } catch { throw bad('요청 내용을 읽을 수 없습니다.'); }
    if (!b.agree) throw bad('계약 내용에 동의해 주세요.');
    const sign = pngData(b.sign);
    if (!sign || sign.length < 300) throw bad('서명을 그려 주세요.');
    const t = now();
    const hash = await docHash(c, eul);
    const ua = str(request.headers.get('User-Agent'), 300);
    // 동시에 두 번 눌러도 한 번만 (status 가 아직 wait 일 때만 바꾼다)
    const r = await db.prepare("UPDATE contracts SET client_sign = ?, signed_at = ?, signed_ip = ?, signed_ua = ?, doc_hash = ?, eul_snapshot = ?, status = 'signed', updated_at = ? WHERE id = ? AND status != 'signed'")
      .bind(sign, t, ip, ua, hash, JSON.stringify(eul), t, c.id).run();
    if (!r.meta.changes) throw bad('이미 서명이 끝난 계약서입니다.');
    await db.prepare('INSERT INTO audit_log (action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('CONTRACT_SIGNED', c.client_name.slice(0, 200), `sign/${c.code} 갑 서명 완료`, ip, t).run().catch(() => {});
    return json({ ok: true, signed_at: t, doc_hash: hash });
  }
  return json({ error: '지원하지 않는 요청입니다.' }, 405);
}
