// xms 관리자 화면 (/xms/) — 해시 주소로 화면을 바꾼다: #/members, #/boards/3 …
import { $, $$, esc, makeApi, fmtDate, fmtPhone, toast, pillTabs, slideTabs, formData, openDialog, busy, confirmInline } from './common.js';
import { mountEditor, mountAttach } from './editor.js';
import { sortable, treeFromDepths } from './drag.js';
import { cropImage } from './crop.js';

const api0 = makeApi('/xms-api/admin');
// index.html 이 미리 요청해 둔 자료(window.__xmsPre)가 있으면 그것을 한 번 쓴다 — 기다리는 왕복을 줄여 빨리 뜨게
const api = (path, opt) => {
  const pre = !opt && window.__xmsPre && window.__xmsPre[path];
  if (!pre) return api0(path, opt);
  delete window.__xmsPre[path];
  return pre.then(async (res) => {
    let out = null;
    try { out = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) { const err = new Error(out?.error || `요청이 실패했습니다 (${res.status})`); err.status = res.status; throw err; }
    return out;
  });
};
const pub = makeApi('/xms-api');
const main = $('#main');
let INFO = null; // { site, me, levelNames }
let dirty = false;

const LV = (n) => INFO.levelNames[n] || `${n}등급`;
const ACTIONS = {
  MEMBER_LEVEL: '등급 변경', MEMBER_LOCK: '로그인 막기', MEMBER_UNLOCK: '잠금 풀기', TEMP_PASSWORD: '비밀번호 재발급', MEMBER_WITHDRAW: '회원 탈퇴 처리',
  MEMBER_EXPORT: '엑셀 내려받기', LEVEL_NAMES: '등급 이름 변경', SIGNUP_FIELDS: '가입 항목 변경', SIGNUP_FIELD_ADD: '가입 항목 추가', SIGNUP_FIELD_DELETE: '가입 항목 삭제',
  DOC_PUBLISH: '약관·방침 발행', BOARD_CREATE: '게시판 만들기', BOARD_UPDATE: '게시판 설정 변경', BOARD_DELETE: '게시판 삭제', BOARD_RESTORE: '게시판 되살리기',
  MENU_CREATE: '메뉴 추가', MENU_UPDATE: '메뉴 변경', MENU_DELETE: '메뉴 삭제', MENU_SHOW: '메뉴 보이기', MENU_HIDE: '메뉴 숨기기',
  REQUEST_CREATE: '수정 요청', PASSWORD_CHANGE: '비밀번호 변경',
  FAVICON_SET: '파비콘 바꾸기', FAVICON_REMOVE: '파비콘 내리기', SEO_UPDATE: '검색엔진 설정', ROBOTS_UPDATE: 'robots.txt 변경',
  SHARE_UPDATE: '미리보기 설명 변경', SHARE_IMAGE_SET: '미리보기 그림 바꾸기', SHARE_IMAGE_REMOVE: '미리보기 그림 내리기',
  POPUP_CREATE: '팝업 만들기', POPUP_UPDATE: '팝업 수정', POPUP_DELETE: '팝업 삭제',
  TOP_BUTTON: '맨 위로 버튼', COURSE_CREATE: '강의 만들기', COURSE_UPDATE: '강의 수정', COURSE_DELETE: '강의 삭제',
};

// ───────── 시작 · 로그인 ─────────
async function start() {
  try { INFO = await api('/me'); } catch (e) {
    if (e.status === 401 || e.status === 403) return showLogin(e.status === 403 ? '지금 로그인한 계정은 관리자(레벨1)가 아니라 관리 화면에 들어올 수 없습니다. 관리자 계정으로 로그인해 주세요.' : '');
    return showLogin(e.message);
  }
  showApp();
}
function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login .err').textContent = msg;
  $('#login-form [name=login_id]').focus();
}
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy(form.querySelector('button'), form.querySelector('.err'), async () => {
    const r = await pub('/login', { method: 'POST', data: formData(form) });
    // 서비스와 같은 로그인(SSO)이라 홈페이지 로그인은 그대로 두고, 관리 화면만 막는다
    if (!r.admin) throw new Error('관리 화면은 레벨1(관리자) 계정만 들어올 수 있습니다. 홈페이지에는 이 계정으로 로그인돼 있습니다.');
    form.reset();
    await start();
  });
});
$('#logout').addEventListener('click', async () => {
  try { await pub('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  location.href = '/';
});

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  const s = INFO.site;
  document.title = `${s.name} 관리`;
  // xim 의 [xms] 버튼으로 들어오면 개인 계정 없이 '운영자' 로 들어온 것 (비밀번호가 없다)
  const whoName = INFO.me.staff ? '운영자' : INFO.me.name;
  $('#who').textContent = INFO.me.staff ? whoName : `${whoName} 님`;
  $('#who-av').textContent = [...(whoName || '관')][0];
  renderSide();
  route();
}

// ───────── 왼쪽 메뉴 ─────────
const SIDE_ICON = {
  storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>',
  members: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-5 5.5-5s4.9 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4.2 4.3 1.9 4.9 4.8"/></svg>',
  withdrawn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="3.2"/><path d="M4 19c.6-3 3-5 6-5 1.4 0 2.6.4 3.6 1.1M16 16l4 4M20 16l-4 4"/></svg>',
  levels: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-6"/></svg>',
  fields: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  terms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  privacy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-3.5"/></svg>',
  boards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/></svg>',
  menus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  popups: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="7" y="9" width="10" height="6" rx="1"/></svg>',
  favicon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 14l2-5 2 5M9.7 12.5h2.6"/></svg>',
  seo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4c-4.4 0-8 2.8-8 6.3 0 2.2 1.5 4.2 3.7 5.3L7 20l4.3-3.1c.2 0 .5.1.7.1 4.4 0 8-2.8 8-6.3S16.4 4 12 4z"/></svg>',
  requests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  account: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"/><path d="M7 16v-4M12 16V7M17 16v-7"/></svg>',
  audit: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  extras: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5"/></svg>',
  courses: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2.5"/><path d="M10 9v5l4.5-2.5z"/><path d="M8 21h8"/></svg>',
  apply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13l2 2 4-4"/></svg>',
  rounds: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
};
// 왼쪽 메뉴: 묶음 이름 아래 같은 모양의 한 단계 목록 (만들기 · 추가는 각 화면 오른쪽 위 버튼)
const SIDE = [
  [null, [['#/storage', '저장 공간', 'storage'], ['#/stats', '방문 통계', 'stats']]],
  ['회원', [['#/members', '가입회원', 'members'], ['#/members/withdrawn', '탈퇴회원', 'withdrawn'], ['#/levels', '등급 이름', 'levels'],
    ['#/fields', '가입 항목', 'fields'], ['#/terms', '이용약관', 'terms'], ['#/privacy', '개인정보 처리방침', 'privacy']]],
  ['사이트', [['#/boards', '게시판', 'boards'], ['#/menus', '메뉴', 'menus'], ['#/popups', '팝업', 'popups'], ['#/extras', '부가 기능', 'extras'],
    ['#/favicon', '파비콘', 'favicon'], ['#/seo', '검색엔진', 'seo'], ['#/share', '카카오톡 미리보기', 'share'], ['#/requests', '수정 요청', 'requests']]],
  ['내 계정', [['#/account', '비밀번호 변경', 'account'], ['#/audit', '관리 로그', 'audit']]],
];
// 강의 기능을 켠 사이트만 '강의' 묶음이 생긴다 (회원 다음)
// 신청서 기능을 켠 사이트만 '신청서' 묶음 (맨 위 — 신청 기간에 가장 많이 본다)
const sideGroups = () => [
  ...(INFO.features?.apply ? [['신청서', [['#/apply', '신청서 보기', 'apply'], ['#/apply/rounds', '신청 기간', 'rounds']]]] : []),
  SIDE[0], SIDE[1], ...(INFO.features?.courses ? [['강의', [['#/courses', '강의 관리', 'courses']]]] : []), ...SIDE.slice(2)];
// 왼쪽 위 사이트 표시: 파비콘을 올렸으면 그 그림, 없으면 이름 두 글자
let favVer = Date.now();
function renderSide() {
  const s = INFO.site;
  const pct = s.quota_mb ? Math.round((s.used_mb / s.quota_mb) * 100) : 0;
  $('#side').innerHTML = `<a class="brand" href="/" target="_blank" rel="noopener"><i>${esc(s.slug.slice(0, 2).toUpperCase())}<img src="/xms/file/favicon-192.png?v=${favVer}" alt="" onload="this.parentElement.classList.add('has-fav')" onerror="this.remove()"></i><span><b>${esc(s.name)}</b><small>${esc(s.domain || s.slug)}</small></span></a>
    ${sideGroups().map(([group, items]) => `${group ? `<h4>${group}</h4>` : ''}${items.map(([href, label, icon]) => `<a href="${href}">${SIDE_ICON[icon] || ''}<span class="lbl">${label}</span>${icon === 'storage' ? `<span class="meter${pct >= 90 ? ' full' : ''}">${pct}%</span>` : ''}</a>`).join('')}`).join('')}
    <p class="foot">${esc(s.name)} 관리자 화면</p>`;
}
function markSide() {
  const h = (location.hash || '#/members').split('?')[0];
  const cands = $$('#side a[href^="#/"]');
  const best = cands.filter((a) => h === a.getAttribute('href') || h.startsWith(`${a.getAttribute('href')}/`))
    .sort((a, b) => b.getAttribute('href').length - a.getAttribute('href').length)[0];
  cands.forEach((a) => a.classList.toggle('on', a === best));
  // 고른 메뉴의 흰 배경이 다음 메뉴로 미끄러진다 (xim 왼쪽 메뉴와 같은 모양)
  requestAnimationFrame(() => slideTabs($('#side'), 'a.on'));
}
const side = $('#side');
$('#menu-btn').addEventListener('click', () => side.classList.toggle('open'));
$('#side-dim').addEventListener('click', () => side.classList.remove('open'));
side.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) side.classList.remove('open'); });

// ───────── 화면 바꾸기 ─────────
addEventListener('hashchange', () => route());
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
// 왼쪽 메뉴 '수정 요청' 옆 숫자 = 운영자가 새로 답한 요청 수 (화면을 옮길 때마다 다시 본다)
async function reqBadge() {
  try {
    const { n } = await api('/requests/unread');
    const a = $('#side a[href="#/requests"]');
    if (!a) return;
    let i = a.querySelector('.new-num');
    if (!n) { i?.remove(); return; }
    if (!i) { i = document.createElement('i'); i.className = 'new-num'; a.append(i); }
    i.textContent = n;
  } catch { /* 숫자는 못 보여도 화면은 그대로 */ }
}

async function route() {
  if (!INFO) return;
  dirty = false;
  markSide();
  setTimeout(reqBadge, 300);
  const h = (location.hash || '#/members').slice(1);
  const parts = h.split('?')[0].split('/').filter(Boolean);
  const qs = new URLSearchParams(h.split('?')[1] || '');
  main.innerHTML = '';
  scrollTo(0, 0);
  try {
    if (parts[0] === 'members' && parts[1] === 'withdrawn') return await withdrawnPage(qs);
    if (parts[0] === 'members') return await membersPage(qs);
    if (parts[0] === 'levels') return await levelsPage();
    if (parts[0] === 'fields' && parts[1] === 'new') return fieldNewPage();
    if (parts[0] === 'fields') return await fieldsPage();
    if (parts[0] === 'terms' || parts[0] === 'privacy') return await docPage(parts[0]);
    if (parts[0] === 'boards' && parts[1] === 'new') return await boardPage(null);
    if (parts[0] === 'boards' && parts[1]) return await boardPage(Number(parts[1]));
    if (parts[0] === 'boards') return await boardsPage();
    if (parts[0] === 'menus' && parts[1] === 'new') return await menuPage(null);
    if (parts[0] === 'menus' && parts[1]) return await menuPage(Number(parts[1]));
    if (parts[0] === 'menus') return await menusPage();
    if (parts[0] === 'requests' && parts[1] === 'new') return requestWrite();
    if (parts[0] === 'requests' && parts[1]) return await requestView(Number(parts[1]));
    if (parts[0] === 'requests') return await requestsPage(qs);
    if (parts[0] === 'popups' && parts[1] === 'new') return await popupPage(null);
    if (parts[0] === 'popups' && parts[1]) return await popupPage(Number(parts[1]));
    if (parts[0] === 'popups') return await popupsPage(qs);
    if (parts[0] === 'courses' && parts[1] === 'new') return await coursePage(null);
    if (parts[0] === 'courses' && parts[1]) return await coursePage(Number(parts[1]));
    if (parts[0] === 'courses') return await coursesPage();
    if (parts[0] === 'apply' && parts[1] === 'rounds' && parts[2]) return await roundPage(parts[2] === 'new' ? null : Number(parts[2]));
    if (parts[0] === 'apply' && parts[1] === 'rounds') return await roundsPage();
    if (parts[0] === 'apply' && parts[1]) return await applyView(Number(parts[1]));
    if (parts[0] === 'apply') return await applyList(qs);
    if (parts[0] === 'extras') return await extrasPage();
    if (parts[0] === 'favicon') return await faviconPage();
    if (parts[0] === 'seo') return await seoPage(qs);
    if (parts[0] === 'share') return await sharePage();
    if (parts[0] === 'storage') return await storagePage();
    if (parts[0] === 'stats') return await statsPage();
    if (parts[0] === 'account') return accountPage();
    if (parts[0] === 'audit') return await auditPage(qs);
    location.hash = '#/members';
  } catch (e) {
    if (e.status === 401 || e.status === 403) return showLogin('다시 로그인해 주세요.');
    main.innerHTML = `<div class="panel empty"><b>불러오지 못했습니다</b>${esc(e.message)}</div>`;
  }
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function head(eyebrow, title, lede = '', action = '') {
  return `<header class="ph${action ? ' has-act' : ''}"><div><small>${eyebrow}</small><h1>${title}</h1>${lede ? `<p>${lede}</p>` : ''}</div>${action ? `<div class="ph-act">${action}</div>` : ''}</header>`;
}
const empty = (t, hint, action = '') => `<div class="empty"><b>${t}</b><span>${hint}</span>${action}</div>`;
function pager(page, size, total, href) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return '';
  const start = Math.floor((page - 1) / 5) * 5 + 1;
  const nums = Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i);
  return `<nav class="pager">${start > 1 ? `<a href="${href(start - 1)}">‹</a>` : ''}${nums.map((n) => (n === page ? `<b>${n}</b>` : `<a href="${href(n)}">${n}</a>`)).join('')}${start + 5 <= pages ? `<a href="${href(start + 5)}">›</a>` : ''}</nav>`;
}
function saveBar(text, cancelHref) {
  return `<div class="savebar"><span>${text}</span>${cancelHref ? `<a href="${cancelHref}">취소</a>` : ''}<button class="btn primary" type="submit">저장</button></div>`;
}
function ctrlS(form) {
  const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); form.requestSubmit(); } };
  addEventListener('keydown', h);
  addEventListener('hashchange', () => removeEventListener('keydown', h), { once: true });
  form.addEventListener('input', () => { dirty = true; });
}

