// 방문 통계 — 사이트 Worker 가 html 페이지를 내보낼 때마다 Cms.visit() 으로 알린다 (방문자에게는 기다림 없음, waitUntil)
//   하루 단위로 더해 두고, 1년(366일)이 지난 날은 지운다. 날짜는 한국 시간.
//   검색엔진에서 들어온 것은 한 번에 한 줄씩(visit_searches) 남겨 어떤 검색어로 어디서 왔는지 보여 준다.
import { json } from './lib.js';

const KEEP_DAYS = 366;
const KEEP_SEARCHES = 3000; // 사이트마다 검색 유입 기록 최대 줄 수
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
const cutoff = () => kstDay(Date.now() - KEEP_DAYS * 86400000);

// 검색엔진: [들어온 곳 호스트(www · m 뗀 것), 이름, 검색어가 든 주소 변수]. 구글 · 빙 · 덕덕고는 검색어를 넘겨 주지 않아 대개 '' 로 남는다
const ENGINES = [
  [/^search\.naver\.com$/, '네이버', ['query']],
  [/^search\.daum\.net$/, '다음', ['q']],
  [/^google\.(com(\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2,3})$/, '구글', ['q']],
  [/^bing\.com$/, '빙', ['q']],
  [/(^|\.)yahoo\.(com|co\.[a-z]{2})$/, '야후', ['p']],
  [/^duckduckgo\.com$/, '덕덕고', ['q']],
  [/^yandex\.(ru|com)$/, '얀덱스', ['text']],
  [/^baidu\.com$/, '바이두', ['wd', 'word']],
  [/^search\.zum\.com$/, '줌', ['query']],
  [/^search\.nate\.com$/, '네이트', ['q']],
  [/^search\.brave\.com$/, '브레이브', ['q']],
  [/^ecosia\.org$/, '에코시아', ['q']],
];
// ref(호스트) · rq(들어온 곳 주소의 ? 뒷부분) → { engine, keyword } 또는 null
export function searchOf(ref, rq) {
  const hit = ENGINES.find(([re]) => re.test(ref || ''));
  if (!hit) return null;
  let keyword = '';
  try {
    const sp = new URLSearchParams(String(rq || ''));
    for (const k of hit[2]) { const v = sp.get(k); if (v) { keyword = v; break; } }
  } catch { /* 이상한 주소 */ }
  keyword = keyword.replace(/\s+/g, ' ').trim().slice(0, 100);
  return { engine: hit[1], keyword };
}

async function purge(db, site) {
  const c = cutoff();
  const w = site ? 'site = ? AND day < ?' : 'day < ?';
  const args = site ? [site, c] : [c];
  const stmts = ['visit_days', 'visit_pages', 'visit_refs', 'visit_searches'].map((t) => db.prepare(`DELETE FROM ${t} WHERE ${w}`).bind(...args));
  if (site) stmts.push(db.prepare('DELETE FROM visit_searches WHERE site = ?1 AND id < (SELECT id FROM visit_searches WHERE site = ?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)').bind(site, KEEP_SEARCHES));
  await db.batch(stmts);
}

// hit = { path, fresh(그날 첫 방문), ref(들어온 곳 호스트), rq(들어온 곳 주소의 ? 뒷부분, 검색엔진일 때만), mobile }
export async function recordVisit(db, site, hit) {
  const t = Date.now();
  const day = kstDay(t);
  const path = String(hit.path || '/').slice(0, 200);
  const fresh = hit.fresh ? 1 : 0;
  const mob = fresh && hit.mobile ? 1 : 0;
  const stmts = [
    db.prepare(`INSERT INTO visit_days (site, day, views, visitors, mobile) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(site, day) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors, mobile = mobile + excluded.mobile`).bind(site, day, fresh, mob),
    db.prepare(`INSERT INTO visit_pages (site, day, path, views) VALUES (?, ?, ?, 1)
      ON CONFLICT(site, day, path) DO UPDATE SET views = views + 1`).bind(site, day, path),
  ];
  if (fresh) {
    stmts.push(db.prepare(`INSERT INTO visit_refs (site, day, ref, visitors) VALUES (?, ?, ?, 1)
      ON CONFLICT(site, day, ref) DO UPDATE SET visitors = visitors + 1`).bind(site, day, String(hit.ref || '').slice(0, 100)));
  }
  const s = hit.ref ? searchOf(String(hit.ref), hit.rq) : null;
  if (s) stmts.push(db.prepare('INSERT INTO visit_searches (site, day, at, engine, keyword, path) VALUES (?, ?, ?, ?, ?, ?)').bind(site, day, t, s.engine, s.keyword, path));
  await db.batch(stmts);
  if (Math.random() < 0.002) await purge(db); // 가끔 모든 사이트의 1년 지난 기록을 지운다
}

