// 클라이언트(고객) — 카테고리 이름 · 수신 · 검색어를 관리하고, 입력칸에서 검색해 고르게 한다.
//   카테고리 이름: 문서를 모아 보는 이름(예: 주식회사 한빛상사)
//   수신: 서식에 찍힐 받는 곳(비우면 카테고리 이름)
//   검색어: 이렇게 쳐도 찾아지게(예: 한빛상사, 한빛)

const norm = (s) => String(s || '').toLowerCase().replace(/[\s()·.,\-_]/g, '');
const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function matchClients(list, q) {
  const k = norm(q);
  if (!k) return list.slice(0, 12);
  const scored = [];
  for (const c of list) {
    const keys = [c.name, c.recipient, ...String(c.aliases || '').split(',')].map(norm).filter(Boolean);
    let score = -1;
    keys.forEach((x, i) => {
      if (x === k) score = Math.max(score, 100 - i);
      else if (x.startsWith(k)) score = Math.max(score, 60 - i);
      else if (x.includes(k)) score = Math.max(score, 30 - i);
    });
    if (score >= 0) scored.push({ c, score: score + Math.min(9, c.n || 0) / 10 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 12).map((x) => x.c);
}

// 입력칸에 검색 목록 달기. opts: { list(): 클라이언트 배열, onPick(c), onNew(text) }
export function attachClientPicker(input, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'cpick';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.setAttribute('autocomplete', 'off');
  input.removeAttribute('list');
  const box = document.createElement('div');
  box.className = 'cpick-list';
  box.hidden = true;
  wrap.appendChild(box);
  // 화살표로 기존 클라이언트와 '새로 등록' 줄을 오가며 고른다. 아무것도 안 골랐으면 첫 줄이 Enter 대상
  let items = [], at = -1, canNew = false;
  const cur = () => (at >= 0 ? at : 0);
  const render = () => {
    const q = input.value.trim();
    items = matchClients(opts.list() || [], q);
    const exact = items.some((c) => c.name === q);
    canNew = !!(q && !exact && (opts.create || opts.onNew));
    const onNew = canNew && cur() === items.length;
    box.innerHTML = items.map((c, i) => `
      <button type="button" class="cpick-item${i === cur() ? ' on' : ''}" data-i="${i}">
        <b>${escH(c.name)}</b>
        <small>${[c.ref ? `담당자 <b>${escH(c.ref)}</b>` : '', c.recipient && c.recipient !== c.name ? `수신 ${escH(c.recipient)}` : '', c.aliases ? `검색어 ${escH(c.aliases)}` : '', c.n ? `문서 ${c.n}` : ''].filter(Boolean).join(' · ')}</small>
      </button>`).join('')
      + (canNew ? `<button type="button" class="cpick-item cpick-new${onNew ? ' on' : ''}" data-new="1">+ '${escH(q)}' 새 클라이언트로 등록 <small>${onNew ? '(Enter)' : '비슷한 곳이 있어요 · ↓ 눌러 이 줄로 온 뒤 Enter, 또는 클릭'}</small></button>` : '')
      + (!items.length && !q ? '<p class="cpick-empty">등록된 클라이언트가 없습니다.</p>' : '');
    box.hidden = !box.innerHTML.trim();
  };
  const pick = (c) => { box.hidden = true; at = -1; opts.onPick(c); };
  input.addEventListener('focus', () => { at = -1; render(); });
  input.addEventListener('input', () => { at = -1; render(); });
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    const last = items.length - (canNew ? 0 : 1);
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.max(0, Math.min(last, at < 0 ? 1 : at + 1)); render(); }   // 첫 줄은 이미 밝으니 ↓ 는 바로 다음 줄로
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, cur() - 1); render(); }
    else if (e.key === 'Enter' && !e.isComposing) {
      const q = input.value.trim();
      const ex = items.find((c) => c.name === q);
      if (at < 0 && ex) { e.preventDefault(); pick(ex); }
      else if (items[cur()]) { e.preventDefault(); pick(items[cur()]); }
      else if (canNew) { e.preventDefault(); startNew(q); }
    } else if (e.key === 'Escape') { box.hidden = true; }
  });
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.new) { box.hidden = true; startNew(input.value.trim()); return; }
    pick(items[+b.dataset.i]);
  });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 120));

  // 바로 등록: 카테고리 이름 → 수신(처음엔 이름과 같게) → 검색어(Enter 마다 하나씩, 빈 Enter 는 다음) → 담당자 → Enter 로 저장
  let panel = null;
  function startNew(text) {
    if (!opts.create) { opts.onNew(text); return; }
    if (panel) panel.remove();
    box.hidden = true;
    panel = document.createElement('div');
    panel.className = 'cq';
    panel.innerHTML = `
      <p class="cq-title"><b>새 클라이언트</b> <span>Enter 로 다음 칸 · 담당자에서 Enter 하면 저장 · Esc 취소</span></p>
      <label class="cq-row"><span>카테고리 이름</span><input class="input" data-q="name" value="${escH(text)}" autocomplete="off"></label>
      <label class="cq-row"><span>수신 <small>서식에 인쇄</small></span><input class="input" data-q="recipient" value="${escH(text)}" autocomplete="off"></label>
      <div class="cq-row"><span>검색어 <small>Enter 마다 하나</small></span><div class="cq-chips"><span class="cq-tags"></span><input class="input" data-q="alias" placeholder="예) 한빛" autocomplete="off"></div></div>
      <label class="cq-row"><span>담당자</span><input class="input" data-q="ref" placeholder="예) 김하늘 과장님 (없으면 그냥 Enter)" autocomplete="off"></label>
      <div class="cq-btns"><button type="button" class="btn btn-sm" data-qa="cancel">취소</button><button type="button" class="btn btn-sm btn-primary" data-qa="save">저장 (Enter)</button></div>`;
    wrap.appendChild(panel);
    const f = (k) => panel.querySelector(`[data-q="${k}"]`);
    const tags = [];
    let recipEdited = false;
    const drawTags = () => { panel.querySelector('.cq-tags').innerHTML = tags.map((t, i) => `<span class="chip">${escH(t)}<button type="button" data-rm="${i}" aria-label="${escH(t)} 빼기">✕</button></span>`).join(''); };
    f('name').addEventListener('input', () => { if (!recipEdited) f('recipient').value = f('name').value; });
    f('recipient').addEventListener('input', () => { recipEdited = true; });
    panel.querySelector('.cq-tags').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { tags.splice(+b.dataset.rm, 1); drawTags(); f('alias').focus(); } });
    const close = () => { if (panel) { panel.remove(); panel = null; } input.focus(); };
    let busy = false;
    const save = async () => {
      if (busy) return;
      const name = f('name').value.trim();
      if (!name) { f('name').focus(); return; }
      const extra = f('alias').value.trim();
      if (extra) tags.push(extra);
      busy = true;
      const c = await opts.create({ name, recipient: f('recipient').value.trim() || name, aliases: tags.join(', '), ref: f('ref').value.trim() });
      busy = false;
      if (!c) return;
      panel.remove(); panel = null;
      pick(c);
    };
    panel.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      const k = e.target.dataset && e.target.dataset.q;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Backspace' && k === 'alias' && !e.target.value && tags.length) { tags.pop(); drawTags(); return; }
      if (e.key !== 'Enter' || !k) return;
      e.preventDefault();
      if (k === 'name') f('recipient').focus();
      else if (k === 'recipient') f('alias').focus();
      else if (k === 'alias') { const v = e.target.value.trim(); if (v) { if (!tags.includes(v)) tags.push(v); e.target.value = ''; drawTags(); } else f('ref').focus(); }
      else if (k === 'ref') save();
    });
    panel.addEventListener('click', (e) => { const b = e.target.closest('[data-qa]'); if (!b) return; if (b.dataset.qa === 'cancel') close(); else save(); });
    setTimeout(() => { f('name').focus(); f('name').select(); }, 0);
  }
  return { refresh: render, close: () => { box.hidden = true; }, startNew };
}

