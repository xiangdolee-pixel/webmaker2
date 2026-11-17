// 네이버 · 카카오로 시작하기 (모든 xim 사이트 공통, 사용자 지시 2026-11-15 네이버 · 2026-11-16 카카오)
//   앱은 운영자 것 하나씩(네이버 "자두랩스", 카카오 앱). 둘 다 등록한 돌아오는 주소로만 돌려보내므로 그 주소는 xim 한 곳:
//     https://xim.plators.com/naver/callback · https://xim.plators.com/kakao/callback
//     (네이버 지도와 같은 방식 — 사이트가 몇 개든 네이버 · 카카오에 따로 등록하지 않는다)
//   ① 사이트 /member/<p>?next=…          → social_states 에 상태 + 브라우저 쿠키(xms_<p>) → 동의 화면
//      네이버는 시작한 페이지도 서비스 URL 인지 본다 → xim /naver/go 를 거친다(사이트에서 바로 보내면 '등록되지 않은 사이트').
//      카카오는 그런 검사가 없어 사이트에서 카카오로 바로 보낸다(왕복 하나 덜).
//   ② 네이버 · 카카오 → xim /<p>/callback → 토큰 · 프로필을 받아 같은 행(xms DB)에 넣고 원래 사이트 /member/<p>/done 으로
//   ③ 사이트 /member/<p>/done            → 쿠키 = 상태 확인 → 연결된 회원이면 로그인, 처음이면 가입 화면(받은 값 미리 채움)
//   회원 ↔ 네이버 · 카카오 번호 = member_social (site · provider 조건). 번호는 앱마다 달라서 앱을 바꾸면 기존 연결이 모두 끊긴다 — 앱을 바꾸지 말 것.
//   설정: xim DB settings.naver_login · kakao_login = {"client_id": "…"} (카카오는 REST API 키),
//         비밀값은 xim Worker 비밀값 NAVER_LOGIN_SECRET · KAKAO_LOGIN_SECRET (xms 는 몰라도 된다).
//   사이트별 끄기: xms 관리 › 부가 기능 (site_options k = 'naver_login' · 'kakao_login', 기본 켬)
import { now, esc, str, cookie, setCookie, randomHex, createSession } from './lib.js';

const START_TTL = 10 * 60000;   // 다녀오기 10분
const SIGNUP_TTL = 30 * 60000;  // 처음 온 사람은 30분 안에 가입

// 공식 버튼 모양: 네이버 = 초록 바탕 · 흰 N, 카카오 = 노란 바탕(#FEE500) · 검은 말풍선
export const PROVIDERS = {
  naver: {
    name: '네이버', cls: 'mb-naver', setting: 'naver_login',
    logo: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="#fff" d="M13.56 10.7 6.17 0H0v20h6.44V9.3L13.83 20H20V0h-6.44z"/></svg>',
    authorize: (id, state) => `https://xim.plators.com/naver/go?state=${state}`,
  },
  kakao: {
    name: '카카오', cls: 'mb-kakao', setting: 'kakao_login',
    logo: '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#000" d="M9 1.2C4.4 1.2.7 4.1.7 7.7c0 2.3 1.5 4.3 3.8 5.5l-.97 3.55c-.09.31.27.56.54.38l4.24-2.8c.22.02.45.03.68.03 4.6 0 8.3-2.9 8.3-6.5S13.6 1.2 9 1.2z"/></svg>',
    authorize: (id, state) => `https://kauth.kakao.com/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: 'https://xim.plators.com/kakao/callback', state })}`,
  },
};
export const PROVIDER_KEYS = Object.keys(PROVIDERS);
const cookieName = (p) => `xms_${p}`;

const cfgCache = {};
async function clientId(env, p) {
  const c = cfgCache[p];
  if (c && Date.now() - c.at < 60000) return c.id;
  let id = '';
  try { id = JSON.parse((await env.XIM_DB.prepare('SELECT value FROM settings WHERE key = ?').bind(PROVIDERS[p].setting).first())?.value || '{}').client_id || ''; } catch { id = ''; }
  cfgCache[p] = { at: Date.now(), id };
  return id;
}
// 이 사이트에서 그 로그인을 쓰나 (운영자 키가 있고 · 부가 기능에서 끄지 않았으면)
export async function socialOn(env, site, p) {
  if (!(await clientId(env, p))) return false;
  const r = await env.DB.prepare('SELECT v FROM site_options WHERE site = ? AND k = ?').bind(site, PROVIDERS[p].setting).first();
  try { return r ? !!JSON.parse(r.v).on : true; } catch { return true; }
}
// 쓰는 것만 [p, …] (네이버 · 카카오 차례)
export async function socialList(env, site) {
  const on = await Promise.all(PROVIDER_KEYS.map((p) => socialOn(env, site, p)));
  return PROVIDER_KEYS.filter((_, i) => on[i]);
}

