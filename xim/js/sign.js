// 계약서 서명 화면 (sign.plators.com/<5자>) — 갑이 계약서를 읽고, 손가락 · 마우스로 서명해 완료한 뒤 PDF 로 내려받는다
import { $, esc, toast } from './common.js';
import { contractHtml, downloadPdf } from './contract-doc.js';

const box = $('#sign');
const code = (location.pathname.match(/([A-Za-z0-9]{5})\/?$/) || [])[1];
const API = `/api/sign/${code}`;
let c = null;

async function load() {
  if (!code) return fail('주소가 잘못됐습니다. 받은 계약서 주소를 다시 확인해 주세요.');
  try {
    const r = await fetch(API, { headers: { Accept: 'application/json' } });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return fail(out.error || '계약서를 열지 못했습니다.');
    c = out;
    render();
  } catch { fail('계약서를 열지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
}
function fail(msg) { box.innerHTML = `<section class="card sign-msg"><h1>계약서를 열 수 없습니다</h1><p>${esc(msg)}</p></section>`; }

function render() {
  const signed = c.status === 'signed';
  document.title = `홈페이지 제작 계약서 — ${c.client_name}`;
  box.innerHTML = `
    <div class="sign-top">
      <span class="badge ${signed ? 'done' : 'new'}">${signed ? '서명 완료' : '서명 대기'}</span>
      <p>${signed ? '서명이 끝난 계약서입니다. PDF 로 내려받아 보관해 주세요.' : '계약서를 끝까지 읽고, 맨 아래에서 서명해 주세요.'}</p>
      ${signed ? '<button class="btn primary" type="button" data-pdf>PDF 내려받기</button>' : ''}
    </div>
    ${contractHtml(c, c.eul, { signSlot: '<span class="ct-sign-ph">아래에서 서명</span>' })}
    ${signed ? '' : `
    <section class="card sign-pad" aria-label="갑 서명">
      <div class="sign-pad-head"><h2>갑 서명 <small>${esc(c.client_name)}</small></h2><button class="btn sm" type="button" data-clear>다시 쓰기</button></div>
      <div class="sign-canvas"><canvas aria-label="이 칸에 서명해 주세요"></canvas><span class="sign-hint">이 칸에 손가락이나 마우스로 서명해 주세요</span></div>
      <label class="st-check sign-agree"><input type="checkbox" data-agree><span><b>계약 내용을 모두 읽었고 동의합니다.</b></span></label>
      <p class="err" role="alert" data-err></p>
      <button class="btn primary sign-done" type="button" data-done>서명하고 완료</button>
    </section>`}`;
  box.querySelector('[data-pdf]')?.addEventListener('click', pdf);
  if (!signed) pad();
}

async function pdf(e) {
  const b = e.currentTarget;
  const orig = b.innerHTML;
  b.disabled = true; b.innerHTML = '<span class="spin" aria-hidden="true"></span>PDF 만드는 중…';
  try { await downloadPdf(c, c.eul); } catch (err) { toast(err.message || 'PDF 를 만들지 못했습니다.'); } finally { b.disabled = false; b.innerHTML = orig; }
}

// ───────── 서명 칸 ─────────
function pad() {
  const wrap = box.querySelector('.sign-canvas');
  const cv = wrap.querySelector('canvas');
  const ctx = cv.getContext('2d');
  let strokes = [];   // 크기가 바뀌면 다시 그리려고 점을 모아 둔다 (0~1 비율)
  let cur = null;
  const size = () => {
    const r = wrap.getBoundingClientRect(); const k = devicePixelRatio || 1;
    cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k);
    redraw();
  };
  const line = () => { ctx.lineWidth = Math.max(2.4, cv.width / 260); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; };
  const redraw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height); line();
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x * cv.width, y * cv.height) : ctx.moveTo(x * cv.width, y * cv.height)));
      if (s.length === 1) ctx.lineTo(s[0][0] * cv.width + 0.1, s[0][1] * cv.height);
      ctx.stroke();
    }
    wrap.classList.toggle('has-ink', strokes.length > 0);
  };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const p = pt(e); const q = cur[cur.length - 1];
    cur.push(p);
    line(); ctx.beginPath(); ctx.moveTo(q[0] * cv.width, q[1] * cv.height); ctx.lineTo(p[0] * cv.width, p[1] * cv.height); ctx.stroke();
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  addEventListener('resize', size);
  size();
  box.querySelector('[data-clear]').onclick = () => { strokes = []; redraw(); };

  const err = box.querySelector('[data-err]');
  box.querySelector('[data-done]').onclick = async (e) => {
    err.textContent = '';
    if (!strokes.length || strokes.flat().length < 6) { err.textContent = '서명 칸에 서명을 그려 주세요.'; return; }
    if (!box.querySelector('[data-agree]').checked) { err.textContent = '계약 내용에 동의한다는 칸을 눌러 주세요.'; return; }
    const b = e.currentTarget;
    b.disabled = true; b.innerHTML = '<span class="spin" aria-hidden="true"></span>보내는 중…';
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agree: true, sign: exportSign(strokes) }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || '서명을 보내지 못했습니다.');
      removeEventListener('resize', size);
      await load();
      toast('서명이 완료됐습니다. PDF 로 내려받아 보관해 주세요.');
      scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = '서명하고 완료'; }
  };
}

// 그린 선만 남게 여백을 잘라 투명 PNG 로 (가로 600px 정도)
function exportSign(strokes) {
  const pts = strokes.flat();
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const W = 900; const H = 300;   // 서명 칸 비율(3:1)대로
  const pad = 0.03;
  const x0 = Math.max(0, Math.min(...xs) - pad); const x1 = Math.min(1, Math.max(...xs) + pad);
  const y0 = Math.max(0, Math.min(...ys) - pad * 3); const y1 = Math.min(1, Math.max(...ys) + pad * 3);
  const sw = (x1 - x0) * W; const sh = (y1 - y0) * H;
  const k = Math.min(1, 600 / sw);
  const cv = document.createElement('canvas');
  cv.width = Math.max(40, Math.round(sw * k)); cv.height = Math.max(20, Math.round(sh * k));
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 5 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  const X = (x) => (x - x0) * W * k; const Y = (y) => (y - y0) * H * k;
  for (const s of strokes) {
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    if (s.length === 1) ctx.lineTo(X(s[0][0]) + 0.1, Y(s[0][1]));
    ctx.stroke();
  }
  return cv.toDataURL('image/png');
}

load();
