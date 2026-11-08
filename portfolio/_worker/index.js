// portfolio — 비밀번호를 넣어야 보이는 포트폴리오
//   비밀번호는 리포에 두지 않는다(공개 리포): Worker 비밀값 PORTFOLIO_PASSWORD
//     node deploy.mjs --wrangler secret put PORTFOLIO_PASSWORD --name portfolio
//   접속할 때마다(새로고침 포함) 비밀번호를 묻는다:
//     맞게 넣으면 그 POST 응답에 바로 페이지를 담아 보여 준다(리다이렉트 · 한 번 쓰는 쿠키 없음 —
//     폰 · 카톡 같은 앱 안 브라우저는 리다이렉트 응답의 쿠키를 다음 요청에 못 싣는 일이 있어 안 열렸다).
//     페이지 주소는 history.replaceState 로 원래 주소로 바꿔 두어 새로고침하면 GET → 다시 비밀번호.
//     이미지 · 그 밖의 파일은 짧은 표(pf_ok, 10분)로 통과. 표는 비밀번호로 서명 → 비밀번호를 바꾸면 무효.
//   카드의 사이트명 · 설명 · 이미지는 각 사이트 xms 설정을 열 때마다 읽어 채운다:
//     사이트명 = 검색엔진 제목, 설명 = 카톡 미리보기 설명, 이미지 = 카톡 미리보기 그림. 비어 있으면 index.html 에 적힌 그대로.
//   포트폴리오2(xim 에서 만들지 않은 사이트)는 xim 의 '포트폴리오2' 탭에서 넣은 값(카톡 미리보기)으로 xim 사이트 다음에 붙인다.
//   그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
import site from '../../xim/_worker/site-worker.js';

const FILES = 'pf_ok', FILES_AGE = 600;  // 이미지 등
// 비밀번호 없이 열리는 것: 관리 화면 · 회원(자체 로그인), 파비콘 · CSS(비밀번호 화면이 씀)
const OPEN = /^\/(xms|xms-api|member)(\/|$)|^\/(icon-\d+\.png|favicon\.ico|robots\.txt)$|^\/css\//;

