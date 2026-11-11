// 아래 문의 이메일을 누르면 복사
(function () {
  var btn = document.querySelector('[data-copy]');
  var toast = document.querySelector('.toast');
  if (!btn) return;
  var timer;
  function done(ok) {
    toast.textContent = ok ? '복사되었습니다.' : '복사하지 못했습니다.';
    toast.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('on'); }, 1800);
  }
  function fallback(text) {
    var t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(t);
    return ok;
  }
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  });
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text)); });
    } else done(fallback(text));
  });
})();

// 분류 탭: 카드의 분류(.tag)로 전체 · 홈페이지 · 웹서비스 · 웹앱 · 웹게임 … 탭을 한 번 만들고, 고르면 그 분류만 보인다.
//   한 카드에 분류가 여럿이면('웹앱 · 홈페이지') 그 탭 모두에 나온다
(function () {
  var grid = document.querySelector('.grid');
  var nav = document.querySelector('.cats');
  if (!grid || !nav) return;
  var ORDER = ['홈페이지', '웹서비스', '웹앱', '웹게임'];
  var items = [].slice.call(grid.children).filter(function (li) { return li.querySelector('.card'); });
  var count = {};
  items.forEach(function (li) {
    var t = li.querySelector('.tag');
    li.cats = t ? t.textContent.split(/\s*[·,]\s*/).filter(Boolean) : [];
    li.cats.forEach(function (c) { count[c] = (count[c] || 0) + 1; });
  });
  var cats = Object.keys(count).sort(function (a, b) {
    var x = ORDER.indexOf(a), y = ORDER.indexOf(b);
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b, 'ko');
  });
  if (cats.length < 2) return;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  nav.innerHTML = '<span class="tab-ind" aria-hidden="true"></span>' + [['', '전체', items.length]].concat(cats.map(function (c) { return [c, c, count[c]]; }))
    .map(function (c, i) { return '<button type="button" class="cat' + (i ? '' : ' on') + '" data-cat="' + esc(c[0]) + '" aria-pressed="' + (i ? 'false' : 'true') + '">' + esc(c[1]) + '<i>' + c[2] + '</i></button>'; }).join('');
  nav.hidden = false;
  var ind = nav.querySelector('.tab-ind');
  function slide() {
    var on = nav.querySelector('.cat.on');
    if (!on || !on.offsetWidth) { nav.classList.add('no-ind'); return; }
    nav.classList.remove('no-ind');
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.cat');
    if (!b || b.classList.contains('on')) return;
    [].forEach.call(nav.querySelectorAll('.cat'), function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    slide(); // 배경부터 옮기고 목록은 뒤따라
    var want = b.dataset.cat;
    items.forEach(function (li) { li.hidden = !!want && li.cats.indexOf(want) < 0; });
    var box = nav.parentNode;
    if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: b.offsetLeft - (box.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  });
  slide();
  window.addEventListener('resize', slide);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(slide);
})();
