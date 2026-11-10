// xim 스튜디오 화면 — 유튜브 발표자료(본편 · 썸네일 · 쇼츠)를 웹에서 만들고 기록을 본다
import { $, $$, esc, fmtDate, toast, pillTabs, openDialog, busy } from './common.js';

let deps = null;            // { view, api, shrinkImage }
let opts = null;            // /api/studio/options
let pollTimer = 0;
let openId = '';            // 보고 있는 작업 id
let resTab = 'show';        // 결과 탭 (기본: 슬라이드쇼)

const STATUS = { queued: ['대기', 'wait'], running: ['진행 중', 'run'], pick: ['6개 고르기', 'ask'], thumb: ['썸네일 선택', 'ask'], images: ['그림 대기 (PC)', 'wait'], done: ['완료', 'done'], failed: ['실패', 'fail'], stopped: ['멈춤', 'stop'] };
const KIND = { main: '본편', thumb: '썸네일만', phone: '폰UI 쇼츠' };
const SOURCE = { rss: '웹 뉴스', capture: '캡쳐', text: '글 직접' };
const STEP_LABEL = (s) => {
  let m;
  if ((m = s.match(/^article-(\d+)$/))) return `기사 ${m[1]}`;
  if ((m = s.match(/^slide-(\d+)$/))) return `슬라이드 ${m[1]}`;
  if ((m = s.match(/^review-(\d+)$/))) return `검수 ${m[1]}`;
  return { rss: '뉴스 후보', top15: 'Top12 선정', pick: '6개 고르기', factcheck: '팩트체크', summary: '유튜브 패키지', package: '패키지(팩트체크 · 제목 · 썸네일 값)', 'thumb-prompt': '썸네일 프롬프트', thumb: '썸네일', slides: '슬라이드', review: '검수', purge: '정리' }[s] || s;
};
// ───── 단계 지도(계획) · 진행률 ─────
//   작업 종류 · 옵션에 따라 밟을 단계를 미리 그리고, 실제 단계 기록(studio_steps)을 그 위에 얹는다.
const EXPECT = { rss: 10, top15: 40, pick: 0, articles: 120, package: 100, factcheck: 160, summary: 60, 'thumb-pick': 40, 'thumb-wait': 0, 'thumb-prompt': 5, slides: 220, review: 40, thumb: 60, claim: 0 };
function planFor(job) {
  const o = job.options || {};
  if (job.kind === 'thumb') return [['thumb-prompt', '썸네일 프롬프트'], ['thumb', '썸네일 (ChatGPT)']];
  const p = [];
  if (job.source === 'rss') { p.push(['rss', '뉴스 후보 모으기'], ['top15', 'Top12 선정 (이미 다룬 뉴스 제외)']); if (o.pick === 'manual') p.push(['pick', '6개 고르기 (내가)']); }
  p.push(['articles', job.source === 'rss' ? '기사 대본 6개 (원문 대조 포함)' : '대본 쓰기 (원문 대조 포함)'], ['package', '패키지 — 교차 팩트체크 · 제목 · 인트로 · 더보기 · 썸네일 값 (슬라이드와 동시)']);
  if (o.thumb === 'manual') p.push(['thumb-wait', '썸네일 선택 (내가)']);
  p.push(['slides', '슬라이드 6장 → 썸네일 (ChatGPT)'], ['review', '슬라이드 검수 · 썸네일 검수']);
  return p;
}
const keyOf = (step) => step.replace(/^article-\d+$/, 'articles').replace(/^slide-\d+$/, 'slides').replace(/^review-\d+$/, 'review').replace(/^(thumb|thumb-prompt)$/, 'slides').replace(/^(factcheck|summary|thumb-pick)$/, 'package');
// 계획 + 실제 기록 → 줄 목록과 요약
function timeline(job, steps) {
  const plan = planFor(job);
  const byKey = {};
  for (const s of steps) { const k = keyOf(s.step); (byKey[k] ||= []).push(s); }
  const rows = plan.map(([key, label]) => {
    const ss = byKey[key] || [];
    let status = 'pending';
    if (key === 'pick' && job.status === 'pick') status = 'wait';
    else if (key === 'thumb-wait' && job.status === 'thumb') status = 'wait';
    else if (ss.some((x) => x.status === 'running')) status = 'running';
    else if (ss.length && ss.every((x) => x.status === 'failed')) status = 'failed';
    else if (ss.some((x) => x.status === 'done')) status = 'done';
    else if (ss.some((x) => x.status === 'skipped')) status = 'skipped';
    const start = ss.length ? Math.min(...ss.map((x) => x.started_at)) : 0;
    const end = ss.length && status !== 'running' ? Math.max(...ss.map((x) => x.finished_at || x.started_at)) : 0;
    const secs = start ? Math.round(((end || Date.now()) - start) / 1000) : 0;
    return { key, label, status, start, end, secs, note: ss.filter((x) => x.note).map((x) => x.note).slice(-1)[0] || '' };
  });
  for (const r of rows) if ((r.key === 'pick' || r.key === 'thumb-wait') && r.status === 'pending') { const later = rows.slice(rows.indexOf(r) + 1).some((x) => x.status !== 'pending'); if (later) r.status = 'done'; }
  const total = rows.length, done = rows.filter((r) => ['done', 'skipped'].includes(r.status)).length;
  const cur = rows.find((r) => r.status === 'running' || r.status === 'wait') || rows.find((r) => r.status === 'pending');
  const remain = rows.filter((r) => r.status === 'pending').reduce((a, r) => a + (EXPECT[r.key] || 60), 0) + (cur?.status === 'running' ? Math.max(0, (EXPECT[cur.key] || 60) - cur.secs) : 0);
  const finished = ['done', 'failed', 'stopped'].includes(job.status);
  const elapsed = Math.round(((finished ? (job.finished_at || job.updated_at) : Date.now()) - job.created_at) / 1000);
  return { rows, total, done, cur, remain, elapsed, finished };
}
const mins = (sec) => (sec < 60 ? `${sec}초` : sec < 3600 ? `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}` : `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`);
function timelineHtml(job, steps) {
  const t = timeline(job, steps);
  const pct = Math.round((t.done / t.total) * 100);
  const head = t.finished
    ? `${job.status === 'done' ? '완료' : STATUS[job.status]?.[0] || job.status} · ${t.total}단계 중 ${t.done}단계 · 총 ${mins(t.elapsed)}`
    : job.status === 'queued' ? `${t.total}단계 · 시작 대기 (PC 도우미가 집어 갑니다)`
    : `${t.total}단계 중 ${Math.min(t.total, t.done + 1)}번째 <b>${esc(t.cur?.label || '')}</b> · 경과 ${mins(t.elapsed)}${t.cur?.status === 'wait' ? ' · <span class="tl-wait">내 선택 기다리는 중</span>' : t.remain ? ` · 남은 시간 약 ${mins(Math.round(t.remain / 30) * 30 || 30)}` : ''}`;
  const icon = { done: '✓', running: '●', wait: '✋', failed: '✕', skipped: '–', pending: '○' };
  return `<section class="card st-steps">
    <div class="tl-head">${head}</div>
    <div class="tl-bar"><i style="width:${pct}%"></i></div>
    <ol class="tl">${t.rows.map((r, i) => `<li class="tl-${r.status}"><span class="tl-no">${i + 1}</span><span class="tl-ic">${icon[r.status]}</span><b>${esc(r.label)}</b><span class="tl-note">${esc(r.note)}</span><span class="tl-dur">${r.status === 'running' ? `${mins(r.secs)} 진행 중` : r.status === 'wait' ? '기다리는 중' : r.status === 'pending' ? `예상 ${mins(EXPECT[r.key] || 60)}` : r.secs ? mins(r.secs) : ''}</span></li>`).join('')}</ol>
  </section>`;
}
// 제작 조건 — 스튜디오 첫 화면에 늘 보인다 (사용자 지시 2026-11-09). 네 칸: PC 도우미 · Claude(글) · ChatGPT(그림) · 예약
//   기술적인 항목(엔진 폴더 · 브라우저 · 토큰)은 문제가 있을 때만 빨간 줄로.
function conditionsHtml(hs) {
  const info = hs.info || {}, ex = hs.expected || {}, c = info.claude || {}, g = info.chatgpt || {};
  const cOk = !!c.loggedIn && (!ex.claude || c.email === ex.claude);
  const gOk = !!g.loggedIn && (!ex.chatgpt || !g.email || g.email === ex.chatgpt);
  const sc = hs.schedules || [];
  const tiles = [
    { icon: '🖥️', name: 'PC 도우미', ok: hs.online, big: hs.online ? '켜짐' : '꺼짐',
      sub: hs.online ? `${esc(info.pc || '')} · ${ago(hs.helper_seen)}` : (hs.helper_seen ? `마지막 ${ago(hs.helper_seen)}` : '아직 연결된 적 없음'),
      fix: hs.online ? '' : 'PC 에서 스튜디오도우미_시작.bat 을 켜 주세요' },
    { icon: '✍️', name: 'Claude · 글', ok: cOk, big: c.loggedIn ? esc(c.email || '') : (info.at ? '로그인 안 됨' : '확인 전'),
      sub: c.loggedIn ? `${esc(c.plan || '')}${c.expires ? ` · ${fmtDate(Date.parse(c.expires)).slice(0, 10)} 까지` : ''}` : `${esc(ex.claude || '')} 계정이어야 합니다`,
      fix: !c.loggedIn && info.at ? 'PC 터미널에서 claude 를 실행해 로그인' : c.loggedIn && !cOk ? `기대한 계정(${esc(ex.claude)})과 다릅니다` : '' },
    { icon: '🎨', name: 'ChatGPT · 그림', ok: gOk, big: g.loggedIn ? esc(g.email || '로그인됨') : (info.at ? '로그인 안 됨' : '확인 전'),
      sub: g.loggedIn ? '자동화용 엣지 프로필' : `${esc(ex.chatgpt || '')} 계정이어야 합니다`,
      fix: !g.loggedIn && info.at ? '스튜디오_ChatGPT로그인.bat → 뜨는 창에서 로그인' : g.loggedIn && !gOk ? `기대한 계정(${esc(ex.chatgpt)})과 다릅니다` : '' },
    { icon: '⏰', name: '예약', ok: true, big: sc.length ? sc.map((x) => `${x.time} ${x.channel}`).join(' · ') : '없음', sub: sc.length ? '매일 자동으로 만듭니다' : '예약 버튼에서 켤 수 있습니다', fix: '' },
  ];
  const problems = [];
  if (info.at && !info.browserOk) problems.push(`그림용 브라우저(${esc(info.browser || '')})가 그 PC 에 없습니다.`);
  if (info.at && !info.engine) problems.push(`그림 엔진 폴더(${esc(info.docs || 'docs')}\\tools)가 그 PC 에 없습니다 — ws 저장소를 받아 주세요.`);
  if (!hs.token_ok) problems.push('xim 에 도우미 토큰(STUDIO_HELPER_TOKEN)이 없습니다.');
  const allOk = tiles.every((t) => t.ok) && !problems.length;
  return `<section class="card st-cond ${allOk ? 'ok' : 'bad'}">
    <div class="st-cond-head"><b>${allOk ? '✅ 지금 만들 수 있습니다' : '⚠️ 아직 만들 수 없습니다 — 아래 빨간 칸을 확인하세요'}</b><span class="st-meta">${info.at ? `점검 ${ago(info.at)} · ` : ''}그림 보관 ${fmtBytes(hs.total_bytes || 0)} (${hs.total_files || 0}장 · 작업 ${hs.kept_jobs || 0}개)${hs.online ? '' : ' · <a href="#" data-help-pc>다른 PC 에서 쓰려면?</a>'}</span></div>
    <div class="st-cond-grid">${tiles.map((t) => `<div class="st-cond-tile ${t.ok ? 'ok' : 'bad'}"><span class="ic">${t.icon}</span><div><span class="nm">${t.name}</span><b>${t.big}</b><small>${t.sub}</small>${t.fix ? `<em>${t.fix}</em>` : ''}</div></div>`).join('')}</div>
    ${problems.length ? `<ul class="st-cond-problems">${problems.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
  </section>`;
}
// 썸네일을 16:9(1280×720) PNG 로 내려받기 — 카드 버튼과 썸네일 탭이 같이 쓴다
async function downloadThumb(url, id) {
  try {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const sh = img.width * 9 / 16, sy = (img.height - sh) / 2;
    c.getContext('2d').drawImage(img, 0, sy, img.width, sh, 0, 0, 1280, 720);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `thumbnail-${String(id).slice(0, 6)}.png`; a.click();
  } catch (e) { toast('내려받지 못했습니다: ' + e.message); }
}
function cardProgress(j) {
  if (!['queued', 'running', 'pick', 'thumb', 'images'].includes(j.status)) return '';
  const plan = planFor({ ...j, options: j.options || {} });
  const k = keyOf(j.step || ''); let i = plan.findIndex(([key]) => key === k);
  if (j.status === 'pick') i = plan.findIndex(([key]) => key === 'pick');
  if (j.status === 'thumb') i = plan.findIndex(([key]) => key === 'thumb-wait');
  if (j.status === 'images' && i < 0) i = plan.findIndex(([key]) => key === 'slides');
  const n = i < 0 ? 0 : i; const pct = Math.round((n / plan.length) * 100);
  return `<div class="tl-bar sm"><i style="width:${pct}%"></i></div><p class="st-meta">${plan.length}단계 중 ${n + 1}번째 · ${esc(plan[n]?.[1] || STEP_LABEL(j.step))}</p><p class="st-time">⏱ <b>${mins(Math.round((Date.now() - (j.started_at || j.created_at)) / 1000))}</b>째 만드는 중</p>`;
}

const sbadge = (st) => { const [l, c] = STATUS[st] || [st, '']; return `<span class="badge st-${c}">${esc(l)}</span>`; };
const dur = (a, b) => { if (!a) return ''; const s = Math.round(((b || Date.now()) - a) / 1000); return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`; };
const money = (d) => (d ? `$${d.toFixed(2)}` : '');
const fmtBytes = (b) => (!b ? '0' : b >= 1048576 ? `${(b / 1048576).toFixed(b >= 104857600 ? 0 : 1)}MB` : b >= 1024 ? `${Math.round(b / 1024)}KB` : `${b}B`);
const ago = (t) => { const sec = Math.max(0, Math.round((Date.now() - t) / 1000)); return sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.floor(sec / 60)}분 전` : sec < 86400 ? `${Math.floor(sec / 3600)}시간 전` : fmtDate(t); };
const copyBtn = (text) => `<button class="btn sm copy" type="button" data-copy="${esc(text)}">복사</button>`;

export function stopStudio() { clearTimeout(pollTimer); pollTimer = 0; }

export async function renderStudio(d) {
  deps = d;
  stopStudio();
  if (!opts) opts = await deps.api('/studio/options');
  const m = location.hash.match(/^#st-([a-f0-9]{20})$/);
  openId = m ? m[1] : '';
  if (openId) return renderJob();
  return renderList();
}

// ───────── 목록 ─────────
async function renderList() {
  const { view, api } = deps;
  const jobs = await api('/studio/jobs?limit=60');
  const hs = await api('/studio/helper-status').catch(() => ({ online: false, helper_seen: 0 }));
  const keyWarn = conditionsHtml(hs);
  view.innerHTML = `
    <div class="bar st-bar">
      <h2>스튜디오 <small>유튜브 발표자료</small></h2>
      <button class="btn primary" id="st-new" type="button">+ 새 발표자료</button>
      <button class="btn sm" id="st-sched" type="button">⏰ 예약</button>
      <button class="btn sm" id="st-settings" type="button">설정</button>
    </div>
    ${keyWarn}
    ${jobs.length ? `<div class="st-grid">${jobs.map(jobCard).join('')}</div>` : '<p class="empty">아직 만든 발표자료가 없습니다. "새 발표자료" 를 눌러 시작하세요.</p>'}`;
  $('#st-new').addEventListener('click', newJobDialog);
  $('#st-settings').addEventListener('click', settingsDialog);
  $('[data-help-pc]')?.addEventListener('click', (e) => { e.preventDefault(); settingsDialog(); });
  $('#st-sched').addEventListener('click', scheduleDialog);
  $$('.st-card').forEach((c) => c.addEventListener('click', (e) => {
    const act = e.target.closest('[data-card-act]');
    if (act) {
      e.stopPropagation();
      if (act.dataset.cardAct === 'show') return;
      if (act.dataset.cardAct === 'video') { makeVideo(c.dataset.id, act); return; }       // 슬라이드 전부를 사자왕이 읽는 영상(2026-11-10)
      if (act.dataset.cardAct === 'video-open') { resTab = 'video'; location.hash = `#st-${c.dataset.id}`; renderStudio(deps); return; }   // 프로젝트 안 '영상' 탭으로(사용자 지시 2026-11-10)
      if (act.dataset.cardAct === 'dl') { const j = jobs.find((x) => x.id === c.dataset.id); if (j?.thumb) downloadThumb(j.thumb, j.id); return; }   // 바로 내려받기
      resTab = act.dataset.cardAct;   // 썸네일 · 유튜브 버튼은 그 탭으로 바로
    }
    location.hash = `#st-${c.dataset.id}`; renderStudio(deps);
  }));
  if (jobs.some((j) => ['queued', 'running', 'pick', 'thumb', 'images'].includes(j.status))) pollTimer = setTimeout(() => { if (!openId && document.contains(view)) renderList(); }, 5000);
}
function jobCard(j) {
  return `<article class="card st-card" data-id="${j.id}">
    <div class="st-thumb">${j.thumb ? `<img src="${esc(j.thumb)}" alt="" loading="lazy">` : `<span>${j.assets_purged ? '그림 지워짐' : KIND[j.kind] || ''}</span>`}</div>
    <div class="st-body">
      <div class="st-top">${sbadge(j.status)}<span class="badge ch-${j.channel === '순섬' ? 'lime' : 'orange'}">${esc(j.channel)}</span><span class="st-kind">${esc(KIND[j.kind] || j.kind)} · ${esc(SOURCE[j.source] || j.source)}${j.options?.scheduled ? ` · ⏰ 예약 ${esc(j.options.scheduled.split(' ')[0])}` : ''}</span></div>
      <h3>${esc(j.title || (['running', 'queued', 'images', 'pick', 'thumb'].includes(j.status) ? `${STEP_LABEL(j.step || '') || '시작'} 진행 중…` : '제목 없음'))}</h3>
      ${cardProgress(j)}
      ${j.finished_at ? `<p class="st-time">⏱ 만드는 데 <b>${mins(Math.max(1, Math.round((j.finished_at - (j.started_at || j.created_at)) / 1000)))}</b>${j.started_at && j.started_at - j.created_at > 120000 ? ` <span class="st-meta">(대기 ${mins(Math.round((j.started_at - j.created_at) / 1000))} 제외)</span>` : ''}</p>` : ''}
      <p class="st-meta">${fmtDate(j.created_at)}${j.bytes ? ` · 그림 ${fmtBytes(j.bytes)}` : j.assets_purged ? ' · 그림 지움' : ''}${j.cost ? ` · ${money(j.cost)}` : ''}${j.error ? ` · <span class="err-inline">${esc(j.error.slice(0, 80))}</span>` : ''}</p>
      ${j.status === 'done' && j.kind === 'main' ? `<div class="st-card-actions">
        <a class="btn primary" href="/studio/show/${j.id}" target="_blank" rel="noopener" data-card-act="show">▶ 방송용 슬라이드쇼 새 창으로 열기</a>
        <div class="st-card-pair"><button class="btn" type="button" data-card-act="thumb">🖼 썸네일 메뉴</button><button class="btn" type="button" data-card-act="dl" ${j.thumb ? '' : 'disabled'}>⬇ 썸네일 다운로드</button></div>
        <button class="btn" type="button" data-card-act="yt">📺 유튜브 (제목 · 인트로 · 더보기)</button>
        <div class="st-card-pair"><button class="btn" type="button" data-card-act="video">🎬 영상 만들기</button>${j.options?.video_job ? `<button class="btn" type="button" data-card-act="video-open">▶ 영상 보기 (내 목소리)</button>` : ''}</div>
      </div>` : ''}
    </div></article>`;
}

