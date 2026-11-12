// xms — 업체별 CMS (회원 · 게시판 · 메뉴 · 수정요청)
//
//   Cms (서비스 바인딩 전용) — 고객 사이트 Worker 가 X-Xim-Site 헤더를 붙여 넘긴다. 공개 주소로는 닿지 않는다.
//     /xms/                관리자 화면 (등급 1 회원 · xim 에서 대신 들어온 운영자) — 예전 /admin/ 은 /xms/ 로 넘긴다
//     /xms/?staff=…        xim "xms" 버튼 1회용 입장권 → 운영자 세션
//     /xms/css · /xms/js · /xms/img   화면용 정적 파일 (img = 관리 화면 xms 아이콘)
//     /xms-api/admin/*     관리자 API      /xms-api/*  방문자 API (로그인 · 가입 · 글 · 댓글 · 메뉴)
//     /member/* · /board/* 방문자 화면
//   기본 export (xms.….workers.dev) — 아무것도 내주지 않는다.
//
//   바인딩: DB(D1 xms), XIM_DB(D1 xim: 사이트 · 수정요청), ASSETS
import { WorkerEntrypoint } from 'cloudflare:workers';
import { fail, whoAmI, now, createSession, html, verOf } from './lib.js';
import { adminApi } from './admin-api.js';
import { publicApi, publicPage, menuAccess } from './public.js';
import { serveFile, serveRobots, serveSitemap, serveRss, serveAdsTxt, headData } from './site-meta.js';
import { livePopups } from './popups.js';
import { uploadApi, serveUpload, avatarOf } from './uploads.js';
import { embedCss } from './css-scope.js';
import { recordVisit } from './visits.js';
import { publicCourses } from './courses.js';

const SITE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const headCache = new Map();
// 수정 모드로 고친 글자: 이 페이지 것 + 머리 · 꼬리('*') 것. 15초 기억 (관리자는 늘 새로)
const textCache = new Map();
async function pageTexts(db, site, path, fresh) {
  if (!path || path.length > 300) return null;
  const key = `${site}|${path}`;
  const hit = !fresh && textCache.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.v;
  const { results } = await db.prepare("SELECT path, k, t FROM page_texts WHERE site = ? AND path IN (?, '*')").bind(site, path).all();
  const v = results.length ? { page: {}, all: {} } : null;
  for (const r of results) { try { v[r.path === '*' ? 'all' : 'page'][r.k] = JSON.parse(r.t); } catch { /* 깨진 값은 건너뜀 */ } }
  if (textCache.size > 2000) textCache.clear();
  textCache.set(key, { at: Date.now(), v });
  return v;
}
let accountCssText = null;
async function accountCss(env) {
  if (accountCssText === null) accountCssText = await (await env.ASSETS.fetch(new Request('https://assets/css/account.css'))).text();
  return accountCssText;
}