// 클라이언트 고치기 창. ui: { modal, api, toast, $ }  → 저장하면 저장된 값, 취소면 null
export async function editClient(ui, c = {}, { isNew = !c.name } = {}) {
  const { modal, api, toast, $ } = ui;
  // 검색어는 칩으로: Enter 마다 하나, 빈 칸에서 Enter 는 다음 칸. 다른 칸은 Enter 로 다음 칸, 연락처에서 Enter 하면 저장
  const tags = String(c.aliases || '').split(',').map((s) => s.trim()).filter(Boolean);
  const v = await modal({
    title: isNew ? '새 클라이언트' : '클라이언트 고치기',
    wide: true,
    body: `
      <label class="field"><span>카테고리 이름 <b class="req">*</b> <small>문서를 모아 보는 이름 · 예) 주식회사 한빛상사</small></span><input class="input" id="ccName" value="${escH(c.name || '')}"></label>
      <label class="field"><span>수신 <small>서식에 찍힐 받는 곳 · 비우면 카테고리 이름</small></span><input class="input" id="ccRecipient" value="${escH(c.recipient || '')}"></label>
      <div class="field"><span>검색어 <small>하나 쓰고 Enter · 빈 칸에서 Enter 는 다음 칸 · ✕ 나 Backspace 로 빼기</small></span><div class="cq-chips cc-chips input"><span class="cq-tags" id="ccTags"></span><input id="ccAliases" placeholder="예) 한빛" autocomplete="off"></div></div>
      <div class="row2"><label class="field"><span>담당자(참조)</span><input class="input" id="ccRef" value="${escH(c.ref || '')}"></label><label class="field"><span>연락처</span><input class="input" id="ccTel" value="${escH(c.tel || '')}"></label></div>
      <label class="field"><span>메모</span><textarea class="input" rows="3" id="ccMemo">${escH(c.memo || '')}</textarea></label>
      <p class="small">Enter 로 다음 칸 · 연락처에서 Enter 하면 저장 · 메모는 Ctrl+Enter 로 저장</p>
      ${!isNew && c.n ? `<p class="small">카테고리 이름을 바꾸면 이 이름으로 묶인 문서 ${c.n}개도 함께 바뀝니다.</p>` : ''}`,
    buttons: [{ label: '취소', value: null }, { label: '저장', kind: 'primary', value: (card) => ({
      name: $('#ccName', card).value.trim(), recipient: $('#ccRecipient', card).value.trim(), aliases: [...tags, $('#ccAliases', card).value.trim()].filter(Boolean).join(', '),
      ref: $('#ccRef', card).value.trim(), tel: $('#ccTel', card).value.trim(), memo: $('#ccMemo', card).value.trim(),
    }) }],
    onOpen: (card) => {
      const q = (id) => $(id, card);
      const draw = () => { q('#ccTags').innerHTML = tags.map((t, i) => `<span class="chip">${escH(t)}<button type="button" data-rm="${i}" aria-label="${escH(t)} 빼기">✕</button></span>`).join(''); };
      draw();
      q('#ccTags').addEventListener('click', (e) => { const x = e.target.closest('[data-rm]'); if (x) { e.stopPropagation(); tags.splice(+x.dataset.rm, 1); draw(); q('#ccAliases').focus(); } });
      q('.cc-chips').addEventListener('click', (e) => { if (e.target === e.currentTarget) q('#ccAliases').focus(); });
      let recipEdited = !!c.recipient && c.recipient !== c.name;
      q('#ccName').addEventListener('input', () => { if (!recipEdited) q('#ccRecipient').value = q('#ccName').value; });
      q('#ccRecipient').addEventListener('input', () => { recipEdited = true; });
      const order = ['#ccName', '#ccRecipient', '#ccAliases', '#ccRef', '#ccTel'];
      const save = () => q('.btn-primary').click();
      card.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        const id = '#' + (e.target.id || '');
        if (e.key === 'Backspace' && id === '#ccAliases' && !e.target.value && tags.length) { tags.pop(); draw(); return; }
        if (e.key !== 'Enter') return;
        if (id === '#ccMemo') { if (e.ctrlKey || e.metaKey) { e.preventDefault(); save(); } return; }
        const i = order.indexOf(id);
        if (i < 0) return;
        e.preventDefault();
        if (id === '#ccAliases') { const t = e.target.value.trim(); if (t) { if (!tags.includes(t)) tags.push(t); e.target.value = ''; draw(); return; } }
        if (i === order.length - 1) save(); else { const n = q(order[i + 1]); n.focus(); n.select && n.select(); }
      });
    },
  });
  if (!v) return null;
  if (!v.name) { toast('카테고리 이름을 넣어 주세요.', 'err'); return null; }
  try {
    if (isNew) await api('POST', '/api/clients', v);
    else { const j = await api('PUT', `/api/clients/${encodeURIComponent(c.name)}`, v); if (j.moved) toast(`문서 ${j.moved}개의 카테고리도 바꿨습니다.`); }
    return { ...v, n: c.n || 0 };
  } catch (e) { toast(e.message, 'err'); return null; }
}

