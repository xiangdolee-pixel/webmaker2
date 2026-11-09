// xim 내 목소리 읽기 — 글을 넣으면 운영자 목소리로 학습한 모델(PC 처리기)이 읽어 고른 음량의 WAV 로 만든다
//   Worker 는 /api/voice/* 를 Worker `clone` 에 넘긴다(대기열 D1 · 음성 R2). PC 가 꺼져 있으면 대기열에 남았다가 켜질 때 처리.
import { $, $$, esc } from './common.js';

let deps = null;     // { view, api }
let timer = 0;
let max = 6000;
const STATUS = { queued: ['대기 중', 'new'], running: ['만드는 중', 'doing'], done: ['완료', 'done'], failed: ['실패', 'suspended'] };
const fmtWhen = (ms) => { const d = new Date(ms); const t = new Date(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return d.toDateString() === t.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };
const fmtSec = (s) => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
const num = (v, d = 1) => (v == null ? '-' : Number(v).toFixed(d));
const n = (v) => Number(v || 0).toLocaleString('ko-KR');

export function stopVoice() { clearTimeout(timer); timer = 0; }

export async function renderVoice(d) {
  deps = d;
  stopVoice();
  const { view, api } = deps;
  const me = await api('/voice/me');
  max = me.max_chars || max;
  view.innerHTML = `
    <div class="card vc-panel">
      <div class="vc-head"><h2>내 목소리 읽기</h2><span class="vc-agent" id="vc-agent"><i></i><span></span></span></div>
      <p class="vc-desc">글을 넣으면 운영자 목소리로 학습한 모델이 문장마다 읽어 <b>고른 음량(-16 LUFS)</b>의 음성 파일로 만듭니다. 숫자 · 퍼센트 · 영문 약어는 한글 발음으로 읽습니다. 만드는 일은 운영자 PC 가 하므로 PC 가 켜져 있어야 합니다.</p>
      <form id="vc-form">
        <textarea class="input" id="vc-text" rows="7" placeholder="여기에 읽을 글을 넣으세요. (Ctrl+Enter 로 바로 요청)"></textarea>
        <div class="vc-bar">
          <span class="vc-count"><b id="vc-count">0</b> / ${n(max)}자</span>
          <label class="vc-speed">속도 <select id="vc-speed"><option value="0.9">느리게 0.9</option><option value="1" selected>보통 1.0</option><option value="1.1">조금 빠르게 1.1</option><option value="1.2">빠르게 1.2</option></select></label>
          <button class="btn primary" type="submit" id="vc-go" disabled>읽어줘</button>
        </div>
        <p class="err" id="vc-err" role="alert"></p>
      </form>
      <p class="vc-note" id="vc-offline" hidden>지금 PC 처리기가 꺼져 있어 요청은 대기열에 남습니다. PC 가 켜지면 차례로 만들어집니다.</p>
    </div>
    <div class="card vc-panel">
      <h2>만든 음성 <small class="vc-sub" id="vc-meta"></small></h2>
      <ol class="vc-jobs" id="vc-jobs"></ol>
      <p class="vc-desc" id="vc-empty" hidden>아직 만든 음성이 없습니다.</p>
    </div>`;
  setAgent(me.agent);

  const text = $('#vc-text'), count = $('#vc-count'), go = $('#vc-go'), err = $('#vc-err');
  const updateCount = () => { const k = text.value.trim().length; count.textContent = n(k); count.parentElement.classList.toggle('over', k > max); go.disabled = k === 0 || k > max; };
  try { const draft = localStorage.getItem('xim.voice.draft'); if (draft) text.value = draft; } catch { /* 저장소 없음 */ }
  updateCount();
  text.addEventListener('input', () => { updateCount(); try { localStorage.setItem('xim.voice.draft', text.value); } catch { /* 저장소 없음 */ } });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#vc-form').requestSubmit(); } });
  $('#vc-form').addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const t = text.value.trim(); if (!t) return;
    go.disabled = true;
    try {
      await api('/voice/jobs', { method: 'POST', data: { text: t, speed: $('#vc-speed').value } });
      text.value = ''; try { localStorage.removeItem('xim.voice.draft'); } catch { /* 저장소 없음 */ }
      await load();
    } catch (ex) { err.textContent = ex.message; }
    finally { updateCount(); }
  });
  $('#vc-jobs').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const li = b.closest('li'); const id = li.dataset.id;
    try {
      if (b.dataset.act === 'text') {
        const pre = $('.vc-text', li);
        if (pre.hidden) { const r = await api(`/voice/jobs/${id}/text`); pre.textContent = r.text; pre.hidden = false; b.textContent = '글 닫기'; } else { pre.hidden = true; b.textContent = '글 보기'; }
      } else if (b.dataset.act === 'retry') { b.disabled = true; await api(`/voice/jobs/${id}/retry`, { method: 'POST' }); await load(); }
      else if (b.dataset.act === 'del') { if (!confirm('이 음성을 지울까요? 되돌릴 수 없습니다.')) return; await api(`/voice/jobs/${id}`, { method: 'DELETE' }); await load(); }
    } catch (ex) { err.textContent = ex.message; }
  });
  await load();
}

