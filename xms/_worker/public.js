// xms 방문자 화면 · API — 고객 사이트 주소 아래 /member/* · /board/* · /xms-api/*
import {
  DAY, now, bad, forbidden, notFound, HttpError, json, html, esc, str, body, siteSettings, MEMBER_COLUMNS, canBy, levelBit,
  createSession, keepCookie, SESS_COOKIE, setCookie, ensureDocs, hashPassword, newPassword, sameText, sanitizeHtml, plainText, clientIp, tooManyFails, recordFail, isAdmin, audit, verOf,
  memberValues, uniqueProblem,
} from './lib.js';
import { boardOptions } from './admin-api.js';
import { postAttachments, syncPostFiles, removePostFiles, setAvatar, avatarOf, directGetUrl, directUrls, uploadIdsIn } from './uploads.js';
import { sendSignupCode, verifySignupCode, takeTicket, turnstileKeys } from './signup.js';
import { applyPage, applicantsPage, applicantPage, publicApply, applyOn, openRound } from './apply.js';

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60000;

// ───────── 공통: 사이트 정보 · 메뉴 ─────────
async function siteInfo(env, site) {
  const s = await env.XIM_DB.prepare('SELECT name, domain FROM sites WHERE slug = ?').bind(site).first();
  return { slug: site, name: s?.name || site, domain: s?.domain || '' };
}

