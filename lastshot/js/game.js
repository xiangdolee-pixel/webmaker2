/* 라스트샷 — 화면 · 소리 · 조작. 규칙은 core.js.
   3D(three.js r160, MIT — js/vendor 에 함께 올림): 바다 위 다리, 병사 · 적은 InstancedMesh 로 수백 명,
   빛나는 총알 줄기 · 불꽃 · 연기 · 파편. 숫자(문 제외) · 떠오르는 글자 · 보스 체력은 위 2D 캔버스에 3D 위치를 투영해 그린다. */
import * as THREE from './vendor/three.module.min.js';
import { ROAD_L, ROAD_R, MID, SPAWN, TIERS, STAGES, BOSSES, stageOf, bossOf, squadPos, squadR, newGame, step, autoAim } from './core.js?v=11';

const $ = s => document.querySelector(s);
const glc = $('#gl'), cv = $('#cv'), ctx = cv.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = .1;                                   // 평면 1 = 3D 0.1
const wx = x => (x - MID) * S, wz = y => y * S;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ── 저장 ── */
const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : +v || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let level = load('lastshot_level', 1), best = load('lastshot_best', 1), muted = load('lastshot_mute', 0) === 1;
// 점수: 쓰러질 때까지 이어서 깬 레벨들의 점수를 모은다(run). 쓰러지면 그 점수로 랭킹(1~10등)에 이름을 넣고 0 부터
let run = load('lastshot_run', 0);
const score = () => run + (G && state !== 'menu' ? G.score : 0);
const fmt = n => Math.round(n).toLocaleString('ko-KR');

/* ── 소리: 짧은 합성음(파일 없음) ── */
let AC = null, lastShot = 0, hitT = 0, tickT = 0;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
function tone(f0, f1, dur, type, vol, noise) {
  if (muted || !AC) return;
  const t = AC.currentTime, g = AC.createGain(); g.connect(AC.destination);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  if (noise) {
    const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * dur), AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(); src.buffer = buf;
    const bp = AC.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = f0; src.connect(bp); bp.connect(g); src.start(t);
  } else {
    const o = AC.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    o.connect(g); o.start(t); o.stop(t + dur);
  }
}
const SFX = {
  shot() { const n = performance.now(); if (n - lastShot < 75) return; lastShot = n; tone(1100, 260, .05, 'square', .02); tone(500, 60, .06, 'square', .03, true); },
  hit() { const n = performance.now(); if (n - hitT < 40) return; hitT = n; tone(1800, 600, .04, 'triangle', .025); },
  kill() { tone(2600, 200, .08, 'square', .03, true); },
  gateUp() { tone(660, 1320, .14, 'sine', .09); tone(990, 1980, .14, 'triangle', .04); },
  gateDown() { tone(220, 90, .28, 'sawtooth', .07); },
  gateTick(k) { const n = performance.now(); if (n - tickT < 35) return; tickT = n; const f = 700 + Math.min(1600, k * 22); tone(f, f * 1.25, .045, 'square', .025); tone(f * 2, f * 2.4, .03, 'sine', .02); },
  boom() { tone(600, 40, .5, 'square', .14, true); },
  cannon() { tone(180, 40, .35, 'square', .12, true); tone(90, 40, .3, 'sawtooth', .06); },
  hurt() { tone(160, 70, .14, 'sawtooth', .05); },
  power() { tone(520, 1560, .3, 'triangle', .1); setTimeout(() => tone(780, 2000, .25, 'triangle', .07), 90); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, .2, 'triangle', .09), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f * .9, .25, 'sawtooth', .06), i * 160)); }
};
const buzz = ms => { if (!muted && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

/* ── 3D 기본 ── */
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#9fd8f5');
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 70, 170);
const camera = new THREE.PerspectiveCamera(52, 9 / 16, .5, 400);

const hemi = new THREE.HemisphereLight('#eaf6ff', '#7d8792', 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6e8', 2.1);
sun.position.set(-14, 34, 18); sun.target.position.set(0, 0, -16);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 46, bottom: -30, near: 1, far: 100 });
sun.shadow.bias = -.0015;
scene.add(sun, sun.target);

