/* BSF COMPANY — 사이트 공통 스크립트 (ES5, 프레임워크 없음) */
(function () {
  'use strict';
  var doc = document, body = doc.body;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || doc).querySelectorAll(s)); }

  /* 머리: 첫 화면(어두운 영상) 위에서는 투명 + 흰 글자, 내려가면 밝은 띠 */
  var hd = $('.hd');
  var darkTop = body.classList.contains('has-hero') || body.classList.contains('has-page-hero');
  var fab = $('.fab');
  var accents = $$('.cta-band');
  var darks = $$('.hero, .page-hero, .sec.dark, .sec.deep, .sec.ink, .spot, .globe-sec, .brand-band, .cta-band, .ft');
  // 처음 그릴 때는 색 바뀜 움직임 없이 바로 제 모습으로, 그 뒤 스크롤할 때만 부드럽게
  requestAnimationFrame(function () { requestAnimationFrame(function () { doc.documentElement.classList.add('hd-ready'); }); });
  function onScroll() {
    var y = window.pageYOffset || doc.documentElement.scrollTop;
    if (hd && darkTop) hd.classList.toggle('on-dark', y < 40);
    if (hd) {   // 유리 탑메뉴 아래가 어두운 구간이면 글자를 흰색으로
      var hb = hd.offsetHeight / 2, od = false;
      darks.forEach(function (d) { var q = d.getBoundingClientRect(); if (q.top <= hb && q.bottom >= hb) od = true; });
      hd.classList.toggle('over-dark', od);
    }
    if (fab) {
      fab.classList.toggle('up', y > 400);   // 맨 위로 버튼(400px 넘으면 뜸)에게 자리를 비켜 준다
      // 주황 띠 위에 오면 버튼 색을 뒤집는다(같은 색끼리 겹치지 않게)
      var r = fab.getBoundingClientRect(), on = false;
      accents.forEach(function (a) { var q = a.getBoundingClientRect(); if (r.bottom > q.top && r.top < q.bottom) on = true; });
      fab.classList.toggle('on-accent', on);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 지금 페이지 메뉴 표시 */
  var here = location.pathname.split('/').pop().replace(/\.html$/, '');
  $$('.gnb a').forEach(function (a) {
    var p = (a.getAttribute('href') || '').split('/').pop().replace(/\.html$/, '');
    if (p && here && p === here) a.classList.add('on');
  });

  /* 모바일 메뉴 */
  var toggle = $('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = !body.classList.contains('nav-open');
      body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $$('.gnb a').forEach(function (a) { a.addEventListener('click', function () { body.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); }); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') body.classList.remove('nav-open'); });
  }

  /* 자료실: xms 게시판(archive)의 첨부 파일을 '자료 이름 + 내려받기' 줄로 (사용자 지시 2026-11-13) */
  var arc = $('[data-archive]');
  if (arc) {
    var escA = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var sizeOf = function (n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
    var DL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>';
    var EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    var slug = arc.getAttribute('data-xms-files') || arc.getAttribute('data-archive'), admin = false;
    var draw = function (list) {
      var cnt = $('[data-arc-count]'); if (cnt) cnt.textContent = list.length ? list.length + ' FILES' : '';
      if (!list.length) { arc.innerHTML = '<li class="arc-empty">아직 올린 자료가 없습니다.</li>'; return; }
      arc.innerHTML = list.map(function (p) {
        var f0 = p.files[0], ext = f0 ? (f0.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4) : 'DOC';
        return '<li class="arc-row"><span class="arc-type' + (ext === 'AI' ? ' ai' : '') + '" aria-hidden="true">' + escA(ext) + '</span>'
          + '<div class="arc-txt"><h3>' + escA(p.title) + '</h3>' + (p.desc ? '<p>' + escA(p.desc) + '</p>' : '')
          + '<span class="arc-meta">' + (f0 ? escA(ext) + ' · ' + sizeOf(f0.size) : '첨부 파일 없음') + ' · ' + escA(p.date) + (admin ? '<a href="' + escA(p.url) + '/edit">고치기</a><button type="button" class="arc-del" data-del="' + p.id + '">삭제</button>' : '') + '</span></div>'
          + '<div class="arc-dls">' + p.files.map(function (f) {
            var pdf = /\.pdf$/i.test(f.name);
            return '<span class="arc-btns">' + (pdf ? '<button type="button" class="arc-view" data-view="' + escA(f.view || f.url.replace(/\?dl=1$/, '')) + '" data-dl="' + escA(f.dl || f.url) + '" data-title="' + escA(p.title) + '">' + EYE + '보기</button>' : '')
              + '<a class="arc-dl" href="' + escA(f.dl || f.url) + '" download aria-label="' + escA(f.name) + ' 내려받기">' + (p.files.length > 1 ? escA(f.name) : '내려받기') + DL + '</a></span>';
          }).join('') + '</div></li>';
      }).join('');
    };
    /* PDF 뷰어 (사용자 지시 2026-11-13): 화면 위에 띄워 보고 닫는다. 폰(iOS · 안드로이드)도 같게 PDF.js 로 그린다.
       보기 방식 = 스크롤(쪽을 이어서) · 한 쪽씩(슬라이드쇼) · 책(좌우 펼침, 쪽 넘김), 전체화면 */
    var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    var pdfLib = null, pv = null, pvDoc = null, pvIO = null, pvOpen = false, pvMode = 'scroll', pvCur = 1, pvBusy = false, pvCache = {}, pvRatio = 1.414;
    try { pvMode = localStorage.getItem('pv-mode') || 'scroll'; } catch (e) {}
    var MODES = [['scroll', '스크롤'], ['slide', '한 쪽씩'], ['book', '전자책']];
    var ICO = {
      full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
      unfull: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>',
      prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
      next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
    };
    var loadLib = function () {
      if (pdfLib) return pdfLib;
      pdfLib = new Promise(function (ok, no) {
        var sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js';
        sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
        sc.onerror = function () { pdfLib = null; no(new Error('lib')); };
        document.head.appendChild(sc);
      });
      return pdfLib;
    };
    // n 쪽을 화면 폭 w(px)로 그린 캔버스 (같은 크기면 다시 쓰고, 그릴 때마다 새 캔버스로 복사해 준다)
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pageCanvas = function (n, w) {
      var key = n + '@' + Math.round(w);
      if (!pvCache[key]) {
        pvCache[key] = pvDoc.getPage(n).then(function (pg) {
          var vp = pg.getViewport({ scale: w / pg.getViewport({ scale: 1 }).width * dpr }), c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { return c; });
        });
      }
      return pvCache[key].then(function (src) {
        var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
        c.style.width = w + 'px'; c.style.height = (w * src.height / src.width) + 'px'; return c;
      });
    };
    var bodyEl, pagesEl, stageEl, msgEl;
    var setPage = function () { $('.pv-page', pv).textContent = pvDoc ? (spreadOf(pvCur).length > 1 ? spreadOf(pvCur).join('–') : pvCur) + ' / ' + pvDoc.numPages : ''; };
    var narrow = function () { return stageEl.clientWidth < 760; };
    // 전자책: 1쪽은 표지(가운데 한 장), 그 뒤로 2–3, 4–5 … 마지막이 홀로 남으면 가운데 (좁은 화면은 한 장씩)
    var spreadOf = function (n) {
      if (pvMode !== 'book' || narrow()) return [n];
      if (n === 1) return [1];
      var a = n % 2 === 0 ? n : n - 1;
      return a + 1 <= pvDoc.numPages ? [a, a + 1] : [a];
    };
    var fitW = function (count) {   // 무대 안에 쪽이 다 들어가는 폭
      var W = stageEl.clientWidth - (narrow() ? 24 : 140), H = stageEl.clientHeight - 32;
      return Math.max(120, Math.min(W / count, H / pvRatio));
    };
    var drawStage = function () {
      var sp = spreadOf(pvCur), w = fitW(pvMode === 'book' && !narrow() ? 2 : 1);
      return Promise.all(sp.map(function (n) { return pageCanvas(n, w); })).then(function (cs) {
        var row = document.createElement('div'); row.className = 'pv-spread' + (sp.length === 1 && pvMode === 'book' && !narrow() ? ' cover' : '');
        cs.forEach(function (c, i) { var f = document.createElement('div'); f.className = 'pv-leafpage' + (sp.length > 1 ? (i ? ' r' : ' l') : ''); f.appendChild(c); row.appendChild(f); });
        var old = $('.pv-spread', stageEl); if (old) stageEl.removeChild(old);
        stageEl.appendChild(row); setPage(); navState();
      });
    };
    var navState = function () {
      var last = spreadOf(pvCur); $('.pv-prev', pv).disabled = pvCur <= 1; $('.pv-next', pv).disabled = last[last.length - 1] >= pvDoc.numPages;
    };
    var stepOf = function (dir) {   // 다음 · 앞 펼침의 첫 쪽
      var sp = spreadOf(pvCur);
      if (dir > 0) return Math.min(pvDoc.numPages, sp[sp.length - 1] + 1);
      var p = sp[0] - 1; if (p < 1) return 1;
      return spreadOf(p)[0];
    };
    var reduce2 = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var go = function (dir) {
      if (!pvDoc || pvBusy || pvMode === 'scroll') return;
      var to = stepOf(dir); if (to === pvCur || (dir < 0 && pvCur <= 1)) return;
      if (pvMode === 'slide' || reduce2) {
        var cur = $('.pv-spread', stageEl);
        if (cur && !reduce2) { cur.style.transition = 'opacity .18s, transform .18s'; cur.style.opacity = '0'; cur.style.transform = 'translateX(' + (dir > 0 ? -24 : 24) + 'px)'; }
        pvBusy = true; pvCur = to;
        setTimeout(function () {
          drawStage().then(function () {
            var nw = $('.pv-spread', stageEl);
            if (nw && !reduce2) { nw.style.opacity = '0'; nw.style.transform = 'translateX(' + (dir > 0 ? 24 : -24) + 'px)'; nw.offsetWidth; nw.style.transition = 'opacity .22s, transform .22s'; nw.style.opacity = '1'; nw.style.transform = 'none'; }
            pvBusy = false;
          });
        }, reduce2 ? 0 : 160);
        return;
      }
      // 전자책: 넘기는 장(앞면 = 지금 쪽, 뒷면 = 다음(앞) 쪽)이 책등을 축으로 돌아간다.
      //   한 장(표지 · 마지막 쪽)은 가운데 있다가 넘기기 전에 제 쪽 자리로 슥 옮겨 가고, 넘긴 뒤 한 장이 남으면 가운데로 슥 돌아온다
      pvBusy = true;
      var sp = spreadOf(pvCur), nsp = (function () { var k = pvCur; pvCur = to; var r = spreadOf(to); pvCur = k; return r; })();
      var one = narrow(), w = fitW(one ? 1 : 2), SLIDE = 380;
      var single = function (s) { return !one && s.length === 1; };
      var sideOf = function (s) { return s[0] === 1 ? 1 : -1; };   // 표지는 오른쪽 쪽 자리, 끝에 홀로 남은 쪽은 왼쪽 쪽 자리
      var slide = function (el, x, ms) { el.style.transition = ms ? 'transform ' + ms + 'ms cubic-bezier(.22, .8, .24, 1)' : 'none'; el.style.transform = x ? 'translateX(' + x + 'px)' : ''; };
      var frontN = dir > 0 ? sp[sp.length - 1] : sp[0], backN = dir > 0 ? nsp[0] : nsp[nsp.length - 1];
      Promise.all([pageCanvas(frontN, w), pageCanvas(backN, w), Promise.all(nsp.map(function (n) { return pageCanvas(n, w); }))]).then(function (r) {
        var row = $('.pv-spread', stageEl), curPage = $('.pv-leafpage', row);
        var pre = single(sp) ? SLIDE : 0;
        if (pre) slide(curPage, sideOf(sp) * w / 2, SLIDE);
        setTimeout(function () {
          var under = document.createElement('div'); under.className = 'pv-spread under';
          r[2].forEach(function (c, i) { var f = document.createElement('div'); f.className = 'pv-leafpage' + (nsp.length > 1 ? (i ? ' r' : ' l') : ''); f.appendChild(c); under.appendChild(f); });
          var underPage = $('.pv-leafpage', under);
          if (single(nsp)) slide(underPage, sideOf(nsp) * w / 2, 0);
          stageEl.insertBefore(under, row);
          var face;
          if (one) { row.style.visibility = 'hidden'; face = row; }
          else {
            face = single(sp) ? curPage : (dir > 0 ? $('.pv-leafpage.r', row) : $('.pv-leafpage.l', row));
            face.style.visibility = 'hidden';
          }
          var leaf = document.createElement('div'); leaf.className = 'pv-leaf ' + (dir > 0 ? 'fwd' : 'back') + (one ? ' one' : '');
          var f1 = document.createElement('div'), f2 = document.createElement('div'); f1.className = 'pv-face front'; f2.className = 'pv-face backface';
          f1.appendChild(r[0]); f2.appendChild(r[1]); leaf.appendChild(f1); leaf.appendChild(f2);
          var ref = (one ? row : face).getBoundingClientRect(), sr = stageEl.getBoundingClientRect();
          leaf.style.left = (ref.left - sr.left) + 'px'; leaf.style.top = (ref.top - sr.top) + 'px'; leaf.style.width = ref.width + 'px'; leaf.style.height = ref.height + 'px';
          stageEl.appendChild(leaf); leaf.offsetWidth; leaf.classList.add('turn');
          setTimeout(function () {
            pvCur = to; stageEl.removeChild(leaf); stageEl.removeChild(row);
            under.classList.remove('under'); setPage(); navState();
            if (single(nsp)) { slide(underPage, 0, SLIDE); setTimeout(function () { pvBusy = false; }, SLIDE); }
            else pvBusy = false;
          }, 720);
        }, pre);
      });
    };
    var mountScroll = function () {
      pagesEl.innerHTML = '';
      if (pvIO) pvIO.disconnect();
      var w = Math.min(bodyEl.clientWidth - 28, 1100);
      pvIO = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          var box = en.target; if (!en.isIntersecting || box._done) return;
          box._done = true; pageCanvas(+box.getAttribute('data-n'), w).then(function (c) { c.style.width = '100%'; c.style.height = 'auto'; box.appendChild(c); }).catch(function () {});
        });
      }, { root: bodyEl, rootMargin: '600px 0px' });
      for (var n = 1; n <= pvDoc.numPages; n++) {
        var box = document.createElement('div'); box.className = 'pv-p'; box.setAttribute('data-n', n);
        box.style.width = w + 'px'; box.style.aspectRatio = '1 / ' + pvRatio;
        pagesEl.appendChild(box); pvIO.observe(box);
      }
      var target = $('.pv-p[data-n="' + pvCur + '"]', pagesEl); if (target) bodyEl.scrollTop = target.offsetTop - 16;
      onScrollV();
    };
    var onScrollV = function () {
      if (pvMode !== 'scroll' || !pvDoc) return;
      var top = bodyEl.getBoundingClientRect().top + 40, cur = 1;
      $$('.pv-p', pagesEl).forEach(function (bx) { if (bx.getBoundingClientRect().top <= top) cur = +bx.getAttribute('data-n'); });
      pvCur = cur; setPage();
    };
    var applyMode = function () {
      pv.setAttribute('data-mode', pvMode);
      $$('.pv-mode', pv).forEach(function (b) { var on = b.getAttribute('data-m') === pvMode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      moveInd();
      if (!pvDoc) return;
      if (pvMode === 'scroll') { stageEl.innerHTML = ''; mountScroll(); }
      else { if (pvIO) pvIO.disconnect(); pagesEl.innerHTML = ''; if (pvMode === 'book') pvCur = spreadOf(pvCur)[0]; drawStage(); }
    };
    var moveInd = function () {   // 고른 칸 배경이 미끄러지듯 옮겨 간다 (탭 규칙)
      var on = $('.pv-mode.on', pv), ind = $('.pv-ind', pv); if (!on || !ind || !on.offsetWidth) return;
      ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    };
    var isFull = function () { return document.fullscreenElement || document.webkitFullscreenElement; };
    var fullBtn = function () { var b = $('.pv-full', pv); b.innerHTML = isFull() ? ICO.unfull : ICO.full; b.setAttribute('aria-label', isFull() ? '전체화면 끄기' : '전체화면'); b.title = b.getAttribute('aria-label'); };
    var toggleFull = function () {
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (pv.requestFullscreen) pv.requestFullscreen().catch(function () {});
      else if (pv.webkitRequestFullscreen) pv.webkitRequestFullscreen();
    };
    var closeV = function (fromPop) {
      if (!pvOpen) return; pvOpen = false;
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      pv.classList.remove('on'); document.documentElement.classList.remove('pv-lock');
      if (pvIO) pvIO.disconnect();
      if (pvDoc) { pvDoc.destroy(); pvDoc = null; }
      pvCache = {};
      setTimeout(function () { if (!pvOpen) { pagesEl.innerHTML = ''; stageEl.innerHTML = ''; } }, 300);
      if (!fromPop && history.state && history.state.pv) history.back();
      if (pv._from) pv._from.focus();
    };
    var build = function () {
      pv = document.createElement('div'); pv.className = 'pv'; pv.setAttribute('role', 'dialog'); pv.setAttribute('aria-modal', 'true');
      pv.innerHTML = '<div class="pv-bar"><b class="pv-title"></b><span class="pv-page"></span>'
        + '<div class="pv-modes" role="group" aria-label="보기 방식"><span class="pv-ind" aria-hidden="true"></span>' + MODES.map(function (m) { return '<button type="button" class="pv-mode" data-m="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') + '</div>'
        + '<button type="button" class="pv-full pv-ic"></button>'
        + '<a class="pv-dl" download>' + DL + '<span>내려받기</span></a>'
        + '<button type="button" class="pv-x pv-ic" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'
        + '<div class="pv-body"><div class="pv-pages"></div><div class="pv-stage"></div><p class="pv-msg"></p>'
        + '<button type="button" class="pv-nav pv-prev" aria-label="앞 쪽">' + ICO.prev + '</button><button type="button" class="pv-nav pv-next" aria-label="다음 쪽">' + ICO.next + '</button></div>';
      document.body.appendChild(pv);
      bodyEl = $('.pv-body', pv); pagesEl = $('.pv-pages', pv); stageEl = $('.pv-stage', pv); msgEl = $('.pv-msg', pv);
      $('.pv-x', pv).addEventListener('click', function () { closeV(); });
      $('.pv-full', pv).addEventListener('click', toggleFull);
      $('.pv-prev', pv).addEventListener('click', function () { go(-1); });
      $('.pv-next', pv).addEventListener('click', function () { go(1); });
      $$('.pv-mode', pv).forEach(function (b) { b.addEventListener('click', function () {
        pvMode = b.getAttribute('data-m'); try { localStorage.setItem('pv-mode', pvMode); } catch (e) {}
        applyMode();
      }); });
      bodyEl.addEventListener('scroll', onScrollV);
      stageEl.addEventListener('click', function (e) {   // 쪽 오른쪽 절반을 누르면 다음, 왼쪽 절반은 앞
        if (pvMode === 'scroll') return; var r = stageEl.getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? 1 : -1);
      });
      var tx = null;
      stageEl.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
      stageEl.addEventListener('touchend', function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); });
      document.addEventListener('keydown', function (e) {
        if (!pvOpen) return;
        if (e.key === 'Escape' && !isFull()) closeV();
        else if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(-1); }
      });
      document.addEventListener('fullscreenchange', function () { fullBtn(); setTimeout(applyMode, 120); });
      document.addEventListener('webkitfullscreenchange', function () { fullBtn(); setTimeout(applyMode, 120); });
      window.addEventListener('popstate', function () { closeV(true); });
      var rz = 0; window.addEventListener('resize', function () { if (!pvOpen) return; clearTimeout(rz); rz = setTimeout(function () { pvCache = {}; applyMode(); }, 200); });
      if (!(pv.requestFullscreen || pv.webkitRequestFullscreen)) $('.pv-full', pv).hidden = true;   // 아이폰 사파리 등은 전체화면이 없다
    };
    var openV = function (btn) {
      if (!pv) build();
      pv._from = btn; pvOpen = true; pvCur = 1; pvCache = {};
      $('.pv-title', pv).textContent = btn.getAttribute('data-title');
      $('.pv-dl', pv).href = btn.getAttribute('data-dl');
      $('.pv-page', pv).textContent = '';
      pagesEl.innerHTML = ''; stageEl.innerHTML = ''; msgEl.textContent = '불러오는 중…'; msgEl.hidden = false;
      document.documentElement.classList.add('pv-lock'); pv.classList.add('on'); fullBtn();
      pv.setAttribute('data-mode', pvMode); applyMode();
      history.pushState({ pv: 1 }, '');
      $('.pv-x', pv).focus();
      loadLib().then(function (lib) {
        var task = lib.getDocument({ url: btn.getAttribute('data-view'), withCredentials: false });   // 서울 R2 로 넘겨받는다(쿠키 없이)
        task.onProgress = function (p) { if (p.total) msgEl.textContent = '불러오는 중… ' + Math.round(p.loaded / p.total * 100) + '%'; };
        return task.promise;
      }).then(function (doc) {
        if (!pvOpen) { doc.destroy(); return; }
        pvDoc = doc;
        return doc.getPage(1).then(function (p1) {
          var v = p1.getViewport({ scale: 1 }); pvRatio = v.height / v.width; msgEl.hidden = true; applyMode();
        });
      }).catch(function () {
        msgEl.hidden = false;
        msgEl.innerHTML = '이 화면에서 열지 못했습니다. <a href="' + escA(btn.getAttribute('data-dl')) + '" download>내려받아 보기</a>';
      });
    };
    arc.addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) openV(b); });
    // 관리자: 삭제 → 그 줄에서 한 번 더 묻고 지운다 (사용자 지시 2026-11-13)
    arc.addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]'), no = e.target.closest('[data-no]'), yes = e.target.closest('[data-yes]');
      if (d) {
        var meta = d.parentNode; meta._keep = meta.innerHTML;
        meta.innerHTML = '<span class="arc-ask">이 자료를 지울까요? 내려받는 파일도 함께 지워집니다.<button type="button" class="arc-yes" data-yes="' + d.getAttribute('data-del') + '">지우기</button><button type="button" class="arc-no" data-no>취소</button></span>';
      } else if (no) {
        var m = no.closest('.arc-meta'); m.innerHTML = m._keep;
      } else if (yes) {
        yes.disabled = true; yes.textContent = '지우는 중…';
        fetch('/xms-api/posts/' + yes.getAttribute('data-yes'), { method: 'DELETE', credentials: 'same-origin' })
          .then(function (r) {
            if (!r.ok) throw new Error();
            var row = yes.closest('.arc-row'); row.style.transition = 'opacity .3s, transform .3s'; row.style.opacity = '0'; row.style.transform = 'translateX(16px)';
            setTimeout(load, 300);   // 지운 줄은 바로 사라지고, 목록 · 개수는 새로 읽는다
          })
          .catch(function () { yes.disabled = false; yes.textContent = '다시 지우기'; });
      }
    });
    var load = function () {
      fetch('/xms-api/boards/' + slug + '/files', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : []; })
        .then(draw).catch(function () { arc.innerHTML = '<li class="arc-empty">자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</li>'; });
    };
    // 관리자인지: 사이트 Worker 가 계정 버튼 자리(data-xa-me)에 넣어 둔 값 — 따로 묻지 않는다
    try { admin = !!JSON.parse(($('[data-xms-account]') || {}).getAttribute ? $('[data-xms-account]').getAttribute('data-xa-me') || '{}' : '{}').admin; } catch (e) { admin = false; }
    var ab = $('[data-arc-admin]'); if (ab && admin) ab.hidden = false;
    // 목록: 사이트 Worker 가 페이지와 함께 넣어 준 것(script#xms-files)을 바로 그린다 — 없을 때만 따로 받는다 (xim 공통, 사용자 지시 2026-11-13)
    var pre = document.getElementById('xms-files-' + slug), first = null;
    try { first = pre ? JSON.parse(pre.textContent) : null; } catch (e) { first = null; }
    if (Array.isArray(first)) draw(first); else load();
  }

  /* 제품 사진 띠: 천천히 흐르다가, 손가락 · 마우스로 밀면 따라오고 세게 밀면 관성으로 빨리 넘어간다 (사용자 지시 2026-11-13 "폰에서 스와이프로 빨리") */
  $$('.nt-strip').forEach(function (strip) {
    var track = $('.nt-track', strip); if (!track || reduce) return;
    strip.classList.add('js-flow');
    var x = 0, v = 0, half = 0, last = 0, drag = null, hover = false, moved = 0;
    var SPEED = function () { return half / 70; };   // CSS 때와 같은 빠르기(한 바퀴 70초)
    var measure = function () { half = track.scrollWidth / 2 + 7; };
    measure(); window.addEventListener('resize', measure);
    $$('img', track).forEach(function (im) { if (!im.complete) im.addEventListener('load', measure); });
    var wrap = function () { if (!half) return; while (x <= -half) x += half; while (x > 0) x -= half; };
    var tick = function (t) {
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
      if (!drag) {
        if (Math.abs(v) > 5) { x += v * dt; v *= Math.pow(0.04, dt); }   // 던진 힘이 차츰 줄어든다
        else { v = 0; if (!hover) x -= SPEED() * dt; }
      }
      wrap(); track.style.transform = 'translate3d(' + x + 'px,0,0)';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    strip.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
    strip.addEventListener('pointerleave', function () { hover = false; });
    strip.addEventListener('pointerdown', function (e) {
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: performance.now(), on: false }; v = 0; moved = 0;
    });
    strip.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, now = performance.now();
      if (!drag.on) {   // 옆으로 밀 때만 잡는다(위아래로 내리면 페이지 스크롤)
        if (Math.abs(e.clientX - drag.x0) < 6) return;
        if (Math.abs(e.clientY - drag.y0) > Math.abs(e.clientX - drag.x0)) { drag = null; return; }
        drag.on = true; try { strip.setPointerCapture(e.pointerId); } catch (er) { /* 오래된 브라우저 */ }
      }
      x += dx; moved += Math.abs(dx);
      var dt = Math.max(1, now - drag.t); v = 0.8 * (dx / dt * 1000) + 0.2 * v;
      drag.x = e.clientX; drag.t = now;
    });
    var up = function () { if (!drag) return; if (performance.now() - drag.t > 120) v = 0; drag = null; };
    strip.addEventListener('pointerup', up); strip.addEventListener('pointercancel', up);
    strip.addEventListener('click', function (e) { if (moved > 8) { e.preventDefault(); e.stopPropagation(); } moved = 0; }, true);
    strip.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });

  /* 스크롤 등장 + 숫자 올라가기 */
  // 숫자 올라가기 (사용자 지시 2026-11-13 "더 세련되게"): 자리마다 숫자 띠가 굴러 올라가는 오도미터.
  //   일의 자리가 가장 많이 돌고 먼저 출발, 윗자리는 조금 늦게 덜 돈다. 한 묶음은 모두 같은 순간에 부드럽게 내려앉는다
  var ODO_T = 2200;
  function countUp(el) {
    var raw = el.getAttribute('data-count'), to = parseFloat(raw), dec = (raw.split('.')[1] || '').length;
    var txt = dec ? to.toFixed(dec) : to.toLocaleString('en-US');
    el.setAttribute('aria-label', txt);
    if (reduce || dec) { el.textContent = txt; return; }
    var chars = txt.split(''), n = 0, html = '';
    chars.forEach(function (ch) { if (/\d/.test(ch)) n++; });
    var k = 0;
    chars.forEach(function (ch) {
      if (!/\d/.test(ch)) { html += '<span class="odo-c" aria-hidden="true">' + ch + '</span>'; return; }
      var pos = n - 1 - k++;                      // 0 = 일의 자리
      var spins = Math.max(1, 3 - pos), strip = '';
      for (var i = 0; i <= spins * 10 + +ch; i++) strip += '<i>' + (i % 10) + '</i>';
      html += '<span class="odo-d" aria-hidden="true"><span class="odo-s" data-to="' + (spins * 10 + +ch) + '" data-delay="' + pos * 140 + '">' + strip + '</span></span>';
    });
    el.innerHTML = html;
    el.classList.add('odo');
    el.offsetWidth;                                   // 시작 위치를 먼저 그리게
    $$('.odo-s', el).forEach(function (s) {
      var d = +s.getAttribute('data-delay');
      s.style.transitionDelay = d + 'ms';
      s.style.transitionDuration = (ODO_T - d) + 'ms';
      s.style.transform = 'translateY(-' + s.getAttribute('data-to') + 'em)';
    });
    el.classList.add('go');
  }
  $$('.st-vis').forEach(function (v) { var it = $$('i', v); it.forEach(function (i, n) { i.style.transitionDelay = Math.round(200 + n * 1700 / it.length) + 'ms'; }); });
  var rvs = $$('.rv, .world'), counts = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        if (el.hasAttribute('data-count')) {
          // 같은 묶음(.stats 등)의 숫자는 함께 출발한다
          var grp = el.closest('.stats, ul, .fac-cards') || el, all = $$('[data-count]', grp);
          all.forEach(function (c) { if (!c._ran) { c._ran = true; io.unobserve(c); countUp(c); } });
          if (grp.classList) grp.classList.add('counted');
        } else el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    rvs.concat(counts).forEach(function (el) { io.observe(el); });
  } else {
    rvs.forEach(function (el) { el.classList.add('in'); });
    counts.forEach(function (el) { el.firstChild.nodeValue = el.getAttribute('data-count'); });
  }

  /* 첫 화면: 배경 영상(Vimeo) 한 번 → 사진 3장 차례로 → 다시 영상부터 (사용자 지시 2026-11-12)
     영상이 안 열리거나 움직임 줄이기면 사진만 돈다. Vimeo 와는 postMessage 로 주고받는다(재생 · 끝남 · 처음으로) */
  var hero = $('.hero'), slides = $$('.slide'), hv = $('.hero-video');
  var cur = 0, bar = $('.hero-cap .bar i'), cnt = $('.hero-cap .count'), caps = $$('[data-cap]'), timer = 0, SLIDE_MS = 6500;
  function show(i) {
    slides[cur].classList.remove('on'); cur = i; slides[cur].classList.add('on');
    if (cnt) cnt.textContent = ('0' + (cur + 1)).slice(-2);
    caps.forEach(function (c, k) { c.hidden = k !== cur; });
    if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
  }
  // 사진만 계속 돌기 (영상이 없을 때)
  function slidesForever() {
    clearTimeout(timer);
    (function next() { timer = setTimeout(function () { if (!doc.hidden) show((cur + 1) % slides.length); next(); }, SLIDE_MS); })();
  }
  // 순서: 영상 첫 화면(그림) → 영상 → 사진 1 · 2 · 3 → 다시 영상. 사진은 영상이 끝난 뒤에만 보인다(.slides-on)
  var fr = null, player = null, vPlaying = false;
  function photos() { hero.classList.add('slides-on'); hero.classList.remove('has-video'); }
  function videoOn() { vPlaying = true; clearTimeout(timer); hero.classList.remove('slides-on'); hero.classList.add('has-video'); fr.classList.add('loaded'); }
  function videoEnded() {
    if (!vPlaying) return;
    vPlaying = false;
    player.pause().catch(function () {});
    show(0); photos();
    var k = 0;
    clearTimeout(timer);
    (function next() {
      timer = setTimeout(function () {
        if (++k < slides.length) { show(k); next(); return; }
        player.setCurrentTime(0).then(function () { return player.play(); }).catch(function () { slidesForever(); });
      }, SLIDE_MS);
    })();
  }
  function fallback() { if (fr) fr.remove(); fr = null; photos(); slidesForever(); }   // 영상이 안 되면 사진만
  if (hv && hv.getAttribute('data-vimeo') && !reduce) {
    fr = doc.createElement('iframe');
    fr.src = 'https://player.vimeo.com/video/' + hv.getAttribute('data-vimeo') + '?background=1&autoplay=1&loop=0&muted=1&autopause=0&dnt=1';
    fr.allow = 'autoplay; fullscreen; picture-in-picture'; fr.title = '배경 영상'; fr.setAttribute('tabindex', '-1');
    hv.appendChild(fr);
    var waiting = setTimeout(function () { if (!vPlaying) fallback(); }, 12000);
    var sc = doc.createElement('script');
    sc.src = 'https://player.vimeo.com/api/player.js';
    sc.onload = function () {
      player = new window.Vimeo.Player(fr);
      player.setLoop(false).catch(function () {});
      player.on('playing', function () { if (!vPlaying) { clearTimeout(waiting); setTimeout(videoOn, 250); } });
      player.on('ended', videoEnded);
      player.on('timeupdate', function (d) { if (vPlaying && d.duration && d.seconds >= d.duration - .35) videoEnded(); });   // 'ended' 가 안 올 때 대비
      player.play().catch(function () {});
    };
    sc.onerror = fallback;
    doc.head.appendChild(sc);
  } else if (hero) { photos(); if (slides.length > 1 && !reduce) slidesForever(); }   // 하위 페이지엔 첫 화면 슬라이드가 없다
  if (bar && slides.length > 1) bar.classList.add('run');

  /* 선언문: 스크롤을 내리면 글자가 차례로 채워진다 */
  var st = $('.statement');
  if (st) {
    var html = '';
    [].slice.call(st.childNodes).forEach(function (n) {
      var hl = n.nodeType === 1 && n.classList.contains('hl');
      (n.textContent || '').split(/(\s+)/).forEach(function (w) {
        html += /^\s+$/.test(w) || !w ? w : '<span class="w' + (hl ? ' hl' : '') + '">' + w + '</span>';
      });
    });
    st.innerHTML = html;
    var ws = $$('.w', st);
    // 선언문은 화면에 붙어 있는 동안(.state-track 높이만큼) 천천히 채워진다 — 다 채워진 뒤에 아래로 내려간다 (사용자 지시 2026-11-12)
    var track = st.closest('.state-track');
    var fill = function () {
      var vh = window.innerHeight, p;
      if (track && getComputedStyle(track.firstElementChild).position === 'sticky') {   // 붙여 둘 때만(낮은 화면 · 움직임 줄이기면 그냥 지나가며 채움)
        var t = track.getBoundingClientRect();
        // 구간이 화면 절반쯤 올라왔을 때 시작 → 붙어 있는 거리의 70% 에서 다 채움(나머지 30% 는 다 읽을 틈)
        p = Math.min(1, Math.max(0, (vh * .5 - t.top) / (vh * .5 + (t.height - vh) * .7)));
      } else {
        var r = st.getBoundingClientRect();
        p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (r.height + vh * .35)));
      }
      var n = Math.round(p * ws.length);
      ws.forEach(function (w, i) { w.classList.toggle('on', i < n); });
      if (cue) { cue.style.setProperty('--p', p.toFixed(3)); cue.parentNode.classList.toggle('done', p >= 1); }
    };
    var cue = $('.state-cue');
    if (reduce) ws.forEach(function (w) { w.classList.add('on'); }); else { window.addEventListener('scroll', fill, { passive: true }); fill(); }
  }

  /* 알약 탭: 떠 있는 배경 하나(.seg-ind)가 고른 칸으로 미끄러진다 */
  function seg(box, onPick) {
    if (!box) return;
    var ind = box.querySelector('.seg-ind');
    if (!ind) { ind = doc.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    function place() {
      var on = box.querySelector('button.on');
      if (!on || !on.offsetWidth) { box.classList.add('no-ind'); return; }
      box.classList.remove('no-ind');
      ind.style.width = on.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || b.classList.contains('on')) return;
      $$('button', box).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      place();
      if (b.scrollIntoView && box.scrollWidth > box.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
      onPick(b.getAttribute('data-v'));
    });
    place();
    window.addEventListener('resize', place);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
    window.addEventListener('load', place);
  }

  /* 소싱 전략 매트릭스: WOVEN / KNIT */
  var mx = $('#matrix');
  if (mx) {
    // 화면에 붙어 있는 동안 반을 넘게 내리면 KNIT, 다시 올리면 WOVEN (탭인 줄 모르고 지나치지 않게)
    var mxSec = mx.closest('.mx-scroll'), mxCol = $('.mx-col'), mxPin = $('.mx-pin');
    if (mxSec) {
      var wideQ = window.matchMedia('(min-width: 1024px) and (min-height: 760px)'), wide = function () { return wideQ.matches; };
      var mxCue = $('.mx-cue'), cueP = function (v) { if (!mxCue) return; v = Math.min(1, Math.max(0, v)); mxCue.style.setProperty('--p', v.toFixed(3)); mxCue.classList.toggle('done', v >= 1); };
      var mxPick = function () {
        var p;
        if (wide()) {   // PC: 구간 전체가 붙어 있는 동안 반을 넘게 내리면 KNIT
          var r = mxSec.getBoundingClientRect(); p = -r.top / Math.max(1, r.height - innerHeight);
          if (p < 0 || p > 1) return;
          cueP(p / .6);
          p = p > .5 ? 1 : 0;
        } else if (mxCol && mxPin) {   // 폰: 표가 가운데 붙은 뒤로 내린 거리 — 60% 를 넘어야 KNIT (보기도 전에 넘어가지 않게)
          var c = mxCol.getBoundingClientRect(), pr = mxPin.getBoundingClientRect(), run = c.height - pr.height;
          if (run < 50) return;
          p = (pr.top - c.top) / run;
          cueP(p / .7);
          p = p > .6 ? 1 : p < .3 ? 0 : -1;
          if (p < 0) return;
        } else return;
        var want = p ? 'knit' : 'woven', b = $('#matrix-seg button[data-v="' + want + '"]');
        if (b && !b.classList.contains('on')) b.click();
      };
      var pinH = function () { if (mxPin) mxSec.style.setProperty('--pin-h', mxPin.offsetHeight + 'px'); };
      pinH(); window.addEventListener('resize', pinH); window.addEventListener('load', pinH);
      window.addEventListener('scroll', mxPick, { passive: true });
    }
    seg($('#matrix-seg'), function (v) {
      $$('.mx', mx).forEach(function (p) { p.hidden = p.getAttribute('data-k') !== v; });
      $$('[data-mk]').forEach(function (p) { p.hidden = p.getAttribute('data-mk') !== v; });
    });
  }

  /* 실적 사진 줄: 사진을 자르지 않고, 줄 높이를 맞춰 가로를 꽉 채운다(넘치면 옆으로 넘겨 보기) */
  function fitGallery(g) {
    var imgs = $$('img', g), sum = 0, gap = 6;
    for (var i = 0; i < imgs.length; i++) { if (!imgs[i].naturalWidth) return; sum += imgs[i].naturalWidth / imgs[i].naturalHeight; }
    var w = g.clientWidth - gap * (imgs.length - 1);
    var maxH = window.innerWidth < 768 ? 320 : 560, minH = window.innerWidth < 768 ? 220 : 300;
    var h = Math.max(minH, Math.min(maxH, w / sum));
    imgs.forEach(function (im) { im.style.height = Math.floor(h) + 'px'; });
  }
  // 사진 줄은 화면 가까이 왔을 때만 불러온다(처음부터 수십 장을 받지 않게)
  var galIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (!e.isIntersecting) return; galIO.unobserve(e.target); $$('img', e.target).forEach(function (im) { im.loading = 'eager'; }); });
  }, { rootMargin: '800px 0px' }) : null;
  $$('.gallery').forEach(function (g) {
    $$('img', g).forEach(function (im) { if (!im.complete) im.addEventListener('load', function () { fitGallery(g); }); });
    if (galIO) galIO.observe(g); else $$('img', g).forEach(function (im) { im.loading = 'eager'; });
    fitGallery(g);
    window.addEventListener('resize', function () { fitGallery(g); });
  });

  /* 실적 필터 */
  var cases = $('#cases');
  if (cases) {
    seg($('#case-filter'), function (v) {
      $$('.case', cases).forEach(function (c) { c.hidden = v !== 'all' && (' ' + c.getAttribute('data-k') + ' ').indexOf(' ' + v + ' ') < 0; });
    });
  }

  /* 회사 약도: 카카오 지도(주소로 자리 찾기). JavaScript 키(data-key)가 있을 때만 지도를 그린다 — 없으면 주소 카드 + 카카오맵 · 네이버 지도 버튼 */
  var mb = $('[data-kakao-map]');
  if (mb && mb.getAttribute('data-naver') !== null) {
    // 네이버 지도: xim 공용 지도(한 주소에서 그림)를 iframe 으로 — 네이버에 이 사이트 주소를 따로 등록하지 않아도 된다 (사용자 지시 2026-11-14)
    var fr = doc.createElement('iframe'), box0 = $('.map-canvas', mb);
    fr.src = 'https://xim.plators.com/map?addr=' + encodeURIComponent(mb.getAttribute('data-addr')) + '&name=' + encodeURIComponent(mb.getAttribute('data-name') || '') + '&zoom=' + (mb.classList.contains('map-mini') ? 16 : 17) + (mb.classList.contains('map-mini') ? '' : '&shift=1');
    fr.title = (mb.getAttribute('data-name') || '') + ' 위치 지도'; fr.loading = 'lazy';
    fr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
    box0.appendChild(fr); mb.classList.add('is-live');
  } else if (mb && mb.getAttribute('data-key')) {
    var ks = doc.createElement('script');
    ks.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=' + encodeURIComponent(mb.getAttribute('data-key'));
    ks.onload = function () {
      window.kakao.maps.load(function () {
        var K = window.kakao.maps, box = $('.map-canvas', mb);
        new K.services.Geocoder().addressSearch(mb.getAttribute('data-addr'), function (r, st) {
          if (st !== K.services.Status.OK || !r[0]) return;
          var at = new K.LatLng(r[0].y, r[0].x);
          box.innerHTML = '';
          var map = new K.Map(box, { center: at, level: 3 });
          map.setZoomable(false);
          if (innerWidth > 767) map.panBy(-Math.min(220, box.clientWidth * .18), 0);   // 왼쪽 주소 카드에 가리지 않게 자리를 오른쪽으로
          new K.Marker({ map: map, position: at });
          new K.CustomOverlay({ map: map, position: at, yAnchor: 2.4, content: '<div class="map-pin">' + mb.getAttribute('data-name') + '</div>' });
          map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
          mb.classList.add('is-live');
        });
      });
    };
    doc.head.appendChild(ks);
  }

  /* 자주 묻는 질문: 열고 닫을 때 높이가 부드럽게 늘었다 줄었다 (사용자 지시 2026-11-12) */
  $$('.faq details').forEach(function (d) {
    var sum = d.querySelector('summary'), anim = null;
    if (!sum || !d.animate) return;
    sum.addEventListener('click', function (e) {
      if (reduce) return;
      e.preventDefault();
      if (anim) anim.cancel();
      d.style.overflow = 'hidden';
      var from = d.offsetHeight, opening = !d.open, to;
      if (opening) { d.open = true; to = d.offsetHeight; } else { to = sum.offsetHeight; }
      d.classList.toggle('is-closing', !opening);
      anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: opening ? 380 : 300, easing: 'cubic-bezier(.22, .8, .24, 1)' });
      anim.onfinish = function () { if (!opening) d.open = false; d.style.overflow = ''; d.classList.remove('is-closing'); anim = null; };
      anim.oncancel = function () { d.style.overflow = ''; };
    });
  });

  /* 문의 내용 글자 수 (600자까지 — 사용자 지시 2026-11-12) */
  $$('textarea[maxlength]').forEach(function (ta) {
    var c = ta.parentNode.querySelector('.f-count b'); if (!c) return;
    var max = +ta.getAttribute('maxlength');
    var up = function () { if (ta.value.length > max) ta.value = ta.value.slice(0, max); c.textContent = ta.value.length; c.parentNode.classList.toggle('is-full', ta.value.length >= max); };
    ta.addEventListener('input', up); up();
  });

  /* 날짜 칸은 어디를 눌러도 달력이 뜨게 (사용자 지시 2026-11-12) */
  $$('input[type="date"], input[type="month"]').forEach(function (d) {
    d.addEventListener('click', function () { try { if (d.showPicker) d.showPicker(); } catch (x) { /* 오래된 브라우저 */ } });
    // 희망 납기는 오늘부터 고를 수 있게 (날짜까지 — 사용자 지시 2026-11-13)
    if (d.name === 'due' && d.type === 'date') { var t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); d.min = t.toISOString().slice(0, 10); }
  });

  /* 생산 문의 폼 → /site-api/inquiry (xim '제작문의' 로 모인다). 봇 확인 = Cloudflare Turnstile */
  var form = $('#inquiry');
  if (form) {
    var err = $('.f-err', form), send = $('.f-send', form), bot = $('.f-bot', form), widget = null, sitekey = '';
    fetch('/site-api/inquiry-key').then(function (r) { return r.json(); }).then(function (d) {
      sitekey = d.sitekey || '';
      if (!sitekey) return;
      // 확인 상자는 300px 아래로 줄지 않는다 → 좁은 폰에서는 작은 모양(compact)으로 (가로 넘침 막기)
      window.bsfBotReady = function () { widget = window.turnstile.render(bot, { sitekey: sitekey, language: 'ko', size: bot.clientWidth < 300 ? 'compact' : 'flexible' }); };
      var sc = doc.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bsfBotReady';
      sc.async = true; doc.head.appendChild(sc);
    }).catch(function () {});
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements;
      var items = $$('input[name="item"]:checked', form).map(function (x) { return x.value; });
      // 빠뜨린 칸: 그 자리로 화면을 옮기고, 빨갛게 흔들어 표시 + 바로 아래에 안내 (사용자 지시 2026-11-12)
      function need(el, msg, box) {
        err.textContent = msg;
        box = box || (el && (el.closest('.f, .agree') || el));
        $$('.f-bad', form).forEach(function (x) { x.classList.remove('f-bad'); });
        $$('.f-msg', form).forEach(function (x) { x.remove(); });
        if (!box) return;
        void box.offsetWidth; box.classList.add('f-bad');
        var m = doc.createElement('p'); m.className = 'f-msg'; m.setAttribute('role', 'alert'); m.textContent = msg;
        box.insertAdjacentElement('afterend', m);
        var y = box.getBoundingClientRect().top + window.pageYOffset - (window.innerHeight * .28);
        window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
        if (el && el.focus) setTimeout(function () { el.focus({ preventScroll: true }); }, reduce ? 0 : 450);
        var clear = function () { box.classList.remove('f-bad'); m.remove(); err.textContent = ''; };
        box.addEventListener('input', clear, { once: true }); box.addEventListener('change', clear, { once: true });
      }
      if (!items.length) return need(null, '만들 품목을 하나 이상 골라 주세요.', $('.picks', form));
      if (!f.company.value.trim()) return need(f.company, '회사 · 브랜드명을 넣어 주세요.');
      if (!f.name.value.trim()) return need(f.name, '담당자 이름을 넣어 주세요.');
      if (!f.contact.value.trim()) return need(f.contact, '연락처(전화 또는 이메일)를 넣어 주세요.');
      if (!f.agree.checked) return need(f.agree, '개인정보 수집 · 이용에 동의해 주세요.');
      var token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : '';
      if (sitekey && !token) return need(null, '"사람입니다" 확인을 먼저 끝내 주세요.', bot);
      var msg = [
        '품목: ' + items.join(', '),
        '예상 수량: ' + (f.qty.value || '-'),
        '희망 납기: ' + (f.due.value || '-'),
        '샘플 · 디자인 준비: ' + (f.ready.value || '-'),
        f.email.value ? '이메일: ' + f.email.value : '',
        '',
        f.message.value.trim() || '(내용 없음)'
      ].filter(function (x, i) { return x !== '' || i === 5; }).join('\n');
      send.disabled = true; send.textContent = '보내는 중…';
      fetch('/site-api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name.value, contact: f.contact.value, org: f.company.value, kind: items.join(', ').slice(0, 40), message: msg, turnstile: token }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.d.error || '보내지 못했습니다.');
          form.hidden = true; $('#inquiry-done').hidden = false;
          window.scrollTo({ top: $('#inquiry-done').getBoundingClientRect().top + window.pageYOffset - 120, behavior: reduce ? 'auto' : 'smooth' });
        })
        .catch(function (e2) { err.textContent = e2.message || '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'; if (widget !== null && window.turnstile) window.turnstile.reset(widget); })
        .then(function () { send.disabled = false; send.textContent = '문의 보내기'; });
    });
  }

  // 서랍의 '로그인' 은 로그인 전에만 (계약 버튼 자리에 사람 버튼이 생기면 숨긴다)
  var acc = $('.hd-account'), gl = $('.gnb-login');
  if (acc && gl && window.MutationObserver) {
    var syncLogin = function () { gl.hidden = !!acc.firstElementChild && !acc.querySelector('.xa-login'); };
    new MutationObserver(syncLogin).observe(acc, { childList: true, subtree: true });
    syncLogin();
  }
})();
