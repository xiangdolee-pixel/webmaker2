// xim 내 목소리 읽기 — 글을 넣으면 운영자 목소리로 학습한 모델(PC 처리기)이 읽어 고른 음량의 WAV 로 만든다
//   Worker 는 /api/voice/* 를 Worker `clone` 에 넘긴다(대기열 D1 · 음성 R2). PC 가 꺼져 있으면 대기열에 남았다가 켜질 때 처리.
import { $, $$, esc } from './common.js';

let deps = null;     // { view, api }
let timer = 0;
let tick = 0;        // 1초마다 "지남 · 남음" 글자만 고치는 시계(목록은 다시 그리지 않음 — 재생 중인 소리가 끊기지 않게)
let pace = 0.3;      // 글자당 걸리는 초(서버가 최근 완료 기록으로 계산)
let max = 6000;
let vpace = 0.5;    // 사자왕 영상: 음성 1초당 걸리는 초(서버가 최근 기록으로 계산 — 마이크 가림 방식은 몇 초면 끝)
const STATUS = { queued: ['대기 중', 'new'], running: ['만드는 중', 'doing'], done: ['완료', 'done'], failed: ['실패', 'suspended'] };
const fmtWhen = (ms) => { const d = new Date(ms); const t = new Date(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return d.toDateString() === t.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };
const fmtSec = (s) => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
const num = (v, d = 1) => (v == null ? '-' : Number(v).toFixed(d));
const n = (v) => Number(v || 0).toLocaleString('ko-KR');

export function stopVoice() { clearTimeout(timer); timer = 0; clearInterval(tick); tick = 0; }
const est = (chars) => Math.max(10, Math.round(chars * pace)); // 예상 소요(초)
const fmtEst = (s) => (s >= 60 ? `약 ${Math.round(s / 60)}분` : `약 ${Math.max(10, Math.round(s / 10) * 10)}초`);
const vest = (seconds) => Math.round(15 + (seconds || 30) * vpace);   // 사자왕 영상 예상 소요(초): 올리기 15초 + 음성 길이 × 배수

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
          <label class="vc-video-opt" title="음성이 끝나면 운영자 녹화 얼굴(사자왕)이 말하는 영상(mp4)도 만듭니다. 입은 마이크로 가려지고, 음성 뒤 몇 초면 됩니다."><input type="checkbox" id="vc-video"> 사자왕 영상도 함께</label>
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
      await api('/voice/jobs', { method: 'POST', data: { text: t, speed: $('#vc-speed').value, video: $('#vc-video').checked } });
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
        if (pre.hidden) { const r = await api(`/voice/jobs/${id}/text`); fillScript(pre, r, $('audio', li)); pre.hidden = false; b.textContent = '원고 닫기'; li.classList.add('open'); } else { pre.hidden = true; b.textContent = '원고 전체 보기'; li.classList.remove('open'); }
      } else if (b.dataset.act === 'retry') { b.disabled = true; await api(`/voice/jobs/${id}/retry`, { method: 'POST' }); await load(); }
      else if (b.dataset.act === 'del') { if (!confirm('이 음성을 지울까요? 되돌릴 수 없습니다.')) return; await api(`/voice/jobs/${id}`, { method: 'DELETE' }); await load(); }
    } catch (ex) { err.textContent = ex.message; }
  });
  await load();
}

