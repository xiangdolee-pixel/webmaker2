// 휴지통 — 휴지통으로 옮긴 문서를 모아 보고, 되살리거나 완전히 지운다.
const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ui: { fresh, api, toast, modal, $, TYPES, won }
export async function viewTrash(ui) {
  const { fresh, api, toast, modal, $, TYPES, won } = ui;
  document.title = '휴지통 · DMS';
  fresh(`
  <div class="wrap">
    <section class="card">
      <div class="sec-head"><h1 class="page-title">휴지통</h1><button class="btn btn-danger-line" id="trEmpty" type="button">휴지통 비우기</button></div>
      <p class="small">휴지통의 문서는 목록과 검색에 나오지 않습니다. <b>되살리기</b>로 원래대로 돌리거나, <b>완전 삭제</b>로 영영 지울 수 있습니다. 완전 삭제는 되돌릴 수 없습니다.</p>
    </section>
    <section class="card">
      <h2 class="sec-title">문서 <span class="cnt" id="trDocN"></span></h2>
      <div class="doc-grid" id="trDocs"><p class="loading">불러오는 중…</p></div>
    </section>
  </div>`);
  let docs = [];
  async function load() {
    try { docs = (await api('GET', '/api/docs?trash=1&limit=500')).docs; } catch (e) { docs = []; }
    $('#trDocN').textContent = docs.length ? String(docs.length) : '';
    $('#trDocs').innerHTML = docs.length ? docs.map((d) => `
      <article class="doc-card is-trash" data-id="${d.id}">
        <span class="doc-card-link">
          <span class="doc-card-top"><span class="badge badge-${d.type}">${TYPES[d.type]?.name || d.type}</span><span class="doc-no">${escH(d.no)}</span>${d.category ? `<span class="cat-tag">${escH(d.category)}</span>` : ''}</span>
          <b class="doc-client">${escH(d.client || '(수신 없음)')}</b>
          <span class="doc-title">${escH(d.title || '')}</span>
          <span class="doc-card-bottom"><span class="doc-date">${escH(d.doc_date)}</span>${d.type === 'letter' ? '' : `<span class="doc-amt">${won(d.amount)}<small>${d.vat === 'incl' ? 'VAT포함' : 'VAT별도'}</small></span>`}</span>
        </span>
        <span class="doc-act"><button class="btn btn-sm" type="button" data-ta="restore">되살리기</button><button class="btn btn-sm btn-danger-line" type="button" data-ta="hard">완전 삭제</button></span>
      </article>`).join('') : '<p class="empty">휴지통에 문서가 없습니다.</p>';
  }
  $('.wrap').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ta]');
    if (!b) return;
    const el = b.closest('[data-id]');
    const id = el.dataset.id;
    const name = el.querySelector('.doc-client')?.textContent || '';
    try {
      if (b.dataset.ta === 'restore') {
        await api('POST', `/api/docs/${id}/restore`);
        toast('되살렸습니다.');
      } else {
        const ok = await modal({ title: '완전 삭제', body: `<p><b>${escH(name)}</b>을(를) 완전히 지웁니다. <b>되돌릴 수 없습니다.</b></p>`, buttons: [{ label: '취소', value: false }, { label: '완전 삭제', value: true, kind: 'danger' }] });
        if (!ok) return;
        await api('DELETE', `/api/docs/${id}?hard=1`);
        toast('완전히 지웠습니다.');
      }
      load();
    } catch (x) { toast(x.message, 'err'); }
  });
  $('#trEmpty').onclick = async () => {
    if (!docs.length) { toast('휴지통이 이미 비어 있습니다.'); return; }
    const ok = await modal({ title: '휴지통 비우기', body: `<p>휴지통의 문서 ${docs.length}개를 모두 완전히 지웁니다. <b>되돌릴 수 없습니다.</b></p>`, buttons: [{ label: '취소', value: false }, { label: `${docs.length}개 모두 지우기`, value: true, kind: 'danger' }] });
    if (!ok) return;
    try { const j = await api('POST', '/api/trash/empty'); toast(`문서 ${j.docs}개를 완전히 지웠습니다.`); load(); } catch (x) { toast(x.message, 'err'); }
  };
  load();
}