// ───────── 가입회원 ─────────
let tempNotice = '';
async function membersPage(qs) {
  const d = await api(`/members?${qs}`);
  const extraFields = d.fields.filter((f) => !['name', 'email', 'mobile', 'nickname', 'phone'].includes(f.key));
  const filtered = qs.get('q') || qs.get('level') || qs.get('missing');
  const lede = filtered ? `조건에 맞는 회원 ${d.total}명입니다.` : `${d.all}명이 가입해 있습니다. 등급을 바꾸거나 로그인을 막을 수 있습니다.`;
  const exportQs = new URLSearchParams(qs); exportQs.delete('page');
  const reqFields = d.fields.filter((f) => f.mode === 'REQUIRED');
  const lvOpts = (sel) => Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === sel ? ' selected' : ''}>${esc(LV(n))}</option>`).join('');
  main.innerHTML = `${head('회원', '가입회원', lede)}
    ${tempNotice ? `<div class="notice-bar" role="status"><span>${tempNotice}</span><button type="button" aria-label="닫기" data-x>×</button></div>` : ''}
    <form class="search" id="msearch">
      <input class="input" name="q" value="${esc(qs.get('q') || '')}" placeholder="이름, 아이디, 이메일, 휴대전화${extraFields.map((f) => `, ${esc(f.label)}`).join('')}로 찾기">
      <select class="input" name="missing"><option value="">필수 항목 채움 여부</option>${reqFields.map((f) => `<option value="${f.key}"${qs.get('missing') === f.key ? ' selected' : ''}>${esc(f.label)} 비어 있음</option>`).join('')}</select>
      <select class="input" name="level"><option value="">모든 등급</option>${lvOpts(Number(qs.get('level')))}</select>
      <button class="btn primary" type="submit">찾기</button>
      ${filtered ? '<a class="btn" href="#/members">조건 지우기</a>' : ''}
      <a class="btn green right" href="/xms-api/admin/members/export?${exportQs}">엑셀로 내려받기</a>
    </form>
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>이름</th><th>아이디</th><th>연락처</th>${extraFields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>등급</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>
      ${d.rows.map((m) => `<tr data-id="${m.id}">
        <td><button type="button" class="who-btn" data-detail>${esc(m.name)}</button>${m.nickname ? ` <span class="num">(${esc(m.nickname)})</span>` : ''}${m.status === 'LOCKED' ? ' <span class="tag red">잠김</span>' : ''}</td>
        <td data-l="아이디">${esc(m.login_id)}</td>
        <td data-l="연락처">${m.email || m.mobile ? `${esc(m.email)}${m.mobile ? `<small>${esc(fmtPhone(m.mobile))}</small>` : ''}` : '<span class="dash">—</span>'}</td>
        ${extraFields.map((f) => { const v = m.extra[f.key]; const t = Array.isArray(v) ? v.join(', ') : v; return `<td data-l="${esc(f.label)}">${t ? esc(t) : '<span class="dash">—</span>'}</td>`; }).join('')}
        <td data-l="등급"><div class="lv"><select class="input" aria-label="등급">${lvOpts(m.level)}</select><button class="btn sm" type="button" data-level>바꾸기</button></div></td>
        <td data-l="최근 로그인">${m.last_login_at ? fmtDate(m.last_login_at) : '<span class="dash">—</span>'}</td>
        <td><div class="mng"><button class="btn sm" type="button" data-lock>${m.status === 'LOCKED' ? '잠금 풀기' : '로그인 막기'}</button>
          <button class="btn sm" type="button" data-temp>비밀번호 재발급</button><button class="btn sm danger" type="button" data-out>탈퇴</button></div></td>
      </tr>`).join('')}</tbody></table>`
    : filtered ? empty('조건에 맞는 회원이 없습니다', '다른 이름이나 아이디로 찾아보세요.', '<a class="btn" href="#/members">조건 지우고 전체 보기</a>')
      : empty('아직 가입한 회원이 없습니다', '홈페이지에서 누군가 가입하면 여기에 나타납니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => { const p = new URLSearchParams(qs); p.set('page', n); return `#/members?${p}`; })}`;

  $('[data-x]')?.addEventListener('click', (e) => { tempNotice = ''; e.target.closest('.notice-bar').remove(); });
  $('#msearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v));
    go(`#/members?${p}`);
  });
  const reload = () => route();
  $$('tr[data-id]').forEach((tr) => {
    const m = d.rows.find((x) => x.id === +tr.dataset.id);
    const who = `${m.name}(${m.login_id})`;
    tr.querySelector('[data-detail]').onclick = () => memberDetail(m, d.fields);
    tr.querySelector('[data-level]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/members/${m.id}/level`, { method: 'POST', data: { level: Number(tr.querySelector('select').value) } });
      toast(`${who} 님 등급을 바꿨습니다.`); reload();
    });
    tr.querySelector('[data-lock]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/members/${m.id}/lock`, { method: 'POST', data: { locked: m.status !== 'LOCKED' } });
      toast(m.status === 'LOCKED' ? '잠금을 풀었습니다.' : '로그인을 막았습니다.'); reload();
    });
    tr.querySelector('[data-temp]').onclick = (e) => confirmInline(e.currentTarget, `<b>${esc(who)}</b> 님의 비밀번호가 즉시 바뀝니다. 지금 쓰는 비밀번호로는 로그인할 수 없게 되니, 바로 전달할 수 있을 때 발급하세요.`, '새 비밀번호 발급', async () => {
      const r = await api(`/members/${m.id}/temp-password`, { method: 'POST', data: {} });
      tempNotice = `<b>${esc(r.who)}</b> 님의 새 비밀번호 <code>${esc(r.password)}</code> — 이전 비밀번호는 이제 쓸 수 없습니다.`;
      reload();
    });
    tr.querySelector('[data-out]').onclick = (e) => confirmInline(e.currentTarget, `<b>${esc(who)}</b> 님이 가입회원 목록에서 사라지고 로그인할 수 없게 되며, 이 화면에서는 되돌릴 수 없습니다. 쓴 글과 댓글은 그대로 남습니다.`, '탈퇴 처리', async () => {
      await api(`/members/${m.id}/withdraw`, { method: 'POST', data: {} });
      toast('탈퇴 처리했습니다.'); reload();
    });
  });
}
function memberDetail(m, fields) {
  const val = (f) => { const v = ['name', 'nickname', 'email', 'mobile', 'phone'].includes(f.key) ? m[f.key] : m.extra[f.key]; return Array.isArray(v) ? v.join(', ') : (f.key === 'mobile' || f.key === 'phone' ? fmtPhone(v) : v); };
  const av = /^\/xms\/upload\/[0-9a-f]{32}$/.test(m.extra?.avatar || '') ? m.extra.avatar : '';
  openDialog(`<h2 class="mem-h">${av ? `<img class="mem-av" src="${av}" alt="">` : ''}${esc(m.name)}</h2><dl class="kv"><dt>아이디</dt><dd>${esc(m.login_id)}</dd><dt>등급</dt><dd>${esc(LV(m.level))}</dd>
    ${fields.map((f) => `<dt>${esc(f.label)}${f.mode === 'EXCLUDED' ? ' (안 받음)' : ''}</dt><dd>${esc(val(f)) || '<span class="dash">—</span>'}</dd>`).join('')}
    <dt>가입일</dt><dd>${fmtDate(m.created_at, true)}</dd><dt>최근 로그인</dt><dd>${m.last_login_at ? fmtDate(m.last_login_at, true) : '—'}</dd></dl>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
}

// ───────── 탈퇴회원 ─────────
async function withdrawnPage(qs) {
  const d = await api(`/members/withdrawn?${qs}`);
  const exportQs = new URLSearchParams(qs); exportQs.delete('page'); exportQs.set('withdrawn', '1');
  main.innerHTML = `${head('회원', '탈퇴회원', qs.get('q') ? `조건에 맞는 탈퇴회원 ${d.total}명입니다.` : `탈퇴한 회원 ${d.all}명의 기록입니다.`)}
    <form class="search" id="wsearch"><input class="input" name="q" value="${esc(qs.get('q') || '')}" placeholder="이름, 아이디로 찾기"><button class="btn primary" type="submit">찾기</button>
      ${qs.get('q') ? '<a class="btn" href="#/members/withdrawn">조건 지우기</a>' : ''}<a class="btn green right" href="/xms-api/admin/members/export?${exportQs}">엑셀로 내려받기</a></form>
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>이름</th><th>아이디</th><th>탈퇴일</th><th>탈퇴사유</th><th></th></tr></thead><tbody>
      ${d.rows.map((m) => `<tr data-id="${m.id}" data-who="${esc(`${m.name}(${m.login_id})`)}"><td><b>${esc(m.name)}</b></td><td data-l="아이디">${esc(m.login_id)}</td><td data-l="탈퇴일">${fmtDate(m.withdrawn_at)}</td>
        <td data-l="탈퇴사유">${m.withdraw_reason ? esc(m.withdraw_reason) : '<span class="dash">적혀 있지 않음</span>'}</td>
        <td class="c-act"><button type="button" class="btn sm danger" data-del>삭제</button></td></tr>`).join('')}</tbody></table>`
    : empty('탈퇴한 회원이 없습니다', '회원이 탈퇴하면 여기에 기록이 남습니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => { const p = new URLSearchParams(qs); p.set('page', n); return `#/members/withdrawn?${p}`; })}`;
  $('#wsearch').addEventListener('submit', (e) => { e.preventDefault(); const q = e.target.q.value.trim(); go(`#/members/withdrawn${q ? `?q=${encodeURIComponent(q)}` : ''}`); });
  // 삭제: 기록이 지워지고 그 아이디(이메일)로 다시 가입할 수 있다
  $$('[data-del]').forEach((b) => { b.onclick = (e) => {
    const tr = e.currentTarget.closest('tr');
    confirmInline(e.currentTarget, `<b>${esc(tr.dataset.who)}</b> 님의 탈퇴 기록을 지웁니다. 지우면 이 아이디(이메일)로 다시 가입할 수 있고, 되돌릴 수 없습니다. 쓴 글과 댓글은 그대로 남습니다.`, '삭제', async () => {
      await api(`/members/${tr.dataset.id}`, { method: 'DELETE' });
      toast('삭제했습니다. 이제 그 아이디로 다시 가입할 수 있습니다.');
      route();
    });
  }; });
}

// ───────── 등급 이름 ─────────
const LEVEL_HINT = { 1: '사이트 관리자 — 이 관리 화면에 들어올 수 있는 유일한 등급', 9: '가입 기본 등급', 10: '제한 등급 — 읽기만 되고 글·댓글은 막힌다' };
const DEFAULT_LV = { 1: '관리자', 9: '일반회원', 10: '제한회원' };
async function levelsPage() {
  const d = await api('/levels');
  main.innerHTML = `${head('회원', '등급 이름', '등급은 1부터 10까지 정해져 있고 이름만 바꿀 수 있습니다. 비워 두면 기본 이름으로 돌아갑니다.')}
    <form id="lvform"><div class="panel"><table class="tbl cardy"><thead><tr><th>등급</th><th>이름</th><th>회원 수</th><th>설명</th></tr></thead><tbody>
      ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<tr><td><b>${n}</b></td>
        <td data-l="이름"><input class="input" name="${n}" maxlength="20" value="${esc(d.levelNames[n] === (DEFAULT_LV[n] || `${n}등급`) ? '' : d.levelNames[n])}" placeholder="${esc(DEFAULT_LV[n] || `${n}등급`)}"></td>
        <td data-l="회원 수">${d.counts[n] || 0}명</td><td data-l="설명"><small>${LEVEL_HINT[n] || ''}</small></td></tr>`).join('')}
    </tbody></table></div>${saveBar('등급 이름을 고치는 중입니다.', '#/members')}</form>`;
  const form = $('#lvform');
  ctrlS(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), null, async () => {
      await api('/levels', { method: 'PUT', data: { names: formData(form) } });
      INFO = await api('/me'); dirty = false;
      toast('등급 이름을 저장했습니다.'); route();
    });
  });
}

// ───────── 가입 항목 ─────────
const TYPE_LABEL = { TEXT: '입력', NUMBER: '숫자', DATE: '날짜', SELECT: '리스트선택', RADIO: '선택', CHECKBOX: '다중선택' };
// 글자 수 세기: "n / 최대자", 넘으면 글자 수와 입력칸 테두리가 빨갛게 (검색엔진 설명글은 80자 이내 — 사용자 지시 2026-11-04)
function charLimit(input, el, max) {
  const run = () => {
    const n = input.value.trim().length;
    el.textContent = `${n} / ${max}자${n > max ? ` · ${n - max}자 넘음` : ''}`;
    el.classList.toggle('over', n > max);
    input.classList.toggle('over', n > max);
  };
  input.addEventListener('input', run);
  run();
}
const MODE_LABEL = { REQUIRED: '필수', OPTIONAL: '선택', EXCLUDED: '안 받음' };
async function fieldsPage() {
  const d = await api('/fields');
  let fields = d.fields;
  main.innerHTML = `${head('회원', '가입 항목', '회원가입 화면에서 받을 항목입니다. ⠿ 를 끌어 순서를 바꾸고 저장하세요.', '<a class="btn primary" href="#/fields/new">+ 항목 추가</a>')}
    <form id="fform"><div class="panel"><table class="tbl cardy"><thead><tr><th></th><th>이름표</th><th>종류</th><th>받기</th><th>입력한 회원</th><th>관리</th></tr></thead><tbody id="frows">
    ${fields.map((f) => `<tr data-id="${f.key}" class="${f.mode === 'EXCLUDED' ? 'off' : ''}">
      <td><button type="button" class="handle" aria-label="끌어서 순서 바꾸기">⠿</button></td>
      <td><input class="input" name="label" value="${esc(f.label)}" maxlength="30" aria-label="이름표"><small>키 ${esc(f.key)} <span class="tag off-tag">안 받음 — 가입 화면에 안 나옴</span></small></td>
      <td data-l="종류">${f.builtin ? '<span class="tag blue">기본 제공</span>' : `<span class="tag">${TYPE_LABEL[f.type]}</span>`}${f.options ? `<small>${esc(f.options.join(' · '))}</small>` : ''}</td>
      <td data-l="받기"><select class="input" name="mode"${f.key === 'name' || f.key === 'mobile' ? ' disabled' : ''}>${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${k === f.mode ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <small class="warn-txt" hidden></small></td>
      <td data-l="입력한 회원">${f.used}명 / ${d.total}명</td>
      <td><div class="mng">${f.options ? '<button type="button" class="btn sm" data-opts>보기 고치기</button>' : ''}${f.builtin ? '' : '<button type="button" class="btn sm danger" data-del>삭제</button>'}</div></td>
    </tr>`).join('')}</tbody></table></div>

    ${saveBar('가입 항목을 고치는 중입니다.', '#/members')}</form>`;
  const form = $('#fform');
  ctrlS(form);
  sortable($('#frows'), { rowSel: 'tr[data-id]', onDrop: () => { dirty = true; } });
  $$('#frows tr').forEach((tr) => {
    const f = fields.find((x) => x.key === tr.dataset.id);
    const sel = tr.querySelector('select');
    sel.addEventListener('change', () => {
      tr.classList.toggle('off', sel.value === 'EXCLUDED');
      const w = tr.querySelector('.warn-txt');
      const left = d.total - f.used;
      w.hidden = !(sel.value === 'REQUIRED' && f.mode !== 'REQUIRED' && left > 0);
      w.textContent = `이미 가입한 회원 ${left}명이 이 항목을 비운 채로 남습니다.`;
    });
    tr.querySelector('[data-opts]')?.addEventListener('click', () => openDialog(`<h2>${esc(f.label)} 보기</h2><form>
      <label class="field"><span>보기 (한 줄에 하나, 쉼표 없이)</span><textarea class="input" name="o">${esc((f.options || []).join('\n'))}</textarea></label>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">적용</button></div></form>`, (dlg) => {
      dlg.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        f.options = dlg.querySelector('[name=o]').value.split('\n').map((x) => x.trim()).filter(Boolean);
        tr.querySelector('td[data-l=종류] small').textContent = f.options.join(' · ');
        dirty = true; dlg.close();
      });
    }));
    tr.querySelector('[data-del]')?.addEventListener('click', (e) => confirmInline(e.currentTarget,
      `"${esc(f.label)}" 항목을 지웁니다. 회원 ${f.used}명이 넣은 값이 화면에서 보이지 않게 됩니다(같은 키로 다시 만들면 다시 보입니다).`, '항목 삭제', async () => {
        await api(`/fields/${f.key}`, { method: 'DELETE' });
        toast('항목을 지웠습니다.'); route();
      }));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = $$('#frows tr').map((tr) => {
      const f = fields.find((x) => x.key === tr.dataset.id);
      return { key: f.key, label: tr.querySelector('[name=label]').value, mode: f.key === 'name' || f.key === 'mobile' ? 'REQUIRED' : tr.querySelector('select').value, options: f.options };
    });
    busy(form.querySelector('[type=submit]'), null, async () => {
      await api('/fields', { method: 'PUT', data: { fields: list } });
      dirty = false; toast('가입 항목을 저장했습니다.'); route();
    });
  });
}
function fieldNewPage() {
  main.innerHTML = `${head('회원 › 가입 항목', '항목 추가', '새 항목은 목록 맨 끝에 붙습니다.')}
    <form class="panel pad" id="fnew">
      <div class="row2">
        <label class="field"><span>항목 키</span><input class="input" name="key" required pattern="[A-Za-z][A-Za-z0-9_]{0,29}" placeholder="birthday"><small>영문으로 시작, 영문·숫자·밑줄. 저장한 뒤에는 바꿀 수 없습니다.</small></label>
        <label class="field"><span>이름표</span><input class="input" name="label" required maxlength="30" placeholder="생일"></label>
      </div>
      <label class="field"><span>받기</span><select class="input" name="mode">${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${k === 'OPTIONAL' ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <fieldset class="field"><legend>종류</legend><div class="choices">${Object.entries(TYPE_LABEL).map(([k, v], i) => `<label class="check"><input type="radio" name="type" value="${k}"${i ? '' : ' checked'}> ${v}</label>`).join('')}</div></fieldset>
      <label class="field" id="opt-field" hidden><span>보기 (한 줄에 하나, 쉼표 없이)</span><textarea class="input" name="options"></textarea></label>
      <p class="err" role="alert"></p>
      <div class="actions end"><a class="btn" href="#/fields">취소</a><button class="btn primary" type="submit">항목 추가</button></div>
    </form>`;
  const form = $('#fnew');
  form.addEventListener('change', () => { $('#opt-field').hidden = !['SELECT', 'RADIO', 'CHECKBOX'].includes(formData(form).type); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      const data = formData(form);
      await api('/fields', { method: 'POST', data: { ...data, options: data.options.split('\n') } });
      toast('항목을 추가했습니다.'); go('#/fields');
    });
  });
}

// ───────── 약관 · 방침 ─────────
async function docPage(kind) {
  const d = await api(`/documents/${kind}`);
  const title = kind === 'terms' ? '이용약관' : '개인정보 처리방침';
  const next = (d.current?.version || 0) + 1;
  main.innerHTML = `${head('회원 › 약관·방침', title, d.current ? `지금 v${d.current.version} (${fmtDate(d.current.published_at)} 발행). 고쳐서 새 버전으로 발행하면 그 뒤 가입하는 회원이 새 버전에 동의합니다.`
    : '<span class="tag warn">아직 없음</span> 기본 문안을 다듬어 발행하세요. 발행하면 회원가입 화면에 동의 칸이 생깁니다.')}
    <form id="dform"><div class="editor" data-editor><textarea name="content" hidden>${esc(d.current?.content || d.template)}</textarea></div>
      ${d.history.length ? `<p class="meta gap">이력: ${d.history.map((h) => `<button type="button" class="linkish" data-v="${h.version}">v${h.version} (${fmtDate(h.published_at)})</button>`).join(' ')}</p>` : ''}
      <div class="savebar"><span>발행한 버전은 지울 수 없습니다.</span><button class="btn primary" type="submit">새 버전으로 발행</button></div>
    </form>`;
  const ed = mountEditor($('[data-editor]'));
  const form = $('#dform');
  form.addEventListener('input', () => { dirty = true; });
  $$('[data-v]').forEach((b) => b.addEventListener('click', async () => {
    const h = await api(`/documents/${kind}/${b.dataset.v}`);
    openDialog(`<h2>${title} v${h.version}</h2><div class="prose">${h.content}</div><div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    confirmInline(btn, `v${next}을 발행합니다 — 지금 이후 가입하는 회원은 v${next}에 동의하게 됩니다. 발행한 버전은 지울 수 없습니다.`, '발행', async () => {
      ed.sync();
      await api(`/documents/${kind}`, { method: 'POST', data: { content: form.content.value } });
      dirty = false; toast(`v${next}을 발행했습니다.`); route();
    });
  });
}

// ───────── 게시판 ─────────
const LAYOUT_LABEL = { TABLE: '테이블', CARD: '카드', BLOG: '블로그' };
async function boardsPage() {
  const d = await api('/boards');
  main.innerHTML = `${head('사이트', '게시판', d.boards.length ? `홈페이지에 붙어 있는 게시판 ${d.boards.length}개입니다. 여기 순서는 이 목록의 차례이고, 홈페이지 메뉴 차례는 <a href="#/menus">메뉴</a>에서 정합니다.` : '', '<a class="btn primary" href="#/boards/new">+ 게시판 만들기</a>')}
    <div class="panel">${d.boards.length ? `<table class="tbl cardy"><thead><tr><th>순서</th><th>이름</th><th>주소</th><th>목록 모양</th><th>제한</th><th>글</th><th>메뉴 위치</th><th>관리</th></tr></thead><tbody id="brows">
      ${d.boards.map((b) => `<tr data-id="${b.id}"><td><button type="button" class="handle" aria-label="끌어서 순서 바꾸기">⠿</button></td>
        <td><b>${esc(b.name)}</b>${b.visible ? '' : ' <span class="tag">숨김</span>'}</td>
        <td data-l="주소"><a href="/board/${esc(b.slug)}" target="_blank" rel="noopener">/board/${esc(b.slug)}</a></td>
        <td data-l="목록 모양">${LAYOUT_LABEL[b.list_layout]}</td><td data-l="제한">${b.allow_guest_list ? '<span class="dash">—</span>' : '<span class="tag blue">회원만</span>'}</td>
        <td data-l="글">${b.post_count}</td><td data-l="메뉴 위치">${b.menu ? esc(b.menu) : '<span class="dash">메뉴에 없음</span>'}</td>
        <td><div class="mng"><a class="btn sm" href="#/boards/${b.id}">설정</a><button class="btn sm danger" type="button" data-del>삭제</button></div></td></tr>`).join('')}</tbody></table>`
    : empty('아직 게시판이 없습니다', '공지사항이나 자유게시판처럼, 글을 올릴 자리를 만들어 보세요.', '<a class="btn primary" href="#/boards/new">첫 게시판 만들기</a>')}</div>
    ${d.trash.length ? `<section class="panel pad"><h2>지운 게시판은 30일 동안 여기 있습니다</h2>
      ${d.trash.map((b) => `<div class="tree-row" data-tid="${b.id}"><div class="tt"><b>${esc(b.name)}</b><small>/board/${esc(b.slug)} · 글 ${b.post_count}건 · <b>${fmtDate(b.deleted_at + 30 * 86400000)}</b> 완전 삭제 예정</small></div>
        <div class="mng"><button class="btn sm" type="button" data-restore>되살리기</button></div></div>`).join('')}
      <p class="meta gap">지우는 즉시 주소가 풀려서, 그사이 다른 게시판이 같은 주소를 쓰면 되살릴 수 없습니다. 메뉴는 함께 되살아나지 않습니다.</p></section>` : ''}`;
  if (d.boards.length) {
    sortable($('#brows'), { rowSel: 'tr[data-id]', onDrop: (list) => busy(null, null, async () => {
      await api('/boards/order', { method: 'PUT', data: { ids: list.map((r) => Number(r.id)) } }); toast('순서를 저장했습니다.');
    }) });
  }
  $$('#brows tr').forEach((tr) => {
    const b = d.boards.find((x) => x.id === +tr.dataset.id);
    tr.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(b.name)}" 게시판이 글 ${b.post_count}건과 함께 30일 보관되며 그동안 복원할 수 있습니다. 주소 /board/${esc(b.slug)} 와 메뉴는 즉시 사라집니다.`, '게시판 삭제', async () => {
      await api(`/boards/${b.id}`, { method: 'DELETE' }); toast('보관함으로 옮겼습니다.'); route();
    });
  });
  $$('[data-tid]').forEach((row) => {
    row.querySelector('[data-restore]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/boards/${row.dataset.tid}/restore`, { method: 'POST', data: {} }); toast('되살렸습니다. 메뉴는 따로 붙여 주세요.'); route();
    });
  });
}

