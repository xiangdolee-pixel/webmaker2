// xim 계약서 — 홈페이지 제작 계약서 만들기 · 고치기 · 서명 주소 보내기 (사용자 지시 2026-11-12)
//   새 계약서: 갑 이름 · 연락처 · 제작비 · 1년 호스팅(1GB) · 유지보수 관리비 → 만들면 바로 글자 고치기 창이 열린다
//   갑은 sign.plators.com/<5자> 에서 직접 서명 → 완료. 서명이 끝나면 고칠 수 없고 PDF 로 내려받는다.
import { $, esc, toast, openDialog, busy, fmtDate } from './common.js';
import { DEFAULT_BODY, contractHtml, a4Overflow, downloadPdf, won, today, markImage } from './contract-doc.js';

let deps = null; // { view, api, shrinkImage }
let data = { items: [], eul: {}, host: 'sign.plators.com' };

const signUrl = (code) => `https://${data.host}/${code}`;
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');
const comma = (v) => (digits(v) ? Number(digits(v)).toLocaleString('ko-KR') : '');

export async function renderContracts(d) {
  deps = d;
  const { view, api } = deps;
  data = await api('/contracts');
  const n = { all: data.items.length, wait: data.items.filter((c) => c.status !== 'signed').length };
  view.innerHTML = `
    <div class="bar"><h2>계약서 ${n.all}</h2>
      <button class="btn" type="button" data-eul>을 정보 · 도장</button>
      <button class="btn primary" type="button" data-new>+ 새 계약서</button></div>
    <p class="ct-intro">홈페이지 제작 계약서(A4 한 장)를 만들어 <b>서명 주소</b>를 고객에게 보내면, 고객(갑)이 그 주소에서 직접 서명하고 완료합니다. 서명이 끝난 계약서는 고칠 수 없고 PDF 로 내려받을 수 있습니다. 서명 대기 ${n.wait}건.</p>
    ${data.eul.sign ? '' : '<p class="ct-warn">을(박민진) 도장 그림이 아직 없습니다. <b>을 정보 · 도장</b>에서 올려 주세요. 없으면 계약서의 을 (인) 자리가 비어 있습니다.</p>'}
    <div class="rows">${data.items.map(row).join('') || '<div class="card empty">아직 만든 계약서가 없습니다.</div>'}</div>`;
  view.querySelector('[data-new]').onclick = newContract;
  view.querySelector('[data-eul]').onclick = eulDialog;
  view.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => navigator.clipboard.writeText(signUrl(b.dataset.copy)).then(() => toast('서명 주소를 복사했습니다.')); });
  view.querySelectorAll('[data-open]').forEach((r) => { r.onclick = (e) => { if (e.target.closest('a, button')) return; editContract(+r.dataset.open); }; });
  view.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => editContract(+b.dataset.edit); });
  view.querySelectorAll('[data-pdf]').forEach((b) => { b.onclick = (e) => busy(e.currentTarget, null, async () => downloadPdf(await full(+b.dataset.pdf), data.eul), 'PDF 만드는 중…'); });
}

function row(c) {
  const signed = c.status === 'signed';
  const state = signed ? `<span class="badge done">서명 완료</span><small>${fmtDate(c.signed_at)}</small>`
    : c.viewed_at ? `<span class="badge doing">열어 봄</span><small>${fmtDate(c.viewed_at)}</small>` : '<span class="badge new">서명 대기</span>';
  return `<div class="card crow ct-row" data-open="${c.id}" title="눌러서 계약서 보기 · 고치기">
    <div class="cr-name"><b>${esc(c.client_name)}</b>${c.client_phone ? `<span>${esc(c.client_phone)}</span>` : ''}</div>
    <div class="ct-fees"><span>제작비 <b>${won(c.build_fee)}</b></span><span>1년 관리비 <b>${won(c.yearly_fee)}</b></span></div>
    <div class="ct-link"><a href="${esc(signUrl(c.code))}" target="_blank" rel="noopener">${esc(data.host)}/${esc(c.code)}</a><button class="btn sm" type="button" data-copy="${esc(c.code)}">복사</button></div>
    <div class="sr-meta ct-state">${state}</div>
    <div class="sr-act">${signed ? `<button class="btn sm primary" type="button" data-pdf="${c.id}">PDF</button>` : ''}<button class="btn sm" type="button" data-edit="${c.id}">${signed ? '보기' : '보기 · 고치기'}</button></div>
  </div>`;
}

const full = (id) => deps.api(`/contracts/${id}`).then((c) => ({ ...c, host: data.host }));

