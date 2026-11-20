// 처음 설정값 — 설정 화면에서 고치면 서버(settings)에 저장되고 이 값은 더 쓰지 않는다.

const L = (text, qty = 1) => ({ kind: 'day', text, qty, note: '' });
const F = (text, amount) => ({ kind: 'fixed', text, amount, note: '' });

export const DEFAULT_TEMPLATE = [
  { name: '기획', lines: [
    L('프로젝트 범위 정의 및 일정 계획 수립'),
    L('기획서 작성 및 관계자 커뮤니케이션'),
    L('개발 일정 관리 및 테스트 관리 주관'),
    L('UI 및 Navigation System 설계', 2),
  ] },
  { name: '디자인', lines: [
    L('UI Design Directing'),
    L('홈/서브 레이아웃 프레임 디자인'),
    L('콘텐츠 편집 디자인'),
  ] },
  { name: '퍼블리싱', lines: [
    L('디자인 시안을 기반으로 HTML, CSS, JS 구현'),
    L('반응형 웹 작업 및 브라우저 호환성 보정'),
    L('접근성 (웹 접근성) 및 SEO 기본 세팅'),
  ] },
  { name: '프로그램', lines: [
    L('개발 Directing 및 관리자 솔루션 구축'),
    L('DB 구성 및 UI/UX 구현, Query 연동'),
  ] },
  { name: '도메인', lines: [F('도메인 1년치 구입비', 31200)] },
];

export const DEFAULT_LIBRARY = [
  ...DEFAULT_TEMPLATE.flatMap((g) => g.lines.map((l) => ({ group: g.name, ...l }))),
  { group: '기획', ...L('사이트맵 및 메뉴 구조 설계') },
  { group: '기획', ...L('콘텐츠 수집 · 정리 및 원고 가이드') },
  { group: '디자인', ...L('메인 비주얼(키 이미지) 디자인') },
  { group: '디자인', ...L('아이콘 · 그래픽 요소 제작') },
  { group: '퍼블리싱', ...L('서브 페이지 콘텐츠 입력') },
  { group: '퍼블리싱', ...L('다국어(영문) 페이지 구현') },
  { group: '프로그램', ...L('게시판(공지 · 자료실 · 갤러리) 구축') },
  { group: '프로그램', ...L('온라인 문의 · 신청 폼 구축') },
  { group: '프로그램', ...L('회원 가입 · 로그인 기능 구축') },
  { group: '유지보수', ...F('홈페이지 호스팅 및 유지보수(연)', 30000) },
];

export const QUOTE_NOTES = [
  '1. 귀사의 무궁한 발전을 기원합니다.',
  '2. 본 견적은 {연도}년 소프트웨어 노임단가표를 기준으로 작성되었으며, 비용에는 인건비, 제경비, 기술비가 포함되어 있습니다.',
  '3. 입금계좌: **{계좌}**',
].join('\n');

// 회사 정보(상호 · 등록번호 · 대표자 · 계좌 등)는 코드에 두지 않는다 — 설정 화면에서 넣으면 서버에만 저장된다. 주소 칸은 없다(공개하지 않음).
export const DEFAULT_SETTINGS = {
  company: {
    bizNo: '', name: '', nameEn: '', ceo: '', bizType: '', bizItem: '', tel: '', fax: '', email: '',
    accounts: { personal: '', business: '' },
  },
  // 단가 처음 값: 공표된 노임단가 × 적용률. 실제로 쓰는 적용률 · 단가는 설정 화면에서 넣는다(서버에만 저장)
  rate: { mode: 'formula', base: 833832, factor: 0.25, direct: 200000 },
  // 해마다 공표되는 SW기술자 평균임금(노임단가). 보통 전년도 12월에 나오니 그때 한 줄 추가한다.
  rateTable: [{ year: 2026, base: 833832, note: '2026년 소프트웨어 노임단가' }],
  rounding: 100,
  fillRows: true,
  stamp: true,
  types: {
    quote: {
      title: '반응형 홈페이지 구축 견적서',
      extra: [['유효기간', '견적일로부터 7일'], ['작업기간', '계약일로부터 13일']],
      notes: QUOTE_NOTES,
      vat: 'excl', showVat: false, rounding: 100, account: 'personal',
    },
    statement: {
      title: '거래명세서',
      extra: [['거래내용', '홈페이지 구축'], ['결제조건', '세금계산서 발행 후 7일 이내']],
      notes: '1. 위와 같이 거래하였음을 확인합니다.\n2. 입금계좌: **{계좌}**',
      vat: 'incl', showVat: true, rounding: 1, account: 'business',
    },
    invoice: {
      title: '대금청구서',
      extra: [['건명', '홈페이지 구축 대금'], ['지급기한', '청구일로부터 7일 이내']],
      notes: '',
      vat: 'incl', showVat: true, rounding: 1, account: 'business',
    },
    letter: {
      title: '',
      extra: [],
      notes: '1. 귀사의 무궁한 발전을 기원합니다.\n\n2. ',
      vat: 'incl', showVat: true, rounding: 1, account: 'business',
    },
  },
  template: DEFAULT_TEMPLATE,
  library: DEFAULT_LIBRARY,
};
// 문서 종류 설정의 추가 칸 [[이름, 내용], …] — 빈 자리(null)는 빼고
export const extraOf = (t) => ((t && t.extra) || []).filter(Array.isArray);

// 문서 날짜 해의 노임단가(표에 있으면)
export function yearBase(settings, date) {
  const y = +(String(date || '').slice(0, 4));
  const t = ((settings && settings.rateTable) || []).find((r) => +r.year === y);
  return t ? +t.base : 0;
}

// 설정값으로 새 문서 만들기
export function newDoc(settings, type = 'quote', date) {
  const s = settings || DEFAULT_SETTINGS;
  const t = (s.types && s.types[type]) || DEFAULT_SETTINGS.types[type];
  return {
    type,
    no: '',
    title: t.title,
    date,
    client: { name: '', ref: '' },
    extra: extraOf(t).map(([label, value]) => ({ label, value })),
    vat: t.vat,
    showVat: t.showVat,
    rounding: t.rounding ?? s.rounding ?? 100,
    account: t.account || 'personal',
    rate: { ...(s.rate || DEFAULT_SETTINGS.rate), ...(yearBase(s, date) ? { base: yearBase(s, date) } : {}), byCat: false },
    groups: type === 'letter' ? [] : structuredClone(s.template || DEFAULT_TEMPLATE),
    notes: t.notes,
    memo: '',
    fillRows: s.fillRows !== false,
    stamp: s.stamp !== false,
    target: null,
  };
}