// ───────── 영상 만들기 ─────────
async function makeVideo(id, btn) {
  const { api } = deps;
  if (!confirm('이 발표자료의 슬라이드 전부를 사자왕이 원고대로 읽는 영상(1280x720, 자막)을 만듭니다.\n음성 30분 안팎 걸리고, 진행 상황과 완성 영상은 "내 목소리" 메뉴에서 봅니다. 시작할까요?')) return;
  await busy(btn, null, async () => {
    const r = await api(`/studio/jobs/${id}/video`, { method: 'POST', data: {} });
    toast(`영상 작업 시작 — 슬라이드 ${r.slides}장 · ${r.chars.toLocaleString('ko-KR')}자. 진행은 카드의 "영상 보기" 나 "내 목소리" 에서.`);
    renderList();
  }, '요청 중…');
}

// ───────── 새 작업 ─────────
function newJobDialog() {
  const { api, shrinkImage } = deps;
  const uploads = [];     // 캡쳐 {id,url}
  const dlg = openDialog(`
    <h2>새 발표자료</h2>
    <form id="st-form">
      <fieldset class="choice-set"><legend>종류</legend><div class="tabs seg" id="f-kind"></div></fieldset>
      <fieldset class="choice-set"><legend>채널 스타일</legend><div class="tabs seg" id="f-channel"></div></fieldset>
      <div id="main-opts">
        <fieldset class="choice-set"><legend>소스</legend><div class="tabs seg" id="f-source"></div></fieldset>
        <div id="src-capture" hidden>
          <div class="field"><span>캡쳐 이미지 (1~6장, 한 장 = 기사 하나)</span>
            <div class="st-drop" id="f-drop" tabindex="0" role="button" aria-label="캡쳐 이미지 올리기">
              <b>여기에 이미지를 끌어다 놓으세요</b><span>또는 눌러서 고르기 · Ctrl+V 로 붙여넣기 — 한 번에 최대 6장</span>
              <input type="file" id="f-files" accept="image/*" multiple hidden>
            </div>
            <div class="st-ups" id="f-ups"></div>
          </div>
        </div>
        <label class="field" id="src-text" hidden><span>글</span><textarea class="input" name="text" rows="6" placeholder="기사 본문이나 메모를 붙여 넣으세요"></textarea></label>
        <fieldset class="choice-set" id="pick-set"><legend>기사 고르기</legend><div class="tabs seg" id="f-pick"></div><small>자동이면 클로드 추천 6개로 바로 진행합니다.</small></fieldset>
        <fieldset class="choice-set"><legend>썸네일</legend><div class="tabs seg" id="f-thumb"></div><small>내가 고르기 = 글이 끝난 뒤 제목 · 인물 · 표정 · 제스처를 웹에서 고릅니다.</small></fieldset>
        <fieldset class="choice-set"><legend>영상</legend><label class="st-check"><input type="checkbox" name="video" checked> 발표자료가 완성되면 <b>영상도 바로 만들기</b>(사자왕이 슬라이드 전부를 읽는 1280x720 자막 영상, 8분 이상)</label><small>끄면 나중에 카드의 "영상 만들기" 로 만들 수 있습니다.</small></fieldset>
      </div>
      <div id="thumb-opts" hidden>${thumbPickForm({}, [], [])}</div>
      <p class="err" id="f-err"></p>
      <div class="dlg-actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">시작</button></div>
    </form>`, (dlg) => {
    const st = { kind: 'main', channel: '사섬', source: 'rss', pick: 'auto', thumb: 'auto' };
    pillTabs($('#f-kind', dlg), [['main', '본편'], ['thumb', '썸네일만'], ['phone', '폰UI 쇼츠 (준비 중)']], st.kind, (v) => { if (v === 'phone') { toast('폰UI 쇼츠는 다음 단계에서 열립니다.'); return; } st.kind = v; $('#main-opts', dlg).hidden = v !== 'main'; $('#thumb-opts', dlg).hidden = v !== 'thumb'; });
    pillTabs($('#f-channel', dlg), [['사섬', '사섬'], ['순섬', '순섬']], st.channel, (v) => { st.channel = v; });
    pillTabs($('#f-source', dlg), [['rss', '웹 뉴스 (최근 8시간)'], ['capture', '캡쳐 올리기'], ['text', '글 직접']], st.source, (v) => { st.source = v; $('#src-capture', dlg).hidden = v !== 'capture'; $('#src-text', dlg).hidden = v !== 'text'; $('#pick-set', dlg).hidden = v !== 'rss'; });
    pillTabs($('#f-pick', dlg), [['auto', '자동 (추천 6개)'], ['manual', '내가 고르기']], st.pick, (v) => { st.pick = v; });
    pillTabs($('#f-thumb', dlg), [['auto', '자동'], ['manual', '내가 고르기']], st.thumb, (v) => { st.thumb = v; });
    setupThumbForm(dlg);
    // 캡쳐 올리기: 끌어다 놓기 · 눌러서 고르기 · 붙여넣기(Ctrl+V) 모두 같은 함수로
    const drop = $('#f-drop', dlg);
    const addFiles = async (files) => {
      const box = $('#f-ups', dlg);
      const imgs = [...files].filter((f) => /^image\//.test(f.type));
      if (!imgs.length) return;
      if (uploads.length >= 6) { toast('캡쳐는 6장까지입니다'); return; }
      for (const file of imgs.slice(0, 6 - uploads.length)) {
        const ph = document.createElement('div'); ph.className = 'st-up'; ph.textContent = '올리는 중…'; box.append(ph);
        try {
          const blob = await shrinkImage(file);
          const res = await fetch('/api/studio/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'image/webp', 'X-Name': encodeURIComponent(file.name) }, body: blob });
          const out = await res.json(); if (!res.ok) throw new Error(out.error || '업로드 실패');
          uploads.push(out); ph.innerHTML = `<img src="${out.url}" alt=""><button type="button" class="x" aria-label="빼기">×</button>`;
          ph.querySelector('.x').addEventListener('click', () => { uploads.splice(uploads.indexOf(out), 1); ph.remove(); });
        } catch (err) { ph.textContent = err.message; ph.classList.add('bad'); }
      }
      drop.classList.toggle('full', uploads.length >= 6);
    };
    $('#f-files', dlg).addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    drop.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') $('#f-files', dlg).click(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#f-files', dlg).click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    dlg.addEventListener('paste', (e) => { if (st.source !== 'capture') return; const fs = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); addFiles(fs); } });
    $('#st-form', dlg).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      busy(f.querySelector('[type=submit]'), $('#f-err', dlg), async () => {
        const data = { kind: st.kind, channel: st.channel, source: st.source, pick: st.pick, thumb: st.thumb, engine: 'cloud', text: f.text.value, captures: uploads.map((u) => u.id), video: !!f.video?.checked };
        if (st.kind === 'thumb') Object.assign(data, readThumbForm(dlg));
        const r = await api('/studio/jobs', { method: 'POST', data });
        dlg.close();
        location.hash = `#st-${r.id}`;
        renderStudio(deps);
      });
    });
  });
  return dlg;
}

