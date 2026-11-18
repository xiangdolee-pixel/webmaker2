// 수정 모드 — 관리자가 홈페이지 위에서 글자 · 링크 · 사진을 바로 고친다. (xim 에 연결된 모든 사이트 공통)
//   고칠 수 있는 자리 = 사이트 Worker 가 페이지 끝에서 표시해 둔 것:
//     글자  [data-xe]  (글자가 든 요소)   — 글자 조각(text node)만 바꾸므로 굵게 · 색 같은 모양은 사이트 그대로
//     링크  a[data-xl]                   — 눌렀을 때 가는 주소 (2026-11-18)
//     사진  img[data-xi]                 — 다른 사진으로 바꾸기 (2026-11-18, 올린 사진은 xms 저장 공간에)
//   원래 값은 window.__XE_ORIG. 저장하면 xms(page_texts)에 들어가 다음부터 모든 방문자에게 고친 대로 보인다. 원래대로 되돌리면 저장할 때 지운다.
//   게시판 화면(/board/…)에서는 '게시판 설정' 단추로 목록 모양 · 기능 · 권한을 그 자리에서 고친다 (board-set.js).
let on = false;

const CSS = `
body.xe-on [data-xe]{outline:1.5px dashed rgba(59,130,246,.55);outline-offset:2px;border-radius:2px;cursor:text;transition:outline-color .15s,background-color .15s}
body.xe-on [data-xe]:hover{outline-color:#3b82f6;background-color:rgba(59,130,246,.07)}
body.xe-on [data-xe]:focus{outline:2px solid #3b82f6;background-color:rgba(59,130,246,.1);box-shadow:0 0 0 4px rgba(255,255,255,.55)}
body.xe-on [data-xe].xe-dirty,body.xe-on a[data-xl].xe-dirty{outline:2px solid #f59e0b;outline-offset:2px}
body.xe-on img[data-xi]{cursor:pointer}
.xe-pick{position:absolute;z-index:2147482990;pointer-events:none;border:3px solid #fde047;border-radius:6px;box-shadow:0 0 0 2px rgba(17,24,39,.85),0 0 0 9999px rgba(15,23,42,.2)}
.xe-pick.dirty{border-color:#f59e0b}
body.xe-on .xms-test{bottom:calc(max(16px,env(safe-area-inset-bottom)) + 66px)}
.xe-bar{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;
 max-width:calc(100vw - 24px);padding:10px 12px;border-radius:16px;background:#111827;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.35);
 font:600 15px/1.3 "Pretendard Variable",Pretendard,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.xe-bar b{font-weight:800;color:#fde047;margin-right:2px}
.xe-bar span{color:rgba(255,255,255,.75);font-weight:500;font-size:14px}
.xe-bar button{height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:inherit;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap}
.xe-bar button:hover{background:#fff;color:#111827}
.xe-bar button.xe-save{background:#3b82f6;border-color:#3b82f6}
.xe-bar button.xe-save:hover{background:#fff;color:#1d4ed8}
.xe-bar button:disabled{opacity:.4;cursor:default;background:transparent;color:#fff}
.xe-bar button[hidden]{display:none}
.xe-bar button.xe-hot{background:#fde047;border-color:#fde047;color:#111827;font-weight:800;animation:xe-pop .45s cubic-bezier(.22,.8,.24,1)}
.xe-bar button.xe-hot:hover{background:#fff;border-color:#fff}
@keyframes xe-pop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08)}100%{transform:none;opacity:1}}
.xe-chip{position:absolute;z-index:2147482995;display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 16px;border:0;border-radius:999px;background:#fde047;color:#111827;cursor:pointer;white-space:nowrap;
 font:800 15px/1 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 0 3px rgba(17,24,39,.9);animation:xe-pop .4s cubic-bezier(.22,.8,.24,1);-webkit-tap-highlight-color:transparent}
.xe-chip:hover{background:#fff}
.xe-chip[hidden]{display:none}
.xe-chip svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.xe-chip:focus-visible{outline:3px solid #3b82f6;outline-offset:3px}
.xe-bar button:focus-visible,.xe-link input:focus-visible{outline:2px solid #fde047;outline-offset:2px}
.xe-link{display:flex;align-items:center;gap:6px;flex:1 1 100%;order:9}
.xe-link[hidden]{display:none}
.xe-link input{flex:1;min-width:0;height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:#1f2937;color:#fff;font:500 14px/1.3 inherit}
.xe-toast{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:2147483001;max-width:calc(100vw - 24px);padding:10px 16px;border-radius:12px;background:#065f46;color:#fff;font:600 14px/1.4 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.xe-toast.err{background:#991b1b}
@media (prefers-reduced-motion: reduce){body.xe-on [data-xe],.xe-pick{transition:none}.xe-chip,.xe-bar button.xe-hot{animation:none}}
`;

