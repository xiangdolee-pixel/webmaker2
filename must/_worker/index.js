/* 머스트 Worker — 매일 반드시 할 일 · 정한 시간 알림 · 날마다 했는지 기록
   - 로그인 · 가입 · 내 정보 = 사이트 회원(xms, 같은 xms_sess 쿠키). 기록은 D1 `must`(DB), 회원 = 이메일로 이어 붙인다.
   - /       한 쪽짜리 앱. 로그인했으면 오늘 상태를 html 에 함께 넣는다(window.__M), 안 했으면 소개 그대로
   - /api/*  아래 api() 참고
   - 알림: 1분마다(cron) 알림 시간이 된 항목 중 오늘 아직 안 한 것이 있는 회원에게 Web Push(내용 없이 —
     서비스워커가 자기 구독 주소로 /api/nudge 를 불러 항목을 받아 띄운다. 로그인 쿠키가 없어도 된다)
     VAPID 공개키 = vars.VAPID_PUBLIC, 비밀키 = 본체(must-core) 비밀값 VAPID_JWK (리포에 없음)
   - 그 밖: xim 공통 사이트 Worker (회원 화면 · 계정 버튼 · 정적 파일) */
import site from '../../xim/_worker/site-worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const MAX_ITEMS = 30;
const MAX_TEXT = 80;

// 한국 시간
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600000);
const dayOf = (ms) => kst(ms).toISOString().slice(0, 10);
const hmOf = (ms) => kst(ms).toISOString().slice(11, 16);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const isHm = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// 지금 로그인한 xms 회원 { email, name } | null
const seen = new Map();
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
    const me = d.login_id ? { email: String(d.login_id).toLowerCase(), name: String(d.name || '') } : null;
    seen.set(sess, { me, at: Date.now() });
    return me;
  } catch { return null; }
}
async function userOf(db, me) {
  const u = await db.prepare('SELECT * FROM users WHERE email = ?').bind(me.email).first();
  if (u) return u;
  await db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').bind(me.email).run();
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(me.email).first();
}

// 알림 있는 것부터 시간 순, 알림 없는 것은 뒤에
const ITEMS_SQL = `SELECT id, text, alarm FROM items WHERE user_id = ? AND archived = 0 ORDER BY (alarm = ''), alarm, id`;

// 첫 화면에 필요한 것 한 번에 (D1 왕복 1번)
async function stateOf(db, u, me) {
  const today = dayOf();
  const [items, checks] = await db.batch([
    db.prepare(ITEMS_SQL).bind(u.id),
    db.prepare('SELECT item_id FROM checks WHERE user_id = ? AND day = ?').bind(u.id, today),
  ]);
  const done = new Set(checks.results.map((r) => r.item_id));
  return { today, name: me ? me.name : '', items: items.results.map((r) => ({ id: r.id, text: r.text, alarm: r.alarm, done: done.has(r.id) })) };
}

// ─── Web Push (VAPID, 내용 없음) ───
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)$/;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(new TextEncoder().encode(s));
async function vapidAuth(env, endpoint, cache) {
  const aud = new URL(endpoint).origin;
  if (cache[aud]) return cache[aud];
  if (!cache.key) cache.key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:master@plators.com' }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cache.key, new TextEncoder().encode(`${head}.${body}`));
  cache[aud] = `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
  return cache[aud];
}
async function pushTo(env, db, subs) {
  if (!env.VAPID_JWK || !subs.length) return 0;
  const cache = {};
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, s.endpoint, cache), TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
      if (res.status === 404 || res.status === 410) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (res.ok) sent++;
    } catch { /* 다음 차례에 */ }
  }));
  return sent;
}
// 1분마다: 알림 시간이 됐고(10분 안), 오늘 아직 안 보냈고, 오늘 아직 안 한 항목
async function remind(env) {
  const db = env.DB;
  const now = Date.now();
  const today = dayOf(now), hm = hmOf(now);
  const from = dayOf(now - 600000) === today ? hmOf(now - 600000) : '00:00';
  const { results } = await db.prepare(`SELECT i.id, i.user_id FROM items i
    WHERE i.archived = 0 AND i.alarm != '' AND i.alarm <= ? AND i.alarm >= ? AND i.last_push_day != ?
      AND NOT EXISTS (SELECT 1 FROM checks c WHERE c.item_id = i.id AND c.day = ?)
    LIMIT 500`).bind(hm, from, today, today).all();
  if (!results.length) return;
  await db.batch(results.map((r) => db.prepare('UPDATE items SET last_push_day = ? WHERE id = ?').bind(today, r.id)));
  const uids = [...new Set(results.map((r) => r.user_id))];
  const { results: subs } = await db.prepare(`SELECT endpoint FROM push_subs WHERE user_id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all();
  await pushTo(env, db, subs);
}
// 알림 시간을 정할 때: 오늘 이미 지난 시간이면 오늘은 보낸 것으로(바로 울리지 않게)
const pushMark = (alarm) => (alarm && alarm <= hmOf() ? dayOf() : '');