// 썸네일 선택 폼 (새 작업 '썸네일만' · 진행 중 '썸네일 선택' · 결과 '다시 만들기' 가 같이 쓴다)
function thumbPickForm(prev, titles, people) {
  const opt = (list, cur) => `<option value="자동" ${!cur || cur === '자동' ? 'selected' : ''}>자동 (제목 감정에 맞게)</option>${list.map(([k, d]) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''} title="${esc(d)}">${esc(k)}</option>`).join('')}`;
  return `
    <label class="field"><span>제목</span>
      ${titles.length ? `<div class="st-titles">${titles.map((t, i) => `<label><input type="radio" name="tp-title-pick" value="${esc(t)}" ${i === 0 && !prev.title ? 'checked' : prev.title === t ? 'checked' : ''}> ${esc(t)}</label>`).join('')}<label><input type="radio" name="tp-title-pick" value="" ${prev.title && !titles.includes(prev.title) ? 'checked' : ''}> 직접 입력</label></div>` : ''}
      <input class="input" name="tp-title" value="${esc(prev.title && !titles.includes(prev.title) ? prev.title : '')}" placeholder="직접 입력할 제목">
    </label>
    <div class="row2">
      <label class="field"><span>인물 명찰 (기사 속 인물에서 고르기)</span>
        <select class="input" name="tp-badge-sel">
          <option value="">명찰 없음</option>
          ${people.map((p, i) => { const q = parsePerson(p); return `<option value="${i}" data-name="${esc(q.name)}" data-en="${esc(q.en)}" data-role="${esc(q.role)}" ${prev.badgeName && prev.badgeName === q.name ? 'selected' : ''}>${esc(p)}</option>`; }).join('')}
          <option value="custom" ${prev.badgeName && !people.some((p) => parsePerson(p).name === prev.badgeName) ? 'selected' : ''}>직접 입력</option>
        </select></label>
      <div class="row2 tp-badge-fields">
        <label class="field"><span>이름</span><input class="input" name="tp-badge-name" value="${esc(prev.badgeName || '')}" placeholder="예: 유리엔 티머"></label>
        <label class="field"><span>소속 · 직함</span><input class="input" name="tp-badge-role" value="${esc(prev.badgeRole || '')}" placeholder="예: 피델리티 글로벌 매크로 이사"></label>
      </div>
    </div>
    <div class="row2">
      <label class="field"><span>표정</span><select class="input" name="tp-emotion">${opt(opts.emotions, prev.emotion)}</select></label>
      <label class="field"><span>제스처</span><select class="input" name="tp-gesture">${opt(opts.gestures, prev.gesture)}</select></label>
    </div>
    <fieldset class="choice-set"><legend>인물 사진</legend>
      <div class="tabs seg" data-face-mode></div>
      <p class="st-hint" data-face-person hidden>명찰에서 고른 인물의 사진을 PC 도우미가 검색해 붙입니다 (닮은 캐리커처로 그려집니다).</p>
      <div class="st-faces" data-faces hidden>${opts.faces.map((n) => `<button type="button" class="st-face ${prev.face === 'emoji:' + n ? 'on' : ''}" data-face="emoji:${n}"><img src="/api/studio/face/${n}" alt="${n}" loading="lazy"></button>`).join('')}</div>
      <div data-face-up hidden><input class="input" type="file" accept="image/*" data-face-file><div class="st-ups" data-face-prev></div></div>
      <input type="hidden" name="tp-face" value="${esc(prev.face || 'emoji:auto')}">
    </fieldset>`;
}
// "한글 이름 (English Name, 소속·직함)" → { name, en, role }
function parsePerson(p) {
  const m = String(p).match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!m) return { name: String(p).trim(), en: '', role: '' };
  const inner = m[2]; const i = inner.indexOf(',');
  return { name: m[1].trim(), en: (i >= 0 ? inner.slice(0, i) : inner).trim(), role: i >= 0 ? inner.slice(i + 1).trim() : '' };
}
function setupThumbForm(root) {
  const hidden = $('[name=tp-face]', root);
  const cur = hidden.value;
  const mode = cur.startsWith('asset:') ? 'upload' : cur.startsWith('person:') ? 'person' : cur === 'emoji:auto' ? 'auto' : cur.startsWith('emoji:') ? 'pick' : 'none';
  const personName = () => { const o = $('[name=tp-badge-sel] option:checked', root); return o && o.value !== '' && o.value !== 'custom' ? (o.dataset.en || o.dataset.name) : ($('[name=tp-badge-name]', root).value.trim()); };
  pillTabs($('[data-face-mode]', root), [['auto', '내 사진 (자동 선택)'], ['pick', '내 사진 고르기'], ['person', '기사 속 인물 사진'], ['upload', '다른 인물 올리기'], ['none', '인물 없음']], mode, (v) => {
    $('[data-faces]', root).hidden = v !== 'pick'; $('[data-face-up]', root).hidden = v !== 'upload'; $('[data-face-person]', root).hidden = v !== 'person';
    if (v === 'auto') hidden.value = 'emoji:auto'; else if (v === 'none') hidden.value = ''; else if (v === 'pick') hidden.value = $('.st-face.on', root)?.dataset.face || 'emoji:001';
    else if (v === 'person') { const n = personName(); if (!n) { toast('먼저 명찰에서 인물을 고르거나 이름을 적어 주세요'); } hidden.value = n ? `person:${n}` : 'emoji:auto'; }
  });
  $('[data-faces]', root).hidden = mode !== 'pick'; $('[data-face-up]', root).hidden = mode !== 'upload'; $('[data-face-person]', root).hidden = mode !== 'person';
  // 명찰 인물을 고르면 이름 · 소속이 채워지고, 인물 사진도 그 인물로 바뀐다 (사용자 지시 2026-11-09)
  const sel = $('[name=tp-badge-sel]', root), nameIn = $('[name=tp-badge-name]', root), roleIn = $('[name=tp-badge-role]', root), fields = $('.tp-badge-fields', root);
  const applySel = (changed) => {
    const o = sel.options[sel.selectedIndex];
    if (o.value === '') { if (changed) { nameIn.value = ''; roleIn.value = ''; } fields.hidden = true; }
    else if (o.value === 'custom') { fields.hidden = false; if (changed) nameIn.focus(); }
    else { nameIn.value = o.dataset.name; roleIn.value = o.dataset.role; fields.hidden = false; if (changed) $('[data-face-mode] button[data-v="person"]', root)?.click(); }
  };
  sel.addEventListener('change', () => applySel(true));
  applySel(false);
  if (mode === 'person' && !cur.slice(7)) hidden.value = personName() ? `person:${personName()}` : 'emoji:auto';
  $$('.st-face', root).forEach((b) => b.addEventListener('click', () => { $$('.st-face.on', root).forEach((x) => x.classList.remove('on')); b.classList.add('on'); hidden.value = b.dataset.face; }));
  $('[data-face-file]', root).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const box = $('[data-face-prev]', root); box.innerHTML = '<div class="st-up">올리는 중…</div>';
    try {
      const blob = await deps.shrinkImage(file);
      const res = await fetch('/api/studio/upload?kind=face', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'image/webp' }, body: blob });
      const out = await res.json(); if (!res.ok) throw new Error(out.error || '업로드 실패');
      hidden.value = `asset:${out.id}`; box.innerHTML = `<div class="st-up"><img src="${out.url}" alt=""></div>`;
    } catch (err) { box.innerHTML = `<div class="st-up bad">${esc(err.message)}</div>`; }
  });
  $$('[name=tp-title-pick]', root).forEach((r) => r.addEventListener('change', () => { const t = $('[name=tp-title]', root); t.hidden = !!r.value && r.checked; if (!r.value) t.focus(); }));
  const first = $('[name=tp-title-pick]:checked', root); if (first && first.value) $('[name=tp-title]', root).hidden = true;
}
function readThumbForm(root) {
  const picked = $('[name=tp-title-pick]:checked', root);
  const title = (picked && picked.value) || $('[name=tp-title]', root).value.trim();
  const badgeName = $('[name=tp-badge-name]', root).value.trim();
  let face = $('[name=tp-face]', root).value;
  // 명찰이 있는데 내 사진이면 → 그 인물 사진으로 (내 사진에 남의 명찰을 붙이는 실수 금지, 사용자 지시 2026-11-09)
  if (badgeName && !face.startsWith('person:') && !face.startsWith('asset:')) {
    const o = $('[name=tp-badge-sel] option:checked', root);
    face = `person:${(o && o.value !== '' && o.value !== 'custom' ? (o.dataset.en || o.dataset.name) : badgeName)}`;
    toast('명찰 인물의 사진으로 바꿨습니다 (내 사진에 다른 사람 명찰은 붙이지 않습니다)');
  }
  return { title, badgeName, badgeRole: $('[name=tp-badge-role]', root).value.trim(), emotion: $('[name=tp-emotion]', root).value, gesture: $('[name=tp-gesture]', root).value, face };
}

// ───────── 작업 상세 ─────────
async function renderJob() {
  const { view, api } = deps;
  let r;
  try { r = await api(`/studio/jobs/${openId}`); } catch (e) { toast(e.message); location.hash = ''; return renderStudio(deps); }
  const { job, steps, docs, assets } = r;
  const active = ['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status);
  const J = (k) => { try { return docs[k] ? JSON.parse(docs[k].body) : null; } catch { return null; } };
  const top15 = J('top15'), fact = J('factcheck'), summary = J('summary'), showTexts = J('show_texts');
  const slides = assets.filter((a) => a.kind === 'slide').sort((a, b) => a.idx - b.idx);
  const thumb = assets.filter((a) => a.kind === 'thumb').pop();
  const captures = assets.filter((a) => a.kind === 'capture');
  const blocks = fact?.fixed_blocks || (docs.articles ? docs.articles.body.split(/\n(?=📌)/) : []);

  view.innerHTML = `
    <div class="bar st-bar">
      <button class="btn sm" id="st-back" type="button">← 목록</button>
      <h2 class="st-h">${esc(job.title || KIND[job.kind] || '')}</h2>
      ${sbadge(job.status)}<span class="badge ch-${job.channel === '순섬' ? 'lime' : 'orange'}">${esc(job.channel)}</span>
      <span class="st-meta">${fmtDate(job.created_at)} · ${esc(KIND[job.kind])} · ${esc(SOURCE[job.source])}${job.cost ? ` · ${money(job.cost)}` : ''}</span>
      <span class="sp"></span>
      ${job.kind === 'main' ? `<a class="btn sm" href="${r.show_url}" target="_blank" rel="noopener">슬라이드쇼 열기 ↗</a>` : ''}
      ${active ? '<button class="btn sm danger" id="st-stop" type="button">멈춤</button>' : '<button class="btn sm danger" id="st-del" type="button">삭제</button>'}
    </div>
    ${job.error ? `<p class="st-warn">${esc(job.error)}</p>` : ''}
    ${timelineHtml(job, steps)}
    ${job.status === 'pick' && top15 ? pickPanel(top15) : ''}
    ${job.status === 'thumb' ? `<section class="card st-panel"><h3>썸네일 고르기</h3><form id="st-thumb-form">${thumbPickForm({}, summary?.titles || [], summary?.people || [])}<p class="err" id="tp-err"></p><button class="btn primary" type="submit">이대로 썸네일 만들기</button></form></section>` : ''}
    ${blocks.length || slides.length || thumb || top15 || captures.length ? `<section class="card st-panel">
      <div class="tabs st-restabs" id="st-restabs"></div>
      <div id="st-res"></div>
    </section>` : ''}`;
  $('#st-back').addEventListener('click', () => { location.hash = ''; renderStudio(deps); });
  $('#st-stop')?.addEventListener('click', (e) => { if (!confirm('지금 진행 중인 작업을 멈출까요?')) return; busy(e.currentTarget, null, async () => { await api(`/studio/jobs/${job.id}/stop`, { method: 'POST', data: {} }); renderJob(); }, '멈추는 중…'); });
  $('#st-del')?.addEventListener('click', (e) => { if (!confirm('이 발표자료와 그림을 모두 지울까요? 되돌릴 수 없습니다.')) return; busy(e.currentTarget, null, async () => { await api(`/studio/jobs/${job.id}`, { method: 'DELETE' }); toast('지웠습니다'); location.hash = ''; renderStudio(deps); }, '지우는 중…'); });
  $('#st-pick-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const chosen = $$('#st-pick-form input:checked').map((i) => +i.value);
    busy(e.currentTarget.querySelector('[type=submit]'), $('#pk-err'), async () => {
      if (chosen.length !== 6 && !confirm(`${chosen.length}개를 골랐습니다. 6개가 아니어도 진행할까요?`)) return;
      await api(`/studio/jobs/${job.id}/pick`, { method: 'POST', data: { chosen } }); renderJob();
    });
  });
  $$('#st-pick-form input[type=checkbox]').forEach((c) => c.addEventListener('change', () => { $('#pk-count').textContent = `${$$('#st-pick-form input:checked').length} / 6`; }));
  if (job.status === 'thumb') {
    setupThumbForm($('#st-thumb-form'));
    $('#st-thumb-form').addEventListener('submit', (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('[type=submit]'), $('#tp-err'), async () => { const d = readThumbForm(e.currentTarget); if (!d.title) throw new Error('제목을 고르거나 넣어 주세요.'); await api(`/studio/jobs/${job.id}/thumb`, { method: 'POST', data: d }); renderJob(); }); });
  }
  // 결과 탭
  // 순서: 방송 때 바로 쓰는 것(슬라이드쇼 · 썸네일 · 유튜브)을 앞에, 나머지는 뒤에 (사용자 지시 2026-11-09)
  const tabs = [];
  if (job.kind === 'main' && blocks.length) tabs.push(['show', '슬라이드쇼']);
  if (thumb || (job.status === 'done' && job.kind === 'main')) tabs.push(['thumb', '썸네일']);
  if (summary) tabs.push(['yt', '유튜브']);
  if (job.options?.video_job) tabs.push(['video', '영상']);
  if (blocks.length) tabs.push(['script', '원고']);
  if (slides.length) tabs.push(['slides', `슬라이드 ${slides.length}`]);
  if (top15) tabs.push(['news', `뉴스 ${top15.items.length}`]);
  if (captures.length) tabs.push(['caps', `캡쳐 ${captures.length}`]);
  if (tabs.length) {
    if (!tabs.some(([k]) => k === resTab)) resTab = tabs[0][0];
    pillTabs($('#st-restabs'), tabs, resTab, (v) => { resTab = v; drawRes(); });
    const drawRes = () => {
      const box = $('#st-res');
      if (resTab === 'script') box.innerHTML = scriptPanel(job, blocks, showTexts, fact);
      else if (resTab === 'slides') box.innerHTML = slidesPanel(job, slides, blocks);
      else if (resTab === 'show') box.innerHTML = showPanel(r.show_url, slides.length, blocks.length);
      else if (resTab === 'thumb') box.innerHTML = thumbPanel(job, thumb, summary);
      else if (resTab === 'yt') box.innerHTML = ytPanel(summary, (thumb?.meta?.pick?.title) || J('thumb_pick')?.title || '');
      else if (resTab === 'video') { box.innerHTML = videoPanel(job, summary, (thumb?.meta?.pick?.title) || J('thumb_pick')?.title || ''); fillVideoStatus(job); }
      else if (resTab === 'news') box.innerHTML = newsPanel(top15, J('chosen'));
      else if (resTab === 'caps') box.innerHTML = `<div class="st-slides">${captures.map((a) => `<figure><img src="${a.url}" alt=""><figcaption>캡쳐 ${a.idx}</figcaption></figure>`).join('')}</div>`;
      wireRes(job, blocks, thumb, summary);
      fitShowPreview();
    };
    drawRes();
  }
  if (active) pollTimer = setTimeout(() => { if (openId === job.id && document.contains(view)) renderJob(); }, 4000);
}

function pickPanel(top) {
  const rec = new Set(top.picks);
  const reason = Object.fromEntries(top.pick_reasons.map((p) => [p.n, p.reason]));
  return `<section class="card st-panel"><h3>기사 6개 고르기 <small id="pk-count">0 / 6</small></h3>
    <p class="st-hint">클로드 추천은 ★ 로 표시됩니다. 처음엔 아무것도 체크돼 있지 않습니다.</p>
    <form id="st-pick-form"><ul class="st-news">${top.items.map((it) => `<li><label><input type="checkbox" value="${it.n}">
      <div><div class="n-top"><b>${it.n}.</b> ${esc(it.title)} ${rec.has(it.n) ? `<span class="n-rec" title="${esc(reason[it.n] || '')}">★ 추천</span>` : ''}</div>
      <div class="n-meta">${esc(it.source_label)} · ${esc(it.published_kst)} · <a href="${esc(it.url)}" target="_blank" rel="noopener">원문</a></div>
      <div class="n-sum">${esc(it.summary)}</div></div></label></li>`).join('')}</ul>
    <p class="err" id="pk-err"></p><button class="btn primary" type="submit">이 기사들로 진행</button></form></section>`;
}
function newsPanel(top, chosen) {
  const rec = new Set(top.picks), ch = new Set(chosen || top.picks);
  return `<ul class="st-news plain">${top.items.map((it) => `<li class="${ch.has(it.n) ? 'chosen' : ''}"><div><div class="n-top"><b>${it.n}.</b> ${esc(it.title)} ${ch.has(it.n) ? '<span class="n-rec">✓ 선택</span>' : rec.has(it.n) ? '<span class="n-rec dim">★ 추천</span>' : ''}</div><div class="n-meta">${esc(it.source_label)} · ${esc(it.published_kst)} · <a href="${esc(it.url)}" target="_blank" rel="noopener">원문</a></div><div class="n-sum">${esc(it.summary)}</div></div></li>`).join('')}</ul>`;
}
function scriptPanel(job, blocks, showTexts, fact) {
  return `${fact ? `<div class="st-fact"><b>팩트체크</b> ${esc(fact.summary)}${fact.changes?.length ? `<ul>${fact.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}<p>인물: ${esc(fact.people.join(', ') || '없음')} / 기관: ${esc(fact.orgs.join(', ') || '없음')}</p></div>` : ''}
    <p class="st-hint">방송 대본은 슬라이드쇼 오른쪽에 그대로 들어갑니다. 여기서 고쳐 저장하면 새 버전으로 쌓입니다.</p>
    ${(showTexts || blocks).map((t, i) => `<div class="st-block"><div class="st-block-h"><b>슬라이드 ${i + 1}</b>${copyBtn(t)}</div><textarea class="input st-ta" data-i="${i}" rows="${Math.min(18, t.split('\n').length + 2)}">${esc(t)}</textarea></div>`).join('')}
    <div class="dlg-actions"><button class="btn primary" id="st-save-texts" type="button">대본 저장</button><span class="st-savemsg" id="st-savemsg"></span></div>`;
}
function slidesPanel(job, slides, blocks) {
  const done = !['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status);
  return `<div class="st-slides">${slides.map((a) => { const rv = a.meta?.review; return `<figure>
    <a href="${a.url}" target="_blank" rel="noopener"><img src="${a.url}" alt="슬라이드 ${a.idx}"></a>
    <figcaption><b>${a.idx}</b> ${esc((blocks[a.idx - 1] || '').split('\n')[0].replace(/^📌/, ''))}
      ${rv ? `<span class="badge ${rv.pass ? 'done' : 'suspended'}" title="${esc(rv.reason || '')}">${rv.pass ? '검수 합격' : '검수 불합격'}</span>` : ''}
      ${done ? `<button class="btn sm" type="button" data-redo-slide="${a.idx}">이 장만 다시</button>` : ''}</figcaption>
    ${rv && !rv.pass ? `<p class="st-reason">${esc(rv.reason)}</p>` : ''}</figure>`; }).join('')}</div>`;
}
// 방송용 슬라이드쇼(04_PPTMaker 규격) — 미리보기(축소) + 새 창으로 열기. 방송 때는 새 창을 1900px 이상 화면에 띄운다
function showPanel(url, nSlides, nBlocks) {
  const full = location.origin + url;
  return `<div class="st-show-head">
      <a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">▶ 방송용 슬라이드쇼 새 창으로 열기</a>
      <button class="btn sm" type="button" data-copy="${esc(full)}">주소 복사</button>
      <span class="st-meta">왼쪽 1400px 슬라이드 · 오른쪽 대본 · 이전/다음 · 좌우 화살표 · 타이머 · 대본 편집(Ctrl+S 저장) — 슬라이드 ${nSlides}/${nBlocks}장${nSlides < nBlocks ? ' (그림이 아직 없는 장은 "그림 없음" 으로 보임)' : ''}</span>
    </div>
    <p class="st-hint">아래는 축소 미리보기입니다. 화살표 · 버튼도 눌러 볼 수 있지만 방송 때는 위 버튼으로 새 창을 띄우세요.</p>
    <div class="st-show-wrap" id="st-show-wrap"><iframe src="${esc(url)}" title="슬라이드쇼 미리보기" loading="lazy"></iframe></div>`;
}
function fitShowPreview() {
  const w = $('#st-show-wrap'); if (!w) return;
  w.style.setProperty('--k', String(Math.min(1, w.clientWidth / 1900)));
}
addEventListener('resize', fitShowPreview);
function thumbPanel(job, thumb, summary) {
  const done = !['queued', 'running', 'pick', 'thumb', 'images'].includes(job.status);
  const rv = thumb?.meta?.review, pick = thumb?.meta?.pick;
  return `${thumb ? `<div class="st-thumb-big"><a href="${thumb.url}" target="_blank" rel="noopener"><img src="${thumb.url}" alt="썸네일"></a>
    <p>${rv ? `<span class="badge ${rv.pass ? 'done' : 'suspended'}">${rv.pass ? '검수 합격' : '검수 불합격'}</span> ${esc(rv.reason || '')}` : ''}</p>
    ${pick ? `<p class="st-meta">제목 "${esc(pick.title)}" · 표정 ${esc(pick.emotion || '자동')} · 제스처 ${esc(pick.gesture || '자동')}${pick.badgeName ? ` · 명찰 ${esc(pick.badgeName)}` : ''}</p>` : ''}
    <div class="dlg-actions st-thumb-actions"><button class="btn sm" type="button" id="st-dl-thumb">16:9 로 내려받기</button>${done ? '<button class="btn sm" type="button" id="st-rethumb-toggle">🔁 썸네일 다시 만들기</button>' : ''}</div></div>` : `<p class="empty">썸네일이 없습니다.</p>${done ? '<div class="dlg-actions"><button class="btn sm" type="button" id="st-rethumb-toggle">🔁 썸네일 만들기</button></div>' : ''}`}
    ${done ? `<div class="st-redo-body" id="st-rethumb-wrap" hidden><p class="st-hint">제목 · 인물 명찰 · 표정 · 제스처 · 인물 사진을 바꿔 저장하면 PC 의 ChatGPT 가 다시 그립니다(3~5분).</p><form id="st-rethumb">${thumbPickForm(pick || {}, summary?.titles || [], summary?.people || [])}<p class="err" id="rt-err"></p><button class="btn primary" type="submit">이대로 다시 만들기</button></form></div>` : ''}`;
}
function ytPanel(s, thumbTitle = '') {
  // 썸네일에 들어간 제목은 굵게 + 표시 (사용자 지시 2026-11-09)
  return `<h4>제목 추천</h4><ol class="st-titles-list">${s.titles.map((t) => `<li class="${thumbTitle && t === thumbTitle ? 'is-thumb' : ''}">${thumbTitle && t === thumbTitle ? `<b>${esc(t)}</b> <span class="badge st-done">썸네일</span>` : esc(t)} ${copyBtn(t)}</li>`).join('')}${thumbTitle && !s.titles.includes(thumbTitle) ? `<li class="is-thumb"><b>${esc(thumbTitle)}</b> <span class="badge st-done">썸네일 (직접 입력)</span> ${copyBtn(thumbTitle)}</li>` : ''}</ol>
    <h4>인트로 대본 ${copyBtn(s.intro)}</h4><p class="st-pre">${esc(s.intro)}</p>
    <h4>더보기란 ${copyBtn(s.description)}</h4><pre class="st-pre">${esc(s.description)}</pre>
    <h4>등장 인물</h4><ul>${s.people.length ? s.people.map((p) => `<li>${esc(p)}</li>`).join('') : '<li>없음</li>'}</ul>`;
}
// 영상 탭(2026-11-10): 사자왕이 슬라이드를 읽는 완성 영상 — 재생 · 내려받기 · 유튜브에 올리기(제목 · 더보기란 · 썸네일은 유튜브 탭 그대로)
function videoPanel(job, summary, thumbTitle = '') {
  const vid = job.options.video_job, yt = job.options.yt;
  const titles = [...new Set([thumbTitle, ...(summary?.titles || []), job.title].filter(Boolean))];
  const ytState = !yt ? '' : yt.status === 'queued' ? '<p class="st-meta">⏳ 유튜브 올리기 대기 중 (PC 도우미가 곧 시작)</p>'
    : yt.status === 'running' ? '<p class="st-meta">📤 유튜브에 올리는 중… (엣지 자동화, 10~20분)</p>'
    : yt.status === 'done' ? `<p class="st-meta">✅ 유튜브에 올림 (${esc(yt.visibility || '')})${yt.url ? ` · <a href="${esc(yt.url)}" target="_blank" rel="noopener">${esc(yt.url)}</a>` : ' · 유튜브 스튜디오에서 확인'}</p>`
    : yt.status === 'login' ? `<p class="err-inline">🔑 ${esc(yt.error || '유튜브 로그인이 필요합니다')}</p>`
    : `<p class="err-inline">❌ 유튜브 올리기 실패: ${esc(yt.error || '')}</p>`;
  return `<div class="st-video" data-video-job="${esc(vid)}">
    <p class="st-meta" id="st-video-status">영상 상태 확인 중…</p>
    <div id="st-video-box"></div>
    <div class="st-card-pair" style="margin-top:10px">
      <a class="btn" id="st-video-dl" href="/api/voice/video/${esc(vid)}.mp4?dl=1" download="${esc((job.title || 'video').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80))}.mp4">⬇ 영상 다운로드</a>
      <button class="btn" type="button" id="st-video-voice">🎙 내 목소리에서 보기</button>
    </div>
    <h4 style="margin-top:18px">📺 유튜브에 올리기</h4>
    <form id="st-yt-form" class="st-yt-form">
      <label>제목 <select name="title">${titles.map((t, i) => `<option value="${esc(t)}"${i === 0 ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>공개 상태 <select name="visibility"><option value="비공개" selected>비공개 (올린 뒤 직접 공개)</option><option value="일부공개">일부 공개</option><option value="공개">공개</option></select></label>
      <p class="st-meta">더보기란 · 썸네일 · 재생목록(코인뉴스) · 수익창출 · 광고 적합성은 전처럼 자동으로 채웁니다. PC 의 엣지 자동화 프로필에 사적인자산왕 계정이 로그인돼 있어야 합니다.</p>
      <button class="btn primary" type="submit" ${yt && ['queued', 'running'].includes(yt.status) ? 'disabled' : ''}>유튜브에 올리기</button>
    </form>
    ${ytState}
  </div>`;
}
async function fillVideoStatus(job) {
  const { api } = deps;
  const vid = job.options.video_job, st = $('#st-video-status'), box = $('#st-video-box');
  if (!st) return;
  try {
    const r = await api(`/voice/jobs/${vid}`);
    const j = r.job || r;
    if (j.status === 'done' && j.video_status === 'done') {
      st.textContent = `✅ 영상 완성 · ${Math.floor((j.seconds || 0) / 60)}분 ${Math.round((j.seconds || 0) % 60)}초 · ${fmtDate(j.video_at || j.done_at)}`;
      box.innerHTML = `<video class="st-video-el" controls preload="metadata" playsinline src="/api/voice/video/${esc(vid)}.mp4?v=${j.video_at || 0}"></video>`;
    } else if (j.status === 'failed' || j.video_status === 'failed') {
      st.innerHTML = `<span class="err-inline">❌ 영상 실패: ${esc(j.error || j.video_error || '')}</span> — 카드의 "영상 만들기" 로 다시 만들 수 있어요`;
      $('#st-video-dl')?.setAttribute('aria-disabled', 'true');
    } else {
      st.textContent = j.status === 'done' ? '🎬 음성은 끝났고 영상을 합성 · 올리는 중…' : `🎙 음성 만드는 중… (${j.status === 'queued' ? '대기' : '진행'} · 내 목소리에서 자세히)`;
      $('#st-video-dl')?.classList.add('disabled');
      setTimeout(() => { if (document.contains(st)) fillVideoStatus(job); }, 10000);
    }
  } catch (e) { st.textContent = `영상 상태를 못 읽었습니다: ${e.message}`; }
}
function wireRes(job, blocks, thumb, summary) {
  const { api } = deps;
  $('#st-video-voice')?.addEventListener('click', () => { try { localStorage.setItem('xim.tab', 'voice'); } catch { /* 무시 */ } location.hash = ''; location.reload(); });
  $('#st-yt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget, d = { title: f.title.value, visibility: f.visibility.value };
    if (!confirm(`유튜브(사적인자산왕)에 올립니다.\n제목: ${d.title}\n공개 상태: ${d.visibility}\n\nPC 도우미가 엣지로 올리며 10~20분 걸립니다. 시작할까요?`)) return;
    busy(f.querySelector('[type=submit]'), null, async () => { await api(`/studio/jobs/${job.id}/youtube`, { method: 'POST', data: d }); toast('유튜브 올리기를 요청했습니다. 진행은 이 탭에서 보입니다.'); renderJob(); });
  });
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('복사했습니다'); } catch { toast('복사하지 못했습니다'); } }));
  $('#st-save-texts')?.addEventListener('click', async (e) => {
    const texts = $$('.st-ta').map((t) => t.value);
    await busy(e.currentTarget, null, async () => { const r = await api(`/studio/jobs/${job.id}/docs/show_texts`, { method: 'PUT', data: { body: texts } }); $('#st-savemsg').textContent = `저장됨 · 버전 ${r.version}`; });
  });
  $$('[data-redo-slide]').forEach((b) => b.addEventListener('click', async () => {
    const note = prompt(`슬라이드 ${b.dataset.redoSlide} 을 다시 만듭니다. 추가로 요청할 것이 있으면 적어 주세요(없으면 빈 칸).`, '');
    if (note === null) return;
    await busy(b, null, async () => { await api(`/studio/jobs/${job.id}/redo`, { method: 'POST', data: { what: 'slide', idx: +b.dataset.redoSlide, note } }); toast('다시 만드는 중'); renderJob(); }, '요청 중…');
  }));
  $('#st-dl-thumb')?.addEventListener('click', () => downloadThumb(thumb.url, job.id));
  $('#st-rethumb-toggle')?.addEventListener('click', (e) => { const w = $('#st-rethumb-wrap'); w.hidden = !w.hidden; e.currentTarget.classList.toggle('on', !w.hidden); if (!w.hidden) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const rf = $('#st-rethumb');
  if (rf) { setupThumbForm(rf); rf.addEventListener('submit', (e) => { e.preventDefault(); busy(rf.querySelector('[type=submit]'), $('#rt-err'), async () => { const pick = readThumbForm(rf); if (!pick.title) throw new Error('제목을 고르거나 넣어 주세요.'); await api(`/studio/jobs/${job.id}/redo`, { method: 'POST', data: { what: 'thumb', pick } }); await api(`/studio/jobs/${job.id}/rethumb`, { method: 'POST', data: {} }); toast('PC 도우미가 다시 그립니다'); renderJob(); }); }); }
}

// ───────── 예약 (하루 최대 3개) ─────────
async function scheduleDialog() {
  const { api } = deps;
  const r = await api('/studio/schedules');
  const rows = [...r.schedules]; while (rows.length < 3) rows.push({ id: '', time: ['07:10', '20:00', '12:00'][rows.length], channel: rows.length === 0 ? '순섬' : '사섬', on: false, last: '' });
  const row = (x, i) => `<div class="st-sched-row" data-i="${i}">
      <label class="pf-sw" title="켜면 매일 이 시각에 만듭니다"><input type="checkbox" name="on" ${x.on ? 'checked' : ''}><i aria-hidden="true"></i>${x.on ? '켬' : '끔'}</label>
      <input class="input" type="time" name="time" value="${esc(x.time)}" step="300">
      <select class="input" name="channel"><option value="순섬" ${x.channel === '순섬' ? 'selected' : ''}>순섬 · 순수한 크립토</option><option value="사섬" ${x.channel === '사섬' ? 'selected' : ''}>사섬 · 사적인 자산왕</option></select>
      <span class="st-meta"><span class="sc-eta" data-eta>${x.on ? `→ 약 ${plusMin(x.time, est)} 완성` : ''}</span>${x.last ? ` · 마지막 ${esc(x.last)}` : ''}</span>
      <input type="hidden" name="id" value="${esc(x.id)}"><input type="hidden" name="last" value="${esc(x.last)}">
    </div>`;
  const d = r.duration || {}; const est = d.n >= 3 ? d.avg_min : 20;   // 기록이 3회 미만이면 기본 20분 (첫 시험 회차는 재시작이 섞여 43분으로 잡힘)
  const plusMin = (hhmm, add) => { const [h, m] = hhmm.split(':').map(Number); const t = (h * 60 + m + add) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  openDialog(`<h2>예약 <small class="st-meta">하루 최대 3개 · 한국 시각 · 지금 ${esc(r.now_kst)}</small></h2>
    <p class="st-hint">예약 시각이 되면 그 시각 기준 최근 8시간 웹 뉴스로 자동 선택 · 자동 썸네일 본편을 만듭니다. PC 도우미가 꺼져 있으면 "대기" 로 쌓였다가 켤 때 이어집니다.</p>
    <p class="st-dur"><b>한 번 만드는 데 약 ${est}분</b> <span class="st-meta">${d.n >= 3 ? `최근 ${d.n}회 평균 ${d.avg_min}분 · 마지막 ${d.last_min}분` : `기록이 ${d.n || 0}회뿐이라 기본값 20분으로 계산${d.n ? ` (마지막 ${d.last_min}분)` : ''}`} · 글 단계 ≈ 10분, 슬라이드 6장 + 썸네일 ≈ 7~10분, 검수 · 재생성 ≈ 2~3분</span></p>
    <form id="st-sched-form">${rows.map(row).join('')}<p class="err" id="sc-err"></p>
    <div class="dlg-actions"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="submit">저장</button></div></form>`, (dlg) => {
    const refreshEta = (row) => { const on = row.querySelector('[name=on]').checked, tm = row.querySelector('[name=time]').value; row.querySelector('[data-eta]').textContent = on && tm ? `→ 약 ${plusMin(tm, est)} 완성` : ''; };
    $$('.st-sched-row', dlg).forEach((row) => {
      row.querySelector('[name=on]').addEventListener('change', (e) => { e.target.parentElement.lastChild.textContent = e.target.checked ? '켬' : '끔'; refreshEta(row); });
      row.querySelector('[name=time]').addEventListener('input', () => refreshEta(row));
    });
    $('#st-sched-form', dlg).addEventListener('submit', (e) => {
      e.preventDefault();
      busy(e.currentTarget.querySelector('[type=submit]'), $('#sc-err', dlg), async () => {
        const schedules = $$('.st-sched-row', dlg).map((el) => ({ id: el.querySelector('[name=id]').value, time: el.querySelector('[name=time]').value, channel: el.querySelector('[name=channel]').value, on: el.querySelector('[name=on]').checked, last: el.querySelector('[name=last]').value }));
        await api('/studio/schedules', { method: 'PUT', data: { schedules } });
        toast('예약을 저장했습니다'); dlg.close();
      });
    });
  });
}

// ───────── 설정 ─────────
function settingsDialog() {
  const s = opts.settings;
  const f = (k, label, rows) => `<label class="field"><span>${label}</span>${rows ? `<textarea class="input" name="${k}" rows="${rows}">${esc(s[k])}</textarea>` : `<input class="input" name="${k}" value="${esc(s[k])}">`}</label>`;
  openDialog(`<h2>스튜디오 설정</h2><form id="st-set">
    <p class="st-hint">키: Anthropic ${opts.keys.anthropic ? '✅' : '❌ 없음'} · OpenAI ${opts.keys.openai ? '✅' : '❌ 없음'} (키는 Worker 비밀값이라 여기서는 넣을 수 없습니다)</p>
    ${f('slide_style', '슬라이드 스타일 규칙(ppt1)', 3)}
    ${f('thumb_style_사섬', '썸네일 스타일 · 사섬', 2)}
    ${f('thumb_style_순섬', '썸네일 스타일 · 순섬', 2)}
    <div class="row2">${f('daily_limit', '하루 최대 실행 횟수')}<label class="field"><span>글 단계를 클라우드(GitHub Actions)에서</span><select class="input" name="cloud_text"><option value="off" ${s.cloud_text !== 'on' ? 'selected' : ''}>끔 — PC 도우미가 전부</option><option value="on" ${s.cloud_text === 'on' ? 'selected' : ''}>켬 — PC 꺼져 있어도 원고까지(구독 토큰 필요)</option></select></label></div>
    <div class="row2">${f('claude_account', 'Claude Code 로그인 계정(제작 조건)')}${f('chatgpt_account', 'ChatGPT 로그인 계정(제작 조건)')}</div>
    ${f('greeting_사섬', '인사말 · 사섬', 2)}
    ${f('greeting_순섬', '인사말 · 순섬', 2)}
    <div class="field"><span>다른 PC 에 도우미 설치</span><small>그 PC 에 Node · Python · Claude Code · webmaker2 · ws(docs) 가 있으면 아래 한 줄을 붙여 넣어 실행합니다. 자세한 순서는 xim/runner/README.md.</small>
      <div class="st-cmd"><code id="st-setup-cmd">불러오는 중…</code><button class="btn sm" type="button" id="st-setup-copy">복사</button></div></div>
    <p class="err" id="set-err"></p>
    <div class="dlg-actions"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="submit">저장</button></div></form>`, (dlg) => {
    deps.api('/studio/helper-token').then((r) => { $('#st-setup-cmd', dlg).textContent = r.token ? `node D:\\ws\\webmaker2\\xim\\runner\\runner.mjs --setup --token ${r.token}` : '도우미 토큰이 아직 없습니다.'; }).catch(() => {});
    $('#st-setup-copy', dlg).addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#st-setup-cmd', dlg).textContent); toast('복사했습니다'); } catch { toast('복사하지 못했습니다'); } });
    $('#st-set', dlg).addEventListener('submit', (e) => { e.preventDefault(); busy(e.currentTarget.querySelector('[type=submit]'), $('#set-err', dlg), async () => { const data = Object.fromEntries(new FormData(e.currentTarget).entries()); const r = await deps.api('/studio/settings', { method: 'PUT', data }); opts.settings = r.settings; toast('저장했습니다'); dlg.close(); }); });
  });
}
