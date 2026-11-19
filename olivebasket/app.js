const $quote = document.getElementById('quote');
const $source = document.getElementById('source');
const $pos = document.getElementById('pos');
const $stars = document.getElementById('stars');
const $meta = document.getElementById('meta');
const $stage = document.getElementById('stage');

const hist = [];      // 본 구절 히스토리 (스와이프로 되돌아가기)
let idx = -1;
let lastId = 0;
// 이번 바퀴에 이미 본 구절 id (모두 한 번씩 볼 때까지 다시 안 나옴, 앱 껐다 켜도 유지)
let seen = [];
try { seen = JSON.parse(localStorage.getItem('ob_seen') || '[]'); } catch {}
let busy = false;
// 로그인 = 사이트 회원(xms, 같은 xms_sess 쿠키) — 2026-11-04 자체 로그인에서 옮김
// 빨리 뜨게(사용자 지시 2026-11-04 "너무 느려"): 지난번 로그인 상태로 바로 시작하고, 서버 확인은 뒤에서 한다
let token = ''; // '1' = 로그인함
try { token = localStorage.getItem('ob_authed') || ''; } catch {}

// 로그인 안 했으면 소개 문구만, 하단에 로그인·가입
const INTRO = { id: 0, text: '가입하고,\n올리브를 모으듯\n나만의 영감을 담아보세요.', source: '올리브바스켓', stars: 1 };
function setAuthed() { /* 담기 버튼은 늘 보인다 — 로그인 전이면 /basket 이 로그인 화면으로 보낸다 */ }
// 구절을 글마다 서버에 묻지 않는다 (사용자 지시 2026-11-04 "다음 글이 3초씩"): 내 구절 전체 + 보기 방식을 한 번 받아
// 폰에 두고 그 안에서 고른다 → 넘기면 바로. 열 때마다 뒤에서 최신으로 다시 받는다(담기에서 고친 것도 반영). 인터넷이 없어도 넘겨진다.
const EMPTY = { id: 0, text: '첫 올리브가 될\n영감의 문구를 담아보세요.', source: '', stars: 1 };
let items = [];
let mode = 'random';
try { items = JSON.parse(localStorage.getItem('ob_items') || '[]') || []; mode = localStorage.getItem('ob_mode') || 'random'; localStorage.removeItem('ob_ahead'); } catch {}
async function loadItems() {
  const opt = { credentials: 'same-origin', cache: 'no-store' };
  const [ri, rs] = await Promise.all([fetch('/api/items', opt), fetch('/api/settings', opt)]);
  if (ri.status === 401) {
    token = ''; items = [];
    try { localStorage.removeItem('ob_authed'); localStorage.removeItem('ob_items'); localStorage.removeItem('ob_basket'); } catch {}
    return;
  }
  if (!ri.ok) throw new Error('items ' + ri.status);
  items = (await ri.json()).map(({ id, text, source, stars, source_id, grp }) => ({ id, text, source, stars, source_id, grp }));
  if (rs.ok) mode = (await rs.json()).weight_mode || 'random';
  token = '1';
  try { localStorage.setItem('ob_items', JSON.stringify(items)); localStorage.setItem('ob_mode', mode); localStorage.setItem('ob_authed', '1'); } catch {}
}
const ready = loadItems().catch(() => {}); // 오프라인이면 폰에 둔 목록으로
setAuthed(!!token);

// 배경 장면 6가지를 두 겹으로 교차 페이드 (직전 장면은 피함)
const SCENES = 6;
const bgs = [document.getElementById('bgA'), document.getElementById('bgB')];
let bgFront = 0, scene = -1;
function changeScene() {
  let n;
  do { n = Math.floor(Math.random() * SCENES); } while (n === scene);
  scene = n;
  const back = bgs[1 - bgFront];
  back.className = 'bg sc' + n;
  void back.offsetWidth;
  back.classList.add('on');
  bgs[bgFront].classList.remove('on');
  bgFront = 1 - bgFront;
  document.body.className = 'lock sc' + n; // 글자·가지·별 색도 장면에 맞춤
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.content = getComputedStyle(back).getPropertyValue('--b0').trim();
}

const $branch = $stars; // 글 위 별표 (예전 바구니 그림 자리) — 글자와 함께 사라졌다 나타남

function render(item) {
  changeScene();
  $quote.textContent = item.text;
  $source.textContent = item.source || '';
  $pos.textContent = item.pos ? item.pos + ' / ' + item.of : ''; // 12구절 중 2번째 (전체 보기 · 출처별 보기 모두)
  $stars.textContent = item.id ? '★'.repeat(item.stars || 1) : '';
  $stars.setAttribute('aria-label', item.id ? `중요도 ${item.stars || 1}` : '');
  lastId = item.id || 0;
  fitQuote();
  try { localStorage.setItem('ob_last', JSON.stringify(item)); } catch {}
}