// 이 방문자에게 보이는 메뉴 트리
export async function visibleMenus(db, site, me) { return (await menuAccess(db, site, me)).menu; }
// 주소 비교용: /about.html · /about · /about/ 을 같은 것으로 (물음표 · # 뒤는 뺀다). xim site-worker.js 의 pagePath 와 같게.
export const pagePath = (p) => {
  let s = String(p || '').split(/[?#]/)[0];
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  s = s.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
  return s || '/';
};
// 메뉴 트리 + 이 방문자가 볼 수 없는 사이트 안 페이지 주소(blocked) — 사이트 Worker 가 그 주소로 바로 들어와도 막는다.
//   위 메뉴를 못 보면 그 아래 메뉴의 페이지도 못 본다. 숨긴 메뉴(visible=0)는 권한이 아니라 막지 않는다.
export async function menuAccess(db, site, me) {
  const { results } = await db.prepare(`SELECT m.*, b.slug AS board_slug, b.list_levels, b.allow_guest_list, b.guest_menu, b.visible AS board_visible
    FROM menus m LEFT JOIN boards b ON b.id = m.board_id AND b.deleted_at IS NULL WHERE m.site = ? ORDER BY m.sort, m.id`).bind(site).all();
  const can = (m) => {
    if (!m.visible) return false;
    if (me.level === 1) return true;
    if (m.menu_type === 'BOARD') {
      if (!m.board_slug || !m.board_visible) return false;
      return me.level ? canBy(m.list_levels, 0, me) : !!(m.allow_guest_list || m.guest_menu);
    }
    if (!me.level) return !!m.allow_guest_read;
    if (m.read_levels === null) return true;
    return !!(m.read_levels & levelBit(me.level === 10 ? 9 : me.level));
  };
  const build = (parent) => results.filter((m) => (m.parent_id ?? null) === parent && can(m)).map((m) => ({
    title: m.title,
    href: m.menu_type === 'BOARD' ? `/board/${m.board_slug}` : m.path,
    external: m.menu_type === 'LINK',
    children: m.menu_type === 'LINK' ? [] : build(m.id),
  }));
  const allowed = (m) => m.menu_type === 'BOARD' || can({ ...m, visible: 1 }); // 권한만 본다 (게시판은 게시판 권한이 따로 막음)
  const byId = new Map(results.map((m) => [m.id, m]));
  const locked = (m) => { for (let c = m, g = 0; c && g++ < 30; c = byId.get(c.parent_id)) if (!allowed(c)) return true; return false; };
  const blocked = me.level === 1 ? [] : [...new Set(results.filter((m) => m.menu_type === 'PAGE' && /^\//.test(m.path) && locked(m)).map((m) => pagePath(m.path)))];
  return { menu: build(null), blocked };
}

function navHtml(items, depth = 0) {
  if (!items.length) return '';
  return `<ul class="${depth ? 'sub' : 'gnb'}">${items.map((m) => {
    const a = m.href
      ? `<a href="${esc(m.href)}"${m.external ? ' target="_blank" rel="noopener"' : ''}>${esc(m.title)}</a>`
      : `<span>${esc(m.title)}</span>`;
    return `<li>${a}${navHtml(m.children, depth + 1)}</li>`;
  }).join('')}</ul>`;
}

// 게시판 목록 · 카드 썸네일 · 글 아래 최신글처럼 화면에 남은 /xms/upload/<id> 그림도, 아무나 볼 수 있는 글의 그림이면 R2(서울) 주소로
//   (serveUpload 의 공개 판단과 같다: 지운 · 숨긴 · 예약 · 비밀 글이 아니고, 비회원도 목록이나 읽기를 볼 수 있는 게시판 — 사용자 지시 2026-11-13)
async function openImages(env, site, html) {
  const ids = [...new Set([...String(html).matchAll(/\/xms\/upload\/([0-9a-f]{32})(?!\?dl=1)/g)].map((m) => m[1]))].slice(0, 200);
  if (!ids.length || !env.R2_KEY_ID) return html;
  const { results } = await env.DB.prepare(`SELECT u.id FROM uploads u JOIN posts p ON p.id = u.post_id JOIN boards b ON b.id = p.board_id
    WHERE u.site = ? AND u.id IN (${ids.map(() => '?').join(',')}) AND p.deleted_at IS NULL AND p.is_hidden = 0 AND p.is_secret = 0 AND p.published_at <= ?
      AND b.deleted_at IS NULL AND b.visible = 1 AND ((b.allow_guest_list = 1 AND (u.kind = 'IMAGE' OR (u.kind = 'INLINE' AND u.mime LIKE 'image/%'))) OR b.allow_guest_read = 1)`)
    .bind(site, ...ids, now()).all();
  if (!results.length) return html;
  const map = await directUrls(env, site, results.map((r) => r.id));
  return String(html).replace(/\/xms\/upload\/([0-9a-f]{32})(?!\?dl=1)/g, (all, id) => map[id] || all);
}

async function page(ctx, title, content, opts = {}) {
  const { env, site, me } = ctx;
  content = await openImages(env, site, content).catch(() => content);
  const info = await siteInfo(env, site);
  // 사이트 안에 끼워 넣을 때(사이트 Worker 가 X-Xms-Embed 로 부름): 본문만 돌려주고, 머리 · 꼬리 · CSS 는 사이트 것을 그대로 쓴다
  if (ctx.request.headers.get('X-Xms-Embed') === '1') {
    return json({ title: `${title} - ${info.name}`, html: `<div class="xms-c">${content}</div>`, status: opts.status || 200, noindex: !!opts.noindex });
  }
  const menus = await visibleMenus(env.DB, site, me);
  // 로그인 · 계정 메뉴는 모든 서비스 공통 버튼(/xms/js/account.js)이 그린다
  return html(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} - ${esc(info.name)}</title>
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/xms/css/style.css?v=${verOf(env)}">
<script type="module" src="/xms/js/public.js?v=${verOf(env)}"></script>
${['common', 'editor', 'blocks', 'crop'].map((m) => `<link rel="modulepreload" href="/xms/js/${m}.js?v=${verOf(env)}">`).join('')}
<script src="/xms/js/account.js?v=${verOf(env)}" defer></script>
</head><body class="pub">
<header class="pub-top"><div class="pub-in">
  <a class="pub-brand" href="/">${esc(info.name)}</a>
  <nav class="pub-nav" data-nav>${navHtml(menus)}</nav>
  <span class="pub-account" data-xms-account></span>
  <button type="button" class="nav-btn" aria-label="메뉴 열기" aria-expanded="false" data-nav-toggle><i></i><i></i><i></i></button>
</div></header>
<main class="pub-main">${content}</main>
<footer class="pub-foot">© ${esc(info.name)}</footer>
</body></html>`, opts.status || 200);
}

const msgPage = (ctx, title, text, action = '', status = 200) => page(ctx, title, `<section class="pub-box narrow center"><h1>${esc(title)}</h1><p class="lede">${text}</p>${action}</section>`, { status, noindex: true });
const needLogin = (ctx, back) => msgPage(ctx, '로그인이 필요합니다', '회원만 볼 수 있는 곳입니다. 로그인해 주세요.',
  `<div class="actions center"><a class="btn primary" href="/member/login?next=${encodeURIComponent(back)}">로그인</a><a class="btn" href="/member/signup">회원가입</a></div>`);
const noRight = (ctx) => msgPage(ctx, '볼 수 없는 곳입니다', '지금 회원 등급으로는 볼 수 없습니다. 궁금하면 관리자에게 문의해 주세요.', '<div class="actions center"><a class="btn" href="/">홈으로</a></div>');

const fmtDate = (ms, withTime = false) => {
  const d = new Date(ms + 9 * 3600000).toISOString();
  return withTime ? `${d.slice(0, 10).replace(/-/g, '.')} ${d.slice(11, 16)}` : d.slice(0, 10).replace(/-/g, '.');
};

// ───────── 회원 화면 ─────────
async function latestDocs(db, site, env) {
  if (env) await ensureDocs(env, site);
  const { results } = await db.prepare(`SELECT d.* FROM documents d WHERE d.site = ? AND d.version =
    (SELECT MAX(version) FROM documents x WHERE x.site = d.site AND x.doc_type = d.doc_type)`).bind(site).all();
  return { TERMS: results.find((d) => d.doc_type === 'TERMS'), PRIVACY: results.find((d) => d.doc_type === 'PRIVACY') };
}

function fieldInput(f, value) {
  const req = f.mode === 'REQUIRED' ? ' required' : '';
  const label = `<span>${esc(f.label)}${f.mode === 'REQUIRED' ? ' <em class="req">*</em>' : ''}</span>`;
  const v = value ?? '';
  if (f.type === 'SELECT') {
    return `<label class="field">${label}<select class="input" name="${f.key}"${req}><option value="">선택해 주세요</option>${(f.options || [])
      .map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }
  if (f.type === 'RADIO' || f.type === 'CHECKBOX') {
    const vals = Array.isArray(v) ? v : [v];
    const t = f.type === 'RADIO' ? 'radio' : 'checkbox';
    return `<fieldset class="field" data-group="${f.key}" data-type="${f.type}"${req ? ' data-required' : ''}>${label.replace('span', 'legend').replace('</span>', '</legend>')}
      <div class="choices">${(f.options || []).map((o) => `<label class="check"><input type="${t}" name="${f.key}" value="${esc(o)}"${vals.includes(o) ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div></fieldset>`;
  }
  const type = f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date'
    : f.key === 'email' ? 'email' : (f.key === 'mobile' || f.key === 'phone') ? 'tel' : 'text';
  const auto = { name: 'name', email: 'email', mobile: 'tel', nickname: 'nickname' }[f.key] || 'off';
  return `<label class="field">${label}<input class="input" type="${type}" name="${f.key}" value="${esc(v)}" autocomplete="${auto}"${req}${type === 'text' ? ' maxlength="100"' : ''}></label>`;
}

// 비밀번호 칸 + 눈 모양 보기 버튼 (public.js 가 누르면 바꾼다)
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const pwInput = (name, auto, extra = '') => `<span class="pw-wrap"><input class="input" type="password" name="${name}" autocomplete="${auto}"${extra}>
  <button type="button" class="pw-eye" data-pw-eye aria-label="비밀번호 보기" aria-pressed="false">${EYE}</button></span>`;

// ───────── 회원 화면 (모든 사이트 공통 · 사이트 틀 안에 들어간다) ─────────
//   카드 하나(.mb-card) 안에 머리(아이콘 · 제목 · 설명) → 입력 묶음 → 큰 버튼 → 아래 링크. 강조색은 사이트의 --brand.
const PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';
const ICONS = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/></svg>',
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.4"/></svg>',
};
const mbHead = (icon, title, sub) => `<header class="mb-head"><span class="mb-ico">${ICONS[icon]}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</header>`;
// 프로필 사진 동그라미 (사진이 없으면 사람 모양)
const avatarHtml = (src, cls = '') => `<span class="mb-avatar ${cls}" data-avatar-view>${src ? `<img src="${esc(src)}" alt="">` : PERSON_SVG}</span>`;
// 사진 고르기 (가입 2단계 · 마이페이지)
const avatarPick = (src, note) => `<div class="mb-pick" data-avatar-pick>
    <button type="button" class="mb-pick-btn" data-avatar-btn aria-label="프로필 사진 고르기">${avatarHtml(src, 'lg')}<span class="mb-cam">${ICONS.cam}</span></button>
    <div class="mb-pick-txt"><b>프로필 사진</b><small>${note}</small>
      <span class="mb-pick-acts"><button type="button" class="linkish" data-avatar-btn>${src ? '바꾸기' : '사진 고르기'}</button><button type="button" class="linkish danger" data-avatar-clear${src ? '' : ' hidden'}>빼기</button></span></div>
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-file hidden>
  </div>`;

async function loginPage(ctx) {
  if (ctx.me.kind === 'member') return Response.redirect(`${ctx.url.origin}/member/mypage`, 302);
  const next = safeNext(ctx.url.searchParams.get('next'));
  return page(ctx, '로그인', `<section class="mb">
  <div class="mb-card">
    ${mbHead('lock', '로그인', '이메일과 비밀번호로 로그인하세요.')}
    <form data-form="login" data-next="${esc(next)}" class="mb-form">
      <label class="field"><span>이메일(아이디)</span><input class="input" name="login_id" type="email" autocomplete="username" required maxlength="254" placeholder="name@example.com"></label>
      <label class="field"><span>비밀번호</span>${pwInput('password', 'current-password', ' required placeholder="비밀번호"')}</label>
      <label class="check keep"><input type="checkbox" name="keep" checked> 로그인 유지</label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide mb-go" type="submit">로그인</button>
    </form>
    <div class="mb-foot"><span>아직 회원이 아니신가요?</span><a href="/member/signup">회원가입</a></div>
  </div>
  <p class="mb-note">비밀번호를 잊으셨으면 사이트 관리자에게 새 비밀번호를 받으세요.</p>
</section>`, { noindex: true });
}

async function signupPage(ctx) {
  const { env, site, me } = ctx;
  if (me.kind === 'member') return Response.redirect(`${ctx.url.origin}/member/mypage`, 302);
  const { fields } = await siteSettings(env.DB, site);
  const docs = await latestDocs(env.DB, site, env);
  const agree = (d, key, label) => (d ? `<div class="agree-row"><label class="check"><input type="checkbox" name="agree_${key}" required> ${label} 동의 <em class="req">(필수)</em></label>
    <button type="button" class="linkish" data-doc="${key}">보기</button><template id="doc-${key}">${d.content}</template></div>` : '');
  const agreeBox = docs.TERMS || docs.PRIVACY ? `<div class="agree">
      <label class="check all"><input type="checkbox" data-agree-all> 모두 동의합니다</label>
      ${agree(docs.TERMS, 'terms', '이용약관')}${agree(docs.PRIVACY, 'privacy', '개인정보 처리방침')}</div>` : '';
  const tk = (await turnstileKeys(env, site)).sitekey;
  // 1단계: 이메일 → 6자리 번호 / 2단계: 사진(선택) · 비밀번호 · 이름 · 휴대전화 … (이메일 칸은 1단계에서 받았으니 뺀다)
  return page(ctx, '회원가입', `<section class="mb">
  <div class="mb-card">
    ${mbHead('user', '회원가입', '이메일 인증 뒤 정보를 넣으면 가입이 끝나요.')}
    <ol class="steps" aria-label="가입 단계"><li class="on" data-step-dot="1"><i></i><span>이메일 인증</span></li><li data-step-dot="2"><i></i><span>정보 입력</span></li></ol>
    <form data-form="signup-code" data-step="1" class="mb-form">
      <label class="field"><span>이메일 <em class="req">*</em></span>
        <span class="row-input"><input class="input" type="email" name="email" autocomplete="email" required maxlength="254" placeholder="name@example.com">
        <button class="btn primary" type="submit">인증번호 받기</button></span>
        <small>이 이메일이 아이디가 됩니다.</small></label>
      ${tk ? `<div class="cf-turnstile" data-sitekey="${esc(tk)}" data-language="ko" data-size="flexible"></div>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}
      <p class="err" role="alert"></p>
    </form>
    <form data-form="signup-verify" data-step="1" class="mb-form" hidden>
      <label class="field"><span>인증번호 <em class="req">*</em> <b class="timer" data-timer></b></span>
        <span class="row-input"><input class="input code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6자리 숫자">
        <button class="btn primary" type="submit">확인</button></span>
        <small>메일이 안 보이면 스팸함도 봐 주세요. <button type="button" class="linkish" data-resend>다시 받기</button></small></label>
      <p class="err" role="alert"></p>
    </form>
    <form data-form="signup" data-step="2" class="mb-form" hidden>
      <div class="mb-verified"><span class="tag green">인증됨</span><b data-email></b></div>
      ${avatarPick('', '선택 · 나중에 마이페이지에서 바꿀 수 있어요')}
      <div class="mb-group">
        <label class="field"><span>비밀번호 <em class="req">*</em></span>${pwInput('password', 'new-password', ' required minlength="8" maxlength="200" placeholder="8자 이상"')}</label>
        <label class="field"><span>비밀번호 확인 <em class="req">*</em></span>${pwInput('password2', 'new-password', ' required placeholder="한 번 더"')}<small data-pw-match></small></label>
      </div>
      <div class="mb-group">${fields.filter((f) => f.mode !== 'EXCLUDED' && f.key !== 'email').map((f) => fieldInput(f)).join('')}</div>
      ${agreeBox}
      <p class="err" role="alert"></p>
      <button class="btn primary wide mb-go" type="submit">가입하기</button>
    </form>
    <div class="mb-foot"><span>이미 가입하셨나요?</span><a href="/member/login">로그인</a></div>
  </div>
</section>`, { noindex: true });
}

// 가입 완료 (모든 xim 사이트 공통)
async function welcomePage(ctx) {
  const { env, site, me } = ctx;
  if (me.kind !== 'member') return Response.redirect(`${ctx.url.origin}/member/login`, 302);
  const info = await siteInfo(env, site);
  const m = me.member;
  const applyNow = (await applyOn(env.DB, site)) && (await openRound(env.DB, site)); // 신청 기간이면 가입 뒤 바로 신청서로
  return page(ctx, '가입 완료', `<section class="mb">
  <div class="mb-card center">
    <div class="mb-welcome">${avatarHtml(avatarOf(m), 'xl')}<span class="welcome-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>
    <h1 class="mb-title">가입을 환영합니다</h1>
    <p class="mb-lede"><b>${esc(m.nickname || m.name)}</b>님, ${esc(info.name)} 회원이 되셨어요.</p>
    <dl class="mb-kv"><div><dt>아이디</dt><dd>${esc(m.login_id)}</dd></div><div><dt>이름</dt><dd>${esc(m.name)}</dd></div><div><dt>가입일</dt><dd>${fmtDate(m.created_at)}</dd></div></dl>
    <p class="mb-note">지금 로그인돼 있어요. 다음부터는 이메일과 비밀번호로 로그인하세요.</p>
    <div class="mb-acts">${applyNow ? `<a class="btn primary" href="/member/apply">${esc(applyNow.title.includes('장학') ? '장학금 신청하러 가기' : '신청하러 가기')}</a><a class="btn" href="/">홈으로</a>` : '<a class="btn primary" href="/">홈으로</a><a class="btn" href="/member/mypage">마이페이지</a>'}</div>
  </div>
</section>`, { noindex: true });
}

async function mypage(ctx) {
  const { env, site, me } = ctx;
  if (me.kind !== 'member') return needLogin(ctx, '/member/mypage');
  const { fields, levelNames } = await siteSettings(env.DB, site);
  const m = me.member;
  const extra = JSON.parse(m.extra || '{}');
  const val = (f) => (MEMBER_COLUMNS.includes(f.key) ? m[f.key] : extra[f.key]);
  const av = avatarOf(m);
  return page(ctx, '마이페이지', `<section class="mb wide">
  <div class="mb-card mb-profile">
    <div class="mb-pick" data-avatar-pick data-avatar-live>
      <button type="button" class="mb-pick-btn" data-avatar-btn aria-label="프로필 사진 바꾸기">${avatarHtml(av, 'xl')}<span class="mb-cam">${ICONS.cam}</span></button>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-file hidden>
    </div>
    <div class="mb-who">
      <h1>${esc(m.nickname || m.name)}<span class="mb-level">${esc(levelNames[m.level])}</span></h1>
      <p>${esc(m.login_id)}</p>
      <p class="mb-since">${fmtDate(m.created_at).slice(0, 10)} 가입</p>
      <span class="mb-pick-acts"><button type="button" class="linkish" data-avatar-btn>${av ? '사진 바꾸기' : '사진 넣기'}</button><button type="button" class="linkish danger" data-avatar-clear${av ? '' : ' hidden'}>사진 빼기</button></span>
    </div>
  </div>

  <div class="mb-card">
    <h2 class="mb-sec">내 정보</h2>
    <form data-form="profile" class="mb-form">
      <div class="mb-grid">${fields.filter((f) => f.mode !== 'EXCLUDED' && !(f.key === 'email' && m.login_id.includes('@'))).map((f) => fieldInput(f, val(f))).join('')}</div>
      <p class="err" role="alert"></p>
      <div class="mb-acts end"><button class="btn primary" type="submit">저장</button></div>
    </form>
  </div>

  <div class="mb-card">
    <h2 class="mb-sec">비밀번호 변경</h2>
    <form data-form="password" class="mb-form">
      <label class="field"><span>지금 비밀번호</span>${pwInput('current', 'current-password', ' required')}</label>
      <div class="mb-grid">
        <label class="field"><span>새 비밀번호</span>${pwInput('next', 'new-password', ' minlength="8" required placeholder="8자 이상"')}</label>
        <label class="field"><span>새 비밀번호 확인</span>${pwInput('next2', 'new-password', ' required')}</label>
      </div>
      <p class="err" role="alert"></p>
      <div class="mb-acts end"><button class="btn" type="submit">비밀번호 바꾸기</button></div>
    </form>
  </div>

  <details class="mb-card mb-danger">
    <summary>회원 탈퇴</summary>
    <form data-form="withdraw" class="mb-form">
      <p class="mb-note left">탈퇴하면 이 아이디로 다시 로그인할 수 없어요. 쓴 글과 댓글은 그대로 남습니다.</p>
      <label class="field"><span>탈퇴 사유 (선택)</span><input class="input" name="reason" maxlength="200"></label>
      <p class="err" role="alert"></p>
      <div class="mb-acts end"><button class="btn danger" type="submit" data-confirm="정말 탈퇴할까요? 탈퇴하면 이 아이디로 로그인할 수 없습니다. 쓴 글과 댓글은 그대로 남습니다.">탈퇴하기</button></div>
    </form>
  </details>
</section>`, { noindex: true });
}

async function docPage(ctx, type) {
  const d = (await latestDocs(ctx.env.DB, ctx.site, ctx.env))[type];
  const title = type === 'TERMS' ? '이용약관' : '개인정보 처리방침';
  if (!d) return msgPage(ctx, title, '아직 게시된 내용이 없습니다.');
  return page(ctx, title, `<section class="pub-box"><h1>${title}</h1><p class="meta">v${d.version} · ${fmtDate(d.published_at)} 시행</p><div class="prose">${d.content}</div></section>`);
}

// ───────── 게시판 화면 ─────────
async function loadBoard(db, site, slug) {
  const b = await db.prepare('SELECT * FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, slug).first();
  return b ? { ...b, opt: boardOptions(JSON.parse(b.options || '{}')) } : null;
}
const canList = (b, me) => b.visible || me.level === 1 ? canBy(b.list_levels, b.allow_guest_list, me) : false;
const canRead = (b, me) => canBy(b.read_levels, b.allow_guest_read, me);
const canWrite = (b, me) => canBy(b.write_levels, b.allow_guest_write, me, true);
const canComment = (b, me) => me.level > 0 && canBy(b.comment_levels, 0, me, true);
const isMine = (p, me) => me.kind === 'member' && p.writer_id === me.member.id;
const writerOf = (b, p, me) => (b.opt.writer_mode === 'HIDDEN' && me.level !== 1 && !isMine(p, me) ? '비공개' : p.writer_name);
const firstImage = (h) => (String(h).match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';

async function boardList(ctx, b) {
  const { env, me, url } = ctx;
  if (b.opt.list_url && me.level !== 1) return Response.redirect(new URL(b.opt.list_url, url).href, 302);
  if (!canList(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  const q = str(url.searchParams.get('q'), 50);
  const size = [10, 20, 30].includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : b.opt.page_size;
  const pg = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const admin = me.level === 1;
  const where = ['board_id = ?', 'deleted_at IS NULL', 'is_notice = 0'];
  const args = [b.id];
  if (!admin) { where.push('published_at <= ?', 'is_hidden = 0'); args.push(now()); }
  if (q) { where.push('(title LIKE ? OR content_html LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const w = where.join(' AND ');
  // 개수 · 목록 · 공지를 동시에 (DB 왕복 줄이기)
  const [cnt, listRes, ntsRes] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${w}`).bind(...args).first(),
    env.DB.prepare(`SELECT * FROM posts WHERE ${w} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...args, size, (pg - 1) * size).all(),
    pg === 1 && !q
      ? env.DB.prepare(`SELECT * FROM posts WHERE board_id = ? AND deleted_at IS NULL AND is_notice = 1 ${admin ? '' : 'AND published_at <= ? AND is_hidden = 0'} ORDER BY published_at DESC`)
        .bind(...(admin ? [b.id] : [b.id, now()])).all()
      : { results: [] },
  ]);
  const total = cnt.n;
  const rows = listRes.results;
  const notices = ntsRes.results;
  const ls = b.opt.list_show;
  const isNew = (p) => now() - p.published_at < b.opt.new_hours * 3600000;
  const secretHidden = (p) => p.is_secret && !admin && !isMine(p, me);
  // 관리자: 글마다 고르는 칸(글 관리 때만 보임) · 숨긴 글 표시
  const pick = (p) => (admin ? `<label class="pick" aria-label="글 고르기"><input type="checkbox" value="${p.id}"></label>` : '');
  const hid = (p) => (p.is_hidden ? ' is-hidden' : '');
  const titleHtml = (p) => `${p.is_hidden ? '<span class="tag gray">숨김</span>' : ''}${p.is_secret ? '<span class="tag">비밀</span>' : ''}${p.published_at > now() ? '<span class="tag warn">예약</span>' : ''}${esc(secretHidden(p) ? '비밀글입니다' : p.title)}${isNew(p) ? '<span class="tag new">N</span>' : ''}`;
  const link = (p) => `/board/${b.slug}/${p.id}`;
  let list = '';
  const all = [...notices.map((p) => ({ ...p, _notice: true })), ...rows];
  if (!all.length) {
    list = `<div class="empty"><b>${q ? '검색 결과가 없습니다' : '아직 게시글이 없습니다'}</b>${q ? `<a href="/board/${b.slug}">전체 글 보기</a>` : ''}</div>`;
  } else if (b.list_layout === 'CARD') {
    list = `<div class="cards">${all.map((p) => {
      const img = secretHidden(p) ? '' : firstImage(p.content_html);
      return `<a class="pcard${hid(p)}" href="${link(p)}" data-pid="${p.id}">${pick(p)}<div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span>No Image</span>'}</div>
        <div class="pcard-b">${p._notice ? '<span class="tag notice">공지</span>' : ''}<b>${titleHtml(p)}</b>${ls.date ? `<small>${fmtDate(p.published_at)}</small>` : ''}</div></a>`;
    }).join('')}</div>`;
  } else if (b.list_layout === 'BLOG') {
    list = `<div class="blog">${all.map((p) => `<article class="blog-row${hid(p)}" data-pid="${p.id}">${pick(p)}<a href="${link(p)}">${p._notice ? '<span class="tag notice">공지</span>' : ''}<h3>${titleHtml(p)}</h3>
      ${secretHidden(p) ? '' : `<p>${esc(plainText(p.content_html).slice(0, 160))}</p>`}</a>
      <div class="meta">${ls.writer ? `<span>${esc(writerOf(b, p, me))}</span>` : ''}${ls.date ? `<span>${fmtDate(p.published_at)}</span>` : ''}${ls.views ? `<span>조회 ${p.view_count}</span>` : ''}</div></article>`).join('')}</div>`;
  } else {
    list = `<table class="ptable"><thead><tr>${admin ? '<th class="c-pick"></th>' : ''}${ls.no ? '<th class="c-no">번호</th>' : ''}<th>제목</th>${ls.writer ? '<th class="c-w">작성자</th>' : ''}${ls.date ? '<th class="c-d">작성일</th>' : ''}${ls.views ? '<th class="c-v">조회</th>' : ''}</tr></thead><tbody>
      ${all.map((p, i) => `<tr class="${p._notice ? 'is-notice' : ''}${hid(p)}" data-pid="${p.id}">${admin ? `<td class="c-pick">${pick(p)}</td>` : ''}${ls.no ? `<td class="c-no">${p._notice ? '<span class="tag notice">공지</span>' : total - (pg - 1) * size - (i - notices.length)}</td>` : ''}
        <td class="c-t"><a href="${link(p)}">${!ls.no && p._notice ? '<span class="tag notice">공지</span>' : ''}${titleHtml(p)}</a></td>
        ${ls.writer ? `<td class="c-w">${esc(writerOf(b, p, me))}</td>` : ''}${ls.date ? `<td class="c-d">${fmtDate(p.published_at)}</td>` : ''}${ls.views ? `<td class="c-v">${p.view_count}</td>` : ''}</tr>`).join('')}
      </tbody></table>`;
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const qs = (n) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(size !== b.opt.page_size ? { size } : {}), page: n })}`;
  const start = Math.floor((pg - 1) / 5) * 5 + 1;
  const pager = pages > 1 ? `<nav class="pager">${start > 1 ? `<a href="${qs(start - 1)}">‹</a>` : ''}${Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i)
    .map((n) => (n === pg ? `<b>${n}</b>` : `<a href="${qs(n)}">${n}</a>`)).join('')}${start + 5 <= pages ? `<a href="${qs(start + 5)}">›</a>` : ''}</nav>` : '';
  return page(ctx, b.name, `<section class="pub-box wide">
    <div class="board-head"><h1>${esc(b.name)}</h1>${admin ? '<button type="button" class="btn manage-btn" data-manage>글 관리</button>' : ''}${canWrite(b, me) ? `<a class="btn primary" href="/board/${b.slug}/write">글쓰기</a>` : ''}</div>
    ${admin ? `<div class="manage-bar" data-manage-bar data-board="${esc(b.slug)}" hidden>
      <label class="check"><input type="checkbox" data-pick-all> 전체 선택 <small data-pick-count></small></label>
      <span class="manage-acts"><button type="button" class="btn" data-act="hide">숨김</button><button type="button" class="btn" data-act="show">보이기</button>
      <button type="button" class="btn danger" data-act="delete">삭제</button><button type="button" class="btn primary" data-manage-end>끝내기</button></span></div>` : ''}
    <form class="board-tools" method="get"><input class="input" name="q" value="${esc(q)}" placeholder="제목·내용 검색"><button class="btn" type="submit">검색</button>
      <select class="input" name="size" data-autosubmit aria-label="한 쪽에 보일 글 수">${[10, 20, 30].map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}개씩</option>`).join('')}</select></form>
    ${list}${pager}
  </section>`);
}

async function postView(ctx, b, id) {
  const { env, me, url } = ctx;
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND board_id = ? AND deleted_at IS NULL').bind(id, b.id).first();
  if (!p || ((p.published_at > now() || p.is_hidden) && me.level !== 1)) return msgPage(ctx, '글이 없습니다', '지워졌거나 없는 글입니다.', `<div class="actions center"><a class="btn" href="/board/${b.slug}">목록으로</a></div>`, 404);
  if (!canRead(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  if (p.is_secret && me.level !== 1 && !isMine(p, me)) return msgPage(ctx, '비밀글입니다', '쓴 사람과 관리자만 볼 수 있습니다.', `<div class="actions center"><a class="btn" href="/board/${b.slug}">목록으로</a></div>`);
  await env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').bind(p.id).run();
  const vs = b.opt.view_show;
  let comments = '';
  if (b.use_comment) {
    const { results } = await env.DB.prepare('SELECT * FROM comments WHERE post_id = ? AND deleted_at IS NULL ORDER BY id').bind(p.id).all();
    comments = `<section class="comments"><h2>댓글 ${results.length}</h2>
      ${results.map((c) => `<div class="cmt"><div class="meta"><b>${esc(c.writer_name)}</b><span>${fmtDate(c.created_at, true)}</span>
        ${me.level === 1 || (me.kind === 'member' && me.member.id === c.writer_id) ? `<button type="button" class="linkish danger" data-del-comment="${c.id}">삭제</button>` : ''}</div>
        <p class="pre">${esc(c.body)}</p></div>`).join('') || '<p class="meta">첫 댓글을 남겨 보세요.</p>'}
      ${canComment(b, me) ? `<form data-form="comment" data-post="${p.id}"><textarea class="input" name="body" maxlength="2000" required placeholder="댓글을 남겨 주세요"></textarea>
        <p class="err" role="alert"></p><div class="actions end"><button class="btn primary" type="submit">댓글 등록</button></div></form>`
        : me.level ? '' : `<p class="meta"><a href="/member/login?next=${encodeURIComponent(url.pathname)}">로그인</a>하면 댓글을 남길 수 있습니다.</p>`}
    </section>`;
  }
  const mine = me.level === 1 || isMine(p, me);
  const [atts, more] = await Promise.all([postAttachments(env, ctx.site, p.id), moreList(ctx, b, p)]);
  // 아무나 볼 수 있는 글이면 그림 · 첨부를 R2(서울) 에서 바로 (비밀 · 숨김 · 예약 · 권한 있는 글은 예전처럼 사이트 주소로 — 거기서 권한을 본다)
  const openPost = !p.is_secret && !p.is_hidden && p.published_at <= now() && canRead(b, { kind: 'guest', level: 0 });
  let bodyHtml = p.content_html;
  if (openPost) {
    const ids = [...uploadIdsIn(p.content_html), ...atts.map((u) => u.id)];
    const [view, dl] = await Promise.all([directUrls(env, ctx.site, ids), directUrls(env, ctx.site, atts.filter((u) => u.kind === 'FILE').map((u) => u.id), true)]);
    bodyHtml = bodyHtml.replace(/\/xms\/upload\/([0-9a-f]{32})(\?dl=1)?/g, (all, id, d) => (d ? null : view[id]) || all);
    for (const u of atts) { if (view[u.id]) u.url = view[u.id]; if (dl[u.id]) u.dl = dl[u.id]; }
  }
  const imgs = atts.filter((u) => u.kind === 'IMAGE');
  const files = atts.filter((u) => u.kind === 'FILE');
  return page(ctx, p.title, `<section class="pub-box wide">
    <p class="crumb"><a href="/board/${b.slug}">${esc(b.name)}</a></p>
    <article class="post">
      <h1>${p.is_hidden ? '<span class="tag gray">숨김</span>' : ''}${p.is_notice ? '<span class="tag notice">공지</span>' : ''}${p.is_secret ? '<span class="tag">비밀</span>' : ''}${esc(p.title)}</h1>
      <div class="meta">${vs.writer ? `<span>${esc(writerOf(b, p, me))}</span>` : ''}${vs.date ? `<span>${fmtDate(p.published_at, true)}</span>` : ''}${vs.views ? `<span>조회 ${p.view_count + 1}</span>` : ''}
        ${p.published_at > now() ? `<span class="tag warn">${fmtDate(p.published_at, true)} 공개 예약</span>` : ''}</div>
      ${imgs.length ? `<div class="post-photos">${imgs.map((u) => `<a href="${u.url}" target="_blank" rel="noopener"><img src="${u.url}" alt="${esc(u.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
      <div class="prose">${bodyHtml}</div>
      ${files.length ? `<div class="post-files"><b>첨부파일</b>${files.map((u) => `<a href="${u.dl || `${u.url}?dl=1`}">${esc(u.name)} <small>${fmtSize(u.size)}</small></a>`).join('')}</div>` : ''}
    </article>
    <div class="actions"><a class="btn" href="${b.opt.list_url || `/board/${b.slug}`}">목록</a>${mine ? `<a class="btn" href="/board/${b.slug}/${p.id}/edit">수정</a>
      <button class="btn danger" type="button" data-del-post="${p.id}" data-back="${b.opt.list_url || `/board/${b.slug}`}">삭제</button>` : ''}</div>
    ${comments}
    ${more}
  </section>`);
}

// 글 보기 아래 '최신글' — 표 · 블로그형은 줄 목록, 카드(갤러리)형은 썸네일. 지금 글은 강조 (사용자 지시 2026-11-11)
//   목록을 볼 수 있는 사람에게만. 공지는 빼고 최근 글 page_size 개(카드는 최대 12)
async function moreList(ctx, b, cur) {
  const { env, me } = ctx;
  if (!canList(b, me)) return '';
  const admin = me.level === 1;
  const n = Math.min(b.list_layout === 'CARD' ? 12 : 20, b.opt.page_size || 10);
  const { results } = await env.DB.prepare(`SELECT id, title, content_html, published_at, view_count, writer_name, writer_id, is_secret, is_hidden, is_notice FROM posts
    WHERE board_id = ? AND deleted_at IS NULL AND is_notice = 0 ${admin ? '' : 'AND published_at <= ? AND is_hidden = 0'} ORDER BY published_at DESC, id DESC LIMIT ?`)
    .bind(...(admin ? [b.id, n] : [b.id, now(), n])).all();
  if (!results.length) return '';
  const ls = b.opt.list_show;
  const secret = (p) => p.is_secret && !admin && !isMine(p, me);
  const title = (p) => `${p.is_secret ? '<span class="tag">비밀</span>' : ''}${esc(secret(p) ? '비밀글입니다' : p.title)}${p.id === cur.id ? '<span class="tag blue">보는 글</span>' : ''}`;
  const link = (p) => `/board/${b.slug}/${p.id}`;
  let body;
  if (b.list_layout === 'CARD') {
    const ids = results.filter((p) => !secret(p) && !firstImage(p.content_html)).map((p) => p.id);
    const atts = ids.length ? (await env.DB.prepare(`SELECT post_id, id FROM uploads WHERE site = ? AND kind = 'IMAGE' AND post_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort`).bind(ctx.site, ...ids).all()).results : [];
    const thumb = (p) => (secret(p) ? '' : firstImage(p.content_html) || (atts.find((a) => a.post_id === p.id) ? `/xms/upload/${atts.find((a) => a.post_id === p.id).id}` : ''));
    body = `<div class="cards more-cards">${results.map((p) => `<a class="pcard${p.id === cur.id ? ' is-current' : ''}" href="${link(p)}"${p.id === cur.id ? ' aria-current="page"' : ''}>
      <div class="thumb">${thumb(p) ? `<img src="${esc(thumb(p))}" alt="" loading="lazy">` : '<span>No Image</span>'}</div>
      <div class="pcard-b"><b>${title(p)}</b>${ls.date ? `<small>${fmtDate(p.published_at)}</small>` : ''}</div></a>`).join('')}</div>`;
  } else {
    body = `<table class="ptable more-table"><tbody>${results.map((p) => `<tr${p.id === cur.id ? ' class="is-current" aria-current="page"' : ''}>
      <td class="c-t"><a href="${link(p)}">${title(p)}</a></td>${ls.writer ? `<td class="c-w">${esc(writerOf(b, p, me))}</td>` : ''}${ls.date ? `<td class="c-d">${fmtDate(p.published_at)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  }
  return `<section class="post-more"><div class="post-more-h"><h2>${esc(b.name)} 최신글</h2><a href="/board/${b.slug}">전체 목록 →</a></div>${body}</section>`;
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// 글쓰기 · 수정 — 제목 / 작성자 / 작성일(관리자) / 첨부(이미지 · 파일) / 내용(에디터 ↔ 간단입력)
async function postForm(ctx, b, id) {
  const { env, me, url } = ctx;
  let p = null;
  if (id) {
    p = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND board_id = ? AND deleted_at IS NULL').bind(id, b.id).first();
    if (!p) return msgPage(ctx, '글이 없습니다', '지워졌거나 없는 글입니다.', '', 404);
    if (!(me.level === 1 || isMine(p, me))) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  } else if (!canWrite(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  const admin = me.level === 1;
  const local = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16);
  const atts = id ? await postAttachments(env, ctx.site, id) : [];
  const writer = p ? p.writer_name : me.kind === 'member' ? (me.member.nickname || me.member.name) : me.kind === 'staff' ? '관리자' : '';
  const guest = me.kind === 'guest';
  return page(ctx, id ? '글 수정' : '글쓰기', `<section class="pub-box wide write-box">
    <header class="write-head"><h1>${id ? '글 수정' : '글쓰기'}</h1><a class="write-board" href="${esc(b.opt.list_url || `/board/${b.slug}`)}">${esc(b.name)}</a></header>
    <form data-form="post" data-board="${esc(b.slug)}" data-id="${id || ''}"${b.opt.list_url ? ` data-after="${esc(b.opt.list_url)}"` : ''}>
      <label class="field"><span>제목</span><input class="input big" name="title" maxlength="200" required value="${esc(p?.title)}"></label>
      ${guest
        ? '<label class="field"><span>이름</span><input class="input half" name="writer_name" maxlength="20" required><small>비회원으로 남기는 글입니다. 수정·삭제는 관리자에게 문의해 주세요.</small></label>'
        : `<div class="field"><span>작성자</span><input class="input half readonly" value="${esc(writer)}" readonly tabindex="-1"></div>`}
      ${admin ? `<label class="field"><span>작성일</span><input class="input half" type="datetime-local" name="published_at" value="${local(p ? p.published_at : Date.now())}">
        <small>미래로 정하면 그때까지 숨겨집니다(예약 발행).</small></label>` : ''}
      <div class="field"><span>첨부</span>
        ${guest ? '<p class="meta">사진과 파일은 로그인한 뒤 올릴 수 있습니다.</p>' : `<div class="attach" data-attach>
          <div class="attach-btns">
            <button type="button" class="pill-btn" data-add="IMAGE"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>이미지</button>
            <button type="button" class="pill-btn" data-add="FILE"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>파일</button>
          </div>
          <div class="attach-list" data-list></div>
          <script type="application/json" data-init>${JSON.stringify(atts).replace(/</g, '\\u003c')}</script>
        </div>`}
      </div>
      <div class="field">
        <div class="content-head"><span>내용</span><div class="tabs mode-tabs" data-mode></div></div>
        <div class="editor" data-editor data-board="${esc(b.slug)}" data-guest="${guest ? 1 : 0}"><textarea name="content" hidden>${esc(p?.content_html || '')}</textarea>${p?.blocks ? `<script type="application/json" data-blocks>${p.blocks.replace(/</g, '\\u003c')}</script>` : ''}</div>
      </div>
      ${admin || b.use_secret ? `<div class="opts">
        ${admin ? `<label class="check"><input type="checkbox" name="is_notice"${p?.is_notice ? ' checked' : ''}> 공지로 지정</label>` : ''}
        ${b.use_secret ? `<label class="check"><input type="checkbox" name="is_secret"${p?.is_secret ? ' checked' : ''}> 비밀글</label>` : ''}
      </div>` : ''}
      <p class="err" role="alert"></p>
      <div class="actions end write-actions"><a class="btn big" href="${b.opt.list_url ? esc(b.opt.list_url) : id ? `/board/${esc(b.slug)}/${id}` : `/board/${esc(b.slug)}`}">취소</a><button class="btn big dark" type="submit" data-busy="${id ? '수정하는 중…' : '등록하는 중…'}">${id ? '수정' : '등록'}</button></div>
    </form>
  </section>`, { noindex: true });
}

// ───────── 라우터: 화면 ─────────
export async function publicPage(ctx) {
  const p = ctx.url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/member/login') return loginPage(ctx);
  if (p === '/member/signup') return signupPage(ctx);
  if (p === '/member/mypage') return mypage(ctx);
  if (p === '/member/welcome') return welcomePage(ctx);
  if (p === '/member/terms') return docPage(ctx, 'TERMS');
  if (p === '/member/privacy') return docPage(ctx, 'PRIVACY');
  if (p === '/member/apply') return applyPage(ctx, { page, needLogin, msgPage });
  if (p === '/member/apply/list') return applicantsPage(ctx, { page, needLogin, msgPage }); // 레벨1: 신청자 확인
  const ap = p.match(/^\/member\/apply\/(\d+)$/);
  if (ap) return applicantPage(ctx, Number(ap[1]), { page, needLogin, msgPage });
  // 메뉴 권한으로 막힌 페이지 (사이트 Worker 가 이 화면을 그 주소에 끼워 보여 줌)
  if (p === '/member/denied') {
    const back = String(ctx.url.searchParams.get('next') || '/');
    return ctx.me.level ? noRight(ctx) : needLogin(ctx, back.startsWith('/') && !back.startsWith('//') ? back : '/');
  }
  const m = p.match(/^\/board\/([a-z0-9-]+)(?:\/(\d+|write)(?:\/(edit))?)?$/);
  if (m) {
    const b = await loadBoard(ctx.env.DB, ctx.site, m[1]);
    if (!b || (!b.visible && ctx.me.level !== 1)) return msgPage(ctx, '게시판이 없습니다', '주소가 바뀌었거나 없는 게시판입니다.', '<div class="actions center"><a class="btn" href="/">홈으로</a></div>', 404);
    if (!m[2]) return boardList(ctx, b);
    if (m[2] === 'write') return postForm(ctx, b, null);
    if (m[3]) return postForm(ctx, b, Number(m[2]));
    return postView(ctx, b, Number(m[2]));
  }
  return msgPage(ctx, '페이지가 없습니다', '주소를 다시 확인해 주세요.', '', 404);
}

// ───────── 라우터: 방문자 API ─────────
// 로그인 뒤 갈 곳: 기본은 홈. 글쓰기처럼 로그인이 필요했던 화면만 그리로 돌아간다(회원 화면은 홈으로)
function safeNext(n) { return n && /^\/(?!\/)/.test(n) && !/^\/member\/(?!apply(?:\/(?:list|\d+))?$)/.test(n) ? n : '/'; } // 신청서(/member/apply)는 로그인 뒤 돌아간다

export async function publicApi(ctx) {
  const { request, env, site, me, url } = ctx;
  const db = env.DB;
  const path = url.pathname.replace(/^\/xms-api/, '').replace(/\/+$/, '');
  const method = request.method;
  let m;

  if (path === '/menu' && method === 'GET') return json(await visibleMenus(db, site, me));
  if (path === '/apply' || path === '/apply/draft') return publicApply(ctx, path); // 신청서 내기 · 임시 저장 (apply.js)

  // 게시판 최신 글 — 사이트 첫 화면 등에서 사이트 디자인 그대로 그릴 때 쓴다 (예: sjccc 홈 "포토")
  // 글 관리 (관리자): 고른 글 숨김 · 보이기 · 삭제(첨부 파일 · 댓글 · 글 기록까지 DB 에서 지운다 — 사용자 지시 2026-11-13)
  if ((m = path.match(/^\/boards\/([a-z0-9-]+)\/manage$/)) && method === 'POST') {
    if (me.level !== 1) throw forbidden('관리자만 할 수 있습니다.');
    const b = await loadBoard(db, site, m[1]);
    if (!b) throw notFound('게시판이 없습니다.');
    const raw = await body(request);
    const ids = [...new Set((Array.isArray(raw.ids) ? raw.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
    if (!ids.length) throw bad('글을 골라 주세요.');
    const SQL = { hide: 'is_hidden = 1', show: 'is_hidden = 0', delete: 'deleted_at = ?' };
    if (!SQL[raw.action]) throw bad('할 일을 알 수 없습니다.');
    const inIds = ids.map(() => '?').join(',');
    let r;
    if (raw.action === 'delete') {
      const { results: mine } = await db.prepare(`SELECT id FROM posts WHERE site = ? AND board_id = ? AND id IN (${inIds})`).bind(site, b.id, ...ids).all();
      const del = mine.map((x) => x.id);
      await removePostFiles(env, site, del);
      if (del.length) {
        const q2 = del.map(() => '?').join(',');
        await db.prepare(`DELETE FROM comments WHERE site = ? AND post_id IN (${q2})`).bind(site, ...del).run();
        r = await db.prepare(`DELETE FROM posts WHERE site = ? AND id IN (${q2})`).bind(site, ...del).run();
      } else r = { meta: { changes: 0 } };
    } else {
      r = await db.prepare(`UPDATE posts SET ${SQL[raw.action]} WHERE board_id = ? AND deleted_at IS NULL AND id IN (${inIds})`).bind(b.id, ...ids).run();
    }
    const label = { hide: '숨김', show: '보이기', delete: '삭제' }[raw.action];
    await audit(db, site, me, request, 'POSTS_MANAGE', b.name, `${label} ${r.meta.changes}개`);
    return json({ ok: true, changed: r.meta.changes });
  }
  //   GET /xms-api/boards/<주소>/files  → [{ id, title, desc, date, files: [{ name, size, url }] }]
  //   자료실처럼 사이트 디자인 안에서 '자료 이름 + 내려받기 버튼' 으로 보여 줄 때 (bsf archive.html, 사용자 지시 2026-11-13).
  //   첨부 파일(FILE)이 있는 글만, 비밀글 · 예약 글 · 숨긴 글 · 읽을 권한 없는 게시판은 빠진다
  if ((m = path.match(/^\/boards\/([a-z0-9-]+)\/files$/)) && method === 'GET') {
    const b = await loadBoard(db, site, m[1]);
    if (!b || !b.visible || !canList(b, me) || !canRead(b, me)) return json([]);
    const { results } = await db.prepare(`SELECT id, title, content_html, published_at FROM posts
      WHERE board_id = ? AND deleted_at IS NULL AND is_secret = 0 AND is_hidden = 0 AND published_at <= ? ORDER BY is_notice DESC, published_at DESC, id DESC LIMIT 100`).bind(b.id, now()).all();
    const ids = results.map((p) => p.id);
    const ups = ids.length ? (await db.prepare(`SELECT post_id, id, name, size, mime, r2_key FROM uploads WHERE site = ? AND kind = 'FILE' AND post_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, created_at`).bind(site, ...ids).all()).results : [];
    // 공개 게시판이면 R2(서울) 에서 바로 받는 주소(dl · view)도 함께 — 국내에서 사이트 주소를 거치면 1MB 에 10초 넘게 걸린다
    const open = canRead(b, { kind: 'guest', level: 0 });
    const out = await Promise.all(results.map(async (p) => ({
      id: p.id, title: p.title, desc: plainText(p.content_html).slice(0, 200), date: fmtDate(p.published_at), url: `/board/${b.slug}/${p.id}`,
      files: await Promise.all(ups.filter((u) => u.post_id === p.id).map(async (u) => ({
        name: u.name, size: u.size, url: `/xms/upload/${u.id}?dl=1`,
        dl: open ? await directGetUrl(env, u, true) : '', view: open ? await directGetUrl(env, u, false) : '',
      }))),
    })));
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });   // 올리고 지운 것이 바로 보이게
  }
  //   GET /xms-api/boards/<주소>/latest?n=4  → [{ id, title, date, url, thumb }]  (비밀글 · 예약 글 · 볼 권한 없는 글은 빠짐)
  if ((m = path.match(/^\/boards\/([a-z0-9-]+)\/latest$/)) && method === 'GET') {
    const b = await loadBoard(db, site, m[1]);
    if (!b || !b.visible || !canList(b, me)) return json([]);
    const n = Math.min(12, Math.max(1, Number(url.searchParams.get('n')) || 4));
    const { results } = await db.prepare(`SELECT id, title, content_html, published_at FROM posts
      WHERE board_id = ? AND deleted_at IS NULL AND is_secret = 0 AND is_hidden = 0 AND published_at <= ? ORDER BY published_at DESC, id DESC LIMIT ?`).bind(b.id, now(), n).all();
    const ids = results.map((p) => p.id);
    const atts = ids.length ? (await db.prepare(`SELECT post_id, id FROM uploads WHERE site = ? AND kind = 'IMAGE' AND post_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort`).bind(site, ...ids).all()).results : [];
    const attOf = (id) => atts.find((a) => a.post_id === id);
    return new Response(JSON.stringify(results.map((p) => ({
      id: p.id, title: p.title, date: fmtDate(p.published_at), url: `/board/${b.slug}/${p.id}`,
      thumb: firstImage(p.content_html) || (attOf(p.id) ? `/xms/upload/${attOf(p.id).id}` : ''),
    }))), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' } });
  }
  if (path === '/me' && method === 'GET') {
    if (me.kind === 'guest') return json({ guest: true });
    return json(me.kind === 'staff' ? { staff: true, admin: true } : { name: me.member.name, login_id: me.member.login_id, admin: isAdmin(me), avatar: avatarOf(me.member) });
  }
  // 프로필 사진 빼기 (올리기는 POST /xms-api/uploads?for=avatar)
  if (path === '/avatar' && method === 'DELETE') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    return setAvatar(env, site, me.member, '');
  }

  if (path === '/login' && method === 'POST') {
    const ipKey = `ip:${site}:${clientIp(request)}`;
    if (await tooManyFails(db, ipKey)) throw new HttpError(429, '로그인 시도가 너무 많습니다. 15분 뒤에 다시 해 주세요.');
    const raw = await body(request);
    const lid = str(raw.login_id, 254);
    const m2 = await db.prepare("SELECT * FROM members WHERE site = ? AND (login_id = ? OR (instr(login_id, '@') > 0 AND lower(login_id) = lower(?))) AND status != 'WITHDRAWN' LIMIT 1").bind(site, lid, lid).first();
    if (m2 && m2.locked_until > now()) throw new HttpError(423, `비밀번호를 ${LOCK_AFTER}번 틀려 잠시 잠겼습니다. ${Math.ceil((m2.locked_until - now()) / 60000)}분 뒤에 다시 해 주세요.`);
    const ok = m2 && sameText(await hashPassword(String(raw.password ?? '').slice(0, 200), m2.pw_salt), m2.pw_hash);
    if (!ok) {
      await recordFail(db, ipKey);
      if (m2) {
        const n = m2.fail_count + 1;
        await db.prepare('UPDATE members SET fail_count = ?, locked_until = ? WHERE id = ?').bind(n >= LOCK_AFTER ? 0 : n, n >= LOCK_AFTER ? now() + LOCK_MS : 0, m2.id).run();
        if (n >= LOCK_AFTER) throw new HttpError(423, `비밀번호를 ${LOCK_AFTER}번 틀려 15분 동안 잠겼습니다.`);
      }
      throw new HttpError(401, '이메일(아이디) 또는 비밀번호가 맞지 않습니다.');
    }
    if (m2.status === 'LOCKED') throw new HttpError(423, '관리자가 로그인을 막아 둔 계정입니다. 관리자에게 문의해 주세요.');
    await db.prepare('UPDATE members SET fail_count = 0, locked_until = 0, last_login_at = ? WHERE id = ?').bind(now(), m2.id).run();
    return json({ ok: true, admin: m2.level === 1 }, 200, { 'Set-Cookie': await createSession(db, site, raw.keep === false ? 'member' : 'keep', m2.id) });
  }
  // 로그인 유지: 쿠키 기한을 다시 늘린다 (서버 쪽 기한은 whoAmI 가 늘림)
  if (path === '/keep' && method === 'POST') {
    return json({ ok: true }, 200, me.keep ? { 'Set-Cookie': keepCookie(me.token) } : {});
  }
  if (path === '/logout' && method === 'POST') {
    if (me.token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(me.token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESS_COOKIE, '', 0) });
  }

  //   GET /xms-api/check?nickname=… | ?email=…  → { ok, message }  (가입 · 내 정보 화면에서 입력하는 동안)
  if (path === '/check' && method === 'GET') {
    const nickname = str(url.searchParams.get('nickname'), 100);
    const email = str(url.searchParams.get('email'), 254);
    if (!nickname && !email) return json({ ok: false, message: '' });
    const prob = await uniqueProblem(db, site, { nickname, email }, me.kind === 'member' ? me.member.id : 0);
    return json(prob ? { ok: false, message: prob.message } : { ok: true, message: nickname ? '쓸 수 있는 닉네임입니다.' : '쓸 수 있는 이메일입니다.' });
  }
  if (path === '/signup/code' && method === 'POST') {
    return json(await sendSignupCode(ctx, await body(request), await siteInfo(env, site)));
  }
  if (path === '/signup/verify' && method === 'POST') {
    return json(await verifySignupCode(ctx, await body(request)));
  }
  if (path === '/signup' && method === 'POST') {
    const raw = await body(request);
    const tk = await takeTicket(db, site, raw); // 이메일 인증을 마친 사람만
    const loginId = tk.email;
    const pw = String(raw.password ?? '');
    if (pw.length < 8 || pw.length > 200) throw bad('비밀번호는 8자 이상으로 넣어 주세요.');
    const { fields } = await siteSettings(db, site);
    const vals = memberValues(fields, { ...raw, email: loginId }, true);
    const docs = await latestDocs(db, site, env);
    if (docs.TERMS && !raw.agree_terms) throw bad('이용약관에 동의해 주세요.');
    if (docs.PRIVACY && !raw.agree_privacy) throw bad('개인정보 처리방침에 동의해 주세요.');
    const dup = await db.prepare('SELECT status FROM members WHERE site = ? AND (lower(login_id) = ? OR (lower(email) = ? AND status != \'WITHDRAWN\')) ORDER BY status = \'WITHDRAWN\' LIMIT 1').bind(site, loginId, loginId).first();
    if (dup?.status === 'WITHDRAWN') throw bad('탈퇴한 이메일입니다. 다시 가입하려면 사이트 관리자에게 문의해 주세요.');
    if (dup) throw bad('이미 가입한 이메일입니다. 로그인해 주세요.');
    const prob = await uniqueProblem(db, site, { nickname: vals.cols.nickname });
    if (prob) throw bad(prob.message);
    const p = await newPassword(pw);
    const t = now();
    const r = await db.prepare(`INSERT INTO members (site, login_id, pw_hash, pw_salt, name, nickname, level, email, mobile, phone, extra, last_login_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 9, ?, ?, ?, ?, ?, ?)`).bind(site, loginId, p.pw_hash, p.pw_salt, vals.cols.name, vals.cols.nickname,
      loginId, vals.cols.mobile, vals.cols.phone, JSON.stringify(vals.extra), t, t).run();
    const id = r.meta.last_row_id;
    const stmts = [docs.TERMS, docs.PRIVACY].filter(Boolean).map((d) => db.prepare('INSERT INTO member_agreements (member_id, document_id, agreed_at) VALUES (?, ?, ?)').bind(id, d.id, t));
    await db.batch([...stmts, tk.done()]);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(db, site, 'keep', id) });
  }

  // 아래는 로그인한 회원만
  if (path === '/profile' && method === 'PUT') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    const { fields } = await siteSettings(db, site);
    const raw = await body(request);
    if (me.member.login_id.includes('@')) raw.email = me.member.login_id; // 이메일이 아이디인 회원은 이메일을 바꿀 수 없다
    const vals = memberValues(fields, raw, false);
    const prob = await uniqueProblem(db, site, { nickname: vals.cols.nickname, email: me.member.login_id.includes('@') ? '' : vals.cols.email }, me.member.id);
    if (prob) throw bad(prob.message);
    const extra = { ...JSON.parse(me.member.extra || '{}'), ...vals.extra };
    await db.prepare('UPDATE members SET name = ?, nickname = ?, email = ?, mobile = ?, phone = ?, extra = ? WHERE id = ?')
      .bind(vals.cols.name || me.member.name, vals.cols.nickname, vals.cols.email, vals.cols.mobile, vals.cols.phone || me.member.phone || '', JSON.stringify(extra), me.member.id).run(); // 전화(phone) 항목은 없앴다 — 예전 값은 지우지 않는다
    return json({ ok: true });
  }
  if (path === '/password' && method === 'POST') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    const raw = await body(request);
    if (!sameText(await hashPassword(String(raw.current ?? '').slice(0, 200), me.member.pw_salt), me.member.pw_hash)) throw bad('지금 비밀번호가 맞지 않습니다.');
    const next = String(raw.next ?? '');
    if (next.length < 8 || next.length > 200) throw bad('새 비밀번호는 8자 이상으로 넣어 주세요.');
    const p = await newPassword(next);
    await db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(p.pw_hash, p.pw_salt, me.member.id).run();
    await db.prepare('DELETE FROM sessions WHERE member_id = ? AND token != ?').bind(me.member.id, me.token).run();
    return json({ ok: true });
  }
  if (path === '/withdraw' && method === 'POST') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    if (me.member.level === 1) {
      const r = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE site = ? AND level = 1 AND status = 'ACTIVE'").bind(site).first();
      if (r.n <= 1) throw bad('마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 먼저 정해 주세요.');
    }
    const reason = str((await body(request)).reason, 200);
    await db.batch([
      db.prepare("UPDATE members SET status = 'WITHDRAWN', withdrawn_at = ?, withdraw_reason = ? WHERE id = ?").bind(now(), reason, me.member.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(me.member.id),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESS_COOKIE, '', 0) });
  }

  // 글
  if ((m = path.match(/^\/boards\/([a-z0-9-]+)\/posts$/)) && method === 'POST') {
    const b = await loadBoard(db, site, m[1]);
    if (!b || (!b.visible && me.level !== 1)) throw notFound('없는 게시판입니다.');
    if (!canWrite(b, me)) throw forbidden('이 게시판에 글을 쓸 수 없습니다.');
    const raw = await body(request);
    const v = await postValues(b, me, raw, null);
    const t = now();
    const r = await db.prepare(`INSERT INTO posts (site, board_id, title, content_html, blocks, is_notice, is_secret, writer_id, writer_name, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(site, b.id, v.title, v.content, v.blocks, v.is_notice, v.is_secret,
      me.kind === 'member' ? me.member.id : null, v.writer_name, v.published_at ?? t, t, t).run();
    await syncPostFiles(env, site, r.meta.last_row_id, v.content, raw.attachments, me);
    return json({ id: r.meta.last_row_id });
  }
  if ((m = path.match(/^\/posts\/(\d+)$/))) {
    const p = await db.prepare('SELECT * FROM posts WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!p) throw notFound('없는 글입니다.');
    if (!(me.level === 1 || isMine(p, me))) throw forbidden('쓴 사람과 관리자만 고칠 수 있습니다.');
    const b = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(p.board_id).first();
    if (me.level !== 1 && (!b || b.deleted_at || !b.visible)) throw forbidden('지금은 이 게시판의 글을 고칠 수 없습니다.');
    if (method === 'PUT') {
      const raw = await body(request);
      const v = await postValues({ ...b, opt: boardOptions(JSON.parse(b.options || '{}')) }, me, raw, p);
      await db.prepare('UPDATE posts SET title = ?, content_html = ?, blocks = ?, is_notice = ?, is_secret = ?, published_at = ?, updated_at = ? WHERE id = ?')
        .bind(v.title, v.content, v.blocks, v.is_notice, v.is_secret, v.published_at ?? p.published_at, now(), p.id).run();
      await syncPostFiles(env, site, p.id, v.content, raw.attachments, me); // 글에서 뺀 그림 · 첨부는 저장 공간에서도 지운다
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      // 글을 지우면 첨부 파일(R2 · uploads)과 글 · 댓글 기록까지 DB 에서 모두 지운다 (사용자 지시 2026-11-13)
      await removePostFiles(env, site, [p.id]);
      await db.batch([
        db.prepare('DELETE FROM comments WHERE site = ? AND post_id = ?').bind(site, p.id),
        db.prepare('DELETE FROM posts WHERE site = ? AND id = ?').bind(site, p.id),
      ]);
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/posts\/(\d+)\/comments$/)) && method === 'POST') {
    const p = await db.prepare('SELECT * FROM posts WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!p) throw notFound('없는 글입니다.');
    const b = await db.prepare('SELECT * FROM boards WHERE id = ? AND deleted_at IS NULL').bind(p.board_id).first();
    if (!b || !b.use_comment || (!b.visible && me.level !== 1)) throw forbidden('댓글을 쓸 수 없는 게시판입니다.');
    if (me.kind === 'guest') throw new HttpError(401, '로그인하면 댓글을 남길 수 있습니다.');
    if (!canComment(b, me)) throw forbidden('댓글을 쓸 수 있는 등급이 아닙니다.');
    // 읽을 수 없는 글(읽기 권한 · 비밀글 · 숨김 · 예약)에는 댓글도 못 단다
    if (me.level !== 1 && (!canRead(b, me) || (p.is_secret && !isMine(p, me)) || p.is_hidden || p.published_at > now())) throw forbidden('이 글에는 댓글을 남길 수 없습니다.');
    const text = str((await body(request)).body, 2000);
    if (!text) throw bad('댓글 내용을 넣어 주세요.');
    const name = me.kind === 'staff' ? '관리자' : (me.member.nickname || me.member.name);
    await db.prepare('INSERT INTO comments (site, post_id, writer_id, writer_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(site, p.id, me.kind === 'member' ? me.member.id : 0, name, text, now()).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/comments\/(\d+)$/)) && method === 'DELETE') {
    const c = await db.prepare('SELECT * FROM comments WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!c) throw notFound('없는 댓글입니다.');
    if (!(me.level === 1 || (me.kind === 'member' && me.member.id === c.writer_id))) throw forbidden('쓴 사람과 관리자만 지울 수 있습니다.');
    await db.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').bind(now(), c.id).run();
    return json({ ok: true });
  }

  throw notFound('없는 주소입니다.');
}

// 가입 항목 값 검사 → member 컬럼 / extra 로 나눈다

// 간단입력 카드 정리 → { order, cards } (사진은 우리 업로드 주소만, 동영상은 유튜브 id 만)
function cleanBlocks(v) {
  if (!v || !Array.isArray(v.cards)) return null;
  const cards = v.cards.slice(0, 50).map((c) => ({
    sub: str(c?.sub, 100),
    text: String(c?.text ?? '').slice(0, 5000),
    photos: (Array.isArray(c?.photos) ? c.photos : []).map(String).filter((u) => /^\/xms\/upload\/[0-9a-f]{32}$/.test(u)).slice(0, 30),
    video: /^[\w-]{11}$/.test(String(c?.video || '')) ? String(c.video) : '',
  })).filter((c) => c.sub || c.text.trim() || c.photos.length || c.video);
  return cards.length ? { order: v.order === 'text' ? 'text' : 'media', cards } : null;
}
function blocksHtml(v) {
  return v.cards.map((c) => {
    const media = `${c.photos.map((u) => `<p><img src="${u}" alt=""></p>`).join('')}${c.video ? `<iframe src="https://www.youtube.com/embed/${c.video}" width="560" height="315" allowfullscreen></iframe>` : ''}`;
    const text = c.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    return `${c.sub ? `<h3>${esc(c.sub)}</h3>` : ''}${v.order === 'text' ? text + media : media + text}`;
  }).join('');
}

async function postValues(b, me, raw, cur) {
  const blocks = raw.mode === 'simple' ? cleanBlocks(raw.blocks) : null;
  if (blocks) raw = { ...raw, content: blocksHtml(blocks) };
  const title = str(raw.title, 200);
  if (!title) throw bad('제목을 넣어 주세요.');
  const content = await sanitizeHtml(raw.content);
  if (!plainText(content) && !/<(img|iframe)/i.test(content) && !(Array.isArray(raw.attachments) && raw.attachments.length)) throw bad('내용을 넣어 주세요.');
  const admin = me.level === 1;
  let writer = '';
  if (!cur) {
    if (me.kind === 'member') writer = me.member.nickname || me.member.name;
    else if (me.kind === 'staff') writer = '관리자';
    else { writer = str(raw.writer_name, 20); if (!writer) throw bad('이름을 넣어 주세요.'); }
  }
  let published = null;
  if (admin && raw.published_at) {
    const t = Date.parse(`${raw.published_at}:00+09:00`);
    if (Number.isFinite(t)) published = t;
  }
  return {
    title, content, writer_name: writer, published_at: published, blocks: blocks ? JSON.stringify(blocks) : null,
    is_notice: admin ? (raw.is_notice ? 1 : 0) : (cur?.is_notice || 0),
    is_secret: b.use_secret ? (raw.is_secret ? 1 : 0) : (cur?.is_secret || 0),
  };
}

export { DAY };
