// xim 상담연락 — 지도에 나온 업체와, 그 업체의 홈페이지 · 블로그 · 인스타그램에 공개된 휴대폰 번호 (사용자 지시 2026-11-26)
//   한 줄 = 업체 하나(이름 · 휴대폰 · 홈 / 블 / 인스타). 누르면 나머지(주소 · 어디까지 확인했는지 · 메모 · 단추)가 펼쳐진다.
//   주소를 붙여 넣으면 xim 이 그 페이지를 열어 010 번호를 찾아 쌓는다. 같은 번호는 한 번만.
import { $, esc, toast, busy, fmtDate, pillTabs, slideTabs, openDialog } from './common.js';

let deps = null;   // { view, api }
let filter = '';   // '' 전체 · 'has' 번호 있음 · 'none' 번호 없음 · 'done' 연락함
let callF = '';    // 통화: '' 전체 · '-' 통화 전 · yes 동의받음 · no 거절 · miss 부재중
const CALL = { '': '통화 전', yes: '통화 · 동의받음', no: '통화 · 거절', miss: '부재중' };   // ok = 예전 '통화함'(남아 있으면 그대로 보임)
let q = '';
let sido = '';     // '' 모든 시 · 도 · '서울시'
let gu = '';       // '' 모든 구 · '노원구'
// 홈페이지 · 블로그 · 인스타그램이 있는 곳 / 없는 곳 (사용자 지시 2026-11-27) — 칸마다 '' 상관없음 · 'y' 있음 · 'n' 없음, 여러 칸을 함께 고르면 모두 맞는 곳만
const LINKS = [['homepage', '홈페이지'], ['blog', '블로그'], ['instagram', '인스타그램']];
const link = { homepage: '', blog: '', instagram: '' };
let items = [];
let scopes = [];
let sms = '';      // 복사해 쓰는 문자 내용(xim settings.lead_sms — 리포에는 두지 않는다)
let lastScan = null;
const open = new Set();   // 펼쳐 둔 줄(id)
const PAGE = 100;         // 한 번에 그리는 줄 수 — 나머지는 "더 보기" (사용자 지시 2026-11-27 "처음에 목록 다 불러오지 않아도")
let limit = PAGE;
const full = new Map();   // 펼친 줄의 긴 칸(checked · links · source_url) — 펼칠 때 받아 둔다
const picked = new Set(); // 문자 보낼 곳으로 고른 줄(id) — 휴대폰 있는 곳만
let smsCfg = {};          // 문자 설정(네이버 클라우드 SENS) + 준비 상태
// 서울 25개 구 — 칸 지도(대략 실제 위치대로 7칸 × 6줄). 구 이름은 주소 둘째 마디와 같다
const SEOUL = [['강북구', 4, 0], ['도봉구', 5, 0], ['노원구', 6, 0],
  ['은평구', 1, 1], ['서대문구', 2, 1], ['종로구', 3, 1], ['성북구', 4, 1], ['동대문구', 5, 1], ['중랑구', 6, 1],
  ['마포구', 2, 2], ['중구', 3, 2], ['성동구', 4, 2], ['광진구', 5, 2],
  ['강서구', 0, 3], ['양천구', 1, 3], ['영등포구', 2, 3], ['용산구', 3, 3], ['강동구', 6, 3],
  ['구로구', 1, 4], ['동작구', 2, 4], ['서초구', 3, 4], ['강남구', 4, 4], ['송파구', 5, 4],
  ['금천구', 1, 5], ['관악구', 2, 5]];

const SRC = { map: '지도 업체 정보', place: '네이버 플레이스', homepage: '홈페이지', blog: '블로그', instagram: '인스타그램', manual: '직접 넣음' };
// 지역 = 주소의 첫 두 마디(시 · 도 + 구 · 시 · 군). 모을 때 따로 적지 않아도 주소만 있으면 "서울시 › 노원구" 로 나뉜다
const SIDO = { 서울: '서울시', 부산: '부산시', 대구: '대구시', 인천: '인천시', 광주: '광주시', 대전: '대전시', 울산: '울산시', 세종: '세종시', 경기: '경기도', 강원: '강원도', 충북: '충청북도', 충남: '충청남도', 전북: '전북', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주도' };
const words = (it) => (it.address || '').trim().split(/\s+/);
const sidoOf = (it) => { const w = words(it)[0]; return w ? (SIDO[w] || w) : '지역 모름'; };
const guOf = (it) => words(it)[1] || '';
const regionOf = (it) => `${sidoOf(it)} ${guOf(it)}`.trim();
const inRegion = (it) => (!sido || sidoOf(it) === sido) && (!gu || guOf(it) === gu);
const callOk = (it) => !callF || (callF === '-' ? !it.call : it.call === callF);
const phoneOk = (it) => (filter === 'has' ? !!it.phone : filter === 'none' ? !it.phone : filter === 'done' ? !!it.done : true);
const linkOk = (it, skip) => LINKS.every(([k]) => k === skip || !link[k] || (link[k] === 'y') === !!it[k]);
const textOk = (it) => {
  const k = q.trim().toLowerCase().replace(/-/g, '');
  return !k || `${it.name} ${it.phone.replace(/-/g, '')} ${it.tel.replace(/-/g, '')} ${it.address} ${it.category} ${it.memo}`.toLowerCase().includes(k);
};
// 탭을 다시 그리지 않고 숫자만 바꾼다(고른 칸 배경이 미끄러지는 게 끊기지 않게)
const relabel = (box, labels) => { if (!box) return; box.querySelectorAll('button[data-v]').forEach((b) => { b.textContent = labels[b.dataset.v]; }); slideTabs(box); };
// 어디까지 알아봤나(lead_scopes.area 예: "노원구")는 구를 고르면 그 구 것만
const scopeIn = (sc) => !gu || sc.area.includes(gu) || gu.includes(sc.area);
const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'ko'));
const count = (fn) => items.filter(fn).length;
// pillTabs 는 상자에 click 을 붙이므로, 다시 그릴 때는 빈 새 상자로 바꿔 끼운다
const fresh = (sel) => { const o = $(sel); const n = o.cloneNode(false); o.replaceWith(n); return n; };
const ext = (url, label, cls = '') => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

