// 글 안의 사진 크게 보기 (사용자 지시 2026-11-20) — 갤러리 등 게시판 글의 사진을 누르면 화면 가득 띄워 원본 크기까지 확대 · 축소해 본다.
//   대상: 본문 사진(.prose img) + 첨부 사진(.post-photos img). 링크가 걸린 본문 사진은 링크대로 간다.
//   폰: 두 손가락 확대 · 축소, 두 번 톡 = 확대/원래대로, 확대했을 때 밀어서 옮기기, 100% 일 때 옆으로 밀면 앞 · 다음 사진, 뒤로 가기 = 닫기
//   PC: 휠 = 확대 · 축소, 끌어서 옮기기, 두 번 누르기, ← → · + − 0 · Esc
//   사이트 안(embed.css 는 .xms-c 안에만 걸린다)에서도 보이게 창은 글이 있는 .xms-c 안에 넣는다.
const ICO = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  zin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  zout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
};
const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SEL = '.prose img, .post-photos img';

let box = null;   // 떠 있는 창(하나만)

function open(list, start, home) {
  if (box || !list.length) return;
  let i = Math.max(0, list.indexOf(start)), s = 1, tx = 0, ty = 0, maxS = 3;
  box = document.createElement('div');
  box.className = 'phv';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '사진 크게 보기'); box.tabIndex = -1;
  box.innerHTML = `<div class="phv-stage"><img class="phv-img" alt="" draggable="false"></div>
    <div class="phv-bar"><span class="phv-n"></span><span class="phv-tools"><button type="button" class="phv-ic" data-z="-1" aria-label="축소" title="축소">${ICO.zout}</button><b class="phv-z" aria-live="polite">100%</b><button type="button" class="phv-ic" data-z="1" aria-label="확대" title="확대">${ICO.zin}</button><button type="button" class="phv-ic phv-x" aria-label="닫기" title="닫기">${ICO.x}</button></span></div>
    <button type="button" class="phv-nav phv-prev" aria-label="앞 사진">${ICO.prev}</button><button type="button" class="phv-nav phv-next" aria-label="다음 사진">${ICO.next}</button>`;
  const $ = (q) => box.querySelector(q);
  const stage = $('.phv-stage'), img = $('.phv-img');
  const fit = () => ({ w: img.offsetWidth || 1, h: img.offsetHeight || 1, W: stage.clientWidth, H: stage.clientHeight });
  // 옮길 수 있는 범위: 확대한 사진이 화면보다 큰 만큼만
  const clamp = () => {
    const f = fit(), mx = Math.max(0, (f.w * s - f.W) / 2), my = Math.max(0, (f.h * s - f.H) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  };
  const paint = (smooth) => {
    clamp();
    img.style.transition = smooth && !reduce ? 'transform .26s cubic-bezier(.22, .8, .24, 1)' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    $('.phv-z').textContent = `${Math.round(s * 100)}%`;
    box.classList.toggle('zoomed', s > 1.001);
    $('[data-z="-1"]').disabled = s <= 1.001; $('[data-z="1"]').disabled = s >= maxS - 0.001;
  };
  // (x, y) 화면 좌표 아래의 사진 자리를 그대로 두고 z 배로
  const zoomTo = (z, x, y, smooth = true) => {
    z = Math.max(1, Math.min(maxS, z));
    const r = stage.getBoundingClientRect(), cx = (x ?? r.left + r.width / 2) - r.left - r.width / 2, cy = (y ?? r.top + r.height / 2) - r.top - r.height / 2;
    tx = cx - (z / s) * (cx - tx); ty = cy - (z / s) * (cy - ty); s = z;
    if (s <= 1.001) { tx = 0; ty = 0; }
    paint(smooth);
  };
  // 원본 크기(화면 점 하나에 사진 점 하나)까지, 작은 사진도 3배까지는 키워 본다
  const limits = () => { const f = fit(); maxS = Math.min(10, Math.max(3, (img.naturalWidth || f.w) / f.w)); };
  const show = (n) => {
    i = (n + list.length) % list.length; s = 1; tx = 0; ty = 0;
    const from = list[i];
    img.src = from.currentSrc || from.src; img.alt = from.alt || '';
    $('.phv-n').textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
    $('.phv-prev').hidden = $('.phv-next').hidden = list.length < 2;
    paint(false);
    if (img.complete) limits();
  };
  img.addEventListener('load', () => { limits(); paint(false); });

  const close = (fromPop) => {
    if (!box) return;
    document.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); window.removeEventListener('resize', onSize);
    document.documentElement.style.overflow = prevOverflow;
    box.remove(); box = null;
    if (!fromPop && history.state?.phv) history.back();
    list[i]?.focus?.({ preventScroll: true });
  };
  const onPop = () => close(true);
  const onSize = () => { limits(); paint(false); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === '+' || e.key === '=') zoomTo(s * 1.5);
    else if (e.key === '-') zoomTo(s / 1.5);
    else if (e.key === '0') zoomTo(1);
    else if (e.key === 'Tab') { e.preventDefault(); const f = [...box.querySelectorAll('button:not([hidden]):not(:disabled)')]; (f[(f.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + f.length) % f.length] || box).focus(); }
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };
  $('.phv-x').addEventListener('click', () => close());
  $('.phv-prev').addEventListener('click', () => show(i - 1));
  $('.phv-next').addEventListener('click', () => show(i + 1));
  box.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => zoomTo(+b.dataset.z > 0 ? s * 1.6 : s / 1.6)));
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomTo(s * Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY, false); }, { passive: false });

  // 손가락 · 마우스: 하나 = 옮기기(확대했을 때) · 옆으로 밀어 넘기기(100%), 둘 = 확대 · 축소
  const pts = new Map();
  let g = null, lastTap = 0;
  const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* 잡을 수 없는 포인터 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const t = two(); g = { kind: 'pinch', d: t.d, s0: s, moved: true }; }
    else if (pts.size === 1) g = { kind: 'drag', x: e.clientX, y: e.clientY, tx, ty, moved: false, onImg: e.target === img };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'pinch' && pts.size >= 2) { const t = two(); zoomTo(g.s0 * (t.d / g.d), t.x, t.y, false); return; }
    if (g.kind !== 'drag') return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (s > 1.001) { tx = g.tx + dx; ty = g.ty + dy; paint(false); }
    else if (g.moved && list.length > 1) { img.style.transition = 'none'; img.style.transform = `translate(${dx}px, 0)`; }   // 100%: 옆으로 따라온다
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    const was = g;
    if (pts.size === 1 && was?.kind === 'pinch') { const [p] = [...pts.values()]; g = { kind: 'drag', x: p.x, y: p.y, tx, ty, moved: true, onImg: true }; return; }   // 한 손가락을 뗌 → 남은 손가락으로 옮기기
    if (pts.size) return;
    g = null;
    if (!was || e.type === 'pointercancel') { paint(true); return; }
    if (was.kind === 'pinch') { if (s < 1.05) zoomTo(1); return; }
    const dx = e.clientX - was.x;
    if (s <= 1.001 && was.moved) {   // 100% 에서 옆으로 밀기
      if (list.length > 1 && Math.abs(dx) > 60) show(i + (dx < 0 ? 1 : -1)); else paint(true);
      return;
    }
    if (was.moved) return;
    const now = Date.now();
    if (!was.onImg) { close(); return; }                                    // 사진 바깥을 누르면 닫는다
    if (now - lastTap < 320) { lastTap = 0; zoomTo(s > 1.001 ? 1 : Math.min(maxS, 2.5), e.clientX, e.clientY); } else lastTap = now;   // 두 번 톡
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  home.appendChild(box);
  document.addEventListener('keydown', onKey); window.addEventListener('resize', onSize);
  history.pushState({ ...(history.state || {}), phv: 1 }, '');   // 폰의 뒤로 가기 = 닫기
  window.addEventListener('popstate', onPop);
  show(i);
  box.focus({ preventScroll: true });
}

export function mountPhotos(root = document) {
  for (const post of root.querySelectorAll('.post')) {
    if (post._phv) continue;
    post._phv = true;
    const usable = (im) => !im.closest('.xv') && !(im.closest('a') && !im.closest('.post-photos'));   // 링크가 걸린 본문 사진은 링크대로
    post.classList.add('has-phv');
    post.addEventListener('click', (e) => {
      const im = e.target.closest?.(SEL);
      if (!im || !post.contains(im) || !usable(im) || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      open([...post.querySelectorAll(SEL)].filter(usable), im, post.closest('.xms-c') || document.body);
    });
  }
}
