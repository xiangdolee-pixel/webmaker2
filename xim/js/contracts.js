// xim 계약서 — 홈페이지 제작 계약서 만들기 · 고치기 · 서명 주소 보내기 (사용자 지시 2026-11-12)
//   새 계약서: 갑 이름 · 연락처 · 제작비 · 1년 호스팅(1GB) · 유지보수 관리비 → 만들면 바로 글자 고치기 창이 열린다
//   갑은 sign.plators.com/<5자> 에서 직접 서명 → 완료. 서명이 끝나면 고칠 수 없고 PDF 로 내려받는다.
import { $, esc, toast, openDialog, busy, fmtDate } from './common.js';
import { DEFAULT_BODY, contractHtml, a4Overflow, downloadPdf, won, today } from './contract-doc.js';

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
      <button class="btn" type="button" data-eul>을 정보 · 사인</button>
      <button class="btn primary" type="button" data-new>+ 새 계약서</button></div>
    <p class="ct-intro">홈페이지 제작 계약서(A4 한 장)를 만들어 <b>서명 주소</b>를 고객에게 보내면, 고객(갑)이 그 주소에서 직접 서명하고 완료합니다. 서명이 끝난 계약서는 고칠 수 없고 PDF 로 내려받을 수 있습니다. 서명 대기 ${n.wait}건.</p>
    ${data.eul.sign ? '' : '<p class="ct-warn">을(박민진) 사인 그림이 아직 없습니다. <b>을 정보 · 사인</b>에서 올려 주세요. 없으면 계약서의 을 서명 칸이 비어 있습니다.</p>'}
    <div class="rows">${data.items.map(row).join('') || '<div class="card empty">아직 만든 계약서가 없습니다.</div>'}</div>`;
  view.querySelector('[data-new]').onclick = newContract;
  view.querySelector('[data-eul]').onclick = eulDialog;
  view.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => navigator.clipboard.writeText(signUrl(b.dataset.copy)).then(() => toast('서명 주소를 복사했습니다.')); });
  view.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => editContract(+b.dataset.edit); });
  view.querySelectorAll('[data-pdf]').forEach((b) => { b.onclick = (e) => busy(e.currentTarget, null, async () => downloadPdf(await full(+b.dataset.pdf), data.eul), 'PDF 만드는 중…'); });
}

function row(c) {
  const signed = c.status === 'signed';
  const state = signed ? `<span class="badge done">서명 완료</span><small>${fmtDate(c.signed_at)}</small>`
    : c.viewed_at ? `<span class="badge doing">열어 봄</span><small>${fmtDate(c.viewed_at)}</small>` : '<span class="badge new">서명 대기</span>';
  return `<div class="card crow ct-row">
    <div class="cr-name"><b>${esc(c.client_name)}</b>${c.client_phone ? `<span>${esc(c.client_phone)}</span>` : ''}</div>
    <div class="ct-fees"><span>제작비 <b>${won(c.build_fee)}</b></span><span>1년 관리비 <b>${won(c.yearly_fee)}</b></span></div>
    <div class="ct-link"><a href="${esc(signUrl(c.code))}" target="_blank" rel="noopener">${esc(data.host)}/${esc(c.code)}</a><button class="btn sm" type="button" data-copy="${esc(c.code)}">복사</button></div>
    <div class="sr-meta ct-state">${state}</div>
    <div class="sr-act">${signed ? `<button class="btn sm primary" type="button" data-pdf="${c.id}">PDF</button>` : ''}<button class="btn sm" type="button" data-edit="${c.id}">${signed ? '보기' : '고치기'}</button></div>
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