function levelChecks(name, selected, { guest = null, guestName = '' } = {}) {
  return `<div class="lv-grid" data-lv="${name}">${guest !== null ? `<label class="check"><input type="checkbox" name="${guestName}"${guest ? ' checked' : ''}> 비회원</label>` : ''}
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<label class="check"><input type="checkbox" name="${name}" value="${n}" data-array${selected.includes(n) ? ' checked' : ''}> ${esc(LV(n))}</label>`).join('')}
    <button type="button" class="linkish" data-all="${name}">전체</button><button type="button" class="linkish" data-none="${name}">해제</button></div>`;
}

async function boardPage(id) {
  const [b, menus] = await Promise.all([id ? api(`/boards/${id}`) : null, api('/menus')]);
  const v = b || {
    name: '', slug: '', list_layout: 'TABLE', list_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], read_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], write_levels: [1],
    comment_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], allow_guest_list: true, allow_guest_read: true, allow_guest_write: false, guest_menu: true,
    use_comment: true, use_secret: false, visible: true,
    options: { list_show: { no: true, writer: true, date: true, views: true }, view_show: { writer: true, date: true, views: true }, writer_mode: 'NAME', page_size: 20 },
  };
  const o = v.options;
  const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${label}</label>`;
  const parentOpts = menus.filter((m) => m.menu_type !== 'LINK').map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('');
  const sec1 = `<section class="panel pad" data-sec="basic"><h2>이름과 주소</h2>
      <div class="row2"><label class="field"><span>게시판 이름</span><input class="input" name="name" required maxlength="40" value="${esc(v.name)}" placeholder="공지사항"></label>
      <label class="field"><span>주소</span><input class="input" name="slug" required pattern="[a-z0-9][a-z0-9\\-]{0,39}" value="${esc(v.slug)}" placeholder="notice"><small>${esc(INFO.site.domain || '')}/board/<b data-slug>${esc(v.slug) || '…'}</b></small></label></div>
      ${b ? chk('visible', v.visible, '메뉴와 목록에 보입니다') : ''}
      ${b ? '' : `<div class="perm"><b>메뉴에 붙이기</b>${chk('attach_menu', true, '만들면서 메뉴에도 바로 붙입니다')}
        <label class="field"><span>상위 메뉴</span><select class="input" name="parent_menu_id"><option value="">맨 위 (대메뉴)</option>${parentOpts}</select></label></div>`}
    </section>`;
  const sec2 = `<section class="panel pad" data-sec="look"><h2>목록 모양</h2>
      <div class="layouts">${Object.entries(LAYOUT_LABEL).map(([k, l]) => `<label><input type="radio" name="list_layout" value="${k}"${v.list_layout === k ? ' checked' : ''}>
        <span class="pv ${k.toLowerCase()}">${'<i></i>'.repeat(k === 'CARD' ? 6 : k === 'BLOG' ? 2 : 4)}</span><b>${l}</b></label>`).join('')}</div>
    </section>
    <section class="panel pad" data-sec="look"><h2>기능</h2>
      <div class="choices">${chk('use_comment', v.use_comment, '댓글')}${chk('use_secret', v.use_secret, '비밀글')}${chk('allow_guest_write', v.allow_guest_write, '비회원도 글쓰기')}</div>
      <div class="perm"><b>목록에 보일 것</b><div class="choices">${chk('ls_no', o.list_show.no, '번호')}${chk('ls_writer', o.list_show.writer, '작성자')}${chk('ls_date', o.list_show.date, '작성일')}${chk('ls_views', o.list_show.views, '조회수')}</div><small class="meta">제목은 항상 보입니다.</small></div>
      <div class="perm"><b>글 읽기에 보일 것</b><div class="choices">${chk('vs_writer', o.view_show.writer, '작성자')}${chk('vs_date', o.view_show.date, '작성일')}${chk('vs_views', o.view_show.views, '조회수')}</div></div>
      <div class="perm"><b>작성자 표시</b><div class="choices"><label class="check"><input type="radio" name="writer_mode" value="NAME"${o.writer_mode !== 'HIDDEN' ? ' checked' : ''}> 이름 그대로</label>
        <label class="check"><input type="radio" name="writer_mode" value="HIDDEN"${o.writer_mode === 'HIDDEN' ? ' checked' : ''}> 비공개로 가리기</label></div></div>
      <div class="perm"><b>목록 개수</b><div class="choices">${[10, 20, 30].map((n) => `<label class="check"><input type="radio" name="page_size" value="${n}"${o.page_size === n ? ' checked' : ''}> ${n}개</label>`).join('')}</div><small class="meta">방문자가 바꿀 수도 있습니다.</small></div>
    </section>
    <section class="panel pad" data-sec="look"><h2>게시판 권한</h2>
      <div class="perm"><b>목록을 볼 수 있는 등급</b>${levelChecks('list_levels', v.list_levels, { guest: v.allow_guest_list, guestName: 'allow_guest_list' })}
        ${chk('guest_menu', v.guest_menu, '비회원에게도 메뉴 보이기')}</div>
      <div class="perm"><b>글을 읽을 수 있는 등급</b>${levelChecks('read_levels', v.read_levels, { guest: v.allow_guest_read, guestName: 'allow_guest_read' })}</div>
      <div class="perm"><b>글 쓸 수 있는 등급</b>${levelChecks('write_levels', v.write_levels)}<small class="meta">비회원 글쓰기는 위 "기능" 에서 켭니다.</small></div>
      <div class="perm"><b>댓글 달 수 있는 등급</b>${levelChecks('comment_levels', v.comment_levels)}<small class="meta">댓글은 회원만 달 수 있습니다.</small></div>
    </section>`;
  const sec3 = b ? `<section class="panel pad" data-sec="del"><h2>게시판 지우기</h2><p class="meta">지운 게시판은 글 ${b.post_count}건과 함께 30일 동안 보관함에 있고, 그동안 되살릴 수 있습니다.</p>
      <div class="actions"><button class="btn danger" type="button" data-del>이 게시판 지우기</button></div></section>` : '';
  main.innerHTML = `${head('사이트 › 게시판', b ? esc(b.name) : '게시판 만들기', b ? `주소 /board/${esc(b.slug)} · 글 ${b.post_count}건 · ${b.menu ? `메뉴 "${esc(b.menu)}"에 붙어 있습니다` : '메뉴에 없음'}` : '이름과 주소, 모양과 권한을 정하고 한 번에 만듭니다.')}
    ${b ? '<div class="tabs gap" id="btabs"></div>' : ''}
    <form id="bform" class="gap">${sec1}${sec2}${sec3}${saveBar(b ? '게시판 설정을 고치는 중입니다.' : '새 게시판을 만드는 중입니다.', '#/boards')}</form>`;
  const form = $('#bform');
  ctrlS(form);
  const slug = form.slug;
  slug.addEventListener('input', () => { $('[data-slug]').textContent = slug.value || '…'; });
  form.addEventListener('click', (e) => {
    const a = e.target.closest('[data-all],[data-none]');
    if (!a) return;
    const name = a.dataset.all || a.dataset.none;
    $$(`input[name="${name}"]`, form).forEach((i) => { i.checked = !!a.dataset.all; });
    dirty = true;
  });
  if (b) {
    const show = (k) => {
      $$('[data-sec]', form).forEach((s) => { s.hidden = s.dataset.sec !== k; });
      form.querySelector('.savebar').hidden = k === 'del';
    };
    pillTabs($('#btabs'), [['basic', '이름과 주소'], ['look', '모양·기능·권한'], ['del', '게시판 지우기']], 'basic', show);
    show('basic');
    form.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `글 ${b.post_count}건과 함께 30일 보관되며 그동안 복원할 수 있습니다. 주소 /board/${esc(b.slug)} 와 메뉴는 즉시 사라집니다.`, '게시판 삭제', async () => {
      await api(`/boards/${b.id}`, { method: 'DELETE' }); dirty = false; toast('보관함으로 옮겼습니다.'); go('#/boards');
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    const data = {
      name: f.name, slug: f.slug, list_layout: f.list_layout,
      list_levels: f.list_levels || [], read_levels: f.read_levels || [], write_levels: f.write_levels || [], comment_levels: f.comment_levels || [],
      allow_guest_list: f.allow_guest_list, allow_guest_read: f.allow_guest_read, allow_guest_write: f.allow_guest_write, guest_menu: f.guest_menu,
      use_comment: f.use_comment, use_secret: f.use_secret,
      options: { list_show: { no: f.ls_no, writer: f.ls_writer, date: f.ls_date, views: f.ls_views }, view_show: { writer: f.vs_writer, date: f.vs_date, views: f.vs_views }, writer_mode: f.writer_mode, page_size: Number(f.page_size) },
    };
    if (b) data.visible = f.visible; else { data.attach_menu = f.attach_menu; data.parent_menu_id = f.parent_menu_id; }
    busy(form.querySelector('[type=submit]'), null, async () => {
      if (!form.reportValidity()) return;
      if (b) await api(`/boards/${b.id}`, { method: 'PUT', data });
      else await api('/boards', { method: 'POST', data });
      dirty = false; toast(b ? '저장했습니다.' : '게시판을 만들었습니다.'); go('#/boards');
    });
  });
}

// ───────── 메뉴 ─────────
const TYPE_TAG = { PAGE: '페이지', BOARD: '게시판', LINK: '외부 링크' };
const folded = new Set();
async function menusPage() {
  const menus = await api('/menus');
  const kids = (pid) => menus.filter((m) => (m.parent_id ?? null) === pid).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const rows = [];
  const walk = (pid, depth, hiddenAbove, foldedAbove) => kids(pid).forEach((m) => {
    rows.push({ m, depth, hiddenAbove, foldedAbove, n: kids(m.id).length });
    walk(m.id, depth + 1, hiddenAbove || !m.visible, foldedAbove || folded.has(m.id));
  });
  walk(null, 0, false, false);
  const where = (m) => (m.menu_type === 'BOARD' ? `/board/${m.board_slug || '?'}` : m.path || '대분류 (주소 없음)');
  main.innerHTML = `${head('사이트', '메뉴', '홈페이지 위쪽 메뉴를 정리합니다. 이름과 순서는 언제든 바꿀 수 있고 배포가 필요 없습니다. ⠿ 를 위아래로 끌면 순서가 바뀌고, 끄는 채로 오른쪽으로 밀면 바로 위 메뉴 안(하위 메뉴)으로, 왼쪽으로 밀면 밖으로 나옵니다. 끄는 동안 놓일 자리에 안내선과 ‘어디로 들어가는지’가 보입니다.', '<a class="btn primary" href="#/menus/new">+ 메뉴 추가</a>')}
    <div class="panel" id="mtree">${rows.length ? rows.map(({ m, depth, hiddenAbove, foldedAbove, n }) => `
      <div class="tree-row${m.visible && !hiddenAbove ? '' : ' hid'}" data-id="${m.id}" data-depth="${depth}" data-type="${m.menu_type}" style="--d:${depth}"${foldedAbove ? ' hidden' : ''}>
        <button type="button" class="handle" aria-label="끌어서 옮기기">⠿</button>
        ${n ? `<button type="button" class="tw" data-fold aria-label="하위 메뉴 접기/펴기">${folded.has(m.id) ? '▸' : '▾'}</button>` : '<span class="tw"></span>'}
        <div class="tt"><b>${esc(m.title)}</b> <span class="tag ${m.menu_type === 'BOARD' ? 'blue' : m.menu_type === 'LINK' ? 'warn' : ''}">${TYPE_TAG[m.menu_type]}</span>${n ? `<span class="tag">하위 ${n}</span>` : ''}
          ${m.visible ? (hiddenAbove ? '<span class="tag">위가 숨김</span>' : '') : '<span class="tag red">숨김</span>'}<small>${esc(where(m))}</small></div>
        <div class="mng"><a class="btn sm" href="#/menus/${m.id}">편집</a>
          <button class="btn sm" type="button" data-vis>${m.visible ? '숨기기' : '보이기'}</button><button class="btn sm danger" type="button" data-del>삭제</button></div>
      </div>`).join('') : empty('메뉴가 없습니다.', '메뉴를 추가하거나, 게시판을 만들 때 메뉴에 바로 붙일 수 있습니다.', '<a class="btn primary" href="#/menus/new">메뉴 추가</a>')}</div>`;
  const tree = $('#mtree');
  if (!rows.length) return;
  // 접힌 묶음이 있으면 끌기 전에 펼쳐야 하위가 함께 움직인다
  sortable(tree, {
    rowSel: '.tree-row:not([hidden])', nest: true, canParent: (r) => r.dataset.type !== 'LINK',
    onDrop: (list) => busy(null, null, async () => {
      toast('메뉴 순서를 저장하는 중…');
      const hiddenRows = $$('.tree-row[hidden]', tree);
      if (hiddenRows.length) { toast('접힌 메뉴를 모두 편 뒤에 옮겨 주세요.'); return route(); }
      await api('/menus/tree', { method: 'PUT', data: { items: treeFromDepths(list) } });
      toast('메뉴 순서를 저장했습니다.');
      await new Promise((r) => setTimeout(r, 280)); // 내려앉는 애니메이션이 끝난 뒤 다시 그린다
      route();
    }),
  });
  $$('.tree-row', tree).forEach((row) => {
    const m = menus.find((x) => x.id === +row.dataset.id);
    row.querySelector('[data-fold]')?.addEventListener('click', () => { if (folded.has(m.id)) folded.delete(m.id); else folded.add(m.id); route(); });
    row.querySelector('[data-vis]').onclick = (e) => {
      if (!m.visible) return busy(e.currentTarget, null, async () => { await api(`/menus/${m.id}/visible`, { method: 'POST', data: { visible: true } }); route(); });
      return confirmInline(e.currentTarget, `"${esc(m.title)}" 메뉴를 숨깁니다. 숨긴 메뉴는 방문자에게 보이지 않고 검색엔진에도 알리지 않으며, 하위 메뉴도 함께 숨겨집니다.`, '숨기기', async () => {
        await api(`/menus/${m.id}/visible`, { method: 'POST', data: { visible: false } }); route();
      });
    };
    row.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(m.title)}" 메뉴를 지웁니다. 메뉴 칸만 사라지고 게시판·페이지 내용은 그대로 남습니다.${kids(m.id).length ? ' 하위 메뉴는 한 단계 위로 올라갑니다.' : ''}`, '메뉴 삭제', async () => {
      await api(`/menus/${m.id}`, { method: 'DELETE' }); toast('메뉴를 지웠습니다.'); route();
    });
  });
}

