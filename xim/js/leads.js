// xim 상담연락 — 지도에 나온 업체와, 그 업체의 홈페이지 · 블로그 · 인스타그램에 공개된 휴대폰 번호 (사용자 지시 2026-11-26)
//   한 줄 = 업체 하나(이름 · 휴대폰 · 홈 / 블 / 인스타). 누르면 나머지(주소 · 어디까지 확인했는지 · 메모 · 단추)가 펼쳐진다.
//   주소를 붙여 넣으면 xim 이 그 페이지를 열어 010 번호를 찾아 쌓는다. 같은 번호는 한 번만.
import { $, esc, toast, busy, fmtDate, pillTabs } from './common.js';

let deps = null;   // { view, api }
let filter = '';   // '' 전체 · 'has' 번호 있음 · 'none' 번호 없음 · 'done' 연락함
let q = '';
let sido = '';     // '' 모든 시 · 도 · '서울시'
let gu = '';       // '' 모든 구 · '노원구'
let items = [];
let scopes = [];
let sms = '';      // 복사해 쓰는 문자 내용(xim settings.lead_sms — 리포에는 두지 않는다)
let lastScan = null;
const open = new Set();   // 펼쳐 둔 줄(id)

const SRC = { map: '지도 업체 정보', place: '네이버 플레이스', homepage: '홈페이지', blog: '블로그', instagram: '인스타그램', manual: '직접 넣음' };
// 지역 = 주소의 첫 두 마디(시 · 도 + 구 · 시 · 군). 모을 때 따로 적지 않아도 주소만 있으면 "서울시 › 노원구" 로 나뉜다
const SIDO = { 서울: '서울시', 부산: '부산시', 대구: '대구시', 인천: '인천시', 광주: '광주시', 대전: '대전시', 울산: '울산시', 세종: '세종시', 경기: '경기도', 강원: '강원도', 충북: '충청북도', 충남: '충청남도', 전북: '전북', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주도' };
const words = (it) => (it.address || '').trim().split(/\s+/);
const sidoOf = (it) => { const w = words(it)[0]; return w ? (SIDO[w] || w) : '지역 모름'; };
const guOf = (it) => words(it)[1] || '';
const regionOf = (it) => `${sidoOf(it)} ${guOf(it)}`.trim();
const inRegion = (it) => (!sido || sidoOf(it) === sido) && (!gu || guOf(it) === gu);
// 어디까지 알아봤나(lead_scopes.area 예: "노원구")는 구를 고르면 그 구 것만
const scopeIn = (sc) => !gu || sc.area.includes(gu) || gu.includes(sc.area);
const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'ko'));
const count = (fn) => items.filter(fn).length;
// pillTabs 는 상자에 click 을 붙이므로, 다시 그릴 때는 빈 새 상자로 바꿔 끼운다
const fresh = (sel) => { const o = $(sel); const n = o.cloneNode(false); o.replaceWith(n); return n; };
const ext = (url, label, cls = '') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

