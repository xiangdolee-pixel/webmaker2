// J-Docs — 목록 · 편집 · 설정
import { TYPES, ROUNDING, ACCOUNTS, compute, won, num, krDate, todayIso, solveTarget, parseQuick, vatWord, accountKey, accountText, periodRange, isWorkPeriod, rewritePeriod, docAmount } from './calc.js';
import { DEFAULT_SETTINGS, newDoc, yearBase, extraOf } from './defaults.js';
import { layout, clearMeasure, PT } from './layout.js';
import { toSVG, toPDF, toXLSX, toDOCX, printSVG, download, loadDocFont, svgHeight, pageSVGs, stampPng } from './render.js';
import { check, bodyTitle } from './check.js';
import { attachClientPicker, viewClients } from './clients.js';
import { viewTrash } from './trash.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let view = $('#view');
// 화면을 바꿀 때마다 #view 를 새것으로 갈아 끼워 이전 화면의 이벤트가 쌓이지 않게 한다
function fresh(html) { const nv = view.cloneNode(false); view.replaceWith(nv); view = nv; if (html !== undefined) view.innerHTML = html; return view; }
const clone = (o) => structuredClone(o);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ── 서버 ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const r = await fetch(path.replace(/^\/api\//, '/api/jdocs/'), { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  // 로그인은 바깥(xim) 화면이 맡는다
  if (r.status === 401) { try { window.top.location.reload(); } catch (e) { location.reload(); } throw new Error('로그인이 필요합니다.'); }
  const j = await r.json().catch(() => ({ ok: false, error: '서버 응답을 읽지 못했습니다.' }));
  if (!j.ok) { const e = new Error(j.error || '요청이 실패했습니다.'); e.status = r.status; throw e; }
  return j;
}

// ── 알림 · 확인 창 ─────────────────────────────────────────────────
let toastT;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast'; }, kind === 'err' ? 5000 : 2600);
}
function modal({ title, body = '', buttons = [{ label: '확인', value: true, kind: 'primary' }], wide = false, onOpen }) {
  const m = $('#modal'), card = $('.modal-card', m);
  card.className = `modal-card${wide ? ' modal-wide' : ''}`;
  card.innerHTML = `<h2 class="modal-title">${esc(title)}</h2><div class="modal-body">${body}</div>
    <div class="modal-foot">${buttons.map((b, i) => `<button type="button" class="btn ${b.kind ? `btn-${b.kind}` : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
  m.hidden = false;
  document.body.classList.add('modal-open');
  return new Promise((res) => {
    const close = (v) => { m.hidden = true; document.body.classList.remove('modal-open'); m.onclick = null; document.removeEventListener('keydown', key); res(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', key);
    m.onclick = (e) => {
      if (e.target === m) return close(null);
      const b = e.target.closest('[data-i]');
      if (b) { const bt = buttons[+b.dataset.i]; close(typeof bt.value === 'function' ? bt.value(card) : bt.value); }
    };
    if (onOpen) onOpen(card);
    const first = $('input, textarea, select', card) || $('.btn-primary', card);
    if (first) setTimeout(() => first.focus(), 30);
  });
}

// ── 미끄러지는 알약 탭 ─────────────────────────────────────────────
// 칸마다 배경을 칠하지 않고 떠 있는 배경(.seg-ind) 하나를 옮긴다.
function segInit(el, onPick) {
  if (!el) return null;
  let ind = $('.seg-ind', el);
  if (!ind) { ind = document.createElement('span'); ind.className = 'seg-ind'; el.prepend(ind); }
  const items = () => $$('[data-v]', el);
  const place = () => {
    const on = items().find((b) => b.classList.contains('on'));
    if (!on || !on.offsetWidth) { el.classList.add('seg-noind'); return; }
    el.classList.remove('seg-noind');
    ind.style.width = `${on.offsetWidth}px`;
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
    // 칸이 많아 옆으로 넘치면(폰) 고른 칸이 보이게 민다
    if (el.scrollWidth > el.clientWidth + 1) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
  };
  const set = (v) => { items().forEach((b) => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); place(); };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b || !el.contains(b) || b.disabled) return;
    if (b.tagName === 'BUTTON') e.preventDefault();
    set(b.dataset.v);
    if (onPick) onPick(b.dataset.v);
  });
  el._seg = { set, place };
  segs.add(el);
  requestAnimationFrame(place);
  return el._seg;
}
const segs = new Set();
const replaceSegs = () => segs.forEach((el) => { if (!el.isConnected) segs.delete(el); else el._seg.place(); });
addEventListener('resize', replaceSegs);
document.fonts && document.fonts.ready.then(replaceSegs);

// ── 설정 ───────────────────────────────────────────────────────────
let S = clone(DEFAULT_SETTINGS);
let settingsSaved = false;
function mergeSettings(s) {
  const d = clone(DEFAULT_SETTINGS);
  if (!s) return d;
  const types = {};
  for (const k of Object.keys(d.types)) { types[k] = { ...d.types[k], ...((s.types || {})[k] || {}) }; types[k].extra = extraOf(types[k]); }
  const company = { ...d.company, ...(s.company || {}) };
  delete company.addr;
  return { ...d, ...s, company, rate: { ...d.rate, ...(s.rate || {}) }, types };
}
async function loadSettings() {
  const j = await api('GET', '/api/settings');
  S = mergeSettings(j.settings);
  settingsSaved = !!j.settings;
}

// 직인 (xim 에 도장이 없으면 null 그대로 — 도장 없이 만든다)
let stamp = null;
async function loadStamp() {
  if (stamp) return stamp;
  // 직인 · 공문 도장은 같은 그림(xim 계약서 '을 정보 · 도장')
  const im = await stampPng('/api/jdocs/stamp');
  if (!im) throw new Error('직인을 불러오지 못했습니다.');
  stamp = { buf: im.buf, url: im.url, sealBuf: im.buf, sealUrl: im.url };
  return stamp;
}

// 클라이언트 카테고리 목록
let CLIENTS = [];
async function loadClients() {
  try { const j = await api('GET', '/api/clients'); CLIENTS = j.clients; return j.clients; } catch (e) { return CLIENTS; }
}
const clientOptions = (list) => list.map((c) => `<option value="${esc(c.name)}">`).join('');

// ── 라우터 ─────────────────────────────────────────────────────────
let leaveGuard = null;
let pageSave = null;    // 지금 화면의 저장(Ctrl+S)
let pendingDoc = null;   // 바로 만들기로 만든 새 문서
let lastHash = location.hash;
let navSeg;

let closeFull = null;   // 편집 화면의 전체화면 닫기(다른 화면으로 갈 때)
// 바깥(xim) 주소창에도 지금 화면을 남긴다
function syncParent() {
  try { if (window.parent !== window) window.parent.history.replaceState(null, '', '/jdocs' + (location.hash && location.hash !== '#/' ? location.hash : '')); } catch (e) { /* 다른 출처 */ }
}
async function route() {
  if (leaveGuard && location.hash !== lastHash) {
    const ok = await leaveGuard();
    if (!ok) { history.replaceState(null, '', lastHash || '#/'); return; }
  }
  leaveGuard = null;
  if (closeFull) { closeFull(); closeFull = null; }
  pageSave = null;
  lastHash = location.hash;
  syncParent();
  const [path, qs] = (location.hash.replace(/^#/, '') || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  navSeg && navSeg.set(['settings', 'clients', 'trash'].includes(parts[0]) ? parts[0] : 'list');
  window.scrollTo(0, 0);
  try {
    if (!parts.length) return await viewList(q);
    if (parts[0] === 'doc' && parts[1]) return await viewEditor({ id: +parts[1] });
    if (parts[0] === 'new') return await viewEditor({ type: TYPES[parts[1]] ? parts[1] : 'quote', draft: q.get('draft') === '1' });
    if (parts[0] === 'settings') return await viewSettings();
    if (parts[0] === 'trash') return await viewTrash({ fresh, api, toast, modal, $, TYPES, won });
    if (parts[0] === 'clients') return await viewClients({ fresh, api, toast, modal, $, setClients: (l) => { CLIENTS = l; }, showDocs: (name) => { listState.cat = name; location.hash = '#/'; } });
    location.hash = '#/';
  } catch (e) {
    view.innerHTML = `<div class="wrap"><p class="empty">${esc(e.message)}</p><p><a class="btn" href="#/">목록으로</a></p></div>`;
  }
}
addEventListener('hashchange', route);
addEventListener('beforeunload', (e) => { if (leaveGuard && leaveGuard.dirty && leaveGuard.dirty()) { e.preventDefault(); e.returnValue = ''; } });

// ── 목록 ───────────────────────────────────────────────────────────
const TYPE_KEYS = Object.keys(TYPES);
const listState = { q: '', type: '', year: '', trash: false, cat: '', page: 1 };
const PER_PAGE = 12;
// 고객에게 보내는 문서 주소: xim.plators.com/jd/wD5Jd4 (설정에서 앞부분을 바꿀 수 있다)
// 고객에게 보내는 문서 주소: docs.plators.com/jd/<8자> (설정에서 앞부분을 바꿀 수 있다). 시험 주소(localhost 등)에서는 그 주소 그대로
const LINK_BASE = location.hostname === 'xim.plators.com' ? 'https://docs.plators.com/jd' : `${location.origin}/jd`;
const linkBase = () => { const v = String(S.linkBase || '').trim().replace(/\/+$/, ''); return /^https?:\/\/[^\s"'<>]+$/.test(v) ? v : LINK_BASE; };   // http(s) 주소만 쓴다
const docLink = (slug) => `${linkBase()}/${slug}`;
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* 무시 */ }
    a.remove(); return ok;
  }
}

async function viewList() {
  document.title = 'J-Docs';
  fresh(`
  <div class="wrap">
    <section class="quick card">
      <h1 class="page-title">문서 만들기</h1>
      <form class="quick-form" id="quick">
        <input id="quickIn" class="input input-lg" placeholder="예) VAT포함 3000만원 견적  ·  부가세별도 250만원 청구서" autocomplete="off">
        <button class="btn btn-primary btn-lg" type="submit">바로 만들기</button>
      </form>
      <p class="quick-hint" id="quickHint">금액만 말하면 일단가를 거꾸로 계산해 그 금액에 딱 맞춘 견적을 만듭니다. 숫자만 쓰면 원 단위입니다.</p>
      <div class="quick-new">
        ${TYPE_KEYS.map((k) => `<a class="btn" href="#/new/${k}">+ 새 ${TYPES[k].name}</a>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="sec-head"><h2 class="sec-title">템플릿에서 만들기</h2><a class="link" href="#/settings">템플릿 관리</a></div>
      <p class="small">불러와서 고친 뒤 저장하면 새 문서(새 번호)로 저장됩니다. 템플릿은 그대로 남습니다.</p>
      <div class="tpl-list" id="tplList"><p class="loading">불러오는 중…</p></div>
    </section>

    <section class="card">
      <div class="list-head">
        <h2 class="sec-title" id="listTitle">${listState.trash ? '휴지통' : '저장된 문서'}</h2>
        <div class="list-tools">
          <input id="q" class="input" type="search" placeholder="수신처 · 제목 · 항목 · 문서번호 · 금액 검색" value="${esc(listState.q)}">
          <select id="year" class="input input-auto" aria-label="연도"><option value="">전체 연도</option></select>
        </div>
      </div>
      <div class="cat-filter">
        <label class="cat-pick"><span class="cat-label">클라이언트 카테고리</span><input id="catQ" class="input" list="catListL" placeholder="예) 한빛 → 한빛상사" value="${esc(listState.cat)}" autocomplete="off"><button type="button" class="btn btn-sm" id="catClear" ${listState.cat ? '' : 'hidden'}>전체 보기</button></label>
        <datalist id="catListL"></datalist>
        <div class="chips cat-chips" id="catChips"></div>
      </div>
      <div class="list-filters">
        <div class="seg" id="typeSeg">
          <button type="button" data-v="">전체</button>
          ${TYPE_KEYS.map((k) => `<button type="button" data-v="${k}">${TYPES[k].name}</button>`).join('')}
        </div>
        <div class="seg seg-sm" id="binSeg"><button type="button" data-v="0">저장된 문서</button><button type="button" data-v="1">휴지통 <span class="cnt" id="trashCnt"></span></button></div>
      </div>
      <p class="small trash-note" id="trashNote" ${listState.trash ? '' : 'hidden'}>휴지통의 문서는 목록 · 검색에 나오지 않습니다. '되살리기'로 원래대로 돌려놓을 수 있습니다. 완전히 지우려면 위쪽 '휴지통' 메뉴에서 지웁니다.</p>
      <div id="list" class="doc-grid"><p class="loading">불러오는 중…</p></div>
      <nav class="pager" id="pager" aria-label="문서 목록 페이지" hidden></nav>
    </section>
  </div>`);

  // 바로 만들기
  const qi = $('#quickIn'), hint = $('#quickHint');
  const describe = () => {
    const p = parseQuick(qi.value);
    if (!qi.value.trim()) { hint.textContent = '금액만 말하면 일단가를 거꾸로 계산해 그 금액에 딱 맞춘 견적을 만듭니다. 숫자만 쓰면 원 단위입니다.'; hint.classList.remove('on'); return p; }
    const type = p.type || 'quote';
    const vat = p.vat || S.types[type].vat;
    hint.innerHTML = p.amount
      ? `→ <b>${vat === 'incl' ? 'VAT포함' : 'VAT별도'} ${won(p.amount)}원</b>짜리 ${TYPES[type].name}를 만듭니다.${p.vat ? '' : ' (VAT 말이 없어 기본값)'}`
      : `→ 금액을 찾지 못했습니다. 예) 3000만원, 2,500,000`;
    hint.classList.add('on');
    return p;
  };
  qi.addEventListener('input', describe);
  $('#quick').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = describe();
    if (!p.amount) { qi.focus(); return; }
    const type = p.type || 'quote';
    const d = newDoc(S, type, todayIso());
    d.rounding = S.types[type].rounding ?? d.rounding;
    d.vat = p.vat || d.vat;
    if (d.vat === 'incl') d.showVat = true;
    d.account = d.vat === 'incl' ? 'business' : 'personal';
    const r = solveTarget(d, p.amount, d.vat);
    if (r.rate === undefined && !r.rates) { toast(r.msg, 'err'); return; }
    applySolve(d, r);
    d.target = { amount: p.amount, vat: d.vat };
    pendingDoc = { doc: d, msg: r.ok ? `${vatWord(d)} ${won(p.amount)}원에 맞췄습니다.` : r.msg };
    location.hash = `#/new/${type}?draft=1`;
  });

  const yearSel = $('#year');
  const typeSeg = segInit($('#typeSeg'), (v) => { listState.type = v; load(1); });
  typeSeg.set(listState.type);
  let t;
  $('#q').addEventListener('input', (e) => { listState.q = e.target.value; clearTimeout(t); t = setTimeout(() => load(1), 220); });
  yearSel.addEventListener('change', () => { listState.year = yearSel.value; load(1); });
  const binSeg = segInit($('#binSeg'), (v) => {
    listState.trash = v === '1';
    $('#listTitle').textContent = listState.trash ? '휴지통' : '저장된 문서';
    $('#trashNote').hidden = !listState.trash;
    load(1);
  });
  binSeg.set(listState.trash ? '1' : '0');
  const trashCount = () => api('GET', '/api/docs?trash=1&limit=300').then((j) => { const c = $('#trashCnt'); if (c) c.textContent = j.docs.length ? String(j.docs.length) : ''; }).catch(() => {});
  trashCount();
  // 클라이언트 카테고리로 모아 보기
  const catQ = $('#catQ');
  let cats = [];
  const setCat = (v) => {
    listState.cat = v;
    catQ.value = v;
    $('#catClear').hidden = !v;
    $$('#catChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.cat === v));
    load(1);
  };
  loadClients().then((list) => {
    cats = list;
    $('#catListL').innerHTML = clientOptions(list);
    $('#catChips').innerHTML = list.slice(0, 14).map((c) => `<button type="button" class="chip${c.name === listState.cat ? ' on' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}<small>${c.n || ''}</small></button>`).join('');
  });
  attachClientPicker(catQ, { list: () => cats, onPick: (c) => setCat(c.name) });
  catQ.addEventListener('input', () => { const v = catQ.value.trim(); if (cats.some((c) => c.name === v)) setCat(v); else if (!v && listState.cat) setCat(''); });
  catQ.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = catQ.value.trim();
    const hit = cats.find((c) => c.name === v) || cats.find((c) => c.name.includes(v));
    setCat(hit ? hit.name : v);
  });
  $('#catClear').onclick = () => setCat('');
  $('#catChips').addEventListener('click', (e) => { const c = e.target.closest('[data-cat]'); if (c) setCat(listState.cat === c.dataset.cat ? '' : c.dataset.cat); });

  async function load(page) {
    if (page) listState.page = page;
    const ps = new URLSearchParams();
    ps.set('per', PER_PAGE); ps.set('page', listState.page);
    if (listState.q) ps.set('q', listState.q);
    if (listState.type) ps.set('type', listState.type);
    if (listState.year) ps.set('year', listState.year);
    if (listState.trash) ps.set('trash', '1');
    if (listState.cat) ps.set('cat', listState.cat);
    const box = $('#list');
    if (!box) return;
    try {
      const j = await api('GET', `/api/docs?${ps}`);
      const ys = j.years || [];
      if (yearSel.options.length - 1 !== ys.length) {
        yearSel.innerHTML = `<option value="">전체 연도</option>${ys.map((y) => `<option value="${y}">${y}년</option>`).join('')}`;
        yearSel.value = listState.year;
      }
      // 지우거나 옮겨서 지금 쪽이 비면 앞쪽으로
      if (!j.docs.length && listState.page > 1) return load(Math.max(1, Math.ceil((j.total || 0) / PER_PAGE)));
      drawPager(j.total || 0);
      if (!j.docs.length) { box.innerHTML = `<p class="empty">${listState.q || listState.type || listState.year || listState.cat ? '찾는 문서가 없습니다.' : listState.trash ? '휴지통이 비어 있습니다.' : '아직 저장된 문서가 없습니다. 위에서 만들어 보세요.'}</p>`; return; }
      box.innerHTML = j.docs.map((d) => `
        <article class="doc-card${listState.trash ? ' is-trash' : ''}" data-id="${d.id}">
          <a class="doc-card-link" href="#/doc/${d.id}">
            <span class="doc-card-top"><span class="badge badge-${esc(d.type)}">${esc(TYPES[d.type]?.name || d.type)}</span><span class="doc-no">${esc(d.no)}</span>${d.category ? `<span class="cat-tag" title="클라이언트 카테고리">${esc(d.category)}</span>` : ''}</span>
            <b class="doc-title">${esc(d.title || TYPES[d.type]?.name || '(제목 없음)')}</b>
            <span class="doc-client">${esc(d.client || '(수신 없음)')}</span>
            <span class="doc-card-bottom"><span class="doc-date">${esc(d.doc_date)}${d.author ? ` · ${esc(d.author)}` : ''}</span>${d.type === 'letter' ? '' : `<span class="doc-amt">${won(d.amount)}<small>${d.vat === 'incl' ? 'VAT포함' : 'VAT별도'}</small></span>`}</span>
          </a>
          <span class="doc-act">${listState.trash
            ? `<button class="btn btn-sm" type="button" data-act="restore">되살리기</button>`
            : `${d.slug ? `<button class="btn btn-sm" type="button" data-act="link" data-slug="${esc(d.slug)}" title="고객에게 보낼 문서 주소 복사">링크 복사</button>` : ''}<button class="btn btn-sm" type="button" data-act="dup">복제</button><button class="btn btn-sm btn-quiet" type="button" data-act="trash">휴지통</button>`}</span>
        </article>`).join('');
    } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
  }
  $('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = +b.closest('.doc-card').dataset.id;
    if (b.dataset.act === 'link') { const u = docLink(b.dataset.slug); toast((await copyText(u)) ? `링크를 복사했습니다: ${u}` : u); return; }
    if (b.dataset.act === 'restore') { await api('POST', `/api/docs/${id}/restore`); toast('되살렸습니다. 저장된 문서에 다시 나옵니다.'); load(); trashCount(); }
    if (b.dataset.act === 'trash') { await api('DELETE', `/api/docs/${id}`); toast('휴지통으로 옮겼습니다. 휴지통에서 되살릴 수 있습니다.'); load(); trashCount(); }
    if (b.dataset.act === 'dup') {
      const j = await api('GET', `/api/docs/${id}`);
      pendingDoc = { doc: duplicateDoc(j.doc), msg: `${j.doc.no}를 복제했습니다. 날짜는 오늘로 바꿨고, 저장하면 새 번호가 붙습니다.` };
      location.hash = `#/new/${j.doc.type}?draft=1`;
    }
  });
  // 페이지 나눔: 앞뒤 화살표 + 가까운 쪽 번호
  function drawPager(total) {
    const el = $('#pager');
    const pages = Math.max(1, Math.ceil(total / PER_PAGE)), cur = Math.min(listState.page, pages);
    el.hidden = pages <= 1;
    if (pages <= 1) { el.innerHTML = ''; return; }
    const nums = new Set([1, pages, cur - 2, cur - 1, cur, cur + 1, cur + 2].filter((n) => n >= 1 && n <= pages));
    let prev = 0, h = `<button type="button" class="pg" data-pg="${cur - 1}" ${cur > 1 ? '' : 'disabled'} aria-label="이전 쪽">‹</button>`;
    [...nums].sort((a, b) => a - b).forEach((n) => {
      if (n - prev > 1) h += '<span class="pg-gap">…</span>';
      h += `<button type="button" class="pg${n === cur ? ' on' : ''}" data-pg="${n}" ${n === cur ? 'aria-current="page"' : ''}>${n}</button>`;
      prev = n;
    });
    h += `<button type="button" class="pg" data-pg="${cur + 1}" ${cur < pages ? '' : 'disabled'} aria-label="다음 쪽">›</button><span class="pg-total">전체 ${total}건</span>`;
    el.innerHTML = h;
  }
  $('#pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg]');
    if (!b || b.disabled) return;
    load(+b.dataset.pg).then(() => $('#listTitle').scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
  });
  load();

  // 템플릿
  api('GET', '/api/templates').then((j) => {
    const box = $('#tplList');
    if (!box) return;
    if (!j.templates.length) { box.innerHTML = '<p class="empty">아직 템플릿이 없습니다. 문서 편집 화면의 ⋯ 메뉴에서 "템플릿으로 저장"을 누르세요.</p>'; return; }
    box.innerHTML = j.templates.map((t) => `
      <div class="tpl-wrap"><button type="button" class="tpl" data-tid="${t.id}">
        <span class="badge badge-${esc(t.type)}">${TYPES[t.type]?.name || ''}</span>
        <b>${esc(t.name)}</b>
        <small>${t.doc.type === 'letter' ? esc(t.doc.client?.name || '') : `${won(docAmount(t.doc))}원 ${vatWord(t.doc)}`}</small>
      </button><button type="button" class="tpl-name-btn" data-rename="${t.id}">이름 바꾸기</button></div>`).join('');
    box.onclick = async (e) => {
      // 이름 바꾸기: 카드 오른쪽 위 단추 — 다시 그리지 않고 그 카드의 이름만 바꾼다
      const rn = e.target.closest('[data-rename]');
      if (rn) {
        const rt = j.templates.find((x) => x.id === +rn.dataset.rename);
        const name = await modal({ title: '템플릿 이름', body: `<label class="field"><span>이름</span><input class="input" id="tplName" value="${esc(rt.name)}"></label>`,
          buttons: [{ label: '취소', value: null }, { label: '바꾸기', kind: 'primary', value: (card) => $('#tplName', card).value.trim() }] });
        if (!name || name === rt.name) return;
        try { await api('PUT', `/api/templates/${rt.id}`, { name }); } catch (x) { toast(x.message, 'err'); return; }
        rt.name = name;
        rn.parentNode.querySelector('.tpl b').textContent = name;
        toast('템플릿 이름을 바꿨습니다.');
        return;
      }
      const b = e.target.closest('[data-tid]');
      if (!b) return;
      const t = j.templates.find((x) => x.id === +b.dataset.tid);
      pendingDoc = { doc: fromTemplate(t.doc, { id: t.id, name: t.name }), msg: `'${t.name}' 템플릿을 불러왔습니다. 고친 뒤 저장하면 새 문서로 저장됩니다.` };
      location.hash = `#/new/${t.doc.type}?draft=1`;
    };
  }).catch((e) => { const box = $('#tplList'); if (box) box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; });
}