/* 부드러운 동그라미 그림(그림자 · 연기 · 빛) */
function radial(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const texBlob = radial([[0, 'rgba(0,0,0,.55)'], [.6, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]);
const texGlow = radial([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
const texSmoke = radial([[0, 'rgba(255,255,255,.9)'], [.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
function streakTex() {   // 총알 줄기: 앞이 밝고 꼬리로 갈수록 흐려짐
  const c = document.createElement('canvas'); c.width = 32; c.height = 256;
  const x = c.getContext('2d');
  const gy = x.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(255,255,255,1)'); gy.addColorStop(.15, 'rgba(255,255,255,.95)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gy; x.fillRect(0, 0, 32, 256);
  x.globalCompositeOperation = 'destination-in';
  const gx = x.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gx; x.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ── 배경: 바다 · 다리 · 탑 ── */
const LEN = 260, SPAN = 120;
function seaTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#2f8fd8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${rnd(.06, .2)})`; x.fillRect(rnd(0, 256), rnd(0, 256), rnd(10, 40), rnd(1.5, 3)); }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(10,60,120,${rnd(.1, .25)})`; x.fillRect(rnd(0, 256), rnd(0, 256), rnd(20, 60), rnd(2, 5)); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: seaTex() }));
sea.rotation.x = -Math.PI / 2; sea.position.set(0, -9, -100); scene.add(sea);

const RW = (ROAD_R - ROAD_L) * S;               // 길 폭 29.2
const deck = new THREE.Mesh(new THREE.BoxGeometry(RW + 7, 1.6, LEN), new THREE.MeshLambertMaterial({ color: '#7f8893' }));
deck.position.set(0, -.8, -LEN / 2 + 30); deck.receiveShadow = true; scene.add(deck);
const road = new THREE.Mesh(new THREE.PlaneGeometry(RW, LEN), new THREE.MeshLambertMaterial({ color: '#a9b0b8' }));
road.rotation.x = -Math.PI / 2; road.position.set(0, .01, -LEN / 2 + 30); road.receiveShadow = true; scene.add(road);
[-1, 1].forEach(s => {   // 보도 · 낮은 벽 · 난간
  const walk = new THREE.Mesh(new THREE.BoxGeometry(2.2, .5, LEN), new THREE.MeshLambertMaterial({ color: '#cdd3d9' }));
  walk.position.set(s * (RW / 2 + 1.1), .25, -LEN / 2 + 30); walk.receiveShadow = true; scene.add(walk);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.3, LEN), new THREE.MeshLambertMaterial({ color: '#8e98a3' }));
  wall.position.set(s * (RW / 2 + 2.6), .65, -LEN / 2 + 30); wall.castShadow = true; scene.add(wall);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.28, .22, LEN), new THREE.MeshLambertMaterial({ color: '#e8473a' }));
  rail.position.set(s * (RW / 2 + 2.6), 2.2, -LEN / 2 + 30); scene.add(rail);
});
// 움직이는 것들(차선 · 난간 기둥 · 탑): 길이 다가오는 만큼 당겨 되풀이
const movers = [];
let towerMat, cableMat;
/* 스테이지마다 하늘 · 바다 · 빛 색 (0 낮 · 1 노을 · 2 저녁 · 3 흐림 · 4 밤) */
const THEMES = [
  { sky: '#9fd8f5', sea: '#ffffff', hs: '#eaf6ff', hg: '#7d8792', hi: 1.35, sun: '#fff6e8', si: 2.1, tower: '#d8432f', road: '#a9b0b8' },
  { sky: '#ffb88a', sea: '#ffc9a6', hs: '#ffe2c4', hg: '#8a6f68', hi: 1.25, sun: '#ffb070', si: 2.2, tower: '#c2452e', road: '#b3a8a6' },
  { sky: '#b89ce8', sea: '#c8b4ff', hs: '#e6dcff', hg: '#6f6a8c', hi: 1.2, sun: '#ffd0f0', si: 1.9, tower: '#7d5cd6', road: '#a4a2b6' },
  { sky: '#b9c6cc', sea: '#c6d4d6', hs: '#eef2f2', hg: '#7f8a86', hi: 1.45, sun: '#ffffff', si: 1.5, tower: '#5e8c6a', road: '#a5abac' },
  { sky: '#2a3a6e', sea: '#6f86d8', hs: '#9fb4ff', hg: '#3a3f5a', hi: 1.15, sun: '#c9d6ff', si: 1.7, tower: '#e0a93a', road: '#7f8698' }
];
let themeNow = -1;
function setTheme(i) {
  if (i === themeNow) return; themeNow = i; const t = THEMES[i];
  scene.background.set(t.sky); scene.fog.color.set(t.sky);
  hemi.color.set(t.hs); hemi.groundColor.set(t.hg); hemi.intensity = t.hi;
  sun.color.set(t.sun); sun.intensity = t.si;
  sea.material.color.set(t.sea); towerMat.color.set(t.tower); cableMat.color.set(t.tower).multiplyScalar(.9); road.material.color.set(t.road);
}
{
  const m = new THREE.Matrix4();
  const n = Math.ceil(LEN / 6);
  const dash = new THREE.InstancedMesh(new THREE.BoxGeometry(.35, .02, 2.6), new THREE.MeshLambertMaterial({ color: '#f4f6f8' }), n);
  for (let i = 0; i < n; i++) { m.makeTranslation(0, .03, 30 - i * 6); dash.setMatrixAt(i, m); }
  dash.receiveShadow = true; scene.add(dash); movers.push({ mesh: dash, gap: 6 });
  const pn = Math.ceil(LEN / 3) * 2;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.2, 1, .2), new THREE.MeshLambertMaterial({ color: '#d93a2f' }), pn);
  for (let i = 0; i < pn; i++) { m.makeTranslation((i % 2 ? 1 : -1) * (RW / 2 + 2.6), 1.7, 30 - Math.floor(i / 2) * 3); posts.setMatrixAt(i, m); }
  scene.add(posts); movers.push({ mesh: posts, gap: 3 });
  // 탑 + 주 케이블 + 세로 줄
  towerMat = new THREE.MeshLambertMaterial({ color: '#d8432f' }); cableMat = new THREE.MeshLambertMaterial({ color: '#c8392c' });
  const tower = new THREE.Group();
  const TH = 34, TX = RW / 2 + 4.2;
  [-1, 1].forEach(s => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, TH + 10, 2.6), towerMat); leg.position.set(s * TX, TH / 2 - 5, 0); leg.castShadow = true; tower.add(leg);
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector3(s * (TX - .2), 2.6 + (TH - 2.6) * Math.pow(2 * t - 1, 2), -t * SPAN)); }
    tower.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, .22, 6), cableMat));
    for (let i = 1; i < 12; i++) {
      const t = i / 12, h = 2.6 + (TH - 2.6) * Math.pow(2 * t - 1, 2);
      const hg = new THREE.Mesh(new THREE.BoxGeometry(.08, h - 2, .08), cableMat); hg.position.set(s * (TX - .2), 2 + (h - 2) / 2, -t * SPAN); tower.add(hg);
    }
  });
  for (let k = 0; k < 2; k++) { const t = k ? tower.clone() : tower; scene.add(t); movers.push({ group: t, base: -40 - k * SPAN, loop: SPAN * 2 }); }
}
let envZ = 0;
function moveEnv(dz) {
  envZ += dz;
  sea.material.map.offset.y += dz / 40;
  for (const M of movers) {
    if (M.group) { let z = M.base + (envZ % M.loop); if (z > 50) z -= M.loop; M.group.position.z = z; }
    else M.mesh.position.z = envZ % M.gap;
  }
}

/* ── 병사(아군 · 적 공용) : 부위마다 InstancedMesh 하나 ── */
const CAP = 520;
const solMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
function part(geo) { const m = new THREE.InstancedMesh(geo, solMat, CAP); m.frustumCulled = false; m.count = 0; scene.add(m); return m; }
const P = {
  legL: part(new THREE.BoxGeometry(.3, .62, .32).translate(0, -.31, 0)),
  legR: part(new THREE.BoxGeometry(.3, .62, .32).translate(0, -.31, 0)),
  body: part(new THREE.CapsuleGeometry(.4, .28, 4, 10)),
  arm: part(new THREE.CapsuleGeometry(.14, .38, 3, 6)),
  head: part(new THREE.SphereGeometry(.42, 14, 10)),
  helm: part(new THREE.SphereGeometry(.5, 14, 9, 0, Math.PI * 2, 0, Math.PI * .52)),
  gun: part(new THREE.BoxGeometry(.18, .2, 1)),
  belt: part(new THREE.TorusGeometry(.42, .08, 5, 14).rotateX(Math.PI / 2))
};
const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texBlob, transparent: true, depthWrite: false }), CAP);
blob.frustumCulled = false; blob.position.y = .04; scene.add(blob);
const C = {
  skin: new THREE.Color('#f2c69b'), white: new THREE.Color('#ffffff'), gun: new THREE.Color('#2b3038'),
  blue: [new THREE.Color('#3d8bff'), new THREE.Color('#1f5fe0'), new THREE.Color('#22c3ee')],
  blueShirt: new THREE.Color('#f3e4c8'), bluePants: new THREE.Color('#2c4b8e'), beltC: new THREE.Color('#5b4636'),
  red: new THREE.Color('#e3343a'), redShirt: new THREE.Color('#e9b98e'), redPants: new THREE.Color('#7a3b2a')
};
const M4 = new THREE.Matrix4(), L4 = new THREE.Matrix4(), B4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler();
let si = 0;
function put(mesh, x, y, z, rx, sc, col) {
  E.set(rx || 0, 0, 0); Q.setFromEuler(E); V.set(x, y, z); SC.setScalar(sc);
  L4.compose(V, Q, SC); M4.multiplyMatrices(B4, L4); mesh.setMatrixAt(si, M4); mesh.setColorAt(si, col);
}
function soldier(x, z, face, scale, walk, me, flash, tier) {
  if (si >= CAP) return;
  E.set(0, face, 0); Q.setFromEuler(E); V.set(x, 0, z); SC.setScalar(scale); B4.compose(V, Q, SC);
  const fl = flash > 0;
  const hel = fl ? C.white : me ? C.blue[tier] : C.red, shirt = fl ? C.white : me ? C.blueShirt : C.redShirt, pants = fl ? C.white : me ? C.bluePants : C.redPants;
  const sw = Math.sin(walk) * .7, bob = Math.abs(Math.cos(walk)) * .06;
  put(P.legL, -.2, .66, 0, sw, 1, pants);
  put(P.legR, .2, .66, 0, -sw, 1, pants);
  put(P.body, 0, 1.08 + bob, 0, 0, 1, shirt);
  put(P.head, 0, 1.86 + bob, 0, 0, 1, fl ? C.white : C.skin);
  put(P.helm, 0, 1.9 + bob, 0, -.12, 1, hel);
  if (me) {
    put(P.arm, .42, 1.15 + bob, -.25, -1.2, 1, shirt);
    put(P.gun, .3, 1.22 + bob, -.55 - tier * .08, 0, 1 + tier * .25, C.gun);
    put(P.belt, 0, 1.12 + bob, 0, .5, tier ? 1 : .001, C.beltC);
  } else {
    put(P.arm, .44, 1.1 + bob, 0, sw * .8, 1, shirt);
    put(P.gun, 0, 0, 0, 0, .001, C.gun);
    put(P.belt, 0, 0, 0, 0, .001, C.gun);
  }
  M4.compose(V.set(x, 0, z), Q0, SC.setScalar(scale)); blob.setMatrixAt(si, M4);
  si++;
}
function flushSoldiers() {
  for (const k in P) { P[k].count = si; P[k].instanceMatrix.needsUpdate = true; if (P[k].instanceColor) P[k].instanceColor.needsUpdate = true; }
  blob.count = si; blob.instanceMatrix.needsUpdate = true;
}

