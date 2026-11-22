const $ = id => document.getElementById(id);
let stars = 3;
let editId = 0;
let items = [];

function setView(authed) {
  $('editCard').hidden = !authed;
  $('listSec').hidden = !authed;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { toLogin(); throw new Error('auth'); }
  return res.json();
}

// 로그인 화면으로 (사이트 회원 로그인 — 로그인하면 이 화면으로 돌아온다)
function toLogin() {
  try { localStorage.removeItem('ob_authed'); localStorage.removeItem('ob_basket'); } catch {}
  location.href = '/member/login?next=/basket';
}

async function logout() {
  try { await fetch('/xms-api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
  try { localStorage.removeItem('ob_authed'); localStorage.removeItem('ob_basket'); } catch {}
  location.href = './';
}

function pickStars(v) {
  stars = v;
  document.querySelectorAll('#starPick button').forEach(b =>
    b.classList.toggle('on', +b.dataset.v === v));
}

function resetForm() {
  editId = 0;
  $('text').value = '';
  $('src').value = '';
  pickStars(3);
  $('saveBtn').textContent = '담기';
  $('cancelBtn').hidden = true;
}

async function save() {
  const text = $('text').value.trim();
  if (!text) { $('editMsg').textContent = '구절을 입력해 주세요.'; return; }
  $('editMsg').textContent = '';
  const body = { text, source: $('src').value.trim(), stars };
  try {
    if (editId) await api('PUT', '/api/items', { ...body, id: editId });
    else await api('POST', '/api/items', body);
    $('editMsg').textContent = editId ? '고쳤습니다.' : '담았습니다.';
    $('editMsg').className = 'msg ok';
    setTimeout(() => { $('editMsg').textContent = ''; $('editMsg').className = 'msg'; }, 2000);
    resetForm();
    loadList();
  } catch {}
}

function startEdit(it) {
  editId = it.id;
  $('text').value = it.text;
  $('src').value = it.source || '';
  pickStars(it.stars || 1);
  $('saveBtn').textContent = '고치기';
  $('cancelBtn').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function remove(it) {
  if (!confirm('이 구절을 지울까요?\n\n' + it.text.slice(0, 40))) return;
  try { await api('DELETE', '/api/items?id=' + it.id); loadList(); } catch {}
}

function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 담은 시각: D1 의 UTC 'YYYY-MM-DD HH:MM:SS' → 한국 시간 '2026. 10. 24. 오전 10:41'
function when(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const PER_PAGE = 10;
let page = 1;

async function loadList() {
  try { items = await api('GET', '/api/items'); } catch { return; }
  try { localStorage.setItem('ob_basket', JSON.stringify(items)); } catch {}
  renderList();
}

// 출처 묶음 (서버 표 sources) — 구절이 많은 순. { id, name, n }
function groups() {
  const m = new Map();
  items.forEach(it => {
    if (!it.source_id) return;
    const g = m.get(it.source_id) || { id: it.source_id, name: it.grp || it.source || '', n: 0 };
    g.n++;
    m.set(it.source_id, g);
  });
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko'));
}
let srcF = ''; // 목록에서 고른 출처: '' 모두 · 'none' 출처 없음 · 그 밖 = 출처 id
function renderSources() {
  const gs = groups();
  const none = items.filter(it => !it.source_id).length;
  if (srcF && srcF !== 'none' && !gs.some(g => String(g.id) === srcF)) srcF = '';
  if (srcF === 'none' && !none) srcF = '';
  $('srcSel').innerHTML = `<option value="">모든 출처 (${items.length})</option>`
    + gs.map(g => `<option value="${g.id}">${esc(g.name)} (${g.n})</option>`).join('')
    + (none ? `<option value="none">출처 없음 (${none})</option>` : '');
  $('srcSel').value = srcF;
  $('srcEdit').hidden = !srcF || srcF === 'none';
}

// 출처 · 검색어로 거른 뒤 한 페이지에 10구절씩
function renderList() {
  renderSources();
  const q = $('q').value.trim().toLowerCase();
  const inSrc = !srcF ? items : items.filter(it => srcF === 'none' ? !it.source_id : String(it.source_id) === srcF);
  const found = q
    ? inSrc.filter(it => (it.text + ' ' + (it.source || '')).toLowerCase().includes(q))
    : inSrc;
  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const shown = found.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  $('count').textContent = (q || srcF)
    ? `${q ? '검색' : '이 출처'} ${found.length}구절 / 모두 ${items.length}구절`
    : '모두 ' + items.length + '구절';
  $('pager').innerHTML = pages > 1 ? `
    <button class="ghost small" data-pg="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹ 이전</button>
    <span>${page} / ${pages}</span>
    <button class="ghost small" data-pg="${page + 1}" ${page === pages ? 'disabled' : ''}>다음 ›</button>` : '';
  $('list').innerHTML = (q && !found.length) ? '<div class="s">검색된 구절이 없습니다.</div>' : shown.map(it => `
    <div class="item" data-id="${it.id}">
      <div class="st">${'★'.repeat(it.stars || 1)}</div>
      <div class="t">${esc(it.text)}</div>
      <div class="s">${esc(it.source || '')}</div>
      <div class="when">${when(it.created_at)}</div>
      <div class="btns">
        <button class="ghost small" data-act="edit">고치기</button>
        <button class="danger small" data-act="del">지우기</button>
      </div>
    </div>`).join('') || '<div class="s">아직 담긴 구절이 없습니다.</div>';
}

$('q').addEventListener('input', () => { page = 1; renderList(); });
$('srcSel').addEventListener('change', () => { srcF = $('srcSel').value; page = 1; renderList(); });
// 출처 이름 고치기 — 이미 있는 다른 출처와 같은 이름으로 고치면 하나로 합쳐진다
$('srcEdit').addEventListener('click', async () => {
  const g = groups().find(x => String(x.id) === srcF);
  if (!g) return;
  const name = (prompt('출처 이름을 고칩니다.\n이미 있는 다른 출처와 똑같이 적으면 하나로 합쳐집니다.', g.name) || '').trim();
  if (!name || name === g.name) return;
  try {
    const r = await api('PUT', '/api/sources', { id: g.id, name });
    if (r.error) return alert(r.error);
    srcF = String(r.id);
    loadList();
  } catch {}
});

// 출처 칸: 적는 동안 이미 담은 출처를 아래에 보여 주고, 누르면 그대로 들어간다 (같은 출처가 다르게 적혀 흩어지지 않게)
function showSug() {
  const q = $('src').value.trim().toLowerCase();
  const gs = groups().filter(g => g.name !== '성경' && g.name.toLowerCase().includes(q) && g.name.toLowerCase() !== q).slice(0, 8);
  $('srcSug').innerHTML = gs.map(g => `<button type="button" data-name="${esc(g.name)}"><span class="nm">${esc(g.name)}</span><span class="n">${g.n}</span></button>`).join('');
  $('srcSug').hidden = !gs.length;
}
$('src').addEventListener('focus', showSug);
$('src').addEventListener('input', showSug);
$('src').addEventListener('blur', () => setTimeout(() => { $('srcSug').hidden = true; }, 150));
// 고르는 것은 손을 뗄 때(click) — 닿자마자 넣으면 목록을 밀어 올리려 잡기만 해도 들어가고,
// 목록이 먼저 사라져 그 밑에 있던 단추(로그아웃)가 대신 눌린다 (사용자 지적 2026-11-22)
$('srcSug').addEventListener('mousedown', e => e.preventDefault()); // 칸에서 초점이 빠지지 않게
$('srcSug').addEventListener('click', e => {
  const b = e.target.closest('button[data-name]');
  if (!b) return;
  $('src').value = b.dataset.name;
  $('srcSug').hidden = true;
});
$('pager').addEventListener('click', e => {
  const btn = e.target.closest('button[data-pg]');
  if (!btn || btn.disabled) return;
  page = +btn.dataset.pg;
  renderList();
  $('listSec').scrollIntoView({ behavior: 'smooth' });
});

$('list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = +btn.closest('.item').dataset.id;
  const it = items.find(x => x.id === id);
  if (!it) return;
  if (btn.dataset.act === 'edit') startEdit(it);
  else remove(it);
});

// 붙여넣은 글에서 구절 · 출처를 나눈다 → { text, source } | null
//  1) 예스24 eBook 에서 가져온 글 (사용자 지시 2026-11-19): 구절 / 빈 줄 / 책 제목 | 저자 / 빈 줄 / [크레마 예스24 eBook] + 주소
//     → 첫 덩어리 = 구절, 둘째 덩어리 = 출처, [크레마 …] 줄과 주소는 버린다
//  2) 성경 묵상 인증글: "구절"시49:20 → 구절칸엔 인용문만, 출처칸엔 장절만
function splitPaste(raw) {
  const s = raw.replace(/\r/g, '');
  if (/예스24|yes24\.com/i.test(s)) {
    const body = s
      .replace(/(^|\n)[ \t]*\[[^\]\n]*예스24[^\]\n]*\][\s\S]*$/i, '')
      .replace(/\s*https?:\/\/\S*yes24\.com\S*\s*$/i, '')
      .trim();
    const parts = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const source = parts.pop().replace(/\s+/g, ' ');
    return { text: parts.join('\n\n'), source };
  }
  const m = s.match(/["“”]([^"“”]+)["“”]\s*([가-힣]{1,5}\s*\d+\s*[:：]\s*\d+(?:\s*[-~,]\s*\d+)*)/);
  return m ? { text: m[1].trim(), source: m[2].replace(/\s+/g, '') } : null;
}
function fillPaste(raw) {
  const v = splitPaste(raw);
  if (!v) return false;
  $('text').value = v.text;
  $('src').value = v.source;
  return true;
}
$('text').addEventListener('paste', e => {
  if (fillPaste((e.clipboardData || window.clipboardData).getData('text'))) e.preventDefault();
});
// 키보드의 클립보드 단추 · 공유로 들어온 글은 paste 가 안 온다 → 들어온 뒤에 나눈다 (예스24 글만)
$('text').addEventListener('input', () => { if (/\[[^\]\n]*예스24[^\]\n]*\]/.test($('text').value)) fillPaste($('text').value); });

