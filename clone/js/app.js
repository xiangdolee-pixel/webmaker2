// clone — 화면 동작: 로그인 · 요청 보내기 · 목록 갱신(대기 · 생성 중이 있으면 4초마다)
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const login = $('#login'), app = $('#app'), agentEl = $('#agent'), logoutBtn = $('#logout');
  const text = $('#text'), count = $('#count'), go = $('#go'), composeErr = $('#compose-err');
  const jobsEl = $('#jobs'), empty = $('#empty'), listMeta = $('#list-meta'), offlineNote = $('#offline-note');
  const tpl = $('#job-tpl');
  let MAX = 6000;
  let timer = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opt = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }, ...opt, body: opt.body && typeof opt.body !== 'string' ? JSON.stringify(opt.body) : opt.body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `오류 ${r.status}`);
    return d;
  }

  const STATUS = { queued: '대기 중', running: '만드는 중', done: '완료', failed: '실패' };
  const fmtWhen = (ms) => { const d = new Date(ms); const t = new Date(); const same = d.toDateString() === t.toDateString(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return same ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };
  const fmtSec = (s) => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
  const num = (v, d = 1) => (v == null ? '-' : Number(v).toFixed(d));

  function setAgent(a) {
    if (!a) return;
    agentEl.className = `agent ${a.online ? 'on' : 'off'}`;
    const ago = a.seen_at ? Math.round((Date.now() - a.seen_at) / 60000) : null;
    agentEl.querySelector('span').textContent = a.online ? 'PC 처리기 연결됨' : ago == null ? 'PC 처리기 꺼짐' : `PC 처리기 꺼짐 · ${ago < 60 ? `${ago}분` : `${Math.round(ago / 60)}시간`} 전까지 켜짐`;
    offlineNote.hidden = a.online;
  }

  function render(jobs) {
    jobsEl.innerHTML = '';
    empty.hidden = jobs.length > 0;
    const done = jobs.filter((j) => j.status === 'done').length;
    listMeta.textContent = jobs.length ? `${jobs.length}개 · 완료 ${done}개` : '';
    for (const j of jobs) {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.dataset.id = j.id;
      const chip = $('.chip', li); chip.className = `chip ${j.status}`; chip.textContent = STATUS[j.status] || j.status;
      $('.title', li).textContent = j.title || '(제목 없음)';
      $('.when', li).textContent = fmtWhen(j.created_at);
      const audio = $('audio', li), dl = $('.dl', li), stats = $('.stats', li), fail = $('.fail', li), retry = $('.retry', li);
      if (j.status === 'done') {
        audio.hidden = false; audio.src = `audio/${j.id}.wav`;
        dl.hidden = false; dl.href = `audio/${j.id}.wav?dl=1`; dl.download = `clone-${j.id}.wav`;
        stats.innerHTML = `<b>${fmtSec(j.seconds)}</b> · ${j.chars.toLocaleString('ko-KR')}자 · 문장 ${j.sentences ?? '-'}개 · 음량 <b>${num(j.lufs)} LUFS</b> · 변동폭 ${num(j.lra)} LU · 피크 ${num(j.tp)} dBTP${j.engine ? ` · ${esc(j.engine)}` : ''}`;
        retry.hidden = false; retry.textContent = '다시 만들기';
      } else if (j.status === 'failed') {
        fail.textContent = j.error || '실패했습니다.';
        retry.hidden = false; retry.textContent = '다시 시도';
      } else if (j.status === 'running') {
        stats.textContent = `PC 에서 만드는 중… (${j.chars.toLocaleString('ko-KR')}자)`;
      } else {
        stats.textContent = `대기 중 (${j.chars.toLocaleString('ko-KR')}자)`;
      }
      jobsEl.appendChild(li);
    }
  }

  async function load() {
    const d = await api('api/jobs?limit=60');
    setAgent(d.agent);
    render(d.jobs);
    const busy = d.jobs.some((j) => j.status === 'queued' || j.status === 'running');
    clearTimeout(timer);
    timer = setTimeout(() => load().catch(() => {}), busy ? 4000 : 30000);
  }

  jobsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const li = b.closest('.job'); const id = li.dataset.id;
    try {
      if (b.classList.contains('show-text')) {
        const pre = $('.text', li);
        if (pre.hidden) { const d = await api(`api/jobs/${id}/text`); pre.textContent = d.text; pre.hidden = false; b.textContent = '글 닫기'; } else { pre.hidden = true; b.textContent = '글 보기'; }
      } else if (b.classList.contains('retry')) {
        b.disabled = true; await api(`api/jobs/${id}/retry`, { method: 'POST' }); await load();
      } else if (b.classList.contains('del')) {
        if (!confirm('이 음성을 지울까요? 되돌릴 수 없습니다.')) return;
        await api(`api/jobs/${id}`, { method: 'DELETE' }); li.remove(); await load();
      }
    } catch (err) { alert(err.message); }
  });

  function updateCount() { const n = text.value.replace(/\r\n?/g, '\n').trim().length; count.textContent = n.toLocaleString('ko-KR'); count.parentElement.classList.toggle('over', n > MAX); go.disabled = n === 0 || n > MAX; }
  text.addEventListener('input', updateCount);
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#compose').requestSubmit(); } });
  $('#compose').addEventListener('submit', async (e) => {
    e.preventDefault(); composeErr.textContent = '';
    const t = text.value.trim(); if (!t) return;
    go.disabled = true;
    try {
      await api('api/jobs', { method: 'POST', body: { text: t, speed: $('#speed').value } });
      text.value = ''; updateCount();
      try { localStorage.removeItem('clone.draft'); } catch { /* 저장소 없음 */ }
      await load();
    } catch (err) { composeErr.textContent = err.message; }
    finally { updateCount(); }
  });
  // 쓰다 만 글은 이 브라우저에만 남겨 둔다
  text.addEventListener('input', () => { try { localStorage.setItem('clone.draft', text.value); } catch { /* 저장소 없음 */ } });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#login-err').textContent = '';
    try { await api('api/login', { method: 'POST', body: { pass: $('#pass').value } }); $('#pass').value = ''; await start(); }
    catch (err) { $('#login-err').textContent = err.message; }
  });
  logoutBtn.addEventListener('click', async () => { await api('api/logout', { method: 'POST' }).catch(() => {}); clearTimeout(timer); location.reload(); });

  async function start() {
    const me = await api('api/me');
    if (!me.ok) { login.hidden = false; app.hidden = true; logoutBtn.hidden = true; agentEl.hidden = true; setTimeout(() => $('#pass').focus(), 50); return; }
    MAX = me.max_chars || MAX; $('#max').textContent = MAX.toLocaleString('ko-KR');
    login.hidden = true; app.hidden = false; logoutBtn.hidden = false; agentEl.hidden = false;
    setAgent(me.agent);
    try { const d = localStorage.getItem('clone.draft'); if (d && !text.value) text.value = d; } catch { /* 저장소 없음 */ }
    updateCount();
    await load();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !app.hidden) load().catch(() => {}); });
  start().catch((err) => { login.hidden = false; $('#login-err').textContent = err.message; });
})();