/* ── 총알 줄기 ── */
const BCAP = 600;
const bullets = new THREE.InstancedMesh(new THREE.PlaneGeometry(.55, 4.2).translate(0, -1.9, 0).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), BCAP);
bullets.frustumCulled = false; bullets.count = 0; scene.add(bullets);
const BCOL = [new THREE.Color('#ffc93a'), new THREE.Color('#ff9a2a'), new THREE.Color('#4fe3ff')];

/* ── 불꽃(더하기 빛) · 연기 · 파편 ── */
function pool(cap, mesh) { mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); return { mesh, list: [], cap }; }
const sparks = pool(700, new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 700));
const smokes = pool(160, new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texSmoke, transparent: true, depthWrite: false, opacity: .75 }), 160));
const debris = pool(500, new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshLambertMaterial({ color: '#fff' }), 500));
const FXC = {
  red: ['#e3343a', '#f2c69b', '#b5262b'], blue: ['#3d8bff', '#f3e4c8', '#2c4b8e'], tire: ['#26282c', '#3a3d42', '#55585e'],
  gold: ['#ffd23f', '#ffb020', '#fff1a8'], hot: ['#ffe27a', '#ffb347'], cool: ['#bfefff', '#7fd6ff']
};
const tmpC = new THREE.Color();
function addSpark(x, h, z, col, size, life, vx, vh, vz) { if (sparks.list.length < sparks.cap) sparks.list.push({ x, h, z, vx: vx || 0, vh: vh || 0, vz: vz || 0, s: size, t: life, L: life, c: new THREE.Color(col) }); }
function fxSpark(x, y, kind, n) {
  const cols = FXC[kind] || FXC.hot;
  for (let i = 0; i < n; i++) addSpark(wx(x) + rnd(-.3, .3), rnd(.8, 1.8), wz(y), cols[i % cols.length], rnd(.6, 1.2), rnd(.08, .2), rnd(-6, 6), rnd(-1, 5), rnd(-2, 6));
}
function fxBurst(x, y, kind, n) {
  if (reduce) n = Math.ceil(n / 3);
  const cols = FXC[kind] || FXC.red;
  for (let i = 0; i < n; i++) {
    if (debris.list.length < debris.cap) debris.list.push({ x: wx(x) + rnd(-.5, .5), h: rnd(.6, 1.8), z: wz(y) + rnd(-.5, .5), vx: rnd(-7, 7), vh: rnd(4, 12), vz: rnd(-5, 7), r: rnd(0, 6), vr: rnd(-12, 12), s: kind === 'tire' ? rnd(1, 2.2) : rnd(.6, 1.3), t: rnd(.5, 1), c: new THREE.Color(cols[i % cols.length]) });
  }
  for (let i = 0; i < Math.min(8, n); i++) addSpark(wx(x) + rnd(-.6, .6), rnd(.5, 2), wz(y) + rnd(-.6, .6), kind === 'gold' ? '#ffe07a' : '#ffb35a', rnd(1.2, 2.4), rnd(.12, .25), rnd(-3, 3), rnd(0, 4), rnd(-3, 3));
}
function fxSmoke(x, y, n = 1) {
  for (let i = 0; i < n; i++) if (smokes.list.length < smokes.cap) smokes.list.push({ x: wx(x) + rnd(-.8, .8), h: rnd(.6, 1.6), z: wz(y) + rnd(-.6, .6), vx: rnd(-1, 1), vh: rnd(1, 2.4), vz: rnd(0, 2), s: rnd(1.4, 2.4), t: rnd(.5, .8), L: .8, g: rnd(.82, .96) });
}
function flushPool(pl) { pl.mesh.instanceMatrix.needsUpdate = true; if (pl.mesh.instanceColor) pl.mesh.instanceColor.needsUpdate = true; }
function updateFx(dt) {
  const cq = camera.quaternion;
  let i = 0;
  sparks.list = sparks.list.filter(p => (p.t -= dt) > 0);
  for (const p of sparks.list) {
    p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
    const k = p.t / p.L; M4.compose(V.set(p.x, p.h, p.z), cq, SC.setScalar(p.s * (.6 + k * .6)));
    sparks.mesh.setMatrixAt(i, M4); sparks.mesh.setColorAt(i, tmpC.copy(p.c).multiplyScalar(k)); i++;
  }
  sparks.mesh.count = i; flushPool(sparks);
  i = 0;
  smokes.list = smokes.list.filter(p => (p.t -= dt) > 0);
  for (const p of smokes.list) {
    p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
    const k = p.t / p.L; M4.compose(V.set(p.x, p.h, p.z), cq, SC.setScalar(p.s * (1.6 - k) * Math.min(1, k * 4)));
    smokes.mesh.setMatrixAt(i, M4); smokes.mesh.setColorAt(i, tmpC.setScalar(p.g)); i++;
  }
  smokes.mesh.count = i; flushPool(smokes);
  i = 0;
  debris.list = debris.list.filter(p => (p.t -= dt) > 0);
  for (const p of debris.list) {
    p.vh -= 30 * dt; p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt; p.r += p.vr * dt;
    if (p.h < .15) { p.h = .15; p.vh *= -.35; p.vx *= .6; p.vz *= .6; }
    E.set(p.r, p.r * .7, 0); Q.setFromEuler(E);
    M4.compose(V.set(p.x, p.h, p.z), Q, SC.setScalar(p.s * Math.min(1, p.t * 3)));
    debris.mesh.setMatrixAt(i, M4); debris.mesh.setColorAt(i, p.c); i++;
  }
  debris.mesh.count = i; flushPool(debris);
}
// 문을 지날 때 · 상자가 부서질 때 바닥에 퍼지는 고리
const rings = [];
function fxRing(x, y, kind) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1.3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: kind === 'gold' ? '#ffd23f' : '#5cc8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(wx(x), .1, wz(y)); scene.add(m); rings.push({ m, t: .5 });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t -= dt; const k = 1 - r.t / .5;
    r.m.scale.setScalar(1 + k * 9); r.m.material.opacity = 1 - k;
    if (r.t <= 0) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
}

