// 계산 엔진 — 화면 · 미리보기 · 엑셀 · PDF 가 모두 이 결과 하나만 쓴다.
// 줄 금액은 항상 공급가액(VAT 제외). 일단가는 원 단위 정수.

export const TYPES = {
  quote:     { name: '견적서',     dateLabel: '견적일', amountLabel: '제안금액', qtyLabel: '기간(일)', unitLabel: '일단가(원)' },
  statement: { name: '거래명세서', dateLabel: '거래일', amountLabel: '합계금액', qtyLabel: '수량',     unitLabel: '단가(원)' },
  invoice:   { name: '청구서',     dateLabel: '청구일', amountLabel: '청구금액', qtyLabel: '수량',     unitLabel: '단가(원)' },
  letter:    { name: '공문',       dateLabel: '시행일', amountLabel: '금액',     qtyLabel: '수량',     unitLabel: '단가(원)' },
};

export const ROUNDING = [
  { v: 1, label: '절사 없음', short: '없음' },
  { v: 10, label: '십원 미만 절사', short: '십원' },
  { v: 100, label: '백원 미만 절사', short: '백원' },
  { v: 1000, label: '천원 미만 절사', short: '천원' },
  { v: 10000, label: '만원 미만 절사', short: '만원' },
  { v: 100000, label: '십만원 미만 절사', short: '십만원' },
  { v: 1000000, label: '백만원 미만 절사', short: '백만원' },
];
export const roundLabel = (u) => (ROUNDING.find((r) => r.v === u) || ROUNDING[2]).label;

