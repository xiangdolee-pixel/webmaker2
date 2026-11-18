// 테스트모드 (사용자 지시 2026-11-18 — "누구한테 보여줄 때": 관리자처럼 마음껏 고쳐 보고, 로그아웃하면 모두 원래대로)
//
//   xim 사이트 줄의 '테스트모드' 스위치(xim DB sites.test_mode = 1)를 켠 사이트만, 홈페이지 로그인 화면에 '테스트모드로 둘러보기' 단추가 생긴다.
//   실제 자료는 건드리지 않는다: 누를 때마다 그 사람만의 사본(site = '<사이트>--t<10자>')을 만들어 그 안에서만 읽고 쓴다.
//     · 사본에 옮기는 것: 설정 · 메뉴 · 게시판 · 최근 글 · 댓글 · 첨부(같은 R2 파일을 가리키기만) · 수정 모드 글자 · 팝업 · 파비콘
//     · 옮기지 않는 것: 회원 · 문의 · 신청서 · 강의 수강 기록 등 사람 정보 (사본에는 '테스트 관리자' 한 명만 있다)
//     · 사이트 Worker 가 쿠키 xms_test 를 보고 X-Xim-Site 를 사본 이름으로 바꿔 보낸다 → xms 의 모든 쿼리가 저절로 사본만 본다
//     · xim DB(사이트 정보)는 읽기만 · 실제 사이트 이름으로, 쓰기와 유지보수 요청은 막는다. R2 는 사본이 올린 파일만 지운다.
//   끝내기(로그아웃 · '테스트 끝내기' · 2시간 지남): 사본의 줄과 사본이 올린 파일을 모두 지운다.
import { now, randomHex, setCookie, SESS_COOKIE, createSession, clientIp, HttpError } from './lib.js';

export const TEST_COOKIE = 'xms_test';
const TEST_RE = /^([a-z0-9][a-z0-9-]{1,26})--t([0-9a-f]{10})$/;
const LIFE = 2 * 3600000;          // 사본 수명 2시간
const MAX_ALIVE = 20;              // 한 사이트에 동시에 살아 있는 사본
const MAX_PER_IP = 8;              // 한 주소에서 1시간에 만들 수 있는 수
const MAX_POSTS = 200, MAX_COMMENTS = 500, MAX_UPLOADS = 600;

export const testOf = (site) => { const m = TEST_RE.exec(site || ''); return m ? { base: m[1], id: m[2] } : null; };

const TABLE = `CREATE TABLE IF NOT EXISTS test_sandboxes (site TEXT PRIMARY KEY, base TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', admin_id INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`;
let tableReady = false;
async function ready(db) { if (!tableReady) { await db.prepare(TABLE).run(); tableReady = true; } }

// 살아 있는 사본인가 (20초 기억). 아니면 호출한 쪽이 실제 사이트로 돌린다 — 지난 쿠키 · 지어낸 쿠키는 그냥 보통 방문자가 된다.
const alive = new Map();
export async function sandboxAlive(db, site) {
  const hit = alive.get(site);
  if (hit && Date.now() - hit < 20000) return true;
  let row = null;
  try { row = await db.prepare('SELECT expires_at FROM test_sandboxes WHERE site = ?').bind(site).first(); } catch { return false; }
  if (!row || row.expires_at < now()) { alive.delete(site); return false; }
  if (alive.size > 500) alive.clear();
  alive.set(site, Date.now());
  return true;
}

// 이 사이트에 테스트모드가 켜져 있나 (xim 스위치)
export async function testEnabled(env, site) {
  try { return !!(await env.XIM_DB.prepare('SELECT test_mode FROM sites WHERE slug = ?').bind(site).first())?.test_mode; } catch { return false; }
}