// 로그인 · 가입 화면 아래 버튼들 — verb: '시작하기' | '로그인'
const btn = (p, href, text, sm) => `<a class="${PROVIDERS[p].cls}${sm ? ' sm' : ''}" href="${href}" rel="nofollow">${PROVIDERS[p].logo}<span>${text}</span></a>`;
export const socialButtons = (list, next, verb = '시작하기') => (list.length ? `<div class="mb-or"><span>또는</span></div>
    <div class="mb-social">${list.map((p) => btn(p, `/member/${p}${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`, `${PROVIDERS[p].name}로 ${verb}`)).join('')}</div>` : '');
export const linkButton = (p) => btn(p, `/member/${p}?link=1`, `${PROVIDERS[p].name} 연결하기`, true);

const safeNext = (v) => { const s = String(v || '/'); return s.startsWith('/') && !s.startsWith('//') && !/^\/member\/(naver|kakao)/.test(s) ? s.slice(0, 300) : '/'; };
const go = (to, cookies = []) => {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
};

// ① /member/<p>?next=… (· &link=1 = 마이페이지에서 지금 계정에 연결)
export async function socialStart(ctx, p, { msgPage }) {
  const { env, site, url, me } = ctx;
  const P = PROVIDERS[p];
  const id = await clientId(env, p);
  if (!(await socialOn(env, site, p))) return msgPage(ctx, `${P.name} 로그인`, `이 사이트는 ${P.name} 로그인을 쓰지 않습니다.`, '<div class="actions center"><a class="btn" href="/member/login">로그인</a></div>', 404);
  const link = url.searchParams.get('link') === '1';
  if (link && me.kind !== 'member') return go(`${url.origin}/member/login?next=${encodeURIComponent('/member/mypage')}`);
  if (!link && me.kind === 'member') return go(`${url.origin}${safeNext(url.searchParams.get('next'))}`);
  const state = randomHex(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM social_states WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO social_states (state, site, origin, next, mode, member_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(state, site, url.origin, link ? '/member/mypage' : safeNext(url.searchParams.get('next')), link ? 'link' : 'login', link ? me.member.id : null, now() + START_TTL),
  ]);
  return go(P.authorize(id, state), [setCookie(cookieName(p), state, START_TTL / 1000)]);
}

// 이 브라우저가 시작한 상태 행 (쿠키와 주소의 state 가 같아야 — 남이 만든 주소로 로그인시키는 것을 막는다)
//   profile.provider 도 맞아야 한다 (네이버로 받은 값을 카카오 쪽으로 쓰지 않게)
async function myState(ctx, p, state) {
  const c = cookie(ctx.request, cookieName(p));
  if (!state || !c || c !== state || !/^[0-9a-f]{48}$/.test(state)) return null;
  const row = await ctx.env.DB.prepare('SELECT * FROM social_states WHERE state = ? AND site = ? AND expires_at > ?').bind(state, ctx.site, now()).first();
  if (!row?.profile) return null;
  const prof = JSON.parse(row.profile);
  return (prof.provider || 'naver') === p ? { ...row, p: prof } : null;
}
const dropState = (db, state) => db.prepare('DELETE FROM social_states WHERE state = ?').bind(state);

// ③ /member/<p>/done?state=…
export async function socialDone(ctx, p, { msgPage }) {
  const { env, site, url, me } = ctx;
  const db = env.DB;
  const P = PROVIDERS[p];
  const clearCookie = setCookie(cookieName(p), '', 0);
  const state = url.searchParams.get('state') || '';
  const again = '<div class="actions center"><a class="btn primary" href="/member/login">로그인 화면으로</a></div>';
  if (url.searchParams.get('cancel')) {
    await dropState(db, state).run().catch(() => {});
    return go(`${url.origin}/member/login`, [clearCookie]);
  }
  const row = await myState(ctx, p, state);
  if (!row) return msgPage(ctx, `${P.name} 로그인`, '시간이 지났거나 다른 브라우저에서 시작한 로그인입니다. 다시 해 주세요.', again, 400);
  const prof = row.p;
  const linked = await db.prepare(`SELECT m.* FROM member_social s JOIN members m ON m.id = s.member_id AND m.site = s.site
    WHERE s.site = ? AND s.provider = ? AND s.uid = ?`).bind(site, p, prof.id).first();

  // 마이페이지에서 "<p> 연결하기"
  if (row.mode === 'link') {
    await dropState(db, state).run();
    if (me.kind !== 'member' || me.member.id !== row.member_id) return msgPage(ctx, `${P.name} 연결`, '로그인한 계정이 바뀌었습니다. 다시 해 주세요.', again, 400);
    if (linked && linked.id !== me.member.id) return msgPage(ctx, `${P.name} 연결`, `이 ${P.name} 계정은 이미 다른 회원 계정에 연결돼 있습니다.`, '<div class="actions center"><a class="btn" href="/member/mypage">마이페이지</a></div>', 409);
    await db.prepare('INSERT OR REPLACE INTO member_social (site, provider, uid, member_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(site, p, prof.id, me.member.id, now()).run();
    return go(`${url.origin}/member/mypage?linked=${p}`, [clearCookie]);
  }
  // 이미 연결된 회원 → 로그인
  if (linked && linked.status !== 'WITHDRAWN') {
    await dropState(db, state).run();
    if (linked.status === 'LOCKED') return msgPage(ctx, '로그인할 수 없습니다', '관리자가 로그인을 막아 둔 계정입니다. 관리자에게 문의해 주세요.', '', 423);
    await db.prepare('UPDATE members SET fail_count = 0, locked_until = 0, last_login_at = ? WHERE id = ?').bind(now(), linked.id).run();
    return go(`${url.origin}${safeNext(row.next)}`, [clearCookie, await createSession(db, site, 'keep', linked.id)]);
  }
  // 같은 이메일로 이미 가입한 회원 — 자동으로 합치지 않는다(남의 계정을 가져가는 일을 막기 위해). 로그인 뒤 마이페이지에서 연결.
  if (prof.email) {
    const dup = await db.prepare("SELECT status FROM members WHERE site = ? AND (lower(login_id) = ? OR lower(email) = ?) ORDER BY status = 'WITHDRAWN' LIMIT 1").bind(site, prof.email, prof.email).first();
    if (dup) {
      await dropState(db, state).run();
      return msgPage(ctx, '이미 가입한 이메일입니다', dup.status === 'WITHDRAWN'
        ? '탈퇴한 이메일입니다. 다시 가입하려면 사이트 관리자에게 문의해 주세요.'
        : `<b>${esc(prof.email)}</b> 로 이미 가입하셨어요. 원래 쓰던 방법으로 로그인한 뒤 <b>마이페이지 › ${P.name} 연결하기</b>를 누르면 다음부터 ${P.name}로 로그인할 수 있습니다.`,
      `<div class="actions center"><a class="btn primary" href="/member/login?next=${encodeURIComponent('/member/mypage')}">로그인</a></div>`, 409);
    }
  }
  // 처음 온 사람 → 가입 화면 (받은 값을 미리 채운다)
  await db.prepare("UPDATE social_states SET mode = 'signup', expires_at = ? WHERE state = ?").bind(now() + SIGNUP_TTL, state).run();
  return go(`${url.origin}/member/signup?with=${p}`, [setCookie(cookieName(p), state, SIGNUP_TTL / 1000)]);
}

// 가입 화면 · 가입 API: 네이버 · 카카오에서 온 사람이면 { provider, state, p, done }
export async function socialSignup(ctx, p) {
  if (!PROVIDERS[p]) return null;
  const row = await myState(ctx, p, cookie(ctx.request, cookieName(p)));
  if (!row || row.mode !== 'signup') return null;
  return { provider: p, name: PROVIDERS[p].name, state: row.state, p: row.p, done: (memberId) => [
    ctx.env.DB.prepare('INSERT OR REPLACE INTO member_social (site, provider, uid, member_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(ctx.site, p, row.p.id, memberId, now()),
    dropState(ctx.env.DB, row.state),
  ] };
}

// 이 회원에 연결된 것 [p, …]
export async function linkedOf(db, site, memberId) {
  const { results } = await db.prepare('SELECT provider FROM member_social WHERE site = ? AND member_id = ?').bind(site, memberId).all();
  return results.map((r) => r.provider);
}
// 아이디: 받은 이메일, 없으면 naver-번호 · kakao-번호 (카카오는 이메일을 안 주는 경우가 많다)
export const socialLoginId = (provider, p) => (p.email ? str(p.email, 254).toLowerCase() : `${provider}-${String(p.id).slice(0, 40)}`);
