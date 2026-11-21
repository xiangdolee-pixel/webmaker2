/* 킨더윌 — 사이트 전체 스크립트 한 파일 (ES5) */
(function () {
  'use strict';
  var doc = document, win = window;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || doc).querySelectorAll(s)); };
  var reduce = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var path = function (h) { try { return new URL(h, location.href).pathname.replace(/\/index\.html?$/, '/').replace(/\.html?$/, '').replace(/(.)\/+$/, '$1') || '/'; } catch (e) { return ''; } };

  /* 머리: 스크롤하면 아래 선 */
  var hd = $('.hd');
  var onScroll = function () { if (hd) hd.classList.toggle('scrolled', win.pageYOffset > 8); };
  win.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* 큰 메뉴: 올린 1단의 2단만 편다. 메뉴 글자(xms 가 바꿔 끼울 수 있음)는 주소로 짝을 찾는다 */
  var mega = $('.mega'), gnb = $('.gnb'), megaT;
  if (mega && gnb) {
    var panels = $$('.mega-p', mega);
    var panelFor = function (a) {
      var p = path(a.getAttribute('href')), hit = null;
      panels.forEach(function (el) { if (el.getAttribute('data-paths').split(' ').indexOf(p) >= 0) hit = el; });
      return hit;
    };
    var hoverT;
    var openMega = function (a) {
      var el = panelFor(a); clearTimeout(megaT);
      var fd = $('.find'); if (fd && fd.classList.contains('show')) { fd.classList.remove('show'); var fb = $('.hd-find'); if (fb) fb.setAttribute('aria-expanded', 'false'); }
      $$('a', gnb).forEach(function (x) { x.classList.toggle('on', x === a && !!el); });
      if (!el) { mega.classList.remove('show'); return; }
      panels.forEach(function (x) { x.classList.toggle('on', x === el); });
      mega.classList.add('show'); mega.setAttribute('aria-hidden', 'false'); hd.classList.add('open');
    };
    var shut = function () { clearTimeout(megaT); clearTimeout(hoverT); mega.classList.remove('show'); mega.setAttribute('aria-hidden', 'true'); hd.classList.remove('open'); $$('a', gnb).forEach(function (x) { x.classList.remove('on'); }); };
    var closeMega = function () { clearTimeout(hoverT); megaT = setTimeout(shut, 160); };
    // 마우스가 대각선으로 패널로 내려가는 길에 옆 메뉴를 스쳐도 바뀌지 않게 잠깐 기다린다(열려 있을 때만)
    gnb.addEventListener('mouseover', function (e) { var a = e.target.closest('a'); if (!a) return; clearTimeout(hoverT); clearTimeout(megaT); if (mega.classList.contains('show')) hoverT = setTimeout(function () { openMega(a); }, 110); else openMega(a); });
    gnb.addEventListener('keydown', function (e) { var a = e.target.closest('a'); if (a && e.key === 'ArrowDown') { var el = panelFor(a); if (el) { e.preventDefault(); openMega(a); var f = $('a', el); if (f) f.focus(); } } });
    hd.addEventListener('focusout', function (e) { if (!e.relatedTarget || !(gnb.contains(e.relatedTarget) || mega.contains(e.relatedTarget))) closeMega(); });
    mega.addEventListener('focusin', function () { clearTimeout(megaT); });
    gnb.addEventListener('focusin', function (e) { var a = e.target.closest('a'); if (a) openMega(a); });
    gnb.addEventListener('mouseleave', closeMega);
    mega.addEventListener('mouseenter', function () { clearTimeout(megaT); });
    mega.addEventListener('mouseleave', closeMega);
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') shut(); });
    // 지금 페이지가 속한 1단에 표시
    var here = path(location.pathname);
    $$('a', gnb).forEach(function (a) { var el = panelFor(a); if (el && el.getAttribute('data-paths').split(' ').indexOf(here) >= 0) a.setAttribute('aria-current', 'page'); });
  }

  /* 센터 찾기 펼침 */
  var findBtn = $('.hd-find'), find = $('.find');
  if (findBtn && find) {
    var setFind = function (on) { find.classList.toggle('show', on); findBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    findBtn.addEventListener('click', function (e) { e.stopPropagation(); var on = !find.classList.contains('show'); if (on && mega) { mega.classList.remove('show'); hd.classList.remove('open'); } setFind(on); });
    doc.addEventListener('click', function (e) { if (!find.contains(e.target)) setFind(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFind(false); });
  }

  /* 서랍 메뉴(폰): 왼쪽 1단 / 오른쪽 2단 */
  var burger = $('.burger'), drawer = $('.drawer');
  if (burger && drawer) {
    var setDrawer = function (on) {
      drawer.classList.toggle('show', on); hd.classList.toggle('open', on);
      burger.setAttribute('aria-expanded', on ? 'true' : 'false'); burger.setAttribute('aria-label', on ? '메뉴 닫기' : '메뉴 열기');
      doc.documentElement.style.overflow = on ? 'hidden' : '';
    };
    burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('show')); });
    $$('.dr-1 button', drawer).forEach(function (b, i) {
      b.addEventListener('click', function () {
        $$('.dr-1 button', drawer).forEach(function (x) { x.classList.toggle('on', x === b); });
        $$('.dr-p', drawer).forEach(function (x, j) { x.classList.toggle('on', j === i); });
      });
    });
    var hereP = path(location.pathname), opened = false;
    $$('.dr-p', drawer).forEach(function (p, i) {
      if (opened) return;
      if ($$('a', p).some(function (a) { return path(a.getAttribute('href')) === hereP; })) { opened = true; $$('.dr-1 button', drawer)[i].click(); }
    });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setDrawer(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') setDrawer(false); });
    win.addEventListener('resize', function () { if (win.innerWidth >= 1140 && drawer.classList.contains('show')) setDrawer(false); });
    $$('[data-open-find]').forEach(function (b) { b.addEventListener('click', function () { setDrawer(true); var t = $('.dr-1 button[data-centers]', drawer); if (t) t.click(); }); });
  }

  /* 알약 탭: 떠 있는 배경 하나가 미끄러진다. data-tabs="이름" 인 묶음의 단추(data-tab) ↔ 칸(data-pane) */
  var segs = [];
  function placeInd(seg, still) {
    var on = $('.on', seg), ind = $('.seg-ind', seg);
    if (!on || !ind || !on.offsetWidth) { seg.classList.remove('ready'); return; }
    var first = !seg.classList.contains('ready');   // 처음(페이지가 뜰 때)과 창 크기가 바뀔 때는 움직임 없이 제자리에 — 새 페이지에서 배경이 날아오면 잔상처럼 보인다
    if (first || still) ind.style.transition = 'none';
    ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    seg.classList.add('ready');
    if (first || still) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  $$('.seg').forEach(function (seg) {
    if (seg.closest('.subnav')) return;   // 페이지를 옮기는 탭은 CSS 의 페이지 전환이 미끄러뜨린다(스크립트로 옮기면 끊겨 보인다)
    var ind = doc.createElement('span'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); seg.insertBefore(ind, seg.firstChild);
    segs.push(seg); placeInd(seg);
    var name = seg.getAttribute('data-tabs'); if (!name) return;
    var btns = $$('[data-tab]', seg);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
        placeInd(seg);   // 배경부터 옮기고 내용은 뒤따라
        var key = b.getAttribute('data-tab');
        $$('[data-pane-of="' + name + '"]').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === key); });
        $$('[data-img-of="' + name + '"]').forEach(function (im) { var on = im.getAttribute('data-img') === key; if (on && im.getAttribute('data-src')) { im.src = im.getAttribute('data-src'); im.removeAttribute('data-src'); } im.classList.toggle('on', on); });
        $$('[data-text-of="' + name + '"]').forEach(function (t) { t.textContent = b.getAttribute('data-text') || ''; });
        var x = b.offsetLeft - (seg.clientWidth - b.offsetWidth) / 2; if (seg.scrollWidth > seg.clientWidth) seg.scrollTo({ left: x, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  });
  function openHash() {
    var id = decodeURIComponent((location.hash || '').slice(1)); if (!id) return;
    var pane = doc.getElementById(id); if (!pane || !pane.hasAttribute('data-pane')) return;
    var seg = $('[data-tabs="' + pane.getAttribute('data-pane-of') + '"]'), b = seg && $('[data-tab="' + pane.getAttribute('data-pane') + '"]', seg);
    if (!b) return; b.click();
    setTimeout(function () { win.scrollTo({ top: seg.getBoundingClientRect().top + win.pageYOffset - hd.offsetHeight - 76, behavior: 'auto' }); }, 60);
  }
  win.addEventListener('hashchange', openHash); win.addEventListener('load', openHash);
  var replace = function () { segs.forEach(function (x) { placeInd(x, true); }); };
  win.addEventListener('resize', replace); win.addEventListener('load', replace);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(replace);
  // 하위 페이지 형제 탭: 지금 페이지가 가운데로
  $$('.subnav .seg').forEach(function (seg) { var on = $('.on', seg); if (on) seg.scrollLeft = on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2; });

  /* 고민으로 찾기 · 지점 고르기: 목록 단추(data-pick="묶음" data-key) ↔ 칸 */
  $$('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-pick'), key = b.getAttribute('data-key');
      $$('[data-pick="' + name + '"]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('[data-pane-of="' + name + '"]').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === key); });
      if (name === 'branch') setBranch(b);
      if (name === 'worry') placeWorry(b);
    });
  });
  /* 고민으로 찾기: 폰에서는 결과를 누른 단추 바로 아래에 펼친다(멀리 내려갔다 되올라오지 않게) */
  var wOut = $('.worry-out'), wHome = wOut && wOut.parentNode;
  function placeWorry(b) {
    if (!wOut) return;
    if (win.innerWidth < 900) { b = b || $('.worry-list button.on'); if (b) b.insertAdjacentElement('afterend', wOut); }
    else if (wOut.parentNode !== wHome) wHome.appendChild(wOut);
  }
  if (wOut) { placeWorry(); win.addEventListener('resize', function () { placeWorry(); }); }
  // 탭 사진: 마우스 · 손가락이 탭에 닿으면 미리 받아 둔다(처음 누를 때 빈 상자가 보이지 않게)
  $$('[data-tabs]').forEach(function (seg) { var done = false; var pre = function () { if (done) return; done = true; $$('[data-img-of="' + seg.getAttribute('data-tabs') + '"][data-src]').forEach(function (im) { var i = new Image(); i.src = im.getAttribute('data-src'); }); }; seg.addEventListener('pointerenter', pre); seg.addEventListener('touchstart', pre, { passive: true }); seg.addEventListener('focusin', pre); });

  /* 지도: 화면 가까이 오면 그린다(xim 공용 지도) */
  var MAP = 'https://xim.plators.com/map?c=ec6a3c&zoom=17&addr=';
  function mapUrl(el) { return MAP + encodeURIComponent(el.getAttribute('data-addr')) + '&name=' + encodeURIComponent(el.getAttribute('data-name')); }
  function setBranch(b) {
    var fr = $('.br-map iframe'); if (!fr) return;
    if (fr.getAttribute('data-ready')) fr.src = mapUrl(b); else fr.setAttribute('data-next', mapUrl(b));
    var info = $('.br-info'); if (!info) return;
    $('p', info).innerHTML = b.getAttribute('data-name') + '<small>' + b.getAttribute('data-addr-full') + '</small>';
    var tel = $('.br-tel', info), go = $('.br-go', info);
    if (tel) { var t = b.getAttribute('data-tel'); tel.hidden = !t; if (t) { tel.href = 'tel:' + t.replace(/-/g, ''); tel.lastChild.textContent = t; } }
    if (go) go.href = 'https://map.naver.com/p/search/' + encodeURIComponent(b.getAttribute('data-addr'));
    if (win.innerWidth < 900 && fr.scrollIntoView) fr.parentNode.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });   // 폰: 바뀐 지도 · 연락처가 보이게
  }
  var lazyMaps = $$('iframe[data-map]');
  if (lazyMaps.length) {
    var showMap = function (fr) {
      if (fr.getAttribute('data-ready')) return; fr.setAttribute('data-ready', '1');
      fr.src = fr.getAttribute('data-next') || mapUrl(fr);
    };
    if ('IntersectionObserver' in win) {
      var mo = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { showMap(e.target); mo.unobserve(e.target); } }); }, { rootMargin: '500px 0px' });
      lazyMaps.forEach(function (fr) { mo.observe(fr); });
    } else lazyMaps.forEach(showMap);
  }

  /* 스크롤하면 살짝 떠오름 */
  var rvs = $$('.rv');
  if (reduce || !('IntersectionObserver' in win)) rvs.forEach(function (el) { el.classList.add('in'); });
  else {
    var ro = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rvs.forEach(function (el) { ro.observe(el); });
  }

  /* 펼침 칸(자주 묻는 질문 · 약력): 열릴 때도 닫힐 때도 높이가 부드럽게 */
  $$('details').forEach(function (d) {
    var sum = $('summary', d), anim = null, closing = false;
    if (!sum || reduce || !d.animate) return;
    function run(from, to, done) {
      if (anim) anim.cancel();
      d.style.overflow = 'hidden';
      anim = d.animate({ height: [from + 'px', to + 'px'] }, { duration: Math.min(520, 220 + Math.abs(to - from) * .9), easing: 'cubic-bezier(.22, .8, .24, 1)' });
      anim.onfinish = function () { anim = null; d.style.overflow = ''; done(); };
      anim.oncancel = function () { anim = null; };
    }
    sum.addEventListener('click', function (e) {
      e.preventDefault();
      var from = d.offsetHeight;
      if (d.open && !closing) { closing = true; d.classList.add('closing'); run(from, sum.offsetHeight + (d.offsetHeight - d.clientHeight), function () { d.open = false; closing = false; d.classList.remove('closing'); }); }
      else { closing = false; d.classList.remove('closing'); d.open = true; run(from, d.scrollHeight + (d.offsetHeight - d.clientHeight), function () {}); }
    });
  });

  /* 영상: 누르면 그 자리에서 재생(바깥 사이트로 보내지 않는다) */
  $$('[data-yt]').forEach(function (box) {
    box.addEventListener('click', function () {
      var fr = doc.createElement('iframe');
      fr.src = 'https://www.youtube-nocookie.com/embed/' + box.getAttribute('data-yt') + '?autoplay=1&rel=0' + (box.getAttribute('data-start') ? '&start=' + box.getAttribute('data-start') : '');
      fr.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'; fr.allowFullscreen = true; fr.title = box.getAttribute('aria-label') || '영상';
      box.innerHTML = ''; box.appendChild(fr); box.classList.add('playing');
    });
  });

  /* 넓은 표: 폰에서 옆으로 밀 수 있으면 알려 준다 */
  var tip = function () {
    $$('.tbl-w').forEach(function (w) {
      var on = w.scrollWidth > w.clientWidth + 4, t = w.previousElementSibling;
      if (!t || !t.classList.contains('tbl-tip')) { if (!on) return; t = doc.createElement('p'); t.className = 'tbl-tip'; t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>표를 옆으로 밀어 보세요'; w.parentNode.insertBefore(t, w); w.setAttribute('tabindex', '0'); w.addEventListener('scroll', function () { w.classList.toggle('end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 4); }, { passive: true }); }
      t.classList.toggle('show', on); w.classList.toggle('scrolls', on);
    });
  };
  tip(); win.addEventListener('resize', tip); win.addEventListener('load', tip);
  doc.addEventListener('click', function (e) { if (e.target.closest('[data-tab]')) setTimeout(tip, 30); });

  /* 전문가: 분야로 거르기 */
  var teamSeg = $('[data-team-filter]');
  if (teamSeg) $$('button', teamSeg).forEach(function (b) {
    b.addEventListener('click', function () {
      $$('button', teamSeg).forEach(function (x) { x.classList.toggle('on', x === b); }); placeInd(teamSeg);
      var k = b.getAttribute('data-f');
      $$('.tm').forEach(function (c) { c.hidden = k !== 'all' && (c.getAttribute('data-f') || '').split(' ').indexOf(k) < 0; });
    });
  });

  /* 문의 폼 → /site-api/inquiry (그 사이트 xms 문의함). 봇 확인 = Turnstile */
  var form = $('#inquiry');
  if (form) {
    var err = $('.f-err', form), send = $('.f-send', form), bot = $('.f-bot', form), widget = null, sitekey = '';
    fetch('/site-api/inquiry-key').then(function (r) { return r.json(); }).then(function (d) {
      sitekey = d.sitekey || ''; if (!sitekey) return;
      win.kwBotReady = function () { widget = win.turnstile.render(bot, { sitekey: sitekey, language: 'ko', size: bot.clientWidth < 300 ? 'compact' : 'flexible' }); };
      var sc = doc.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=kwBotReady'; sc.async = true; doc.head.appendChild(sc);
    }).catch(function () {});
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var f = form.elements;
      function need(el, msg, box) {
        box = box || (el && (el.closest('.f, .agree') || el)); err.textContent = box ? '' : msg;
        $$('.f-bad', form).forEach(function (x) { x.classList.remove('f-bad'); }); $$('.f-msg', form).forEach(function (x) { x.remove(); });
        if (!box) return;
        void box.offsetWidth; box.classList.add('f-bad');
        var m = doc.createElement('p'); m.className = 'f-msg'; m.setAttribute('role', 'alert'); m.textContent = msg; box.insertAdjacentElement('afterend', m);
        win.scrollTo({ top: Math.max(0, box.getBoundingClientRect().top + win.pageYOffset - win.innerHeight * .28), behavior: reduce ? 'auto' : 'smooth' });
        if (el && el.focus) setTimeout(function () { el.focus({ preventScroll: true }); }, reduce ? 0 : 450);
        var clear = function () { box.classList.remove('f-bad'); m.remove(); };
        box.addEventListener('input', clear, { once: true }); box.addEventListener('change', clear, { once: true });
      }
      var kinds = $$('input[name="kind"]:checked', form).map(function (x) { return x.value; });
      if (!f.name.value.trim()) return need(f.name, '이름을 넣어 주세요.');
      if (f.contact.value.replace(/[^0-9]/g, '').length < 9) return need(f.contact, '연락받으실 전화번호를 숫자로 넣어 주세요.');
      if (!f.agree.checked) return need(f.agree, '개인정보 수집 · 이용에 동의해 주세요.');
      var token = widget !== null && win.turnstile ? win.turnstile.getResponse(widget) : '';
      if (sitekey && !token) return need(null, '"사람입니다" 확인을 먼저 끝내 주세요.', bot);
      var msg = ['관심 분야: ' + (kinds.join(', ') || '-'), '희망 센터: ' + (f.center.value || '-'), '나이(연령): ' + (f.age.value || '-'), '연락 편한 시간: ' + (f.when.value || '-'), '', f.message.value.trim() || '(내용 없음)'].join('\n');
      send.disabled = true; send.textContent = '보내는 중…';
      fetch('/site-api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name.value, contact: f.contact.value, org: f.center.value || '', kind: (kinds.join(', ') || '상담 문의').slice(0, 40), message: msg, turnstile: token }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok) throw { say: x.d.error || '' };
          form.hidden = true; var done = $('#inquiry-done'); done.hidden = false;
          win.scrollTo({ top: done.getBoundingClientRect().top + win.pageYOffset - 140, behavior: reduce ? 'auto' : 'smooth' });
        })
        .catch(function (e2) { err.textContent = (e2 && e2.say) || '보내지 못했습니다. 잠시 뒤 다시 해 주시거나 전화로 문의해 주세요.'; if (widget !== null && win.turnstile) win.turnstile.reset(widget); })
        .then(function () { send.disabled = false; send.textContent = '문의 보내기'; });
    });
  }

  /* 페이지 전환: 탭 띠가 위에 붙어 있을 때(스크롤한 상태) 떠나면 탭은 따로 움직이지 않게 */
  win.addEventListener('pageswap', function () {
    var sn = $('.subnav'); if (sn && win.pageYOffset > 4 && sn.getBoundingClientRect().top <= hd.offsetHeight + 2) doc.documentElement.classList.add('vt-plain');
  });
  win.addEventListener('pageshow', function () { doc.documentElement.classList.remove('vt-plain'); });

  /* 서랍 · 머리의 '로그인' 은 로그인 전에만 */
  var acc = $('.hd-account'), gl = $('.dr-login');
  if (acc && gl && win.MutationObserver) {
    var sync = function () { gl.hidden = !!acc.firstElementChild && !acc.querySelector('.xa-login'); };
    new MutationObserver(sync).observe(acc, { childList: true, subtree: true }); sync();
  }
})();