export async function renderLeads(d) {
  deps = d;
  const { view, api } = deps;
  ({ items, scopes = [], sms = '', smsCfg = {} } = await api('/leads'));
  for (const id of [...picked]) if (!items.some((i) => i.id === id && i.phone)) picked.delete(id);
  if (sido && !items.some((i) => sidoOf(i) === sido)) { sido = ''; gu = ''; }
  if (gu && !items.some(inRegion)) gu = '';
  view.innerHTML = `
    <div class="bar"><h2>상담연락 <span id="ld-count"></span></h2>
      <input class="input search-q ld-q" id="ld-q" type="search" placeholder="이름 · 번호 · 주소 찾기" value="${esc(q)}" aria-label="찾기">
      <button type="button" class="btn sm" id="ld-csv">엑셀(CSV) 받기</button></div>
    <section class="ld-rule" aria-label="연락 규칙">
      <h3>📞 먼저 전화 → ✅ 동의 → 그다음에만 ✉ 문자</h3>
      <ol>
        <li><b>문자는 통화로 동의를 받은 곳에만</b> 보냅니다. 동의 없이 보내면 하루 한 통이어도 <b>과태료(최대 3천만 원)</b>, 신고가 쌓이면 <b>내 휴대폰 문자 차단</b>.</li>
        <li><b>전화 첫마디에 연락처를 어디서 알았는지 꼭 밝힙니다.</b> "○○ 보고 연락드렸습니다" — 업체를 펼치면 <b>"전화할 때"</b> 에 그 업체 번호가 나온 곳이 적혀 있습니다.</li>
        <li>업체를 펼쳐 <b>문자 받기 ☑ 동의함 / ☑ 거절함</b> 을 체크합니다(체크한 날짜 · 시간이 찍힘). 거절한 곳은 다시 연락하지 않습니다.</li>
        <li>홍보 전화도 정보통신망법이 적용될 수 있습니다 — 확실한 기준은 <b>118</b>(KISA, 무료)에 물어보기.</li>
      </ol>
    </section>
    <div id="ld-scopes"></div>
    <details class="card ld-scope ld-sms"><summary>보낼 문자 <small>눌러서 내용 보기 · 고치기 · <b>{업체명}</b> 은 업체마다 그 이름으로 바뀝니다</small><button type="button" class="btn sm primary" id="ld-sms-copy">문자 복사</button></summary>
      <div class="ld-form"><div class="ld-warnbox"><b>⚠ 절대 그냥 홍보 문자를 보내지 마세요</b>
          <ul>
            <li><b>하루 몇 통이어도, 내 폰이어도 똑같이 위반</b>입니다. 홍보(광고) 문자는 ① 받는 사람의 미리 받은 수신 동의 ② 맨 앞 (광고) · 보내는 사람 이름 ③ 무료 수신거부 방법(080)이 모두 있어야 합니다(정보통신망법 제50조).</li>
            <li><b>신고 한 건이면</b> 받은 사람이 휴대폰 스팸 신고나 118(KISA 불법스팸대응센터)로 신고 → KISA 가 번호 주인 확인 · 자료 제출 요구 → 방송통신위원회 <b>과태료</b>(상한 3천만 원, 첫 위반도 수백만 원대 가능) → 신고가 쌓이면 통신사가 <b>내 휴대폰 문자 발송 차단</b>.</li>
            <li><b>문자로 보내도 되는 것:</b> 상대가 요청한 자료 · 문의 답변 · 계약 고객 안내(광고 아님). 처음 연락은 전화로 — 첫마디에 연락처를 어디서 알았는지 밝히기(홍보 전화도 법이 적용될 수 있어 118 확인 권장).</li>
            <li>홍보 문자를 꼭 보내야 하면: 동의 받은 곳에만 + 네이버 080 을 한 달 켜고(문자 설정 안내) + (광고) · 자두랩스 · 무료수신거부 080 넣기. 헷갈리면 118 에 무료로 물어보기.</li>
          </ul></div>
        <div class="ld-note ld-phone-note"><b>내 폰으로 보낼 때 (지금 쓰는 방법 — 2026-11-27)</b>
          <ul>
            <li><b>보내는 법:</b> 폰에서 xim 을 열고 업체를 펼쳐 <b>[내 폰으로 문자]</b> → 문자 앱이 번호 · 내용(<b>{업체명}</b> 이 그 업체 이름으로 바뀐 것)까지 채워져 열림 → 보내기. PC 에서 누르면 내용이 복사됩니다. 보낸 뒤 <b>[연락함]</b> 표시.</li>
            <li><b>하루 몇 통:</b> 하루 <b>20~30통 안쪽</b>을 권합니다. 같은 내용을 한꺼번에 많이 보내면 통신사가 스팸으로 보고 막거나, 받은 사람의 스팸 신고가 쌓이면 <b>내 휴대폰 번호 문자 발송이 정지</b>될 수 있습니다(통신사 기준은 공개돼 있지 않음 — 넉넉히 적게).</li>
            <li><b>먼저 전화:</b> 처음 연락은 전화로. 통화에서 "자료 보내 드려도 될까요?" 동의를 받은 곳에만 보내고, 업체를 펼쳐 <b>☑ 동의함</b> 을 체크합니다(날짜 · 시간이 찍힘). 말로만 받은 동의는 증거로 약하니 상대가 문자로 "네" 라고 답해 주면 더 좋습니다.</li>
            <li><b>광고인지 아닌지:</b> 상대가 요청한 자료 · 답변이면 그냥 보내도 됩니다. 홍보 내용(처음 소개 · 할인 안내 등)이면 내 폰이어도 <b>광고 문자</b>라서 맨 앞 <b>(광고)</b>, 보내는 사람 이름, 수신거부 방법을 넣어야 합니다(정보통신망법 제50조).</li>
            <li><b>시간:</b> 광고 문자는 <b>밤 9시 ~ 아침 8시 금지</b>. 안내 문자도 근무 시간(평일 9~18시)에 보내는 게 좋습니다.</li>
            <li><b>거절하면 끝:</b> "보내지 마세요" 라고 하면 바로 멈추고, 업체를 펼쳐 동의 취소 + 메모에 "수신거부" 를 적어 둡니다. 다시 보내면 신고 대상입니다.</li>
            <li><b>내용:</b> 업체 이름이 맞게 들어갔는지 보내기 전에 한 번 확인. 같은 글을 복사해 수십 곳에 보내기보다 업체마다 한 줄이라도 다르게 쓰면 스팸으로 덜 걸립니다.</li>
          </ul></div>
        <textarea class="input" id="ld-sms" rows="14" maxlength="4000" placeholder="[{업체명}] 원장님 안녕하세요…" aria-label="보낼 문자">${esc(sms)}</textarea>
        <div class="ld-form-foot ld-sms-foot"><small class="ld-bytes" id="ld-bytes"></small><button type="button" class="btn sm" id="ld-sms-ins">{업체명} 넣기</button><button type="button" class="btn sm" id="ld-sms-save">저장</button></div></div></details>
    <details class="card ld-scope"><summary>문자 설정 <small>${smsReady() ? '<span class="badge done">보낼 준비 됨</span>' : '<span class="badge idle">아직 준비 안 됨</span>'} ${{ solapi: '솔라피', sens: '네이버 클라우드 SENS', hackle: '핵클 메시지' }[smsCfg.provider] || '네이버 클라우드 SENS'}</small></summary>
      <form class="ld-form ld-cfg" id="ld-cfg">
        <div class="ld-cfg-grid">
          <input type="hidden" name="provider" value="sens"><input type="hidden" name="hk"><input type="hidden" name="sak"><input type="hidden" name="sas">
          <label class="field" data-p="sens"><span>서비스 ID <small>SENS › Project 의 SMS 서비스 ID</small></span><input class="input" name="serviceId" value="${esc(smsCfg.serviceId)}" placeholder="ncp:sms:kr:000000000000:xim" autocomplete="off"></label>
          <label class="field"><span>발신번호 <small>SENS 에 등록 · 승인된 번호</small></span><input class="input" name="from" value="${esc(smsCfg.from)}" placeholder="010-0000-0000" inputmode="tel"></label>
          <label class="field"><span>무료 수신거부 번호 <small>광고 문자 끝에 붙음 — 솔라피는 비워 두면 공용 080-500-4233</small></span><input class="input" name="optout" value="${esc(smsCfg.optout)}" placeholder="${smsCfg.provider === 'solapi' ? '080-500-4233 (솔라피 공용, 무료)' : '080-000-0000'}" inputmode="tel"></label>
          <label class="field"><span>장문(LMS) 제목</span><input class="input" name="subject" value="${esc(smsCfg.subject)}" placeholder="안내" maxlength="40"></label>
          <label class="field" data-p="sens"><span>Access Key ID <small>네이버 클라우드 › Sub Account › xim-sms › Access Key</small></span><input class="input" name="ak" placeholder="${smsCfg.ready?.keys ? '넣어 둠 — 바꿀 때만 새로 넣기' : 'ncp_iam_BPA…'}" autocomplete="off" spellcheck="false"></label>
          <label class="field" data-p="sens"><span>Secret Key <small>같은 줄의 [보기]</small></span><input class="input" type="password" name="sk" placeholder="${smsCfg.ready?.keys ? '넣어 둠 — 바꿀 때만 새로 넣기' : 'ncp_iam_BPK…'}" autocomplete="new-password" spellcheck="false"></label>
        </div>
        <div class="ld-note"><b>네이버 클라우드 SENS — xim 에서 문자 보내는 곳</b>
          <ul>
            <li><b>왜 네이버:</b> xim 은 Cloudflare 에서 돌아 나가는 IP 가 바뀌는데, 네이버는 IP 대신 키 서명으로 확인해서 xim 에서 바로 보낼 수 있습니다. SMS 9 · LMS 30원(부가세 별도), 충전 없이 쓴 만큼 다음 달 청구.</li>
            <li><b>지금 상태:</b> 080 수신거부 번호 없음 → <b>광고가 아닌 문자</b>(문의 답변 · 요청받은 자료 · 계약 고객 안내)만 보냅니다. 홍보(광고) 문자는 (광고) 표시 + 무료 수신거부 080 이 법으로 필요합니다(정보통신망법 제50조).</li>
            <li><b>080 요금:</b> 회선당 <b>월 29,000원</b>(부가세 포함 약 31,900원, 수신거부 전화 월 1,000통 포함). 개통이 끝난 때부터 요금이 붙고, <b>해지하면 그 즉시 멈추며</b> 중간에 끊으면 쓴 날만큼만 냅니다 → <b>홍보 문자 보낼 때 한 달만 켰다가 해지</b>하면 그 한 달 치만 나갑니다.</li>
            <li><b>080 한 달만 쓰는 순서:</b> ① 홍보 문자 보낼 날을 정하고 <b>일주일 전에 신청</b>(개통 영업일 3~4일) ② 개통되면 아래 "무료 수신거부 번호" 칸에 080 넣기 ③ 며칠에 걸쳐 보내기 ④ <b>마지막 발송 1~2주 뒤</b> 해지(문자 받고 며칠 뒤에 수신거부하는 사람도 있어서).</li>
            <li><b>해지 전에 꼭:</b> 해지하면 그동안 쌓인 <b>수신거부 목록이 지워지고</b> 다시 신청해도 돌아오지 않습니다. 수신거부한 사람에게 다시 광고를 보내면 위반이라, 해지 전에 목록을 받아 업체마다 동의 취소 + 메모 "수신거부" 로 옮겨 둡니다.</li>
          </ul></div>
        <ul class="ld-ready">${[['keys', 'API 키'], ...(smsCfg.provider === 'sens' ? [['service', '서비스 ID']] : []), ['from', '발신번호'], ['optout', '080 수신거부 번호']].map(([k, l]) => `<li class="${smsCfg.ready?.[k] ? 'ok' : ''}">${l}</li>`).join('')}</ul>
        <div class="ld-form-foot ld-sms-foot"><button type="submit" class="btn sm primary">설정 저장</button></div>
      </form></details>
    <details class="card ld-scope"><summary>주소를 넣어 더 모으기 <small>홈페이지 · 블로그 · 인스타그램 · 네이버 지도(플레이스) 주소</small></summary>
      <form class="ld-form" id="ld-form">
        <label class="field"><span>주소 붙여 넣기 <small>한 줄에 하나 · 한 번에 15개까지</small></span>
          <textarea class="input" name="text" rows="3" placeholder="https://blog.naver.com/아이디&#10;https://www.instagram.com/계정/"></textarea></label>
        <div class="ld-form-foot">
          <label class="field ld-kw"><span>찾은 말</span><input class="input" name="keyword" value="상담" maxlength="40"></label>
          <button type="submit" class="btn primary">휴대폰 번호 수집</button>
        </div>
        <p class="ld-err" id="ld-err" role="alert"></p>
        <div id="ld-scan"></div>
      </form></details>
    <div id="ld-map"></div>
    <div class="ld-region"><span class="ld-region-label">지역</span>
      <nav class="tabs iq-tabs" id="ld-sido" aria-label="시 · 도"></nav><span class="ld-region-sep" aria-hidden="true">›</span><nav class="tabs iq-tabs" id="ld-gu" aria-label="구"></nav></div>
    <div class="ld-filters"><div class="ld-f"><span class="ld-region-label">통화</span><nav class="tabs iq-tabs" id="ld-f-call" aria-label="통화"></nav></div>${LINKS.map(([k, label]) => `<div class="ld-f"><span class="ld-region-label">${label}</span><nav class="tabs iq-tabs" id="ld-f-${k}" aria-label="${label}"></nav></div>`).join('')}</div>
    <nav class="tabs iq-tabs ld-tabs" id="ld-tabs" aria-label="보기"></nav>
    <div id="ld-body"></div>
    <div class="ld-pick" id="ld-pick" hidden></div>`;
  pillTabs($('#ld-sido'), [['', `전체 ${items.length}`], ...uniq(items.map(sidoOf)).map((v) => [v, `${v} ${count((i) => sidoOf(i) === v)}`])], sido, (v) => { sido = v; gu = ''; paintGu(); update(); });
  paintGu();
  for (const [k] of LINKS) pillTabs($(`#ld-f-${k}`), [['', '전체'], ['y', '있음'], ['n', '없음']], link[k], (v) => { link[k] = v; update(); });
  pillTabs($('#ld-f-call'), [['', '전체'], ['-', '통화 전'], ['yes', '동의받음'], ['no', '거절'], ['miss', '부재중']], callF, (v) => { callF = v; update(); });
  pillTabs($('#ld-tabs'), [['', '전체'], ['has', '번호 있음'], ['none', '번호 없음'], ['done', '연락함']], filter, (v) => { filter = v; update(); });
  update();
  $('#ld-q').oninput = (e) => { q = e.target.value; update(); };
  $('#ld-csv').onclick = downloadCsv;
  // 보낼 문자: 접혀 있어도 "문자 복사"는 바로 된다(입력칸에 있는 지금 내용 그대로)
  $('#ld-sms-copy').onclick = (e) => { e.preventDefault(); const t = $('#ld-sms').value; if (!t.trim()) return toast('문자 내용이 비어 있습니다.'); navigator.clipboard.writeText(t).then(() => toast('문자를 복사했습니다.')); };
  $('#ld-sms-save').onclick = (e) => busy(e.currentTarget, null, async () => { sms = $('#ld-sms').value; await api('/leads/sms', { method: 'PUT', data: { text: sms } }); toast('문자를 저장했습니다.'); });
  const ta = $('#ld-sms');
  const paintBytes = () => { const b = byteLen(ta.value.replace(/\{업체명\}/g, '가나다라마바사심리상담센터')); $('#ld-bytes').textContent = `${b}바이트 · ${b <= 80 ? '단문(SMS)' : b <= 2000 ? '장문(LMS)' : '너무 깁니다'} — 광고 표시 · 수신거부 문구는 보낼 때 붙습니다`; };
  ta.oninput = paintBytes; paintBytes();
  $('#ld-sms-ins').onclick = () => { const a = ta.selectionStart ?? ta.value.length; ta.setRangeText('{업체명}', a, ta.selectionEnd ?? a, 'end'); ta.focus(); paintBytes(); };
  const showP = () => { const v = $('#ld-cfg').provider.value; $('#ld-cfg').querySelectorAll('[data-p]').forEach((el) => { el.hidden = el.dataset.p !== v; }); };
  $('#ld-cfg').provider.onchange = showP; showP();
  $('#ld-cfg').onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    busy(f.querySelector('[type=submit]'), null, async () => {
      await api('/leads/sms-cfg', { method: 'PUT', data: { provider: f.provider.value, serviceId: f.serviceId.value, from: f.from.value, optout: f.optout.value, subject: f.subject.value, ak: f.ak.value.trim(), sk: f.sk.value.trim(), hk: f.hk.value.trim(), sak: f.sak.value.trim(), sas: f.sas.value.trim() } });
      toast('문자 설정을 저장했습니다.');
      await renderLeads(deps);
    });
  };
  $('#ld-form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    busy(f.querySelector('[type=submit]'), $('#ld-err'), async () => {
      lastScan = await api('/leads/scan', { method: 'POST', data: { text: f.text.value, keyword: f.keyword.value } });
      toast(lastScan.added ? `새 번호 ${lastScan.added}개를 넣었습니다.` : '새로 찾은 번호가 없습니다.');
      await renderLeads(deps);
      $('#ld-form').closest('details').open = true;
    }, '페이지를 여는 중…');
  };
  renderScan();
  renderList();
}

