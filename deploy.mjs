// WebMaker2 폴더 하나를 xiangdolee@gmail.com 계정 Cloudflare Workers 로 올린다.
//
//   node deploy.mjs <폴더>     빌드(build.mjs) + 배포
//   node deploy.mjs --login    xiangdolee 계정으로 wrangler 로그인(최초 1회, 브라우저에서 승인)
//   node deploy.mjs --whoami   지금 로그인된 계정 확인
//   node deploy.mjs --wrangler <명령…>   xiangdolee 계정으로 wrangler 명령 실행(D1 · secret 등)
//
// design 리포가 쓰는 다른 계정(7ce9…) 로그인과 섞이지 않도록
// wrangler 로그인 정보를 사용자 폴더의 .wrangler-xiangdolee 에 따로 둔다(리포 밖 — 공개 리포라 절대 안에 두지 않음).
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, domainToUnicode } from 'node:url';
import { ensureMailDomain } from './mail-domain.mjs';
import { syncStatic, staticSql } from './r2-static.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_ID = 'f225d506d8cf6ddf97704a36c69f5ce7';
const AUTH_HOME = path.join(os.homedir(), '.wrangler-xiangdolee');
fs.mkdirSync(AUTH_HOME, { recursive: true });

// GitHub Actions(xim "GitHub에서 연결")에서는 저장소 비밀값 CLOUDFLARE_API_TOKEN 으로, 이 PC 에서는 xiangdolee 전용 로그인으로.
const CI_TOKEN = process.env.GITHUB_ACTIONS === 'true' && process.env.CLOUDFLARE_API_TOKEN;
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
if (!CI_TOKEN) {
  env.XDG_CONFIG_HOME = AUTH_HOME;
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CF_API_TOKEN;
}

