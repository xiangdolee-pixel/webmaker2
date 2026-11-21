// xim 부기(처음 이름 J-Est. → BookKeeping → 부기) — 달마다 매입(왼쪽) · 매출(오른쪽)을 날짜 · 항목 · 금액으로 적어 정리한다 (사용자 지시 2026-11-21)
//   한 달씩 본다. 줄을 누르면 그 자리에서 고치고, 맨 아래 줄에 적고 Enter 를 치면 더해진다. 아래에 달 합계와 차액, 그 해의 달별 합계.
//   매출(왼쪽)은 입금자명과 어느 계좌로 들어왔는지도 적는다: 개인(카카오뱅크) · 기업(케이뱅크) · 기타(직접 적기). 매입은 오른쪽.
import { esc, toast, openDialog } from './common.js';

let deps = null;            // { view, api }
let month = '';             // 'YYYY-MM'
let data = { items: [], year: [], names: [] };
const ITEMS = ['호스팅 1년', '도메인 1년'];   // 항목 기본 목록 — 직접 적은 항목은 다음부터 목록에 함께 나온다(사용자 지시 2026-11-21)
const SIDES = [['sell', '매출'], ['buy', '매입']];   // 왼쪽 매출 · 오른쪽 매입
const ACCTS = [['개인', '개인 · 카카오뱅크'], ['기업', '기업 · 케이뱅크']];   // 값은 '개인' · '기업' 또는 직접 적은 글
const CUSTOM = '__custom';
const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const kst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const onlyNum = (v) => String(v || '').replace(/[^0-9-]/g, '');
const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const label = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
let lastAcct = '개인';      // 새 줄의 계좌는 바로 앞에 고른 것을 따라간다

export async function renderJest(d) {
  deps = d;
  if (!month) { try { month = localStorage.getItem('xim-jest-month') || ''; } catch { /* 무시 */ } }
  if (!/^\d{4}-\d{2}$/.test(month)) month = kst().slice(0, 7);
  await load();
}

async function load() {
  const { view, api } = deps;
  data = await api(`/jest?month=${month}`);
  try { localStorage.setItem('xim-jest-month', month); } catch { /* 무시 */ }
  draw(view);
}

function sumOf(side) { return data.items.filter((i) => i.side === side).reduce((n, i) => n + i.amount, 0); }
// 계좌 고르기: 개인 · 기업 · (직접 적은 글) · 기타(직접 적기)
function acctSelect(cur, attrs) {
  const known = ACCTS.some(([v]) => v === cur);
  return `<select class="je-in je-acct" ${attrs} aria-label="계좌">${ACCTS.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}${cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}<option value="${CUSTOM}">기타 (직접 적기)</option></select>`;
}

// 고를 수 있는 항목 = 기본 항목 + 전에 적은 항목 − 목록에서 뺀 항목
const itemNames = () => [...new Set([...ITEMS, ...(data.names || [])])].filter((n) => !(data.hidden || []).includes(n));
// 항목 고르기: 기본 항목 · 전에 직접 적은 항목 · 직접 기입
function itemSelect(cur, attrs) {
  const names = itemNames();
  return `<select class="je-in je-item" ${attrs} aria-label="항목">${cur ? '' : '<option value="" selected>항목 고르기</option>'}${names.map((v) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}${cur && !names.includes(cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}<option value="${CUSTOM}">직접 기입…</option></select>`;
}

function draw(view) {
  const buy = sumOf('buy'), sell = sumOf('sell'), diff = sell - buy;
  const today = kst(), defDay = today.startsWith(month) ? today : `${month}-01`;
  const col = ([side, name]) => {
    const rows = data.items.filter((i) => i.side === side), isBuy = side === 'buy', isSell = !isBuy;
    // 매출은 계좌마다 얼마인지도 보여 준다
    let by = '';
    if (isSell && rows.length) {
      const m = new Map(); rows.forEach((i) => { const k = ACCTS.some(([v]) => v === i.account) ? i.account : '기타'; m.set(k, (m.get(k) || 0) + i.amount); });
      by = `<p class="je-by">${['개인', '기업', '기타'].filter((k) => m.has(k)).map((k) => `<span>${k} <b>${won(m.get(k))}원</b></span>`).join('')}</p>`;
    }
    return `<section class="je-col je-${side}" data-side="${side}">
      <header class="je-h"><b>${name}</b><span>${rows.length}건</span><em>${won(isBuy ? buy : sell)}원</em></header>${by}
      <div class="je-table" role="table" aria-label="${name}">
        <div class="je-row je-head" role="row"><span>날짜</span><span>항목</span>${isSell ? '<span>입금자명</span><span>계좌</span>' : ''}<span class="r">금액</span><span></span></div>
        ${rows.map((i) => `<div class="je-row" role="row" data-id="${i.id}">
          <input class="je-in" type="date" value="${esc(i.day)}" data-f="day" aria-label="날짜">
          ${itemSelect(i.item, 'data-f="item"')}
          ${isSell ? `<input class="je-in" type="text" value="${esc(i.payer || '')}" data-f="payer" maxlength="40" placeholder="입금자" aria-label="입금자명">${acctSelect(i.account || '개인', 'data-f="account"')}` : ''}
          <input class="je-in r" type="text" inputmode="numeric" value="${won(i.amount)}" data-f="amount" aria-label="금액">
          <button type="button" class="je-x" data-del title="지우기" aria-label="${esc(i.item)} 지우기">×</button></div>`).join('')}
        <form class="je-row je-new" data-new>
          <input class="je-in" type="date" name="day" value="${defDay}" min="${month}-01" max="${month}-31" aria-label="날짜" required>
          ${itemSelect('', 'name="item"')}
          ${isSell ? `<input class="je-in" type="text" name="payer" placeholder="입금자명" maxlength="40" aria-label="입금자명">${acctSelect(lastAcct, 'name="account"')}` : ''}
          <input class="je-in r" type="text" name="amount" inputmode="numeric" placeholder="금액" aria-label="금액" required>
          <button type="submit" class="je-add" title="더하기" aria-label="${name} 더하기">+</button>
        </form>
      </div>
    </section>`;
  };
  const yr = month.slice(0, 4), ysum = { buy: 0, sell: 0 };
  data.year.forEach((y) => { ysum.buy += y.buy; ysum.sell += y.sell; });
  view.innerHTML = `
    <div class="bar je-bar"><h2>부기</h2>
      <div class="je-nav"><button type="button" class="btn sm" data-mv="-1" aria-label="앞 달">‹</button>
        <label class="je-month"><b>${label(month)}</b><input type="month" value="${month}" aria-label="달 고르기"></label>
        <button type="button" class="btn sm" data-mv="1" aria-label="다음 달">›</button>
        <button type="button" class="btn sm" data-today>이번 달</button>
        <button type="button" class="btn sm" data-items>항목 관리</button></div></div>
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
    </section>`;
  bind(view);
}