async function menuPage(id) {
  const [menus, bd] = await Promise.all([api('/menus'), api('/boards')]);
  const m = id ? menus.find((x) => x.id === id) : null;
  if (id && !m) { toast('없는 메뉴입니다.'); return go('#/menus'); }
  const v = m || { title: '', menu_type: 'PAGE', path: '', board_id: null, parent_id: null, read_levels: null, allow_guest_read: 1 };
  const banned = new Set();
  if (m) { const mark = (pid) => { banned.add(pid); menus.filter((x) => x.parent_id === pid).forEach((x) => mark(x.id)); }; mark(m.id); }
  const depthOf = (x) => { let d = 0; let c = x; while (c?.parent_id && d < 20) { c = menus.find((y) => y.id === c.parent_id); d++; } return d; };
  const parentOpts = menus.filter((x) => x.menu_type !== 'LINK' && !banned.has(x.id))
    .map((x) => `<option value="${x.id}"${x.id === v.parent_id ? ' selected' : ''}>${'　'.repeat(depthOf(x))}${esc(x.title)}</option>`).join('');
  const lv = v.read_levels || [];
  main.innerHTML = `${head('사이트 › 메뉴', m ? '메뉴 편집' : '메뉴 추가', '')}
    <form class="panel pad" id="mform">
      <label class="field"><span>메뉴 이름</span><input class="input" name="title" required maxlength="40" value="${esc(v.title)}"></label>
      <fieldset class="field"><legend>종류</legend><div class="choices">${Object.entries(TYPE_TAG).map(([k, l]) => `<label class="check"><input type="radio" name="menu_type" value="${k}"${v.menu_type === k ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
      <label class="field" data-for="PAGE"><span>사이트 안 주소</span><input class="input" name="page_path" value="${esc(v.menu_type === 'PAGE' ? v.path : '')}" placeholder="/about.html"><small>비워 두면 하위 메뉴를 묶는 대분류가 됩니다.</small></label>
      <label class="field" data-for="BOARD"><span>게시판</span><select class="input" name="board_id"><option value="">게시판을 고르세요</option>${bd.boards.map((b) => `<option value="${b.id}"${b.id === v.board_id ? ' selected' : ''}>${esc(b.name)} (/board/${esc(b.slug)})</option>`).join('')}</select>
        <small>게시판의 주소와 권한을 그대로 씁니다.</small></label>
      <label class="field" data-for="LINK"><span>외부 주소</span><input class="input" name="link_path" value="${esc(v.menu_type === 'LINK' ? v.path : '')}" placeholder="https://"><small>새 창으로 열립니다.</small></label>
      <label class="field"><span>상위 메뉴</span><select class="input" name="parent_id"><option value="">맨 위 (대메뉴)</option>${parentOpts}</select></label>
      <div class="field" data-for="PAGE LINK"><span>누가 볼 수 있나</span>
        <div class="lv-grid"><label class="check"><input type="checkbox" name="allow_guest_read"${v.allow_guest_read ? ' checked' : ''}> 비회원</label>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<label class="check"><input type="checkbox" name="read_levels" value="${n}" data-array${lv.includes(n) ? ' checked' : ''}> ${esc(LV(n))}</label>`).join('')}</div>
        <small>등급을 하나도 고르지 않으면 로그인한 회원은 모두 볼 수 있습니다.</small></div>
      <p class="err" role="alert"></p>
      <div class="actions end"><a class="btn" href="#/menus">취소</a><button class="btn primary" type="submit">${m ? '저장' : '메뉴 추가'}</button></div>
    </form>`;
  const form = $('#mform');
  const sync = () => { const t = formData(form).menu_type; $$('[data-for]', form).forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(t); }); };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    const data = { title: f.title, menu_type: f.menu_type, path: f.menu_type === 'LINK' ? f.link_path : f.page_path, board_id: f.board_id, parent_id: f.parent_id,
      read_levels: (f.read_levels || []).length ? f.read_levels : null, allow_guest_read: f.allow_guest_read };
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (m) await api(`/menus/${m.id}`, { method: 'PUT', data }); else await api('/menus', { method: 'POST', data });
      toast(m ? '메뉴를 저장했습니다.' : '메뉴를 추가했습니다.'); go('#/menus');
    });
  });
}

// ───────── 수정 요청 ─────────
const REQ_LABEL = { new: ['접수', 'warn'], doing: ['진행 중', 'blue'], done: ['완료', 'green'] };
const ATT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
const IMG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>';
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round((n || 0) / 1024))}KB`);
// 목록 (게시판처럼) — #/requests?status=new&page=2
const REQ_PAGE = 15;
async function requestsPage(qs) {
  const list = await api('/requests');
  const st = REQ_LABEL[qs.get('status')] ? qs.get('status') : '';
  const rows = st ? list.filter((r) => r.status === st) : list;
  const page = Math.max(1, Number(qs.get('page')) || 1);
  const shown = rows.slice((page - 1) * REQ_PAGE, page * REQ_PAGE);
  const count = (k) => list.filter((r) => r.status === k).length;
  const tab = (k, label, n) => `<a class="req-tab${st === k ? ' on' : ''}" href="#/requests${k ? `?status=${k}` : ''}">${label} <b>${n}</b></a>`;
  main.innerHTML = `${head('사이트', '수정 요청', '홈페이지에서 바꾸고 싶은 곳을 운영자에게 요청합니다. 처리되면 그 요청에 답변이 붙습니다.')}
    <div class="req-top">
      <nav class="req-tabs" aria-label="상태">${tab('', '전체', list.length)}${tab('new', '접수', count('new'))}${tab('doing', '진행 중', count('doing'))}${tab('done', '완료', count('done'))}</nav>
      <a class="btn primary" href="#/requests/new">요청 쓰기</a>
    </div>
    <div class="panel">${shown.length ? `<table class="tbl cardy req-tbl"><thead><tr><th class="c-no">번호</th><th>제목</th><th class="c-st">상태</th><th>요청한 사람</th><th class="c-d">등록일</th></tr></thead><tbody>
      ${shown.map((r, i) => `<tr data-go="#/requests/${r.id}">
        <td class="c-no num" data-l="번호">${rows.length - (page - 1) * REQ_PAGE - i}</td>
        <td class="c-t"><a href="#/requests/${r.id}">${esc(r.title)}</a>${r.attachments?.length ? ` <span class="req-clip" title="첨부 ${r.attachments.length}개">${ATT_ICON}</span>` : ''}${r.msg_count ? ` <span class="req-count" title="주고받은 글">[${r.msg_count}]</span>` : ''}${r.site_unread ? ` <span class="new-num">새 글 ${r.site_unread}</span>` : r.last_side === 'op' || (!r.msg_count && r.reply) ? ' <span class="tag green req-reply">답변</span>' : ''}</td>
        <td class="c-st" data-l="상태"><span class="tag ${REQ_LABEL[r.status][1]}">${REQ_LABEL[r.status][0]}</span></td>
        <td data-l="요청한 사람">${esc(r.requester || '')}</td>
        <td class="c-d" data-l="등록일">${fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table>`
    : empty(st ? `${REQ_LABEL[st][0]} 상태인 요청이 없습니다` : '아직 보낸 요청이 없습니다', st ? '다른 상태를 골라 보세요.' : '오른쪽 위 [요청 쓰기] 로 첫 요청을 보내 보세요.', st ? '' : '<a class="btn primary" href="#/requests/new">요청 쓰기</a>')}</div>
    ${pager(page, REQ_PAGE, rows.length, (n) => `#/requests?${new URLSearchParams({ ...(st ? { status: st } : {}), page: n })}`)}`;
  // 줄 어디를 눌러도 그 요청으로
  main.querySelectorAll('tr[data-go]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(tr.dataset.go); }));
}

// 요청 보기 — 처음 요청 → 운영자 답변 → 다시 요청 … 을 시간 순서로 쌓고, 맨 아래에서 이어 쓴다
const reqAttsHtml = (atts) => {
  if (!atts?.length) return '';
  const img = atts.filter((a) => a.kind === 'IMAGE' || /^image\//.test(a.mime || ''));
  const files = atts.filter((a) => !img.includes(a));
  return `${img.length ? `<div class="msg-imgs">${img.map((a) => `<a href="/xms/upload/${esc(a.id)}" target="_blank" rel="noopener"><img src="/xms/upload/${esc(a.id)}" alt="${esc(a.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${files.length ? `<div class="post-files">${files.map((a) => `<a href="/xms/upload/${esc(a.id)}?dl=1">${esc(a.name)} <small>${size(a.size)}</small></a>`).join('')}</div>` : ''}`;
};
const reqMsg = (side, who, at, bodyHtml, atts, status) => `<li class="msg ${side}">
    <div class="msg-head"><b>${esc(who)}</b>${side === 'op' ? '<span class="tag blue">운영자</span>' : ''}<time>${fmtDate(at, true)}</time>${status ? `<span class="tag ${REQ_LABEL[status][1]}">→ ${REQ_LABEL[status][0]}</span>` : ''}</div>
    ${bodyHtml}${reqAttsHtml(atts)}</li>`;
async function requestView(id) {
  let r;
  try { r = await api(`/requests/${id}`); } catch {
    main.innerHTML = `${head('사이트', '수정 요청')}<div class="panel">${empty('요청을 찾을 수 없습니다', '지워졌거나 없는 요청입니다.', '<a class="btn" href="#/requests">목록으로</a>')}</div>`;
    return;
  }
  const first = r.body ? (r.body.trim().startsWith('<') ? `<div class="prose req-body">${r.body}</div>` : `<p class="pre">${esc(r.body)}</p>`) : '';
  const text = (t) => (t ? `<p class="pre">${esc(t)}</p>` : '');
  // 예전 방식(답변 한 칸)으로 단 답변도 그 자리에
  const legacy = r.reply && !r.messages.some((x) => x.side === 'op') ? reqMsg('op', '운영자', r.updated_at, text(r.reply), [], '') : '';
  main.innerHTML = `${head('사이트', '수정 요청')}
    <article class="panel pad req-view">
      <div class="req-view-head"><span class="tag ${REQ_LABEL[r.status][1]}">${REQ_LABEL[r.status][0]}</span><h2>${esc(r.title)}</h2>
        <p class="meta"><span>${esc(r.requester || '')}</span><span>처음 요청 ${fmtDate(r.created_at, true)}</span>${r.updated_at !== r.created_at ? `<span>마지막 ${fmtDate(r.updated_at, true)}</span>` : ''}</p></div>
      <ol class="thread">
        ${reqMsg('site', r.requester || '요청', r.created_at, first || '<p class="meta">내용 없음</p>', r.attachments, '')}
        ${legacy}
        ${r.messages.map((x) => reqMsg(x.side, x.author, x.created_at, text(x.body), x.attachments, x.status)).join('')}
      </ol>
      <form class="thread-form" id="mform">
        <label class="field"><span>이어서 쓰기 ${r.status === 'done' ? '<small class="meta-inline">— 완료된 요청에 쓰면 다시 접수됩니다</small>' : ''}</span>
          <textarea class="input" name="body" rows="4" maxlength="10000" placeholder="아직 안 된 곳, 더 바꿀 곳을 적어 주세요."></textarea></label>
        <div class="attach" data-attach>
          <div class="attach-btns"><button type="button" class="pill-btn" data-add="IMAGE">${IMG_ICON}이미지</button><button type="button" class="pill-btn" data-add="FILE">${ATT_ICON}파일</button></div>
          <div class="attach-list" data-list></div></div>
        <p class="err" role="alert"></p>
        <div class="actions"><a class="btn" href="#/requests">목록으로</a><button class="btn primary right" type="submit">보내기</button></div>
      </form>
    </article>
    <div class="actions gap"><button type="button" class="btn danger right" data-del>이 요청 삭제</button></div>`;
  $('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `<b>${esc(r.title)}</b> 요청을 지웁니다. 주고받은 글과 붙인 사진 · 파일도 함께 지워지고 되돌릴 수 없습니다.`, '삭제', async () => {
    await api(`/requests/${r.id}`, { method: 'DELETE' });
    toast('요청을 지웠습니다.');
    go('#/requests');
  });
  const form = $('#mform');
  const attach = mountAttach($('[data-attach]', form), { target: '@request' });
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      const out = await api(`/requests/${r.id}/messages`, { method: 'POST', data: { body: form.body.value, attachments: attach.ids() } });
      dirty = false;
      toast(out.status !== r.status ? '보냈습니다. 요청이 다시 접수됐습니다.' : '보냈습니다.');
      route();
    });
  });
}

// 요청 쓰기
function requestWrite() {
  main.innerHTML = `${head('사이트', '수정 요청 쓰기', '바꾸고 싶은 곳과 내용을 적어 주세요. 사진 · 파일도 붙일 수 있습니다.')}
    <form class="panel pad write-box" id="rform">
      <label class="field"><span>제목</span><input class="input" name="title" maxlength="120" required placeholder="예) 메인 사진 교체 부탁드립니다"></label>
      <div class="field"><span>첨부</span><div class="attach" data-attach>
        <div class="attach-btns"><button type="button" class="pill-btn" data-add="IMAGE">${IMG_ICON}이미지</button><button type="button" class="pill-btn" data-add="FILE">${ATT_ICON}파일</button></div>
        <div class="attach-list" data-list></div></div></div>
      <div class="field"><span>내용</span><div class="editor" data-editor data-board="@request"><textarea name="body" hidden></textarea></div></div>
      <p class="err" role="alert"></p><div class="actions"><a class="btn" href="#/requests">취소</a><button class="btn primary right" type="submit">요청 보내기</button></div></form>`;
  const form = $('#rform');
  const ed = mountEditor($('[data-editor]', form), { placeholder: '바꾸고 싶은 곳과 내용을 적어 주세요.' });
  // 첨부: 이미지는 본문에 바로(목록에도 보임), 파일은 목록으로 — 게시판 글쓰기와 같은 mountAttach
  const attach = mountAttach($('[data-attach]', form), { ed, target: '@request' });
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ed.sync();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      await api('/requests', { method: 'POST', data: { title: form.title.value, body: form.body.value, attachments: attach.ids() } });
      dirty = false;
      toast('요청을 보냈습니다.'); go('#/requests');
    });
  });
}

// ───────── 저장 공간 · 내 계정 · 관리 로그 ─────────
// ───────── 방문 통계 (최근 1년치만 남는다) ─────────
const REF_NAMES = { 'google.com': '구글', 'google.co.kr': '구글', 'search.naver.com': '네이버 검색', 'naver.com': '네이버', 'blog.naver.com': '네이버 블로그', 'cafe.naver.com': '네이버 카페',
  'search.daum.net': '다음 검색', 'daum.net': '다음', 'bing.com': '빙', 'kakao.com': '카카오', 'talk.kakao.com': '카카오톡', 'instagram.com': '인스타그램', 'l.instagram.com': '인스타그램',
  'facebook.com': '페이스북', 'l.facebook.com': '페이스북', 'lm.facebook.com': '페이스북', 'youtube.com': '유튜브', 'band.us': '밴드', 't.co': 'X(트위터)', 'x.com': 'X(트위터)' };
