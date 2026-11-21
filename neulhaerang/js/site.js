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

  // 알약 탭(센터소개): 누르는 순간 이 페이지에서 한 번만 미끄러지고, 새 페이지는 처음부터 제자리에 그린다.
  //   (예전에는 새 페이지에서도 '앞 페이지 자리 → 지금 자리'로 한 번 더 미끄러져, 배경이 두 번 움직이고 글자 위에 겹쳐 잔상처럼 보였다 — 사용자 지적 2026-11-22)
  [].forEach.call(doc.querySelectorAll('[data-tabs]'), function (box) {
    var on = box.querySelector('a.on'); if (!on) return;
    var ind = doc.createElement('span'); ind.className = 'tab-ind'; box.insertBefore(ind, box.firstChild);
    function put(el) { ind.style.width = el.offsetWidth + 'px'; ind.style.transform = 'translateX(' + el.offsetLeft + 'px)'; }
    function still() { box.classList.add('no-anim'); var cur = box.querySelector('a.on') || on; put(cur); void ind.offsetWidth; box.classList.remove('no-anim'); }
    var links = [].slice.call(box.querySelectorAll('a'));
    still(); box.classList.add('ready');
    links.forEach(function (l) { l.addEventListener('click', function () { if (!reduce) { links.forEach(function (x) { x.classList.toggle('on', x === l); }); put(l); } }); });
    window.addEventListener('resize', still);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(still);
    window.addEventListener('pageshow', function (e) { if (e.persisted) { links.forEach(function (x) { x.classList.toggle('on', x === on); }); still(); } });
  });

  // 펼침 칸(자주 묻는 질문): 열릴 때도 닫힐 때도 높이가 부드럽게 움직인다 — 닫힐 때 뚝 끊기지 않게(사용자 지시 2026-11-21)
  [].forEach.call(doc.querySelectorAll('details.faq'), function (d) {
    var sum = d.querySelector('summary'), anim = null, closing = false;
    if (!sum || reduce || !d.animate) return;
    function run(from, to, done) {
      if (anim) anim.cancel();
      anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: Math.min(520, 220 + Math.abs(to - from) * .9), easing: 'cubic-bezier(.22, .8, .24, 1)' });
      anim.onfinish = function () { anim = null; done(); };
      anim.oncancel = function () { anim = null; };
    }
    sum.addEventListener('click', function (e) {
      e.preventDefault();
      var from = d.offsetHeight;
      if (d.open && !closing) {            // 닫기: 지금 높이 → 제목 높이, 다 줄어든 뒤에 닫는다
        closing = true; d.classList.add('closing');
        run(from, sum.offsetHeight, function () { d.open = false; closing = false; d.classList.remove('closing'); });
      } else {                             // 열기(닫히던 중이면 되돌아 열린다)
        closing = false; d.classList.remove('closing'); d.open = true;
        run(from, sum.offsetHeight + (d.scrollHeight - sum.offsetHeight), function () {});
      }
    });
  });

  // 공간 사진 띠: 저절로 천천히 흐른다(끝없이). 스크롤 위치(정수 픽셀)를 밀면 덜덜거려서, 안쪽 줄을 transform 으로 민다(소수점 픽셀 · GPU).
  //   마우스를 올리면 멈추고, 잡아 끌거나 손가락으로 밀면 따라 움직였다가 다시 흐른다.
  [].forEach.call(doc.querySelectorAll('[data-strip]'), function (el) {
    var track = doc.createElement('div'); track.className = 'strip-track';
    while (el.firstChild) track.appendChild(el.firstChild);
    [].slice.call(track.children).forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); });   // 한 벌 더 → 끝과 처음이 이어진다
    el.appendChild(track); el.classList.add('auto');
    var pos = 0, half = 0, last = 0, seen = false, hover = false, down = false, sx = 0, sy = 0, dragging = false, vel = 0, hold = 0;
    function measure() { var gap = parseFloat(getComputedStyle(track).columnGap) || 0; half = (track.scrollWidth + gap) / 2; }
    function put() { if (half > 0) { pos = ((pos % half) + half) % half; } track.style.transform = 'translate3d(' + (-pos) + 'px,0,0)'; }
    measure(); window.addEventListener('resize', measure); window.addEventListener('load', measure);
    [].forEach.call(track.querySelectorAll('img'), function (im) { if (!im.complete) im.addEventListener('load', measure, { once: true }); });
    el.addEventListener('mouseenter', function () { hover = true; });
    el.addEventListener('mouseleave', function () { hover = false; });
    el.addEventListener('pointerdown', function (e) { down = true; dragging = false; sx = e.clientX; sy = e.clientY; vel = 0; });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging) { if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return; dragging = true; el.classList.add('drag'); }   // 옆으로 움직일 때만 잡는다(위아래 스크롤은 그대로)
      pos -= dx; vel = -dx; sx = e.clientX; sy = e.clientY; put();
    });
    function up() { if (!down) return; down = false; if (dragging) { dragging = false; el.classList.remove('drag'); hold = Date.now() + 1200; } }
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }, { rootMargin: '200px' }).observe(el); else seen = true;
    var speed = 0;   // 지금 빠르기(px/초) — 멈추고 다시 갈 때 부드럽게 오르내린다
    requestAnimationFrame(function tick(t) {
      var dt = Math.min(64, t - (last || t)); last = t;
      if (seen && !doc.hidden && half > 0) {
        var want = reduce || hover || dragging || Date.now() < hold ? 0 : 42;
        speed += (want - speed) * Math.min(1, dt / 420);
        if (!dragging && Math.abs(vel) > .2) { pos += vel; vel *= Math.pow(.92, dt / 16); }   // 놓은 뒤 살짝 미끄러짐
        if (!dragging && speed > .05) pos += speed * dt / 1000;
        put();
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
