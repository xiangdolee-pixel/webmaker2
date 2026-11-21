// xim 부기(처음 이름 J-Est. → BookKeeping → 부기) — 달마다 매출(왼쪽) · 매입(오른쪽)을 날짜 · 항목 · 금액으로 적어 정리한다 (사용자 지시 2026-11-21)
//   한 달씩 본다. 줄을 누르면 그 자리에서 고치고, 맨 위 입력 줄에 적고 Enter 를 치면 더해진다(입력 줄은 늘 위 — 사용자 지시). 아래에 달 합계와 차액, 그 해의 달별 합계.
//   매출: 입금자명 + 들어온 계좌(개인 카카오뱅크 · 기업 케이뱅크 · 기타 직접 적기).  매입: 무엇으로 샀는지(결제 수단).
//   항목 · 결제 수단은 목록에서 고른다. 직접 적은 것은 다음부터 목록에 나오고, '목록 관리' 에서 더하기 · 이름 바꾸기 · 빼기를 한다.
import { esc, toast, openDialog } from './common.js';

let deps = null;            // { view, api }
let month = '';             // 'YYYY-MM'
let data = { items: [], year: [], lists: {}, customers: [] };
let lastCust = '';        // 새 매출 줄의 고객도 바로 앞에 고른 것을 따라간다
const SIDES = [['sell', '매출'], ['buy', '매입']];   // 왼쪽 매출 · 오른쪽 매입
const ACCTS = [['개인', '개인 · 카카오뱅크'], ['기업', '기업 · 케이뱅크']];   // 매출 계좌: 값은 '개인' · '기업' 또는 직접 적은 글
const acctLabel = (v, t) => (data.acct && data.acct[v] ? `${v} · ${data.acct[v]}` : t);   // 은행 · 계좌번호까지(서버 설정에서)
const CUSTOM = '__custom';
// 고르는 목록 세 가지 — 매출 항목과 매입 항목은 서로 따로 관리한다(같이 쓰지 않음, 사용자 지시 2026-11-21)
const KINDS = {
  item_sell: { name: '매출 항목', hint: '항목 고르기 · 검색', add: '새 매출 항목 (예: 유지보수 1년)', max: 120 },
  item_buy: { name: '매입 항목', hint: '항목 고르기 · 검색', add: '새 매입 항목 (예: 도메인 등록비)', max: 120 },
  method: { name: '결제 수단', hint: '결제 수단', add: '새 결제 수단 (예: 개인카드)', max: 40 },
};
const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const kst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const onlyNum = (v) => String(v || '').replace(/[^0-9-]/g, '');
const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const label = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
let lastAcct = '개인', lastMethod = '';      // 새 줄은 바로 앞에 고른 것을 따라간다

export async function renderJest(d) {
  deps = d;
  document.getElementById('app')?.classList.add('je-on');   // 화면을 넓게(좌우 여백 줄임) · 위쪽 띠 — 문서관리처럼
  if (!month) { try { month = localStorage.getItem('xim-jest-month') || ''; } catch { /* 무시 */ } }
  if (!/^\d{4}-\d{2}$/.test(month)) month = kst().slice(0, 7);
  await load();
}

export function stopJest() { document.getElementById('app')?.classList.remove('je-on'); }

async function load() {
  const { view, api } = deps;
  data = await api(`/jest?month=${month}`);
  try { localStorage.setItem('xim-jest-month', month); } catch { /* 무시 */ }
  draw(view);
}