const refName = (r) => (r ? REF_NAMES[r] || (/(^|\.)google\./.test(r) ? '구글' : '') : '바로 들어옴 · 즐겨찾기');
const num = (n) => Number(n || 0).toLocaleString('ko-KR');
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
let statsRange = '30';
const RANGE_LABEL = { 7: '최근 7일', 30: '최근 1개월', 90: '최근 3개월', 180: '최근 6개월', 270: '최근 9개월', 365: '최근 12개월' };
const TBL_SIZE = 10;
// 목록 쪽 번호 (버튼) — 눌러도 주소는 그대로, 그 목록만 다시
function btnPager(key, page, size, total) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return '';
  const start = Math.floor((page - 1) / 5) * 5 + 1;
  const nums = Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i);
  const btn = (n, label = n) => `<button type="button" data-pg="${key}:${n}"${n === page ? ' class="on" aria-current="page"' : ''}>${label}</button>`;
  return `<nav class="pager">${start > 1 ? btn(start - 1, '‹') : ''}${nums.map((n) => btn(n)).join('')}${start + 5 <= pages ? btn(start + 5, '›') : ''}</nav>`;
}
async function statsPage() {
  main.innerHTML = `${head('사이트', '방문 통계', '홈페이지 방문자와 많이 본 페이지입니다. 최근 1년치만 남고 그보다 오래된 기록은 저절로 지워집니다.')}
    <div class="st-bar"><div class="tabs" id="st-tabs"></div></div>
    <div id="st-body"></div>`;
  const pg = { pp: 1, rp: 1, tp: 1, kp: 1, sp: 1 }; // 많이 본 페이지 · 들어온 곳 · 표 · 검색어 · 최근 검색 유입 쪽 번호
  let d = null;
  const body = $('#st-body');
  const load = async () => {
    body.classList.add('loading');
    const r = await api(`/stats?range=${statsRange}&pp=${pg.pp}&rp=${pg.rp}&kp=${pg.kp}&sp=${pg.sp}`);
    if (location.hash.split('?')[0] !== '#/stats') return;
    d = r;
    const open = body.querySelector('.st-table')?.open;
    body.classList.remove('loading');
    body.innerHTML = statsBody(d);
    if (open) body.querySelector('.st-table').open = true;
    statsTable(body, d, pg.tp);
    statsChart(body, d);
  };
  // 쪽 번호: 표는 화면에서 바로, 순위 목록은 서버에서 그 쪽만 받아 온다
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg]');
    if (!b || b.classList.contains('on')) return;
    const [k, n] = b.dataset.pg.split(':');
    pg[k] = +n;
    if (k === 'tp') statsTable(body, d, pg.tp);
    else load().catch((err) => toast(err.message));
  });
  // 탭은 한 번만 그리고, 누르면 배경부터 미끄러진 뒤 아래 내용만 다시 받는다
  pillTabs($('#st-tabs'), Object.entries(RANGE_LABEL).map(([v, l]) => [v, l.replace('최근 ', '')]), statsRange, (v) => {
    statsRange = v; Object.keys(pg).forEach((k) => { pg[k] = 1; });
    load().catch((e) => toast(e.message));
  });
  await load();
}
// 표로 보기 (최근 것부터 10줄씩)
function statsTable(body, d, page) {
  const box = body.querySelector('#st-tbl');
  if (!box) return;
  const rows = statsSeries(d).reverse();
  const pages = Math.max(1, Math.ceil(rows.length / TBL_SIZE));
  const p = Math.min(page, pages);
  box.innerHTML = `<table class="tbl"><thead><tr><th>${d.monthly ? '달' : '날짜'}</th><th>방문자</th><th>페이지뷰</th></tr></thead><tbody>
    ${rows.slice((p - 1) * TBL_SIZE, p * TBL_SIZE).map((s) => `<tr><td>${s.full}</td><td>${num(s.visitors)}</td><td>${num(s.views)}</td></tr>`).join('')}</tbody></table>${btnPager('tp', p, TBL_SIZE, rows.length)}`;
}
// 날짜 칸 채우기 (기록이 없는 날 · 달은 0)
function statsSeries(d) {
  const map = Object.fromEntries(d.days.map((x) => [x.day, x]));
  const out = [];
  if (d.monthly) {
    let [y, m] = d.from.split('-').map(Number);
    for (let i = 0; i < d.months; i++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push({ key: k, label: `${m}월`, full: `${y}년 ${m}월`, ...(map[k] || { views: 0, visitors: 0 }) });
      if (++m > 12) { m = 1; y++; }
    }
  } else {
    const t0 = Date.parse(`${d.from}T00:00:00Z`);
    for (let i = 0; i < d.range; i++) {
      const dt = new Date(t0 + i * 86400000);
      const k = dt.toISOString().slice(0, 10);
      out.push({ key: k, label: `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`, full: `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일 (${WEEK[dt.getUTCDay()]})`, ...(map[k] || { views: 0, visitors: 0 }) });
    }
  }
  return out;
}
function statsBody(d) {
  const t = d.total;
  const label = RANGE_LABEL[d.range];
  const mobilePct = t.visitors ? Math.round((t.mobile / t.visitors) * 100) : 0;
  const series = statsSeries(d);
  const bar = (v, max) => `<i style="width:${Math.max(2, (v / max) * 100)}%"></i>`;
  return `<div class="st-tiles">
      <div class="panel st-tile"><span>오늘 방문자</span><b>${num(d.today_stat.visitors)}</b><small>페이지뷰 ${num(d.today_stat.views)}</small></div>
      <div class="panel st-tile"><span>어제 방문자</span><b>${num(d.yesterday.visitors)}</b><small>페이지뷰 ${num(d.yesterday.views)}</small></div>
      <div class="panel st-tile"><span>${label.replace('최근 ', '')} 방문자</span><b>${num(t.visitors)}</b><small>페이지뷰 ${num(t.views)}</small></div>
      <div class="panel st-tile"><span>폰으로 온 방문자</span><b>${mobilePct}%</b><small>PC ${t.visitors ? 100 - mobilePct : 0}%</small></div>
    </div>
    <div class="panel pad gap"><h2>${d.monthly ? '달마다' : '날마다'} 방문자</h2>
      ${t.visitors ? `<div class="st-chart" role="img" aria-label="${label} 방문자 막대 그래프"></div>` : `<p class="meta">아직 ${label} 동안 기록된 방문이 없습니다. 지금부터 홈페이지 방문을 셉니다.</p>`}
      <details class="st-table"><summary>표로 보기</summary><div id="st-tbl"></div></details>
    </div>
    <div class="st-cols gap">
      <div class="panel pad"><h2>많이 본 페이지 <small class="meta">페이지뷰 · ${num(d.pages_total)}개 주소</small></h2>
        ${d.pages.length ? `<ol class="st-rank">${d.pages.map((p) => `<li><a href="${esc(p.path)}" target="_blank" rel="noopener"><b>${esc(p.name || p.path)}</b>${p.name ? `<small>${esc(p.path)}</small>` : ''}</a><span>${num(p.views)}</span>${bar(p.views, d.pages_max)}</li>`).join('')}</ol>${btnPager('pp', d.pp, d.rank_size, d.pages_total)}` : '<p class="meta">아직 기록이 없습니다.</p>'}
      </div>
      <div class="panel pad"><h2>들어온 곳 <small class="meta">방문자 · ${num(d.refs_total)}곳</small></h2>
        ${d.refs.length ? `<ol class="st-rank">${d.refs.map((r) => `<li><span class="st-name"><b>${esc(refName(r.ref) || r.ref)}</b>${r.ref && refName(r.ref) ? `<small>${esc(r.ref)}</small>` : ''}</span><span>${num(r.visitors)} <small>${Math.round((r.visitors / d.refs_sum) * 100)}%</small></span>${bar(r.visitors, d.refs_sum)}</li>`).join('')}</ol>${btnPager('rp', d.rp, d.rank_size, d.refs_total)}` : '<p class="meta">아직 기록이 없습니다.</p>'}
      </div>
    </div>
    ${statsSearch(d, label, bar)}
    <p class="meta gap">방문자 = 그날 처음 들어온 브라우저 수(같은 사람이 하루에 여러 번 와도 1명), 페이지뷰 = 페이지를 연 횟수. 검색엔진 로봇과 관리 화면은 세지 않습니다.${d.first_day ? ` 기록 시작: ${esc(d.first_day)}` : ''}</p>`;
}
// 검색으로 들어옴: 검색엔진별 · 많이 찾은 검색어 · 최근 유입 한 줄씩
const HIDDEN_KW = '<em class="st-hidden">검색어 비공개</em>';
const fmtAt = (ms) => { const t = new Date(Number(ms) + 9 * 3600000); return `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };
function statsSearch(d, label, bar) {
  if (!d.searches_total) {
    return `<div class="panel pad gap"><h2>검색으로 들어옴</h2><p class="meta">아직 ${label} 동안 검색엔진(네이버 · 구글 · 다음 등)에서 들어온 기록이 없습니다.</p></div>`;
  }
  const hidden = d.engines.reduce((a, e) => a + (e.n - e.with_kw), 0);
  return `<div class="panel pad gap st-search"><h2>검색으로 들어옴 <small class="meta">${label.replace('최근 ', '')} · ${num(d.searches_total)}번</small></h2>
      <div class="st-cols">
        <div><h3>검색엔진</h3>
          <ol class="st-rank">${d.engines.map((e) => `<li><span class="st-name"><b>${esc(e.engine)}</b><small>검색어 보임 ${num(e.with_kw)}번</small></span><span>${num(e.n)} <small>${Math.round((e.n / d.searches_total) * 100)}%</small></span>${bar(e.n, d.searches_total)}</li>`).join('')}</ol>
        </div>
        <div><h3>많이 찾은 검색어 <small class="meta">${num(d.keywords_total)}개</small></h3>
          ${d.keywords.length ? `<ol class="st-rank">${d.keywords.map((k) => `<li><span class="st-name"><b>${esc(k.keyword)}</b><small>${esc(String(k.engines || '').replace(/,/g, ' · '))} · 마지막 ${fmtAt(k.last)}</small></span><span>${num(k.n)}</span>${bar(k.n, d.keywords_max)}</li>`).join('')}</ol>${btnPager('kp', d.kp, d.rank_size, d.keywords_total)}`
            : `<p class="meta">검색어가 넘어온 기록이 없습니다. ${hidden ? `${num(hidden)}번은 검색엔진이 검색어를 알려 주지 않았습니다.` : ''}</p>`}
        </div>
      </div>
      <h3 class="gap">최근 검색 유입</h3>
      <div class="st-recent-wrap"><table class="tbl st-recent"><thead><tr><th>시각</th><th>검색엔진</th><th>검색어</th><th>들어온 페이지</th></tr></thead><tbody>
        ${d.searches.map((r) => `<tr><td>${fmtAt(r.at)}</td><td>${esc(r.engine)}</td><td>${r.keyword ? `<b>${esc(r.keyword)}</b>` : HIDDEN_KW}</td><td><a href="${esc(r.path)}" target="_blank" rel="noopener">${esc(r.name || r.path)}</a>${r.name ? `<small>${esc(r.path)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${btnPager('sp', d.sp, d.recent_size, d.searches_total)}
      <p class="meta">네이버 · 다음은 대개 검색어가 함께 넘어오지만, 구글 · 빙 · 덕덕고는 검색어를 알려 주지 않아 '검색어 비공개' 로 보입니다.</p>
    </div>`;
}
// 눈금 간격: 1 · 2 · 5 × 10ⁿ 중 눈금이 4~5개 되는 것
function niceStep(max) {
  if (max <= 4) return 1;
  const base = 10 ** Math.floor(Math.log10(max / 4));
  return [1, 2, 5, 10].map((m) => m * base).find((s) => max / s <= 5);
}
// 막대 그래프 (한 가지 색, 막대에 대면 숫자)
function statsChart(body, d) {
  const box = body.querySelector('.st-chart');
  if (!box) return;
  const series = statsSeries(d);
  const max = Math.max(1, ...series.map((s) => s.visitors));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const every = series.length > 7 ? Math.ceil(series.length / 7) : 1; // 아래 글자는 띄엄띄엄
  const nowKey = d.monthly ? d.today.slice(0, 7) : d.today;
  box.innerHTML = `<div class="st-y">${ticks.slice().reverse().map((v) => `<span>${num(v)}</span>`).join('')}</div>
    <div class="st-plot"><div class="st-grid">${ticks.map(() => '<i></i>').join('')}</div>
      <div class="st-bars${series.length > 40 ? ' dense' : ''}">${series.map((s, i) => `<button type="button" class="st-col${s.key === nowKey ? ' now' : ''}" data-i="${i}" aria-label="${s.full} 방문자 ${s.visitors}명, 페이지뷰 ${s.views}"><i style="height:${(s.visitors / top) * 100}%"></i><em>${(series.length - 1 - i) % every === 0 ? s.label : ''}</em></button>`).join('')}</div>
      <div class="st-tip" hidden></div></div>`;
  const tip = box.querySelector('.st-tip');
  const plot = box.querySelector('.st-plot');
  const cols = [...box.querySelectorAll('.st-col')];
  const show = (b) => {
    const s = series[+b.dataset.i];
    tip.innerHTML = `<b>${s.full}</b><span>방문자 ${num(s.visitors)}명</span><span>페이지뷰 ${num(s.views)}</span>`;
    tip.hidden = false;
    const pr = plot.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(br.left - pr.left + br.width / 2, half), pr.width - half)}px`;
    cols.forEach((c) => c.classList.toggle('hover', c === b));
  };
  const hide = () => { tip.hidden = true; cols.forEach((c) => c.classList.remove('hover')); };
  cols.forEach((b) => { b.addEventListener('pointerenter', () => show(b)); b.addEventListener('focus', () => show(b)); b.addEventListener('click', () => show(b)); });
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) hide(); });
}

async function storagePage() {
  const u = await api('/usage');
  const quota = (u.quota_mb || 0) * 1048576;
  const pct = quota ? Math.min(100, (u.files / quota) * 100) : 0;
  const pctText = pct > 0 && pct < 1 ? '1% 미만' : `${Math.round(pct)}%`;
  const bar = (part) => (u.files ? Math.max(part ? 1 : 0, (part / u.files) * 100) : 0);
  main.innerHTML = `${head('사이트', '저장 공간', `파일 ${size(u.files)} / ${u.quota_mb}MB 사용 중입니다 (${pctText}).`)}
    <div class="panel pad"><h2>파일 저장 공간 <small class="meta">사진 · 첨부 파일 · 팝업 · 파비콘 그림</small></h2>
      <div class="quota-bar"><i style="width:${pct}%"></i></div>
      <p class="meta gap">${pct >= 100 ? '저장 공간이 가득 찼습니다. 운영자에게 늘려 달라고 요청하세요.' : pct >= 90 ? '저장 공간이 거의 찼습니다. 필요하면 운영자에게 늘려 달라고 요청하세요.' : `한도 ${u.quota_mb}MB 중 ${size(u.files)}를 쓰고 있습니다. 사진은 올릴 때 WEBP 로 줄여서 저장합니다.`}</p>
      <div class="stack-bar" aria-hidden="true"><i class="s1" style="width:${bar(u.images)}%"></i><i class="s2" style="width:${bar(u.attachments)}%"></i><i class="s3" style="width:${bar(u.settings_files)}%"></i></div>
      <dl class="use-list">
        <div><dt><i class="s1"></i>사진</dt><dd>${size(u.images)}</dd></div>
        <div><dt><i class="s2"></i>첨부 파일</dt><dd>${size(u.attachments)}</dd></div>
        <div><dt><i class="s3"></i>팝업 · 파비콘 · 미리보기 그림</dt><dd>${size(u.settings_files)}</dd></div>
        <div><dt>파일 수</dt><dd>${u.file_count}개</dd></div>
      </dl>
    </div>
    <div class="use-cards gap">
      <div class="panel pad"><small class="meta">DB</small><b class="big-num">${size(u.db)}</b><p class="meta">회원 · 글 · 댓글 · 메뉴 · 게시판 · 약관 · 관리 로그 같은 글자 데이터입니다.</p></div>
      <div class="panel pad"><small class="meta">홈페이지</small><b class="big-num">${u.static_mb ? `${u.static_mb}MB` : '—'}</b><p class="meta">디자인 파일(html · 그림 · CSS) 크기입니다. 저장 공간 한도에는 들어가지 않습니다.</p></div>
    </div>`;
  INFO.site.used_mb = Math.round((u.files / 1048576) * 10) / 10;
  renderSide(); markSide();
}
async function accountPage() {
  const staff = INFO.me.staff;
  // 운영자 모드: 이 사이트 관리자 계정을 골라 새 비밀번호를 바로 넣는다
  const admins = staff ? await api('/account/admins') : [];
  main.innerHTML = `${head('내 계정', '비밀번호 변경', staff
    ? '운영자 모드입니다. 이 사이트 관리자 계정을 골라 새 비밀번호를 넣으면 바로 바뀝니다 (지금 비밀번호는 몰라도 됩니다).'
    : `${esc(INFO.me.login_id)} 계정의 비밀번호를 바꿉니다.`)}
    ${staff && !admins.length ? `<div class="panel">${empty('관리자 계정이 없습니다', 'xim › 사이트 › 관리자 버튼으로 먼저 만들어 주세요.')}</div>` : `
    <form class="panel pad" id="pform">
      ${staff ? `<label class="field"><span>바꿀 관리자 계정</span><select class="input" name="member_id" required>
        ${admins.map((m) => `<option value="${m.id}">${esc(m.name)} · ${esc(m.login_id)}${m.last_login_at ? ` (마지막 로그인 ${fmtDate(m.last_login_at)})` : ''}</option>`).join('')}</select></label>`
      : '<label class="field"><span>지금 비밀번호</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>'}
      <label class="field"><span>새 비밀번호</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required><small>8자 이상</small></label>
      <label class="field"><span>새 비밀번호 확인</span><input class="input" type="password" name="next2" autocomplete="new-password" required></label>
      <p class="err" role="alert"></p><div class="actions end"><button class="btn primary" type="submit">비밀번호 바꾸기</button></div></form>`}`;
  const form = $('#pform');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (f.next !== f.next2) throw new Error('새 비밀번호 확인이 서로 다릅니다.');
      const r = await api('/account/password', { method: 'POST', data: staff ? { member_id: f.member_id, next: f.next } : { current: f.current, next: f.next } });
      form.reset();
      toast(staff ? `${r.who} 비밀번호를 바꿨습니다.` : '비밀번호를 바꿨습니다.');
    });
  });
}
async function auditPage(qs) {
  const page = Number(qs.get('page')) || 1;
  const d = await api(`/audit?page=${page}`);
  main.innerHTML = `${head('내 계정', '관리 로그', `이 관리 화면에서 한 일이 최근 1개월 동안 남습니다 (지금 ${d.total}건, 한 쪽에 ${d.size}건). 1개월이 지난 기록은 저절로 지워집니다.`)}
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>시각</th><th>주체</th><th>행위</th><th>대상</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${fmtDate(r.created_at, true)}</td><td data-l="주체">${r.actor_kind === 'staff' ? '<span class="tag warn">운영자</span>' : esc(r.actor_name)}</td>
        <td data-l="행위">${esc(ACTIONS[r.action] || r.action)}</td><td data-l="대상">${esc(r.target)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`
    : empty('아직 기록이 없습니다', '회원·게시판·메뉴를 바꾸면 여기에 남습니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => `#/audit?page=${n}`)}`;
}

// ───────── 그림 다루기 (브라우저에서 줄여서 올린다) ─────────
function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('그림 파일을 골라 주세요.')); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('그림을 읽지 못했습니다.'));
    img.src = URL.createObjectURL(file);
  });
}
// 정사각형 투명 PNG — 정사각이 아니면 잘라내지 않고 여백을 넣어 맞춘다
function squarePng(img, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const r = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * r; const h = img.naturalHeight * r;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/png');
}
// 폭을 maxW 아래로 줄인 JPEG — maxBytes 를 넘으면 화질을 낮춘다
function fitJpeg(img, maxW, maxBytes) {
  const r = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.88; let url = c.toDataURL('image/jpeg', q);
  while (url.length * 0.75 > maxBytes && q > 0.4) { q -= 0.08; url = c.toDataURL('image/jpeg', q); }
  return url;
}
// WEBP data URL (팝업 그림 — 저장 공간 아끼기). 못 만드는 브라우저면 JPEG
function fitWebp(img, maxW, maxBytes) {
  const r = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.82; let url = c.toDataURL('image/webp', q);
  if (!url.startsWith('data:image/webp')) return fitJpeg(img, maxW, maxBytes);
  while (url.length * 0.75 > maxBytes && q > 0.4) { q -= 0.08; url = c.toDataURL('image/webp', q); }
  return url;
}
// 그림 고르기 칸: 누르기 · 끌어다 놓기(화면 아무 곳) · 붙여넣기(Ctrl+V)
function imagePicker(host, onFile) {
  host.innerHTML = `<label class="drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    <b>여기에 그림을 끌어다 놓으세요</b><span>화면 아무 곳에나 놓아도 됩니다 · 복사한 그림은 Ctrl+V · 눌러서 고를 수도 있습니다</span></label>`;
  const input = host.querySelector('input');
  input.addEventListener('change', () => input.files[0] && onFile(input.files[0]));
  const over = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); host.classList.add('on'); } };
  const drop = (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); host.classList.remove('on'); onFile(e.dataTransfer.files[0]); };
  const leave = () => host.classList.remove('on');
  const paste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); onFile(f); } };
  document.addEventListener('dragover', over); document.addEventListener('drop', drop); document.addEventListener('dragleave', leave); document.addEventListener('paste', paste);
  addEventListener('hashchange', () => { document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); document.removeEventListener('dragleave', leave); document.removeEventListener('paste', paste); }, { once: true });
}

// ───────── 파비콘 ─────────
async function faviconPage() {
  const d = await api('/settings/favicon');
  const v = d.updated_at;
  main.innerHTML = `${head('사이트', '파비콘', '브라우저 탭과 휴대폰 홈 화면에 나오는 작은 아이콘입니다. 머리글 로고는 바뀌지 않습니다.')}
    <section class="panel pad"><h2>지금 쓰는 파비콘</h2>
      ${d.has ? `<div class="fav-row">${d.sizes.map((n) => `<figure><img src="/xms/file/favicon-${n}.png?v=${v}" alt="${n}px 아이콘" width="${Math.min(n, 96)}" height="${Math.min(n, 96)}"><figcaption>${n}</figcaption></figure>`).join('')}</div>
        <p class="meta">올릴 때 자동으로 만들어집니다. <b>32</b>는 브라우저 탭, <b>180</b>은 아이폰 홈 화면, <b>192·512</b>는 안드로이드와 앱 설치에 쓰입니다.</p>
        <div class="actions"><button class="btn danger" type="button" data-off>파비콘 내리기</button></div>`
      : '<p class="meta">아직 없습니다. 브라우저 탭에는 사이트에 원래 넣어 둔 아이콘(없으면 기본 아이콘)이 나갑니다.</p>'}
    </section>
    <section class="panel pad"><h2>파비콘 바꾸기 <small class="meta">큰 그림은 자동으로 줄여 저장합니다</small></h2>
      <div data-pick></div>
      <p class="meta gap"><b>정사각형 투명 PNG</b>가 가장 잘 나옵니다. 탭 아이콘은 아주 작게 보이므로 글자가 긴 로고보다 <b>심볼 하나</b>가 알아보기 쉽습니다. 정사각이 아니면 잘라내지 않고 여백을 넣어 맞춥니다.</p>
      <div class="fav-row" data-new hidden></div>
      <p class="err" role="alert"></p>
      <div class="actions"><button class="btn primary" type="button" data-save disabled>이 파일로 바꾸기</button></div>
    </section>`;
  let icons = null;
  const box = $('[data-new]');
  imagePicker($('[data-pick]'), async (file) => {
    try {
      const img = await loadImage(file);
      icons = Object.fromEntries(d.sizes.map((n) => [n, squarePng(img, n)]));
      box.hidden = false;
      box.innerHTML = d.sizes.map((n) => `<figure><img src="${icons[n]}" alt="" width="${Math.min(n, 96)}" height="${Math.min(n, 96)}"><figcaption>${n}</figcaption></figure>`).join('');
      $('[data-save]').disabled = false;
    } catch (e) { toast(e.message); }
  });
  $('[data-save]').onclick = (e) => busy(e.currentTarget, $('.err'), async () => {
    await api('/settings/favicon', { method: 'PUT', data: { icons } });
    toast('파비콘을 바꿨습니다. 브라우저 탭에는 새로고침 뒤에 보입니다.'); favVer = Date.now(); renderSide(); route();
  });
  $('[data-off]')?.addEventListener('click', (e) => confirmInline(e.currentTarget, '브라우저 탭 아이콘이 사이트에 원래 넣어 둔 아이콘으로 돌아갑니다. 머리글 로고는 그대로입니다.', '파비콘을 내립니다', async () => {
    await api('/settings/favicon', { method: 'DELETE' }); toast('파비콘을 내렸습니다.'); favVer = Date.now(); renderSide(); route();
  }));
}

