// 네이버로 시작하기 (모든 xim 사이트 공통, 사용자 지시 2026-11-15)
//   네이버 앱은 운영자 것 하나("서비스 로그인"). 네이버는 등록한 돌아오는 주소로만 돌려보내므로 그 주소는 xim 한 곳:
//     https://xim.plators.com/naver/callback   (네이버 지도와 같은 방식 — 사이트가 몇 개든 네이버에 따로 등록하지 않는다)
//   ① 사이트 /member/naver?next=…        → social_states 에 상태 + 브라우저 쿠키(xms_naver) → xim /naver/go → 네이버 동의 화면
//      (네이버는 시작한 페이지도 서비스 URL 인지 본다 — 사이트에서 바로 보내면 '등록되지 않은 사이트'로 막힌다)
//   ② 네이버 → xim /naver/callback        → 토큰 · 프로필을 받아 같은 행(xms DB)에 넣고 원래 사이트 /member/naver/done 으로
//   ③ 사이트 /member/naver/done           → 쿠키 = 상태 확인 → 연결된 회원이면 로그인, 처음이면 가입 화면(네이버 값 미리 채움)
//   회원 ↔ 네이버 번호 = member_social (site 조건). 네이버 번호는 앱마다 달라서 앱을 바꾸면 기존 연결이 모두 끊긴다 — 앱을 바꾸지 말 것.
//   설정: xim DB settings.naver_login = {"client_id": "…"}, 비밀값은 xim Worker 비밀값 NAVER_LOGIN_SECRET (xms 는 몰라도 된다).
//   사이트별 끄기: xms 관리 › 부가 기능 (site_options k = 'naver_login', 기본 켬)
import { now, esc, str, cookie, setCookie, randomHex, createSession } from './lib.js';

const NAVER_GO = 'https://xim.plators.com/naver/go';
const STATE_COOKIE = 'xms_naver';
const START_TTL = 10 * 60000;   // 네이버 다녀오기 10분
const SIGNUP_TTL = 30 * 60000;  // 처음 온 사람은 30분 안에 가입

let cfgCache = { at: 0, id: '' };
async function clientId(env) {
  if (Date.now() - cfgCache.at < 60000) return cfgCache.id;
  let id = '';
  try { id = JSON.parse((await env.XIM_DB.prepare("SELECT value FROM settings WHERE key = 'naver_login'").first())?.value || '{}').client_id || ''; } catch { id = ''; }
  cfgCache = { at: Date.now(), id };
  return id;
}
// 이 사이트에서 네이버 로그인을 쓰나 (운영자 키가 있고 · 부가 기능에서 끄지 않았으면)
export async function naverOn(env, site) {
  if (!(await clientId(env))) return false;
  const r = await env.DB.prepare("SELECT v FROM site_options WHERE site = ? AND k = 'naver_login'").bind(site).first();
  try { return r ? !!JSON.parse(r.v).on : true; } catch { return true; }
}

// 네이버 공식 버튼 (초록 바탕 · 흰 N) — 로그인 · 가입 화면 아래
const N_LOGO = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="#fff" d="M13.56 10.7 6.17 0H0v20h6.44V9.3L13.83 20H20V0h-6.44z"/></svg>';
export const naverButton = (next, text = '네이버로 시작하기') => `<div class="mb-or"><span>또는</span></div>
    <a class="mb-naver" href="/member/naver${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}" rel="nofollow">${N_LOGO}<span>${text}</span></a>`;