// 원고 칸 채우기 — 문장별 시각(timings)이 있으면 문장마다 span 으로 두고, 재생 위치의 문장을 표시(누르면 그 문장부터 재생)
function fillScript(pre, r, audio) {
  const tm = Array.isArray(r.timings) && r.timings.length ? r.timings : null;
  if (!tm || !audio) { pre.textContent = r.text; return; }
  pre.innerHTML = tm.map((x, i) => `<span class="s" data-i="${i}" data-s="${x.s}" data-e="${x.e}" title="여기부터 듣기">${esc(x.t)}</span>`).join(' ');
  pre.classList.add('timed');
  const spans = $$('.s', pre);
  let cur = -1;
  const mark = () => {
    const t = audio.currentTime; let k = -1;
    for (let i = 0; i < tm.length; i++) if (t >= tm[i].s - 0.05 && t < (tm[i + 1]?.s ?? tm[i].e + 0.6)) { k = i; break; }
    if (k === cur) return;
    spans.forEach((sp, i) => sp.classList.toggle('now', i === k));
    cur = k;
    if (k >= 0 && !pre.hidden) { const sp = spans[k]; const top = sp.offsetTop - pre.offsetTop; if (top < pre.scrollTop || top > pre.scrollTop + pre.clientHeight - 40) pre.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' }); }
  };
  audio.addEventListener('timeupdate', mark);
  audio.addEventListener('seeked', mark);
  audio.addEventListener('ended', () => { spans.forEach((sp) => sp.classList.remove('now')); cur = -1; });
  pre.addEventListener('click', (e) => { const sp = e.target.closest('.s'); if (!sp) return; audio.currentTime = +sp.dataset.s; audio.play().catch(() => {}); });
  mark();
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
  if (d.video_sec_per_sec > 0) vpace = d.video_sec_per_sec;
  const jobs = d.jobs;
  $('#vc-empty').hidden = jobs.length > 0;
  $('#vc-meta').textContent = jobs.length ? `${jobs.length}개 · 완료 ${jobs.filter((j) => j.status === 'done').length}개` : '';
  const pending = jobs.filter((j) => j.status === 'queued' || j.status === 'running'); // 최신순
  const make = (j, key) => {
    let [label, cls] = STATUS[j.status] || [j.status, 'idle'];
    if (j.status === 'done' && j.video && j.video_status === 'pending') { label = '영상 만드는 중'; cls = 'doing'; }
    if (j.status === 'done' && j.video && j.video_status === 'done') label = '음성 · 영상 완료';
    const cut = (j.title || '').length < (j.chars || 0); // 제목은 원고 앞부분 — 잘렸으면 … 로 표시
    let body = '';
    if (j.status === 'done') {
      const took = j.started_at && j.done_at > j.started_at ? ` · 만드는 데 ${fmtSec((j.done_at - j.started_at) / 1000)}` : '';
      let video = '';
      if (j.video) {
        if (j.video_status === 'done') video = `<video class="vc-video-el" controls preload="none" playsinline src="/api/voice/video/${esc(j.id)}.mp4?v=${j.video_at || 0}"></video><p class="vc-stats">사자왕 영상 · 만드는 데 ${fmtSec(((j.video_at || 0) - (j.done_at || 0)) / 1000)}</p>`;
        else if (j.video_status === 'failed') video = `<p class="vc-fail">사자왕 영상 실패: ${esc(j.video_error || '알 수 없는 오류')} — 음성은 들을 수 있습니다. "다시 만들기" 를 누르면 음성 · 영상을 다시 만듭니다.</p>`;
        else video = `<div class="vc-prog" data-start="${j.done_at || j.created_at}" data-est="${vest(j.seconds)}"><i></i></div>
          <p class="vc-stats" data-tick="video" data-start="${j.done_at || j.created_at}" data-est="${vest(j.seconds)}" data-chars="${j.chars}">사자왕 영상 만드는 중…</p>`;
      }
      body = `<audio controls preload="none" src="/api/voice/audio/${esc(j.id)}.wav?v=${j.done_at || 0}"></audio>
        <p class="vc-stats">음성 <b>${fmtSec(j.seconds)}</b> · ${n(j.chars)}자 · 문장 ${j.sentences ?? '-'}개${took} · 음량 <b>${num(j.lufs)} LUFS</b> · 변동폭 ${num(j.lra)} LU · 피크 ${num(j.tp)} dBTP${j.engine ? ` · ${esc(j.engine)}` : ''}</p>${video}`;
    } else if (j.status === 'failed') body = `<p class="vc-fail">${esc(j.error || '실패했습니다.')}</p>`;
    else if (j.status === 'running') {
      body = `<div class="vc-prog" data-start="${j.started_at || j.created_at}" data-est="${est(j.chars)}"><i></i></div>
        <p class="vc-stats" data-tick="running" data-start="${j.started_at || j.created_at}" data-est="${est(j.chars)}" data-chars="${j.chars}">PC 에서 만드는 중…</p>`;
    } else {
      // 앞에 선 작업(먼저 넣은 대기 · 진행 중)의 남은 시간을 더해 "시작까지" 를 어림한다
      const ahead = pending.filter((p) => p.created_at < j.created_at);
      const wait = ahead.reduce((s, p) => s + (p.status === 'running' ? Math.max(5, est(p.chars) - (Date.now() - (p.started_at || p.created_at)) / 1000) : est(p.chars)), 0);
      body = `<p class="vc-stats">대기 중 · ${n(j.chars)}자 · 만드는 데 ${fmtEst(est(j.chars))} 예상${j.video ? ` + 사자왕 영상 ${fmtEst(vest(j.chars * pace))}` : ''}${ahead.length ? ` · 앞에 ${ahead.length}개(시작까지 ${fmtEst(wait)})` : d.agent?.online ? ' · 곧 시작' : ' · PC 가 켜지면 시작'}</p>`;
    }
    const li = document.createElement('li');
    li.dataset.id = j.id; li.dataset.key = key;
    li.innerHTML = `
      <div class="vc-row"><span class="badge ${cls}">${label}</span><b class="vc-title">${esc(j.title || '(제목 없음)')}${cut ? '…' : ''}</b><time>${fmtWhen(j.created_at)}</time></div>
      ${body}
      <div class="vc-actions">
        ${j.status === 'done' ? `<a class="btn sm" href="/api/voice/audio/${esc(j.id)}.wav?dl=1" download="clone-${esc(j.id)}.wav">음성 내려받기</a>` : ''}
        ${j.status === 'done' && j.video_status === 'done' ? `<a class="btn sm" href="/api/voice/video/${esc(j.id)}.mp4?dl=1" download="sajawang-${esc(j.id)}.mp4">영상 내려받기</a>` : ''}
        <button class="btn sm" type="button" data-act="text">원고 전체 보기</button>
        ${j.status === 'done' || j.status === 'failed' ? `<button class="btn sm" type="button" data-act="retry">${j.status === 'done' ? '다시 만들기' : '다시 시도'}</button>` : ''}
        <button class="btn sm danger" type="button" data-act="del">지우기</button>
      </div>
      <pre class="vc-text" hidden></pre>`;
    return li;
  };
  // 항목 단위로만 고친다 — 완료된 칸은 그대로 두어 듣던 소리가 끊기지 않게(목록 전체를 다시 그리면 재생 중인 플레이어가 사라진다)
  const ol = $('#vc-jobs');
  const old = new Map([...ol.children].map((li) => [li.dataset.id, li]));
  let ref = ol.firstElementChild;
  for (const j of jobs) {
    let li = old.get(j.id); old.delete(j.id);
    const key = `${j.status}:${j.started_at || 0}:${j.done_at || 0}:${j.video_status || ''}:${j.video_at || 0}`;
    const keep = li && li.dataset.key === key && (j.status === 'done' || j.status === 'failed');
    if (!keep) { const fresh = make(j, key); if (li) { if (ref === li) ref = li.nextElementSibling; li.replaceWith(fresh); } li = fresh; }
    if (li === ref) ref = ref.nextElementSibling; else ol.insertBefore(li, ref);
  }
  old.forEach((li) => li.remove());
  tickOnce();
  const busy = jobs.some((j) => j.status === 'queued' || j.status === 'running' || (j.status === 'done' && j.video && j.video_status === 'pending'));
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
  $$('[data-tick="video"]').forEach((p) => {
    const start = +p.dataset.start, e = +p.dataset.est, gone = Math.max(0, (Date.now() - start) / 1000), left = e - gone;
    p.innerHTML = left > 0
      ? `사자왕 영상 만드는 중… <b>${fmtSec(gone)}</b> 지남 · 남은 시간 ${fmtEst(left)} (예상 ${fmtEst(e)}) — 음성은 위에서 먼저 들을 수 있어요`
      : `사자왕 영상 만드는 중… <b>${fmtSec(gone)}</b> 지남 · 예상(${fmtEst(e)})보다 오래 걸리고 있어요`;
  });
  $$('.vc-prog').forEach((bar) => {
    const gone = (Date.now() - +bar.dataset.start) / 1000, r = Math.min(0.95, gone / +bar.dataset.est);
    bar.firstElementChild.style.width = `${Math.round(r * 100)}%`;
    bar.classList.toggle('over', gone > +bar.dataset.est);
  });
}
