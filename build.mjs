// 고객 폴더 하나만 Cloudflare Workers(정적 사이트)로 올리기 위한 빌드
//
//   Workers 대시보드 설정
//     Project name   : 폴더 이름과 같게        (예: ganghwa)
//     Build command  : node build.mjs 폴더이름  (예: node build.mjs ganghwa)
//     Deploy command : npx wrangler deploy     (기본값 그대로)
//
//   하는 일: 폴더를 dist/ 로 복사(웹에 안 올릴 파일은 뺌) → 루트에 wrangler.jsonc 생성
//            → 배포 명령이 dist/ 만 올린다
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// deploy.mjs 는 XIM_DEPLOY=1 로 부른다 → .deploy/<폴더> 에 따로 모아 다른 작업(로컬 미리보기의 dist 빌드)과 섞이지 않게 한다
const DEPLOY = process.env.XIM_DEPLOY === '1';
const MAX_FILE = 25 * 1024 * 1024; // Workers 정적 파일 한 개 최대 크기

function fail(msg) {
  console.error(`\n[build] ${msg}\n`);
  process.exit(1);
}

const slug = (process.argv[2] || '').replace(/[\\/]+$/, '');
if (!slug) fail('폴더 이름을 넣어 주세요.  예) node build.mjs ganghwa');
const OUT_REL = DEPLOY ? `.deploy/${slug}` : 'dist';
const OUT = path.join(ROOT, OUT_REL);
if (!/^[\w.-]+$/.test(slug) || slug.startsWith('.') || ['dist', 'node_modules'].includes(slug)) {
  fail(`쓸 수 없는 폴더 이름입니다: ${slug}`);
}
const SRC = path.join(ROOT, slug);
if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) fail(`폴더가 없습니다: ${slug}`);

// 웹에 올리지 않는 것: 숨김 파일 · 작업 메모(.md) · 배포/스크립트 설정 · 원본 문서 · Pages Functions
const SKIP_DIRS = new Set(['node_modules', 'functions', '_src', 'uploads', '_worker', '_dev']); // _dev = 테스트 · 개발 도구(웹에 안 올림)
const SKIP_FILE = /\.(md|ps1|bat|sh|docx?|log)$|^wrangler\.(toml|json|jsonc)$|^package(-lock)?\.json$/i;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
  recursive: true,
  filter: (src) => {
    if (src === SRC) return true;
    const name = path.basename(src);
    if (name.startsWith('.')) return false;
    if (fs.statSync(src).isDirectory()) return !SKIP_DIRS.has(name);
    return !SKIP_FILE.test(name);
  },
});
if (fs.existsSync(path.join(SRC, 'functions'))) {
  console.warn('[build] functions/ (Pages Functions)는 Workers 정적 배포에서 동작하지 않아 뺐습니다.');
}

// 첫 화면: index.html 이 없으면 최상위 html(landing.html 등)을 index.html 로도 둔다
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  const htmls = fs.readdirSync(OUT).filter((f) => /\.html?$/i.test(f));
  const pick = ['landing.html', 'main.html', 'home.html'].find((f) => htmls.includes(f))
    ?? (htmls.length === 1 ? htmls[0] : null);
  if (!pick) {
    fail(htmls.length
      ? `index.html 이 없고 첫 화면을 고를 수 없습니다(${htmls.join(', ')}). index.html 을 만들어 주세요.`
      : `${slug} 에 html 파일이 없습니다. 정적(html) 사이트만 올릴 수 있어요.`);
  }
  fs.copyFileSync(path.join(OUT, pick), path.join(OUT, 'index.html'));
  console.log(`[build] index.html 이 없어 ${pick} 를 첫 화면으로 씁니다.`);
}