function run(cmd, args, extra = {}) {
  const r = spawnSync([cmd, ...args].join(' '), { cwd: ROOT, env: { ...env, ...extra }, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const arg = process.argv[2];
if (!arg) {
  console.error('사용법: node deploy.mjs <폴더> | --login | --whoami | --wrangler <명령…>');
  process.exit(1);
}
if (arg === '--login') run('npx', ['wrangler', 'login']);
else if (arg === '--whoami') run('npx', ['wrangler', 'whoami']);
else if (arg === '--wrangler') run('npx', ['wrangler', ...process.argv.slice(3)]); // 예) node deploy.mjs --wrangler d1 list
else if (arg === '--mail-token') run('npx', ['wrangler', 'secret', 'put', 'CF_MAIL_TOKEN', '--name', 'xim']); // 대표 도메인 메일 등록용 토큰을 xim 에 (붙여넣기만)
else if (arg === '--mail') await mailFor(process.argv[3] || '', true); // 예) node deploy.mjs --mail sjccc  (또는 도메인)
else if (arg === '--domain') await fillDomain(process.argv[3] || ''); // 예) node deploy.mjs --domain xip  (Cloudflare 에 붙인 도메인을 xim 에 채움)
else {
  // 배포용은 .deploy/<폴더> 에 따로 빌드한다 — 로컬 미리보기(dist · wrangler.jsonc)를 다른 작업이 동시에 고쳐도 섞이지 않게
  const slug = arg.replace(/[\/]+$/, '');
  run('node', ['build.mjs', slug], { XIM_DEPLOY: '1' });
  registerInXim(slug);
  // xim 사이트면 사진을 R2(서울)에 올리고 xms 지도(site_static)를 바꾼다 — 사이트 Worker 가 html 의 사진 주소를 그리로 바꿔 준다
  const connectFile = path.join(ROOT, `.deploy/${slug}.xim-connect.json`);
  if (fs.existsSync(connectFile)) {
    const site = JSON.parse(fs.readFileSync(connectFile, 'utf8')).slug;
    const list = await syncStatic(site, path.join(ROOT, '.deploy', slug), AUTH_HOME);
    if (list) {
      const f = path.join(AUTH_HOME, `site-static-${site}.sql`);
      fs.writeFileSync(f, staticSql(site, list));
      run('npx', ['wrangler', 'd1', 'execute', 'xms', '--remote', '--file', `"${f}"`, '-y']);
    }
  }
  // 본체(<이름>-core)가 있으면 먼저 — 가장자리 Worker 가 서비스 바인딩으로 부른다
  if (fs.existsSync(path.join(ROOT, `.deploy-${slug}.core.wrangler.jsonc`))) run('npx', ['wrangler', 'deploy', '--config', `.deploy-${slug}.core.wrangler.jsonc`]);
  run('npx', ['wrangler', 'deploy', '--config', `.deploy-${slug}.wrangler.jsonc`]);
  if (fs.existsSync(path.join(ROOT, `.deploy/${slug}.xim-connect.json`))) await fillDomain(slug);
}

// xim 에 대표 도메인이 비어 있으면, 이 Worker 에 Cloudflare 로 붙여 둔 사용자 도메인(Custom Domain) — 없으면 Worker 경로(route) — 를 채운다.
//   (도메인은 대시보드에서 붙이는 경우가 많아 xim 이 모른다 → 배포할 때마다 확인, 이미 있으면 건드리지 않음)
//   채운 뒤 xim 이 사이트 목록을 열 때 메일 · 봇 확인을 자동 등록한다.
async function fillDomain(folder) {
  const slug = folder.replace(/[\/]+$/, '').toLowerCase().replace(/[_.]/g, '-');
  if (!/^[a-z0-9-]+$/.test(slug)) return;
  const sh = (cmd) => spawnSync(cmd, { cwd: ROOT, env, shell: true, encoding: 'utf8' });
  const rows = (r) => { try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results; } catch { return null; } };
  try {
    const site = rows(sh(`npx wrangler d1 execute xim --remote --json --command "SELECT domain FROM sites WHERE slug = '${slug}'"`))?.[0];
    if (!site) return console.log(`[domain] ${slug}: xim 에 없는 사이트라 건너뜀`);
    if (site.domain) return console.log(`[domain] ${slug}: xim 대표 도메인 ${site.domain} (그대로)`);
    let token = CI_TOKEN || '';
    if (!token) {
      const toml = fs.readFileSync(path.join(AUTH_HOME, '.wrangler', 'config', 'default.toml'), 'utf8');
      token = (toml.match(/^oauth_token\s*=\s*"([^"]+)"/m) || [])[1] || '';
    }
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/domains?service=${slug}`, { headers: { Authorization: `Bearer ${token}` } });
    const out = await r.json();
    if (!out.success) throw new Error((out.errors || []).map((e) => e.message).join(', ') || `HTTP ${r.status}`);
    const hosts = (out.result || []).filter((d) => d.service === slug).map((d) => d.hostname);
    // 사용자 도메인이 없으면 Worker 경로(route, 예: olivebasket.plators.com/*)로 붙인 주소도 본다 (Pages 에서 옮겨 온 사이트 등)
    if (!hosts.length) {
      const zr = await (await fetch(`https://api.cloudflare.com/client/v4/zones?account.id=${ACCOUNT_ID}&per_page=50`, { headers: { Authorization: `Bearer ${token}` } })).json();
      for (const z of zr.result || []) {
        const rr = await (await fetch(`https://api.cloudflare.com/client/v4/zones/${z.id}/workers/routes`, { headers: { Authorization: `Bearer ${token}` } })).json();
        for (const x of rr.result || []) {
          const h = x.script === slug && String(x.pattern).split('/')[0];
          if (h && !h.includes('*')) hosts.push(h);
        }
      }
    }
    if (!hosts.length) return console.log(`[domain] ${slug}: Cloudflare 에 붙인 도메인이 없음 (workers.dev 주소로 운영)`);
    // www 가 아닌 것 중 가장 짧은 것 (예: 나사렛장학회.kr 과 www.… → 앞의 것)
    const host = hosts.sort((a, b) => /^www\./.test(a) - /^www\./.test(b) || a.length - b.length)[0];
    const domain = domainToUnicode(host) || host;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-domain-'));
    const f = path.join(tmp, 'q.sql');
    fs.writeFileSync(f, `UPDATE sites SET domain = '${domain.replace(/'/g, "''")}' WHERE slug = '${slug}' AND domain = '';
`);
    const u = sh(`npx wrangler d1 execute xim --remote --file "${f}" -y`);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (u.status) throw new Error((u.stderr || '').slice(0, 300));
    console.log(`[domain] ${slug}: xim 대표 도메인을 ${domain} 으로 채움 (메일 · 봇 확인은 xim 사이트 목록을 열 때 자동 등록)`);
  } catch (e) {
    console.warn(`[domain] ${slug}: 도메인 확인 실패(배포는 그대로) —`, e.message);
  }
}

// 대표 도메인을 메일 보내는 도메인으로 (회원가입 인증 메일 = noreply@<도메인>). 평소에는 xim 에서 대표 도메인을 저장하면 자동.
async function mailFor(target, loud) {
  let domain = target.includes('.') ? target : '';
  if (!domain && /^[a-z0-9-]+$/i.test(target)) {
    const r = spawnSync(`npx wrangler d1 execute xim --remote --json --command "SELECT domain FROM sites WHERE slug = '${target.toLowerCase()}'"`, { cwd: ROOT, env, shell: true, encoding: 'utf8' });
    try { domain = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results[0]?.domain || ''; } catch { domain = ''; }
  }
  if (!domain) { if (loud) console.log(`[mail] ${target}: 도메인이 없어 건너뜁니다 (xim 에서 도메인을 넣은 뒤 다시)`); return; }
  try { await ensureMailDomain(domain); } catch (e) { console.warn(`[mail] ${domain} 메일 등록 실패(배포는 그대로):`, e.message); }
}

// build.mjs 가 xim 연결 대상이라고 적어 둔 사이트를 xim 에 등록하고(처음 한 번), 헤더 메뉴를 xms 메뉴 목록으로 가져온다(처음 한 번).
// 이미 등록된 사이트 · 이미 가져온 메뉴는 건드리지 않는다. 실패해도 배포는 계속한다(사이트 Worker 는 등록 전에도 정상으로 열린다).
function registerInXim(slug) {
  const file = path.join(ROOT, `.deploy/${slug}.xim-connect.json`);
  if (!fs.existsSync(file)) return;
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const t = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-connect-'));
  const ximSql = path.join(tmp, 'xim.sql');
  fs.writeFileSync(ximSql, `INSERT INTO sites (slug, name, customer_id, domain, status, quota_mb, memo, created_at)
SELECT ${q(c.slug)}, ${q(c.name)}, NULL, '', 'active', 500, '배포할 때 자동 등록', ${t}
WHERE NOT EXISTS (SELECT 1 FROM sites WHERE slug = ${q(c.slug)});
UPDATE sites SET static_mb = ${Math.round((c.static_bytes || 0) / 104857.6) / 10}, site_favicon = ${q(c.favicon || '')} WHERE slug = ${q(c.slug)};\n`);
  const lines = [`CREATE TABLE IF NOT EXISTS site_import (site TEXT PRIMARY KEY, imported_at INTEGER NOT NULL);`];
  if (c.menus.length) {
    const rows = c.menus.map((m, i) => `SELECT ${q(c.slug)} AS site, NULL AS parent_id, ${q(m.title)} AS title, ${q(m.type)} AS menu_type, ${q(m.path)} AS path, NULL AS board_id, ${i + 1} AS sort, 1 AS visible, NULL AS read_levels, 1 AS allow_guest_read`).join('\nUNION ALL ');
    lines.push(`INSERT INTO menus (site, parent_id, title, menu_type, path, board_id, sort, visible, read_levels, allow_guest_read)
SELECT * FROM (${rows})
WHERE NOT EXISTS (SELECT 1 FROM site_import WHERE site = ${q(c.slug)}) AND NOT EXISTS (SELECT 1 FROM menus WHERE site = ${q(c.slug)});`);
  }
  lines.push(`INSERT OR IGNORE INTO site_import (site, imported_at) VALUES (${q(c.slug)}, ${t});`);
  // 파비콘: 사이트 폴더의 아이콘 PNG 를 xms 파비콘(32 · 180 · 192 · 512)으로 — xms 에 하나도 없을 때만, 한꺼번에(32 를 맨 뒤에 넣어 조건이 끝까지 같게)
  const icons = (c.icons || []).slice().sort((x, y) => (x.size === 32) - (y.size === 32));
  for (const ic of icons) {
    try {
      const b64 = fs.readFileSync(path.join(ROOT, `.deploy/${slug}`, ic.path.replace(/^\//, ''))).toString('base64');
      lines.push(`INSERT INTO site_files (site, kind, mime, data, updated_at)
SELECT ${q(c.slug)}, 'favicon-${ic.size}', 'image/png', '${b64}', ${t}
WHERE NOT EXISTS (SELECT 1 FROM site_files WHERE site = ${q(c.slug)} AND kind = 'favicon-32');`);
    } catch (e) { console.warn(`[xim] 아이콘을 읽지 못함 ${ic.path}:`, e.message); }
  }
  const xmsSql = path.join(tmp, 'xms.sql');
  fs.writeFileSync(xmsSql, `${lines.join('\n')}\n`);
  const sh = (cmd) => spawnSync(cmd, { cwd: ROOT, env, shell: true, encoding: 'utf8' });
  const soft = (db, f) => sh(`npx wrangler d1 execute ${db} --remote --file "${f}" -y`);
  // 상태 조회 (slug 는 build.mjs 가 영문 소문자 · 숫자 · 하이픈으로만 만든다)
  const count = (db, sql) => {
    const r = sh(`npx wrangler d1 execute ${db} --remote --json --command "${sql}"`);
    try { return Object.values(JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results[0])[0]; } catch { return null; }
  };
  try {
    if (!/^[a-z0-9-]+$/.test(c.slug)) throw new Error(`사이트 이름이 이상합니다: ${c.slug}`);
    const hadSite = count('xim', `SELECT COUNT(*) AS n FROM sites WHERE slug = '${c.slug}'`);
    const hadMenus = count('xms', `SELECT COUNT(*) AS n FROM menus WHERE site = '${c.slug}'`);
    const a = soft('xim', ximSql);
    const b = soft('xms', xmsSql);
    if (a.status || b.status) throw new Error((a.stderr || b.stderr || '').slice(0, 300));
    const site = hadSite ? '이미 등록돼 있음' : '새로 등록함';
    const menus = hadMenus ? `메뉴 ${hadMenus}개가 이미 있어 건드리지 않음` : (c.menus.length ? `헤더 메뉴 ${c.menus.length}개를 가져옴(처음 한 번만)` : '가져올 헤더 메뉴 없음');
    console.log(`[xim] ${c.slug}: xim ${site} · xms ${menus}`);
  } catch (e) {
    console.warn('[xim] 자동 등록에 실패했습니다(배포는 계속):', e.message);
    if (CI_TOKEN) process.exitCode = 1; // GitHub 에서는 실패로 남겨 xim 화면에 보이게
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