// ───────── 새 계약서: 금액 · 갑 정보만 받고, 글자는 기본 문구로 만든 뒤 고치기 창에서 ─────────
function newContract() {
  openDialog(`
    <h2>새 계약서</h2>
    <form data-f>
      <div class="row2">
        <label class="field"><span>갑(고객) 이름 <em class="req">*</em></span><input class="input" name="client_name" required maxlength="60" placeholder="업체 또는 대표자 이름"></label>
        <label class="field"><span>갑 연락처</span><input class="input" name="client_phone" inputmode="tel" maxlength="40" placeholder="010-0000-0000"></label>
      </div>
      <div class="row2">
        <label class="field"><span>홈페이지 제작비(원)</span><input class="input ct-money" name="build_fee" inputmode="numeric" placeholder="0"></label>
        <label class="field"><span>1년 호스팅(1GB) · 유지보수 관리비(원)</span><input class="input ct-money" name="yearly_fee" inputmode="numeric" placeholder="0"></label>
      </div>
      <label class="field"><span>계약일</span><input class="input" type="date" name="contract_date" value="${today()}"></label>
      <p class="meta">만들면 계약서 글자를 고칠 수 있는 창이 바로 열리고, 서명 주소(${esc(data.host)}/5자)가 생깁니다.</p>
      <p class="err" data-err></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">만들기</button></div>
    </form>`, (dlg) => {
    moneyInputs(dlg);
    const f = dlg.querySelector('[data-f]');
    f.querySelector('input').focus();
    f.onsubmit = (e) => {
      e.preventDefault();
      busy(f.querySelector('[type=submit]'), f.querySelector('[data-err]'), async () => {
        const v = Object.fromEntries(new FormData(f));
        const r = await deps.api('/contracts', { method: 'POST', data: { ...v, build_fee: digits(v.build_fee), yearly_fee: digits(v.yearly_fee), body: DEFAULT_BODY } });
        dlg.close();
        await renderContracts(deps);
        editContract(r.id, true);
      });
    };
  });
}

function moneyInputs(root) {
  root.querySelectorAll('.ct-money').forEach((i) => {
    i.value = comma(i.value);
    i.addEventListener('input', () => { i.value = comma(i.value); });
  });
}

