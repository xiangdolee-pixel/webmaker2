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
      fab.classList.toggle('show', y > 420);
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
    var t0 = null, dur = 1600;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.firstChild.nodeValue = dec ? (to * e).toFixed(dec) : Math.round(to * e).toLocaleString('en-US');
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
        if (el.hasAttribute('data-count')) countUp(el); else el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    rvs.concat(counts).forEach(function (el) { io.observe(el); });
  } else {
    rvs.forEach(function (el) { el.classList.add('in'); });
    counts.forEach(function (el) { el.firstChild.nodeValue = el.getAttribute('data-count'); });
  }

  /* 첫 화면 배경 영상(Vimeo): 사진 슬라이드 위에 영상이 준비되면 서서히 덮는다. 움직임 줄이기면 사진만 */
  var hv = $('.hero-video');
  if (hv && hv.getAttribute('data-vimeo') && !reduce) {
    var fr = doc.createElement('iframe');
    fr.src = 'https://player.vimeo.com/video/' + hv.getAttribute('data-vimeo') + '?background=1&autoplay=1&loop=1&muted=1&autopause=0&dnt=1';
    fr.allow = 'autoplay; fullscreen; picture-in-picture'; fr.title = '배경 영상'; fr.setAttribute('tabindex', '-1');
    fr.addEventListener('load', function () { setTimeout(function () { fr.classList.add('loaded'); $('.hero').classList.add('has-video'); }, 1200); });
    hv.appendChild(fr);
  }

  /* 첫 화면 슬라이드: 6.5초마다 다음 장으로 (천천히 확대되며 겹쳐 바뀜) */
  var slides = $$('.slide');
  if (slides.length > 1) {
    var cur = 0, bar = $('.hero-cap .bar i'), cnt = $('.hero-cap .count'), caps = $$('[data-cap]');
    function show(i) {
      slides[cur].classList.remove('on'); cur = i; slides[cur].classList.add('on');
      if (cnt) cnt.textContent = ('0' + (cur + 1)).slice(-2);
      caps.forEach(function (c, k) { c.hidden = k !== cur; });
      if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
    }
    if (bar) bar.classList.add('run');
    if (!reduce) setInterval(function () { if (!doc.hidden) show((cur + 1) % slides.length); }, 6500);
  }

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
    var fill = function () {
      var r = st.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (r.height + vh * .35)));
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
  $$('.gallery').forEach(function (g) {
    $$('img', g).forEach(function (im) { im.loading = 'eager'; if (!im.complete) im.addEventListener('load', function () { fitGallery(g); }); });
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