// 서비스워커가 부른다 — 구독 주소(남이 알 수 없는 긴 주소)로 회원을 찾는다
async function nudge(request, env, done) {
  const db = env.DB;
  let v = {};
  try { v = await request.json(); } catch { /* 빈 값 */ }
  const sub = await db.prepare('SELECT user_id FROM push_subs WHERE endpoint = ?').bind(String(v.endpoint || '')).first();
  if (!sub) return json({ items: [], left: 0 });
  const today = dayOf();
  if (done) {
    const id = Number(v.id) || 0;
    await db.prepare('INSERT OR IGNORE INTO checks (item_id, user_id, day) SELECT id, user_id, ? FROM items WHERE id = ? AND user_id = ? AND archived = 0').bind(today, id, sub.user_id).run();
    return json({ ok: true });
  }
  const { results } = await db.prepare(`SELECT i.id, i.text, i.alarm, i.last_push_day FROM items i
    WHERE i.user_id = ? AND i.archived = 0
      AND NOT EXISTS (SELECT 1 FROM checks c WHERE c.item_id = i.id AND c.day = ?)
    ORDER BY (i.alarm = ''), i.alarm, i.id`).bind(sub.user_id, today).all();
  return json({
    items: results.filter((r) => r.alarm && r.last_push_day === today).map((r) => ({ id: r.id, text: r.text, alarm: r.alarm })),
    left: results.length,
  });
}

