// xim — 고객 사이트 통합 관리 + 공용 엔진
//
//   기본 export (xim.….workers.dev)   운영자 관리 화면(/) + 운영자 API(/api/*)
//   Engine (서비스 바인딩 전용)          각 고객 사이트 Worker 가 부른다. 공개 주소로는 닿지 않는다.
//     status(slug)                      사이트 상태(active | suspended | unknown)
//     portfolio()                       포트폴리오에 켜 둔 사이트 [{ slug, name, url }] + 포트폴리오2 [{ slug:'', name, url, extra }] (portfolio 폴더가 쓴다)
//     fetch(request)                    /__suspended (정지 화면). 업체 관리 화면 · 회원 · 게시판은 xms 가 맡는다.
//
//   바인딩: DB(D1 xim), XMS_DB(D1 xms: 업체 관리자 계정 · 입장권), ASSETS(정적 파일)   비밀값: XIM_ADMIN_PASSWORD (wrangler secret, 리포에 없음)
import { ensureMailDomain, ensureTurnstile } from './mail-domain.js';
import { deleteRequest } from './request-files.js';
import { linkUrl as cleanUrl, scrapeMeta } from './scrape.js';
import { WorkerEntrypoint } from 'cloudflare:workers';
// 스튜디오(유튜브 발표자료 제작) — /api/studio/* · /studio/* · Workflow StudioMain (xim/_worker/studio.js)
import { studioApi, studioHelper, studioPublic, StudioMain } from './studio.js';
export { StudioMain };
// 관리자 계정 추가도 그 사이트 홈페이지 회원가입과 같은 항목 · 같은 검사로 (xms 와 같은 코드)
import { siteSettings, memberValues, uniqueProblem } from '../../xms/_worker/lib.js';

const DAY = 86400000;
const SEC_WINDOW = 10 * 60000; // 없는 주소: 10분 동안
const SEC_404_LIMIT = 15;      //   15번이면 차단
const SESSION_MS = 7 * DAY;
const PBKDF2_ITER = 10000; // 무료 플랜 CPU 10ms 안에 들도록 낮게 잡음
const FAIL_WINDOW = 10 * 60000;
const FAIL_MAX = 8;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const STATUSES = ['new', 'doing', 'done'];

// ───────────────────────── 공통 도우미 ─────────────────────────

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg = '찾을 수 없습니다.') => new HttpError(404, msg);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function fail(err) {
  if (err instanceof HttpError || (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 600)) return json({ error: err.message }, err.status);   // studio.js 의 HttpError 도
  console.error(err);
  return json({ error: '서버 오류가 났습니다.' }, 500);
}

const now = () => Date.now();
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

// 다른 사이트에서 폼으로 몰래 보내는 요청(CSRF)을 막기 위해 쓰기 요청은 JSON 만 받는다.
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('JSON 으로 보내 주세요.');
  try { return await request.json(); } catch { throw bad('요청 내용을 읽을 수 없습니다.'); }
}

function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
const setCookie = (name, value, maxAgeSec) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}

// 길이가 같은 두 문자열을 시간차 없이 비교
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function tooManyFails(db, key) {
  await db.prepare('DELETE FROM login_fails WHERE at < ?').bind(now() - FAIL_WINDOW).run();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE key = ?').bind(key).first();
  return row.n >= FAIL_MAX;
}
const recordFail = (db, key) => db.prepare('INSERT INTO login_fails (key, at) VALUES (?, ?)').bind(key, now()).run();

