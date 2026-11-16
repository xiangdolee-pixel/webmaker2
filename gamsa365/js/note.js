// 감사노트365 — 내 노트 (/note)
//   첫 자료는 Worker 가 html 에 함께 넣는다(window.__G) → 뜨자마자 그린다. 저장은 하루 단위(PUT /api/day)로 조용히.
//   마음 쓰는 원칙: 재촉 · 비교 · 끊김(연속 기록) 없이, 적은 만큼 빛이 켜지고, 힘든 날엔 하나로도 충분하게.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (path, opt = {}) => {
    const res = await fetch(path, { method: opt.method || 'GET', headers: opt.data ? { 'Content-Type': 'application/json' } : {}, body: opt.data ? JSON.stringify(opt.data) : undefined, credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/member/login?next=%2Fnote'; throw new Error('login'); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || '잠시 뒤에 다시 해 주세요.');
    return d;
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let G = window.__G;
  const start = async () => {
    if (!G) G = await api('/api/state');
    init();
  };

  // ─── 문구 ───
  const MOODS = [
    { v: 1, name: '비', say: '많이 힘든 날이었군요. 오늘은 하나만 적어도 충분해요. 아주 작은 것이어도 괜찮아요.' },
    { v: 2, name: '흐림', say: '마음이 흐린 날이네요. 그래도 괜찮았던 순간 하나를 같이 찾아봐요.' },
    { v: 3, name: '구름 조금', say: '그럭저럭 지나간 하루. 그 속에 숨은 작은 빛을 찾아볼까요?' },
    { v: 4, name: '맑음', say: '좋은 날이었네요! 이 마음을 감사로 담아 두면 더 오래 남아요.' },
    { v: 5, name: '햇살 가득', say: '반짝이는 하루였군요. 오늘의 빛을 꼭 기록해 두세요.' },
  ];
  const ICON = {
    1: '<path d="M7 14.5a4 4 0 0 1 .6-7.95A5.5 5.5 0 0 1 18 8a3.5 3.5 0 0 1-.5 6.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke-linecap="round"/>',
    2: '<path d="M6.5 18a4.5 4.5 0 0 1 .7-8.95A6 6 0 0 1 18.6 10 4 4 0 0 1 18 18z"/>',
    3: '<circle cx="9" cy="8" r="3.2"/><path d="M9 2.5v1.3M3.5 8h1.3M5.1 4.1l.9.9M12.9 4.1l-.9.9" stroke-linecap="round"/><path d="M9.5 19a3.8 3.8 0 0 1 .5-7.5 5 5 0 0 1 9.4 2.2A2.9 2.9 0 0 1 19 19z"/>',
    4: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke-linecap="round"/>',
    5: '<circle cx="12" cy="12" r="5"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1" stroke-linecap="round"/>',
  };
  const svg = (v) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[v]}</svg>`;
  const ASKS = [
    '오늘 먹은 것 중에 맛있었던 건?', '오늘 나를 웃게 한 사람은 누구였나요?', '평소엔 당연했지만 사실 고마운 것 하나는?',
    '오늘 수고한 내 몸에게 고마운 점은?', '오늘 본 것 중에 예뻤던 것은?', '오늘 누군가에게 받은 작은 친절은?',
    '힘들었지만 무사히 지나간 일이 있었나요?', '지금 내 곁에 있어서 고마운 물건은?', '오늘 들은 말 중에 좋았던 한마디는?',
    '오늘의 날씨에서 좋았던 점은?', '요즘 나를 버티게 해 주는 것은?', '오늘 내가 나에게 잘한 일 하나는?',
    '오늘 편안했던 순간은 언제였나요?', '고마운데 아직 말하지 못한 사람이 있나요?', '오늘 배운 것, 알게 된 것이 있나요?',
    '집에 돌아와 쉴 수 있다는 것, 무엇이 고마운가요?', '오늘 들은 음악이나 소리 중 좋았던 것은?', '어제보다 조금 나아진 것이 있나요?',
  ];
  const CHEERS = ['빛 하나가 켜졌어요', '그 순간을 알아챈 당신, 멋져요', '작은 것을 볼 줄 아는 마음이에요', '좋아요, 마음에 잘 담았어요', '오늘의 나에게 고마워해도 돼요', '이런 감사가 하루를 지켜 줘요'];
  const DONE = {
    low: ['오늘도 힘든 날이었지만, 그래도 감사한 순간이 있었구나.', '이렇게 힘든 날에 감사를 찾아낸 건 정말 큰일이에요. 오늘은 푹 쉬어요.'],
    mid: ['오늘의 빛을 다 담았어요. 잔잔한 하루에도 감사는 숨어 있었네요.', '다 적었어요. 이 감사들이 오늘 밤 마음을 조금 더 편하게 해 줄 거예요.'],
    high: ['반짝이는 하루를 잘 담았어요. 오늘의 기분, 오래 기억해요.', '좋은 날을 감사로 남겨 두면 힘든 날에 꺼내 볼 수 있어요.'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ─── 미끄러지는 탭 (CLAUDE.md 5) ───
  function seg(el, onPick) {
    const ind = $('.seg-ind', el);
    const move = () => {
      const b = $('button.on', el);
      if (!b || !b.offsetWidth) { el.classList.add('noind'); return; }
      el.classList.remove('noind');
      ind.style.width = `${b.offsetWidth}px`;
      ind.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.classList.contains('on')) return;
      $$('button', el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      move();
      onPick(b);
    });
    addEventListener('resize', move);
    document.fonts?.ready.then(move);
    requestAnimationFrame(() => { move(); requestAnimationFrame(() => el.classList.add('ready')); });
    return { move, set(b) { $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); move(); } };
  }

  // ─── 오늘 ───
  let lines = [], mood = 0, askI = Math.floor(Math.random() * ASKS.length), saveT = 0, doneShown = false, baseLights = 0, baseCount = 0;
  const target = () => (mood === 1 ? 1 : G.me.goal);
  const filled = () => lines.filter((l) => l.text.trim()).length;

  function greet() {
    const d = new Date();
    const h = d.getHours();
    const who = G.me.nick || G.me.name;
    // 위 하늘 그림(note.html 의 #sky)과 같은 때 나눔
    const [name, hi] = h >= 4 && h < 6 ? ['새벽', '고요한 새벽이에요']
      : h >= 6 && h < 11 ? ['아침', '좋은 아침이에요']
      : h >= 11 && h < 15 ? ['한낮', '따뜻한 한낮이에요']
      : h >= 15 && h < 18 ? ['늦은 오후', '오후도 잘 보내고 있나요']
      : h >= 18 && h < 20 ? ['저녁', '오늘 하루도 수고했어요']
      : ['밤', h >= 20 ? '편안한 밤이에요, 오늘도 애썼어요' : '늦은 밤까지 애썼어요'];
    $('#gTime').textContent = `${name} · `;
    $('#gDate').textContent = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
    $('#gTitle').textContent = who ? `${who}님, ${hi}` : hi;
    if (G.newHearts > 0) {
      const g = $('#gift');
      g.innerHTML = `<span class="glow-dot" aria-hidden="true"></span> 당신이 나눈 감사에 이웃의 빛 <b>${G.newHearts}개</b>가 도착했어요`;
      g.hidden = false;
      api('/api/seen', { method: 'POST', data: {} }).catch(() => {});
    }
  }

  function drawMoods() {
    const box = $('#moods');
    box.innerHTML = MOODS.map((m) => `<button type="button" class="mood m${m.v}${mood === m.v ? ' on' : ''}" data-v="${m.v}" aria-pressed="${mood === m.v}">${svg(m.v)}<span>${m.name}</span></button>`).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.mood');
      if (!b) return;
      mood = Number(b.dataset.v);
      $$('.mood', box).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      sayMood();
      drawLights();
      queueSave();
    });
    sayMood();
  }
  function sayMood() {
    const m = MOODS.find((x) => x.v === mood);
    $('#moodSay').textContent = m ? m.say : '비 오는 날도 괜찮아요. 지금 마음과 가장 가까운 날씨를 골라 주세요.';
    $('#sos').hidden = !G.sos;
  }

  function drawLights() {
    const n = filled(), t = target();
    const shown = Math.max(t, n);
    $('#lights').innerHTML = Array.from({ length: shown }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('') + `<em>${n >= t ? (n > t ? `${n}개` : '다 채웠어요') : `${t}개 중 ${n}개`}</em>`;
    $('#dayTitle').textContent = mood === 1 ? '오늘의 감사 — 하나면 충분해요' : `오늘의 감사 ${G.me.goal}가지`;
    $('#addLine').hidden = lines.length >= 10;
    const done = n >= t && n > 0;
    $('#done').hidden = !done;
    if (done && !doneShown) {
      doneShown = true;
      const key = mood && mood <= 2 ? 'low' : mood >= 4 ? 'high' : 'mid';
      const days = G.days + (baseCount ? 0 : 1);
      $('#doneSay').innerHTML = `${esc(pick(DONE[key]))}<br><small>감사노트와 함께한 ${days}번째 날이에요.</small>`;
      pushHint();
      if (!reduce) { const d = $('#done'); d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
    }
    if (!done) doneShown = false;
    // 통계
    G.cal[G.today] = n;
    $('#sLights').textContent = baseLights - baseCount + n;
  }

  function lineHtml(l, i) {
    return `<li class="line${l.text.trim() ? ' lit' : ''}" data-i="${i}">
      <span class="ldot" aria-hidden="true"></span>
      <div class="lbody">
        <textarea rows="1" maxlength="200" aria-label="감사 ${i + 1}" placeholder="${esc(hint(i))}">${esc(l.text)}</textarea>
        <input class="lwhy" maxlength="200" placeholder="더 적고 싶은 이야기가 있다면 (선택)" value="${esc(l.why)}"${l.whyOpen || l.why ? '' : ' hidden'}>
        <div class="ltools">
          ${G.me.helps || l.why ? `<button type="button" class="ltool why${l.whyOpen || l.why ? ' on' : ''}">한 줄 더</button>` : ''}
          <button type="button" class="ltool share${l.shared ? ' on' : ''}" aria-pressed="${!!l.shared}">${l.shared ? '나누는 중' : '나누기'}</button>
          ${l.hearts ? `<span class="lhearts">이웃의 빛 ${l.hearts}</span>` : ''}
        </div>
      </div>
    </li>`;
  }
  const firstEmpty = () => { const i = lines.findIndex((l) => !l.text.trim()); return i < 0 ? -1 : i; };
  function drawLines() {
    const ol = $('#lines');
    ol.innerHTML = lines.map(lineHtml).join('');
    $$('textarea', ol).forEach(grow);
  }
  // 숨겨진 칸(처음 질문 중 · 다른 탭)은 높이를 0 으로 재므로 건드리지 않고, 보일 때 다시 잰다
  const grow = (ta) => { if (!ta.offsetParent) { ta.style.height = ''; return; } ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  // 감사 제목은 "~해서 감사합니다." 한 줄 (무엇이, 왜 고마웠는지가 함께 담긴다)
  //   도움 질문을 켠 사람은 첫 빈 줄에 질문, 끈 사람은 질문 없이 예시 꼴만
  const EXAMPLES = ['예) 오늘 아침 햇살이 따뜻해서 감사합니다.', '예) 동료가 커피를 챙겨 줘서 감사합니다.', '예) 무사히 하루를 마칠 수 있어서 감사합니다.'];
  const hint = (i) => {
    const first = i === firstEmpty();
    if (G.me.helps && first) return ASKS[askI];
    return !lines.slice(0, i).some((l) => l.text.trim()) && first ? EXAMPLES[i % 3] : '~해서 감사합니다.';
  };
  function setAsk() {
    $('#askBox').hidden = !G.me.helps;
    $('#askQ').textContent = ASKS[askI];
    $$('#lines textarea').forEach((ta, j) => { ta.placeholder = hint(j); });
  }

  function bindLines() {
    const ol = $('#lines');
    ol.addEventListener('input', (e) => {
      const li = e.target.closest('.line');
      if (!li) return;
      const l = lines[li.dataset.i];
      if (e.target.tagName === 'TEXTAREA') {
        const was = !!l.text.trim();
        l.text = e.target.value;
        grow(e.target);
        const now = !!l.text.trim();
        if (was !== now) { li.classList.toggle('lit', now); drawLights(); setAsk(); }
      } else l.why = e.target.value;
      queueSave();
    });
    ol.addEventListener('focusout', (e) => {
      const li = e.target.closest('.line');
      if (!li || e.target.tagName !== 'TEXTAREA') return;
      const l = lines[li.dataset.i];
      if (l.text.trim() && !l.cheered) { l.cheered = true; toast(pick(CHEERS)); }
    });
    ol.addEventListener('keydown', (e) => {
      // Enter = 다음 줄로 (줄바꿈 대신)
      if (e.key !== 'Enter' || e.target.tagName !== 'TEXTAREA' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      const i = Number(e.target.closest('.line').dataset.i);
      if (i === lines.length - 1 && lines.length < 10 && lines[i].text.trim()) addLine();
      const next = $$('#lines textarea')[i + 1];
      if (next) next.focus();
    });
    ol.addEventListener('click', (e) => {
      const b = e.target.closest('.ltool');
      if (!b) return;
      const li = b.closest('.line');
      const l = lines[li.dataset.i];
      if (b.classList.contains('why')) {
        const inp = $('.lwhy', li);
        l.whyOpen = inp.hidden;
        inp.hidden = !inp.hidden;
        b.classList.toggle('on', !inp.hidden);
        if (!inp.hidden) inp.focus();
      } else {
        l.shared = !l.shared;
        b.classList.toggle('on', l.shared);
        b.setAttribute('aria-pressed', l.shared);
        b.textContent = l.shared ? '나누는 중' : '나누기';
        if (l.shared) toast('이름 없이 이웃과 나눠요 (이유는 나만 봐요)');
        queueSave();
      }
    });
  }
  function addLine() {
    if (lines.length >= 10) return;
    lines.push({ id: 0, text: '', why: '', shared: G.me.share_default, hearts: 0 });
    $('#lines').insertAdjacentHTML('beforeend', lineHtml(lines[lines.length - 1], lines.length - 1));
    drawLights();
  }

  function queueSave() {
    clearTimeout(saveT);
    $('#saved').textContent = '';
    saveT = setTimeout(save, 700);
  }
  let saving = null;
  async function save() {
    if (saving) { await saving; }
    const items = lines.map((l) => ({ id: l.id, text: l.text, why: l.why, shared: l.shared }));
    $('#saved').textContent = '저장 중…';
    saving = api('/api/day', { method: 'PUT', data: { day: G.today, mood, items } }).then((r) => {
      const kept = lines.filter((l) => l.text.trim());
      r.items.forEach((it, i) => { if (kept[i]) { kept[i].id = it.id; kept[i].hearts = it.hearts; } });
      lines.filter((l) => !l.text.trim()).forEach((l) => { l.id = 0; });
      $('#saved').textContent = '저장됐어요';
    }).catch((e) => { $('#saved').textContent = e.message === 'login' ? '' : '저장하지 못했어요. 잠시 뒤 다시 저장할게요.'; setTimeout(queueSave, 5000); })
      .finally(() => { saving = null; });
    return saving;
  }
  addEventListener('pagehide', () => {
    // 닫기 직전 남은 저장
    if (!saveT) return;
    clearTimeout(saveT);
    const items = lines.map((l) => ({ id: l.id, text: l.text, why: l.why, shared: l.shared }));
    fetch('/api/day', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: G.today, mood, items }) }).catch(() => {});
  });

  let toastT = 0;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // 가입 전에 소개 페이지에서 적은 감사 옮겨 담기
  function importDraft() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('g365_draft') || '[]'); localStorage.removeItem('g365_draft'); } catch { return; }
    list = list.filter((x) => x && x.text);
    if (!list.length) return;
    for (const d of list) {
      if (lines.some((l) => l.text === d.text)) continue;
      let i = firstEmpty();
      if (i < 0) { if (lines.length >= 10) break; lines.push({ id: 0, text: '', why: '', shared: false, hearts: 0 }); i = lines.length - 1; }
      lines[i].text = d.text;
    }
    drawLines();
    queueSave();
    setTimeout(() => toast('가입 전에 적은 감사를 내 노트에 옮겨 담았어요'), 400);
  }

  // 기억 꺼내기
  function bindMemory() {
    $('#memBtn').addEventListener('click', async () => {
      const c = $('#memCard');
      try {
        const r = await api('/api/memory');
        c.innerHTML = r.empty ? '<p>아직 꺼낼 지난 감사가 없어요. 오늘 적은 감사가 내일의 나를 위로해 줄 거예요.</p>'
          : `<span class="mem-day">${esc(fmtDay(r.day))}의 나</span><p>${esc(r.text)}</p>${r.why ? `<p class="mem-why">${esc(r.why)}</p>` : ''}`;
        c.hidden = false;
        $('#memBtn').textContent = '하나 더 꺼내기';
      } catch (e) { toast(e.message); }
    });
  }
  const fmtDay = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y === new Date().getFullYear() ? '' : `${y}년 `}${m}월 ${dd}일`; };

  // ─── 나눔 ───
  let feedLoaded = false, feedLast = 0, admin = false, feedDay = '', feedBusy = false, feedEnd = false;
  // 나눔: 끝없이 이어지되(아래에 닿으면 다음 30개) 날짜별로 묶는다 — 오늘 · 어제 · 11월 14일
  async function loadFeed(more) {
    if (feedBusy || (more && feedEnd)) return;
    feedBusy = true;
    const ul = $('#feed');
    if (!more) { ul.innerHTML = '<li class="feed-empty">불러오는 중…</li>'; feedDay = ''; feedEnd = false; }
    try {
      const r = await api(`/api/feed${more ? `?before=${feedLast}` : ''}`);
      admin = r.admin;
      if (!more) ul.innerHTML = '';
      if (!r.items.length && !more) ul.innerHTML = '<li class="feed-empty">아직 나눠진 감사가 없어요. 오늘의 감사에서 “나누기”를 눌러 첫 번째 빛이 되어 주세요.</li>';
      let html = '';
      for (const it of r.items) {
        if (it.day !== feedDay) { feedDay = it.day; html += `<li class="feed-day">${esc(dayName(it.day))}</li>`; }
        html += feedHtml(it);
      }
      ul.insertAdjacentHTML('beforeend', html);
      if (r.items.length) feedLast = r.items[r.items.length - 1].id;
      feedEnd = r.items.length < 30;
      $('#feedMore').hidden = feedEnd;
      feedLoaded = true;
    } catch (e) { if (!more) ul.innerHTML = `<li class="feed-empty">${esc(e.message)}</li>`; }
    feedBusy = false;
  }
  const dayName = (d) => {
    if (d === G.today) return '오늘';
    if (d === new Date(Date.parse(`${G.today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)) return '어제';
    return fmtDay(d);
  };
  // 프로필: xms 사진 → 이름 첫 글자 동그라미 → 익명은 빛 (Worker 의 avatarHtml 과 같은 꼴)
  const avatar = (it) => it.avatar
    ? `<span class="av"><img src="${esc(it.avatar)}" alt="" loading="lazy" width="40" height="40"></span>`
    : it.nick ? `<span class="av c${it.c}">${esc([...it.nick][0])}</span>` : '<span class="av anon" aria-hidden="true"><i></i></span>';
  const feedHtml = (it) => `<li class="feed-card t${it.c}" data-id="${it.id}">
    <div class="fc-head">${avatar(it)}<span class="fc-who"><b>${esc(it.nick || '익명의 이웃')}${it.own ? ' <em class="fc-me">나</em>' : ''}</b><small>${esc(dayName(it.day))}</small></span>
      ${it.own ? '' : '<button type="button" class="report">신고</button>'}${admin && !it.own ? '<button type="button" class="hide">숨기기</button>' : ''}</div>
    <p class="fc-text">${esc(it.text)}</p>
    <div class="feed-row">
      ${it.own ? `<span class="heart own"><span class="glow-dot" aria-hidden="true"></span>받은 빛 ${it.hearts}</span>` : `<button type="button" class="heart${it.mine ? ' on' : ''}" aria-pressed="${it.mine}"><span class="glow-dot" aria-hidden="true"></span><b>나도 감사해요</b> <em>${it.hearts}</em></button>`}
    </div>
  </li>`;
  // 오늘 탭: 이웃의 오늘 감사 3개 (막힐 때 영감) — 같은 카드, 같은 빛 보내기
  function drawNear() {
    const list = G.near || [];
    $('#nearBox').hidden = !list.length;
    $('#near').innerHTML = list.map(feedHtml).join('');
  }
  function bindFeed() {
    const onCard = async (e) => {
      const card = e.target.closest('.feed-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const h = e.target.closest('button.heart');
      if (h) {
        const on = !h.classList.contains('on');
        h.classList.toggle('on', on);
        const em = $('em', h);
        em.textContent = Number(em.textContent) + (on ? 1 : -1);
        if (on && !reduce) { h.classList.remove('burst'); void h.offsetWidth; h.classList.add('burst'); }
        try { const r = await api('/api/heart', { method: 'POST', data: { id } }); h.classList.toggle('on', r.mine); em.textContent = r.hearts; } catch (err) { toast(err.message); }
        return;
      }
      const rep = e.target.closest('button.report');
      if (rep) {
        // 창(dialog) 대신 버튼 자리에서 한 번 더 묻기
        if (!rep.classList.contains('ask')) { rep.classList.add('ask'); rep.textContent = '정말 신고할까요?'; setTimeout(() => { rep.classList.remove('ask'); rep.textContent = '신고'; }, 4000); return; }
        await api('/api/report', { method: 'POST', data: { id } }).catch(() => {});
        rep.replaceWith(Object.assign(document.createElement('span'), { className: 'feed-meta', textContent: '신고했어요. 살펴볼게요.' }));
        return;
      }
      const hide = e.target.closest('button.hide');
      if (hide) { await api('/api/hide', { method: 'POST', data: { id } }).catch((er) => toast(er.message)); card.remove(); }
    };
    $('#feed').addEventListener('click', onCard);
    $('#near').addEventListener('click', onCard);
    // 아래 끝에 닿으면 이어서
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { if (es[0].isIntersecting && feedLoaded && !$('[data-panel=share]').hidden) loadFeed(true); }, { rootMargin: '400px' }).observe($('#feedMore'));
    $('#feedMore').addEventListener('click', () => loadFeed(true));
  }

  // ─── 돌아보기 ───
  function drawLook() {
    const year = Number(G.today.slice(0, 4));
    $('#yearLabel').textContent = `${year}년`;
    $('#sDays').textContent = G.days + (baseCount || !filled() ? 0 : 1);
    $('#sYear').textContent = Object.values(G.cal).filter((n) => n > 0).length;
    let html = '';
    for (let m = 0; m < 12; m++) {
      const days = new Date(year, m + 1, 0).getDate();
      html += `<div class="cal-row"><span class="cal-m">${m + 1}월</span><div class="cal-d">`;
      for (let d = 1; d <= days; d++) {
        const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const n = G.cal[key] || 0;
        const cls = key > G.today ? 'fut' : n >= G.me.goal ? 'lv2' : n ? 'lv1' : '';
        html += `<button type="button" class="${cls}${key === G.today ? ' now' : ''}" data-d="${key}" aria-label="${m + 1}월 ${d}일${n ? ` 감사 ${n}개` : ''}"${key > G.today ? ' disabled' : ''}></button>`;
      }
      html += '</div></div>';
    }
    $('#cal').innerHTML = html;
    // 마음 날씨 30일
    const map = Object.fromEntries(G.moods.map((x) => [x.day, x.mood]));
    if (mood) map[G.today] = mood;
    let w = '';
    const vals = [];
    for (let i = 29; i >= 0; i--) {
      const key = new Date(Date.parse(`${G.today}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
      const v = map[key] || 0;
      if (v) vals.push(v);
      w += `<span class="wd${v ? ` m${v}` : ''}" title="${fmtDay(key)}">${v ? svg(v) : ''}</span>`;
    }
    $('#weather').innerHTML = w;
    let say = '마음 날씨를 기록하면, 감사와 함께 내 마음이 어떻게 변하는지 볼 수 있어요.';
    if (vals.length >= 6) {
      const h = Math.floor(vals.length / 2);
      const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      const d = avg(vals.slice(h)) - avg(vals.slice(0, h));
      say = d >= 0.3 ? '최근 마음 날씨가 조금씩 맑아지고 있어요. 감사를 적어 온 당신 덕분이에요.'
        : '날씨는 오르내리는 게 자연스러워요. 흐린 날에도 기록하는 것만으로 마음을 돌보고 있는 거예요.';
    }
    $('#weatherSay').textContent = say;
  }
  function bindLook() {
    $('#cal').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-d]');
      if (!b) return;
      const v = $('#dayView');
      try {
        const r = await api(`/api/day?d=${b.dataset.d}`);
        const m = MOODS.find((x) => x.v === r.mood);
        v.innerHTML = `<h2 class="box-title">${esc(fmtDay(r.day))}${m ? ` <span class="dv-mood m${m.v}">${svg(m.v)}${m.name}</span>` : ''}</h2>` + (r.items.length
          ? `<ol class="dv-list">${r.items.map((it) => `<li><p>${esc(it.text)}</p>${it.why ? `<p class="mem-why">${esc(it.why)}</p>` : ''}${it.hearts ? `<span class="lhearts">이웃의 빛 ${it.hearts}</span>` : ''}</li>`).join('')}</ol>`
          : '<p class="sec-sub">이날은 쉬어 간 날이에요. 쉬어 가도 괜찮아요.</p>');
        v.hidden = false;
        v.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      } catch (err) { toast(err.message); }
    });
  }

  // ─── 설정 · 알림 ───
  async function saveSet(data) {
    try {
      const r = await api('/api/settings', { method: 'PUT', data });
      Object.assign(G.me, r);
      $('#setSaved').textContent = '저장됐어요';
      setTimeout(() => { $('#setSaved').textContent = ''; }, 1600);
    } catch (e) { toast(e.message); }
  }
  let goalSeg;
  function bindSet() {
    goalSeg = seg($('#goalSeg'), (b) => {
      G.me.goal = Number(b.dataset.goal);
      saveSet({ goal: G.me.goal });
      drawLights();
      if (lines.length < G.me.goal) { while (lines.length < G.me.goal) lines.push({ id: 0, text: '', why: '', shared: G.me.share_default, hearts: 0 }); drawLines(); drawLights(); }
    });
    goalSeg.set($(`#goalSeg [data-goal="${G.me.goal}"]`) || $('#goalSeg button'));
    $('#remOn').checked = G.me.remind_on;
    $('#remTime').value = G.me.remind_time;
    $('#shareDef').checked = G.me.share_default;
    $('#nick').value = G.me.nick || '';
    $('#remOn').addEventListener('change', (e) => saveSet({ remind_on: e.target.checked }));
    $('#remTime').addEventListener('change', (e) => { if (e.target.value) saveSet({ remind_time: e.target.value }); });
    $('#shareDef').addEventListener('change', (e) => saveSet({ share_default: e.target.checked }));
    $('#helps').checked = G.me.helps;
    $('#helps').addEventListener('change', (e) => { G.me.helps = e.target.checked; saveSet({ helps: G.me.helps }); drawLines(); setAsk(); });
    let nt = 0;
    $('#nick').addEventListener('input', (e) => { clearTimeout(nt); nt = setTimeout(() => { saveSet({ nick: e.target.value }); greet(); }, 800); });
    pushBox();
  }

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let reg = null;
  const swReady = 'serviceWorker' in navigator ? navigator.serviceWorker.register('/sw.js?v=1').then((r) => { reg = r; return r; }).catch(() => null) : Promise.resolve(null);
  const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function currentSub() { const r = await swReady; return r && r.pushManager ? r.pushManager.getSubscription() : null; }
  async function subscribe() {
    const r = await swReady;
    if (!r) throw new Error('알림 준비에 실패했어요. 새로고침 뒤 다시 해 주세요.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('알림이 허용되지 않았어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.');
    const sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(G.vapid) });
    await api('/api/push', { method: 'POST', data: sub.toJSON() });
    if (!G.me.remind_on) { $('#remOn').checked = true; await saveSet({ remind_on: true }); }
  }
  async function pushBox() {
    const box = $('#pushBox');
    if (!pushOK()) {
      box.innerHTML = isIOS && !standalone
        ? '<p class="push-say">아이폰 · 아이패드는 Safari 아래 <b>공유 버튼 → 홈 화면에 추가</b>로 앱처럼 설치한 뒤, 홈 화면의 감사노트에서 알림을 켤 수 있어요.</p>'
        : '<p class="push-say">이 브라우저는 알림을 지원하지 않아요. 크롬 · 삼성 인터넷 · 사파리(홈 화면에 추가)에서 켜 주세요.</p>';
      return;
    }
    if (Notification.permission === 'denied') { box.innerHTML = '<p class="push-say">이 기기에서 알림이 막혀 있어요. 브라우저 설정 › 사이트 설정에서 알림을 허용해 주세요.</p>'; return; }
    const sub = await currentSub().catch(() => null);
    if (sub) {
      api('/api/push', { method: 'POST', data: sub.toJSON() }).catch(() => {});   // 다른 계정에서 쓰던 기기면 이 계정으로
      box.innerHTML = '<p class="push-say on"><span class="glow-dot" aria-hidden="true"></span>이 기기에서 알림을 받고 있어요.</p><div class="row"><button type="button" class="btn ghost small" id="pushTest">시험 알림 보내기</button><button type="button" class="btn ghost small" id="pushOff">이 기기 알림 끄기</button></div>';
      $('#pushTest').onclick = async () => { try { const r = await api('/api/push/test', { method: 'POST', data: {} }); toast(r.ok ? '알림을 보냈어요. 잠시 뒤 도착해요.' : '보내지 못했어요. 알림을 다시 켜 주세요.'); } catch (e) { toast(e.message); } };
      $('#pushOff').onclick = async () => { await api('/api/push', { method: 'DELETE', data: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe().catch(() => {}); pushBox(); };
      return;
    }
    box.innerHTML = '<button type="button" class="btn primary" id="pushOn">이 기기에서 알림 켜기</button>';
    $('#pushOn').onclick = async () => { try { await subscribe(); toast('알림을 켰어요. 정한 시간에 살짝 알려 드릴게요.'); pushBox(); } catch (e) { toast(e.message); } };
  }
  // 처음 다 채운 날: 습관이 되도록 "내일 이 시간쯤 알려 드릴까요?"
  async function pushHint() {
    if (!pushOK() || Notification.permission !== 'default' || $('#pushHint')) return;
    if (await currentSub().catch(() => null)) return;
    const h = new Date().getHours();
    const time = h >= 18 && h <= 23 ? `${String(h).padStart(2, '0')}:00` : G.me.remind_time;
    $('#done').insertAdjacentHTML('beforeend', `<div class="push-hint" id="pushHint"><p>내일도 이 시간쯤(${time}) 살짝 알려 드릴까요?</p><button type="button" class="btn primary small">네, 알려 주세요</button></div>`);
    $('#pushHint button').onclick = async () => {
      try { await subscribe(); if (time !== G.me.remind_time) { await saveSet({ remind_time: time }); $('#remTime').value = time; } $('#pushHint').innerHTML = `<p>좋아요. 매일 ${time}에 알려 드릴게요. 설정에서 언제든 바꿀 수 있어요.</p>`; pushBox(); } catch (e) { toast(e.message); }
    };
  }

  // ─── 탭 ───
  function bindTabs() {
    const t = seg($('#tabs'), (b) => show(b.dataset.tab));
    const show = (name) => {
      $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (name === 'share' && !feedLoaded) loadFeed();
      if (name === 'today') $$('#lines textarea').forEach(grow);
      if (name === 'look') drawLook();
      if (name === 'set') goalSeg?.move();
      try { history.replaceState(null, '', name === 'today' ? '/note' : `/note#${name}`); } catch { /* 없음 */ }
    };
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]');
      if (!g) return;
      const b = $(`#tabs [data-tab="${g.dataset.go}"]`);
      b.click();
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    const h = location.hash.slice(1);
    if (['share', 'look', 'set'].includes(h)) $(`#tabs [data-tab="${h}"]`).click();
  }

  function init() {
    mood = G.mood || 0;
    lines = G.items.map((it) => ({ id: it.id, text: it.text, why: it.why, shared: !!it.shared, hearts: it.hearts, cheered: true }));
    baseCount = lines.length;
    baseLights = G.lights;
    doneShown = lines.length >= target() && lines.length > 0;   // 이미 다 쓴 날은 축하를 다시 띄우지 않되 카드는 보이게
    while (lines.length < G.me.goal) lines.push({ id: 0, text: '', why: '', shared: G.me.share_default, hearts: 0 });
    greet();
    drawMoods();
    drawLines();
    bindLines();
    setAsk();
    if (doneShown) { $('#doneSay').textContent = '오늘의 감사를 다 담았어요. 더 떠오르면 언제든 적어 주세요.'; }
    drawLights();
    $('#askMore').addEventListener('click', () => { askI = (askI + 1) % ASKS.length; setAsk(); const i = firstEmpty(); if (i >= 0) $$('#lines textarea')[i].focus(); });
    $('#addLine').addEventListener('click', () => { addLine(); $$('#lines textarea').pop().focus(); });
    bindMemory();
    bindFeed();
    drawNear();
    bindLook();
    bindSet();
    bindTabs();
    importDraft();
    onboard();
  }

  // 처음 한 번: 하루 몇 개 → 도움 질문 (둘 다 설정에서 다시 바꿀 수 있다)
  function onboard() {
    if (G.me.onboarded) return;
    const box = $('#onboard');
    const panel = box.closest('.panel');
    panel.classList.add('onboarding');
    box.hidden = false;
    let goal = 3;
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('.choices button');
      if (!b) return;
      $$('button', b.parentNode).forEach((x) => x.classList.toggle('on', x === b));
      if (b.dataset.goal) {
        goal = Number(b.dataset.goal);
        setTimeout(() => { $('[data-step="1"]', box).hidden = true; $('[data-step="2"]', box).hidden = false; }, reduce ? 0 : 220);
        return;
      }
      const helps = b.dataset.helps === '1';
      G.me.goal = goal; G.me.helps = helps; G.me.onboarded = true;
      saveSet({ goal, helps, onboarded: true });
      goalSeg.set($(`#goalSeg [data-goal="${goal}"]`));
      $('#helps').checked = helps;
      while (lines.length < goal) lines.push({ id: 0, text: '', why: '', shared: G.me.share_default, hearts: 0 });
      drawLines(); setAsk(); drawLights();
      setTimeout(() => {
        box.hidden = true;
        panel.classList.remove('onboarding');
        $$('#lines textarea').forEach(grow);
        toast(`좋아요. 하루 ${goal}가지, 오늘의 첫 감사를 적어 볼까요?`);
        scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      }, reduce ? 0 : 220);
    });
  }

  start().catch(() => {});
})();