// 템플릿으로 남길 때 문서 고유 값은 뺀다
function tplClean(d) {
  const t = clone(d);
  t.no = ''; t.target = null;
  ['id', 'parentId', 'author', 'authorId', 'editor', 'editedAt', 'tplId', 'tplName'].forEach((k) => delete t[k]);
  return t;
}
function fromTemplate(src, meta) {
  const d = duplicateDoc(src);
  d.target = null;
  delete d.id;
  if (meta) { d.tplId = meta.id; d.tplName = meta.name; }
  return d;
}

function duplicateDoc(src) {
  const d = clone(src);
  d.no = '';
  delete d.author; delete d.authorId; delete d.editor; delete d.editedAt;
  d.date = todayIso();
  delete d.parentId;
  return d;
}
// 총액 맞추기 결과 반영: 노임단가 × 적용률 방식이면 고른 쪽(적용률 · 노임단가)을 바꾼다
function applySolve(d, r) {
  if (r.rates) { d.groups.forEach((g, i) => { g.rate = r.rates[i]; }); return; }
  if (d.rate.mode !== 'direct' && d.rate.solve === 'base' && num(d.rate.factor) > 0) {
    const f = num(d.rate.factor);
    const b0 = Math.round(r.rate / f);
    for (let k = 0; k <= 50; k++) {
      for (const b of [b0 - k, b0 + k]) if (b > 0 && Math.round(b * f) === r.rate) { d.rate.base = b; return; }
    }
  }
  if (r.factor !== undefined && d.rate.mode !== 'direct') d.rate.factor = r.factor;
  else d.rate = { ...d.rate, mode: 'direct', direct: r.rate };
}

// 견적 → 거래명세서 · 청구서: 견적의 최종 금액이 그대로 이어지도록 단수 조정 줄을 붙인다
//   VAT별도 견적 2,531,200 → 명세서 공급가액 2,531,200 + 부가세 253,120 = 2,784,320 (절사 없음)
function convertDoc(src, type) {
  const d = clone(src);
  const t = S.types[type];
  const keep = compute(src).final;
  Object.assign(d, {
    type, no: '', date: todayIso(), title: t.title, notes: t.notes, target: null,
    extra: extraOf(t).map(([label, value]) => ({ label, value })),
  });
  let want;
  if (type === 'quote') { d.rounding = t.rounding ?? 100; want = keep; }
  else { d.rounding = 1; d.vat = 'incl'; d.showVat = true; want = src.vat === 'excl' ? keep + Math.floor(keep / 10) : keep; }
  d.account = d.vat === 'incl' ? 'business' : 'personal';
  const base = compute(d);
  if (base.final !== want) {
    const adjGroup = { name: '조정', lines: [{ kind: 'fixed', text: `견적 금액 단수 조정(${src.no || '원본'})`, amount: 0, note: '' }] };
    d.groups.push(adjGroup);
    const net = d.vat === 'incl' ? want / 1.1 : want;
    const guess = Math.round(net - base.subtotal);
    let best = null;
    for (let k = 0; k <= 200; k++) {
      for (const a of [guess - k, guess + k]) {
        adjGroup.lines[0].amount = a;
        const f = compute(d).final;
        if (f === want) { best = a; break; }
      }
      if (best !== null) break;
    }
    adjGroup.lines[0].amount = best ?? guess;
    if (!adjGroup.lines[0].amount) d.groups.pop();
  }
  d.parentId = src.id || null;
  return d;
}

