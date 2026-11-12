// portfolio — 누구나 보는 포트폴리오 (2026-11-11 사용자 지시로 비밀번호 잠금을 뺐다. 예전 잠금 코드는 git 기록에)
//   카드의 사이트명 · 설명 · 이미지는 각 사이트 xms 설정을 열 때마다 읽어 채운다:
//     사이트명 = 검색엔진 제목, 설명 = 카톡 미리보기 설명, 이미지 = 카톡 미리보기 그림. 비어 있으면 index.html 에 적힌 그대로.
//   포트폴리오2(xim 에서 만들지 않은 사이트)는 xim 의 '포트폴리오2' 탭에서 넣은 값(카톡 미리보기)으로 xim 사이트 다음에 붙인다.
//   그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
import site from '../../xim/_worker/site-worker.js';

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
    // 분류는 여러 개(쉼표로, 예: '웹앱, 홈페이지') → 카드에는 '웹앱 · 홈페이지', 탭은 각각에 (사용자 지시 2026-11-11)
    const tags = String(s.tag || '').split(/\s*[,·]\s*/).filter(Boolean).map(escHtml).join(' · ');
    return cardHtml(s, info[i] || {}, { ...base, tag: tags || base.tag || '' });
  }).join('\n');
  return new HTMLRewriter()
    .on('ul.grid', { element(e) { e.setInnerContent(list || '<li class="none">아직 올린 사이트가 없습니다.</li>', { html: true }); } })
    .transform(new Response(html, res));
}

// 첫 화면이면 카드를 채운다 (사이트마다 xms 값을 읽어 오므로 브라우저가 묵혀 두지 않게)
async function page(request, env, ctx, url) {
  let res = await (env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request));
  const isHtml = (res.headers.get('Content-Type') || '').includes('text/html');
  if (!isHtml) return res;
  if (/^\/(index\.html)?$/.test(url.pathname)) res = await fillCards(res, env, ctx);
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-cache');
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // 예전 비밀번호 화면 주소 → 첫 화면으로
    if (url.pathname === '/__unlock') return Response.redirect(new URL('/', url), 303);
    // 제작문의 (사용자 지시 2026-11-12): 폼 → xim Engine.inquiry → xim '제작문의' 메뉴. 봇 확인 키도 xim 에서
    const jsonRes = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (url.pathname === '/api/inquiry-key' && env.XIM) return jsonRes({ sitekey: await env.XIM.inquiryKey('portfolio').catch(() => '') });
    if (url.pathname === '/api/inquiry' && env.XIM) {
      if (request.method !== 'POST') return jsonRes({ error: 'POST 로 보내 주세요.' }, 405);
      let raw = {}; try { raw = await request.json(); } catch { return jsonRes({ error: '내용을 읽지 못했습니다.' }, 400); }
      const r = await env.XIM.inquiry('portfolio', raw, request.headers.get('CF-Connecting-IP') || '').catch((e) => ({ error: '잠시 뒤 다시 보내 주세요. (' + (e.message || e) + ')' }));
      return r.error ? jsonRes({ error: r.error }, 400) : jsonRes({ ok: true });
    }
    // 포트폴리오2 그림: xim 이 처음 한 번 받아 저장해 둔 것 (그 사이트 서버에는 다시 묻지 않는다)
    const pi = url.pathname.match(/^\/pf2-img\/([a-f0-9]{32})$/);
    if (pi && env.XIM) {
      const r = await env.XIM.fetch(new Request(`https://xim/__pf2img/${pi[1]}`));
      const out = new Response(r.body, r);
      out.headers.set('Cache-Control', 'public, max-age=86400');
      return out;
    }
    return page(request, env, ctx, url);
  },
};