// 구 칸: 고른 시 · 도 안의 구만(시 · 도가 "전체"면 모든 구)
function paintGu() {
  const inSido = (i) => !sido || sidoOf(i) === sido;
  const gus = uniq(items.filter(inSido).map(guOf).filter(Boolean));
  pillTabs(fresh('#ld-gu'), [['', `전체 ${count(inSido)}`], ...gus.map((v) => [v, `${v} ${count((i) => inSido(i) && guOf(i) === v)}`])], gu, (v) => { gu = v; update(); });
}

const update = () => { limit = PAGE; paintCounts(); paintMap(); renderList(); paintPick(); };
const smsReady = () => { const r = smsCfg.ready || {}; return r.keys && r.service && r.from; };
const byteLen = (t) => { let n = 0; for (const ch of String(t)) n += ch.charCodeAt(0) > 127 ? 2 : 1; return n; };

// 서울 구별 업체 수 — 칸 지도. 진할수록 많다. 누르면 그 구만(다시 누르면 서울 전체)
function paintMap() {
  const box = $('#ld-map'); if (!box) return;
  if (!items.some((i) => sidoOf(i) === '서울시')) { box.innerHTML = ''; return; }
  const seoul = items.filter((i) => sidoOf(i) === '서울시' && linkOk(i) && textOk(i) && phoneOk(i));
  const n = {}; const p = {};
  for (const i of seoul) { const g = guOf(i); n[g] = (n[g] || 0) + 1; if (i.phone) p[g] = (p[g] || 0) + 1; }
  const max = Math.max(1, ...Object.values(n));
  box.innerHTML = `<section class="card ld-map"><div class="ld-map-head"><b>서울 구별 업체 수</b><small>진할수록 많음 · 누르면 그 구만 보기 · 작은 숫자 = 휴대폰 있는 곳</small><span class="ld-map-total">서울 ${seoul.length}곳</span></div>
    <div class="ld-map-grid">${SEOUL.map(([g, x, y]) => {
      const v = n[g] || 0; const lv = v ? Math.min(5, 1 + Math.floor((v / max) * 4.999)) : 0;
      return `<button type="button" class="ld-tile lv${lv}${sido === '서울시' && gu === g ? ' on' : ''}" style="grid-column:${x + 1};grid-row:${y + 1}" data-gu="${g}" aria-pressed="${sido === '서울시' && gu === g}" aria-label="${g} ${v}곳, 휴대폰 ${p[g] || 0}곳">
        <span class="ld-tile-name">${g.replace(/(.)구$/, '$1')}</span><b>${v}</b><small>${p[g] || 0}</small></button>`; }).join('')}</div></section>`;
  box.querySelectorAll('.ld-tile').forEach((b) => { b.onclick = () => {
    const g = b.dataset.gu; const same = sido === '서울시' && gu === g;
    sido = '서울시'; gu = same ? '' : g;
    renderLeads(deps);   // 시 · 도 탭과 구 탭도 같이 맞춘다
  }; });
}

