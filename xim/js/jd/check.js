// 오류 체크 — error(빨강: 내보내기 전에 한 번 더 확인) / warn(노랑: 참고)
import { compute, won, num, todayIso, fillTokens, accountText, accountKey, ACCOUNTS, TYPES, periodRange, periodWord, isWorkPeriod } from './calc.js';
import { yearBase } from './defaults.js';

// 공문 본문 맨 위쪽 "제목: …" 줄(굵게 표시 ** 는 뺀다)
export function bodyTitle(notes) {
  for (const raw of String(notes || '').split('\n').slice(0, 6)) {
    const m = /^\s*(?:\*\*)?\s*제\s*목\s*[:：]\s*(.+?)\s*(?:\*\*)?\s*$/.exec(raw);
    if (m) return m[1].replace(/\*\*/g, '').trim();
  }
  return '';
}

export function check(doc, settings, model, ctx = {}) {
  const out = [];
  const E = (msg, fix, acts) => out.push({ level: 'error', msg, fix, acts });
  const W = (msg, fix) => out.push({ level: 'warn', msg, fix });
  const c = compute(doc);
  const T = TYPES[doc.type] || TYPES.quote;
  const isLetter = doc.type === 'letter';

  // 기본 정보
  if (!String(doc.client?.name || '').trim()) E('수신(받는 곳)이 비어 있습니다.', 'client');
  if (!String(doc.client?.ref || '').trim()) W('참조(담당자)가 비어 있습니다.', 'ref');
  if (!String(doc.category || '').trim()) E('클라이언트 카테고리를 골라 주세요(필수). 고르면 수신이 자동으로 들어갑니다.', 'category');

  // 입금계좌: VAT포함은 사업자 계좌, VAT별도는 개인 계좌
  if (!isLetter) {
    const want = doc.vat === 'incl' ? 'business' : 'personal';
    const has = accountKey(doc, settings);
    if (has !== want) E(`${doc.vat === 'incl' ? 'VAT포함' : 'VAT별도'} 문서인데 입금계좌가 ${ACCOUNTS[has]} 계좌입니다. ${ACCOUNTS[want]} 계좌로 바꾸세요.`, 'account');
  }
  if (isLetter) {
    if (!String(doc.title || '').trim()) E('공문 제목이 비어 있습니다.', 'title');
    if (!String(doc.notes || '').trim()) E('공문 본문이 비어 있습니다.', 'notes');
    // 본문 첫머리 "제목: …" 과 제목 칸이 다르면(다른 공문에서 복사해 와 제목 칸만 남은 경우) — 파일 이름 · 머리 제목이 제목 칸을 따른다
    const bt = bodyTitle(doc.notes);
    const norm = (s) => String(s || '').replace(/\s+/g, '');
    if (bt && norm(bt) !== norm(doc.title)) E(`제목 칸('${String(doc.title || '').trim() || '비어 있음'}')이 본문의 제목('${bt}')과 다릅니다. 파일 이름과 머리의 제목은 제목 칸을 따릅니다.`, 'title', [{ id: 'titleFromBody', label: `제목 칸을 '${bt}'로 바꾸기` }]);
    if (model && model.overflow) E("본문이 길어 A4 한 장을 넘습니다. '본문이 길면 다음 장으로 넘기기'를 켜거나 본문을 줄여 주세요.", 'notes');
    if (model && model.pages > 1) W(`본문이 A4 ${model.pages}장입니다. 장마다 아래에 쪽 번호가 붙습니다.`, 'notes');
    return out;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.date || '') || isNaN(new Date(doc.date))) E(`${T.dateLabel}이 올바르지 않습니다.`, 'date');
  else {
    const diff = (new Date(doc.date) - new Date(todayIso())) / 864e5;
    if (diff > 7) W(`${T.dateLabel}이 오늘보다 ${Math.round(diff)}일 뒤입니다.`, 'date');
    if (diff < -30 && !doc.no) W(`${T.dateLabel}이 오늘보다 ${Math.round(-diff)}일 전입니다. 복제한 문서라면 날짜를 바꿔 주세요.`, 'date');
  }
  if (doc.no && doc.date) {
    const want = `${doc.date.slice(0, 4)}-${doc.date.slice(5, 7)}${doc.date.slice(8, 10)}-`;
    if (!doc.no.startsWith(want)) E(`문서번호(${doc.no})의 날짜가 ${T.dateLabel}(${doc.date})과 다릅니다. '번호 다시 받기'를 누르세요.`, 'renumber');
  }
  if (ctx.dupNo) E(`문서번호 ${doc.no}가 다른 문서와 겹칩니다.`, 'renumber');
  if (!String(doc.title || '').trim()) W('제목이 비어 있어 기본 이름으로 나갑니다.', 'title');
  (doc.extra || []).forEach((e) => { if (e.label && !String(e.value || '').trim()) W(`'${e.label}' 칸이 비어 있습니다.`, 'extra'); });

  // 항목
  const groups = doc.groups || [];
  const goods = doc.style === 'goods';
  const lines = groups.flatMap((g, gi) => (g.lines || []).map((l, li) => ({ g, gi, l, li, amt: c.groups[gi].lines[li].amount })));
  if (!lines.length) E('항목이 하나도 없습니다.', 'items');
  groups.forEach((g, gi) => {
    if (!String(g.name || '').trim()) W(`${gi + 1}번째 ${goods ? '품명' : '분류 이름'}이 비어 있습니다.`, 'items');
    if (!(g.lines || []).length) W(`'${g.name || '이름 없는 분류'}' 분류에 줄이 없습니다.`, 'items');
    if (doc.rate?.byCat && c.groups[gi].days > 0 && !(num(g.rate) > 0)) E(`'${g.name}' 분류 단가가 없습니다.`, 'rate');
  });
  if (!doc.rate?.byCat && c.dayUnits > 0 && !(c.rate > 0)) E('일단가가 0원입니다.', 'rate');
  // 작업기간 글과 표의 기간 합계(일당 줄)가 같아야 한다
  const wp = (doc.extra || []).find((e) => isWorkPeriod(e.label) && String(e.value || '').trim());
  const wr = wp && periodRange(wp.value);
  if (wr && c.dayUnits > 0 && (c.dayUnits < wr[0] - 0.01 || c.dayUnits > wr[1] + 0.01)) {
    const want = wr[0] === wr[1] ? wr[0] : null;
    E(`${wp.label}(${String(wp.value).trim()}${want ? ` = ${+want.toFixed(1)}일` : ''})과 표의 기간 합계(${+c.dayUnits.toFixed(1)}일)가 다릅니다. 1개월 = 22일 · 1주 = 5일로 셉니다.`, 'extra', [
      { id: 'periodText', label: `${wp.label}을 ${periodWord(c.dayUnits)}(${+c.dayUnits.toFixed(1)}일)로 고치기` },
      ...(want ? [{ id: 'periodDays', label: `표 기간을 ${+want.toFixed(1)}일로 나누기(금액 그대로)` }] : []),
    ]);
  }
  if (c.dayUnits > 0 && doc.rate?.mode !== 'direct' && /^\d{4}/.test(doc.date || '')) {
    const yb = yearBase(settings, doc.date), yr = doc.date.slice(0, 4);
    if (!yb) W(`${yr}년 소프트웨어 노임단가가 설정에 없습니다. 공표되면(보통 전년도 12월) 설정에 넣어 주세요.`, 'rate');
    else if (num(doc.rate.base) !== yb && doc.rate.solve !== 'base') W(`노임단가(${won(doc.rate.base)}원)가 ${yr}년 값(${won(yb)}원)과 다릅니다.`, 'rate');
  }
  const seen = new Map();
  lines.forEach(({ g, l, amt }) => {
    const name = `'${g.name}' · ${String(l.text || '').replace(/\*\*/g, '').slice(0, 18) || '(내용 없음)'}`;
    if (!String(l.text || '').trim() && !goods) (amt ? E : W)(`'${g.name}' 분류에 내용이 빈 줄이 있습니다.`, 'items');
    if (num(l.qty) < 0 || num(l.unit) < 0) E(`${name}: 기간 · 수량 · 단가에 음수가 있습니다.`, 'items');
    else if (amt < 0) { if (c.subtotal > 0 && -amt > c.subtotal * 0.1) W(`${name}: 빼는 금액(${won(-amt)}원)이 큽니다.`, 'items'); }
    else if (!amt) E(`${name}: 금액이 0원입니다. ${l.kind === 'fixed' ? '금액' : '기간/수량'}을 확인하세요.`, 'items');
    const k = String(l.text || '').trim();
    if (k) { if (seen.has(k)) W(`같은 내용 줄이 두 번 있습니다: ${k.replace(/\*\*/g, '').slice(0, 24)}`, 'items'); seen.set(k, 1); }
    if (!goods && c.subtotal > 0 && amt / c.subtotal > 0.3 && lines.length > 3) W(`${name}에 전체의 ${Math.round(amt / c.subtotal * 100)}%가 몰려 있습니다. 빼달라고 하면 타격이 큽니다.`, 'items');
  });

  // 금액
  if (c.final <= 0 && lines.length) E('최종 금액이 0원입니다.', 'items');
  if (doc.target && doc.target.amount) {
    if (c.final !== doc.target.amount || doc.target.vat !== doc.vat) {
      E(`목표 금액 ${won(doc.target.amount)}원(${doc.target.vat === 'incl' ? 'VAT포함' : 'VAT별도'})과 지금 금액 ${won(c.final)}원(${doc.vat === 'incl' ? 'VAT포함' : 'VAT별도'})이 다릅니다. 다시 맞추거나 목표를 지우세요.`, 'target');
    }
  }
  if (doc.vat === 'incl' && !doc.showVat && !goods) W('VAT포함인데 부가세 줄이 꺼져 있어 합계와 최종 금액 차이가 표에 드러나지 않습니다.', 'vat');

  // 참고사항
  const notes = fillTokens(doc.notes || '', doc, settings);
  const year = (doc.date || '').slice(0, 4);
  const years = [...notes.matchAll(/(20\d{2})\s*년/g)].map((m) => m[1]).filter((y) => y !== year);
  if (year && years.length) W(`참고사항에 ${[...new Set(years)].join(', ')}년이 적혀 있습니다(문서는 ${year}년). 연도는 {연도}로 쓰면 자동으로 바뀝니다.`, 'notes');
  if (doc.vat === 'incl' && /(VAT|부가세)\s*(별도|미포함)/i.test(notes)) E('참고사항에 "VAT 별도"라고 적혀 있는데 금액은 VAT포함입니다.', 'notes');
  if (doc.vat === 'excl' && /(VAT|부가세)\s*포함/i.test(notes)) E('참고사항에 "VAT 포함"이라고 적혀 있는데 금액은 VAT별도입니다.', 'notes');
  const bank = accountText(doc, settings).match(/\d[\d-]{8,}\d/);
  const accts = notes.match(/\d{2,6}-\d{2,6}-\d{2,8}(-\d{1,6})?/g) || [];
  if (bank && accts.some((a) => a !== bank[0] && !/^0\d{1,2}-/.test(a))) W(`참고사항 계좌번호가 고른 입금계좌(${bank[0]})와 다릅니다. {계좌}로 쓰면 자동으로 들어갑니다.`, 'notes');
  if (/\{[^}]*\}/.test(notes)) W(`참고사항에 모르는 자리표시가 있습니다: ${notes.match(/\{[^}]*\}/)[0]}`, 'notes');

  // 한 장 넘침
  if (model && model.overflow) E('항목이 많아 A4 한 장을 넘습니다. 줄을 합치거나 참고사항을 줄여 주세요.', 'items');
  else if (model && !goods && model.rowH < 6.2) W('항목이 많아 줄 높이가 좁아졌습니다.', 'items');

  // 지난 문서와 비교
  if (ctx.prev && ctx.prev.amount && c.final) {
    const r = c.final / ctx.prev.amount;
    if (r > 1.5 || r < 0.67) W(`같은 수신처 지난 문서(${ctx.prev.no}, ${won(ctx.prev.amount)}원)와 금액 차이가 큽니다.`);
  }
  return out;
}