// 클라이언트 메뉴
export async function viewClients(ui) {
  const { fresh, api, toast, modal, $ } = ui;
  document.title = '클라이언트 · J-Docs';
  fresh(`
  <div class="wrap">
    <section class="card">
      <div class="sec-head"><h1 class="page-title">클라이언트</h1><button class="btn btn-primary" id="clNew" type="button">+ 새 클라이언트</button></div>
      <p class="small">문서의 '클라이언트 카테고리'에서 고르는 목록입니다. 고르면 <b>수신</b>(서식에 찍히는 받는 곳)과 담당자가 자동으로 들어갑니다. <b>검색어</b>에 넣은 말로도 찾아집니다(예: '한빛' → 주식회사 한빛상사).</p>
      <input class="input cl-search" id="clQ" type="search" placeholder="이름 · 수신 · 검색어로 찾기">
      <div class="cl-list" id="clList"><p class="loading">불러오는 중…</p></div>
    </section>
  </div>`);
  let list = [];
  const render = () => {
    const q = $('#clQ').value.trim();
    const rows = q ? matchClients(list, q).concat([]) : list;
    const shown = q ? rows : list;
    $('#clList').innerHTML = shown.length ? `<div class="cl-row cl-head"><span>카테고리 이름</span><span>수신</span><span>검색어</span><span>담당자</span><span>문서</span><span></span></div>` + shown.map((c) => `
      <div class="cl-row" data-name="${escH(c.name)}">
        <b>${escH(c.name)}</b>
        <span>${escH(c.recipient || '')}${c.recipient ? '' : '<small class="muted">(카테고리 이름)</small>'}</span>
        <span class="cl-alias">${String(c.aliases || '').split(',').map((a) => a.trim()).filter(Boolean).map((a) => `<span class="chip">${escH(a)}</span>`).join('')}</span>
        <span>${escH(c.ref || '')}</span>
        <span>${c.n ? `<a href="#/" data-docs="1">${c.n}개</a>` : '0'}</span>
        <span class="cl-btns"><button type="button" class="btn btn-sm" data-act="edit">고치기</button>${c.n ? '' : '<button type="button" class="btn btn-sm btn-quiet" data-act="del">지우기</button>'}</span>
      </div>`).join('') : `<p class="empty">${q ? '찾는 클라이언트가 없습니다.' : '등록된 클라이언트가 없습니다. 오른쪽 위에서 추가하세요.'}</p>`;
  };
  const load = async () => { try { list = (await api('GET', '/api/clients')).clients; if (ui.setClients) ui.setClients(list); } catch (e) { toast(e.message, 'err'); } render(); };
  $('#clQ').addEventListener('input', render);
  $('#clNew').onclick = async () => { if (await editClient(ui, {}, { isNew: true })) { toast('등록했습니다.'); load(); } };
  $('#clList').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-name]');
    if (!row) return;
    const c = list.find((x) => x.name === row.dataset.name);
    if (e.target.closest('[data-docs]')) { e.preventDefault(); ui.showDocs(c.name); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'edit') { if (await editClient(ui, c, { isNew: false })) { toast('저장했습니다.'); load(); } }
    if (b.dataset.act === 'del') {
      const ok = await modal({ title: '클라이언트 지우기', body: `<p>'${escH(c.name)}'을(를) 목록에서 지웁니다. 이 카테고리로 묶인 문서는 없습니다.</p>`, buttons: [{ label: '취소', value: false }, { label: '지우기', value: true, kind: 'danger' }] });
      if (!ok) return;
      try { await api('DELETE', `/api/clients/${encodeURIComponent(c.name)}`); toast('지웠습니다.'); load(); } catch (x) { toast(x.message, 'err'); }
    }
  });
  load();
}