// (선택) 파일 지문: html 안의 "파일?v=__HASH__" 를 그 파일 내용의 지문으로 바꾼다.
//   파일이 바뀌면 주소가 바뀌어, 브라우저가 오래 보관해도 새 버전을 바로 받는다. 표시가 없는 사이트는 그대로.
{
  const hashOf = (rel) => {
    const f = path.join(OUT, rel.replace(/^\//, ''));
    return fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10) : null;
  };
  for (const name of fs.readdirSync(OUT).filter((f) => /\.html?$/i.test(f))) {
    const file = path.join(OUT, name);
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('?v=__HASH__')) continue;
    let n = 0;
    const out = html.replace(/(["'])([^"']+?)\?v=__HASH__\1/g, (m, q, rel) => {
      const h = hashOf(rel);
      if (!h) return m;
      n += 1;
      return `${q}${rel}?v=${h}${q}`;
    });
    fs.writeFileSync(file, out);
    console.log(`[build] ${name}: 파일 지문 ${n}개`);
  }
}

// 올릴 파일 집계 · 너무 큰 파일 확인
let count = 0;
let bytes = 0;
const tooBig = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const size = fs.statSync(full).size;
    count += 1;
    bytes += size;
    if (size > MAX_FILE) tooBig.push(path.relative(OUT, full));
  }
})(OUT);
if (tooBig.length) fail(`25MB 가 넘는 파일은 올릴 수 없습니다: ${tooBig.join(', ')}`);

// Worker 이름: 영문 소문자 · 숫자 · 하이픈만. 대시보드 Project name 과 같아야 한다
const name = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
// WebMaker2 는 반드시 xiangdolee@gmail.com 계정(f225…)으로만 올린다 — design 리포의 다른 계정(7ce9…) 아님
const config = {
  name,
  account_id: 'f225d506d8cf6ddf97704a36c69f5ce7',
  compatibility_date: '2026-10-01',
  assets: {
    directory: `./${OUT_REL}`,
    ...(fs.existsSync(path.join(OUT, '404.html')) && { not_found_handling: '404-page' }),
  },
};
// ── xim · xms 자동 연결 (사용자 지시 2026-11-03: 디자인해서 올리기만 하면 xim 등록 · 메뉴 · 로그인이 붙어야 한다) ──
//   대상: xim · xms 자신, 자기 Worker(_worker/index.js)가 있는 폴더, .xim-off 파일이 있는 폴더를 뺀 모든 사이트.
//   자기 Worker 가 있어도 _worker/bindings.json 에 "xim": true 면 연결한다(예: xip) — 그 Worker 가 /api 등 자기 일 말고는
//   공통 사이트 Worker 에 넘긴다: import site from '../../xim/_worker/site-worker.js' → site.fetch(request, env, ctx)
//   ① 공통 사이트 Worker(xim/_worker/site-worker.js)를 main 으로: 정지 확인 · /admin · /member · /board · 계정 버튼 · 메뉴 바꿔 끼우기
//   ② dist 의 html(원본은 그대로)에서 헤더 첫 <nav> 에 data-xms-menu, 그 안 링크에 data-xms-item(버튼 모양 cta/btn 빼고),
//      nav 바로 뒤에 계정 버튼 자리 <span data-xms-account> 를 넣는다 — 이미 표시가 있으면 손대지 않는다.
//   ③ .xim-connect.json(리포 밖으로 안 나감, .gitignore)에 사이트 이름 · 첫 화면 메뉴를 적어 두면 deploy.mjs 가 xim 등록 · xms 메뉴 가져오기를 한다.
const CONNECT_FILE = path.join(ROOT, DEPLOY ? `.deploy/${slug}.xim-connect.json` : '.xim-connect.json');
const OWN_WORKER = fs.existsSync(path.join(SRC, '_worker', 'index.js'));
const OWN_BINDINGS = path.join(SRC, '_worker', 'bindings.json');
const OWN_XIM = OWN_WORKER && fs.existsSync(OWN_BINDINGS) && JSON.parse(fs.readFileSync(OWN_BINDINGS, 'utf8')).xim === true;
const CONNECT = !['xim', 'xms'].includes(slug) && (!OWN_WORKER || OWN_XIM) && !fs.existsSync(path.join(SRC, '.xim-off'));
fs.rmSync(CONNECT_FILE, { force: true });

