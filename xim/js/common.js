// xim 운영자 화면 · 업체 관리자 화면 공용 도우미 (ES 모듈)

export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// base: 운영자 화면은 '/api', 업체 관리자 화면은 '/xim-api'
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

export function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const STATUS_LABEL = { new: '접수', doing: '진행 중', done: '완료', active: '운영 중', suspended: '정지' };
export const badge = (s) => `<span class="badge ${esc(s)}">${esc(STATUS_LABEL[s] ?? s)}</span>`;

let toastTimer;
export function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// 알약 탭: 고른 칸 배경 하나를 미끄러뜨린다 (WebMaker 공통 규칙 5)
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
    const again = () => { const r = box.querySelector(':scope > .tab-ind'); if (r) { r.style.transition = 'none'; slideTabs(box, sel); void r.offsetWidth; r.style.transition = ''; } };
    addEventListener('resize', again);
    document.fonts?.ready.then(again);
  }
}

// 알약 탭 묶음을 만든다. onPick(value) 은 누르는 즉시(배경이 먼저 움직인 뒤) 부른다.
export function pillTabs(box, items, value, onPick) {
  box.innerHTML = items.map(([v, label]) =>
    `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${esc(label)}</button>`).join('');
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

// 폼 값을 객체로
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// <dialog> 하나를 열고 내용 html 을 넣는다. 닫으면 지운다.
export function openDialog(html, setup) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dlg">${html}</div>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  setup?.(dlg);
  dlg.showModal();
  return dlg;
}

// 제출 중에는 버튼을 잠그고, 실패하면 메시지를 보여 준다
export async function busy(btn, errEl, fn, label = '진행 중…') {
  // 버튼을 누르면 서버가 끝날 때까지 "진행 중…" 으로 바꿔 보여 준다(사용자 지시 2026-11-10 "안 그럼 화면이 멈춘 줄 안다")
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('is-busy');
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${label}`;
  if (errEl) errEl.textContent = '';
  try { return await fn(); } catch (e) {
    if (errEl) errEl.textContent = e.message; else toast(e.message);
    return undefined;
  } finally { btn.disabled = false; btn.classList.remove('is-busy'); btn.innerHTML = orig; }
}
