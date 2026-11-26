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

  // 맡은 일(기획 · PM · 디자인 · 퍼블리싱 · 개발): 표와 아래 항목이 늘 같게.
  //  - 표의 프로젝트 이름 = 아래 항목 제목(수정 모드로 제목을 고치면 표도 따라간다)
  //  - 관리자가 수정 모드에서 점 · 알약을 누르면 켜지고 꺼지며 바로 저장된다
  //    (저장 = xms 수정 모드 글자 저장소 page_texts, 키 rrole001.<항목 번호>, 값 ['11100'] = PM · 기획 · 디자인 · 퍼블리싱 · 개발 순 — 글자 지문(7자 이하)과 겹치지 않는 8자 키)
  var dev = d.getElementById('dev');
  if (dev) {
    var NAMES = ['PM', '기획', '디자인', '퍼블리싱', '개발'];
    var rows = dev.querySelectorAll('li.row[id^="dev-"]');
    var saved = (window.__XE_T && window.__XE_T.page) || {};
    var trOf = function (n) { var a = dev.querySelector('.roles-t a[href="#dev-' + n + '"]'); return a ? a.closest('tr') : null; };
    var bitsOf = function (li) { var o = '', sp = li.querySelectorAll('.roles span:not(.solo)'); for (var i = 0; i < sp.length; i++) o += sp[i].classList.contains('on') ? '1' : '0'; return o; };
    var paint = function (li, bits) {
      var n = li.id.slice(4), box = li.querySelector('.roles'), sp = box.querySelectorAll('span:not(.solo)'), tr = trOf(n), did = [], solo = bits.indexOf('0') < 0, i;
      for (i = 0; i < sp.length; i++) {
        var on = bits.charAt(i) === '1';
        sp[i].classList.toggle('on', on);
        if (on) { sp[i].removeAttribute('aria-hidden'); did.push(NAMES[i]); } else sp[i].setAttribute('aria-hidden', 'true');
      }
      box.setAttribute('aria-label', '맡은 일: ' + did.join(' · '));
      var tag = box.querySelector('.solo');
      if (solo && !tag) { tag = d.createElement('span'); tag.className = 'solo'; tag.textContent = '원스톱 제작'; box.appendChild(tag); }
      if (!solo && tag) box.removeChild(tag);
      box.classList.toggle('is-solo', solo);
      if (!tr) return;
      tr.classList.toggle('is-solo', solo);
      var tds = tr.querySelectorAll('td');
      for (i = 0; i < NAMES.length; i++) {
        var c = tds[i + 1]; if (!c) continue;
        c.querySelector('.rd').classList.toggle('on', bits.charAt(i) === '1');
        c.querySelector('.sr').textContent = bits.charAt(i) === '1' ? '수행' : '해당 없음';
      }
      var th = tr.querySelector('th'), em = th.querySelector('em');
      if (solo && !em) { em = d.createElement('em'); em.textContent = '원스톱'; th.appendChild(em); }
      if (!solo && em) th.removeChild(em);
    };
    var names = function () {
      for (var i = 0; i < rows.length; i++) {
        var tr = trOf(rows[i].id.slice(4)), h = rows[i].querySelector('h3');
        if (tr && h) { var a = tr.querySelector('a'), tx = h.textContent.replace(/\s+/g, ' ').trim(); if (a.textContent !== tx) a.textContent = tx; }
      }
    };
    for (var r = 0; r < rows.length; r++) {
      var v = saved['rrole001.' + rows[r].id.slice(4)], old = saved['rrole000.' + rows[r].id.slice(4)];
      if (!v && old && /^[01]{5}$/.test(old[0])) v = [old[0].charAt(1) + old[0].charAt(0) + old[0].slice(2)];   // 옛 순서(기획 · PM)로 저장된 값
      if (v && /^[01]{5}$/.test(v[0])) paint(rows[r], v[0]);
    }
    names();
    dev.addEventListener('input', names);
    var tip = d.createElement('p');
    tip.className = 'roles-tip'; tip.setAttribute('data-xe-off', '');
    tip.textContent = '수정 모드: 색 점이나 알약(PM · 기획 · 디자인 · 퍼블리싱 · 개발)을 누르면 켜지고 꺼지며 바로 저장됩니다. 글자는 눌러서 고친 뒤 저장을 누르세요.';
    dev.querySelector('.sec-b').insertBefore(tip, dev.querySelector('.roles-t'));
    dev.addEventListener('click', function (e) {
      if (!d.body.classList.contains('xe-on') || !e.target.closest) return;
      var li = null, idx = -1, sp = e.target.closest('.roles span:not(.solo)'), td = e.target.closest('.roles-t tbody td');
      if (sp) { li = sp.closest('li.row'); idx = Array.prototype.indexOf.call(sp.parentNode.querySelectorAll('span:not(.solo)'), sp); }
      else if (td) { idx = Array.prototype.indexOf.call(td.parentNode.querySelectorAll('td'), td) - 1; var a = td.parentNode.querySelector('a'); li = a ? d.getElementById(a.getAttribute('href').slice(1)) : null; }
      if (!li || idx < 0 || idx > 4) return;
      e.preventDefault();
      var was = bitsOf(li), now = was.slice(0, idx) + (was.charAt(idx) === '1' ? '0' : '1') + was.slice(idx + 1);
      paint(li, now);
      fetch('/xms-api/admin/page-texts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/', items: [{ g: '.', k: 'rrole001.' + li.id.slice(4), t: [now] }] }) })
        .then(function (r) { if (!r.ok) throw 0; })
        .catch(function () { paint(li, was); tip.textContent = '저장하지 못했습니다. 로그인 상태를 확인하고 다시 눌러 주세요.'; });
    });
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