// ───────── 검색엔진 ─────────
// 주소 한 줄: [이름 · 넣는 곳] 주소 [복사] [열기]
function urlRow(url, name = '', where = '', big = false) {
  const path = url.replace(/^https?:\/\/[^/]+/, '') || '/';
  return `<li class="${big ? 'big' : ''}">${name ? `<div><b>${esc(name)}</b> <small class="meta-inline">${esc(where)}</small></div>` : ''}
    <code class="copy" data-copy="${esc(url)}" role="button" tabindex="0" title="눌러서 복사">${esc(url)}</code>
    <span class="url-btns"><button class="btn sm" type="button" data-copy="${esc(url)}">복사</button><a class="btn sm" href="${esc(path)}" target="_blank" rel="noopener">열기</a></span></li>`;
}

async function seoPage(qs) {
  const d = await api('/settings/seo');
  const tab = qs.get('tab') || 'result';
  const consoles = {
    naver: ['네이버 서치어드바이저', 'https://searchadvisor.naver.com/', '사이트 등록 › 소유확인'],
    google: ['구글 서치콘솔', 'https://search.google.com/search-console', '소유권 확인 › HTML 태그'],
    bing: ['Bing 웹마스터도구', 'https://www.bing.com/webmasters', '사이트 추가 › HTML 메타 태그'],
  };
  main.innerHTML = `${head('사이트', '검색엔진', '네이버·구글에 사이트를 등록할 때 필요한 것들입니다. 검색 결과에 보이는 글과 소유권 확인, robots.txt를 여기서 정합니다.')}
    <div class="tabs" id="seotabs"></div>
    <form class="gap" id="seo-result" data-sec="result">
      <section class="panel pad"><h2>검색 결과에 보이는 글 <small class="meta">네이버·구글 검색 결과의 제목과 그 아래 두 줄입니다</small></h2>
        <label class="field"><span>제목</span><input class="input" name="title" maxlength="70" value="${esc(d.title)}" placeholder="${esc(d.siteName)}"><small>비우면 홈페이지 원래 제목이 그대로 쓰입니다.</small></label>
        <label class="field"><span>설명글 <b class="count" data-count>0 / 80자</b></span><textarea class="input" name="description" maxlength="300" placeholder="어떤 곳인지 한두 문장으로 적습니다. 예) ${esc(d.siteName)} 공식 홈페이지입니다. 소식과 안내를 전합니다.">${esc(d.description)}</textarea>
          <small>검색 결과에서 <b>제목 아래 두 줄</b>로 보입니다. <b>80자 이내</b>로 적어야 잘리지 않고 그대로 보입니다(검색엔진 최적화) — 넘으면 글자 수가 빨갛게 바뀝니다. 대화방 미리보기(카카오톡·페이스북)에도 이 글이 나갑니다 — 거기만 다르게 쓰려면 <a href="#/share">카카오톡 미리보기</a>에서 따로 적습니다.</small></label>
      </section>
      <section class="panel pad"><h2>소유권 확인 코드 <small class="meta">사이트를 등록할 때 「내 사이트가 맞다」를 증명하는 한 줄입니다</small></h2>
        <p class="meta">검색엔진이 준 <b>태그를 통째로 붙여넣어도 됩니다</b> — 저장할 때 필요한 값만 꺼냅니다. 확인이 끝난 뒤에도 지우지 마세요. 코드가 사라지면 소유권도 함께 풀립니다.</p>
        ${Object.entries(consoles).map(([k, [name, href, where]]) => `<label class="field"><span>${esc(d.engines[k].label)}</span>
          <input class="input" name="v_${k}" value="${esc(d.verify[k] || '')}" placeholder='&lt;meta name="…" content="여기 값" /&gt;' autocomplete="off">
          <small><a href="${href}" target="_blank" rel="noopener">${name}</a> › ${where}에서 받습니다.</small></label>`).join('')}
      </section>
      <section class="panel pad"><h2>구글 애드센스 <small class="meta">광고 코드와 ads.txt 를 사이트에 자동으로 넣습니다</small></h2>
        <label class="field"><span>애드센스 코드 스니펫</span>
          <input class="input" name="adsense" value="${esc(d.adsense || '')}" placeholder="애드센스 › 사이트 › 소유권 확인의 &lt;script async src=…adsbygoogle.js?client=ca-pub-…&gt; 를 그대로 붙여 넣으세요" autocomplete="off">
          <small><a href="https://adsense.google.com" target="_blank" rel="noopener">구글 애드센스</a> › 사이트 › 사이트 소유권 확인의 <b>애드센스 코드 스니펫</b>을 복사해 그대로 붙여 넣으세요(게시자 ID ca-pub-… 만 넣어도 됩니다). 저장하면 그 안의 게시자 ID 를 꺼내 씁니다. 저장하면 <b>모든 페이지 머리에 광고 코드</b>가 들어가고(없는 주소 화면 제외), <a href="/ads.txt" target="_blank" rel="noopener">ads.txt</a> 도 자동으로 나옵니다. 비우고 저장하면 광고 코드가 빠집니다. 애드센스에는 최상위 도메인(예: plators.com)으로만 사이트를 등록할 수 있습니다.</small></label>
      </section>
      ${saveBar('검색엔진 설정을 고치는 중입니다.', '')}
    </form>
    <section class="panel pad gap" data-sec="sitemap"><h2>등록할 주소 <small class="meta">구글 서치콘솔 · 네이버 서치어드바이저에 아래 주소를 넣습니다. 새 글과 새 메뉴는 저절로 들어가므로 <b>등록은 한 번뿐</b>입니다</small></h2>
      <ul class="url-list">
        ${urlRow(d.sitemapUrl, '사이트맵', '네이버 › 요청 › 사이트맵 제출 · 구글 › Sitemaps', true)}
        <li class="big"><div><b>구글 Sitemaps 입력칸용</b> <small class="meta-inline">구글은 앞 주소(${esc(d.origin || '')}/)가 이미 적혀 있어 뒤에 이것만 넣습니다</small></div>
          <code class="copy" data-copy="sitemap.xml" role="button" tabindex="0" title="눌러서 복사">sitemap.xml</code>
          <span class="url-btns"><button class="btn sm" type="button" data-copy="sitemap.xml">복사</button></span></li>
        ${urlRow(d.rssUrl, 'RSS', '네이버 › 요청 › RSS 제출 — 공개 게시판 최신 글 50개', true)}
        ${urlRow(`${d.origin}/robots.txt`, 'robots.txt', '네이버 › 검증 › robots.txt · 구글 › 설정 › robots.txt 에서 확인 — 내용은 robots.txt 탭에서 고칩니다', true)}
      </ul>
      <h2 class="gap">웹 페이지 수집 <small class="meta">네이버 › 요청 › 웹 페이지 수집 · 구글 › URL 검사에 하나씩 넣습니다. 사이트맵으로도 들어가므로 <b>빨리 보이게 하고 싶은 화면만</b> 넣어도 됩니다 (네이버는 하루 50개까지)</small></h2>
      <div class="actions"><button class="btn sm" type="button" data-copy-all>전부 복사 (${d.pages.length}개)</button></div>
      <ul class="url-list">${d.pages.map((u) => urlRow(u)).join('')}</ul>
    </section>
    <form class="gap" id="seo-robots" data-sec="robots">
      <section class="panel pad"><h2>robots.txt <small class="meta">검색엔진에게 긁어도 되는 곳을 알려 줍니다</small></h2>
        <p class="meta">${d.robots ? '이 사이트만의 내용을 쓰고 있습니다.' : '기본값이 나가고 있습니다. <b>그대로 두어도 됩니다.</b>'}</p>
        <div class="field"><span>지금 나가는 내용</span><pre class="robots-now" data-now>불러오는 중…</pre></div>
        <label class="field"><span>직접 쓰기</span><textarea class="input mono" name="robots" rows="7" placeholder="비워 두면 위의 기본값이 그대로 나갑니다">${esc(d.robots)}</textarea>
          <small><b>사이트맵 줄은 적지 마세요</b> — 주소가 바뀌어도 맞도록 자동으로 붙습니다.</small></label>
        ${d.robots ? '<div class="actions"><button class="btn" type="button" data-reset>기본값으로 되돌리기</button></div>' : ''}
      </section>
      ${saveBar('robots.txt를 고치는 중입니다.', '')}
    </form>`;
  const show = (k) => { $$('[data-sec]').forEach((el) => { el.hidden = el.dataset.sec !== k; }); };
  pillTabs($('#seotabs'), [['result', '검색 결과와 소유권'], ['sitemap', '등록할 주소'], ['robots', 'robots.txt']], tab, show);
  show(tab);
  const desc = $('#seo-result [name=description]');
  charLimit(desc, $('[data-count]'), 80);
  const fr = $('#seo-result');
  ctrlS(fr);
  fr.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(fr);
    busy(fr.querySelector('[type=submit]'), null, async () => {
      await api('/settings/seo', { method: 'PUT', data: { title: f.title, description: f.description, verify: { naver: f.v_naver, google: f.v_google, bing: f.v_bing }, adsense: f.adsense } });
      dirty = false; toast('검색엔진 설정을 저장했습니다.'); go('#/seo?tab=result');
    });
  });
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('복사하지 못했습니다. 주소를 직접 골라 복사해 주세요.'); } };
  // 주소 글자에 초점이 있을 때 Enter · Space 도 복사
  $('[data-sec=sitemap]').addEventListener('keydown', (e) => {
    const c = e.target.closest('code[data-copy]');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); c.click(); }
  });
  $('[data-sec=sitemap]').addEventListener('click', (e) => {
    const one = e.target.closest('[data-copy]');
    if (one) copy(one.dataset.copy, `복사했습니다 — ${one.dataset.copy}`);
    else if (e.target.closest('[data-copy-all]')) copy(d.pages.join(String.fromCharCode(10)), `주소 ${d.pages.length}개를 한 줄에 하나씩 복사했습니다.`);
  });
  fetch('/robots.txt', { cache: 'no-store' }).then((r) => r.text()).then((t) => { $('[data-now]').textContent = t; }).catch(() => { $('[data-now]').textContent = '지금 나가는 내용을 읽어 오지 못했습니다.'; });
  const rf = $('#seo-robots');
  rf.addEventListener('input', () => { dirty = true; });
  rf.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(rf.querySelector('[type=submit]'), null, async () => {
      await api('/settings/robots', { method: 'PUT', data: { robots: rf.robots.value } });
      dirty = false; toast('robots.txt를 저장했습니다.'); go('#/seo?tab=robots');
    });
  });
  $('[data-reset]')?.addEventListener('click', (e) => confirmInline(e.currentTarget, '직접 쓴 내용을 지우고 기본값으로 돌아갑니다.', '되돌립니다', async () => {
    await api('/settings/robots', { method: 'PUT', data: { robots: '' } }); dirty = false; toast('기본값으로 되돌렸습니다.'); go('#/seo?tab=robots');
  }));
}

// ───────── 카카오톡 미리보기 ─────────
async function sharePage() {
  const d = await api('/settings/share');
  const host = d.origin.replace(/^https?:[/][/]/, '');
  main.innerHTML = `${head('사이트', '카카오톡 미리보기', '주소를 대화방에 붙여넣었을 때 뜨는 글과 그림입니다. 페이스북·문자 미리보기도 같은 값을 씁니다.')}
    <div class="share-grid">
      <div>
        <form class="panel pad" id="share-form"><h2>미리보기 설명 <small class="meta">대화방에서 제목 아래 작은 글씨로 붙습니다</small></h2>
          <label class="field"><span>설명 <b class="count" data-share-count>0 / 80자</b></span><textarea class="input" name="share_description" maxlength="200" placeholder="대화방에 붙을 설명을 적어 주세요">${esc(d.share_description || d.seo_description || '')}</textarea>
            <small>${d.share_description ? '이 화면에서 따로 적은 설명입니다.' : '지금은 <b>검색엔진 화면의 설명글</b>이 그대로 들어가 있습니다. 고쳐서 저장하면 대화방에는 고친 글이 나갑니다.'} 대화방에서는 두 줄쯤에서 잘리니 <b>40~80자</b>가 알맞습니다. 비우고 저장하면 검색엔진 설명글을 따라갑니다.</small></label>
          ${saveBar('미리보기 설명을 고치는 중입니다.', '')}
        </form>
        <section class="panel pad"><h2>미리보기 그림 <small class="meta">대화방에서 글 위에 크게 뜨는 그림입니다</small></h2>
          ${d.image ? `<img class="share-now" src="/xms/file/og?v=${d.image.updated_at}" alt="지금 쓰는 미리보기 그림"><div class="actions gap"><button class="btn danger" type="button" data-off>그림 내리기</button></div>`
            : '<p class="meta">아직 없습니다. 없으면 홈페이지에 원래 넣어 둔 그림이 나갑니다.</p>'}
          <h2 class="gap">그림 바꾸기 <small class="meta">어떤 사진 · 그림이든 올려도 됩니다</small></h2>
          <div data-pick></div>
          <p class="meta gap">고르면 대화방에 보일 부분(가로로 긴 1200×630)을 직접 맞추는 창이 뜹니다. 끌어서 옮기고 크기를 맞춘 뒤 <b>이 사진 쓰기</b>를 누르면 <b>바로 저장</b>됩니다.<br>바꿔도 카카오톡은 한동안 옛 그림을 보여 줍니다 — 급하면 <a href="https://developers.kakao.com/tool" target="_blank" rel="noopener">카카오 개발자도구</a>에서 캐시를 지웁니다.</p>
          <p class="err" role="alert"></p>
        </section>
      </div>
      <aside class="panel pad share-pv-box"><h2>미리보기</h2>
        <div class="kakao"><div class="kakao-card"><div class="kakao-img" data-pv-img>${d.image ? `<img src="/xms/file/og?v=${d.image.updated_at}" alt="">` : '<span>그림 없음</span>'}</div>
          <div class="kakao-t"><b>${esc(d.seo_title || d.siteName)}</b><p data-pv-desc></p><small>${esc(host)}</small></div></div></div>
        <p class="meta">대화방에서 대략 이렇게 보입니다.</p>
      </aside>
    </div>`;
  const form = $('#share-form');
  ctrlS(form);
  const ta = form.share_description;
  const pv = () => { $('[data-pv-desc]').textContent = ta.value.trim() || d.seo_description || ''; };
  ta.addEventListener('input', pv); pv();
  charLimit(ta, $('[data-share-count]'), 80);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), null, async () => {
      // 검색엔진 설명글과 똑같으면 따로 두지 않는다 (그 글을 고치면 여기도 따라가게)
      const v = ta.value.trim() === (d.seo_description || '').trim() ? '' : ta.value;
      await api('/settings/share', { method: 'PUT', data: { share_description: v } }); dirty = false; toast('미리보기 설명을 저장했습니다.'); route();
    });
  });
  // 그림을 고르고 맞추는 창에서 '이 사진 쓰기'를 누르면 바로 저장한다
  //   (따로 저장 버튼을 두었더니, 맞춘 뒤에도 '아직 없습니다'가 남아 안 올라간 줄 알았다 — 2026-11-04)
  imagePicker($('[data-pick]'), (file) => busy(null, $('.share-grid .err'), async () => {
    if (!/^image\//.test(file.type)) throw new Error('그림 파일을 골라 주세요.');
    // 대화방에 보일 부분을 직접 맞춘다 (1200×630, 카카오톡이 잘 읽는 JPEG)
    const cut = await cropImage(file, { w: 1200, h: 630, type: 'image/jpeg', title: '카톡 미리보기 그림 맞추기', help: '이 틀 안이 대화방에 보입니다 · 끌어서 옮기고, 벌리거나 아래 막대로 크게 · 작게' });
    if (!cut) return;
    const image = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(cut); });
    $('[data-pv-img]').innerHTML = `<img src="${image}" alt="">`;
    const pick = $('[data-pick] .drop b'); if (pick) pick.textContent = '저장하는 중…';
    await api('/settings/share/image', { method: 'PUT', data: { image } }); toast('미리보기 그림을 바꿨습니다.'); route();
  }));
  $('[data-off]')?.addEventListener('click', (e) => confirmInline(e.currentTarget, '대화방 미리보기에 홈페이지에 원래 넣어 둔 그림이 대신 나갑니다.', '그림을 내립니다', async () => {
    await api('/settings/share/image', { method: 'DELETE' }); toast('그림을 내렸습니다.'); route();
  }));
}

