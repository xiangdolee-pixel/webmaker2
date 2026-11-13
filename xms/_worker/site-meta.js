// 파비콘 · 검색엔진 · 카카오톡 미리보기 — 관리 API, 공개 파일, robots.txt · sitemap.xml, 페이지 머리(head)에 넣을 값
import { now, bad, notFound, json, str, body, audit, esc, canBy } from './lib.js';
import { visibleMenus } from './public.js';
import { siteFileDirect } from './uploads.js';

const FAV_SIZES = [32, 180, 192, 512];
const ENGINES = {
  naver: { meta: 'naver-site-verification', label: '네이버' },
  google: { meta: 'google-site-verification', label: '구글' },
  bing: { meta: 'msvalidate.01', label: '빙' },
};

export async function getSeo(db, site) {
  const r = await db.prepare('SELECT * FROM site_seo WHERE site = ?').bind(site).first();
  return {
    title: r?.title || '', description: r?.description || '', verify: JSON.parse(r?.verify || '{}'),
    robots: r?.robots || '', share_description: r?.share_description || '', adsense: r?.adsense || '', updated_at: r?.updated_at || 0,
  };
}
async function saveSeo(db, site, patch) {
  const cur = await getSeo(db, site);
  const n = { ...cur, ...patch };
  await db.prepare(`INSERT INTO site_seo (site, title, description, verify, robots, share_description, adsense, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(site) DO UPDATE SET title = excluded.title, description = excluded.description, verify = excluded.verify,
    robots = excluded.robots, share_description = excluded.share_description, adsense = excluded.adsense, updated_at = excluded.updated_at`)
    .bind(site, n.title, n.description, JSON.stringify(n.verify), n.robots, n.share_description, n.adsense, now()).run();
}
const fileInfo = async (db, site) => {
  const { results } = await db.prepare('SELECT kind, updated_at, length(data) AS len FROM site_files WHERE site = ?').bind(site).all();
  return Object.fromEntries(results.map((r) => [r.kind, r]));
};

// 검색엔진이 준 태그를 통째로 붙여 넣어도 값만 꺼낸다
function verifyValue(raw) {
  let v = str(raw, 500);
  const m = v.match(/content\s*=\s*["']([^"']+)["']/i);
  if (m) v = m[1];
  v = v.trim();
  if (v && !/^[A-Za-z0-9_\-=.:+/]{4,200}$/.test(v)) throw bad('소유권 확인 값에 쓸 수 없는 글자가 있습니다. 검색엔진이 준 태그나 값을 그대로 붙여 넣어 주세요.');
  return v;
}
// 구글 애드센스: 코드 · ads.txt 줄 · ID 무엇을 붙여 넣어도 게시자 ID(ca-pub-숫자)만 꺼낸다. 비우면 광고를 뺀다
export function adsenseValue(raw) {
  const v = str(raw, 2000).trim();
  if (!v) return '';
  const m = v.match(/(?:ca-)?pub-(\d{10,20})/);
  if (!m) throw bad('애드센스 게시자 ID 를 찾지 못했습니다. 애드센스가 준 코드를 통째로 붙여 넣거나 ca-pub- 로 시작하는 값을 넣어 주세요.');
  return `ca-pub-${m[1]}`;
}

// data:image/…;base64,… → { mime, b64 }
function dataUrl(v, mimes, maxBytes, label) {
  const m = String(v || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !mimes.includes(m[1])) throw bad(`${label} 파일 형식이 잘못됐습니다.`);
  if (m[2].length * 0.75 > maxBytes) throw bad(`${label} 파일이 너무 큽니다.`);
  return { mime: m[1], b64: m[2] };
}

