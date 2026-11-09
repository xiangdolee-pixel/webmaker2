// xim 내 목소리 읽기 — 글을 넣으면 운영자 목소리로 학습한 모델(PC 처리기)이 읽어 고른 음량의 WAV 로 만든다
//   Worker 는 /api/voice/* 를 Worker `clone` 에 넘긴다(대기열 D1 · 음성 R2). PC 가 꺼져 있으면 대기열에 남았다가 켜질 때 처리.
import { $, $$, esc } from './common.js';

let deps = null;     // { view, api }
let timer = 0;
let tick = 0;        // 1초마다 "지남 · 남음" 글자만 고치는 시계(목록은 다시 그리지 않음 — 재생 중인 소리가 끊기지 않게)
let sig = '';        // 목록 상태 요약 — 바뀌었을 때만 다시 그린다
let pace = 0.3;      // 글자당 걸리는 초(서버가 최근 완료 기록으로 계산)
let max = 6000;
const STATUS = { queued: ['대기 중', 'new'], running: ['만드는 중', 'doing'], done: ['완료', 'done'], failed: ['실패', 'suspended'] };
const fmtWhen = (ms) => { const d = new Date(ms); const t = new Date(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return d.toDateString() === t.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };
const fmtSec = (s) => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
const num = (v, d = 1) => (v == null ? '-' : Number(v).toFixed(d));
const n = (v) => Number(v || 0).toLocaleString('ko-KR');

export function stopVoice() { clearTimeout(timer); timer = 0; clearInterval(tick); tick = 0; sig = ''; }
const est = (chars) => Math.max(10, Math.round(chars * pace)); // 예상 소요(초)
const fmtEst = (s) => (s >= 60 ? `약 ${Math.round(s / 60)}분` : `약 ${Math.max(10, Math.round(s / 10) * 10)}초`);

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
        if (pre.hidden) { const r = await api(`/voice/jobs/${id}/text`); pre.textContent = r.text; pre.hidden = false; b.textContent = '원고 닫기'; li.classList.add('open'); } else { pre.hidden = true; b.textContent = '원고 전체 보기'; li.classList.remove('open'); }
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
  if (d.sec_per_char > 0) pace = d.sec_per_char;
  const jobs = d.jobs;
  $('#vc-empty').hidden = jobs.length > 0;
  $('#vc-meta').textContent = jobs.length ? `${jobs.length}개 · 완료 ${jobs.filter((j) => j.status === 'done').length}개` : '';
  const next = jobs.map((j) => `${j.id}:${j.status}:${j.started_at || 0}`).join(',');
  if (next !== sig) { // 상태가 바뀌었을 때만 다시 그린다(4초마다 다시 그리면 듣던 소리가 끊긴다)
    sig = next;
    const pending = jobs.filter((j) => j.status === 'queued' || j.status === 'running'); // 최신순
    $('#vc-jobs').innerHTML = jobs.map((j) => {
      const [label, cls] = STATUS[j.status] || [j.status, 'idle'];
      const cut = (j.title || '').length < (j.chars || 0); // 제목은 원고 앞부분 — 잘렸으면 … 로 표시
      let body = '';
      if (j.status === 'done') {
        const took = j.started_at && j.done_at > j.started_at ? ` · 만드는 데 ${fmtSec((j.done_at - j.started_at) / 1000)}` : '';
        body = `<audio controls preload="none" src="/api/voice/audio/${esc(j.id)}.wav"></audio>
          <p class="vc-stats">음성 <b>${fmtSec(j.seconds)}</b> · ${n(j.chars)}자 · 문장 ${j.sentences ?? '-'}개${took} · 음량 <b>${num(j.lufs)} LUFS</b> · 변동폭 ${num(j.lra)} LU · 피크 ${num(j.tp)} dBTP${j.engine ? ` · ${esc(j.engine)}` : ''}</p>`;
      } else if (j.status === 'failed') body = `<p class="vc-fail">${esc(j.error || '실패했습니다.')}</p>`;
      else if (j.status === 'running') {
        body = `<div class="vc-prog" data-start="${j.started_at || j.created_at}" data-est="${est(j.chars)}"><i></i></div>
          <p class="vc-stats" data-tick="running" data-start="${j.started_at || j.created_at}" data-est="${est(j.chars)}" data-chars="${j.chars}">PC 에서 만드는 중…</p>`;
      } else {
        // 앞에 선 작업(먼저 넣은 대기 · 진행 중)의 남은 시간을 더해 "시작까지" 를 어림한다
        const ahead = pending.filter((p) => p.created_at < j.created_at);
        const wait = ahead.reduce((s, p) => s + (p.status === 'running' ? Math.max(5, est(p.chars) - (Date.now() - (p.started_at || p.created_at)) / 1000) : est(p.chars)), 0);
        body = `<p class="vc-stats">대기 중 · ${n(j.chars)}자 · 만드는 데 ${fmtEst(est(j.chars))} 예상${ahead.length ? ` · 앞에 ${ahead.length}개(시작까지 ${fmtEst(wait)})` : d.agent?.online ? ' · 곧 시작' : ' · PC 가 켜지면 시작'}</p>`;
      }
      return `<li data-id="${esc(j.id)}">
        <div class="vc-row"><span class="badge ${cls}">${label}</span><b class="vc-title">${esc(j.title || '(제목 없음)')}${cut ? '…' : ''}</b><time>${fmtWhen(j.created_at)}</time></div>
        ${body}
        <div class="vc-actions">
          ${j.status === 'done' ? `<a class="btn sm" href="/api/voice/audio/${esc(j.id)}.wav?dl=1" download="clone-${esc(j.id)}.wav">내려받기</a>` : ''}
          <button class="btn sm" type="button" data-act="text">원고 전체 보기</button>
          ${j.status === 'done' || j.status === 'failed' ? `<button class="btn sm" type="button" data-act="retry">${j.status === 'done' ? '다시 만들기' : '다시 시도'}</button>` : ''}
          <button class="btn sm danger" type="button" data-act="del">지우기</button>
        </div>
        <pre class="vc-text" hidden></pre>
      </li>`;
    }).join('');
    tickOnce();
  }
  const busy = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  clearTimeout(timer);
  timer = setTimeout(() => load().catch(() => {}), busy ? 4000 : 30000);
  clearInterval(tick); tick = 0;
  if (busy) tick = setInterval(tickOnce, 1000);
}

// 진행 중 칸의 "지남 · 남음" 과 막대만 1초마다 고친다
function tickOnce() {
  $$('[data-tick="running"]').forEach((p) => {
    const start = +p.dataset.start, e = +p.dataset.est, gone = Math.max(0, (Date.now() - start) / 1000), left = e - gone;
    p.innerHTML = left > 0
      ? `PC 에서 만드는 중… <b>${fmtSec(gone)}</b> 지남 · 남은 시간 ${fmtEst(left)} (${n(p.dataset.chars)}자, 예상 ${fmtEst(e)})`
      : `PC 에서 만드는 중… <b>${fmtSec(gone)}</b> 지남 · 예상(${fmtEst(e)})보다 오래 걸리고 있어요 — 발음 검사에 걸린 문장을 다시 만드는 중일 수 있어요 (${n(p.dataset.chars)}자)`;
  });
  $$('.vc-prog').forEach((bar) => {
    const gone = (Date.now() - +bar.dataset.start) / 1000, r = Math.min(0.95, gone / +bar.dataset.est);
    bar.firstElementChild.style.width = `${Math.round(r * 100)}%`;
    bar.classList.toggle('over', gone > +bar.dataset.est);
  });
}