// 사본 안에서 쓰는 env: xim DB 는 실제 사이트 이름으로 읽기만(쓰기 · 유지보수 요청은 아무 일도 안 함), R2 는 사본이 올린 것만 지움
const NOOP = { bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: {}, results: [] }) };
export function sandboxEnv(env, sand, base) {
  const xim = env.XIM_DB, files = env.FILES;
  const mine = (k) => String(k).startsWith(`${sand}/`) || String(k).startsWith(`sitefile/${sand}/`);
  const out = Object.create(env);
  Object.defineProperty(out, 'XIM_DB', { value: {
    prepare(sql) {
      if (/^\s*(insert|update|delete|replace)\b/i.test(sql) || /\brequests\b|\brequest_messages\b/i.test(sql)) return NOOP;
      const st = xim.prepare(sql);
      return { bind: (...a) => st.bind(...a.map((x) => (x === sand ? base : x))), first: (...a) => st.first(...a), all: () => st.all(), run: () => st.run() };
    },
    batch: async (list) => (list.some((s) => s === NOOP) ? [] : xim.batch(list)),
  } });
  if (files) Object.defineProperty(out, 'FILES', { value: {
    get: (...a) => files.get(...a), head: (...a) => files.head(...a), put: (...a) => files.put(...a), list: (...a) => files.list(...a),
    delete: async (keys) => { const own = [].concat(keys).filter(mine); if (own.length) await files.delete(own); },
  } });
  return out;
}

