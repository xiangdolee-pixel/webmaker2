// 해골 빌딩의 용사 — 화면 (규칙 · 레벨은 core.js)
import { makeLevel, solve, apply, medalFor, medalTimes, scoreFor, MEDALS } from './core.js?v=2';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V = '?v=2';
const IMG = { sk: 'skel', po: 'potion', x2: 'star', cu: 'curse', hf: 'curse' };

// ── 저장 (이 기기에) ─────────────────────────────────────────────
//   level = 지금 할 레벨, cur = 하던 판(비운 방 · 있는 방 · 힘 · 지난 시간). 판 자체는 레벨 번호로 다시 만든다.
const KEY = 'sang_save', GEN = 1; // GEN = 레벨 만드는 규칙 번호(바뀌면 하던 판은 버린다)
const fresh = () => ({ v: 1, level: 1, score: 0, medals: [0, 0, 0, 0, 0], custom: [], customAt: 0, cur: null, seen: {}, snd: 1, gift: 0 });
let S = fresh();
try {
  const o = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (o && o.v === 1 && Number.isInteger(o.level) && o.level >= 1) { // 값이 이상한 것은 버린다
    const int = (x, d) => Number.isInteger(x) && x >= 0 ? x : d;
    S = { ...fresh(), level: o.level, score: int(o.score, 0), customAt: int(o.customAt, 0), gift: int(o.gift, 0), snd: o.snd ? 1 : 0,
      medals: fresh().medals.map((_, i) => int(o.medals && o.medals[i], 0)),
      custom: (Array.isArray(o.custom) ? o.custom : []).filter(n => typeof n === 'string' && n.trim()).map(n => n.slice(0, 12)).slice(-5),
      seen: o.seen && typeof o.seen === 'object' ? o.seen : {}, cur: o.cur && typeof o.cur === 'object' && o.cur.g === GEN ? o.cur : null };
  }
} catch {}
let saveOk = true;
function save() {
  // 움직이는 도중(busy)에는 하던 판을 새로 적지 않는다 — 싸움이 끝나기 전의 어중간한 상태가 남지 않게(시간만 고침)
  if (G && !G.over && !G.busy) S.cur = { g: GEN, L: G.lv.L, done: [...G.done], room: G.room, P: G.P, t: Math.round(G.t * 10) / 10 };
  else if (G && !G.over && S.cur) S.cur.t = Math.round(G.t * 10) / 10;
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveOk = true; } catch { saveOk = false; }
  return saveOk;
}

// ── 소리 (작은 전자음) ────────────────────────────────────────────
let AC = null;
function beep(notes, type = 'triangle', vol = 0.16) {
  if (!S.snd) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    let t = AC.currentTime;
    for (const [f, d] of notes) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
      t += d * 0.8;
    }
  } catch {}
}
const SFX = {
  step: () => beep([[330, .07], [392, .07]], 'square', .06),
  win: () => beep([[523, .09], [784, .14]]),
  item: () => beep([[659, .08], [880, .08], [1047, .14]]),
  bad: () => beep([[300, .12], [220, .2]], 'sawtooth', .1),
  dead: () => beep([[294, .16], [220, .16], [147, .4]], 'sawtooth', .12),
  clear: () => beep([[523, .12], [659, .12], [784, .12], [1047, .35]]),
  no: () => beep([[180, .1]], 'square', .07),
};

// ── 화면 크기 ────────────────────────────────────────────────────
const $stage = $('stage'), $fit = $('fit'), $world = $('world');
let G = null;       // 지금 판
let M = null;       // 재 놓은 크기
const BW = 104, GAP = 26, X0 = 68, ROOF = 20, BOSS_W = 150;
let GROUND = 62; // 땅 높이: 화면 높이의 5분의 1쯤(배경 그림의 풀밭 위에 서게, 아래 도움말에 가리지 않게)