// ── 편집기 ─────────────────────────────────────────────────────────
async function viewEditor({ id, type, draft }) {
  fresh('<p class="loading">불러오는 중…</p>');
  // 글꼴은 기다리지 않고 화면부터 띄운 뒤, 받아지면 미리보기를 다시 그린다(처음 방문 때 빠르게)
  const fontReady = loadDocFont().then(clearMeasure).catch(() => null);
  await loadStamp().catch(() => null);
  const ed = { id: null, version: 0, doc: null, saved: '', children: [], parent: null, prev: null, deleted: 0 };
  let flash = '';
  if (id) {
    const j = await api('GET', `/api/docs/${id}`);
    Object.assign(ed, { id, version: j.version, doc: j.doc, children: j.children, parent: j.parent, prev: j.prev, deleted: j.deleted, slug: j.slug });
    ed.doc.id = id;
    ed.saved = JSON.stringify(ed.doc);
  } else if (draft && pendingDoc) {
    ed.doc = pendingDoc.doc;
    flash = pendingDoc.msg;
    pendingDoc = null;
  } else {
    ed.doc = newDoc(S, type, todayIso());
    if (listState.cat) ed.doc.category = listState.cat;
    ed.doc.rounding = S.types[type].rounding ?? ed.doc.rounding;
  }
  const doc = () => ed.doc;
  const dirty = () => JSON.stringify(ed.doc) !== ed.saved;
  const imgs = (kind) => {
    if (doc().stamp === false || !stamp) return null;
    const o = kind === 'buf' ? { stamp: stamp.buf, seal: stamp.sealBuf } : { stamp: stamp.url, seal: stamp.sealUrl };
    return o.stamp || o.seal ? o : null;
  };

  fresh(`
  <div class="ed" data-pane="form">
    <div class="ed-bar">
      <div class="ed-bar-in">
        <a class="btn btn-ghost btn-sm" href="#/">← 목록</a>
        <div class="ed-id"><span class="badge" id="edBadge"></span><b id="edNo"></b><span class="ed-state" id="edState"></span><span class="ed-who" id="edWho"></span></div>
        <div class="ed-actions">
          <button class="btn btn-icon" id="bUndo" type="button" aria-label="되돌리기 (Ctrl+Z)" title="되돌리기 (Ctrl+Z)" disabled>↶</button>
          <button class="btn btn-icon" id="bRedo" type="button" aria-label="다시 하기 (Ctrl+Y)" title="다시 하기 (Ctrl+Y)" disabled>↷</button>
          <button class="btn btn-primary" id="bSave" type="button">저장</button>
          <button class="btn btn-blue btn-hide-sm" id="bSaveAs" type="button" title="열어 둔 문서는 그대로 두고, 지금 내용을 새 문서(새 번호)로 저장합니다" hidden>다른 문서로 저장</button>
          <button class="btn" id="bXlsx" type="button">엑셀</button>
          <button class="btn" id="bPdf" type="button">PDF</button>
          <button class="btn btn-hide-sm" id="bDocx" type="button" title="워드 파일 · 한컴오피스 한글에서도 열립니다">워드</button>
          <button class="btn btn-hide-sm" id="bPrint" type="button">인쇄</button>
          <button class="btn btn-share" id="bShare" type="button" title="고객에게 보낼 문서 링크 — 카톡 · 문자로 보내면 로그인 없이 보고 PDF로 받을 수 있습니다">공유</button>
          <button class="btn btn-icon" id="bMore" type="button" aria-label="더보기" aria-haspopup="true">⋯</button>
          <div class="menu" id="moreMenu" hidden>
            <button type="button" data-act="print" class="menu-sm">인쇄</button>
            <button type="button" data-act="docx" class="menu-sm">워드로 내려받기</button>
            <button type="button" data-act="saveas" class="menu-sm">다른 문서로 저장</button>
            <button type="button" data-act="dup">복제해서 새 문서</button>
            <button type="button" data-act="tpl">새 템플릿으로 저장</button>
            <button type="button" data-act="tplover" hidden>템플릿 기본값으로 저장</button>
            <button type="button" data-act="to-statement">거래명세서로 만들기</button>
            <button type="button" data-act="to-invoice">청구서로 만들기</button>
            <button type="button" data-act="to-quote">견적서로 만들기</button>
            <button type="button" data-act="renumber">문서번호 다시 받기</button>
            <button type="button" data-act="del" class="danger">휴지통으로</button>
          </div>
        </div>
      </div>
      <div class="ed-tabs seg" id="paneSeg">
        <button type="button" data-v="form">입력</button>
        <button type="button" data-v="preview">미리보기</button>
        <button type="button" data-v="check">점검 <span class="cnt" id="chkCnt"></span></button>
      </div>
    </div>

    <div class="ed-grid">
      <div class="ed-form" id="form">
        <div class="tpl-strip" id="tplStrip" hidden>
          <span id="tplStripText"></span>
          <span class="tpl-strip-btns"><button type="button" class="btn btn-sm btn-primary" data-act2="tplover">템플릿 기본값으로 저장</button><button type="button" class="btn btn-sm" data-act2="tpl">새 템플릿으로 저장</button></span>
        </div>
        <p class="flash" id="flash" ${flash ? '' : 'hidden'}>${esc(flash)}</p>
        <p class="flash flash-warn" id="deletedNote" ${ed.deleted ? '' : 'hidden'}>휴지통에 있는 문서입니다. 목록의 휴지통에서 되살릴 수 있습니다.</p>
        <div class="links" id="links"></div>
        <div class="share" id="share" hidden></div>
        <section class="card make-from only-quote">
          <h2 class="sec-title">이 견적으로 만들기</h2>
          <div class="btn-row"><button class="btn" type="button" data-make="to-statement">거래명세서 만들기</button><button class="btn" type="button" data-make="to-invoice">청구서 만들기</button></div>
          <p class="small">견적 금액이 그대로 이어지고(VAT별도 견적이면 부가세를 더해 VAT포함으로), 원본 견적과 서로 연결됩니다. 견적은 먼저 저장됩니다.</p>
        </section>

        <section class="card">
          <h2 class="sec-title">기본 정보</h2>
          <div class="seg seg-wide" id="typeSeg">${TYPE_KEYS.map((k) => `<button type="button" data-v="${k}">${TYPES[k].name}</button>`).join('')}</div>
          <div class="cat-field">
            <label class="field"><span><span class="cat-label">클라이언트 카테고리</span> <b class="req">*</b> <small>필수 · 서식에 인쇄되지 않음</small></span><input class="input" data-k="category" id="fCat" list="catList" placeholder="이름이나 검색어로 찾기 · 예) 한빛상사, 한빛" autocomplete="off"></label>
            <p class="small cat-help">고객별로 문서를 모으는 이름입니다. 고르면 아래 받는 곳이 자동으로 들어갑니다. <button type="button" class="link" id="catFromClient" hidden></button></p>
          </div>
          <datalist id="catList"></datalist>
          <h3 class="form-sub">서식에 들어가는 내용</h3>
          <div class="row-td">
            <label class="field"><span>제목</span><input class="input" data-k="title"></label>
            <label class="field"><span id="dateLabel">날짜</span><span class="with-btn"><input class="input" type="date" data-k="date" id="fDate"><button class="btn btn-sm" type="button" id="bToday">오늘</button></span></label>
          </div>
          <div class="row2">
            <label class="field"><span>수신 <small>서식에 인쇄</small></span><input class="input" data-k="client.name" id="fClient" placeholder="예) 한빛상사 총무팀" list="clientList"></label>
            <label class="field"><span>참조</span><input class="input" data-k="client.ref" id="fRef" placeholder="예) 김하늘 과장님"></label>
          </div>
          <datalist id="clientList"></datalist>
          <div class="extra only-doc" id="extra"></div>
        </section>

        <section class="card only-doc">
          <h2 class="sec-title">금액</h2>
          <div class="opt-row"><span class="opt-label">부가세</span>
            <div class="seg" id="vatSeg"><button type="button" data-v="excl">VAT별도</button><button type="button" data-v="incl">VAT포함</button></div>
          </div>
          <div class="opt-row"><span class="opt-label">합계 아래</span>
            <label class="switch"><input type="checkbox" data-k="showVat" data-bool><span>부가세 · VAT포함 합계 줄 넣기</span></label>
          </div>
          <div class="opt-row"><span class="opt-label">절사</span>
            <div class="seg seg-sm" id="roundSeg">${ROUNDING.map((r) => `<button type="button" data-v="${r.v}">${r.short}</button>`).join('')}</div>
          </div>
          <div class="opt-row"><span class="opt-label">입금계좌</span>
            <div class="seg" id="acctSeg">${Object.entries(ACCOUNTS).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join('')}</div>
          </div>
          <p class="small acct-now" id="acctNow"></p>
          <div class="target">
            <label class="field"><span>총액으로 맞추기 (예: VAT포함 3000만원)</span>
              <span class="with-btn"><input class="input" id="tgIn" inputmode="numeric" placeholder="예) 35,000,000 · 3500만원 · VAT포함 3000만원"><button class="btn btn-primary btn-sm" type="button" id="bTarget">맞추기</button></span>
            </label>
            <div class="opt-row" id="tgHowRow"><span class="opt-label">맞추는 법</span>
              <div class="seg seg-sm" id="tgHow"><button type="button" data-v="rate">기간 그대로 · 일단가 조정</button><button type="button" data-v="period">기간 정하고 · 일단가 조정</button></div>
            </div>
            <label class="field" id="tgPeriodRow" hidden><span>총 기간 (예: 3개월, 60일, 8주 · 1개월 = 22일)</span><input class="input" id="tgPeriod" placeholder="예) 3개월" autocomplete="off"></label>
            <div class="opt-row" id="tgModeRow"><span class="opt-label">바꿀 값</span>
              <div class="seg seg-sm" id="tgMode"><button type="button" data-v="factor">적용률</button><button type="button" data-v="base">노임단가</button></div>
            </div>
            <p class="small" id="tgNote"></p>
          </div>
          <dl class="totals" id="totals"></dl>
        </section>

        <section class="card only-doc" id="rateCard">
          <h2 class="sec-title">단가</h2>
          <div class="opt-row"><span class="opt-label">적용</span>
            <div class="seg" id="byCatSeg"><button type="button" data-v="0">일괄</button><button type="button" data-v="1">분류별</button></div>
          </div>
          <div id="rateSingle">
            <div class="opt-row"><span class="opt-label">방식</span>
              <div class="seg seg-sm" id="rateModeSeg"><button type="button" data-v="formula">노임단가 × 적용률</button><button type="button" data-v="direct">직접 입력</button></div>
            </div>
            <div class="row2" id="rateFormula">
              <label class="field"><span>노임단가(원)</span><input class="input num" data-k="rate.base" data-num inputmode="numeric"></label>
              <label class="field"><span>적용률(배)</span><input class="input num" data-k="rate.factor" data-num data-dec inputmode="decimal"></label>
            </div>
            <label class="field" id="rateDirect"><span>일단가(원)</span><input class="input num" data-k="rate.direct" data-num inputmode="numeric"></label>
            <p class="rate-now">일단가 <b id="rateNow"></b> 원 · 일당 줄 전부에 적용</p>
            <p class="small rate-ref" id="rateRef"></p>
          </div>
          <p class="small" id="rateCatNote" hidden>분류마다 단가를 아래 항목 표의 분류 이름 옆 칸에 넣습니다. 비워 두면 일괄 단가(<b id="rateNow2"></b>원)를 씁니다.</p>
        </section>

        <section class="card only-doc">
          <div class="sec-head"><h2 class="sec-title">항목</h2>
            <div class="sec-tools"><button class="btn btn-sm" type="button" id="bLib">항목 창고</button><button class="btn btn-sm" type="button" id="bTpl">기본 구성으로</button></div>
          </div>
          <div id="items" class="items"></div>
          <button class="btn btn-sm btn-dashed" type="button" id="bAddGroup">+ 분류 추가</button>
        </section>

        <section class="card">
          <div class="sec-head"><h2 class="sec-title" id="notesTitle">참고사항</h2><div class="sec-tools"><button class="btn btn-sm" type="button" id="bNotesDef">기본 문구로</button></div></div>
          <div class="chips" id="tokChips">
            ${['{수신}', '{연도}', '{계좌}', '{상호}', '{대표자}', '{날짜}'].map((t) => `<button type="button" class="chip" data-tok="${t}">${t}</button>`).join('')}
            <button type="button" class="chip" data-tok="**굵게**"><b><u>굵게 · 밑줄</u></b></button>
          </div>
          <div class="rich-left" id="notesWrap"><div class="rich-ed input" id="fNotesRich" contenteditable="true" spellcheck="false" aria-label="참고사항"></div></div>
          <textarea data-k="notes" id="fNotes" hidden></textarea>
          <p class="small">초록 꼬리표({연도} · {계좌})는 문서 날짜의 해 · 고른 입금계좌로 자동으로 바뀝니다. 글자를 고르고 '굵게 · 밑줄'(Ctrl+B)을 누르면 굵게 밑줄이 됩니다.</p>
        </section>

        <section class="card">
          <h2 class="sec-title">출력 · 메모</h2>
          <label class="switch only-doc"><input type="checkbox" data-k="fillRows" data-bool><span>빈 줄로 A4 한 장 채우기</span></label>
          <label class="switch only-letter"><input type="checkbox" data-k="multiPage" data-bool><span>본문이 길면 다음 장으로 넘기기 (끄면 A4 한 장)</span></label>
          <label class="switch"><input type="checkbox" data-k="stamp" data-bool><span>도장 찍기 (직인 지름 1.6cm · 공문 사각 도장 2cm)</span></label>
          <label class="field"><span>내부 메모 (인쇄 안 됨)</span><textarea class="input" rows="3" data-k="memo" placeholder="예) 한 항목에 비용을 몰지 말 것"></textarea></label>
        </section>
      </div>

      <aside class="ed-side">
        <div class="checks card" id="checks"></div>
        <div class="paper-tools">
          <p class="paper-hint">서식의 글자를 눌러 바로 고칠 수 있습니다. 누른 칸은 왼쪽 입력칸에도 표시됩니다.</p>
          <div class="seg seg-sm" id="fitSeg"><button type="button" data-v="full">넓게 보기</button><button type="button" data-v="fit">화면에 맞추기</button></div>
          <button type="button" class="btn btn-sm" id="bFull" title="문서만 전체화면으로 — 글자를 눌러 바로 고칠 수 있습니다 (Esc 로 닫기)">⛶ 전체화면</button>
        </div>
        <div class="paper" id="paper"><div id="paperSvg"></div><div class="hits" id="hits"></div></div>
      </aside>
    </div>
  </div>`);

  const paneSeg = segInit($('#paneSeg'), (v) => { $('.ed').dataset.pane = v; window.scrollTo(0, 0); requestAnimationFrame(replaceSegs); });
  paneSeg.set('form');

  // 값 넣기 · 읽기 (data-k="client.name")
  const getK = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), doc());
  const setK = (k, v) => { const ps = k.split('.'); const last = ps.pop(); const o = ps.reduce((a, p) => (a[p] ??= {}), doc()); o[last] = v; };
  const fmtNum = (v, dec) => (v === '' || v === null || v === undefined ? '' : dec ? String(v) : Number(v).toLocaleString('ko-KR'));
  function fillForm() {
    $$('[data-k]', view).forEach((el) => {
      const v = getK(el.dataset.k);
      if (el.type === 'checkbox') el.checked = el.dataset.k === 'showVat' ? !!v : v !== false;
      else if (el.dataset.num !== undefined) el.value = fmtNum(v, el.dataset.dec !== undefined);
      else el.value = v ?? '';
    });
    refreshNotesLeft();
  }
  function refreshNotesLeft() {
    const el = $('#fNotesRich');
    if (!el || document.activeElement === el) return;
    const letter = doc().type === 'letter';
    $('#notesWrap').classList.toggle('inl-letter', letter);
    el.innerHTML = richHTML(doc().notes, letter);
  }
  view.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num !== undefined) v = String(el.value).trim() === '' ? '' : num(el.value);
    setK(el.dataset.k, v);
    if (el.dataset.k === 'date') renderHead();
    update(el.type !== 'checkbox');
  });
  view.addEventListener('change', (e) => { if (e.target.matches('[data-k][type=checkbox]')) update(); });
  view.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.matches && el.matches('[data-num]:not([data-dec])') && el.value.trim()) el.value = fmtNum(num(el.value));
  });

  // 기본 정보
  const typeSeg = segInit($('#typeSeg'), (v) => {
    const d = doc();
    const oldT = S.types[d.type];
    if (d.title === oldT.title || d.title === TYPES[d.type].name) d.title = S.types[v].title;
    // 추가 칸이 그 종류 기본값 그대로거나 비어 있으면 새 종류 기본값으로(빈 칸 두 줄은 화면용이라 빼고 비교)
    const filled = (d.extra || []).filter((e) => String(e.label || '').trim() || String(e.value || '').trim()).map((e) => [e.label, e.value]);
    const sameExtra = !filled.length || JSON.stringify(filled) === JSON.stringify(extraOf(oldT));
    if (sameExtra) d.extra = extraOf(S.types[v]).map(([label, value]) => ({ label, value }));
    if (d.notes === oldT.notes) d.notes = S.types[v].notes;
    d.type = v;
    fillForm(); renderExtra(); renderHead(); renderItems(); update();
  });
  $('#bToday').onclick = () => { doc().date = todayIso(); fillForm(); renderHead(); update(); };
  function renderExtra() {
    const d = doc();
    while ((d.extra || []).length < 2) (d.extra ||= []).push({ label: '', value: '' });
    $('#extra').innerHTML = d.extra.slice(0, 2).map((e, i) => `
      <div class="extra-row">
        <input class="input extra-label" data-k="extra.${i}.label" placeholder="항목 이름" aria-label="추가 항목 이름">
        <input class="input" data-k="extra.${i}.value" placeholder="내용" aria-label="추가 항목 내용">
      </div>`).join('');
    fillForm();
  }
  function renderHead() {
    const d = doc();
    $('#edBadge').className = `badge badge-${d.type}`;
    $('#edBadge').textContent = TYPES[d.type].name;
    $('#edNo').textContent = d.no || '새 문서';
    $('#bSaveAs').hidden = !ed.id;
    $('#tplStrip').hidden = !d.tplId;
    $('#tplStripText').innerHTML = d.tplId ? `<b>'${esc(d.tplName || '')}'</b> 템플릿에서 시작한 문서입니다.` : '';
    const ov = $('#moreMenu [data-act="tplover"]'); if (ov) ov.hidden = !d.tplId;
    $$('[data-act="saveas"]', view).forEach((b) => { b.hidden = !ed.id; });
    $('#edWho').textContent = d.author ? `작성 ${d.author}${d.editor && d.editor !== d.author ? ` · 수정 ${d.editor}` : ''}` : '';
    $('#dateLabel').textContent = TYPES[d.type].dateLabel;
    $('.ed').dataset.type = d.type;
    $('#notesTitle').textContent = d.type === 'letter' ? '본문' : '참고사항';
    typeSeg.set(d.type);
    const ls = [];
    if (ed.parent) ls.push(`원본: <a href="#/doc/${ed.parent.id}">${TYPES[ed.parent.type]?.name} ${esc(ed.parent.no)}</a>`);
    if (ed.children.length) ls.push(`만든 문서: ${ed.children.map((c) => `<a href="#/doc/${c.id}">${TYPES[c.type]?.name} ${esc(c.no)}</a>`).join(', ')}`);
    $('#links').innerHTML = ls.map((l) => `<p>${l}</p>`).join('');
    // 고객에게 보내는 주소
    const sh = $('#share');
    sh.hidden = !ed.slug;
    if (ed.slug) {
      const u = docLink(ed.slug);
      sh.innerHTML = `<div class="share-row"><span class="share-label">문서 링크</span><a class="share-url" href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, ''))}</a><button type="button" class="btn btn-sm btn-primary" data-sh="copy">링크 복사</button></div>
        <p class="small">이 주소를 카톡 · 문자로 보내면 고객이 로그인 없이 보고 PDF로 받을 수 있습니다. 저장한 내용이 보입니다.</p>`;
    }
    document.title = `${d.no || '새 문서'} ${TYPES[d.type].name} · J-Docs`;
  }

  // 금액 옵션
  const vatSeg = segInit($('#vatSeg'), (v) => {
    const d = doc();
    d.vat = v;
    if (v === 'incl' && !d.showVat) { d.showVat = true; fillForm(); }
    // VAT포함은 사업자 계좌, VAT별도는 개인 계좌
    const want = v === 'incl' ? 'business' : 'personal';
    if (accountKey(d, S) !== want) { d.account = want; toast(`입금계좌를 ${ACCOUNTS[want]} 계좌로 바꿨습니다.`); }
    update();
  });
  const roundSeg = segInit($('#roundSeg'), (v) => { doc().rounding = +v; update(); });
  const acctSeg = segInit($('#acctSeg'), (v) => { doc().account = v; update(); });
  const byCatSeg = segInit($('#byCatSeg'), (v) => {
    const d = doc();
    d.rate.byCat = v === '1';
    if (d.rate.byCat) { const r = compute(d).rate; d.groups.forEach((g) => { if (g.rate === undefined || g.rate === '' || g.rate === null) g.rate = r; }); }
    renderItems(); update();
  });
  const tgMode = segInit($('#tgMode'), (v) => { doc().rate.solve = v; update(); });
  const rateModeSeg = segInit($('#rateModeSeg'), (v) => {
    const d = doc();
    const cur = compute(d).rate;
    d.rate.mode = v;
    if (v === 'direct') d.rate.direct = cur;
    else if (num(d.rate.base) > 0) d.rate.factor = +(cur / num(d.rate.base)).toFixed(6);
    fillForm(); update();
  });

  // 목표 금액
  // 총 기간: "3개월" → 66일(1개월 22일) · "8주" → 40일 · "60일" / "60" → 60일
  const parsePeriod = (t) => {
    const m = /([\d.]+)\s*(개월|달|월|주|일)?/.exec(String(t || '').replace(/,/g, ''));
    if (!m) return 0;
    const n = parseFloat(m[1]);
    if (!(n > 0)) return 0;
    return m[2] === '주' ? n * 5 : m[2] && m[2] !== '일' ? n * 22 : n;
  };
  let tgHow = 'rate';
  const tgHowSeg = segInit($('#tgHow'), (v) => { tgHow = v; $('#tgPeriodRow').hidden = v !== 'period'; if (v === 'period') $('#tgPeriod').focus(); });
  tgHowSeg.set('rate');
  // 일당 줄의 기간을 비율대로 늘리고 줄여 합이 정확히 총 기간이 되게(0.5일 단위)
  function spreadDays(d, total) {
    const lines = d.groups.flatMap((g) => g.lines.filter((l) => !l.kind || l.kind === 'day'));
    const sum0 = lines.reduce((a, l) => a + num(l.qty), 0);
    if (!lines.length || sum0 <= 0) return false;
    const k = total / sum0;
    lines.forEach((l) => { l.qty = Math.max(0.5, Math.round(num(l.qty) * k * 2) / 2); });
    let diff = Math.round((total - lines.reduce((a, l) => a + num(l.qty), 0)) * 2) / 2;
    const order = lines.slice().sort((a, b) => num(b.qty) - num(a.qty));
    for (let i = 0; diff !== 0 && i < 400; i++) {
      const l = order[i % order.length];
      const step = diff > 0 ? 0.5 : -0.5;
      if (num(l.qty) + step >= 0.5) { l.qty = num(l.qty) + step; diff -= step; }
    }
    return true;
  }
  $('#bTarget').onclick = () => {
    const d = doc();
    const p = parseQuick($('#tgIn').value);
    if (p.vat) { d.vat = p.vat; d.account = p.vat === 'incl' ? 'business' : 'personal'; }
    if (!p.amount) { toast('금액을 넣어 주세요. 예) 35,000,000 또는 3500만원', 'err'); return; }
    let periodNote = '';
    if (tgHow === 'period') {
      const days = parsePeriod($('#tgPeriod').value);
      if (!days) { toast('총 기간을 넣어 주세요. 예) 3개월, 60일', 'err'); $('#tgPeriod').focus(); return; }
      if (!spreadDays(d, days)) { toast('일수 × 일단가 줄이 없어 기간으로 나눌 수 없습니다.', 'err'); return; }
      periodNote = ` · 총 ${days}일로 나눔`;
    }
    const r = solveTarget(d, p.amount, d.vat);
    if (r.rate === undefined && !r.rates) { toast(r.msg, 'err'); return; }
    applySolve(d, r);
    if (d.vat === 'incl') d.showVat = true;
    d.target = { amount: p.amount, vat: d.vat };
    fillForm(); renderItems(); update();
    toast(r.ok ? `${vatWord(d)} ${won(p.amount)}원에 맞췄습니다${periodNote}.` : r.msg, r.ok ? '' : 'err');
  };
  $('#tgIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#bTarget').click(); } });
  $('#tgPeriod').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#bTarget').click(); } });
  $('#tgPeriod').addEventListener('input', () => { const n = parsePeriod($('#tgPeriod').value); $('#tgNote').textContent = n ? `→ 일당 줄 기간을 합쳐 ${n}일이 되게 나누고 일단가를 맞춥니다` : ''; });
  $('#tgIn').addEventListener('input', () => {
    // 숫자만 쓸 때는 쓰는 대로 천 단위 쉼표
    const el = $('#tgIn');
    if (/^[\d,]+$/.test(el.value) && el.value.replace(/,/g, '')) { const v = Number(el.value.replace(/,/g, '')).toLocaleString('ko-KR'); if (v !== el.value) el.value = v; }
    const p = parseQuick(el.value);
    $('#tgNote').textContent = p.amount ? `→ ${(p.vat || doc().vat) === 'incl' ? 'VAT포함' : 'VAT별도'} ${won(p.amount)}원` : '';
  });

  // 항목 표
  function renderItems() {
    const d = doc();
    const c = compute(d);
    const goods = d.style === 'goods';
    $('#rateCard').hidden = goods;
    $('#bLib').hidden = goods; $('#bTpl').hidden = goods;
    $('#bAddGroup').textContent = goods ? '+ 품목 추가' : '+ 분류 추가';
    if (goods) {
      $('#items').innerHTML = d.groups.map((g, gi) => {
        const l = g.lines[0] || {};
        const lc = c.groups[gi].lines[0] || { amount: 0 };
        return `
        <div class="grp grp-goods" data-gi="${gi}">
          <div class="grp-head">
            <span class="gd-no">${gi + 1}</span>
            <input class="input grp-name" data-gf="name" value="${esc(g.name)}" placeholder="품명" aria-label="품명">
            <span class="grp-sum" data-sum="${gi}">${won(lc.amount)}</span>
            <span class="grp-btns">
              <button type="button" class="btn btn-icon btn-sm" data-act="g-up" aria-label="위로" ${gi ? '' : 'disabled'}>▲</button>
              <button type="button" class="btn btn-icon btn-sm" data-act="g-down" aria-label="아래로" ${gi < d.groups.length - 1 ? '' : 'disabled'}>▼</button>
              <button type="button" class="btn btn-icon btn-sm" data-act="g-del" aria-label="품목 삭제">✕</button>
            </span>
          </div>
          <div class="ln gd-ln" data-gi="${gi}" data-li="0">
            <label class="gd-spec"><span>규격</span><textarea class="input" data-f="text" rows="${Math.min(10, Math.max(2, String(l.text || '').split('\n').length))}" placeholder="규격 · 사양 (줄바꿈 가능)">${esc(l.text || '')}</textarea></label>
            <label><span>단위</span><input class="input" data-f="uom" value="${esc(l.uom ?? 'EA')}"></label>
            <label><span>수량</span><input class="input num" data-f="qty" inputmode="decimal" value="${esc(l.qty ?? '')}"></label>
            <label><span>단가</span><input class="input num" data-f="unit" inputmode="numeric" value="${l.unit === '' || l.unit === undefined ? '' : won(l.unit)}"></label>
            <label><span>비고</span><input class="input" data-f="note" value="${esc(l.note || '')}"></label>
            <span class="ln-amt" data-amt hidden>${won(lc.amount)}</span>
          </div>
        </div>`;
      }).join('') || '<p class="empty">품목을 추가하세요.</p>';
      return;
    }
    const byCat = !!d.rate.byCat;
    $('#items').innerHTML = d.groups.map((g, gi) => `
      <div class="grp" data-gi="${gi}">
        <div class="grp-head">
          <input class="input grp-name" data-gf="name" value="${esc(g.name)}" placeholder="분류 이름" aria-label="분류 이름">
          ${byCat ? `<label class="grp-rate"><span>단가</span><input class="input num" data-gf="rate" inputmode="numeric" value="${g.rate === undefined || g.rate === '' ? '' : won(g.rate)}"></label>` : ''}
          <span class="grp-sum" data-sum="${gi}">${won(c.groups[gi].total)}</span>
          <span class="grp-btns">
            <button type="button" class="btn btn-icon btn-sm" data-act="g-up" aria-label="분류 위로" ${gi ? '' : 'disabled'}>▲</button>
            <button type="button" class="btn btn-icon btn-sm" data-act="g-down" aria-label="분류 아래로" ${gi < d.groups.length - 1 ? '' : 'disabled'}>▼</button>
            <button type="button" class="btn btn-icon btn-sm" data-act="g-del" aria-label="분류 삭제">✕</button>
          </span>
        </div>
        <div class="lns">
          ${(g.lines || []).map((l, li) => lineRow(d, g, l, gi, li, c.groups[gi].lines[li])).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-dashed" data-act="add-line">+ 줄 추가</button>
      </div>`).join('') || '<p class="empty">분류를 추가하세요.</p>';
  }
  function lineRow(d, g, l, gi, li, lc) {
    const kind = l.kind || 'day';
    const val = (v) => (v === undefined || v === null || v === '' ? '' : won(v));
    return `
      <div class="ln k-${esc(kind)}" data-gi="${gi}" data-li="${li}">
        <button type="button" class="handle" aria-label="끌어서 순서 바꾸기">⋮⋮</button>
        <input class="input ln-text" data-f="text" value="${esc(l.text)}" placeholder="내용" aria-label="내용">
        <select class="input ln-kind" data-f="kind" aria-label="계산 방식">
          <option value="day" ${kind === 'day' ? 'selected' : ''}>일수 × 일단가</option>
          <option value="unit" ${kind === 'unit' ? 'selected' : ''}>수량 × 단가</option>
          <option value="fixed" ${kind === 'fixed' ? 'selected' : ''}>정액</option>
        </select>
        ${kind !== 'fixed' ? `<input class="input num ln-qty" data-f="qty" inputmode="decimal" value="${esc(l.qty ?? '')}" aria-label="${kind === 'day' ? '일수' : '수량'}" placeholder="${kind === 'day' ? '일' : '수량'}">` : '<span class="ln-qty ln-blank"></span>'}
        ${kind === 'unit' ? `<input class="input num ln-unit" data-f="unit" inputmode="numeric" value="${val(l.unit)}" aria-label="단가" placeholder="단가">`
          : kind === 'fixed' ? `<input class="input num ln-unit" data-f="amount" inputmode="numeric" value="${val(l.amount)}" aria-label="금액" placeholder="금액">`
          : `<span class="ln-unit ln-rate" data-rate>${won(lc.unit)}</span>`}
        <input class="input ln-note" data-f="note" value="${esc(l.note || '')}" placeholder="비고" aria-label="비고">
        <span class="ln-amt" data-amt>${won(lc.amount)}</span>
        <button type="button" class="btn btn-icon btn-sm ln-del" data-act="l-del" aria-label="줄 삭제">✕</button>
      </div>`;
  }
  const items = $('#items');
  items.addEventListener('input', (e) => {
    const d = doc();
    const t = e.target;
    const grp = t.closest('.grp');
    if (!grp) return;
    const g = d.groups[+grp.dataset.gi];
    if (t.dataset.gf) { g[t.dataset.gf] = t.dataset.gf === 'rate' ? (t.value.trim() === '' ? '' : num(t.value)) : t.value; update(true); return; }
    const row = t.closest('.ln');
    if (!row || !t.dataset.f) return;
    const l = g.lines[+row.dataset.li];
    const f = t.dataset.f;
    if (f === 'kind') return;
    l[f] = ['qty', 'unit', 'amount'].includes(f) ? (t.value.trim() === '' ? '' : num(t.value)) : t.value;
    update(true);
  });
  items.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f !== 'kind') return;
    const row = t.closest('.ln');
    const g = doc().groups[+row.dataset.gi];
    const l = g.lines[+row.dataset.li];
    const old = compute(doc()).groups[+row.dataset.gi].lines[+row.dataset.li];
    l.kind = t.value;
    if (l.kind === 'fixed' && !num(l.amount)) l.amount = old.amount;
    if (l.kind === 'unit' && !num(l.unit)) { l.unit = old.unit || old.amount; if (l.qty === '' || l.qty === undefined) l.qty = 1; }
    if (l.kind !== 'fixed' && (l.qty === '' || l.qty === undefined)) l.qty = 1;
    renderItems(); update();
  });
  items.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.matches('[data-f=unit],[data-f=amount],[data-gf=rate]') && t.value.trim()) t.value = won(num(t.value));
  });
  items.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const d = doc();
    const gi = +b.closest('.grp').dataset.gi;
    const act = b.dataset.act;
    if (act === 'add-line') {
      const prev = d.groups[gi].lines.at(-1);
      d.groups[gi].lines.push({ kind: prev && prev.kind !== 'fixed' ? prev.kind : 'day', text: '', qty: 1, note: '' });
      renderItems(); update();
      const rows = $$(`.grp[data-gi="${gi}"] .ln-text`, items);
      rows.at(-1)?.focus();
    }
    if (act === 'l-del') { d.groups[gi].lines.splice(+b.closest('.ln').dataset.li, 1); renderItems(); update(); }
    if (act === 'g-up' && gi > 0) { [d.groups[gi - 1], d.groups[gi]] = [d.groups[gi], d.groups[gi - 1]]; renderItems(); update(); }
    if (act === 'g-down' && gi < d.groups.length - 1) { [d.groups[gi + 1], d.groups[gi]] = [d.groups[gi], d.groups[gi + 1]]; renderItems(); update(); }
    if (act === 'g-del') {
      const g = d.groups[gi];
      if (g.lines.length && d.style !== 'goods') {
        const ok = await modal({ title: '분류 삭제', body: `<p>'${esc(g.name)}' 분류와 줄 ${g.lines.length}개를 지웁니다.</p>`, buttons: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }] });
        if (!ok) return;
      }
      d.groups.splice(gi, 1); renderItems(); update();
    }
  });
  enableDrag(items, () => {
    const d = doc();
    const old = d.groups.map((g) => g.lines.slice());
    $$('.grp', items).forEach((ge) => {
      const g = d.groups[+ge.dataset.gi];
      g.lines = $$('.ln', ge).map((r) => old[+r.dataset.gi][+r.dataset.li]);
    });
    renderItems(); update();
  });
  $('#bAddGroup').onclick = () => {
    const goods = doc().style === 'goods';
    doc().groups.push({ name: '', lines: [goods ? { kind: 'unit', text: '', uom: 'EA', qty: 1, unit: '', note: '' } : { kind: 'day', text: '', qty: 1, note: '' }] });
    renderItems(); update(); $$('.grp-name', items).at(-1)?.focus();
  };
  $('#bTpl').onclick = async () => {
    const ok = await modal({ title: '기본 구성으로', body: '<p>지금 항목을 모두 지우고 설정의 기본 구성으로 바꿉니다.</p>', buttons: [{ label: '취소', value: false }, { label: '바꾸기', value: true, kind: 'primary' }] });
    if (!ok) return;
    doc().groups = clone(S.template);
    renderItems(); update();
  };
  $('#bLib').onclick = async () => {
    const lib = S.library || [];
    const groups = [...new Set(lib.map((x) => x.group))];
    const body = `<p class="small">고른 항목을 같은 이름의 분류 끝에 넣습니다. 없는 분류는 새로 만듭니다.</p>
      <div class="lib">${groups.map((gname) => `
        <fieldset class="lib-grp"><legend>${esc(gname)}</legend>
          ${lib.map((x, i) => x.group === gname ? `<label class="check"><input type="checkbox" value="${i}"> ${esc(x.text.replace(/\*\*/g, ''))} <small>${x.kind === 'fixed' ? `${won(x.amount)}원` : `${esc(x.qty)}${x.kind === 'day' ? '일' : '개'}`}</small></label>` : '').join('')}
        </fieldset>`).join('')}</div>`;
    const picked = await modal({ title: '항목 창고', body, wide: true, buttons: [{ label: '닫기', value: null }, { label: '넣기', kind: 'primary', value: (card) => $$('input:checked', card).map((i) => +i.value) }] });
    if (!picked || !picked.length) return;
    const d = doc();
    picked.forEach((i) => {
      const { group, ...line } = lib[i];
      let g = d.groups.find((x) => x.name === group);
      if (!g) { g = { name: group, lines: [] }; d.groups.push(g); }
      g.lines.push(clone(line));
    });
    renderItems(); update();
    toast(`${picked.length}줄을 넣었습니다.`);
  };

  // 참고사항
  $('#tokChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tok]');
    if (!b) return;
    const ed = $('#fNotesRich');
    const sel = getSelection();
    if (!ed.contains(sel.anchorNode)) { ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    const tok = b.dataset.tok;
    if (tok === '**굵게**') document.execCommand('bold');
    else document.execCommand('insertHTML', false, `<span class="tok" contenteditable="false" data-tok="${tok}">${esc(TOK_LABEL(tok))}</span>&nbsp;`);
    syncNotesLeft();
  });
  function syncNotesLeft() {
    const ed = $('#fNotesRich');
    const letter = doc().type === 'letter';
    restyle(ed, letter);
    const t = richText(ed);
    doc().notes = t;
    $('#fNotes').value = t;
    update(true);
  }
  $('#fNotesRich').addEventListener('input', syncNotesLeft);
  $('#fNotesRich').addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  $('#fNotesRich').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); syncNotesLeft(); } });
  $('#fNotesRich').addEventListener('blur', () => record(false));
  $('#bNotesDef').onclick = () => { doc().notes = S.types[doc().type].notes; fillForm(); update(); };

  // 미리보기 · 점검 · 합계
  let model = null, issues = [], upT = 0;
  function update(typing) {
    clearTimeout(upT);
    record(typing);
    refreshNumbers();
    upT = setTimeout(renderPreview, 90);
  }

  // 되돌리기 · 다시 하기: 바뀔 때마다 한 단계씩 쌓는다(글자 입력은 잠깐 멈출 때 한 단계)
  const snap = () => JSON.stringify({ ...ed.doc, no: undefined, id: undefined });
  const hist = [snap()];
  let hi = 0, histT = 0;
  function commit() {
    clearTimeout(histT); histT = 0;
    const s = snap();
    if (s === hist[hi]) return;
    hist.splice(hi + 1);
    hist.push(s);
    if (hist.length > 300) hist.shift();
    hi = hist.length - 1;
    histBtns();
  }
  function record(typing) {
    if (typing) { clearTimeout(histT); histT = setTimeout(commit, 600); histBtns(true); } else commit();
  }
  function histBtns(pending) {
    $('#bUndo').disabled = !(hi > 0 || pending);
    $('#bRedo').disabled = pending || hi >= hist.length - 1;
  }
  function travel(step) {
    closeInline();
    if (histT) commit();
    const to = hi + step;
    if (to < 0 || to >= hist.length) return;
    hi = to;
    const n = JSON.parse(hist[hi]);
    n.no = ed.doc.no; n.id = ed.doc.id;
    ed.doc = n;
    fillForm(); renderExtra(); renderHead(); renderItems(); refreshNumbers(); renderPreview();
    histBtns();
    toast(step < 0 ? `되돌렸습니다 (${hi}단계 더 가능)` : '다시 했습니다');
  }
  $('#bUndo').onclick = () => travel(-1);
  $('#bRedo').onclick = () => travel(1);
  view.addEventListener('focusout', () => { if (histT) commit(); });
  function refreshNumbers() {
    const d = doc();
    const c = compute(d);
    $('#rateNow').textContent = won(c.rate);
    $('#rateNow2').textContent = won(c.rate);
    {
      const yr = (d.date || '').slice(0, 4), yb = yearBase(S, d.date);
      const last = [...(S.rateTable || [])].sort((a, b) => b.year - a.year)[0];
      const el = $('#rateRef');
      if (yb) {
        const same = num(d.rate.base) === yb;
        el.innerHTML = `${yr}년 소프트웨어 노임단가(참고) <b>${won(yb)}원</b>${same || d.rate.mode === 'direct' ? ' · 지금 노임단가와 같습니다' : ` · 지금 ${won(d.rate.base)}원 <button type="button" class="link" id="useYearBase">${yr}년 값으로 바꾸기</button>`}`;
        const ub = $('#useYearBase'); if (ub) ub.onclick = () => { doc().rate.base = yb; fillForm(); update(); };
      } else {
        el.innerHTML = `<span class="bad">${yr}년 노임단가가 아직 설정에 없습니다.</span> 보통 전년도 12월에 공표됩니다. 설정 > 연도별 노임단가에 넣어 주세요.${last ? ` (최근: ${esc(last.year)}년 ${won(last.base)}원)` : ''}`;
      }
    }
    const single = !d.rate.byCat;
    byCatSeg.set(single ? '0' : '1');
    rateModeSeg.set(d.rate.mode === 'direct' ? 'direct' : 'formula');
    tgMode.set(d.rate.solve === 'base' ? 'base' : 'factor');
    $('#tgModeRow').hidden = d.rate.mode === 'direct' || !!d.rate.byCat || d.style === 'goods';
    $('#tgHowRow').hidden = d.style === 'goods';
    if (d.style === 'goods') $('#tgPeriodRow').hidden = true;
    $('#rateSingle').hidden = !single;
    $('#rateCatNote').hidden = single;
    $('#rateFormula').hidden = d.rate.mode === 'direct';
    $('#rateDirect').hidden = d.rate.mode !== 'direct';
    vatSeg.set(d.vat);
    roundSeg.set(String(c.unit));
    acctSeg.set(accountKey(d, S));
    $('#acctNow').textContent = accountText(d, S);
    $$('.ln', items).forEach((r) => {
      const lc = c.groups[+r.dataset.gi]?.lines[+r.dataset.li];
      if (!lc) return;
      const a = $('[data-amt]', r); if (a) a.textContent = won(lc.amount);
      const u = $('[data-rate]', r); if (u) u.textContent = won(lc.unit);
    });
    $$('[data-sum]', items).forEach((s) => { s.textContent = won(c.groups[+s.dataset.sum]?.total || 0); });
    const rows = [['합계(공급가액)', c.subtotal]];
    if (d.vat === 'incl' || d.showVat) rows.push(['부가세 10%', c.vat], ['VAT포함 합계', c.gross]);
    if (c.cut) rows.push([`절사 (${ROUNDING.find((r) => r.v === c.unit)?.label})`, -c.cut]);
    rows.push([`${TYPES[d.type].amountLabel} (${vatWord(d)})`, c.final]);
    $('#totals').innerHTML = rows.map(([k, v], i) => `<div class="${i === rows.length - 1 ? 'tot-final' : ''}"><dt>${k}</dt><dd>${won(v)}원</dd></div>`).join('');
    const tg = d.target;
    if (tg && tg.amount && document.activeElement !== $('#tgIn')) {
      $('#tgIn').value = won(tg.amount);
      $('#tgNote').innerHTML = c.final === tg.amount && tg.vat === d.vat
        ? `✓ 목표 ${tg.vat === 'incl' ? 'VAT포함' : 'VAT별도'} ${won(tg.amount)}원과 일치 <button type="button" class="link" id="tgClear">목표 지우기</button>`
        : `<span class="bad">목표 ${won(tg.amount)}원과 다릅니다(지금 ${won(c.final)}원).</span> <button type="button" class="link" id="tgClear">목표 지우기</button>`;
      $('#tgClear').onclick = () => { doc().target = null; $('#tgIn').value = ''; $('#tgNote').textContent = ''; update(); };
    }
    $('#edState').textContent = dirty() ? '● 저장 안 됨' : ed.id ? '저장됨' : '';
    $('#edState').classList.toggle('on', dirty());
  }
  function renderPreview() {
    const d = doc();
    model = layout(d, S);
    $('#paperSvg').innerHTML = toSVG(model, imgs('url'));
    paperEl.classList.toggle('multi', (model.pages || 1) > 1);
    drawHits();
    issues = check(d, S, model, { prev: ed.prev && ed.prev.no !== d.no ? ed.prev : null });
    const er = issues.filter((x) => x.level === 'error').length, wr = issues.length - er;
    $('#chkCnt').textContent = issues.length ? String(issues.length) : '';
    $('#chkCnt').className = `cnt ${er ? 'cnt-err' : wr ? 'cnt-warn' : ''}`;
    const ck = $('#checks');
    ck.classList.toggle('has-err', !!er); ck.classList.toggle('has-warn', !er && !!wr); ck.classList.toggle('is-ok', !issues.length);
    ck.innerHTML = `<button type="button" class="checks-head" data-ck-toggle aria-expanded="${!ck.classList.contains('folded')}"><b>점검</b> ${er ? `<span class="pill pill-err">오류 ${er}</span>` : ''}${wr ? `<span class="pill pill-warn">확인 ${wr}</span>` : ''}${!issues.length ? '<span class="pill pill-ok">문제 없음</span>' : ''}<span class="checks-fold" aria-hidden="true"></span></button>
      ${issues.length ? `<ul>${issues.map((x) => `<li class="chk-${x.level}" ${x.fix ? `data-fix="${x.fix}"` : ''}>${esc(x.msg)}${x.acts ? `<span class="chk-acts">${x.acts.map((a) => `<button type="button" class="btn btn-sm" data-ck-act="${a.id}">${esc(a.label)}</button>`).join('')}</span>` : ''}</li>`).join('')}</ul>` : ''}`;
  }
  // 작업기간 ↔ 표 기간 합계 맞추기
  function periodFix(how) {
    const d = doc();
    const wp = (d.extra || []).find((x) => isWorkPeriod(x.label) && String(x.value || '').trim());
    if (!wp) return;
    const c = compute(d);
    if (how === 'periodText') {
      wp.value = rewritePeriod(wp.value, c.dayUnits);
      fillForm(); update();
      toast(`${wp.label}을 '${wp.value}'로 고쳤습니다.`);
      return;
    }
    const r0 = periodRange(wp.value);
    if (!r0 || r0[0] !== r0[1] || !spreadDays(d, r0[0])) { toast('표 기간을 나눌 수 없습니다.', 'err'); return; }
    const r = solveTarget(d, c.final, d.vat);
    if (r.rate === undefined && !r.rates) { toast(r.msg, 'err'); return; }
    applySolve(d, r);
    fillForm(); renderItems(); update();
    toast(r.ok ? `표 기간을 ${r0[0]}일로 나누고 금액 ${won(c.final)}원은 그대로 두었습니다.` : r.msg, r.ok ? '' : 'err');
  }
  try { if (localStorage.getItem('wd_ckfold') === '1') $('#checks').classList.add('folded'); } catch (e) { /* 무시 */ }
  $('#checks').addEventListener('click', (e) => {
    if (e.target.closest('[data-ck-toggle]')) {
      const c = $('#checks'); c.classList.toggle('folded');
      try { localStorage.setItem('wd_ckfold', c.classList.contains('folded') ? '1' : '0'); } catch (x) { /* 무시 */ }
      return;
    }
    const act = e.target.closest('[data-ck-act]');
    if (act && act.dataset.ckAct === 'titleFromBody') {
      const t = bodyTitle(doc().notes);
      if (t) { doc().title = t; fillForm(); update(); toast(`제목 칸을 '${t}'로 바꿨습니다.`); }
      return;
    }
    if (act) { periodFix(act.dataset.ckAct); return; }
    const li = e.target.closest('[data-fix]');
    if (!li) return;
    const map = { client: '#fClient', ref: '#fRef', date: '#fDate', notes: '#fNotesRich', title: '[data-k=title]', target: '#tgIn', items: '#items', rate: '#rateSingle', vat: '#vatSeg', extra: '#extra' };
    if (li.dataset.fix === 'renumber') { more('renumber'); return; }
    paneSeg.set('form'); $('.ed').dataset.pane = 'form';
    const el = $(map[li.dataset.fix] || '#form');
    if (el) { el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); if (el.focus) el.focus({ preventScroll: true }); }
  });

  // ── 서식 위에서 바로 고치기 ─────────────────────────────────────
  //   서식의 칸을 누르면 그 자리에 입력칸이 열리고, 왼쪽의 같은 입력칸도 표시된다.
  //   왼쪽 입력칸에 들어가면 서식의 그 자리가 노랗게 표시된다.
  const hitsEl = $('#hits'), paperEl = $('#paper');
  let inl = null, syncKey = null;
  // 세로 % 는 전체 높이(여러 장이면 장을 이은 높이) 기준
  const pctH = () => (model ? svgHeight(model) : 297) / 100;
  const pct = (b) => `left:${b.x / 2.1}%;top:${b.y / pctH()}%;width:${b.w / 2.1}%;height:${b.h / pctH()}%`;
  function drawHits() {
    hitsEl.innerHTML = model.boxes.map((b, i) => (b.ed ? `<div class="hit${b.ed.add ? ' hit-add' : ''}" data-bi="${i}" style="${pct(b)}"></div>` : '')).join('');
    if (inl) placeInline();
    if (syncKey) markSync(syncKey, false);
  }
  function leftEl(k) {
    let m;
    if (k === 'notes') return $('#fNotesRich');
    if (k === 'rate') return $(`#form [data-k="${doc().rate.mode === 'direct' ? 'rate.direct' : 'rate.factor'}"]`);
    if ((m = /^groups\.(\d+)\.name$/.exec(k))) return $(`#items .grp[data-gi="${m[1]}"] [data-gf="name"]`);
    if ((m = /^groups\.(\d+)\.lines\.(\d+)\.(\w+)$/.exec(k))) return $(`#items .ln[data-gi="${m[1]}"][data-li="${m[2]}"] [data-f="${m[3]}"]`);
    return $(`#form [data-k="${k}"]`);
  }
  function keyOf(el) {
    if (el.id === 'fNotesRich' || (el.closest && el.closest('#fNotesRich'))) return 'notes';
    if (el.dataset.k) return /^rate\./.test(el.dataset.k) ? 'rate' : el.dataset.k;
    const g = el.closest('.grp'), ln = el.closest('.ln');
    if (el.dataset.gf === 'name' && g) return `groups.${g.dataset.gi}.name`;
    if (el.dataset.f && ln) return `groups.${ln.dataset.gi}.lines.${ln.dataset.li}.${el.dataset.f}`;
    return null;
  }
  function pulseLeft(k) {
    const el = leftEl(k);
    if (!el || !el.offsetParent) return;
    el.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    el.classList.remove('sync-on'); void el.offsetWidth; el.classList.add('sync-on');
    clearTimeout(el._syncT); el._syncT = setTimeout(() => el.classList.remove('sync-on'), 1700);
  }
  function markSync(k, scroll) {
    syncKey = k;
    $$('.hit.on', hitsEl).forEach((h) => h.classList.remove('on'));
    if (!k) return;
    let first = null;
    model.boxes.forEach((b, i) => {
      if (!b.ed || b.ed.k !== k) return;
      const h = $(`[data-bi="${i}"]`, hitsEl);
      if (!h) return;
      h.classList.add('on');
      first = first || h;
    });
    if (scroll && first && paperEl.offsetParent) first.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
  $('#form').addEventListener('focusin', (e) => { const k = keyOf(e.target); if (k) markSync(k, true); });
  $('#form').addEventListener('focusout', () => { if (!inl) markSync(null); });

  const fmtEd = (ed, v) => (ed.num ? (v === '' || v === null || v === undefined ? '' : ed.dec ? String(v) : won(v)) : v ?? '');
  function openInline(bi) {
    const b = model.boxes[bi];
    const ed = b && b.ed;
    if (!ed) return;
    closeInline();
    if (ed.add) { addFromPaper(); return; }
    if (ed.k === 'rate') { pulseLeft('rate'); toast('일단가는 왼쪽 "단가"에서 바꿉니다. 일당 줄 전체에 같이 적용됩니다.'); return; }
    if (ed.k === 'notes') { openRich(b); return; }
    const el = document.createElement(ed.multi ? 'textarea' : 'input');
    el.className = `inl${ed.multi ? ' inl-multi' : ''}`;
    if (ed.date) el.type = 'date';
    if (ed.num) el.inputMode = ed.dec ? 'decimal' : 'numeric';
    el.value = fmtEd(ed, getK(ed.k));
    el.style.textAlign = ed.multi || b.align === 'left' ? 'left' : b.align === 'right' ? 'right' : 'center';
    el.style.fontWeight = b.bold ? 700 : 400;
    paperEl.appendChild(el);
    inl = { ed, el, bi };
    placeInline();
    el.focus({ preventScroll: true });
    if (!ed.multi && !ed.date) el.select();
    if (ed.date && el.showPicker) { try { el.showPicker(); } catch (x) { /* 무시 */ } }
    el.addEventListener('input', () => {
      let v = el.value;
      if (ed.num) v = String(v).trim() === '' ? '' : num(v);
      setK(ed.k, v);
      const le = leftEl(ed.k);
      if (le && le !== el) le.value = ed.num ? fmtEd(ed, v) : el.value;
      if (ed.k === 'date' || ed.k === 'title') renderHead();
      update(true);
      if (ed.multi) fitInline();
    });
    el.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); closeInline(); }
      else if (e.key === 'Tab') { e.preventDefault(); jump(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Enter' && !ed.multi) { e.preventDefault(); jump(1); }
      else if (/^Arrow(Up|Down|Left|Right)$/.test(e.key) && !ed.multi && !ed.date && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        // 방향키로 옆 칸: 위 · 아래는 바로, 좌 · 우는 글자 끝(또는 전체 선택)일 때만
        const len = el.value.length, a = el.selectionStart, z = el.selectionEnd;
        const all = a === 0 && z === len;
        const go = e.key === 'ArrowUp' || e.key === 'ArrowDown' || all
          || (e.key === 'ArrowLeft' && a === 0 && z === 0) || (e.key === 'ArrowRight' && a === len && z === len);
        if (go && moveCell(e.key.slice(5).toLowerCase())) e.preventDefault();
      }
    });
    el.addEventListener('blur', () => setTimeout(() => {
      if (inl && inl.el === el && document.activeElement !== el && !rowBar.contains(document.activeElement)) closeInline();
    }, 150));
    pulseLeft(ed.k);
    markSync(ed.k, false);
    showRowBar(rowEnd(b));
  }
  // ── 본문 · 참고사항: 굵게 · 밑줄 · 번호 들여쓰기가 서식과 똑같이 보이는 편집 칸 ──
  //   저장은 그대로 글자(**굵게**, {계좌})로 하고, 보일 때만 꾸민다.
  const TOK_LABEL = (t) => ({ '{계좌}': accountText(doc(), S), '{연도}': (doc().date || '').slice(0, 4) + '', '{상호}': S.company.name, '{대표자}': S.company.ceo, '{날짜}': krDate(doc().date), '{수신}': doc().client?.name || '{수신}' }[t] || t);
  function lineClass(t, letter, afterSub) {
    if (!letter) return '';
    if (!t.trim()) return 'rl-blank';
    if (/^\s*\d+\.\s/.test(t)) return 'rl-top';
    if (/^\s*\d+\)\s/.test(t)) return 'rl-sub';
    return afterSub ? 'rl-plain2' : 'rl-plain';
  }
  function richHTML(text, letter) {
    let afterSub = false;
    return String(text || '').split('\n').map((ln) => {
      const cls = lineClass(ln, letter, afterSub);
      if (cls === 'rl-sub') afterSub = true; else if (cls === 'rl-top' || cls === 'rl-blank') afterSub = false;
      let h = esc(ln).replace(/\{[^}]+\}/g, (t) => `<span class="tok" contenteditable="false" data-tok="${t}">${esc(TOK_LABEL(t))}</span>`);
      h = h.split('**').map((part, i) => (i % 2 ? `<b>${part}</b>` : part)).join('');
      return `<div class="${cls}">${h || '<br>'}</div>`;
    }).join('');
  }
  function richText(root) {
    const lines = [];
    let cur = '';
    const walk = (n) => {
      if (n.nodeType === 3) { cur += n.nodeValue.replace(/\u00a0/g, ' '); return; }
      if (n.nodeType !== 1) return;
      if (n.dataset && n.dataset.tok) { cur += n.dataset.tok; return; }
      if (n.tagName === 'BR') return;
      const bold = n.tagName === 'B' || n.tagName === 'STRONG';
      if (bold) cur += '**';
      n.childNodes.forEach(walk);
      if (bold) cur += '**';
    };
    root.childNodes.forEach((n) => {
      if (n.nodeType === 1 && (n.tagName === 'DIV' || n.tagName === 'P')) { if (cur) { lines.push(cur); cur = ''; } walk(n); lines.push(cur); cur = ''; }
      else if (n.nodeType === 1 && n.tagName === 'BR') { lines.push(cur); cur = ''; }
      else walk(n);
    });
    if (cur) lines.push(cur);
    return lines.join('\n').replace(/\*\*\*\*/g, '').replace(/\*\*(\s*)\*\*/g, '$1');
  }
  function restyle(root, letter) {
    let afterSub = false;
    root.querySelectorAll(':scope > div').forEach((d) => {
      const cls = lineClass(d.textContent, letter, afterSub);
      if (cls === 'rl-sub') afterSub = true; else if (cls === 'rl-top' || cls === 'rl-blank') afterSub = false;
      d.className = cls;
    });
  }
  function openRich(b) {
    const letter = doc().type === 'letter';
    const wrapEl = document.createElement('div');
    wrapEl.className = `inl inl-rich${letter ? ' inl-letter' : ''}`;
    wrapEl.innerHTML = `<div class="rich-bar"><button type="button" data-rb="bold" title="굵게 · 밑줄 (Ctrl+B)"><b>가</b> 굵게·밑줄</button><button type="button" data-rb="acct" title="입금계좌 넣기">계좌 넣기</button><span class="rich-hint">Esc 닫기 · 고치는 대로 서식에 반영됩니다</span></div><div class="rich-ed" contenteditable="true" spellcheck="false"></div>`;
    const ed = wrapEl.querySelector('.rich-ed');
    ed.innerHTML = richHTML(doc().notes, letter);
    paperEl.appendChild(wrapEl);
    inl = { ed: b.ed, el: wrapEl, rich: true, letter };
    placeInline();
    ed.focus({ preventScroll: true });
    const sync = () => {
      restyle(ed, letter);
      const t = richText(ed);
      doc().notes = t;
      $('#fNotes').value = t;
      refreshNotesLeft();
      update(true);
    };
    ed.addEventListener('input', sync);
    ed.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); closeInline(); }
    });
    ed.addEventListener('paste', (e) => {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    wrapEl.querySelector('.rich-bar').addEventListener('mousedown', (e) => e.preventDefault());
    wrapEl.querySelector('.rich-bar').addEventListener('click', (e) => {
      const bt = e.target.closest('[data-rb]');
      if (!bt) return;
      if (bt.dataset.rb === 'bold') document.execCommand('bold');
      if (bt.dataset.rb === 'acct') document.execCommand('insertHTML', false, `<b><span class="tok" contenteditable="false" data-tok="{계좌}">${esc(TOK_LABEL('{계좌}'))}</span></b>&nbsp;`);
      sync();
    });
    ed.addEventListener('blur', () => setTimeout(() => {
      if (inl && inl.el === wrapEl && !wrapEl.contains(document.activeElement)) closeInline();
    }, 150));
    pulseLeft('notes');
    markSync('notes', false);
  }

  function placeInline() {
    const i = model.boxes.findIndex((x) => x.ed && x.ed.k === inl.ed.k);
    if (i < 0) { closeInline(); return; }
    const b = model.boxes[i], s = paperEl.clientWidth / 210;
    if (inl.rich) {
      // 서식과 같은 글자 크기 · 줄 간격 · 들여쓰기
      const fs = (inl.letter ? 12 : 9.3) * PT * s;
      Object.assign(inl.el.style, { left: `calc(${b.x / 2.1}% - ${s * 1.2 + 2}px)`, top: `${b.y / pctH()}%`, width: `calc(${b.w / 2.1}% + ${s * 2.4 + 4}px)`, minHeight: `${b.h * s}px`, fontSize: `${fs}px` });
      inl.el.style.setProperty('--mm', `${s}px`);
      inl.el.style.setProperty('--lh', inl.letter ? `${8.6 * s}px` : `${9.3 * PT * 1.3 * s}px`);
      return;
    }
    Object.assign(inl.el.style, { left: `${b.x / 2.1}%`, top: `${b.y / pctH()}%`, width: `${b.w / 2.1}%`, minHeight: `${b.h * s}px`, fontSize: `${Math.max(11, b.size * PT * s)}px` });
    if (!inl.ed.multi) inl.el.style.height = `${b.h * s}px`;
    else fitInline();
    if (!rowBar.hidden && inl.ed.row) showRowBar(rowEnd(b));
  }
  function fitInline() { const el = inl && inl.el; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight + 2, parseFloat(el.style.minHeight) || 0)}px`; }
  function closeInline() {
    if (!inl) return;
    const el = inl.el;
    inl = null;
    el.remove();
    rowBar.hidden = true;
    markSync(null);
    record(false);
  }
  // 지금 칸에서 위 · 아래 · 왼쪽 · 오른쪽으로 가장 가까운 고칠 수 있는 칸
  function moveCell(dir) {
    const cur = inl && model.boxes[inl.bi];
    if (!cur) return false;
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    let best = null, bestD = Infinity;
    model.boxes.forEach((b, i) => {
      if (i === inl.bi || !b.ed || !b.ed.k || b.ed.add || b.ed.k === 'rate' || b.bg) return;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const overX = b.x < cur.x + cur.w - 0.3 && b.x + b.w > cur.x + 0.3;
      const overY = b.y < cur.y + cur.h - 0.3 && b.y + b.h > cur.y + 0.3;
      let d;
      if (dir === 'up') { if (by >= cy - 0.3 || !overX) return; d = cy - by; }
      else if (dir === 'down') { if (by <= cy + 0.3 || !overX) return; d = by - cy; }
      else if (dir === 'left') { if (bx >= cx - 0.3 || !overY) return; d = cx - bx; }
      else { if (bx <= cx + 0.3 || !overY) return; d = bx - cx; }
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === null) return false;
    openInline(best);
    return true;
  }
  function jump(dir) {
    const list = model.boxes.filter((b) => b.ed && b.ed.k && b.ed.k !== 'rate');
    const keys = [...new Set(list.map((b) => b.ed.k))];
    const at = keys.indexOf(inl ? inl.ed.k : '');
    const next = keys[at + dir];
    if (!next) { closeInline(); return; }
    openKey(next);
  }
  function openKey(k) {
    const i = model.boxes.findIndex((b) => b.ed && b.ed.k === k);
    if (i >= 0) openInline(i);
  }
  hitsEl.addEventListener('click', (e) => {
    const h = e.target.closest('.hit');
    if (h) openInline(+h.dataset.bi);
  });

  // 줄 도구(위 · 아래 · 추가 · 삭제 · 계산 방식)
  const rowBar = document.createElement('div');
  rowBar.className = 'rowbar';
  rowBar.hidden = true;
  paperEl.appendChild(rowBar);
  let barRow = null;
  function showRowBar(b) {
    const row = b.ed && b.ed.row;
    if (!row) { rowBar.hidden = true; return; }
    const d = doc();
    const grpOnly = d.style === 'goods' || row.li === undefined;
    const what = d.style === 'goods' ? '품목' : row.li === undefined ? '분류' : '줄';
    const kind = !grpOnly ? (d.groups[row.gi]?.lines[row.li]?.kind || 'day') : null;
    const key = `${row.gi}.${row.li}`;
    if (barRow !== key || rowBar.hidden) {
      rowBar.innerHTML = `${kind ? `<select data-ra="kind" aria-label="계산 방식"><option value="day" ${kind === 'day' ? 'selected' : ''}>일수×일단가</option><option value="unit" ${kind === 'unit' ? 'selected' : ''}>수량×단가</option><option value="fixed" ${kind === 'fixed' ? 'selected' : ''}>정액</option></select>` : ''}
        <button type="button" data-ra="up" aria-label="위로">▲</button><button type="button" data-ra="down" aria-label="아래로">▼</button>
        <button type="button" data-ra="add">+ ${what}</button><button type="button" data-ra="del" class="danger" aria-label="${what} 삭제">✕</button>`;
      barRow = key;
    }
    rowBar.dataset.gi = row.gi;
    rowBar.dataset.li = row.li ?? '';
    rowBar.style.top = `${b.y / pctH()}%`;
    rowBar.style.right = `${(PAGE_W - (b.x + b.w)) / 2.1}%`;
    rowBar.hidden = false;
  }
  const PAGE_W = 210;
  const rowEnd = (b) => (b.ed && b.ed.row ? model.boxes.filter((x) => x.ed && x.ed.row && x.ed.row.gi === b.ed.row.gi && x.ed.row.li === b.ed.row.li && Math.abs(x.y - b.y) < 0.5).reduce((a, x) => (x.x > a.x ? x : a), b) : b);
  hitsEl.addEventListener('mouseover', (e) => {
    if (inl) return;
    const h = e.target.closest('.hit');
    const b = h && model.boxes[+h.dataset.bi];
    if (b && b.ed.row) showRowBar(rowEnd(b));
  });
  paperEl.addEventListener('mouseleave', () => { if (!inl) rowBar.hidden = true; });
  rowBar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  rowBar.addEventListener('click', (e) => { const bt = e.target.closest('button[data-ra]'); if (bt) rowAct(bt.dataset.ra); });
  rowBar.addEventListener('change', (e) => { if (e.target.dataset.ra === 'kind') rowAct('kind', e.target.value); });
  function newLine(kind) { return { kind, text: '', qty: 1, note: '' }; }
  function newItem(goods) { return goods ? { name: '', lines: [{ kind: 'unit', text: '', uom: 'EA', qty: 1, unit: '', note: '' }] } : { name: '', lines: [newLine('day')] }; }
  function rowAct(act, val) {
    const d = doc();
    const goods = d.style === 'goods';
    const gi = +rowBar.dataset.gi, li = rowBar.dataset.li === '' ? undefined : +rowBar.dataset.li;
    const G = d.groups;
    const swap = (a, b2) => { [G[a], G[b2]] = [G[b2], G[a]]; };
    let focusKey = null;
    if (goods || li === undefined) {
      if (act === 'add') { G.splice(gi + 1, 0, newItem(goods)); focusKey = `groups.${gi + 1}.name`; }
      if (act === 'del') G.splice(gi, 1);
      if (act === 'up' && gi > 0) swap(gi, gi - 1);
      if (act === 'down' && gi < G.length - 1) swap(gi, gi + 1);
    } else {
      const g = G[gi], L = g.lines;
      if (act === 'add') { const p = L[li]; L.splice(li + 1, 0, newLine(p && p.kind !== 'fixed' ? p.kind : 'day')); focusKey = `groups.${gi}.lines.${li + 1}.text`; }
      if (act === 'del') { L.splice(li, 1); if (!L.length) G.splice(gi, 1); }
      if (act === 'up') { if (li > 0) [L[li - 1], L[li]] = [L[li], L[li - 1]]; else if (gi > 0) G[gi - 1].lines.push(L.splice(li, 1)[0]); }
      if (act === 'down') { if (li < L.length - 1) [L[li + 1], L[li]] = [L[li], L[li + 1]]; else if (gi < G.length - 1) G[gi + 1].lines.unshift(L.splice(li, 1)[0]); }
      if (act === 'kind') {
        const l = L[li], old = compute(d).groups[gi].lines[li];
        l.kind = val;
        if (val === 'fixed' && !num(l.amount)) l.amount = old.amount;
        if (val === 'unit' && !num(l.unit)) l.unit = old.unit || old.amount;
        if (val !== 'fixed' && (l.qty === '' || l.qty === undefined)) l.qty = 1;
      }
    }
    closeInline();
    renderItems(); update(); clearTimeout(upT); renderPreview();
    if (focusKey) openKey(focusKey);
  }
  function addFromPaper() {
    const d = doc();
    const goods = d.style === 'goods';
    let k;
    if (goods || !d.groups.length) { d.groups.push(newItem(goods)); k = `groups.${d.groups.length - 1}.name`; }
    else { const g = d.groups[d.groups.length - 1]; const p = g.lines.at(-1); g.lines.push(newLine(p && p.kind !== 'fixed' ? p.kind : 'day')); k = `groups.${d.groups.length - 1}.lines.${g.lines.length - 1}.text`; }
    renderItems(); update(); clearTimeout(upT); renderPreview();
    openKey(k);
  }
  addEventListener('resize', () => { applyFit(); if (inl && model) placeInline(); });

  // 미리보기 크기: 넓게 보기(칸 폭 가득) · 화면에 맞추기(A4 한 장이 화면 높이에 다 보이게)
  let fitMode = 'fit';   // 처음엔 화면에 맞추기
  try { fitMode = localStorage.getItem('wd_fit') === 'full' ? 'full' : 'fit'; } catch (e) { /* 저장소 없음 */ }
  function applyFit() {
    const side = $('.ed-side');
    if (!side || !paperEl.isConnected) return;
    if (document.body.classList.contains('pv-full') && paperEl.offsetParent) {
      // 전체화면: 한 장이 화면 높이에 꼭 맞게(여러 장이면 아래로 이어짐)
      const w = Math.min(side.clientWidth - 32, (window.innerHeight - 32) * 210 / 297);
      paperEl.style.width = `${Math.round(w)}px`; paperEl.style.margin = '0 auto';
      if (inl && model) placeInline();
      return;
    }
    if (fitMode !== 'fit' || !paperEl.offsetParent) { paperEl.style.width = ''; paperEl.style.margin = ''; if (inl && model) placeInline(); return; }
    // 데스크톱: 오른쪽 칸이 따로 스크롤되므로 그 높이에, 폰: 창 높이에 A4 한 장을 맞춘다
    const scroller = getComputedStyle(side).overflowY === 'auto' ? side : null;
    const viewH = scroller ? scroller.clientHeight : window.innerHeight - 140;
    const tools = $('.paper-tools');
    const gap = tools ? paperEl.getBoundingClientRect().top - tools.getBoundingClientRect().top : 0;   // 맞추기 단추 줄도 보이게
    const w = Math.min(side.clientWidth - 8, Math.max(240, viewH - gap - 28) * 210 / 297);
    paperEl.style.width = `${Math.round(w)}px`;
    paperEl.style.margin = '0 auto';
    if (scroller && tools) scroller.scrollTop = tools.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
    if (inl && model) placeInline();
  }
  // 문서 전체화면: 미리보기 칸을 화면 가득 키운다 — 서식의 글자를 눌러 그 자리에서 고치기 그대로(Esc · ✕ 로 닫음)
  let fullOn = false;
  const fullX = document.createElement('button');
  fullX.type = 'button'; fullX.className = 'docfs-x'; fullX.setAttribute('aria-label', '전체화면 닫기'); fullX.title = '전체화면 닫기 (Esc)'; fullX.textContent = '✕';
  const onFullKey = (e) => { if (e.key === 'Escape' && !(e.target.closest && e.target.closest('.inl, .rowbar, .modal'))) { e.preventDefault(); setFull(false); } };
  const onFullFs = () => { if (!document.fullscreenElement && fullOn) setFull(false); };
  function setFull(on) {
    if (on === fullOn) return;
    fullOn = on;
    document.body.classList.toggle('pv-full', on);
    if (on) {
      paneSeg.set('preview'); $('.ed').dataset.pane = 'preview';
      document.body.appendChild(fullX);
      document.addEventListener('keydown', onFullKey);
      document.addEventListener('fullscreenchange', onFullFs);
      const de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().catch(() => {});
    } else {
      fullX.remove();
      document.removeEventListener('keydown', onFullKey);
      document.removeEventListener('fullscreenchange', onFullFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    requestAnimationFrame(applyFit);
  }
  fullX.onclick = () => setFull(false);
  $('#bFull').onclick = () => setFull(true);
  closeFull = () => setFull(false);
  const fitSeg = segInit($('#fitSeg'), (v) => { fitMode = v; try { localStorage.setItem('wd_fit', v); } catch (e) { /* 무시 */ } applyFit(); });
  fitSeg.set(fitMode);
  requestAnimationFrame(applyFit);

  // 저장
  // 이미 저장된 문서를 고친 뒤 '저장': 덮어쓸지 먼저 묻는다(아니면 다른 문서로 저장)
  async function save({ quiet, force } = {}) {
    const d = doc();
    if (ed.id && !dirty()) { if (!quiet) toast('바뀐 내용이 없습니다.'); return true; }
    if (ed.id && !force) {
      const v = await modal({ title: '기존 문서를 덮어쓸까요?', body: `<p><b>${esc(d.no)}</b> 문서를 지금 내용으로 덮어씁니다. 원래 문서를 남겨 두려면 <b>다른 문서로 저장</b>을 누르세요.</p>`,
        buttons: [{ label: '취소', value: null }, { label: '다른 문서로 저장', value: 'as', kind: 'blue' }, { label: '덮어쓰기', value: 'over', kind: 'primary' }] });
      if (v === 'as') { await saveAs(); return false; }   // 새 문서로 옮겨 가므로 하던 일(내보내기 등)은 멈춘다
      if (v !== 'over') return false;
    }
    if (!String(d.category || '').trim()) {
      toast('클라이언트 카테고리를 먼저 골라 주세요(필수).', 'err');
      const f = $('#fCat'); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); }
      return false;
    }
    const amount = docAmount(d);
    $('#bSave').disabled = true;
    try {
      if (!ed.id) {
        const j = await api('POST', '/api/docs', { doc: d, amount });
        ed.id = j.id; ed.version = j.version; ed.slug = j.slug; d.no = j.no; d.id = j.id; d.author = j.author; d.editor = j.editor;
        ed.saved = JSON.stringify(d);
        history.replaceState(null, '', `#/doc/${j.id}`);
        lastHash = location.hash;
        syncParent();
        navSeg && navSeg.set('list');
        if (d.parentId) api('GET', `/api/docs/${j.id}`).then((r) => { ed.parent = r.parent; renderHead(); }).catch(() => {});
        if (!quiet) toast(`저장했습니다. 문서번호 ${j.no}`);
      } else {
        const j = await api('PUT', `/api/docs/${ed.id}`, { doc: d, amount, version: ed.version });
        ed.version = j.version;
        if (j.author !== undefined) { d.author = j.author; d.editor = j.editor; }
        ed.saved = JSON.stringify(d);
        if (!quiet) toast('저장했습니다.');
      }
      renderHead(); refreshNumbers(); renderPreview();
      return true;
    } catch (e) {
      toast(e.message, 'err');
      return false;
    } finally { $('#bSave').disabled = false; }
  }
  $('#bSave').onclick = () => save();
  // 공유: 저장해서 링크에 지금 내용이 보이게 한 뒤, 링크를 복사하고 보여 준다
  $('#bShare').onclick = async () => {
    if (!ed.id || dirty()) { if (!(await save({ quiet: true }))) return; }
    if (!ed.slug) { toast('문서 링크를 아직 만들지 못했습니다. 다시 저장해 주세요.', 'err'); return; }
    const u = docLink(ed.slug);
    const copied = await copyText(u);
    const v = await modal({
      title: '문서 공유',
      body: `<p>${copied ? '<b>링크를 복사했습니다.</b> 카톡 · 문자에 붙여 넣어 보내세요.' : '아래 링크를 복사해 보내세요.'}</p>
        <input class="input share-input" id="shareUrl" readonly value="${esc(u)}" aria-label="문서 링크">
        <p class="small">받는 분이 로그인 없이 문서를 보고 PDF로 받거나 인쇄할 수 있습니다. 지금 저장된 내용이 보입니다.</p>`,
      buttons: [{ label: '닫기', value: null }, { label: '새 창으로 열기', value: 'open' }, { label: '링크 복사', value: 'copy', kind: 'primary' }],
      onOpen: (card) => { const i = $('#shareUrl', card); i.onfocus = () => i.select(); },
    });
    if (v === 'open') window.open(u, '_blank', 'noopener');
    if (v === 'copy') toast((await copyText(u)) ? `링크를 복사했습니다: ${u}` : u);
  };
  $('#share').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sh]');
    if (!b || b.dataset.sh !== 'copy') return;
    if (dirty()) toast('저장하지 않은 내용이 있습니다. 링크에는 마지막으로 저장한 내용이 보입니다.', 'err');
    const u = docLink(ed.slug);
    if (await copyText(u)) { if (!dirty()) toast(`링크를 복사했습니다: ${u}`); } else toast(u);
  });
  // 다른 문서로 저장: 열어 둔 문서는 그대로 두고 지금 내용을 새 번호로 저장한 뒤 그 문서를 연다
  async function saveAs() {
    const d = doc();
    if (!String(d.category || '').trim()) { toast('클라이언트 카테고리를 먼저 골라 주세요(필수).', 'err'); return false; }
    const nd = clone(d);
    nd.no = ''; delete nd.id; delete nd.author; delete nd.authorId; delete nd.editor; delete nd.editedAt;
    $('#bSaveAs').disabled = true;
    try {
      const j = await api('POST', '/api/docs', { doc: nd, amount: docAmount(nd) });
      leaveGuard = null;
      toast(`다른 문서로 저장했습니다. 새 문서번호 ${j.no} · 원래 문서(${d.no})는 그대로입니다.`);
      location.hash = `#/doc/${j.id}`;
      return true;
    } catch (e) { toast(e.message, 'err'); return false; } finally { $('#bSaveAs').disabled = false; }
  }
  $('#bSaveAs').onclick = () => saveAs();
  pageSave = () => save();
  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!['s', 'z', 'y'].includes(k)) return;
    if (!view.contains($('#bSave'))) { document.removeEventListener('keydown', onKey); return; }
    if (!$('#modal').hidden) return;
    if (k === 's') return;   // Ctrl+S 는 공통 처리(pageSave)
    if (e.target.id === 'tgIn') return;
    e.preventDefault();
    travel(k === 'y' || e.shiftKey ? 1 : -1);
  };
  document.addEventListener('keydown', onKey);

  // 내보내기: 오류가 있으면 한 번 더 묻고, 저장해서 문서번호를 받은 뒤 만든다
  async function beforeExport(what) {
    renderPreview();
    const errs = issues.filter((x) => x.level === 'error');
    if (errs.length) {
      const go = await modal({ title: `오류 ${errs.length}건이 있습니다`, body: `<ul class="err-list">${errs.map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul><p>그래도 ${what}로 만들까요?</p>`,
        buttons: [{ label: '고치러 가기', value: false, kind: 'primary' }, { label: '그래도 만들기', value: true }] });
      if (!go) { paneSeg.set('check'); $('.ed').dataset.pane = 'check'; return false; }
    }
    if (!ed.id || dirty()) { if (!(await save({ quiet: true }))) return false; }
    return true;
  }
  const fileName = (ext) => {
    const d = doc();
    return `${d.no}_${(d.title || TYPES[d.type].name)}-${d.client?.name || ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + `.${ext}`;
  };
  async function busy(btn, fn) {
    const t = btn.textContent;
    btn.disabled = true; btn.textContent = '만드는 중…';
    try { await fn(); } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; btn.textContent = t; }
  }
  $('#bXlsx').onclick = (e) => busy(e.currentTarget, async () => {
    if (!(await beforeExport('엑셀'))) return;
    const blob = await toXLSX(model, imgs('buf'), { sheet: TYPES[doc().type].name, author: S.company.name });
    download(blob, fileName('xlsx'));
    toast('엑셀을 내려받았습니다.');
  });
  $('#bPdf').onclick = (e) => busy(e.currentTarget, async () => {
    if (!(await beforeExport('PDF'))) return;
    const blob = await toPDF(model, imgs('url'), { title: doc().title, author: S.company.name });
    download(blob, fileName('pdf'));
    toast('PDF를 내려받았습니다.');
  });
  $('#bDocx').onclick = (e) => busy(e.currentTarget, async () => {
    if (!(await beforeExport('워드'))) return;
    const blob = await toDOCX(model, imgs('buf'), { title: doc().title, author: S.company.name });
    download(blob, fileName('docx'));
    toast('워드 파일을 내려받았습니다. 한컴오피스 한글에서도 열 수 있습니다.');
  });
  const doPrint = async () => { if (!(await beforeExport('인쇄'))) return; printSVG(pageSVGs(model, imgs('url')), fileName('pdf')); };
  $('#bPrint').onclick = () => doPrint().catch((e) => toast(e.message, 'err'));

  // 더보기
  const menu = $('#moreMenu');
  $('#bMore').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  const closeMenu = (e) => { if (!menu.isConnected) { document.removeEventListener('click', closeMenu); return; } if (!menu.contains(e.target)) menu.hidden = true; };
  document.addEventListener('click', closeMenu);
  view.addEventListener('click', (e) => { const b = e.target.closest('[data-make]'); if (b) more(b.dataset.make); });
  $('#tplStrip').addEventListener('click', (e) => { const b = e.target.closest('[data-act2]'); if (b) more(b.dataset.act2); });
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) { menu.hidden = true; more(b.dataset.act); } });
  async function more(act) {
    const d = doc();
    if (act === 'print') return doPrint();
    if (act === 'saveas') return saveAs();
    if (act === 'docx') { $('#bDocx').click(); return; }
    if (act === 'tplover') {
      if (!d.tplId) return;
      const ok = await modal({ title: '템플릿 기본값으로 저장', body: `<p><b>'${esc(d.tplName || '')}'</b> 템플릿을 지금 내용(항목 · 금액 · 문구)으로 바꿉니다. 앞으로 이 템플릿으로 만드는 문서는 이 내용으로 시작합니다.</p><p class="small">이미 만든 문서는 바뀌지 않습니다.</p>`,
        buttons: [{ label: '취소', value: false }, { label: '템플릿 바꾸기', value: true, kind: 'primary' }] });
      if (!ok) return;
      try { await api('PUT', `/api/templates/${d.tplId}`, { doc: tplClean(d) }); toast(`'${d.tplName}' 템플릿을 바꿨습니다.`); } catch (e) { toast(e.message, 'err'); }
      return;
    }
    if (act === 'tpl') {
      const name = await modal({ title: '새 템플릿으로 저장', body: `<label class="field"><span>템플릿 이름</span><input class="input" id="tplName" value="${esc(d.title || '')}" placeholder="예) 홈페이지 250만원 견적"></label><p class="small">지금 내용(항목 · 금액 · 참고사항)을 그대로 템플릿으로 남깁니다. 문서번호 · 날짜는 불러올 때 새로 붙습니다.</p>`,
        buttons: [{ label: '취소', value: null }, { label: '저장', kind: 'primary', value: (card) => $('#tplName', card).value.trim() }],
        onOpen: (card) => { const i = $('#tplName', card); i.onkeydown = (e) => { if (e.key === 'Enter') $('.btn-primary', card).click(); }; setTimeout(() => i.select(), 40); } });
      if (!name) return;
      let j;
      try { j = await api('POST', '/api/templates', { name, doc: tplClean(d) }); } catch (e) { toast(e.message, 'err'); return; }
      d.tplId = j.id; d.tplName = name;
      renderHead(); update();
      toast(`'${name}' 템플릿을 저장했습니다. 템플릿에서 만들기 목록에 있습니다.`);
      return;
    }
    if (act === 'dup') { pendingDoc = { doc: duplicateDoc(d), msg: `${d.no || '문서'}를 복제했습니다. 날짜는 오늘, 저장하면 새 번호가 붙습니다.` }; location.hash = `#/new/${d.type}?draft=1`; return; }
    if (act.startsWith('to-')) {
      const type = act.slice(3);
      if (!ed.id || dirty()) { if (!(await save({ quiet: true }))) return; }
      const nd = convertDoc({ ...d, id: ed.id }, type);
      pendingDoc = { doc: nd, msg: `${d.no}로 ${TYPES[type].name}를 만들었습니다. 금액(${won(compute(d).final)}원 ${vatWord(d)})이 이어지도록 맞췄습니다. 확인 후 저장하세요.` };
      location.hash = `#/new/${type}?draft=1`;
      return;
    }
    if (act === 'renumber') {
      if (!ed.id) { toast('저장할 때 번호가 붙습니다.'); return; }
      if (dirty()) { if (!(await save({ quiet: true }))) return; }
      const ok = await modal({ title: '문서번호 다시 받기', body: `<p>${esc(d.no)} 대신 ${esc(d.date)} 날짜로 새 번호를 받습니다.</p>`, buttons: [{ label: '취소', value: false }, { label: '새 번호 받기', value: true, kind: 'primary' }] });
      if (!ok) return;
      const j = await api('POST', `/api/docs/${ed.id}/renumber`);
      d.no = j.no; ed.version = j.version; ed.saved = JSON.stringify(d);
      renderHead(); update();
      toast(`새 문서번호 ${j.no}`);
      return;
    }
    if (act === 'del') {
      if (!ed.id) { leaveGuard = null; location.hash = '#/'; return; }
      const ok = await modal({ title: '휴지통으로', body: `<p>${esc(d.no)} 문서를 휴지통으로 옮깁니다. 목록의 휴지통에서 되살릴 수 있습니다.</p>`, buttons: [{ label: '취소', value: false }, { label: '휴지통으로', value: true, kind: 'danger' }] });
      if (!ok) return;
      await api('DELETE', `/api/docs/${ed.id}`);
      ed.saved = JSON.stringify(d);
      toast('휴지통으로 옮겼습니다.');
      location.hash = '#/';
    }
  }

  // 나갈 때 저장 확인
  leaveGuard = async () => {
    if (!dirty()) return true;
    const v = await modal({ title: '저장하지 않았습니다', body: '<p>고친 내용을 저장할까요?</p>', buttons: [{ label: '저장 안 함', value: 'drop' }, { label: '취소', value: null }, { label: '저장', value: 'save', kind: 'primary' }] });
    if (v === 'save') return save({ quiet: true });
    return v === 'drop';
  };
  leaveGuard.dirty = dirty;

  loadClients();
  const applyClient = (c) => {
    const d = doc();
    d.category = c.name;
    d.client = { ...(d.client || {}), name: c.recipient || c.name };
    d.client.ref = c.ref || '';   // 클라이언트를 고르면 참조도 그 담당자로(다른 곳 담당자가 남지 않게)
    fillForm(); renderHead(); update(); catHint();
    toast(`수신 '${d.client.name}'${c.ref ? ` · 참조 '${c.ref}'` : ''}을(를) 넣었습니다.`);
  };
  attachClientPicker($('#fCat'), {
    list: () => CLIENTS,
    onPick: (c) => { applyClient(c); endSpot(); },
    create: async (c) => {
      try { await api('POST', '/api/clients', c); } catch (e) { toast(e.message, 'err'); return null; }
      await loadClients();
      toast(`'${c.name}' 클라이언트를 등록했습니다.`);
      return CLIENTS.find((x) => x.name === c.name) || c;
    },
  });
  // 새 문서를 열면 먼저 클라이언트 카테고리만 밝게 보여 주고 거기서 고르게 한다
  let spot = null;
  function endSpot() { document.body.classList.remove('spot-active'); if (spot) { spot.remove(); spot = null; removeEventListener('resize', placeSpot); $('.ed-form')?.removeEventListener('scroll', placeSpot); } }
  function placeSpot() {
    const t = $('.cat-field');
    if (!spot || !t || !t.isConnected) { endSpot(); return; }
    const r = t.getBoundingClientRect(), p = 8;
    const [top, left, right, bottom] = [r.top - p, r.left - p, r.right + p, r.bottom + p];
    const sides = spot.querySelectorAll('.spot-dim');
    sides[0].style.cssText = `left:0;top:0;right:0;height:${Math.max(0, top)}px`;
    sides[1].style.cssText = `left:0;top:${bottom}px;right:0;bottom:0`;
    sides[2].style.cssText = `left:0;top:${top}px;width:${Math.max(0, left)}px;height:${bottom - top}px`;
    sides[3].style.cssText = `left:${right}px;top:${top}px;right:0;height:${bottom - top}px`;
    const ring = spot.querySelector('.spot-ring');
    ring.style.cssText = `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px`;
    const tip = spot.querySelector('.spot-tip');
    // 상자 오른쪽에 자리가 있으면 옆에, 없으면 아래에
    const side = innerWidth - right > 300;
    tip.style.left = `${side ? right + 14 : Math.max(12, left)}px`;
    tip.style.top = `${side ? top : bottom + 10}px`;
  }
  function startSpot() {
    const t = $('.cat-field');
    if (!t) return;
    const form = $('.ed-form');
    if (form) form.scrollTop = 0;
    t.scrollIntoView({ block: 'center' });
    spot = document.createElement('div');
    spot.className = 'spot';
    spot.innerHTML = '<div class="spot-dim"></div><div class="spot-dim"></div><div class="spot-dim"></div><div class="spot-dim"></div><div class="spot-ring"></div><div class="spot-tip">' + (String(doc().category || '').trim() ? '<b>클라이언트를 확인하세요</b><span>지금 <b>' + esc(doc().category) + '</b>(으)로 되어 있습니다. 맞으면 <kbd>Enter</kbd>, 다른 곳이면 이름이나 검색어를 쳐서 고르세요. 목록에 없으면 이름을 치고 <kbd>Enter</kbd> — 바로 등록됩니다.</span>' : '<b>먼저 클라이언트를 고르세요</b><span>이름이나 검색어를 치면 목록이 나옵니다. 목록에 없으면 이름을 치고 <kbd>Enter</kbd> — 바로 등록됩니다.</span>') + '<button type="button" class="link" data-spot-close>나중에 고르기</button></div>';
    document.body.appendChild(spot);
    document.body.classList.add('spot-active');
    spot.addEventListener('mousedown', (e) => { if (e.target.closest('.spot-dim') || e.target.closest('[data-spot-close]')) { e.preventDefault(); endSpot(); } });
    addEventListener('resize', placeSpot);
    form?.addEventListener('scroll', placeSpot);
    placeSpot();
    setTimeout(() => { placeSpot(); const f = $('#fCat'); if (f) { f.focus(); f.select(); } }, 60);
  }
  if (!ed.id) requestAnimationFrame(startSpot);   // 새 문서는 언제나 클라이언트부터(템플릿에서 와서 채워져 있어도 확인)
  const routeOff = () => { endSpot(); removeEventListener('hashchange', routeOff); };
  addEventListener('hashchange', routeOff);
  // 카테고리가 비어 있으면 수신 이름을 바로 넣을 수 있게
  const catHint = () => {
    const b = $('#catFromClient');
    if (!b) return;
    const name = String(doc().client?.name || '').trim();
    b.hidden = !!String(doc().category || '').trim() || !name;
    b.textContent = `'${name}'(수신)으로 넣기`;
  };
  $('#catFromClient').onclick = () => { doc().category = String(doc().client?.name || '').trim(); fillForm(); update(); catHint(); };
  view.addEventListener('input', (e) => { if (e.target.id === 'fClient' || e.target.id === 'fCat') catHint(); });
  catHint();
  // 수신처 자동완성
  api('GET', '/api/docs?limit=300').then((j) => {
    const names = [...new Set(j.docs.map((x) => x.client).filter(Boolean))];
    $('#clientList').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
  }).catch(() => {});

  fillForm(); renderExtra(); renderHead(); renderItems(); refreshNumbers(); renderPreview();
  hist[0] = snap();
  fontReady.then(() => { if (paperEl.isConnected) { renderPreview(); applyFit(); } });
  if (flash) setTimeout(() => { const f = $('#flash'); if (f) f.hidden = true; }, 9000);
}