// '기타 (직접 적기)' 를 고르면 그 자리가 글 칸으로 바뀐다. done(값) — 빈 값이면 취소
function askCustom(sel, done, hint = '계좌 이름 (예: 현금 · 신한 1234)', max = 40) {
  const before = sel.dataset.prev ?? ACCTS[0][0];
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

// 항목 관리: 고르는 목록에서 항목을 뺀다(이미 장부에 적은 줄은 그대로 남는다). 사용자 지시 2026-11-21
function itemsDialog() {
  const { api } = deps;
  let changed = false;
  openDialog(`
    <h2>항목 관리</h2>
    <p class="je-dlg-note">× 를 누르면 고르는 목록에서 빠집니다. 이미 장부에 적은 줄은 그대로 남고, 같은 이름을 다시 적으면 목록에 되살아납니다.</p>
    <ul class="je-items" data-list></ul>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`, (dlg) => {
    const list = dlg.querySelector('[data-list]');
    const paint = () => { const names = itemNames(); list.innerHTML = names.map((n) => `<li><span>${esc(n)}</span><button type="button" class="je-x" data-hide="${esc(n)}" title="목록에서 빼기" aria-label="${esc(n)} 목록에서 빼기">×</button></li>`).join('') || '<li class="je-none">목록이 비어 있습니다. 새 줄에서 "직접 기입…" 으로 적으면 여기에 생깁니다.</li>'; };
    paint();
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-hide]'); if (!b) return;
      try { const r = await api('/jest-items', { method: 'POST', data: { hide: b.dataset.hide } }); data.hidden = r.hidden || []; changed = true; paint(); } catch (err) { toast(err.message); }
    });
    dlg.addEventListener('close', () => { if (changed) draw(deps.view); });
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
  view.querySelectorAll('select.je-acct, select.je-item').forEach((sel) => { sel.dataset.prev = sel.value; });
  // 더하기
  view.querySelectorAll('[data-new]').forEach((f) => {
    const acct = f.querySelector('select.je-acct');
    if (acct) acct.addEventListener('change', () => { if (acct.value === CUSTOM) askCustom(acct, (v) => { if (v) lastAcct = v; f.amount.focus(); }); else { acct.dataset.prev = acct.value; lastAcct = acct.value; } });
    const itemSel = f.querySelector('select.je-item');
    itemSel.addEventListener('change', () => { if (itemSel.value === CUSTOM) askCustom(itemSel, () => { (f.payer || f.amount).focus(); }, '항목 이름을 적고 Enter', 120); else { itemSel.dataset.prev = itemSel.value; (f.payer || f.amount).focus(); } });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const side = f.closest('[data-side]').dataset.side;
      const amount = Number(onlyNum(f.amount.value));
      if (!f.item.value.trim() || f.item.value === CUSTOM || !Number.isFinite(amount) || !amount) { toast('항목과 금액을 넣어 주세요.'); return; }
      const account = acct && acct.value !== CUSTOM ? acct.value : '';
      try {
        await api('/jest', { method: 'POST', data: { side, day: f.day.value, item: f.item.value, amount, account, payer: f.payer ? f.payer.value : '' } });
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
      if (f === 'account' || f === 'item') {   // 고르는 칸: '직접 …' 을 고르면 글 칸으로
        el.addEventListener('change', () => { if (el.value === CUSTOM) askCustom(el, (v) => { if (v && v !== it[f]) put(f, v, el); }, f === 'item' ? '항목 이름을 적고 Enter' : undefined, f === 'item' ? 120 : 40); else if (el.value && el.value !== it[f]) put(f, el.value, el); });
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
