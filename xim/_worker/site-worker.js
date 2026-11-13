// xim · xms 에 연결된 고객 사이트용 Worker — 모든 사이트가 이 파일을 그대로 복사해 쓴다.
//   <사이트폴더>/_worker/index.js       ← 이 파일 그대로
//   <사이트폴더>/_worker/bindings.json  ← { "vars": { "XIM_SITE": "<사이트 ID>" },
//                                         "services": [{ "binding": "XIM", "service": "xim", "entrypoint": "Engine" },
//                                                      { "binding": "XMS", "service": "xms", "entrypoint": "Cms" }],
//                                         "assets": { "run_worker_first": true } }
//
// 하는 일
//   xim 에서 정지된 사이트                         → "서비스 일시 중단" 화면 (/xms/ 관리 화면은 정지 중에도 열린다)
//   /xms/(관리 화면) · /xms/* · /xms-api/* · /admin/(→ /xms/) · /member/* · /board/*  → xms (업체 관리 화면 · 회원 · 게시판)
//   그 밖                                          → 이 폴더의 정적 파일 (html 이면 공통 계정 버튼 스크립트를 넣어서)
//   계정 버튼 자리: 헤더 안에 <span data-xms-account></span> (없으면 오른쪽 위에 떠 있음)
//   메뉴 자리: <nav data-xms-menu> 안의 원래 메뉴 링크에 data-xms-item → xms 메뉴 목록(맨 위 단계)으로 바뀐다.
//              data-xms-item 이 없는 것(예: "후원하기" 버튼)은 그대로 남아 xms 메뉴 뒤에 온다.
// xim 이 잠깐 응답하지 않으면 사이트는 그냥 열어 둔다(정지 확인 실패 = 운영).

const STATUS_TTL = 30000;
let statusCache = { at: 0, value: 'active' };
const XMS_PATHS = /^\/(admin|xms|xms-api|member|board)(\/|$)|^\/(robots\.txt|sitemap\.xml|rss\.xml|ads\.txt)$/;

// 정지 여부: 이 Worker 메모리(30초) → Cloudflare 가장자리 캐시(30초, 도메인 주소에서) → xim 순서로 묻는다
async function siteStatus(env, request) {
  const t = Date.now();
  if (t - statusCache.at < STATUS_TTL) return statusCache.value;
  const key = new Request(`${new URL(request.url).origin}/__xim_status__`);
  try {
    const hit = await caches.default.match(key).catch(() => null);
    if (hit) { statusCache = { at: t, value: await hit.text() }; return statusCache.value; }
    statusCache = { at: t, value: await env.XIM.status(env.XIM_SITE) };
    await caches.default.put(key, new Response(statusCache.value, { headers: { 'Cache-Control': 'public, max-age=30' } })).catch(() => {});
  } catch (e) {
    console.error('xim status 실패', e);
    statusCache = { at: t - STATUS_TTL + 5000, value: statusCache.value }; // 5초 뒤 다시 물어본다
  }
  return statusCache.value;
}

function forward(binding, request, env, pathname) {
  const url = new URL(request.url);
  if (pathname) url.pathname = pathname;
  const req = new Request(url, request);
  req.headers.set('X-Xim-Site', env.XIM_SITE);
  return binding.fetch(req);
}

// html 로 보이는 주소 (확장자 없음 · .html) — 이런 요청은 사이트 파일과 xms 메뉴 값을 동시에 가져온다
const looksHtml = (p) => p.endsWith('/') || /\.html?$/i.test(p) || !/\.[a-z0-9]{1,5}$/i.test(p);

// 정적 파일 캐시: 그림 · 글꼴은 하루, css · js 는 5분 바로 쓰고 그 뒤엔 쓰면서 뒤에서 새것 확인 (페이지 옮길 때마다 다시 받지 않게)
function cacheStatic(res, pathname) {
  if (!res.ok) return res;
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('text/html')) return res;
  const out = new Response(res.body, res);
  if (/^(image|font)\//.test(ct) || /\.(woff2?|ttf|otf)$/i.test(pathname)) out.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  else if (/css|javascript/.test(ct)) out.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  return out;
}