// 줄 끌어서 옮기기 (손잡이 · 마우스 · 터치 공통, 분류 사이도 가능)
function enableDrag(root, done) {
  root.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.handle');
    if (!h) return;
    e.preventDefault();
    const row = h.closest('.ln');
    row.classList.add('dragging');
    h.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el) return;
      const over = el.closest('.ln');
      const lns = el.closest('.grp') && $('.lns', el.closest('.grp'));
      if (over && over !== row && root.contains(over)) {
        const r = over.getBoundingClientRect();
        over.parentNode.insertBefore(row, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
        moved = true;
      } else if (!over && lns && root.contains(lns) && !lns.contains(row)) { lns.appendChild(row); moved = true; }
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      if (moved) done();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
}

// ── 설정 ───────────────────────────────────────────────────────────
async function viewSettings() {
  document.title = '설정 · J-Docs';
  await loadSettings();
  const s = clone(S);
  const F = (k, label, ph = '') => `<label class="field"><span>${label}</span><input class="input" data-s="${k}" value="${esc(k.split('.').reduce((o, p) => o?.[p], s) ?? '')}" placeholder="${esc(ph)}"></label>`;
  fresh(`
  <div class="wrap settings-wrap">
    <div class="sec-head"><h1 class="page-title">설정</h1><button class="btn btn-primary" id="sSave" type="button">설정 저장</button></div>
    ${settingsSaved ? '' : '<p class="flash">아직 저장한 설정이 없어 처음 값을 보여줍니다. 저장하면 이 값으로 고정됩니다.</p>'}
    <div class="settings-grid">
    <section class="card">
      <h2 class="sec-title">공급자 (우리 회사)</h2>
      <div class="row2">${F('company.name', '상호')}${F('company.ceo', '대표자')}</div>
      <div class="row3">${F('company.bizNo', '사업자등록번호')}${F('company.bizType', '업태')}${F('company.bizItem', '종목')}</div>
      <div class="row2">${F('company.tel', '연락처')}${F('company.fax', '팩스')}</div>
      <div class="row2">${F('company.nameEn', '영문 상호', '공문 머리에 함께 찍힙니다')}${F('company.email', '이메일', '공문 머리에 찍힙니다')}</div>
      <div class="row2">${F('company.accounts.personal', '입금계좌 · 개인용')}${F('company.accounts.business', '입금계좌 · 사업자용')}</div>
      <p class="small">문서마다 개인용 · 사업자용 중 하나를 고르고, 참고사항의 {계좌}와 청구서 계좌 칸에 그 계좌가 들어갑니다.</p>
      <div class="stamp-row" id="sStamps"><p class="small">도장 그림은 xim 「계약서 › 을 정보 · 도장」에 올린 것을 그대로 씁니다(직인 · 공문 도장 모두 같은 그림). 대표자 칸 "(인)" 자리에는 지름 1.6cm로, 공문에는 가로세로 2cm로 찍힙니다. 올린 도장이 없으면 도장 없이 만들어집니다.</p></div>
    </section>
    <section class="card">
      <h2 class="sec-title">기본 단가 · 절사</h2>
      <div class="row3">${F('rate.base', '노임단가(원)')}${F('rate.factor', '적용률(배)')}${F('rate.direct', '직접 입력 단가(원)')}</div>
      <div class="opt-row"><span class="opt-label">새 문서 단가</span>
        <div class="seg" id="sRateMode"><button type="button" data-v="formula">노임단가 × 적용률</button><button type="button" data-v="direct">직접 입력</button></div>
      </div>
      <div class="opt-row"><span class="opt-label">견적서 절사</span>
        <div class="seg seg-sm" id="sRound">${ROUNDING.map((r) => `<button type="button" data-v="${r.v}">${r.short}</button>`).join('')}</div>
      </div>
      <p class="small">거래명세서 · 청구서는 견적에서 만들 때 견적 금액이 그대로 이어지도록 절사 없이 맞춥니다.</p>
    </section>
    <section class="card">
      <h2 class="sec-title">문서 링크 주소</h2>
      ${F('linkBase', '고객에게 보내는 문서 주소 앞부분', 'https://docs.plators.com/jd')}
      <p class="small">비워 두면 ${esc(LINK_BASE)} 를 씁니다. 문서마다 뒤에 고유한 8글자가 붙습니다. 예) docs.plators.com/jd/wD5Jd4Qk · 고객은 그 주소에서 문서를 보고 PDF로 받거나 인쇄만 할 수 있습니다.</p>
    </section>
    ${TYPE_KEYS.map((k) => {
      const t = s.types[k];
      return `<section class="card">
        <h2 class="sec-title">${TYPES[k].name} 기본값</h2>
        ${F(`types.${k}.title`, '제목')}
        <div class="row2">${F(`types.${k}.extra.0.0`, '추가 칸 1 이름')}${F(`types.${k}.extra.0.1`, '추가 칸 1 내용')}</div>
        <div class="row2">${F(`types.${k}.extra.1.0`, '추가 칸 2 이름')}${F(`types.${k}.extra.1.1`, '추가 칸 2 내용')}</div>
        <div class="opt-row"><span class="opt-label">부가세</span>
          <div class="seg" data-seg="types.${k}.vat"><button type="button" data-v="excl">VAT별도</button><button type="button" data-v="incl">VAT포함</button></div>
          <label class="switch"><input type="checkbox" data-sb="types.${k}.showVat" ${t.showVat ? 'checked' : ''}><span>부가세 줄</span></label>
        </div>
        <div class="opt-row"><span class="opt-label">입금계좌</span>
          <div class="seg" data-seg="types.${k}.account"><button type="button" data-v="personal">개인용</button><button type="button" data-v="business">사업자용</button></div>
        </div>
        <label class="field"><span>참고사항</span><textarea class="input" rows="6" data-s="types.${k}.notes">${esc(t.notes)}</textarea></label>
      </section>`;
    }).join('')}
    <section class="card">
      <h2 class="sec-title">클라이언트 카테고리</h2>
      <p class="small">클라이언트(카테고리 이름 · 수신 · 검색어 · 담당자)는 위쪽 <a href="#/clients">클라이언트</a> 메뉴에서 관리합니다.</p>
    </section>
    <section class="card">
      <h2 class="sec-title">템플릿</h2>
      <p class="small">문서 편집 화면 ⋯ 메뉴의 "템플릿으로 저장"으로 추가합니다. 이름 바꾸기 · 삭제는 바로 반영됩니다.</p>
      <div id="sTplList" class="tpl-admin"><p class="loading">불러오는 중…</p></div>
    </section>
    <section class="card span-2">
      <h2 class="sec-title">새 문서 기본 항목 구성</h2>
      <p class="small">새 견적서를 열면 이 구성으로 시작합니다. 한 줄에 하나씩: <code>분류 | 내용 | 일수</code> 또는 정액은 <code>분류 | 내용 | =금액</code></p>
      <textarea class="input mono" rows="16" id="sTpl"></textarea>
    </section>
    <section class="card">
      <h2 class="sec-title">연도별 소프트웨어 노임단가</h2>
      <p class="small">한 줄에 하나씩 <code>연도 | 노임단가 | 메모</code>. 해마다 전년도 12월쯤 공표되면 한 줄 추가하세요. 새 견적은 문서 날짜 해의 값으로 시작하고, 편집 화면에 참고로 보여 줍니다. 참고사항의 {연도}는 문서 날짜의 해로 자동으로 바뀝니다.</p>
      <textarea class="input mono" rows="5" id="sRates"></textarea>
    </section>
    <section class="card span-2">
      <h2 class="sec-title">항목 창고</h2>
      <p class="small">편집 화면의 '항목 창고'에서 골라 넣는 목록입니다. 형식은 위와 같습니다.</p>
      <textarea class="input mono" rows="16" id="sLib"></textarea>
    </section>
    </div>
    <p class="right"><button class="btn btn-primary" id="sSave2" type="button">설정 저장</button></p>
  </div>`);
  // 도장 그림: 올린 것이 없으면(404) 그림 자리를 지운다
  const stampImg = new Image(68, 68);
  stampImg.alt = '도장';
  stampImg.addEventListener('error', () => stampImg.remove());
  stampImg.src = '/api/jdocs/stamp';
  $('#sStamps').prepend(stampImg);

  const toText = (rows) => rows.map((x) => `${x.group} | ${x.text} | ${x.kind === 'fixed' ? `=${x.amount}` : x.kind === 'unit' ? `${x.qty}x${x.unit}` : x.qty}`).join('\n');
  const fromText = (txt) => txt.split('\n').map((ln) => ln.trim()).filter(Boolean).map((ln) => {
    const [group = '', text = '', v = '1'] = ln.split('|').map((p) => p.trim());
    if (v.startsWith('=')) return { group, kind: 'fixed', text, amount: num(v.slice(1)), note: '' };
    const m = /^([\d.]+)\s*[x×*]\s*([\d,]+)$/.exec(v);
    if (m) return { group, kind: 'unit', text, qty: num(m[1]), unit: num(m[2]), note: '' };
    return { group, kind: 'day', text, qty: num(v) || 1, note: '' };
  });
  async function loadTpls() {
    const box = $('#sTplList');
    if (!box) return;
    const j = await api('GET', '/api/templates');
    box.innerHTML = j.templates.length ? j.templates.map((t) => `
      <div class="tpl-row" data-tid="${t.id}">
        <span class="badge badge-${esc(t.type)}">${TYPES[t.type]?.name || ''}</span>
        <b>${esc(t.name)}</b>
        <span class="tpl-row-btns"><button type="button" class="btn btn-sm" data-ta="rename">이름 바꾸기</button><button type="button" class="btn btn-sm" data-ta="del">삭제</button></span>
      </div>`).join('') : '<p class="empty">템플릿이 없습니다.</p>';
    box.onclick = async (e) => {
      const b = e.target.closest('[data-ta]');
      if (!b) return;
      const t = j.templates.find((x) => x.id === +b.closest('[data-tid]').dataset.tid);
      if (b.dataset.ta === 'rename') {
        const name = await modal({ title: '템플릿 이름', body: `<label class="field"><span>이름</span><input class="input" id="tplName" value="${esc(t.name)}"></label>`,
          buttons: [{ label: '취소', value: null }, { label: '바꾸기', kind: 'primary', value: (card) => $('#tplName', card).value.trim() }] });
        if (!name) return;
        await api('PUT', `/api/templates/${t.id}`, { name });
      } else {
        const ok = await modal({ title: '템플릿 삭제', body: `<p>'${esc(t.name)}' 템플릿을 지웁니다. 이 템플릿으로 만든 문서는 그대로 남습니다.</p>`, buttons: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }] });
        if (!ok) return;
        await api('DELETE', `/api/templates/${t.id}`);
      }
      toast('반영했습니다.');
      loadTpls();
    };
  }
  loadTpls().catch((e) => toast(e.message, 'err'));
  $('#sTpl').value = toText(s.template.flatMap((g) => g.lines.map((l) => ({ group: g.name, ...l }))));
  $('#sLib').value = toText(s.library);
  $('#sRates').value = (s.rateTable || []).map((r) => `${r.year} | ${r.base} | ${r.note || ''}`).join('\n');

  const rm = segInit($('#sRateMode'), (v) => { s.rate.mode = v; });
  rm.set(s.rate.mode === 'direct' ? 'direct' : 'formula');
  const rd = segInit($('#sRound'), (v) => { s.rounding = +v; s.types.quote.rounding = +v; });
  rd.set(String(s.types.quote.rounding ?? s.rounding));
  $$('[data-seg]').forEach((el) => {
    const k = el.dataset.seg;
    const sg = segInit(el, (v) => setPath(s, k, v));
    sg.set(k.split('.').reduce((o, p) => o?.[p], s));
  });
  view.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.s) setPath(s, el.dataset.s, /^rate\./.test(el.dataset.s) ? num(el.value) : el.value);
    if (el.dataset.sb) setPath(s, el.dataset.sb, el.checked);
    dirtyS = true;
  });
  view.addEventListener('change', (e) => { if (e.target.dataset.sb) setPath(s, e.target.dataset.sb, e.target.checked); });
  let dirtyS = false;
  async function saveS() {
    const tpl = fromText($('#sTpl').value);
    const groups = [];
    tpl.forEach(({ group, ...l }) => {
      let g = groups.find((x) => x.name === group);
      if (!g) { g = { name: group, lines: [] }; groups.push(g); }
      g.lines.push(l);
    });
    s.template = groups;
    s.library = fromText($('#sLib').value);
    s.rateTable = $('#sRates').value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => /^\d{4}$/.test(p[0]) && num(p[1]) > 0).map(([year, base, note]) => ({ year: +year, base: num(base), note: note || '' })).sort((a, b) => a.year - b.year);
    s.types.statement.rounding = 1; s.types.invoice.rounding = 1;
    delete s.company.addr;
    try {
      await api('PUT', '/api/settings', { settings: s });
      S = mergeSettings(s);
      settingsSaved = true;
      dirtyS = false;
      toast('설정을 저장했습니다.');
    } catch (e) { toast(e.message, 'err'); }
  }
  $('#sSave').onclick = saveS;
  pageSave = saveS;
  $('#sSave2').onclick = saveS;
  leaveGuard = async () => {
    if (!dirtyS) return true;
    const v = await modal({ title: '설정을 저장하지 않았습니다', body: '<p>저장할까요?</p>', buttons: [{ label: '저장 안 함', value: 'drop' }, { label: '저장', value: 'save', kind: 'primary' }] });
    if (v === 'save') { await saveS(); return true; }
    return v === 'drop';
  };
  leaveGuard.dirty = () => dirtyS;
}
function setPath(o, k, v) {
  const ps = k.split('.');
  const last = ps.pop();
  const t = ps.reduce((a, p, i) => (a[p] ??= /^\d+$/.test(ps[i + 1] ?? last) ? [] : {}), o);
  t[last] = v;
}

// ── 시작 ───────────────────────────────────────────────────────────
// 어느 화면에서나 Ctrl+S = 그 화면의 저장(브라우저 '페이지 저장' 창은 막는다)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
  e.preventDefault();
  if (!$('#modal').hidden) return;
  if (pageSave) pageSave(); else toast('이 화면에는 저장할 내용이 없습니다.');
});
// 날짜 칸 어디를 눌러도 달력이 뜨게
document.addEventListener('click', (e) => { const el = e.target; if (el instanceof HTMLInputElement && el.type === 'date' && el.showPicker) { try { el.showPicker(); } catch (x) { /* 지원 안 하는 브라우저 */ } } });
navSeg = segInit($('#topNav'));
loadSettings().catch((e) => toast(e.message, 'err')).finally(route);
