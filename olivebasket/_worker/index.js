/* 올리브바스켓 Worker (2026-11-04 Cloudflare Pages 에서 옮김 — xim 연결)
   - 로그인 · 가입 · 내 정보 = 사이트 회원(xms, 같은 xms_sess 쿠키). 예전 자체 로그인(/api/auth/*) · 메일 인증은 없앰
   - 구절은 예전 D1 `olivebasket` 을 그대로 쓴다 (OB_DB). 회원 = users.email 로 이어 붙인다 → 예전 구절 · 보기 방식이 그대로
     /basket        담기 · 목록 화면 (예전 /admin — /admin 은 xim 에서 관리 화면 /xms/ 로 가는 길이라 바꿈)
     /api/me        GET    { email, admin }  (손님이면 {})
     /api/items     GET · POST · PUT · DELETE?id=   (GET 은 구절마다 source_id · grp(묶음 이름)를 함께 준다)
   - 출처는 표 sources(회원별 이름 하나씩)에 두고 구절은 aphorisms.source_id 로 잇는다 (사용자 지시 2026-11-19 "출처를 db화").
     aphorisms.source 는 화면에 보이는 글 그대로. 성경 장절(잠 17:24 · 로마서 12장 1절)은 장절마다 달라 묶음 '성경' 하나로 모은다.
     예전 구절(source_id 없음)은 목록을 읽을 때 채운다
     /api/sources   PUT { id, name }  출처 이름 고치기 — 이미 있는 이름이면 그 출처로 합친다
     /api/settings  GET · PUT { weight_mode }
     /api/random    GET ?not=본 id들&last=직전 id → 구절 하나 { id, text, source, stars, mode, cycled } | { empty: true }
   - /       소개 페이지(로그인했으면 /app 으로) · /app 구절 앱 · /basket 담기
   - /login → /member/login (예전 주소로 들어와도)
   - 그 밖: xim 공통 사이트 Worker (회원 화면 · 계정 버튼 · 정적 파일) */
import site from '../../xim/_worker/site-worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const MODES = ['random', 'recent', 'stars', 'short', 'long'];
// 다른 사이트에서 담기 — 길 성경통독(bible.plators.com)의 형광펜 '올리브 담기'. 같은 plators.com 이라 xms_sess 쿠키가 함께 온다
const PARTNERS = ['https://bible.plators.com'];
const partner = (request) => { const o = request.headers.get('Origin'); return o && PARTNERS.includes(o) ? o : null; };
function withCors(res, origin) {
  if (!origin) return res;
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', origin);
  out.headers.set('Access-Control-Allow-Credentials', 'true');
  out.headers.append('Vary', 'Origin');
  return out;
}

// 지금 로그인한 xms 회원 { email, admin } | null
const seen = new Map(); // 세션 쿠키 → { me, at }
async function member(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const sess = (cookie.match(/(?:^|;\s*)xms_sess=([^;]+)/) || [])[1];
  if (!env.XMS || !sess) return null;
  const hit = seen.get(sess);
  if (hit && Date.now() - hit.at < 60000) return hit.me;
  if (seen.size > 500) seen.clear();
  try {
    const req = new Request(`${new URL(request.url).origin}/xms-api/me`, { headers: { Cookie: cookie, 'X-Xim-Site': env.XIM_SITE } });
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const d = await res.json();
    const me = d.login_id ? { email: String(d.login_id).toLowerCase(), admin: !!d.admin } : null;
    seen.set(sess, { me, at: Date.now() });
    return me;
  } catch { return null; }
}
// 회원 이메일 → 올리브바스켓 users.id (처음이면 만든다)
async function userId(db, email) {
  const row = await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first();
  if (row) return row.id;
  const r = await db.prepare('INSERT INTO users (email) VALUES (?)').bind(email).run();
  return r.meta.last_row_id;
}
const clean = (v) => {
  const text = String(v?.text ?? '').trim().slice(0, 4000);
  const source = String(v?.source ?? '').trim().slice(0, 300);
  const stars = Math.min(3, Math.max(1, Math.round(Number(v?.stars) || 1)));
  return { text, source, stars };
};