/* ── 문: 반투명 판 + 큰 숫자(판에 그린 그림) ── */
const views = new Map();   // core 물건 → 3D 물건
function gateLabel(p) { return p.t === 'x' ? '×' + p.v : p.t === '/' ? '÷' + p.v : (p.v > 0 ? '+' : '') + p.v; }
function paintGate(pv, p) {
  const good = p.t === 'x' || (p.t === '+' && p.v >= 0), c = pv.cv, x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  if (good) { g.addColorStop(0, 'rgba(120,200,255,.5)'); g.addColorStop(1, 'rgba(30,120,255,.85)'); }
  else { g.addColorStop(0, 'rgba(255,140,140,.5)'); g.addColorStop(1, 'rgba(230,30,40,.85)'); }
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(0, 0, W, 10);
  x.font = `900 ${W < 400 ? 104 : 128}px Pretendard, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = good ? 'rgba(10,40,110,.8)' : 'rgba(110,10,20,.8)';
  const s = gateLabel(p); x.strokeText(s, W / 2, H / 2 + 8); x.fillStyle = '#fff'; x.fillText(s, W / 2, H / 2 + 8);
  if (pv.swap) { x.font = '900 30px Pretendard, sans-serif'; x.fillStyle = 'rgba(255,255,255,.95)'; x.fillText('⇄ 바뀌는 문', W / 2, 28); }
  pv.label = s; pv.tex.needsUpdate = true;
  pv.posts.forEach(m => m.material.color.set(good ? '#2d7cf0' : '#e23a3a'));
}
function makeGate(gt) {
  const grp = new THREE.Group(), parts = [];
  gt.parts.forEach(p => {
    const w = (p.x1 - p.x0) * S, cx = wx((p.x0 + p.x1) / 2);
    const c = document.createElement('canvas'); c.width = Math.round(512 * w / 14.4); c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    panel.position.set(cx, 2.4, 0); grp.add(panel);
    const posts = [];
    [p.x0, p.x1].forEach((xx, k) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.55, 5.4, .55), new THREE.MeshLambertMaterial({ color: '#2d7cf0' }));
      post.position.set(wx(xx) + (k ? -.28 : .28), 2.7, 0); post.castShadow = true; grp.add(post); posts.push(post);
    });
    const pv = { panel, tex, cv: c, posts, label: '', swap: gt.swap };
    paintGate(pv, p); parts.push(pv);
  });
  scene.add(grp);
  return { grp, parts };
}

/* ── 타이어 더미(상자) + 위에 얹은 상품 ── */
const tireGeo = new THREE.CylinderGeometry(1.25, 1.25, .95, 20).rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(.55, .55, 1, 12).rotateZ(Math.PI / 2);
const hubMat = new THREE.MeshLambertMaterial({ color: '#7d828a' });
function makeBox(X) {
  const grp = new THREE.Group(), w = X.w * S, n = 4, tires = [];
  const tireMat = new THREE.MeshLambertMaterial({ color: '#2a2c30', emissive: '#000000' });
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(tireGeo, tireMat); t.position.set(-w / 2 + w / n * (i + .5), 1.25, 0); t.castShadow = true;
    t.add(new THREE.Mesh(hubGeo, hubMat)); grp.add(t); tires.push(t);
  }
  // 상품: 연사 = 기관총, 위력 = 로켓, 진급 = 탱크
  const prize = new THREE.Group(), blue = new THREE.MeshLambertMaterial({ color: '#2f8cff', emissive: '#0a2a66' }), dark = new THREE.MeshLambertMaterial({ color: '#25303d' });
  if (X.gift === 'tier') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, .8, 3), blue); body.position.y = .5;
    const tr = new THREE.Mesh(new THREE.BoxGeometry(1.5, .7, 1.4), blue); tr.position.y = 1.2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 2, 8).rotateX(Math.PI / 2), dark); bar.position.set(0, 1.2, -1.6);
    [-1, 1].forEach(s => { const tk = new THREE.Mesh(new THREE.BoxGeometry(.5, .6, 3.2), dark); tk.position.set(s * 1.4, .3, 0); prize.add(tk); });
    prize.add(body, tr, bar);
  } else if (X.gift === 'rate') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(.8, .8, 2.2), blue); body.position.y = .7;
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.6, 6).rotateX(Math.PI / 2), dark); b.position.set(Math.cos(k * 1.57) * .2, .7 + Math.sin(k * 1.57) * .2, -1.8); prize.add(b); }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(.5, .9, .6), dark); mag.position.set(0, .1, .1);
    prize.add(body, mag);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, 2.4, 12).rotateX(Math.PI / 2), blue); body.position.y = .8;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.45, .9, 12).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ff5a3c' })); tip.position.set(0, .8, -1.65);
    [-1, 1].forEach(s => { const f = new THREE.Mesh(new THREE.BoxGeometry(.08, .7, .6), dark); f.position.set(s * .45, .8, 1); prize.add(f); });
    prize.add(body, tip);
  }
  prize.position.y = 2.5; prize.traverse(o => { if (o.isMesh) o.castShadow = true; });
  grp.add(prize); scene.add(grp);
  return { grp, tires, tireMat, prize };
}

/* ── 보스: 커다란 근육 대장 ── */
function makeBoss() {
  const g = new THREE.Group(), body = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const jacket = mat('#d8343a'), shirt = mat('#f0f0f0'), skin = mat('#f0b98d'), pants = mat('#3a3a44'), boot = mat('#8a2a2a'), hair = mat('#f08a24');
  const add = (geo, m, x, y, z, p = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  [-1, 1].forEach(s => { add(new THREE.BoxGeometry(.9, 1.6, 1), pants, s * .55, 1.3, 0); add(new THREE.BoxGeometry(1, .6, 1.4), boot, s * .55, .3, .15); });
  add(new THREE.CapsuleGeometry(1.45, .9, 6, 14), jacket, 0, 3.4, 0);
  add(new THREE.BoxGeometry(1.1, 1.6, .4), shirt, 0, 3.5, 1.3);
  const arms = [];
  [-1, 1].forEach(s => {
    const sh = new THREE.Group(); sh.position.set(s * 1.75, 4.1, 0); body.add(sh);
    add(new THREE.CapsuleGeometry(.55, 1.2, 4, 10), jacket, 0, -.9, 0, sh);
    add(new THREE.SphereGeometry(.62, 12, 10), skin, 0, -2, .1, sh);
    arms.push(sh);
  });
  add(new THREE.SphereGeometry(.95, 16, 12), skin, 0, 5.35, .1);
  add(new THREE.BoxGeometry(1.1, .5, .35), hair, 0, 4.95, .95);           // 수염
  const crest = add(new THREE.ConeGeometry(.8, 1.4, 10), hair, 0, 6.3, -.1); crest.rotation.x = -.35;
  g.add(body); g.scale.setScalar(1.25); scene.add(g);
  const mats = [jacket, shirt, skin, pants, boot, hair];
  return { grp: g, body, arms, mats, base: mats.map(m => m.color.clone()) };
}

function makeBarrel() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: '#e5392f', emissive: '#000000' });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, 1.7, 16), red); body.position.y = .85; body.castShadow = true;
  const band = new THREE.MeshLambertMaterial({ color: '#ffd23f' });
  [.45, 1.25].forEach(y => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.78, .78, .16, 16), band); b.position.y = y; g.add(b); });
  const top = new THREE.Mesh(new THREE.CircleGeometry(.6, 16).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2b2b2b' })); top.position.y = 1.71;
  g.add(body, top); scene.add(g);
  return { grp: g, mat: red };
}
function makeTank() {
  const g = new THREE.Group(), body = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const hull = mat('#b8322e'), dark = mat('#3a2a2a'), metal = mat('#6c6f76'), glow = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
  const add = (geo, m, x, y, z, p = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  [-1, 1].forEach(s => { add(new THREE.BoxGeometry(1.6, 1.6, 7.4), dark, s * 3.1, .8, 0); for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(.6, .6, 1.7, 12).rotateZ(Math.PI / 2), metal, s * 3.1, .7, -2.8 + i * 1.4); });
  add(new THREE.BoxGeometry(5, 1.7, 6.6), hull, 0, 2, 0);
  const turret = new THREE.Group(); turret.position.set(0, 3.4, -.2); body.add(turret);
  add(new THREE.BoxGeometry(3.4, 1.5, 3.4), hull, 0, 0, 0, turret);
  add(new THREE.CylinderGeometry(.38, .45, 4.6, 12).rotateX(Math.PI / 2), metal, 0, .1, 3.6, turret);
  const mouth = add(new THREE.SphereGeometry(.35, 10, 8), glow, 0, .1, 5.9, turret);
  add(new THREE.BoxGeometry(1, .6, 1), mat('#f0f0f0'), -.9, .9, -.6, turret);
  g.add(body); scene.add(g);
  const mats = [hull, dark, metal];
  return { grp: g, body, turret, mouth, mats, base: mats.map(m => m.color.clone()) };
}
const shellGeo = new THREE.SphereGeometry(.55, 12, 10), shellMat = new THREE.MeshBasicMaterial({ color: '#ffcf4a' });
function makeShell(sh) {
  const grp = new THREE.Group();
  const ball = new THREE.Mesh(shellGeo, shellMat); grp.add(ball);
  const warn = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: .25, depthWrite: false }));
  warn.position.y = fill.position.y = .06; warn.scale.setScalar(sh.r * S); fill.scale.setScalar(.01);
  scene.add(grp, warn, fill);
  return { grp, ball, warn, fill };
}
// 폭발: 커지며 사라지는 빛 덩어리
const blasts = [];
function fxBlast(x, y) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb340', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.set(wx(x), 1, wz(y)); scene.add(m); blasts.push({ m, t: .35 });
  for (let i = 0; i < 14; i++) addSpark(wx(x), rnd(.5, 3), wz(y), i % 2 ? '#ffe27a' : '#ff7a2a', rnd(2, 3.5), rnd(.2, .35), rnd(-10, 10), rnd(2, 9), rnd(-10, 10));
}
function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]; b.t -= dt; const k = 1 - b.t / .35;
    b.m.scale.setScalar(1 + k * 6); b.m.material.opacity = 1 - k;
    if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); blasts.splice(i, 1); }
  }
}

function disposeObj(o) {
  o.traverse(c => { if (c.isMesh) { if (c.geometry !== tireGeo && c.geometry !== hubGeo && c.geometry !== shellGeo) c.geometry.dispose(); if (c.material !== hubMat && c.material !== shellMat) { c.material.map && c.material.map.dispose(); c.material.dispose(); } } });
  scene.remove(o);
}
function syncViews() {
  const live = new Set();
  for (const gt of G.gates) {
    live.add(gt); let v = views.get(gt);
    if (!v) { v = makeGate(gt); views.set(gt, v); }
    v.grp.position.z = wz(gt.y);
    gt.parts.forEach((p, k) => {
      const pv = v.parts[k];
      if (pv.label !== gateLabel(p)) paintGate(pv, p);
      const sc = 1 + p.hit * .14; pv.panel.scale.set(sc, sc, 1); pv.panel.material.color.setScalar(1 + p.hit * .9);
      pv.panel.material.opacity = p.taken ? .25 : 1;
    });
  }
  for (const X of G.boxes) {
    live.add(X); let v = views.get(X);
    if (!v) { v = makeBox(X); views.set(X, v); }
    const j = X.flash > 0 ? rnd(-.12, .12) : 0;
    v.grp.position.set(wx(X.x) + j, 0, wz(X.y));
    v.prize.rotation.y += .02; v.prize.position.y = 2.6 + Math.sin(T * 3) * .15;
    v.tireMat.emissive.setScalar(X.flash > 0 ? .5 : 0);
    v.tires.forEach((t, i) => { t.scale.setScalar(1 + X.pop * .05); t.rotation.x = Math.sin(T * 2 + i) * .03; });
  }
  for (const b of G.barrels) {
    live.add(b); let v = views.get(b);
    if (!v) { v = makeBarrel(); views.set(b, v); }
    v.grp.position.set(wx(b.x), 0, wz(b.y)); v.mat.emissive.setScalar(b.flash > 0 || b.hp <= 0 ? .6 : 0);
    v.grp.scale.setScalar(b.hp <= 0 ? 1.25 : 1);
  }
  for (const sh of G.shells) {
    live.add(sh); let v = views.get(sh);
    if (!v) { v = makeShell(sh); views.set(sh, v); }
    const k = sh.t / sh.T, x = sh.sx + (sh.x - sh.sx) * k, y = sh.sy + (sh.y - sh.sy) * k;
    v.ball.position.set(wx(x), 4 + Math.sin(k * Math.PI) * 16 * (1 - k * .2), wz(y));
    if (Math.random() < .7) addSpark(wx(x), v.ball.position.y, wz(y), '#ff9a3a', rnd(.8, 1.4), .25, 0, 0, 0);
    v.warn.position.x = v.fill.position.x = wx(sh.x); v.warn.position.z = v.fill.position.z = wz(sh.y);
    v.fill.scale.setScalar(Math.max(.01, sh.r * S * k)); v.warn.material.opacity = .5 + Math.sin(T * 24) * .4;
  }
  if (G.boss && G.boss.kind === 'tank') {
    const K = G.boss; live.add(K); let v = views.get(K);
    if (!v) { v = makeTank(); views.set(K, v); }
    v.grp.position.set(wx(K.x) + (K.flash > 0 ? rnd(-.08, .08) : 0), 0, wz(K.y));
    v.turret.rotation.y = K.aim;
    v.body.position.y = Math.sin(T * 30) * .03;
    v.mouth.scale.setScalar(K.fire < .4 ? 1.4 + Math.sin(T * 40) * .4 : .8);
    v.mats.forEach((m, i) => { m.color.copy(v.base[i]); if (K.flash > 0) m.color.lerp(C.white, .45); });
    v.grp.scale.setScalar(1.6 * (1 + K.pop * .02));
  } else if (G.boss) {
    const K = G.boss; live.add(K); let v = views.get(K);
    if (!v) { v = makeBoss(); views.set(K, v); }
    v.grp.position.set(wx(K.x) + (K.flash > 0 ? rnd(-.1, .1) : 0), 0, wz(K.y));
    v.grp.rotation.y = Math.PI * 0;                   // 앞(+z)을 보며 걸어온다
    const w = K.t * 5; v.body.position.y = Math.abs(Math.sin(w)) * .15;
    v.arms[0].rotation.x = Math.sin(w) * .5; v.arms[1].rotation.x = -Math.sin(w) * .5;
    if (K.bite > 0) { v.arms[0].rotation.x = -1.6 + Math.sin(T * 20) * .4; v.arms[1].rotation.x = -1.6 - Math.sin(T * 20) * .4; }
    v.mats.forEach((m, i) => { m.color.copy(v.base[i]); if (K.flash > 0) m.color.lerp(C.white, .45); });
    v.grp.scale.setScalar(1.25 * (1 + K.pop * .03));
  }
  for (const [k, v] of views) if (!live.has(k)) { dropView(v); views.delete(k); }
}
function dropView(v) { disposeObj(v.grp); if (v.warn) { disposeObj(v.warn); disposeObj(v.fill); } }
function clearViews() { for (const [, v] of views) dropView(v); views.clear(); }

/* ── 화면 크기 · 카메라 ── */
let VW = 360, VH = 640, DPR = 1, camDist = 40, camX = 0, lookR = .63;
const PITCH = THREE.MathUtils.degToRad(50), LOOK = new THREE.Vector3();
function fit() {
  const r = glc.getBoundingClientRect();
  VW = r.width || 360; VH = r.height || 640; DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(Math.min(DPR, 1.75)); renderer.setSize(VW, VH, false);
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  camera.aspect = VW / VH;
  // 세로 화면에서 길 폭이 화면을 꽉 채우도록 거리를 잡는다
  // 화면 비율이 어떻든 길 폭 전체(양쪽 보도까지)와 부대 맨 앞줄이 화면 안에 들어오는 가장 가까운 거리를 찾는다
  camera.updateProjectionMatrix();
  // 거리(길 폭이 꼭 맞게)와 바라보는 곳(부대가 화면 아래 1/4 쯤)을 번갈아 맞춘다
  for (let it = 0; it < 4; it++) {
    let lo = 18, hi = 160;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; camDist = m; aimCamera(0, 0); camera.updateMatrixWorld(); if (PV.set(RW / 2 + 1.2, 0, 1).project(camera).x < .98) hi = m; else lo = m; }
    camDist = hi; lo = .2; hi = 1.6;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; lookR = m; aimCamera(0, 0); camera.updateMatrixWorld(); if (PV.set(0, 0, 1).project(camera).y < -.55) hi = m; else lo = m; }
    lookR = Math.min(.9, Math.max(.35, lookR));
  } scene.fog.near = camDist * 1.7; scene.fog.far = camDist * 4.6;
  camera.updateProjectionMatrix();
}
function aimCamera(cx, shake) {
  // 부대 뒤 위에서 앞쪽 멀리까지 비스듬히(참고 화면처럼 길이 멀리 이어져 보이게)
  LOOK.set(cx * .6, 0, -camDist * lookR);
  camera.position.set(cx + rnd(-shake, shake), camDist * .62 + rnd(-shake, shake) * .5, camDist * .5);
  camera.lookAt(LOOK);
}
function placeCamera(shake) {
  const tx = G ? wx(G.px) * .15 : 0; camX += (tx - camX) * .1;
  aimCamera(camX, shake);
}

/* ── 2D 위 글자 ── */
const PV = new THREE.Vector3();
function scr(x, h, z) { PV.set(x, h, z).project(camera); return { x: (PV.x + 1) / 2 * VW, y: (1 - PV.y) / 2 * VH, z: PV.z }; }
function text(s, x, y, size, c, stroke) {
  ctx.font = `900 ${size}px Pretendard, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function pill(x, y, s, fs, col) {
  ctx.font = `900 ${fs}px Pretendard, sans-serif`;
  const w = Math.max(fs * 2, ctx.measureText(s).width + fs * 1.1), h = fs * 1.45;
  ctx.fillStyle = col; rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
  text(s, x, y + fs * .04, fs, '#fff', false);
}
const texts = [];
function fxFloat(x, y, s, c, size, small) { texts.push({ x: wx(x), z: wz(y), h: 3, s, c, size: size || 18, t: small ? .5 : 1, L: small ? .5 : 1, small }); }
let tint = null, shake = 0, banner = 0;
function drawOverlay(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (!G) return;
  const k = Math.min(1.25, VW / 360);
  // 적 무리 숫자
  for (const q of G.groups) {
    if (q.giant) { const M = q.giant, p = scr(wx(M.x), 5.6, wz(M.y)); if (M.y > SPAWN + 250) pill(p.x, p.y, String(Math.max(0, Math.ceil(M.hp))), 17 * k * (1 + M.flash * 3), '#7f1d1d'); continue; }
    let top = null, sx = 0, n = 0;
    for (const M of G.mobs) if (M.g === q) { sx += M.x; n++; if (!top || M.y < top.y) top = M; }
    if (!top || top.y < SPAWN + 250) continue;
    const p = scr(wx(sx / n), 3.4, wz(top.y));
    pill(p.x, p.y, String(q.alive), 15 * k * (1 + q.pop * .3), '#dc2626');
  }
  // 타이어 숫자
  for (const X of G.boxes) {
    const p = scr(wx(X.x), 1.25, wz(X.y) + 1.2); if (p.z > 1) continue;
    const near = Math.max(.55, Math.min(1.25, 1 + wz(X.y) / 90));
    text(String(Math.max(0, Math.ceil(X.hp))), p.x, p.y, 38 * k * near * (1 + X.pop * .18), '#fff', true);
  }
  // 내 부대 숫자
  if (G.n > 0) { const p = scr(wx(G.px), 0, squadR(G.n) * S * .8 + 1.4); pill(Math.max(34, Math.min(VW - 34, p.x)), Math.min(VH - 24, p.y), String(Math.round(G.shown)), 17 * k, '#1d4ed8'); }
  // 보스 체력: 화면 위쪽 큰 막대
  if (G.boss) {
    const K = G.boss, bw = Math.min(VW - 80, 300), x = VW / 2 - bw / 2, y = 122, f = Math.max(0, K.hp / K.max);
    ctx.fillStyle = 'rgba(15,23,42,.8)'; rr(x - 3, y - 3, bw + 6, 22, 11); ctx.fill();
    ctx.fillStyle = '#ef4444'; rr(x, y, bw * f, 16, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x, y, bw * f, 6, 3); ctx.fill();
    text(String(Math.max(0, Math.ceil(K.hp))), VW / 2, y - 17, 30 * (1 + K.pop * .15), '#fff', true);
  }
  // 떠오르는 글자
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]; t.t -= dt; t.h += (t.small ? 6 : 3) * dt;
    if (t.t <= 0) { texts.splice(i, 1); continue; }
    const life = t.t / t.L, p = scr(t.x, t.h, t.z);
    ctx.globalAlpha = Math.min(1, life * 2.4);
    const pop = life > .85 ? 1 + (life - .85) * 3 : 1;
    const fs = t.size * k * pop; ctx.font = `900 ${fs}px Pretendard, sans-serif`; const hw = ctx.measureText(t.s).width / 2 + 8;
    text(t.s, Math.max(hw, Math.min(VW - hw, p.x)), Math.max(150, p.y), fs, t.c, true);
  }
  ctx.globalAlpha = 1;
  // 시작 안내: 스테이지 이름 · 보스
  if (banner > 0 && state === 'play') {
    banner -= dt; const st = STAGES[G.stage], a = Math.min(1, banner * 2, (2.6 - banner) * 4), y = VH * .3;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(15,23,42,.72)'; rr(VW / 2 - Math.min(150, VW / 2 - 16), y - 44, Math.min(300, VW - 32), 96, 18); ctx.fill();
    text('레벨 ' + G.L + ' · ' + st.name, VW / 2, y - 12, 26 * k, '#fde047', false);
    ctx.font = '700 ' + (13 * k) + 'px Pretendard, sans-serif'; ctx.fillStyle = '#e2e8f0'; ctx.fillText(st.sub, VW / 2, y + 16);
    ctx.fillStyle = '#fca5a5'; ctx.fillText('보스: ' + BOSSES[G.bossKind], VW / 2, y + 36);
    ctx.globalAlpha = 1;
  }
  if (tint) { tint.t -= dt; if (tint.t <= 0) tint = null; else { ctx.fillStyle = `rgba(${tint.c},${tint.t * .5})`; ctx.fillRect(0, 0, VW, VH); } }
}

