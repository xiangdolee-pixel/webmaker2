/* 감사노트365 Worker
   - 로그인 · 가입 · 내 정보 = 사이트 회원(xms, 같은 xms_sess 쿠키). 감사 기록은 D1 `gamsa365`(DB), 회원 = 이메일로 이어 붙인다.
   - /       소개 페이지(로그인했으면 /note 로). 최근 나눔 감사를 html 에 함께 넣는다(따로 부르지 않게)
   - /note   내 노트(로그인 필요). 오늘 기록 · 설정 · 통계를 html 에 함께 넣는다(window.__G)
   - /api/*  아래 api() 참고
   - 알림: 10분마다(cron) 알림 시간이 된 회원 중 오늘 아직 안 쓴 사람에게 Web Push(내용 없이 — 서비스워커가 /api/nudge 로 문구를 받아 띄운다)
     VAPID 공개키 = vars.VAPID_PUBLIC, 비밀키 = 본체(gamsa365-core) 비밀값 VAPID_JWK (리포에 없음)
   - 그 밖: xim 공통 사이트 Worker (회원 화면 · 계정 버튼 · 정적 파일) */
import site from '../../xim/_worker/site-worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GOALS = [3, 5, 10];
const MAX_LINES = 10;

// 한국 시간
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600000);
const dayOf = (ms) => kst(ms).toISOString().slice(0, 10);
const hmOf = (ms) => kst(ms).toISOString().slice(11, 16);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

// 지금 로그인한 xms 회원 { email, name, admin } | null
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
    const av = String(d.avatar || '');
    const me = d.login_id ? { email: String(d.login_id).toLowerCase(), name: String(d.name || ''), admin: !!d.admin, avatar: /^(\/|https:\/\/)/.test(av) ? av.slice(0, 500) : '' } : null;
    seen.set(sess, { me, at: Date.now() });
    return me;
  } catch { return null; }
}
async function userOf(db, me) {
  let u = await db.prepare('SELECT * FROM users WHERE email = ?').bind(me.email).first();
  if (u) {
    // xms 내 정보에서 바꾼 프로필 사진을 따라간다
    if ((me.avatar || '') !== u.avatar) { u.avatar = me.avatar || ''; await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(u.avatar, u.id).run(); }
    return u;
  }
  await db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)').bind(me.email).run();
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(me.email).first();
}

const ITEMS_SQL = `SELECT e.id, e.pos, e.text, e.why, e.shared,
  (SELECT count(*) FROM hearts h WHERE h.entry_id = e.id) AS hearts
  FROM entries e WHERE e.user_id = ? AND e.day = ? ORDER BY e.pos`;

// 내 노트 첫 화면에 필요한 것 한 번에 (D1 왕복 1번)
async function stateOf(db, u, me) {
  const today = dayOf();
  const year = today.slice(0, 4);
  const from30 = dayOf(Date.now() - 29 * 86400000);
  const [items, dayRow, cal, totals, moods, hearts, recent] = await db.batch([
    db.prepare(ITEMS_SQL).bind(u.id, today),
    db.prepare('SELECT mood, prayer FROM days WHERE user_id = ? AND day = ?').bind(u.id, today),
    db.prepare('SELECT day, count(*) AS n FROM entries WHERE user_id = ? AND day >= ? GROUP BY day').bind(u.id, `${year}-01-01`),
    db.prepare('SELECT count(*) AS lights, count(DISTINCT day) AS days FROM entries WHERE user_id = ?').bind(u.id),
    db.prepare('SELECT day, mood FROM days WHERE user_id = ? AND day >= ? AND mood > 0 ORDER BY day').bind(u.id, from30),
    db.prepare('SELECT count(*) AS n FROM hearts WHERE owner_id = ? AND user_id != owner_id AND created_at > ?').bind(u.id, u.seen_hearts_at),
    db.prepare('SELECT mood FROM days WHERE user_id = ? AND mood > 0 ORDER BY day DESC LIMIT 3').bind(u.id),
  ]);
  const last3 = recent.results.map((r) => r.mood);
  return {
    today,
    me: { nick: u.nick, name: me.name, admin: me.admin, goal: u.goal, remind_on: !!u.remind_on, remind_time: u.remind_time, share_default: !!u.share_default, helps: !!u.helps, pray: !!u.pray, onboarded: !!u.onboarded },
    items: items.results,
    mood: dayRow.results[0]?.mood || 0,
    prayer: dayRow.results[0]?.prayer || '',
    cal: Object.fromEntries(cal.results.map((r) => [r.day, r.n])),
    lights: totals.results[0]?.lights || 0,
    days: totals.results[0]?.days || 0,
    moods: moods.results,
    newHearts: hearts.results[0]?.n || 0,
    sos: last3.length >= 3 && last3.every((m) => m <= 1),
    vapid: '',
  };
}

