// 홈페이지 제작 계약서 — 문서 그리기 · A4 한 장 확인 · PDF 내려받기 (xim '계약서' 메뉴와 서명 화면 sign.html 이 같이 쓴다)
//   계약서 글자(body) 안의 자리 표시: {갑} {을} {제작비} {연간비} {기간} {용량} {계약일}
//   {제작비} · {연간비} 뒤에는 고른 대로 'VAT 포함' · 'VAT 별도' 가 붙는다 (c.build_vat · c.hosting_vat: 0 없음 · 1 포함 · 2 별도, 사용자 지시 2026-11-19)
//   {기간} = 호스팅 · 유지보수 기간('2년'). {연간비} 는 그 기간치 관리비 (사용자 지시 2026-11-19 "몇 년으로 할지 직접 입력")
//   줄 첫머리가 '제1조(…)' 면 조 제목(굵게), '①' 로 시작하면 항(들여쓰기). 빈 줄은 단락 띄움.
import { esc } from './common.js';

export const DEFAULT_BODY = `{갑}(이하 "갑")와(과) {을}(이하 "을")은(는) 갑의 홈페이지 제작과 운영에 관하여 다음과 같이 계약을 맺는다.

제1조(목적) 이 계약은 을이 갑의 홈페이지를 제작하고, 완성 뒤 호스팅과 유지보수를 제공하는 데 필요한 사항을 정한다.
제2조(제작 범위) 홈페이지의 구성 · 페이지 · 기능은 갑과 을이 협의한 내용에 따른다. 협의한 범위를 벗어나는 추가 작업은 따로 정한다.
제3조(계약 금액)
① 홈페이지 제작비: {제작비}
② 호스팅(저장 용량 {용량}) · 유지보수 관리비: {기간} {연간비}
제4조(대금 지급)
① 제작비는 계약할 때 50%, 완성 · 검수 뒤 나머지 50%를 지급한다.
② 호스팅 · 유지보수 관리비는 홈페이지를 연 날에 {기간}치를 지급하고, 그 뒤 {기간}마다 같은 날에 갱신한다.
제5조(제작 및 검수) 을은 갑이 자료를 넘긴 뒤 협의한 기간 안에 제작을 마친다. 갑은 완성 알림을 받은 날부터 7일 안에 검수하며, 그 안에 의견이 없으면 검수를 마친 것으로 본다. 검수 중 수정은 2회까지 추가 비용 없이 한다.
제6조(호스팅 및 유지보수)
① 을은 저장 용량 {용량}의 호스팅을 제공하고, 서버 운영 · 보안 점검 · 장애 복구와 글 · 사진 교체 같은 간단한 수정을 맡는다. 새 페이지나 새 기능은 따로 협의한다.
② 계약기간은 홈페이지 개설일로부터 {기간}으로 하며, 계약 만료 30일 전까지 어느 일방도 해지 의사를 밝히지 않으면 {기간}씩 자동 연장된다. 다만, 물가상승, 호스팅 비용 및 운영비용의 변동 등에 따라 관리비를 조정할 수 있으며, 변경 시 계약 만료 30일 전까지 고객에게 사전 안내하고 상호 협의하여 적용한다.
제7조(자료와 권리) 갑이 준 글 · 사진 · 로고의 권리 책임은 갑에게 있다. 대금을 모두 치르면 완성된 홈페이지를 쓸 권리는 갑에게 있으며, 을은 이를 제작 사례로 소개할 수 있다.
제8조(해지) 어느 한쪽이 계약을 어기고 14일 안에 바로잡지 않으면 상대방은 계약을 해지할 수 있다. 제작을 시작한 뒤 갑의 사정으로 해지하면 이미 진행한 작업의 비용은 돌려주지 않는다.
제9조(기타) 이 계약에 없는 사항은 서로 협의해 정한다. 이 계약은 전자 서명으로 맺으며 서면 계약과 같은 효력을 가진다.`;

// 기간 칸이 생기기 전(2026-11-19 전)에 만든 계약서의 '1년' 문장을 {기간} 자리로 바꾼다 — 기본 문구 그대로인 줄만
const OLD_TERM = [
  ['유지보수 관리비: 1년 {연간비}', '유지보수 관리비: {기간} {연간비}'],
  ['홈페이지를 연 날에 1년치를 지급하고, 그 뒤 해마다 같은 날에 갱신한다.', '홈페이지를 연 날에 {기간}치를 지급하고, 그 뒤 {기간}마다 같은 날에 갱신한다.'],
  ['홈페이지를 연 날부터 1년이며,', '홈페이지를 연 날부터 {기간}이며,'],
  ['같은 조건으로 1년씩 연장된다.', '같은 조건으로 {기간}씩 연장된다.'],
];
export const upgradeBody = (body) => (String(body || '').includes('{기간}') ? body : OLD_TERM.reduce((s, [a, b]) => s.replace(a, b), String(body || '')));
export const years = (c) => Math.min(99, Math.max(1, Math.floor(Number(c?.hosting_years) || 1)));

export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

