// 신청서 (/member/apply) — 한 단계씩: 안내 → 항목들 → 서류 → 확인 → 내기
//   적는 대로 이 기기에 임시 저장(localStorage), 사진은 WEBP 로 줄여서 올린다(editor.js shrinkImage).
import { $, $$, esc, makeApi, busy, toast } from './common.js';
import { shrinkImage, uploadFile } from './editor.js';

const api = makeApi('/xms-api');
const root = $('[data-apply]');
const form = $('form[data-form=apply]', root);
const SPEC = JSON.parse($('[data-apply-form]', root).textContent);
const cards = $$('[data-step]', form);
const dots = $$('[data-dot]', form);
const LAST = cards.length - 1;
const FILE_STEP = LAST - 1;
const KEY = `xms-apply-${'preview' in root.dataset ? 'pv-' : ''}${root.dataset.round}-${root.dataset.user}`;
const err = $('.err', form);
let at = 0;
let shortOk = false; // 신청 사유가 짧아도 한 번 더 누르면 넘어간다

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const isImg = (mime) => /^image\//.test(mime);

// ───── 임시 저장 ─────
function collect() {
  const answers = {};
  SPEC.sections.forEach((s) => s.fields.forEach((f) => {
    const el = form.elements[f.k];
    answers[f.k] = (el instanceof RadioNodeList ? el.value : el?.value || '').trim();
  }));
  const files = {};
  $$('[data-file]', form).forEach((box) => { files[box.dataset.file] = $$('li[data-id]', box).map((li) => ({ id: li.dataset.id, name: li.dataset.name, mime: li.dataset.mime, size: +li.dataset.size })); });
  return { answers, files, agree: form.elements.agree.checked };
}
// 저장: 이 기기(localStorage)에 바로 + 서버에 1.2초 뒤(임시 저장). 서버에 못 보내면(인터넷 끊김) 이 기기에 두었다가 다시 연결되면 보낸다.
const PREVIEW = 'preview' in root.dataset;
const st = $('[data-save-st]', form);
let dirtyAt = 0; let sentAt = 0; let sending = null; let srvT = 0;
const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
const showSt = (txt, cls = '') => { st.textContent = txt; st.className = `ap-save-st ${cls}`; };
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify({ ...collect(), step: at, at: Date.now() })); } catch { /* 저장 못 해도 계속 */ } }
async function saveServer() {
  if (PREVIEW) { showSt('미리보기라 저장하지 않습니다.'); return; }
  if (sending) return sending;
  const mark = dirtyAt;
  const d = collect();
  showSt('저장 중…', 'busy');
  sending = api('/apply/draft', { method: 'PUT', data: { round: +root.dataset.round, answers: d.answers, agree: d.agree, step: at, files: Object.fromEntries(Object.entries(d.files).map(([k, l]) => [k, l.map((x) => x.id)])) } })
    .then(() => { sentAt = mark; showSt(`서버에 저장됨 · ${hhmm(Date.now())}`, 'ok'); })
    .catch((e) => { showSt(navigator.onLine === false || !e.status ? '인터넷이 끊겼습니다 — 이 기기에 저장해 두고, 다시 연결되면 자동으로 저장합니다.' : e.message, 'warn'); })
    .finally(() => { sending = null; if (dirtyAt > sentAt && navigator.onLine !== false) { clearTimeout(srvT); srvT = setTimeout(saveServer, 3000); } });
  return sending;
}
const save = () => { dirtyAt = Date.now(); saveLocal(); clearTimeout(srvT); srvT = setTimeout(saveServer, 1200); };
addEventListener('online', () => { if (dirtyAt > sentAt) saveServer(); });
// 창을 닫거나 다른 앱으로 넘어갈 때 아직 못 보낸 게 있으면 바로 보낸다
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirtyAt > sentAt) { clearTimeout(srvT); saveServer(); } });
$('[data-save-now]', form).addEventListener('click', () => { dirtyAt = Date.now(); saveLocal(); clearTimeout(srvT); saveServer(); });
function restore() {
  const srv = JSON.parse($('[data-apply-draft]', root)?.textContent || 'null');
  let loc = null;
  try { loc = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { loc = null; }
  if ('done' in root.dataset && !srv) return; // 이미 낸 신청서는 서버 값 그대로 (그 뒤 고치던 임시 저장이 있으면 그것)
  // 이 기기 것과 서버 것 중 나중 것 (서버가 늦으면 다른 기기에서 쓴 것)
  const d = loc && (!srv || loc.at > srv.at) && !('done' in root.dataset) ? loc : srv;
  if (!d) return;
  if (d === loc && (!srv || loc.at > srv.at)) dirtyAt = Date.now(); // 서버에 못 간 것 → 곧 보낸다
  restored = d.step || 0;
  Object.entries(d.answers || {}).forEach(([k, v]) => {
    const el = form.elements[k];
    if (!el || !v) return;
    if (el instanceof RadioNodeList) { const r = [...el].find((x) => x.value === v); if (r) r.checked = true; } else el.value = v;
  });
  Object.entries(d.files || {}).forEach(([k, list]) => {
    const ul = $(`[data-file="${k}"] [data-list]`, form);
    if (!ul || !list.length) return;
    ul.innerHTML = '';
    list.forEach((f) => ul.append(fileItem(f)));
  });
  if (d.agree) form.elements.agree.checked = true;
  showSt(`${d === srv ? '서버에' : '이 기기에'} 저장해 둔 내용을 불러왔습니다 · ${hhmm(d.at)}`, 'ok');
  if ('done' in root.dataset) { $('[data-done-card]', root).hidden = true; form.hidden = false; }
}
let restored = 0;

// ───── 서류 ─────
function fileItem(f) {
  const li = document.createElement('li');
  Object.assign(li.dataset, { id: f.id, name: f.name, mime: f.mime, size: f.size });
  li.innerHTML = `${isImg(f.mime) ? `<img src="/xms/upload/${esc(f.id)}" alt="" loading="lazy">` : '<span class="ap-pdf">PDF</span>'}
    <a href="/xms/upload/${esc(f.id)}" target="_blank" rel="noopener">${esc(f.name)}</a><small>${kb(f.size)}</small>
    <button type="button" class="ap-x" aria-label="${esc(f.name)} 빼기">✕</button>`;
  return li;
}
function refreshFiles() {
  $$('[data-file]', form).forEach((box) => {
    const n = $$('li[data-id]', box).length;
    box.classList.toggle('has', n > 0);
    $('.ap-file-btn span', box).textContent = n ? '파일 더 올리기' : '파일 올리기';
    $('.ap-file-btn', box).hidden = n >= SPEC.max;
  });
}
form.addEventListener('click', (e) => {
  const x = e.target.closest('.ap-x');
  if (!x) return;
  x.closest('li').remove(); refreshFiles(); save();
});
$$('[data-pick]', form).forEach((input) => input.addEventListener('change', async () => {
  const box = input.closest('[data-file]');
  const ul = $('[data-list]', box);
  const picked = [...input.files].slice(0, Math.max(0, SPEC.max - $$('li', ul).length));
  input.value = '';
  for (const raw of picked) {
    const li = document.createElement('li');
    li.className = 'busy';
    li.innerHTML = `<span class="ap-pdf">…</span><span>${esc(raw.name)}</span><small>올리는 중</small>`;
    ul.append(li);
    try {
      // 사진은 WEBP 로 줄인다 — 서류 글자가 읽히게 긴 변 2000px, 700KB 안팎
      const file = await shrinkImage(raw, { max: 2000, maxBytes: 700000 }).catch(() => raw);
      if (!/^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(file.type)) throw new Error('사진(JPG · PNG · WEBP) 이나 PDF 만 올릴 수 있습니다.');
      const u = await uploadFile('@apply', 'APPLY', file);
      li.replaceWith(fileItem(u));
    } catch (e2) {
      li.remove();
      toast(e2.message || '올리지 못했습니다.');
    }
  }
  refreshFiles(); save();
}));

// ───── 단계 ─────
function show(n, scroll = true) {
  at = Math.max(0, Math.min(LAST, n));
  cards.forEach((c, i) => { c.hidden = i !== at; });
  dots.forEach((d, i) => { d.classList.toggle('on', i <= at); d.classList.toggle('now', i === at); });
  $('[data-now-no]', form).textContent = at + 1;
  $('[data-now-t]', form).textContent = $('span', dots[at]).textContent;
  $('[data-prev]', form).hidden = at === 0;
  $('[data-next]', form).hidden = at === LAST;
  $('[data-submit]', form).hidden = at !== LAST;
  err.textContent = '';
  if (at === LAST) review();
  if (scroll) root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
function check(n) {
  const card = cards[n];
  if (n === 0 && !form.elements.agree.checked) return '개인정보 수집 · 이용에 동의해 주세요.';
  for (const el of $$('input[required], textarea[required]', card)) {
    if (el.type === 'radio') {
      if (!form.elements[el.name].value) { el.focus(); return `'${el.closest('fieldset').querySelector('legend').textContent.replace('*', '').trim()}' 을(를) 골라 주세요.`; }
    } else if (!el.value.trim()) { el.focus(); return `'${el.closest('label').querySelector('span').textContent.replace('*', '').trim()}' 을(를) 적어 주세요. 해당 사항이 없으면 '없음'이라고 적어 주세요.`; }
  }
  const long = $('textarea[data-target]', card);
  if (long && long.value.trim().length < +long.dataset.target && !shortOk) {
    shortOk = true;
    return `신청 사유가 ${long.value.trim().length}자입니다. A4 반 페이지(약 ${long.dataset.target}자)보다 짧으면 지원하지 않은 것으로 볼 수 있어요. 그대로 넘어가려면 [다음]을 한 번 더 누르세요.`;
  }
  if (n === FILE_STEP) {
    if ($('li.busy', card)) return '파일을 올리는 중입니다. 잠깐만 기다려 주세요.';
    const miss = $$('[data-file]', card).filter((b) => !$('li[data-id]', b)).map((b) => $('.ap-file-h b', b).textContent.replace('*', '').trim());
    if (miss.length) return `서류를 모두 올려 주세요: ${miss.join(', ')}`;
  }
  return '';
}
function review() {
  const { answers, files } = collect();
  const row = (label, v) => `<div><dt>${esc(label)}</dt><dd>${v}</dd></div>`;
  $('[data-review]', form).innerHTML = [
    ...SPEC.sections.map((s, i) => `<div class="ap-rv"><h3>${esc(s.title)}<button type="button" class="linkish" data-go="${i + 1}">고치기</button></h3>
      <dl class="ap-kv">${s.fields.map((f) => row(f.label, f.type === 'textarea' ? `<span class="ap-pre">${esc(answers[f.k])}</span><small>${answers[f.k].length}자</small>` : esc(answers[f.k]))).join('')}</dl></div>`),
    `<div class="ap-rv"><h3>서류<button type="button" class="linkish" data-go="${FILE_STEP}">고치기</button></h3>
      <dl class="ap-kv">${SPEC.files.map((f) => row(f.label, `${(files[f.k] || []).length}개 · ${esc((files[f.k] || []).map((x) => x.name).join(', '))}`)).join('')}</dl></div>`,
  ].join('');
}
form.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) show(+g.dataset.go);
});
$('[data-next]', form).addEventListener('click', () => {
  const m = check(at);
  if (m) { err.textContent = m; return; }
  shortOk = false; show(at + 1); save();
});
$('[data-prev]', form).addEventListener('click', () => show(at - 1));

