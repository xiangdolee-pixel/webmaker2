/* 늘해랑심리상담센터 — 메뉴 열기 · 머리 그림자 · 스크롤하면 떠오르기 */
(function () {
  var doc = document, root = doc.documentElement, hd = doc.querySelector('.hd'), tg = doc.querySelector('.nav-toggle'), gnb = doc.getElementById('gnb');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 폰 메뉴
  function nav(open) {
    root.classList.toggle('nav-open', open);
    if (tg) { tg.setAttribute('aria-expanded', open ? 'true' : 'false'); tg.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); }
  }
  if (tg) tg.addEventListener('click', function () { nav(!root.classList.contains('nav-open')); });
  if (gnb) gnb.addEventListener('click', function (e) { if (e.target.closest('a')) nav(false); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') nav(false); });
  doc.addEventListener('click', function (e) { if (root.classList.contains('nav-open') && !e.target.closest('.hd')) nav(false); });

  // 머리: 조금 내려가면 아래 선
  var ticking = false;
  function onScroll() { if (ticking) return; ticking = true; requestAnimationFrame(function () { if (hd) hd.classList.toggle('scrolled', window.scrollY > 8); ticking = false; }); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // 지금 페이지 · 센터소개 아래 메뉴(머리 메뉴는 관리 화면에서 바뀔 수 있어, 센터소개 칸을 찾아 그 아래에 붙인다)
  var name = (location.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/').pop()) || 'index';
  var ABOUT = [['about', '인사말'], ['team', '담당 선생님'], ['location', '오시는 길']];
  var inAbout = ABOUT.some(function (x) { return x[0] === name; });
  var pre = location.pathname.indexOf('/board/') === 0 || location.pathname.indexOf('/member/') === 0 ? '/' : '';
  function leaf(a) { return (a.getAttribute('href') || '').replace(/[?#].*$/, '').replace(/\.html$/, '').replace(/\/$/, '').split('/').pop(); }
  [].forEach.call(doc.querySelectorAll('.gnb > a:not(.btn)'), function (a) {
    var p = leaf(a);
    if (p === name || (p === 'about' && inAbout)) a.classList.add('here');
    if (p !== 'about') return;
    var g = doc.createElement('div'), sub = doc.createElement('div');
    g.className = 'gnb-group'; sub.className = 'gnb-sub';
    ABOUT.forEach(function (x) {
      var l = doc.createElement('a'); l.textContent = x[1];
      l.href = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === 'file:' ? x[0] + '.html' : '/' + x[0];   // 배포본은 .html 없이(왕복 줄이기)
      if (x[0] === name) l.setAttribute('aria-current', 'page');
      sub.appendChild(l);
    });
    a.parentNode.insertBefore(g, a); g.appendChild(a); g.appendChild(sub);
  });

  // 알약 탭(센터소개): 고른 칸 배경이 앞 페이지의 자리에서 지금 자리로 미끄러진다
  [].forEach.call(doc.querySelectorAll('[data-tabs]'), function (box) {
    var on = box.querySelector('a.on'); if (!on) return;
    var ind = doc.createElement('span'); ind.className = 'tab-ind'; box.insertBefore(ind, box.firstChild);
    function put(el) { ind.style.width = el.offsetWidth + 'px'; ind.style.transform = 'translateX(' + el.offsetLeft + 'px)'; }
    var links = [].slice.call(box.querySelectorAll('a')), from = null;
    try { from = sessionStorage.getItem('nh-tab'); sessionStorage.removeItem('nh-tab'); } catch (e) {}
    var prev = links.filter(function (l) { return leaf(l) === from; })[0];
    box.classList.add('no-anim'); put(prev && !reduce ? prev : on); box.classList.add('ready');
    void ind.offsetWidth; box.classList.remove('no-anim');
    if (prev && prev !== on && !reduce) requestAnimationFrame(function () { put(on); });
    links.forEach(function (l) { l.addEventListener('click', function () { try { sessionStorage.setItem('nh-tab', leaf(on)); } catch (e) {} if (!reduce) { links.forEach(function (x) { x.classList.toggle('on', x === l); }); put(l); } }); });
    window.addEventListener('resize', function () { box.classList.add('no-anim'); put(box.querySelector('a.on') || on); void ind.offsetWidth; box.classList.remove('no-anim'); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { box.classList.add('no-anim'); put(box.querySelector('a.on') || on); void ind.offsetWidth; box.classList.remove('no-anim'); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) { links.forEach(function (x) { x.classList.toggle('on', x === on); }); put(on); } });
  });

  // 공간 사진 띠: 저절로 천천히 흐른다(끝없이). 마우스를 올리거나 잡아 끌거나 손가락으로 넘기는 동안은 멈췄다가 다시 흐른다.
  [].forEach.call(doc.querySelectorAll('[data-strip]'), function (el) {
    var kids = [].slice.call(el.children);
    kids.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); el.appendChild(c); });   // 한 벌 더 → 끝과 처음이 이어진다
    var hold = 0, down = false, sx = 0, pos = 0, last = 0, seen = false;
    function half() { return (el.scrollWidth + parseFloat(getComputedStyle(el).columnGap || 0)) / 2; }
    function wrap() { var h = half(); if (h > 0) { if (el.scrollLeft >= h) el.scrollLeft -= h; else if (el.scrollLeft <= 0) el.scrollLeft += h; } }
    el.addEventListener('pointerdown', function (e) { hold = Date.now() + 3000; if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; el.classList.add('drag'); e.preventDefault(); });
    window.addEventListener('pointermove', function (e) { if (!down) return; el.scrollLeft -= e.clientX - sx; sx = e.clientX; wrap(); hold = Date.now() + 3000; });
    window.addEventListener('pointerup', function () { if (down) { down = false; el.classList.remove('drag'); } });
    el.addEventListener('touchstart', function () { hold = Date.now() + 4000; }, { passive: true });
    el.addEventListener('touchmove', function () { hold = Date.now() + 4000; }, { passive: true });
    el.addEventListener('wheel', function () { hold = Date.now() + 2500; }, { passive: true });
    el.addEventListener('mouseenter', function () { hold = Infinity; });
    el.addEventListener('mouseleave', function () { hold = Date.now() + 600; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }, { rootMargin: '200px' }).observe(el); else seen = true;
    if (reduce) return;
    requestAnimationFrame(function tick(t) {
      var dt = Math.min(50, t - (last || t)); last = t;
      if (seen && !down && Date.now() > hold && !doc.hidden) {
        if (Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;   // 손으로 옮겼으면 그 자리에서 이어서
        pos += dt * .045;                                             // 1초에 45px
        var h = half(); if (h > 0 && pos >= h) pos -= h;
        el.scrollLeft = pos;
      }
      requestAnimationFrame(tick);
    });
  });

  // 스크롤하면 떠오르기
  var items = [].slice.call(doc.querySelectorAll('[data-reveal]'));
  if (reduce || !('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  items.forEach(function (el, i) {
    var sib = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
    el.style.transitionDelay = Math.min(sib, 4) * 70 + 'ms';   // 나란히 있는 카드는 차례로
    io.observe(el);
  });
})();