// ───────── 팝업 ─────────
const POPUP_STATUS = { WAITING: '대기', OPEN: '노출', CLOSED: '종료' };
const POPUP_MODE = { TODAY: '오늘 하루 열지 않음', FOREVER: '다시 열지 않음', ALWAYS: '기간 내 무조건 열림' };
const fmtDay = (s) => `${s.replace(/-/g, '. ')}.`;
const period = (p) => (p.starts_at || p.ends_at ? `${p.starts_at ? fmtDay(p.starts_at) : '지금'} ~ ${p.ends_at ? fmtDay(p.ends_at) : '계속'}` : '기간 없음 (계속)');
async function popupsPage(qs) {
  const list = await api('/popups');
  const tab = qs.get('tab') || 'all';
  const live = list.filter((p) => p.bucket === 'live').length;
  const shown = tab === 'all' ? list : list.filter((p) => p.bucket === tab);
  const sortableOn = tab === 'all';
  main.innerHTML = `${head('사이트', '팝업', live ? `지금 홈 화면에 팝업 ${live}개가 떠 있습니다. 여러 개면 모두 나란히 보이고, 누르면 크게 볼 수 있습니다.` : '홈 화면에 들어온 방문자에게 창을 띄웁니다. 여러 개를 켜면 모두 나란히 보이고, 방문자가 누르면 크게 볼 수 있습니다.', '<a class="btn primary" href="#/popups/new">+ 팝업 만들기</a>')}
    ${list.length ? `<div class="tabs" id="ptabs"></div>
      <p class="meta gap">${tab === 'expired' ? '기간이 지난 팝업입니다. 다시 쓰려면 열어서 기간만 고치면 됩니다.' : sortableOn ? '줄을 끌어서 차례를 바꿀 수 있습니다 — 여러 개가 함께 뜨면 방문자가 이 차례로 넘겨 봅니다.' : '차례는 [전체]에서 끌어서 바꿉니다.'}</p>
      <div class="panel">${shown.length ? `<table class="tbl cardy"><thead><tr>${sortableOn ? '<th>차례</th>' : ''}<th>그림</th><th>이름</th><th>노출 기간</th><th>상태</th><th>운영 모드</th><th>관리</th></tr></thead><tbody id="prows">
        ${shown.map((p) => `<tr data-id="${p.id}">${sortableOn ? '<td><button type="button" class="handle" aria-label="끌어서 차례 바꾸기">⠿</button></td>' : ''}
          <td>${p.image ? `<img class="pop-thumb" src="${esc(p.image)}" alt="">` : '<span class="tag">글만</span>'}</td>
          <td><b>${esc(p.title)}</b>${p.link_url ? `<small>누르면 → ${esc(p.link_url)}</small>` : ''}</td>
          <td data-l="노출 기간">${esc(period(p))}</td>
          <td data-l="상태">${p.bucket === 'live' ? '<span class="tag green">노출중</span>' : p.bucket === 'expired' ? '<span class="tag warn">만료</span>' : `<span class="tag">${POPUP_STATUS[p.status]}</span>`}</td>
          <td data-l="운영 모드">${POPUP_MODE[p.close_mode]}</td>
          <td><div class="mng"><a class="btn sm" href="#/popups/${p.id}">수정</a><button class="btn sm danger" type="button" data-del>삭제</button></div></td></tr>`).join('')}</tbody></table>`
        : empty('이 칸에 해당하는 팝업이 없습니다', '')}</div>`
    : `<div class="panel">${empty('아직 팝업이 없습니다', '행사 안내나 공지처럼, 홈에 들어온 분께 먼저 보여드릴 것을 만들어 보세요.', '<a class="btn primary" href="#/popups/new">첫 팝업 만들기</a>')}</div>`}`;
  if (!list.length) return;
  pillTabs($('#ptabs'), [['all', '전체'], ['live', '노출중'], ['idle', '대기·숨김'], ['expired', '날짜만료']], tab, (v) => go(`#/popups?tab=${v}`));
  if (sortableOn && shown.length) {
    sortable($('#prows'), { rowSel: 'tr[data-id]', onDrop: (rows) => busy(null, null, async () => {
      await api('/popups/order', { method: 'PUT', data: { ids: rows.map((r) => Number(r.id)) } }); toast('차례를 저장했습니다.');
    }) });
  }
  $$('#prows tr').forEach((tr) => {
    const p = list.find((x) => x.id === +tr.dataset.id);
    tr.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(p.title)}" 팝업을 지웁니다. 되돌릴 수 없습니다.`, '팝업 삭제', async () => {
      await api(`/popups/${p.id}`, { method: 'DELETE' }); toast('팝업을 지웠습니다.'); route();
    });
  });
}

async function popupPage(id) {
  const p = id ? await api(`/popups/${id}`) : { title: '', body: '', link_url: '', starts_at: '', ends_at: '', status: 'OPEN', close_mode: 'TODAY', image: null };
  let image; // undefined = 그대로, null = 빼기, data URL = 새 그림
  let shown = p.image;
  main.innerHTML = `${head('사이트 › 팝업', id ? '팝업 수정' : '팝업 만들기', '')}
    <form id="pform"><div class="pop-grid"><div>
      <section class="panel pad"><h2>노출 설정</h2>
        <label class="field"><span>팝업 이름</span><input class="input" name="title" required maxlength="60" value="${esc(p.title)}" placeholder="예시: 휴무 안내"><small>관리용 이름입니다. 방문자에게는 보이지 않습니다.</small></label>
        <div class="field"><span>노출 기간</span><div class="row2"><input class="input" type="date" name="starts_at" value="${esc(p.starts_at)}" aria-label="시작일"><input class="input" type="date" name="ends_at" value="${esc(p.ends_at)}" aria-label="끝나는 날"></div>
          <small>비워 두면 시작은 지금부터, 끝은 정하지 않습니다. 끝나는 날까지 뜹니다.</small></div>
        <fieldset class="field"><legend>상태</legend><div class="choices">${Object.entries(POPUP_STATUS).map(([k, l]) => `<label class="check"><input type="radio" name="status" value="${k}"${p.status === k ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
        <fieldset class="field"><legend>운영 모드</legend><div class="choices">${Object.entries(POPUP_MODE).map(([k, l]) => `<label class="check"><input type="radio" name="close_mode" value="${k}"${p.close_mode === k ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
        <label class="field"><span>링크 연결</span><input class="input" name="link_url" value="${esc(p.link_url)}" placeholder="/board/notice/12 또는 https://…"><small>링크를 넣으면 새 창에서 띄웁니다.</small></label>
      </section>
      <section class="panel pad"><h2>팝업 사진 업로드</h2>
        <div data-cur></div><div data-pick></div>
        <label class="field gap"><span>본문</span><textarea class="input" name="body" maxlength="2000" placeholder="예시: 10월 3일은 쉽니다. 4일부터 정상 운영합니다.">${esc(p.body)}</textarea><small>선택 항목입니다. 적으면 그림 아래에 글자로 나갑니다.</small></label>
      </section>
    </div>
    <aside class="panel pad pop-pv-box"><h2>미리보기</h2><p class="meta">지금 적은 값 그대로, 방문자에게 어떻게 보이는지 확인합니다.</p>
      <div class="pop-pv"><span class="pv-close">팝업닫기 ✕</span><div class="pv-card" data-pv></div><span class="pv-hide" data-pv-hide></span></div>
      <p class="meta">홈에서는 기간이 겹치는 다른 팝업과 <b>한 창 안에서 좌우로 넘어갑니다</b>.</p>
    </aside></div>
    <p class="err" role="alert"></p>
    ${saveBar(id ? '팝업을 고치는 중입니다.' : '새 팝업을 만드는 중입니다.', '#/popups')}</form>`;
  const form = $('#pform');
  ctrlS(form);
  const pv = () => {
    const f = formData(form);
    $('[data-pv]').innerHTML = shown || f.body.trim()
      ? `${shown ? `<img src="${esc(shown)}" alt="">` : ''}${f.body.trim() ? `<p>${esc(f.body)}</p>` : ''}`
      : '<p class="pv-empty">그림도 본문도 없습니다. 둘 중 하나는 있어야 저장됩니다.</p>';
    const hide = $('[data-pv-hide]');
    hide.hidden = f.close_mode === 'ALWAYS';
    hide.textContent = `☐ ${f.close_mode === 'FOREVER' ? '다시 보지 않기' : '오늘 하루 보지 않기'}`;
  };
  const cur = () => {
    $('[data-cur]').innerHTML = shown ? `<img class="pic-shot" src="${esc(shown)}" alt="팝업에 들어갈 그림"><p class="meta">방문자에게 이 그림이 그대로 보입니다. 세로로 긴 그림도 괜찮습니다 — 창이 그림에 맞춰 늘어납니다.</p>
      <div class="actions"><button class="btn sm danger" type="button" data-rm>그림 빼기</button></div>` : '';
    $('[data-rm]')?.addEventListener('click', () => { image = null; shown = null; dirty = true; cur(); pv(); });
  };
  imagePicker($('[data-pick]'), async (file) => {
    try { const img = await loadImage(file); image = fitWebp(img, 1200, 700000); shown = image; dirty = true; cur(); pv(); } catch (e) { toast(e.message); }
  });
  form.addEventListener('input', pv); form.addEventListener('change', pv);
  cur(); pv();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = { ...formData(form) };
    if (image !== undefined) data.image = image;
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (!form.reportValidity()) return;
      if (id) await api(`/popups/${id}`, { method: 'PUT', data }); else await api('/popups', { method: 'POST', data });
      dirty = false; toast(id ? '팝업을 저장했습니다.' : '팝업을 만들었습니다.'); go('#/popups');
    });
  });
}

// ───────── 강의 (강의 → 섹션 → 차시 영상) ─────────
const THUMB_LABEL = { red: '빨강', black: '검정', split: '빨강 · 검정 반반' };
const fmtDur = (sec) => { sec = Number(sec) || 0; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
const fmtTotal = (sec) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return sec ? `${h ? `${h}시간 ` : ''}${m}분` : '-'; };
const durSec = (t) => String(t || '').trim().split(':').map((x) => parseInt(x, 10) || 0).reduce((a, x) => a * 60 + x, 0);
const thumbChip = (c) => `<span class="c-thumb t-${esc(c.thumb)}"><b>${esc(c.no_label || c.title.slice(0, 6))}</b></span>`;

async function coursesPage() {
  const list = await api('/courses');
  main.innerHTML = `${head('강의', '강의 관리', '홈페이지 [강의] 메뉴에 나오는 강의입니다. 줄을 끌어서 목록 차례를 바꿀 수 있습니다.', '<a class="btn primary" href="#/courses/new">+ 강의 만들기</a>')}
    <div class="panel">${list.length ? `<table class="tbl cardy"><thead><tr><th>차례</th><th>썸네일</th><th>강의</th><th>분야 · 수준</th><th>강의 수</th><th>수강생</th><th>공개</th><th>관리</th></tr></thead><tbody id="crows">
      ${list.map((c) => `<tr data-id="${c.id}"><td><button type="button" class="handle" aria-label="끌어서 차례 바꾸기">⠿</button></td>
        <td>${thumbChip(c)}</td>
        <td><b>${esc(c.title)}</b><small>${esc(c.description.slice(0, 60))}</small></td>
        <td data-l="분야 · 수준">${esc([c.track, c.level].filter(Boolean).join(' · ') || '-')}</td>
        <td data-l="강의">강의 ${c.lessons}개 · ${fmtTotal(c.total_sec)}</td>
        <td data-l="수강생">${c.students}명</td>
        <td data-l="공개">${c.visible ? '<span class="tag green">공개</span>' : '<span class="tag">숨김</span>'}</td>
        <td><div class="mng"><a class="btn sm" href="#/courses/${c.id}">수정</a><a class="btn sm" href="/course.html?id=${c.id}" target="_blank" rel="noopener">보기</a><button class="btn sm danger" type="button" data-del>삭제</button></div></td></tr>`).join('')}
      </tbody></table>` : empty('아직 강의가 없습니다', '강의를 만들고 섹션 · 차시에 YouTube · Vimeo 영상 주소를 붙여 넣으면 홈페이지에 바로 나옵니다.', '<a class="btn primary" href="#/courses/new">첫 강의 만들기</a>')}</div>
    <p class="meta gap">수강 권한: 강의마다 <b>볼 수 있는 등급</b>을 고릅니다. 회원의 등급은 <a href="#/members">가입회원</a>에서 바꿉니다. <b>맛보기</b> 차시는 누구나 볼 수 있습니다.</p>`;
  if (!list.length) return;
  sortable($('#crows'), { rowSel: 'tr[data-id]', onDrop: (rows) => busy(null, null, async () => {
    await api('/courses/order', { method: 'PUT', data: { ids: rows.map((r) => Number(r.id)) } }); toast('차례를 저장했습니다.');
  }) });
  $$('#crows tr').forEach((tr) => {
    const c = list.find((x) => x.id === +tr.dataset.id);
    tr.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(c.title)}" 강의를 지웁니다. 홈페이지에서 바로 사라집니다.`, '강의 삭제', async () => {
      await api(`/courses/${c.id}`, { method: 'DELETE' }); toast('강의를 지웠습니다.'); route();
    });
  });
}

let tmpId = 0;
function lessonRow(l = {}) {
  return `<div class="cl-row" data-id="${l.id || `n${++tmpId}`}" data-lid="${l.id || ''}">
    <button type="button" class="handle l-handle" aria-label="끌어서 차시 차례 바꾸기">⠿</button>
    <input class="input cl-t" maxlength="150" value="${esc(l.title || '')}" placeholder="차시 제목" aria-label="차시 제목">
    <input class="input cl-v" maxlength="500" value="${esc(l.video_url || '')}" placeholder="https://youtu.be/… 또는 https://vimeo.com/…" aria-label="영상 주소">
    <input class="input cl-d" maxlength="8" value="${l.duration_sec ? fmtDur(l.duration_sec) : ''}" placeholder="12:30" aria-label="길이 (분:초)">
    <label class="check cl-f"><input type="checkbox" class="cl-free"${l.is_free ? ' checked' : ''}> 맛보기</label>
    <button type="button" class="btn sm danger cl-x" data-del-lesson aria-label="차시 지우기">✕</button>
  </div>`;
}
function sectionBox(s = {}) {
  return `<div class="cs-box" data-id="${s.id || `n${++tmpId}`}" data-sid="${s.id || ''}">
    <div class="cs-head"><button type="button" class="handle s-handle" aria-label="끌어서 섹션 차례 바꾸기">⠿</button>
      <input class="input cs-t" maxlength="100" value="${esc(s.title || '')}" placeholder="섹션 이름 (예: 1장 · 소리의 단위)" aria-label="섹션 이름">
      <button type="button" class="btn sm danger" data-del-section>섹션 지우기</button></div>
    <div class="cl-list">${(s.lessons || []).map(lessonRow).join('')}</div>
    <button type="button" class="btn sm cl-add" data-add-lesson>+ 차시 추가</button>
  </div>`;
}

async function coursePage(id) {
  const [c, all] = await Promise.all([id ? api(`/courses/${id}`) : null, api('/courses')]);
  const v = c || { title: '', no_label: '', track: '', level: '', thumb: 'red', description: '', who: [], learn: [], view_levels: [1, 2, 3, 4, 5, 6, 7, 8], visible: true, opened_on: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), sections: [{ title: '', lessons: [{}] }] };
  const opts = (k) => [...new Set(all.map((x) => x[k]).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join('');
  main.innerHTML = `${head('강의 › 강의 관리', id ? '강의 수정' : '강의 만들기', id ? `<a href="/course.html?id=${id}" target="_blank" rel="noopener">홈페이지에서 보기 ↗</a>` : '')}
    <form id="cform" class="gap">
      <section class="panel pad"><h2>기본 정보</h2>
        <label class="field"><span>강의 이름</span><input class="input" name="title" required maxlength="100" value="${esc(v.title)}" placeholder="예: 정보의 계층화 — 2차 · 3차 정보 조립"></label>
        <div class="row2">
          <label class="field"><span>분야 <small class="meta">목록 위 탭이 됩니다</small></span><input class="input" name="track" list="dl-track" maxlength="30" value="${esc(v.track)}" placeholder="Sound · Build · 실전"><datalist id="dl-track">${opts('track')}</datalist></label>
          <label class="field"><span>수준</span><input class="input" name="level" list="dl-level" maxlength="20" value="${esc(v.level)}" placeholder="입문 · 기초 · 중급"><datalist id="dl-level">${opts('level')}</datalist></label>
        </div>
        <div class="row2">
          <label class="field"><span>썸네일 큰 글자</span><input class="input" name="no_label" maxlength="30" value="${esc(v.no_label)}" placeholder="예: Build 2"><small>숫자는 노란색으로 보입니다.</small></label>
          <label class="field"><span>등록일 <small class="meta">최근순 정렬에 씁니다</small></span><input class="input" type="date" name="opened_on" value="${esc(v.opened_on)}"></label>
        </div>
        <fieldset class="field"><legend>썸네일 색</legend><div class="choices">${Object.entries(THUMB_LABEL).map(([k, l]) => `<label class="check"><input type="radio" name="thumb" value="${k}"${v.thumb === k ? ' checked' : ''}> <span class="c-sw t-${k}"></span>${l}</label>`).join('')}</div></fieldset>
        <label class="check"><input type="checkbox" name="visible"${v.visible ? ' checked' : ''}> 홈페이지에 공개합니다</label>
      </section>
      <section class="panel pad"><h2>소개</h2>
        <label class="field"><span>한 줄 소개</span><textarea class="input" name="description" maxlength="1000" rows="2" placeholder="목록 카드와 상세 화면 위에 나옵니다.">${esc(v.description)}</textarea></label>
        <div class="row2">
          <label class="field"><span>이런 분께 권해요 <small class="meta">한 줄에 하나</small></span><textarea class="input" name="who" rows="5">${esc(v.who.join('\n'))}</textarea></label>
          <label class="field"><span>이 강의에서 배우는 것 <small class="meta">한 줄에 하나</small></span><textarea class="input" name="learn" rows="5">${esc(v.learn.join('\n'))}</textarea></label>
        </div>
      </section>
      <section class="panel pad"><h2>볼 수 있는 등급 <small class="meta">맛보기 차시는 누구나 봅니다</small></h2>
        ${levelChecks('view_levels', v.view_levels)}
        <p class="meta gap">수강 권한을 주려면 <a href="#/members">가입회원</a>에서 그 회원의 등급을 여기서 고른 등급으로 바꿉니다. 등급 이름은 <a href="#/levels">등급 이름</a>에서 바꿀 수 있습니다 (예: 8등급 → 수강생).</p>
      </section>
      <section class="panel pad"><h2>커리큘럼 <small class="meta" data-cur-sum></small></h2>
        <p class="meta">섹션 · 차시는 ⠿ 를 끌어서 차례를 바꿉니다. 영상 주소는 YouTube · Vimeo 의 공유 주소를 그대로 붙여 넣으세요. 제목 · 길이가 비어 있으면 자동으로 채워 봅니다.</p>
        <div class="cs-list" id="cs-list">${(v.sections.length ? v.sections : [{ lessons: [{}] }]).map(sectionBox).join('')}</div>
        <button type="button" class="btn" id="cs-add">+ 섹션 추가</button>
      </section>
      <p class="err" role="alert"></p>
      ${id ? '<section class="panel pad"><h2>강의 지우기</h2><p class="meta">지우면 홈페이지에서 바로 사라집니다.</p><button type="button" class="btn danger" id="c-del">이 강의 지우기</button></section>' : ''}
      ${saveBar(id ? '강의를 고치는 중입니다.' : '새 강의를 만드는 중입니다.', '#/courses')}
    </form>`;
  const form = $('#cform');
  const box = $('#cs-list');
  ctrlS(form);
  $$('[data-all]', form).forEach((b) => b.addEventListener('click', () => { $$(`input[name="${b.dataset.all}"]`, form).forEach((i) => { i.checked = true; }); dirty = true; }));
  $$('[data-none]', form).forEach((b) => b.addEventListener('click', () => { $$(`input[name="${b.dataset.none}"]`, form).forEach((i) => { i.checked = false; }); dirty = true; }));
  const sum = () => {
    const rows = $$('.cl-row', box);
    const sec = rows.reduce((n, r) => n + durSec(r.querySelector('.cl-d').value), 0);
    $('[data-cur-sum]').textContent = `섹션 ${$$('.cs-box', box).length}개 · 차시 ${rows.length}개 · ${fmtTotal(sec)}`;
  };
  const wire = () => {
    $$('.cl-list', box).forEach((list) => {
      if (list.dataset.wired) return;
      list.dataset.wired = '1';
      sortable(list, { rowSel: '.cl-row', handleSel: '.l-handle', onDrop: () => { dirty = true; } });
    });
    sum();
  };
  sortable(box, { rowSel: '.cs-box', handleSel: '.s-handle', onDrop: () => { dirty = true; } });
  box.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-add-lesson]')) {
      const list = t.closest('.cs-box').querySelector('.cl-list');
      list.insertAdjacentHTML('beforeend', lessonRow());
      list.lastElementChild.querySelector('.cl-t').focus();
      dirty = true; sum();
    }
    if (t.closest('[data-del-lesson]')) { t.closest('.cl-row').remove(); dirty = true; sum(); }
    if (t.closest('[data-del-section]')) {
      const sb = t.closest('.cs-box');
      const n = $$('.cl-row', sb).length;
      const kill = () => { sb.remove(); dirty = true; sum(); };
      if (n) confirmInline(t.closest('button'), `이 섹션과 차시 ${n}개를 지웁니다. 저장해야 반영됩니다.`, '섹션 지우기', async () => kill()); else kill();
    }
  });
  box.addEventListener('input', (e) => { if (e.target.matches('.cl-d')) sum(); });
  // 영상 주소를 붙여 넣으면 제목 · 길이가 비어 있을 때만 채운다 (Vimeo 는 길이까지, YouTube 는 제목)
  box.addEventListener('change', async (e) => {
    if (!e.target.matches('.cl-v')) return;
    const row = e.target.closest('.cl-row');
    const url = e.target.value.trim();
    if (!/^https:\/\//.test(url)) return;
    try {
      let d = null;
      if (/vimeo\.com/.test(url)) d = await (await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`)).json();
      else if (/youtu\.?be/.test(url)) d = await (await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)).json();
      if (!d) return;
      const t = row.querySelector('.cl-t'); const du = row.querySelector('.cl-d');
      if (!t.value.trim() && d.title) t.value = d.title;
      if (!du.value.trim() && d.duration) du.value = fmtDur(d.duration);
      sum();
    } catch { /* 못 가져오면 손으로 */ }
  });
  $('#cs-add').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', sectionBox({ lessons: [{}] })); wire(); box.lastElementChild.querySelector('.cs-t').focus(); dirty = true; });
  $('#c-del')?.addEventListener('click', (e) => confirmInline(e.currentTarget, `"${esc(v.title)}" 강의를 지웁니다.`, '강의 삭제', async () => {
    await api(`/courses/${id}`, { method: 'DELETE' }); dirty = false; toast('강의를 지웠습니다.'); go('#/courses');
  }));
  wire();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (!form.reportValidity()) return;
      const f = formData(form);
      const sections = $$('.cs-box', box).map((sb) => ({
        id: Number(sb.dataset.sid) || null,
        title: sb.querySelector('.cs-t').value,
        lessons: $$('.cl-row', sb).map((r) => ({
          id: Number(r.dataset.lid) || null, title: r.querySelector('.cl-t').value, video_url: r.querySelector('.cl-v').value.trim(),
          duration: r.querySelector('.cl-d').value, is_free: r.querySelector('.cl-free').checked,
        })).filter((l) => l.title.trim() || l.video_url),
      }));
      const data = {
        title: f.title, no_label: f.no_label, track: f.track, level: f.level, thumb: f.thumb, opened_on: f.opened_on, visible: !!f.visible,
        description: f.description, who: f.who, learn: f.learn, view_levels: f.view_levels || [], sections,
      };
      if (id) await api(`/courses/${id}`, { method: 'PUT', data });
      else { const r = await api('/courses', { method: 'POST', data }); dirty = false; toast('강의를 만들었습니다.'); return go(`#/courses/${r.id}`); }
      dirty = false; toast('강의를 저장했습니다.'); route();
    });
  });
}

