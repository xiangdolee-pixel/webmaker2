/* 온길교회 — 공통 동작 (ES5, 라이브러리 없음) */
(function () {
  'use strict';
  var doc = document, win = window;
  var $ = function (s, p) { return (p || doc).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || doc).querySelectorAll(s)); };
  var reduce = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 로컬 미리보기(파일 서버)는 .html 이 있어야 열리고, 실제 사이트는 .html 없이 연다(한 번 더 돌아가지 않게)
  var local = location.protocol === 'file:' || /\.html?$/i.test(location.pathname) || location.port === '8732';
  var base = local ? '' : '/';
  var page = function (n) { return base + n + (local ? '.html' : ''); };
  var here = location.pathname.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
  var name = here.split('/').pop();

  /* 머리: 내리면 흰 유리로 */
  var hd = $('.hd');
  if (hd) {
    var onScroll = function () { hd.classList.toggle('solid', win.scrollY > 24); };
    onScroll();
    win.addEventListener('scroll', onScroll, { passive: true });
    var tg = $('.nav-toggle', hd);
    var setOpen = function (v) {
      hd.classList.toggle('open', v);
      tg.setAttribute('aria-expanded', v ? 'true' : 'false');
      tg.setAttribute('aria-label', v ? '메뉴 닫기' : '메뉴 열기');
    };
    if (tg) {
      tg.addEventListener('click', function () { setOpen(!hd.classList.contains('open')); });
      doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
      doc.addEventListener('click', function (e) { if (hd.classList.contains('open') && !hd.contains(e.target)) setOpen(false); });
    }

    /* 교회소개 아래 메뉴: 머리 메뉴는 관리 화면에서 바뀔 수 있어, 교회소개 칸을 찾아 그 아래에 붙인다 */
    var ABOUT = [['about', '교회소개'], ['pastor', '담임목사'], ['worship', '예배시간'], ['location', '오시는 길']];
    var inAbout = ABOUT.some(function (a) { return a[0] === name; });
    var aboutLink = $$('.gnb a').filter(function (a) {
      if (a.classList.contains('btn')) return false;
      var p = a.pathname.replace(/\.html?$/i, '').split('/').pop();
      return p === 'about';
    })[0];
    if (aboutLink) {
      var g = doc.createElement('div'), sub = doc.createElement('div');
      g.className = 'gnb-group'; sub.className = 'gnb-sub';
      ABOUT.forEach(function (a) {
        var l = doc.createElement('a');
        l.href = page(a[0]); l.textContent = a[1];
        if (a[0] === name) l.setAttribute('aria-current', 'page');
        sub.appendChild(l);
      });
      aboutLink.parentNode.insertBefore(g, aboutLink);
      g.appendChild(aboutLink); g.appendChild(sub);
      if (inAbout) { aboutLink.removeAttribute('aria-current'); aboutLink.classList.add('here'); }
    }
    /* 지금 있는 곳 표시 (로컬 미리보기 · 게시판) */
    $$('.gnb > a:not(.btn)').forEach(function (a) {
      var p = a.pathname.replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
      if (p !== '/' && (here === p || here.indexOf(p + '/') === 0 || name === p.split('/').pop())) a.classList.add('here');
    });
  }

  /* 하위 메뉴 알약: 떠 있는 배경 하나가 미끄러진다 (페이지를 옮겨도 이어지게 view-transition) */
  $$('.seg').forEach(function (seg) {
    var ind = doc.createElement('i'); ind.className = 'seg-ind';
    seg.insertBefore(ind, seg.firstChild);
    var place = function (a, quiet) {
      if (!a || !a.offsetWidth) { seg.classList.remove('ready'); return; }
      if (quiet) ind.style.transition = 'none';
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
      if (quiet) { void ind.offsetWidth; ind.style.transition = ''; }
      seg.classList.add('ready');
    };
    var cur = function () { return $('a.on', seg); };
    place(cur(), true);
    seg.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a || a === cur()) return;
      cur() && cur().classList.remove('on');
      a.classList.add('on'); place(a);
    });
    win.addEventListener('resize', function () { place(cur(), true); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { place(cur(), true); });
    win.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      $$('a', seg).forEach(function (a) { a.classList.toggle('on', a.hasAttribute('aria-current')); });
      place(cur(), true);
    });
    var on = cur(), box = seg.parentNode;
    if (on && box.scrollWidth > box.clientWidth) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  });

  /* 스크롤하면 나타나기 */
  var rv = $$('[data-reveal]');
  if (rv.length) {
    if (reduce || !('IntersectionObserver' in win)) rv.forEach(function (el) { el.classList.add('in'); });
    else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      rv.forEach(function (el) { io.observe(el); });
    }
  }

  /* 첫 화면 사진 넘기기 */
  var slides = $('[data-slides]');
  if (slides) {
    var imgs = $$('img', slides), dots = $('[data-dots]'), at = 0, ds = [];
    if (dots) imgs.forEach(function () { var i = doc.createElement('i'); dots.appendChild(i); ds.push(i); });
    if (ds[0]) ds[0].classList.add('on');
    var show = function (n) {
      var im = imgs[n];
      var go = function () {
        imgs[at].classList.remove('on'); ds[at] && ds[at].classList.remove('on');
        at = n; im.classList.add('on'); ds[at] && ds[at].classList.add('on');
      };
      if (im.getAttribute('data-src')) {
        var pre = new Image();
        pre.onload = function () { im.src = pre.src; im.removeAttribute('data-src'); go(); };
        pre.src = (win.matchMedia('(max-width: 767px)').matches && im.getAttribute('data-src-m')) || im.getAttribute('data-src');
      } else go();
    };
    if (imgs.length > 1 && !reduce) setInterval(function () { if (!doc.hidden && !doc.body.classList.contains('xe-on')) show((at + 1) % imgs.length); }, 6500);
  }

  /* 흐르는 사진: 한 번 더 이어 붙여 끊김 없이 흐르고, 손가락으로 밀거나 마우스로 끌면 그대로 따라온다 */
  var track = $('[data-drift]');
  if (track) {
    var gal = track.parentNode, first = $('figure', track), n0 = $$('figure', track).length;
    $$('figure', track).forEach(function (f) {
      var c = f.cloneNode(true); c.setAttribute('aria-hidden', 'true');
      track.appendChild(c);
    });
    var loopW = function () { var c = $$('figure', track)[n0]; return c ? c.offsetLeft - first.offsetLeft : 0; };   // 한 바퀴 길이
    var wrap = function () {
      var w = loopW(); if (!w) return;
      if (gal.scrollLeft >= w) { gal.scrollLeft -= w; pos = gal.scrollLeft; }
      else if (gal.scrollLeft <= 0 && held) { gal.scrollLeft += w; pos = gal.scrollLeft; if (dragging) startL += w; }
    };
    var pos = 0, held = false, dragging = false, startX = 0, startL = 0, moved = 0, wake = 0, seen = true, last = 0;
    var hold = function () { held = true; clearTimeout(wake); };
    var release = function (ms) { clearTimeout(wake); wake = setTimeout(function () { held = false; pos = gal.scrollLeft; }, ms); };
    // 손가락: 브라우저가 알아서 민다 — 미는 동안 멈췄다가 잠시 뒤 다시 흐른다
    gal.addEventListener('touchstart', hold, { passive: true });
    gal.addEventListener('touchend', function () { release(2600); }, { passive: true });
    gal.addEventListener('touchcancel', function () { release(2600); }, { passive: true });
    gal.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { hold(); release(2000); } }, { passive: true });
    // 마우스: 누른 채 끌기
    gal.addEventListener('mouseenter', hold);
    gal.addEventListener('mouseleave', function () { if (!dragging) release(300); });
    gal.addEventListener('mousedown', function (e) {
      if (e.button) return;
      dragging = true; moved = 0; startX = e.clientX; startL = gal.scrollLeft; hold(); gal.classList.add('drag'); e.preventDefault();
    });
    win.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      moved = Math.abs(e.clientX - startX);
      gal.scrollLeft = startL - (e.clientX - startX); wrap();
    });
    win.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false; gal.classList.remove('drag');
      if (!gal.matches(':hover')) release(300);
    });
    gal.addEventListener('scroll', function () { if (held) wrap(); }, { passive: true });
    if ('IntersectionObserver' in win) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }).observe(gal);
    if (!reduce) {
      var step = function (t) {
        var dt = Math.min(64, t - (last || t)); last = t;
        if (!held && seen && !doc.hidden) {
          pos += dt * 0.032;   // 1초에 32px
          var w = loopW();
          if (w && pos >= w) pos -= w;
          gal.scrollLeft = pos;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  /* 사역 미리보기: 목록에 닿으면 왼쪽 사진이 바뀐다 */
  var mini = $('.mini');
  if (mini) {
    var items = $$('.mini-item', mini), photos = $$('.mini-photo img', mini), cur = 0;
    var pick = function (n) {
      if (n === cur) return;
      items[cur].classList.remove('on'); photos[cur] && photos[cur].classList.remove('on');
      cur = n; items[cur].classList.add('on');
      if (photos[cur]) { photos[cur].loading = 'eager'; photos[cur].classList.add('on'); }
    };
    items.forEach(function (it, n) {
      it.addEventListener('mouseenter', function () { pick(n); });
      it.addEventListener('focus', function () { pick(n); });
    });
    var wide = win.matchMedia('(min-width: 768px)'), tick = 0, hovering = false;
    mini.addEventListener('mouseenter', function () { hovering = true; });
    mini.addEventListener('mouseleave', function () { hovering = false; });
    win.addEventListener('scroll', function () {
      if (tick || hovering || !wide.matches) return;
      tick = requestAnimationFrame(function () {
        tick = 0;
        var mid = win.innerHeight * 0.5, best = -1, gap = 1e9;
        items.forEach(function (it, n) {
          var r = it.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
          if (r.bottom > 0 && r.top < win.innerHeight && d < gap) { gap = d; best = n; }
        });
        if (best >= 0) pick(best);
      });
    }, { passive: true });
  }

  /* 최근 글 (설교말씀 · 주보·소식): 페이지에 함께 온 목록을 쓰고, 없으면 받아 온다 */
  $$('[data-xms-latest]').forEach(function (ul) {
    var slug = ul.getAttribute('data-xms-latest'), n = ul.getAttribute('data-n') || 4;
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var draw = function (list) {
      if (!list || !list.length) return;
      ul.innerHTML = list.map(function (p) {
        return '<li><a href="' + esc(p.url) + '">' + (p.thumb && ul.hasAttribute('data-thumb') ? '<img src="' + esc(String(p.thumb).replace('/hqdefault.jpg', '/mqdefault.jpg')) + '" alt="" loading="lazy" width="84" height="56">' : '') +
          '<span class="pt"><b>' + esc(p.title) + '</b>' + (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') + '</span><time>' + esc(p.date) + '</time></a></li>';
      }).join('');
    };
    var emb = doc.getElementById('xms-latest-' + slug);
    if (emb) { try { draw(JSON.parse(emb.textContent)); } catch (e) { /* 빈 목록 그대로 */ } return; }
    if (local) return;
    fetch('/xms-api/boards/' + slug + '/latest?n=' + n).then(function (r) { return r.ok ? r.json() : []; }).then(draw).catch(function () {});
  });

  /* 색 바꿔 보기 (오른쪽 아래 무지개 단추): 고른 색은 html[data-pal] 로 걸고 이 브라우저에 기억 — 첫 그림 전에 거는 건 <head> 의 한 줄 */
  var PALS = [
    ['', '온길 네이비', '#20344E'], ['royal', '로열 블루', '#2A44C0'], ['steel', '스틸 블루', '#2F5179'], ['teal', '딥 틸', '#0E5E6A'],
    ['emerald', '에메랄드', '#0D6650'], ['forest', '포레스트', '#2F4A36'], ['wine', '버건디', '#7A1E3A'], ['plum', '플럼', '#5A2B5F'],
    ['terracotta', '테라코타', '#A9502E'], ['mocha', '모카', '#5B4234'], ['charcoal', '차콜', '#2E333D'], ['black', '블랙 · 골드', '#0B0B0D'],
    ['pastel-pink', '블러시 핑크', '#F4C9D3'], ['hotpink', '핫 핑크', '#D63A78'], ['pastel-yellow', '버터 옐로우', '#F5E2A8'], ['pastel-sky', '스카이 블루', '#C3DFF0']
  ];
  var root = doc.documentElement, curPal = root.getAttribute('data-pal') || '';
  var pw = doc.createElement('div');
  pw.className = 'pal';
  pw.innerHTML = '<div class="pal-panel" id="pal-panel" hidden><p class="pal-t">색 바꿔 보기</p><div class="pal-list" role="radiogroup" aria-label="사이트 색">' +
    PALS.map(function (p) {
      return '<button type="button" role="radio" data-pal="' + p[0] + '" aria-checked="' + (p[0] === curPal) + '"><i style="background:' + p[2] + '"></i><span>' + p[1] + '</span></button>';
    }).join('') + '</div><p class="pal-note">시안 확인용 · 고른 색은 이 브라우저에 기억됩니다</p></div>' +
    '<button type="button" class="pal-btn" aria-expanded="false" aria-controls="pal-panel" aria-label="사이트 색 바꾸기"><i></i></button>';
  doc.body.appendChild(pw);
  var pBtn = $('.pal-btn', pw), pPanel = $('.pal-panel', pw);
  var palShow = function (v) { pPanel.hidden = !v; pBtn.setAttribute('aria-expanded', v ? 'true' : 'false'); };
  pBtn.addEventListener('click', function (e) { e.stopPropagation(); palShow(pPanel.hidden); });
  pPanel.addEventListener('click', function (e) {
    e.stopPropagation();
    var b = e.target.closest ? e.target.closest('[data-pal]') : null;
    if (!b) return;
    var id = b.getAttribute('data-pal');
    if (id) root.setAttribute('data-pal', id); else root.removeAttribute('data-pal');
    try { if (id) localStorage.setItem('ongil-pal', id); else localStorage.removeItem('ongil-pal'); } catch (x) { /* 기억만 못 함 */ }
    $$('[data-pal]', pPanel).forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
  });
  doc.addEventListener('click', function () { palShow(false); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') palShow(false); });

  /* 꼬리의 이메일 주소: 누르면 주소가 복사된다 (메일 프로그램을 여는 대신) */
  var toastEl = null, toastT = 0;
  var toast = function (msg) {
    if (!toastEl) { toastEl = doc.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); doc.body.appendChild(toastEl); }
    toastEl.textContent = msg; void toastEl.offsetWidth; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2000);
  };
  $$('.ft a[href^="mailto:"]').forEach(function (a) {
    var mail = a.getAttribute('href').slice(7);
    a.title = '누르면 이메일 주소가 복사됩니다';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var done = function () { toast('이메일 주소를 복사했습니다 · ' + mail); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(mail).then(done, function () { location.href = 'mailto:' + mail; });
      else { var ta = doc.createElement('textarea'); ta.value = mail; doc.body.appendChild(ta); ta.select(); try { doc.execCommand('copy'); done(); } catch (x) { location.href = 'mailto:' + mail; } doc.body.removeChild(ta); }
    });
  });

  /* 주소 복사 */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-copy'), label = b.textContent;
      var done = function () { b.textContent = '복사했습니다'; setTimeout(function () { b.textContent = label; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () {});
      else { var ta = doc.createElement('textarea'); ta.value = t; doc.body.appendChild(ta); ta.select(); try { doc.execCommand('copy'); done(); } catch (e) { /* 그대로 */ } doc.body.removeChild(ta); }
    });
  });
})();