// ───── 보안 감시 (xim "감시" 탭) ─────
//   공격 주소(.env · wp-admin · .php · .git …)를 찌르면 → 바로 차단(xim 이 정함), 없는 주소를 마구 던지면 → 10분에 15번이면 차단
//   막힌 IP 는 모든 사이트에서 403. 확인은 이 Worker 메모리(60초) → 가장자리 캐시(60초) → xim 순서.
const ATTACK = /(\.(php\d?|phtml|asp|aspx|jsp|cgi|env|git|svn|sql|bak|old|swp|ini|log|sh|DS_Store)(\/|$))|\/(wp-(admin|login|content|includes|json)|xmlrpc|phpmyadmin|pma|myadmin|cgi-bin|vendor\/phpunit|boaform|actuator|solr|HNAP1|manager\/html|autodiscover|owa|ecp)(\/|$)|\.\.\/|%2e%2e|\/etc\/passwd|\/\.(env|git|aws|ssh|htaccess|htpasswd|vscode|idea)/i;
const BENIGN = /^\/(favicon\.ico|apple-touch-icon[\w-]*\.png|robots\.txt|sitemap\.xml|ads\.txt|manifest\.json|site\.webmanifest|browserconfig\.xml|\.well-known\/)/i;
const GOOD_BOT = /(googlebot|bingbot|yeti|daumoa|kakaotalk-scrap|facebookexternalhit|twitterbot|applebot|duckduckbot)/i;
const secMem = new Map(); // ip → { blocked, at }
async function isBlocked(env, request, ip) {
  const t = Date.now();
  const m = secMem.get(ip);
  if (m && t - m.at < 60000) return m.blocked;
  const key = new Request(`${new URL(request.url).origin}/__xim_sec__/${encodeURIComponent(ip)}`);
  let blocked = false;
  try {
    const hit = await caches.default.match(key).catch(() => null);
    if (hit) blocked = (await hit.text()) === '1';
    else {
      blocked = !!(await env.XIM.secCheck(ip));
      await caches.default.put(key, new Response(blocked ? '1' : '0', { headers: { 'Cache-Control': 'public, max-age=60' } })).catch(() => {});
    }
  } catch { blocked = false; } // xim 이 응답하지 않으면 막지 않는다
  if (secMem.size > 5000) secMem.clear();
  secMem.set(ip, { blocked, at: t });
  return blocked;
}
const blockedPage = () => new Response('<!doctype html><meta charset="utf-8"><title>접근 차단</title><p style="font-family:sans-serif;padding:32px;color:#444">비정상적인 접근이 감지되어 잠시 차단되었습니다.</p>', { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
function secReport(env, request, ip, reason) {
  const url = new URL(request.url);
  return env.XIM.secReport({
    site: env.XIM_SITE, ip, reason, method: request.method,
    path: (url.pathname + url.search).slice(0, 300),
    ua: (request.headers.get('User-Agent') || '').slice(0, 200),
    country: request.cf?.country || '',
  }).then((r) => { if (r?.blocked) secMem.set(ip, { blocked: true, at: Date.now() }); }).catch(() => {});
}

export default {
  async fetch(request, env, ctx) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const url = new URL(request.url);
    // 옛 주소 → 새 주소로 영구 이동 (폴더의 .xim-redirect, build.mjs 가 XIM_REDIRECT 로 넣음). 검색엔진 기록이 새 주소로 이어진다
    if (env.XIM_REDIRECT) {
      let to = '';
      try { to = JSON.parse(env.XIM_REDIRECT)[url.hostname] || ''; } catch { /* 잘못된 값은 무시 */ }
      if (to) return Response.redirect(`https://${to}${url.pathname}${url.search}`, 301);
    }
    if (ip && env.XIM) {
      if (await isBlocked(env, request, ip)) return blockedPage();
      // 주소 부분은 공격 주소 목록으로, 물음표 뒤(검색어 등)는 경로 거슬러 오르기만 본다 (검색어 'abc.php' 같은 건 막지 않게)
      if (ATTACK.test(decodeURIComponentSafe(url.pathname)) || /\.\.\/|\/etc\/passwd/i.test(decodeURIComponentSafe(url.search))) {
        ctx.waitUntil(secReport(env, request, ip, 'attack'));
        return new Response('Not found', { status: 404 });
      }
    }
    let res = await handle(request, env);
    if (env.XMS) res = countVisit(request, env, ctx, res);
    if (ip && env.XIM && res.status === 404 && !BENIGN.test(url.pathname) && !GOOD_BOT.test(request.headers.get('User-Agent') || '')) {
      ctx.waitUntil(secReport(env, request, ip, '404'));
    }
    return res;
  },
};
// ───── 방문 통계 (xms "방문 통계") ─────
//   방문자가 html 페이지를 열면 xms 에 알린다(기다리지 않음). 그날 처음 온 브라우저에는 쿠키 xms_v=<날짜> 를 남겨 방문자 수를 센다.
//   관리 화면 · API · 검색엔진 로봇 · 미리 불러오기 · 오류 화면은 세지 않는다.
const BOT = /bot|crawl|spider|slurp|scrap|preview|fetch|curl|wget|python|java\/|go-http|okhttp|axios|node|headless|lighthouse|pagespeed|monitor|uptime|facebookexternalhit|kakaotalk-scrap|yeti|daumoa/i;
const MOBILE = /Mobi|Android|iPhone|iPad|iPod/i;
const SEARCH_HOST = /^search\.|^google\.|^bing\.com$|yahoo\.|^duckduckgo\.com$|^yandex\.|^baidu\.com$|^ecosia\.org$/;
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
function countVisit(request, env, ctx, res) {
  if (request.method !== 'GET' || (res.status !== 200 && res.status !== 304)) return res;
  const url = new URL(request.url);
  const p = url.pathname;
  if (!looksHtml(p) || /^\/(admin|xms|xms-api)(\/|$)/.test(p) || /^\/member\/(logout|verify)/.test(p)) return res;
  if (res.status === 200 && !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const h = request.headers;
  const ua = h.get('User-Agent') || '';
  if (!ua || BOT.test(ua) || /prefetch|prerender/i.test(`${h.get('Sec-Purpose') || ''} ${h.get('Purpose') || ''}`)) return res;
  const day = kstDay();
  const fresh = !(h.get('Cookie') || '').split(/;\s*/).includes(`xms_v=${day}`);
  let ref = '';
  let rq = ''; // 검색엔진에서 왔으면 그 주소의 ? 뒷부분(검색어가 들어 있다, xms 가 가려낸다)
  try {
    const r = new URL(h.get('Referer') || '');
    if (r.host !== url.host) {
      ref = r.hostname.replace(/^(www|m)\./, '');
      if (SEARCH_HOST.test(ref)) rq = r.search.slice(1, 600);
    }
  } catch { /* 바로 들어옴 */ }
  const path = p === '/index.html' || p === '/index' ? '/' : p.replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
  ctx.waitUntil(env.XMS.visit(env.XIM_SITE, { path, fresh, ref, rq, mobile: MOBILE.test(ua) }).catch(() => {}));
  if (!fresh) return res;
  const out = new Response(res.body, res);
  out.headers.append('Set-Cookie', `xms_v=${day}; Path=/; Max-Age=172800; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`);
  return out;
}

// xms 배포 번호 (site-head 가 알려 줌) → ?v=번호. 배포하면 방문자 브라우저가 바로 새 파일을 받는다
const vq = (data) => (data?.ver && /^[\w-]+$/.test(data.ver) ? `?v=${data.ver}` : '');
function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

async function handle(request, env) {
  {
    const url = new URL(request.url);
    const { pathname } = url;
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/xms/') || pathname.startsWith('/xms-api/');
    // CSS · JS · 그림 같은 파일은 정지 확인 없이 바로 (페이지가 막히면 파일만으로는 쓸 수 없다) — 파일마다 xim 에 묻지 않게
    // /favicon.ico 가 사이트에 없으면 xms 파비콘(192px PNG)으로 — 구글 · 일부 브라우저는 이 주소부터 찾는다
    if (pathname === '/favicon.ico' && request.method === 'GET') {
      const r = await env.ASSETS.fetch(request);
      if (r.status !== 404 || !env.XMS) return cacheStatic(r, pathname);
      const x = await forward(env.XMS, request, env, '/xms/file/favicon-192.png');
      if (x.ok) return new Response(x.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
      return r;
    }
    if (!isAdmin && request.method === 'GET' && !looksHtml(pathname) && !XMS_PATHS.test(pathname)) return cacheStatic(await env.ASSETS.fetch(request), pathname);
    if (!isAdmin && (await siteStatus(env, request)) === 'suspended') return forward(env.XIM, request, env, '/__suspended');
    // 문의 받기 (모든 xim 사이트 공통, 2026-11-12): 사이트 문의 폼 → xim '제작문의' 메뉴. 봇 확인(Turnstile) 키도 xim 에서
    //   GET /site-api/inquiry-key → { sitekey },  POST /site-api/inquiry { name, contact, org, kind, message, turnstile } → { ok } | { error }
    if (pathname === '/site-api/inquiry-key' || pathname === '/site-api/inquiry') {
      const j = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      if (pathname === '/site-api/inquiry-key') return j({ sitekey: await env.XIM.inquiryKey(env.XIM_SITE).catch(() => '') });
      if (request.method !== 'POST') return j({ error: 'POST 로 보내 주세요.' }, 405);
      let raw = {}; try { raw = await request.json(); } catch { return j({ error: '내용을 읽지 못했습니다.' }, 400); }
      const r = await env.XIM.inquiry(env.XIM_SITE, raw, request.headers.get('CF-Connecting-IP') || '').catch((e) => ({ error: `잠시 뒤 다시 보내 주세요. (${e.message || e})` }));
      return r.error ? j({ error: r.error }, 400) : j({ ok: true });
    }
    // 게시판 · 회원 화면: 사이트의 기존 페이지(틀)에 끼워 넣는다 — 머리 · 꼬리 · CSS 는 사이트 그대로
    if (request.method === 'GET' && /^\/(board|member)(\/|$)/.test(pathname)) return embedPage(request, env);
    if (XMS_PATHS.test(pathname)) return forward(env.XMS, request, env);
    if (request.method === 'GET' && looksHtml(pathname)) {
      // html 은 방문자마다 다르다(계정 버튼 · 등급별 메뉴) → 브라우저의 '안 바뀌었나요?'(If-None-Match) 를 정적 파일에 넘기지 않는다.
      //   넘기면 304 가 나가 예전 화면(예: 등급 바꾸기 전)이 그대로 남는다 (사용자 지시 2026-11-11: 9→1 바꾸면 바로 적용)
      const plain = new Request(request);
      plain.headers.delete('If-None-Match'); plain.headers.delete('If-Modified-Since');
      const [res, data] = await Promise.all([env.ASSETS.fetch(plain), siteHead(request, env, isHome(pathname))]);
      // xms 메뉴 권한으로 이 방문자가 볼 수 없는 페이지 → 사이트 틀 안에 '로그인이 필요합니다' / '볼 수 없는 곳입니다'
      if (Array.isArray(data?.blocked) && data.blocked.includes(pagePath(pathname))) {
        const u = new URL('/member/denied', url.origin);
        u.searchParams.set('next', pathname + url.search);
        return embedPage(new Request(u, request), env);
      }
      return withXms(res, request, env, data);
    }
    return cacheStatic(await env.ASSETS.fetch(request), pathname);
  }
}

// xms 에게 본문만 받아(X-Xms-Embed) 틀 페이지의 <main> 안을 그것으로 바꾼다. 틀이 없거나 실패하면 xms 화면 그대로.
//   본문 · 틀 · 메뉴 값을 동시에 가져온다.
async function embedPage(request, env) {
  const url = new URL(request.url);
  const req = new Request(url, request);
  req.headers.set('X-Xim-Site', env.XIM_SITE);
  req.headers.set('X-Xms-Embed', '1');
  // 걸린 시간을 Server-Timing 으로 (브라우저 개발자 도구 · curl 로 어디가 느린지 본다)
  const t0 = Date.now(); const tm = {};
  const time = (k, p) => p.then((v) => { tm[k] = Date.now() - t0; return v; });
  const [xr, shell, data] = await Promise.all([
    time('xms', env.XMS.fetch(req)),
    time('shell', env.ASSETS.fetch(new Request(new URL(env.XIM_SHELL || '/', url.origin)))),
    time('head', siteHead(request, env, false)),
  ]);
  if (!(xr.headers.get('Content-Type') || '').includes('application/json')) return xr; // 이동(로그인 뒤 등) · 오류는 그대로
  const d = await xr.json();
  if (!shell.ok || !(shell.headers.get('Content-Type') || '').includes('text/html')) return forward(env.XMS, request, env);
  const headers = new Headers(shell.headers);
  ['ETag', 'Last-Modified', 'Content-Length'].forEach((h) => headers.delete(h));
  headers.set('Cache-Control', 'no-store');
  headers.set('Server-Timing', [...Object.entries(tm).map(([k, v]) => `${k};dur=${v}`), xr.headers.get('Server-Timing') || ''].filter(Boolean).join(', '));
  let replaced = false;
  const framed = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(d.title); } })
    .on('main', { element(el) { if (!replaced) { el.setInnerContent(d.html, { html: true }); replaced = true; } } })
    .on('body', { element(el) { el.onEndTag((end) => { if (!replaced) end.before(d.html, { html: true }); }); } }) // <main> 이 없는 틀
    .on('head', {
      element(el) {
        // 틀 페이지의 상대 주소(css/style.css 등)가 게시판 주소 밑에서도 사이트 기준으로 풀리도록
        el.prepend('<base href="/">', { html: true });
        el.append(`<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/xms/css/embed.css${vq(data)}">\n<script type="module" src="/xms/js/public.js${vq(data)}"></script>${['common', 'editor', 'blocks', 'crop'].map((m) => `<link rel="modulepreload" href="/xms/js/${m}.js${vq(data)}">`).join('')}${d.noindex ? '\n<meta name="robots" content="noindex">' : ''}`, { html: true });
      },
    })
    .transform(new Response(shell.body, { status: d.status || 200, headers }));
  return withXms(framed, request, env, data);
}

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 이 방문자에게 보이는 xms 메뉴 · 머리(head) 값 · (홈이면) 팝업을 한 번에. 실패하면 null → 사이트 원래 모습 그대로.
async function siteHead(request, env, home) {
  try {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie') || '';
    // 로그인 안 한 방문자는 모두 같은 값 → Cloudflare 가장자리 캐시에 30초 (도메인 주소에서 동작, workers.dev 에서는 그냥 건너뜀)
    const guest = !/(?:^|;\s*)xms_sess=/.test(cookie);
    const path = pagePath(url.pathname);
    const key = new Request(`${url.origin}/__xms_site_head__/${home ? 'home' : 'page'}${encodeURI(path)}`);
    if (guest) {
      const hit = await caches.default.match(key).catch(() => null);
      if (hit) return await hit.json();
    }
    const req = new Request(`${url.origin}/xms-api/site-head?path=${encodeURIComponent(path)}${home ? '&home=1' : ''}`, { headers: { Cookie: cookie } });
    req.headers.set('X-Xim-Site', env.XIM_SITE);
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const data = await res.json();
    if (guest) {
      await caches.default.put(key, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } })).catch(() => {});
    }
    return data;
  } catch (e) {
    console.error('xms site-head 실패', e);
    return null;
  }
}
// 메뉴 한 칸 → <a>. 주소 없는 대분류는 첫 하위 메뉴로 보낸다. 지금 페이지면 aria-current.
function menuLinks(items, pathname) {
  const first = (m) => m.href || (m.children || []).map(first).find(Boolean) || '';
  return items.map((m) => {
    const href = first(m);
    if (!href) return '';
    const here = !m.external && new URL(href, 'https://x').pathname === pathname && !href.includes('#');
    return `<a href="${escHtml(href)}"${m.external ? ' target="_blank" rel="noopener"' : ''}${here ? ' aria-current="page"' : ''} data-xms-item>${escHtml(m.title)}</a>`;
  }).join('');
}

