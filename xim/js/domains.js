// xim 도메인 부스터 — 다른 도메인을 plators.com(Pro) IP 로 태운다 (KT 에서 갑자기 느려지는 일 막기)
//   Worker 는 /api/dm/* 를 Worker `domains` 에 넘긴다. 단계: 등록 → 인증서 → 회색 CNAME 으로 주소 바꾸기 → 완료
//   그 도메인이 xiangdolee 계정 Cloudflare 에 있으면 화면이 열려 있는 동안 15초마다 스스로 다음 단계를 진행한다.
import { $, esc, toast, openDialog, busy } from './common.js';

let deps = null;     // { view, api }
let timer = 0;
let polls = 0;
const items = new Map();
const logs = new Map();
let workers = [];

export function stopDomains() { clearTimeout(timer); timer = 0; }

// 퓨니코드 → 한글 (xn--… 을 사람이 읽는 이름으로)
function punyDecode(label) {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  let n = 128, i = 0, bias = 72;
  const out = [];
  let b = label.lastIndexOf('-'); if (b < 0) b = 0;
  for (let j = 0; j < b; j++) out.push(label.charCodeAt(j));
  const adapt = (delta, num, first) => { delta = first ? Math.floor(delta / damp) : delta >> 1; delta += Math.floor(delta / num); let k = 0; while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; } return k + Math.floor((base - tMin + 1) * delta / (delta + skew)); };
  for (let idx = b > 0 ? b + 1 : 0; idx < label.length;) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      const c = label.charCodeAt(idx++);
      const d = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      i += d * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (d < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1)); i %= out.length + 1;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}
const pretty = (host) => String(host || '').split('.').map((l) => { if (!l.startsWith('xn--')) return l; try { return punyDecode(l.slice(4)); } catch { return l; } }).join('.');

function ask(title, text, yes) {
  return new Promise((resolve) => {
    let ok = false;
    const dlg = openDialog(`<h2>${esc(title)}</h2><p class="dm-ask">${esc(text)}</p>
      <div class="dm-ask-bar"><button type="button" class="btn" data-close>취소</button><button type="button" class="btn primary" data-yes>${esc(yes)}</button></div>`, (d) => {
      d.querySelector('[data-yes]').addEventListener('click', () => { ok = true; d.close(); });
    });
    dlg.addEventListener('close', () => resolve(ok));
  });
}

