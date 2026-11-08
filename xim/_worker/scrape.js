// 포트폴리오2: 주소 다듬기 · 그 페이지의 카톡 미리보기 정보(og 태그) 읽기 — xim Worker 가 쓴다 (node 로도 돌아감)
//   "땡큐유주영.kr" 처럼 한글 주소 · https:// 없이 넣어도 된다 (URL 이 xn-- 꼴로 바꿔 줌)
export function linkUrl(v) {
  let s = String(v ?? '').trim().slice(0, 1000);
  if (!s) return { error: '주소를 넣어 주세요.' };
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u;
  try { u = new URL(s); } catch { return { error: '주소가 올바르지 않습니다.' }; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return { error: '주소가 올바르지 않습니다.' };
  return { ok: true, url: u.href };
}
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hearts: '♥', middot: '·', copy: '©' };
const unEntity = (t) => String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(n); } catch { return all; } }
  return ENTITY[e.toLowerCase()] ?? all;
}).replace(/\s+/g, ' ').trim();
// 카톡이 미리보기를 만드는 것과 같은 순서: og → 일반 meta → <title>
export async function scrapeMeta(url) {
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; xim-portfolio/1.0; +kakaotalk-scrap)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.8' },
    });
  } catch { return { error: '사이트를 열지 못했습니다. 직접 채워 주세요.' }; }
  if (!res.ok) return { error: `사이트가 ${res.status} 로 답했습니다. 직접 채워 주세요.` };
  // 앞부분만 읽는다 (머리 정보는 앞에 있다)
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 600000) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
  reader.cancel().catch(() => {});
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c.subarray(0, size - at), at); at += c.length; }
  const head0 = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const cs = ((res.headers.get('Content-Type') || '').match(/charset=["']?([\w-]+)/i) || head0.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(cs.toLowerCase()).decode(bytes); } catch { html = new TextDecoder().decode(bytes); }
  const meta = {};
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = {};
    for (const a of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attr[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    const key = (attr.property || attr.name || attr.itemprop || '').toLowerCase();
    if (key && attr.content != null && !(key in meta)) meta[key] = unEntity(attr.content);
  }
  const title = unEntity((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const base = res.url || url;
  const abs = (v) => { try { const u = new URL(v, base); if (u.protocol === 'http:') u.protocol = 'https:'; return u.href; } catch { return ''; } };
  const img = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '';
  return {
    url: meta['og:url'] && /^https?:/i.test(meta['og:url']) ? abs(meta['og:url']) : base,
    name: (meta['og:title'] || meta['twitter:title'] || title || meta['og:site_name'] || '').slice(0, 120),
    desc: (meta['og:description'] || meta.description || meta['twitter:description'] || '').slice(0, 300),
    image: img ? abs(img).slice(0, 1000) : '',
  };
}
