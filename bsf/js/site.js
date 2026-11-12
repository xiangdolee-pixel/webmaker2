/* BSF COMPANY — 사이트 공통 스크립트 (ES5, 프레임워크 없음) */
(function () {
  'use strict';
  var doc = document, body = doc.body;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || doc).querySelectorAll(s)); }

  /* 머리: 첫 화면(어두운 영상) 위에서는 투명 + 흰 글자, 내려가면 밝은 띠 */
  var hd = $('.hd');
  var darkTop = body.classList.contains('has-hero') || body.classList.contains('has-page-hero');
  var fab = $('.fab');
  var accents = $$('.cta-band');
  function onScroll() {
    var y = window.pageYOffset || doc.documentElement.scrollTop;
    if (hd && darkTop) hd.classList.toggle('on-dark', y < 40);
    if (fab) {
      fab.classList.toggle('up', y > 400);   // 맨 위로 버튼(400px 넘으면 뜸)에게 자리를 비켜 준다
      // 주황 띠 위에 오면 버튼 색을 뒤집는다(같은 색끼리 겹치지 않게)
      var r = fab.getBoundingClientRect(), on = false;
      accents.forEach(function (a) { var q = a.getBoundingClientRect(); if (r.bottom > q.top && r.top < q.bottom) on = true; });
      fab.classList.toggle('on-accent', on);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 지금 페이지 메뉴 표시 */
  var here = location.pathname.split('/').pop().replace(/\.html$/, '');
  $$('.gnb a').forEach(function (a) {
    var p = (a.getAttribute('href') || '').split('/').pop().replace(/\.html$/, '');
    if (p && here && p === here) a.classList.add('on');
  });

  /* 모바일 메뉴 */
  var toggle = $('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = !body.classList.contains('nav-open');
      body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $$('.gnb a').forEach(function (a) { a.addEventListener('click', function () { body.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); }); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') body.classList.remove('nav-open'); });
  }

  /* 스크롤 등장 + 숫자 올라가기 */
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = (el.getAttribute('data-count').split('.')[1] || '').length;
    if (reduce) { el.firstChild.nodeValue = dec ? to.toFixed(dec) : to.toLocaleString('en-US'); return; }
    var t0 = null, dur = 2000;
    function step(t) {
      if (!t0) t0 = t;
      // 큰 숫자 · 작은 숫자 모두 같은 시간에 끝나게: 내림(floor)이라 마지막 순간에만 목표 숫자가 된다 (사용자 지시 2026-11-12)
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 2);
      // 한 자리 숫자(예: 4)는 금방 끝나 보여서, 다른 숫자가 오르는 동안 0 → 목표를 빠르게 되풀이하다 함께 멈춘다
      var v = to < 10 && !dec ? Math.floor((t - t0) / (dur / (to + 1) / 3.5)) % (to + 1) : Math.floor(to * e);
      el.firstChild.nodeValue = dec ? (Math.floor(to * e * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec) : (p >= 1 ? to : v).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var rvs = $$('.rv, .world'), counts = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        if (el.hasAttribute('data-count')) {
          // 같은 묶음(.stats 등)의 숫자는 함께 출발한다
          var grp = el.closest('.stats, ul, .fac-cards') || el;
          $$('[data-count]', grp).forEach(function (c) { if (!c._ran) { c._ran = true; io.unobserve(c); countUp(c); } });
        } else el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    rvs.concat(counts).forEach(function (el) { io.observe(el); });
  } else {
    rvs.forEach(function (el) { el.classList.add('in'); });
    counts.forEach(function (el) { el.firstChild.nodeValue = el.getAttribute('data-count'); });
  }

  /* 첫 화면: 배경 영상(Vimeo) 한 번 → 사진 3장 차례로 → 다시 영상부터 (사용자 지시 2026-11-12)
     영상이 안 열리거나 움직임 줄이기면 사진만 돈다. Vimeo 와는 postMessage 로 주고받는다(재생 · 끝남 · 처음으로) */
  var hero = $('.hero'), slides = $$('.slide'), hv = $('.hero-video');
  var cur = 0, bar = $('.hero-cap .bar i'), cnt = $('.hero-cap .count'), caps = $$('[data-cap]'), timer = 0, SLIDE_MS = 6500;
  function show(i) {
    slides[cur].classList.remove('on'); cur = i; slides[cur].classList.add('on');
    if (cnt) cnt.textContent = ('0' + (cur + 1)).slice(-2);
    caps.forEach(function (c, k) { c.hidden = k !== cur; });
    if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
  }
  // 사진만 계속 돌기 (영상이 없을 때)
  function slidesForever() {
    clearTimeout(timer);
    (function next() { timer = setTimeout(function () { if (!doc.hidden) show((cur + 1) % slides.length); next(); }, SLIDE_MS); })();
  }
  // 순서: 영상 첫 화면(그림) → 영상 → 사진 1 · 2 · 3 → 다시 영상. 사진은 영상이 끝난 뒤에만 보인다(.slides-on)
  var fr = null, player = null, vPlaying = false;
  function photos() { hero.classList.add('slides-on'); hero.classList.remove('has-video'); }
  function videoOn() { vPlaying = true; clearTimeout(timer); hero.classList.remove('slides-on'); hero.classList.add('has-video'); fr.classList.add('loaded'); }
  function videoEnded() {
    if (!vPlaying) return;
    vPlaying = false;
    player.pause().catch(function () {});
    show(0); photos();
    var k = 0;
    clearTimeout(timer);
    (function next() {
      timer = setTimeout(function () {
        if (++k < slides.length) { show(k); next(); return; }
        player.setCurrentTime(0).then(function () { return player.play(); }).catch(function () { slidesForever(); });
      }, SLIDE_MS);
    })();
  }
  function fallback() { if (fr) fr.remove(); fr = null; photos(); slidesForever(); }   // 영상이 안 되면 사진만
  if (hv && hv.getAttribute('data-vimeo') && !reduce) {
    fr = doc.createElement('iframe');
    fr.src = 'https://player.vimeo.com/video/' + hv.getAttribute('data-vimeo') + '?background=1&autoplay=1&loop=0&muted=1&autopause=0&dnt=1';
    fr.allow = 'autoplay; fullscreen; picture-in-picture'; fr.title = '배경 영상'; fr.setAttribute('tabindex', '-1');
    hv.appendChild(fr);
    var waiting = setTimeout(function () { if (!vPlaying) fallback(); }, 12000);
    var sc = doc.createElement('script');
    sc.src = 'https://player.vimeo.com/api/player.js';
    sc.onload = function () {
      player = new window.Vimeo.Player(fr);
      player.setLoop(false).catch(function () {});
      player.on('playing', function () { if (!vPlaying) { clearTimeout(waiting); setTimeout(videoOn, 250); } });
      player.on('ended', videoEnded);
      player.on('timeupdate', function (d) { if (vPlaying && d.duration && d.seconds >= d.duration - .35) videoEnded(); });   // 'ended' 가 안 올 때 대비
      player.play().catch(function () {});
    };
    sc.onerror = fallback;
    doc.head.appendChild(sc);
  } else if (hero) { photos(); if (slides.length > 1 && !reduce) slidesForever(); }   // 하위 페이지엔 첫 화면 슬라이드가 없다
  if (bar && slides.length > 1) bar.classList.add('run');

  /* 선언문: 스크롤을 내리면 글자가 차례로 채워진다 */
  var st = $('.statement');
  if (st) {
    var html = '';
    [].slice.call(st.childNodes).forEach(function (n) {
      var hl = n.nodeType === 1 && n.classList.contains('hl');
      (n.textContent || '').split(/(\s+)/).forEach(function (w) {
        html += /^\s+$/.test(w) || !w ? w : '<span class="w' + (hl ? ' hl' : '') + '">' + w + '</span>';
      });
    });
    st.innerHTML = html;
    var ws = $$('.w', st);
    // 선언문은 화면에 붙어 있는 동안(.state-track 높이만큼) 천천히 채워진다 — 다 채워진 뒤에 아래로 내려간다 (사용자 지시 2026-11-12)
    var track = st.closest('.state-track');
    var fill = function () {
      var vh = window.innerHeight, p;
      if (track && getComputedStyle(track).height !== 'auto') {
        var t = track.getBoundingClientRect();
        p = Math.min(1, Math.max(0, (vh * .35 - t.top) / (t.height - vh * .35 - vh * .25)));
      } else {
        var r = st.getBoundingClientRect();
        p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (r.height + vh * .35)));
      }
      var n = Math.round(p * ws.length);
      ws.forEach(function (w, i) { w.classList.toggle('on', i < n); });
    };
    if (reduce) ws.forEach(function (w) { w.classList.add('on'); }); else { window.addEventListener('scroll', fill, { passive: true }); fill(); }
  }

  /* 알약 탭: 떠 있는 배경 하나(.seg-ind)가 고른 칸으로 미끄러진다 */
  function seg(box, onPick) {
    if (!box) return;
    var ind = box.querySelector('.seg-ind');
    if (!ind) { ind = doc.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); box.insertBefore(ind, box.firstChild); }
    function place() {
      var on = box.querySelector('button.on');
      if (!on || !on.offsetWidth) { box.classList.add('no-ind'); return; }
      box.classList.remove('no-ind');
      ind.style.width = on.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    }
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || b.classList.contains('on')) return;
      $$('button', box).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      place();
      if (b.scrollIntoView && box.scrollWidth > box.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
      onPick(b.getAttribute('data-v'));
    });
    place();
    window.addEventListener('resize', place);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
    window.addEventListener('load', place);
  }

  /* 소싱 전략 매트릭스: WOVEN / KNIT */
  var mx = $('#matrix');
  if (mx) {
    seg($('#matrix-seg'), function (v) {
      $$('.mx', mx).forEach(function (p) { p.hidden = p.getAttribute('data-k') !== v; });
      $$('[data-mk]').forEach(function (p) { p.hidden = p.getAttribute('data-mk') !== v; });
    });
  }

  /* 실적 사진 줄: 사진을 자르지 않고, 줄 높이를 맞춰 가로를 꽉 채운다(넘치면 옆으로 넘겨 보기) */
  function fitGallery(g) {
    var imgs = $$('img', g), sum = 0, gap = 6;
    for (var i = 0; i < imgs.length; i++) { if (!imgs[i].naturalWidth) return; sum += imgs[i].naturalWidth / imgs[i].naturalHeight; }
    var w = g.clientWidth - gap * (imgs.length - 1);
    var maxH = window.innerWidth < 768 ? 320 : 560, minH = window.innerWidth < 768 ? 220 : 300;
    var h = Math.max(minH, Math.min(maxH, w / sum));
    imgs.forEach(function (im) { im.style.height = Math.floor(h) + 'px'; });
  }
  // 사진 줄은 화면 가까이 왔을 때만 불러온다(처음부터 수십 장을 받지 않게)
  var galIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (!e.isIntersecting) return; galIO.unobserve(e.target); $$('img', e.target).forEach(function (im) { im.loading = 'eager'; }); });
  }, { rootMargin: '800px 0px' }) : null;
  $$('.gallery').forEach(function (g) {
    $$('img', g).forEach(function (im) { if (!im.complete) im.addEventListener('load', function () { fitGallery(g); }); });
    if (galIO) galIO.observe(g); else $$('img', g).forEach(function (im) { im.loading = 'eager'; });
    fitGallery(g);
    window.addEventListener('resize', function () { fitGallery(g); });
  });

  /* 실적 필터 */
  var cases = $('#cases');
  if (cases) {
    seg($('#case-filter'), function (v) {
      $$('.case', cases).forEach(function (c) { c.hidden = v !== 'all' && (' ' + c.getAttribute('data-k') + ' ').indexOf(' ' + v + ' ') < 0; });
    });
  }

  /* 회사 약도: 카카오 지도(주소로 자리 찾기). JavaScript 키(data-key)가 있을 때만 지도를 그린다 — 없으면 주소 카드 + 카카오맵 · 네이버 지도 버튼 */
  var mb = $('[data-kakao-map]');
  if (mb && mb.getAttribute('data-key')) {
    var ks = doc.createElement('script');
    ks.src = 'https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=' + encodeURIComponent(mb.getAttribute('data-key'));
    ks.onload = function () {
      window.kakao.maps.load(function () {
        var K = window.kakao.maps, box = $('.map-canvas', mb);
        new K.services.Geocoder().addressSearch(mb.getAttribute('data-addr'), function (r, st) {
          if (st !== K.services.Status.OK || !r[0]) return;
          var at = new K.LatLng(r[0].y, r[0].x);
          box.innerHTML = '';
          var map = new K.Map(box, { center: at, level: 3 });
          map.setZoomable(false);
          if (innerWidth > 767) map.panBy(-Math.min(220, box.clientWidth * .18), 0);   // 왼쪽 주소 카드에 가리지 않게 자리를 오른쪽으로
          new K.Marker({ map: map, position: at });
          new K.CustomOverlay({ map: map, position: at, yAnchor: 2.4, content: '<div class="map-pin">' + mb.getAttribute('data-name') + '</div>' });
          map.addControl(new K.ZoomControl(), K.ControlPosition.RIGHT);
          mb.classList.add('is-live');
        });
      });
    };
    doc.head.appendChild(ks);
  }

  /* 날짜 칸은 어디를 눌러도 달력이 뜨게 (사용자 지시 2026-11-12) */
  $$('input[type="date"], input[type="month"]').forEach(function (d) {
    d.addEventListener('click', function () { try { if (d.showPicker) d.showPicker(); } catch (x) { /* 오래된 브라우저 */ } });
  });

  /* 생산 문의 폼 → /site-api/inquiry (xim '제작문의' 로 모인다). 봇 확인 = Cloudflare Turnstile */
  var form = $('#inquiry');
  if (form) {
    var err = $('.f-err', form), send = $('.f-send', form), bot = $('.f-bot', form), widget = null, sitekey = '';
    fetch('/site-api/inquiry-key').then(function (r) { return r.json(); }).then(function (d) {
      sitekey = d.sitekey || '';
      if (!sitekey) return;
      window.bsfBotReady = function () { widget = window.turnstile.render(bot, { sitekey: sitekey, language: 'ko', size: 'flexible' }); };
      var sc = doc.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bsfBotReady';
      sc.async = true; doc.head.appendChild(sc);
    }).catch(function () {});
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements;
      var items = $$('input[name="item"]:checked', form).map(function (x) { return x.value; });
      function need(el, msg) { err.textContent = msg; if (el && el.focus) el.focus(); }
      if (!items.length) return need(null, '만들 품목을 하나 이상 골라 주세요.');
      if (!f.company.value.trim()) return need(f.company, '회사 · 브랜드명을 넣어 주세요.');
      if (!f.name.value.trim()) return need(f.name, '담당자 이름을 넣어 주세요.');
      if (!f.contact.value.trim()) return need(f.contact, '연락처(전화 또는 이메일)를 넣어 주세요.');
      if (!f.agree.checked) return need(f.agree, '개인정보 수집 · 이용에 동의해 주세요.');
      var token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : '';
      if (sitekey && !token) return need(null, '"사람입니다" 확인을 먼저 끝내 주세요.');
      var msg = [
        '품목: ' + items.join(', '),
        '예상 수량: ' + (f.qty.value || '-'),
        '희망 납기: ' + (f.due.value || '-'),
        '샘플 · 디자인 준비: ' + (f.ready.value || '-'),
        f.email.value ? '이메일: ' + f.email.value : '',
        '',
        f.message.value.trim() || '(내용 없음)'
      ].filter(function (x, i) { return x !== '' || i === 5; }).join('\n');
      send.disabled = true; send.textContent = '보내는 중…';
      fetch('/site-api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name.value, contact: f.contact.value, org: f.company.value, kind: items.join(', ').slice(0, 40), message: msg, turnstile: token }) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.d.error || '보내지 못했습니다.');
          form.hidden = true; $('#inquiry-done').hidden = false;
          window.scrollTo({ top: $('#inquiry-done').getBoundingClientRect().top + window.pageYOffset - 120, behavior: reduce ? 'auto' : 'smooth' });
        })
        .catch(function (e2) { err.textContent = e2.message || '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'; if (widget !== null && window.turnstile) window.turnstile.reset(widget); })
        .then(function () { send.disabled = false; send.textContent = '문의 보내기'; });
    });
  }

  // 서랍의 '로그인' 은 로그인 전에만 (계약 버튼 자리에 사람 버튼이 생기면 숨긴다)
  var acc = $('.hd-account'), gl = $('.gnb-login');
  if (acc && gl && window.MutationObserver) {
    var syncLogin = function () { gl.hidden = !!acc.firstElementChild && !acc.querySelector('.xa-login'); };
    new MutationObserver(syncLogin).observe(acc, { childList: true, subtree: true });
    syncLogin();
  }
})();