function sumOf(side) { return data.items.filter((i) => i.side === side).reduce((n, i) => n + i.amount, 0); }
const listOf = (kind) => (kind === 'cust' ? (data.customers || []).map((c) => c.name) : (data.lists || {})[kind] || []);
// 찾아 고르는 칸(항목 · 결제 수단): 누르면 목록이 펼쳐지고, 치는 대로 걸러진다. 목록에 없는 말은 그대로 새 이름이 된다.
//   목록의 ✎ 로 이름을 바꾸고(적힌 줄도 함께), × 로 목록에서 뺀다. 사용자 지시 2026-11-21 "검색 · 이름 수정 · 삭제"
function pick(kind, cur, attrs, hint) {
  return `<input class="je-in je-combo" type="text" data-kind="${kind}" value="${esc(cur || '')}" ${attrs} placeholder="${hint || KINDS[kind].name}" maxlength="${KINDS[kind].max}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-label="${KINDS[kind].name}">`;
}
let dd = null, ddFor = null, ddAct = -1, ddAll = false;
function closeDD() { if (dd) { dd.remove(); dd = null; } ddFor = null; ddAct = -1; }
function openDD(inp, all) {
  const kind = inp.dataset.kind, q = all ? '' : inp.value.trim().toLowerCase();
  ddAll = !!all;
  const isCust = kind === 'cust';   // 고객은 고르기만(이름 바꾸기 · 빼기 · 새로 넣기는 '고객' 메뉴에서)
  const names = listOf(kind), hits = names.filter((n) => !q || n.toLowerCase().includes(q));
  const fresh = !isCust && inp.value.trim() && !names.includes(inp.value.trim());
  if (!dd) { dd = document.createElement('div'); dd.className = 'je-dd'; dd.setAttribute('role', 'listbox'); document.body.append(dd); dd.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); }); }   // 글 칸의 포커스를 뺏지 않게
  ddFor = inp; ddAct = Math.min(ddAct, hits.length - 1);
  const r = inp.getBoundingClientRect();
  dd.style.cssText = `left:${Math.round(Math.min(r.left, innerWidth - 268))}px;top:${Math.round(r.bottom + 4)}px;min-width:${Math.max(260, Math.round(r.width))}px;max-height:${Math.max(160, Math.round(innerHeight - r.bottom - 16))}px`;
  dd.innerHTML = `${hits.map((n, i) => `<div class="je-opt${i === ddAct ? ' on' : ''}" role="option" data-v="${esc(n)}"><span>${esc(n)}</span>${isCust ? '' : `<button type="button" data-ed title="이름 바꾸기" aria-label="${esc(n)} 이름 바꾸기">✎</button><button type="button" data-rm title="목록에서 빼기" aria-label="${esc(n)} 목록에서 빼기">×</button>`}</div>`).join('')}
    ${isCust && !q ? '<div class="je-opt je-nocust" role="option" data-v=""><span>고객 없음</span></div>' : ''}
    ${fresh ? `<div class="je-opt je-fresh" data-new><span>＋ ‘${esc(inp.value.trim())}’ 새로 넣기</span></div>` : ''}
    ${!hits.length && !fresh ? `<p class="je-dd-none">${names.length ? '찾는 이름이 없습니다.' : isCust ? '등록된 고객이 없습니다. \'고객\' 메뉴에서 먼저 등록해 주세요.' : `아직 없습니다. 적으면 다음부터 여기에 나옵니다.`}</p>` : ''}`;
  dd.onclick = async (e) => {
    const opt = e.target.closest('.je-opt'); if (!opt) return;
    const v = opt.dataset.v, { api } = deps;
    if (e.target.closest('[data-rm]')) {
      try { const res = await api('/jest-items', { method: 'POST', data: { kind, hide: v } }); data.lists = res.lists; openDD(inp, ddAll); } catch (err) { toast(err.message); }
      return;
    }
    if (e.target.closest('[data-ed]')) {   // 그 줄을 글 칸으로 바꿔 이름을 고친다
      const box = document.createElement('input'); box.className = 'je-in'; box.value = v; box.maxLength = KINDS[kind].max;
      opt.replaceChildren(box); box.focus(); box.select();
      let ended = false;
      const end = async (ok) => {
        if (ended) return; ended = true;
        const to = box.value.trim();
        if (ok && to && to !== v) { try { await api('/jest-items', { method: 'POST', data: { kind, rename: { from: v, to } } }); closeDD(); await load(); } catch (err) { toast(err.message); } }
        else if (ddFor) { ddFor.focus(); openDD(ddFor, ddAll); }
      };
      box.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); end(true); } if (ev.key === 'Escape') end(false); });
      box.addEventListener('blur', () => end(true));
      return;
    }
    choose(inp, opt.hasAttribute('data-new') ? inp.value.trim() : v);
  };
}
function choose(inp, v) {
  closeDD();
  const was = inp.value; inp.value = v;
  if (inp.dataset.kind === 'cust') { const before = inp.dataset.cid || ''; settleCust(inp); if (!inp.name) { if (before !== (inp.dataset.cid || '')) inp.dispatchEvent(new Event('change', { bubbles: true })); return; } }
  if (inp.name) { const f = inp.form, all = [...f.querySelectorAll('input:not([type=date]), select')]; (all[all.indexOf(inp) + 1] || f.amount).focus(); }   // 새 줄: 다음 칸으로
  else if (was !== v || v !== inp.defaultValue) inp.dispatchEvent(new Event('change', { bubbles: true }));                                             // 적힌 줄: 바로 저장
}
function bindCombo(inp) {
  inp.addEventListener('focus', () => { ddAct = -1; openDD(inp, true); });
  inp.addEventListener('click', () => { if (!dd || ddFor !== inp) openDD(inp, true); });
  inp.addEventListener('input', () => { ddAct = -1; openDD(inp, false); });
  inp.addEventListener('blur', () => setTimeout(() => {
    if (ddFor === inp && !(dd && dd.contains(document.activeElement))) closeDD();
    if (inp.dataset.kind === 'cust' && document.activeElement !== inp) { const before = inp.dataset.cid || ''; settleCust(inp); if (!inp.name && before !== (inp.dataset.cid || '')) inp.dispatchEvent(new Event('change', { bubbles: true })); }
  }, 120));
  inp.addEventListener('keydown', (e) => {
    if (!dd || ddFor !== inp) { if (e.key === 'ArrowDown') { e.preventDefault(); openDD(inp, true); } return; }
    const opts = [...dd.querySelectorAll('.je-opt')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ddAct = Math.max(0, Math.min(opts.length - 1, ddAct + (e.key === 'ArrowDown' ? 1 : -1))); opts.forEach((o, i) => o.classList.toggle('on', i === ddAct)); opts[ddAct]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && ddAct < 0 && inp.dataset.kind === 'cust' && inp.value.trim() && opts[0] && opts[0].dataset.v) { e.preventDefault(); e.stopPropagation(); choose(inp, opts[0].dataset.v); }   // 고객: 치다가 Enter = 맨 위 것
    else if (e.key === 'Enter' && ddAct >= 0 && opts[ddAct]) { e.preventDefault(); e.stopPropagation(); const o = opts[ddAct]; choose(inp, o.hasAttribute('data-new') ? inp.value.trim() : o.dataset.v); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeDD(); }
    else if (e.key === 'Tab') closeDD();
  });
}
window.addEventListener('scroll', (e) => { if (dd && !(e.target instanceof Node && dd.contains(e.target))) closeDD(); }, true);
window.addEventListener('resize', closeDD);