export async function renderLeads(d) {
  deps = d;
  const { view, api } = deps;
  ({ items, scopes = [], sms = '' } = await api('/leads'));
  if (sido && !items.some((i) => sidoOf(i) === sido)) { sido = ''; gu = ''; }
  if (gu && !items.some(inRegion)) gu = '';
  view.innerHTML = `
    <div class="bar"><h2>상담연락 <span id="ld-count"></span></h2>
      <input class="input search-q ld-q" id="ld-q" type="search" placeholder="이름 · 번호 · 주소 찾기" value="${esc(q)}" aria-label="찾기">
      <button type="button" class="btn sm" id="ld-csv">엑셀(CSV) 받기</button></div>
    <div id="ld-scopes"></div>
    <details class="card ld-scope ld-sms"><summary>보낼 문자 <small>눌러서 내용 보기 · 고치기</small><button type="button" class="btn sm primary" id="ld-sms-copy">문자 복사</button></summary>
      <div class="ld-form"><textarea class="input" id="ld-sms" rows="14" maxlength="4000" placeholder="업체에 보낼 문자 내용" aria-label="보낼 문자">${esc(sms)}</textarea>
        <div class="ld-form-foot ld-sms-foot"><button type="button" class="btn sm" id="ld-sms-save">저장</button></div></div></details>
    <details class="card ld-scope"><summary>주소를 넣어 더 모으기 <small>홈페이지 · 블로그 · 인스타그램 · 네이버 지도(플레이스) 주소</small></summary>
      <form class="ld-form" id="ld-form">
        <label class="field"><span>주소 붙여 넣기 <small>한 줄에 하나 · 한 번에 15개까지</small></span>
          <textarea class="input" name="text" rows="3" placeholder="https://blog.naver.com/아이디&#10;https://www.instagram.com/계정/"></textarea></label>
        <div class="ld-form-foot">
          <label class="field ld-kw"><span>찾은 말</span><input class="input" name="keyword" value="상담" maxlength="40"></label>
          <button type="submit" class="btn primary">휴대폰 번호 수집</button>
        </div>
        <p class="ld-err" id="ld-err" role="alert"></p>
        <div id="ld-scan"></div>
      </form></details>
    <div class="ld-region"><span class="ld-region-label">지역</span>
      <nav class="tabs iq-tabs" id="ld-sido" aria-label="시 · 도"></nav><span class="ld-region-sep" aria-hidden="true">›</span><nav class="tabs iq-tabs" id="ld-gu" aria-label="구"></nav></div>
    <nav class="tabs iq-tabs ld-tabs" id="ld-tabs" aria-label="보기"></nav>
    <div id="ld-body"></div>`;
  pillTabs($('#ld-sido'), [['', `전체 ${items.length}`], ...uniq(items.map(sidoOf)).map((v) => [v, `${v} ${count((i) => sidoOf(i) === v)}`])], sido, (v) => { sido = v; gu = ''; paintGu(); paintCounts(); renderList(); });
  paintGu();
  paintCounts();
  $('#ld-q').oninput = (e) => { q = e.target.value; renderList(); };
  $('#ld-csv').onclick = downloadCsv;
  // 보낼 문자: 접혀 있어도 "문자 복사"는 바로 된다(입력칸에 있는 지금 내용 그대로)
  $('#ld-sms-copy').onclick = (e) => { e.preventDefault(); const t = $('#ld-sms').value; if (!t.trim()) return toast('문자 내용이 비어 있습니다.'); navigator.clipboard.writeText(t).then(() => toast('문자를 복사했습니다.')); };
  $('#ld-sms-save').onclick = (e) => busy(e.currentTarget, null, async () => { sms = $('#ld-sms').value; await api('/leads/sms', { method: 'PUT', data: { text: sms } }); toast('문자를 저장했습니다.'); });
  $('#ld-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    busy(f.querySelector('[type=submit]'), $('#ld-err'), async () => {
      lastScan = await api('/leads/scan', { method: 'POST', data: { text: f.text.value, keyword: f.keyword.value } });
      toast(lastScan.added ? `새 번호 ${lastScan.added}개를 넣었습니다.` : '새로 찾은 번호가 없습니다.');
      await renderLeads(deps);
      $('#ld-form').closest('details').open = true;
    }, '페이지를 여는 중…');
  };
  renderScan();
  renderList();
}

// 구 칸: 고른 시 · 도 안의 구만(시 · 도가 "전체"면 모든 구)
function paintGu() {
  const inSido = (i) => !sido || sidoOf(i) === sido;
  const gus = uniq(items.filter(inSido).map(guOf).filter(Boolean));
  pillTabs(fresh('#ld-gu'), [['', `전체 ${count(inSido)}`], ...gus.map((v) => [v, `${v} ${count((i) => inSido(i) && guOf(i) === v)}`])], gu, (v) => { gu = v; paintCounts(); renderList(); });
}

