// 소개 페이지: 가입 전에 감사 한 줄 먼저 — 브라우저에 담아 두었다가 가입 · 로그인 뒤 내 노트(/note)가 옮겨 간다
(function () {
  var ASKS = [
    '오늘 먹은 것 중에 맛있었던 건 무엇인가요?',
    '오늘 나를 웃게 한 사람은 누구인가요?',
    '평소엔 당연했지만 사실 고마운 것 하나는?',
    '오늘 수고한 내 몸에게 고마운 점은?',
    '오늘 본 것 중에 예뻤던 것은?',
  ];
  var ask = document.getElementById('tryAsk');
  var input = document.getElementById('tryInput');
  if (ask) {
    var q = ASKS[Math.floor(Math.random() * ASKS.length)];
    ask.textContent = q;
  }
  var form = document.getElementById('tryForm');
  if (!form) return;
  // 여러 줄 칸이지만 Enter 는 바로 '빛 켜기' (줄바꿈은 Shift+Enter)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) { input.focus(); return; }
    try {
      var list = JSON.parse(localStorage.getItem('g365_draft') || '[]');
      list.push({ text: t.slice(0, 200) });
      localStorage.setItem('g365_draft', JSON.stringify(list.slice(-10)));
    } catch (_) {}
    form.hidden = true;
    document.getElementById('tryDone').hidden = false;
  });
})();

// 로그인한 사람에게는 소개 페이지를 보여 주지 않는다 — 늘 내 노트(/note)로 (사용자 지시 2026-11-17).
//   보통은 서버가 바로 넘기지만, 로그인 전에 받아 둔 화면이 다시 나올 때(뒤로 가기 · 미리 그려 둔 화면 · 브라우저가 들고 있던 화면)는 서버를 안 거친다 → 여기서 한 번 더 본다.
(function () {
  var busy = false;
  function go() {
    if (busy) return;
    busy = true;
    fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { busy = false; if (me && me.login_id && !me.guest) location.replace('/note'); })
      .catch(function () { busy = false; });
  }
  var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
  if (document.prerendering) document.addEventListener('prerenderingchange', go, { once: true });
  else if (nav.activationStart > 0 || nav.type === 'back_forward') go();
  else { try { if (localStorage.getItem('g365_in')) go(); } catch (_) {} }
  window.addEventListener('pageshow', function (e) { if (e.persisted) go(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { try { if (localStorage.getItem('g365_in')) go(); } catch (_) {} } });
})();
