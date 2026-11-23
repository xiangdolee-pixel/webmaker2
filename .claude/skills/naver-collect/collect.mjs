// 네이버 블로그 · 플레이스 자료를 한 번에 모은다 (새 고객 사이트 만들기 전 자료 수집)
//   node collect.mjs <나갈 폴더> [--blog <블로그 아이디|주소>] [--place <플레이스 번호|지도 주소>] [--max 300] [--noimg]
// 결과: <폴더>/CONTENT.md(읽을 것은 이것 하나) · raw/(원본) · img/blog · img/place · (sheet.py 로) out/sheet*.jpg
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2); const OUT = args[0];
const opt = (k) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
if (!OUT) { console.log('쓰기: node collect.mjs <폴더> --blog <아이디> --place <번호>'); process.exit(1); }
const blogId = (opt('blog') || '').replace(/^https?:\/\/(m\.)?blog\.naver\.com\//, '').split(/[/?#]/)[0];
const placeId = ((opt('place') || '').match(/place\/(\d+)/) || (opt('place') || '').match(/^(\d+)$/) || [])[1];
const MAX = Number(opt('max') || 300), NOIMG = args.includes('--noimg');
for (const d of ['raw/posts', 'img/blog', 'img/place', 'out']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const P = (...a) => path.join(OUT, ...a);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x3D;/g, '=');
const JUNK = /^(URL 복사|이웃추가|본문 기타 기능|신고하기|공유하기|AI 활용 설정|사진 설명을 입력하세요\.?|이 블로그의 체크인|이 장소의 다른 글|se-main-container">)$/;
const clean = (h) => ent(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<\/t[dh]>/g, ' | ').replace(/<\/tr>/g, '\n').replace(/<(p|div|br|li|h\d|tr)[^>]*>/g, '\n').replace(/<[^>]+>/g, ''))
  .replace(/​/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter((l) => l && !JUNK.test(l)).join('\n')
  .replace(/(\n\|)+/g, ' |').replace(/\| \|/g, '|');
let md = `# 모은 자료 (${new Date().toISOString().slice(0, 10)})\n\n`;

// ───── 플레이스
if (placeId) {
  const H = { 'User-Agent': UA, Referer: 'https://m.place.naver.com/' };
  const home = await (await fetch(`https://m.place.naver.com/place/${placeId}/home`, { headers: H })).text();
  const photo = await (await fetch(`https://m.place.naver.com/place/${placeId}/photo`, { headers: H })).text().catch(() => '');
  const m = home.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*\n?\s*window\./);
  if (!m) { md += `## 네이버 플레이스 ${placeId}\n\n(정보를 못 읽음 — 화면 구조가 바뀌었을 수 있다. raw/place-home.html 확인)\n\n`; fs.writeFileSync(P('raw/place-home.html'), home); }
  else {
    fs.writeFileSync(P('raw/apollo.json'), m[1]); const j = JSON.parse(m[1]); const b = j[`PlaceDetailBase:${placeId}`] || {};
    const root = Object.entries(j.ROOT_QUERY || {}).find(([k]) => k.startsWith('placeDetail('))?.[1] || {};
    const desc = (m[1].match(/"description":"((?:[^"\\]|\\.){30,})"/) || [])[1];
    const hours = (root.newBusinessHours || []).flatMap((x) => (x.businessHours || []).map((d) => `${d.day} ${d.businessHours ? d.businessHours.start + '–' + d.businessHours.end : '쉼'}${d.breakHours?.length ? ' (쉬는 시간 ' + d.breakHours.map((t) => t.start + '–' + t.end).join(', ') + ')' : ''}${d.description ? ' ' + d.description : ''}`));
    const phone = (root['buttons({})'] || []).find((x) => x.key === 'phone')?.value || b.phone || b.virtualPhone;
    const nb = root.naverBooking || {};
    const menus = Object.entries(j).filter(([k]) => /^Menu:/.test(k)).map(([, v]) => `${v.name} ${v.price || ''} ${v.description || ''}`.trim());
    const rev = j[`VisitorReviewStatsResult:${placeId}`];
    const kw = (rev?.analysis?.votedKeyword?.details || []).slice(0, 8).map((x) => `${x.displayName}(${x.count})`);
    md += `## 네이버 플레이스 ${placeId}\n\n- 이름: ${b.name}\n- 분류: ${b.category}\n- 도로명: ${b.roadAddress}\n- 지번: ${b.address}\n- 전화: ${phone || '없음'}\n- 좌표: ${b.coordinate?.y}, ${b.coordinate?.x}\n- 찾아오는 길: ${(b.road || '').replace(/\n/g, ' / ')}\n- 편의: ${(b.conveniences || []).join(', ')}\n- 결제: ${(b.paymentInfo || []).join(', ')}\n- 운영 시간: ${hours.join(' · ') || '없음'}\n- 네이버 예약: ${nb.naverBookingUrl || '없음'}\n- 홈페이지: ${root.shopWindow?.homepages?.repr?.url || ''} ${(root.shopWindow?.homepages?.etc || []).map((x) => x.url).join(' ')}\n- 방문자 리뷰 ${b.visitorReviewsTotal ?? 0} · 블로그 리뷰 ${b.cafeBlogReviewsTotal ?? 0}${kw.length ? '\n- 리뷰 키워드: ' + kw.join(', ') : ''}\n${menus.length ? '- 메뉴 · 가격:\n' + menus.map((x) => '  - ' + x).join('\n') + '\n' : ''}\n소개글:\n${desc ? JSON.parse('"' + desc + '"') : '(없음)'}\n\n`;
    // 업체가 올린 사진만(ldb-phinf · naverbooking-phinf). 방문자 리뷰 사진은 남의 것이라 받지 않는다
    const u = new Set(); for (const s of (m[1] + photo).matchAll(/https:[^"\\ ]*(?:ldb-phinf|naverbooking-phinf)[^"\\ ]+/g)) { const x = decodeURIComponent(s[0]).replace(/\\u002F/g, '/').replace(/^.*src=/, '').split('?')[0]; if (!/u002/.test(x)) u.add(x); }
    let i = 0; if (!NOIMG) for (const x of u) { i++; try { const r = await fetch(x, { headers: H }); fs.writeFileSync(P(`img/place/p${String(i).padStart(2, '0')}.jpg`), Buffer.from(await r.arrayBuffer())); } catch { console.log('사진 실패', x); } }
    md += `업체 사진 ${u.size}장 → img/place/\n\n`; console.log('플레이스', b.name, '· 사진', u.size);
  }
}

