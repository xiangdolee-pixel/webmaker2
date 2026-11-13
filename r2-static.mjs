// 홈페이지 사진 · 글꼴 · 동영상을 R2(xms-files/static/<사이트>/<내용 hash 12자>/<경로>)에 올린다 (사용자 지시 2026-11-13 "속도가 빨라야 해")
//   국내 통신사는 사이트 주소(Cloudflare 가장자리)를 미국 서부로 보내서 사진 하나에 1~2초씩 걸렸다. R2 S3 주소는 서울(ICN)로 가서 0.2초 안쪽.
//   사이트 Worker 는 html 을 내보낼 때 xms 의 지도(site_static 표 → 서명 주소)로 img · srcset · style url() 을 바꾼다.
//   CSS · JS 는 그대로 사이트에서(CSS 안의 상대 주소가 깨지지 않게).
//   열쇠: 사용자 폴더 .wrangler-xiangdolee/r2.json { "key": …, "secret": … } (리포 밖). 없으면(GitHub Actions 등) 건너뛴다 — 사진은 그냥 사이트에서 나간다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ACCOUNT = 'f225d506d8cf6ddf97704a36c69f5ce7';
const BUCKET = 'xms-files';
const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', woff2: 'font/woff2', woff: 'font/woff', pdf: 'application/pdf' };
const rfc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

function presignPut(cred, key) {
  const host = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const p = `/${BUCKET}/${key.split('/').map(rfc).join('/')}`;
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = t.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${cred.key}/${scope}`, 'X-Amz-Date': t, 'X-Amz-Expires': '900', 'X-Amz-SignedHeaders': 'host' };
  const qs = Object.keys(q).sort().map((k) => `${rfc(k)}=${rfc(q[k])}`).join('&');
  const canonical = ['PUT', p, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', t, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');
  let k = hmac(`AWS4${cred.secret}`, day); k = hmac(k, 'auto'); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
  return `https://${host}${p}?${qs}&X-Amz-Signature=${hmac(k, toSign).toString('hex')}`;
}

// 반환: [{ path:'/images/a.webp', hash }] (올린 것 + 이미 있던 것), 열쇠가 없으면 null
export async function syncStatic(site, outDir, authHome) {
  const credFile = path.join(authHome, 'r2.json');
  if (!fs.existsSync(credFile)) { console.log('[r2] 열쇠(r2.json)가 없어 사진을 R2 에 올리지 않습니다 — 사이트에서 그대로 나갑니다.'); return null; }
  const cred = JSON.parse(fs.readFileSync(credFile, 'utf8'));
  const cacheFile = path.join(authHome, 'r2-static', `${site}.json`);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const done = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};   // "hash/경로" → 1 (이미 올린 것)
  const files = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const full = path.join(dir, e.name), r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(full, r);
      else { const ext = e.name.split('.').pop().toLowerCase(); if (TYPES[ext] && ext !== 'pdf') files.push({ full, path: r, type: TYPES[ext] }); }
    }
  })(outDir, '');
  for (const f of files) f.hash = crypto.createHash('sha1').update(fs.readFileSync(f.full)).digest('hex');
  const todo = files.filter((f) => !done[`${f.hash.slice(0, 12)}${f.path}`]);
  let n = 0, fail = 0;
  const one = async (f) => {
    const key = `static/${site}/${f.hash.slice(0, 12)}${f.path}`;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(presignPut(cred, key), { method: 'PUT', body: fs.readFileSync(f.full), headers: { 'Content-Type': f.type } });
        if (r.ok) { done[`${f.hash.slice(0, 12)}${f.path}`] = 1; n++; return; }
      } catch { /* 다시 */ }
    }
    fail++; f.failed = true;
  };
  for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(one));
  fs.writeFileSync(cacheFile, JSON.stringify(done));
  console.log(`[r2] 사진 ${files.length}개 중 새로 올림 ${n}${fail ? `, 실패 ${fail}` : ''} (나머지는 이미 R2 에 있음)`);
  return files.filter((f) => !f.failed).map((f) => ({ path: f.path, hash: f.hash }));
}

// site_static 표를 이번 파일 목록으로 바꾸는 SQL
export function staticSql(site, list) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const rows = list.map((f) => `(${q(site)}, ${q(f.path)}, ${q(f.hash)})`);
  const out = [`DELETE FROM site_static WHERE site = ${q(site)};`];
  for (let i = 0; i < rows.length; i += 200) out.push(`INSERT INTO site_static (site, path, hash) VALUES ${rows.slice(i, i + 200).join(', ')};`);
  return out.join('\n') + '\n';
}
