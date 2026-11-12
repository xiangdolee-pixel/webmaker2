// xim 제작문의 — 포트폴리오 사이트의 '제작문의' 폼으로 들어온 글 (사용자 지시 2026-11-12)
//   새 문의 = 아직 열어 보지 않은 것(왼쪽 메뉴 숫자). 누르면 내용이 열리고 읽음이 된다.
import { $, esc, toast, openDialog, busy, fmtDate, pillTabs } from './common.js';

let deps = null; // { view, api, setBadge }
let filter = '';  // '' 전체 · 'new' 새 문의 · 'open' 처리 전

const SITE_NAME = { portfolio: '포트폴리오' };

let data = { items: [], unread: 0 };

export async function renderInquiries(d) {
  deps = d;
  const { view, api, setBadge } = deps;
  data = await api('/inquiries');
  setBadge(data.unread);
  const cnt = { all: data.items.length, new: data.unread, open: data.items.filter((i) => !i.done).length };
  view.innerHTML = `
    <div class="bar"><h2>제작문의 ${data.items.length}</h2></div>
    <p class="meta mon-rule">포트폴리오(portfolio.plators.com) 위 · 아래의 <b>제작문의</b> 버튼으로 들어온 글입니다. 누르면 내용이 열리고, 열어 본 글은 새 문의 숫자에서 빠집니다.</p>
    <nav class="tabs iq-tabs" id="iq-tabs" aria-label="보기"></nav>
    <div id="iq-body"></div>`;
  // 보기 탭은 한 번만 그리고 고른 칸 배경이 미끄러진다(목록만 다시 그림)
  pillTabs($('#iq-tabs'), [['', `전체 ${cnt.all}`], ['new', `새 문의 ${cnt.new}`], ['open', `처리 전 ${cnt.open}`]], filter, (v) => { filter = v; renderList(); });
  renderList();
}

function renderList() {
  const box = $('#iq-body'); if (!box) return;
  const list = data.items.filter((it) => (filter === 'new' ? !it.read_at : filter === 'open' ? !it.done : true));
  box.innerHTML = list.length ? `<ul class="iq-list">${list.map((it) => `
      <li><button type="button" class="card iq-item${it.read_at ? '' : ' is-new'}${it.done ? ' is-done' : ''}" data-id="${it.id}">
        <span class="iq-top">${it.read_at ? '' : '<span class="badge new">새 문의</span>'}${it.done ? '<span class="badge done">처리함</span>' : ''}<b class="iq-name">${esc(it.name)}</b>${it.org ? `<span class="iq-org">${esc(it.org)}</span>` : ''}<span class="iq-when">${fmtDate(it.created_at, true)}</span></span>
        <span class="iq-prev">${it.kind ? `<em>${esc(it.kind)}</em> · ` : ''}${esc(it.preview)}</span>
      </button></li>`).join('')}</ul>`
    : `<section class="card item"><p class="meta">${data.items.length ? '이 보기에는 문의가 없습니다.' : '아직 들어온 제작문의가 없습니다.'}</p></section>`;
  box.querySelectorAll('.iq-item').forEach((b) => { b.onclick = () => openInquiry(+b.dataset.id); });
}

async function openInquiry(id) {
  const { api } = deps;
  let it;
  try { it = await api(`/inquiries/${id}`); } catch (e) { return toast(e.message); }
  const isMail = /@/.test(it.contact);
  const tel = it.contact.replace(/[^\d+]/g, '');
  openDialog(`
    <h2>제작문의 #${it.id}</h2>
    <dl class="iq-dl">
      <div><dt>이름</dt><dd>${esc(it.name)}</dd></div>
      <div><dt>연락처</dt><dd><span class="iq-contact">${esc(it.contact)}</span>
        <button type="button" class="btn sm" data-copy>복사</button>
        ${isMail ? `<a class="btn sm" href="mailto:${esc(it.contact)}">메일 쓰기</a>` : tel.length >= 9 ? `<a class="btn sm" href="tel:${esc(tel)}">전화</a>` : ''}</dd></div>
      ${it.org ? `<div><dt>업체 · 단체</dt><dd>${esc(it.org)}</dd></div>` : ''}
      ${it.kind ? `<div><dt>만들고 싶은 것</dt><dd>${esc(it.kind)}</dd></div>` : ''}
      <div><dt>받은 때</dt><dd>${fmtDate(it.created_at, true)} · ${esc(SITE_NAME[it.site] || it.site)}</dd></div>
    </dl>
    <div class="iq-msg">${esc(it.message)}</div>
    <div class="dlg-foot iq-foot">
      <button type="button" class="btn sm danger" data-del>삭제</button>
      <span class="iq-grow"></span>
      <button type="button" class="btn sm" data-unread>안 읽음으로</button>
      <button type="button" class="btn sm${it.done ? '' : ' primary'}" data-done>${it.done ? '처리 안 함으로' : '처리함'}</button>
      <button type="button" class="btn sm" data-close>닫기</button>
    </div>`, (dlg) => {
    dlg.addEventListener('close', () => renderInquiries(deps));
    dlg.querySelector('[data-copy]').onclick = () => navigator.clipboard.writeText(it.contact).then(() => toast('연락처를 복사했습니다.'));
    dlg.querySelector('[data-done]').onclick = (e) => busy(e.currentTarget, null, async () => { await api(`/inquiries/${id}`, { method: 'PATCH', data: { done: !it.done } }); toast(it.done ? '처리 전으로 돌렸습니다.' : '처리함으로 표시했습니다.'); dlg.close(); });
    dlg.querySelector('[data-unread]').onclick = (e) => busy(e.currentTarget, null, async () => { await api(`/inquiries/${id}`, { method: 'PATCH', data: { done: !!it.done, unread: true } }); dlg.close(); });
    const del = dlg.querySelector('[data-del]');
    del.onclick = (e) => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 삭제 (되돌릴 수 없음)'; return; }
      busy(e.currentTarget, null, async () => { await api(`/inquiries/${id}`, { method: 'DELETE' }); toast('삭제했습니다.'); dlg.close(); });
    };
  });
}