// ───── 블로그
if (blogId) {
  const H = { Referer: `https://m.blog.naver.com/${blogId}`, 'User-Agent': UA };
  const all = [];
  for (let p = 1; all.length < MAX; p++) {
    const j = await (await fetch(`https://m.blog.naver.com/api/blogs/${blogId}/post-list?categoryNo=0&itemCount=30&page=${p}`, { headers: H })).json().catch(() => null);
    const items = j?.result?.items || []; if (!items.length) break;
    for (const it of items) all.push({ no: it.logNo, title: it.titleWithInspectMessage, cat: it.categoryName, date: new Date(it.addDate).toISOString().slice(0, 10) });
  }
  all.length = Math.min(all.length, MAX);
  fs.writeFileSync(P('raw/blog-list.json'), JSON.stringify(all, null, 1));
  const cats = {}; for (const a of all) cats[a.cat] = (cats[a.cat] || 0) + 1;
  md += `## 블로그 ${blogId} — 글 ${all.length}개\n\n분류: ${Object.entries(cats).map(([k, v]) => `${k}(${v})`).join(' · ')}\n\n`;
  let nimg = 0;
  for (const a of all) {
    const html = await (await fetch(`https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${a.no}`, { headers: H })).text();
    let s = html.indexOf('se-main-container'); if (s < 0) s = html.indexOf('id="viewTypeSelector"'); if (s < 0) s = html.indexOf('post_ct');
    const e = html.indexOf('post_footer', s); const seg = html.slice(Math.max(s, 0), e > 0 ? e : undefined);
    let body = clean(seg).replace(/^[^\n]*">\n?/, '');
    const tags = body.match(/(#[^\s#]+\s*){3,}$/); if (tags) body = body.slice(0, tags.index).trim();
    const seen = new Set(), files = [];
    for (const m of seg.matchAll(/(?:data-lazy-src|src)="(https:\/\/(?:postfiles|blogfiles|mblogthumb-phinf)[^"]+)"/g)) {
      const base = ent(m[1]).replace(/\?type=.*$/, ''); const key = base.split('/').pop(); if (seen.has(key)) continue; seen.add(key);
      const ext = (key.match(/\.(png|jpe?g|gif)$/i) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg'); const f = `img/blog/${a.date}_${a.no}_${String(seen.size).padStart(2, '0')}.${ext}`; files.push(f);
      if (NOIMG || fs.existsSync(P(f))) continue;
      for (const t of ['?type=w3840', '?type=w2']) { try { const r = await fetch(base.replace('mblogthumb-phinf.pstatic.net', 'postfiles.pstatic.net') + t, { headers: H }); if (r.ok) { fs.writeFileSync(P(f), Buffer.from(await r.arrayBuffer())); nimg++; break; } } catch {} }
    }
    fs.writeFileSync(P(`raw/posts/${a.date}_${a.no}.txt`), `${a.title}\n[${a.cat}] ${a.date}\n\n${body}\n\n[사진]\n${files.join('\n')}`);
    md += `### ${a.date} [${a.cat}] ${a.title}\n(글 ${a.no} · 사진 ${files.length}장${files.length ? ' ' + files[0].replace(/_01\.\w+$/, '_*') : ''})\n\n${body || '(글 없음 — 그림만 있는 글, 사진을 볼 것)'}\n\n`;
    console.log(a.date, `[${a.cat}]`, a.title.slice(0, 50), '|', body.length, '자 · 사진', files.length);
  }
  const info = await (await fetch(`https://m.blog.naver.com/api/blogs/${blogId}`, { headers: H })).json().catch(() => null);
  fs.writeFileSync(P('raw/blog-info.json'), JSON.stringify(info, null, 1));
  console.log('블로그 글', all.length, '· 새로 받은 사진', nimg);
}
fs.writeFileSync(P('CONTENT.md'), md);
console.log(`\n${P('CONTENT.md')} ${(md.length / 1000).toFixed(1)}천 자`);