// ───────── 부가 기능 (맨 위로 버튼 …) ─────────
async function extrasPage() {
  const v = await api('/options/top');
  main.innerHTML = `${head('사이트', '부가 기능', '홈페이지에 함께 붙는 작은 기능입니다.')}
    <form id="xform"><section class="panel pad"><h2>맨 위로 버튼</h2>
      <div class="top-pv" aria-hidden="true"><span class="top-pv-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></span></div>
      <label class="check"><input type="checkbox" name="on"${v.on ? ' checked' : ''}> 스크롤을 내리면 오른쪽 아래에 <b>맨 위로</b> 버튼을 띄웁니다</label>
      <label class="field gap"><span>이 주소로 시작하는 페이지에는 띄우지 않기 <small class="meta">한 줄에 하나, / 로 시작 (예: /app)</small></span>
        <textarea class="input" name="except" rows="3" placeholder="/app">${esc((v.except || []).join('\n'))}</textarea></label>
    </section>
    <p class="err" role="alert"></p>
    ${saveBar('부가 기능을 고치는 중입니다.', '')}</form>`;
  const form = $('#xform');
  ctrlS(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      const f = formData(form);
      await api('/options/top', { method: 'PUT', data: { on: !!f.on, except: f.except } });
      dirty = false; toast('저장했습니다. 30초 안에 홈페이지에 반영됩니다.'); route();
    });
  });
}

start();

// ───────── 신청서 (사이트 기능 'apply') — 폰에서도 카드로 바로 열어 본다 ─────────
const AP_STATE = { open: ['green', '접수 중'], soon: ['blue', '예정'], closed: ['gray', '마감'], hidden: ['warn', '감춤'] };
const AP_TAG = { SUBMITTED: 'blue', CHECKED: 'warn', SELECTED: 'green', REJECTED: 'gray' };
const AP_STATUS = { SUBMITTED: '접수', CHECKED: '서류 확인', SELECTED: '선정', REJECTED: '미선정' };
const apTag = (st) => `<span class="tag ${AP_TAG[st] || ''}">${AP_STATUS[st] || esc(st)}</span>`;
const roundTag = (r) => `<span class="tag ${AP_STATE[r.state][0]}">${AP_STATE[r.state][1]}</span>`;

async function applyList(qs) {
  const { rounds } = await api('/apply/rounds');
  if (!rounds.length) {
    main.innerHTML = `${head('신청서', '신청서 보기', '')}<div class="panel">${empty('아직 신청 기간이 없습니다', '신청 기간을 만들면 그 기간에만 홈페이지에서 신청서를 받습니다.', '<a class="btn primary" href="#/apply/rounds/new">신청 기간 만들기</a>')}</div>`;
    return;
  }
  const r = rounds.find((x) => x.id === Number(qs.get('round'))) || rounds.find((x) => x.state === 'open') || rounds[0];
  let st = qs.get('st') || 'all';
  const list = await api(`/apply/list?round=${r.id}`);
  const count = (k) => list.filter((a) => a.status === k).length;
  main.innerHTML = `${head('신청서', '신청서 보기', `${roundTag(r)} ${esc(r.title)} · ${esc(r.period)}`, list.length ? `<a class="btn green" href="/xms-api/admin/apply/export?round=${r.id}">엑셀로 내려받기</a>` : '')}
    ${rounds.length > 1 ? `<label class="field apl-round"><span>신청 기간</span><select class="input" id="apl-round">${rounds.map((x) => `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${esc(x.title)} (${esc(x.period)}) · ${x.count}명</option>`).join('')}</select></label>` : ''}
    <div class="apl-bar"><div class="tabs" id="apl-tabs"></div><input class="input apl-q" id="apl-q" type="search" placeholder="이름 · 학과 · 학번 찾기"></div>
    <div id="apl-list"></div>`;
  const card = (a) => `<a class="apl-card" href="#/apply/${a.id}">
      <span class="apl-top"><b>${esc(a.name)}</b>${apTag(a.status)}</span>
      <span class="apl-line">${esc([a.dept, a.student_no, a.state].filter(Boolean).join(' · '))}</span>
      <span class="apl-line">성적 <b>${esc(a.gpa)}</b> · ${esc(a.role)}</span>
      <small>${fmtDate(a.created_at, true)} 접수${a.updated_at > a.created_at + 60000 ? ' · 고침' : ''}</small></a>`;
  const draw = () => {
    const q = $('#apl-q').value.trim();
    const shown = list.filter((a) => (st === 'all' || a.status === st) && (!q || [a.name, a.dept, a.student_no, a.mobile].join(' ').includes(q)));
    $('#apl-list').innerHTML = shown.length ? `<div class="apl-cards">${shown.map(card).join('')}</div>`
      : `<div class="panel">${list.length ? empty('조건에 맞는 신청서가 없습니다', '')
        : empty('아직 들어온 신청서가 없습니다', '홈페이지 <a href="/member/apply" target="_blank" rel="noopener">장학금 신청</a>에서 회원이 신청하면 여기에 바로 나옵니다.')}</div>`;
  };
  pillTabs($('#apl-tabs'), [['all', `전체 ${list.length}`], ...Object.entries(AP_STATUS).map(([k, l]) => [k, `${l} ${count(k)}`])], st, (v) => {
    st = v;
    history.replaceState(null, '', `#/apply?round=${r.id}&st=${v}`);
    draw();
  });
  $('#apl-q').addEventListener('input', draw);
  $('#apl-round')?.addEventListener('change', (e) => go(`#/apply?round=${e.target.value}`));
  draw();
}

async function applyView(id) {
  const a = await api(`/apply/${id}`);
  const v = a.answers;
  const kv = (label, val, cls = '') => `<div class="${cls}"><dt>${esc(label)}</dt><dd>${val}</dd></div>`;
  const step = (to, label) => (to ? `<a class="btn" href="#/apply/${to}">${label}</a>` : `<span class="btn off" aria-disabled="true">${label}</span>`);
  const nav = `<nav class="apv-nav">${step(a.prev, '‹ 이전')}<span>${a.no} / ${a.total}</span>${step(a.next, '다음 ›')}</nav>`;
  const changed = a.updated_at > a.created_at + 60000 ? ` · ${fmtDate(a.updated_at, true)} 고침` : '';
  main.innerHTML = `${head('신청서', `${esc(a.name)} <span class="apv-st">${apTag(a.status)}</span>`, `${esc([v.dept, v.student_no, v.status].filter(Boolean).join(' · '))}<br>${fmtDate(a.created_at, true)} 접수${changed} · <a href="#/apply?round=${a.round_id}">목록으로</a>`)}
    ${nav}
    <section class="panel pad"><h2>심사</h2>
      <div class="apv-status" id="apv-status">${Object.entries(a.statuses).map(([k, l]) => `<button type="button" class="btn${k === a.status ? ' on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
      <label class="field gap"><span>메모 (관리자만 봅니다)</span><textarea class="input" id="apv-memo" maxlength="2000" rows="3" placeholder="예: 성적증명서 다시 받기로 함">${esc(a.memo)}</textarea></label>
      <div class="actions"><button type="button" class="btn primary sm" id="apv-memo-save">메모 저장</button></div>
    </section>
    <section class="panel pad"><h2>연락처</h2><dl class="apv-kv">
      ${kv('휴대폰', v.mobile ? `<a href="tel:${esc(String(v.mobile).replace(/[^0-9+]/g, ''))}">${esc(v.mobile)}</a>` : '-')}
      ${kv('아이디(이메일)', a.login_id ? `<a href="mailto:${esc(a.email || a.login_id)}">${esc(a.login_id)}</a>` : '-')}</dl></section>
    ${a.form.sections.map((s) => `<section class="panel pad"><h2>${esc(s.title)}</h2><dl class="apv-kv">
      ${s.fields.map((f) => (f.type === 'textarea'
        ? kv(`${f.label} · ${String(v[f.k] || '').length}자`, `<span class="apv-long">${esc(v[f.k] || '')}</span>`, 'long')
        : kv(f.label, esc(v[f.k] || '-')))).join('')}</dl></section>`).join('')}
    <section class="panel pad"><h2>서류</h2>
      ${a.form.files.map((f) => `<div class="apv-doc"><h3>${esc(f.label)} <small>${(a.docs[f.k] || []).length}개</small></h3>
        ${(a.docs[f.k] || []).length ? `<div class="apv-files">${a.docs[f.k].map((u) => (/^image\//.test(u.mime)
          ? `<button type="button" class="apv-img" data-img="${esc(u.url)}"><img src="${esc(u.url)}" alt="${esc(f.label)}" loading="lazy"></button>`
          : `<a class="btn apv-pdf" href="${esc(u.url)}" target="_blank" rel="noopener">PDF 열기 · ${esc(u.name)}</a>`)).join('')}</div>` : '<p class="meta">올린 파일이 없습니다.</p>'}</div>`).join('')}
    </section>
    ${nav}
    <div class="actions gap"><button type="button" class="btn sm danger" id="apv-del">이 신청서 지우기</button></div>`;
  $$('#apv-status [data-st]').forEach((b) => b.addEventListener('click', () => busy(b, null, async () => {
    await api(`/apply/${id}`, { method: 'PUT', data: { status: b.dataset.st } });
    $$('#apv-status [data-st]').forEach((x) => x.classList.toggle('on', x === b));
    $('.apv-st').innerHTML = apTag(b.dataset.st);
    toast(`'${AP_STATUS[b.dataset.st]}'(으)로 바꿨습니다.`);
  })));
  $('#apv-memo-save').addEventListener('click', (e) => busy(e.currentTarget, null, async () => {
    await api(`/apply/${id}`, { method: 'PUT', data: { memo: $('#apv-memo').value } }); toast('메모를 저장했습니다.');
  }));
  $$('[data-img]').forEach((b) => b.addEventListener('click', () => openDialog(`<div class="apv-big"><img src="${esc(b.dataset.img)}" alt=""></div>
    <div class="actions"><a class="btn" href="${esc(b.dataset.img)}?dl=1">내려받기</a><a class="btn" href="${esc(b.dataset.img)}" target="_blank" rel="noopener">새 창</a><button type="button" class="btn primary" data-close>닫기</button></div>`)));
  $('#apv-del').addEventListener('click', (e) => confirmInline(e.currentTarget, `${esc(a.name)} 님의 신청서와 올린 서류를 지웁니다. 되돌릴 수 없습니다.`, '신청서 지우기', async () => {
    await api(`/apply/${id}`, { method: 'DELETE' }); toast('신청서를 지웠습니다.'); go(`#/apply?round=${a.round_id}`);
  }));
}

async function roundsPage() {
  const { rounds } = await api('/apply/rounds');
  main.innerHTML = `${head('신청서', '신청 기간', '정한 기간에만 홈페이지 [장학금 신청]에서 신청서를 받습니다. 시작일 0시부터 마감일 밤 12시까지(한국 시간).', '<a class="btn primary" href="#/apply/rounds/new">+ 신청 기간 만들기</a>')}
    <div class="panel">${rounds.length ? `<table class="tbl cardy"><thead><tr><th>제목</th><th>신청 기간</th><th>상태</th><th>신청서</th><th>관리</th></tr></thead><tbody id="rrows">
      ${rounds.map((r) => `<tr data-id="${r.id}"><td><b>${esc(r.title)}</b></td><td data-l="신청 기간">${esc(r.period)}</td><td data-l="상태">${roundTag(r)}</td>
        <td data-l="신청서"><a href="#/apply?round=${r.id}">${r.count}명</a></td>
        <td><div class="mng"><a class="btn sm" href="#/apply/rounds/${r.id}">수정</a>${r.count ? '' : '<button class="btn sm danger" type="button" data-del>삭제</button>'}</div></td></tr>`).join('')}</tbody></table>`
    : empty('아직 신청 기간이 없습니다', '', '<a class="btn primary" href="#/apply/rounds/new">신청 기간 만들기</a>')}</div>`;
  $$('#rrows [data-del]').forEach((b) => {
    const r = rounds.find((x) => x.id === +b.closest('tr').dataset.id);
    b.onclick = () => confirmInline(b, `"${esc(r.title)}" 신청 기간을 지웁니다.`, '삭제', async () => { await api(`/apply/rounds/${r.id}`, { method: 'DELETE' }); toast('지웠습니다.'); route(); });
  });
}

const WD = '일월화수목금토';
const dayKo = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return ''; const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일(${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`; };
async function roundPage(id) {
  const { rounds, intro } = await api('/apply/rounds');
  const r = id ? rounds.find((x) => x.id === id) : { title: rounds[0]?.title || '', starts_on: '', ends_on: '', notice: '', visible: true };
  if (!r) throw new Error('없는 신청 기간입니다.');
  main.innerHTML = `${head('신청서 › 신청 기간', id ? '신청 기간 수정' : '신청 기간 만들기', '')}
    <form id="rform"><section class="panel pad">
      <label class="field"><span>제목</span><input class="input" name="title" required maxlength="100" value="${esc(r.title)}" placeholder="예: 2026 세종대CCC나사렛장학회 장학금 지원서"><small>신청 화면 맨 위에 나옵니다.</small></label>
      <div class="field"><span>신청 기간</span><div class="apr-dates"><input class="input" type="date" name="starts_on" required value="${esc(r.starts_on)}" aria-label="시작일"><span>~</span><input class="input" type="date" name="ends_on" required value="${esc(r.ends_on)}" aria-label="마감일"></div>
        <small id="rperiod"></small></div>
      <fieldset class="field"><legend>홈페이지에</legend><div class="choices"><label class="check"><input type="radio" name="visible" value="1"${r.visible ? ' checked' : ''}> 보이기</label><label class="check"><input type="radio" name="visible" value="0"${r.visible ? '' : ' checked'}> 감추기 (기간이어도 받지 않음)</label></div></fieldset>
      <label class="field"><span>첫 화면 안내 (꼭 읽어 주세요)</span><textarea class="input" name="notice" rows="7" maxlength="3000" placeholder="${esc(intro)}">${esc(r.notice)}</textarea><small>한 줄이 한 항목입니다. 비워 두면 흐린 글자(기본 안내)가 그대로 나옵니다.</small></label>
    </section><p class="err" role="alert"></p>
    ${saveBar(id ? '신청 기간을 고치는 중입니다.' : '새 신청 기간을 만드는 중입니다.', '#/apply/rounds')}</form>`;
  const form = $('#rform');
  ctrlS(form);
  const pv = () => { const f = formData(form); $('#rperiod').textContent = f.starts_on && f.ends_on ? `홈페이지에 "${dayKo(f.starts_on)} ~ ${dayKo(f.ends_on)}" 로 나옵니다. 마감일 밤 12시까지 받습니다.` : '시작일과 마감일을 골라 주세요.'; };
  form.addEventListener('input', pv); pv();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (!form.reportValidity()) return;
      const data = { ...formData(form) };
      data.visible = data.visible !== '0';
      if (id) await api(`/apply/rounds/${id}`, { method: 'PUT', data }); else await api('/apply/rounds', { method: 'POST', data });
      dirty = false; toast('신청 기간을 저장했습니다.'); go('#/apply/rounds');
    });
  });
}