function measure() {
  const lv = G.lv;
  const W = X0 + lv.nb * (BW + GAP) + BOSS_W + 12;
  const sw = $stage.clientWidth, sh = $stage.clientHeight;
  const s = Math.max(0.72, Math.min(1.15, sw / W)); // 좁은 화면은 0.72배까지 줄이고 그보다 넓은 판은 옆으로 민다
  const H = sh / s;
  const maxF = Math.max(...lv.floors);
  GROUND = Math.max(46, Math.min(200, H * 0.22));
  const RH = Math.max(50, Math.min(96, (H - GROUND - ROOF - 40) / Math.max(3, maxF)));
  M = { W, H, s, RH, gy: H - GROUND };
  $fit.style.width = Math.ceil(W * s) + 'px';
  $world.style.width = W + 'px'; $world.style.height = H + 'px';
  $world.style.transform = `scale(${s})`;
  $world.style.setProperty('--rh', RH + 'px'); $world.style.setProperty('--roof', ROOF + 'px');
}
const bx = b => X0 + b * (BW + GAP);
// 용사가 설 자리(왼쪽 위 모서리): 방 번호 · -1 땅 · 'boss' 보스 앞
function spot(where) {
  const hh = M.RH * 0.62;
  if (where === 'boss') return { x: bx(G.lv.nb) - 34, y: M.gy - hh - 2 };
  if (where < 0) return { x: 8, y: M.gy - hh - 2 };
  const r = G.lv.rooms[where];
  return { x: bx(r.b) + 4, y: M.gy - r.f * M.RH - hh - 13 };
}

const big = n => n < 100000 ? String(n) : (n / 10000).toFixed(n < 1e6 ? 1 : 0) + '만'; // 위쪽 줄 점수
const pwText = r => r.t === 'sk' ? r.v : r.t === 'po' ? '+' + r.v : r.t === 'x2' ? '×2' : r.t === 'cu' ? '−' + r.v : '÷2';
function setPw(el, text) {
  el.textContent = text;
  const n = String(text).length;
  el.classList.toggle('s', n === 5 || n === 6); el.classList.toggle('xs', n > 6);
}

