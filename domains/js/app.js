/* domains — 도메인 연결 도구 화면 */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const show = (el, on) => { el.hidden = !on; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opt) {
    opt = opt || {};
    const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' });
    let data = {}; try { data = await r.json(); } catch (e) { /* 빈 응답 */ }
    if (r.status === 401 && path !== '/login') { start(); throw new Error('로그인이 필요합니다.'); }
    if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.data = data; throw e; }
    return data;
  }

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
    return String.fromCodePoint.apply(null, out);
  }
  const pretty = (host) => host.split('.').map((l) => { if (!l.startsWith('xn--')) return l; try { return punyDecode(l.slice(4)); } catch (e) { return l; } }).join('.');

  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
  function ask(title, text, yes) {
    return new Promise((resolve) => {
      const m = $('#modal'); $('#modal-t').textContent = title; $('#modal-p').textContent = text; $('#modal-yes').textContent = yes || '확인';
      show(m, true); $('#modal-no').focus();
      const done = (v) => { show(m, false); $('#modal-yes').onclick = $('#modal-no').onclick = m.onclick = null; document.removeEventListener('keydown', key); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', key);
      $('#modal-yes').onclick = () => done(true); $('#modal-no').onclick = () => done(false);
      m.onclick = (e) => { if (e.target === m) done(false); };
    });
  }

  // ───── 시작 ─────
  async function start() {
    stopPoll();
    let me = { ok: false };
    try { me = await api('/me'); } catch (e) { /* 아래에서 로그인 화면 */ }
    show($('#login'), !me.ok); show($('#logout'), !!me.ok);
    show($('#token'), !!me.ok && !me.token);
    show($('#app'), !!me.ok && !!me.token);
    if (!me.ok) { setTimeout(() => $('#pass').focus(), 0); return; }
    if (!me.token) return;
    loadStatus(); loadWorkers(); loadDomains();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#login-err').textContent = '';
    try { await api('/login', { method: 'POST', body: { pass: $('#pass').value } }); $('#pass').value = ''; start(); } catch (err) { $('#login-err').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); start(); });

  $('#token-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#token-err').textContent = ''; $('#token-checks').innerHTML = '';
    const btn = e.submitter || $('#token-form .btn'); btn.disabled = true;
    try { await api('/token', { method: 'POST', body: { token: $('#token-in').value } }); $('#token-in').value = ''; toast('토큰을 저장했습니다.'); start(); } catch (err) {
      const checks = (err.data && err.data.checks) || [];
      $('#token-checks').innerHTML = checks.map((c) => `<li class="${c.ok ? '' : 'no'}">${esc(c.name)}${c.ok ? '' : ` — ${esc(c.error)}`}</li>`).join('');
      $('#token-err').textContent = checks.length ? '빠진 권한을 토큰에 더해 주세요.' : err.message;
    } finally { btn.disabled = false; }
  });

  // ───── 준비 상태 ─────
  let entryIps = [];
  async function loadStatus() {
    $('#status-err').textContent = '';
    try {
      const s = await api('/status');
      entryIps = s.entryIps || [];
      const fbOk = s.fallback && s.fallback.origin === s.entry && s.fallback.status === 'active';
      const fbText = s.fallback && s.fallback.origin ? `${s.fallback.status === 'active' ? '정상' : s.fallback.status}` : '없음';
      const fact = (cls, dt, dd, small) => `<div class="${cls}"><dt>${dt}</dt><dd>${dd}${small ? `<small>${small}</small>` : ''}</dd></div>`;
      $('#facts').innerHTML = [
        fact(s.paid ? 'ok' : 'warn', `${esc(s.zone)} 플랜`, esc(s.plan || '?'), s.paid ? '유료 IP 대역 — 빠른 길' : '무료면 효과가 없습니다. Pro 로 올려 주세요.'),
        fact(s.entryRecord ? 'ok' : 'warn', '입구', esc(s.entry), s.entryRecord ? (entryIps.join(', ') || '') : '아직 없음'),
        fact(fbOk ? 'ok' : 'warn', 'Fallback Origin', fbText, s.fallback && s.fallback.error ? esc(s.fallback.error) : ''),
        fact('', '사용 중', `${s.count ?? '?'} / 100`, '100개까지 무료, 넘으면 개당 월 $0.1'),
      ].join('');
      show($('#setup'), !s.entryRecord || !s.fallback || s.fallback.origin !== s.entry);
    } catch (err) { $('#status-err').textContent = err.message; }
  }
  $('#reload').addEventListener('click', () => { loadStatus(); loadDomains(); });
  $('#setup-go').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/setup', { method: 'POST' }); toast(r.log.join(' ')); loadStatus(); } catch (err) { $('#status-err').textContent = err.message; } finally { e.target.disabled = false; }
  });

  // ───── Worker 목록 ─────
  let workers = [];
  async function loadWorkers() {
    try { workers = (await api('/workers')).workers; } catch (err) { workers = []; $('#add-err').textContent = err.message; }
    $('#add-worker').innerHTML = '<option value="">고르세요</option>' + workers.map((w) => `<option>${esc(w)}</option>`).join('');
  }
  const workerOptions = (cur) => (cur && !workers.includes(cur) ? [cur] : []).concat(workers).map((w) => `<option${w === cur ? ' selected' : ''}>${esc(w)}</option>`).join('') + (cur ? '' : '<option value="" selected>(없음)</option>');

  // ───── 새 도메인 ─────
  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#add-err').textContent = '';
    const btn = $('#add-go'); btn.disabled = true; btn.textContent = '연결하는 중…';
    try {
      const r = await api('/domains', { method: 'POST', body: { host: $('#add-host').value, worker: $('#add-worker').value, www: $('#add-www').checked } });
      toast(r.log.join(' · '));
      $('#add-host').value = '';
      await loadDomains();
      r.hosts.forEach((h) => check(h, true));
    } catch (err) { $('#add-err').textContent = err.message; } finally { btn.disabled = false; btn.textContent = '연결하기'; }
  });

  // ───── 목록 ─────
  const items = new Map();
  const logs = new Map();
  async function loadDomains() {
    try {
      const r = await api('/domains');
      if (r.entryIps) entryIps = r.entryIps;
      items.clear(); r.items.forEach((it) => items.set(it.host, it));
      render();
      if (r.saasError) $('#add-err').textContent = `사용자 지정 호스트를 읽지 못했습니다: ${r.saasError}`;
      schedulePoll();
    } catch (err) { $('#add-err').textContent = err.message; }
  }

  const STAGES = [['cert', '인증서'], ['switch', '주소 바꾸기'], ['done', '완료']];
  function chipOf(it) {
    if (it.stage === 'done') return '<span class="chip ok">빠른 길로 연결됨</span>';
    if (it.errors.length) return '<span class="chip bad">확인 필요</span>';
    if (it.stage === 'switch') return '<span class="chip warn">인증서 준비됨 · 주소 바꾸기 남음</span>';
    return '<span class="chip warn">인증서 기다리는 중</span>';
  }
  function pathText(it) {
    const d = it.dns;
    if (!d.ips.length && !d.cname.length) return '지금 DNS: <b>응답 없음</b>';
    const via = d.cname.length ? `CNAME ${esc(d.cname.join(' → '))}` : esc(d.ips.join(', '));
    return `지금 DNS: <b>${via}</b> — ${it.pointed ? 'plators.com 유료 IP ✓' : '아직 예전 길'}`;
  }
  function recsHtml(it) {
    if (it.mode !== 'manual' || it.stage === 'done') return '';
    const rows = it.records.map((r) => `<div class="rec${r.later ? ' later' : ''}"><span class="t">${r.type}</span><div><div class="kv"><code>${esc(r.name)}</code><button type="button" class="copy" data-copy="${esc(r.name)}">복사</button></div><div class="kv"><code>${esc(r.value)}</code><button type="button" class="copy" data-copy="${esc(r.value)}">복사</button></div><span class="why">${esc(r.why)}${r.later ? ' — 인증서가 Active 된 뒤에' : ''}</span></div></div>`).join('');
    return `<div class="recs"><p>이 도메인은 이 계정 Cloudflare 에 없어서 자동으로 못 넣습니다. 그 도메인 DNS(가비아 등)에 아래 값을 넣고 '확인' 을 누르세요. 루트 도메인은 그 업체가 루트 CNAME 을 지원해야 합니다.</p>${rows}</div>`;
  }
  function itemHtml(it) {
    const idx = STAGES.findIndex((s) => s[0] === it.stage);
    const track = STAGES.map((s, i) => `<li class="${i < idx || it.stage === 'done' ? 'done' : i === idx ? 'now' : ''}">${s[1]}</li>`).join('');
    const name = pretty(it.host);
    const log = logs.get(it.host) || [];
    return `<li class="card dom" data-host="${esc(it.host)}">
      <div class="dom-head">
        <div class="dom-name">${esc(name)}${name !== it.host ? `<small>${esc(it.host)}</small>` : ''}</div>
        ${chipOf(it)}
        <label class="dom-worker">사이트 <select class="input" data-act="worker">${workerOptions(it.worker)}</select></label>
      </div>
      <ol class="track">${track}</ol>
      <p class="dom-info">${pathText(it)}<br>인증서 <b>${esc(it.ssl)}</b> · 호스트 <b>${esc(it.status)}</b>${it.expires ? ` · <span class="nw">만료 ${esc(it.expires.slice(0, 10))}</span>(자동 갱신)` : ''} · ${it.mode === 'auto' ? `DNS 자동(${esc(pretty(it.zone))})` : 'DNS 직접 입력'}</p>
      ${it.errors.length ? `<ul class="dom-errs">${it.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${recsHtml(it)}
      ${log.length ? `<ul class="log">${log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <div class="dom-bar">
        <button type="button" class="btn sm" data-act="check"${it.stage === 'done' ? ' hidden' : ''}>${it.mode === 'auto' ? '다음 단계 진행' : '확인'}</button>
        <a class="link" href="https://${esc(it.host)}/" target="_blank" rel="noopener">열어 보기</a>
        <span class="grow"></span>
        ${it.mode === 'auto' ? '<button type="button" class="link" data-act="revert">예전 방식으로 되돌리기</button>' : ''}
        <button type="button" class="link danger" data-act="delete">등록 삭제</button>
      </div>
    </li>`;
  }
  function render() {
    const list = [...items.values()];
    $('#doms').innerHTML = list.map(itemHtml).join('');
    show($('#empty'), !list.length);
    const done = list.filter((i) => i.stage === 'done').length;
    $('#list-meta').textContent = list.length ? `${list.length}개 · 완료 ${done}` : '';
  }
  function renderOne(host) {
    const li = document.querySelector(`.dom[data-host="${CSS.escape(host)}"]`);
    const it = items.get(host); if (!li || !it) return render();
    li.outerHTML = itemHtml(it);
    const list = [...items.values()];
    $('#list-meta').textContent = `${list.length}개 · 완료 ${list.filter((i) => i.stage === 'done').length}`;
  }

  const busy = new Set();
  async function check(host, quiet) {
    if (busy.has(host)) return; busy.add(host);
    try {
      const r = await api(`/domains/${encodeURIComponent(host)}/check`, { method: 'POST' });
      items.set(host, r.item);
      if (r.log.length) logs.set(host, (logs.get(host) || []).concat(r.log).slice(-6));
      renderOne(host);
      if (r.item.stage === 'done' && !quiet) toast(`${pretty(host)} 연결 끝`);
    } catch (err) { if (!quiet) toast(err.message); logs.set(host, (logs.get(host) || []).concat('⚠ ' + err.message).slice(-6)); renderOne(host); } finally { busy.delete(host); }
  }

  $('#doms').addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('복사했습니다.')); return; }
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const host = b.closest('.dom').dataset.host; const name = pretty(host);
    if (b.dataset.act === 'check') { b.disabled = true; b.textContent = '진행 중…'; await check(host); return; }
    if (b.dataset.act === 'revert') {
      if (!(await ask('예전 방식으로 되돌릴까요?', `${name} 의 회색 CNAME 을 떼고 다시 Workers Custom Domain 으로 붙인 뒤, 여기 등록을 지웁니다.\n(다시 무료 IP 길로 돌아갑니다)`, '되돌리기'))) return;
      try { const r = await api(`/domains/${encodeURIComponent(host)}/revert`, { method: 'POST' }); toast(r.log.join(' ')); loadDomains(); } catch (err) { toast(err.message); }
      return;
    }
    if (b.dataset.act === 'delete') {
      const it = items.get(host);
      const warn = it && it.pointed ? '\n\n⚠ 지금 이 도메인 DNS 가 아직 이 길을 가리키고 있어, 지우면 사이트가 열리지 않습니다. 먼저 DNS 를 바꾸거나 "되돌리기" 를 쓰세요.' : '';
      if (!(await ask('등록을 삭제할까요?', `${name} 의 사용자 지정 호스트와 Worker 경로를 지웁니다. 되돌릴 수 없습니다.${warn}`, '삭제'))) return;
      try { await api(`/domains/${encodeURIComponent(host)}`, { method: 'DELETE' }); toast('지웠습니다.'); loadDomains(); } catch (err) { toast(err.message); }
    }
  });
  $('#doms').addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-act="worker"]'); if (!s || !s.value) return;
    const host = s.closest('.dom').dataset.host;
    try { await api(`/domains/${encodeURIComponent(host)}`, { method: 'PUT', body: { worker: s.value } }); const it = items.get(host); if (it) it.worker = s.value; toast(`${pretty(host)} → ${s.value}`); } catch (err) { toast(err.message); }
  });

  // 끝나지 않은 자동 모드 도메인은 15초마다 다음 단계를 스스로 진행 (화면이 보일 때만, 최대 40번)
  let pollTimer = null, pollCount = 0;
  function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }
  function schedulePoll() {
    stopPoll();
    const pending = [...items.values()].filter((i) => i.stage !== 'done' && i.mode === 'auto');
    if (!pending.length || pollCount > 40) return;
    pollTimer = setTimeout(async () => {
      if (document.visibilityState === 'visible') { pollCount++; for (const it of pending) await check(it.host, true); }
      schedulePoll();
    }, 15000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !pollTimer) { pollCount = 0; schedulePoll(); } });

  start();
})();