async function api(request, env, url) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;
  if (path === '/api/nudge' && method === 'POST') return nudge(request, env, false);
  if (path === '/api/nudge/done' && method === 'POST') return nudge(request, env, true);

  const me = await member(request, env);
  if (!me) return json({ error: '로그인이 필요합니다.' }, 401);
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'bad origin' }, 403);
  }
  const u = await userOf(db, me);
  const body = async () => { try { return await request.json(); } catch { return {}; } };

  if (path === '/api/state' && method === 'GET') return json(await stateOf(db, u, me));

  if (path === '/api/item' && method === 'POST') {
    const v = await body();
    const text = str(v.text, MAX_TEXT);
    if (!text) return json({ error: '할 일을 적어 주세요.' }, 400);
    const alarm = isHm(v.alarm) ? v.alarm : '';
    const n = await db.prepare('SELECT count(*) AS n FROM items WHERE user_id = ? AND archived = 0').bind(u.id).first();
    if (n.n >= MAX_ITEMS) return json({ error: `할 일은 ${MAX_ITEMS}개까지 둘 수 있어요.` }, 400);
    await db.prepare('INSERT INTO items (user_id, text, alarm, since, last_push_day) VALUES (?, ?, ?, ?, ?)').bind(u.id, text, alarm, dayOf(), pushMark(alarm)).run();
    return json(await stateOf(db, u, me));
  }
  if (path === '/api/item' && method === 'PUT') {
    const v = await body();
    const id = Number(v.id) || 0;
    const it = await db.prepare('SELECT * FROM items WHERE id = ? AND user_id = ? AND archived = 0').bind(id, u.id).first();
    if (!it) return json({ error: '없는 할 일입니다.' }, 404);
    const text = v.text === undefined ? it.text : str(v.text, MAX_TEXT);
    if (!text) return json({ error: '할 일을 적어 주세요.' }, 400);
    const alarm = v.alarm === undefined ? it.alarm : (isHm(v.alarm) ? v.alarm : '');
    const mark = alarm === it.alarm ? it.last_push_day : pushMark(alarm);
    await db.prepare('UPDATE items SET text = ?, alarm = ?, last_push_day = ? WHERE id = ? AND user_id = ?').bind(text, alarm, mark, id, u.id).run();
    return json(await stateOf(db, u, me));
  }
  // 지우기: 기록이 있으면 남겨 두고(기록 화면에 보임) 목록에서만 뺀다
  if (path === '/api/item' && method === 'DELETE') {
    const id = Number((await body()).id) || 0;
    const had = await db.prepare('SELECT 1 FROM checks WHERE item_id = ? AND user_id = ? LIMIT 1').bind(id, u.id).first();
    if (had) await db.prepare('UPDATE items SET archived = 1, until = ? WHERE id = ? AND user_id = ?').bind(dayOf(), id, u.id).run();
    else await db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(id, u.id).run();
    return json(await stateOf(db, u, me));
  }
  // 했음 · 안 했음 (지난 날도 고칠 수 있다)
  if (path === '/api/check' && method === 'POST') {
    const v = await body();
    const id = Number(v.id) || 0;
    const d = v.day || dayOf();
    if (!isDay(d) || d > dayOf()) return json({ error: '날짜가 올바르지 않습니다.' }, 400);
    const it = await db.prepare('SELECT id FROM items WHERE id = ? AND user_id = ?').bind(id, u.id).first();
    if (!it) return json({ error: '없는 할 일입니다.' }, 404);
    if (v.on) await db.prepare('INSERT OR IGNORE INTO checks (item_id, user_id, day) VALUES (?, ?, ?)').bind(id, u.id, d).run();
    else await db.prepare('DELETE FROM checks WHERE item_id = ? AND user_id = ? AND day = ?').bind(id, u.id, d).run();
    return json({ ok: true, id, day: d, on: !!v.on });
  }
  // 한 달 기록
  if (path === '/api/month' && method === 'GET') {
    const m = url.searchParams.get('m') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return json({ error: 'bad month' }, 400);
    const [items, checks] = await db.batch([
      db.prepare(`SELECT id, text, alarm, since, until FROM items WHERE user_id = ? AND since <= ? AND (until = '' OR until >= ?) ORDER BY archived, (alarm = ''), alarm, id`).bind(u.id, `${m}-31`, `${m}-01`),
      db.prepare('SELECT item_id, day FROM checks WHERE user_id = ? AND day >= ? AND day <= ?').bind(u.id, `${m}-01`, `${m}-31`),
    ]);
    return json({ month: m, today: dayOf(), items: items.results, checks: checks.results.map((c) => [c.item_id, c.day]) });
  }

  if (path === '/api/push' && method === 'POST') {
    const v = await body();
    let ep;
    try { ep = new URL(String(v.endpoint || '')); } catch { return json({ error: 'bad endpoint' }, 400); }
    if (ep.protocol !== 'https:' || !PUSH_HOSTS.test(ep.hostname)) return json({ error: '지원하지 않는 알림 주소입니다.' }, 400);
    await db.prepare('INSERT INTO push_subs (endpoint, user_id) VALUES (?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id').bind(ep.href, u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/push' && method === 'DELETE') {
    const v = await body();
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(v.endpoint || ''), u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/push/test' && method === 'POST') {
    const { results } = await db.prepare('SELECT endpoint FROM push_subs WHERE user_id = ?').bind(u.id).all();
    const sent = await pushTo(env, db, results);
    return json({ ok: sent > 0, sent, devices: results.length });
  }
  return json({ error: 'not found' }, 404);
}

// 공통 사이트 Worker 가 만든 html 에 자료를 끼운다 (marker 자리)
async function withData(res, marker, html) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const text = (await res.text()).replace(marker, () => html);
  const h = new Headers(res.headers);
  h.delete('Content-Length'); h.delete('ETag');
  h.set('Cache-Control', 'private, no-store');
  return new Response(text, { status: res.status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      try { return await api(request, env, url); } catch (e) { return json({ error: String(e.message || e) }, 500); }
    }
    if (request.method === 'GET' && (p === '/' || p === '/index.html')) {
      const me = await member(request, env);
      if (me) {
        const u = await userOf(env.DB, me);
        const [res, st] = await Promise.all([site.fetch(request, env, ctx), stateOf(env.DB, u, me)]);
        st.vapid = env.VAPID_PUBLIC || '';
        return withData(res, '<!--M-->', `<script>window.__M=${JSON.stringify(st).replace(/</g, '\\u003c')};document.documentElement.classList.add('in');</script>`);
      }
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(remind(env));
  },
};