// 긴 문구가 오른쪽 아래 '담기' 버튼과 겹치지 않게: 화면에 들어올 때까지 글자를 1px씩 줄임
function fitQuote() {
  $quote.style.fontSize = '';
  const limit = document.getElementById('addLink').getBoundingClientRect().top - 12;
  let size = parseFloat(getComputedStyle($quote).fontSize);
  while ($meta.getBoundingClientRect().bottom > limit && size > 14) {
    size -= 1;
    $quote.style.fontSize = size + 'px';
  }
}
window.addEventListener('resize', fitQuote);

const FADE = 220; // style.css 의 .branch/.quote/.meta 전환 시간과 맞춤

// dir: 1 = 다음(오른쪽에서 들어옴), -1 = 이전(왼쪽에서 들어옴)
async function transition(getItem, dir) {
  if (busy) return;
  busy = true;
  // 바구니도 글자와 함께 사라졌다 새 자리에서 같이 나타남 (따로 움직이면 바구니만 눈에 띔)
  const els = [$branch, $quote, $meta];
  const outCls = dir > 0 ? 'shift-l' : 'shift-r';
  const inCls = dir > 0 ? 'shift-r' : 'shift-l';
  els.forEach(el => el.classList.add(outCls));
  const [item] = await Promise.all([getItem(), new Promise(r => setTimeout(r, FADE))]);
  if (item) render(item);
  els.forEach(el => {
    el.classList.remove(outCls);
    el.style.transition = 'none';
    el.classList.add(inCls);
    void el.offsetWidth; // reflow로 즉시 반대편 배치
    el.style.transition = '';
    el.classList.remove(inCls);
  });
  busy = false;
}

// 보기 방식별 무게 (가장 낮은 것도 가끔 나오게 1 ~ 10) — 서버 /api/random 과 같은 규칙
function weighted(rows) {
  if (mode === 'random' || rows.length < 2) return rows[Math.floor(Math.random() * rows.length)];
  let w;
  if (mode === 'stars') w = rows.map(r => r.stars || 1);
  else {
    const vals = rows.map(mode === 'recent' ? r => r.id : r => r.text.length);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    w = vals.map(v => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return 1 + 9 * (mode === 'short' ? 1 - t : t); });
  }
  let n = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rows.length; i++) { n -= w[i]; if (n <= 0) return rows[i]; }
  return rows[rows.length - 1];
}
// 다음 구절: 이번 바퀴에 아직 안 본 것 중에서 (방금 본 것은 빼고). 다 봤으면 새 바퀴
function pick() {
  if (!token) return INTRO;
  if (!items.length) return EMPTY;
  // 출처를 골랐으면 그 출처의 구절만 (그 출처가 없어졌으면 전체로)
  let base = src ? items.filter(r => String(r.source_id) === src) : items;
  if (!base.length) { setSrc(''); base = items; }
  const mine = new Set(base.map(r => r.id));
  const not = new Set(seen);
  let pool = base.filter(r => !not.has(r.id) && r.id !== lastId);
  if (!pool.length) {
    seen = src ? seen.filter(id => !mine.has(id)) : []; // 이 출처만 새 바퀴 (전체 보기의 본 기록은 남긴다)
    pool = base.length > 1 ? base.filter(r => r.id !== lastId) : base;
  }
  const it = weighted(pool);
  seen.push(it.id);
  if (mode !== 'random' && seen.length > 30) seen = seen.slice(-30); // 가중 모드는 최근 본 것만 피하면 된다
  try { localStorage.setItem('ob_seen', JSON.stringify(seen)); } catch {}
  // 몇 번째인지 함께: 이번 바퀴에 본 수 / 구절 수 (출처를 골랐으면 그 출처 안에서, 전체면 모든 구절에서)
  return { ...it, pos: Math.min(base.length, seen.filter(id => mine.has(id)).length), of: base.length };
}

// ---------- 출처별로 보기 (사용자 지시 2026-11-19): 기본은 전체, 위 단추로 출처를 고르면 그 출처의 구절만
let src = ''; // '' = 전체 · 그 밖 = 출처 id (앱을 다시 열면 전체로)
try { src = sessionStorage.getItem('ob_src') || ''; } catch {}
const $srcBtn = document.getElementById('srcBtn');
const $srcName = document.getElementById('srcName');
const $srcSheet = document.getElementById('srcSheet');
const $srcList = document.getElementById('srcList');
function srcGroups() {
  const m = new Map();
  items.forEach(r => {
    if (!r.source_id) return;
    const g = m.get(r.source_id) || { id: String(r.source_id), name: r.grp || r.source || '', n: 0 };
    g.n++;
    m.set(r.source_id, g);
  });
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko'));
}
function setSrc(v) {
  src = v;
  try { sessionStorage.setItem('ob_src', v); } catch {}
  showSrc();
}
function showSrc() {
  const gs = srcGroups();
  const cur = gs.find(g => g.id === src);
  $srcBtn.hidden = !token || !gs.length;
  $srcName.textContent = cur ? cur.name : '전체';
  $srcBtn.classList.toggle('on', !!cur);
}
function openSrc() {
  const gs = srcGroups();
  const row = (id, name, n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'src-it' + (id === src ? ' on' : ''); b.dataset.id = id;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
    const c = document.createElement('span'); c.className = 'n'; c.textContent = n;
    b.append(nm, c);
    return b;
  };
  $srcList.replaceChildren(row('', '전체', items.length), ...gs.map(g => row(g.id, g.name, g.n)));
  $srcSheet.hidden = false;
  void $srcSheet.offsetWidth;
  $srcSheet.classList.add('open');
  const on = $srcList.querySelector('.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function closeSrc() {
  $srcSheet.classList.remove('open');
  setTimeout(() => { if (!$srcSheet.classList.contains('open')) $srcSheet.hidden = true; }, 280);
}
$srcBtn.addEventListener('click', openSrc);
$srcSheet.addEventListener('click', e => {
  const b = e.target.closest('.src-it');
  if (!b) { if (!e.target.closest('.src-panel')) closeSrc(); return; }
  closeSrc();
  if (b.dataset.id === src) return;
  setSrc(b.dataset.id);
  if (src) { // 고른 출처는 1번째부터 (전체 보기에서 이미 본 구절도 다시 센다)
    seen = seen.filter(id => !items.some(r => r.id === id && String(r.source_id) === src));
    lastId = 0;
  }
  hist.length = 0; idx = -1; // 고른 출처의 구절부터 새로
  next();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$srcSheet.hidden) closeSrc(); });
