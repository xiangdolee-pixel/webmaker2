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

  // 지금 페이지 메뉴 표시
  var here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  [].forEach.call(doc.querySelectorAll('.gnb > a:not(.btn)'), function (a) {
    var p = (a.getAttribute('href') || '').replace(/^\.?\//, '/').replace(/\.html$/, '');
    if (p.charAt(0) !== '/') p = '/' + p;
    if (p === here) a.setAttribute('aria-current', 'page');
  });

  // 공간 사진 띠: 마우스로 잡아 끌어 넘기기(손가락은 그냥 넘어감)
  [].forEach.call(doc.querySelectorAll('[data-strip]'), function (el) {
    var down = false, sx = 0, sl = 0, moved = false;
    el.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = el.scrollLeft; });
    window.addEventListener('pointermove', function (e) { if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) { moved = true; el.classList.add('drag'); } el.scrollLeft = sl - dx; });
    window.addEventListener('pointerup', function () { if (!down) return; down = false; el.classList.remove('drag'); });
    el.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return; }, { passive: true });
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
