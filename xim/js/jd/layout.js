// A4 배치 엔진 — 문서 하나를 mm 단위 칸(box) 목록으로 바꾼다.
// 미리보기(SVG) · PDF · 엑셀이 모두 이 결과 하나를 그린다 → 셋이 어긋날 수 없다.
import { TYPES, compute, summaryRows, won, hangul, krDate, vatWord, fillTokens, num } from './calc.js';

export const PT = 25.4 / 72;            // 1pt = mm
export const PAGE = { w: 210, h: 297, mx: 15, top: 12, bottom: 12 };
// 여러 장(공문): k 번째 장은 y = k × PSTEP 에서 시작(장 사이 PGAP 는 미리보기 틈)
export const PGAP = 8;
export const PSTEP = PAGE.h + PGAP;
export const pageOf = (y) => Math.max(0, Math.floor((y + 0.01) / PSTEP));
// 배치 결과를 장마다 나눈다(각 장은 y 가 0 부터)
export function pageModels(model) {
  const n = model.pages || 1;
  if (n <= 1) return [model];
  return Array.from({ length: n }, (_, k) => {
    const dy = k * PSTEP;
    const mv = (o) => ({ ...o, y: o.y - dy, runs: (o.runs || []).map((r) => ({ ...r, y: r.y - dy })) });
    return { ...model, pages: 1, page: k, overflow: false,
      boxes: model.boxes.filter((b) => pageOf(b.y) === k).map(mv),
      images: model.images.filter((im) => pageOf(im.y) === k).map((im) => ({ ...im, y: im.y - dy })),
      helpers: k ? [] : model.helpers };
  });
}
export const STAMP_MM = 16;              // 직인 지름 1.6cm
export const SEAL_MM = 20;               // 공문용 사각 도장 20mm
const THIN = 0.2, THICK = 0.5;
const C = { label: '#eef0f2', head: '#dfe3e6', accent: '#2f3da6', ink: '#111111', white: '#ffffff' };
const LH = 1.3;                          // 줄 간격(배)
export const FONT = 'PretendardDoc';

// ── 글자 폭 재기 (Pretendard 실제 글꼴로) ─────────────────────────
const cache = new Map();
let ctx = null;
export function measureChar(ch, size, bold) {
  const k = `${size}|${bold ? 1 : 0}|${ch}`;
  let w = cache.get(k);
  if (w !== undefined) return w;
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    ctx.font = `${bold ? 700 : 400} 100px ${FONT}`;
    w = ctx.measureText(ch).width / 100 * size * PT;   // em 비율 × 크기
  } else {
    w = (/[ㄱ-힣一-鿿]/.test(ch) ? 0.92 : /[A-Z0-9]/.test(ch) ? 0.62 : 0.5) * size * PT;
  }
  cache.set(k, w);
  return w;
}
export const clearMeasure = () => cache.clear();
const textW = (s, size, bold) => [...s].reduce((a, ch) => a + measureChar(ch, size, bold), 0);

// **굵게** 표시 → [{t, b}]
export function rich(str) {
  const out = [];
  String(str ?? '').split('**').forEach((t, i) => { if (t) out.push({ t, b: i % 2 === 1 }); });
  return out;
}
export const plain = (str) => String(str ?? '').replace(/\*\*/g, '');

// 줄바꿈: 공백 우선, 긴 낱말은 글자 단위
function wrap(segs, maxW, size, boldAll) {
  const chars = [];
  segs.forEach((s) => [...s.t].forEach((c) => chars.push({ c, b: s.b || boldAll })));
  const lines = [];
  let cur = [], w = 0, lastSpace = -1;
  const push = () => { while (cur.length && cur[cur.length - 1].c === ' ') cur.pop(); lines.push(cur); cur = []; w = 0; lastSpace = -1; };
  for (const ch of chars) {
    if (ch.c === '\n') { push(); continue; }
    if (!cur.length && ch.c === ' ') continue;
    const cw = measureChar(ch.c, size, ch.b);
    if (w + cw > maxW && cur.length) {
      if (lastSpace > 0) {
        const rest = cur.slice(lastSpace + 1);
        cur = cur.slice(0, lastSpace);
        push();
        cur = rest; w = rest.reduce((a, r) => a + measureChar(r.c, size, r.b), 0);
      } else push();
    }
    if (ch.c === ' ') lastSpace = cur.length;
    cur.push(ch); w += cw;
  }
  if (cur.length || !lines.length) push();
  return lines.map((lc) => {
    const out = [];
    let x = 0;
    for (const ch of lc) {
      const last = out[out.length - 1];
      const cw = measureChar(ch.c, size, ch.b);
      if (last && last.b === ch.b) { last.t += ch.c; last.w += cw; } else out.push({ t: ch.c, b: ch.b, dx: x, w: cw });
      x += cw;
    }
    return { segs: out, w: x };
  });
}

// ── 칸 하나 만들기: 글자 위치까지 계산해 둔다 ─────────────────────
function box(o) {
  const b = {
    x: o.x, y: o.y, w: o.w, h: o.h,
    size: o.size || 9.5, bold: !!o.bold, align: o.align || 'center', valign: o.valign || 'middle',
    fill: o.fill || null, color: o.color || C.ink, pad: o.pad ?? 1.6,
    border: o.border || { t: THIN, r: THIN, b: THIN, l: THIN },
    lc: o.lc || null, bg: !!o.bg, ed: o.ed || null,
    id: o.id || null, cell: o.cell || null, underline: !!o.underline,
    spread: !!o.spread, minSize: o.minSize || 7, text: o.text ?? '',
  };
  b.runs = [];
  const segs = Array.isArray(o.text) ? o.text : rich(o.text);
  b.rich = segs;
  if (!segs.length) return b;
  const maxW = b.w - b.pad * 2;
  let size = b.size, lines;
  for (;;) {
    lines = b.spread ? [{ segs, w: maxW }] : wrap(segs, maxW, size, b.bold);
    const need = lines.length * size * PT * LH;
    const widest = Math.max(...lines.map((l) => l.w));
    if ((need <= b.h - 0.6 && widest <= maxW + 0.01 && (!o.oneLine || lines.length === 1)) || size <= b.minSize || o.noShrink) break;   // oneLine: 한 줄에 들어갈 때까지 글자를 줄인다
    size = Math.max(b.minSize, +(size - 0.25).toFixed(2));
  }
  b.size = size;
  b.lines = lines.length;
  b.lineTexts = b.spread ? null : lines.map((l) => l.segs.map((x) => x.t).join(''));
  const lh = size * PT * LH;
  const top = b.valign === 'top' ? b.y + b.pad : b.y + (b.h - lines.length * lh) / 2;
  lines.forEach((ln, i) => {
    const base = top + i * lh + lh / 2 + size * PT * 0.34;
    if ((o.track || o.justify) && lines.length === 1) {
      // 한 줄 글: 글자 사이를 벌리거나(자간) 낱말 사이를 늘려 양쪽 끝을 맞춘다
      const chars = [];
      ln.segs.forEach((g) => [...g.t].forEach((ch) => chars.push({ ch, b: g.b || b.bold })));
      const cw = chars.map((c) => measureChar(c.ch, size, c.b));
      const nat = cw.reduce((a, v) => a + v, 0);
      const tr = o.track || 0;
      const spaces = chars.filter((c) => c.ch === ' ').length;
      const total = nat + tr * Math.max(0, chars.length - 1);
      const gap = o.justify && spaces ? Math.max(0, (maxW - total) / spaces) : 0;
      let x = o.justify || b.align === 'left' ? b.x + b.pad : b.align === 'right' ? b.x + b.w - b.pad - total : b.x + (b.w - total) / 2;
      chars.forEach((c, k) => {
        if (c.ch !== ' ') b.runs.push({ x, y: base, t: c.ch, b: c.b, size, w: cw[k] + (k < chars.length - 1 && chars[k + 1].ch !== ' ' ? tr : 0), u: b.underline || (o.boldUnderline && c.b) });
        x += cw[k] + tr + (c.ch === ' ' ? gap : 0);
      });
      return;
    }
    if (b.spread) {
      // 글자 고르게 벌리기 (수    신)
      const chs = [...segs.map((s) => s.t).join('')].filter((c) => c !== ' ');
      const cw = chs.map((ch) => measureChar(ch, size, b.bold));
      const total = cw.reduce((a, v) => a + v, 0);
      const inner = Math.min(maxW, Math.max(total, maxW));
      const gap = chs.length > 1 ? (inner - total) / (chs.length - 1) : 0;
      let x = b.x + b.pad + (chs.length > 1 ? 0 : (maxW - total) / 2);
      chs.forEach((ch, k) => { b.runs.push({ x, y: base, t: ch, b: b.bold, size }); x += cw[k] + gap; });
      return;
    }
    const x0 = b.align === 'left' ? b.x + b.pad : b.align === 'right' ? b.x + b.w - b.pad - ln.w : b.x + (b.w - ln.w) / 2;
    ln.segs.forEach((s) => b.runs.push({ x: x0 + s.dx, y: base, t: s.t, b: s.b || b.bold, size, w: s.w, u: b.underline || (o.boldUnderline && s.b) }));
  });
  return b;
}