// 담긴 구절 전체를 JSON 파일로 내려받기
async function backup() {
  let all;
  try { all = await api('GET', '/api/items'); } catch { return; }
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `olivebasket_${(localStorage.getItem('ob_email') || 'me').split('@')[0]}_${ymd}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('backupBtn').addEventListener('click', backup);
$('saveBtn').addEventListener('click', save);
$('cancelBtn').addEventListener('click', resetForm);
$('logoutBtn').addEventListener('click', logout);
document.querySelectorAll('#starPick button').forEach(b =>
  b.addEventListener('click', () => pickStars(+b.dataset.v)));

// 문구를 보여주는 방식 (계정별 저장)
const MODE_NOTE = {
  random: '모든 문구가 같은 확률로 나옵니다. 한 바퀴를 다 볼 때까지 같은 문구는 다시 나오지 않습니다.',
  recent: '최근에 담은 문구일수록 자주 나옵니다. 가장 오래된 문구도 가끔 나옵니다.',
  stars: '별이 많은 문구일수록 자주 나옵니다. (★ : ★★ : ★★★ = 1 : 2 : 3)',
  short: '짧은 문구일수록 자주 나옵니다. 긴 문구도 가끔 나옵니다.',
  long: '긴 문구일수록 자주 나옵니다. 짧은 문구도 가끔 나옵니다.',
};
function showMode(m) {
  document.querySelectorAll('#modePick button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('modeNote').textContent = MODE_NOTE[m] || '';
}
async function loadMode() {
  try { showMode((await api('GET', '/api/settings')).weight_mode); } catch {}
}
document.querySelectorAll('#modePick button').forEach(b =>
  b.addEventListener('click', async () => {
    const prev = document.querySelector('#modePick button.on')?.dataset.m;
    showMode(b.dataset.m);
    try { await api('PUT', '/api/settings', { weight_mode: b.dataset.m }); }
    catch { showMode(prev); }
  }));

// 시작: 기다리지 않고 바로 보여 준다 — 폼은 곧장, 목록은 지난번 받아 둔 것부터.
//   로그인 확인 · 목록 · 보기 방식은 한꺼번에 받는다 (로그인이 안 돼 있으면 api 가 로그인 화면으로 보냄)
try { const saved = JSON.parse(localStorage.getItem('ob_basket') || 'null'); if (Array.isArray(saved)) { items = saved; renderList(); } } catch {}
try { if (localStorage.getItem('ob_authed')) setView(true); } catch {}
api('GET', '/api/me').then(me => {
  if (!me.email) return toLogin();
  $('who').textContent = me.email;
  setView(true);
}).catch(() => {});
loadList();
loadMode();

// iOS 사파리 핀치 확대 차단 (viewport user-scalable=no 를 무시함)
['gesturestart', 'gesturechange'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