export const siteOrigin = (s, slug) => {
  const d = String(s?.domain || '').trim().replace(/^https?:[/][/]/, '').replace(/[/].*$/, '');
  return d ? `https://${d}` : `https://${slug}.xiangdolee.workers.dev`;
};
export function defaultRobots() {
  // /xms/ = 관리 화면 (파비콘 · 공유 그림 · 올린 사진은 /xms/file · /xms/upload 라 열어 둔다)
  return 'User-agent: *\nAllow: /\nAllow: /xms/file/\nAllow: /xms/upload/\nDisallow: /xms/$\nDisallow: /admin/\nDisallow: /xms-api/\nDisallow: /member/';
}
export function robotsTxt(seo, origin) {
  const body = (seo.robots || defaultRobots()).split(/\r?\n/).filter((l) => !/^\s*sitemap\s*:/i.test(l)).join('\n').trim();
  return `${body}\n\nSitemap: ${origin}/sitemap.xml\n`;
}

// ───────── 관리 API (/xms-api/admin/settings/*) ─────────
export async function settingsApi(ctx, path, method) {
  const { request, env, site, me } = ctx;
  const db = env.DB;
  const s = await env.XIM_DB.prepare('SELECT name, domain FROM sites WHERE slug = ?').bind(site).first();

  if (path === '/settings/favicon' && method === 'GET') {
    const f = await fileInfo(db, site);
    return json({ has: !!f['favicon-32'], updated_at: f['favicon-32']?.updated_at || 0, sizes: FAV_SIZES });
  }
  if (path === '/settings/favicon' && method === 'PUT') {
    const { icons } = await body(request);
    const t = now();
    const stmts = FAV_SIZES.map((n) => {
      const d = dataUrl(icons?.[n], ['image/png'], 400000, `${n}px 아이콘`);
      return db.prepare('INSERT OR REPLACE INTO site_files (site, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)').bind(site, `favicon-${n}`, d.mime, d.b64, t);
    });
    await db.batch(stmts);
    await audit(db, site, me, request, 'FAVICON_SET', '파비콘');
    return json({ ok: true });
  }
  if (path === '/settings/favicon' && method === 'DELETE') {
    await db.prepare("DELETE FROM site_files WHERE site = ? AND kind LIKE 'favicon-%'").bind(site).run();
    await audit(db, site, me, request, 'FAVICON_REMOVE', '파비콘');
    return json({ ok: true });
  }

  if (path === '/settings/seo' && method === 'GET') {
    const seo = await getSeo(db, site);
    const origin = siteOrigin(s, site);
    const pages = (await publicPages(env, site)).map(([p]) => origin + p);
    return json({ ...seo, siteName: s?.name || site, origin, sitemapUrl: `${origin}/sitemap.xml`, rssUrl: `${origin}/rss.xml`, pages, robotsDefault: defaultRobots(), engines: ENGINES });
  }
  if (path === '/settings/seo' && method === 'PUT') {
    const raw = await body(request);
    const verify = {};
    for (const k of Object.keys(ENGINES)) { const v = verifyValue(raw.verify?.[k]); if (v) verify[k] = v; }
    await saveSeo(db, site, { title: str(raw.title, 70), description: str(raw.description, 300), verify, adsense: adsenseValue(raw.adsense) });
    await audit(db, site, me, request, 'SEO_UPDATE', '검색엔진');
    return json({ ok: true });
  }
  if (path === '/settings/robots' && method === 'PUT') {
    const robots = str((await body(request)).robots, 5000);
    await saveSeo(db, site, { robots });
    await audit(db, site, me, request, 'ROBOTS_UPDATE', 'robots.txt', robots ? '직접 쓴 내용' : '기본값');
    return json({ ok: true });
  }

  if (path === '/settings/share' && method === 'GET') {
    const seo = await getSeo(db, site);
    const f = await fileInfo(db, site);
    return json({
      share_description: seo.share_description, seo_title: seo.title, seo_description: seo.description, siteName: s?.name || site,
      origin: siteOrigin(s, site), image: f.og ? { updated_at: f.og.updated_at } : null,
    });
  }
  if (path === '/settings/share' && method === 'PUT') {
    await saveSeo(db, site, { share_description: str((await body(request)).share_description, 200) });
    await audit(db, site, me, request, 'SHARE_UPDATE', '카카오톡 미리보기');
    return json({ ok: true });
  }
  if (path === '/settings/share/image' && method === 'PUT') {
    const d = dataUrl((await body(request)).image, ['image/jpeg', 'image/png', 'image/webp'], 1200000, '그림');
    await db.prepare('INSERT OR REPLACE INTO site_files (site, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)').bind(site, 'og', d.mime, d.b64, now()).run();
    await audit(db, site, me, request, 'SHARE_IMAGE_SET', '미리보기 그림');
    return json({ ok: true });
  }
  if (path === '/settings/share/image' && method === 'DELETE') {
    await db.prepare("DELETE FROM site_files WHERE site = ? AND kind = 'og'").bind(site).run();
    await audit(db, site, me, request, 'SHARE_IMAGE_REMOVE', '미리보기 그림');
    return json({ ok: true });
  }
  return null;
}

