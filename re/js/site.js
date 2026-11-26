/* re — 흐름 막대 · 스크롤 등장 */
(function () {
  var d = document;
  d.documentElement.classList.add('js');

  // "2009.08" → 2009.583 (해 + 달/12)
  function ym(s) {
    var p = String(s).split('.');
    return +p[0] + ((+p[1] || 1) - 1) / 12;
  }

  // 흐름 막대: 시작(data-start)부터 오늘까지를 100% 로
  var box = d.getElementById('flow');
  var fit = function () {};
  if (box) {
    var now = new Date();
    var start = ym(box.getAttribute('data-start'));
    var end = now.getFullYear() + (now.getMonth() + 1) / 12;
    var span = end - start;
    var pct = function (v) { return Math.max(0, Math.min(100, (v - start) / span * 100)); };
    var rows = box.querySelectorAll('.flow-row');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var a = pct(ym(r.getAttribute('data-from')));
      var to = r.getAttribute('data-to');
      var b = to ? pct(ym(to) + 1 / 12) : 100;
      r.style.setProperty('--l', a.toFixed(2) + '%');
      r.style.setProperty('--w', (b - a).toFixed(2) + '%');
    }
    // 이름이 오른쪽 끝을 넘지 않게 — 이름 폭을 재서 css 가 왼쪽 여백을 줄인다(글꼴이 바뀌면 다시)
    fit = function () {
      for (var i = 0; i < rows.length; i++) {
        var n = rows[i].querySelector('.flow-name');
        if (n) n.style.setProperty('--nw', Math.ceil(n.getBoundingClientRect().width) + 'px');
      }
    };
    fit();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit);
    // 눈금: 5년마다
    var axis = box.querySelector('.flow-axis');
    for (var y = Math.ceil(start / 5) * 5; y <= end - 1; y += 5) {
      var t = d.createElement('span');
      t.textContent = y;
      t.style.setProperty('--l', pct(y).toFixed(2) + '%');
      axis.appendChild(t);
    }
    requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add('on'); }); });
  }

  // 머리 메뉴: 지금 있는 곳 표시(메뉴는 xms 가 다시 그릴 수 있어 주소로 고른다)
  var path = location.pathname.replace(/\/index\.html$/, '/');
  var links = d.querySelectorAll('.gnb a');
  for (var k = 0; k < links.length; k++) {
    var h = links[k].getAttribute('href') || '';
    if (h === '/' ? path === '/' : path.indexOf(h) === 0) links[k].classList.add('on');
  }

  // 프로젝트: 페이지에 함께 온 게시판 최근 글을 카드로(없으면 받아 온다)
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var lists = d.querySelectorAll('[data-xms-latest]');
  for (var j = 0; j < lists.length; j++) (function (ul) {
    var slug = ul.getAttribute('data-xms-latest'), n = ul.getAttribute('data-n') || 6;
    var draw = function (list) {
      if (!list || !list.length) return;
      ul.innerHTML = list.map(function (p, i) {
        return '<li class="work' + (p.thumb ? '' : ' no-img') + '"><a href="' + esc(p.url) + '">' +
          (p.thumb ? '<span class="work-img"><img src="' + esc(p.thumb) + '" alt=""' + (i > 1 ? ' loading="lazy"' : '') + '></span>' : '') +
          '<b>' + esc(p.title) + '</b>' + (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') + (p.date ? '<time>' + esc(p.date) + '</time>' : '') + '</a></li>';
      }).join('');
    };
    var emb = d.getElementById('xms-latest-' + slug);
    if (emb) { try { draw(JSON.parse(emb.textContent)); } catch (e) { /* 빈 목록 그대로 */ } return; }
    if (!/^https?:/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return;
    fetch('/xms-api/boards/' + slug + '/latest?n=' + n).then(function (r) { return r.ok ? r.json() : []; }).then(draw).catch(function () {});
  })(lists[j]);

  // 탭(기본 이력 · 웹 프로젝트): 떠 있는 배경이 미끄러진다. 주소 뒤 #project 면 웹 프로젝트부터
  var tabs = d.querySelector('.tabs');
  if (tabs) {
    var ind = tabs.querySelector('.tab-ind'), tl = tabs.querySelectorAll('a');
    var place = function () {
      var a = tabs.querySelector('a.on');
      if (!a || !a.offsetWidth) return;
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    };
    var show = function (name) {
      for (var i = 0; i < tl.length; i++) {
        var t = tl[i].getAttribute('data-tab'), on = t === name, pn = d.getElementById('p-' + t);
        tl[i].classList.toggle('on', on);
        if (on) tl[i].setAttribute('aria-current', 'true'); else tl[i].removeAttribute('aria-current');
        if (pn) pn.hidden = !on;
      }
      place();
      if (name === 'resume') fit();
    };
    var fromHash = function () { show(location.hash === '#project' ? 'project' : 'resume'); };
    tabs.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-tab]') : null;
      if (!a) return;
      e.preventDefault();
      var name = a.getAttribute('data-tab');
      show(name);
      if (history.replaceState) history.replaceState(null, '', name === 'project' ? '#project' : location.pathname + location.search);
    });
    window.addEventListener('hashchange', fromHash);
    window.addEventListener('resize', place);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(place);
    fromHash();
    requestAnimationFrame(function () { requestAnimationFrame(function () { tabs.classList.add('ready'); }); });
  }

  // 구간이 보이면 떠오르기
  var secs = d.querySelectorAll('.sec');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    secs.forEach(function (s) { io.observe(s); });
  } else {
    secs.forEach(function (s) { s.classList.add('on'); });
  }

  // 머리: 내려가면 아래 선
  var top = d.querySelector('.top');
  var onScroll = function () { top.classList.toggle('is-down', window.scrollY > 4); };
  if (top) { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); }
})();
