// 제작문의: 위 · 아래 '제작문의' 버튼 → 창(폼) → /api/inquiry → xim '제작문의' 메뉴. 봇 확인 = Cloudflare Turnstile
(function () {
  var dlg = document.getElementById('ask');
  var form = document.getElementById('ask-form');
  if (!dlg || !form) return;
  var bot = document.getElementById('ask-bot');
  var err = document.getElementById('ask-err');
  var send = document.getElementById('ask-send');
  var done = document.getElementById('ask-done');
  var widget = null, keyLoaded = false, sitekey = '';
  function loadBot() {
    if (keyLoaded) { if (widget !== null && window.turnstile) window.turnstile.reset(widget); return; }
    keyLoaded = true;
    fetch('/api/inquiry-key').then(function (r) { return r.json(); }).then(function (d) {
      sitekey = d.sitekey || '';
      if (!sitekey) return;
      window.askBotReady = function () { widget = window.turnstile.render(bot, { sitekey: sitekey, language: 'ko', size: 'flexible' }); };
      var sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=askBotReady';
      sc.async = true; document.head.appendChild(sc);
    }).catch(function () { keyLoaded = false; });
  }
  function open() {
    form.hidden = false; done.hidden = true; err.textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    loadBot();
    setTimeout(function () { form.elements.name.focus(); }, 50);
  }
  [].forEach.call(document.querySelectorAll('[data-ask]'), function (b) { b.addEventListener('click', open); });
  // 문의 내용 글자 수 (최대 1,000자)
  var cnt = document.getElementById('ask-count');
  form.elements.message.addEventListener('input', function () { var n = this.value.length; cnt.textContent = n.toLocaleString(); cnt.parentNode.classList.toggle('full', n >= 1000); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err.textContent = '';
    var f = form.elements;
    if (!f.name.value.trim()) { err.textContent = '이름을 넣어 주세요.'; f.name.focus(); return; }
    if (!f.contact.value.trim()) { err.textContent = '연락처를 넣어 주세요.'; f.contact.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) { err.textContent = '이메일 주소를 확인해 주세요.'; f.email.focus(); return; }
    if (f.message.value.length > 1000) { err.textContent = '문의 내용은 1,000자까지 적을 수 있습니다.'; f.message.focus(); return; }
    if (f.message.value.trim().length < 5) { err.textContent = '문의 내용을 조금 더 적어 주세요.'; f.message.focus(); return; }
    if (!f.agree.checked) { err.textContent = '개인정보 수집 · 이용에 동의해 주세요.'; f.agree.focus(); return; }
    var token = widget !== null && window.turnstile ? window.turnstile.getResponse(widget) : '';
    if (sitekey && !token) { err.textContent = '"사람입니다" 확인을 먼저 끝내 주세요.'; return; }
    send.disabled = true; send.textContent = '보내는 중…';
    fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.name.value, contact: f.contact.value, org: f.org.value, kind: f.kind.value, message: '이메일: ' + f.email.value.trim() + '\n\n' + f.message.value, turnstile: token }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error(x.d.error || '보내지 못했습니다.');
        form.reset(); form.hidden = true; done.hidden = false;
      })
      .catch(function (e2) { err.textContent = e2.message || '보내지 못했습니다. 잠시 뒤 다시 해 주세요.'; if (widget !== null && window.turnstile) window.turnstile.reset(widget); })
      .then(function () { send.disabled = false; send.textContent = '보내기'; });
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
