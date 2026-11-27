// 사이트 가장자리 Worker (사용자 지시 2026-11-14 "0.1초라도 더 빨리")
//   국내 접속은 Cloudflare 시애틀(SEA) 등 해외 가장자리로 들어온다. 본체(site-worker, <이름>-core)는 DB 가까이 서울에서 돌아서
//   html 하나마다 가장자리 → 서울 → 가장자리 왕복(≈0.13~0.15초)이 더 붙었다.
//   → 로그인 안 한 방문자의 html 은 이 가장자리 캐시에서 바로 준다. 30초가 지난 것은 먼저 주고 뒤에서 본체로 새로 받는다(메뉴 · 글 고친 것은 30초 안팎에 반영).
//   게시판 · 회원 · 관리 · API · 로그인한 사람 · 처음 받는 페이지는 지금처럼 본체로.
//   자기 Worker 가 있는 사이트(roadbible · xip 등, 2026-11-15)도 같은 앞단: /api · /ws(웹소켓) · 그 밖에 html 이 아닌 답(/qt 같은 JSON · 그림 · 넘기기)은
//   한 번 본 뒤 '본체로' 표시를 남겨 다음부터 곧장 본체로 보낸다(두 번 부르지 않게).
import { countVisit, botGuard } from './site-worker.js';

const DYN = /^\/(xms|xms-api|member|board|site-api|admin|cdn-cgi|api|ws|rss\.xml|sitemap\.xml|robots\.txt)(\/|$)/;
const PASS_MS = 3600000;   // html 이 아닌 주소라는 표시를 믿는 시간(배포하면 열쇠가 바뀌어 새로)
const TRACK = /^(utm_|fbclid$|gclid$|n_|nclid$|_ga$|ref$)/;
const FRESH_MS = 30000;

export default {
  async fetch(request, env, ctx) {
    // 봇 차단을 켠 사이트(xim 스위치): 봇은 여기서 바로 403 — 캐시에 있는 페이지도 주지 않는다
    const guard = await botGuard(request, env);
    if (guard) return guard;
    // 비밀번호 잠금 (2026-11-27, re): 가장자리 Worker 비밀값 SITE_LOCK 이 있으면 비밀번호를 넣은 사람만 — 캐시에 있는 페이지보다 먼저
    if (env.SITE_LOCK) { const locked = await siteLock(request, env); if (locked) return locked; }
    const url = new URL(request.url);
    const p = url.pathname;
    const cookie = request.headers.get('Cookie') || '';
    const pageLike = /(^|\/)[^./]*$/.test(p) || /\.html?$/i.test(p) || p.endsWith('/');
    if (request.method !== 'GET' || !pageLike || DYN.test(p) || /(^|;\s*)xms_sess=/.test(cookie) || request.headers.get('X-Edge-Fill') || request.headers.get('Upgrade')) return env.CORE.fetch(request);
    const qs = [...url.searchParams.keys()].filter((k) => !TRACK.test(k));
    if (qs.length) return env.CORE.fetch(request);   // 검색어 같은 물음표 주소는 본체로
    const ver = env.VER?.id || '0';
    const key = new Request(`https://edge-cache.xim/${ver}/${url.host}${p}`);
    const cache = caches.default;
    const fill = async () => {
      const h = new Headers(request.headers);
      h.delete('Cookie'); h.delete('Sec-Purpose'); h.delete('Purpose'); h.set('X-Edge-Fill', '1');
      const r = await env.CORE.fetch(new Request(request.url, { headers: h }));
      if (r.status !== 200 || !(r.headers.get('Content-Type') || '').includes('text/html') || r.headers.get('Set-Cookie')) {
        // html 이 아니거나 넘기기 · 쿠키가 붙는 주소 → '본체로' 표시(다음부터 곧장 본체, 가장자리가 두 번 부르지 않게)
        if (r.status >= 500 || r.headers.get('X-Xim-Bot')) return null;   // 잠깐 난 오류 · 봇 차단 응답은 표시하지 않음
        await cache.put(key, new Response('', { headers: { 'Cache-Control': 'public, max-age=86400', 'X-Edge-At': String(Date.now()), 'X-Edge-Pass': '1' } }));
        return null;
      }
      const body = await r.arrayBuffer();
      const out = new Response(body, r);
      const link = hintsOf(new TextDecoder().decode(body.slice(0, 60000)), url);
      if (link) out.headers.set('Link', link);
      out.headers.set('Cache-Control', 'public, max-age=86400');
      out.headers.set('X-Edge-At', String(Date.now()));
      await cache.put(key, out.clone());
      return out;
    };
    const hit = await cache.match(key).catch(() => null);
    if (!hit) {
      // 처음 받는 페이지: 본체가 그대로 응답(방문 · 쿠키 포함), 캐시는 뒤에서 따로 채운다
      ctx.waitUntil(fill().catch(() => {}));
      return env.CORE.fetch(request);
    }
    const age = Date.now() - +(hit.headers.get('X-Edge-At') || 0);
    if (hit.headers.get('X-Edge-Pass')) {
      if (age > PASS_MS) ctx.waitUntil(cache.delete(key).catch(() => {}));
      return env.CORE.fetch(request);
    }
    if (age > FRESH_MS) ctx.waitUntil(fill().catch(() => {}));
    const res = new Response(hit.body, hit);
    res.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.headers.delete('X-Edge-At'); res.headers.delete('Cf-Placement');
    res.headers.set('X-Edge', 'hit');
    return countVisit(request, env, ctx, res);   // 방문 통계 · 첫 방문 쿠키는 그대로(기다리지 않음)
  },
};