/* ── 한 장면 그리기 ── */
let G = null, state = 'menu', last = 0, T = 0, slow = 0, endTimer = 0, walkT = 0;
const hooks = {
  // 문 숫자가 오를 때: 맞은 자리 불꽃 · 작은 +1 · 틱 소리(오를수록 높게)
  gateHit: (gt, p, x) => {
    SFX.gateTick(p.gain);
    for (let i = 0; i < 3; i++) addSpark(wx(x) + rnd(-.4, .4), rnd(1.5, 4), wz(gt.y) + .3, i ? '#bfefff' : '#ffffff', rnd(.7, 1.3), .14, rnd(-5, 5), rnd(1, 6), rnd(2, 6));
    const n = performance.now(); if (!p.ft || n - p.ft > 90) { p.ft = n; texts.push({ x: wx(x) + rnd(-.5, .5), z: wz(gt.y), h: 4.6, s: '+1', c: '#e0f7ff', size: 17, t: .45, L: .45, small: true }); }
  },
  blast: fxBlast, burst: fxBurst, spark: fxSpark, smoke: fxSmoke, float: fxFloat, ring: fxRing,
  sfx: n => SFX[n] && SFX[n](), buzz,
  shake: v => { if (!reduce) shake = Math.max(shake, v); },
  tint: c => { tint = { c: c === 'red' ? '239,68,68' : '56,189,248', t: .35 }; }
};
function render(dt) {
  T += dt; if (state !== 'menu') walkT += dt * 11;
  si = 0;
  if (G) {
    const pos = squadPos(G.n);
    for (let i = 0; i < pos.length; i++) soldier(wx(G.px + pos[i][0]), wz(pos[i][1]), 0, 1, walkT + i * .7, true, 0, G.tier);
    for (const M of G.mobs) { if (M.y < SPAWN + 20) continue; soldier(wx(M.x), wz(M.y), Math.PI, M.size, M.step, false, M.flash, 0); }
    // 총알 줄기
    let b = 0; const col = BCOL[TIERS[G.tier].bullet], wide = 1 + G.tier * .35;
    for (const B of G.bullets) {
      if (b >= BCAP) break;
      const grow = Math.min(1, (B.y0 - B.y) / 60);
      E.set(0, -Math.atan2(B.vx, 1150), 0); Q.setFromEuler(E);
      M4.compose(V.set(wx(B.x), 1.25, wz(B.y)), Q, SC.set(wide, 1, .3 + grow * .7)); bullets.setMatrixAt(b, M4); bullets.setColorAt(b, col); b++;
    }
    bullets.count = b; bullets.instanceMatrix.needsUpdate = true; if (bullets.instanceColor) bullets.instanceColor.needsUpdate = true;
    // 총구 불꽃
    if (G.flash > .05 && state === 'play') {
      const m = Math.min(pos.length, 10);
      for (let i = 0; i < m; i++) addSpark(wx(G.px + pos[i][0]) + .3, 1.25, wz(pos[i][1]) - 1.1, G.tier === 2 ? '#7fefff' : '#ffd36a', rnd(.9, 1.4), .06, 0, 0, -8);
    }
    syncViews();
  } else bullets.count = 0;
  flushSoldiers();
  updateFx(dt); updateRings(dt); updateBlasts(dt);
  shake = Math.max(0, shake - dt);
  placeCamera(shake * 1.6);
  renderer.render(scene, camera);
  drawOverlay(dt);
}

