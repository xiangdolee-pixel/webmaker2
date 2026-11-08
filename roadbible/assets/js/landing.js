/* 길 성경통독 소개 페이지 — 바닐라 JS (ES5) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 이 기기에서 읽던 곳이 있으면(앱이 남긴 rb.last = "책/장") 첫 화면 주 버튼을 '이어 읽기'로,
     둘째 버튼은 '통독표 열기'로 — 가입은 아래 가입 구간이 맡는다 */
  try {
    var last = localStorage.getItem('rb.last');
    if (last && /\//.test(last)) {
      var p = last.split('/'), at = p[0] + ' ' + p[1] + (p[0] === '시편' ? '편' : '장');
      var main = $('#heroMain'), sub = $('#heroSub');
      main.href = '/app'; main.innerHTML = '이어 읽기 · ' + at.replace(/[<>&]/g, '') + ' <span aria-hidden="true">→</span>';
      sub.href = '/app#plan'; sub.textContent = '통독표 열기';
      $('#topBtn').href = '/app'; $('#topBtn').textContent = '이어 읽기';
    }
  } catch (e) {}

  /* 상단: 내려가면 바탕 · 어두운 구간(첫 화면 · 끝) 위에서는 밝은 글자 */
  var top = $('#top'), darks = $$('[data-dark]');
  function onScroll() {
    var y = window.pageYOffset || 0, probe = 40, dark = false;
    top.classList.toggle('scrolled', y > 10);
    for (var i = 0; i < darks.length; i++) {
      var r = darks[i].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { dark = true; break; }
    }
    top.classList.toggle('dark', dark);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 나타나기 — 화면 그림에만(글자는 처음부터 보임) */
  var rvs = $$('.rv');
  if (reduce || !('IntersectionObserver' in window)) rvs.forEach(function (el) { el.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px 15% 0px', threshold: 0 });
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
  function pick(b, animate) {
    btns.forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    place(animate);   // 배경부터 옮기고 내용은 뒤따라
    $$('.steps').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-os') === b.getAttribute('data-os')); });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { if (!b.classList.contains('on')) pick(b, true); }); });
  // 안드로이드 폰이면 안드로이드 칸부터
  if (/Android/i.test(navigator.userAgent)) { var and = $('.seg button[data-os="and"]'); if (and) pick(and, false); }
  place(false);
  window.addEventListener('resize', function () { place(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(false); });
})();