// 고른 곳 막대(화면 아래에 붙음): 몇 곳 · 그중 수신 동의 · 보이는 곳 모두 고르기 · 문자 보내기
function paintPick() {
  const bar = $('#ld-pick'); if (!bar) return;
  const vis = shown().filter((i) => i.phone);
  const sel = items.filter((i) => picked.has(i.id));
  const ok = sel.filter((i) => i.consent > 0).length;
  const allOn = vis.length && vis.every((i) => picked.has(i.id));
  bar.hidden = false;
  bar.innerHTML = `<span class="ld-pick-n">${sel.length ? `<b>${sel.length}곳</b> 고름 · 수신 동의 <b>${ok}</b>` : '문자 보낼 곳을 왼쪽 네모로 고르세요'}</span>
    <button type="button" class="btn sm" data-all>${allOn ? '보이는 곳 풀기' : `보이는 번호 ${vis.length}곳 고르기`}</button>
    ${sel.length ? '<button type="button" class="btn sm" data-clear>모두 풀기</button>' : ''}
    <button type="button" class="btn sm primary" data-send${sel.length ? '' : ' disabled'}>문자 보내기</button>`;
  bar.querySelector('[data-all]').onclick = () => { for (const i of vis) { if (allOn) picked.delete(i.id); else picked.add(i.id); } renderList(); paintPick(); };
  const c = bar.querySelector('[data-clear]'); if (c) c.onclick = () => { picked.clear(); renderList(); paintPick(); };
  bar.querySelector('[data-send]').onclick = sendDialog;
}