export async function renderDomains(d) {
  deps = d;
  stopDomains(); polls = 0;
  const { view, api } = deps;
  view.innerHTML = `
    <div class="card dm-card">
      <div class="dm-h"><h2>도메인 부스터</h2><button type="button" class="btn sm" id="dm-reload">새로고침</button></div>
      <p class="dm-desc">다른 도메인을 <b>plators.com(유료)</b> 의 IP 로 태워, KT 에서 갑자기 느려지는 일을 막습니다. <b>○○.plators.com 은 할 필요가 없습니다</b> — 이미 빠른 길입니다.</p>
      <dl class="dm-facts" id="dm-facts"><div><dt>확인 중…</dt></div></dl>
      <div class="dm-setup" id="dm-setup" hidden><p>다른 도메인이 가리킬 입구(<code>sites.plators.com</code>)가 아직 없습니다.</p><button type="button" class="btn primary sm" id="dm-setup-go">준비하기</button></div>
      <p class="err" id="dm-status-err" role="alert"></p>
    </div>
    <div class="card dm-card" id="dm-token" hidden>
      <h2>Cloudflare API 토큰</h2>
      <p class="dm-desc">도메인 부스터 도구에 Cloudflare 토큰이 없습니다. 토큰 값을 붙여 넣어 주세요(권한: 계정 Workers 스크립트 편집 · 영역 읽기 · DNS 편집 · SSL 및 인증서 편집 · Workers 경로 편집, 모든 영역).</p>
      <form id="dm-token-form" class="dm-add"><label class="field dm-grow"><span>API 토큰</span><input class="input" id="dm-token-in" autocomplete="off" spellcheck="false" required></label><button type="submit" class="btn primary">확인하고 저장</button></form>
      <ul class="dm-checks" id="dm-checks"></ul><p class="err" id="dm-token-err" role="alert"></p>
    </div>
    <div class="card dm-card">
      <h2>새 도메인 연결</h2>
      <p class="dm-desc">평소처럼 Cloudflare 에서 그 사이트(Worker)에 도메인을 붙여 둔 뒤, 여기서 도메인과 사이트를 고르고 <b>연결하기</b> 를 누르면 끝입니다. 이 계정 Cloudflare 에 있는 도메인은 나머지(인증서 · 주소 바꾸기 · TXT 정리)를 알아서 합니다. 주소를 바꾸는 순간 1분 정도 사이트가 끊길 수 있습니다.</p>
      <form class="dm-add" id="dm-add">
        <label class="field dm-grow"><span>도메인</span><input class="input" id="dm-host" placeholder="예: 나사렛장학회.kr" autocomplete="off" spellcheck="false" required></label>
        <label class="field"><span>보여 줄 사이트(Worker)</span><select class="input" id="dm-worker" required><option value="">불러오는 중…</option></select></label>
        <label class="dm-check"><input type="checkbox" id="dm-www" checked> www 도 함께</label>
        <button type="submit" class="btn primary" id="dm-go">연결하기</button>
      </form>
      <p class="err" id="dm-add-err" role="alert"></p>
    </div>
    <h3 class="dm-list-h">연결한 도메인 <small id="dm-meta"></small></h3>
    <ul class="dm-list" id="dm-list"></ul>
    <p class="empty" id="dm-empty" hidden>아직 연결한 도메인이 없습니다.</p>`;

  $('#dm-reload').addEventListener('click', () => { polls = 0; loadAll(); });
  $('#dm-setup-go').addEventListener('click', (e) => busy(e.currentTarget, $('#dm-status-err'), async () => { const r = await api('/dm/setup', { method: 'POST' }); toast(r.log.join(' ')); await loadStatus(); }));
  $('#dm-token-form').addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.submitter || $('#dm-token-form .btn'), null, async () => {
      $('#dm-token-err').textContent = ''; $('#dm-checks').innerHTML = '';
      try { await api('/dm/token', { method: 'POST', data: { token: $('#dm-token-in').value } }); toast('토큰을 저장했습니다.'); renderDomains(deps); } catch (err) {
        $('#dm-token-err').textContent = err.message;
      }
    });
  });
  $('#dm-add').addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('#dm-go'), $('#dm-add-err'), async () => {
      const r = await api('/dm/domains', { method: 'POST', data: { host: $('#dm-host').value, worker: $('#dm-worker').value, www: $('#dm-www').checked } });
      toast(r.log.join(' · '));
      $('#dm-host').value = '';
      await loadDomains();
      polls = 0;
      for (const h of r.hosts) await check(h, true);
      schedule();
    }, '연결하는 중…');
  });
  $('#dm-list').addEventListener('click', onListClick);
  $('#dm-list').addEventListener('change', onListChange);

  let me = null;
  try { me = await api('/dm/me'); } catch (err) { $('#dm-status-err').textContent = err.message; return; }
  if (!me.token) { $('#dm-token').hidden = false; return; }
  await loadAll();
}

async function loadAll() { await Promise.all([loadStatus(), loadWorkers(), loadDomains()]); }

async function loadStatus() {
  const { api } = deps;
  $('#dm-status-err').textContent = '';
  try {
    const s = await api('/dm/status');
    const fbOk = s.fallback && s.fallback.origin === s.entry && s.fallback.status === 'active';
    const fact = (cls, dt, dd, small) => `<div class="${cls}"><dt>${dt}</dt><dd>${dd}${small ? `<small>${small}</small>` : ''}</dd></div>`;
    $('#dm-facts').innerHTML = [
      fact(s.paid ? 'ok' : 'warn', `${esc(s.zone)} 플랜`, esc(s.plan || '?'), s.paid ? '유료 IP — 빠른 길' : '무료면 효과가 없습니다'),
      fact(s.entryRecord ? 'ok' : 'warn', '입구', esc(s.entry), s.entryRecord ? '있음' : '아직 없음'),
      fact(fbOk ? 'ok' : 'warn', 'Fallback Origin', s.fallback && s.fallback.origin ? esc(s.fallback.status) : '없음', ''),
      fact('', '사용 중', `${s.count ?? '?'} / 100`, '100개까지 무료'),
    ].join('');
    $('#dm-setup').hidden = !!(s.entryRecord && s.fallback && s.fallback.origin === s.entry);
  } catch (err) { $('#dm-status-err').textContent = err.message; }
}