// 매출의 고객 고르기 — '고객' 메뉴에 등록된 고객(사용자 지시 2026-11-21)
function custSelect(cur, attrs) {
  const c = (data.customers || []).find((x) => String(x.id) === String(cur || ''));
  return `<input class="je-in je-combo je-cust" type="text" data-kind="cust" data-cid="${c ? c.id : ''}" value="${esc(c ? c.name : '')}" ${attrs} placeholder="고객 검색" maxlength="60" autocomplete="off" role="combobox" aria-autocomplete="list" aria-label="고객">`;
}
const custByName = (name) => (data.customers || []).find((x) => x.name === name) || null;
// 고객 칸에 적힌 글을 고객 번호로 맞춘다: 이름이 정확히 맞으면 그 고객, 비우면 없음, 그 밖에는 앞의 고객으로 되돌린다
function settleCust(inp) {
  const t = inp.value.trim(), hit = custByName(t);
  if (hit) inp.dataset.cid = hit.id; else if (!t) inp.dataset.cid = '';
  const c = (data.customers || []).find((x) => String(x.id) === String(inp.dataset.cid || ''));
  inp.value = c ? c.name : '';
}
// 매출 계좌 고르기: 개인 · 기업 · (직접 적은 글) · 기타(직접 적기)
function acctSelect(cur, attrs) {
  const known = ACCTS.some(([v]) => v === cur);
  return `<select class="je-in je-acct" ${attrs} aria-label="계좌">${ACCTS.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(acctLabel(v, t))}</option>`).join('')}${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}<option value="${CUSTOM}">기타 (직접 적기)</option></select>`;
}

function draw(view) {
  const buy = sumOf('buy'), sell = sumOf('sell'), diff = sell - buy;
  const today = kst(), defDay = today.startsWith(month) ? today : `${month}-01`;
  const col = ([side, name]) => {
    const rows = data.items.filter((i) => i.side === side), isSell = side === 'sell';
    // 매출은 계좌마다, 매입은 결제 수단마다 얼마인지도 보여 준다
    let by = '';
    if (rows.length) {
      const m = new Map();
      rows.forEach((i) => { const k = isSell ? (ACCTS.some(([v]) => v === i.account) ? i.account : '기타') : (i.account || '미지정'); m.set(k, (m.get(k) || 0) + i.amount); });
      if (isSell || m.size > 1 || !m.has('미지정')) by = `<p class="je-by">${[...m.entries()].map(([k, v]) => `<span>${esc(isSell && data.acct && data.acct[k] ? `${k} · ${data.acct[k]}` : k)} <b>${won(v)}원</b></span>`).join('')}</p>`;
    }
    return `<section class="je-col je-${side}" data-side="${side}">
      <header class="je-h"><b>${name}</b><span>${rows.length}건</span><em>${won(isSell ? sell : buy)}원</em></header>${by}
      <div class="je-table" role="table" aria-label="${name}">
        <div class="je-row je-head" role="row"><span>날짜</span><span>항목</span>${isSell ? '<span>고객</span><span>입금자명</span><span>계좌</span>' : '<span>결제 수단</span>'}<span class="r">금액</span><span></span></div>
        <form class="je-row je-new" data-new>
          <input class="je-in" type="date" name="day" value="${defDay}" min="${month}-01" max="${month}-31" aria-label="날짜" required>
          ${pick(`item_${side}`, '', 'name="item" required', '항목 고르기 · 검색')}
          ${isSell ? `${custSelect(lastCust, 'name="customer_name"')}<input class="je-in" type="text" name="payer" placeholder="입금자명" maxlength="40" aria-label="입금자명">${acctSelect(lastAcct, 'name="account"')}` : pick('method', lastMethod, 'name="account"', '결제 수단')}
          <input class="je-in r" type="text" name="amount" inputmode="numeric" placeholder="금액" aria-label="금액" required>
          <button type="submit" class="je-add" title="더하기" aria-label="${name} 더하기">+</button>
        </form>
        ${rows.map((i) => `<div class="je-row" role="row" data-id="${i.id}">
          <input class="je-in" type="date" value="${esc(i.day)}" data-f="day" aria-label="날짜">
          ${pick(`item_${side}`, i.item, 'data-f="item"')}
          ${isSell ? `${custSelect(i.customer_id, 'data-f="customer_id"')}<input class="je-in" type="text" value="${esc(i.payer || '')}" data-f="payer" maxlength="40" placeholder="입금자" aria-label="입금자명">${acctSelect(i.account || '개인', 'data-f="account"')}` : pick('method', i.account || '', 'data-f="account"', '결제 수단')}
          <input class="je-in r" type="text" inputmode="numeric" value="${won(i.amount)}" data-f="amount" aria-label="금액">
          <button type="button" class="je-x" data-del title="지우기" aria-label="${esc(i.item)} 지우기">×</button></div>`).join('')}
      </div>
    </section>`;
  };
  const yr = month.slice(0, 4), ysum = { buy: 0, sell: 0 };
  data.year.forEach((y) => { ysum.buy += y.buy; ysum.sell += y.sell; });
  view.innerHTML = `
    <header class="je-top">
      <div class="je-brand"><span class="je-mark">부</span><b>부기</b></div>
      <div class="je-nav"><button type="button" class="je-tb" data-mv="-1" aria-label="앞 달">‹</button>
        <label class="je-month"><b>${label(month)}</b><input type="month" value="${month}" aria-label="달 고르기"></label>
        <button type="button" class="je-tb" data-mv="1" aria-label="다음 달">›</button>
        <button type="button" class="je-tb" data-today>이번 달</button></div>
      <div class="je-tools">
        <button type="button" class="je-tb" data-items>목록 관리</button>
        <a class="je-tb" href="/api/jest/export?month=${month}" download title="${label(month)} 내역을 엑셀 파일로">이 달 엑셀</a>
        <a class="je-tb" href="/api/jest/export?year=${month.slice(0, 4)}" download title="${month.slice(0, 4)}년 전체 내역을 엑셀 파일로">${month.slice(0, 4)}년 엑셀</a>
      </div>
    </header>
    <div class="je-body">
    <div class="je-sum">
      <div><span>매출</span><b>${won(sell)}원</b></div><i>−</i>
      <div><span>매입</span><b>${won(buy)}원</b></div><i>=</i>
      <div class="je-diff ${diff < 0 ? 'minus' : 'plus'}"><span>차액 (매출 − 매입)</span><b>${diff < 0 ? '−' : ''}${won(Math.abs(diff))}원</b></div>
    </div>
    <div class="je-cols">${SIDES.map(col).join('')}</div>
    <section class="je-year">
      <h3>${yr}년 달별 합계</h3>
      <div class="je-ytable">
        <div class="je-yrow je-head"><span>달</span><span class="r">매출</span><span class="r">매입</span><span class="r">차액</span></div>
        ${data.year.map((y) => `<button type="button" class="je-yrow${y.month === month ? ' on' : ''}" data-go="${y.month}"><span>${Number(y.month.slice(5))}월</span><span class="r">${won(y.sell)}</span><span class="r">${won(y.buy)}</span><span class="r ${y.sell - y.buy < 0 ? 'minus' : ''}">${y.sell - y.buy < 0 ? '−' : ''}${won(Math.abs(y.sell - y.buy))}</span></button>`).join('') || '<p class="je-none">아직 적은 내용이 없습니다.</p>'}
        ${data.year.length ? `<div class="je-yrow je-total"><span>합계</span><span class="r">${won(ysum.sell)}</span><span class="r">${won(ysum.buy)}</span><span class="r ${ysum.sell - ysum.buy < 0 ? 'minus' : ''}">${ysum.sell - ysum.buy < 0 ? '−' : ''}${won(Math.abs(ysum.sell - ysum.buy))}</span></div>` : ''}
      </div>
    </section>
    </div>`;
  bind(view);
}

// '직접 기입…' 을 고르면 그 자리가 글 칸으로 바뀐다. done(값) — 빈 값이면 취소(앞의 값으로 되돌림)
function askCustom(sel, done, hint = '계좌 이름 (예: 현금 · 신한 1234)', max = 40) {
  const before = sel.dataset.prev ?? '';
  const inp = document.createElement('input');
  inp.className = 'je-in'; inp.type = 'text'; inp.maxLength = max; inp.placeholder = hint; inp.setAttribute('aria-label', '직접 적기');
  sel.hidden = true; sel.after(inp); inp.focus();
  let ended = false;
  const end = (ok) => {
    if (ended) return; ended = true;
    const v = ok ? inp.value.trim() : '';
    inp.remove(); sel.hidden = false;
    if (v) { let o = [...sel.options].find((x) => x.value === v); if (!o) { o = new Option(v, v); sel.add(o, sel.options[sel.options.length - 1]); } sel.value = v; sel.dataset.prev = v; done(v); }
    else { sel.value = before; done(''); }
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); end(true); } if (e.key === 'Escape') end(false); });
  inp.addEventListener('blur', () => end(true));
}
const hintOf = (sel) => (sel.dataset.kind ? [KINDS[sel.dataset.kind].hint, KINDS[sel.dataset.kind].max] : [undefined, 40]);

// 목록 관리: 항목 · 결제 수단을 더하고, 이름을 바꾸고(적힌 줄도 함께 바뀜), 목록에서 뺀다(적힌 줄은 그대로)
function itemsDialog() {
  const { api } = deps;
  let changed = false;
  const sec = (kind) => `<section class="je-mg" data-kind="${kind}"><h3>${KINDS[kind].name}</h3>
      <form class="je-mg-add" data-add><input class="input sm" name="name" placeholder="${KINDS[kind].add}" maxlength="${KINDS[kind].max}" required><button class="btn sm primary" type="submit">더하기</button></form>
      <ul class="je-items" data-list></ul></section>`;
  openDialog(`
    <h2>목록 관리</h2>
    <p class="je-dlg-note">이름을 누르면 바꿀 수 있습니다(이미 적은 줄도 함께 바뀝니다). × 는 고르는 목록에서만 빼고, 적은 줄은 그대로 둡니다.</p>
    <div class="je-mgs">${sec('item_sell')}${sec('item_buy')}${sec('method')}</div>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`, (dlg) => {
    const send = async (payload) => { const r = await api('/jest-items', { method: 'POST', data: payload }); data.lists = r.lists; changed = true; paint(); };
    const paint = () => dlg.querySelectorAll('.je-mg').forEach((box) => {
      const kind = box.dataset.kind, names = listOf(kind);
      box.querySelector('[data-list]').innerHTML = names.map((n) => `<li><button type="button" class="je-nm" data-rename="${esc(n)}" title="눌러서 이름 바꾸기">${esc(n)}</button><button type="button" class="je-x" data-hide="${esc(n)}" title="목록에서 빼기" aria-label="${esc(n)} 목록에서 빼기">×</button></li>`).join('') || '<li class="je-none">아직 없습니다.</li>';
    });
    paint();
    dlg.querySelectorAll('.je-mg').forEach((box) => {
      const kind = box.dataset.kind;
      box.querySelector('[data-add]').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.currentTarget, v = f.name.value.trim(); if (!v) return; try { await send({ kind, add: v }); f.reset(); f.name.focus(); } catch (err) { toast(err.message); } });
      box.querySelector('[data-list]').addEventListener('click', async (e) => {
        const h = e.target.closest('[data-hide]'), r = e.target.closest('[data-rename]');
        try {
          if (h) await send({ kind, hide: h.dataset.hide });
          else if (r) {   // 이름 칸으로 바꿔 고친다
            const from = r.dataset.rename, inp = document.createElement('input');
            inp.className = 'input sm'; inp.value = from; inp.maxLength = KINDS[kind].max; r.replaceWith(inp); inp.focus(); inp.select();
            let ended = false;
            const end = async (ok) => { if (ended) return; ended = true; const to = inp.value.trim(); if (ok && to && to !== from) { try { await send({ kind, rename: { from, to } }); } catch (err) { toast(err.message); paint(); } } else paint(); };
            inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); end(true); } if (ev.key === 'Escape') { ev.stopPropagation(); end(false); } });
            inp.addEventListener('blur', () => end(true));
          }
        } catch (err) { toast(err.message); }
      });
    });
    dlg.addEventListener('close', () => { if (changed) load().catch((e) => toast(e.message)); });
  });
}

function bind(view) {
  const { api } = deps;
  const go = (m) => { month = m; load().catch((e) => toast(e.message)); };
  view.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => go(shift(month, +b.dataset.mv)); });
  view.querySelector('[data-today]').onclick = () => go(kst().slice(0, 7));
  view.querySelector('[data-items]').onclick = itemsDialog;
  view.querySelector('.je-month input').onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) go(e.target.value); };
  view.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  // 금액 칸: 치는 대로 쉼표
  view.querySelectorAll('[data-f="amount"], [name="amount"]').forEach((el) => el.addEventListener('input', () => { const n = onlyNum(el.value); el.value = n && n !== '-' ? won(n) : n; }));
  closeDD();
  view.querySelectorAll('select.je-acct').forEach((sel) => { sel.dataset.prev = sel.value; });
  view.querySelectorAll('.je-combo').forEach(bindCombo);
  // 더하기
  view.querySelectorAll('[data-new]').forEach((f) => {
    const side = f.closest('[data-side]').dataset.side;
    const next = (el) => { const all = [...f.querySelectorAll('input:not([type=date]), select')].filter((x) => !x.hidden); const i = all.indexOf(el); (all[i + 1] || f.amount).focus(); };
    f.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => {
      const keep = () => { if (sel.name === 'account') { if (side === 'sell') lastAcct = sel.value; else lastMethod = sel.value; } };
      if (sel.value === CUSTOM) askCustom(sel, () => { keep(); next(sel); }, ...hintOf(sel)); else { sel.dataset.prev = sel.value; keep(); next(sel); }
    }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(onlyNum(f.amount.value));
      if (!f.item.value.trim() || !Number.isFinite(amount) || !amount) { toast('항목과 금액을 넣어 주세요.'); return; }
      if (side === 'buy') lastMethod = f.account.value.trim();
      const account = f.account && f.account.value !== CUSTOM ? f.account.value.trim() : '';
      try {
        closeDD();
        await api('/jest', { method: 'POST', data: { side, day: f.day.value, item: f.item.value.trim(), amount, account, payer: f.payer ? f.payer.value : '', customer_id: f.customer_name ? (settleCust(f.customer_name), lastCust = f.customer_name.dataset.cid || '') : '' } });
        const day = f.day.value; if (day.slice(0, 7) !== month) month = day.slice(0, 7);
        await load();
        const again = deps.view.querySelector(`[data-side="${side}"] [data-new]`); if (again) { again.day.value = day; again.item.focus(); }   // 이어서 적기 쉽게
      } catch (err) { toast(err.message); }
    });
  });
  // 고치기: 칸을 벗어나거나 Enter 를 치면 저장
  view.querySelectorAll('.je-row[data-id]').forEach((row) => {
    const id = +row.dataset.id, it = data.items.find((x) => x.id === id);
    const put = async (f, v, el) => {
      try { await api(`/jest/${id}`, { method: 'PUT', data: { ...it, [f]: v } }); await load(); } catch (err) { toast(err.message); if (el) el.value = f === 'amount' ? won(it.amount) : it[f]; }
    };
    row.querySelectorAll('[data-f]').forEach((el) => {
      const f = el.dataset.f;
      if (f === 'customer_id') {   // 고객: 고른 번호(data-cid)가 바뀌었을 때만 저장
        el.addEventListener('change', () => { const id = el.dataset.cid || ''; if (String(id) !== String(it.customer_id ?? '')) put('customer_id', id, null); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { el.dataset.cid = it.customer_id ?? ''; settleCust(el); } });
        return;
      }
      if (el.tagName === 'SELECT') {   // 고르는 칸: '직접 …' 을 고르면 글 칸으로
        el.addEventListener('change', () => {
          if (el.value === CUSTOM) askCustom(el, (v) => { if (v && v !== it[f]) put(f, v, el); }, ...hintOf(el));
          else if (String(el.value) !== String(it[f] ?? '') && (el.value || f === 'account' || f === 'customer_id')) put(f, el.value, el);
        });
        return;
      }
      const save = async () => {
        const v = f === 'amount' ? Number(onlyNum(el.value)) : el.value.trim();
        if (v === (it[f] ?? '')) return;
        if ((f === 'item' && !v) || (f === 'amount' && (!Number.isFinite(v) || !v)) || (f === 'day' && !v)) { el.value = f === 'amount' ? won(it.amount) : it[f]; return; }
        await put(f, v, el);
      };
      el.addEventListener('change', save);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.value = f === 'amount' ? won(it.amount) : it[f]; el.blur(); } });
    });
    row.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`'${it.item}' ${won(it.amount)}원을 지울까요?`)) return;
      try { await api(`/jest/${id}`, { method: 'DELETE' }); await load(); } catch (err) { toast(err.message); }
    };
  });
}