// ───────── 공개: 파일 · robots.txt · sitemap.xml ─────────
export async function serveFile(env, site, kind) {
  const f = await env.DB.prepare('SELECT mime, data, updated_at FROM site_files WHERE site = ? AND kind = ?').bind(site, kind).first();
  if (!f) throw notFound();
  const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=300', ETag: `"${f.updated_at}"` } });
}

// ads.txt: 애드센스 게시자 ID 가 있을 때만 (구글 인증 판매자 한 줄)
export async function serveAdsTxt(env, site) {
  const { adsense } = await getSeo(env.DB, site);
  if (!adsense) throw notFound();
  return new Response(`google.com, ${adsense.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

export async function serveRobots(env, site, origin) {
  return new Response(robotsTxt(await getSeo(env.DB, site), origin), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

// 검색엔진에 알릴 화면 주소: 첫 화면 · 메뉴 · 공개 게시판 · 공개 글 [[경로, 고친 때]]
async function publicPages(env, site) {
  const db = env.DB;
  const guest = { kind: 'guest', level: 0 };
  const urls = new Map();
  const add = (p, t) => { if (!urls.has(p)) urls.set(p, t); };
  add('/', 0);
  const walk = (items) => items.forEach((m) => {
    if (m.href && !m.external) { const p = m.href.split('#')[0] || '/'; if (p.startsWith('/') && !p.startsWith('//')) add(p, 0); }
    walk(m.children || []);
  });
  walk(await visibleMenus(db, site, guest));
  const { results: boards } = await db.prepare('SELECT * FROM boards WHERE site = ? AND deleted_at IS NULL AND visible = 1').bind(site).all();
  for (const b of boards) {
    if (!canBy(b.list_levels, b.allow_guest_list, guest)) continue;
    add(`/board/${b.slug}`, 0);
    if (!canBy(b.read_levels, b.allow_guest_read, guest)) continue;
    const { results: posts } = await db.prepare('SELECT id, updated_at FROM posts WHERE board_id = ? AND deleted_at IS NULL AND is_secret = 0 AND is_hidden = 0 AND published_at <= ? ORDER BY id DESC LIMIT 500')
      .bind(b.id, now()).all();
    posts.forEach((p) => add(`/board/${b.slug}/${p.id}`, p.updated_at));
  }
  return [...urls].slice(0, 2000);
}

export async function serveSitemap(env, site, origin) {
  const pages = await publicPages(env, site);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(([p, t]) =>
    `  <url><loc>${esc(origin + p)}</loc>${t ? `<lastmod>${new Date(t).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

// 사이트 Worker 가 html 머리에 넣을 값 (메뉴와 한 번에)
export async function headData(env, site) {
  const db = env.DB;
  const [seo, files, s] = await Promise.all([getSeo(db, site), fileInfo(db, site), env.XIM_DB.prepare('SELECT name FROM sites WHERE slug = ?').bind(site).first()]);
  const fv = files['favicon-32']?.updated_at;
  return {
    title: seo.title,
    description: seo.description,
    share_description: seo.share_description || seo.description,
    site_name: s?.name || '',
    verify: Object.entries(seo.verify).map(([k, v]) => ({ name: ENGINES[k]?.meta, content: v })).filter((x) => x.name),
    favicon: fv ? FAV_SIZES.map((n) => ({ size: n, href: `/xms/file/favicon-${n}.png?v=${fv}` })) : null,
    og_image: files.og ? `/xms/file/og?v=${files.og.updated_at}` : null,
    og_direct: files.og ? await siteFileDirect(env, site, 'og', files.og.updated_at).catch(() => '') : '',   // 서울 R2 에서 바로 (포트폴리오 카드 그림)
    adsense: seo.adsense,
  };
}

// ───────── RSS (네이버 · 구독용) — 로그인 없이 볼 수 있는 게시판의 최신 글 50개, 본문 전체(사진 링크 포함) ─────────
export async function serveRss(env, site, origin) {
  const db = env.DB;
  const guest = { kind: 'guest', level: 0 };
  const [s, seo, { results: boards }] = await Promise.all([
    env.XIM_DB.prepare('SELECT name, created_at FROM sites WHERE slug = ?').bind(site).first(),
    getSeo(db, site),
    db.prepare('SELECT * FROM boards WHERE site = ? AND deleted_at IS NULL AND visible = 1').bind(site).all(),
  ]);
  const open = boards.filter((b) => canBy(b.list_levels, b.allow_guest_list, guest) && canBy(b.read_levels, b.allow_guest_read, guest));
  let posts = [];
  if (open.length) {
    const { results } = await db.prepare(`SELECT id, board_id, title, content_html, writer_name, published_at FROM posts
      WHERE board_id IN (${open.map(() => '?').join(',')}) AND deleted_at IS NULL AND is_secret = 0 AND is_hidden = 0 AND published_at <= ?
      ORDER BY published_at DESC, id DESC LIMIT 50`).bind(...open.map((b) => b.id), now()).all();
    posts = results;
  }
  const slugOf = Object.fromEntries(open.map((b) => [b.id, b]));
  const abs = (h) => String(h || '').replace(/(src|href)="\//g, `$1="${origin}/`);
  const cdata = (h) => `<![CDATA[${String(h).replace(/]]>/g, ']]&gt;')}]]>`;
  const name = seo.title || s?.name || site;
  const items = posts.map((p) => {
    const b = slugOf[p.board_id];
    const link = `${origin}/board/${b.slug}/${p.id}`;
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${esc(link)}</link>
    <guid isPermaLink="true">${esc(link)}</guid>
    <category>${esc(b.name)}</category>
    <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    <description>${cdata(abs(p.content_html))}</description>
  </item>`;
  }).join('\n');
  // 공개 글이 하나도 없으면(게시판이 없는 사이트 등) 네이버가 "형식이 올바르지 않다"며 받지 않는다
  //   → 홈페이지와 메뉴 페이지를 항목으로 넣는다 (날짜 = 사이트 만든 날, 늘 같게)
  const since = new Date(s?.created_at || Date.UTC(2026, 0, 1)).toUTCString();
  let pageItems = '';
  if (!posts.length) {
    const pages = [{ path: '/', title: name, desc: seo.description || name }];
    const walk = (list) => list.forEach((m) => {
      if (m.href && !m.external) {
        const path = m.href.split('#')[0] || '/';
        if (path.startsWith('/') && !path.startsWith('//')) pages.push({ path, title: `${m.title} — ${name}`, desc: `${name} · ${m.title}` });
      }
      walk(m.children || []);
    });
    walk(await visibleMenus(db, site, guest));
    const seen = new Set();
    pageItems = pages.filter((x) => !seen.has(x.path) && seen.add(x.path)).slice(0, 50).map((x) => `  <item>
    <title>${esc(x.title)}</title>
    <link>${esc(origin + x.path)}</link>
    <guid isPermaLink="true">${esc(origin + x.path)}</guid>
    <pubDate>${since}</pubDate>
    <description>${cdata(x.desc)}</description>
  </item>`).join('\n');
  }
  const last = posts.length ? new Date(posts[0].published_at).toUTCString() : since;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(name)}</title>
  <link>${esc(origin)}/</link>
  <description>${esc(seo.description || name)}</description>
  <language>ko</language>
  <lastBuildDate>${last}</lastBuildDate>
  <atom:link href="${esc(origin)}/rss.xml" rel="self" type="application/rss+xml"/>
${items || pageItems}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
