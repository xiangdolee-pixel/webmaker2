/* 이화아동발달연구소 — 화면 동작 (헤더 · 서랍 메뉴 · 첫 화면 사진 · 등장 · 전화 가능 표시 · 어휘 바꾸기 · 펼침 칸) */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 헤더: 내리면 아래 선
  var hd = $('#hd');
  var onScroll = function () { hd.classList.toggle('scrolled', scrollY > 8); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // 서랍 메뉴
  var burger = $('.burger'), drawer = $('#drawer');
  if (burger && drawer) {
    var setDrawer = function (open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      if (open) { drawer.hidden = false; drawer.offsetHeight; drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }
      else { drawer.classList.remove('open'); document.body.style.overflow = ''; setTimeout(function () { if (!drawer.classList.contains('open')) drawer.hidden = true; }, 300); }
    };
    burger.addEventListener('click', function () { setDrawer(burger.getAttribute('aria-expanded') !== 'true'); });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setDrawer(false); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
    matchMedia('(min-width: 1081px)').addEventListener('change', function (m) { if (m.matches) setDrawer(false); });
  }

  // 등장
  var rv = $$('.rv');
  if (calm || !('IntersectionObserver' in window)) rv.forEach(function (e) { e.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) {
        if (!x.isIntersecting) return;
        var sib = $$('.rv', x.target.parentNode).filter(function (n) { return n.parentNode === x.target.parentNode; });
        x.target.style.transitionDelay = Math.min(sib.indexOf(x.target), 5) * 80 + 'ms';
        x.target.classList.add('in'); io.unobserve(x.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rv.forEach(function (e) { io.observe(e); });
  }

  // 첫 화면 사진: 6초마다 넘김, 누르면 그 사진
  var pics = $$('.hero-pic'), navs = $$('.hero-nav button');
  if (pics.length > 1) {
    var cur = 0, timer, small = matchMedia('(max-width: 760px)').matches;
    var load = function () { pics.forEach(function (p) { var im = p.querySelector('img[data-src]'); if (im) { im.src = small ? im.dataset.srcM : im.dataset.src; im.removeAttribute('data-src'); } }); };
    if (document.readyState === 'complete') setTimeout(load, 1200); else addEventListener('load', function () { setTimeout(load, 1200); });
    var show = function (i) {
      cur = (i + pics.length) % pics.length;
      pics.forEach(function (p, k) { p.classList.toggle('on', k === cur); });
      navs.forEach(function (b, k) { b.classList.remove('on'); if (k === cur) { b.offsetWidth; b.classList.add('on'); } });
      clearTimeout(timer); if (!calm) timer = setTimeout(function () { show(cur + 1); }, 6000);
    };
    navs.forEach(function (b, k) { b.addEventListener('click', function () { load(); show(k); }); });
    if (!calm) timer = setTimeout(function () { show(1); }, 6000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearTimeout(timer); else if (!calm) { clearTimeout(timer); timer = setTimeout(function () { show(cur + 1); }, 6000); } });
  }

  // 전화 문의 가능 시간(월 ~ 금 12:30 ~ 18:00, 한국 시각) 표시
  var telState = function () {
    var k = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
    var d = k.getDay(), m = k.getHours() * 60 + k.getMinutes(), open = d >= 1 && d <= 5 && m >= 750 && m < 1080, txt;
    if (open) txt = '지금 전화 문의를 받는 시간입니다';
    else {
      var names = ['일', '월', '화', '수', '목', '금', '토'], n = d, add = 0;
      if (d >= 1 && d <= 5 && m < 750) txt = '오늘 12:30부터 전화 문의를 받습니다';
      else { do { n = (n + 1) % 7; add++; } while (n === 0 || n === 6); txt = (add === 1 ? '내일' : names[n] + '요일') + ' 12:30부터 전화 문의를 받습니다'; }
    }
    $$('[data-tel-state]').forEach(function (e) { e.textContent = txt + (e.hasAttribute('data-long') ? ' · 예약 후 방문 상담' : ''); e.classList.toggle('open', open); });
  };
  telState(); setInterval(telState, 60000);

  // 알약 탭(떠 있는 배경이 미끄러짐)
  var seg = function (box, onPick) {
    var ind = $('.seg-ind', box), bs = $$('button', box);
    var move = function (b) { if (!b.offsetWidth) return; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = 'translateX(' + b.offsetLeft + 'px)'; };
    var pick = function (b) { bs.forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }); move(b); onPick(b); };
    bs.forEach(function (b) { b.addEventListener('click', function () { pick(b); }); });
    var re = function () { var b = $('button.on', box); if (b) { ind.style.transition = 'none'; move(b); ind.offsetWidth; ind.style.transition = ''; } };
    re(); addEventListener('resize', re); if (document.fonts && document.fonts.ready) document.fonts.ready.then(re);
  };
  $$('[data-vocab]').forEach(function (v) {
    seg($('.seg', v), function (b) { $$('.fr-set', v).forEach(function (s) { s.classList.toggle('on', s.dataset.set === b.dataset.set); }); });
  });
  $$('[data-pick]').forEach(function (v) {   // 표 바꾸기(50분 · 60분 등)
    seg($('.seg', v), function (b) { $$('[data-pane]', v).forEach(function (s) { s.hidden = s.dataset.pane !== b.dataset.set; }); });
  });

  // 펼침 칸: 열릴 때도 닫힐 때도 부드럽게
  $$('details.qa').forEach(function (d) {
    var s = $('summary', d);
    s.addEventListener('click', function (e) {
      e.preventDefault();
      if (d.classList.contains('is-open')) { d.classList.remove('is-open'); setTimeout(function () { if (!d.classList.contains('is-open')) d.open = false; }, calm ? 0 : 400); }
      else { d.open = true; d.offsetHeight; d.classList.add('is-open'); }
    });
  });

  // 형제 탭: 지금 쪽이 보이게
  var on = $('.tabs a.on'); if (on && on.scrollIntoView) { var ul = on.closest('ul'); ul.scrollLeft = Math.max(0, on.offsetLeft - 20); }
})();