const enc = new TextEncoder();
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 표 = 만료시각.서명
async function ticket(secret, kind, age) {
  const exp = Math.floor(Date.now() / 1000) + age;
  return `${exp}.${await hmac(secret, `portfolio-v2:${kind}:${exp}`)}`;
}
async function valid(secret, kind, value) {
  const [exp, sig] = String(value).split('.');
  if (!secret || !sig || !(Number(exp) > Date.now() / 1000)) return false;
  return same(sig, await hmac(secret, `portfolio-v2:${kind}:${exp}`));
}
const cookie = (name, value, age) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
function same(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
const cookieOf = (req, name) => (req.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1) || '';

function lockPage(error, next) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>포트폴리오</title>
<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="/css/style.css?v=8">
</head>
<body>
<main class="lock">
  <form class="lock-box" method="post" action="/__unlock">
    <img class="lock-logo" src="/icon-192.png" alt="">
    <h1>포트폴리오</h1>
    <p>비밀번호를 입력해 주세요.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <input class="lock-in" type="password" name="pw" inputmode="numeric" autocomplete="current-password" aria-label="비밀번호" required autofocus>
    <button class="lock-btn" type="submit">보기</button>
    <p class="lock-err" role="alert">${error ? '비밀번호가 맞지 않습니다.' : ''}</p>
  </form>
</main>
</body>
</html>`, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

// ── 각 사이트의 xms 설정 읽기 ──
//   사이트 주소로 직접 가져오면 같은 계정 Worker 끼리는 Cloudflare 가 막는 곳이 있어(오류 1014, 올리브바스켓)
//   xms 에 서비스 바인딩으로 바로 묻는다 — 사이트 Worker 가 html 머리를 채울 때 쓰는 그 값(/xms-api/site-head).
// 캐시하지 않는다 — xms 에서 고치면 다음 접속에 바로 보이게 (xms 쪽도 15초만 기억)
async function readSite(env, slug, origin) {
  try {
    const r = await env.XMS.fetch(new Request(`${origin}/xms-api/site-head`, { headers: { 'X-Xim-Site': slug } }));
    if (!r.ok) return {};
    const h = (await r.json()).head || {};
    return { name: h.title || '', desc: h.share_description || '', image: h.og_image ? new URL(h.og_image, origin).href : '' };
  } catch { return {}; } // 못 읽으면 index.html 에 적힌 그대로
}
// 카드 목록 = xim 에서 "포트폴리오" 를 켜 둔 사이트 (만든 차례).
//   글 · 그림은 그 사이트 xms 값, 비어 있으면 index.html 에 미리 적어 둔 같은 사이트 카드(data-xim) 값, 그것도 없으면 xim 사이트 이름.
//   xim 에 못 물으면 index.html 목록 그대로.
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function staticCards(html) {
  const out = {};
  for (const m of html.matchAll(/<li>\s*<a class="card" href="[^"]+" data-xim="([^"]+)"[\s\S]*?<\/li>/g)) {
    const pick = (re) => (m[0].match(re) || [])[1] || '';
    out[m[1]] = { tag: pick(/<span class="tag">([^<]*)</), name: pick(/<strong class="name">([^<]*)</), desc: pick(/<span class="desc">([^<]*)</), image: pick(/<img src="([^"]+)"/) };
  }
  return out; // 값은 html 그대로(이미 이스케이프됨)
}
function cardHtml(site, d, st) {
  const name = d.name ? escHtml(d.name) : st.name || escHtml(site.name);
  const desc = d.desc ? escHtml(d.desc) : st.desc || '';
  const img = d.image || st.image || '';
  const plain = name.replace(/&#\d+;/g, '');
  const thumb = img
    ? `<span class="thumb is-og"><img src="${escHtml(img)}" alt="${name} 공유 이미지" width="1200" height="630" loading="lazy"></span>`
    : `<span class="thumb is-empty"><b>${escHtml([...plain][0] || '')}</b></span>`;
  return `<li${st.tag ? ` data-tag="${st.tag}"` : ''}><a class="card" href="${escHtml(site.url)}"${site.slug ? ` data-xim="${escHtml(site.slug)}"` : ''} target="_blank" rel="noopener">${thumb}
<span class="body">${st.tag ? `<span class="tag">${st.tag}</span>` : ''}<strong class="name">${name}</strong><span class="desc">${desc}</span><span class="go">바로가기</span></span></a></li>`;
}
async function fillCards(res, env, ctx) {
  const html = await res.text();
  let sites = null;
  try { if (env.XIM) sites = await env.XIM.portfolio(); } catch { sites = null; }
  if (!sites || !env.XMS) return new Response(html, res);
  const st = staticCards(html);
  // 포트폴리오2(xim 밖의 사이트, slug 없음)는 xim 이 저장해 둔 카톡 미리보기 값 그대로
  const info = await Promise.all(sites.map((s) => (s.extra ? s.extra : readSite(env, s.slug, new URL(s.url).origin))));
  //   분류(tag) = xim 에 적은 값, 비어 있으면 index.html 카드 값
  const list = sites.map((s, i) => {
    const base = s.extra ? {} : st[s.slug] || {};
    return cardHtml(s, info[i] || {}, { ...base, tag: s.tag ? escHtml(s.tag) : base.tag || '' });
  }).join('\n');
  return new HTMLRewriter()
    .on('ul.grid', { element(e) { e.setInnerContent(list || '<li class="none">아직 올린 사이트가 없습니다.</li>', { html: true }); } })
    .transform(new Response(html, res));
}

// 비밀번호 뒤의 내용 꺼내기 — 첫 화면이면 카드를 채우고, 브라우저 · 중간 캐시에 남기지 않는다
async function page(request, env, ctx, url) {
  let res = await (env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request));
  const isHtml = (res.headers.get('Content-Type') || '').includes('text/html');
  if (isHtml && /^\/(index\.html)?$/.test(url.pathname)) res = await fillCards(res, env, ctx);
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const secret = env.PORTFOLIO_PASSWORD || '';

    if (url.pathname === '/__unlock' && request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const pw = String(form?.get('pw') || '').trim();
      let next = String(form?.get('next') || '/');
      if (!next.startsWith('/') || next.startsWith('//')) next = '/';
      if (!secret || !same(pw, secret)) {
        await new Promise((r) => setTimeout(r, 800)); // 연달아 맞혀 보기 늦추기
        return lockPage(true, next);
      }
      const target = new URL(next, url);
      const hdr = new Headers(request.headers);
      hdr.delete('Content-Type'); hdr.delete('Content-Length');
      hdr.set('Accept', 'text/html');
      const res = await page(new Request(target, { method: 'GET', headers: hdr }), env, ctx, target);
      const dir = target.pathname.replace(/[^/]*$/, '');
      const out = new HTMLRewriter()
        .on('head', { element(e) {
          e.prepend(`${dir !== '/' ? `<base href="${escHtml(dir)}">` : ''}<script>history.replaceState(null,'',${JSON.stringify(target.pathname + target.search)})</script>`, { html: true });
        } })
        .transform(res);
      out.headers.append('Set-Cookie', cookie(FILES, await ticket(secret, 'files', FILES_AGE), FILES_AGE));
      out.headers.append('Set-Cookie', 'pf_once=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'); // 예전 표 정리
      return out;
    }

    if (!OPEN.test(url.pathname)) {
      // 페이지는 늘 비밀번호 화면(맞게 넣으면 /__unlock 응답에 바로 담김), 파일은 짧은 표로
      if (request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html')) return lockPage(false, url.pathname + url.search);
      if (!(await valid(secret, 'files', cookieOf(request, FILES)))) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
      // 포트폴리오2 그림: xim 이 처음 한 번 받아 저장해 둔 것 (그 사이트 서버에는 다시 묻지 않는다)
      const pi = url.pathname.match(/^\/pf2-img\/([a-f0-9]{32})$/);
      if (pi && env.XIM) {
        const r = await env.XIM.fetch(new Request(`https://xim/__pf2img/${pi[1]}`));
        const out = new Response(r.body, r);
        out.headers.set('Cache-Control', 'private, max-age=86400');
        return out;
      }
      return page(request, env, ctx, url);
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