// 보내기 전 확인: 서버가 업체마다 만든 문장 중 하나를 보여 주고, 동의 없는 곳 · 비용 · 단문/장문을 알려 준다
async function sendDialog() {
  const { api } = deps;
  const text = $('#ld-sms').value;
  if (!text.trim()) { $('#ld-sms').closest('details').open = true; return toast('보낼 문자 내용을 먼저 써 주세요.'); }
  const ids = [...picked];
  let ad = true;
  const dlg = openDialog(`<h2>문자 보내기</h2><div data-body><p class="meta">확인하는 중…</p></div>
    <label class="ld-ad"><input type="checkbox" data-ad checked> 광고 문자입니다 <small>맨 앞에 (광고), 끝에 무료 수신거부 번호가 붙고, 밤 9시 ~ 아침 8시에는 못 보냅니다</small></label>
    <p class="err" role="alert"></p>
    <div class="dlg-foot"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" data-go disabled>보내기</button></div>`);
  const body = dlg.querySelector('[data-body]'); const go = dlg.querySelector('[data-go]'); const err = dlg.querySelector('.err');
  const load = async () => {
    err.textContent = '';
    try {
      const v = await api('/leads/send', { method: 'POST', data: { ids, text, ad, preview: true } });
      const r = v.ready || {};
      const miss = [!r.keys && 'API 키', !r.service && '서비스 ID', !r.from && '발신번호', ad && !r.optout && '080 수신거부 번호'].filter(Boolean);
      body.innerHTML = `<ul class="ld-send-sum">
          <li>고른 곳 <b>${v.total}</b></li><li>보낼 곳 <b>${v.sendable}</b> <small>단문 ${v.sms} · 장문 ${v.lms}</small></li>
          ${v.noConsent ? `<li class="warn">수신 동의 없음 <b>${v.noConsent}</b> <small>빼고 보냅니다</small></li>` : ''}${v.noPhone ? `<li>휴대폰 없음 <b>${v.noPhone}</b></li>` : ''}
          <li>예상 비용 <b>${v.cost.toLocaleString()}원</b> <small>부가세 별도</small></li></ul>
        ${v.sample ? `<p class="meta">미리보기 — ${esc(v.sample.name)} (${v.bytes}바이트)</p><pre class="ld-preview">${esc(v.sample.text)}</pre>` : ''}
        ${miss.length ? `<p class="ld-warn">문자 설정에 ${miss.join(' · ')}이(가) 없어 아직 보낼 수 없습니다.</p>` : ''}
        ${v.night ? '<p class="ld-warn">지금은 밤 9시 ~ 아침 8시라 광고 문자를 보낼 수 없습니다.</p>' : ''}
        ${!v.sendable ? '<p class="ld-warn">보낼 수 있는 곳이 없습니다. 업체를 펼쳐 <b>☑ 동의함</b>을 먼저 체크해 주세요(전화로 동의를 받은 곳만).</p>' : ''}`;
      go.disabled = !v.sendable || miss.length > 0 || v.night;
      go.textContent = v.sendable ? `${v.sendable}곳에 보내기` : '보내기';
    } catch (e) { body.innerHTML = ''; err.textContent = e.message; }
  };
  dlg.querySelector('[data-ad]').onchange = (e) => { ad = e.target.checked; load(); };
  go.onclick = () => busy(go, err, async () => {
    const r = await api('/leads/send', { method: 'POST', data: { ids, text, ad } });
    toast(`${r.sent}곳에 보냈습니다.${r.failed.length ? ` 실패 ${r.failed.length}곳` : ''}${r.skipped.length ? ` · 뺌 ${r.skipped.length}곳` : ''}`);
    if (!r.failed.length) { picked.clear(); dlg.close(); } else err.textContent = r.failed.slice(0, 5).map((f) => `${f.name}: ${f.error}`).join(' / ');
    await renderLeads(deps);
  }, '보내는 중…');
  load();
}

// 고른 지역 · 필터에 맞춰 제목 숫자 · 어디까지 알아봤나 · 탭 숫자
function paintCounts() {
  const area = items.filter(inRegion);
  // 각 탭의 숫자 = 그 탭만 빼고 나머지 고른 것을 모두 맞춘 곳 중에서
  const mine = area.filter((i) => linkOk(i) && textOk(i));
  const has = mine.filter((i) => i.phone).length;
  { const base = area.filter((i) => phoneOk(i) && linkOk(i) && textOk(i)); const c = (v) => base.filter((i) => (v === '-' ? !i.call : i.call === v)).length;
    relabel($('#ld-f-call'), { '': `전체 ${base.length}`, '-': `통화 전 ${c('-')}`, yes: `동의받음 ${c('yes')}`, no: `거절 ${c('no')}`, miss: `부재중 ${c('miss')}` }); }
  relabel($('#ld-tabs'), { '': `전체 ${mine.length}`, has: `번호 있음 ${has}`, none: `번호 없음 ${mine.length - has}`, done: `연락함 ${mine.filter((i) => i.done).length}` });
  for (const [k] of LINKS) {
    const base = area.filter((i) => phoneOk(i) && linkOk(i, k) && textOk(i));
    const y = base.filter((i) => i[k]).length;
    relabel($(`#ld-f-${k}`), { '': `전체 ${base.length}`, y: `있음 ${y}`, n: `없음 ${base.length - y}` });
  }
  $('#ld-count').textContent = shown().length;
  const scs = scopes.filter(scopeIn);
  $('#ld-scopes').innerHTML = scs.length ? `<details class="card ld-scope"><summary>어디까지 알아봤나 <small>${scs.map((s) => `${esc(s.area)} ${count((i) => i.area === s.area && inRegion(i))}곳`).join(' · ')}</small></summary>
      ${scs.map((s) => { const m = items.filter((i) => i.area === s.area && inRegion(i)); return `<div class="ld-scope-item"><b>${esc(s.area)}</b> <span class="badge idle">${esc(s.source)}</span>
        <span class="badge done">휴대폰 있음 ${m.filter((i) => i.phone).length}</span> <span class="badge idle">없음 ${m.filter((i) => !i.phone).length}</span>
        <p>${esc(s.note)}</p><small>${fmtDate(s.checked_at)} 확인</small></div>`; }).join('')}</details>` : '';
}