// ───────── 비밀번호 잠금 ─────────
//   켜기: npx wrangler secret put SITE_LOCK --name <사이트> (node deploy.mjs --wrangler …) — 비밀번호는 리포(공개)에 두지 않는다. 끄기: secret delete.
//   맞으면 30일 쿠키(비밀번호 · 주소로 만든 값, 비밀번호를 바꾸면 모두 다시 물음). 틀리면 IP 마다 10분에 10번까지.
//   정적 파일(css · 그림)은 Worker 를 거치지 않아 열려 있다 — 내용은 html 에만 둔다.
const LOCK_COOKIE = 'xim_lock';
async function lockToken(env, host) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`xim-lock|${host}|${env.SITE_LOCK}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function siteLock(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const token = await lockToken(env, url.host);
  const cookie = request.headers.get('Cookie') || '';
  if (cookie.split(/;\s*/).includes(`${LOCK_COOKIE}=${token}`)) return null;
  if (request.method === 'POST' && url.pathname === '/__unlock') {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const key = new Request(`https://edge-lock.xim/${url.host}/${encodeURIComponent(ip)}`);
    const tries = +(await (await caches.default.match(key).catch(() => null))?.text() || 0);
    if (tries >= 10) return lockPage('잠시 뒤에 다시 해 주세요. (10분)', 429);
    const form = await request.formData().catch(() => null);
    const pw = String(form?.get('pw') || '');
    let next = String(form?.get('next') || '/');
    if (!next.startsWith('/') || next.startsWith('//')) next = '/';
    if (pw && pw === String(env.SITE_LOCK)) {
      return new Response(null, { status: 303, headers: { Location: next, 'Cache-Control': 'no-store', 'Set-Cookie': `${LOCK_COOKIE}=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` } });
    }
    await caches.default.put(key, new Response(String(tries + 1), { headers: { 'Cache-Control': 'public, max-age=600' } })).catch(() => {});
    return lockPage('비밀번호가 맞지 않습니다.', 401, next);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('잠긴 사이트입니다.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return lockPage('', 401, url.pathname + url.search);
}
function lockPage(msg, status, next = '/') {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>비밀번호</title>
<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f3ee;color:#222;font:16px/1.5 Pretendard,system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;padding:24px}
form{width:100%;max-width:320px;text-align:center}h1{font-size:18px;font-weight:600;margin:0 0 20px}input{width:100%;height:52px;border:1px solid #ccc8bd;border-radius:12px;padding:0 16px;font:inherit;font-size:20px;letter-spacing:.3em;text-align:center;background:#fff}
input:focus-visible,button:focus-visible{outline:2px solid #222;outline-offset:2px}button{width:100%;height:50px;margin-top:10px;border:0;border-radius:12px;background:#222;color:#fff;font:inherit;font-weight:600;cursor:pointer}p{color:#b3261e;font-size:14px;margin:12px 0 0;min-height:21px}</style></head>
<body><form method="post" action="/__unlock"><h1>비밀번호를 넣어 주세요</h1><input type="password" name="pw" inputmode="numeric" autocomplete="current-password" aria-label="비밀번호" autofocus required><input type="hidden" name="next" value="${esc(next)}"><button type="submit">보기</button><p role="alert">${esc(msg)}</p></form></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

// Early Hints (2026-11-14): html 의 <head> 에서 렌더를 막는 CSS · 미리 연결할 곳 · 먼저 받을 그림을 Link 헤더로 →
//   Cloudflare 가 이 헤더를 기억해 다음 방문 때 페이지를 만들기도 전에 '103 Early Hints' 로 먼저 알려 준다(브라우저가 그동안 연결 · CSS 받기 시작)
function hintsOf(html, url) {
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)) || 60000);
  const attr = (tag, n) => { const m = tag.match(new RegExp(`\\s${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
  const out = [], origins = new Map();
  const abs = (h) => { try { return new URL(h.replace(/&amp;/g, '&'), url); } catch { return null; } };
  const addOrigin = (u, cors) => { if (u && u.origin !== url.origin && !origins.has(u.origin)) origins.set(u.origin, cors); };
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase(), href = attr(tag, 'href');
    if (!href) continue;
    const u = abs(href);
    if (!u) continue;
    if (rel === 'stylesheet' && !attr(tag, 'media')) { out.push(`<${u.origin === url.origin ? u.pathname + u.search : u.href}>; rel=preload; as=style`); addOrigin(u, false); }
    else if (rel === 'preconnect') addOrigin(u, /crossorigin/i.test(tag));
    else if (rel === 'preload' && /^(image|font)$/i.test(attr(tag, 'as') || '')) { const md = attr(tag, 'media'); out.push(`<${u.href}>; rel=preload; as=${attr(tag, 'as').toLowerCase()}${/font/i.test(attr(tag, 'as')) ? '; crossorigin' : ''}${md ? `; media="${md}"` : ''}`); addOrigin(u, false); }
  }
  const r2 = html.match(/https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com/);
  if (r2) addOrigin(abs(r2[0]), false);   // 사진 저장소(서울)
  const pre = [...origins].slice(0, 6).map(([o, cors]) => `<${o}>; rel=preconnect${cors ? '; crossorigin' : ''}`);
  return [...pre, ...out.slice(0, 6)].join(', ');
}