// ───────── 고치기(서명 전) · 보기(서명 뒤) ─────────
async function editContract(id, fresh = false) {
  let c;
  try { c = await full(id); } catch (e) { return toast(e.message); }
  const signed = c.status === 'signed';
  const dlg = openDialog(`
    <h2>${signed ? '계약서 보기' : fresh ? '계약서 글자 고치기' : '계약서 고치기'} <small class="ct-dlg-no">No. ${esc(c.code)}</small></h2>
    <div class="ct-share">
      <a href="${esc(signUrl(c.code))}" target="_blank" rel="noopener">${esc(signUrl(c.code))}</a>
      <button class="btn sm" type="button" data-copy>주소 복사</button>
    </div>
    ${signed ? `<p class="ct-ok">갑이 ${fmtDate(c.signed_at)} 에 서명했습니다. 서명된 계약서는 고칠 수 없습니다.</p>
      <div class="ct-view">${contractHtml(c, eulFor(c))}</div>
      <div class="dlg-foot"><button class="btn sm danger" type="button" data-del>삭제</button><span class="iq-grow"></span><button class="btn sm" type="button" data-close>닫기</button><button class="btn sm primary" type="button" data-pdf>PDF 내려받기</button></div>`
    : `<form data-f>
      <div class="row2">
        <label class="field"><span>갑(고객) 이름 <em class="req">*</em></span><input class="input" name="client_name" required maxlength="60" value="${esc(c.client_name)}"></label>
        <label class="field"><span>갑 연락처</span><input class="input" name="client_phone" inputmode="tel" maxlength="40" value="${esc(c.client_phone)}"></label>
      </div>
      <div class="row2">
        <label class="field"><span>홈페이지 제작비(원)</span><input class="input ct-money" name="build_fee" inputmode="numeric" value="${c.build_fee || ''}"></label>
        <label class="field"><span>1년 호스팅(1GB) · 유지보수 관리비(원)</span><input class="input ct-money" name="yearly_fee" inputmode="numeric" value="${c.yearly_fee || ''}"></label>
      </div>
      <label class="field"><span>계약일</span><input class="input" type="date" name="contract_date" value="${esc(c.contract_date)}"></label>
      <label class="field"><span>계약서 글자</span><textarea class="input ct-text" name="body" rows="16">${esc(c.body)}</textarea>
        <small>{갑} {을} {제작비} {연간비} {계약일} 은 위 칸 값으로 바뀝니다. 줄 첫머리 '제1조(…)' 는 조 제목, '①' 은 항으로 들여 씁니다.</small></label>
      <p class="ct-fit" data-fit></p>
      <details class="ct-preview"><summary>미리보기</summary><div class="ct-view" data-view></div></details>
      <p class="err" data-err></p>
      <div class="dlg-foot"><button class="btn sm danger" type="button" data-del>삭제</button><button class="btn sm" type="button" data-reset>기본 문구로</button><span class="iq-grow"></span><button class="btn sm" type="button" data-close>닫기</button><button class="btn sm primary" type="submit">저장</button></div>
    </form>`}`, (d) => {
    d.classList.add('ct-dialog');
    d.addEventListener('close', () => renderContracts(deps));
  });
  dlg.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(signUrl(c.code)).then(() => toast('서명 주소를 복사했습니다.'));
  const del = dlg.querySelector('[data-del]');
  del.onclick = (e) => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = signed ? '정말 삭제 (서명본도 사라짐)' : '정말 삭제'; return; }
    busy(e.currentTarget, null, async () => { await deps.api(`/contracts/${id}`, { method: 'DELETE' }); toast('삭제했습니다.'); dlg.close(); });
  };
  if (signed) {
    dlg.querySelector('[data-pdf]').onclick = (e) => busy(e.currentTarget, null, () => downloadPdf(c, eulFor(c)), 'PDF 만드는 중…');
    return;
  }
  moneyInputs(dlg);
  const f = dlg.querySelector('[data-f]');
  const cur = () => { const v = Object.fromEntries(new FormData(f)); return { ...c, ...v, build_fee: +digits(v.build_fee) || 0, yearly_fee: +digits(v.yearly_fee) || 0 }; };
  const fit = dlg.querySelector('[data-fit]'); const view = dlg.querySelector('[data-view]');
  let t;
  const check = () => {
    const x = cur();
    const over = a4Overflow(x, data.eul);
    fit.className = `ct-fit ${over > 1 ? 'is-over' : 'is-ok'}`;
    fit.textContent = over > 1 ? `A4 한 장보다 ${Math.round((over - 1) * 100)}% 깁니다. PDF 는 한 장에 들도록 줄여서 만들지만, 글자를 조금 줄이면 더 읽기 좋습니다.` : `A4 한 장에 들어갑니다 (${Math.round(over * 100)}%).`;
    if (view.closest('details').open) view.innerHTML = contractHtml(x, data.eul);
  };
  f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(check, 250); });
  dlg.querySelector('.ct-preview').addEventListener('toggle', check);
  check();
  dlg.querySelector('[data-reset]').onclick = () => { f.elements.body.value = DEFAULT_BODY; check(); toast('기본 문구로 바꿨습니다. 저장해야 반영됩니다.'); };
  if (fresh) f.elements.body.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), f.querySelector('[data-err]'), async () => {
      const v = Object.fromEntries(new FormData(f));
      await deps.api(`/contracts/${id}`, { method: 'PATCH', data: { ...v, build_fee: digits(v.build_fee), yearly_fee: digits(v.yearly_fee) } });
      toast('저장했습니다.');
      dlg.close();
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
    <h2>을 정보 · 사인</h2>
    <form data-f>
      <div class="row2">
        <label class="field"><span>을 이름</span><input class="input" name="name" maxlength="60" value="${esc(e.name)}"></label>
        <label class="field"><span>을 연락처</span><input class="input" name="phone" maxlength="40" value="${esc(e.phone)}"></label>
      </div>
      <div class="field"><span>사인 그림</span>
        <div class="ct-eul-sign" data-prev>${sign ? `<img src="${esc(sign)}" alt="을 사인">` : '<em>아직 없음</em>'}</div>
        <div class="ct-eul-act"><label class="btn sm">그림 고르기<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file></label><button class="btn sm danger" type="button" data-rm${sign ? '' : ' hidden'}>사인 지우기</button></div>
        <small>배경이 투명한 PNG 가 가장 깔끔합니다(흰 배경 그림은 흰 부분을 자동으로 투명하게 바꿉니다). 이미 서명이 끝난 계약서에는 바뀌지 않습니다.</small></div>
      <p class="err" data-err></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    const f = dlg.querySelector('[data-f]');
    const prev = dlg.querySelector('[data-prev]'); const rm = dlg.querySelector('[data-rm]');
    const show = () => { prev.innerHTML = sign ? `<img src="${esc(sign)}" alt="을 사인">` : '<em>아직 없음</em>'; rm.hidden = !sign; };
    dlg.querySelector('[data-file]').onchange = async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try { sign = await signImage(file); show(); } catch (x) { toast(x.message); }
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

// 사인 그림: 가로 600px 안으로 줄이고, 흰 바탕은 투명하게, 글씨 둘레만 남게 잘라 PNG data URL 로
async function signImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('이 그림은 읽을 수 없어요. png · jpg 로 올려 주세요.'); }
  const k = Math.min(1, 1200 / bmp.width);
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const img = ctx.getImageData(0, 0, cv.width, cv.height); const px = img.data;
  let x0 = cv.width; let y0 = cv.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      const light = Math.min(px[i], px[i + 1], px[i + 2]);
      if (light > 235) px[i + 3] = 0;                                         // 흰 바탕 → 투명
      else if (light > 200) px[i + 3] = Math.round(px[i + 3] * (235 - light) / 35);   // 가장자리 부드럽게
      if (px[i + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) throw new Error('그림에서 사인을 찾지 못했습니다.');
  ctx.putImageData(img, 0, 0);
  const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(cv.width - 1, x1 + m); y1 = Math.min(cv.height - 1, y1 + m);
  const w = x1 - x0 + 1; const h = y1 - y0 + 1; const s = Math.min(1, 600 / w);
  const out = document.createElement('canvas');
  out.width = Math.round(w * s); out.height = Math.round(h * s);
  out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, out.width, out.height);
  const url = out.toDataURL('image/png');
  if (url.length > 380 * 1024) throw new Error('사인 그림이 너무 큽니다. 더 작은 그림으로 올려 주세요.');
  return url;
}