const nodesOf = (el) => {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const a = []; let n;
  while ((n = w.nextNode())) a.push(n);
  return a;
};
const valuesOf = (el) => nodesOf(el).map((n) => n.nodeValue);
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const keyOf = (el) => el.dataset.xeG + el.dataset.xe;
const pagePath = () => {
  let s = location.pathname;
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  return s.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1') || '/';
};
const LINK_OK = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)\S*$/i;

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'xe-toast' + (err ? ' err' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

// 큰 사진은 줄여서 올린다 (긴 쪽 2400px · JPG). 작은 PNG · WEBP · GIF 는 그대로(투명 바탕 · 움직임을 살리려고).
async function fitImage(file) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('사진(JPG · PNG · WEBP · GIF)만 넣을 수 있습니다.');
  if (file.type !== 'image/jpeg' && file.size < 1500000) return file;
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.type === 'image/jpeg' && file.size < 1500000) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}
async function uploadSiteImage(file) {
  const f = await fitImage(file);
  const r = await fetch('/xms-api/uploads?for=site&kind=INLINE', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': f.type, 'X-File-Name': encodeURIComponent(f.name || 'image') }, body: f,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '사진을 올리지 못했습니다.');
  return d.url;
}

export function startEdit() {
  if (on) return;
  on = true;
  const ORIG = window.__XE_ORIG || {};
  const els = [...document.querySelectorAll('[data-xe]')];
  const links = [...document.querySelectorAll('a[data-xl]')];
  const imgs = [...document.querySelectorAll('img[data-xi]')];
  const start = new Map(els.map((el) => [el, valuesOf(el)])); // 수정 모드에 들어올 때 보이던 글자
  const hrefOf = (a) => a.getAttribute('href') || '';
  const srcOf = (im) => im.getAttribute('src') || im.getAttribute('data-src') || '';
  const lkey = (a) => a.dataset.xlG + a.dataset.xl, ikey = (im) => im.dataset.xiG + im.dataset.xi;
  const startHref = new Map(links.map((a) => [a, hrefOf(a)]));
  // 사진: 들어올 때 모습(src · srcset …)을 통째로 기억해 두었다가 되돌릴 때 쓴다
  const shot = (im) => ({ src: im.getAttribute('src'), ds: im.getAttribute('data-src'), dm: im.getAttribute('data-src-m'), ss: im.getAttribute('srcset'), sz: im.getAttribute('sizes') });
  const startImg = new Map(imgs.map((im) => [im, shot(im)]));
  const putImg = (im, s) => { for (const [a, v] of [['src', s.src], ['data-src', s.ds], ['data-src-m', s.dm], ['srcset', s.ss], ['sizes', s.sz]]) { if (v == null) im.removeAttribute(a); else im.setAttribute(a, v); } };
  const setImg = (im, url) => { im.removeAttribute('srcset'); im.removeAttribute('sizes'); im.removeAttribute('data-src-m'); if (im.hasAttribute('src') || !im.hasAttribute('data-src')) im.setAttribute('src', url); else im.setAttribute('data-src', url); };
  const dirty = new Set();       // 글자
  const dirtyL = new Set();      // 링크
  const dirtyI = new Set();      // 사진
  let current = null;            // 지금 고른 글자 요소
  let curImg = null;             // 지금 고른 사진
  const count = () => dirty.size + dirtyL.size + dirtyI.size;

  const style = document.createElement('style');
  style.id = 'xe-style';
  style.textContent = CSS;
  document.head.append(style);
  document.body.classList.add('xe-on');

  let plainOk = true;
  els.forEach((el) => {
    try { el.contentEditable = 'plaintext-only'; } catch { plainOk = false; }
    if (!plainOk || el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = false;
  });

  const board = (location.pathname.match(/^\/board\/([a-z0-9-]+)/) || [])[1] || '';
  const bar = document.createElement('div');
  bar.className = 'xe-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '수정 모드');
  bar.innerHTML = '<b>수정 모드</b><span data-c></span>' +
    '<button type="button" data-a="link" hidden>링크 바꾸기</button>' +
    '<button type="button" data-a="img" hidden>사진 바꾸기</button>' +
    '<button type="button" data-a="undo" disabled>원래대로</button>' +
    (board ? '<button type="button" data-a="board">게시판 설정</button>' : '') +
    '<button type="button" data-a="save" class="xe-save" disabled>저장</button>' +
    '<button type="button" data-a="exit">끝내기</button>' +
    '<form class="xe-link" hidden><input type="text" inputmode="url" autocomplete="off" spellcheck="false" aria-label="링크 주소" placeholder="https://… 또는 /about 같은 사이트 안 주소"><button type="submit">확인</button><button type="button" data-a="link-x">취소</button></form>';
  document.body.append(bar);
  const $ = (s) => bar.querySelector(s);
  const pick = document.createElement('div');   // 고른 사진 둘레 표시
  pick.className = 'xe-pick'; pick.hidden = true;
  document.body.append(pick);
  // 고른 자리 바로 옆에 뜨는 단추 — "여기서 하면 되겠다" (사진 = 사진 한가운데, 링크 = 글자 바로 아래)
  const IC_IMG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 4 3 3-2 4 3"/></svg>';
  const IC_LINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg>';
  const chipI = document.createElement('button'), chipL = document.createElement('button');
  chipI.type = chipL.type = 'button'; chipI.className = chipL.className = 'xe-chip'; chipI.hidden = chipL.hidden = true;
  chipI.innerHTML = `${IC_IMG}사진 바꾸기`; chipL.innerHTML = `${IC_LINK}링크 바꾸기`;
  document.body.append(chipI, chipL);
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif'; file.hidden = true;
  document.body.append(file);

  // 지금 고른 것에 걸린 링크 (글자가 링크이거나 링크 안에 있을 때 · 사진이 링크 안에 있을 때)
  const curLink = () => (curImg || current)?.closest?.('a[data-xl]') || null;
  const placePick = () => {
    if (!curImg) { pick.hidden = true; return; }
    const r = curImg.getBoundingClientRect();
    pick.hidden = false; pick.classList.toggle('dirty', dirtyI.has(curImg));
    Object.assign(pick.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
  };
  const placeChips = () => {
    const vw = innerWidth, vh = innerHeight;
    if (curImg) {
      const r = curImg.getBoundingClientRect();
      // 사진의 보이는 부분 한가운데 (머리 메뉴 · 아래 막대에 가리지 않게)
      const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, vw), y0 = Math.max(r.top, 90), y1 = Math.min(r.bottom, vh - 90);
      chipI.hidden = x1 - x0 < 40 || y1 - y0 < 30;
      if (!chipI.hidden) Object.assign(chipI.style, { left: `${(x0 + x1) / 2 - chipI.offsetWidth / 2 + scrollX}px`, top: `${(y0 + y1) / 2 - 21 + scrollY}px` });
    } else chipI.hidden = true;
    const a = curLink();
    if (a && linkForm.hidden) {
      const r = (curImg || current || a).getBoundingClientRect();
      chipL.hidden = false;
      const left = Math.min(Math.max(8, curImg ? (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2 - chipL.offsetWidth / 2 : r.left), vw - chipL.offsetWidth - 8);
      const top = curImg ? Math.min(Math.max(r.top, 90), vh - 180) + 52 + Math.max(0, (Math.min(r.bottom, vh - 90) - Math.max(r.top, 90)) / 2 - 21) : (r.bottom + 54 < vh - 80 ? r.bottom + 10 : r.top - 52);
      Object.assign(chipL.style, { left: `${left + scrollX}px`, top: `${top + scrollY}px` });
    } else chipL.hidden = true;
  };
  function paint() {
    const n = count();
    $('[data-c]').textContent = n ? `고친 곳 ${n}군데` : (curImg ? '사진을 골랐습니다' : '글자 · 사진을 눌러 고치세요');
    $('[data-a="save"]').disabled = !n;
    const a = curLink();
    $('[data-a="link"]').hidden = !a;
    $('[data-a="img"]').hidden = !curImg;
    $('[data-a="link"]').classList.toggle('xe-hot', !!a && !curImg);   // 지금 할 수 있는 일을 노랗게
    $('[data-a="img"]').classList.toggle('xe-hot', !!curImg);
    const undoable = curImg ? srcOf(curImg) !== (ORIG[ikey(curImg)] || [])[0]
      : current ? (!same(valuesOf(current), ORIG[keyOf(current)]) || (a && hrefOf(a) !== (ORIG[lkey(a)] || [])[0])) : false;
    $('[data-a="undo"]').disabled = !undoable;
    $('[data-a="exit"]').textContent = $('[data-a="exit"]').dataset.sure ? '저장 안 하고 끝내기' : '끝내기';
    placePick(); placeChips();
  }
  const touched = () => { delete $('[data-a="exit"]').dataset.sure; paint(); };
  const mark = (el) => {
    if (same(valuesOf(el), start.get(el))) { dirty.delete(el); el.classList.remove('xe-dirty'); }
    else { dirty.add(el); el.classList.add('xe-dirty'); }
    touched();
  };
  const markL = (a) => { const d = hrefOf(a) !== startHref.get(a); dirtyL[d ? 'add' : 'delete'](a); a.classList.toggle('xe-dirty', d); touched(); };
  const markI = (im) => { const s = startImg.get(im); const d = srcOf(im) !== (s.src || s.ds || ''); dirtyI[d ? 'add' : 'delete'](im); touched(); };

  // 누른 자리에 있는 사진 (글 뒤에 깔린 첫 화면 사진도 고를 수 있게 그 자리의 요소를 모두 본다 — 겹쳐 있으면 보이는 것)
  const imgAt = (x, y) => document.elementsFromPoint(x, y).find((e) => e.matches?.('img[data-xi]') && +getComputedStyle(e).opacity > 0.3 && e.getBoundingClientRect().width > 24) || null;

  // 링크 · 단추를 눌러도 넘어가지 않게. 글자가 아닌 곳을 누르면 그 자리의 사진을 고른다.
  const block = (e) => {
    if (bar.contains(e.target) || e.target.closest('.xa-menu, .xms-test, .xe-dlg, .xe-chip')) return;
    const el = e.target.closest('[data-xe]');
    if (e.target.closest('a,button') || el) e.preventDefault();
    if (el) { if (curImg) { curImg = null; paint(); } return; }
    const im = imgAt(e.clientX, e.clientY);
    if (im) { e.preventDefault(); curImg = im; current = null; closeLink(); paint(); }
    else if (curImg) { curImg = null; paint(); }
  };
  const onInput = (e) => { const el = e.target.closest?.('[data-xe]'); if (el) mark(el); };
  const onFocus = (e) => { const el = e.target.closest?.('[data-xe]'); if (el) { current = el; curImg = null; closeLink(); paint(); } };
  // 엔터 = 줄바꿈 대신 다 고침, Ctrl+S = 저장
  const onKey = (e) => {
    const el = e.target.closest?.('[data-xe]');
    if (!el) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  };
  const onPaste = (e) => {
    const el = e.target.closest?.('[data-xe]');
    if (!el) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  };
  const leave = (e) => { if (count()) { e.preventDefault(); e.returnValue = ''; } };
  const onMove = () => { placePick(); placeChips(); };
  // 흐르는 사진처럼 저절로 움직이는 자리도 따라간다
  let raf = 0;
  const follow = () => { if (!on) return; if (curImg || !chipL.hidden) onMove(); raf = requestAnimationFrame(follow); };
  raf = requestAnimationFrame(follow);
  chipI.addEventListener('click', (e) => { e.preventDefault(); if (curImg) file.click(); });
  chipL.addEventListener('mousedown', (e) => e.preventDefault());   // 글자에서 커서가 빠지지 않게
  chipL.addEventListener('click', (e) => { e.preventDefault(); openLink(); });
  document.addEventListener('click', block, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('paste', onPaste, true);
  addEventListener('beforeunload', leave);
  addEventListener('scroll', onMove, { passive: true });
  addEventListener('resize', onMove);

  // ── 링크 바꾸기: 막대 안에서 주소를 고친다 ──
  const linkForm = $('.xe-link'), linkIn = linkForm.querySelector('input');
  let linkEl = null;
  function closeLink() { linkForm.hidden = true; linkEl = null; placeChips(); }
  function openLink() {
    linkEl = curLink();
    if (!linkEl) return;
    linkIn.value = hrefOf(linkEl);
    linkForm.hidden = false; chipL.hidden = true;
    setTimeout(() => { linkIn.focus(); linkIn.select(); }, 0);
  }
  linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = linkIn.value.trim();
    if (!LINK_OK.test(v)) { toast('주소는 https:// 나 / 로 시작하게 넣어 주세요. (전화는 tel:, 메일은 mailto:)', true); return; }
    if (linkEl) { linkEl.setAttribute('href', v); markL(linkEl); }
    closeLink();
  });

  // ── 사진 바꾸기: 고른 뒤 바로 올리고 화면에 보여 준다 (저장을 눌러야 방문자에게 반영) ──
  file.addEventListener('change', async () => {
    const f = file.files[0], im = curImg;
    file.value = '';
    if (!f || !im) return;
    const b = $('[data-a="img"]');
    b.disabled = true; b.textContent = '올리는 중…'; chipI.disabled = true; chipI.lastChild.textContent = '올리는 중…';
    try {
      const url = await uploadSiteImage(f);
      await new Promise((ok) => { const t = new Image(); t.onload = t.onerror = ok; t.src = url; });   // 다 받은 뒤에 바꿔 깜빡이지 않게
      setImg(im, url); markI(im);
      toast('사진을 바꿨습니다. 저장을 눌러야 방문자에게도 보입니다.');
    } catch (e) { toast(e.message || '사진을 올리지 못했습니다.', true); }
    b.disabled = false; b.textContent = '사진 바꾸기'; chipI.disabled = false; chipI.lastChild.textContent = '사진 바꾸기';
    paint();
  });

  async function save() {
    if (!count()) return;
    const items = [
      ...[...dirty].map((el) => { const v = valuesOf(el); return { g: el.dataset.xeG, k: el.dataset.xe, t: same(v, ORIG[keyOf(el)]) ? null : v }; }),
      ...[...dirtyL].map((a) => ({ g: a.dataset.xlG, k: a.dataset.xl, t: hrefOf(a) === (ORIG[lkey(a)] || [])[0] ? null : [hrefOf(a)] })),
      ...[...dirtyI].map((im) => ({ g: im.dataset.xiG, k: im.dataset.xi, t: srcOf(im) === (ORIG[ikey(im)] || [])[0] ? null : [srcOf(im)] })),
    ];
    $('[data-a="save"]').disabled = true;
    try {
      const r = await fetch('/xms-api/admin/page-texts', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pagePath(), items }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '저장하지 못했습니다.');
      dirty.forEach((el) => { start.set(el, valuesOf(el)); el.classList.remove('xe-dirty'); });
      dirtyL.forEach((a) => { startHref.set(a, hrefOf(a)); a.classList.remove('xe-dirty'); });
      dirtyI.forEach((im) => { startImg.set(im, shot(im)); });
      dirty.clear(); dirtyL.clear(); dirtyI.clear();
      toast('저장했습니다. 방문자에게도 곧 고친 대로 보입니다.');
    } catch (e) {
      toast(e.message || '저장하지 못했습니다.', true);
    }
    paint();
  }

  bar.addEventListener('click', async (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'save') save();
    if (a === 'link') openLink();
    if (a === 'link-x') closeLink();
    if (a === 'img' && curImg) file.click();
    if (a === 'board') {
      try { (await import(`./board-set.js${new URL(import.meta.url).search}`)).openBoardSettings(board); } catch (x) { toast('게시판 설정을 열지 못했습니다.', true); console.error(x); }
    }
    if (a === 'undo') {
      if (curImg) {   // 사진: 사이트의 원래 사진으로
        const o = (ORIG[ikey(curImg)] || [])[0], s = startImg.get(curImg);
        if (o && (s.src || s.ds) === o) putImg(curImg, s); else if (o) setImg(curImg, o);
        markI(curImg);
      } else if (current) {   // 글자 + 거기 걸린 링크
        const o = ORIG[keyOf(current)];
        const ns = nodesOf(current);
        if (o && o.length === ns.length) ns.forEach((n, i) => { n.nodeValue = o[i]; });
        else if (o) current.textContent = o.join('');
        mark(current);
        const l = curLink(), lo = l && (ORIG[lkey(l)] || [])[0];
        if (l && lo != null) { l.setAttribute('href', lo); markL(l); }
      }
    }
    if (a === 'exit') {
      const b = $('[data-a="exit"]');
      if (count() && !b.dataset.sure) { b.dataset.sure = '1'; paint(); return; }
      // 저장하지 않은 것은 들어올 때 모습으로 되돌린다
      dirty.forEach((el) => {
        const v = start.get(el), ns = nodesOf(el);
        if (v.length === ns.length) ns.forEach((n, i) => { n.nodeValue = v[i]; }); else el.textContent = v.join('');
        el.classList.remove('xe-dirty');
      });
      dirtyL.forEach((l) => { l.setAttribute('href', startHref.get(l)); l.classList.remove('xe-dirty'); });
      dirtyI.forEach((im) => putImg(im, startImg.get(im)));
      stop();
    }
  });

  function stop() {
    on = false;
    els.forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
    document.body.classList.remove('xe-on');
    document.removeEventListener('click', block, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('paste', onPaste, true);
    removeEventListener('beforeunload', leave);
    removeEventListener('scroll', onMove);
    removeEventListener('resize', onMove);
    cancelAnimationFrame(raf);
    bar.remove(); style.remove(); pick.remove(); file.remove(); chipI.remove(); chipL.remove();
  }
  paint();
  toast(imgs.length ? '수정 모드 — 글자는 눌러서 고치고, 사진은 눌러서 고른 뒤 "사진 바꾸기". 링크는 글자를 고른 뒤 "링크 바꾸기".' : '수정 모드 — 파란 점선 글자를 눌러 고치고 저장하세요.');
}
