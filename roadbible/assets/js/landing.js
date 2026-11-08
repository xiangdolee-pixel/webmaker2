/* 길 성경통독 소개 페이지 — 바닐라 JS (ES5) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 예전에 이 기기에서 읽던 곳이 있으면 '이어 읽기' (앱이 남긴 rb.last = "책/장") */
  try {
    var last = localStorage.getItem('rb.last');
    if (last && /\//.test(last)) {
      var p = last.split('/');
      $('#resumeAt').textContent = p[0] + ' ' + p[1] + (p[0] === '시편' ? '편' : '장');
      $('#resume').hidden = false;
    }
  } catch (e) {}

  /* 상단: 내려가면 바탕 · 어두운 구간 위에서는 밝은 글자 */
  var top = $('#top'), darks = $$('[data-dark]');
  function onScroll() {
    var y = window.pageYOffset || 0, probe = 40;
    top.classList.toggle('scrolled', y > 10);
    var dark = false;
    for (var i = 0; i < darks.length; i++) {
      var r = darks[i].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { dark = true; break; }
    }
    top.classList.toggle('dark', dark);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 나타나기 */
  var rvs = $$('.rv');
  if (reduce || !('IntersectionObserver' in window)) rvs.forEach(function (el) { el.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rvs.forEach(function (el) { io.observe(el); });
  }

  /* 설치: 아이폰 / 안드로이드 — 떠 있는 배경 하나가 고른 칸으로 미끄러진다 */
  var seg = $('.seg'), ind = $('.seg-ind'), btns = $$('.seg button');
  function place(animate) {
    var on = $('.seg button.on');
    if (!on || !on.offsetWidth) { seg.classList.add('noind'); return; }   // 폭을 못 재면 칸 자체 배경으로
    seg.classList.remove('noind');
    if (!animate) ind.style.transition = 'none';
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.classList.contains('on')) return;
      btns.forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
      place(true);   // 배경부터 옮기고 내용은 뒤따라
      $$('.steps').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-os') === b.getAttribute('data-os')); });
    });
  });
  // 안드로이드 폰이면 안드로이드 칸부터
  if (/Android/i.test(navigator.userAgent)) { var and = $('.seg button[data-os="and"]'); if (and) and.click(); }
  place(false);
  window.addEventListener('resize', function () { place(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(false); });
})();