showSrc();
ready.then(showSrc);

function next() {
  if (idx < hist.length - 1) {
    // 되돌아간 상태면 앞으로
    transition(() => hist[++idx], 1);
  } else {
    transition(async () => {
      const item = pick();
      hist.push(item);
      if (hist.length > 100) { hist.shift(); }
      idx = hist.length - 1;
      return item;
    }, 1);
  }
}

function prev() {
  if (idx > 0) transition(() => hist[--idx], -1);
}

// 책장 넘기듯: 오른쪽→왼쪽 스와이프 = 다음, 왼쪽→오른쪽 = 이전
// 탭은 화면 오른쪽 절반 = 다음, 왼쪽 절반 = 이전
let tx = 0, ty = 0, swiped = false;
$stage.addEventListener('touchstart', e => {
  tx = e.touches[0].clientX;
  ty = e.touches[0].clientY;
}, { passive: true });
$stage.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx;
  const dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    swiped = true;
    if (dx < 0) next(); // 오른쪽에서 왼쪽으로 쓸기 → 다음 구절
    else prev();        // 왼쪽에서 오른쪽으로 쓸기 → 직전 구절
  }
}, { passive: true });
// 당겨서 새로고침: 맨 위에서 아래로 끌어내리면 표시가 따라오고, 충분히 당겼다 놓으면 reload
// (body 가 position:fixed 라 브라우저 기본 당겨서 새로고침이 안 되므로 직접 구현)
const $ptr = document.getElementById('ptr');
const PTR_GO = 90;
let pulling = false, pullY = 0;
$stage.addEventListener('touchstart', e => {
  pulling = $stage.scrollTop <= 0 && e.touches.length === 1;
  pullY = 0;
}, { passive: true });
$stage.addEventListener('touchmove', e => {
  if (!pulling) return;
  const dx = e.touches[0].clientX - tx;
  const dy = e.touches[0].clientY - ty;
  if (dy <= 0 || Math.abs(dx) > dy) { pullY = 0; $ptr.style.transform = ''; $ptr.classList.remove('ready'); return; }
  pullY = Math.min(dy * 0.5, 120);
  $ptr.style.transition = 'none';
  $ptr.style.transform = `translate(-50%, ${pullY}px) rotate(${pullY * 3}deg)`;
  $ptr.classList.toggle('ready', pullY >= PTR_GO * 0.66);
}, { passive: true });
$stage.addEventListener('touchend', () => {
  if (!pulling) return;
  pulling = false;
  $ptr.style.transition = '';
  if ($ptr.classList.contains('ready')) {
    swiped = true;
    $ptr.classList.add('spin');
    location.reload();
  } else {
    $ptr.style.transform = '';
  }
}, { passive: true });

$stage.addEventListener('click', e => {
  if (swiped) { swiped = false; return; }
  if (e.clientX < window.innerWidth / 2) prev();
  else next();
});

// 첫 구절: 폰에 둔 목록이 있으면 바로, 없으면 받아서. 받고 보니 로그인이 풀려 있었으면 첫 화면을 다시
if (token && items.length) {
  next();
  ready.then(() => { if (!token && idx === 0) { hist.length = 0; idx = -1; next(); } });
} else ready.then(next);

// 시작 화면은 앱을 열 때 한 번만 (당겨서 새로고침 때는 생략)
const $splash = document.getElementById('splash');
if ($splash && !document.documentElement.classList.contains('nosplash')) {
  try { sessionStorage.setItem('ob_splash', '1'); } catch {}
  setTimeout(() => {
    $splash.classList.add('out');
    setTimeout(() => $splash.remove(), 700);
  }, 1500);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// iOS 사파리 핀치 확대 차단 (viewport user-scalable=no 를 무시함)
['gesturestart', 'gesturechange'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
