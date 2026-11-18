// PDF 를 글 안에서 바로 보기 (사용자 지시 2026-11-18) — 게시판 옵션 'PDF 첨부 보기'(pdf = 아래로 이어 보기 · book = 전자책, 책장 넘기기)
//   글 보기 화면의 <div class="xv" data-xv="pdf|book" data-src data-dl data-name> 자리마다 뷰어를 하나씩 세운다.
//   PDF.js 로 그린다(폰도 같게). 전자책: 1쪽은 표지(가운데 한 장), 그 뒤로 2–3, 4–5 … 좁은 화면은 한 장씩. 전체화면 · 내려받기.
//   (bsf 다운로드 화면의 뷰어를 게시판용으로 옮긴 것 — 거기는 화면 위에 띄우고, 여기는 글 안에 놓인다)
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let lib = null;
const loadLib = () => {
  lib ||= new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = `${PDFJS}pdf.min.js`;
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`; ok(window.pdfjsLib); };
    sc.onerror = () => { lib = null; no(new Error('lib')); };
    document.head.appendChild(sc);
  });
  return lib;
};
const ICO = {
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  unfull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const dpr = Math.min(window.devicePixelRatio || 1, 2);

export function mountPdf(host) {
  if (host._xv) return;
  host._xv = true;
  const mode = host.dataset.xv === 'book' ? 'book' : 'pdf';
  const src = host.dataset.src, dl = host.dataset.dl || src, name = host.dataset.name || 'PDF';
  host.classList.add('xv');
  host.setAttribute('data-mode', mode);
  host.innerHTML = `<div class="xv-bar"><b class="xv-title">${esc(name)}</b><span class="xv-page"></span>
    <button type="button" class="xv-ic xv-full"></button><a class="xv-dl" href="${esc(dl)}" download>${ICO.dl}<span>내려받기</span></a></div>
    <div class="xv-body"><div class="xv-pages"></div><div class="xv-stage"></div><p class="xv-msg">불러오는 중…</p>
    <button type="button" class="xv-nav xv-prev" aria-label="앞 쪽">${ICO.prev}</button><button type="button" class="xv-nav xv-next" aria-label="다음 쪽">${ICO.next}</button></div>`;
  const $ = (s) => host.querySelector(s);
  const body = $('.xv-body'), pages = $('.xv-pages'), stage = $('.xv-stage'), msg = $('.xv-msg');
  let doc = null, cur = 1, busy = false, cache = {}, ratio = 1.414, io = null;

  // n 쪽을 화면 폭 w(px)로 그린 캔버스 (같은 크기면 다시 쓰고, 쓸 때마다 새 캔버스로 복사해 준다)
  const pageCanvas = (n, w) => {
    const key = `${n}@${Math.round(w)}`;
    cache[key] ||= doc.getPage(n).then((pg) => {
      const vp = pg.getViewport({ scale: (w / pg.getViewport({ scale: 1 }).width) * dpr }), c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(() => c);
    });
    return cache[key].then((from) => {
      const c = document.createElement('canvas');
      c.width = from.width; c.height = from.height; c.getContext('2d').drawImage(from, 0, 0);
      c.style.width = `${w}px`; c.style.height = `${(w * from.height) / from.width}px`;
      return c;
    });
  };
  const isFull = () => (document.fullscreenElement || document.webkitFullscreenElement) === host;
  const narrow = () => stage.clientWidth < 700;
  const spreadOf = (n) => {
    if (mode !== 'book' || narrow()) return [n];
    if (n === 1) return [1];
    const a = n % 2 === 0 ? n : n - 1;
    return a + 1 <= doc.numPages ? [a, a + 1] : [a];
  };
  const setPage = () => { const sp = spreadOf(cur); $('.xv-page').textContent = doc ? `${sp.length > 1 ? sp.join('–') : cur} / ${doc.numPages}` : ''; };
  // 전자책 무대 높이: 쪽 비율에 맞추되 화면 높이를 넘지 않게 (전체화면이면 꽉 채운다)
  const sizeStage = () => {
    if (isFull()) { stage.style.height = ''; return; }
    const two = !narrow(), W = stage.clientWidth - (two ? 120 : 24);
    stage.style.height = `${Math.round(Math.min(window.innerHeight * 0.84, (W / (two ? 2 : 1)) * ratio + 40))}px`;
  };
  const fitW = (count) => {
    const W = stage.clientWidth - (narrow() ? 24 : 120), H = stage.clientHeight - 36;
    return Math.max(120, Math.min(W / count, H / ratio));
  };
  const leafPage = (c, cls) => { const f = document.createElement('div'); f.className = `xv-leafpage${cls}`; f.appendChild(c); return f; };
  const navState = () => { const last = spreadOf(cur); $('.xv-prev').disabled = cur <= 1; $('.xv-next').disabled = last[last.length - 1] >= doc.numPages; };
  const drawStage = async () => {
    sizeStage();
    const sp = spreadOf(cur), w = fitW(narrow() ? 1 : 2);
    const cs = await Promise.all(sp.map((n) => pageCanvas(n, w)));
    const row = document.createElement('div');
    row.className = 'xv-spread';
    cs.forEach((c, i) => row.appendChild(leafPage(c, sp.length > 1 ? (i ? ' r' : ' l') : '')));
    stage.querySelector('.xv-spread')?.remove();
    stage.appendChild(row); setPage(); navState();
  };
  const stepOf = (dir) => {
    const sp = spreadOf(cur);
    if (dir > 0) return Math.min(doc.numPages, sp[sp.length - 1] + 1);
    const p = sp[0] - 1;
    return p < 1 ? 1 : spreadOf(p)[0];
  };
  // 책장 넘기기: 넘기는 장(앞면 = 지금 쪽, 뒷면 = 다음 쪽)이 책등을 축으로 돌아간다. 한 장(표지 · 마지막 쪽)은 제 쪽 자리로 옮겨 갔다가 넘어간다.
  const go = async (dir) => {
    if (!doc || busy || mode !== 'book') return;
    const to = stepOf(dir);
    if (to === cur || (dir < 0 && cur <= 1)) return;
    if (reduce) { cur = to; await drawStage(); return; }
    busy = true;
    const sp = spreadOf(cur), keep = cur;
    cur = to; const nsp = spreadOf(to); cur = keep;
    const one = narrow(), w = fitW(one ? 1 : 2), SLIDE = 380;
    const single = (s) => !one && s.length === 1;
    const sideOf = (s) => (s[0] === 1 ? 1 : -1);   // 표지는 오른쪽 자리, 끝에 홀로 남은 쪽은 왼쪽 자리
    const slide = (el, x, ms) => { el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.22, .8, .24, 1)` : 'none'; el.style.transform = x ? `translateX(${x}px)` : ''; };
    const frontN = dir > 0 ? sp[sp.length - 1] : sp[0], backN = dir > 0 ? nsp[0] : nsp[nsp.length - 1];
    const [front, back, under0] = await Promise.all([pageCanvas(frontN, w), pageCanvas(backN, w), Promise.all(nsp.map((n) => pageCanvas(n, w)))]);
    const row = stage.querySelector('.xv-spread'), curPage = row.querySelector('.xv-leafpage');
    const pre = single(sp) ? SLIDE : 0;
    if (pre) slide(curPage, (sideOf(sp) * w) / 2, SLIDE);
    setTimeout(() => {
      const under = document.createElement('div');
      under.className = 'xv-spread under';
      under0.forEach((c, i) => under.appendChild(leafPage(c, nsp.length > 1 ? (i ? ' r' : ' l') : '')));
      const underPage = under.querySelector('.xv-leafpage');
      if (single(nsp)) slide(underPage, (sideOf(nsp) * w) / 2, 0);
      stage.insertBefore(under, row);
      let face;
      if (one) { row.style.visibility = 'hidden'; face = row.querySelector('.xv-leafpage'); }
      else { face = single(sp) ? curPage : row.querySelector(dir > 0 ? '.xv-leafpage.r' : '.xv-leafpage.l'); face.style.visibility = 'hidden'; }
      const leaf = document.createElement('div');
      leaf.className = `xv-leaf ${dir > 0 ? 'fwd' : 'back'}${one ? ' one' : ''}`;
      const f1 = document.createElement('div'), f2 = document.createElement('div');
      f1.className = 'xv-face front'; f2.className = 'xv-face backface';
      f1.appendChild(front); f2.appendChild(back); leaf.append(f1, f2);
      const ref = face.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      Object.assign(leaf.style, { left: `${ref.left - sr.left}px`, top: `${ref.top - sr.top}px`, width: `${ref.width}px`, height: `${ref.height}px` });
      stage.appendChild(leaf); void leaf.offsetWidth; leaf.classList.add('turn');
      setTimeout(() => {
        cur = to; leaf.remove(); row.remove();
        under.classList.remove('under'); setPage(); navState();
        if (single(nsp)) { slide(underPage, 0, SLIDE); setTimeout(() => { busy = false; }, SLIDE); } else busy = false;
      }, 720);
    }, pre);
  };
  // 아래로 이어 보기: 쪽 자리를 먼저 잡아 두고, 화면에 다가오는 쪽만 그린다
  const mountScroll = () => {
    pages.innerHTML = '';
    io?.disconnect();
    const w = Math.min(body.clientWidth - 24, 860);
    io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        const box = en.target;
        if (!en.isIntersecting || box._done) continue;
        box._done = true;
        pageCanvas(+box.dataset.n, w).then((c) => { c.style.width = '100%'; c.style.height = 'auto'; box.appendChild(c); }).catch(() => {});
      }
    }, { root: body, rootMargin: '600px 0px' });
    for (let n = 1; n <= doc.numPages; n++) {
      const box = document.createElement('div');
      box.className = 'xv-p'; box.dataset.n = n;
      box.style.width = `${w}px`; box.style.aspectRatio = `1 / ${ratio}`;
      pages.appendChild(box); io.observe(box);
    }
    onScroll();
  };
  const onScroll = () => {
    if (mode !== 'pdf' || !doc) return;
    const top = body.getBoundingClientRect().top + 40;
    let c = 1;
    for (const bx of pages.children) if (bx.getBoundingClientRect().top <= top) c = +bx.dataset.n;
    cur = c; setPage();
  };
  const draw = () => { if (!doc) return; cache = {}; if (mode === 'pdf') mountScroll(); else { cur = spreadOf(cur)[0]; drawStage(); } };
  const fullBtn = () => { const b = $('.xv-full'); b.innerHTML = isFull() ? ICO.unfull : ICO.full; b.title = isFull() ? '전체화면 끄기' : '전체화면'; b.setAttribute('aria-label', b.title); };
  fullBtn();
  if (!(host.requestFullscreen || host.webkitRequestFullscreen)) $('.xv-full').hidden = true;   // 아이폰 사파리 등은 전체화면이 없다
  $('.xv-full').addEventListener('click', () => {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (host.requestFullscreen) host.requestFullscreen().catch(() => {});
    else host.webkitRequestFullscreen?.();
  });
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { fullBtn(); setTimeout(draw, 140); });
  $('.xv-prev').addEventListener('click', () => go(-1));
  $('.xv-next').addEventListener('click', () => go(1));
  body.addEventListener('scroll', onScroll, { passive: true });
  stage.addEventListener('click', (e) => { const r = stage.getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? 1 : -1); });   // 오른쪽 절반 = 다음, 왼쪽 절반 = 앞
  let tx = null;
  stage.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); });
  host.tabIndex = 0;
  host.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (mode === 'book') { e.preventDefault(); go(1); } }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (mode === 'book') { e.preventDefault(); go(-1); } }
  });
  let rz = 0, lastW = host.clientWidth;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (host.clientWidth !== lastW) { lastW = host.clientWidth; draw(); } }, 200); });

  // 화면에 다가올 때 불러온다 (PDF.js 는 크다 — 글을 열자마자 받지 않게)
  const start = async () => {
    try {
      const pdfjs = await loadLib();
      const task = pdfjs.getDocument({ url: src, withCredentials: false });
      task.onProgress = (p) => { if (p.total) msg.textContent = `불러오는 중… ${Math.round((p.loaded / p.total) * 100)}%`; };
      doc = await task.promise;
      const v = (await doc.getPage(1)).getViewport({ scale: 1 });
      ratio = v.height / v.width; msg.hidden = true; draw();
    } catch {
      msg.hidden = false;
      msg.innerHTML = `이 화면에서 열지 못했습니다. <a href="${esc(dl)}" download>내려받아 보기</a>`;
    }
  };
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { seen.disconnect(); start(); } }, { rootMargin: '400px 0px' });
    seen.observe(host);
  } else start();
}

// 글 안의 PDF 자리를 모두 뷰어로: 첨부 자리(.xv) + 본문에 넣은 PDF(iframe.ed-pdf — 본문이 data-xv-inline 을 달고 있을 때)
export function mountAll(root = document) {
  for (const box of root.querySelectorAll('[data-xv-inline]')) {
    for (const fr of box.querySelectorAll('iframe.ed-pdf')) {
      const el = document.createElement('div');
      el.dataset.xv = box.dataset.xvInline; el.dataset.src = fr.getAttribute('src');
      const a = fr.nextElementSibling?.querySelector?.('a');
      const s = fr.getAttribute('src');
      el.dataset.name = a?.textContent || 'PDF'; el.dataset.dl = /^\/xms\/upload\/[0-9a-f]{32}$/.test(s) ? `${s}?dl=1` : s;
      fr.replaceWith(el); el.className = 'xv';
    }
  }
  root.querySelectorAll('.xv[data-xv]').forEach(mountPdf);
}