// 화면용 css · js: ?v=번호 가 붙은 주소는 1년 그대로(번호가 바뀌면 새 주소), 번호 없는 옛 주소는 1분만
//   js 안의 상대 import('./x.js') 에도 같은 번호를 붙여, 함께 바뀐 파일끼리 섞이지 않게 한다
async function asset(env, path, cache, versioned = false) {
  const res = await env.ASSETS.fetch(new Request(`https://assets${path}`));
  let out;
  if (res.ok && /\.js$/.test(path)) {
    const v = verOf(env);
    const js = (await res.text()).replace(/((?:from|import)\s*\(?\s*['"])(\.\/[\w-]+\.js)(['"])/g, `$1$2?v=${v}$3`);
    out = new Response(js, res);
    out.headers.delete('Content-Length');
  } else out = new Response(res.body, res);
  out.headers.set('Cache-Control', cache || (versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=60'));
  return out;
}
// 관리 화면 html: /xms/ 아래 css · js 주소에 배포 번호를 붙인다
const withVer = (env, res) => new HTMLRewriter()
  .on('link[href^="/xms/"]', { element(el) { el.setAttribute('href', `${el.getAttribute('href')}?v=${verOf(env)}`); } })
  .on('script[src^="/xms/"]', { element(el) { el.setAttribute('src', `${el.getAttribute('src')}?v=${verOf(env)}`); } })
  .transform(res);

export class Cms extends WorkerEntrypoint {
  // 방문 기록 (사이트 Worker 가 html 페이지를 내보낸 뒤 RPC 로 부른다)
  async visit(site, hit) {
    if (!SITE_RE.test(site || '') || !hit) return;
    try { await recordVisit(this.env.DB, site, hit); } catch (e) { console.error('방문 기록 실패', e); }
  }

  async fetch(request) {
    const env = this.env;
    const url = new URL(request.url);
    const site = request.headers.get('X-Xim-Site') || '';
    if (!SITE_RE.test(site)) return new Response('xms: 사이트를 알 수 없습니다.', { status: 400 });
    const p = url.pathname;

    try {
      // 정적 파일
      // 올린 파일 (파비콘 · 공유 그림 · 팝업 그림)
      let fm = p.match(/^\/xms\/file\/(favicon-(?:32|180|192|512)|og|popup-\d+)(?:\.png)?$/);
      if (fm) return await serveFile(env, site, fm[1]);
      const um = p.match(/^[/]xms[/]upload[/]([0-9a-f]{32})$/);
      if (um) return await serveUpload(env, site, um[1], url.searchParams.get('dl') === '1', request);
      if (p === '/xms/css/embed.css') return new Response(await embedCss(env), { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=60' } });
      if (p === '/robots.txt') return await serveRobots(env, site, url.origin);
      if (p === '/ads.txt') return await serveAdsTxt(env, site);
      if (p === '/sitemap.xml') return await serveSitemap(env, site, url.origin);
      if (p === '/rss.xml') return await serveRss(env, site, url.origin);
      // 관리자 화면 = /xms/ (예전 주소 /admin/ 은 넘긴다)
      if (p === '/admin' || p.startsWith('/admin/')) return Response.redirect(`${url.origin}/xms/${url.search}`, 301);
      if (p === '/xms') return Response.redirect(`${url.origin}/xms/${url.search}`, 301);
      if (p === '/xms/' || p === '/xms/index.html') {
        const ticket = url.searchParams.get('staff');
        if (ticket && /^[0-9a-f]{64}$/.test(ticket)) {
          const t = await env.DB.prepare('DELETE FROM staff_tickets WHERE token = ? AND site = ? AND expires_at > ? RETURNING token').bind(ticket, site, now()).first();
          if (!t) return html('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">입장권이 만료됐습니다. xim 에서 "xms" 버튼을 다시 눌러 주세요.</p>', 410);
          // 일반 관리자 로그인과 똑같이: 이 사이트 첫 관리자(등급 1) 계정으로 들어간다 (사용자 지시 — 운영자로 구분하지 않는다). 관리자가 없을 때만 운영자로.
          const adm = await env.DB.prepare("SELECT id FROM members WHERE site = ? AND level = 1 AND status = 'ACTIVE' ORDER BY id LIMIT 1").bind(site).first();
          const cookie = adm ? await createSession(env.DB, site, 'keep', adm.id) : await createSession(env.DB, site, 'staff');
          return new Response(null, { status: 302, headers: { Location: `${url.origin}/xms/`, 'Set-Cookie': cookie } });
        }
        const res = await asset(env, '/admin/', 'no-cache');
        res.headers.set('X-Robots-Tag', 'noindex');
        return withVer(env, res);
      }
      if (p.startsWith('/xms/')) {
        const rest = p.slice(4);
        if (!/^\/(css|js|img)\/[\w.-]+$/.test(rest)) return new Response('Not found', { status: 404 });
        return await asset(env, rest, null, url.searchParams.has('v'));
      }

      const t0 = Date.now();
      const me = await whoAmI(env.DB, request, site);
      const tWho = Date.now() - t0;
      const ctx = { request, env, site, me, url };
      // 걸린 시간을 Server-Timing 으로 (어디가 느린지 본다): who = 로그인 확인, xmsall = xms 전체
      const timed = async (p) => {
        const r = await p;
        try { r.headers.append('Server-Timing', `who;dur=${tWho}, xmsall;dur=${Date.now() - t0}`); return r; }
        catch { const o = new Response(r.body, r); o.headers.append('Server-Timing', `who;dur=${tWho}, xmsall;dur=${Date.now() - t0}`); return o; }
      };
      // 사이트 Worker 가 html 을 내보낼 때 한 번에 묻는다: 메뉴 · 머리(head) 값 · 홈 팝업
      if (p === '/xms-api/site-head') {
        const home = url.searchParams.get('home') === '1';
        // 같은 사이트 · 같은 등급이면 15초 동안 기억해 둔 메뉴 · 머리 값을 쓴다 (관리자는 고친 것이 바로 보이게 늘 새로)
        const key = `${site}:${me.level}:${home ? 1 : 0}`;
        let data = me.level === 1 ? null : headCache.get(key);
        if (!data || Date.now() - data.at > 15000) {
          const [ma, head, popups, top] = await Promise.all([menuAccess(env.DB, site, me), headData(env, site), home ? livePopups(env.DB, site) : [],
            env.DB.prepare("SELECT v FROM site_options WHERE site = ? AND k = 'top_button'").bind(site).first()]);
          let topBtn = null;
          // 맨 위로 버튼은 xim 의 모든 사이트에 기본으로 켠다(사용자 지시 2026-11-12). 부가 기능에서 끈 사이트만 뺀다
          try { topBtn = top ? JSON.parse(top.v) : { on: true, except: [] }; } catch { topBtn = { on: true, except: [] }; }
          data = { at: Date.now(), menu: ma.menu, blocked: ma.blocked, head, popups, top: topBtn?.on ? { except: topBtn.except || [] } : null };
          if (me.level !== 1) headCache.set(key, data);
        }
        const who = me.kind === 'guest' ? { guest: true } : me.kind === 'staff' ? { staff: true, admin: true } : { name: me.member.name, admin: me.level === 1, avatar: avatarOf(me.member) };
        const texts = await pageTexts(env.DB, site, url.searchParams.get('path') || '', me.level === 1);
        return new Response(JSON.stringify({ menu: data.menu, blocked: data.blocked, head: data.head, popups: data.popups, me: who, texts, top: data.top, account_css: await accountCss(env), ver: verOf(env) }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      if (p === '/xms-api/uploads' && request.method === 'POST') return await timed(uploadApi(ctx));
      if (p.startsWith('/xms-api/admin/')) return await timed(adminApi(ctx));
      if (/^\/xms-api\/(courses|lessons|my\/courses)(\/|$)/.test(p)) {
        return await timed((async () => (await publicCourses(ctx, p.slice(8).replace(/\/+$/, ''), request.method))
          || new Response(JSON.stringify({ error: '찾을 수 없습니다.' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))());
      }
      if (p.startsWith('/xms-api/')) return await timed(publicApi(ctx));
      if (p.startsWith('/member/') || p.startsWith('/board/') || p === '/board') return await timed(publicPage(ctx));
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return fail(e);
    }
  }
}

export default {
  async fetch() {
    return new Response('xms', { status: 404 });
  },
};