const safeNext = (v) => { const s = String(v || '/'); return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/member/naver') ? s.slice(0, 300) : '/'; };
const go = (to, cookies = []) => {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
};

// ① /member/naver?next=… (· &link=1 = 마이페이지에서 지금 계정에 연결)
export async function naverStart(ctx, { msgPage }) {
  const { env, site, url, me } = ctx;
  if (!(await naverOn(env, site))) return msgPage(ctx, '네이버 로그인', '이 사이트는 네이버 로그인을 쓰지 않습니다.', '<div class="actions center"><a class="btn" href="/member/login">로그인</a></div>', 404);
  const link = url.searchParams.get('link') === '1';
  if (link && me.kind !== 'member') return go(`${url.origin}/member/login?next=${encodeURIComponent('/member/mypage')}`);
  if (!link && me.kind === 'member') return go(`${url.origin}${safeNext(url.searchParams.get('next'))}`);
  const state = randomHex(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM social_states WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO social_states (state, site, origin, next, mode, member_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(state, site, url.origin, link ? '/member/mypage' : safeNext(url.searchParams.get('next')), link ? 'link' : 'login', link ? me.member.id : null, now() + START_TTL),
  ]);
  // 네이버는 로그인을 '시작한 페이지'도 등록한 서비스 URL(xim.plators.com)인지 본다 → xim 의 /naver/go 페이지가 네이버로 넘긴다
  return go(`${NAVER_GO}?state=${state}`, [setCookie(STATE_COOKIE, state, START_TTL / 1000)]);
}

// 이 브라우저가 시작한 상태 행 (쿠키와 주소의 state 가 같아야 — 남이 만든 주소로 로그인시키는 것을 막는다)
async function myState(ctx, state) {
  const c = cookie(ctx.request, STATE_COOKIE);
  if (!state || !c || c !== state || !/^[0-9a-f]{48}$/.test(state)) return null;
  const row = await ctx.env.DB.prepare('SELECT * FROM social_states WHERE state = ? AND site = ? AND expires_at > ?').bind(state, ctx.site, now()).first();
  return row?.profile ? row : null;
}
const dropState = (db, state) => db.prepare('DELETE FROM social_states WHERE state = ?').bind(state);
const clearCookie = setCookie(STATE_COOKIE, '', 0);

// ③ /member/naver/done?state=…
export async function naverDone(ctx, { msgPage }) {
  const { env, site, url, me } = ctx;
  const db = env.DB;
  const state = url.searchParams.get('state') || '';
  const again = '<div class="actions center"><a class="btn primary" href="/member/login">로그인 화면으로</a></div>';
  if (url.searchParams.get('cancel')) {
    await dropState(db, state).run().catch(() => {});
    return go(`${url.origin}/member/login`, [clearCookie]);
  }
  const row = await myState(ctx, state);
  if (!row) return msgPage(ctx, '네이버 로그인', '시간이 지났거나 다른 브라우저에서 시작한 로그인입니다. 다시 해 주세요.', again, 400);
  const p = JSON.parse(row.profile);
  const linked = await db.prepare(`SELECT m.* FROM member_social s JOIN members m ON m.id = s.member_id AND m.site = s.site
    WHERE s.site = ? AND s.provider = 'naver' AND s.uid = ?`).bind(site, p.id).first();

  // 마이페이지에서 "네이버 연결하기"
  if (row.mode === 'link') {
    await dropState(db, state).run();
    if (me.kind !== 'member' || me.member.id !== row.member_id) return msgPage(ctx, '네이버 연결', '로그인한 계정이 바뀌었습니다. 다시 해 주세요.', again, 400);
    if (linked && linked.id !== me.member.id) return msgPage(ctx, '네이버 연결', '이 네이버 계정은 이미 다른 회원 계정에 연결돼 있습니다.', '<div class="actions center"><a class="btn" href="/member/mypage">마이페이지</a></div>', 409);
    await db.prepare("INSERT OR REPLACE INTO member_social (site, provider, uid, member_id, created_at) VALUES (?, 'naver', ?, ?, ?)").bind(site, p.id, me.member.id, now()).run();
    return go(`${url.origin}/member/mypage?naver=linked`, [clearCookie]);
  }
  // 이미 연결된 회원 → 로그인
  if (linked && linked.status !== 'WITHDRAWN') {
    await dropState(db, state).run();
    if (linked.status === 'LOCKED') return msgPage(ctx, '로그인할 수 없습니다', '관리자가 로그인을 막아 둔 계정입니다. 관리자에게 문의해 주세요.', '', 423);
    await db.prepare('UPDATE members SET fail_count = 0, locked_until = 0, last_login_at = ? WHERE id = ?').bind(now(), linked.id).run();
    return go(`${url.origin}${safeNext(row.next)}`, [clearCookie, await createSession(db, site, 'keep', linked.id)]);
  }
  // 같은 이메일로 이미 가입한 회원 — 자동으로 합치지 않는다(남의 계정을 가져가는 일을 막기 위해). 로그인 뒤 마이페이지에서 연결.
  if (p.email) {
    const dup = await db.prepare("SELECT status FROM members WHERE site = ? AND (lower(login_id) = ? OR lower(email) = ?) ORDER BY status = 'WITHDRAWN' LIMIT 1").bind(site, p.email, p.email).first();
    if (dup) {
      await dropState(db, state).run();
      return msgPage(ctx, '이미 가입한 이메일입니다', dup.status === 'WITHDRAWN'
        ? '탈퇴한 이메일입니다. 다시 가입하려면 사이트 관리자에게 문의해 주세요.'
        : `<b>${esc(p.email)}</b> 로 이미 가입하셨어요. 이메일과 비밀번호로 로그인한 뒤 <b>마이페이지 › 네이버 연결하기</b>를 누르면 다음부터 네이버로 로그인할 수 있습니다.`,
      `<div class="actions center"><a class="btn primary" href="/member/login?next=${encodeURIComponent('/member/mypage')}">로그인</a></div>`, 409);
    }
  }
  // 처음 온 사람 → 가입 화면 (네이버 값을 미리 채운다)
  await db.prepare("UPDATE social_states SET mode = 'signup', expires_at = ? WHERE state = ?").bind(now() + SIGNUP_TTL, state).run();
  return go(`${url.origin}/member/signup?with=naver`, [setCookie(STATE_COOKIE, state, SIGNUP_TTL / 1000)]);
}

// 가입 화면 · 가입 API: 네이버에서 온 사람이면 { state, p }
export async function naverSignup(ctx) {
  const row = await myState(ctx, cookie(ctx.request, STATE_COOKIE));
  if (!row || row.mode !== 'signup') return null;
  return { state: row.state, p: JSON.parse(row.profile), done: (memberId) => [
    ctx.env.DB.prepare("INSERT OR REPLACE INTO member_social (site, provider, uid, member_id, created_at) VALUES (?, 'naver', ?, ?, ?)").bind(ctx.site, JSON.parse(row.profile).id, memberId, now()),
    dropState(ctx.env.DB, row.state),
  ] };
}

export const hasNaver = async (db, site, memberId) => !!(await db.prepare("SELECT 1 FROM member_social WHERE site = ? AND provider = 'naver' AND member_id = ?").bind(site, memberId).first());
export const naverLoginId = (p) => (p.email ? str(p.email, 254).toLowerCase() : `naver-${String(p.id).slice(0, 40)}`);