async function loadWorkers() {
  try { workers = (await deps.api('/dm/workers')).workers; } catch (err) { workers = []; $('#dm-add-err').textContent = err.message; }
  $('#dm-worker').innerHTML = '<option value="">고르세요</option>' + workers.map((w) => `<option>${esc(w)}</option>`).join('');
}
const workerOptions = (cur) => (cur && !workers.includes(cur) ? [cur] : []).concat(workers).map((w) => `<option${w === cur ? ' selected' : ''}>${esc(w)}</option>`).join('') + (cur ? '' : '<option value="" selected>(없음)</option>');

async function loadDomains() {
  try {
    const r = await deps.api('/dm/domains');
    items.clear(); r.items.forEach((it) => items.set(it.host, it));
    renderList();
    if (r.saasError) $('#dm-add-err').textContent = `사용자 지정 호스트를 읽지 못했습니다: ${r.saasError}`;
    schedule();
  } catch (err) { $('#dm-add-err').textContent = err.message; }
}

const STAGES = [['cert', '인증서'], ['switch', '주소 바꾸기'], ['done', '완료']];
function chipOf(it) {
  if (it.stage === 'done') return '<span class="badge active">빠른 길로 연결됨</span>';
  if (it.stage === 'switch') return '<span class="badge doing">주소 바꾸는 중</span>';
  return '<span class="badge new">인증서 기다리는 중</span>';
}
function recsHtml(it) {
  if (it.mode !== 'manual' || it.stage === 'done') return '';
  const rows = it.records.map((r) => `<div class="dm-rec${r.later ? ' later' : ''}"><b>${r.type}</b><div><div class="dm-kv"><code>${esc(r.name)}</code><button type="button" class="btn sm" data-copy="${esc(r.name)}">복사</button></div><div class="dm-kv"><code>${esc(r.value)}</code><button type="button" class="btn sm" data-copy="${esc(r.value)}">복사</button></div><small>${esc(r.why)}${r.later ? ' — 인증서가 Active 된 뒤에' : ''}</small></div></div>`).join('');
  return `<div class="dm-recs"><p>이 도메인은 이 계정 Cloudflare 에 없어서 자동으로 못 넣습니다. 그 도메인 DNS(가비아 등)에 아래 값을 넣고 '확인' 을 누르세요.</p>${rows}</div>`;
}
function itemHtml(it) {
  const idx = STAGES.findIndex((s) => s[0] === it.stage);
  const track = STAGES.map((s, i) => `<li class="${i < idx || it.stage === 'done' ? 'done' : i === idx ? 'now' : ''}">${s[1]}</li>`).join('');
  const name = pretty(it.host);
  const log = logs.get(it.host) || [];
  const d = it.dns || { cname: [], ips: [] };
  const dnsTxt = d.cname.length || d.ips.length ? esc((d.cname.length ? d.cname : d.ips).join(', ')) : '응답 없음';
  return `<li class="card dm-item" data-host="${esc(it.host)}">
    <div class="dm-item-head">
      <div class="dm-name">${esc(name)}${name !== it.host ? `<small>${esc(it.host)}</small>` : ''}</div>
      ${chipOf(it)}
      <label class="dm-worker">사이트 <select class="input" data-act="worker">${workerOptions(it.worker)}</select></label>
    </div>
    <ol class="dm-track">${track}</ol>
    <p class="dm-info">지금 DNS <b>${dnsTxt}</b> · 인증서 <b>${esc(it.ssl)}</b> · 호스트 <b>${esc(it.status)}</b>${it.expires ? ` · <span class="nw">만료 ${esc(it.expires.slice(0, 10))}</span>(자동 갱신)` : ''} · ${it.mode === 'auto' ? `DNS 자동(${esc(pretty(it.zone))})` : 'DNS 직접 입력'}</p>
    ${it.stage !== 'done' && it.errors.length ? `<ul class="dm-errs">${it.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    ${recsHtml(it)}
    ${log.length ? `<ul class="dm-log">${log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <div class="dm-bar">
      ${it.stage === 'done' ? '' : `<button type="button" class="btn primary sm" data-act="check">${it.mode === 'auto' ? '다음 단계 진행' : '확인'}</button>`}
      <a class="btn sm" href="https://${esc(it.host)}/" target="_blank" rel="noopener">열어 보기</a>
      <span class="dm-grow"></span>
      ${it.mode === 'auto' ? '<button type="button" class="link-btn" data-act="revert">예전 방식으로 되돌리기</button>' : ''}
      <button type="button" class="link-btn dm-danger" data-act="delete">등록 삭제</button>
    </div>
  </li>`;
}
function meta() {
  const list = [...items.values()];
  $('#dm-meta').textContent = list.length ? `${list.length}개 · 완료 ${list.filter((i) => i.stage === 'done').length}` : '';
  $('#dm-empty').hidden = list.length > 0;
}
function renderList() { $('#dm-list').innerHTML = [...items.values()].map(itemHtml).join(''); meta(); }
function renderOne(host) {
  const li = document.querySelector(`.dm-item[data-host="${CSS.escape(host)}"]`);
  const it = items.get(host);
  if (!li || !it) return renderList();
  li.outerHTML = itemHtml(it); meta();
}

const running = new Set();
async function check(host, quiet) {
  if (running.has(host) || !deps) return; running.add(host);
  try {
    const r = await deps.api(`/dm/domains/${encodeURIComponent(host)}/check`, { method: 'POST' });
    items.set(host, r.item);
    const prev = logs.get(host) || [];
    const fresh = r.log.filter((l) => l !== prev[prev.length - 1]);
    if (fresh.length) logs.set(host, prev.concat(fresh).slice(-6));
    if (document.querySelector('#dm-list')) renderOne(host);
    if (r.item.stage === 'done' && !quiet) toast(`${pretty(host)} 연결 끝`);
  } catch (err) {
    logs.set(host, (logs.get(host) || []).concat('⚠ ' + err.message).slice(-6));
    if (document.querySelector('#dm-list')) renderOne(host);
  } finally { running.delete(host); }
}
// 끝나지 않은 자동 모드 도메인은 15초마다 다음 단계를 스스로 진행(이 화면이 보이는 동안, 최대 40번)
function schedule() {
  stopDomains();
  const pending = [...items.values()].filter((i) => i.stage !== 'done' && i.mode === 'auto');
  if (!pending.length || polls > 40) return;
  timer = setTimeout(async () => {
    if (!document.querySelector('#dm-list')) return;
    if (document.visibilityState === 'visible') { polls++; for (const it of pending) await check(it.host, true); }
    schedule();
  }, 15000);
}

async function onListClick(e) {
  const cp = e.target.closest('[data-copy]');
  if (cp) { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('복사했습니다.')); return; }
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const host = b.closest('.dm-item').dataset.host; const name = pretty(host);
  const { api } = deps;
  if (b.dataset.act === 'check') { busy(b, null, async () => { await check(host); polls = 0; schedule(); }); return; }
  if (b.dataset.act === 'revert') {
    if (!(await ask('예전 방식으로 되돌릴까요?', `${name} 의 회색 CNAME 을 떼고 다시 Workers Custom Domain 으로 붙인 뒤 등록을 지웁니다. (다시 무료 IP 길 — 1분 정도 끊길 수 있음)`, '되돌리기'))) return;
    try { const r = await api(`/dm/domains/${encodeURIComponent(host)}/revert`, { method: 'POST' }); toast(r.log.join(' ')); loadDomains(); } catch (err) { toast(err.message); }
    return;
  }
  if (b.dataset.act === 'delete') {
    if (!(await ask('등록을 삭제할까요?', `${name} 의 사용자 지정 호스트와 Worker 경로를 지웁니다. 되돌릴 수 없습니다.`, '삭제'))) return;
    try { await api(`/dm/domains/${encodeURIComponent(host)}`, { method: 'DELETE' }); toast('지웠습니다.'); loadDomains(); } catch (err) { toast(err.message); }
  }
}
async function onListChange(e) {
  const s = e.target.closest('select[data-act="worker"]'); if (!s || !s.value) return;
  const host = s.closest('.dm-item').dataset.host;
  try { await deps.api(`/dm/domains/${encodeURIComponent(host)}`, { method: 'PUT', data: { worker: s.value } }); const it = items.get(host); if (it) it.worker = s.value; toast(`${pretty(host)} → ${s.value}`); } catch (err) { toast(err.message); }
}