// 관리 화면: GET /xms-api/admin/stats?range=7|30|90|180|270|365&pp=1&rp=1&kp=1&sp=1
//   7 · 30 · 90 일은 날마다, 180 · 270 · 365(6 · 9 · 12개월)는 달마다. 많이 본 페이지(pp) · 들어온 곳(rp) · 검색어(kp)는 10개씩, 최근 검색 유입(sp)은 20줄씩 쪽으로 나눈다
export const RANGES = [7, 30, 90, 180, 270, 365];
const RANK = 10;
const RECENT = 20;
export async function statsApi(db, site, q) {
  await purge(db, site);
  const range = RANGES.includes(Number(q.get('range'))) ? Number(q.get('range')) : 30;
  const page = (k) => Math.max(1, parseInt(q.get(k), 10) || 1);
  const [pp, rp, kp, sp] = ['pp', 'rp', 'kp', 'sp'].map(page);
  const today = kstDay();
  const yesterday = kstDay(Date.now() - 86400000);
  const monthly = range >= 180;
  const months = Math.round(range / 30.4); // 6 · 9 · 12
  // n개월 = (n-1)달 전 1일부터 (달 단위로 끊어 보이게)
  const from = monthly ? (() => { const [y, m] = today.split('-').map(Number); return new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10); })()
    : kstDay(Date.now() - (range - 1) * 86400000);
  const [days, sum, near, pages, refs, engines, keywords, searches, menus, boards] = await db.batch([
    monthly
      ? db.prepare(`SELECT substr(day, 1, 7) AS day, SUM(views) AS views, SUM(visitors) AS visitors FROM visit_days WHERE site = ? AND day >= ? GROUP BY 1 ORDER BY 1`).bind(site, from)
      : db.prepare('SELECT day, views, visitors FROM visit_days WHERE site = ? AND day >= ? ORDER BY day').bind(site, from),
    db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(mobile), 0) AS mobile,
        (SELECT COUNT(*) FROM visit_days WHERE site = ?1) AS kept_days, (SELECT MIN(day) FROM visit_days WHERE site = ?1) AS first_day,
        (SELECT COUNT(DISTINCT path) FROM visit_pages WHERE site = ?1 AND day >= ?2) AS pages_total,
        (SELECT MAX(v) FROM (SELECT SUM(views) AS v FROM visit_pages WHERE site = ?1 AND day >= ?2 GROUP BY path)) AS pages_max,
        (SELECT COUNT(DISTINCT ref) FROM visit_refs WHERE site = ?1 AND day >= ?2) AS refs_total,
        (SELECT COALESCE(SUM(visitors), 0) FROM visit_refs WHERE site = ?1 AND day >= ?2) AS refs_sum,
        (SELECT COUNT(*) FROM visit_searches WHERE site = ?1 AND day >= ?2) AS searches_total,
        (SELECT COUNT(DISTINCT keyword) FROM visit_searches WHERE site = ?1 AND day >= ?2 AND keyword != '') AS keywords_total,
        (SELECT MAX(v) FROM (SELECT COUNT(*) AS v FROM visit_searches WHERE site = ?1 AND day >= ?2 AND keyword != '' GROUP BY keyword)) AS keywords_max
      FROM visit_days WHERE site = ?1 AND day >= ?2`).bind(site, from),
    db.prepare('SELECT day, views, visitors FROM visit_days WHERE site = ? AND day IN (?, ?)').bind(site, today, yesterday),
    db.prepare('SELECT path, SUM(views) AS views FROM visit_pages WHERE site = ? AND day >= ? GROUP BY path ORDER BY views DESC, path LIMIT ? OFFSET ?').bind(site, from, RANK, (pp - 1) * RANK),
    db.prepare('SELECT ref, SUM(visitors) AS visitors FROM visit_refs WHERE site = ? AND day >= ? GROUP BY ref ORDER BY visitors DESC, ref LIMIT ? OFFSET ?').bind(site, from, RANK, (rp - 1) * RANK),
    db.prepare(`SELECT engine, COUNT(*) AS n, SUM(keyword != '') AS with_kw FROM visit_searches WHERE site = ? AND day >= ? GROUP BY engine ORDER BY n DESC, engine`).bind(site, from),
    db.prepare(`SELECT keyword, COUNT(*) AS n, GROUP_CONCAT(DISTINCT engine) AS engines, MAX(at) AS last FROM visit_searches WHERE site = ? AND day >= ? AND keyword != ''
      GROUP BY keyword ORDER BY n DESC, last DESC LIMIT ? OFFSET ?`).bind(site, from, RANK, (kp - 1) * RANK),
    db.prepare('SELECT at, engine, keyword, path FROM visit_searches WHERE site = ? AND day >= ? ORDER BY at DESC, id DESC LIMIT ? OFFSET ?').bind(site, from, RECENT, (sp - 1) * RECENT),
    db.prepare("SELECT title, path FROM menus WHERE site = ? AND path != ''").bind(site),
    db.prepare('SELECT slug, name FROM boards WHERE site = ?').bind(site),
  ]);
  // 주소 → 이름 (메뉴 이름, 게시판 이름)
  const names = { '/': '첫 화면' };
  for (const b of boards.results) names[`/board/${b.slug}`] = b.name;
  for (const m of menus.results) { try { names[new URL(m.path, 'https://x').pathname] = m.title; } catch { /* 외부 주소 */ } }
  const nameOf = (p) => names[p] || names[p.replace(/\/\d+$/, '')] || '';
  const s = sum.results[0];
  const pick = (d) => { const r = near.results.find((x) => x.day === d); return { views: r?.views || 0, visitors: r?.visitors || 0 }; };
  return json({
    range, monthly, months, today, from,
    today_stat: pick(today), yesterday: pick(yesterday),
    total: { views: s.views, visitors: s.visitors, mobile: s.mobile },
    kept_days: s.kept_days, first_day: s.first_day,
    rank_size: RANK, recent_size: RECENT, pp, rp, kp, sp,
    pages_total: s.pages_total, pages_max: s.pages_max || 1, refs_total: s.refs_total, refs_sum: s.refs_sum || 1,
    searches_total: s.searches_total, keywords_total: s.keywords_total, keywords_max: s.keywords_max || 1,
    days: days.results,
    pages: pages.results.map((p) => ({ ...p, name: nameOf(p.path) })),
    refs: refs.results,
    engines: engines.results,
    keywords: keywords.results,
    searches: searches.results.map((r) => ({ ...r, name: nameOf(r.path) })),
  });
}