async function feedOf(db, uid, before = 0, limit = 30) {
  const { results } = await db.prepare(`SELECT e.id, e.text, e.day, e.user_id, u.nick, u.avatar,
      (SELECT count(*) FROM hearts h WHERE h.entry_id = e.id) AS hearts,
      EXISTS (SELECT 1 FROM hearts h WHERE h.entry_id = e.id AND h.user_id = ?) AS mine
    FROM entries e JOIN users u ON u.id = e.user_id
    WHERE e.shared = 1 AND e.hidden = 0 AND (? = 0 OR e.id < ?)
    ORDER BY e.id DESC LIMIT ?`).bind(uid, before, before, limit).all();
  // 이름을 비운 익명 이웃은 사진도 보이지 않는다. c = 기본 동그라미 색 (사람마다 같게)
  return results.map((r) => ({ id: r.id, text: r.text, day: r.day, nick: r.nick || '', avatar: r.nick ? r.avatar || '' : '', c: r.user_id % 6, hearts: r.hearts, mine: !!r.mine, own: r.user_id === uid }));
}

// 나눔 카드 한 장 (소개 페이지 · 내 노트가 같은 꼴 — note.js 의 feedHtml 과 맞춘다)
const avatarHtml = (it) => it.avatar
  ? `<span class="av"><img src="${esc(it.avatar)}" alt="" loading="lazy" width="40" height="40"></span>`
  : it.nick ? `<span class="av c${it.c}">${esc([...it.nick][0])}</span>` : '<span class="av anon" aria-hidden="true"><i></i></span>';
