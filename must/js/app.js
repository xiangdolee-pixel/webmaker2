/* 머스트 — 오늘 할 일 · 기록 달력 · 알림 설정 (로그인했을 때만: window.__M 을 Worker 가 넣어 준다) */
(function () {
  'use strict';
  var M = window.__M;
  if (!M) return;
  var d = document;
  var $ = function (s) { return d.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  // 한국 시간 오늘 (기기 시간대와 상관없이)
  var kstDay = function () { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); };
  var parts = function (day) { var p = day.split('-'); return { y: +p[0], m: +p[1], d: +p[2], w: new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() }; };
  var label = function (day) { var p = parts(day); return p.m + '월 ' + p.d + '일 ' + WD[p.w] + '요일'; };

  function api(path, opt) {
    opt = opt || {};
    return fetch(path, {
      method: opt.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: opt.data ? { 'Content-Type': 'application/json' } : undefined,
      body: opt.data ? JSON.stringify(opt.data) : undefined,
    }).then(function (r) {
      if (r.status === 401) { location.href = '/member/login?next=%2F'; throw new Error('로그인이 필요합니다.'); }
      return r.json().catch(function () { return { error: '잠시 뒤 다시 해 주세요.' }; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || '잠시 뒤 다시 해 주세요.'); return j; });
    });
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  // ─── 탭 (떠 있는 배경이 미끄러진다) ───
  var tabs = $('#tabs'), ind = tabs.querySelector('.tab-ind'), tabBtns = tabs.querySelectorAll('button');
  function placeTab() {
    var a = tabs.querySelector('button.on');
    if (!a || !a.offsetWidth) return;
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
  }
  function showTab(name) {
    for (var i = 0; i < tabBtns.length; i++) {
      var t = tabBtns[i].getAttribute('data-tab'), on = t === name;
      tabBtns[i].classList.toggle('on', on);
      $('#p-' + t).hidden = !on;
    }
    placeTab();
    if (name === 'log') openLog();
    if (name === 'set') { pushBox(); instBox(); }
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) showTab(b.getAttribute('data-tab'));
  });
  window.addEventListener('resize', placeTab);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(placeTab);

  // ─── 오늘 ───
  var itemHtml = function (it, done, noEdit) {
    return '<li class="' + (done ? 'is-done' : '') + '" data-id="' + it.id + '">' +
      '<button type="button" class="chk" aria-pressed="' + (done ? 'true' : 'false') + '" aria-label="' + esc(it.text) + (done ? ' — 했음' : ' — 아직 안 함') + '"><i></i></button>' +
      '<' + (noEdit ? 'div' : 'button type="button"') + ' class="it"><b>' + esc(it.text) + '</b>' +
      (noEdit ? '' : (it.alarm ? '<small>' + esc(it.alarm) + '</small>' : '<small class="off">알림 없음</small>')) +
      '</' + (noEdit ? 'div' : 'button') + '></li>';
  };
  function drawHead() {
    var n = M.items.length, k = M.items.filter(function (x) { return x.done; }).length;
    $('#dayT').textContent = label(M.today);
    $('#dayN').innerHTML = !n ? '오늘 반드시 할 일을 적어 보세요.' : k === n ? '<b>' + n + '개 모두</b> 했어요.' : n + '개 중 <b>' + k + '개</b> 했어요.';
    $('#dayBar').style.width = n ? (k / n * 100) + '%' : '0';
  }
  function drawToday() {
    $('#list').innerHTML = M.items.map(function (it) { return itemHtml(it, it.done); }).join('');
    $('#list').hidden = !M.items.length;
    $('#empty').hidden = !!M.items.length;
    drawHead();
  }
  function setState(s) {
    var vapid = M.vapid;
    M = s; M.vapid = vapid;
    months = {};
    drawToday();
  }
  function refresh() { return api('/api/state').then(setState).catch(function () {}); }

  // 체크: 화면부터 바꾸고 저장 (다시 그리지 않는다 — 체크 움직임이 끊기지 않게)
  function toggleToday(id, li) {
    var it = M.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    it.done = !it.done;
    li.classList.toggle('is-done', it.done);
    li.querySelector('.chk').setAttribute('aria-pressed', it.done ? 'true' : 'false');
    drawHead();
    months = {};
    api('/api/check', { method: 'POST', data: { id: id, day: M.today, on: it.done } }).catch(function (e) {
      it.done = !it.done; drawToday(); toast(e.message);
    });
  }
  $('#list').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-id]');
    if (!li) return;
    var id = +li.getAttribute('data-id');
    if (e.target.closest('.chk')) toggleToday(id, li);
    else if (e.target.closest('.it')) openSheet(id);
  });

  // 알림 스위치 ↔ 시간 칸
  function bindSwitch(on, time) {
    var sync = function () { time.disabled = !on.checked; };
    on.addEventListener('change', sync); sync();
    return sync;
  }
  bindSwitch($('#addOn'), $('#addTime'));
  var syncEd = bindSwitch($('#edOn'), $('#edTime'));
  var alarmOf = function (on, time) { return on.checked && /^\d\d:\d\d$/.test(time.value) ? time.value : ''; };

  $('#add').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('#addText'), text = inp.value.replace(/\s+/g, ' ').trim();
    if (!text) { inp.focus(); return; }
    var alarm = alarmOf($('#addOn'), $('#addTime'));
    api('/api/item', { method: 'POST', data: { text: text, alarm: alarm } }).then(function (s) {
      inp.value = '';
      setState(s);
      toast(alarm ? '매일 ' + alarm + '에 알려 드릴게요.' : '추가했어요.');
      pushHint();
    }).catch(function (e2) { toast(e2.message); });
  });

  // ─── 고치기 시트 ───
  var sheet = $('#sheet'), editing = 0, delArmed = false;
  function openSheet(id) {
    var it = M.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    editing = id; delArmed = false;
    $('#edText').value = it.text;
    $('#edOn').checked = !!it.alarm;
    $('#edTime').value = it.alarm || '09:00';
    $('#edDel').textContent = '지우기';
    syncEd();
    if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', '');
  }
  function closeSheet() { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); }
  $('#edNo').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });   // 바깥(어두운 곳)을 누르면 닫힘
  $('#sheetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('#edText').value.replace(/\s+/g, ' ').trim();
    if (!text) { $('#edText').focus(); return; }
    api('/api/item', { method: 'PUT', data: { id: editing, text: text, alarm: alarmOf($('#edOn'), $('#edTime')) } })
      .then(function (s) { closeSheet(); setState(s); }).catch(function (e2) { toast(e2.message); });
  });
  $('#edDel').addEventListener('click', function () {
    if (!delArmed) { delArmed = true; $('#edDel').textContent = '정말 지울까요?'; return; }
    api('/api/item', { method: 'DELETE', data: { id: editing } })
      .then(function (s) { closeSheet(); setState(s); toast('지웠어요. 지난 기록은 달력에 남아요.'); }).catch(function (e2) { toast(e2.message); });
  });

  // ─── 기록 (달력) ───
  var months = {};          // 'YYYY-MM' → { items, set: { 'id|day': 1 } }
  var curM = M.today.slice(0, 7), pickDay = '';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var shiftM = function (m, by) { var y = +m.slice(0, 4), mo = +m.slice(5) - 1 + by; y += Math.floor(mo / 12); mo = (mo % 12 + 12) % 12; return y + '-' + pad(mo + 1); };
  function loadMonth(m) {
    if (months[m]) return Promise.resolve(months[m]);
    return api('/api/month?m=' + m).then(function (r) {
      var set = {};
      r.checks.forEach(function (c) { set[c[0] + '|' + c[1]] = 1; });
      months[m] = { items: r.items, set: set };
      return months[m];
    });
  }
  // 그날 있던 할 일 (지운 일은 지운 날 전까지, 그날 한 기록이 있으면 그날도)
  function itemsOn(data, day) {
    return data.items.filter(function (it) { return it.since <= day && (!it.until || day < it.until || data.set[it.id + '|' + day]); });
  }
  function openLog() {
    var m = curM;
    $('#monT').textContent = +m.slice(0, 4) + '년 ' + +m.slice(5) + '월';
    $('#monNext').disabled = m >= M.today.slice(0, 7);
    loadMonth(m).then(function (data) { if (m === curM) drawLog(data); }).catch(function (e) { toast(e.message); });
  }
  function drawLog(data) {
    var y = +curM.slice(0, 4), mo = +curM.slice(5);
    var first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var html = '';
    for (var i = 0; i < first; i++) html += '<span></span>';
    for (var n = 1; n <= last; n++) {
      var day = curM + '-' + pad(n);
      if (day > M.today) { html += '<span>' + n + '</span>'; continue; }
      var its = itemsOn(data, day), k = its.filter(function (it) { return data.set[it.id + '|' + day]; }).length;
      var cls = (!its.length ? 'none' : k === its.length ? 'full' : '') + (day === M.today ? ' today' : '') + (day === pickDay ? ' on' : '');
      html += '<button type="button" class="' + cls + '" style="--p:' + (its.length ? (k / its.length).toFixed(2) : 0) + '" data-day="' + day + '" aria-label="' + label(day) + ', ' + its.length + '개 중 ' + k + '개">' + n + '</button>';
    }
    $('#cal').innerHTML = html;
    if (!pickDay && curM === M.today.slice(0, 7)) pickDay = M.today;
    if (pickDay.slice(0, 7) === curM) { var b = $('#cal [data-day="' + pickDay + '"]'); if (b) b.classList.add('on'); drawPick(data); }
    else $('#pick').hidden = true;
    drawSum(data, last);
  }
  function drawPick(data) {
    var its = itemsOn(data, pickDay), k = its.filter(function (it) { return data.set[it.id + '|' + pickDay]; }).length;
    $('#pick').hidden = false;
    $('#pickT').innerHTML = label(pickDay) + '<small>' + (its.length ? its.length + '개 중 ' + k + '개' : '할 일이 없던 날') + '</small>';
    $('#pickList').innerHTML = its.map(function (it) { return itemHtml(it, !!data.set[it.id + '|' + pickDay], true); }).join('');
    $('#pickList').hidden = !its.length;
  }
  function drawSum(data, last) {
    var end = curM === M.today.slice(0, 7) ? +M.today.slice(8) : last;
    var rows = data.items.map(function (it) {
      var can = 0, did = 0;
      for (var n = 1; n <= end; n++) {
        var day = curM + '-' + pad(n), on = data.set[it.id + '|' + day];
        if (on) did++;
        if (it.since <= day && (!it.until || day < it.until || on)) can++;
      }
      return { it: it, can: can, did: did };
    }).filter(function (r) { return r.can > 0; });
    $('#sumBox').hidden = !rows.length;
    $('#sum').innerHTML = rows.map(function (r) {
      return '<li><span class="' + (r.it.until ? 'gone' : '') + '">' + esc(r.it.text) + '</span><b>' + r.did + '일 <small>/ ' + r.can + '일</small></b>' +
        '<div class="bar" aria-hidden="true"><i style="width:' + (r.did / r.can * 100).toFixed(1) + '%"></i></div></li>';
    }).join('');
  }
  // 달력 칸 하나만 다시 칠한다
  function paintDay(data, day) {
    var b = $('#cal [data-day="' + day + '"]');
    if (!b) return;
    var its = itemsOn(data, day), k = its.filter(function (it) { return data.set[it.id + '|' + day]; }).length;
    b.classList.toggle('full', !!its.length && k === its.length);
    b.classList.toggle('none', !its.length);
    b.style.setProperty('--p', its.length ? (k / its.length).toFixed(2) : 0);
  }
  $('#cal').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-day]');
    if (!b || !months[curM]) return;
    var old = $('#cal button.on'); if (old) old.classList.remove('on');
    pickDay = b.getAttribute('data-day'); b.classList.add('on');
    drawPick(months[curM]);
  });
  $('#pickList').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-id]'), data = months[curM];
    if (!li || !data) return;
    var id = +li.getAttribute('data-id'), day = pickDay, key = id + '|' + day, on = !data.set[key];
    if (on) data.set[key] = 1; else delete data.set[key];
    li.classList.toggle('is-done', on);
    var y = +curM.slice(0, 4), mo = +curM.slice(5);
    paintDay(data, day); drawSum(data, new Date(Date.UTC(y, mo, 0)).getUTCDate());
    var its = itemsOn(data, day), k = its.filter(function (it) { return data.set[it.id + '|' + day]; }).length;
    $('#pickT').innerHTML = label(day) + '<small>' + its.length + '개 중 ' + k + '개</small>';
    if (day === M.today) { M.items.forEach(function (x) { if (x.id === id) x.done = on; }); drawToday(); }
    api('/api/check', { method: 'POST', data: { id: id, day: day, on: on } }).catch(function (e2) { months = {}; openLog(); toast(e2.message); });
  });
  $('#monPrev').addEventListener('click', function () { curM = shiftM(curM, -1); pickDay = ''; openLog(); });
  $('#monNext').addEventListener('click', function () { if (curM < M.today.slice(0, 7)) { curM = shiftM(curM, 1); pickDay = ''; openLog(); } });

  // ─── 알림 (Web Push) ───
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  var pushOK = function () { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; };
  var swReady = 'serviceWorker' in navigator ? navigator.serviceWorker.register('/sw.js?v=1').catch(function () { return null; }) : Promise.resolve(null);
  var keyBytes = function (b64) { var s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, function (c) { return c.charCodeAt(0); }); };
  function currentSub() { return swReady.then(function (r) { return r && r.pushManager ? r.pushManager.getSubscription() : null; }); }
  function subscribe() {
    return swReady.then(function (r) {
      if (!r) throw new Error('이 브라우저에서는 알림을 켤 수 없어요.');
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 브라우저 설정에서 허용해 주세요.');
        return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(M.vapid) });
      });
    }).then(function (sub) { return api('/api/push', { method: 'POST', data: sub.toJSON() }); });
  }
  function pushBox() {
    var box = $('#pushBox');
    if (!pushOK()) {
      box.innerHTML = isIOS && !standalone
        ? '<p class="say">아이폰 · 아이패드는 Safari 아래 <b>공유 버튼 → 홈 화면에 추가</b>로 설치한 뒤, 홈 화면의 머스트에서 알림을 켤 수 있어요.</p>'
        : '<p class="say">이 브라우저는 알림을 지원하지 않아요. 크롬에서 열어 주세요.</p>';
      return;
    }
    if (Notification.permission === 'denied') { box.innerHTML = '<p class="say">이 기기에서 알림이 막혀 있어요. 주소창 왼쪽 단추 › 권한 › 알림을 허용으로 바꿔 주세요.</p>'; return; }
    currentSub().then(function (sub) {
      if (sub && Notification.permission === 'granted') {
        api('/api/push', { method: 'POST', data: sub.toJSON() }).catch(function () {});   // 다른 계정에서 쓰던 기기면 이 계정으로
        box.innerHTML = '<p class="say on">이 기기에서 알림을 받고 있어요.</p><div class="row"><button type="button" class="btn small" id="pushTest">시험 알림 보내기</button><button type="button" class="btn small" id="pushOff">이 기기 알림 끄기</button></div>';
        $('#pushTest').onclick = function () {
          api('/api/push/test', { method: 'POST', data: {} }).then(function (r) { toast(r.ok ? '알림을 보냈어요. 곧 도착해요.' : '보내지 못했어요. 알림을 껐다가 다시 켜 주세요.'); }).catch(function (e) { toast(e.message); });
        };
        $('#pushOff').onclick = function () {
          api('/api/push', { method: 'DELETE', data: { endpoint: sub.endpoint } }).catch(function () {}).then(function () { return sub.unsubscribe().catch(function () {}); }).then(pushBox);
        };
        return;
      }
      box.innerHTML = '<p class="say">정한 시간에 폰으로 알려 드리려면 알림을 켜 주세요.</p><div class="row"><button type="button" class="btn primary" id="pushOn">알림 켜기</button></div>';
      $('#pushOn').onclick = function () { subscribe().then(function () { toast('알림을 켰어요.'); pushBox(); }).catch(function (e) { toast(e.message); }); };
    });
  }
  // 알림 시간을 정했는데 이 기기 알림이 꺼져 있으면 알려 준다
  function pushHint() {
    if (!pushOK() || Notification.permission !== 'default') return;
    if (!M.items.some(function (x) { return x.alarm; })) return;
    setTimeout(function () { toast('알림 탭에서 알림을 켜야 폰으로 알려 드려요.'); }, 2600);
  }

  // 설치 (크롬: beforeinstallprompt)
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; instBox(); });
  window.addEventListener('appinstalled', function () { installEvt = null; standalone = true; instBox(); });
  function instBox() {
    var b = $('#instBody');
    if (standalone) { b.innerHTML = '<p class="say on">설치된 앱으로 쓰고 있어요.</p>'; return; }
    if (installEvt) {
      b.innerHTML = '<p class="say">홈 화면에 두고 앱처럼 쓸 수 있어요.</p><div class="row"><button type="button" class="btn primary" id="instGo">홈 화면에 설치</button></div>';
      $('#instGo').onclick = function () { var ev = installEvt; installEvt = null; ev.prompt(); if (ev.userChoice) ev.userChoice.then(instBox); };
      return;
    }
    b.innerHTML = isIOS
      ? '<p class="say">Safari 아래 <b>공유 버튼 → 홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.</p>'
      : '<p class="say">크롬 오른쪽 위 <b>⋮ → 홈 화면에 추가</b>(또는 앱 설치)를 누르면 앱처럼 쓸 수 있어요.</p>';
  }

  // 알림의 '했어요' 를 누르면 열려 있는 화면도 맞춘다
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'must-done') refresh();
  });

  // 날이 바뀌었거나(밤 12시) 화면으로 돌아왔으면 다시 받는다
  var lastSync = Date.now();
  function tick(force) {
    if (d.hidden) return;
    if (kstDay() !== M.today || force || Date.now() - lastSync > 5 * 60000) {
      lastSync = Date.now();
      var was = M.today;
      refresh().then(function () { if (M.today !== was) { curM = M.today.slice(0, 7); pickDay = ''; if (!$('#p-log').hidden) openLog(); } });
    }
  }
  setInterval(tick, 20000);
  d.addEventListener('visibilitychange', function () { if (!d.hidden) tick(true); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) tick(true); });

  drawToday();
  showTab('today');
  requestAnimationFrame(function () { requestAnimationFrame(function () { tabs.classList.add('ready'); }); });
})();