// 신청 사유 글자 수
$$('textarea[data-target]', form).forEach((t) => {
  const out = $(`[data-count-for="${t.name}"]`, form);
  const upd = () => { const n = t.value.trim().length; out.textContent = `${n.toLocaleString()}자 / 약 ${(+t.dataset.target).toLocaleString()}자 이상`; out.classList.toggle('ok', n >= +t.dataset.target); };
  t.addEventListener('input', () => { upd(); shortOk = false; });
  upd();
});
let saveT = 0;
form.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(save, 400); });
form.addEventListener('change', save);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  busy($('[data-submit]', form), err, async () => {
    if ('preview' in root.dataset) throw new Error('관리자 미리보기에서는 낼 수 없습니다. 신청 기간에 다시 해 주세요.');
    for (let i = 0; i < LAST; i++) {
      const prevShort = shortOk; shortOk = true; // 짧은 사유는 이미 알렸다
      const m = check(i); shortOk = prevShort;
      if (m) { show(i); err.textContent = m; return; }
    }
    const d = collect();
    const turnstile = form.querySelector('[name="cf-turnstile-response"]')?.value || '';
    if ($('.cf-turnstile', form) && !turnstile) throw new Error('사람인지 확인하는 칸을 먼저 끝내 주세요.');
    try {
      await api('/apply', { method: 'POST', data: { round: +root.dataset.round, answers: d.answers, agree: d.agree, files: Object.fromEntries(Object.entries(d.files).map(([k, l]) => [k, l.map((x) => x.id)])), turnstile } });
    } catch (e2) {
      if (window.turnstile) try { window.turnstile.reset(); } catch { /* 위젯 없음 */ }
      throw e2;
    }
    try { localStorage.removeItem(KEY); } catch { /* 그대로 */ }
    location.replace(`${location.pathname}?sent=1`);
  });
});

// 이미 낸 신청서: [신청서 고치기]
$('[data-edit]', root)?.addEventListener('click', () => {
  $('[data-done-card]', root).hidden = true;
  form.hidden = false;
  show(1);
});
if (new URLSearchParams(location.search).get('sent')) {
  toast('신청서를 냈습니다. 감사합니다!');
  history.replaceState(null, '', location.pathname);
}

$$('[data-list] li[data-id]', form).forEach((li) => li.replaceWith(fileItem({ ...li.dataset, size: +li.dataset.size }))); // 이미 낸 서류
restore();
refreshFiles();
show(Math.min(restored, LAST - 1), false);
if (dirtyAt) saveServer();