export const won = (n) => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
export const num = (v) => {
  const n = Number(String(v ?? '').replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 2531200 → 이백오십삼만일천이백 (금액 표기 관례대로 일천 · 일백 · 일십)
export function hangul(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return '영';
  if (!(n < 1e20)) return '';   // 경 단위를 넘거나 셀 수 없는 수는 한글로 쓰지 않는다
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const U = ['', '십', '백', '천'];
  const B = ['', '만', '억', '조', '경'];
  let s = '';
  for (let i = 0; n > 0; i++, n = Math.floor(n / 10000)) {
    let c = n % 10000;
    if (!c) continue;
    let part = '';
    for (let p = 0; c > 0; p++, c = Math.floor(c / 10)) {
      const d = c % 10;
      if (d) part = D[d] + U[p] + part;
    }
    s = part + B[i] + s;
  }
  return s;
}

export const vatWord = (doc) => (doc.vat === 'incl' ? 'VAT포함' : 'VAT별도');

// 날짜 '2026-11-05' → '2026년 11월 5일'
export function krDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[1]}년 ${+m[2]}월 ${+m[3]}일` : '';
}
export function todayIso() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}

// 일괄 일단가
export function baseRate(doc) {
  const r = doc.rate || {};
  if (r.mode === 'direct') return Math.round(num(r.direct));
  return Math.round(num(r.base) * num(r.factor));
}
export function groupRate(doc, g) {
  if (doc.rate && doc.rate.byCat && g.rate !== undefined && g.rate !== null && g.rate !== '') return Math.round(num(g.rate));
  return baseRate(doc);
}

// 한 줄 금액은 ±9천조 안에서만(1e308 같은 값이 합계를 무한대로 만들지 않게)
const capAmount = (n) => (Number.isFinite(n) ? Math.max(-9e15, Math.min(9e15, n)) : 0);
export function lineAmount(doc, g, l) {
  if (l.kind === 'fixed') return capAmount(Math.round(num(l.amount)));
  const qty = num(l.qty);
  const unit = l.kind === 'unit' ? Math.round(num(l.unit)) : groupRate(doc, g);
  return capAmount(Math.round(qty * unit));
}
export function lineUnit(doc, g, l) {
  if (l.kind === 'fixed') return null;
  return l.kind === 'unit' ? Math.round(num(l.unit)) : groupRate(doc, g);
}

export function compute(doc) {
  const unit = ROUNDING.some((r) => r.v === +doc.rounding) ? +doc.rounding : 100;
  let subtotal = 0, dayUnits = 0, fixedSum = 0;
  const groups = (doc.groups || []).map((g) => {
    let gsum = 0, gdays = 0;
    const lines = (g.lines || []).map((l) => {
      const amount = lineAmount(doc, g, l);
      gsum += amount;
      if (l.kind === 'day' || !l.kind) gdays += num(l.qty);
      else fixedSum += amount;
      return { amount, unit: lineUnit(doc, g, l) };
    });
    subtotal += gsum;
    dayUnits += gdays;
    return { total: gsum, days: gdays, rate: groupRate(doc, g), lines };
  });
  const vat = Math.floor(subtotal / 10);
  const gross = subtotal + vat;
  const base = doc.vat === 'incl' ? gross : subtotal;
  const final = Math.floor(base / unit) * unit;
  return { unit, groups, subtotal, vat, gross, base, final, cut: base - final, dayUnits, fixedSum, rate: baseRate(doc) };
}

// 합계 아래 줄 구성 (미리보기 · 엑셀 · PDF 공통)
export function summaryRows(doc, c) {
  const T = TYPES[doc.type] || TYPES.quote;
  const rows = [];
  if (doc.showVat) {
    rows.push({ key: 'sub', label: '공급가액', amount: c.subtotal });
    rows.push({ key: 'vat', label: '부가세', note: '공급가액의 10%', amount: c.vat });
    rows.push({ key: 'gross', label: '합계금액', note: '공급가액 + 부가세', amount: c.gross });
  } else {
    rows.push({ key: 'sub', label: '합계금액', amount: c.subtotal });
  }
  let note;
  const rl = c.unit === 1 ? '' : roundLabel(c.unit);
  if (doc.vat === 'incl') {
    const baseName = doc.showVat ? '합계금액' : '합계금액 + 부가세(10%)';
    note = rl ? `${baseName} (${rl})` : `${baseName} (${vatWord(doc)})`;
  } else {
    note = rl ? `합계금액 (${rl})` : '합계금액 (VAT별도)';
  }
  rows.push({ key: 'final', label: T.amountLabel, note, amount: c.final, final: true });
  return rows;
}

// 목표 금액에 정확히 맞추기: 정액 줄은 두고 일당 단가만 조정
//   반환 { ok, rate | rates, final, diff, msg }
export function solveTarget(doc, target, vatMode) {
  target = Math.round(num(target));
  const d = structuredClone(doc);
  d.vat = vatMode || d.vat;
  const c0 = compute(d);
  if (c0.dayUnits <= 0) return { ok: false, msg: '일당으로 계산하는 줄(기간 × 일단가)이 없어 맞출 수 없습니다.' };
  if (target <= 0) return { ok: false, msg: '목표 금액을 넣어 주세요.' };
  const u = c0.unit;
  const netLo = d.vat === 'incl' ? target / 1.1 : target;
  const netHi = d.vat === 'incl' ? (target + u) / 1.1 : target + u;

  const byCat = d.rate && d.rate.byCat;
  if (!byCat) {
    const other = c0.subtotal - c0.dayUnits * c0.rate; // 정액 + 단가 직접 줄
    const lo = Math.floor((netLo - other) / c0.dayUnits) - 3;
    const hi = Math.ceil((netHi - other) / c0.dayUnits) + 3;
    if (hi < 1) return { ok: false, msg: '정액 항목만으로 이미 목표 금액을 넘습니다.' };
    let best = null;
    for (let R = Math.max(1, lo); R <= hi; R++) {
      d.rate = { ...d.rate, mode: 'direct', direct: R };
      const f = compute(d).final;
      if (f === target) { best = { R, f }; break; }
      if (!best || Math.abs(f - target) < Math.abs(best.f - target)) best = { R, f };
    }
    const res = { rate: best.R, final: best.f, diff: best.f - target };
    // 노임단가 × 적용률 방식이면 적용률로 환산
    if (doc.rate && doc.rate.mode !== 'direct' && num(doc.rate.base) > 0) {
      const base = num(doc.rate.base);
      for (const dp of [6, 7, 8, 9, 10]) {
        const fct = +(best.R / base).toFixed(dp);
        if (Math.round(base * fct) === best.R) { res.factor = fct; break; }
      }
    }
    res.ok = res.diff === 0;
    res.msg = res.ok ? '' : `정확히 맞출 수 없어 ${won(Math.abs(res.diff))}원 ${res.diff > 0 ? '많게' : '적게'} 맞췄습니다. 절사 단위를 올리면 정확히 맞습니다.`;
    return res;
  }

  // 분류별 단가: 비율대로 함께 올리고 내린 뒤, 기간이 가장 긴 분류 단가로 끝자리를 맞춘다
  const gs = d.groups.map((g, i) => ({ i, days: c0.groups[i].days, rate: c0.groups[i].rate })).filter((x) => x.days > 0);
  const dayPart = gs.reduce((s, x) => s + x.days * x.rate, 0);
  const other = c0.subtotal - dayPart;
  const k = dayPart > 0 ? (netLo - other) / dayPart : 1;
  if (k <= 0) return { ok: false, msg: '정액 항목만으로 이미 목표 금액을 넘습니다.' };
  gs.forEach((x) => { d.groups[x.i].rate = Math.max(1, Math.round(x.rate * k)); });
  const main = gs.slice().sort((a, b) => b.days - a.days)[0];
  const cur = Math.round(main.rate * k);
  let best = null;
  const span = Math.ceil(u / main.days) + 6 + Math.ceil(gs.length * 2);
  for (let R = Math.max(1, cur - span); R <= cur + span; R++) {
    d.groups[main.i].rate = R;
    const f = compute(d).final;
    if (f === target) { best = { R, f }; break; }
    if (!best || Math.abs(f - target) < Math.abs(best.f - target)) best = { R, f };
  }
  d.groups[main.i].rate = best.R;
  const rates = d.groups.map((g) => g.rate);
  const diff = best.f - target;
  return { ok: diff === 0, rates, final: best.f, diff, msg: diff === 0 ? '' : `정확히 맞출 수 없어 ${won(Math.abs(diff))}원 차이가 납니다.` };
}
// "vat포함 3000만원 견적" · "부가세별도 2,500,000 청구서" → { amount, vat, type }
export function parseQuick(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const out = { vat: null, type: null, amount: 0, unitGuess: false };
  if (/(vat|부가세|부가가치세)\s*(포함|incl)/i.test(t) || /포함/.test(t)) out.vat = 'incl';
  if (/(vat|부가세|부가가치세)\s*(별도|제외|미포함|excl)/i.test(t) || /별도/.test(t)) out.vat = 'excl';
  if (/거래\s*명세/.test(t)) out.type = 'statement';
  else if (/청구/.test(t)) out.type = 'invoice';
  else if (/견적/.test(t)) out.type = 'quote';
  // 금액: 1억 2,500만 3천원 / 3000만원 / 3,000,000 / 3000
  const m = /(?=\d)(\d[\d,.]*\s*억)?\s*(\d[\d,.]*\s*천\s*만|\d[\d,.]*\s*만)?\s*(\d[\d,.]*\s*천)?\s*(\d[\d,.]*)?\s*원?/g;
  let best = 0, hit;
  while ((hit = m.exec(t))) {
    if (!hit[0].trim()) { m.lastIndex++; continue; }
    const n = (s) => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;
    let v = 0;
    if (hit[1]) v += n(hit[1]) * 1e8;
    if (hit[2]) v += /천/.test(hit[2]) ? n(hit[2]) * 1e7 : n(hit[2]) * 1e4;
    if (hit[3]) v += n(hit[3]) * 1e3;
    if (hit[4]) v += n(hit[4]);
    if (v > best) best = v;
  }
  out.amount = Math.round(best);
  return out;
}

// 입금계좌: 개인용 · 사업자용 중 문서마다 고른 것
export const ACCOUNTS = { personal: '개인용', business: '사업자용' };
export function accountKey(doc, settings) {
  if (typeof doc.account === 'string' && Object.hasOwn(ACCOUNTS, doc.account)) return doc.account;
  // 고른 적이 없으면 VAT 규칙대로: VAT포함은 사업자, VAT별도는 개인
  return doc.vat === 'incl' ? 'business' : 'personal';
}
export function accountText(doc, settings) {
  const c = (settings && settings.company) || {};
  return (c.accounts && c.accounts[accountKey(doc, settings)]) || c.bank || '';
}

// 목록 · 저장에 쓰는 문서 금액
export const docAmount = (doc) => compute(doc).final;

// 문서 안 모든 표기에 들어가는 자리표시 채우기
export function fillTokens(text, doc, settings) {
  const c = (settings && settings.company) || {};
  const y = (doc.date || '').slice(0, 4);
  return String(text || '')
    .replace(/\{연도\}/g, y)
    .replace(/\{계좌\}/g, accountText(doc, settings))
    .replace(/\{상호\}/g, c.name || '')
    .replace(/\{대표자\}/g, c.ceo || '')
    .replace(/\{연락처\}/g, c.tel || '')
    .replace(/\{날짜\}/g, krDate(doc.date))
    .replace(/\{수신\}/g, doc.client?.name || '');
}

// 기간 글 ↔ 일수 (1개월 = 22일 · 1주 = 5일, 일당 줄 기간과 같은 영업일 기준)
const PERIOD_RE = /(\d+(?:\.\d+)?)\s*(?:[~∼-]\s*(\d+(?:\.\d+)?)\s*)?(개월|달|월|주|일)?/;
const perUnit = (u) => (u === '주' ? 5 : u && u !== '일' ? 22 : 1);
export function parsePeriod(t) {
  const m = PERIOD_RE.exec(String(t || '').replace(/,/g, ''));
  if (!m || !(parseFloat(m[1]) > 0)) return 0;
  return parseFloat(m[1]) * perUnit(m[3]);
}
// 범위(3~4개월)면 [최소, 최대] 일수
export function periodRange(t) {
  const m = PERIOD_RE.exec(String(t || '').replace(/,/g, ''));
  if (!m || !(parseFloat(m[1]) > 0)) return null;
  const k = perUnit(m[3]);
  return [parseFloat(m[1]) * k, parseFloat(m[2] || m[1]) * k];
}
// 일수 → 글: 22로 나눠지면 개월, 5로 나눠지면 주, 아니면 일
export function periodWord(days) {
  const d = +num(days);
  if (d >= 22 && d % 22 === 0) return `${d / 22}개월`;
  if (d >= 5 && d % 5 === 0) return `${d / 5}주`;
  return `${d}일`;
}
// 작업기간 칸(유효기간 같은 다른 기간은 빼고)
export const isWorkPeriod = (label) => /(작업|제작|개발|구축|납품|수행|사업)\s*기\s*간|^\s*기\s*간\s*$/.test(String(label || ''));
// 작업기간 글의 기간만 바꿔 쓰기: "계약일로부터 2개월" → "계약일로부터 16주"
export const rewritePeriod = (t, days) => (PERIOD_RE.test(t) ? String(t).replace(PERIOD_RE, periodWord(days)) : `${String(t || '').trim()} ${periodWord(days)}`.trim());
