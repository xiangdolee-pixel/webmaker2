// js/globe.js 만들기: js/globe.src.js 의 __DATA__ 자리에 점 데이터(images/world-dots.svg 에서 뽑아 1도 격자로)를 넣는다
//   실행: node bsf/_dev/globe-build.mjs  (리포 루트에서)
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const svg = fs.readFileSync(path.join(ROOT, 'images', 'world-dots.svg'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const names = ['land', 'cn', 'vn', 'mm', 'bd', 'kr'];
const d = {};
[...svg.matchAll(/<g fill="[^"]+" fill-opacity="[^"]+">(.*?)<\/g>/g)].forEach((g, k) => {
  d[names[k]] = [...g[1].matchAll(/cx="(\d+)" cy="(\d+)"/g)].map((m) => [(+m[1] - 4) / 9, (+m[2] - 4) / 9]);
});
// 거점 = 옛 지도(지금은 globe-pins 주석)에 있던 생산 거점 좌표 [경도, 위도]
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, '_dev', 'globe-pins.json'), 'utf8'));
const all = new Set(Object.values(d).flat().map(([x, y]) => `${x},${y}`));
const out = {};
for (const [k, a] of Object.entries(d)) {
  let s = '';
  const put = (x, y) => { s += x.toString(36).padStart(2, '0') + y.toString(36).padStart(2, '0'); };
  for (const [x, y] of a) {
    put(2 * x, 2 * y);
    const r = all.has(`${x + 1},${y}`); const b = all.has(`${x},${y + 1}`);
    if (r) put(2 * x + 1, 2 * y);
    if (b) put(2 * x, 2 * y + 1);
    if (r && b && all.has(`${x + 1},${y + 1}`)) put(2 * x + 1, 2 * y + 1);
  }
  out[k] = s;
}
const src = fs.readFileSync(path.join(ROOT, '_dev', 'globe.src.js'), 'utf8');
fs.writeFileSync(path.join(ROOT, 'js', 'globe.js'), src.replace('__DATA__', JSON.stringify({ d: out, pins })));
console.log('js/globe.js', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length / 4])), html.length > 0);
