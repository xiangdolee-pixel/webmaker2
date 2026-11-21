// xim BookKeeping(처음 이름 J-Est.) — 달마다 매입(왼쪽) · 매출(오른쪽)을 날짜 · 항목 · 금액으로 적어 정리한다 (사용자 지시 2026-11-21)
//   한 달씩 본다. 줄을 누르면 그 자리에서 고치고, 맨 아래 줄에 적고 Enter 를 치면 더해진다. 아래에 달 합계와 차액, 그 해의 달별 합계.
import { esc, toast } from './common.js';

let deps = null;            // { view, api }
let month = '';             // 'YYYY-MM'
let data = { items: [], year: [] };
const SIDES = [['buy', '매입'], ['sell', '매출']];
const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const kst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const onlyNum = (v) => String(v || '').replace(/[^0-9-]/g, '');
const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const label = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

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

function draw(view) {
  const buy = sumOf('buy'), sell = sumOf('sell'), diff = sell - buy;
  const today = kst(), defDay = today.startsWith(month) ? today : `${month}-01`;
  const col = ([side, name]) => {
    const rows = data.items.filter((i) => i.side === side);
    return `<section class="je-col je-${side}" data-side="${side}">
      <header class="je-h"><b>${name}</b><span>${rows.length}건</span><em>${won(side === 'buy' ? buy : sell)}원</em></header>
      <div class="je-table" role="table" aria-label="${name}">
        <div class="je-row je-head" role="row"><span>날짜</span><span>항목</span><span class="r">금액</span><span></span></div>
        ${rows.map((i) => `<div class="je-row" role="row" data-id="${i.id}">
          <input class="je-in" type="date" value="${esc(i.day)}" data-f="day" aria-label="날짜">
          <input class="je-in" type="text" value="${esc(i.item)}" data-f="item" maxlength="120" aria-label="항목">
          <input class="je-in r" type="text" inputmode="numeric" value="${won(i.amount)}" data-f="amount" aria-label="금액">
          <button type="button" class="je-x" data-del title="지우기" aria-label="${esc(i.item)} 지우기">×</button></div>`).join('')}
        <form class="je-row je-new" data-new>
          <input class="je-in" type="date" name="day" value="${defDay}" min="${month}-01" max="${month}-31" aria-label="날짜" required>
          <input class="je-in" type="text" name="item" placeholder="항목을 적고 Enter" maxlength="120" aria-label="항목" required>
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
        <button type="button" class="btn sm" data-today>이번 달</button></div></div>
    <div class="je-sum">
      <div><span>매입</span><b>${won(buy)}원</b></div><i>−</i>
      <div><span>매출</span><b>${won(sell)}원</b></div><i>=</i>
      <div class="je-diff ${diff < 0 ? 'minus' : 'plus'}"><span>차액 (매출 − 매입)</span><b>${diff < 0 ? '−' : ''}${won(Math.abs(diff))}원</b></div>
    </div>
    <div class="je-cols">${SIDES.map(col).join('')}</div>
    <section class="je-year">
      <h3>${yr}년 달별 합계</h3>
      <div class="je-ytable">
        <div class="je-yrow je-head"><span>달</span><span class="r">매입</span><span class="r">매출</span><span class="r">차액</span></div>
        ${data.year.map((y) => `<button type="button" class="je-yrow${y.month === month ? ' on' : ''}" data-go="${y.month}"><span>${Number(y.month.slice(5))}월</span><span class="r">${won(y.buy)}</span><span class="r">${won(y.sell)}</span><span class="r ${y.sell - y.buy < 0 ? 'minus' : ''}">${y.sell - y.buy < 0 ? '−' : ''}${won(Math.abs(y.sell - y.buy))}</span></button>`).join('') || '<p class="je-none">아직 적은 내용이 없습니다.</p>'}
        ${data.year.length ? `<div class="je-yrow je-total"><span>합계</span><span class="r">${won(ysum.buy)}</span><span class="r">${won(ysum.sell)}</span><span class="r ${ysum.sell - ysum.buy < 0 ? 'minus' : ''}">${ysum.sell - ysum.buy < 0 ? '−' : ''}${won(Math.abs(ysum.sell - ysum.buy))}</span></div>` : ''}
      </div>
    </section>`;
  bind(view);
}

function bind(view) {
  const { api } = deps;
  const go = (m) => { month = m; load().catch((e) => toast(e.message)); };
  view.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => go(shift(month, +b.dataset.mv)); });
  view.querySelector('[data-today]').onclick = () => go(kst().slice(0, 7));
  view.querySelector('.je-month input').onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) go(e.target.value); };
  view.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  // 금액 칸: 치는 대로 쉼표
  view.querySelectorAll('[data-f="amount"], [name="amount"]').forEach((el) => el.addEventListener('input', () => { const n = onlyNum(el.value); el.value = n && n !== '-' ? won(n) : n; }));
  // 더하기
  view.querySelectorAll('[data-new]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const side = f.closest('[data-side]').dataset.side;
    const amount = Number(onlyNum(f.amount.value));
    if (!f.item.value.trim() || !Number.isFinite(amount) || !amount) { toast('항목과 금액을 넣어 주세요.'); return; }
    try {
      await api('/jest', { method: 'POST', data: { side, day: f.day.value, item: f.item.value, amount } });
      const day = f.day.value; if (day.slice(0, 7) !== month) month = day.slice(0, 7);
      await load();
      const again = deps.view.querySelector(`[data-side="${side}"] [data-new]`); if (again) { again.day.value = day; again.item.focus(); }   // 이어서 적기 쉽게
    } catch (err) { toast(err.message); }
  }));
  // 고치기: 칸을 벗어나거나 Enter 를 치면 저장
  view.querySelectorAll('.je-row[data-id]').forEach((row) => {
    const id = +row.dataset.id, it = data.items.find((x) => x.id === id);
    row.querySelectorAll('[data-f]').forEach((el) => {
      const save = async () => {
        const f = el.dataset.f, v = f === 'amount' ? Number(onlyNum(el.value)) : el.value.trim();
        if (v === it[f]) return;
        if ((f === 'item' && !v) || (f === 'amount' && (!Number.isFinite(v) || !v)) || (f === 'day' && !v)) { el.value = f === 'amount' ? won(it.amount) : it[f]; return; }
        try { await api(`/jest/${id}`, { method: 'PUT', data: { ...it, [f]: v } }); await load(); } catch (err) { toast(err.message); el.value = f === 'amount' ? won(it.amount) : it[f]; }
      };
      el.addEventListener('change', save);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.value = el.dataset.f === 'amount' ? won(it.amount) : it[el.dataset.f]; el.blur(); } });
    });
    row.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`'${it.item}' ${won(it.amount)}원을 지울까요?`)) return;
      try { await api(`/jest/${id}`, { method: 'DELETE' }); await load(); } catch (err) { toast(err.message); }
    };
  });
}