// 판을 그린다 (한 번). 그 뒤로는 바뀐 것만 고친다
function draw() {
  measure();
  const lv = G.lv;
  $world.replaceChildren();
  G.el = { rooms: [], occ: [] };
  lv.floors.forEach((nf, b) => {
    const e = document.createElement('div'); e.className = 'bldg';
    e.style.cssText = `left:${bx(b)}px;top:${M.gy - nf * M.RH - ROOF}px;width:${BW}px;height:${nf * M.RH + ROOF}px`;
    $world.append(e);
    if (b) { // 빌딩 사이에 걸쳐 둔 사다리(꾸밈) — 낮은 쪽 빌딩 높이만큼
      const lh = Math.min(nf, lv.floors[b - 1]) * M.RH - 10, l = document.createElement('div'); l.className = 'ladder deco';
      l.style.cssText = `left:${bx(b) - GAP / 2}px;top:${M.gy - lh}px;height:${lh}px`;
      $world.append(l);
    }
  });
  lv.rooms.forEach((r, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'room'; b.dataset.i = i;
    b.style.cssText = `left:${bx(r.b) + 6}px;right:auto;width:${BW - 12}px;top:${M.gy - (r.f + 1) * M.RH + 4}px`;
    b.setAttribute('aria-label', `${r.b + 1}번 빌딩 ${r.f + 1}층`);
    let o = null;
    if (!G.done.has(i)) {
      o = document.createElement('span'); o.className = 'occ ' + r.t + (r.t === 'sk' ? '' : ' item');
      const im = new Image(); im.src = `img/${IMG[r.t]}.webp${V}`; im.alt = ''; im.draggable = false;
      const pw = document.createElement('span'); pw.className = 'pw'; setPw(pw, pwText(r));
      o.append(im, pw); b.append(o);
    }
    $world.append(b); G.el.rooms.push(b); G.el.occ.push(o);
  });
  // 보스
  const bs = document.createElement('button'); bs.type = 'button'; bs.className = 'boss'; bs.id = 'boss';
  bs.style.cssText = `left:${bx(lv.nb)}px;width:${BOSS_W}px;top:${M.gy - M.RH * 1.3}px`;
  const o = document.createElement('span'); o.className = 'occ';
  const im = new Image(); im.src = `img/${lv.boss.kind}.webp${V}`; im.alt = ''; im.draggable = false;
  const pw = document.createElement('span'); pw.className = 'pw'; setPw(pw, lv.boss.p);
  o.append(im, pw);
  const nm = document.createElement('span'); nm.className = 'nm';
  const sm = document.createElement('small'); sm.textContent = '보스';
  nm.append(sm, lv.boss.name);
  bs.append(o, nm); $world.append(bs); G.el.boss = bs;
  bs.setAttribute('aria-label', `보스 ${lv.boss.name} 힘 ${lv.boss.p}`);
  // 용사
  const h = document.createElement('div'); h.className = 'hero';
  const hi = new Image(); hi.src = `img/hero.webp${V}`; hi.alt = '용사'; hi.draggable = false;
  const hp = document.createElement('span'); hp.className = 'pw';
  h.append(hi, hp); $world.append(h); G.el.hero = h; G.el.hp = hp;
  placeHero(false);
  mark();
}
function placeHero(anim) {
  const p = spot(G.room), h = G.el.hero;
  if (!anim) { h.style.transition = 'none'; }
  h.style.left = p.x + 'px'; h.style.top = p.y + 'px';
  if (!anim) { void h.offsetWidth; h.style.transition = ''; }
  setPw(G.el.hp, G.P);
}
const posOf = () => G.room < 0 ? -1 : G.lv.rooms[G.room].b;
const near = b => { const p = posOf(); return p < 0 ? b === 0 : Math.abs(b - p) <= 1; };
// 갈 수 있는 방은 밝게(노란 테), 못 가는 방은 어둡게
function mark() {
  G.lv.rooms.forEach((r, i) => {
    const can = near(r.b) && i !== G.room;
    G.el.rooms[i].classList.toggle('can', can);
    G.el.rooms[i].classList.toggle('far', !near(r.b));
  });
  G.el.boss.classList.toggle('can', posOf() === G.lv.nb - 1);
}
function follow(smooth = true) {
  const x = (parseFloat(G.el.hero.style.left) || 0) * M.s;
  const left = Math.max(0, x - $stage.clientWidth * 0.3);
  $stage.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

// ── 판 시작 ─────────────────────────────────────────────────────
function start(L, cur) {
  if (S.gift) return askBoss(() => start(L, cur)); // 못 받은 30레벨 선물부터
  const lv = makeLevel(L, S.custom, S.customAt);
  G = { lv, done: new Set(), room: -1, P: lv.hero, t: 0, busy: false, over: false };
  if (cur && cur.L === L && Array.isArray(cur.done)) { // 하던 판 이어서 (값이 이상하면 처음부터)
    const ok = cur.done.every(i => Number.isInteger(i) && i >= 0 && i < lv.rooms.length) && (cur.room === -1 ? !cur.done.length : cur.done.includes(cur.room)) && Number.isInteger(cur.P) && cur.P >= 1;
    if (ok) { G.done = new Set(cur.done); G.room = cur.room; G.P = cur.P; }
    G.t = Math.max(0, Math.min(86400, +cur.t || 0)); // 시간은 다시 해도 이어서 잰다
  }
  $('title').hidden = true; $('game').hidden = false;
  $('hLv').textContent = L; $('hScore').textContent = big(S.score);
  draw();
  showTip(firstTip(lv));
  lastTick = performance.now();
  tickTime(); save();
  stuck();
  // 판이 화면보다 넓으면 먼저 보스 쪽을 보여 주고 용사에게 돌아온다
  const max = $stage.scrollWidth - $stage.clientWidth;
  if (max > 8 && G.room < 0) { $stage.scrollLeft = max; const g = G; setTimeout(() => { if (G === g && !G.busy && G.room < 0) follow(); }, 900); }
  else follow(false);
  edge();
}
// 더는 보스를 이길 길이 없으면 알려 준다(어떻게 풀지는 알려 주지 않는다)
function stuck() {
  if (solve(G.lv, { done: [...G.done], pos: posOf(), P: G.P }) <= G.lv.boss.p) showTip('이 순서로는 보스를 이길 수 없게 됐어요.', '다시 하기', retry);
}
// 옆으로 더 있으면 가장자리에 화살표
function edge() {
  const max = $stage.scrollWidth - $stage.clientWidth, x = $stage.scrollLeft;
  $('game').classList.toggle('more-r', max - x > 8); $('game').classList.toggle('more-l', x > 8);
}
$stage.addEventListener('scroll', edge, { passive: true });
function firstTip(lv) {
  const has = t => lv.rooms.some(r => r.t === t);
  const tips = [
    ['sk', '내 숫자보다 작은 해골만 이길 수 있어요. 노란 테두리 방을 눌러 보세요!'],
    ['po', '빨간 물약을 마시면 힘이 올라요.'],
    ['x2', '파란 수정은 힘을 2배로! 언제 먹느냐가 중요해요.'],
    ['cu', '저주 방에 들어가면 힘을 빼앗겨요. 꼭 지나가야 한다면 언제 · 어느 쪽으로 갈지 생각해요.'],
    ['hf', '÷2 저주는 힘이 절반이 돼요. 힘이 작을 때 지나가면 덜 아파요.'],
  ];
  for (const [t, msg] of tips) if (has(t) && !S.seen[t]) { S.seen[t] = 1; return msg; }
  return '';
}
function showTip(msg, btn, fn) {
  const t = $('tip');
  t.replaceChildren();
  if (!msg) { t.hidden = true; return; }
  const sp = document.createElement('span'); sp.textContent = msg; sp.style.flex = '1'; t.append(sp);
  if (btn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = btn; b.addEventListener('click', fn); t.append(b); }
  t.hidden = false;
}

// 시간: 판이 보이고 창이 없을 때만 흐른다
let lastTick = 0, paused = false;
function tickTime() {
  const now = performance.now();
  if (G && !G.over && !paused && !document.hidden && !$('game').hidden) G.t += Math.min(0.5, (now - lastTick) / 1000);
  lastTick = now;
  if (G) $('hTime').textContent = G.t < 600 ? G.t.toFixed(1) : Math.floor(G.t / 60) + ':' + String(Math.floor(G.t % 60)).padStart(2, '0');
}
setInterval(tickTime, 100);

// ── 움직이기 ────────────────────────────────────────────────────
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1700);
}
function nope(el, msg) {
  el.classList.remove('no'); void el.offsetWidth; el.classList.add('no');
  SFX.no(); toast(msg);
}
function float(text, cls, where) {
  const p = spot(where), f = document.createElement('div');
  f.className = 'float ' + cls; f.textContent = text;
  f.style.left = p.x + 6 + 'px'; f.style.top = p.y - 30 + 'px';
  $world.append(f); setTimeout(() => f.remove(), 850);
}
// 사다리를 놓고 용사를 옮긴다
async function walk(to) {
  const a = spot(G.room), b = spot(to), hh = M.RH * 0.62;
  const ax = a.x + 22, ay = a.y + hh, bxx = b.x + 22, by = b.y + hh;
  const dx = bxx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  let lad = null;
  if (len > 8) {
    lad = document.createElement('div'); lad.className = 'ladder';
    lad.style.cssText = `left:${ax}px;top:${ay}px;height:${len}px;transform:rotate(${Math.atan2(-dx, dy)}rad)`;
    $world.append(lad); void lad.offsetWidth; lad.classList.add('on');
  }
  G.el.hero.classList.toggle('left', dx < -4);
  SFX.step();
  G.el.hero.style.left = b.x + 'px'; G.el.hero.style.top = b.y + 'px';
  follow();
  await sleep(440);
  G.el.hero.classList.remove('left');
  if (lad) { lad.classList.remove('on'); setTimeout(() => lad.remove(), 200); }
}
function heroBump() { const h = G.el.hero; h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit'); }
function powerUp(P) {
  G.P = P; setPw(G.el.hp, P);
  const h = G.el.hero; h.classList.remove('up'); void h.offsetWidth; h.classList.add('up');
}

async function goRoom(i) {
  if (!G || G.busy || G.over || i === G.room) return;
  const r = G.lv.rooms[i];
  if (!near(r.b)) return nope(G.el.rooms[i], '사다리는 바로 옆 빌딩까지만 닿아요!');
  G.busy = true; showTip('');
  await walk(i);
  G.room = i;
  if (!G.done.has(i)) {
    const q = apply(G.P, r), occ = G.el.occ[i];
    if (r.t === 'sk') {
      heroBump(); await sleep(260);
      if (q < 0) return die(`해골 병사의 힘 ${r.v} · 내 힘 ${G.P}`, r.v === G.P ? '힘이 같으면 져요. 더 커야 이겨요!' : '나보다 센 해골이었어요.');
      SFX.win(); float('+' + r.v, 'good', i);
    } else if (r.t === 'po' || r.t === 'x2') { SFX.item(); float(pwText(r), 'good', i); }
    else { SFX.bad(); float(pwText(r), 'bad', i); }
    G.done.add(i);
    if (occ) { occ.classList.add('gone'); setTimeout(() => occ.remove(), 320); G.el.occ[i] = null; }
    powerUp(q);
    await sleep(200);
  }
  mark();
  G.busy = false; save();
  if (needDraw) redraw();
  stuck();
}

async function goBoss() {
  if (!G || G.busy || G.over) return;
  if (posOf() !== G.lv.nb - 1) return nope(G.el.boss, '보스에게는 마지막 빌딩에서만 갈 수 있어요!');
  G.busy = true; showTip('');
  await walk('boss');
  heroBump(); await sleep(300);
  const b = G.lv.boss;
  if (G.P <= b.p) return die(`${b.name}의 힘 ${b.p} · 내 힘 ${G.P}`, G.P === b.p ? '힘이 같으면 져요. 더 커야 이겨요!' : '보스가 더 셌어요. 힘을 더 모아야 해요.');
  G.el.boss.querySelector('.occ').classList.add('gone');
  SFX.clear(); powerUp(G.P + b.p);
  G.over = true;
  await sleep(650);
  clear();
}

// 졌을 때: 1초쯤 뒤에 다시 시작 / 그만하기
async function die(line, why) {
  G.over = true; S.cur = again(); save();
  G.el.hero.classList.add('dead'); SFX.dead();
  await sleep(1000);
  dialog({
    art: 'hero', dead: true, title: '용사가 쓰러졌어요',
    body: [why, line],
    btns: [['다시 시작', () => start(G.lv.L, S.cur)], ['그만하기', home, 'ghost']],
  });
}
// 같은 레벨을 처음 자리에서 다시 — 걸린 시간은 이어서 잰다(메달은 이 레벨을 깨는 데 든 시간 전부로)
function again() { return { g: GEN, L: G.lv.L, done: [], room: -1, P: G.lv.hero, t: Math.round(G.t * 10) / 10 }; }
function retry() { if (G && !G.busy) { S.cur = again(); start(G.lv.L, S.cur); } }

// 보스를 쓰러뜨림: 점수 · 메달 · 저장
function clear() {
  const lv = G.lv, L = lv.L, sec = G.t;
  const m = medalFor(lv, sec), pts = scoreFor(lv, m), cut = medalTimes(lv);
  S.score += pts; S.medals[m]++; S.level = L + 1; S.cur = null;
  if (L % 30 === 0) S.gift = L; // 30의 배수: 보스 정하기(창을 닫아 버려도 다음에 다시 묻는다)
  const ok = save();
  $('hScore').textContent = big(S.score);
  dialog({
    medal: m, title: `레벨 ${L} 클리어!`,
    body: [`보스 ${lv.boss.name} 격파! ${MEDALS[m]} 메달을 받았어요.`],
    rows: [['걸린 시간', sec.toFixed(1) + '초'], ['이번 점수', '+' + pts], ['모은 점수', S.score]],
    cut: `다이아 ${cut[0]}초 · 금 ${cut[1]}초 · 은 ${cut[2]}초 · 동 ${cut[3]}초 안에` + (ok ? ' · 저장했어요' : ''),
    gift: !!S.gift,
    btns: [['다음 레벨', v => { setBoss(v); start(L + 1); }], ['그만하기', v => { setBoss(v); home(); }, 'ghost']],
  });
}
// 30의 배수 레벨을 깨면 타이핑으로 정한 보스
function setBoss(name) {
  const L = S.gift; if (!L) return;
  S.gift = 0;
  name = (name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
  if (name) { S.custom = S.custom.filter(n => n !== name).concat(name).slice(-5); S.customAt = L; }
  save();
}
function askBoss(then) {
  dialog({ art: 'chest', title: `레벨 ${S.gift} 선물`, body: [], gift: true, btns: [['정했어요', v => { setBoss(v); then(); }]] });
}

// ── 알림 창 ─────────────────────────────────────────────────────
function dialog(o) {
  paused = !o.run; // run: 판이 뒤에 보이는 창(그만 · 다시)은 시간이 계속 흐른다
  const box = $('dlgBox'); box.replaceChildren();
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; box.append(e); return e; };
  if (o.medal != null) add('span', 'medal big m' + o.medal);
  if (o.art) { const im = add('img', 'dlg-art' + (o.dead ? ' dead' : '')); im.src = `img/${o.art}.webp${V}`; im.alt = ''; }
  add('h2', '', o.title);
  for (const t of o.body || []) add('p', '', t);
  if (o.rows) { const rs = add('div', 'rows'); for (const [k, v] of o.rows) { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = v; d.append(k, b); rs.append(d); } }
  if (o.cut) add('p', 'cut', o.cut);
  let input = null;
  if (o.gift) {
    const g = add('div', 'gift');
    const p = document.createElement('p'); p.textContent = '30레벨 선물! 다음에 만날 보스를 정해 보세요.'; g.append(p);
    input = document.createElement('input'); input.type = 'text'; input.maxLength = 12; input.placeholder = '예) 불 뿜는 공룡'; input.autocomplete = 'off'; input.enterKeyHint = 'done';
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    g.append(input);
  }
  const bs = add('div', 'btns');
  for (const [label, fn, cls] of o.btns) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (cls ? ' ' + cls : ''); b.textContent = label;
    b.addEventListener('click', () => { closeDlg(); fn(input ? input.value : ''); });
    bs.append(b);
  }
  $('dlg').hidden = false;
}
function closeDlg() { $('dlg').hidden = true; paused = false; lastTick = performance.now(); }