function renderScan() {
  const box = $('#ld-scan'); if (!box || !lastScan) return;
  box.innerHTML = `<ul class="ld-scan">${lastScan.results.map((r) => `
    <li><b>${esc(r.name || r.url)}</b>
      <span class="badge ${r.added ? 'done' : 'idle'}">${r.found ? `번호 ${r.found}개 · 새로 ${r.added}` : '번호 없음'}</span>
      ${r.errors.length ? `<small>${esc(r.errors.join(' · '))}</small>` : ''}</li>`).join('')}</ul>`;
}

const shown = () => items.filter((it) => inRegion(it) && phoneOk(it) && linkOk(it) && textOk(it) && callOk(it));

function renderList() {
  const box = $('#ld-body'); if (!box) return;
  const list = shown();
  // 같은 지역끼리 붙어 나오게(지역 안에서는 원래 순서 그대로) — 줄마다 업체명 앞에 지역(서울시 노원구)
  list.sort((a, b) => regionOf(a).localeCompare(regionOf(b), 'ko'));
  const page = list.slice(0, limit);
  box.innerHTML = list.length ? `<ul class="ld-list card">${page.map((it) => `
      <li class="ld-item${it.done ? ' is-done' : ''}${open.has(it.id) ? ' is-open' : ''}" data-id="${it.id}">
        <div class="ld-row">
          ${it.phone ? `<label class="ld-chk"><input type="checkbox" data-pick${picked.has(it.id) ? ' checked' : ''} aria-label="${esc(it.name)} 고르기"></label>` : '<span class="ld-chk"></span>'}
          <button type="button" class="ld-name" data-toggle aria-expanded="${open.has(it.id)}"><span class="ld-area">${esc(regionOf(it))}</span><b>${esc(it.name)}</b>${it.consent > 0 ? '<span class="badge done">문자 동의</span>' : it.consent < 0 ? '<span class="badge ld-no">문자 거절</span>' : ''}${it.sent_n ? `<span class="badge idle">문자 ${it.sent_n}</span>` : ''}${it.done ? '<span class="badge done">연락함</span>' : ''}</button>
          ${it.phone ? `<span class="ld-pcell"><a class="ld-phone" href="tel:${esc(it.phone)}">${esc(it.phone)}</a><small class="ld-src s-${esc(it.source)}" title="이 번호를 찾은 곳">${esc(SRC_SHORT[it.source] || it.source || '?')}</small></span>` : '<span class="ld-phone none">번호 없음</span>'}
          ${it.phone || it.tel ? `<span class="ld-callcell"><select class="ld-call c-${it.call || 'none'}" data-call aria-label="${esc(it.name)} 통화 표시">${Object.entries(it.call === 'ok' ? { ...CALL, ok: '통화함' } : CALL).map(([v, l]) => `<option value="${v}"${(it.call || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>${it.call && it.call_at ? `<small class="ld-callat">${fmtDate(it.call_at).slice(5)}</small>` : ''}</span>` : '<span></span>'}
          <span class="ld-links">${it.homepage ? ext(it.homepage, '홈') : ''}${it.blog ? ext(it.blog, '블') : ''}${it.instagram ? ext(it.instagram, '인스타') : ''}</span>
          <button type="button" class="ld-more" data-toggle aria-label="자세히"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        </div>
        ${open.has(it.id) ? detail(it) : ''}
      </li>`).join('')}</ul>${list.length > limit ? `<button type="button" class="btn ld-moreall" id="ld-moreall">더 보기 <small>${limit.toLocaleString()} / ${list.length.toLocaleString()}곳</small></button>` : ''}`
    : `<section class="card item"><p class="meta">${items.length ? '이 보기에는 없습니다.' : '아직 모은 곳이 없습니다.'}</p></section>`;
  const more = $('#ld-moreall'); if (more) more.onclick = () => { limit += PAGE * 2; renderList(); };
  box.querySelectorAll('.ld-item').forEach((li) => {
    const it = items.find((x) => x.id === +li.dataset.id);
    li.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = async () => {
      if (open.has(it.id)) { open.delete(it.id); renderList(); return; }
      open.add(it.id);
      if (!full.has(it.id)) { try { const r = await deps.api(`/leads/${it.id}`); full.set(it.id, { ...(r.item || {}), calls: r.calls || [] }); } catch { full.set(it.id, {}); } }
      renderList();
    }; });
    const cs = li.querySelector('[data-call]');
    if (cs) cs.onchange = async () => {
      try { const r = await deps.api(`/leads/${it.id}?call=${encodeURIComponent(cs.value)}`, { method: 'PUT', data: {} }); Object.assign(it, r); const f = full.get(it.id); if (f && r.call) f.calls = [{ call: r.call, created_at: r.call_at }, ...(f.calls || [])]; if (f) Object.assign(f, r); toast(`${it.name} — ${CALL[it.call || ''] || '통화함'}`); renderList(); paintCounts(); paintPick(); }
      catch (e) { toast(e.message); cs.value = it.call || ''; }
    };
    const pk = li.querySelector('[data-pick]'); if (pk) pk.onchange = () => { if (pk.checked) picked.add(it.id); else picked.delete(it.id); paintPick(); };
    if (open.has(it.id)) bindDetail(li, it);
  });
}

// 번호를 어디서 알았는지(전화 첫마디용)
const SRC_SHORT = { map: '카카오맵', place: '네이버 지도', homepage: '홈페이지', blog: '블로그', instagram: '인스타그램', manual: '직접 넣음' };
// 전화 첫마디에 쓰는 말 — 업체 이름은 앞에서 이미 불렀으니 짧게("센터 블로그")
function srcLabel(it) {
  return { map: '카카오맵', place: '네이버 지도', homepage: '센터 홈페이지', blog: '센터 블로그', instagram: '센터 인스타그램' }[it.source] || '지도';
}

// 전화 멘트(사용자 지시 2026-11-28 "뭐라고 말하면 저쪽에서 필요하다고 말하게 될지") — 그 업체 상황(홈페이지 · 블로그 · 인스타 있음/없음)에 맞춰
//   원칙: 누구인지 · 번호 어디서 봤는지 먼저 밝히고, 팔기보다 묻기(원장님이 스스로 "그게 불편하다" 말하게), 거절하면 바로 끝.
function callScript(it) {
  const n = esc(it.name);
  const has = it.homepage ? 'home' : it.blog || it.instagram ? 'sns' : 'none';
  const ask = {
    home: ['지금 홈페이지는 원장님이 직접 글을 올리고 고치실 수 있으세요, 아니면 업체에 매번 부탁하셔야 하나요?', '혹시 휴대폰으로 열었을 때 글씨가 작거나 예약 · 전화 버튼이 잘 안 보이지는 않으세요?', '상담 오시는 분들이 홈페이지 보고 왔다고 하시는 경우가 있으세요?'],
    sns: [`지금은 ${it.blog ? '블로그' : '인스타그램'}로 센터를 알리고 계시죠? 처음 오시는 분들이 "센터 홈페이지 주소가 뭐예요?" 하고 묻는 경우는 없으세요?`, '네이버에서 센터 이름을 검색하면 블로그 글이 섞여 나와서, 상담 과정 · 비용 · 오시는 길을 한눈에 보기 어렵다는 말씀은 없으셨어요?', '바우처나 기관 연계할 때 "홈페이지 있으세요?" 질문 받아 보신 적 있으세요?'],
    none: ['처음 상담 문의하시는 분들은 주로 어떻게 알고 연락 오세요?', '네이버에서 센터 이름을 검색했을 때 상담 분야 · 선생님 소개 · 비용 · 오시는 길이 한 번에 나오면 좋겠다고 생각해 보신 적 있으세요?', '바우처나 기관 연계할 때 홈페이지 주소를 물어보는 경우는 없으셨어요?'],
  }[has];
  const offer = {
    home: '저희는 상담센터 홈페이지를 주로 만드는데요, 원장님이 휴대폰으로 공지 · 프로그램을 바로 고치실 수 있고, 예약 · 문의 버튼이 폰에서 크게 보이는 홈페이지를 무료로 만들어 드립니다.',
    sns: `${it.blog ? '블로그' : '인스타그램'}는 그대로 두시고, 센터 소개 · 선생님 · 프로그램 · 비용 · 오시는 길을 한 장에 정리한 홈페이지를 무료로 만들어 드립니다.`,
    none: '저희는 상담센터 홈페이지를 주로 만드는데요, 센터 소개 · 선생님 · 프로그램 · 비용 · 오시는 길 · 예약 문의까지 한 곳에 정리해서, 원장님이 휴대폰으로 직접 고치실 수 있는 홈페이지를 무료로 만들어 드립니다.',
  }[has];
  return `<details class="ld-script" open><summary><b>전화 멘트</b> <small>이 업체 상황: ${has === 'home' ? '홈페이지 있음' : has === 'sns' ? (it.blog ? '블로그' : '인스타그램') + '만 있음' : '홈페이지 · 블로그 없음'}</small></summary>
    <ol>
      <li><span class="ld-step">① 인사 · 출처</span>"안녕하세요, ${n} 맞으시죠? 저는 상담센터 홈페이지를 만드는 <b>자두랩스</b> 박민진입니다. <b>${esc(srcLabel(it))}</b>에 나온 번호를 보고 연락드렸어요. 1분만 여쭤봐도 될까요?"<small>→ "바빠요 · 괜찮아요" 하면: "네, 알겠습니다. 바쁘신데 죄송합니다." 하고 바로 끊고 <b>거절</b> 표시.</small></li>
      <li><span class="ld-step">② 묻기 (팔지 말고 듣기)</span>${ask.map((q) => `"${esc(q)}"`).join('<br>')}<small>→ 원장님이 "그게 좀 불편해요 · 없어요 · 생각은 있었어요" 라고 <b>스스로 말하게</b> 하는 게 목표. 말이 나오면 "아 그러시군요, 많이들 그러세요" 하고 맞장구.</small></li>
      <li><span class="ld-step">③ 짧게 제안</span>"${esc(offer)}"</li>
      <li><span class="ld-step">④ 문자 동의 받기</span>"제가 비슷한 상담센터 홈페이지 예시를 <b>문자로 하나 보내 드려도 될까요?</b> 보시고 아니다 싶으시면 답 안 주셔도 괜찮습니다."<small>→ "네" 하면 <b>☑ 동의함</b> 체크하고 그다음에 문자. "아니요" 하면 <b>☑ 거절함</b> 체크 · 다시 연락 안 함.</small></li>
      <li><span class="ld-step">⑤ 마무리</span>"시간 내 주셔서 감사합니다. 궁금하신 거 있으시면 이 번호로 편하게 연락 주세요."</li>
    </ol></details>`;
}

// 동의받음 → 증거 남기기(사용자 지시 2026-11-28 "이거 중요하네"): 말로 받은 동의는 효력은 있어도 증명이 어렵다
const ymd = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const confirmText = (it) => `안녕하세요, 방금 통화드린 홈페이지 제작 자두랩스 박민진입니다. ${ymd(it.consent_at || Date.now())} 통화로 ${it.name} 홈페이지 예시 · 안내 문자 받기에 동의해 주셨습니다. 맞으시면 "네" 라고 답장 부탁드립니다. 원치 않으시면 언제든 "거부" 라고 답장 주시면 바로 보내지 않겠습니다.`;
function proofBox(it) {
  const until = it.consent_at ? new Date(it.consent_at + 2 * 365 * 86400000) : null;
  return `<div class="ld-proof"><b>✅ 동의받음 — 꼭 증거를 남기세요</b> <small>말로 받은 동의도 효력은 있지만, 신고가 들어오면 <b>보낸 사람이 동의를 증명</b>해야 합니다.</small>
    <ol>
      <li><b>확인 문자 보내고 답장 받아 두기</b> — 통화 직후 아래 [동의 확인 문자] 로 보내고, 상대가 "네" 라고 답한 문자를 지우지 말고 보관(광고 내용 없이 확인만).</li>
      <li><b>14일 안에 동의 사실 알리기</b> — 법은 동의를 받으면 14일 안에 "누가 · 언제 동의를 받았는지" 알려 주라고 합니다. 확인 문자에 날짜가 들어 있어 이걸로 같이 됩니다.${it.consent_at ? ` <span class="ld-due">기한: ${ymd(it.consent_at + 14 * 86400000)}</span>` : ''}</li>
      <li><b>2년마다 다시 확인</b> — 동의를 받은 날부터 2년마다 계속 받을지 다시 물어야 합니다.${until ? ` <span class="ld-due">다음 확인: ${until.getFullYear()}년 ${ymd(until.getTime())}</span>` : ''}</li>
    </ol>
    <div class="ld-act"><a class="btn sm primary" data-confirm href="#">동의 확인 문자 (내 폰)</a><small>폰에서 누르면 문자 앱이 열리고, PC 에서 누르면 내용이 복사됩니다.</small></div></div>`;
}

function detail(it) {
  it = { ...(full.get(it.id) || {}), ...it };   // 펼칠 때 받은 긴 칸 — 목록 값(동의 · 통화 등 방금 바꾼 것)이 먼저
  const more = it.links ? it.links.split(' ').filter(Boolean) : [];
  return `<div class="ld-detail">
      <dl class="ld-dl">
        ${it.category ? `<div><dt>분류</dt><dd>${esc(it.category)}</dd></div>` : ''}
        ${it.address ? `<div><dt>주소</dt><dd>${esc(it.address)}</dd></div>` : ''}
        ${it.tel ? `<div><dt>대표 전화</dt><dd>${esc(it.tel)}</dd></div>` : ''}
        ${it.phone ? `<div><dt>번호 나온 곳</dt><dd>${it.source_url ? ext(it.source_url, SRC[it.source] || it.source) : esc(SRC[it.source] || it.source)}</dd></div>` : ''}
        <div><dt>링크</dt><dd class="ld-urls">${it.place_url ? ext(it.place_url, '지도') : ''}${it.homepage ? ext(it.homepage, '홈페이지') : ''}${it.blog ? ext(it.blog, '블로그') : ''}${it.instagram ? ext(it.instagram, '인스타그램') : ''}${more.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { /* 그대로 */ } return ext(u, h); }).join('')}</dd></div>
        ${it.checked ? `<div><dt>확인한 것</dt><dd>${esc(it.checked)}</dd></div>` : ''}
        <div><dt>모은 때</dt><dd>${fmtDate(it.created_at)}${it.area ? ` · ${esc(it.area)}` : ''}</dd></div>
      </dl>
      ${it.calls?.length ? `<div class="ld-calllog"><b>통화 기록</b><ul>${it.calls.map((c) => `<li><span class="ld-call-dot c-${esc(c.call)}"></span>${esc(CALL[c.call] || '통화함')} <small>${fmtDate(c.created_at)}</small></li>`).join('')}</ul></div>` : ''}
      ${it.phone || it.tel ? callScript(it) : ''}
      ${it.phone && it.consent > 0 ? proofBox(it) : ''}
      ${it.phone ? `<div class="ld-consent${it.consent > 0 ? ' on' : it.consent < 0 ? ' no' : ''}"><b>문자 받기</b>
        <label class="ld-ck"><input type="checkbox" data-consent="1"${it.consent > 0 ? ' checked' : ''}> 동의함${it.consent > 0 ? ` <small>${fmtDate(it.consent_at)}</small>` : ''}</label>
        <label class="ld-ck"><input type="checkbox" data-consent="-1"${it.consent < 0 ? ' checked' : ''}> 거절함${it.consent < 0 ? ` <small>${fmtDate(it.consent_at)}</small>` : ''}</label>
        ${it.sent_at ? `<small class="ld-sent">마지막 문자 ${fmtDate(it.sent_at)} · 모두 ${it.sent_n}번</small>` : ''}</div>` : ''}
      <input class="input ld-memo" type="text" value="${esc(it.memo)}" placeholder="메모" maxlength="500" aria-label="메모">
      <div class="ld-act">
        ${it.phone ? '<a class="btn sm primary" data-myphone href="#">내 폰으로 문자</a><button type="button" class="btn sm" data-copy>번호 복사</button>' : ''}
        <button type="button" class="btn sm${it.done ? '' : ' primary'}" data-done>${it.done ? '연락 전으로' : '연락함'}</button>
        <button type="button" class="btn sm danger" data-del>삭제</button>
      </div>
    </div>`;
}

function bindDetail(li, it) {
  const { api } = deps;
  const save = (data) => api(`/leads/${it.id}`, { method: 'PATCH', data: { done: !!it.done, memo: it.memo, ...data } });
  // 문자 받기 동의 / 거절: 체크하면 그때 날짜 · 시간이 찍힘, 둘 중 하나만(다시 누르면 지움)
  li.querySelectorAll('[data-consent]').forEach((ck) => { ck.onchange = async () => {
    const v = ck.checked ? +ck.dataset.consent : 0;
    try {
      await save({ consent: v, consent_note: v ? '전화 통화' : '' });
      it.consent = v; it.consent_at = v ? Date.now() : 0;
      toast(`${it.name} — ${v > 0 ? '문자 동의' : v < 0 ? '문자 거절' : '동의 표시 지움'}`);
      renderList(); paintPick();
    } catch (e) { toast(e.message); ck.checked = !ck.checked; }
  }; });
  const cf = li.querySelector('[data-confirm]');
  if (cf) cf.onclick = (e) => {
    const body = confirmText(it);
    cf.href = `sms:${it.phone.replace(/\D/g, '')}${/iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;
    navigator.clipboard?.writeText(body).catch(() => {});
    if (!matchMedia('(pointer: coarse)').matches) { e.preventDefault(); toast('동의 확인 문자를 복사했습니다 — 폰 문자에 붙여 넣어 보내세요.'); }
  };
  // 내 폰으로 문자: 폰이면 문자 앱(번호 · 내용 채움), PC 면 내용 복사 — {업체명} 은 이 업체 이름으로
  const mp = li.querySelector('[data-myphone]');
  if (mp) {
    const num = it.phone.replace(/\D/g, '');
    mp.onclick = (e) => {
      const body = (($('#ld-sms')?.value || sms) || '').replace(/\{업체명\}/g, it.name).trim();   // 누를 때의 내용으로(고친 뒤에도 맞게)
      mp.href = `sms:${num}${/iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;
      if (!body) { e.preventDefault(); $('#ld-sms').closest('details').open = true; toast('위 "보낼 문자" 에 내용을 먼저 써 주세요.'); return; }
      const touch = matchMedia('(pointer: coarse)').matches;
      navigator.clipboard?.writeText(body).catch(() => {});
      if (!touch) { e.preventDefault(); toast(`${it.name} 에 보낼 문자를 복사했습니다 — 홍보 내용이면 보내지 마세요(동의 · (광고) · 080 필요).`); }
    };
  }
  const copy = li.querySelector('[data-copy]');
  if (copy) copy.onclick = () => navigator.clipboard.writeText(it.phone).then(() => toast('번호를 복사했습니다.'));
  li.querySelector('[data-done]').onclick = (e) => busy(e.currentTarget, null, async () => { await save({ done: !it.done }); await renderLeads(deps); });
  li.querySelector('.ld-memo').onchange = async (e) => { try { await save({ memo: e.target.value }); it.memo = e.target.value; toast('메모를 저장했습니다.'); } catch (err) { toast(err.message); } };
  const del = li.querySelector('[data-del]');
  del.onclick = (e) => {
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 삭제'; return; }
    busy(e.currentTarget, null, async () => { await api(`/leads/${it.id}`, { method: 'DELETE' }); open.delete(it.id); await renderLeads(deps); });
  };
}

async function downloadCsv() {
  const ids = new Set(shown().map((i) => i.id));
  if (!ids.size) return toast('받을 것이 없습니다.');
  const list = (await deps.api('/leads?full=1')).items.filter((i) => ids.has(i.id));
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['이름', '분류', '휴대폰', '대표 전화', '주소', '홈페이지', '블로그', '인스타그램', '지도', '번호 나온 곳', '확인한 것', '메모', '연락함', '지역', '영역'],
    ...list.map((it) => [it.name, it.category, it.phone, it.tel, it.address, it.homepage, it.blog, it.instagram, it.place_url, it.source_url, it.checked, it.memo, it.done ? '예' : '', regionOf(it), it.area])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `상담연락${gu ? `-${gu}` : sido ? `-${sido}` : ''}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