/* ── 조작 ── */
let dragX = null, dragTx = 0;
cv.addEventListener('pointerdown', e => { if (state !== 'play') return; dragX = e.clientX; dragTx = G.tx; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', e => { if (dragX === null || state !== 'play') return; G.tx = dragTx + (e.clientX - dragX) / VW * (ROAD_R - ROAD_L) * 1.25; });
const up = () => { dragX = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const keys = {};
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { keys[e.key] = true; e.preventDefault(); }
  if (e.target && /^(INPUT|BUTTON)$/.test(e.target.tagName)) return; // 이름 넣는 중 · 버튼 위에서는 그 요소가 받는다
  if ((e.key === 'Enter' || e.key === ' ') && (state === 'menu' || state === 'end')) { e.preventDefault(); start(); }
});
addEventListener('keyup', e => { keys[e.key] = false; });

/* ── 흐름 ── */
const dbg = /[?&]debug/.test(location.search), botMem = {};
function loop(t) {
  let dt = Math.min(.033, (t - last) / 1000 || 0); last = t;
  if (slow > 0) { slow -= dt; dt *= .3; }
  if (state === 'play') {
    const k = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (k) G.tx += k * 340 * dt;
    if (dbg && window.__ls.auto) autoAim(G, 1, dt, botMem);
    const before = G.dist;
    step(G, dt);
    moveEnv((G.dist - before) * S);
    if (G.over === 1) { state = 'dying'; slow = 1; endTimer = 1.1; }
    else if (G.over === -1) { state = 'dying'; endTimer = .7; }
    syncHud();
  } else if (state === 'dying') {
    endTimer -= dt; if (endTimer <= 0) end(G.over === 1);
  } else if (state === 'menu') moveEnv(4 * dt);
  render(dt);
  requestAnimationFrame(loop);
}
function start() {
  audio();
  $('#ovStart').hidden = true; $('#ovEnd').hidden = true; $('#ovRank').hidden = true;
  clearViews(); texts.length = 0;
  G = newGame(level, hooks); state = 'play'; setTheme(STAGES[G.stage].theme); banner = 2.6; syncHud();
}
function end(win) {
  state = 'end';
  const btn = $('#btnNext');
  $('#rankBox').hidden = true;
  if (win) {
    const bonus = 500 * G.L + G.n * 5;   // 레벨 클리어 보너스 + 남은 부대
    run += G.score + bonus; save('lastshot_run', run);
    level++; save('lastshot_level', level);
    if (level > best) { best = level; save('lastshot_best', best); }
    $('#endKicker').textContent = 'CLEAR'; $('#endTitle').textContent = `레벨 ${level - 1} 클리어!`;
    $('#endSub').textContent = `남은 부대 ${G.n}명 · 클리어 보너스 +${fmt(bonus)} · 점수 ${fmt(run)}`;
    btn.textContent = `레벨 ${level} 시작`; btn.classList.remove('red'); SFX.win();
  } else {
    $('#endKicker').textContent = 'GAME OVER'; $('#endTitle').textContent = '부대가 쓰러졌어요';
    const pct = Math.min(100, Math.round(prog() * 100));
    $('#endSub').textContent = `레벨 ${level} · ${pct}%까지 왔어요.`;
    btn.textContent = '다시 도전'; btn.classList.add('red'); SFX.lose(); buzz(200);
    const final = run + G.score;
    run = 0; save('lastshot_run', 0);
    showRank(final, level);
  }
  $('#ovEnd').hidden = false; syncHud();
  setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 50);
}
/* ── 랭킹 1~10등 (서버: /api/rank) ── */
let rankMine = 0;
const escH = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
function rankRows(list, box) {
  box.innerHTML = list.length
    ? list.map((r, i) => `<li${r.id === rankMine ? ' class="me"' : ''}><b>${i + 1}</b><span class="nm">${escH(r.name)}</span><span class="lv">LV ${r.level}</span><span class="sc">${fmt(r.score)}</span></li>`).join('')
    : '<li class="none">아직 기록이 없어요. 첫 주인공이 되어 보세요!</li>';
}
async function getRank() {
  const r = await fetch('/api/rank', { cache: 'no-store' });
  if (!r.ok) throw new Error();
  return (await r.json()).top || [];
}
// 쓰러졌을 때: 점수 보여 주고, 10등 안이면 이름 넣기
async function showRank(final, lv) {
  const box = $('#rankBox'), form = $('#rankForm'), list = $('#rankList'), msg = $('#rankMsg');
  box.hidden = false; form.hidden = true; msg.textContent = '랭킹 불러오는 중…';
  $('#rankScore').textContent = fmt(final); list.innerHTML = '';
  form.dataset.score = final; form.dataset.level = lv;
  let top;
  try { top = await getRank(); } catch (e) { msg.textContent = '랭킹을 불러오지 못했어요.'; return; }
  if (state !== 'end') return;
  rankRows(top, list);
  const ok = final > 0 && (top.length < 10 || final > top[top.length - 1].score);
  if (ok) {
    const place = top.filter(r => r.score >= final).length + 1;
    msg.textContent = `${place}등 기록! 이름을 남겨 주세요.`;
    form.hidden = false;
    const inp = form.querySelector('input');
    try { inp.value = localStorage.getItem('lastshot_name') || ''; } catch (e) {}
    setTimeout(() => { try { inp.focus({ preventScroll: true }); inp.select(); } catch (e) {} }, 80);
  } else msg.textContent = final > 0 ? '10등 안에 들려면 조금 더! 다시 도전해 보세요.' : '';
}
$('#rankForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget, inp = form.querySelector('input'), btn = form.querySelector('button'), msg = $('#rankMsg');
  const name = inp.value.trim();
  if (!name) { inp.focus(); return; }
  btn.disabled = true;
  try {
    const r = await fetch('/api/rank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score: +form.dataset.score, level: +form.dataset.level }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { msg.textContent = out.error || '등록하지 못했어요.'; if (out.top) rankRows(out.top, $('#rankList')); return; }
    try { localStorage.setItem('lastshot_name', name); } catch (e2) {}
    rankMine = out.id; rankRows(out.top, $('#rankList'));
    form.hidden = true; msg.textContent = `${out.rank}등에 이름을 올렸어요!`; SFX.win();
    setTimeout(() => { try { $('#btnNext').focus({ preventScroll: true }); } catch (e3) {} }, 50);
  } catch (err) { msg.textContent = '등록하지 못했어요. 잠시 뒤에 다시 해 주세요.'; }
  finally { btn.disabled = false; }
});
// 처음 화면의 '랭킹 보기'
async function openRank() {
  $('#ovStart').hidden = true; $('#ovRank').hidden = false;
  const list = $('#rankAll'); list.innerHTML = '<li class="none">불러오는 중…</li>';
  try { rankRows(await getRank(), list); } catch (e) { list.innerHTML = '<li class="none">랭킹을 불러오지 못했어요.</li>'; }
  setTimeout(() => { try { $('#btnRankClose').focus({ preventScroll: true }); } catch (e) {} }, 50);
}