// ── 처음 화면 ───────────────────────────────────────────────────
function home() {
  if (G && !G.over) save();
  G = null;
  $('game').hidden = true; $('title').hidden = false;
  const played = S.level > 1 || S.cur || S.score > 0;
  $('btnStart').textContent = played ? `이어하기 · 레벨 ${S.level}` : '시작하기';
  $('btnNew').hidden = !played;
  const st = $('tStat'); st.hidden = !played; st.replaceChildren();
  if (played) {
    const sc = document.createElement('span'); sc.textContent = `점수 ${S.score}`; st.append(sc);
    S.medals.forEach((n, m) => {
      if (!n) return;
      const w = document.createElement('span'); w.className = 'mm';
      const md = document.createElement('span'); md.className = 'medal m' + m; md.style.fontSize = '22px'; md.title = MEDALS[m];
      w.append(md, String(n)); st.append(w);
    });
  }
}

$('btnStart').addEventListener('click', () => { beep([[1, .01]], 'sine', .001); start(S.level, S.cur); });
$('btnNew').addEventListener('click', () => dialog({
  title: '처음부터 다시 할까요?', body: ['점수와 메달이 모두 지워지고 레벨 1부터 시작해요.'],
  btns: [['처음부터 시작', () => { const snd = S.snd; S = fresh(); S.snd = snd; save(); start(1); }], ['아니요', () => {}, 'ghost']],
}));
$('btnMenu').addEventListener('click', () => {
  if (!G || G.busy) return;
  dialog({ title: '그만할까요?', body: ['지금까지 한 것은 저장돼요. 다음에 이어서 할 수 있어요.'], btns: [['계속하기', () => {}], ['그만하기', home, 'ghost']], run: true });
});
$('btnRetry').addEventListener('click', () => {
  if (!G || G.busy || G.over) return;
  dialog({ title: '이 레벨을 다시 할까요?', body: ['처음 자리에서 다시 시작해요. 시간은 이어서 재요.'], btns: [['다시 하기', retry], ['계속하기', () => {}, 'ghost']], run: true });
});
$('btnSave').addEventListener('click', () => { if (G) toast(save() ? '저장했어요!' : '이 기기에는 저장할 수 없어요.'); });
function showSnd() { $('btnSnd').classList.toggle('off', !S.snd); $('btnSnd').setAttribute('aria-pressed', String(!!S.snd)); }
$('btnSnd').addEventListener('click', () => { S.snd = S.snd ? 0 : 1; showSnd(); save(); if (S.snd) SFX.win(); });
showSnd();

$world.addEventListener('click', e => {
  const r = e.target.closest('.room'); if (r) return void goRoom(+r.dataset.i);
  if (e.target.closest('.boss')) goBoss();
});
let rz = 0, needDraw = false;
function redraw() { needDraw = false; if (G && !G.over && !$('game').hidden) { draw(); follow(false); edge(); } }
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (G && G.busy) needDraw = true; else redraw(); }, 150); });
addEventListener('pagehide', () => { if (G && !G.over) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.over) save(); lastTick = performance.now(); });

home();
// 시험용
if (/[?&]debug/.test(location.search)) window.__sang = { get G() { return G; }, get S() { return S; }, start, solve, makeLevel };
