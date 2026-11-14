// 사이트 가장자리 Worker (사용자 지시 2026-11-14 "0.1초라도 더 빨리")
//   국내 접속은 Cloudflare 시애틀(SEA) 등 해외 가장자리로 들어온다. 본체(site-worker, <이름>-core)는 DB 가까이 서울에서 돌아서
//   html 하나마다 가장자리 → 서울 → 가장자리 왕복(≈0.13~0.15초)이 더 붙었다.
//   → 로그인 안 한 방문자의 html 은 이 가장자리 캐시에서 바로 준다. 30초가 지난 것은 먼저 주고 뒤에서 본체로 새로 받는다(메뉴 · 글 고친 것은 30초 안팎에 반영).
//   게시판 · 회원 · 관리 · API · 로그인한 사람 · 처음 받는 페이지는 지금처럼 본체로.
//   자기 Worker 가 있는 사이트(roadbible · xip 등, 2026-11-15)도 같은 앞단: /api · /ws(웹소켓) · 그 밖에 html 이 아닌 답(/qt 같은 JSON · 그림 · 넘기기)은
//   한 번 본 뒤 '본체로' 표시를 남겨 다음부터 곧장 본체로 보낸다(두 번 부르지 않게).
import { countVisit } from './site-worker.js';

const DYN = /^\/(xms|xms-api|member|board|site-api|admin|cdn-cgi|api|ws|rss\.xml|sitemap\.xml|robots\.txt)(\/|$)/;
const PASS_MS = 3600000;   // html 이 아닌 주소라는 표시를 믿는 시간(배포하면 열쇠가 바뀌어 새로)
const TRACK = /^(utm_|fbclid$|gclid$|n_|nclid$|_ga$|ref$)/;
const FRESH_MS = 30000;

export default {
  async fetch(request, env, ctx) {
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
        if (r.status >= 500) return null;   // 잠깐 난 오류는 표시하지 않음
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