function setAgent(a) {
  const el = $('#vc-agent'); if (!el || !a) return;
  el.className = `vc-agent ${a.online ? 'on' : 'off'}`;
  const ago = a.seen_at ? Math.round((Date.now() - a.seen_at) / 60000) : null;
  el.querySelector('span').textContent = a.online ? 'PC 처리기 연결됨' : ago == null ? 'PC 처리기 꺼짐' : `PC 처리기 꺼짐 · ${ago < 60 ? `${ago}분` : `${Math.round(ago / 60)}시간`} 전까지 켜짐`;
  const note = $('#vc-offline'); if (note) note.hidden = a.online;
}

async function load() {
  if (!deps) return;
  const { api } = deps;
  const d = await api('/voice/jobs?limit=60');
  if (!$('#vc-jobs')) return; // 다른 탭으로 갔음
  setAgent(d.agent);
  const jobs = d.jobs;
  $('#vc-empty').hidden = jobs.length > 0;
  $('#vc-meta').textContent = jobs.length ? `${jobs.length}개 · 완료 ${jobs.filter((j) => j.status === 'done').length}개` : '';
  $('#vc-jobs').innerHTML = jobs.map((j) => {
    const [label, cls] = STATUS[j.status] || [j.status, 'idle'];
    let body = '';
    if (j.status === 'done') {
      body = `<audio controls preload="none" src="/api/voice/audio/${esc(j.id)}.wav"></audio>
        <p class="vc-stats"><b>${fmtSec(j.seconds)}</b> · ${n(j.chars)}자 · 문장 ${j.sentences ?? '-'}개 · 음량 <b>${num(j.lufs)} LUFS</b> · 변동폭 ${num(j.lra)} LU · 피크 ${num(j.tp)} dBTP${j.engine ? ` · ${esc(j.engine)}` : ''}</p>`;
    } else if (j.status === 'failed') body = `<p class="vc-fail">${esc(j.error || '실패했습니다.')}</p>`;
    else if (j.status === 'running') body = `<p class="vc-stats">PC 에서 만드는 중… (${n(j.chars)}자)</p>`;
    else body = `<p class="vc-stats">대기 중 (${n(j.chars)}자)</p>`;
    return `<li data-id="${esc(j.id)}">
      <div class="vc-row"><span class="badge ${cls}">${label}</span><b class="vc-title">${esc(j.title || '(제목 없음)')}</b><time>${fmtWhen(j.created_at)}</time></div>
      ${body}
      <div class="vc-actions">
        ${j.status === 'done' ? `<a class="btn sm" href="/api/voice/audio/${esc(j.id)}.wav?dl=1" download="clone-${esc(j.id)}.wav">내려받기</a>` : ''}
        <button class="btn sm" type="button" data-act="text">글 보기</button>
        ${j.status === 'done' || j.status === 'failed' ? `<button class="btn sm" type="button" data-act="retry">${j.status === 'done' ? '다시 만들기' : '다시 시도'}</button>` : ''}
        <button class="btn sm danger" type="button" data-act="del">지우기</button>
      </div>
      <pre class="vc-text" hidden></pre>
    </li>`;
  }).join('');
  const busy = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  clearTimeout(timer);
  timer = setTimeout(() => load().catch(() => {}), busy ? 4000 : 30000);
}
