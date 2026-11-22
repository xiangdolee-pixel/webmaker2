const $quote = document.getElementById('quote');
const $source = document.getElementById('source');
const $stars = document.getElementById('stars');
const $pos = document.getElementById('pos');
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
  $pos.textContent = item.pos ? item.pos + ' / ' + item.of : ''; // 별표 위 '2 / 36' — 36구절 중 2번째 (전체 · 출처별 모두, 사용자 지시 2026-11-22)
  $stars.textContent = item.id ? '★'.repeat(item.stars || 1) : '';
  $stars.setAttribute('aria-label', item.id ? `중요도 ${item.stars || 1}` : '');
  lastId = item.id || 0;
  fitQuote();
  try { localStorage.setItem('ob_last', JSON.stringify(item)); } catch {}
  if (listening) say(item); // 듣는 중이면 새로 뜬 구절을 바로 읽는다 (손으로 넘겨도)
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
  const els = [$pos, $branch, $quote, $meta];
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
  if (mode !== 'random' && !listening && seen.length > 30) seen = seen.slice(-30); // 가중 모드는 최근 본 것만 피하면 된다 (듣는 중에는 한 바퀴를 겹치지 않게 다 돈다)
  try { localStorage.setItem('ob_seen', JSON.stringify(seen)); } catch {}
  // 몇 번째인지 함께: 이번 바퀴에 본 수 / 구절 수 (출처를 골랐으면 그 출처 안에서). 가중 모드는 바퀴가 없어 듣는 중에만
  if (mode !== 'random' && !listening) return it;
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
  $listen.hidden = $ttsBtn.hidden = !synth || !token || !items.length;
}
// 검색 (사용자 지시 2026-11-22): 기본은 출처 이름으로 찾기, '글' 로 바꾸면 구절 속 낱말로 찾아 그 구절로 바로 간다
const $srcQ = document.getElementById('srcQ');
let findIn = 'src'; // 'src' = 출처 이름 · 'text' = 구절 글
function drawSrc() {
  const q = $srcQ.value.trim().toLowerCase();
  const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };
  let rows;
  if (findIn === 'text') {
    // 구절 찾기: 찾은 낱말 앞뒤를 잘라 보여 주고(찾은 곳은 표시) 아래에 출처
    rows = !q ? [el('p', 'src-none', '찾을 낱말을 적으면 그 낱말이 든 구절이 나옵니다.')] : items.filter(r => r.text.toLowerCase().includes(q)).slice(0, 60).map(r => {
      const b = el('button', 'src-it src-q'); b.type = 'button'; b.dataset.q = r.id;
      const t = r.text.replace(/\s+/g, ' '); const at = t.toLowerCase().indexOf(q);
      const nm = el('span', 'nm');
      if (at < 0) nm.textContent = t;
      else { const from = Math.max(0, at - 14); nm.append((from ? '…' : '') + t.slice(from, at), el('mark', '', t.slice(at, at + q.length)), t.slice(at + q.length)); }
      b.append(nm);
      if (r.grp || r.source) b.append(el('span', 's', r.grp || r.source));
      return b;
    });
  } else {
    const row = (id, name, n) => {
      const b = el('button', 'src-it' + (id === src ? ' on' : '')); b.type = 'button'; b.dataset.id = id;
      b.append(el('span', 'nm', name), el('span', 'n', n));
      return b;
    };
    rows = srcGroups().filter(g => !q || g.name.toLowerCase().includes(q)).map(g => row(g.id, g.name, g.n));
    if (!q) rows.unshift(row('', '전체', items.length));
  }
  if (!rows.length) rows = [el('p', 'src-none', findIn === 'text' ? '그 낱말이 든 구절이 없습니다.' : '그 이름의 출처가 없습니다.')];
  $srcList.replaceChildren(...rows);
  $srcList.scrollTop = 0;
}
$srcQ.addEventListener('input', drawSrc);
$srcQ.addEventListener('keydown', e => { if (e.key === 'Enter') $srcQ.blur(); }); // 자판을 내려 결과가 보이게
const placeFind = seg(document.getElementById('srcMode'), [['src', '출처'], ['text', '글']], findIn, v => {
  findIn = v;
  $srcQ.placeholder = v === 'text' ? '구절 속 낱말 검색' : '출처 이름 검색';
  drawSrc();
});
// 찾은 구절로 바로: 그 구절의 출처로 바꾸고 그 구절을 띄운다
function jump(it) {
  setSrc(it.source_id ? String(it.source_id) : '');
  const base = src ? items.filter(r => String(r.source_id) === src) : items;
  const mine = new Set(base.map(r => r.id));
  if (!seen.includes(it.id)) seen.push(it.id);
  try { localStorage.setItem('ob_seen', JSON.stringify(seen)); } catch {}
  const item = { ...it, pos: Math.min(base.length, seen.filter(id => mine.has(id)).length), of: base.length };
  hist.push(item); idx = hist.length - 1; heard = 0;
  transition(() => item, 1);
}
function openSrc() {
  $srcQ.value = '';
  if (findIn !== 'src') document.querySelector('#srcMode button[data-v="src"]').click(); // 열 때마다 출처 검색부터
  drawSrc();
  $srcSheet.hidden = false;
  placeFind();
  void $srcSheet.offsetWidth;
  $srcSheet.classList.add('open');
  const on = $srcList.querySelector('.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}
function closeSrc() {
  $srcSheet.classList.remove('open');
  setTimeout(() => { if (!$srcSheet.classList.contains('open')) $srcSheet.hidden = true; }, 280);
}
// ---------- 듣기 (사용자 지시 2026-11-22): 기기의 읽어 주기(Web Speech)로 지금 구절부터 읽고, 끝나면 다음 구절로 넘겨 계속 읽는다.
//   출처를 골랐으면 그 출처 안에서만. 음성 파일을 만들지 않는다
//   설정(톱니 단추): 빠르기 · 한 바퀴만/계속 반복 · 괄호 안 읽기/건너뛰기 (목소리 고르기는 뺌 — 사용자 지시 2026-11-22). 읽는 낱말을 표시한다. 화면을 꺼도 이어지게 소리 없는 음원을 함께 틀어 둔다
const $listen = document.getElementById('listenBtn');
const $ttsBtn = document.getElementById('ttsBtn');
const $ttsSheet = document.getElementById('ttsSheet');
const synth = window.speechSynthesis;
let listening = false, heard = 0, sayNo = 0, curU = null, wake = null, hiT = 0;
const tts = { rate: 1, loop: 0, paren: 1 }; // paren: 1 = 괄호 안도 읽기 · 0 = 건너뛰기
let cps = 7; // 1배속에서 1초에 읽는 글자 수 (낱말 위치를 알려 주지 않는 기기에서 읽는 자리를 어림하는 데 쓴다 — 읽을 때마다 실제 걸린 시간으로 고친다)
try { Object.assign(tts, JSON.parse(localStorage.getItem('ob_tts') || '{}')); cps = +localStorage.getItem('ob_cps') || 7; } catch {}
const koVoices = () => synth.getVoices().filter(x => /^ko/i.test(x.lang));
function say(item) {
  const no = ++sayNo;
  clearInterval(hiT);
  if (!item.id) { stopListen(); return; }
  // 낱말마다 span 으로 나눠 그리고, 읽을 글은 낱말을 빈칸 하나로 이어 만든다 → 읽는 글자 위치로 낱말을 찾는다
  //   괄호 안을 건너뛰기로 했으면 (…) · （…） 안 글자는 화면에는 그대로 두고 읽을 글에서만 뺀다
  const words = []; let spoken = '';
  const skip = new Uint8Array(item.text.length);
  if (!+tts.paren) for (const m of item.text.matchAll(/[(（][^()（）]*[)）]/g)) skip.fill(1, m.index, m.index + m[0].length);
  $quote.textContent = '';
  let at = 0;
  item.text.split(/(\s+)/).forEach(tok => {
    const from = at; at += tok.length;
    if (!tok) return;
    if (/^\s+$/.test(tok)) { $quote.append(tok); return; }
    const el = document.createElement('span'); el.className = 'w'; el.textContent = tok; $quote.append(el);
    const read = [...tok].length === tok.length ? tok.split('').filter((_, i) => !skip[from + i]).join('') : tok;
    if (!read) return; // 통째로 괄호 안인 낱말
    if (spoken) spoken += ' ';
    words.push({ el, start: spoken.length });
    spoken += read;
  });
  if (!spoken) spoken = ' ';
  const u = curU = new SpeechSynthesisUtterance(spoken);
  u.lang = 'ko-KR'; u.rate = +tts.rate || 1;
  const v = koVoices()[0];
  if (v) u.voice = v;
  let cur = -1, t0 = 0, aCh = 0, aT = 0, gotB = false; // aCh · aT = 기기가 마지막으로 알려 준 글자 위치와 그때
  const mark = i => { if (i === cur || !words[i]) return; if (words[cur]) words[cur].el.classList.remove('now'); cur = i; words[i].el.classList.add('now'); };
  const idxAt = ch => { let i = 0; while (i + 1 < words.length && words[i + 1].start <= ch) i++; return i; };
  const begin = () => { t0 = aT = performance.now(); aCh = 0; mark(0); };
  u.onstart = () => { if (no === sayNo) begin(); };
  u.onboundary = e => { if (no !== sayNo) return; gotB = true; aCh = e.charIndex; aT = performance.now(); mark(idxAt(aCh)); };
  u.onend = () => {
    if (no !== sayNo || !listening) return;
    clearInterval(hiT);
    if (words[cur]) words[cur].el.classList.remove('now');
    const d = (performance.now() - t0) / 1000;
    if (t0 && d > .8) { cps = cps * .5 + .5 * spoken.length / d / u.rate; try { localStorage.setItem('ob_cps', cps.toFixed(2)); } catch {} }
    const n = src ? items.filter(r => String(r.source_id) === src).length : items.length;
    if (++heard >= n) { if (!+tts.loop) { stopListen(); return; } heard = 0; } // 한 바퀴 다 읽음: 멈추거나(한 바퀴만) 새 바퀴로(계속 반복)
    setTimeout(() => { if (no === sayNo && listening) next(); }, 700); // 구절 사이 잠깐 쉼
  };
  u.onerror = e => { if (no === sayNo && listening && e.error !== 'interrupted' && e.error !== 'canceled') stopListen(); };
  // 기기가 낱말 위치를 안 알려 주면(한 번도 없거나 0.7초 넘게 소식이 없으면) 걸린 시간으로 어림해 앞으로만 옮긴다
  hiT = setInterval(() => {
    if (no !== sayNo) return;
    const dt = performance.now() - aT;
    if (!t0 || (gotB && dt < 700)) return;
    const i = idxAt(aCh + dt / 1000 * cps * u.rate);
    if (i > cur) mark(i);
  }, 120);
  const go = () => { synth.speak(u); begin(); };
  // 읽던 것이 있으면 끊고 조금 뒤에 (끊자마자 말하면 크롬이 새 말을 버린다). 처음은 누른 그 순간에 바로(아이폰은 누를 때만 시작된다)
  if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(() => { if (no === sayNo && listening) go(); }, 80); }
  else go();
  if ('mediaSession' in navigator) { // 잠금 화면 · 알림 줄에 지금 읽는 구절
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: spoken.slice(0, 90), artist: item.source || '올리브바스켓', album: '올리브바스켓', artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
  }
}
// 화면을 꺼도(다른 앱으로 가도) 이어 읽게: 소리 없는 10초짜리 음원을 되풀이해 틀어 둔다 → 브라우저가 '재생 중'으로 보고 페이지를 재우지 않는다
let keep = null;
function keepOn() {
  if (!keep) {
    const n = 8000 * 10, b = new Uint8Array(44 + n), d = new DataView(b.buffer);
    [[0, 0x52494646], [8, 0x57415645], [12, 0x666d7420], [36, 0x64617461]].forEach(([o, x]) => d.setUint32(o, x));
    d.setUint32(4, 36 + n, true); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
    d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true); d.setUint32(40, n, true);
    b.fill(128, 44);
    keep = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
    keep.loop = true;
  }
  keep.play().catch(() => {});
}
function showListen() {
  $listen.classList.toggle('on', listening);
  $listen.setAttribute('aria-pressed', listening);
  $listen.querySelector('.t').textContent = listening ? '멈춤' : '듣기';
}
function startListen() {
  listening = true; heard = 0;
  showListen();
  keepOn();
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; if (!listening) w.release(); }).catch(() => {}); // 듣는 동안 화면이 저절로 꺼지지 않게
  const cur = hist[idx];
  if (cur && cur.id) say(cur); else next();
}
function stopListen() {
  listening = false; sayNo++;
  clearInterval(hiT);
  if (synth) synth.cancel();
  if (keep) keep.pause();
  if (wake) { wake.release().catch(() => {}); wake = null; }
  $quote.querySelectorAll('.now').forEach(el => el.classList.remove('now'));
  if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'paused'; } catch {} }
  showListen();
}
// 알약 고르기: 떠 있는 배경 하나가 고른 칸으로 미끄러진다
function seg(box, opts, val, onPick) {
  const ind = document.createElement('i'); ind.className = 'seg-ind'; box.append(ind);
  const btns = opts.map(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.dataset.v = v; box.append(b); return b; });
  const place = now => {
    const on = btns.find(b => b.classList.contains('on'));
    if (!on || !on.offsetWidth) return;
    if (now) ind.style.transition = 'none';
    ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`; ind.style.opacity = 1;
    if (now) { void ind.offsetWidth; ind.style.transition = ''; }
  };
  const set = v => { btns.forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); place(); };
  box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return; set(b.dataset.v); onPick(b.dataset.v); });
  set(val);
  return () => place(true);
}
if (synth) {
  synth.getVoices(); // 목소리 목록을 미리 불러 둔다
  $listen.addEventListener('click', () => { if (listening) stopListen(); else startListen(); });
  window.addEventListener('pagehide', () => synth.cancel());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && listening && navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {});
  });
  if ('mediaSession' in navigator) {
    [['play', () => { if (!listening) startListen(); }], ['pause', () => stopListen()], ['nexttrack', () => next()], ['previoustrack', () => prev()]]
      .forEach(([k, f]) => { try { navigator.mediaSession.setActionHandler(k, f); } catch {} });
  }
  // 설정 시트
  const saveTts = () => { try { localStorage.setItem('ob_tts', JSON.stringify(tts)); } catch {} };
  const again = () => { const c = hist[idx]; if (listening && c && c.id) say(c); }; // 듣는 중에 바꾸면 지금 구절을 새 설정으로 다시
  const RATES = ['0.7', '1', '1.2', '1.5', '2'];
  if (!RATES.includes(String(tts.rate))) tts.rate = 1;
  const places = [
    seg(document.getElementById('ttsRate'), RATES.map(v => [v, v + '배']), tts.rate, v => { tts.rate = +v; saveTts(); again(); }),
    seg(document.getElementById('ttsLoop'), [['0', '한 바퀴만'], ['1', '계속 반복']], +tts.loop ? 1 : 0, v => { tts.loop = +v; saveTts(); }),
    seg(document.getElementById('ttsParen'), [['1', '읽기'], ['0', '건너뛰기']], +tts.paren ? 1 : 0, v => { tts.paren = +v; saveTts(); again(); }),
  ];
  const closeTts = () => { $ttsSheet.classList.remove('open'); setTimeout(() => { if (!$ttsSheet.classList.contains('open')) $ttsSheet.hidden = true; }, 280); };
  $ttsBtn.addEventListener('click', () => {
    $ttsSheet.hidden = false;
    places.forEach(f => f());
    void $ttsSheet.offsetWidth;
    $ttsSheet.classList.add('open');
  });
  $ttsSheet.addEventListener('click', e => { if (!e.target.closest('.src-panel')) closeTts(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$ttsSheet.hidden) closeTts(); });
}

$srcBtn.addEventListener('click', openSrc);
$srcSheet.addEventListener('click', e => {
  const b = e.target.closest('.src-it');
  if (!b) { if (!e.target.closest('.src-panel')) closeSrc(); return; }
  closeSrc();
  if (b.dataset.q) { const it = items.find(r => String(r.id) === b.dataset.q); if (it) jump(it); return; }
  if (b.dataset.id === src) return;
  setSrc(b.dataset.id);
  if (src) { // 고른 출처는 처음부터 (전체 보기에서 이미 본 구절도 다시 나온다)
    seen = seen.filter(id => !items.some(r => r.id === id && String(r.source_id) === src));
    lastId = 0;
  }
  hist.length = 0; idx = -1; // 고른 출처의 구절부터 새로
  heard = 0;
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
  // 새 버전이 깔리면 그 자리에서 한 번 다시 띄운다 (사용자 지시 2026-11-22: 배포했는데 설치한 앱에 안 보임 — 전에는 '다음에 열 때' 적용이었다)
  //   처음 설치(전에 맡던 서비스워커가 없음)일 때는 그대로. 듣는 중이면 끊지 않는다. 잇달아 다시 뜨지 않게 1분에 한 번만
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || listening) return;
    try { if (Date.now() - (+sessionStorage.getItem('ob_swr') || 0) < 60000) return; sessionStorage.setItem('ob_swr', Date.now()); } catch { return; }
    location.reload();
  });
  navigator.serviceWorker.register('sw.js');
}

// iOS 사파리 핀치 확대 차단 (viewport user-scalable=no 를 무시함)
['gesturestart', 'gesturechange'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