// 출처 묶음 이름: 성경 장절이면 '성경', 아니면 출처 글 그대로
const BIBLE = new Set(('창 출 레 민 신 수 삿 룻 삼상 삼하 왕상 왕하 대상 대하 스 느 에 욥 시 잠 전 아 사 렘 애 겔 단 호 욜 암 옵 욘 미 나 합 습 학 슥 말 마 막 눅 요 행 롬 고전 고후 갈 엡 빌 골 살전 살후 딤전 딤후 딛 몬 히 약 벧전 벧후 요일 요이 요삼 유 계 '
  + '창세기 출애굽기 레위기 민수기 신명기 여호수아 사사기 룻기 사무엘상 사무엘하 열왕기상 열왕기하 역대상 역대하 에스라 느헤미야 에스더 욥기 시편 잠언 전도서 아가 이사야 예레미야 예레미야애가 에스겔 다니엘 호세아 요엘 아모스 오바댜 요나 미가 나훔 하박국 스바냐 학개 스가랴 말라기 '
  + '마태복음 마가복음 누가복음 요한복음 사도행전 로마서 고린도전서 고린도후서 갈라디아서 에베소서 빌립보서 골로새서 데살로니가전서 데살로니가후서 디모데전서 디모데후서 디도서 빌레몬서 히브리서 야고보서 베드로전서 베드로후서 요한일서 요한이서 요한삼서 유다서 요한계시록').split(' '));
const BIBLE_GROUP = '성경';
function groupName(source) {
  const m = source.match(/^([가-힣]{1,7})\s*\d+\s*(?:[:：]|장)\s*\d+/);
  return m && BIBLE.has(m[1]) ? BIBLE_GROUP : source;
}
// 출처 글 → sources.id (없으면 만든다). 출처가 비었으면 null
async function sourceId(db, uid, source) {
  if (!source) return null;
  const name = groupName(source);
  await db.prepare('INSERT OR IGNORE INTO sources (user_id, name) VALUES (?, ?)').bind(uid, name).run();
  return (await db.prepare('SELECT id FROM sources WHERE user_id = ? AND name = ?').bind(uid, name).first()).id;
}
// 구절이 하나도 안 남은 출처는 지운다
const sweep = (db, uid) => db.prepare('DELETE FROM sources WHERE user_id = ?1 AND id NOT IN (SELECT source_id FROM aphorisms WHERE user_id = ?1 AND source_id IS NOT NULL)').bind(uid).run();

// 보기 방식별 무게 (가장 낮은 것도 가끔 나오게 1 ~ 10)
function pick(rows, mode) {
  if (mode === 'random') return rows[Math.floor(Math.random() * rows.length)];
  let w;
  if (mode === 'stars') w = rows.map((r) => r.stars || 1);
  else {
    const key = mode === 'recent' ? (r) => r.id : (r) => r.text.length;
    const vals = rows.map(key);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    w = vals.map((v) => {
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      return 1 + 9 * (mode === 'short' ? 1 - t : t);
    });
  }
  let n = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rows.length; i++) { n -= w[i]; if (n <= 0) return rows[i]; }
  return rows[rows.length - 1];
}

