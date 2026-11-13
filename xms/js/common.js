// xms 관리자 · 방문자 화면 공용 도우미 (ES 모듈)

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function makeApi(base) {
  return async function api(path, { method = 'GET', data } = {}) {
    const res = await fetch(base + path, {
      method,
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    let out = null;
    try { out = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) {
      const err = new Error(out?.error || `요청이 실패했습니다 (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return out;
  };
}

export function fmtDate(ms, time = false) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  // 날짜 안에서는 줄이 바뀌지 않게(붙는 빈칸 \u00a0) — 표 칸이 좁아도 '2026. 11. 3.' 이 한 줄로
  return `${d.getFullYear()}.\u00a0${d.getMonth() + 1}.\u00a0${d.getDate()}.${time ? `\u00a0${p(d.getHours())}:${p(d.getMinutes())}` : ''}`;
}
export const fmtPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
};

let toastTimer;
export function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); (document.querySelector('.xms-c') || document.body).append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// 미끄러지는 알약 탭 (WebMaker 규칙 5)
export function slideTabs(box, sel = '.on') {
  if (!box) return;
  let ind = box.querySelector(':scope > .tab-ind');
  const fresh = !ind;
  if (fresh) { ind = document.createElement('i'); ind.className = 'tab-ind'; box.prepend(ind); }
  const on = box.querySelector(sel);
  const ok = !!(on && on.offsetWidth);
  box.classList.toggle('has-ind', ok);
  if (!ok) return;
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  const put = (r) => { ind.style.width = `${r.w}px`; ind.style.height = `${r.h}px`; ind.style.transform = `translate(${r.x}px, ${r.y}px)`; };
  if (fresh) { ind.style.transition = 'none'; put(box._tabLast || to); void ind.offsetWidth; ind.style.transition = ''; }
  put(to);
  box._tabLast = to;
  if (!box._tabResize) {
    box._tabResize = true;
    const again = () => { const r = box.querySelector(':scope > .tab-ind'); if (r && box.isConnected) { r.style.transition = 'none'; slideTabs(box, sel); void r.offsetWidth; r.style.transition = ''; } };
    addEventListener('resize', again);
    document.fonts?.ready.then(again);
  }
}
export function pillTabs(box, items, value, onPick) {
  box.innerHTML = items.map(([v, label]) => `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${esc(label)}</button>`).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.classList.contains('on')) return;
    box.querySelectorAll('button.on').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    slideTabs(box);
    onPick(b.dataset.v);
  });
  requestAnimationFrame(() => slideTabs(box));
}

// 폼 → 객체. 같은 이름 체크박스는 배열, 혼자인 체크박스는 true/false
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'submit' || el.type === 'button') continue;
    const multi = el.type === 'checkbox' && form.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1;
    if (el.type === 'checkbox') {
      if (multi || el.dataset.array !== undefined) { out[el.name] ??= []; if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value; else out[el.name] ??= '';
    } else out[el.name] = el.value;
  }
  return out;
}

export function openDialog(html, setup) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dlg">${html}</div>`;
  // 사이트 안에 끼워 넣은 화면이면 .xms-c 안에 둔다 (게시판 CSS 가 그 안에만 걸리므로)
  (document.querySelector('.xms-c') || document.body).append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  setup?.(dlg);
  dlg.showModal();
  return dlg;
}

// 단추에 data-busy="등록하는 중…" 이 있으면 그동안 그 글자로 바꾼다. fn 이 페이지를 옮기면(btn.dataset.leaving) 단추를 다시 풀지 않는다
//   — 화면이 바뀌기 전에 또 눌러 두 번 등록되지 않게 (사용자 지시 2026-11-13)
export async function busy(btn, errEl, fn) {
  const label = btn?.dataset.busy ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; if (label !== null) btn.textContent = btn.dataset.busy; }
  if (errEl) errEl.textContent = '';
  try { return await fn(); } catch (e) {
    if (btn) delete btn.dataset.leaving;
    if (errEl) errEl.textContent = e.message; else toast(e.message);
    return undefined;
  } finally {
    if (btn && !btn.dataset.leaving) { btn.disabled = false; if (label !== null) btn.innerHTML = label; }
  }
}

// 위험한 버튼: 누르면 그 자리에 무슨 일이 생기는지 보여 주고 한 번 더 확인
export function confirmInline(btn, hint, okLabel, run) {
  const host = btn.closest('td, .mng, .actions, form, div') || btn.parentElement;
  host.querySelector(':scope > .confirm')?.remove();
  const box = document.createElement('div');
  box.className = 'confirm';
  box.innerHTML = `<div>${hint}</div><div class="actions"><button type="button" class="btn sm" data-no>그만두기</button><button type="button" class="btn sm danger fill" data-yes>${esc(okLabel)}</button></div>`;
  host.append(box);
  box.querySelector('[data-no]').onclick = () => box.remove();
  box.querySelector('[data-yes]').onclick = (e) => busy(e.currentTarget, null, async () => { await run(); box.remove(); });
}

// 날짜 · 시간 칸: 아이콘뿐 아니라 칸 어디를 눌러도 달력이 뜨게 (xms 의 모든 날짜 칸)
document.addEventListener('click', (e) => {
  const i = e.target.closest?.('input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"]');
  if (!i || i.disabled || i.readOnly) return;
  try { i.showPicker?.(); } catch { /* 지원하지 않는 브라우저는 원래대로 */ }
});
