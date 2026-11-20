// 배치 결과(layout) → 미리보기 SVG · PDF · 엑셀 · 워드(.docx, 한컴오피스에서도 열림)
import { PT, FONT, PAGE, PGAP, PSTEP, pageModels } from './layout.js';

export const FONT_URL = {
  woff2: ['https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Regular.woff2',
          'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-Bold.woff2'],
  ttf: ['https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Regular.ttf',
        'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf'],
};
const LIB = {
  exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
};

// 문서 글꼴(재는 글꼴 = 그리는 글꼴) 불러오기
let fontReady = null;
export function loadDocFont() {
  if (fontReady) return fontReady;
  fontReady = Promise.all(FONT_URL.woff2.map((u, i) => {
    const f = new FontFace(FONT, `url(${u})`, { weight: i ? '700' : '400' });
    return f.load().then((ff) => document.fonts.add(ff));
  }));
  return fontReady;
}

const libs = {};
function loadScript(key) {
  if (libs[key]) return libs[key];
  libs[key] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIB[key];
    s.onload = res;
    s.onerror = () => { libs[key] = null; rej(new Error('라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return libs[key];
}

// 겹치는 테두리선은 하나로(굵은 쪽 우선)
function segments(model) {
  const m = new Map();
  const r = (v) => Math.round(v * 100) / 100;
  const put = (x1, y1, x2, y2, w, c) => {
    if (!w) return;
    const k = `${r(x1)},${r(y1)},${r(x2)},${r(y2)}`;
    const o = m.get(k);
    if (!o || o.w < w || (o.w === w && o.c !== '#111111' && c === '#111111')) m.set(k, { x1, y1, x2, y2, w, c });
  };
  for (const b of model.boxes) {
    const { x, y, w, h, border: d } = b;
    const c = b.lc || '#111111';
    put(x, y, x + w, y, d.t, c); put(x, y + h, x + w, y + h, d.b, c);
    put(x, y, x, y + h, d.l, c); put(x + w, y, x + w, y + h, d.r, c);
  }
  return [...m.values()].sort((a, b) => a.w - b.w);
}

// 그림: 문자열(직인 하나) 또는 { stamp, seal }
const imgOf = (imgs, key) => (!imgs ? null : typeof imgs === 'string' || imgs instanceof ArrayBuffer ? (key === 'stamp' ? imgs : null) : imgs[key] || null);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (v) => +v.toFixed(3);

// 여러 장이면 장을 위아래로 이어 그린다(장 사이는 비워 둔다)
export const svgHeight = (model) => (model.pages || 1) * PSTEP - PGAP;
export function toSVG(model, stampUrl) {
  const o = [];
  const H = svgHeight(model);
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${H}" width="${PAGE.w}mm" height="${H}mm" font-family="${FONT}, Pretendard, sans-serif">`);
  const n = model.pages || 1;
  for (let k = 0; k < n; k++) o.push(`<rect y="${k * PSTEP}" width="${PAGE.w}" height="${PAGE.h}" fill="#fff"${n > 1 ? ' stroke="#d5d8dc" stroke-width="0.3"' : ''}/>`);
  for (const b of model.boxes) if (b.fill) o.push(`<rect x="${f2(b.x)}" y="${f2(b.y)}" width="${f2(b.w)}" height="${f2(b.h)}" fill="${b.fill}"/>`);
  // 글자는 100배 크기로 쓰고 줄여서 그린다(작은 글자 크기를 브라우저가 반올림해 폭이 어긋나는 것을 막는다)
  const tx = [];
  for (const b of model.boxes) {
    for (const r of b.runs) {
      tx.push(`<text x="${f2(r.x * 100)}" y="${f2(r.y * 100)}" font-size="${f2(r.size * PT * 100)}" font-weight="${r.b ? 700 : 400}" fill="${b.color}" xml:space="preserve">${esc(r.t)}</text>`);
      if (r.u && r.w) o.push(`<line x1="${f2(r.x)}" y1="${f2(r.y + r.size * PT * 0.14)}" x2="${f2(r.x + r.w)}" y2="${f2(r.y + r.size * PT * 0.14)}" stroke="${b.color}" stroke-width="${f2(r.size * PT * 0.06)}"/>`);
    }
  }
  o.push(`<g transform="scale(0.01)">${tx.join('')}</g>`);
  for (const s of segments(model)) o.push(`<line x1="${f2(s.x1)}" y1="${f2(s.y1)}" x2="${f2(s.x2)}" y2="${f2(s.y2)}" stroke="${s.c}" stroke-width="${s.w}" stroke-linecap="square"/>`);
  for (const im of model.images) if (imgOf(stampUrl, im.key)) o.push(`<image href="${imgOf(stampUrl, im.key)}" x="${f2(im.x)}" y="${f2(im.y)}" width="${im.w}" height="${im.h}" style="mix-blend-mode:multiply"/>`);
  if (model.overflow) o.push(`<rect x="0" y="${PAGE.h - 6}" width="${PAGE.w}" height="6" fill="#d33" opacity=".85"/><text x="${PAGE.w / 2}" y="${PAGE.h - 1.8}" font-size="3.4" fill="#fff" text-anchor="middle">항목이 많아 A4 한 장을 넘습니다</text>`);
  o.push('</svg>');
  return o.join('');
}

// ── PDF ────────────────────────────────────────────────────────────
let ttf = null;
async function loadTTF() {
  if (ttf) return ttf;
  const toB64 = (buf) => {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const bufs = await Promise.all(FONT_URL.ttf.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error('PDF 글꼴을 받지 못했습니다.'); return r.arrayBuffer(); })));
  ttf = bufs.map(toB64);
  return ttf;
}

export async function toPDF(model, stampDataUrl, meta = {}) {
  await loadScript('jspdf');
  const [reg, bold] = await loadTTF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('PretendardDoc-Regular.ttf', reg);
  pdf.addFont('PretendardDoc-Regular.ttf', 'PD', 'normal');
  pdf.addFileToVFS('PretendardDoc-Bold.ttf', bold);
  pdf.addFont('PretendardDoc-Bold.ttf', 'PD', 'bold');
  pdf.setProperties({ title: meta.title || '', author: meta.author || '', creator: meta.author || '' });
  pageModels(model).forEach((m, k) => { if (k) pdf.addPage('a4', 'portrait'); pdfPage(pdf, m, stampDataUrl); });
  return pdf.output('blob');
}
function pdfPage(pdf, model, stampDataUrl) {
  for (const b of model.boxes) if (b.fill) { pdf.setFillColor(b.fill); pdf.rect(b.x, b.y, b.w, b.h, 'F'); }
  for (const b of model.boxes) {
    pdf.setTextColor(b.color);
    for (const r of b.runs) {
      pdf.setFont('PD', r.b ? 'bold' : 'normal');
      pdf.setFontSize(r.size);
      pdf.text(r.t, r.x, r.y, { baseline: 'alphabetic' });
      if (r.u && r.w) {
        pdf.setDrawColor(b.color);
        pdf.setLineWidth(r.size * PT * 0.06);
        pdf.line(r.x, r.y + r.size * PT * 0.14, r.x + r.w, r.y + r.size * PT * 0.14);
      }
    }
  }
  pdf.setDrawColor('#111111');
  pdf.setLineCap('square');
  for (const s of segments(model)) { pdf.setDrawColor(s.c); pdf.setLineWidth(s.w); pdf.line(s.x1, s.y1, s.x2, s.y2); }
  for (const im of model.images) { const u = imgOf(stampDataUrl, im.key); if (u) pdf.addImage(u, 'PNG', im.x, im.y, im.w, im.h); }
}

// ── 엑셀 ───────────────────────────────────────────────────────────
// mm → 열 너비(기본 글꼴 Calibri 11, 최대 숫자 폭 7px 기준) · 행 높이(pt)
const PX = 96 / 25.4;
// 폭 1 미만 열은 엑셀이 '폭 × 12px' 로 그린다
const colChars = (mm) => { const px = mm * PX; return px < 12 ? +(px / 12).toFixed(3) : +((px - 5) / 7).toFixed(2); };
const rowPt = (mm) => +(mm * 72 / 25.4).toFixed(2);
const argb = (hex) => 'FF' + hex.replace('#', '').toUpperCase();
const XL_FONT = '맑은 고딕';

function colName(n) { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

function edges(vals) {
  const s = [...new Set(vals.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > 0.35) out.push(v);
  return out;
}
const idx = (arr, v) => { let best = 0; arr.forEach((a, i) => { if (Math.abs(a - v) < Math.abs(arr[best] - v)) best = i; }); return best; };

// 여러 장 → 엑셀: 장의 내용을 틈 없이 이어 붙이고, 장 경계에서 페이지를 나눈다
function stackPages(model) {
  const ps = pageModels(model);
  if (ps.length < 2) return model;
  const boxes = [], images = [], breaks = [];
  let cum = 0;
  ps.forEach((m, k) => {
    const top = k ? Math.min(...m.boxes.map((b) => b.y)) : 0;
    const bot = Math.max(...m.boxes.map((b) => b.y + b.h), ...m.images.map((im) => im.y + im.h));
    const dy = cum - top;
    m.boxes.forEach((b) => boxes.push({ ...b, y: b.y + dy }));
    m.images.forEach((im) => images.push({ ...im, y: im.y + dy }));
    cum += bot - top;
    if (k < ps.length - 1) breaks.push(cum);
  });
  return { ...model, boxes, images, breaks };
}

export async function toXLSX(model0, stampBuf, meta = {}) {
  await loadScript('exceljs');
  const model = stackPages(model0);
  const multi = (model.breaks || []).length > 0;
  const wb = new window.ExcelJS.Workbook();
  wb.creator = meta.author || '';
  wb.created = new Date();
  const ws = wb.addWorksheet((meta.sheet || '문서').slice(0, 31), {
    views: [{ showGridLines: false, zoomScale: 100 }],
    pageSetup: {
      paperSize: 9, orientation: 'portrait', ...(multi ? { fitToPage: false, scale: 100 } : { fitToPage: true, fitToWidth: 1, fitToHeight: 1 }),
      horizontalCentered: true, verticalCentered: false,
      margins: { left: 0.39, right: 0.39, top: 0.47, bottom: 0.39, header: 0.2, footer: 0.2 },
    },
  });
  // 직인 왼쪽 위 모서리도 칸 경계로 넣어 그림 위치가 엑셀에서 어긋나지 않게 한다
  const ims = model.images.filter((im) => imgOf(stampBuf, im.key));
  const xs = edges([...model.boxes.flatMap((b) => [b.x, b.x + b.w]), ...ims.map((im) => im.x)]);
  const ys = edges([...model.boxes.flatMap((b) => [b.y, b.y + b.h]), ...ims.map((im) => im.y), ...(model.breaks || [])]);
  for (let i = 0; i < xs.length - 1; i++) ws.getColumn(i + 1).width = colChars(xs[i + 1] - xs[i]);
  for (let j = 0; j < ys.length - 1; j++) ws.getRow(j + 1).height = rowPt(ys[j + 1] - ys[j]);
  const nCol = xs.length - 1, nRow = ys.length - 1;
  (model.breaks || []).forEach((by) => { const r = idx(ys, by); if (r > 0) ws.getRow(r).addPageBreak(); });

  // 1차: 칸 위치와 이름(id) 주소
  const placed = model.boxes.map((b) => {
    const c1 = idx(xs, b.x), c2 = Math.max(c1, idx(xs, b.x + b.w) - 1);
    const r1 = idx(ys, b.y), r2 = Math.max(r1, idx(ys, b.y + b.h) - 1);
    return { b, c1, c2, r1, r2 };
  });
  const addr = {};
  placed.forEach((p) => { if (p.b.id) addr[p.b.id] = `${colName(p.c1)}${p.r1 + 1}`; });

  // 일단가 보조 칸: 인쇄 영역 오른쪽 바깥 (여기 한 칸만 고치면 표 전체 단가가 바뀐다)
  const hc = nCol + 1;
  ws.getColumn(hc + 1).width = 16;
  ws.getColumn(hc + 2).width = 14;
  (model.helpers || []).forEach((h, i) => { addr[h.id] = `$${colName(hc + 1)}$${2 + i}`; });
  const resolve = (f) => f.replace(/\{(\w+)\}/g, (_, k) => addr[k] || '0');

  (model.helpers || []).forEach((h, i) => {
    const r = 2 + i;
    const lc = ws.getCell(r, hc + 1), vc = ws.getCell(r, hc + 2);
    lc.value = h.label;
    lc.style = { font: { name: XL_FONT, size: 9, color: { argb: 'FF666666' } } };
    vc.value = h.f ? { formula: h.f, result: h.v } : h.v;
    vc.style = { numFmt: '#,##0', font: { name: XL_FONT, size: 9, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF6D5' } } };
  });
  if ((model.helpers || []).length) {
    const t = ws.getCell(1, hc + 1);
    t.value = '※ 인쇄 안 됨 · 단가를 바꾸면 표가 다시 계산됩니다';
    t.style = { font: { name: XL_FONT, size: 8, color: { argb: 'FF999999' } } };
  }

  // 2차: 값 · 모양
  // 배경 장식(색 띠 · 가는 선)은 합치지 않고 칸 색 · 테두리만 먼저 칠한다
  const bsOf = (b, w) => (w ? { style: w > 0.3 ? 'medium' : w < 0.15 ? 'hair' : 'thin', color: { argb: argb(b.lc || '#111111') } } : undefined);
  for (const { b, c1, c2, r1, r2 } of placed.filter((p) => p.b.bg)) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r + 1, c + 1);
      const border = { ...((cell.style && cell.style.border) || {}) };
      if (r === r1 && b.border.t) border.top = bsOf(b, b.border.t);
      if (r === r2 && b.border.b && b.h > 0.4) border.bottom = bsOf(b, b.border.b);
      cell.style = { ...(cell.style || {}), border, ...(b.fill && { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(b.fill) } } }) };
    }
  }
  for (const { b, c1, c2, r1, r2 } of placed.filter((p) => !p.b.bg)) {
    if (c2 > c1 || r2 > r1) { try { ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1); } catch (e) { /* 겹친 칸은 합치지 않는다 */ } }
    // 맑은 고딕은 줄 간격이 넓어 두 줄 이상인 좁은 칸은 조금 줄인다
    const size = b.valign === 'top' ? +(b.size * 0.93).toFixed(2) : b.lines > 1 ? +(b.size * 0.9).toFixed(2) : b.size;
    const font = { name: XL_FONT, size, bold: b.bold, color: { argb: argb(b.color) }, ...(b.underline && { underline: true }) };
    const alignment = { horizontal: b.spread ? 'center' : b.align, vertical: b.valign === 'top' ? 'top' : 'middle', wrapText: !b.spread && (b.lines > 1 || b.valign === 'top'), shrinkToFit: b.lines === 1 && b.valign !== 'top', ...(b.align !== 'center' && !b.spread && { indent: 1 }) };
    const fill = b.fill ? { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(b.fill) } } : undefined;
    let value = null, numFmt;
    if (b.cell) {
      value = b.cell.f ? { formula: resolve(b.cell.f), result: b.cell.v } : b.cell.v;
      numFmt = b.cell.fmt;
    } else if (b.rich.some((s) => s.b) && !b.bold) {
      value = { richText: b.rich.map((s) => ({ text: s.t, font: { ...font, bold: s.b, ...(s.b && b.id === 'notes' && { underline: true }) } })) };
    } else if (b.rich.length) {
      // 미리보기와 같은 자리에서 줄을 바꾼다
      value = b.lineTexts && b.lineTexts.length > 1 ? b.lineTexts.join('\n') : b.rich.map((s) => s.t).join('');
      // 균등 배치 글자(수    신)는 칸 폭에 맞춰 띄어 쓴다
      if (b.spread) {
        const ch = [...value.replace(/\s+/g, '')];
        const gap = ch.length <= 2 ? (b.w >= 19 ? '      ' : '   ') : ch.length === 3 ? '   ' : ch.length === 4 && b.w >= 22 ? '  ' : ' ';
        value = ch.join(b.w < 19 && ch.length >= 3 ? '' : gap);
      }
    }
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const bs = (w) => (w ? { style: w > 0.3 ? 'medium' : w < 0.15 ? 'hair' : 'thin', color: { argb: argb(b.lc || '#111111') } } : undefined);
        const border = {};
        if (r === r1 && b.border.t) border.top = bs(b.border.t);
        if (r === r2 && b.border.b) border.bottom = bs(b.border.b);
        if (c === c1 && b.border.l) border.left = bs(b.border.l);
        if (c === c2 && b.border.r) border.right = bs(b.border.r);
        const cell = ws.getCell(r + 1, c + 1);
        const prev = cell.style && cell.style.border ? cell.style.border : {};
        const pfill = cell.style && cell.style.fill;
        cell.style = { font, alignment, ...((fill || pfill) && { fill: fill || pfill }), ...(numFmt && { numFmt }), border: { ...prev, ...border } };
      }
    }
    if (value !== null) ws.getCell(r1 + 1, c1 + 1).value = value;
  }
  ws.pageSetup.printArea = `A1:${colName(nCol - 1)}${nRow}`;

  // 직인: 실제 지름 18mm
  {
    for (const im of ims) {
      const ci = xs.findIndex((v, i) => i < nCol && im.x < xs[i + 1]);
      const ri = ys.findIndex((v, i) => i < nRow && im.y < ys[i + 1]);
      const col = ci + (im.x - xs[ci]) / (xs[ci + 1] - xs[ci]);
      const row = ri + (im.y - ys[ri]) / (ys[ri + 1] - ys[ri]);
      const id = wb.addImage({ buffer: imgOf(stampBuf, im.key), extension: 'png' });
      ws.addImage(id, { tl: { col, row }, ext: { width: im.w * PX, height: im.h * PX }, editAs: 'oneCell' });
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// 인쇄: A4 한 장짜리 창을 열어 바로 인쇄
// 장마다 A4 한 장짜리 SVG
export const pageSVGs = (model, stampUrl) => pageModels(model).map((m) => toSVG(m, stampUrl));
export function printSVG(svg, title) {
  if (Array.isArray(svg)) svg = svg.join('');
  const w = window.open('', '_blank');
  if (!w) throw new Error('팝업이 막혀 인쇄 창을 열지 못했습니다.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@font-face{font-family:${FONT};src:url(${FONT_URL.woff2[0]});font-weight:400}
@font-face{font-family:${FONT};src:url(${FONT_URL.woff2[1]});font-weight:700}
@page{size:A4;margin:0}html,body{margin:0}svg{display:block;width:210mm;height:297mm;break-after:page}svg:last-child{break-after:auto}
</style></head><body>${svg}</body></html>`);
  w.document.close();
  w.document.fonts.ready.then(() => setTimeout(() => { w.focus(); w.print(); }, 200));
}

// 도장 그림 받기: 어떤 형식(png · jpeg · webp)이든 PNG 로 다시 그려 { url(data URL), buf(ArrayBuffer) } 로. 없거나 못 읽으면 null(도장 없이 만든다)
export async function stampPng(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL('image/png');
    return { url, buf: Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0)).buffer };
  } catch (e) { return null; }
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// ── 워드(.docx) ─────────────────────────────────────────────────────
//   칸 경계를 표의 열 · 행으로 바꾼 표 하나(행 높이 고정)로 만든다. 한컴오피스 한글에서도 그대로 열린다.
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TW = 1440 / 25.4;          // mm → twip
const EMU = 36000;               // mm → EMU
const hex = (c) => String(c || '#111111').replace('#', '').toUpperCase();

export async function toDOCX(model0, imgs, meta = {}) {
  await loadScript('jszip');
  // 장마다 표 하나, 장 사이는 쪽 나눔. 위 여백은 모든 장 같게(위가 빈 장은 빈 줄로 채움)
  const pms = pageModels(model0);
  const top0 = Math.min(...pms.map((m) => Math.min(...m.boxes.map((b) => b.y))));
  const bot0 = Math.max(...pms.map((m) => Math.max(...m.boxes.map((b) => b.y + b.h))));
  const rels = [];
  let imgN = 0, left = 0, right = 0;
  const bodies = pms.map((model) => {
  const ims = model.images.filter((im) => imgOf(imgs, im.key));
  const xs = edges(model.boxes.flatMap((b) => [b.x, b.x + b.w]));
  const ys = edges([top0, ...model.boxes.flatMap((b) => [b.y, b.y + b.h])]);
  const nCol = xs.length - 1, nRow = ys.length - 1;
  const placed = model.boxes.map((b) => {
    const c1 = idx(xs, b.x), c2 = Math.max(c1, idx(xs, b.x + b.w) - 1);
    const r1 = idx(ys, b.y), r2 = Math.max(r1, idx(ys, b.y + b.h) - 1);
    return { b, c1, c2, r1, r2 };
  });
  // 칸마다 주인(합친 칸) · 배경색 · 테두리
  const own = Array.from({ length: nRow }, () => new Array(nCol).fill(null));
  const bgFill = Array.from({ length: nRow }, () => new Array(nCol).fill(null));
  const bdr = Array.from({ length: nRow }, () => Array.from({ length: nCol }, () => ({})));
  const bline = (b, w) => ({ sz: Math.max(2, Math.round(w * 72 / 25.4 * 8)), color: hex(b.lc) });
  const edgeSet = (p) => {
    const { b, c1, c2, r1, r2 } = p;
    for (let c = c1; c <= c2; c++) { if (b.border.t) bdr[r1][c].top = bline(b, b.border.t); if (b.border.b && b.h > 0.4) bdr[r2][c].bottom = bline(b, b.border.b); }
    for (let r = r1; r <= r2; r++) { if (b.border.l) bdr[r][c1].left = bline(b, b.border.l); if (b.border.r) bdr[r][c2].right = bline(b, b.border.r); }
  };
  for (const pl of placed.filter((x) => x.b.bg)) {
    for (let r = pl.r1; r <= pl.r2; r++) for (let c = pl.c1; c <= pl.c2; c++) if (pl.b.fill) bgFill[r][c] = pl.b.fill;
    edgeSet(pl);
  }
  for (const pl of placed.filter((x) => !x.b.bg)) {
    let free = true;
    for (let r = pl.r1; r <= pl.r2 && free; r++) for (let c = pl.c1; c <= pl.c2; c++) if (own[r][c]) { free = false; break; }
    if (!free) continue;
    for (let r = pl.r1; r <= pl.r2; r++) for (let c = pl.c1; c <= pl.c2; c++) own[r][c] = pl;
    edgeSet(pl);
  }
  const bXml = (o) => ['top', 'left', 'bottom', 'right'].map((k) => (o[k] ? `<w:${k} w:val="single" w:sz="${o[k].sz}" w:space="0" w:color="${o[k].color}"/>` : `<w:${k} w:val="nil"/>`)).join('');
  const runXml = (t, o) => `<w:r><w:rPr><w:rFonts w:ascii="${XL_FONT}" w:hAnsi="${XL_FONT}" w:eastAsia="${XL_FONT}"/>${o.b ? '<w:b/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:color w:val="${hex(o.color)}"/><w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const paraXml = (b) => {
    const size = b.valign === 'top' ? b.size * 0.93 : b.lines > 1 ? b.size * 0.84 : b.size;
    const sz = Math.max(8, Math.round(size * 2));
    const jc = b.spread ? 'distribute' : b.align === 'left' ? 'left' : b.align === 'right' ? 'right' : 'center';
    const pd = Math.round(b.pad * TW);
    const ind = b.spread ? `<w:ind w:left="${pd}" w:right="${pd}"/>` : b.align === 'center' ? '' : `<w:ind w:${b.align === 'right' ? 'right' : 'left'}="${pd}"/>`;
    const pPr = `<w:pPr><w:spacing w:before="0" w:after="0" w:line="${b.valign === 'top' ? 250 : b.lines > 1 ? 215 : 240}" w:lineRule="auto"/><w:jc w:val="${jc}"/>${ind}</w:pPr>`;
    let runs = '';
    const base = { color: b.color, sz };
    if (b.rich.some((x) => x.b) && !b.bold) {
      // 굵은 부분이 섞인 글: 줄바꿈은 원문의 줄바꿈만 지킨다
      b.rich.forEach((x) => { String(x.t).split('\n').forEach((part, i) => { if (i) runs += '<w:r><w:br/></w:r>'; if (part) runs += runXml(part, { ...base, b: x.b, u: x.b && b.id === 'notes' }); }); });
    } else if (b.rich.length) {
      const lines = b.lineTexts && b.lineTexts.length ? b.lineTexts : [b.rich.map((x) => x.t).join('')];
      lines.forEach((ln, i) => { if (i) runs += '<w:r><w:br/></w:r>'; runs += runXml(ln, { ...base, b: b.bold, u: b.underline }); });
    }
    return `<w:p>${pPr}${runs}</w:p>`;
  };
  const emptyP = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
  const colW = xs.slice(1).map((x, i) => Math.max(1, Math.round((x - xs[i]) * TW)));
  let rowsXml = '';
  for (let r = 0; r < nRow; r++) {
    const h = Math.max(1, Math.round((ys[r + 1] - ys[r]) * TW));
    let cells = '';
    for (let c = 0; c < nCol;) {
      const pl = own[r][c];
      if (pl && pl.c1 === c) {
        const span = pl.c2 - pl.c1 + 1;
        const w = colW.slice(c, c + span).reduce((a, v) => a + v, 0);
        // 합친 칸의 테두리는 바깥 줄만
        const o = {};
        if (r === pl.r1) o.top = bdr[r][c].top;
        if (r === pl.r2) o.bottom = bdr[r][c].bottom;
        o.left = bdr[r][c].left; o.right = bdr[r][pl.c2].right;
        const fill = pl.b.fill || bgFill[r][c];
        const vm = pl.r2 > pl.r1 ? (r === pl.r1 ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
        const va = pl.b.valign === 'top' ? 'top' : 'center';
        cells += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${vm}<w:tcBorders>${bXml(o)}</w:tcBorders>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(fill)}"/>` : ''}<w:noWrap w:val="0"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar><w:vAlign w:val="${va}"/></w:tcPr>${r === pl.r1 ? paraXml(pl.b) : emptyP}</w:tc>`;
        c += span;
      } else {
        const o = bdr[r][c];
        const fill = bgFill[r][c];
        cells += `<w:tc><w:tcPr><w:tcW w:w="${colW[c]}" w:type="dxa"/><w:tcBorders>${bXml(o)}</w:tcBorders>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(fill)}"/>` : ''}</w:tcPr>${emptyP}</w:tc>`;
        c += 1;
      }
    }
    rowsXml += `<w:tr><w:trPr><w:trHeight w:val="${h}" w:hRule="exact"/><w:cantSplit/></w:trPr>${cells}</w:tr>`;
  }
  // 직인 · 도장: 페이지 기준 절대 위치(실제 크기)
  let drawings = '';
  ims.forEach((im) => {
    const i = imgN++;
    const rid = `rIdImg${i}`;
    rels.push({ rid, file: `media/${im.key}.png`, key: im.key });
    const cx = Math.round(im.w * EMU), cy = Math.round(im.h * EMU);
    drawings += `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251659264 + i}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(im.x * EMU)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(im.y * EMU)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${i + 1}" name="stamp${i + 1}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="stamp${i + 1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  });
  left = Math.round(xs[0] * TW);
  right = Math.max(0, Math.round((PAGE.w - xs[nCol]) * TW) - 20);
  // 표 아래 빈 단락이 다음 쪽으로 넘어가지 않게 아래 여백을 넉넉히 줄인다(테두리 두께만큼 표가 조금 길어진다)
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>${drawings}</w:p><w:tbl><w:tblPr><w:tblW w:w="${colW.reduce((a, v) => a + v, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid>${colW.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rowsXml}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;
  });
  const top = Math.max(0, Math.round(top0 * TW) - 20);
  // 표 아래 빈 단락이 다음 쪽으로 넘어가지 않게 아래 여백을 넉넉히 줄인다(테두리 두께만큼 표가 조금 길어진다)
  const bottom = Math.max(0, Math.round((PAGE.h - bot0) * TW) - 420);
  const body = bodies.join('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>');
  const docXml =`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new window.JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(meta.title || '')}</dc:title><dc:creator>${xmlEsc(meta.author || '')}</dc:creator></cp:coreProperties>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${XL_FONT}" w:hAnsi="${XL_FONT}" w:eastAsia="${XL_FONT}" w:cs="${XL_FONT}"/><w:sz w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.map((r) => `<Relationship Id="${r.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.file}"/>`).join('')}</Relationships>`);
  rels.forEach((r) => zip.file(`word/${r.file}`, imgOf(imgs, r.key)));
  zip.file('word/document.xml', docXml);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