// 사각형 묶음의 바깥 테두리를 굵게
function frame(list) {
  const x1 = Math.min(...list.map((b) => b.x)), y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w)), y2 = Math.max(...list.map((b) => b.y + b.h));
  const e = (a, v) => Math.abs(a - v) < 0.05;
  list.forEach((b) => {
    if (e(b.x, x1)) b.border.l = THICK;
    if (e(b.y, y1)) b.border.t = THICK;
    if (e(b.x + b.w, x2)) b.border.r = THICK;
    if (e(b.y + b.h, y2)) b.border.b = THICK;
  });
  return list;
}

const none = { t: 0, r: 0, b: 0, l: 0 };
const fmtQty = (v) => (v === '' || v === null || v === undefined ? '' : String(+num(v)));

// ── 문서 → 배치 ───────────────────────────────────────────────────
export function layout(doc, settings) {
  const T = TYPES[doc.type] || TYPES.quote;
  const co = (settings && settings.company) || {};
  const c = compute(doc);
  const X0 = PAGE.mx, W = PAGE.w - PAGE.mx * 2;
  const B = [];
  const add = (o) => { const b = box(o); B.push(b); return b; };
  let y = PAGE.top;
  const images = [];
  if (doc.type === 'statement') return statement();
  if (doc.type === 'invoice') return invoice();
  if (doc.type === 'letter') return letter();

  // 문서번호
  frame([
    add({ x: X0 + W - 88, y, w: 32, h: 8, text: '문서번호', fill: C.label, size: 10 }),
    add({ x: X0 + W - 56, y, w: 56, h: 8, text: doc.no || '저장하면 자동 부여', size: 10.5, color: doc.no ? C.ink : '#8a8f94', id: 'no' }),
  ]);
  y += 8 + 4;

  // 제목
  add({ x: X0, y, w: W, h: 13, text: doc.title || T.name, size: 20, bold: true, border: { t: 0, r: 0, b: 0, l: 0 }, minSize: 13, ed: { k: 'title' } });
  y += 13 + 4;

  // 수신 · 공급자
  const RH = 8.4;
  const ex = doc.extra || [];
  const left = [
    ['수신', doc.client?.name || ''],
    ['참조', doc.client?.ref || ''],
    [T.dateLabel, krDate(doc.date)],
    [ex[0]?.label || '', ex[0]?.value || ''],
    [ex[1]?.label || '', ex[1]?.value || ''],
  ];
  const lb = [];
  left.forEach(([k, v], i) => {
    const ek = ['client.name', 'client.ref', 'date', 'extra.0.value', 'extra.1.value'][i];
    lb.push(add({ x: X0, y: y + i * RH, w: 20, h: RH, text: k, fill: C.label, spread: k.length <= 4, pad: 2.2, ed: i >= 3 ? { k: `extra.${i - 3}.label` } : null }));
    lb.push(add({ x: X0 + 20, y: y + i * RH, w: 66, h: RH, text: v, align: 'left', id: i === 2 ? 'date' : null, ed: { k: ek, date: i === 2 } }));
  });
  frame(lb);

  const RX = X0 + 90;
  const cw = [7, 17, 27, 14, 25];
  const cx = cw.reduce((a, w, i) => (a.push(a[i] + w), a), [RX]);
  const rb = [];
  // 공급자 칸도 다섯 줄 — 왼쪽 다섯 줄과 줄마다 맞는다. 업태 · 종목은 한 줄씩 가로 전체를 쓴다(긴 글도 줄이 떨어지지 않게)
  const SH = RH;
  rb.push(add({ x: RX, y, w: 7, h: RH * 5, text: '공\n급\n자', fill: C.label, pad: 0.5 }));
  const lab = (r, col, t) => rb.push(add({ x: cx[col], y: y + r * SH, w: cw[col], h: SH, text: t, fill: C.label, spread: t.length <= 4 && !t.includes('\n'), pad: 2, size: t.includes('\n') ? 8.5 : 9.5 }));
  const val = (r, col, span, t, o = {}) => {
    const w = cw.slice(col, col + span).reduce((a, v) => a + v, 0);
    const b = add({ x: cx[col], y: y + r * SH, w, h: SH, text: t, ...o });
    rb.push(b);
    return b;
  };
  lab(0, 1, '사업자\n등록번호'); val(0, 2, 3, co.bizNo || '');
  lab(1, 1, '상호'); val(1, 2, 1, co.name || ''); lab(1, 3, '대표자');
  const ceoText = `${co.ceo || ''}  (인)`;
  const ceoBox = val(1, 4, 1, ceoText);
  lab(2, 1, '업태'); val(2, 2, 3, co.bizType || '', { size: 9, oneLine: true, minSize: 6 });
  lab(3, 1, '종목'); val(3, 2, 3, co.bizItem || '', { size: 9, oneLine: true, minSize: 6 });
  lab(4, 1, '연락처');
  if (co.fax) { val(4, 2, 1, co.tel || ''); lab(4, 3, '팩스'); val(4, 4, 1, co.fax); } else val(4, 2, 3, co.tel || '');
  frame(rb);

  // 직인: "(인)" 글자 한가운데에 지름 18mm
  if (doc.stamp !== false) {
    const runs = ceoBox.runs;
    const lastX = runs.length ? runs[runs.length - 1].x + runs[runs.length - 1].w : ceoBox.x + ceoBox.w / 2;
    const inW = textW('(인)', ceoBox.size, false);
    const sx = lastX - inW / 2, sy = ceoBox.y + ceoBox.h / 2;
    images.push({ key: 'stamp', x: sx - STAMP_MM / 2, y: sy - STAMP_MM / 2, w: STAMP_MM, h: STAMP_MM });
  }
  y += RH * 5 + 5;

  // 금액 상자
  const vw = vatWord(doc);
  frame([
    add({ x: X0, y, w: 24, h: 12, text: T.amountLabel, fill: C.accent, color: C.white, bold: true, size: 11 }),
    add({ x: X0 + 24, y, w: 110, h: 12, text: `일금  ${hangul(c.final)}  원정 (${vw})`, size: 12.5, bold: true, align: 'left', pad: 4,
      id: 'kor', cell: { f: '{final}', v: c.final, fmt: `[DBNum4]"일금  "[$-412]General"  원정 (${vw})"` } }),
    add({ x: X0 + 134, y, w: 46, h: 12, text: `(₩${won(c.final)})`, size: 12.5, bold: true, align: 'right', pad: 4, underline: true,
      id: 'krw', cell: { f: '{final}', v: c.final, fmt: '("₩"#,##0)' } }),
  ]);
  y += 12 + 4;

  if (doc.style === 'goods') return goods();

  // 표
  const COLS = [24, 70, 14, 24, 28, 20];
  const X = COLS.reduce((a, w, i) => (a.push(a[i] + w), a), [X0]);
  const HEAD = 8, SUMH = 8;
  const sums = summaryRows(doc, c);

  // 참고사항 높이
  const notesText = fillTokens(doc.notes || '', doc, settings);
  const NS = 9.3, NPAD = 2.4;
  const noteLines = notesText.trim() ? wrap(rich(notesText), 156 - NPAD * 2, NS, false).length : 0;
  const notesNeed = notesText.trim() ? Math.max(22, (noteLines + 0.6) * NS * PT * LH + NPAD * 2 + 1) : 0;

  const rows = [];
  (doc.groups || []).forEach((g, gi) => {
    if (!(g.lines || []).length) rows.push({ g, gi, l: null, li: -1 });
    (g.lines || []).forEach((l, li) => rows.push({ g, gi, l, li }));
  });
  const bottom = PAGE.h - PAGE.bottom;
  const avail = bottom - (y + HEAD) - sums.length * SUMH - notesNeed;
  let rowH = 7.2;
  if (rows.length * rowH > avail) rowH = Math.max(4.8, avail / Math.max(1, rows.length));
  const overflow = rows.length * 4.8 > avail + 0.01;
  const fill = doc.fillRows !== false && !overflow ? Math.max(0, Math.floor((avail - rows.length * rowH) / rowH + 1e-6)) : 0;
  const leftover = Math.max(0, avail - (rows.length + fill) * rowH);

  const tb = [];
  const head = [T.name === '견적서' ? '항목' : '구분', '내용', doc.qtyLabel || T.qtyLabel, doc.unitLabel || T.unitLabel, '금액(원)', '비고'];
  head.forEach((t, i) => tb.push(add({ x: X[i], y, w: COLS[i], h: HEAD, text: t, fill: C.head, size: t.length > 5 ? 8.8 : 9.5 })));
  y += HEAD;

  const helpers = [];
  const rateRef = (gi) => {
    if (doc.rate?.byCat) return `{rate${gi}}`;
    return '{rate}';
  };
  if (!doc.rate?.byCat) {
    const r = doc.rate || {};
    helpers.push({ id: 'rate', label: '일단가(일괄)', v: c.rate, f: r.mode === 'direct' ? null : `ROUND(${num(r.base)}*${num(r.factor)},0)` });
  } else {
    (doc.groups || []).forEach((g, gi) => helpers.push({ id: `rate${gi}`, label: `일단가 · ${g.name}`, v: c.groups[gi].rate, f: null }));
  }

  let ri = 0;
  const firstA = 'a0';
  const dayQ = [];   // 일당 줄 기간 칸(합계금액 줄의 총 기간 합)
  let gStart = null;
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    const isFirst = i === 0 || rows[i - 1].gi !== r.gi;
    if (isFirst) {
      const span = rows.filter((x) => x.gi === r.gi).length;
      gStart = add({ x: X[0], y: ry, w: COLS[0], h: rowH * span, text: r.g.name || '', size: 9.5, ed: { k: `groups.${r.gi}.name`, row: { gi: r.gi } } });
      tb.push(gStart);
    }
    const l = r.l;
    const lc = l ? c.groups[r.gi].lines[r.li] : null;
    const isDay = l && (l.kind === 'day' || !l.kind);
    const L = l ? `groups.${r.gi}.lines.${r.li}` : null, row = l ? { gi: r.gi, li: r.li } : { gi: r.gi };
    if (isDay) dayQ.push(`{q${ri}}`);
    tb.push(add({ x: X[1], y: ry, w: COLS[1], h: rowH, text: l ? l.text : '', align: 'left', size: 9.5, minSize: 7.5, ed: l ? { k: `${L}.text`, row } : null }));
    tb.push(add({ x: X[2], y: ry, w: COLS[2], h: rowH, text: l && l.kind !== 'fixed' ? fmtQty(l.qty) : '', id: `q${ri}`, ed: l && l.kind !== 'fixed' ? { k: `${L}.qty`, num: true, dec: true, row } : null,
      cell: l && l.kind !== 'fixed' ? { v: num(l.qty), fmt: 'General' } : null }));
    tb.push(add({ x: X[3], y: ry, w: COLS[3], h: rowH, text: lc && lc.unit !== null ? won(lc.unit) : '', align: 'right', id: `u${ri}`, ed: !l ? null : isDay ? { k: 'rate', row } : l.kind === 'unit' ? { k: `${L}.unit`, num: true, row } : null,
      cell: lc && lc.unit !== null ? (isDay ? { f: rateRef(r.gi), v: lc.unit, fmt: '#,##0' } : { v: lc.unit, fmt: '#,##0' }) : null }));
    tb.push(add({ x: X[4], y: ry, w: COLS[4], h: rowH, text: lc ? won(lc.amount) : '', align: 'right', id: `a${ri}`, ed: l && l.kind === 'fixed' ? { k: `${L}.amount`, num: true, row } : null,
      cell: lc ? (l.kind === 'fixed' ? { v: lc.amount, fmt: '#,##0' } : { f: `{q${ri}}*{u${ri}}`, v: lc.amount, fmt: '#,##0' }) : null }));
    tb.push(add({ x: X[5], y: ry, w: COLS[5], h: rowH, text: l ? l.note || '' : '', size: 8.5, ed: l ? { k: `${L}.note`, row } : null }));
    ri++;
  });
  y += rows.length * rowH;
  for (let k = 0; k < fill; k++) {
    COLS.forEach((w, i) => tb.push(add({ x: X[i], y, w, h: rowH, text: '', id: i === 4 ? `a${ri}` : null, ed: { add: true } })));
    ri++;
    y += rowH;
  }
  const lastA = `a${Math.max(0, ri - 1)}`;

  // 합계 줄
  sums.forEach((s) => {
    const fin = s.final;
    tb.push(add({ x: X[0], y, w: COLS[0], h: SUMH, text: s.label, fill: fin ? C.accent : C.label, color: fin ? C.white : C.ink, bold: true, spread: s.label.length <= 4, pad: 2.6 }));
    const bg = { fill: fin ? C.accent : C.label, color: fin ? C.white : C.ink };
    if (s.key === 'sub' && c.dayUnits > 0) {
      // 합계금액 줄: 기간(일) 칸에 일당 줄 기간 합계
      tb.push(add({ x: X[1], y, w: COLS[1], h: SUMH, text: s.note || '', ...bg, size: 9 }));
      tb.push(add({ x: X[2], y, w: COLS[2], h: SUMH, text: `${fmtQty(c.dayUnits)}일`, ...bg, bold: true, size: 9.5, minSize: 7.5,
        cell: { f: dayQ.join('+'), v: c.dayUnits, fmt: 'General"일"' } }));
      tb.push(add({ x: X[3], y, w: COLS[3], h: SUMH, text: '', ...bg }));
    } else {
      tb.push(add({ x: X[1], y, w: COLS[1] + COLS[2] + COLS[3], h: SUMH, text: s.note || '', ...bg, bold: fin, size: fin ? 10 : 9 }));
    }
    const f = s.key === 'sub' ? `SUM({${firstA}}:{${lastA}})`
      : s.key === 'vat' ? 'ROUNDDOWN({sub}*0.1,0)'
      : s.key === 'gross' ? '{sub}+{vat}'
      : `ROUNDDOWN(${doc.vat === 'incl' ? (doc.showVat ? '{gross}' : '{sub}+ROUNDDOWN({sub}*0.1,0)') : '{sub}'},${-Math.round(Math.log10(c.unit))})`;
    tb.push(add({ x: X[4], y, w: COLS[4], h: SUMH, text: won(s.amount), align: 'right', bold: fin, size: fin ? 11.5 : 9.5, id: s.key,
      cell: { f, v: s.amount, fmt: '#,##0' } }));
    tb.push(add({ x: X[5], y, w: COLS[5], h: SUMH, text: '' }));
    y += SUMH;
  });

  // 참고사항
  if (notesNeed) {
    const nh = notesNeed + leftover;
    tb.push(add({ x: X[0], y, w: COLS[0], h: nh, text: '참고사항', fill: C.label, spread: true, pad: 3 }));
    tb.push(add({ x: X[1], y, w: W - COLS[0], h: nh, text: notesText, align: 'left', valign: 'top', size: NS, pad: NPAD, noShrink: true, boldUnderline: true, id: 'notes', ed: { k: 'notes', multi: true } }));
    y += nh;
  }
  frame(tb);

  return { boxes: B, images, helpers, overflow, rowH, rows: rows.length, fill, bottom: y, calc: c, page: PAGE };

  // ── 물품형(컴퓨터 · 장비 견적): NO · 품명 · 규격 · 단위 · 수량 · 단가 · 금액 · 비고 ──
  //   아래는 공급가액 · 부가세 · 합계, 청구서면 입금계좌 · 입금기한 · 근거 + 청구 문구
  function goods() {
    const GC = [8, 26, 60, 11, 11, 22, 24, 18];
    const GX = GC.reduce((a, w, i) => (a.push(a[i] + w), a), [X0]);
    const span = (i, n) => GC.slice(i, i + n).reduce((a, v) => a + v, 0);
    const HEAD = 8, SH = 7.5, PH = 7.5, EMPTY = 6.5, SPEC = 9;
    const isInv = doc.type === 'invoice';
    const incl = doc.vat === 'incl';
    const n = -Math.round(Math.log10(c.unit));

    // 아래 합계 줄
    const sums = [{ key: 'sub', label: '공 급 가 액', v: c.subtotal, f: null }];
    if (incl || doc.showVat) sums.push({ key: 'vat', label: '부 가 세 (10%)', v: c.vat, f: 'ROUNDDOWN({sub}*0.1,0)' });
    if (!incl && doc.showVat) sums.push({ key: 'gross', label: '합 계 (VAT포함)', v: c.gross, f: '{sub}+{vat}' });
    const baseF = incl ? '{sub}+{vat}' : '{sub}';
    if (c.cut) sums.push({ key: 'cut', label: `절 사 (${c.unit.toLocaleString('ko-KR')}원 미만)`, v: -c.cut, f: `{final}-(${baseF})` });
    sums.push({ key: 'final', label: incl ? '합 계' : doc.showVat ? `${T.amountLabel} (VAT별도)` : '합 계 (VAT별도)', v: c.final, f: `ROUNDDOWN(${baseF},${n})`, final: true });

    const pay = doc.pay || {};
    const payRows = isInv ? [['입금계좌', fillTokens(pay.bank || '{계좌}', doc, settings), true], ['입금기한', pay.due || '', true], ['근    거', pay.basis || '', false]] : [];
    const notesText = fillTokens(doc.notes || '', doc, settings);
    const NS = 9, NPAD = 2.2;
    const nW = W - span(0, 2) - NPAD * 2;
    const noteLines = notesText.trim() ? wrap(rich(notesText), nW, NS, false).length : 0;
    const notesH = noteLines ? Math.max(12, noteLines * NS * PT * LH + NPAD * 2 + 0.8) : 0;
    const closeH = isInv ? 26 : 0;
    const below = 4 + sums.length * SH + (payRows.length ? 4 + payRows.length * PH : 0) + (notesH ? 4 + notesH : 0) + closeH;

    // 품목 줄 높이: 규격 줄 수만큼
    const items = [];
    (doc.groups || []).forEach((g, gi) => (g.lines || []).forEach((l, li) => items.push({ g, gi, l, li })));
    const lineH = SPEC * PT * LH;
    const hOf = (it) => {
      const a = wrap(rich(it.l.text || ''), GC[2] - 3.2, SPEC, false).length;
      const b = wrap(rich(it.g.name || ''), GC[1] - 3.2, 9.5, false).length;
      return Math.max(7, (Math.max(a, b) + (a > 2 ? 0.8 : 0)) * lineH + 3);
    };
    let hs = items.map(hOf);
    const bottomY = PAGE.h - PAGE.bottom;
    const avail = bottomY - (y + HEAD) - below;
    let need = hs.reduce((a, v) => a + v, 0) + EMPTY;
    if (need > avail) { const k = Math.max(0.6, (avail - EMPTY) / (need - EMPTY)); hs = hs.map((h) => h * k); need = hs.reduce((a, v) => a + v, 0) + EMPTY; }
    const overflow = need > avail + 0.01;
    const fill = doc.fillRows !== false && !overflow ? Math.max(0, Math.floor((avail - need) / EMPTY + 1e-6)) : 0;

    const tb = [];
    ['NO', '품    명', '규        격', '단위', '수량', '단    가', '금    액', '비 고'].forEach((t, i) =>
      tb.push(add({ x: GX[i], y, w: GC[i], h: HEAD, text: t, fill: C.head, bold: true, size: 9.5 })));
    y += HEAD;
    let ri = 0;
    items.forEach((it, i) => {
      const h = hs[i];
      const l = it.l;
      const lc = c.groups[it.gi].lines[it.li];
      const fixed = l.kind === 'fixed';
      const L = `groups.${it.gi}.lines.${it.li}`, row = { gi: it.gi, li: it.li };
      tb.push(add({ x: GX[0], y, w: GC[0], h, text: String(i + 1), size: 9 }));
      tb.push(add({ x: GX[1], y, w: GC[1], h, text: it.g.name || '', align: 'left', size: 9.5, minSize: 7, ed: { k: `groups.${it.gi}.name`, row } }));
      tb.push(add({ x: GX[2], y, w: GC[2], h, text: l.text || '', align: 'left', size: SPEC, minSize: 6.5, boldUnderline: false, ed: { k: `${L}.text`, multi: true, row } }));
      tb.push(add({ x: GX[3], y, w: GC[3], h, text: l.uom ?? 'EA', size: 9, ed: { k: `${L}.uom`, row } }));
      tb.push(add({ x: GX[4], y, w: GC[4], h, text: fixed ? '' : fmtQty(l.qty), size: 9, id: `q${ri}`, ed: fixed ? null : { k: `${L}.qty`, num: true, dec: true, row }, cell: fixed ? null : { v: num(l.qty), fmt: 'General' } }));
      tb.push(add({ x: GX[5], y, w: GC[5], h, text: lc.unit !== null ? won(lc.unit) : '', align: 'right', size: 9, id: `u${ri}`, ed: fixed ? null : { k: `${L}.unit`, num: true, row }, cell: lc.unit !== null ? { v: lc.unit, fmt: '#,##0' } : null }));
      tb.push(add({ x: GX[6], y, w: GC[6], h, text: won(lc.amount), align: 'right', size: 9, id: `a${ri}`, ed: fixed ? { k: `${L}.amount`, num: true, row } : null,
        cell: fixed ? { v: lc.amount, fmt: '#,##0' } : { f: `{q${ri}}*{u${ri}}`, v: lc.amount, fmt: '#,##0' } }));
      tb.push(add({ x: GX[7], y, w: GC[7], h, text: l.note || '', size: 8.5, ed: { k: `${L}.note`, row } }));
      ri++;
      y += h;
    });
    tb.push(add({ x: X0, y, w: W, h: EMPTY, text: '이 하 여 백', size: 9 }));
    y += EMPTY;
    for (let k = 0; k < fill; k++) {
      GC.forEach((w, i) => tb.push(add({ x: GX[i], y, w, h: EMPTY, text: '', id: i === 6 ? `a${ri}` : null, ed: { add: true } })));
      ri++;
      y += EMPTY;
    }
    frame(tb);
    const lastA = `a${Math.max(0, ri - 1)}`;
    sums[0].f = `SUM({a0}:{${lastA}})`;

    // 공급가액 · 부가세 · 합계
    y += 4;
    const sb = [];
    sums.forEach((s) => {
      const fl = s.final ? C.head : C.label;
      sb.push(add({ x: X0, y, w: span(0, 6), h: SH, text: s.label, fill: fl, bold: !!s.final, size: s.final ? 10.5 : 9.5 }));
      sb.push(add({ x: GX[6], y, w: GC[6], h: SH, text: won(s.v), align: 'right', bold: !!s.final, size: s.final ? 10.5 : 9.5, fill: s.final ? C.head : null, id: s.key, cell: { f: s.f, v: s.v, fmt: '#,##0' } }));
      sb.push(add({ x: GX[7], y, w: GC[7], h: SH, text: '', fill: s.final ? C.head : null }));
      y += SH;
    });
    frame(sb);

    // 입금계좌 · 입금기한 · 근거
    if (payRows.length) {
      y += 4;
      const pb = [];
      payRows.forEach(([k, v, hi]) => {
        pb.push(add({ x: X0, y, w: span(0, 2), h: PH, text: k, fill: C.label, size: 9.5 }));
        pb.push(add({ x: GX[2], y, w: W - span(0, 2), h: PH, text: v, align: 'left', size: 9.5, fill: hi ? '#fff59d' : null, minSize: 7.5 }));
        y += PH;
      });
      frame(pb);
    }

    // 참고사항
    if (notesH) {
      y += 4;
      frame([
        add({ x: X0, y, w: span(0, 2), h: notesH, text: '참고사항', fill: C.label, size: 9.5 }),
        add({ x: GX[2], y, w: W - span(0, 2), h: notesH, text: notesText, align: 'left', valign: 'top', size: NS, pad: NPAD, noShrink: true, boldUnderline: true, id: 'notes', ed: { k: 'notes', multi: true } }),
      ]);
      y += notesH;
    }

    // 청구 문구 + 대표 (인)
    if (isInv) {
      add({ x: X0, y: y + 5, w: W, h: 8, text: pay.closing || '위 금액을 청구하오니 기한 내 지급하여 주시기 바랍니다.', size: 10.5, border: none });
      const sign = add({ x: X0, y: y + 15, w: W, h: 9, text: `${co.name || ''}  대표  ${[...(co.ceo || '')].join(' ')}  (인)`, size: 11, bold: true, border: none });
      if (doc.stamp !== false && sign.runs.length) {
        const r = sign.runs[sign.runs.length - 1];
        const inW = textW('(인)', sign.size, true);
        const sx = r.x + r.w - inW / 2, sy = sign.y + sign.h / 2;
        images.push({ key: 'stamp', x: sx - STAMP_MM / 2, y: sy - STAMP_MM / 2, w: STAMP_MM, h: STAMP_MM });
      }
      y += closeH;
    }

    return { boxes: B, images, helpers: [], overflow, rowH: EMPTY, rows: items.length, fill, bottom: y, calc: c, page: PAGE };
  }

  // 공통: 직인을 "(인)" 글자 한가운데에
  function stampOn(bx) {
    if (doc.stamp === false || !bx.runs.length) return;
    const r = bx.runs[bx.runs.length - 1];
    const inW = textW('(인)', r.size, r.b);
    const sx = bx.text === '(인)' ? bx.x + bx.w / 2 : r.x + (r.w ?? inW) - inW / 2, sy = bx.y + bx.h / 2;
    images.push({ key: 'stamp', x: sx - STAMP_MM / 2, y: sy - STAMP_MM / 2, w: STAMP_MM, h: STAMP_MM });
  }
  // 표에 쓸 줄 목록(홈페이지형 · 물품형 공통)
  function flatLines() {
    const out = [];
    (doc.groups || []).forEach((g, gi) => (g.lines || []).forEach((l, li) => {
      const lc = c.groups[gi].lines[li];
      const goodsRow = doc.style === 'goods';
      out.push({
        gi, li, kind: l.kind || 'day',
        date: l.date || '',
        name: plain(goodsRow ? g.name : l.text) || '',
        spec: goodsRow ? (l.uom ?? 'EA') : l.kind === 'fixed' ? '식' : l.kind === 'unit' ? (l.uom || '개') : '일',
        qty: l.kind === 'fixed' ? 1 : num(l.qty),
        unit: lc.unit ?? lc.amount, amount: lc.amount, note: l.note || '',
      });
    }));
    // 세액: 줄마다 10% 내림, 합이 전체 부가세와 같도록 마지막 줄에서 맞춘다
    let tsum = 0;
    out.forEach((r) => { r.tax = Math.floor(r.amount / 10); tsum += r.tax; });
    if (out.length && tsum !== c.vat) out[out.length - 1].tax += c.vat - tsum;
    return out;
  }

  // ── 거래명세서: 가는 선 · 옅은 색면, 줄마다 공급가액과 세액 ──
  function statement() {
    const INK2 = '#4a4f63', LINE = '#cdd2e4', ACC = '#2f3da6', TINT = '#eff0f8', HEADF = '#dfe2f0';
    y = 10;
    add({ bg: true, x: X0, y, w: 62, h: 1.4, text: '', fill: ACC, border: none });
    add({ bg: true, x: X0 + 62, y, w: W - 62, h: 1.4, text: '', fill: '#dfe2f0', border: none });
    y += 7;
    add({ x: X0, y, w: 110, h: 15, text: [...(doc.title || T.name)].join(' '), size: 25, bold: true, align: 'left', pad: 0, border: none, minSize: 16, ed: { k: 'title' } });
    add({ x: X0 + W - 62, y: y + 1.5, w: 62, h: 6, text: `일련번호 :  ${doc.no || '저장하면 자동 부여'}`, size: 9.5, color: INK2, align: 'left', border: none, id: 'no' });
    add({ x: X0 + W - 62, y: y + 7.5, w: 62, h: 6, text: `발행일자 :  ${krDate(doc.date)}`, size: 9.5, color: INK2, align: 'left', border: none, id: 'date' });
    y += 22;

    // 받는 쪽 · 공급자
    const top = y, RH = 6.4, LBL = 15;
    add({ x: X0, y: top + 2, w: 84, h: 10, text: `${doc.client?.name || ''}  귀하`, size: 13.5, bold: true, align: 'left', pad: 0, border: none, underline: true, ed: { k: 'client.name' } });
    const lrow = (i, k, v, ek, lk) => {
      add({ x: X0, y: top + 15 + i * RH, w: LBL, h: RH, text: k, size: 9.5, bold: true, spread: true, pad: 0, border: none, ed: lk ? { k: lk } : null });
      add({ x: X0 + LBL + 2, y: top + 15 + i * RH, w: 84 - LBL - 2, h: RH, text: v, size: 9.5, color: INK2, align: 'left', pad: 1, border: none, ed: ek ? { k: ek } : null });
    };
    const ex = doc.extra || [];
    lrow(0, '담당자', doc.client?.ref || '', 'client.ref');
    ex.slice(0, 2).forEach((e, i) => lrow(i + 1, e.label || '', e.value || '', `extra.${i}.value`, `extra.${i}.label`));
    add({ x: X0, y: top + 11 + 4 * RH, w: 84, h: RH, text: '아래와 같이 계산합니다.', size: 10, align: 'left', pad: 0, border: none });

    const RX = X0 + 92, RW = W - 92;
    const rb = [];
    rb.push(add({ x: RX, y: top, w: RW, h: 11, text: co.name || '', size: 13.5, bold: true, align: 'left', pad: 2, border: { t: THIN, r: 0, b: 0, l: 0 }, lc: LINE }));
    const rrow = (i, k, v, k2, v2) => {
      const yy = top + 11 + i * RH;
      const half = k2 ? (RW - 4) / 2 : RW;
      rb.push(add({ x: RX + 2, y: yy, w: LBL, h: RH, text: k, size: 9.5, bold: true, spread: true, pad: 0, border: none }));
      const vb = add({ x: RX + 2 + LBL + 2, y: yy, w: half - LBL - 2, h: RH, text: v, size: 9.5, color: INK2, align: 'left', pad: 1, border: none });
      rb.push(vb);
      if (k2) {
        rb.push(add({ x: RX + 2 + half + 2, y: yy, w: LBL, h: RH, text: k2, size: 9.5, bold: true, spread: true, pad: 0, border: none }));
        rb.push(add({ x: RX + 2 + half + 2 + LBL + 2, y: yy, w: half - LBL - 4, h: RH, text: v2, size: 9.5, color: INK2, align: 'left', pad: 1, border: none }));
      }
      return vb;
    };
    {
      const yy = top + 11;
      rb.push(add({ x: RX + 2, y: yy, w: LBL, h: RH, text: '대표자', size: 9.5, bold: true, spread: true, pad: 0, border: none }));
      rb.push(add({ x: RX + 2 + LBL + 2, y: yy, w: 25, h: RH, text: [...(co.ceo || '')].join(' '), size: 9.5, color: INK2, align: 'left', pad: 1, border: none }));
      const inb = add({ x: RX + 2 + LBL + 28, y: yy, w: 10, h: RH, text: '(인)', size: 9.5, color: INK2, border: none, pad: 0 });
      stampOn(inb);
    }
    rrow(1, '등록번호', co.bizNo || '');
    rrow(2, '업태', co.bizType || '');
    rrow(3, '종목', co.bizItem || '');
    if (co.fax) rrow(4, '연락처', co.tel || '', '팩스', co.fax); else rrow(4, '연락처', co.tel || '');
    add({ bg: true, x: RX, y: top + 11 + 5 * RH + 1, w: RW, h: 0.01, text: '', border: { t: THIN, r: 0, b: 0, l: 0 }, lc: LINE });
    y = top + 11 + 5 * RH + 6;

    // 합계금액 띠
    const vw = vatWord(doc);
    add({ bg: true, x: X0, y, w: W, h: 15, text: '', fill: TINT, border: { t: THIN, r: 0, b: THIN, l: 0 }, lc: LINE });
    add({ x: X0, y, w: 40, h: 15, text: `${T.amountLabel}\n(${vw})`, size: 10, bold: true, color: ACC, border: none });
    add({ x: X0 + 40, y, w: 92, h: 15, text: `일금  ${hangul(c.final)}  원정`, size: 13, bold: true, border: none,
      id: 'kor', cell: { f: '{final}', v: c.final, fmt: '[DBNum4]"일금  "[$-412]General"  원정"' } });
    add({ x: X0 + 132, y, w: 48, h: 15, text: `(₩ ${won(c.final)})`, size: 13, bold: true, border: none, align: 'right', pad: 4,
      id: 'krw', cell: { f: '{final}', v: c.final, fmt: '("₩ "#,##0)' } });
    y += 15 + 6;

    // 표
    const GC = [10, 60, 18, 12, 22, 23, 20, 15];
    const GX = GC.reduce((a, w, i) => (a.push(a[i] + w), a), [X0]);
    const HEAD = 8.5;
    const rows = flatLines();
    const notesText = fillTokens(doc.notes || '', doc, settings);
    const NS = 9.3;
    const noteLines = notesText.trim() ? wrap(rich(notesText), W - 8, NS, false).length : 0;
    const notesH = noteLines ? noteLines * NS * PT * LH + 8 : 0;
    const sumRows = [['공급가액', c.subtotal, 'sub', 'SUM({a0}:{aEnd})'], ['세    액', c.vat, 'vat', 'ROUNDDOWN({sub}*0.1,0)']];
    const n = -Math.round(Math.log10(c.unit));
    sumRows.push([`합계 (${vw})`, c.final, 'final', `ROUNDDOWN(${doc.vat === 'incl' ? '{sub}+{vat}' : '{sub}'},${n})`]);
    if (c.cut) sumRows.splice(2, 0, ['절    사', -c.cut, 'cut', `{final}-(${doc.vat === 'incl' ? '{sub}+{vat}' : '{sub}'})`]);
    const SH = 8;
    const below = 5 + sumRows.length * SH + (notesH ? 6 + notesH : 0);
    const avail = PAGE.h - PAGE.bottom - (y + HEAD) - below;
    let rowH = 7.4;
    if (rows.length * rowH > avail) rowH = Math.max(5, avail / Math.max(1, rows.length));
    const overflow = rows.length * 5 > avail + 0.01;
    const fill = doc.fillRows !== false && !overflow ? Math.max(0, Math.floor((avail - rows.length * rowH) / rowH + 1e-6)) : 0;

    ['NO', '품명', '규격/단위', '수량', '단가', '공급가액', '세액', '비고'].forEach((t, i) =>
      add({ x: GX[i], y, w: GC[i], h: HEAD, text: t, fill: HEADF, bold: true, size: 9.5, color: '#232842', border: none }));
    y += HEAD;
    const rowLine = { t: 0, r: 0, b: 0.12, l: 0 };
    let ri = 0;
    rows.forEach((r) => {
      const cells = [
        [String(ri + 1), 'center'], [r.name, 'left'], [r.spec, 'center'], [fmtQty(r.qty), 'center', `q${ri}`, { v: r.qty, fmt: 'General' }],
        [won(r.unit), 'right', `u${ri}`, { v: r.unit, fmt: '#,##0' }], [won(r.amount), 'right', `a${ri}`, { f: `{q${ri}}*{u${ri}}`, v: r.amount, fmt: '#,##0' }],
        [won(r.tax), 'right', `t${ri}`, { v: r.tax, fmt: '#,##0' }], [r.note, 'center'],
      ];
      const L = `groups.${r.gi}.lines.${r.li}`, row = { gi: r.gi, li: r.li };
      const eds = [null, { k: doc.style === 'goods' ? `groups.${r.gi}.name` : `${L}.text`, row }, doc.style === 'goods' ? { k: `${L}.uom`, row } : null,
        r.kind === 'fixed' ? null : { k: `${L}.qty`, num: true, dec: true, row }, r.kind === 'unit' ? { k: `${L}.unit`, num: true, row } : r.kind === 'fixed' ? null : { k: 'rate', row },
        r.kind === 'fixed' ? { k: `${L}.amount`, num: true, row } : null, null, { k: `${L}.note`, row }];
      cells.forEach(([t, al, id, cell], i) => add({ ed: eds[i], x: GX[i], y, w: GC[i], h: rowH, text: t, align: al, size: i === 1 ? 9.5 : 9.2, minSize: 7, border: rowLine, lc: LINE, id, cell }));
      ri++; y += rowH;
    });
    for (let k = 0; k < fill; k++) {
      GC.forEach((w, i) => add({ x: GX[i], y, w, h: rowH, text: '', border: rowLine, lc: LINE, id: i === 5 ? `a${ri}` : null, ed: { add: true } }));
      ri++; y += rowH;
    }
    add({ bg: true, x: X0, y: y - 0.01, w: W, h: 0.01, text: '', border: { t: 0.6, r: 0, b: 0, l: 0 }, lc: '#b3b9dc' });
    sumRows[0][3] = `SUM({a0}:{a${Math.max(0, ri - 1)}})`;

    // 합계(오른쪽)
    y += 5;
    const SX = X0 + W - 76;
    sumRows.forEach(([k, v, id, f], i) => {
      const last = i === sumRows.length - 1;
      const bd = { t: 0, r: 0, b: last ? 0 : 0.12, l: 0 };
      add({ x: SX, y, w: 30, h: SH, text: k, size: last ? 10 : 9.5, bold: true, border: bd, lc: LINE, fill: last ? TINT : null, color: last ? ACC : '#111111' });
      add({ x: SX + 30, y, w: 46, h: SH, text: `₩ ${won(v)}`, size: last ? 11 : 10, bold: true, align: 'right', pad: 2, border: bd, lc: LINE, fill: last ? TINT : null, color: last ? ACC : '#111111',
        id, cell: { f, v, fmt: '"₩ "#,##0' } });
      y += SH;
    });

    // 참고사항
    if (notesH) {
      y += 6;
      add({ x: X0, y, w: W, h: notesH, text: notesText, align: 'left', valign: 'top', size: NS, pad: 4, color: '#333333', noShrink: true, boldUnderline: true, border: { t: 0.12, r: 0, b: 0, l: 0 }, lc: LINE, id: 'notes', ed: { k: 'notes', multi: true } });
      y += notesH;
    }
    return { boxes: B, images, helpers: [], overflow, rowH, rows: rows.length, fill, bottom: y, calc: c, page: PAGE };
  }

  // ── 청구서: 대금청구서(편지형) — 건명 · 청구금액 · 지급기한 · 수신인, 계좌, 청구인 ──
  function invoice() {
    const ACC = '#2f3da6', INK2 = '#3d4150', LINE = '#cdd2e4', TINT = '#f1f3fb';
    const vw = vatWord(doc);
    y = 14;
    add({ x: X0 + W - 70, y, w: 70, h: 6, text: `No. ${doc.no || '저장하면 자동 부여'}`, size: 9, color: '#7a7f92', align: 'right', pad: 0, border: none, id: 'no' });
    y += 7;
    const title = [...(doc.title || '대금청구서').replace(/\s+/g, '')].join('  ');
    add({ x: X0, y, w: W, h: 16, text: title, size: 24, bold: true, border: none, minSize: 16, ed: { k: 'title' } });
    add({ bg: true, x: X0 + W / 2 - 48, y: y + 17, w: 96, h: 1.2, text: '', border: { t: 0.45, r: 0, b: 0.2, l: 0 } });
    y += 28;

    // ■ 항목
    const BX = X0 + 6, KW = 22, RH = 9.6;
    const item = (k, v, o = {}) => {
      add({ x: BX, y, w: 5, h: RH, text: '■', size: 8, color: ACC, border: none, pad: 0 });
      add({ x: BX + 5, y, w: KW, h: RH, text: k, size: 11.5, bold: true, spread: true, pad: 1, border: none });
      add({ x: BX + 5 + KW, y, w: 6, h: RH, text: ':', size: 11.5, bold: true, border: none, pad: 0 });
      const vb = add({ x: BX + 5 + KW + 6, y, w: W - 6 - 5 - KW - 6, h: RH, text: v, size: 11.5, align: 'left', pad: 1, border: none, ...o });
      y += RH;
      return vb;
    };
    const ex = doc.extra || [];
    const subj = ex.find((e) => /건명|청구내용|내용/.test(e.label || '')) || ex[0] || {};
    const due = ex.find((e) => e !== subj && /기한/.test(e.label || '')) || ex.find((e) => e !== subj) || {};
    const xi = (e) => Math.max(0, ex.indexOf(e));
    item('건명', subj.value || '', { ed: { k: `extra.${xi(subj)}.value` } });
    const amtY = y;
    add({ bg: true, x: BX + 5 + KW + 6, y: amtY + 1.2, w: W - 6 - 5 - KW - 6, h: RH - 2.4, text: '', fill: TINT, border: none });
    item('청구금액', `일금  ${hangul(c.final)}  원정 (${vw})`, { bold: true, color: ACC, id: 'kor', cell: { f: '{final}', v: c.final, fmt: `[DBNum4]"일금  "[$-412]General"  원정 (${vw})"` }, w: 100 });
    add({ x: BX + 5 + KW + 6 + 100, y: amtY, w: W - 6 - 5 - KW - 6 - 100, h: RH, text: `(₩ ${won(c.final)})`, size: 11.5, bold: true, color: ACC, align: 'right', pad: 3, border: none,
      id: 'krw', cell: { f: '{final}', v: c.final, fmt: '("₩ "#,##0)' } });
    item(due.label || '지급기한', due.value || '', { ed: { k: `extra.${xi(due)}.value` } });
    item('수신인', `${doc.client?.name || ''}${doc.client?.ref ? `  (${doc.client.ref})` : ''}`, { ed: { k: 'client.name' } });
    y += 5;

    // 청구 내역(공급가액 · 부가세 · 청구금액)
    const n = -Math.round(Math.log10(c.unit));
    const base = doc.vat === 'incl' ? '{sub}+{vat}' : '{sub}';
    const lines = [['공급가액', c.subtotal, 'sub', null], ['부가세 (10%)', c.vat, 'vat', 'ROUNDDOWN({sub}*0.1,0)']];
    if (doc.vat !== 'incl') lines.pop();
    if (c.cut) lines.push(['절사', -c.cut, 'cut', `{final}-(${base})`]);
    lines.push([`청구금액 (${vw})`, c.final, 'final', `ROUNDDOWN(${base},${n})`]);
    let groupsSum = (doc.groups || []).map((g, gi) => [plain(g.name) || '항목', c.groups[gi].total]);
    if (groupsSum.length > 8) groupsSum = [];
    const TW = 150, TX = X0 + (W - TW) / 2, LH2 = 6.8;
    add({ x: TX, y, w: TW, h: 7, text: '- 청 구 내 역 -', size: 10.5, bold: true, border: none });
    y += 8;
    const tb = [];
    groupsSum.forEach(([k, v], i) => {
      tb.push(add({ x: TX, y, w: 60, h: LH2, text: k, size: 9.5, fill: '#f6f7fb', lc: LINE, ed: { k: `groups.${i}.name`, row: { gi: i } } }));
      tb.push(add({ x: TX + 60, y, w: TW - 60, h: LH2, text: won(v), size: 9.5, align: 'right', pad: 4, lc: LINE, id: `g${i}`, cell: { v, fmt: '#,##0' } }));
      y += LH2;
    });
    lines[0][3] = groupsSum.length ? `SUM({g0}:{g${groupsSum.length - 1}})` : null;
    lines.forEach(([k, v, id, f], i) => {
      const last = i === lines.length - 1;
      tb.push(add({ x: TX, y, w: 60, h: LH2, text: k, size: last ? 10 : 9.5, bold: true, fill: last ? TINT : '#eff0f6', color: last ? ACC : '#111111', lc: LINE }));
      tb.push(add({ x: TX + 60, y, w: TW - 60, h: LH2, text: won(v), size: last ? 10.5 : 9.5, bold: true, align: 'right', pad: 4, fill: last ? TINT : null, color: last ? ACC : '#111111', lc: LINE, id, cell: { f, v, fmt: '#,##0' } }));
      y += LH2;
    });
    y += 5;

    add({ x: X0, y, w: W, h: 8, text: '위와 같이 청구하오니 아래 계좌로 입금하여 주시기 바랍니다.', size: 11, border: none });
    y += 11;

    // 계좌
    const pay = doc.pay || {};
    const raw = fillTokens(pay.account || '{계좌}', doc, settings);
    const acct = (raw.match(/\d[\d-]{6,}\d/) || [''])[0];
    const bank = pay.bank || (acct ? raw.split(acct)[0] : raw).replace(/^\s*은행명?\s*[:：]\s*/, '').trim();
    const holder = pay.holder || (raw.split(/예금주\s*[:：]?/)[1] || '').trim();
    add({ x: TX, y, w: TW, h: 7, text: '- 계 좌 입 금 내 용 -', size: 10.5, bold: true, border: none });
    y += 8;
    [['은 행 명', bank], ['계좌번호', acct], ['예 금 주', holder]].forEach(([k, v]) => {
      tb.push(add({ x: TX, y, w: 36, h: LH2, text: k, size: 9.5, fill: '#eff0f6', lc: LINE, spread: true, pad: 6 }));
      tb.push(add({ x: TX + 36, y, w: TW - 36, h: LH2, text: v, size: 10.5, bold: true, lc: LINE }));
      y += LH2;
    });

    // 참고사항
    const notesText = fillTokens(doc.notes || '', doc, settings);
    if (notesText.trim()) {
      y += 5;
      const nl = wrap(rich(notesText), TW - 6, 9, false).length;
      const nh = nl * 9 * PT * LH + 5;
      add({ x: TX, y, w: TW, h: nh, text: notesText, align: 'left', valign: 'top', size: 9, pad: 3, color: INK2, noShrink: true, boldUnderline: true, border: none, id: 'notes', ed: { k: 'notes', multi: true } });
      y += nh;
    }

    // 날짜 · 청구인 · 귀하 (아래에서부터 붙인다)
    const endY = PAGE.h - PAGE.bottom;
    const PRH = 6.8;
    const sY = Math.max(y + 6, endY - 12 - 3 * PRH - 22);
    add({ x: X0, y: sY, w: W, h: 8, text: krDate(doc.date), size: 11.5, border: none, id: 'date', ed: { k: 'date', date: true } });
    const PX0 = X0 + 40, PKW = 22;
    let py = sY + 12;
    add({ x: PX0 - 24, y: py, w: 22, h: PRH, text: '위 청구인', size: 11, bold: true, border: none, align: 'left', pad: 0 });
    const prow = (k, v, o = {}) => {
      add({ x: PX0, y: py, w: PKW, h: PRH, text: k, size: 10.5, bold: true, spread: true, pad: 0.5, border: none });
      add({ x: PX0 + PKW, y: py, w: 5, h: PRH, text: ':', size: 10.5, bold: true, border: none, pad: 0 });
      const vb = add({ x: PX0 + PKW + 5, y: py, w: 100, h: PRH, text: v, size: 10.5, align: 'left', pad: 1, border: none, ...o });
      py += PRH;
      return vb;
    };
    prow('상호', co.name || '');
    prow('전화번호', co.tel || '');
    {
      const nb = prow('성명', [...(co.ceo || '')].join(' '), { bold: true, w: 34 });
      const inb = add({ x: nb.x + 34, y: nb.y, w: 12, h: PRH, text: '(인)', size: 10.5, border: none, pad: 0 });
      stampOn(inb);
    }
    add({ x: X0, y: Math.max(py + 2, endY - 10), w: 110, h: 10, text: `${doc.client?.name || ''}  귀하`, size: 14, bold: true, align: 'left', pad: 0, border: none });
    const overflow = py + 12 > endY + 0.5;
    return { boxes: B, images, helpers: [], overflow, rowH: 8, rows: groupsSum.length, fill: 0, bottom: endY, calc: c, page: PAGE };
  }

  // ── 공문: 회사 머리 · 굵은 선 · 문서번호/수신/참조/제목 · 본문 · 대표 + 사각 도장 ──
  //   본문은 참고사항 칸을 쓴다. "1. " 로 시작하는 줄은 굵게, "1) " 은 들여쓰기, 나머지 줄은 한 칸 들여쓴다.
  function letter() {
    const INK2 = '#222222';
    const nameKo = [...(co.name || '')].join(' ');
    // 머리: 회사 이름(자간 넓게) · 연락처 줄(자간) · 굵은 선
    add({ x: X0, y: 11, w: W, h: 14, text: [{ t: `${nameKo}  `, b: true }, { t: co.nameEn || '', b: false }], size: 23, track: 2.1, border: none, pad: 0 });
    const contact = [['Tel', co.tel], ['Fax', co.fax], ['E-mail', co.email]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('   ');
    add({ x: X0, y: 31.5, w: W, h: 7, text: contact, size: 10.6, color: INK2, track: 0.55, border: none, pad: 0 });
    add({ bg: true, x: X0, y: 40.8, w: W, h: 0.01, text: '', border: { t: 0.8, r: 0, b: 0, l: 0 } });
    // 문서번호 · 수신 · 참조 · 제목
    const RH = 8.5;
    y = 44.3;
    const head = [['문서번호', `${co.nameEn ? co.nameEn + ' ' : ''}${doc.no || '저장하면 자동 부여'}`, false, null],
      ['수신', doc.client?.name || '', true, 'client.name'], ['참조', doc.client?.ref || '', true, 'client.ref'], ['제목', doc.title || '', true, 'title']];
    head.forEach(([k, v, bold, ek]) => {
      add({ x: X0 + 1.5, y, w: 16.5, h: RH, text: k, size: 11.5, spread: true, pad: 0, border: none });
      add({ x: X0 + 22.4, y, w: W - 23, h: RH, text: v, size: 11.5, bold, align: 'left', pad: 0, border: none, minSize: 8, id: ek ? null : 'no', ed: ek ? { k: ek } : null });
      y += RH;
    });
    add({ bg: true, x: X0, y: 81.8, w: W, h: 0.01, text: '', border: { t: 0.8, r: 0, b: 0, l: 0 } });

    // 본문: "1." 줄은 굵게, 이어지는 줄은 번호 뒤 글자 아래에 맞추고 양쪽 정렬
    const endY = PAGE.h - PAGE.bottom;
    const footY = 268.5;
    const BS = 12, STEP = 8.6;
    y = 91.1;
    const bodyTop = y;
    const RIGHT = X0 + W;
    const topInd = textW('1. ', BS, true);
    const subInd = textW('1) ', BS, false);
    const text = fillTokens(doc.notes || '', doc, settings);
    // 여러 장: 본문이 장 끝(아래 20mm)에 닿으면 다음 장 위(20mm)에서 이어 쓴다
    const multi = doc.multiPage !== false;
    const TOP2 = 20, BODY_END = PAGE.h - 20;
    let pg = 0, pgTop = bodyTop;
    const base = () => pg * PSTEP;
    const editBox = () => add({ bg: true, x: X0, y: pgTop - 2, w: W, h: Math.max(20, y - pgTop + 4), text: '', border: none, ed: { k: 'notes', multi: true } });
    const newPage = () => { editBox(); pg++; y = base() + TOP2; pgTop = y; };
    const atTop = () => pg > 0 && Math.abs(y - (base() + TOP2)) < 0.01;
    let first = true, afterSub = false;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { if (!atTop()) y += STEP; afterSub = false; continue; }
      const t = line.trim();
      const mTop = /^(\d+\.\s+)/.exec(t), mSub = /^(\d+\)\s+)/.exec(t);
      let x1, x2;
      if (mTop) { x1 = X0; x2 = X0 + textW(mTop[1], BS, true); afterSub = false; }
      else if (mSub) { x1 = X0 + topInd; x2 = x1 + textW(mSub[1], BS, false); afterSub = true; }
      else if (afterSub) { x1 = x2 = X0 + topInd + subInd; }
      else { x1 = x2 = X0 + topInd; }
      if (mTop && !first && !atTop()) y += 2;
      first = false;
      const bold = !!mTop;
      const segs = rich(t);
      // 첫 줄은 x1 에서, 나머지는 x2 에서 다시 감싼다
      const wl = wrap(segs, RIGHT - x1, BS, bold);
      const lines = [{ segs: wl[0].segs, x: x1 }];
      if (wl.length > 1) {
        let n = wl[0].segs.map((g) => g.t).join('').length;
        const rest = [];
        for (const g of segs) {
          if (n >= g.t.length) { n -= g.t.length; continue; }
          rest.push({ t: g.t.slice(n), b: g.b }); n = 0;
        }
        if (rest.length) rest[0].t = rest[0].t.replace(/^\s+/, '');
        wrap(rest, RIGHT - x2, BS, bold).forEach((l2) => lines.push({ segs: l2.segs, x: x2 }));
      }
      lines.forEach((ln, i) => {
        if (multi && y + STEP > base() + BODY_END) newPage();
        add({ x: ln.x, y, w: RIGHT - ln.x, h: STEP, text: ln.segs.map((g) => ({ t: g.t, b: g.b })), size: BS, bold, align: 'left', pad: 0, border: none, noShrink: true, boldUnderline: !bold, justify: i < lines.length - 1 });
        y += STEP;
      });
    }
    // 본문 전체를 누르면 고칠 수 있게(엑셀에는 영향 없음)
    editBox();
    const overflow = !multi && y > footY - 4;

    // 대표 줄 + 사각 도장(20mm, 이름 마지막 글자 위) — 마지막 장 아래, 자리가 없으면 다음 장
    let fy = Math.max(y + 8, base() + footY);
    if (multi && fy + 10 > base() + PAGE.h - PAGE.bottom) { pg++; fy = base() + TOP2 + 8; }
    // 쪽 번호(두 장 이상일 때)
    if (pg > 0) for (let k = 0; k <= pg; k++) add({ x: X0, y: k * PSTEP + PAGE.h - 13, w: W, h: 6, text: `- ${k + 1} -`, size: 9, color: '#666666', border: none, pad: 0 });
    add({ x: X0 + 21, y: fy, w: 54, h: 10, text: [{ t: `${nameKo}  `, b: true }, { t: co.nameEn || '', b: false }], size: 14, track: 0.5, border: none, pad: 0 });
    add({ x: X0 + 87, y: fy, w: 15, h: 10, text: '대표', size: 14, bold: true, spread: true, border: none, pad: 0 });
    const chs = [...(co.ceo || '')];
    let last = null;
    chs.forEach((ch, i) => { last = add({ x: X0 + 114.8 + i * 15.6, y: fy, w: 10, h: 10, text: ch, size: 14, bold: true, border: none, pad: 0 }); });
    if (last && doc.stamp !== false) images.push({ key: 'seal', x: last.x + last.w / 2 - SEAL_MM / 2, y: last.y + last.h / 2 - SEAL_MM / 2, w: SEAL_MM, h: SEAL_MM });
    return { boxes: B, images, helpers: [], overflow, rowH: STEP, rows: 0, fill: 0, bottom: fy + 10, calc: c, page: PAGE, pages: pg + 1 };
  }
}