// 계정 버튼을 서버에서 미리 그린다 (로그인 링크 / 사람 동그라미) — 화면이 뜬 뒤 바뀌며 메뉴가 흔들리지 않게
const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';
function accountHtml(me, url) {
  if (!me || me.guest) return '<a class="xa-login" href="/member/login">로그인</a>'; // 로그인하면 홈으로
  return `<button type="button" class="xa-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="내 계정 메뉴">${PERSON}</button>`;
}

const attr = (v) => escHtml(v);
// 주소 비교용 (xms public.js pagePath 와 같게): /about.html · /about · /about/ 을 같은 것으로
const pagePath = (p) => {
  let s = String(p || '').split(/[?#]/)[0];
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  s = s.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
  return s || '/';
};
const isHome = (p) => p === '/' || p === '/index.html' || p === '/index';

// 모든 html 페이지:
//   ① 공통 계정 버튼(사람 동그라미 · 로그인) 스크립트
//   ② [data-xms-menu] 안의 [data-xms-item] 메뉴를 xms 메뉴로 바꿔 끼운다 (xms 가 비었거나 응답 없으면 원래 메뉴 그대로)
//   ③ xms 의 파비콘 · 검색엔진(제목 · 설명 · 소유권 확인) · 카카오톡 미리보기(og) 값을 머리에 넣는다 (값이 있을 때만 사이트 원래 태그를 바꾼다)
//   ④ 홈이면 노출 중인 팝업
async function withXms(res, request, env, data) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const url = new URL(request.url);
  const home = isHome(url.pathname);
  const menu = data?.menu?.length ? data.menu : null;
  const h = data?.head || {};
  const ogDesc = h.share_description || '';
  const ogImage = h.og_image ? `${url.origin}${h.og_image}` : '';
  let hasDesc = false;
  // 오픈그래프(네이버 · 카톡 · 페이스북 미리보기): 사이트에 없는 태그는 끝에 채워 넣는다 (2026-11-04 네이버 "Open Graph 제목이 없습니다")
  const og = { title: false, type: false, url: false, site_name: false, description: false };
  let pageTitle = '';

  let rw = new HTMLRewriter();
  // 사진은 R2(서울) 서명 주소로 — 국내 접속이 미국 서부 가장자리로 가서 사진마다 1~2초 걸리던 것 (xms staticMap, 2026-11-13)
  const st = data?.st && typeof data.st === 'object' ? data.st : null;
  if (st) {
    const swap = (v) => {
      if (!v || /^(data:|https?:|\/\/|#)/i.test(v)) return v;
      try { const u = new URL(v, url); if (u.origin !== url.origin) return v; return st[decodeURI(u.pathname)] || v; } catch { return v; }
    };
    const swapSet = (v) => v.split(',').map((part) => { const m = part.trim().match(/^(\S+)(\s+.+)?$/); return m ? swap(m[1]) + (m[2] || '') : part; }).join(', ');
    const swapCss = (v) => v.replace(/url\((['"]?)([^'")]+)\1\)/g, (all, q, u) => { const n = swap(u); return n === u ? all : `url("${n}")`; });
    rw = rw.on('img[src], video[poster], [data-src], [data-bg], link[rel="preload"][as="image"][href], [srcset], [style*="url("]', {
      element(el) {
        for (const a of ['src', 'poster', 'data-src', 'data-bg']) { const v = el.getAttribute(a); if (v) el.setAttribute(a, swap(v)); }
        if (el.tagName === 'link') el.setAttribute('href', swap(el.getAttribute('href')));
        const ss = el.getAttribute('srcset'); if (ss) el.setAttribute('srcset', swapSet(ss));
        const sy = el.getAttribute('style'); if (sy && sy.includes('url(')) el.setAttribute('style', swapCss(sy));
      },
    });
  }
  if (data) {
    rw = rw.on('[data-xms-account]', {
      element(el) {
        el.setAttribute('class', `${el.getAttribute('class') || ''} xa-host`.trim());
        el.setAttribute('data-xa-me', JSON.stringify(data.me || { guest: true }));
        el.setInnerContent(accountHtml(data.me, url), { html: true });
      },
    });
  }
  if (menu) {
    rw = rw
      .on('[data-xms-menu] [data-xms-item]', { element(el) { el.remove(); } })
      .on('[data-xms-menu]', { element(el) { el.prepend(menuLinks(menu, url.pathname), { html: true }); } });
  }
  if (h.favicon) rw = rw.on('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]', { element(el) { el.remove(); } });
  if (home && h.title) {
    rw = rw.on('title', { element(el) { el.setInnerContent(h.title); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', h.title); } });
  }
  rw = rw.on('title', { text(t) { pageTitle += t.text; } });
  // 구글 애드센스: xms 검색엔진 화면의 게시자 ID → 정상 페이지(200)에만 광고 코드 (페이지에 이미 있으면 두 번 넣지 않음)
  const adClient = /^ca-pub-\d{10,20}$/.test(h.adsense || '') && res.status === 200 ? h.adsense : '';
  let hasAd = false;
  if (adClient) rw = rw.on('script[src*="adsbygoogle.js"]', { element() { hasAd = true; } });
  rw = rw.on('meta[property^="og:"]', {
    element(el) {
      const k = (el.getAttribute('property') || '').slice(3);
      if (k in og) og[k] = true;
      // 미리보기 그림 · 주소는 전체 주소여야 네이버 · 카톡이 읽는다 (/img/… · assets/… → https://도메인/…)
      const c = el.getAttribute('content') || '';
      if ((k === 'image' || k === 'url') && c && !/^[a-z][a-z0-9+.-]*:/i.test(c)) { try { el.setAttribute('content', new URL(c, url).href); } catch { /* 이상한 주소는 그대로 */ } }
    },
  });
  // 대표 주소(canonical)도 전체 주소로 — 사이트는 도메인을 몰라도 되게 "/school-year/" 처럼 써 둔다
  rw = rw.on('link[rel="canonical"]', {
    element(el) {
      const c = el.getAttribute('href') || '';
      if (c.startsWith('/') && !c.startsWith('//')) { try { el.setAttribute('href', new URL(c, url).href); } catch { /* 그대로 */ } }
    },
  });
  rw = rw.on('meta[name="description"]', { element(el) { hasDesc = true; if (home && h.description) el.setAttribute('content', h.description); } });
  if (ogDesc) rw = rw.on('meta[property="og:description"], meta[name="twitter:description"]', { element(el) { el.remove(); } });
  if (ogImage) rw = rw.on('meta[property="og:image"], meta[name="twitter:image"]', { element(el) { el.remove(); } });

  rw = rw.on('head', {
    element(el) {
      const tags = [];
      // 계정 버튼 스타일은 파일로 따로 받지 않고 바로 넣는다
      if (data?.account_css) tags.push(`<style id="xa-style">${data.account_css}</style>`);
      tags.push(`<script src="/xms/js/account.js${vq(data)}" defer></script>`);
      // 내 정보 · 관리 · 로그인 · 게시판 링크에 손가락(마우스)이 닿으면 그 화면을 미리 준비해 둔다 → 누르면 바로 뜬다 (크롬 · 엣지 · 안드로이드)
      tags.push('<script type="speculationrules">{"prerender":[{"where":{"or":[{"href_matches":"/member/*"},{"href_matches":"/board/*"},{"href_matches":"/xms/"}]},"eagerness":"moderate"}]}</script>');
      tags.push('<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">');
      for (const v of h.verify || []) tags.push(`<meta name="${attr(v.name)}" content="${attr(v.content)}">`);
      if (h.favicon) {
        for (const f of h.favicon) {
          if (f.size === 180) tags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${attr(f.href)}">`);
          else tags.push(`<link rel="icon" type="image/png" sizes="${f.size}x${f.size}" href="${attr(f.href)}">`);
        }
      }
      if (ogDesc) tags.push(`<meta property="og:description" content="${attr(ogDesc)}">`);
      if (ogImage) tags.push(`<meta property="og:image" content="${attr(ogImage)}">`, '<meta property="og:image:width" content="1200">');
      if (home && data?.popups?.length) {
        tags.push(`<script>window.__XMS_POPUPS=${JSON.stringify(data.popups).replace(/</g, '\\u003c')};</script>`, `<script src="/xms/js/popup.js${vq(data)}" defer></script>`);
      }
      el.append(tags.join('\n'), { html: true });
      // 설명 태그가 아예 없던 페이지에는 검색엔진 설명글을 넣는다
      el.onEndTag((end) => {
        const add = [];
        if (!hasDesc && h.description) add.push(`<meta name="description" content="${attr(h.description)}">`);
        const title = (home && h.title) || pageTitle.replace(/\s+/g, ' ').trim();
        if (!og.title && title) add.push(`<meta property="og:title" content="${attr(title)}">`);
        if (!og.type) add.push('<meta property="og:type" content="website">');
        if (!og.url) add.push(`<meta property="og:url" content="${attr(url.origin + url.pathname)}">`);
        if (!og.site_name && h.site_name) add.push(`<meta property="og:site_name" content="${attr(h.site_name)}">`);
        if (!ogDesc && !og.description && h.description) add.push(`<meta property="og:description" content="${attr(h.description)}">`);
        // 애드센스 소유권 확인은 코드 · 메타 태그 · ads.txt 셋 중 무엇으로 보든 맞게 둘 다 넣는다
        if (adClient) add.push(`<meta name="google-adsense-account" content="${attr(adClient)}">`);
        if (adClient && !hasAd) add.push(`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${attr(adClient)}" crossorigin="anonymous"></script>`);
        if (add.length) end.before(add.join('\n'), { html: true });
      });
    },
  });
  // 페이지 끝에 붙일 것들 — body 끝 처리기는 하나만 둔다 (onEndTag 를 두 번 걸면 앞의 것이 사라진다:
  //   2026-11-07 로그인하면 맨 위로 버튼이 안 보이던 원인 — 수정 모드 글자 스크립트가 버튼을 덮어씀)
  const tail = [];
  // ⑤ 맨 위로 버튼 (xms 부가 기능에서 켠 사이트, 뺄 주소로 시작하는 페이지는 빼고)
  const topCfg = data?.top;
  if (topCfg && !(topCfg.except || []).some((x) => x && pagePath(url.pathname).startsWith(pagePath(x)))) tail.push(TOP_BTN);
  // ⑥ 수정 모드로 고친 글자를 넣는다 (글자 조각만 바꿔서 모양은 그대로). 관리자에게는 고칠 수 있는 자리 표시도.
  //    window.__XE_T = 고친 값 전체 — 사이트 스크립트가 글자 말고 다른 것(예: 영소립 조립도 'sbset.N')을 저장해 두고 읽을 때 쓴다.
  if (data?.texts || data?.me?.admin) {
    const T = JSON.stringify(data.texts || {}).replace(/</g, '\\u003c'); // </script> 가 글자에 있어도 스크립트가 끊기지 않게
    tail.push(`<script>${XE_APPLY.replace('__T__', () => T)}</script>`);
  }
  if (tail.length) rw = rw.on('body', { element(el) { el.onEndTag((end) => { end.before(tail.join('\n'), { html: true }); }); } });
  // 사람마다 다른 html 이므로 브라우저가 묵혀 두지 않게: 늘 새로 받는다 (ETag 를 지워 304 로 예전 것을 쓰지 않게)
  const t = rw.transform(res);
  const out = new Response(t.body, t);
  if (data) {
    out.headers.delete('ETag'); out.headers.delete('Last-Modified');
    out.headers.set('Cache-Control', 'private, no-cache');
  }
  return out;
}

// 맨 위로 버튼 — 스크롤을 조금 내리면 오른쪽 아래에 동그라미가 떠오른다. 누르면 맨 위로 부드럽게.
//   색은 사이트 CSS 에서 --xms-top-bg(동그라미) · --xms-top-fg(화살표) · --xms-top-line(테두리)로 바꾼다 (기본 흰 동그라미).
const TOP_BTN = `<style>.xms-top{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:2147482000;width:52px;height:52px;border-radius:50%;
border:1px solid var(--xms-top-line,rgba(15,20,30,.08));background:var(--xms-top-bg,#fff);color:var(--xms-top-fg,#16181d);box-shadow:0 6px 22px rgba(15,20,30,.22),0 1px 3px rgba(15,20,30,.12);display:grid;place-items:center;cursor:pointer;
opacity:0;visibility:hidden;transform:translateY(12px) scale(.92);transition:opacity .25s,transform .3s cubic-bezier(.22,.8,.24,1),visibility .25s,box-shadow .2s;-webkit-tap-highlight-color:transparent}
.xms-top.on{opacity:1;visibility:visible;transform:none}.xms-top:hover{box-shadow:0 10px 28px rgba(15,20,30,.28),0 1px 3px rgba(15,20,30,.12)}
.xms-top:focus-visible{outline:2px solid #2f5fd0;outline-offset:3px}.xms-top svg{width:22px;height:22px}
@media (max-width:640px){.xms-top{width:46px;height:46px}.xms-top svg{width:20px;height:20px}}
@media (prefers-reduced-motion:reduce){.xms-top{transition:none}}</style>
<button type="button" class="xms-top" aria-label="맨 위로" title="맨 위로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
<script>(function(){var b=document.querySelector('.xms-top');if(!b)return;var t=0;function f(){b.classList.toggle('on',(window.scrollY||document.documentElement.scrollTop)>400)}
addEventListener('scroll',function(){if(!t){t=requestAnimationFrame(function(){t=0;f()})}},{passive:true});f();
b.addEventListener('click',function(){var r=matchMedia('(prefers-reduced-motion: reduce)').matches;scrollTo({top:0,behavior:r?'auto':'smooth'});b.blur()})})();</script>`;

// 수정 모드 글자 넣기 — 페이지 끝에서 바로 돈다(사이트 스크립트보다 먼저, 화면이 바뀌어 보이지 않게).
//   글자가 든 요소(바깥쪽 것)마다 원래 글자의 지문(k = 해시.몇 번째)을 붙이고, 고친 값이 있으면 글자 조각을 바꾼다.
//   머리(header) · 꼬리(footer) 안은 모든 페이지 공통('*'). xms 메뉴 · 계정 버튼 · 게시판 본문은 빼고.
const XE_APPLY = `(function(T){window.__XE_T=T;var S='h1,h2,h3,h4,h5,h6,p,li,a,button,label,figcaption,blockquote,dt,dd,th,td,small,span,b,strong,em',
X='script,style,svg,noscript,textarea,select,[data-xms-account],[data-xms-menu],.xms-c,.xa-menu,[data-xe-off]',seen={},O=window.__XE_ORIG={};
function h(s){var x=2166136261;for(var i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return(x>>>0).toString(36)}
function tn(e){var w=document.createTreeWalker(e,4),a=[],n;while((n=w.nextNode()))a.push(n);return a}
document.querySelectorAll(S).forEach(function(e){if(e.closest(X)||(e.parentElement&&e.parentElement.closest('[data-xe]')))return;
var t=e.textContent.replace(/\s+/g,' ').trim();if(!t)return;var g=e.closest('header,footer')?'*':'.',k=h(t);seen[g+k]=(seen[g+k]||0)+1;k=k+'.'+seen[g+k];
e.setAttribute('data-xe',k);e.setAttribute('data-xe-g',g);var ns=tn(e);O[g+k]=ns.map(function(n){return n.nodeValue});
var v=(g==='*'?T.all:T.page)||{};v=v[k];if(!v)return;if(v.length===ns.length)ns.forEach(function(n,i){n.nodeValue=v[i]});else e.textContent=v.join('')});
})(__T__);`;
