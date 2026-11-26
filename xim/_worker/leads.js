// 상담연락 (2026-11-26): 주소(네이버 플레이스 · 홈페이지 · 블로그 · 인스타그램)를 열어 휴대폰 번호를 찾는다 — xim Worker 가 쓴다 (node 로도 돌아감)
//   공개된 페이지를 그대로 읽기만 한다. 로그인 · 봇 확인이 막은 페이지는 읽지 않고 "못 읽음"으로 돌려준다.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 010-1234-5678 · 010.1234.5678 · 010 1234 5678 · 01012345678 → '010-1234-5678' (앞뒤가 숫자면 다른 번호의 일부라 뺀다)
const MOBILE = /(?<![\d-])01([016789])[\s.\-)·]{0,3}(\d{3,4})[\s.\-·]{0,3}(\d{4})(?![\d-])/g;
export function mobiles(text) {
  const out = new Set();
  for (const m of String(text ?? '').replace(/\+82[\s.\-)(]{0,3}0?1(?=[016789])/g, ' 01').matchAll(MOBILE)) {
    if (m[1] === '0' && m[2].length !== 4) continue;   // 010 은 가운데 4자리
    out.add(`01${m[1]}-${m[2]}-${m[3]}`);
  }
  return [...out];
}
export const normPhone = (v) => mobiles(v)[0] || '';

export function linkKind(url) {
  let h = '';
  try { h = new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)blog\.naver\.com$/.test(h)) return 'blog';
  if (/(^|\.)(place\.naver\.com|map\.naver\.com|naver\.me)$/.test(h)) return 'place';
  return 'homepage';
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unEnt = (t) => String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') { const n = /x/i.test(e[1]) ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(n); } catch { return all; } }
  return ENT[e.toLowerCase()] ?? all;
});
// 보이는 글자만: 스크립트 · 스타일을 빼고 태그를 띄어쓰기로. tel: 링크의 번호는 따로 붙인다
function visible(html) {
  const tel = [...html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map((m) => decodeURIComponent(m[1]).replace(/^\+82-?/, '0')).join(' ');
  const text = unEnt(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '));
  return `${text} ${tel}`;
}

async function fetchHtml(url, headers = {}) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.8', ...headers } });
  } catch { return { error: '열지 못함' }; }
  if (!res.ok) return { error: `${res.status} 로 답함` };
  const buf = new Uint8Array(await res.arrayBuffer()).subarray(0, 1500000);
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 4096));
  const cs = ((res.headers.get('Content-Type') || '').match(/charset=["']?([\w-]+)/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(cs.toLowerCase()).decode(buf); } catch { html = new TextDecoder().decode(buf); }
  return { html, url: res.url || url };
}
const titleOf = (html) => unEnt((html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 80);

// 플레이스: 이름 · 분류 · 주소 · 전화 · 소개글 · 홈페이지 링크(홈페이지 · 블로그 · 인스타그램)
async function scanPlace(url) {
  let id = (url.match(/place\/(\d+)/) || url.match(/[?&]id=(\d+)/) || [])[1];
  if (!id && /naver\.me/.test(url)) {
    try { const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA } }); id = ((r.headers.get('Location') || '').match(/place\/(\d+)/) || [])[1]; } catch { /* 아래에서 못 읽음 */ }
  }
  if (!id) return { error: '플레이스 번호를 못 찾음' };
  const placeUrl = `https://m.place.naver.com/place/${id}/home`;
  const r = await fetchHtml(placeUrl, { Referer: 'https://m.place.naver.com/' });
  if (r.error) return { error: `네이버 플레이스 ${r.error}`, placeUrl };
  const m = r.html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*\n?\s*window\./);
  if (!m) return { error: '네이버 플레이스 정보를 못 읽음', placeUrl };
  let j;
  try { j = JSON.parse(m[1]); } catch { return { error: '네이버 플레이스 정보를 못 읽음', placeUrl }; }
  const b = j[`PlaceDetailBase:${id}`] || {};
  const root = Object.entries(j.ROOT_QUERY || {}).find(([k]) => k.startsWith('placeDetail('))?.[1] || {};
  const hp = root.shopWindow?.homepages || {};
  const links = [hp.repr?.url, ...(hp.etc || []).map((x) => x.url)].filter((u) => /^https?:\/\//i.test(u || ''));
  const desc = (m[1].match(/"description":"((?:[^"\\]|\\.){10,})"/) || [])[1] || '';
  return {
    name: b.name || '', category: b.category || '', address: b.roadAddress || b.address || '', placeUrl, links: [...new Set(links)].slice(0, 5),
    phones: mobiles(`${b.phone || ''} ${b.virtualPhone || ''} ${desc.replace(/\\n/g, ' ')} ${b.road || ''}`),
  };
}

async function scanPage(url, kind) {
  let target = url;
  if (kind === 'blog') {
    const id = (url.match(/blog\.naver\.com\/(?:PostList\.naver\?blogId=)?([\w-]+)/) || [])[1];
    if (id && !/^(PostView|PostList)/.test(id)) target = `https://m.blog.naver.com/${id}`;
  }
  const r = await fetchHtml(target);
  if (r.error) return { error: kind === 'instagram' ? `인스타그램 ${r.error}(로그인해야 보이는 계정일 수 있음)` : r.error };
  if (kind === 'instagram' && /\/accounts\/login/.test(r.url)) return { error: '인스타그램이 로그인을 요구함' };
  // 인스타그램 소개글은 meta description 에만 들어 있다
  const meta = [...r.html.matchAll(/<meta[^>]+content=["']([^"']*)["']/gi)].map((x) => unEnt(x[1])).join(' ');
  return { title: titleOf(r.html), phones: mobiles(`${visible(r.html)} ${meta}`) };
}

// 주소 하나 → { url, kind, name, category, address, placeUrl, found: [{ phone, source, sourceUrl }], errors: [] }
export async function scanUrl(url) {
  const kind = linkKind(url);
  const out = { url, kind, name: '', category: '', address: '', placeUrl: '', found: [], errors: [] };
  const add = (phones, source, sourceUrl) => { for (const p of phones || []) if (!out.found.some((f) => f.phone === p)) out.found.push({ phone: p, source, sourceUrl }); };
  if (kind === 'place') {
    const p = await scanPlace(url);
    out.placeUrl = p.placeUrl || '';
    if (p.error) { out.errors.push(p.error); return out; }
    Object.assign(out, { name: p.name, category: p.category, address: p.address });
    add(p.phones, 'place', p.placeUrl);
    // 플레이스에 걸린 홈페이지 · 블로그 · 인스타그램도 같이 본다
    const subs = await Promise.all(p.links.map(async (u) => ({ u, k: linkKind(u), r: await scanPage(u, linkKind(u)) })));
    for (const s of subs) { if (s.r.error) out.errors.push(`${s.u} ${s.r.error}`); else add(s.r.phones, s.k === 'place' ? 'homepage' : s.k, s.u); }
    return out;
  }
  const r = await scanPage(url, kind);
  if (r.error) { out.errors.push(r.error); return out; }
  out.name = r.title || '';
  add(r.phones, kind, url);
  return out;
}