// 고른 지역에 맞춰 제목 숫자 · 어디까지 알아봤나 · 보기 탭 숫자
function paintCounts() {
  const mine = items.filter(inRegion);
  const has = mine.filter((i) => i.phone).length;
  $('#ld-count').textContent = mine.length;
  const scs = scopes.filter(scopeIn);
  $('#ld-scopes').innerHTML = scs.length ? `<details class="card ld-scope"><summary>어디까지 알아봤나 <small>${scs.map((s) => `${esc(s.area)} ${count((i) => i.area === s.area && inRegion(i))}곳`).join(' · ')}</small></summary>
      ${scs.map((s) => { const m = items.filter((i) => i.area === s.area && inRegion(i)); return `<div class="ld-scope-item"><b>${esc(s.area)}</b> <span class="badge idle">${esc(s.source)}</span>
        <span class="badge done">휴대폰 있음 ${m.filter((i) => i.phone).length}</span> <span class="badge idle">없음 ${m.filter((i) => !i.phone).length}</span>
        <p>${esc(s.note)}</p><small>${fmtDate(s.checked_at)} 확인</small></div>`; }).join('')}</details>` : '';
  pillTabs(fresh('#ld-tabs'), [['', `전체 ${mine.length}`], ['has', `번호 있음 ${has}`], ['none', `번호 없음 ${mine.length - has}`], ['done', `연락함 ${mine.filter((i) => i.done).length}`]], filter, (v) => { filter = v; renderList(); });
}

function renderScan() {
  const box = $('#ld-scan'); if (!box || !lastScan) return;
  box.innerHTML = `<ul class="ld-scan">${lastScan.results.map((r) => `
    <li><b>${esc(r.name || r.url)}</b>
      <span class="badge ${r.added ? 'done' : 'idle'}">${r.found ? `번호 ${r.found}개 · 새로 ${r.added}` : '번호 없음'}</span>
      ${r.errors.length ? `<small>${esc(r.errors.join(' · '))}</small>` : ''}</li>`).join('')}</ul>`;
}

const shown = () => {
  const k = q.trim().toLowerCase().replace(/-/g, '');
  return items.filter((it) => inRegion(it) && (filter === 'has' ? it.phone : filter === 'none' ? !it.phone : filter === 'done' ? it.done : true)
    && (!k || `${it.name} ${it.phone.replace(/-/g, '')} ${it.tel.replace(/-/g, '')} ${it.address} ${it.category} ${it.memo}`.toLowerCase().includes(k)));
};

function renderList() {
  const box = $('#ld-body'); if (!box) return;
  const list = shown();
  // 같은 지역끼리 붙어 나오게(지역 안에서는 원래 순서 그대로) — 줄마다 업체명 앞에 지역(서울시 노원구)
  list.sort((a, b) => regionOf(a).localeCompare(regionOf(b), 'ko'));
  box.innerHTML = list.length ? `<ul class="ld-list card">${list.map((it) => `
      <li class="ld-item${it.done ? ' is-done' : ''}${open.has(it.id) ? ' is-open' : ''}" data-id="${it.id}">
        <div class="ld-row">
          <button type="button" class="ld-name" data-toggle aria-expanded="${open.has(it.id)}"><span class="ld-area">${esc(regionOf(it))}</span><b>${esc(it.name)}</b>${it.done ? '<span class="badge done">연락함</span>' : ''}</button>
          ${it.phone ? `<a class="ld-phone" href="tel:${esc(it.phone)}">${esc(it.phone)}</a>` : '<span class="ld-phone none">번호 없음</span>'}
          <span class="ld-links">${it.homepage ? ext(it.homepage, '홈') : ''}${it.blog ? ext(it.blog, '블') : ''}${it.instagram ? ext(it.instagram, '인스타') : ''}</span>
          <button type="button" class="ld-more" data-toggle aria-label="자세히"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        </div>
        ${open.has(it.id) ? detail(it) : ''}
      </li>`).join('')}</ul>`
    : `<section class="card item"><p class="meta">${items.length ? '이 보기에는 없습니다.' : '아직 모은 곳이 없습니다.'}</p></section>`;
  box.querySelectorAll('.ld-item').forEach((li) => {
    const it = items.find((x) => x.id === +li.dataset.id);
    li.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = () => { if (open.has(it.id)) open.delete(it.id); else open.add(it.id); renderList(); }; });
    if (open.has(it.id)) bindDetail(li, it);
  });
}