async function newSession(db, kind, siteId = null, adminId = null, expiresAt = now() + SESSION_MS) {
  const token = randomHex(32);
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
  await db.prepare('INSERT INTO sessions (token, kind, site_id, admin_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, kind, siteId, adminId, expiresAt).run();
  return token;
}

// ───────── 구글 OTP (TOTP, RFC 6238: SHA-1 · 6자리 · 30초) ─────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = 0; let val = 0; let out = '';
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffff; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0; let val = 0; const out = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32');
    val = ((val << 5) | i) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey('raw', unbase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const getSetting = async (db, key) => (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first())?.value ?? null;
const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

// 앞뒤 30초까지 허용. 한 번 쓴 번호(같은 30초 칸)는 다시 못 쓴다.
async function checkTotp(db, secret, code) {
  code = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const c0 = Math.floor(now() / 30000);
  const last = Number(await getSetting(db, 'totp_last')) || 0;
  for (const c of [c0 - 1, c0, c0 + 1]) {
    if (c > last && sameText(await totpAt(secret, c), code)) {
      await setSetting(db, 'totp_last', String(c));
      return true;
    }
  }
  return false;
}

const OTP_COOKIE = 'xim_otp';
async function otpTrustUntil(db, request) {
  const token = cookie(request, OTP_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return 0;
  const row = await db.prepare('SELECT expires_at FROM otp_trust WHERE token = ? AND expires_at > ?').bind(token, now()).first();
  return row ? row.expires_at : 0;
}
async function trustBrowser(db) {
  const token = randomHex(32);
  const until = now() + DAY;
  await db.prepare('DELETE FROM otp_trust WHERE expires_at < ?').bind(now()).run();
  await db.prepare('INSERT INTO otp_trust (token, expires_at) VALUES (?, ?)').bind(token, until).run();
  return { until, cookie: setCookie(OTP_COOKIE, token, DAY / 1000) };
}
async function readSession(db, request, cookieName, kind) {
  const token = cookie(request, cookieName);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const s = await db.prepare('SELECT * FROM sessions WHERE token = ? AND kind = ? AND expires_at > ?')
    .bind(token, kind, now()).first();
  return s;
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';
// 관리 로그: 운영자가 xim 에서 한 일 (1개월 보관 — xms 관리 로그와 같은 방식)
const audit = (db, request, action, target = '', detail = '') =>
  db.prepare('INSERT INTO audit_log (action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(action, String(target).slice(0, 200), String(detail).slice(0, 500), clientIp(request), now()).run().catch((e) => console.error('관리 로그 실패', e));

// ───────────────────────── 운영자 API ─────────────────────────

const XIM_COOKIE = 'xim_sess';

async function ximApi(request, env, url, ctx) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/api/login' && method === 'POST') {
    if (!env.XIM_ADMIN_PASSWORD) throw new HttpError(503, '운영자 비밀번호가 아직 설정되지 않았습니다.');
    const key = `xim:${clientIp(request)}`;
    if (await tooManyFails(db, key)) throw new HttpError(429, '로그인 실패가 많아 10분 뒤에 다시 시도해 주세요.');
    const { password, otp } = await body(request);
    const ok = sameText(await sha256(String(password ?? '').slice(0, 200)), await sha256(env.XIM_ADMIN_PASSWORD));
    if (!ok) { await recordFail(db, key); throw new HttpError(401, '비밀번호가 맞지 않습니다.'); }

    // 구글 OTP 를 등록했으면: 이 브라우저가 24시간 안에 OTP 를 넣었을 때만 비밀번호로 통과
    const secret = await getSetting(db, 'totp_secret');
    const cookies = [];
    let expires = now() + DAY;
    if (secret) {
      const until = await otpTrustUntil(db, request);
      if (until) expires = until;
      else {
        if (!otp) return json({ need_otp: true });
        if (!(await checkTotp(db, secret, otp))) { await recordFail(db, key); throw new HttpError(401, 'OTP 번호가 맞지 않습니다.'); }
        const t = await trustBrowser(db);
        cookies.push(t.cookie);
        expires = t.until;
      }
    }
    const token = await newSession(db, 'xim', null, null, expires);
    cookies.push(setCookie(XIM_COOKIE, token, Math.round((expires - now()) / 1000)));
    await audit(db, request, 'LOGIN', '운영자', secret ? 'OTP 사용' : '');
    const res = json({ ok: true });
    cookies.forEach((c) => res.headers.append('Set-Cookie', c));
    return res;
  }

  // 스튜디오 도우미(PC · GitHub Actions)는 로그인 대신 토큰으로
  if (path.startsWith('/api/studio/helper/')) return studioHelper(request, env, url, path, method);

  const session = await readSession(db, request, XIM_COOKIE, 'xim');
  if (!session) throw new HttpError(401, '로그인이 필요합니다.');

  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(session.token).run();
    await audit(db, request, 'LOGOUT', '운영자');
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(XIM_COOKIE, '', 0) });
  }
  if (path === '/api/me') return json({ ok: true });
  if (path.startsWith('/api/studio/') || path === '/api/studio') return studioApi(request, env, url, ctx, path, method, body, (a, t, d) => audit(db, request, a, t, d), (p, d) => github(env, p, d));

  // 구글 OTP 등록 · 해제
  if (path === '/api/otp' && method === 'GET') {
    return json({ enabled: !!(await getSetting(db, 'totp_secret')) });
  }
  if (path === '/api/otp/setup' && method === 'POST') {
    if (await getSetting(db, 'totp_secret')) throw bad('이미 OTP 가 등록돼 있습니다. 다시 등록하려면 먼저 해제해 주세요.');
    const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
    await setSetting(db, 'totp_pending', secret);
    const uri = `otpauth://totp/xim:${encodeURIComponent('운영자')}?secret=${secret}&issuer=xim&algorithm=SHA1&digits=6&period=30`;
    return json({ secret, uri });
  }
  if (path === '/api/otp/enable' && method === 'POST') {
    const { code } = await body(request);
    const pending = await getSetting(db, 'totp_pending');
    if (!pending) throw bad('먼저 QR 코드를 만들어 주세요.');
    if (!(await checkTotp(db, pending, code))) throw bad('OTP 번호가 맞지 않습니다. 앱에 보이는 6자리를 다시 넣어 주세요.');
    await db.batch([
      db.prepare("INSERT INTO settings (key, value) VALUES ('totp_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(pending),
      db.prepare("DELETE FROM settings WHERE key = 'totp_pending'"),
      db.prepare('DELETE FROM otp_trust'),
    ]);
    await audit(db, request, 'OTP_ON', '구글 OTP');
    const t = await trustBrowser(db); // 지금 이 브라우저는 방금 OTP 를 넣었으니 24시간 믿는다
    return json({ ok: true }, 200, { 'Set-Cookie': t.cookie });
  }
  if (path === '/api/otp/disable' && method === 'POST') {
    const { code } = await body(request);
    const secret = await getSetting(db, 'totp_secret');
    if (!secret) return json({ ok: true });
    if (!(await checkTotp(db, secret, code))) throw bad('OTP 번호가 맞지 않습니다.');
    await db.batch([
      db.prepare("DELETE FROM settings WHERE key IN ('totp_secret', 'totp_pending')"),
      db.prepare('DELETE FROM otp_trust'),
    ]);
    await audit(db, request, 'OTP_OFF', '구글 OTP');
    return json({ ok: true });
  }

  if (path === '/api/summary') {
    const r = await db.batch([
      db.prepare('SELECT COUNT(*) AS n FROM customers'),
      db.prepare("SELECT COUNT(*) AS n, SUM(status = 'suspended') AS off FROM sites"),
      db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status != 'done'"),
      db.prepare("SELECT COUNT(*) AS n FROM requests r WHERE ((CASE WHEN r.created_at > r.op_seen_at THEN 1 ELSE 0 END) + (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id AND m.side = 'site' AND m.created_at > r.op_seen_at)) > 0"),
    ]);
    // 데이터베이스 전체 크기 (D1 이 돌려주는 size_after) · R2 에 올린 파일 합계
    const [ximMeta, xmsMeta, r2] = await Promise.all([
      db.prepare('SELECT 1').run(), env.XMS_DB.prepare('SELECT 1').run(),
      env.XMS_DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE r2_key IS NOT NULL').first(),
    ]);
    return json({
      customers: r[0].results[0].n,
      sites: r[1].results[0].n,
      suspended: r[1].results[0].off || 0,
      openRequests: r[2].results[0].n,
      unreadRequests: r[3].results[0].n, // 업체가 새로 쓴 글이 있는 요청 (운영자가 아직 안 봄)
      storage: { xim_db: ximMeta.meta.size_after || 0, xms_db: xmsMeta.meta.size_after || 0, r2: r2.n },
    });
  }

  // 고객
  if (path === '/api/customers' && method === 'GET') {
    const { results } = await db.prepare(
      'SELECT c.*, (SELECT COUNT(*) FROM sites s WHERE s.customer_id = c.id) AS site_count FROM customers c ORDER BY c.id DESC',
    ).all();
    return json(results);
  }
  if (path === '/api/customers' && method === 'POST') {
    const b = customerFields(await body(request));
    const r = await db.prepare('INSERT INTO customers (name, contact, phone, email, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(b.name, b.contact, b.phone, b.email, b.memo, now()).run();
    await audit(db, request, 'CUSTOMER_CREATE', b.name);
    return json({ id: r.meta.last_row_id });
  }
  let m = path.match(/^\/api\/customers\/(\d+)$/);
  if (m && method === 'PUT') {
    const b = customerFields(await body(request));
    const before = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(+m[1]).first();
    await db.prepare('UPDATE customers SET name = ?, contact = ?, phone = ?, email = ?, memo = ? WHERE id = ?')
      .bind(b.name, b.contact, b.phone, b.email, b.memo, +m[1]).run();
    await audit(db, request, 'CUSTOMER_UPDATE', b.name, changed(before, b, { name: '이름', contact: '담당자', phone: '전화', email: '이메일', memo: '메모' }));
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    const used = await db.prepare('SELECT COUNT(*) AS n FROM sites WHERE customer_id = ?').bind(+m[1]).first();
    if (used.n) throw bad('이 고객에 연결된 사이트가 있어 지울 수 없습니다. 사이트의 고객을 먼저 바꿔 주세요.');
    const c = await db.prepare('SELECT name FROM customers WHERE id = ?').bind(+m[1]).first();
    await db.prepare('DELETE FROM customers WHERE id = ?').bind(+m[1]).run();
    await audit(db, request, 'CUSTOMER_DELETE', c?.name || `#${m[1]}`);
    return json({ ok: true });
  }

  // 사이트
  if (path === '/api/sites' && method === 'GET') {
    // 배포할 때 도메인만 채워진 사이트(deploy.mjs) → 메일 · 봇 확인을 여기서 한 번 등록
    //   봇 확인이 '설정 전'(예전 토큰에 Turnstile 권한이 없던 때 등록)인 사이트도 다시 시도
    //   예전엔 목록을 열 때마다 여기서 Cloudflare 에 차례로 다시 등록하느라 목록이 4~5초씩 늦었다 →
    //   응답은 바로 하고 등록은 뒤에서(ctx.waitUntil). 'skip'(권한 등으로 안 된 것)은 6시간에 한 번만 다시 시도
    const retryKey = 'mail_retry_at';
    const lastTry = +(await getSetting(db, retryKey)) || 0;
    const { results: pending } = await db.prepare("SELECT id, domain, mail_status, bot_status FROM sites WHERE domain != '' AND (mail_status = '' OR bot_status IN ('', 'skip'))").all();
    const due = pending.filter((p) => p.mail_status === '' || p.bot_status === '' || now() - lastTry > 6 * 3600 * 1000);
    if (due.length && ctx) {
      if (due.some((p) => p.bot_status === 'skip')) await setSetting(db, retryKey, String(now()));
      ctx.waitUntil((async () => {
        for (const p of due) {
          const r = await mailRegister(env, p.id, p.domain).catch((e) => ({ message: e.message }));
          await audit(db, request, 'SITE_MAIL', p.domain, `배포 때 채운 도메인 자동 등록 — ${r?.message || ''}`);
        }
      })());
    }
    const [{ results }, { results: admins }, use, { results: favs }] = await Promise.all([db.prepare(`
      SELECT s.*, c.name AS customer_name,
        (SELECT COUNT(*) FROM requests r WHERE r.site_id = s.id AND r.status != 'done') AS open_requests
      FROM sites s LEFT JOIN customers c ON c.id = s.customer_id
      ORDER BY s.id DESC`).all(),
      // 업체 관리자 = xms 의 등급 1 회원
      env.XMS_DB.prepare("SELECT site, COUNT(*) AS n FROM members WHERE level = 1 AND status != 'WITHDRAWN' GROUP BY site").all(),
      siteUsage(env),
      // 파비콘 (xms 에 올린 것) — 카드 이름 옆에 보인다
      env.XMS_DB.prepare("SELECT site, updated_at FROM site_files WHERE kind = 'favicon-32'").all(),
    ]);
    const count = Object.fromEntries(admins.map((a) => [a.site, a.n]));
    const fav = Object.fromEntries(favs.map((f) => [f.site, f.updated_at]));
    // 봇 확인 비밀 키(turnstile_secret)는 화면에 필요 없다 — 내려보내지 않는다
    return json(results.map(({ turnstile_secret, ...s }) => ({ ...s, admin_count: count[s.slug] || 0, url: siteUrl(s), favicon: fav[s.slug] ? `${siteUrl(s)}/xms/file/favicon-32.png?v=${fav[s.slug]}` : s.site_favicon ? `${siteUrl(s)}${s.site_favicon}` : '', usage: use[s.slug] || { db: 0, files: 0, file_count: 0, r2: 0, d1_files: 0 } })));
  }
  if (path === '/api/sites' && method === 'POST') {
    const raw = await body(request);
    const slug = str(raw.slug, 40).toLowerCase();
    if (!SLUG_RE.test(slug)) throw bad('사이트 ID 는 영문 소문자·숫자·하이픈 2~40자로 넣어 주세요.');
    const b = siteFields(raw);
    const dup = await db.prepare('SELECT id FROM sites WHERE slug = ?').bind(slug).first();
    if (dup) throw bad('이미 있는 사이트 ID 입니다.');
    const r = await db.prepare(
      'INSERT INTO sites (slug, name, customer_id, domain, status, quota_mb, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(slug, b.name, b.customer_id, b.domain, b.status, b.quota_mb, b.memo, now()).run();
    const mail = b.domain ? await mailRegister(env, r.meta.last_row_id, b.domain) : null;
    await audit(db, request, 'SITE_CREATE', `${b.name} (${slug})`, b.domain ? `도메인 ${b.domain}` : '');
    return json({ id: r.meta.last_row_id, mail });
  }
  m = path.match(/^\/api\/sites\/(\d+)$/);
  if (m && method === 'PUT') {
    const b = siteFields(await body(request));
    const before = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(+m[1]).first();
    await db.prepare('UPDATE sites SET name = ?, customer_id = ?, domain = ?, status = ?, quota_mb = ?, memo = ? WHERE id = ?')
      .bind(b.name, b.customer_id, b.domain, b.status, b.quota_mb, b.memo, +m[1]).run();
    // 대표 도메인이 바뀌었거나 아직 메일 등록이 안 됐으면 Email Sending 에 등록
    const mail = b.domain && (b.domain !== before?.domain || !['ok', 'added'].includes(before?.mail_status)) ? await mailRegister(env, +m[1], b.domain) : null;
    await audit(db, request, 'SITE_UPDATE', `${b.name} (${before?.slug || m[1]})`, changed(before, b, { name: '이름', customer_id: '고객', domain: '도메인', status: '상태', quota_mb: '용량(MB)', memo: '메모' }));
    return json({ ok: true, mail });
  }
  m = path.match(/^\/api\/sites\/(\d+)\/mail$/);
  if (m && method === 'POST') {
    const s = await db.prepare('SELECT slug, domain FROM sites WHERE id = ?').bind(+m[1]).first();
    if (!s?.domain) throw bad('대표 도메인을 먼저 넣어 주세요.');
    const mail = await mailRegister(env, +m[1], s.domain);
    await audit(db, request, 'SITE_MAIL', s.slug, `${s.domain} — ${mail?.message || ''}`);
    return json({ ok: true, mail });
  }
  m = path.match(/^\/api\/sites\/(\d+)\/status$/);
  if (m && method === 'POST') {
    const { status } = await body(request);
    if (!['active', 'suspended'].includes(status)) throw bad('상태 값이 잘못됐습니다.');
    await db.prepare('UPDATE sites SET status = ? WHERE id = ?').bind(status, +m[1]).run();
    const s = await db.prepare('SELECT slug, name FROM sites WHERE id = ?').bind(+m[1]).first();
    await audit(db, request, status === 'suspended' ? 'SITE_SUSPEND' : 'SITE_RESUME', s ? `${s.name} (${s.slug})` : `#${m[1]}`);
    return json({ ok: true });
  }

  // 포트폴리오(portfolio.plators.com)에 보이기 켜기 · 끄기
  m = path.match(/^\/api\/sites\/(\d+)\/portfolio$/);
  if (m && method === 'POST') {
    const v = await body(request);
    const s = await db.prepare('SELECT slug, name FROM sites WHERE id = ?').bind(+m[1]).first();
    // { tag } = 포트폴리오 분류(홈페이지 · 웹서비스 · 웹앱 · 웹게임 …)만 바꾸기
    if (v.tag !== undefined) {
      const tag = str(v.tag, 20);
      await db.prepare('UPDATE sites SET portfolio_tag = ? WHERE id = ?').bind(tag, +m[1]).run();
      await audit(db, request, 'SITE_UPDATE', s ? `${s.name} (${s.slug})` : `#${m[1]}`, `포트폴리오 분류: ${tag || '(없음)'}`);
      return json({ ok: true });
    }
    const on = v.on ? 1 : 0;
    await db.prepare('UPDATE sites SET portfolio = ? WHERE id = ?').bind(on, +m[1]).run();
    await audit(db, request, on ? 'SITE_PORTFOLIO_ON' : 'SITE_PORTFOLIO_OFF', s ? `${s.name} (${s.slug})` : `#${m[1]}`);
    return json({ ok: true });
  }

  // 포트폴리오2: xim 에서 만들지 않은 사이트를 주소로 넣어 포트폴리오에 함께 보이기
  //   넣을 때 한 번만 그 페이지의 카톡 미리보기(og:title · og:description · og:image)를 읽어 저장한다.
  //   그림도 그때 받아 R2(FILES, pf2/…)에 넣어 두고 포트폴리오는 그 저장본을 보여 준다 → 그 뒤로는 그 사이트 서버에 묻지 않는다.
  //   image 칸 = R2 이름(pf2/…). 운영자는 그림을 새로 올리거나 뺄 수 있다.
  if (path === '/api/portfolio2' && method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM portfolio_links ORDER BY sort, id').all();
    return json(results);
  }
  if (path === '/api/portfolio2' && method === 'POST') {
    const url = pf2Url((await body(request)).url);
    const meta = await scrapeMeta(url);
    const image = meta.image ? await pf2SaveRemote(env, meta.image) : '';
    const top = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM portfolio_links').first();
    const row = await db.prepare('INSERT INTO portfolio_links (url, name, description, image, tag, shown, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) RETURNING *')
      .bind(meta.url || url, meta.name || new URL(url).hostname, meta.desc || '', image, '홈페이지', top.n + 1, now()).first();
    await audit(db, request, 'PF2_CREATE', row.name, row.url);
    return json({ row, warn: meta.error || (!image || !meta.desc ? '미리보기 정보 중 비어 있는 것이 있습니다. 직접 채워 주세요.' : '') });
  }
  // 저장해 둔 그림 (운영자 화면 미리보기용 — 포트폴리오는 Engine 으로 받는다)
  m = path.match(/^\/api\/portfolio2\/img\/(pf2\/[a-f0-9]{32})$/);
  if (m && method === 'GET') return pf2Image(env, m[1]);
  m = path.match(/^\/api\/portfolio2\/(\d+)(\/refetch|\/image)?$/);
  if (m) {
    const id = +m[1];
    const old = await db.prepare('SELECT * FROM portfolio_links WHERE id = ?').bind(id).first();
    if (!old) throw notFound();
    const setImage = async (image) => {
      const row = await db.prepare('UPDATE portfolio_links SET image = ? WHERE id = ? RETURNING *').bind(image, id).first();
      if (old.image && old.image !== image) await pf2DropImage(env, old.image);
      return row;
    };
    if (m[2] === '/refetch' && method === 'POST') {
      // 다시 가져오기(운영자가 누를 때만): 그 사이트 미리보기를 다시 읽는다 (못 읽은 칸은 원래 값 그대로)
      const meta = await scrapeMeta(old.url);
      if (meta.error) throw bad(meta.error);
      const image = meta.image ? await pf2SaveRemote(env, meta.image) : '';
      await db.prepare('UPDATE portfolio_links SET name = ?, description = ? WHERE id = ?').bind(meta.name || old.name, meta.desc || old.description, id).run();
      const row = image ? await setImage(image) : await db.prepare('SELECT * FROM portfolio_links WHERE id = ?').bind(id).first();
      await audit(db, request, 'PF2_UPDATE', row.name, '다시 가져오기');
      return json({ row });
    }
    if (m[2] === '/image' && method === 'POST') {
      // 그림 새로 올리기 (본문 = 그림 파일 그대로)
      const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!PF2_IMG.test(mime)) throw bad('그림 파일(jpg · png · webp · gif)만 올릴 수 있습니다.');
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) throw bad('빈 파일입니다.');
      if (buf.byteLength > PF2_MAX) throw bad('그림이 너무 큽니다 (5MB 까지).');
      const row = await setImage(await pf2Put(env, buf, mime));
      await audit(db, request, 'PF2_UPDATE', row.name, '그림 올림');
      return json({ row });
    }
    if (m[2] === '/image' && method === 'DELETE') {
      const row = await setImage('');
      await audit(db, request, 'PF2_UPDATE', row.name, '그림 뺌');
      return json({ row });
    }
    if (!m[2] && method === 'PUT') {
      const v = await body(request);
      const shown = v.shown === undefined ? old.shown : (v.shown ? 1 : 0);
      const row = await db.prepare('UPDATE portfolio_links SET url = ?, name = ?, description = ?, tag = ?, shown = ? WHERE id = ? RETURNING *')
        .bind(v.url === undefined ? old.url : pf2Url(v.url), v.name === undefined ? old.name : str(v.name, 120) || old.name,
          v.description === undefined ? old.description : str(v.description, 300), v.tag === undefined ? old.tag : str(v.tag, 20), shown, id).first();
      await audit(db, request, 'PF2_UPDATE', row.name, v.shown !== undefined && Object.keys(v).length === 1 ? (shown ? '보이기' : '숨기기') : '수정');
      return json({ row });
    }
    if (!m[2] && method === 'DELETE') {
      await db.prepare('DELETE FROM portfolio_links WHERE id = ?').bind(id).run();
      if (old.image) await pf2DropImage(env, old.image);
      await audit(db, request, 'PF2_DELETE', old.name, old.url);
      return json({ ok: true });
    }
  }

  // 업체 관리자 계정 = xms 회원 중 등급 1 (사이트주소/xms/ 로 로그인)
  m = path.match(/^\/api\/sites\/(\d+)\/admins$/);
  if (m) {
    const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(+m[1]).first();
    if (!site) throw new HttpError(404, '사이트가 없습니다.');
    const xms = env.XMS_DB;
    // 가입 항목: 그 사이트 xms 설정 그대로 (이메일 = 아이디라 따로 받지 않는다)
    const signupFields = async () => (await siteSettings(xms, site.slug)).fields.filter((f) => f.mode !== 'EXCLUDED');
    if (method === 'GET') {
      const { results } = await xms.prepare("SELECT id, login_id AS username, name, created_at FROM members WHERE site = ? AND level = 1 AND status != 'WITHDRAWN' ORDER BY id")
        .bind(site.slug).all();
      const fields = (await signupFields()).filter((f) => f.key !== 'email')
        .map(({ key, label, type, mode, options }) => ({ key, label, type, mode, options }));
      return json({ admins: results, fields });
    }
    if (method === 'POST') {
      const raw = await body(request);
      const username = str(raw.username, 254).toLowerCase();
      const password = String(raw.password ?? '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) throw bad('아이디는 이메일 주소로 넣어 주세요 (홈페이지 회원가입과 같게).');
      if (password.length < 8 || password.length > 200) throw bad('비밀번호는 8자 이상으로 넣어 주세요.');
      const dup = await xms.prepare('SELECT id, status FROM members WHERE site = ? AND lower(login_id) = ?').bind(site.slug, username).first();
      if (dup) throw bad(dup.status === 'WITHDRAWN' ? '탈퇴한 회원이 쓰던 이메일입니다. 다른 이메일을 넣어 주세요.' : '이미 가입한 이메일입니다. 그 회원을 관리자로 올리려면 사이트 관리 화면의 가입회원에서 등급을 바꾸세요.');
      let vals;
      try {
        vals = memberValues(await signupFields(), { ...raw, email: username }, true);
        const prob = await uniqueProblem(xms, site.slug, { nickname: vals.cols.nickname, email: username });
        if (prob) throw bad(prob.message);
      } catch (e) {
        if (e && e.status) throw new HttpError(e.status, e.message); // xms 쪽 오류 → xim 오류 응답
        throw e;
      }
      const salt = randomHex(16);
      const t = now();
      const c = vals.cols;
      await xms.prepare(`INSERT INTO members (site, login_id, pw_hash, pw_salt, name, nickname, level, email, mobile, phone, extra, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, '', ?, ?)`)
        .bind(site.slug, username, await hashPassword(password, salt), salt, c.name, c.nickname, username, c.mobile, JSON.stringify(vals.extra), t).run();
      await audit(db, request, 'ADMIN_CREATE', site.slug, `${c.name} (${username})`);
      return json({ ok: true });
    }
  }
  m = path.match(/^\/api\/sites\/(\d+)\/admins\/(\d+)$/);
  if (m && method === 'DELETE') {
    const site = await db.prepare('SELECT slug FROM sites WHERE id = ?').bind(+m[1]).first();
    if (!site) throw new HttpError(404, '사이트가 없습니다.');
    const who = await env.XMS_DB.prepare('SELECT name, login_id FROM members WHERE id = ? AND site = ?').bind(+m[2], site.slug).first();
    await env.XMS_DB.batch([
      env.XMS_DB.prepare("UPDATE members SET status = 'WITHDRAWN', withdrawn_at = ?, withdraw_reason = 'xim 에서 관리자 계정 삭제' WHERE id = ? AND site = ? AND level = 1").bind(now(), +m[2], site.slug),
      env.XMS_DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(+m[2]),
    ]);
    await audit(db, request, 'ADMIN_DELETE', site.slug, who ? `${who.name} (${who.login_id})` : `#${m[2]}`);
    return json({ ok: true });
  }

  // xms 버튼 — 운영자로 업체 관리 화면에 대신 들어가는 1분짜리 입장권
  m = path.match(/^\/api\/sites\/(\d+)\/staff-ticket$/);
  if (m && method === 'POST') {
    const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(+m[1]).first();
    if (!site) throw new HttpError(404, '사이트가 없습니다.');
    const token = randomHex(32);
    await env.XMS_DB.prepare('DELETE FROM staff_tickets WHERE expires_at < ?').bind(now()).run();
    await env.XMS_DB.prepare('INSERT INTO staff_tickets (token, site, expires_at) VALUES (?, ?, ?)').bind(token, site.slug, now() + 60000).run();
    await audit(db, request, 'STAFF_ENTER', `${site.name} (${site.slug})`, 'xms 관리 화면 들어가기');
    return json({ url: `${siteUrl(site)}/xms/?staff=${token}` });
  }

  // ───── 보안 감시 ─────
  if (path === '/api/sec' && method === 'GET') {
    const t = now();
    const only = url.searchParams.get('only'); // block | attack
    const where = only === 'block' ? "WHERE action = 'block'" : only === 'attack' ? "WHERE reason = 'attack'" : '';
    // 목록은 쪽으로 나눠 준다: 의심 요청 ep(30개씩), 차단 중 bp(20개씩)
    const EV = 30, BL = 20;
    const ep = Math.max(1, parseInt(url.searchParams.get('ep'), 10) || 1);
    const bp = Math.max(1, parseInt(url.searchParams.get('bp'), 10) || 1);
    const [stats, events, blocks, allow] = await db.batch([
      db.prepare(`SELECT
          (SELECT COUNT(*) FROM sec_events WHERE at > ?) AS events24,
          (SELECT COUNT(*) FROM sec_events WHERE at > ? AND reason = 'attack') AS attacks24,
          (SELECT COUNT(*) FROM sec_blocks WHERE created_at > ? OR last_at > ?) AS blocked24,
          (SELECT COUNT(*) FROM sec_blocks WHERE until > ?) AS active,
          (SELECT COUNT(*) FROM sec_events ${where}) AS events_total`).bind(t - DAY, t - DAY, t - DAY, t - DAY, t),
      db.prepare(`SELECT e.*, EXISTS(SELECT 1 FROM sec_blocks b WHERE b.ip = e.ip AND b.until > ?) AS blocked FROM sec_events e ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?`).bind(t, EV, (ep - 1) * EV),
      db.prepare('SELECT * FROM sec_blocks WHERE until > ? ORDER BY last_at DESC LIMIT ? OFFSET ?').bind(t, BL, (bp - 1) * BL),
      db.prepare('SELECT * FROM sec_allow ORDER BY created_at DESC'),
    ]);
    const st = stats.results[0];
    return json({ stats: st, events: events.results, blocks: blocks.results, allow: allow.results, my_ip: request.headers.get('CF-Connecting-IP') || '',
      paging: { ep, ev_size: EV, ev_total: st.events_total, bp, bl_size: BL, bl_total: st.active } });
  }
  if (path === '/api/sec/blocks' && method === 'POST') {
    const raw = await body(request);
    const ip = str(raw.ip, 64);
    if (!/^[0-9a-fA-F:.]{3,64}$/.test(ip)) throw bad('IP 주소를 확인해 주세요.');
    const days = Math.min(3650, Math.max(1, Math.round(Number(raw.days) || 30)));
    const t = now();
    await db.prepare(`INSERT INTO sec_blocks (ip, reason, until, hits, country, site, created_at, last_at, manual) VALUES (?, ?, ?, 0, '', '', ?, ?, 1)
      ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, until = excluded.until, last_at = excluded.last_at, manual = 1`)
      .bind(ip, str(raw.memo, 100) || '운영자가 직접 차단', t + days * DAY, t, t).run();
    await db.prepare('DELETE FROM sec_allow WHERE ip = ?').bind(ip).run();
    await audit(db, request, 'SEC_BLOCK', ip, days >= 3650 ? '계속' : `${days}일`);
    return json({ ok: true });
  }
  m = path.match(/^\/api\/sec\/blocks\/([0-9a-fA-F:.%]+)$/);
  if (m && method === 'DELETE') {
    await db.prepare('UPDATE sec_blocks SET until = 0 WHERE ip = ?').bind(decodeURIComponent(m[1])).run(); // 기록은 남겨 다시 걸리면 7일
    await audit(db, request, 'SEC_UNBLOCK', decodeURIComponent(m[1]));
    return json({ ok: true });
  }
  if (path === '/api/sec/allow' && method === 'POST') {
    const raw = await body(request);
    const ip = str(raw.ip, 64);
    if (!/^[0-9a-fA-F:.]{3,64}$/.test(ip)) throw bad('IP 주소를 확인해 주세요.');
    await db.batch([
      db.prepare('INSERT OR REPLACE INTO sec_allow (ip, memo, created_at) VALUES (?, ?, ?)').bind(ip, str(raw.memo, 100), now()),
      db.prepare('UPDATE sec_blocks SET until = 0 WHERE ip = ?').bind(ip),
    ]);
    await audit(db, request, 'SEC_ALLOW', ip, str(raw.memo, 100));
    return json({ ok: true });
  }
  m = path.match(/^\/api\/sec\/allow\/([0-9a-fA-F:.%]+)$/);
  if (m && method === 'DELETE') {
    await db.prepare('DELETE FROM sec_allow WHERE ip = ?').bind(decodeURIComponent(m[1])).run();
    await audit(db, request, 'SEC_UNALLOW', decodeURIComponent(m[1]));
    return json({ ok: true });
  }

  // 수정요청
  if (path === '/api/requests' && method === 'GET') {
    const status = url.searchParams.get('status');
    const where = STATUSES.includes(status) ? 'WHERE r.status = ?' : '';
    const stmt = db.prepare(`
      SELECT r.*, s.slug, s.domain, s.name AS site_name, a.username, COALESCE(r.requester, a.name) AS admin_name,
        (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id) AS msg_count,
        (SELECT side FROM request_messages m WHERE m.request_id = r.id ORDER BY m.id DESC LIMIT 1) AS last_side,
        ((CASE WHEN r.created_at > r.op_seen_at THEN 1 ELSE 0 END) + (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id AND m.side = 'site' AND m.created_at > r.op_seen_at)) AS op_unread
      FROM requests r JOIN sites s ON s.id = r.site_id LEFT JOIN site_admins a ON a.id = r.admin_id
      ${where} ORDER BY (r.status = 'done'), r.id DESC LIMIT 200`);
    const { results } = await (where ? stmt.bind(status) : stmt).all();
    // 요청 본문의 사진 · 첨부는 그 사이트 주소에 있다 → xim 에서 볼 수 있게 사이트 주소를 붙여 준다
    return json(results.map((r) => ({ ...r, site_url: siteUrl({ slug: r.slug, domain: r.domain }), attachments: JSON.parse(r.attachments || '[]') })));
  }
  // 요청 하나 + 주고받은 글
  m = path.match(/^\/api\/requests\/(\d+)$/);
  if (m && method === 'GET') {
    const r = await db.prepare(`SELECT r.*, s.slug, s.domain, s.name AS site_name FROM requests r JOIN sites s ON s.id = r.site_id WHERE r.id = ?`).bind(+m[1]).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    const { results } = await db.prepare('SELECT id, side, author, body, attachments, status, created_at FROM request_messages WHERE request_id = ? ORDER BY id').bind(r.id).all();
    await db.prepare('UPDATE requests SET op_seen_at = ? WHERE id = ?').bind(now(), r.id).run(); // 운영자가 읽음
    return json({ ...r, site_url: siteUrl(r), attachments: JSON.parse(r.attachments || '[]'), messages: results.map((x) => ({ ...x, attachments: JSON.parse(x.attachments || '[]') })) });
  }
  // 요청 지우기 (운영자)
  if (m && method === 'DELETE') {
    const r = await db.prepare('SELECT s.slug, r.title FROM requests r JOIN sites s ON s.id = r.site_id WHERE r.id = ?').bind(+m[1]).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    await deleteRequest(db, env.XMS_DB, env.FILES, +m[1], r.slug);
    await audit(db, request, 'REQUEST_DELETE', `${r.slug} #${m[1]}`, r.title || '');
    return json({ ok: true });
  }
  // 운영자 답변: 글 · 파일(없어도 됨) + 상태
  m = path.match(/^\/api\/requests\/(\d+)\/messages$/);
  if (m && method === 'POST') {
    const r = await db.prepare('SELECT r.id, r.status, s.slug FROM requests r JOIN sites s ON s.id = r.site_id WHERE r.id = ?').bind(+m[1]).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    const raw = await body(request);
    const status = STATUSES.includes(raw.status) ? raw.status : r.status;
    const text = str(raw.body, 10000);
    const ids = (Array.isArray(raw.attachments) ? raw.attachments : []).map(String).filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 30);
    let atts = [];
    if (ids.length) {
      const { results: ups } = await env.XMS_DB.prepare(`SELECT id, name, size, kind, mime FROM uploads WHERE site = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(r.slug, ...ids).all();
      atts = ids.map((id) => ups.find((u) => u.id === id)).filter(Boolean);
    }
    if (!text && !atts.length && status === r.status) throw bad('답변을 적거나 파일을 붙이거나 상태를 바꿔 주세요.');
    const t = now();
    await db.batch([
      db.prepare("INSERT INTO request_messages (request_id, side, author, body, attachments, status, created_at) VALUES (?, 'op', '운영자', ?, ?, ?, ?)")
        .bind(r.id, text, JSON.stringify(atts), status !== r.status ? status : '', t),
      db.prepare('UPDATE requests SET status = ?, updated_at = ?, op_seen_at = ? WHERE id = ?').bind(status, t, t, r.id),
    ]);
    await audit(db, request, 'REQUEST_REPLY', `${r.slug} #${r.id}`, [status !== r.status ? `상태 ${STATUS_NAME[r.status]} → ${STATUS_NAME[status]}` : '', atts.length ? `파일 ${atts.length}개` : '', text.slice(0, 80)].filter(Boolean).join(' · '));
    return json({ ok: true, status });
  }
  // 운영자가 답변에 붙일 파일 → 그 사이트 xms 저장소(R2 + xms uploads)로. 주소는 사이트주소/xms/upload/<id>
  m = path.match(/^\/api\/requests\/(\d+)\/upload$/);
  if (m && method === 'POST') {
    const r = await db.prepare('SELECT s.slug FROM requests r JOIN sites s ON s.id = r.site_id WHERE r.id = ?').bind(+m[1]).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    if (!env.FILES) throw bad('파일 저장소(R2)가 연결돼 있지 않습니다.');
    const mime = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    let name = '';
    try { name = decodeURIComponent(request.headers.get('X-File-Name') || ''); } catch { name = ''; }
    name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) throw bad('빈 파일입니다.');
    if (buf.byteLength > 20 * 1024 * 1024) throw bad('파일이 너무 큽니다 (20MB 까지).');
    const kind = /^image\/(png|jpeg|gif|webp)$/.test(mime) ? 'IMAGE' : 'FILE';
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `${r.slug}/${id}`;
    await env.FILES.put(key, buf, { httpMetadata: { contentType: mime } });
    await env.XMS_DB.prepare('INSERT INTO uploads (id, site, post_id, kind, name, mime, size, data, r2_key, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)')
      .bind(id, r.slug, -(+m[1]), kind, name, mime, buf.byteLength, key, now()).run();
    return json({ id, name, size: buf.byteLength, kind, mime });
  }
  m = path.match(/^\/api\/requests\/(\d+)$/);
  if (m && method === 'PUT') {
    const raw = await body(request);
    if (!STATUSES.includes(raw.status)) throw bad('상태 값이 잘못됐습니다.');
    await db.prepare('UPDATE requests SET status = ?, reply = ?, updated_at = ? WHERE id = ?')
      .bind(raw.status, str(raw.reply, 5000), now(), +m[1]).run();
    await audit(db, request, 'REQUEST_STATUS', `#${m[1]}`, STATUS_NAME[raw.status]);
    return json({ ok: true });
  }

  // GitHub에서 연결: webmaker 저장소 폴더 주소 → GitHub Actions(xim-connect.yml) 가 빌드 · 연결 · 등록 · 배포
  if (path === '/api/connect' && method === 'POST') {
    const folder = repoFolder(str((await body(request)).url, 300));
    await github(env, `/contents/${encodeURIComponent(folder)}?ref=main`).then((list) => {
      if (!Array.isArray(list)) throw bad(`"${folder}" 는 폴더가 아닙니다.`);
      if (!list.some((f) => f.type === 'file' && /\.html?$/i.test(f.name))) throw bad(`"${folder}" 폴더에 html 파일이 없습니다. 정적 홈페이지 폴더를 넣어 주세요.`);
    }, (e) => { throw e.status === 404 ? bad(`저장소에 "${folder}" 폴더가 없습니다. 먼저 GitHub 에 올라가 있어야 합니다.`) : e; });
    await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, { ref: 'main', inputs: { folder } });
    await audit(db, request, 'CONNECT', folder, 'GitHub에서 연결');
    return json({ ok: true, folder });
  }
  if (path === '/api/connect/runs' && method === 'GET') {
    if (!env.GITHUB_TOKEN) return json({ ready: false, runs: [] });
    const r = await github(env, `/actions/workflows/${WORKFLOW}/runs?per_page=10`);
    return json({
      ready: true,
      runs: (r.workflow_runs || []).map((x) => ({
        id: x.id, title: x.display_title, status: x.status, conclusion: x.conclusion, created_at: Date.parse(x.created_at), url: x.html_url,
      })),
    });
  }

  // 관리 로그 — 1개월만 남긴다 (xms 와 같음)
  if (path === '/api/audit' && method === 'GET') {
    await db.prepare('DELETE FROM audit_log WHERE created_at < ?').bind(now() - 31 * DAY).run();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const total = (await db.prepare('SELECT COUNT(*) AS n FROM audit_log').first()).n;
    const { results } = await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').bind(20, (page - 1) * 20).all();
    return json({ total, page, size: 20, rows: results });
  }

  throw new HttpError(404, '없는 주소입니다.');
}

const STATUS_NAME = { new: '접수', doing: '처리 중', done: '완료' };
// 고친 항목만 "이름: 가 → 나" 로 (길면 자름)
function changed(before, after, labels) {
  if (!before) return '';
  const cut = (v) => { const t = String(v ?? '').replace(/\s+/g, ' '); return t.length > 30 ? `${t.slice(0, 30)}…` : t || '(없음)'; };
  return Object.entries(labels).filter(([k]) => String(before[k] ?? '') !== String(after[k] ?? ''))
    .map(([k, l]) => (k === 'memo' ? `${l} 고침` : `${l}: ${cut(before[k])} → ${cut(after[k])}`)).join(' · ');
}

// ───────── 사이트별 사용량 (xms DB 기준, 바이트) ─────────
//   db    : 회원 · 글 · 댓글 · 메뉴 · 게시판 · 약관 · 팝업 · 관리 로그 등 글자 데이터 (줄마다 대략 크기를 더함)
//   files : 올린 사진 · 첨부 (R2 + DB 에 둔 것) + 파비콘 · 미리보기 · 팝업 그림
async function siteUsage(env) {
  const x = env.XMS_DB;
  // D1 은 UNION 으로 묶을 수 있는 SELECT 수가 적어 표마다 따로 묻고 더한다
  const DB_QUERIES = [
    "SELECT site, SUM(length(login_id) + length(pw_hash) + length(pw_salt) + length(name) + length(nickname) + length(email) + length(mobile) + length(phone) + length(extra) + 120) AS n FROM members GROUP BY site",
    "SELECT site, SUM(length(title) + length(content_html) + COALESCE(length(blocks), 0) + length(writer_name) + 100) AS n FROM posts GROUP BY site",
    "SELECT site, SUM(length(body) + length(writer_name) + 60) AS n FROM comments GROUP BY site",
    "SELECT site, SUM(length(content) + 40) AS n FROM documents GROUP BY site",
    "SELECT site, SUM(length(title) + length(path) + 60) AS n FROM menus GROUP BY site",
    "SELECT site, SUM(length(name) + length(slug) + length(options) + 120) AS n FROM boards GROUP BY site",
    "SELECT site, SUM(length(actor_name) + length(target) + length(detail) + length(ip) + 60) AS n FROM audit_log GROUP BY site",
    "SELECT site, SUM(length(title) + length(body) + length(link_url) + 80) AS n FROM popups GROUP BY site",
    "SELECT site, SUM(length(level_names) + length(signup_fields)) AS n FROM site_settings GROUP BY site",
    "SELECT site, SUM(length(title) + length(description) + length(verify) + length(robots) + length(share_description)) AS n FROM site_seo GROUP BY site",
    "SELECT site, COUNT(*) * 40 AS n FROM visit_days GROUP BY site",
    "SELECT site, SUM(length(path) + 30) AS n FROM visit_pages GROUP BY site",
    "SELECT site, SUM(length(ref) + 30) AS n FROM visit_refs GROUP BY site"
  ];
  const res = await x.batch([
    ...DB_QUERIES.map((q) => x.prepare(q)),
    x.prepare("SELECT site, COUNT(*) AS c, COALESCE(SUM(size), 0) AS total, COALESCE(SUM(CASE WHEN r2_key IS NOT NULL THEN size ELSE 0 END), 0) AS r2 FROM uploads GROUP BY site"),
    x.prepare('SELECT site, COUNT(*) AS c, COALESCE(SUM(length(data)), 0) * 3 / 4 AS total FROM site_files GROUP BY site'),
  ]);
  const upRows = res[DB_QUERIES.length];
  const sfRows = res[DB_QUERIES.length + 1];
  const out = {};
  const get = (s) => (out[s] ??= { db: 0, files: 0, file_count: 0, r2: 0, d1_files: 0 });
  for (const q of res.slice(0, DB_QUERIES.length)) for (const r of q.results) get(r.site).db += r.n || 0;
  for (const r of upRows.results) { const u = get(r.site); u.files += r.total; u.file_count += r.c; u.r2 += r.r2; u.d1_files += r.total - r.r2; }
  for (const r of sfRows.results) { const u = get(r.site); u.files += r.total; u.file_count += r.c; u.d1_files += r.total; }
  return out;
}

// ───────── GitHub (webmaker 저장소) ─────────
const REPO = 'xiangdolee-pixel/webmaker2';
const WORKFLOW = 'xim-connect.yml';
// https://github.com/xiangdolee-pixel/webmaker2/tree/main/sjccc(/…) 또는 그냥 sjccc → 폴더 이름
function repoFolder(input) {
  let s = input.trim().replace(/[?#].*$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/([^/]+)\/([^/]+))?/i);
  if (m) {
    if (`${m[1]}/${m[2]}`.toLowerCase() !== REPO) throw bad(`${REPO} 저장소의 폴더 주소만 넣을 수 있습니다.`);
    if (!m[4]) throw bad('저장소 주소 뒤에 폴더까지 넣어 주세요. 예) https://github.com/xiangdolee-pixel/webmaker2/tree/main/sjccc');
    if (m[3] !== 'main') throw bad('main 브랜치의 폴더만 연결할 수 있습니다.');
    s = decodeURIComponent(m[4]);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(s) || s.startsWith('.')) throw bad('폴더 주소를 확인해 주세요. 예) https://github.com/xiangdolee-pixel/webmaker2/tree/main/sjccc');
  if (['xim', 'xms', 'dist', 'node_modules'].includes(s.toLowerCase())) throw bad('그 폴더는 연결할 수 없습니다.');
  return s;
}
async function github(env, path, data) {
  if (!env.GITHUB_TOKEN) throw new HttpError(503, 'GitHub 토큰이 아직 없습니다. 처음 한 번 설정이 필요합니다(보안 탭 안내).');
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'xim',
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (res.status === 204) return null;
  const out = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new HttpError(res.status === 404 ? 404 : 502, `GitHub 요청이 실패했습니다 (${res.status}${out?.message ? `: ${out.message}` : ''})`);
    throw e;
  }
  return out;
}

function customerFields(raw) {
  const name = str(raw.name, 80);
  if (!name) throw bad('고객 이름을 넣어 주세요.');
  return { name, contact: str(raw.contact, 40), phone: str(raw.phone, 40), email: str(raw.email, 120), memo: str(raw.memo) };
}
// 대표 도메인 → Cloudflare Email Sending 등록, 결과를 사이트에 적어 둔다 (카드에 보임)
//   + 봇 확인(Turnstile) 위젯도 함께 (키는 xim DB 에 두고 xms 가 읽는다)
async function mailRegister(env, id, domain) {
  const site = await env.DB.prepare('SELECT slug, turnstile_sitekey FROM sites WHERE id = ?').bind(id).first();
  const mail = await ensureMailDomain(env.CF_MAIL_TOKEN, domain);
  const bot = await ensureTurnstile(env.CF_MAIL_TOKEN, ACCOUNT_ID, {
    slug: site.slug, sitekey: site.turnstile_sitekey, hosts: [domain, `${site.slug}.${WORKERS_SUB}.workers.dev`],
  });
  if (bot.secret) await env.DB.prepare('UPDATE sites SET turnstile_sitekey = ?, turnstile_secret = ? WHERE id = ?').bind(bot.sitekey, bot.secret, id).run();
  // 메일 · 봇 확인을 따로 적는다 (카드에 표시 두 개)
  await env.DB.prepare('UPDATE sites SET mail_status = ?, mail_note = ?, bot_status = ?, bot_note = ? WHERE id = ?')
    .bind(mail.status, `메일: ${mail.message}`.slice(0, 300), bot.status, bot.message.slice(0, 300), id).run();
  const ok = (x) => ['ok', 'added'].includes(x.status);
  return { status: ok(mail) && ok(bot) ? 'ok' : mail.status === 'error' || bot.status === 'error' ? 'error' : 'skip', message: `메일: ${mail.message} · ${bot.message}` };
}


function siteFields(raw) {
  const name = str(raw.name, 80);
  if (!name) throw bad('사이트 이름을 넣어 주세요.');
  const quota = Math.round(Number(raw.quota_mb));
  if (!Number.isFinite(quota) || quota < 0 || quota > 1000000) throw bad('용량은 0 이상 숫자(MB)로 넣어 주세요.');
  const status = raw.status === 'suspended' ? 'suspended' : 'active';
  const customer = raw.customer_id ? Number(raw.customer_id) : null;
  return {
    name,
    customer_id: Number.isInteger(customer) && customer > 0 ? customer : null,
    domain: str(raw.domain, 200),
    status,
    quota_mb: quota,
    memo: str(raw.memo),
  };
}

// ───────────────────────── 엔진: 고객 사이트용 ─────────────────────────

// 업체 사이트 주소: 도메인이 있으면 그 주소, 없으면 workers.dev
const WORKERS_SUB = 'xiangdolee';
const ACCOUNT_ID = 'f225d506d8cf6ddf97704a36c69f5ce7'; // xiangdolee 계정
// ── 포트폴리오2 그림: R2(FILES) 의 pf2/<무작위> 에 둔다 ──
const PF2_IMG = /^image\/(png|jpeg|webp|gif)$/;
const PF2_MAX = 5 * 1024 * 1024;
async function pf2Put(env, buf, mime) {
  if (!env.FILES) throw bad('파일 저장소(R2)가 연결돼 있지 않습니다.');
  const key = `pf2/${randomHex(16)}`;
  await env.FILES.put(key, buf, { httpMetadata: { contentType: mime } });
  return key;
}
// 미리보기 그림을 한 번 받아 저장 (못 받으면 '' → 이름 첫 글자로 보임)
async function pf2SaveRemote(env, src) {
  try {
    const r = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; xim-portfolio/1.0)', Accept: 'image/*' } });
    const mime = (r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !PF2_IMG.test(mime)) return '';
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > PF2_MAX) return '';
    return await pf2Put(env, buf, mime);
  } catch { return ''; }
}
async function pf2DropImage(env, key) {
  if (/^pf2\/[a-f0-9]{32}$/.test(key || '')) await env.FILES?.delete(key).catch(() => {});
}
async function pf2Image(env, key) {
  const obj = /^pf2\/[a-f0-9]{32}$/.test(key || '') ? await env.FILES?.get(key) : null;
  if (!obj) return new Response('Not found', { status: 404 });
  // 이름이 그림마다 새로 생기므로(바꾸면 새 이름) 오래 캐시해도 된다
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}

// 포트폴리오2 주소 다듬기 (잘못되면 400)
function pf2Url(v) { const u = cleanUrl(v); if (!u.ok) throw bad(u.error); return u.url; }

function siteUrl(site) {
  const d = String(site.domain || '').trim().replace(/^https?:[/][/]/, '').replace(/[/].*$/, '');
  return d ? `https://${d}` : `https://${site.slug}.${WORKERS_SUB}.workers.dev`;
}

function suspendedPage(site) {
  const name = (site?.name || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>서비스 일시 중단</title>
<style>*{-webkit-tap-highlight-color:transparent}body{margin:0;min-height:100vh;display:grid;place-items:center;
font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f4f5f7;color:#222;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}h1{font-size:1.4rem;margin:0 0 12px}p{margin:0;line-height:1.7;color:#555}</style>
</head><body><main><h1>서비스 일시 중단</h1><p>${name ? `${name} 홈페이지는` : '이 홈페이지는'} 현재 이용할 수 없습니다.<br>관리자에게 문의해 주세요.</p></main></body></html>`,
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '3600' } });
}

const getSite = (env, slug) =>
  SLUG_RE.test(slug || '') ? env.DB.prepare('SELECT * FROM sites WHERE slug = ?').bind(slug).first() : null;

export class Engine extends WorkerEntrypoint {
  // 고객 사이트 Worker 가 요청마다(30초 캐시) 묻는다
  async status(slug) {
    const site = await getSite(this.env, slug);
    return site ? site.status : 'unknown';
  }

  // 포트폴리오 사이트가 묻는다: 포트폴리오에 켜 둔 운영 중 사이트 [{ slug, name, url }] (만든 차례)
  async portfolio() {
    const { results } = await this.env.DB.prepare("SELECT slug, name, domain, portfolio_tag FROM sites WHERE portfolio = 1 AND status = 'active' ORDER BY id").all();
    const list = results.map((s) => ({ slug: s.slug, name: s.name, url: `${siteUrl(s)}/`, tag: s.portfolio_tag || '' }));
    // 포트폴리오2(xim 밖의 사이트)는 그 뒤에: 글 · 그림을 그대로 넘긴다
    const { results: links } = await this.env.DB.prepare('SELECT * FROM portfolio_links WHERE shown = 1 ORDER BY sort, id').all().catch(() => ({ results: [] }));
    return list.concat(links.map((l) => ({ slug: '', name: l.name, url: l.url, tag: l.tag || '', extra: { name: l.name, desc: l.description, image: l.image ? `/pf2-img/${l.image.slice(4)}` : '', tag: l.tag } })));
  }

  // 보안 감시: 이 IP 가 지금 막혀 있나 (사이트 Worker 가 IP 마다 60초 캐시)
  async secCheck(ip) {
    const db = this.env.DB;
    const allow = await db.prepare('SELECT 1 FROM sec_allow WHERE ip = ?').bind(ip).first();
    if (allow) return false;
    const b = await db.prepare('SELECT until FROM sec_blocks WHERE ip = ? AND until > ?').bind(ip, now()).first();
    return !!b;
  }

  // 의심 요청 기록 + 자동 차단 판단 → { blocked }
  async secReport(e) {
    const db = this.env.DB;
    const ip = String(e.ip || '').slice(0, 64);
    if (!ip) return { blocked: false };
    const t = now();
    const allowed = await db.prepare('SELECT 1 FROM sec_allow WHERE ip = ?').bind(ip).first();
    let block = null;
    if (!allowed) {
      if (e.reason === 'attack') block = '공격 주소';
      else {
        const c = await db.prepare("SELECT COUNT(*) AS n FROM sec_events WHERE ip = ? AND reason = '404' AND at > ?").bind(ip, t - SEC_WINDOW).first();
        if (c.n + 1 >= SEC_404_LIMIT) block = `없는 주소 ${SEC_404_LIMIT}번 이상(10분)`;
      }
    }
    const stmts = [db.prepare('INSERT INTO sec_events (at, site, ip, country, method, path, ua, reason, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(t, String(e.site || '').slice(0, 40), ip, String(e.country || '').slice(0, 4), String(e.method || '').slice(0, 8), String(e.path || '').slice(0, 300), String(e.ua || '').slice(0, 200), e.reason === 'attack' ? 'attack' : '404', block ? 'block' : 'log')];
    if (block) {
      // 처음이면 하루, 전에도 막힌 적이 있으면 7일
      const prev = await db.prepare('SELECT hits FROM sec_blocks WHERE ip = ?').bind(ip).first();
      const until = t + (prev ? 7 : 1) * DAY;
      stmts.push(db.prepare(`INSERT INTO sec_blocks (ip, reason, until, hits, country, site, created_at, last_at, manual) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 0)
        ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, until = MAX(sec_blocks.until, excluded.until), hits = sec_blocks.hits + 1, last_at = excluded.last_at, site = excluded.site`)
        .bind(ip, block, until, String(e.country || '').slice(0, 4), String(e.site || '').slice(0, 40), t, t));
    }
    if (Math.random() < 0.02) stmts.push(db.prepare('DELETE FROM sec_events WHERE at < ?').bind(t - 14 * DAY)); // 2주 지난 기록 정리
    await db.batch(stmts);
    return { blocked: !!block };
  }

  async fetch(request) {
    const url = new URL(request.url);
    // 포트폴리오2 그림 (portfolio 사이트가 /pf2-img/<이름> 을 이리로 넘긴다)
    const pi = url.pathname.match(/^\/__pf2img\/([a-f0-9]{32})$/);
    if (pi) return pf2Image(this.env, `pf2/${pi[1]}`);
    const site = await getSite(this.env, request.headers.get('X-Xim-Site'));
    if (url.pathname === '/__suspended') return suspendedPage(site);
    if (!site) return new Response('xim 에 등록되지 않은 사이트입니다.', { status: 404 });

    return new Response('Not found', { status: 404 });
  }
}

// ───────────────────────── 기본 export: xim 운영자 화면 ─────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await ximApi(request, env, url, ctx); } catch (e) { return fail(e); }
    }
    // 스튜디오 공개 주소(그림 · 방송용 슬라이드쇼) — 주소를 아는 사람만, 로그인 없음
    if (url.pathname.startsWith('/studio/')) {
      try { const r = await studioPublic(request, env, url); if (r) return r; } catch (e) { return fail(e); }
    }
    return staticFile(request, env, url);
  },
};

// 화면 파일: 배포 번호(?v=)를 붙여 한 번 받으면 브라우저가 다시 묻지 않게 (배포하면 번호가 바뀌어 새로 받음)
//   index.html → css · js 주소에 ?v=번호,  js 안의 import './x.js' 에도 같은 번호.  번호 붙은 파일 = 1년, 첫 화면 = 매번 확인
async function staticFile(request, env, url) {
  const v = String(env.VER?.id || 'dev').slice(0, 8);
  const res = await env.ASSETS.fetch(request);
  if (!res.ok) return res;
  const p = url.pathname;
  if (p === '/' || p === '/index.html') {
    const out = new HTMLRewriter()
      .on('link[href^="css/"]', { element(el) { el.setAttribute('href', `${el.getAttribute('href')}?v=${v}`); } })
      .on('script[src^="js/"]', { element(el) { el.setAttribute('src', `${el.getAttribute('src')}?v=${v}`); } })
      .transform(res);
    const r = new Response(out.body, out);
    r.headers.set('Cache-Control', 'no-cache');
    return r;
  }
  let r;
  if (p.endsWith('.js')) {
    const js = (await res.text()).replace(/((?:from|import)\s*\(?\s*['"])(\.\/[\w-]+\.js)(['"])/g, `$1$2?v=${v}$3`);
    r = new Response(js, res);
    r.headers.delete('Content-Length');
  } else r = new Response(res.body, res);
  r.headers.set('Cache-Control', url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60');
  return r;
}