// ───── 사본 만들기 ─────
// DB 를 부르는 횟수를 줄이려고(무료 요금제는 요청 하나에 50번) 읽기 · 쓰기를 묶음(batch)으로 한다.
// 줄을 그대로 옮긴다(SELECT * → INSERT): 칸이 나중에 늘어도 따라온다. id 는 새로 받고, site 는 사본 이름으로, fix 로 이어진 번호를 고친다.
function inserts(db, table, rows, sand, fix) {
  return rows.map((row) => {
    const r = { ...row, site: sand };
    const hadId = 'id' in r;
    delete r.id;
    if (fix) fix(r, row);
    const cols = Object.keys(r);
    return db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})${hadId ? ' RETURNING id' : ''}`).bind(...cols.map((c) => r[c]));
  });
}
// 묶음 실행 (80개씩) → 새 id 들 (RETURNING 이 없는 문장은 null)
async function runAll(db, stmts) {
  const ids = [];
  for (let i = 0; i < stmts.length; i += 80) {
    const res = await db.batch(stmts.slice(i, i + 80));
    for (const x of res) ids.push(x.results?.[0]?.id ?? null);
  }
  return ids;
}
const allOf = async (db, sql, ...binds) => (await db.prepare(sql).bind(...binds).all()).results || [];

async function seed(db, base, sand) {
  const SIMPLE = ['site_settings', 'site_seo', 'site_features', 'site_options', 'page_texts', 'documents'];
  // ① 한 번에 읽기
  const read = await db.batch([
    ...SIMPLE.map((t) => db.prepare(`SELECT * FROM ${t} WHERE site = ?`).bind(base)),
    db.prepare('SELECT * FROM popups WHERE site = ?').bind(base),
    db.prepare('SELECT * FROM boards WHERE site = ? AND deleted_at IS NULL').bind(base),
    db.prepare('SELECT * FROM menus WHERE site = ? ORDER BY sort, id').bind(base),
    db.prepare(`SELECT * FROM posts WHERE site = ? AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT ${MAX_POSTS}`).bind(base),
    db.prepare(`SELECT * FROM comments WHERE site = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ${MAX_COMMENTS}`).bind(base),
    db.prepare(`SELECT id, post_id FROM uploads WHERE site = ? ORDER BY created_at DESC LIMIT ${MAX_UPLOADS}`).bind(base),
  ]);
  const rows = read.map((x) => x.results || []);
  const [pops, boards, menus, posts0, comments0, ups] = rows.slice(SIMPLE.length);
  // ② 번호가 얽히지 않은 표 + 파비콘 · 공유 그림 + 팝업 · 게시판(새 번호를 받는다)
  const head = [
    ...SIMPLE.flatMap((t, i) => inserts(db, t, rows[i], sand)),
    db.prepare("INSERT INTO site_files (site, kind, mime, data, updated_at) SELECT ?, kind, mime, data, updated_at FROM site_files WHERE site = ? AND kind NOT LIKE 'popup-%'").bind(sand, base),
  ];
  const ids = await runAll(db, [...head, ...inserts(db, 'popups', pops, sand), ...inserts(db, 'boards', boards, sand)]);
  const popIds = ids.slice(head.length, head.length + pops.length);
  const bIds = ids.slice(head.length + pops.length);
  const bmap = new Map(boards.map((b, i) => [b.id, bIds[i]]));
  // ③ 메뉴 (위 단계부터 차례로) — 첫 묶음에 팝업 그림(site_files 의 popup-<번호>)도 함께
  const extra = pops.map((p, i) => (popIds[i] ? db.prepare('INSERT INTO site_files (site, kind, mime, data, updated_at) SELECT ?, ?, mime, data, updated_at FROM site_files WHERE site = ? AND kind = ?').bind(sand, `popup-${popIds[i]}`, base, `popup-${p.id}`) : null)).filter(Boolean);
  const mmap = new Map();
  let left = menus;
  for (let depth = 0; depth < 5 && (left.length || (depth === 0 && extra.length)); depth++) {
    const go = left.filter((m) => m.parent_id == null || mmap.has(m.parent_id));
    if (!go.length && !(depth === 0 && extra.length)) break;
    const st = inserts(db, 'menus', go, sand, (r, o) => { r.parent_id = o.parent_id == null ? null : mmap.get(o.parent_id); r.board_id = o.board_id == null ? null : (bmap.get(o.board_id) ?? null); });
    const got = await runAll(db, depth === 0 ? [...st, ...extra] : st);
    go.forEach((m, i) => mmap.set(m.id, got[i]));
    left = left.filter((m) => !mmap.has(m.id));
  }
  // ④ 최근 글 → 댓글 · 첨부. 첨부는 번호만 새로 받고 같은 파일을 가리킨다 → 글 안의 /xms/upload/<번호> 도 새 번호로
  const posts = posts0.filter((p) => bmap.get(p.board_id));
  if (!posts.length) return;
  const umap = new Map(ups.map((u) => [u.id, randomHex(16)]));
  const swap = (v) => (typeof v === 'string' ? v.replace(/\/xms\/upload\/([0-9a-f]{32})/g, (all, id) => (umap.has(id) ? `/xms/upload/${umap.get(id)}` : all)) : v);
  const pIds = await runAll(db, inserts(db, 'posts', posts, sand, (r, o) => {
    r.board_id = bmap.get(o.board_id); r.writer_id = null; r.content_html = swap(o.content_html); if ('blocks' in r) r.blocks = swap(o.blocks);
  }));
  const pmap = new Map(posts.map((p, i) => [p.id, pIds[i]]));
  await runAll(db, [
    ...inserts(db, 'comments', comments0.filter((c) => pmap.get(c.post_id)), sand, (r, o) => { r.post_id = pmap.get(o.post_id); r.writer_id = 0; }),
    ...ups.filter((u) => u.post_id == null || pmap.get(u.post_id)).map((u) => db.prepare(`INSERT INTO uploads (id, site, post_id, kind, name, mime, size, data, r2_key, sort, created_by, created_at)
      SELECT ?, ?, ?, kind, name, mime, size, data, r2_key, sort, NULL, created_at FROM uploads WHERE id = ? AND site = ?`).bind(umap.get(u.id), sand, u.post_id == null ? null : pmap.get(u.post_id), u.id, base)),
  ]);
}

const twoCookies = (data, cookies) => {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), { headers: h });
};

// POST /xms-api/test/start (실제 사이트에서, 스위치가 켜져 있을 때만) → 사본을 만들고 그 안의 '테스트 관리자'로 로그인
export async function startTest(env, site, request) {
  const db = env.DB;
  if (testOf(site) || site.length > 27) throw new HttpError(400, '테스트모드를 시작할 수 없습니다.');
  if (!(await testEnabled(env, site))) throw new HttpError(403, '이 사이트는 테스트모드를 쓰지 않습니다.');
  await ready(db);
  // 지난 사본 치우기 (조금씩)
  const old = await allOf(db, 'SELECT site FROM test_sandboxes WHERE expires_at < ? LIMIT 2', now());
  for (const o of old) await wipe(env, o.site).catch((e) => console.error('테스트 사본 정리 실패', e));
  const ip = clientIp(request);
  const [live, mineN] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM test_sandboxes WHERE base = ? AND expires_at > ?').bind(site, now()).first(),
    db.prepare('SELECT COUNT(*) AS n FROM test_sandboxes WHERE ip = ? AND created_at > ?').bind(ip, now() - 3600000).first(),
  ]);
  if (live.n >= MAX_ALIVE) throw new HttpError(429, '지금은 테스트 중인 분이 많습니다. 잠시 뒤 다시 눌러 주세요.');
  if (mineN.n >= MAX_PER_IP) throw new HttpError(429, '테스트모드를 너무 자주 시작했습니다. 잠시 뒤 다시 눌러 주세요.');
  const id = randomHex(5), sand = `${site}--t${id}`, t = now();
  await db.prepare('INSERT INTO test_sandboxes (site, base, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(sand, site, ip, t, t + LIFE).run();
  try {
    await seed(db, site, sand);
    const adm = await db.prepare(`INSERT INTO members (site, login_id, pw_hash, pw_salt, name, nickname, level, email, status, created_at)
      VALUES (?, 'test@test.local', '-', '-', '테스트 관리자', '테스트 관리자', 1, 'test@test.local', 'ACTIVE', ?) RETURNING id`).bind(sand, t).first();
    await db.prepare('UPDATE test_sandboxes SET admin_id = ? WHERE site = ?').bind(adm.id, sand).run();
    const sess = await createSession(db, sand, 'member', adm.id);
    return twoCookies({ ok: true }, [sess.replace(/; Max-Age=\d+/, '') + `; Max-Age=${LIFE / 1000}`, setCookie(TEST_COOKIE, id, LIFE / 1000)]);
  } catch (e) {
    await wipe(env, sand).catch(() => {});
    throw e;
  }
}

// 사본 지우기: site 칸이 있는 모든 표에서 사본 줄을(한 묶음으로), R2 에서 사본이 올린 파일을 지운다. (사본 이름이 아니면 절대 지우지 않는다)
async function wipe(env, sand) {
  if (!testOf(sand)) throw new Error('테스트 사본이 아닙니다.');
  const db = env.DB;
  // site 칸이 있는 표: 만든 문장(sql)에 site 칸이 적힌 것 (나중에 생긴 표도 저절로 들어온다)
  const tables = (await allOf(db, "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'test_sandboxes'"))
    .filter((x) => /^[a-z_0-9]+$/.test(x.name) && /(^|[\s(,])"?site"?\s+TEXT/im.test(String(x.sql || '').replace(/--[^\n]*/g, ''))).map((x) => x.name);   // 주석을 떼고 본다 (칸 사이에 주석이 있으면 놓치던 것 — uploads · visit_refs, 2026-11-18)
  await db.batch([
    db.prepare('DELETE FROM member_agreements WHERE member_id IN (SELECT id FROM members WHERE site = ?)').bind(sand),
    ...tables.map((n) => db.prepare(`DELETE FROM ${n} WHERE site = ?`).bind(sand)),
    db.prepare('DELETE FROM test_sandboxes WHERE site = ?').bind(sand),
  ]);
  alive.delete(sand);
  const files = env.FILES;
  if (files) {
    for (const prefix of [`${sand}/`, `sitefile/${sand}/`]) {
      const l = await files.list({ prefix, limit: 1000 });
      if (l.objects.length) await files.delete(l.objects.map((o) => o.key));
    }
  }
}

// 끝내기 (로그아웃 · '테스트 끝내기'): 사본을 지우고 쿠키 둘을 없앤다
export async function endTest(env, sand) {
  await wipe(env, sand);
  return twoCookies({ ok: true, test_ended: true }, [setCookie(SESS_COOKIE, '', 0), setCookie(TEST_COOKIE, '', 0)]);
}

// 사본 안에서 방문자 화면 보기 / 관리자로 돌아가기 (사본은 그대로 — 회원가입 같은 것도 해 볼 수 있게)
//   방문자일 때도 xms_sess 쿠키는 남긴다(없는 번호): 가장자리 캐시 · 메뉴 캐시가 '로그인한 사람'으로 보고 건너뛰어, 사본 화면이 실제 방문자 캐시와 섞이지 않는다
export async function testView(env, sand, me, as) {
  const db = env.DB;
  if (me.token) await db.prepare('DELETE FROM sessions WHERE token = ? AND site = ?').bind(me.token, sand).run();
  const row = await db.prepare('SELECT admin_id, expires_at FROM test_sandboxes WHERE site = ?').bind(sand).first();
  const left = Math.max(60, Math.round((row.expires_at - now()) / 1000));
  if (as === 'admin' && row.admin_id) {
    const sess = await createSession(db, sand, 'member', row.admin_id);
    return twoCookies({ ok: true }, [sess.replace(/; Max-Age=\d+/, '') + `; Max-Age=${left}`]);
  }
  return twoCookies({ ok: true }, [setCookie(SESS_COOKIE, randomHex(32), left)]);
}