function detail(it) {
  const more = it.links ? it.links.split(' ').filter(Boolean) : [];
  return `<div class="ld-detail">
      <dl class="ld-dl">
        ${it.category ? `<div><dt>분류</dt><dd>${esc(it.category)}</dd></div>` : ''}
        ${it.address ? `<div><dt>주소</dt><dd>${esc(it.address)}</dd></div>` : ''}
        ${it.tel ? `<div><dt>대표 전화</dt><dd>${esc(it.tel)}</dd></div>` : ''}
        ${it.phone ? `<div><dt>번호 나온 곳</dt><dd>${it.source_url ? ext(it.source_url, SRC[it.source] || it.source) : esc(SRC[it.source] || it.source)}</dd></div>` : ''}
        <div><dt>링크</dt><dd class="ld-urls">${it.place_url ? ext(it.place_url, '지도') : ''}${it.homepage ? ext(it.homepage, '홈페이지') : ''}${it.blog ? ext(it.blog, '블로그') : ''}${it.instagram ? ext(it.instagram, '인스타그램') : ''}${more.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { /* 그대로 */ } return ext(u, h); }).join('')}</dd></div>
        ${it.checked ? `<div><dt>확인한 것</dt><dd>${esc(it.checked)}</dd></div>` : ''}
        <div><dt>모은 때</dt><dd>${fmtDate(it.created_at)}${it.area ? ` · ${esc(it.area)}` : ''}</dd></div>
      </dl>
      <input class="input ld-memo" type="text" value="${esc(it.memo)}" placeholder="메모" maxlength="500" aria-label="메모">
      <div class="ld-act">
        ${it.phone ? '<button type="button" class="btn sm" data-copy>번호 복사</button>' : ''}
        <button type="button" class="btn sm${it.done ? '' : ' primary'}" data-done>${it.done ? '연락 전으로' : '연락함'}</button>
        <button type="button" class="btn sm danger" data-del>삭제</button>
      </div>
    </div>`;
}

function bindDetail(li, it) {
  const { api } = deps;
  const save = (data) => api(`/leads/${it.id}`, { method: 'PATCH', data: { done: !!it.done, memo: it.memo, ...data } });
  const copy = li.querySelector('[data-copy]');
  if (copy) copy.onclick = () => navigator.clipboard.writeText(it.phone).then(() => toast('번호를 복사했습니다.'));
  li.querySelector('[data-done]').onclick = (e) => busy(e.currentTarget, null, async () => { await save({ done: !it.done }); await renderLeads(deps); });
  li.querySelector('.ld-memo').onchange = async (e) => { try { await save({ memo: e.target.value }); it.memo = e.target.value; toast('메모를 저장했습니다.'); } catch (err) { toast(err.message); } };
  const del = li.querySelector('[data-del]');
  del.onclick = (e) => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 삭제'; return; }
    busy(e.currentTarget, null, async () => { await api(`/leads/${it.id}`, { method: 'DELETE' }); open.delete(it.id); await renderLeads(deps); });
  };
}

function downloadCsv() {
  const list = shown();
  if (!list.length) return toast('받을 것이 없습니다.');
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['이름', '분류', '휴대폰', '대표 전화', '주소', '홈페이지', '블로그', '인스타그램', '지도', '번호 나온 곳', '확인한 것', '메모', '연락함', '지역', '영역'],
    ...list.map((it) => [it.name, it.category, it.phone, it.tel, it.address, it.homepage, it.blog, it.instagram, it.place_url, it.source_url, it.checked, it.memo, it.done ? '예' : '', regionOf(it), it.area])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `상담연락${gu ? `-${gu}` : sido ? `-${sido}` : ''}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
