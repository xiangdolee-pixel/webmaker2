// xim 상담연락 — 공개된 페이지(네이버 플레이스 · 홈페이지 · 블로그 · 인스타그램)에서 찾은 휴대폰 번호 (사용자 지시 2026-11-26)
//   주소를 붙여 넣으면 xim 이 그 페이지를 열어 010 번호를 찾아 쌓는다. 같은 번호는 한 번만.
import { $, esc, toast, busy, fmtDate, pillTabs } from './common.js';

let deps = null;   // { view, api }
let filter = '';   // '' 전체 · 'open' 연락 전 · 'done' 연락함
let q = '';
let items = [];
let lastScan = null;

const SRC = { place: '네이버 플레이스', homepage: '홈페이지', blog: '블로그', instagram: '인스타그램', manual: '직접 넣음' };

export async function renderLeads(d) {
  deps = d;
  const { view, api } = deps;
  items = (await api('/leads')).items;
  const cnt = { all: items.length, open: items.filter((i) => !i.done).length };
  view.innerHTML = `
    <div class="bar"><h2>상담연락 ${cnt.all}</h2>
      <input class="input search-q ld-q" id="ld-q" type="search" placeholder="이름 · 번호 · 주소 찾기" value="${esc(q)}" aria-label="찾기">
      <button type="button" class="btn sm" id="ld-csv">엑셀(CSV) 받기</button></div>
    <p class="meta mon-rule ld-rule">네이버 지도 · 홈페이지 · 블로그 · 인스타그램에 <b>공개된 휴대폰 번호</b>를 모아 두는 곳입니다. 같은 번호는 한 번만 쌓입니다.</p>
    <form class="card ld-form" id="ld-form">
      <label class="field"><span>주소 붙여 넣기 <small>한 줄에 하나 · 한 번에 15개까지 — 네이버 지도(플레이스) 주소를 넣으면 거기 걸린 홈페이지 · 블로그 · 인스타그램까지 같이 봅니다</small></span>
        <textarea class="input" name="text" rows="4" placeholder="https://map.naver.com/p/entry/place/1234567890&#10;https://blog.naver.com/아이디&#10;https://www.instagram.com/계정/"></textarea></label>
      <div class="ld-form-foot">
        <label class="field ld-kw"><span>찾은 말</span><input class="input" name="keyword" value="상담" maxlength="40"></label>
        <button type="submit" class="btn primary">휴대폰 번호 수집</button>
      </div>
      <p class="ld-err" id="ld-err" role="alert"></p>
      <div id="ld-scan"></div>
    </form>
    <nav class="tabs iq-tabs" id="ld-tabs" aria-label="보기"></nav>
    <div id="ld-body"></div>`;
  pillTabs($('#ld-tabs'), [['', `전체 ${cnt.all}`], ['open', `연락 전 ${cnt.open}`], ['done', `연락함 ${cnt.all - cnt.open}`]], filter, (v) => { filter = v; renderList(); });
  $('#ld-q').oninput = (e) => { q = e.target.value; renderList(); };
  $('#ld-csv').onclick = downloadCsv;
  $('#ld-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    busy(f.querySelector('[type=submit]'), $('#ld-err'), async () => {
      lastScan = await api('/leads/scan', { method: 'POST', data: { text: f.text.value, keyword: f.keyword.value } });
      toast(lastScan.added ? `새 번호 ${lastScan.added}개를 넣었습니다.` : '새로 찾은 번호가 없습니다.');
      await renderLeads(deps);
    }, '페이지를 여는 중…');
  };
  renderScan();
  renderList();
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
  return items.filter((it) => (filter === 'open' ? !it.done : filter === 'done' ? it.done : true)
    && (!k || `${it.name} ${it.phone.replace(/-/g, '')} ${it.address} ${it.category} ${it.memo}`.toLowerCase().includes(k)));
};

function renderList() {
  const box = $('#ld-body'); if (!box) return;
  const list = shown();
  box.innerHTML = list.length ? `<ul class="iq-list">${list.map((it) => `
      <li class="card ld-item${it.done ? ' is-done' : ''}" data-id="${it.id}">
        <div class="ld-main">
          <span class="iq-top"><b class="iq-name">${esc(it.name)}</b>${it.category ? `<span class="iq-org">${esc(it.category)}</span>` : ''}${it.done ? '<span class="badge done">연락함</span>' : ''}</span>
          <a class="ld-phone" href="tel:${esc(it.phone)}">${esc(it.phone)}</a>
          <span class="meta ld-meta">${it.source_url ? `<a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(SRC[it.source] || it.source)}에서 찾음</a>` : `<span>${esc(SRC[it.source] || it.source)}</span>`}${it.place_url && it.place_url !== it.source_url ? `<a href="${esc(it.place_url)}" target="_blank" rel="noopener">네이버 지도</a>` : ''}${it.address ? `<span>${esc(it.address)}</span>` : ''}<span>${fmtDate(it.created_at)}</span></span>
          <input class="input ld-memo" type="text" value="${esc(it.memo)}" placeholder="메모" maxlength="500" aria-label="메모">
        </div>
        <div class="ld-act">
          <button type="button" class="btn sm" data-copy>번호 복사</button>
          <button type="button" class="btn sm${it.done ? '' : ' primary'}" data-done>${it.done ? '연락 전으로' : '연락함'}</button>
          <button type="button" class="btn sm danger" data-del>삭제</button>
        </div>
      </li>`).join('')}</ul>`
    : `<section class="card item"><p class="meta">${items.length ? '이 보기에는 없습니다.' : '아직 모은 번호가 없습니다. 위에 주소를 붙여 넣어 주세요.'}</p></section>`;
  box.querySelectorAll('.ld-item').forEach((li) => {
    const it = items.find((x) => x.id === +li.dataset.id);
    const { api } = deps;
    const save = (data) => api(`/leads/${it.id}`, { method: 'PATCH', data: { done: !!it.done, memo: it.memo, ...data } });
    li.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(it.phone).then(() => toast('번호를 복사했습니다.'));
    li.querySelector('[data-done]').onclick = (e) => busy(e.currentTarget, null, async () => { await save({ done: !it.done }); await renderLeads(deps); });
    li.querySelector('.ld-memo').onchange = async (e) => { try { await save({ memo: e.target.value }); it.memo = e.target.value; toast('메모를 저장했습니다.'); } catch (err) { toast(err.message); } };
    const del = li.querySelector('[data-del]');
    del.onclick = (e) => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 삭제'; return; }
      busy(e.currentTarget, null, async () => { await api(`/leads/${it.id}`, { method: 'DELETE' }); await renderLeads(deps); });
    };
  });
}

function downloadCsv() {
  const list = shown();
  if (!list.length) return toast('받을 번호가 없습니다.');
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['이름', '분류', '휴대폰', '주소', '찾은 곳', '찾은 주소', '네이버 지도', '메모', '연락함', '모은 때'],
    ...list.map((it) => [it.name, it.category, it.phone, it.address, SRC[it.source] || it.source, it.source_url, it.place_url, it.memo, it.done ? '예' : '', fmtDate(it.created_at)])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  a.download = '상담연락.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