function preview() { setTheme(STAGES[stageOf(level)].theme); const g = newGame(level, {}); step(g, 0); g.mobs.forEach(m => { m.flash = 0; }); return g; }
function home() { state = 'menu'; clearViews(); G = preview(); $('#ovEnd').hidden = true; $('#ovRank').hidden = true; $('#ovStart').hidden = false; syncHud(); }
const prog = () => G ? Math.max(0, Math.min(1, (G.dist - G.ev[0].d - 680) / (G.length - 680))) : 0;
function syncHud() {
  const playing = G && state !== 'menu';
  $('#hudLv').textContent = playing ? G.L : level;
  $('#hudBest').textContent = best;
  $('#hudScore').textContent = fmt(score());
  $('#startLv').textContent = level;
  const st = STAGES[stageOf(level)]; $('#startStage').textContent = st.name; $('#startSub').textContent = st.sub + ' · 보스: ' + BOSSES[bossOf(level)];
  $('#btnReset').hidden = level <= 1;
  $('#hudProg').style.width = playing ? prog() * 100 + '%' : '0%';
  const pw = $('#hudPow');
  if (playing && G.pow) { pw.hidden = false; pw.textContent = `${TIERS[G.tier].name} · 연사 ×${(G.rate / 5).toFixed(1)} · 위력 ×${G.dmg.toFixed(1)}`; } else pw.hidden = true;
}
function paintMute() { const b = $('#btnMute'); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); b.textContent = muted ? '소리 끔' : '소리 켬'; }