// ───────── 계약서 화면: 왼쪽에서 고치면 오른쪽 A4 미리보기에 바로 (사용자 지시 2026-11-12 "보면서 수정") ─────────
//   목록 줄을 누르면 열린다. 서명이 끝난 계약서는 미리보기 + PDF 만. 미리보기의 문장을 누르면 왼쪽 문구 칸의 그 줄로 간다.
async function editContract(id, fresh = false) {
  const { view } = deps;
  let c;
  try { c = await full(id); } catch (e) { return toast(e.message); }
  const signed = c.status === 'signed';
  const state = signed ? `<span class="badge done">서명 완료 ${fmtDate(c.signed_at)}</span>` : c.viewed_at ? `<span class="badge doing">고객이 열어 봄 ${fmtDate(c.viewed_at)}</span>` : '<span class="badge new">서명 대기</span>';
  view.innerHTML = `
    <div class="bar ct-ed-bar"><button class="btn sm" type="button" data-back>← 목록</button><h2>${esc(c.client_name)} <small class="ct-dlg-no">No. ${esc(c.code)}</small></h2>${state}
      <span class="ct-share"><a href="${esc(signUrl(c.code))}" target="_blank" rel="noopener">${esc(data.host)}/${esc(c.code)}</a><button class="btn sm" type="button" data-copy>주소 복사</button></span></div>
    <div class="ct-ed${signed ? ' is-signed' : ''}">
      ${signed ? `<div class="card ct-ed-form"><p class="ct-ok">갑이 ${fmtDate(c.signed_at)} 에 서명했습니다. 서명된 계약서는 고칠 수 없습니다.</p>
        <div class="ct-ed-foot"><button class="btn sm danger" type="button" data-del>삭제</button><span class="iq-grow"></span><button class="btn primary" type="button" data-pdf>PDF 내려받기</button></div></div>`
    : `<form class="card ct-ed-form" data-f>
      <div class="row2">
        <label class="field"><span>갑(고객) 이름 <em class="req">*</em></span><input class="input" name="client_name" required maxlength="60" value="${esc(c.client_name)}"></label>
        <label class="field"><span>갑 연락처</span><input class="input" name="client_phone" inputmode="tel" maxlength="40" value="${esc(c.client_phone)}"></label>
      </div>
      <div class="row2">
        <label class="field"><span>홈페이지 제작비(원)</span><input class="input ct-money" name="build_fee" inputmode="numeric" value="${c.build_fee || ''}"></label>
        <label class="field"><span>1년 호스팅(1GB) · 유지보수 관리비(원)</span><input class="input ct-money" name="yearly_fee" inputmode="numeric" value="${c.yearly_fee || ''}"></label>
      </div>
      <label class="field"><span>계약일</span><input class="input" type="date" name="contract_date" value="${esc(c.contract_date)}"></label>
      <label class="field"><span>계약서 문구</span><textarea class="input ct-text" name="body" spellcheck="false">${esc(c.body)}</textarea>
        <small>{갑} {을} {제작비} {연간비} {계약일} 은 위 칸 값으로 바뀝니다. 줄 첫머리 '제1조(…)' 는 조 제목, '①' 은 항으로 들여 씁니다. 오른쪽 문장을 누르면 그 줄로 갑니다.</small></label>
      <p class="ct-fit" data-fit></p>
      <p class="err" data-err></p>
      <div class="ct-ed-foot"><button class="btn sm danger" type="button" data-del>삭제</button><button class="btn sm" type="button" data-reset>기본 문구로</button><span class="iq-grow"></span><span class="ct-dirty" data-dirty></span><button class="btn primary" type="submit">저장</button></div>
    </form>`}
      <div class="ct-ed-prev"><div class="ct-sheet" data-sheet><div class="ct-sheet-in" data-view></div></div></div>
    </div>`;
  const sheet = view.querySelector('[data-sheet]'); const pv = view.querySelector('[data-view]');
  // A4(794px) 문서를 오른쪽 칸 폭에 맞춰 줄여 보여 준다. A4 한 장 끝에 선
  const fitSheet = () => {
    if (!sheet.isConnected) return removeEventListener('resize', fitSheet);
    const k = Math.min(1, sheet.parentElement.clientWidth / 794);
    const h = pv.firstElementChild?.offsetHeight || 1123;
    pv.style.transform = `scale(${k})`;
    sheet.style.height = `${Math.max(1123, h) * k}px`;
    sheet.style.setProperty('--end', `${1123 * k}px`);
    sheet.classList.toggle('is-over', h > 1123);
  };
  addEventListener('resize', fitSheet);
  const back = () => { removeEventListener('resize', fitSheet); renderContracts(deps); };
  const backBtn = view.querySelector('[data-back]');
  backBtn.onclick = () => {
    if (view.querySelector('[data-dirty]')?.textContent && backBtn.dataset.sure !== '1') { backBtn.dataset.sure = '1'; backBtn.textContent = '저장 안 하고 나가기'; return; }
    back();
  };
  view.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(signUrl(c.code)).then(() => toast('서명 주소를 복사했습니다.'));
  const del = view.querySelector('[data-del]');
  del.onclick = (e) => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = signed ? '정말 삭제 (서명본도 사라짐)' : '정말 삭제'; return; }
    busy(e.currentTarget, null, async () => { await deps.api(`/contracts/${id}`, { method: 'DELETE' }); toast('삭제했습니다.'); back(); });
  };
  if (signed) {
    pv.innerHTML = contractHtml(c, eulFor(c), { a4: true });
    requestAnimationFrame(fitSheet);
    document.fonts?.ready.then(fitSheet);
    view.querySelector('[data-pdf]').onclick = (e) => busy(e.currentTarget, null, () => downloadPdf(c, eulFor(c)), 'PDF 만드는 중…');
    return;
  }
  moneyInputs(view);
  const f = view.querySelector('[data-f]');
  const ta = f.elements.body;
  const fit = view.querySelector('[data-fit]'); const dirty = view.querySelector('[data-dirty]');
  const cur = () => { const v = Object.fromEntries(new FormData(f)); return { ...c, ...v, build_fee: +digits(v.build_fee) || 0, yearly_fee: +digits(v.yearly_fee) || 0 }; };
  const draw = () => {
    pv.innerHTML = contractHtml(cur(), data.eul, { a4: true, lines: true });
    fitSheet();
    const over = pv.firstElementChild.offsetHeight / 1123;
    fit.className = `ct-fit ${over > 1 ? 'is-over' : 'is-ok'}`;
    fit.textContent = over > 1 ? `A4 한 장보다 ${Math.round((over - 1) * 100)}% 깁니다. PDF 는 한 장에 들도록 줄여서 만들지만, 문구를 조금 줄이면 더 읽기 좋습니다.` : `A4 한 장에 들어갑니다 (${Math.round(over * 100)}%).`;
  };
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 4}px`; };
  f.addEventListener('input', () => { dirty.textContent = '저장 안 됨'; backBtn.dataset.sure = ''; backBtn.textContent = '← 목록'; autosize(); requestAnimationFrame(draw); });
  // 미리보기 문장을 누르면 문구 칸의 그 줄을 골라 준다
  pv.addEventListener('click', (e) => {
    const p = e.target.closest('[data-l]'); if (!p) return;
    const lines = ta.value.split('\n'); const n = +p.dataset.l;
    if (n >= lines.length) return;
    const start = lines.slice(0, n).reduce((acc, l) => acc + l.length + 1, 0);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, start + lines[n].length);
    const mirror = ta.value.slice(0, start).split('\n').length - 1;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 23;
    const y = ta.getBoundingClientRect().top + scrollY + mirror * lh - innerHeight / 3;
    scrollTo({ top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  view.querySelector('[data-reset]').onclick = () => { ta.value = DEFAULT_BODY; dirty.textContent = '저장 안 됨'; autosize(); draw(); toast('기본 문구로 바꿨습니다. 저장해야 반영됩니다.'); };
  draw(); autosize();
  document.fonts?.ready.then(() => { if (pv.isConnected) { draw(); autosize(); } });
  if (fresh) ta.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), f.querySelector('[data-err]'), async () => {
      const v = Object.fromEntries(new FormData(f));
      await deps.api(`/contracts/${id}`, { method: 'PATCH', data: { ...v, build_fee: digits(v.build_fee), yearly_fee: digits(v.yearly_fee) } });
      c = { ...c, ...v, build_fee: +digits(v.build_fee) || 0, yearly_fee: +digits(v.yearly_fee) || 0 };
      dirty.textContent = '';
      backBtn.dataset.sure = ''; backBtn.textContent = '← 목록';
      toast('저장했습니다.');
    }, '저장 중…');
  };
}

// 서명된 계약서는 서명 때의 을 정보로
const eulFor = (c) => { try { return c.eul_snapshot ? { ...data.eul, ...JSON.parse(c.eul_snapshot) } : data.eul; } catch { return data.eul; } };

// ───────── 을 정보 · 사인 그림 ─────────
function eulDialog() {
  const e = data.eul;
  let sign = e.sign || '';
  openDialog(`
    <h2>을 정보 · 도장</h2>
    <form data-f>
      <div class="row2">
        <label class="field"><span>을 이름</span><input class="input" name="name" maxlength="60" value="${esc(e.name)}"></label>
        <label class="field"><span>을 연락처</span><input class="input" name="phone" maxlength="40" value="${esc(e.phone)}"></label>
      </div>
      <div class="field"><span>도장 · 사인 그림</span>
        <div class="ct-eul-sign" data-prev>${sign ? `<img src="${esc(sign)}" alt="을 사인">` : '<em>아직 없음</em>'}</div>
        <div class="ct-eul-act"><label class="btn sm">그림 고르기<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file></label><button class="btn sm danger" type="button" data-rm${sign ? '' : ' hidden'}>지우기</button></div>
        <small>계약서의 을 이름 옆 (인) 한가운데에 찍힌 것처럼 들어갑니다. 배경이 투명한 PNG 가 가장 깔끔합니다(흰 배경은 자동으로 투명하게). 이미 서명이 끝난 계약서에는 바뀌지 않습니다.</small></div>
      <p class="err" data-err></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    const f = dlg.querySelector('[data-f]');
    const prev = dlg.querySelector('[data-prev]'); const rm = dlg.querySelector('[data-rm]');
    const show = () => { prev.innerHTML = sign ? `<img src="${esc(sign)}" alt="을 사인">` : '<em>아직 없음</em>'; rm.hidden = !sign; };
    dlg.querySelector('[data-file]').onchange = async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try { sign = await markImage(file); show(); } catch (x) { toast(x.message); }
    };
    rm.onclick = () => { sign = ''; show(); };
    f.onsubmit = (ev) => {
      ev.preventDefault();
      busy(f.querySelector('[type=submit]'), f.querySelector('[data-err]'), async () => {
        await deps.api('/contracts/eul', { method: 'PUT', data: { name: f.elements.name.value, phone: f.elements.phone.value, sign } });
        toast('저장했습니다.');
        dlg.close();
        renderContracts(deps);
      });
    };
  });
}