const dayLabel = (d) => { const t = dayOf(); if (d === t) return '오늘'; if (d === dayOf(Date.now() - 86400000)) return '어제'; const [, m, dd] = d.split('-').map(Number); return `${m}월 ${dd}일`; };

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

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
      const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, s.endpoint, cache), TTL: '43200', Urgency: 'normal', 'Content-Length': '0' } });
      if (res.status === 404 || res.status === 410) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      else if (res.ok) sent++;
    } catch { /* 다음 차례에 */ }
  }));
  return sent;
}
// 10분마다: 알림 시간이 지났고(1시간 안), 오늘 아직 안 보냈고, 오늘 아직 안 쓴 회원
async function remind(env) {
  const db = env.DB;
  const now = Date.now();
  const today = dayOf(now), hm = hmOf(now);
  const from = dayOf(now - 3600000) === today ? hmOf(now - 3600000) : '00:00';
  const { results: users } = await db.prepare(`SELECT u.id FROM users u
    WHERE u.remind_on = 1 AND u.remind_time <= ? AND u.remind_time > ? AND u.last_remind_day != ?
      AND EXISTS (SELECT 1 FROM push_subs p WHERE p.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.user_id = u.id AND e.day = ?)
    LIMIT 500`).bind(hm, from, today, today).all();
  if (!users.length) return;
  const ids = users.map((u) => u.id);
  const marks = ids.map((id) => db.prepare('UPDATE users SET last_remind_day = ? WHERE id = ?').bind(today, id));
  await db.batch(marks);
  const { results: subs } = await db.prepare(`SELECT endpoint FROM push_subs WHERE user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  await pushTo(env, db, subs);
}

// 알림 문구 (서비스워커가 받아 띄운다) — 재촉하지 않고, 다정하게
const NUDGES = [
  '오늘 하루, 작은 빛 하나 찾아볼까요?',
  '수고한 하루였어요. 고마웠던 순간 하나만 떠올려 봐요.',
  '거창하지 않아도 돼요. 따뜻한 밥 한 끼도 감사예요.',
  '오늘 나를 웃게 한 건 무엇이었나요?',
  '힘든 날이었다면, 하나만 적어도 충분해요.',
  '잠들기 전 3분, 오늘의 감사를 담아 두어요.',
];

async function api(request, env, url) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;
  const me = await member(request, env);
  if (path === '/api/nudge') {
    // 서비스워커가 알림을 띄우기 직전에 부른다 (로그인 안 됐어도 기본 문구)
    let body = NUDGES[Math.floor(Math.random() * NUDGES.length)];
    if (me) {
      const u = await userOf(db, me);
      const r = await db.prepare('SELECT count(*) AS n FROM hearts WHERE owner_id = ? AND user_id != owner_id AND created_at > ?').bind(u.id, u.seen_hearts_at).first();
      if (r?.n) body = `당신의 감사에 이웃의 빛 ${r.n}개가 도착했어요. 오늘의 감사도 담아 볼까요?`;
    }
    return json({ title: '감사노트365', body });
  }
  if (!me) return json({ error: '로그인이 필요합니다.' }, 401);
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'bad origin' }, 403);
  }
  const u = await userOf(db, me);
  const body = async () => { try { return await request.json(); } catch { return {}; } };

  if (path === '/api/state' && method === 'GET') return json(await stateOf(db, u, me));

  // 하루 기록 보기 (돌아보기)
  if (path === '/api/day' && method === 'GET') {
    const d = url.searchParams.get('d');
    if (!isDay(d)) return json({ error: 'bad day' }, 400);
    const [items, dr] = await db.batch([db.prepare(ITEMS_SQL).bind(u.id, d), db.prepare('SELECT mood, prayer FROM days WHERE user_id = ? AND day = ?').bind(u.id, d)]);
    return json({ day: d, items: items.results, mood: dr.results[0]?.mood || 0, prayer: dr.results[0]?.prayer || '' });
  }
  // 하루 기록 저장 (그날 전체를 보낸다)
  if (path === '/api/day' && method === 'PUT') {
    const v = await body();
    const d = v.day;
    if (!isDay(d) || d > dayOf()) return json({ error: '날짜가 올바르지 않습니다.' }, 400);
    const mood = Math.max(0, Math.min(5, Math.round(Number(v.mood) || 0)));
    // 한 줄 기도: 길게 써도 된다 (줄바꿈은 살린다)
    const prayer = String(v.prayer ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000);
    const lines = (Array.isArray(v.items) ? v.items : []).slice(0, MAX_LINES)
      .map((it, i) => ({ pos: i, text: str(it?.text, 200), why: str(it?.why, 200), shared: it?.shared ? 1 : 0 }));
    const keep = lines.filter((l) => l.text);
    // 빈 줄은 빼고 pos 를 0.. 로 다시 매긴다. 이미 있던 줄은 id 로 이어 써서 받은 빛(hearts)이 그대로 남는다
    const old = (await db.prepare('SELECT id FROM entries WHERE user_id = ? AND day = ?').bind(u.id, d).all()).results;
    const stmts = [
      db.prepare('INSERT INTO days (user_id, day, mood, prayer) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, day) DO UPDATE SET mood = excluded.mood, prayer = excluded.prayer').bind(u.id, d, mood, prayer),
      db.prepare('UPDATE entries SET pos = pos + 100 WHERE user_id = ? AND day = ?').bind(u.id, d),   // 자리 바꿀 때 UNIQUE 충돌 막기
    ];
    const ids = keep.map((l) => Number(v.items[l.pos]?.id) || 0);
    keep.forEach((l, i) => {
      const id = ids[i];
      if (id && old.some((o) => o.id === id)) stmts.push(db.prepare('UPDATE entries SET pos = ?, text = ?, why = ?, shared = ? WHERE id = ? AND user_id = ?').bind(i, l.text, l.why, l.shared, id, u.id));
      else stmts.push(db.prepare('INSERT INTO entries (user_id, day, pos, text, why, shared) VALUES (?, ?, ?, ?, ?, ?)').bind(u.id, d, i, l.text, l.why, l.shared));
    });
    const gone = old.filter((o) => !ids.includes(o.id)).map((o) => o.id);
    for (const id of gone) {
      stmts.push(db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').bind(id, u.id));
      stmts.push(db.prepare('DELETE FROM hearts WHERE entry_id = ?').bind(id));
      stmts.push(db.prepare('DELETE FROM reports WHERE entry_id = ?').bind(id));
    }
    stmts.push(db.prepare(ITEMS_SQL).bind(u.id, d));
    const out = await db.batch(stmts);
    return json({ ok: true, day: d, items: out[out.length - 1].results });
  }

  if (path === '/api/feed' && method === 'GET') {
    return json({ items: await feedOf(db, u.id, Number(url.searchParams.get('before')) || 0), admin: me.admin });
  }
  if (path === '/api/heart' && method === 'POST') {
    const id = Number((await body()).id) || 0;
    const e = await db.prepare('SELECT user_id FROM entries WHERE id = ? AND shared = 1 AND hidden = 0').bind(id).first();
    if (!e) return json({ error: '없는 감사입니다.' }, 404);
    if (e.user_id === u.id) return json({ error: '내 감사에는 빛을 보낼 수 없어요.' }, 400);
    const had = await db.prepare('SELECT 1 FROM hearts WHERE entry_id = ? AND user_id = ?').bind(id, u.id).first();
    if (had) await db.prepare('DELETE FROM hearts WHERE entry_id = ? AND user_id = ?').bind(id, u.id).run();
    else await db.prepare('INSERT INTO hearts (entry_id, user_id, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(id, u.id, e.user_id, Date.now()).run();
    const n = await db.prepare('SELECT count(*) AS n FROM hearts WHERE entry_id = ?').bind(id).first();
    return json({ ok: true, mine: !had, hearts: n.n });
  }
  if (path === '/api/report' && method === 'POST') {
    const id = Number((await body()).id) || 0;
    await db.prepare('INSERT OR IGNORE INTO reports (entry_id, user_id) SELECT id, ? FROM entries WHERE id = ? AND user_id != ?').bind(u.id, id, u.id).run();
    const n = await db.prepare('SELECT count(*) AS n FROM reports WHERE entry_id = ?').bind(id).first();
    if (n.n >= 3) await db.prepare('UPDATE entries SET hidden = 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (path === '/api/hide' && method === 'POST') {
    if (!me.admin) return json({ error: '관리자만 숨길 수 있습니다.' }, 403);
    await db.prepare('UPDATE entries SET hidden = 1 WHERE id = ?').bind(Number((await body()).id) || 0).run();
    return json({ ok: true });
  }
  if (path === '/api/seen' && method === 'POST') {
    await db.prepare('UPDATE users SET seen_hearts_at = ? WHERE id = ?').bind(Date.now(), u.id).run();
    return json({ ok: true });
  }
  // 기억 꺼내기: 오늘이 아닌 지난 감사 하나
  if (path === '/api/memory' && method === 'GET') {
    const r = await db.prepare('SELECT day, text, why FROM entries WHERE user_id = ? AND day < ? ORDER BY random() LIMIT 1').bind(u.id, dayOf()).first();
    return json(r || { empty: true });
  }
  if (path === '/api/settings' && method === 'PUT') {
    const v = await body();
    const goal = GOALS.includes(Number(v.goal)) ? Number(v.goal) : u.goal;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(v.remind_time || '') ? v.remind_time : u.remind_time;
    const on = v.remind_on === undefined ? u.remind_on : (v.remind_on ? 1 : 0);
    const share = v.share_default === undefined ? u.share_default : (v.share_default ? 1 : 0);
    const nick = v.nick === undefined ? u.nick : str(v.nick, 12);
    const helps = v.helps === undefined ? u.helps : (v.helps ? 1 : 0);
    const pray = v.pray === undefined ? u.pray : (v.pray ? 1 : 0);
    const onboarded = v.onboarded ? 1 : u.onboarded;
    // 시간을 앞당겨 바꾸면 오늘 다시 알림이 갈 수 있게
    const reset = time !== u.remind_time ? '' : u.last_remind_day;
    await db.prepare('UPDATE users SET goal = ?, remind_time = ?, remind_on = ?, share_default = ?, nick = ?, helps = ?, pray = ?, onboarded = ?, last_remind_day = ? WHERE id = ?')
      .bind(goal, time, on, share, nick, helps, pray, onboarded, reset, u.id).run();
    return json({ ok: true, goal, remind_time: time, remind_on: !!on, share_default: !!share, nick, helps: !!helps, pray: !!pray, onboarded: !!onboarded });
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
async function withData(res, marker, html, priv) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const text = (await res.text()).replace(marker, () => html);
  const h = new Headers(res.headers);
  h.delete('Content-Length'); h.delete('ETag');
  if (priv) h.set('Cache-Control', 'private, no-store');
  return new Response(text, { status: res.status, headers: h });
}
// 소개 페이지 감사 벽: 사진 타일 + 최근 나눔 (빈 동안에는 첫 빛을 기다리는 칸)
const feedCards = (items) => `<li class="wall-photo"><img src="/img/daisy.webp" alt="창가의 데이지 꽃과 따뜻한 차" width="420" height="659" loading="lazy"><span>오늘, 누군가의<br>작은 빛</span></li>` + (items.length
  ? items.map((it, i) => `<li class="feed-card t${it.c}${i >= 4 ? ' more' : ''}"><div class="fc-head">${avatarHtml(it)}<span class="fc-who"><b>${esc(it.nick || '익명의 이웃')}</b><small>${dayLabel(it.day)}</small></span></div><p class="fc-text">${esc(it.text)}</p><span class="fc-light"><span class="glow-dot" aria-hidden="true"></span>나도 감사해요 ${it.hearts}</span></li>`).join('')
  : '<li class="feed-card t0"><p class="fc-text">아직 나눠진 감사가 없어요. 오늘 첫 번째 빛이 되어 주세요.</p></li>');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      try { return await api(request, env, url); } catch (e) { return json({ error: String(e.message || e) }, 500); }
    }
    if (request.method === 'GET' && (p === '/' || p === '/index.html')) {
      const me = await member(request, env);
      if (me) return new Response(null, { status: 302, headers: { Location: '/note', 'Cache-Control': 'no-store' } });
      const res = await site.fetch(request, env, ctx);
      let items = [];
      try { items = await feedOf(env.DB, 0, 0, 9); } catch { /* 비어 있게 */ }
      return withData(res, '<!--FEED-->', feedCards(items), false);
    }
    if (request.method === 'GET' && (p === '/note' || p === '/note.html')) {
      const me = await member(request, env);
      if (!me) return new Response(null, { status: 302, headers: { Location: '/member/login?next=%2Fnote', 'Cache-Control': 'no-store' } });
      const u = await userOf(env.DB, me);
      // 이웃의 오늘 감사 3개(막힐 때 영감)도 함께 넣는다
      const [res, st, near] = await Promise.all([site.fetch(request, env, ctx), stateOf(env.DB, u, me), feedOf(env.DB, u.id, 0, 8).catch(() => [])]);
      st.vapid = env.VAPID_PUBLIC || '';
      st.near = near.filter((x) => !x.own).slice(0, 3);
      st.me.avatar = u.avatar;
      return withData(res, '<!--G-->', `<script>window.__G=${JSON.stringify(st).replace(/</g, '\\u003c')};</script>`, true);
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(remind(env));
  },
};