function markHtml(html) {
  let out = html;
  if (!/data-xms-menu/.test(out)) {
    const h = out.search(/<header[\s>]/i);
    const hEnd = h >= 0 ? out.indexOf('</header>', h) : -1;
    const rel = hEnd > h ? out.slice(h, hEnd).search(/<nav[\s>]/i) : -1;
    if (rel >= 0) {
      const ns = h + rel;
      const tagEnd = out.indexOf('>', ns);
      const ne = out.indexOf('</nav>', tagEnd);
      if (ne > tagEnd) {
        const inner = out.slice(tagEnd + 1, ne).replace(/<a\b([^>]*)>/gi, (m, attrs) =>
          (/data-xms-item|class\s*=\s*["'][^"']*\b(cta|btn|button)/i.test(attrs) ? m : `<a${attrs} data-xms-item>`));
        out = `${out.slice(0, tagEnd)} data-xms-menu>${inner}${out.slice(ne)}`;
      }
    }
  }
  if (!/data-xms-account/.test(out)) {
    const m = out.match(/<nav\b[^>]*data-xms-menu[\s\S]*?<\/nav>/i);
    if (m) out = out.replace(m[0], `${m[0]}\n<span class="xms-account" data-xms-account></span>`);
  }
  return out;
}
const textOf = (h) => h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function menusFrom(html) {
  const nav = (html.match(/<nav\b[^>]*data-xms-menu[^>]*>([\s\S]*?)<\/nav>/i) || [])[1] || '';
  const out = [];
  for (const m of nav.matchAll(/<a\b([^>]*\bdata-xms-item\b[^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = ((m[1].match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1] || '').trim();
    const title = textOf(m[2]).slice(0, 40);
    if (!title) continue;
    if (/^https?:\/\//i.test(href)) { out.push({ title, type: 'LINK', path: href }); continue; }
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let p = href.replace(/^\.\//, '');
    p = p.replace(/^index\.html?(?=#|$)/i, '');
    if (!p) p = '/';
    else if (p.startsWith('#')) p = `/${p}`;
    else if (!p.startsWith('/')) p = `/${p}`;
    out.push({ title, type: 'PAGE', path: p });
  }
  return out;
}

// 사이트가 원래 쓰는 파비콘 주소 (xim 사이트 카드에 보인다 — xms 에서 파비콘을 올리면 그것이 먼저)
//   32px png → 그 밖의 icon → apple-touch-icon → 폴더의 favicon.ico 순서. 사이트 기준 절대 경로(/…)로.
function faviconFrom(html) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    const attr = (n) => (tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
    return { rel: attr('rel').toLowerCase(), href: attr('href').trim(), sizes: attr('sizes') };
  }).filter((l) => l.href && /(^|\s)(icon|apple-touch-icon)(\s|$)/.test(l.rel) && !/^(data:|https?:|\/\/)/i.test(l.href));
  const pick = links.find((l) => /(^|\s)icon(\s|$)/.test(l.rel) && l.sizes === '32x32')
    || links.find((l) => /(^|\s)icon(\s|$)/.test(l.rel) && !/\.ico(\?|$)/i.test(l.href))
    || links.find((l) => /(^|\s)icon(\s|$)/.test(l.rel))
    || links.find((l) => l.rel.includes('apple-touch-icon'));
  if (pick) return `/${pick.href.replace(/^\.?\//, '')}`.slice(0, 200);
  return fs.existsSync(path.join(OUT, 'favicon.ico')) ? '/favicon.ico' : '';
}

// xms 파비콘(32 · 180 · 192 · 512)으로 처음 한 번 가져올 사이트 아이콘 PNG (사용자 지시 2026-11-04: "처음에 가져와야지")
//   후보: html 의 icon · apple-touch-icon, manifest 의 icons, 폴더 안 이름에 favicon · icon · apple-touch 가 든 PNG (maskable 빼고)
//   PNG 머리(IHDR)에서 실제 폭 · 높이를 읽어 정사각형만, 크기마다 그보다 크거나 같은 것 중 가장 작은 것(없으면 가장 큰 것)
//   SVG · ICO 만 있으면 가져오지 않는다 (xms 는 PNG 로 둔다 — 그때는 xms 파비콘 화면에서 올린다)
const FAV_SIZES = [32, 180, 192, 512];
function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  } catch { return null; }
}
function siteIcons(html) {
  const cand = new Set();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = ((tag.match(/\brel\s*=\s*["']([^"']*)["']/i) || [])[1] || '').toLowerCase();
    const href = ((tag.match(/\bhref\s*=\s*["']([^"']*)["']/i) || [])[1] || '').trim();
    if (/(^|\s)(icon|apple-touch-icon)(\s|$)/.test(rel) && href && !/^(data:|https?:|\/\/)/i.test(href)) cand.add(href.replace(/^\.?\//, '').split(/[?#]/)[0]);
  }
  try {
    const mf = (html.match(/<link\b[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i) || [])[1];
    if (mf && !/^(https?:|\/\/)/i.test(mf)) {
      const j = JSON.parse(fs.readFileSync(path.join(OUT, mf.replace(/^\.?\//, '')), 'utf8'));
      for (const i of j.icons || []) if (i.src && !/maskable/.test(i.purpose || '') && !/^(https?:|\/\/)/i.test(i.src)) cand.add(i.src.replace(/^\.?\//, ''));
    }
  } catch { /* manifest 없음 */ }
  (function walk(dir, depth) {
    if (depth > 2) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/(favicon|icon|apple-touch)[^/]*\.png$/i.test(e.name) && !/maskable/i.test(e.name)) cand.add(path.relative(OUT, full).split(path.sep).join('/'));
    }
  })(OUT, 0);
  const list = [...cand].map((rel) => ({ rel, ...(pngSize(path.join(OUT, rel)) || {}) }))
    .filter((x) => x.w && x.w === x.h && x.bytes <= 70000); // 정사각형 · D1 한 줄에 들어가는 크기
  if (!list.length) return [];
  list.sort((x, y) => x.w - y.w);
  return FAV_SIZES.map((n) => {
    const f = list.find((x) => x.w >= n) || list[list.length - 1];
    return { size: n, path: `/${f.rel}`, w: f.w };
  });
}

if (CONNECT) {
  let marked = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.html?$/i.test(entry.name)) continue;
      const before = fs.readFileSync(full, 'utf8');
      const after = markHtml(before);
      if (after !== before) { fs.writeFileSync(full, after); marked++; }
    }
  })(OUT);
  const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const title = textOf((index.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') || slug;
  fs.writeFileSync(CONNECT_FILE, JSON.stringify({ slug: name, name: title.slice(0, 80), static_bytes: bytes, favicon: faviconFrom(index), icons: siteIcons(index), menus: menusFrom(index) }, null, 2));
  config.main = './xim/_worker/site-worker.js';
  config.assets.binding = 'ASSETS';
  // html 만 Worker 를 거치고(계정 버튼 · 메뉴 · 방문 통계 · 정지 화면), 사진 · CSS · JS 같은 정적 파일은 Worker 없이 가장자리에서 바로 준다.
  //   Worker 는 xim · xms DB 가까이(서울)에 두었는데, 국내 접속은 미국 서부 가장자리로 들어와 사진 하나마다 서울을 한 번 더 왕복했다
  //   (bsf 58KB 사진 첫 바이트 1.2~1.9초 — 2026-11-13). html 이 없는 맨 위 폴더와 맨 위의 html 아닌 파일만 뺀다.
  const RESERVED_TOP = new Set(['xms', 'xms-api', 'member', 'board', 'site-api', 'admin', 'cdn-cgi']);
  const hasHtml = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasHtml(path.join(dir, e.name)) : /\.html?$/i.test(e.name)));
  const skip = [];
  for (const e of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_') || RESERVED_TOP.has(e.name)) continue;
    if (e.isDirectory()) { if (!hasHtml(path.join(OUT, e.name))) skip.push(`!/${e.name}/*`); }
    else if (!/\.html?$/i.test(e.name) && !/^(robots\.txt|sitemap\.xml)$/i.test(e.name)) skip.push(`!/${e.name}`);
  }
  config.assets.run_worker_first = skip.length ? ['/*', ...skip] : true;
  // Worker 가 붙이던 캐시 시간(cacheStatic)을 _headers 로 똑같이 — 그림 · 글꼴 하루(+7일 묵은 것 먼저), CSS · JS 5분(+하루)
  if (skip.length) {
    const rule = (p) => (/^!\/(css|js|scripts?|styles?)(\/|$)/i.test(p) || /\.(css|js|mjs)$/i.test(p)
      ? 'public, max-age=300, stale-while-revalidate=86400' : 'public, max-age=86400, stale-while-revalidate=604800');
    const hf = path.join(OUT, '_headers');
    const prev = fs.existsSync(hf) ? fs.readFileSync(hf, 'utf8').trimEnd() + '\n\n' : '';
    fs.writeFileSync(hf, prev + skip.map((p) => `${p.slice(1)}\n  Cache-Control: ${rule(p)}`).join('\n') + '\n');
  }
  if (skip.length) console.log(`[build] Worker 를 거치지 않는 정적 파일: ${skip.join(' ')}`);
  // 게시판 · 회원 화면을 끼워 넣을 틀: 사이트의 기존 페이지 하나(머리 · 꼬리 · CSS 그대로, <main> 자리에만 게시판).
  //   _layout.html 이 있으면 그것, 없으면 <main> 이 있는 첫 하위 페이지(index 말고), 그것도 없으면 첫 화면.
  const htmls = fs.readdirSync(OUT).filter((f) => /\.html?$/i.test(f) && f !== '404.html').sort();
  const hasMain = (f) => /<main[\s>]/i.test(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const shellFile = htmls.find((f) => f === '_layout.html')
    || htmls.find((f) => !/^index\.html?$/i.test(f) && hasMain(f))
    || 'index.html';
  const shell = /^index\.html?$/i.test(shellFile) ? '/' : `/${shellFile.replace(/\.html?$/i, '')}`;
  config.vars = { XIM_SITE: name, XIM_SHELL: shell };
  // 옛 주소 영구 이동: 폴더의 .xim-redirect (한 줄에 "옛호스트 새호스트", 웹에 안 올라감) → 공통 사이트 Worker 가 301
  const redirectFile = path.join(SRC, '.xim-redirect');
  if (fs.existsSync(redirectFile)) {
    const map = {};
    for (const line of fs.readFileSync(redirectFile, 'utf8').split(/\r?\n/)) {
      const [from, to] = line.replace(/#.*/, '').trim().split(/\s+/);
      if (from && to && /^[a-z0-9.-]+$/i.test(from) && /^[a-z0-9.-]+$/i.test(to)) map[from.toLowerCase()] = to.toLowerCase();
    }
    if (Object.keys(map).length) {
      config.vars.XIM_REDIRECT = JSON.stringify(map);
      console.log(`[build] 주소 이동: ${Object.entries(map).map(([a, b]) => `${a} → ${b}`).join(', ')}`);
    }
  }
  config.services = [
    { binding: 'XIM', service: 'xim', entrypoint: 'Engine' },
    { binding: 'XMS', service: 'xms', entrypoint: 'Cms' },
  ];
  // 사이트 Worker 를 xim · xms DB(D1, APAC) 가까이에서 돌린다. 국내 통신사가 무료 요금제 사이트를 LAX 로 보내면
  //   LAX 의 Worker 가 DB 를 읽을 때마다 태평양을 왕복했다. xms 는 서비스 바인딩으로 불려 부른 쪽 자리에서 돌기 때문에
  //   (xms 자신의 placement 는 이 길에 안 먹음) 사이트 Worker 쪽을 옮긴다. bindings.json 의 placement 가 있으면 그것.
  //   2026-11-05 sjccc 게시판으로 재 봄 (xms 안 시간): LAX 450ms · 싱가포르 300 · 도쿄 120 · 서울(ap-northeast-2) 25ms → 서울.
  config.placement = { region: 'aws:ap-northeast-2' };
  console.log(`[build] xim · xms 자동 연결: 공통 사이트 Worker + 로그인 버튼 · 메뉴 표시${marked ? ` (html ${marked}개에 표시를 넣음)` : ''}`);
}

// 폴더에 _worker/index.js 가 있으면 정적 파일 + 그 Worker(/api 등)를 같이 올린다 (이런 폴더는 xim 자동 연결에서 빠진다).
//   _worker/ 는 웹에 공개하지 않고(위 SKIP_DIRS), _worker/bindings.json 의 D1 · KV 연결을 그대로 붙인다.
const WORKER = path.join(SRC, '_worker', 'index.js');
if ((!CONNECT || OWN_XIM) && fs.existsSync(WORKER)) {
  config.main = `./${slug}/_worker/index.js`;
  config.assets.binding = 'ASSETS';
  const extra = path.join(SRC, '_worker', 'bindings.json');
  if (fs.existsSync(extra)) {
    const b = JSON.parse(fs.readFileSync(extra, 'utf8'));
    delete b.xim;
    // xim 연결 값(vars · services)과 합친다
    if (b.vars) { config.vars = { ...config.vars, ...b.vars }; delete b.vars; }
    if (b.services) { config.services = [...(config.services || []), ...b.services]; delete b.services; }
    // assets 설정(run_worker_first 등)은 덮어쓰지 않고 합친다
    if (b.assets) { Object.assign(config.assets, b.assets); delete b.assets; }
    Object.assign(config, b);
    // xim 연결 사이트: 'Worker 를 거치지 않는' 예외(!패턴)가 xms 주소까지 잡으면 파비콘 · 로그인 등이 404 가 된다
    //   (예: "!/*.png" 의 * 는 / 도 넘어가 /xms/file/favicon-32.png 까지 잡았다 — 2026-11-04 슈가브레이크 파비콘이 xim 에 안 보임)
    if (OWN_XIM) {
      const glob = (g) => new RegExp('^' + g.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      const probes = ['/xms/file/favicon-32.png', '/xms/js/account.js', '/xms/css/account.css', '/member/login', '/board/x', '/xms-api/me'];
      for (const pat of config.assets.run_worker_first || []) {
        if (!String(pat).startsWith('!')) continue;
        const hit = probes.find((u) => glob(String(pat).slice(1)).test(u));
        if (hit) { console.error(`[build] run_worker_first 의 "${pat}" 이 xms 주소 ${hit} 까지 Worker 를 건너뛰게 합니다 — 파일 이름으로 좁혀 주세요.`); process.exit(1); }
      }
    }
  }
  console.log(`[build] ${slug}/_worker/index.js 를 Worker 로 함께 올립니다.`);
}
// 가장자리 + 본체로 나누기 (2026-11-14 "0.1초라도"): 본체(<이름>-core, 서울 placement, 공개 주소 없음) 앞에 가장자리 Worker(<이름>, placement 없음)를 둔다.
//   사용자 도메인은 지금처럼 <이름> 에 붙어 있다. 정적 파일 규칙(run_worker_first · _headers)은 둘 다 같음. site-edge.js 참고
//   자기 Worker 가 있는 사이트(OWN_XIM: roadbible · xip …)도 같게 (2026-11-15 "앞으로 내가 만드는 모든 사이트들은 이런 구조로").
//   단 Durable Object(회원별 저장 등)는 옮기면 자료가 새 칸으로 갈라지므로 지금 Worker(<이름>)에 그대로 두고,
//   가장자리 Worker 가 그 클래스를 내보내며, 본체는 script_name 으로 그것을 부른다.
if (CONNECT && DEPLOY) {
  const core = { ...config, name: `${name}-core`, workers_dev: false, preview_urls: false };
  delete core.routes;
  const doClasses = (config.durable_objects?.bindings || []).filter((b) => !b.script_name).map((b) => b.class_name);
  if (doClasses.length) {
    delete core.migrations;
    core.durable_objects = { bindings: config.durable_objects.bindings.map((b) => (b.script_name ? b : { ...b, script_name: name })) };
  }
  fs.writeFileSync(path.join(ROOT, `.deploy-${slug}.core.wrangler.jsonc`), `// node build.mjs ${slug} 가 만든 파일입니다. 직접 고치지 마세요.
${JSON.stringify(core, null, 2)}
`);
  config.main = './xim/_worker/site-edge.js';
  if (doClasses.length) {
    // 가장자리 = site-edge + 이 사이트 Durable Object 클래스 (main 은 설정 파일 기준 경로)
    const edgeFile = path.join(ROOT, '.deploy', `${slug}.edge.js`);
    fs.mkdirSync(path.dirname(edgeFile), { recursive: true });
    fs.writeFileSync(edgeFile, `// node build.mjs ${slug} 가 만든 파일입니다. 직접 고치지 마세요.
export { default } from '../xim/_worker/site-edge.js';
export { ${doClasses.join(', ')} } from '../${slug}/_worker/index.js';
`);
    config.main = `./.deploy/${slug}.edge.js`;
  }
  config.version_metadata = { binding: 'VER' };   // 배포하면 캐시 열쇠가 바뀐다
  config.placement = { mode: 'off' };   // 지우기만 하면 전 배포의 서울 placement 가 남는다
  config.services = [...(config.services || []), { binding: 'CORE', service: `${name}-core` }];
  console.log(`[build] 가장자리 Worker ${name} + 본체 ${name}-core`);
} else if (DEPLOY) {
  try { fs.unlinkSync(path.join(ROOT, `.deploy-${slug}.core.wrangler.jsonc`)); } catch { /* 없음 */ }
}
fs.writeFileSync(
  path.join(ROOT, DEPLOY ? `.deploy-${slug}.wrangler.jsonc` : 'wrangler.jsonc'),
  `// node build.mjs ${slug} 가 만든 파일입니다. 직접 고치지 마세요.\n${JSON.stringify(config, null, 2)}\n`,
);

console.log(`[build] ${slug} → ${OUT_REL}/  파일 ${count}개, ${(bytes / 1024 / 1024).toFixed(1)}MB`);
console.log(`[build] Worker 이름: ${name}  (대시보드 Project name 과 같아야 합니다)`);