async function api(request, env, url) {
  const db = env.OB_DB;
  const path = url.pathname;
  const me = await member(request, env);
  if (path === '/api/me') return json(me || {});
  if (!me) return json({ error: '로그인이 필요합니다.' }, 401);
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && !(PARTNERS.includes(origin) && path === '/api/items' && request.method === 'POST')) return json({ error: 'bad origin' }, 403);
  }
  const uid = await userId(db, me.email);
  const body = async () => { try { return await request.json(); } catch { return {}; } };

  if (path === '/api/items') {
    if (request.method === 'GET') {
      const list = () => db.prepare('SELECT a.id, a.text, a.source, a.stars, a.created_at, a.source_id, s.name AS grp FROM aphorisms a LEFT JOIN sources s ON s.id = a.source_id AND s.user_id = a.user_id WHERE a.user_id = ? ORDER BY a.id DESC').bind(uid).all();
      let { results } = await list();
      // 예전 구절: 출처는 있는데 아직 표에 안 이어진 것을 채운다 (한 번만)
      const old = results.filter((r) => !r.grp && String(r.source || '').trim());
      if (old.length) {
        const ids = new Map();
        for (const r of old) {
          const src = r.source.trim();
          if (!ids.has(src)) ids.set(src, await sourceId(db, uid, src));
        }
        await db.batch(old.map((r) => db.prepare('UPDATE aphorisms SET source_id = ? WHERE id = ? AND user_id = ?').bind(ids.get(r.source.trim()), r.id, uid)));
        ({ results } = await list());
      }
      return json(results);
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const v = await body();
      const it = clean(v);
      if (!it.text) return json({ error: '구절을 입력해 주세요.' }, 400);
      if (request.method === 'POST') {
        const r = await db.prepare('INSERT INTO aphorisms (text, source, stars, user_id, source_id) VALUES (?, ?, ?, ?, ?)').bind(it.text, it.source, it.stars, uid, await sourceId(db, uid, it.source)).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }
      const r = await db.prepare('UPDATE aphorisms SET text = ?, source = ?, stars = ?, source_id = ? WHERE id = ? AND user_id = ?').bind(it.text, it.source, it.stars, await sourceId(db, uid, it.source), Number(v.id) || 0, uid).run();
      await sweep(db, uid);
      return json({ ok: r.meta.changes > 0 }, r.meta.changes > 0 ? 200 : 404);
    }
    if (request.method === 'DELETE') {
      const r = await db.prepare('DELETE FROM aphorisms WHERE id = ? AND user_id = ?').bind(Number(url.searchParams.get('id')) || 0, uid).run();
      await sweep(db, uid);
      return json({ ok: r.meta.changes > 0 });
    }
  }
  if (path === '/api/sources' && request.method === 'PUT') {
    const v = await body();
    const id = Number(v.id) || 0;
    const name = String(v.name ?? '').trim().slice(0, 300);
    if (!name) return json({ error: '출처 이름을 입력해 주세요.' }, 400);
    const cur = await db.prepare('SELECT id, name FROM sources WHERE id = ? AND user_id = ?').bind(id, uid).first();
    if (!cur) return json({ error: 'not found' }, 404);
    if (cur.name === name) return json({ ok: true, id });
    // 구절에 보이는 출처 글도 함께 (성경처럼 묶음 이름과 글이 다른 구절은 그대로)
    const text = db.prepare('UPDATE aphorisms SET source = ?1 WHERE user_id = ?2 AND source_id = ?3 AND source = ?4').bind(name, uid, id, cur.name);
    const dup = await db.prepare('SELECT id FROM sources WHERE user_id = ? AND name = ?').bind(uid, name).first();
    if (dup) { // 같은 이름이 이미 있다 → 그 출처로 합친다
      await db.batch([text,
        db.prepare('UPDATE aphorisms SET source_id = ?1 WHERE user_id = ?2 AND source_id = ?3').bind(dup.id, uid, id),
        db.prepare('DELETE FROM sources WHERE id = ? AND user_id = ?').bind(id, uid)]);
      return json({ ok: true, id: dup.id, merged: true });
    }
    await db.batch([text, db.prepare('UPDATE sources SET name = ? WHERE id = ? AND user_id = ?').bind(name, id, uid)]);
    return json({ ok: true, id });
  }
  if (path === '/api/settings') {
    if (request.method === 'PUT') {
      const m = (await body()).weight_mode;
      if (!MODES.includes(m)) return json({ error: 'bad mode' }, 400);
      await db.prepare('UPDATE users SET weight_mode = ? WHERE id = ?').bind(m, uid).run();
      return json({ ok: true, weight_mode: m });
    }
    const u = await db.prepare('SELECT weight_mode FROM users WHERE id = ?').bind(uid).first();
    return json({ weight_mode: MODES.includes(u?.weight_mode) ? u.weight_mode : 'random' });
  }
  if (path === '/api/random') {
    const [{ results: rows }, u] = await Promise.all([
      db.prepare('SELECT id, text, source, stars FROM aphorisms WHERE user_id = ?').bind(uid).all(),
      db.prepare('SELECT weight_mode FROM users WHERE id = ?').bind(uid).first(),
    ]);
    if (!rows.length) return json({ empty: true });
    const mode = MODES.includes(u?.weight_mode) ? u.weight_mode : 'random';
    const not = new Set((url.searchParams.get('not') || '').split(',').map(Number).filter(Boolean));
    const last = Number(url.searchParams.get('last')) || 0;
    // 아직 안 본 것 중에서 (직전 구절은 빼고). 다 봤으면 새 바퀴(cycled)
    let pool = rows.filter((r) => !not.has(r.id) && r.id !== last);
    let cycled = false;
    if (!pool.length) {
      cycled = true;
      pool = rows.length > 1 ? rows.filter((r) => r.id !== last) : rows;
    }
    return json({ ...pick(pool, mode), mode, cycled });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const po = partner(request);
      if (request.method === 'OPTIONS') {
        if (!po) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Origin': po, 'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400', Vary: 'Origin',
        } });
      }
      let res;
      try { res = await api(request, env, url); } catch (e) { res = json({ error: String(e.message || e) }, 500); }
      return withCors(res, po);
    }
    // 예전 담기 화면 주소(/admin)를 홈 화면에 저장해 둔 경우
    if (url.pathname === '/admin.html') return Response.redirect(`${url.origin}/basket`, 302);
    // 첫 화면(/) = 소개 페이지. 로그인한 회원이면 바로 구절 앱(/app)으로 (사용자 지시 2026-11-04: "가입하면 기존 서비스가 나오게")
    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET' && (await member(request, env))) {
      return new Response(null, { status: 302, headers: { Location: '/app', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/login' || url.pathname === '/login.html') {
      const signup = url.searchParams.get('mode') === 'signup';
      return Response.redirect(`${url.origin}/member/${signup ? 'signup' : 'login'}`, 302);
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