// 3000000 → '삼백만' (금액 한글 표기)
export function hanNum(n) {
  n = Math.floor(Number(n) || 0);
  if (!n) return '영';
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const small = ['', '십', '백', '천'];
  const big = ['', '만', '억', '조'];
  let out = '';
  for (let g = 0; n > 0; g++, n = Math.floor(n / 10000)) {
    const part = n % 10000;
    if (!part) continue;
    let s = '';
    String(part).padStart(4, '0').split('').forEach((ch, i) => {
      const x = +ch; if (!x) return;
      s += (x === 1 && i < 3 ? '' : d[x]) + small[3 - i];
    });
    out = s + big[g] + out;
  }
  return out;
}
export const vatText = (v) => (+v === 1 ? 'VAT 포함' : +v === 2 ? 'VAT 별도' : '');
export const moneyText = (n, vat = 0) => `금 ${won(n)} (금 ${hanNum(n)}원정${vatText(vat) ? `, ${vatText(vat)}` : ''})`;

export function dateKo(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${+m[1]}년 ${+m[2]}월 ${+m[3]}일` : '';
}
const p2 = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

// 갑을 부르는 이름: 업체명, 없으면 대표자명 (목록 · 제목 · 파일 이름 · {갑} 자리)
export const clientLabel = (c) => c?.client_company || c?.client_name || '';

// 글자 → 단락 html (자리 표시를 채운다)
function bodyHtml(c, eul, lines = false, edit = false) {
  const fill = { '갑': clientLabel(c) || '갑', '을': eul.company || eul.name || '을', '제작비': moneyText(c.build_fee, c.build_vat), '연간비': moneyText(c.yearly_fee, c.hosting_vat), '기간': `${years(c)}년`, '용량': c.hosting || '1GB', '계약일': dateKo(c.contract_date) };
  const put = (t) => esc(t).replace(/\{(갑|을|제작비|연간비|기간|용량|계약일)\}/g, (_, k) => (edit ? `<b class="ct-ph" contenteditable="false" data-ph="${k}" title="왼쪽 칸 값이 들어가는 자리">${esc(fill[k])}</b>` : `<b>${esc(fill[k])}</b>`));
  return String(c.body || '').split(/\r?\n/).map((line, i) => {
    const t = line.trim();
    const l = (lines || edit ? ` data-l="${i}"` : '') + (edit ? ' contenteditable="plaintext-only" spellcheck="false"' : '');
    if (!t) return `<p class="ct-gap"${l}></p>`;
    const art = t.match(/^(제\s*\d+\s*조\s*(?:\([^)]*\))?)\s*(.*)$/);
    if (art) return `<p class="ct-art"${l}><b>${esc(art[1])}</b>${art[2] ? ` ${put(art[2])}` : ''}</p>`;
    if (/^[①-⑳]/.test(t)) return `<p class="ct-sub"${l}>${put(t)}</p>`;
    return `<p${l}>${put(t)}</p>`;
  }).join('');
}

// 문서 한 장. opt.a4 = PDF 용 고정 크기(794 × 1123px), opt.preview = 갑 서명 미리보기(서명 화면에서 그리는 중)
//   서명 · 도장은 이름 오른쪽 (인) 동그라미 한가운데에 찍힌다 (사용자 지시 2026-11-12)
export function contractHtml(c, eul, opt = {}) {
  const signed = c.status === 'signed';
  // 연락처 · 이메일은 갑 · 을 둘 다 적혀 있을 때만 보인다 — 한쪽이라도 비면 그 줄을 양쪽 다 뺀다 (사용자 지시 2026-11-22)
  const phone = !!(String(c.client_phone || '').trim() && String(eul.phone || '').trim());
  const mail = !!(String(c.client_email || '').trim() && String(eul.email || '').trim());
  return `<article class="ct-doc${opt.a4 ? ' ct-a4' : ''}">
    <header class="ct-head"><h1>홈페이지 제작 계약서</h1>${c.code ? `<span class="ct-no">No. ${esc(c.code)}</span>` : ''}</header>
    <div class="ct-body">${bodyHtml(c, eul, opt.lines, opt.edit)}</div>
    <p class="ct-date">${esc(dateKo(c.contract_date) || '　　년　　월　　일')}</p>
    <div class="ct-parties">
      ${party('갑', c.client_company, c.client_name, phone ? c.client_phone : null, c.client_sign || opt.preview || '', 'gap', mail ? c.client_email : null)}
      ${party('을', eul.company, eul.name, phone ? eul.phone : null, eul.sign, 'eul', mail ? eul.email : null)}
    </div>
    ${signed ? `<footer class="ct-foot">전자 서명 완료 ${esc(stamp(c.signed_at))} · 문서 확인 ${esc(c.host || 'sign.plators.com')}/${esc(c.code)}${c.doc_hash ? ` · 지문 ${esc(c.doc_hash.slice(0, 16))}` : ''}</footer>` : ''}
  </article>`;
}
// phone · email 이 null 이면 그 줄을 그리지 않는다
//   업체명이 없으면 업체명 줄 없이 '이름' 한 줄(업체명 칸이 생기기 전 계약서 모습 그대로)
const party = (role, company, name, phone, mark, who, email = null) => `<section class="ct-party${company ? ' ct-party-co' : ''}">
  <h2>${role}</h2>
  <dl>${company ? `<div><dt>업체명</dt><dd>${esc(company)}</dd></div>` : ''}<div><dt>${company ? '대표자' : '이름'}</dt><dd class="ct-name"><span>${esc(name || '')}</span><span class="ct-in ct-in-${who}" data-in="${who}"><i>인</i>${mark ? `<img src="${esc(mark)}" alt="${esc(name || company || '')} 서명 · 도장">` : ''}</span></dd></div>
${phone === null ? '' : `
  <div><dt>연락처</dt><dd>${esc(phone || '')}</dd></div>`}${email === null ? '' : `
  <div><dt>이메일</dt><dd class="ct-mail">${esc(email)}</dd></div>`}</dl>
</section>`;

// A4 한 장에 들어가는지 (PDF 크기로 몰래 그려 높이를 잰다). 넘으면 몇 % 넘는지
export function a4Overflow(c, eul) {
  const box = document.createElement('div');
  box.className = 'ct-offscreen';
  box.innerHTML = contractHtml(c, eul, { a4: true });
  document.body.append(box);
  const el = box.firstElementChild;
  const over = el.scrollHeight / 1123;
  box.remove();
  return over;
}

// ───────── PDF 내려받기: A4 크기로 그린 문서를 그림으로 떠서 PDF 한 장에 ─────────
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];
const loadScript = (src) => new Promise((ok, no) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => no(new Error('PDF 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
  document.head.append(s);
});

// → { pdf(jsPDF), name(파일 이름) }
async function makePdf(c, eul) {
  await Promise.all(LIBS.map(loadScript));
  const box = document.createElement('div');
  box.className = 'ct-offscreen';
  box.innerHTML = contractHtml(c, eul, { a4: true });
  document.body.append(box);
  try {
    const el = box.firstElementChild;
    await document.fonts?.ready;
    await Promise.all([...el.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {})));
    const canvas = await window.html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    // 가로 210mm 에 맞추고, 혹시 세로가 넘으면 한 장 안에 들게 줄인다
    let w = 210; let h = (canvas.height / canvas.width) * w;
    if (h > 297) { w *= 297 / h; h = 297; }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - w) / 2, 0, w, h);
    pdf.setProperties({ title: `홈페이지 제작 계약서 - ${clientLabel(c)}`, subject: `No. ${c.code}` });
    const safe = clientLabel(c).replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 30);
    return { pdf, name: `홈페이지제작계약서_${safe}_${c.code}.pdf` };
  } finally { box.remove(); }
}
export async function downloadPdf(c, eul) {
  const { pdf, name } = await makePdf(c, eul);
  pdf.save(name);
}
// 메일에 붙일 PDF (base64 글자)
export async function pdfBase64(c, eul) {
  const { pdf } = await makePdf(c, eul);
  return pdf.output('datauristring').split(',').pop();
}

// 서명 · 도장 그림 올리기: 가로 600px 안으로 줄이고, 흰 바탕은 투명하게, 둘레 여백을 잘라 PNG data URL 로 (xim 을 사인 · 서명 화면 갑 도장 같이 씀)
export async function markImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('이 그림은 읽을 수 없어요. png · jpg 로 올려 주세요.'); }
  const k = Math.min(1, 1200 / bmp.width);
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const img = ctx.getImageData(0, 0, cv.width, cv.height); const px = img.data;
  let x0 = cv.width; let y0 = cv.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      const light = Math.min(px[i], px[i + 1], px[i + 2]);
      if (light > 235) px[i + 3] = 0;                                                  // 흰 바탕 → 투명
      else if (light > 200) px[i + 3] = Math.round(px[i + 3] * (235 - light) / 35);    // 가장자리 부드럽게
      if (px[i + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) throw new Error('그림에서 서명 · 도장을 찾지 못했습니다.');
  ctx.putImageData(img, 0, 0);
  const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(cv.width - 1, x1 + m); y1 = Math.min(cv.height - 1, y1 + m);
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  let s = Math.min(1, 600 / w, 400 / h);
  for (;;) {
    const out = document.createElement('canvas');
    out.width = Math.round(w * s); out.height = Math.round(h * s);
    out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if (url.length <= 380 * 1024) return url;
    if (s < 0.2) throw new Error('그림이 너무 큽니다. 더 작은 그림으로 올려 주세요.');
    s *= 0.75;   // 거친 도장처럼 무늬가 많으면 더 줄인다
  }
}

// 문서 위에서 고친 문단 → 글자 한 줄 (자리 표시 칸은 {갑} 같은 원래 표시로)
export function lineText(p) {
  let out = '';
  const walk = (n) => {
    for (const ch of n.childNodes) {
      if (ch.nodeType === 3) out += ch.nodeValue;
      else if (ch.dataset?.ph) out += `{${ch.dataset.ph}}`;
      else if (ch.nodeName === 'BR') out += '';
      else walk(ch);
    }
  };
  walk(p);
  return out.replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ');
}