$('#btnStart').addEventListener('click', start);
$('#btnNext').addEventListener('click', start);
$('#btnHome').addEventListener('click', home);
$('#btnReset').addEventListener('click', () => { level = 1; save('lastshot_level', 1); run = 0; save('lastshot_run', 0); home(); });
$('#btnRank').addEventListener('click', openRank);
$('#btnRankClose').addEventListener('click', home);
$('#btnMute').addEventListener('click', () => { muted = !muted; save('lastshot_mute', muted ? 1 : 0); paintMute(); if (!muted) audio(); });
addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { last = performance.now(); });
if (dbg) window.__ls = { auto: false, start, end, get G() { return G; }, setLevel(l) { level = l; }, get state() { return state; } };
fit(); G = preview(); syncHud(); paintMute();
requestAnimationFrame(t => { last = t; loop(t); });
// 확인용: ?debug&play=레벨 → 자동 조종으로 바로 시작
if (dbg) { const m = location.search.match(/play=(\d+)/); if (m) { level = +m[1]; window.__ls.auto = true; muted = true; setTimeout(start, 50); } }
if (dbg) { const w = location.search.match(/[?&]w=(\d+)&h=(\d+)/); if (w) { Object.assign($('#game').style, { width: w[1] + 'px', height: w[2] + 'px', margin: 0 }); fit(); } }
// 확인용: &ff=초 → 시작하자마자 그 시간만큼 빨리 돌림(마지막 0.5초는 그림까지)
if (dbg) { const f = location.search.match(/ff=(\d+)/); if (f) setTimeout(() => { const n = +f[1] * 60; for (let i = 0; i < n && state === 'play'; i++) { autoAim(G, 1, 1 / 60, botMem); const b = G.dist; step(G, 1 / 60); moveEnv((G.dist - b) * S); if (G.over) break; if (i > n - 30) render(1 / 60); } window.__ls.auto = false; G.tx = G.px; banner = 0; }, 120); }
