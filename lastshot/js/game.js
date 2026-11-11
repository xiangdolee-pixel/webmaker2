/* 라스트샷 — 화면 · 소리 · 조작. 규칙은 core.js.
   3D(three.js r160, MIT — js/vendor): 배경은 js/env(러너 배경 5종, MIT). 병사 · 보스 · 중간보스는 사용자가 준 시안 그림에서
   오려 낸 그림(img/*.webp, 크기는 sprites.js)을 카메라를 바라보는 판으로 세워 그린다(병사는 InstancedMesh 로 수백 명).
   숫자 · 글자 · 콤보 · 동전은 위 2D 캔버스에 3D 위치를 투영해 그린다. */
import * as THREE from './vendor/three.module.min.js';
import { ROAD_L, ROAD_R, MID, SPAWN, TIERS, STAGES, MID_NAME, DIFFS, diffOf, stageOf, bossName, TWISTS, squadPos, squadR, newGame, step, autoAim, fireMissile, snapshot, restore, mslGain, moneyMissiles } from './core.js?v=33';
import { SPRITES } from './sprites.js?v=17';
// 보스 · 중간보스 둘레 빛 · 던지는 것 색
const AURA = { croc: '#46ff6a', gorilla: '#c65bff', elephant: '#4fb6ff', lion: '#ffc23a', tiger: '#ff6a1f' };
const SHELL = { croc: '#9be04f', gorilla: '#8a6a4a', elephant: '#5ab8ff', lion: '#ffb02e', tiger: '#ff5a1f' };
const MID_AURA = { boar: '#ff7a2a', golem: '#5fd0ff', lich: '#b45bff', siege: '#ffb030', drake: '#ff5a1f' };
import { createRunnerEnvironment, THEMES as ENV_THEMES } from './env/index.js?v=15';

const $ = s => document.querySelector(s);
const glc = $('#gl'), cv = $('#cv'), ctx = cv.getContext('2d'), gameEl = $('#game');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = .1;                                   // 평면 1 = 3D 0.1
const wx = x => (x - MID) * S, wz = y => y * S;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NONE = {};

/* ── 저장 ── */
const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : +v || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let level = load('lastshot_level', 1), best = load('lastshot_best', 1), muted = load('lastshot_mute', 0) === 1;
const loadS = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
// 난이도(easy · normal · hard): 레벨 진행(lastshot_level · best)은 난이도와 상관없이 하나, 랭킹만 난이도별
let diff = diffOf(loadS('lastshot_diff', 'normal'));
// 가입 때 닉네임: 처음엔 랜덤(형용사 + 동물 + 숫자, 10자 안), 고칠 수 있다 — 랭킹에 보이는 이름
const ADJ = ['날쌘', '용감한', '씩씩한', '재빠른', '든든한', '명랑한', '느긋한', '똑똑한', '조용한', '당찬', '불타는', '우아한', '굳센', '신나는', '꼬마', '대왕', '황금', '무적', '전설의', '작은', '깜찍한', '유쾌한', '수줍은', '멋진', '푸른'];
const ANI = ['수달', '호랑이', '사자', '토끼', '여우', '늑대', '고양이', '강아지', '펭귄', '돌고래', '다람쥐', '부엉이', '판다', '코알라', '독수리', '거북이', '하마', '기린', '치타', '악어', '고릴라', '코끼리', '햄스터', '참새', '두더지', '오리', '염소', '너구리', '물개', '미어캣'];
const randName = () => ADJ[Math.floor(Math.random() * ADJ.length)] + ' ' + ANI[Math.floor(Math.random() * ANI.length)] + ' ' + (1 + Math.floor(Math.random() * 99));
// 점수: 쓰러질 때까지 이어서 깬 레벨들의 점수를 모은다(run). 쓰러지면 그 점수로 랭킹(1~10등)에 이름을 넣고 0 부터
let run = load('lastshot_run', 0);
if (load('lastshot_live', 0) === 1) { run = 0; save('lastshot_run', 0); save('lastshot_live', 0); }   // 판 도중에 나갔으면 이어 온 점수는 끊긴다
let lastFinal = 0;
const score = () => state === 'end' && G && G.over === -1 ? lastFinal : run + (G && (state === 'play' || state === 'paused' || (state === 'dying' && !G.committed)) ? G.score : 0);   // 끝난 뒤에는 run 에 이미 더해져 있다
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const touchy = () => matchMedia('(hover: none)').matches;

/* ── 소리: 짧은 합성음(파일 없음) ── */
let AC = null, master = null, echo = null;
const thr = {};   // 같은 소리가 너무 촘촘히 겹치지 않게
const gap = (k, ms) => { const n = performance.now(); if (n - (thr[k] || 0) < ms) return true; thr[k] = n; return false; };
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createDynamicsCompressor(); master.connect(AC.destination);
    // 짧은 울림(에코): 총소리 끝에 살짝 공간감 — 맑은 소리가 '탁' 끊기지 않고 세련되게 사라진다
    const d = AC.createDelay(), fb = AC.createGain(), lp = AC.createBiquadFilter(), wet = AC.createGain();
    d.delayTime.value = .075; fb.gain.value = .3; lp.type = 'lowpass'; lp.frequency.value = 3800; wet.gain.value = .32;
    echo = AC.createGain(); echo.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(master); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
}
function tone(f0, f1, dur, type, vol, noise, delay = 0) {
  if (muted || !AC) return;
  const t = AC.currentTime + delay, g = AC.createGain(); g.connect(master);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  if (noise) {
    const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * dur), AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(); src.buffer = buf;
    const bp = AC.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    src.connect(bp); bp.connect(g); src.start(t);
  } else {
    const o = AC.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    o.connect(g); o.start(t); o.stop(t + dur);
  }
}
// 잡음 한 덩어리(1초)를 만들어 두고 필터로 깎아 쓴다 — 총소리 · 지글거림 · 틱
let noiseBuf = null;
function noiseHit(dur, vol, type, f0, f1, q = .8, delay = 0) {
  if (muted || !AC) return;
  if (!noiseBuf) { const n = AC.sampleRate; noiseBuf = AC.createBuffer(1, n, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * .8); src.stop(t + dur + .02);
}
// 떨리는 소리(레이저): 주파수를 빠르게 흔든다(lfo), 필터로 거칠기 조절
function zap(f0, f1, dur, vol, wob, lfoHz, type = 'sawtooth', cut = 4000, delay = 0, send = 0, pan = 0) {
  if (muted || !AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), f = AC.createBiquadFilter(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  l.frequency.value = lfoHz; lg.gain.value = wob; l.connect(lg); lg.connect(o.frequency);
  f.type = 'lowpass'; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cut * .2), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let out = g; if (pan && AC.createStereoPanner) { const pn = AC.createStereoPanner(); pn.pan.value = pan; g.connect(pn); out = pn; }
  o.connect(f); f.connect(g); out.connect(master); if (send && echo) { const sg = AC.createGain(); sg.gain.value = send; out.connect(sg); sg.connect(echo); }
  o.start(t); l.start(t); o.stop(t + dur + .02); l.stop(t + dur + .02);
}
const PENTA = [0, 2, 4, 7, 9];   // 5음계: 어느 음끼리 겹쳐도 어울린다
// 마림바 같은 음: 따뜻한 사인 기본음 + 나무 두드리는 듯 금방 사라지는 4배음, 높은 쪽은 깎아 귀가 편하게(짧은 에코)
const NOTE = s => 261.63 * Math.pow(2, s / 12);   // 도(C4)에서 반음 s 칸
function mallet(s, dur, vol, delay = 0, send = .22) {
  if (muted || !AC) return;
  const f = NOTE(s), t = AC.currentTime + delay, lp = AC.createBiquadFilter(), out = AC.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 2600; out.gain.value = 1; lp.connect(out); out.connect(master);
  if (echo && send) { const sg = AC.createGain(); sg.gain.value = send; out.connect(sg); sg.connect(echo); }
  [[1, 1, dur], [4, .22, dur * .18], [2, .1, dur * .5]].forEach(([m, a, d], i) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f * m;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + .03);
  });
}
// +문 맞히는 소리: 맞힐 때마다 아래 노래가 한 음씩 이어진다(잠깐 쉬면 처음부터). 네 음마다 낮은 화음 음이 받쳐 준다.
const TUNE = [0, 4, 7, 12, 11, 7, 9, 12, 14, 12, 9, 7, 5, 9, 12, 16, 14, 12, 11, 14, 19, 16, 12, 24];
const BASS = [-24, -15, -19, -17, -24, -20, -19, -17];   // 도 · 라 · 파 · 솔 · 도 · 미 · 파 · 솔
let tuneI = 0, tuneAt = 0;
function tuneNext() {
  const n = performance.now(); if (n - tuneAt > 1300) tuneI = 0; tuneAt = n;
  const i = tuneI++; return { s: TUNE[i % TUNE.length], bar: Math.floor(i / 4) % BASS.length, down: i % 4 === 0 };
}
const SFX = {
  // 총소리: 잡음(북 · 스네어처럼 들리는 '퍽')을 전혀 쓰지 않고 맑은 음만 — 높은 음이 빠르게 미끄러져 내려가는 '퓻' + 짧은 에코.
  // 음높이는 5음계 안에서 조금씩 바꿔(같은 소리 반복 = 북 장단처럼 들림) 노래하듯 이어지게, 좌우로도 살짝 흩뿌린다.
  shot(tier) {
    if (gap('shot', 85)) return;
    const k = Math.pow(2, PENTA[Math.floor(Math.random() * 3)] / 12), pan = (Math.random() - .5) * .5;
    if (tier === 0) {          // LV1 '퓻' — 가볍고 깨끗한 사인 블립
      zap(2100 * k, 760 * k, .06, .03, 0, 1, 'sine', 9000, 0, .25, pan);
      zap(4200 * k, 1500 * k, .035, .006, 0, 1, 'sine', 9000, 0, 0, pan);
    } else if (tier === 1) {   // LV2 '퓨잉' — 조금 더 굵고 둥근 전자음
      zap(1800 * k, 560 * k, .085, .03, 0, 1, 'sine', 9000, 0, .3, pan);
      zap(1800 * k, 560 * k, .07, .008, 0, 1, 'square', 2600, 0, 0, pan);
      zap(3600 * k, 1200 * k, .05, .006, 0, 1, 'sine', 9000, 0, 0, pan);
    } else {                   // LV3 '쮸잉' — 반짝이며 떨리는 맑은 레이저
      zap(2600 * k, 780 * k, .12, .026, 16, 42, 'sine', 9000, 0, .38, pan);
      zap(5200 * k, 1560 * k, .08, .007, 24, 42, 'sine', 9000, 0, .2, pan);
      zap(1300 * k, 620 * k, .09, .01, 0, 1, 'triangle', 4000, 0, 0, pan);
    }
  },
  hit() { if (gap('hit', 45)) return; const f = 2600 + Math.random() * 500; zap(f, f * .7, .03, .016, 0, 1, 'sine', 9000); },   // 맞는 소리: 작고 맑은 '틱'(잡음 없음)
  kill(c) { if (gap('kill', 32)) return; const f = 520 * Math.pow(2, Math.min(c, 36) / 14); zap(f * .6, f * 1.4, .07, .03, 0, 1, 'sine', 9000, 0, .2); tone(f, f * 1.5, .07, 'triangle', .022); },   // 쓰러뜨림: 퐁 터지는 방울 소리 + 콤보마다 오르는 음
  coin() { if (gap('coin', 55)) return; const s = 12 + PENTA[Math.floor(Math.random() * 5)]; mallet(s, .18, .035, 0, .15); mallet(s + 7, .22, .025, .045, .15); },   // 동전: 맑은 두 음 '똥-딩'
  gateUp() { [0, 4, 7, 12].forEach((s, i) => mallet(s + 7, .5, .07, i * .06)); mallet(-5, .7, .06); mallet(-17, .8, .05); },   // 관문 통과: 솔 화음 아르페지오 + 낮은 받침
  gateDown() { tone(260, 80, .32, 'sawtooth', .07); },
  gateTick() { if (gap('tick', 70)) return; const m = tuneNext(); mallet(m.s, .42, .06); mallet(m.s - 12, .3, .018, 0, 0); if (m.down) mallet(BASS[m.bar], .7, .045, 0, .1); },   // 맞힐 때마다 멜로디 한 음 + 마디 첫 음엔 낮은 화음
  boom() { if (gap('boom', 60)) return; tone(700, 40, .55, 'square', .16, true); tone(120, 40, .4, 'sine', .14); },
  cannon() { tone(200, 40, .35, 'square', .12, true); tone(90, 40, .3, 'sawtooth', .06); },
  hurt() { if (gap('hurt', 70)) return; tone(160, 70, .14, 'sawtooth', .05); },
  power() { [0, 4, 7, 12, 16].forEach((s, i) => mallet(s, .45, .07, i * .055)); mallet(-12, .9, .06); mallet(-24, 1, .05); },
  promote() { [7, 12, 16, 19, 24].forEach((s, i) => mallet(s, .5, .07, i * .07)); [-5, -12].forEach(s => mallet(s, 1.1, .055, .35)); zap(900, 2400, .35, .012, 6, 18, 'sine', 9000, 0, .4); },   // 진급: 올라가는 팡파르 + 반짝 솟는 소리
  // 천둥: 번쩍 '쩌정' 갈라지는 소리 + 멀리 굴러가는 우르릉
  thunder() {
    if (gap('thunder', 90)) return;
    noiseHit(.1, .06, 'highpass', 5600, 3000, .7); zap(3400, 700, .09, .02, 60, 70, 'sawtooth', 8000);
    for (let i = 1; i < 8; i++) noiseHit(.025, .035 * (1 - i / 9), 'highpass', 7000, 4500, .8, i * .045 + Math.random() * .02);   // 치지지직
    noiseHit(.8, .04, 'lowpass', 700, 80, .5, .06);
  },
  demote() { [7, 4, 0].forEach((s, i) => mallet(s, .35, .05, i * .1)); },
  missile() { tone(300, 1400, .25, 'sawtooth', .03); tone(3000, 400, .45, 'square', .05, true); },
  cheer() { [7, 11, 14, 19, 23].forEach((s, i) => mallet(s, .32, .06, i * .055)); mallet(-17, .7, .05); },
  alarm() { [0, .32, .64].forEach(d => { tone(520, 420, .26, 'sawtooth', .06, false, d); tone(260, 210, .26, 'square', .04, false, d); }); },
  win() { [0, 4, 7, 12, 9, 12, 16, 24].forEach((s, i) => mallet(s, i === 7 ? 1.2 : .4, .075, i * .11)); [-24, -17, -12].forEach((s, i) => mallet(s, 1.2, .05, i * .33)); },
  lose() { [7, 3, 0, -5].forEach((s, i) => mallet(s, .5, .06, i * .17)); mallet(-24, 1.1, .05, .5); }
};
const buzz = ms => { if (!muted && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate(ms); } catch (e) {} };

/* ── 3D 기본 ── */
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#9fd8f5');
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 70, 170);
const FOV = 52, camera = new THREE.PerspectiveCamera(FOV, 9 / 16, .5, 400);

const hemi = new THREE.HemisphereLight('#eaf6ff', '#7d8792', 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6e8', 2.1);
sun.position.set(-14, 34, 18); sun.target.position.set(0, 0, -16);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 46, bottom: -30, near: 1, far: 100 });
sun.shadow.bias = -.0015;
scene.add(sun, sun.target);

/* 부드러운 동그라미 그림(그림자 · 연기 · 빛) */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function radial(stops, size = 64) {
  return canvasTex(size, size, (x) => {
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, size, size);
  });
}
const texBlob = radial([[0, 'rgba(0,0,0,.55)'], [.6, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]);
const texGlow = radial([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]);
texBlob.userData.keep = texGlow.userData.keep = true;   // 여러 곳에서 함께 쓰는 그림 — 버리지 않음
const texSmoke = radial([[0, 'rgba(255,255,255,.9)'], [.5, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
const texStreak = canvasTex(32, 256, x => {   // 총알 줄기: 앞이 밝고 꼬리로 갈수록 흐려짐
  const gy = x.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(255,255,255,1)'); gy.addColorStop(.15, 'rgba(255,255,255,.95)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gy; x.fillRect(0, 0, 32, 256);
  x.globalCompositeOperation = 'destination-in';
  const gx = x.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(.5, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gx; x.fillRect(0, 0, 32, 256);
});

/* ── 배경: 러너 배경 5종(js/env, MIT) — 스테이지마다 다른 세계. 길 · 난간 · 주변 풍경은 env 가 만들고, 하늘색 · 안개 · 빛만 여기서 맞춘다 ── */
const RW = (ROAD_R - ROAD_L) * S;               // 길 폭 29.2 (env 의 기본 길 폭 10 을 이만큼 키운다)
const ES = RW / 10;
// 스테이지 theme 번호(0 기본 · 1 돌격 · 2 미로 · 3 무기고 · 4 포위) → 배경
const ENV_IDS = ['sunset-harbor', 'desert-oasis', 'neon-city', 'jungle-ruins', 'alpine-pass'];   // 레벨마다 차례로(5레벨마다 한 바퀴 — 보스 차례와 같은 주기)
const ENV_LIGHT = { 'neon-city': 1.7 };
const ENV_BRIGHT = { 'desert-oasis': .5, 'alpine-pass': .45, 'jungle-ruins': .6 };   // 밝은 바닥에서는 더하기 빛을 약하게(하얗게 뭉치지 않게)
let fxBright = 1;   // 어두운 배경은 병사가 잘 보이게 둘레 빛을 조금 더
let env = null, envZ = 0, themeNow = -1;
const hex = n => '#' + n.toString(16).padStart(6, '0');
function skyTex(top, bottom) {
  return canvasTex(2, 256, (x) => { const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, hex(top)); g.addColorStop(.62, hex(bottom)); g.addColorStop(1, hex(bottom)); x.fillStyle = g; x.fillRect(0, 0, 2, 256); });
}
function setTheme(i) {
  if (i === themeNow) return; themeNow = i;
  const id = ENV_IDS[i % ENV_IDS.length], meta = ENV_THEMES.find(t => t.id === id);
  if (env) env.dispose();
  env = createRunnerEnvironment(THREE, { theme: id, quality: 'low', includeSky: false, includeLighting: false, includeRoad: true });
  env.group.scale.setScalar(ES);
  env.group.traverse(o => { if (o.isMesh) o.castShadow = false; });   // 휴대폰 부담을 줄이려고 풍경은 그림자를 드리우지 않음(받기만)
  scene.add(env.group);
  const p = meta.palette, l = meta.lighting;
  if (scene.background && scene.background.isTexture) scene.background.dispose();
  scene.background = skyTex(p.skyTop, p.skyBottom);
  scene.fog.color.set(p.fog);
  hemi.color.set(l.sky); hemi.groundColor.set(l.ground); hemi.intensity = ENV_LIGHT[id] || 1.45;
  sun.color.set(l.sun); sun.intensity = Math.min(2.4, (l.intensity || 2.5) * .85);
  env.update(envZ / ES, T, 0);
  fxBright = ENV_BRIGHT[id] || 1;
  try { renderer.compile(scene, camera); } catch (e) {}
}
function moveEnv(dz, dt = 0) {
  envZ += dz;
  if (env) env.update(envZ / ES, T, dt);
}

/* ══ 병사 · 보스 · 중간보스: 시안 그림에서 오려 낸 그림(img/*.webp)을 카메라를 바라보는 판으로 세운다 ══
   병사는 그림마다 InstancedMesh 하나(수백 명), 보스 · 중간보스는 판 하나. 발밑이 땅에 닿게(판의 아래 가운데가 기준점). */
const CAP = 700;
const texLoader = new THREE.TextureLoader();
const sprTex = {};
function sprTexture(name) {
  if (!sprTex[name]) {
    const t = texLoader.load('img/' + name + '.webp?v=15'); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.keep = true;
    sprTex[name] = t;
  }
  return sprTex[name];
}
const sprAspect = name => { const s = SPRITES[name]; return s ? s[0] / s[1] : 1; };
const sprGeo = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0); sprGeo.userData.keep = true;
function sprMat(name) {
  const m = new THREE.MeshBasicMaterial({ map: sprTexture(name), alphaTest: .42, transparent: false, side: THREE.DoubleSide });
  m.userData.keep = true; return m;
}
const parts = [];
function part(geo, mat) { const m = new THREE.InstancedMesh(geo, mat, CAP); m.frustumCulled = false; m.setColorAt(0, new THREE.Color(1, 1, 1)); m.count = 0; scene.add(m); parts.push(m); return m; }   // 색 버퍼를 처음부터 만들어 둬야 중간에 셰이더를 다시 만들지 않는다
// 병사 그림: me = 파랑(뒷모습), en = 빨강(앞모습), 0~2 = LV1~3. 그림 원본 높이에 비례해 등급이 오를수록 커 보이게
const SOL = {};
for (const t of ['me', 'en']) for (let lv = 0; lv < 3; lv++) {
  const name = `sol-${t}${lv}`, px = SPRITES[name] ? SPRITES[name][1] : 110;
  SOL[name] = { mesh: part(sprGeo, sprMat(name)), a: sprAspect(name), h: (t === 'me' ? 3.7 : 3.5) * px / 110 };   // 시안처럼 큼직하게
}
const blob = part(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texBlob, transparent: true, depthWrite: false }));
blob.position.y = .04;
const col = c => new THREE.Color(c);
const C = { white: col('#ffffff') };
const M4 = new THREE.Matrix4(), L4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q0 = new THREE.Quaternion(), QR = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(), ZAX = new THREE.Vector3(0, 0, 1);
const HIT = new THREE.Color(2.4, 2.1, 2.1), HURT = new THREE.Color(1.5, .75, .75);   // 맞으면 하얗게 번쩍(1 넘는 색), 쓰러질 때는 붉게
/* 병사 한 명. team 0 = 내 부대, 1 = 적. lv 0~2. o: lift · roll · pop · hurt */
function soldier(x, z, face, sc, walk, team, lv, flash, o = NONE) {
  const S = SOL[(team ? 'sol-en' : 'sol-me') + lv], m = S.mesh, k = m.count; if (k >= CAP) return;
  const pop = o.pop == null ? 1 : o.pop, hit = flash > 0;
  const bob = Math.abs(Math.sin(walk)) * .16, roll = (o.roll || 0) + Math.sin(walk) * .06;   // 걸음: 통통 튀며 좌우로 살짝 기우뚱
  let sx = sc * pop, sy = sc * pop;
  if (hit) { sx *= 1.14; sy *= .86; }
  QR.setFromAxisAngle(ZAX, roll); Q.copy(camera.quaternion).multiply(QR);
  M4.compose(V.set(x, (o.lift || 0) + bob * sc, z), Q, SC.set(S.h * S.a * sx, S.h * sy, 1));
  m.setMatrixAt(k, M4); m.setColorAt(k, hit ? HIT : o.hurt ? HURT : C.white); m.count = k + 1;
  if (!o.lift) { M4.compose(V.set(x, 0, z), Q0, SC.setScalar(sc * pop * (.8 + lv * .12))); const b = blob.count; if (b < CAP) { blob.setMatrixAt(b, M4); blob.count = b + 1; } }
}
function beginSoldiers() { for (const m of parts) m.count = 0; }
function flushSoldiers() { for (const m of parts) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
// 보스 · 중간보스: 그림 판 하나 + 바닥 그림자. width = 세계 단위 폭
function makeBillboard(name, width) {
  const grp = new THREE.Group(), a = sprAspect(name), h = width / a;
  const mat = new THREE.MeshBasicMaterial({ map: sprTexture(name), alphaTest: .4, side: THREE.DoubleSide });
  const card = new THREE.Mesh(sprGeo, mat); card.scale.set(width, h, 1); grp.add(card);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texBlob, transparent: true, depthWrite: false }));
  shadow.scale.set(width * .9, 1, width * .45); shadow.position.y = .05; grp.add(shadow);
  scene.add(grp);
  return { grp, card, mat, w: width, h };
}
// 그림 판을 움직이기: 숨쉬기 · 걸음 · 공격 때 몸을 키우며 덤빔 · 맞으면 번쩍 · 찌그러짐
function animCard(v, t, walk, flash, pop, attack) {
  v.card.quaternion.copy(camera.quaternion);
  const breathe = 1 + Math.sin(t * 3.2) * .025, step = Math.abs(Math.sin(walk)) * .35, lunge = attack ? 1.08 + Math.sin(t * 22) * .03 : 1;
  const sq = flash > 0 ? .9 : 1;
  v.card.scale.set(v.w * breathe * lunge * (2 - sq) * (1 + pop * .03), v.h * breathe * lunge * sq * (1 + pop * .03), 1);
  v.card.position.y = step;
  v.card.rotateZ(Math.sin(walk) * .035);
  v.mat.color.setScalar(flash > 0 ? 1.9 : 1);
}

/* ── 총알: LV1 주황 총알 · LV2 파란 플라스마 구슬 · LV3 보라 레이저 + 고리 ── */
const BCAP = 700;
const bullets = new THREE.InstancedMesh(new THREE.PlaneGeometry(.55, 4.2).translate(0, -1.9, 0).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: texStreak, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), BCAP);
bullets.frustumCulled = false; bullets.count = 0; scene.add(bullets);
const heads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), BCAP);
heads.frustumCulled = false; heads.count = 0; scene.add(heads);
const BSTYLE = [
  { c: col('#ff8a1f'), head: col('#ffc46b'), w: .7, l: .55, hs: .9 },
  { c: col('#2f8cff'), head: col('#5cb8ff'), w: .9, l: .75, hs: 1.1 },
  { c: col('#a855f7'), head: col('#f5edff'), w: 1.7, l: 3.2, hs: 1.4 }
];

/* ── 보스 탄(피해야 하는 것): 풀 300, 카메라를 보는 원판 3겹 — 어두운 테두리 · 주황/자홍 몸통 · 흰 중심 ── */
const OCAP = 300, texDisc = radial([[0, 'rgba(255,255,255,1)'], [.78, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); texDisc.userData.keep = true;
const orbLayer = (op) => { const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texDisc, transparent: true, depthWrite: false, opacity: op }), OCAP); m.frustumCulled = false; m.setColorAt(0, new THREE.Color(1, 1, 1)); m.count = 0; scene.add(m); return m; };
const orbRim = orbLayer(.85), orbBody = orbLayer(1), orbCore = orbLayer(1);
const ORBC = { o: { body: col('#ff7a1a'), rim: col('#3a1004') }, m: { body: col('#ff2fd0'), rim: col('#3a0431') } };
const WHITE = new THREE.Color('#fff');

/* ── 불꽃(더하기 빛) · 연기 · 파편 ── */
function pool(cap, mesh) { mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); return { mesh, list: [], cap }; }
const sparks = pool(900, new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 900));
const smokes = pool(160, new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texSmoke, transparent: true, depthWrite: false, opacity: .75 }), 160));
const debris = pool(500, new THREE.InstancedMesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshLambertMaterial({ color: '#fff' }), 500));
const FXC = {
  red: ['#e3343a', '#f6c9a0', '#b5262b', '#c9cfd8'], blue: ['#2f6bf0', '#f6c9a0', '#2a4fae'], tire: ['#26282c', '#3a3d42', '#55585e'],
  gold: ['#ffd23f', '#ffb020', '#fff1a8'], hot: ['#ffe27a', '#ffb347'], cool: ['#bfefff', '#7fd6ff'], missile: ['#bfe6ff', '#4fa8ff', '#ffffff'],
  gateB: ['#62b3ff', '#1f63e6', '#ffffff', '#bfe3ff'], gateR: ['#ff7a7a', '#e0242c', '#ffffff', '#ffd0d0'], gateY: ['#ffd76a', '#f08a12', '#ffffff'],
  confetti: ['#ff4d6d', '#ffd23f', '#3ddc84', '#4fa8ff', '#b47bff', '#ffffff']
};
const tmpC = new THREE.Color(), colCache = new Map();
const colr = c => { if (c instanceof THREE.Color) return c; let v = colCache.get(c); if (!v) colCache.set(c, v = new THREE.Color(c)); return v; };
const shrink = (list, dt) => { let j = 0; for (const p of list) if ((p.t -= dt) > 0) list[j++] = p; list.length = j; };
function addSpark(x, h, z, c, size, life, vx, vh, vz) { if (sparks.list.length < sparks.cap) sparks.list.push({ x, h, z, vx: vx || 0, vh: vh || 0, vz: vz || 0, s: size, t: life, L: life, c: colr(c) }); }
function fxSpark(x, y, kind, n) {
  const cols = FXC[kind] || FXC.hot;
  for (let i = 0; i < n; i++) addSpark(wx(x) + rnd(-.3, .3), rnd(.8, 1.8), wz(y), cols[i % cols.length], rnd(.6, 1.2), rnd(.08, .2), rnd(-6, 6), rnd(-1, 5), rnd(-2, 6));
}
function fxBurst(x, y, kind, n) {
  if (reduce) n = Math.ceil(n / 3);
  const cols = FXC[kind] || FXC.red;
  for (let i = 0; i < n; i++) {
    if (debris.list.length < debris.cap) debris.list.push({ x: wx(x) + rnd(-.5, .5), h: rnd(.6, 1.8), z: wz(y) + rnd(-.5, .5), vx: rnd(-7, 7), vh: rnd(4, 12), vz: rnd(-5, 7), r: rnd(0, 6), vr: rnd(-12, 12), s: kind === 'tire' ? rnd(1, 2.2) : kind === 'confetti' ? rnd(.5, .8) : rnd(.6, 1.3), t: rnd(.5, 1), c: colr(cols[i % cols.length]), flat: kind === 'confetti' });
  }
  for (let i = 0; i < Math.min(8, n); i++) addSpark(wx(x) + rnd(-.6, .6), rnd(.5, 2), wz(y) + rnd(-.6, .6), kind === 'gold' ? '#ffe07a' : kind === 'missile' ? '#9fd8ff' : '#ffb35a', rnd(1.2, 2.4), rnd(.12, .25), rnd(-3, 3), rnd(0, 4), rnd(-3, 3));
  if (kind === 'blue' && G) for (let i = 0; i < Math.min(5, n); i++) fall(x + rnd(-14, 14), y + rnd(-8, 8), 0, G ? G.tier : 0);
}
function fxSmoke(x, y, n = 1) {
  for (let i = 0; i < n; i++) if (smokes.list.length < smokes.cap) smokes.list.push({ x: wx(x) + rnd(-.8, .8), h: rnd(.6, 1.6), z: wz(y) + rnd(-.6, .6), vx: rnd(-1, 1), vh: rnd(1, 2.4), vz: rnd(0, 2), s: rnd(1.4, 2.4), t: rnd(.5, .8), L: .8, g: rnd(.82, .96) });
}
function flushPool(pl) { pl.mesh.instanceMatrix.needsUpdate = true; if (pl.mesh.instanceColor) pl.mesh.instanceColor.needsUpdate = true; }
function updateFx(dt) {
  const cq = camera.quaternion;
  let i = 0;
  shrink(sparks.list, dt);
  for (const p of sparks.list) {
    p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
    const k = p.t / p.L; M4.compose(V.set(p.x, p.h, p.z), cq, SC.setScalar(p.s * (.6 + k * .6)));
    sparks.mesh.setMatrixAt(i, M4); sparks.mesh.setColorAt(i, tmpC.copy(p.c).multiplyScalar(k)); i++;
  }
  sparks.mesh.count = i; flushPool(sparks);
  i = 0;
  shrink(smokes.list, dt);
  for (const p of smokes.list) {
    p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
    const k = p.t / p.L; M4.compose(V.set(p.x, p.h, p.z), cq, SC.setScalar(p.s * (1.6 - k) * Math.min(1, k * 4)));
    smokes.mesh.setMatrixAt(i, M4); smokes.mesh.setColorAt(i, tmpC.setScalar(p.g)); i++;
  }
  smokes.mesh.count = i; flushPool(smokes);
  i = 0;
  shrink(debris.list, dt);
  for (const p of debris.list) {
    p.vh -= (p.flat ? 9 : 30) * dt; p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt; p.r += p.vr * dt;
    if (p.flat) { p.vx *= .97; p.vz *= .97; }
    if (p.h < .15) { p.h = .15; p.vh *= -.35; p.vx *= .6; p.vz *= .6; }
    E.set(p.r, p.r * .7, 0); Q.setFromEuler(E);
    M4.compose(V.set(p.x, p.h, p.z), Q, p.flat ? SC.set(p.s, .05, p.s * .6) : SC.setScalar(p.s * Math.min(1, p.t * 3)));
    debris.mesh.setMatrixAt(i, M4); debris.mesh.setColorAt(i, p.c); i++;
  }
  debris.mesh.count = i; flushPool(debris);
}
// 바닥에 퍼지는 고리 · 레이저 고리(세로)
const rings = [];
const RINGC = { gold: '#ffd23f', blue: '#5cc8ff', missile: '#7fc8ff', laser: '#b48bff', red: '#ff5a5a' };
const ringV = new THREE.RingGeometry(.55, .75, 32), ringH = new THREE.RingGeometry(.8, 1.3, 40).rotateX(-Math.PI / 2), blastGeo = new THREE.SphereGeometry(1, 16, 12);
const fxMats = [];   // 고리 · 폭발 재질 모음(버리지 않고 다시 씀)
function fxMat(c) { const m = fxMats.pop() || new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); m.color.set(c); m.opacity = 1; m.userData.keep = true; return m; }
function fxRing(x, y, kind, vertical) {
  if (rings.length > 24) return;
  const g = vertical ? ringV : ringH;
  const m = new THREE.Mesh(g, fxMat(RINGC[kind] || RINGC.blue));
  m.position.set(wx(x), vertical ? 1.3 : .1, wz(y)); scene.add(m); rings.push({ m, t: vertical ? .28 : .5, L: vertical ? .28 : .5, v: vertical });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t -= dt; const k = 1 - r.t / r.L;
    if (r.v) { r.m.position.z -= dt * 70; r.m.scale.setScalar(1 + k * 1.4); r.m.material.opacity = (1 - k) * .9; }
    else { r.m.scale.setScalar(1 + k * 6.5); r.m.material.opacity = (1 - k) * fxBright; }
    if (r.t <= 0) { scene.remove(r.m); fxMats.push(r.m.material); rings.splice(i, 1); }
  }
}
// 폭발: 커지며 사라지는 빛 덩어리
const blasts = [];
const BLASTC = { gold: '#ffb340', missile: '#7cc4ff' };
function fxBlast(x, y, kind) {
  const m = new THREE.Mesh(blastGeo, fxMat(BLASTC[kind] || BLASTC.gold));
  m.position.set(wx(x), 1, wz(y)); scene.add(m); blasts.push({ m, t: .35 });
  const a = kind === 'missile' ? ['#e6f6ff', '#4fa8ff'] : ['#ffe27a', '#ff7a2a'];
  for (let i = 0; i < 16; i++) addSpark(wx(x), rnd(.5, 3), wz(y), a[i % 2], rnd(2, 3.5), rnd(.2, .35), rnd(-10, 10), rnd(2, 9), rnd(-10, 10));
  kick = Math.max(kick, .6);
}
// 번개: 하늘에서 내리꽂는 파란 번개 — 갈라진 모양 그림 6장을 번갈아 보여 '치지지직' 떨리게, 맞은 자리에서 옆 적에게 작은 전기가 튄다
const boltTexs = Array.from({ length: 6 }, () => canvasTex(128, 512, x => {
  const path = (x0, y0, y1, amp, step) => { const p = [[x0, y0]]; let cx = x0; for (let y = y0 + step; y <= y1; y += step) { cx += (Math.random() - .5) * amp; cx = Math.max(10, Math.min(118, cx)); p.push([cx, y]); } return p; };
  const draw = (p, w, col, blur) => { x.shadowColor = '#3b82f6'; x.shadowBlur = blur; x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); p.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.stroke(); };
  const main = path(64, 0, 512, 46, 24);
  const kids = [1, 2, 3].map(() => { const s = main[4 + Math.floor(Math.random() * 12)]; return path(s[0], s[1], s[1] + 80 + Math.random() * 120, 40, 16); });   // 가지
  for (const k of kids) { draw(k, 7, 'rgba(96,165,250,.6)', 14); draw(k, 2, '#dbeafe', 4); }
  draw(main, 18, 'rgba(59,130,246,.55)', 28); draw(main, 8, '#93c5fd', 14); draw(main, 3, '#ffffff', 0);
}));
const boltGeo = new THREE.PlaneGeometry(9, 62).translate(0, 31, 0);
const bolts = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ map: boltTexs[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false; m.frustumCulled = false; scene.add(m); return { m, t: 0, x: 0, y: 0, sw: 0 };
});
const BOLT_T = .5;
function fxBolt(x, y) {
  const b = bolts.find(o => o.t <= 0) || bolts[0];
  b.t = BOLT_T; b.x = x; b.y = y; b.sw = 0; b.m.position.set(wx(x), 0, wz(y)); b.m.visible = true;
  fxRing(x, y, 'missile'); fxRing(x, y, 'blue'); flashW = Math.max(flashW, .1); tint = { c: '96,165,250', t: .3 }; kick = 1;
  for (let i = 0; i < 16; i++) addSpark(wx(x), rnd(.3, 2), wz(y), i % 2 ? '#ffffff' : '#60a5fa', rnd(1.4, 2.6), rnd(.2, .4), rnd(-12, 12), rnd(4, 12), rnd(-12, 12));
  // 옆 적에게 튀는 전기: 가까운 적 셋까지 지그재그 빛 알갱이로 잇는다
  if (G) {
    const near = G.mobs.filter(M => Math.abs(M.x - x) < 110 && Math.abs(M.y - y) < 110).slice(0, 3);
    for (const M of near) arc(x, y, M.x, M.y);
  }
}
function arc(x0, y0, x1, y1) {
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = i / n, jx = i && i < n ? rnd(-6, 6) : 0, jy = i && i < n ? rnd(-6, 6) : 0;
    addSpark(wx(x0 + (x1 - x0) * a + jx), 1.2 + Math.sin(a * Math.PI) * 1.4, wz(y0 + (y1 - y0) * a + jy), i % 3 ? '#93c5fd' : '#ffffff', rnd(.9, 1.4), rnd(.12, .22), 0, 0, 0);
  }
}
function updateBolts(dt) {
  for (const b of bolts) {
    if (b.t <= 0) continue;
    b.t -= dt; b.sw -= dt;
    if (b.sw <= 0) { b.sw = .045; b.m.material.map = boltTexs[Math.floor(Math.random() * boltTexs.length)]; b.m.scale.x = Math.random() < .5 ? 1 : -1; }   // 모양이 계속 바뀌며 지지직
    b.m.quaternion.copy(camera.quaternion);
    b.m.material.opacity = Math.min(1, b.t / BOLT_T * 2.2) * (Math.random() < .35 ? .45 : 1);
    if (Math.random() < .5) addSpark(wx(b.x) + rnd(-1, 1), rnd(.2, 1.5), wz(b.y) + rnd(-1, 1), '#93c5fd', rnd(1, 1.8), .15, rnd(-6, 6), rnd(2, 8), rnd(-6, 6));
    if (b.t <= 0) b.m.visible = false;
  }
}
function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i]; b.t -= dt; const k = 1 - b.t / .35;
    b.m.scale.setScalar(1 + k * 5); b.m.material.opacity = (1 - k) * fxBright;
    if (b.t <= 0) { scene.remove(b.m); fxMats.push(b.m.material); blasts.splice(i, 1); }
  }
}
// 쓰러진 병사: 맞은 쪽 반대로 휙 날아가며 빙글 → 별 터짐
const bodies = [];
function fall(x, y, team, lv, big) {
  if (bodies.length > 90) bodies.shift();
  const away = team ? -1 : 1;
  bodies.push({ x: wx(x), z: wz(y), h: 0, vx: rnd(-5, 5), vh: rnd(8, 12), vz: away * rnd(2, 7), roll: 0, vr: rnd(6, 12) * (Math.random() < .5 ? -1 : 1), spin: 0, vs: rnd(-8, 8), t: rnd(.55, .75), team, lv, sc: big || 1, step: rnd(0, 6) });
}
function updateBodies(dt) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i]; b.t -= dt;
    b.vh -= 34 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.h = Math.max(0, b.h + b.vh * dt); b.roll += b.vr * dt; b.spin += b.vs * dt;
    if (b.t <= 0) {
      for (let k = 0; k < 5; k++) addSpark(b.x + rnd(-.4, .4), b.h + 1, b.z, k % 2 ? '#ffffff' : '#ffe27a', rnd(.6, 1), .22, rnd(-4, 4), rnd(1, 5), rnd(-3, 3));
      bodies.splice(i, 1); continue;
    }
    soldier(b.x, b.z, 0, b.sc * Math.min(1, b.t * 4 + .2), 0, b.team, b.lv, 0, { lift: b.h + .2, roll: b.roll, hurt: true });
  }
}

/* ── 문: 꽉 찬 색 판 + 큰 숫자, 둥근 기둥. 진급 문 · 유도탄 문은 금색 ── */
const views = new Map();   // core 물건 → 3D 물건
const dec = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
function gateLabel(p) { return p.t === 'x' ? '×' + dec(p.v) : p.t === '/' ? '÷' + dec(p.v) : p.t === 'M' ? 'M' + p.v : (p.v > 0 ? '+' : '') + p.v; }
function gateKind(p) { return p.t === 'M' ? 'trade' : (p.t === 'x' || (p.t === '+' && p.v >= 0)) ? 'good' : 'bad'; }
const GATEC = {
  good: { top: '#62b3ff', bot: '#1f63e6', edge: '#0d3a9e', post: '#2a6cf0', glow: 'rgba(160,215,255,.9)' },
  bad: { top: '#ff7a7a', bot: '#e0242c', edge: '#8a0d14', post: '#e2353a', glow: 'rgba(255,180,180,.9)' },
  trade: { top: '#ffd76a', bot: '#f08a12', edge: '#8a4a00', post: '#f2a515', glow: 'rgba(255,236,170,.95)' }
};
function paintGate(pv, p) {
  const kind = gateKind(p), K = GATEC[kind], c = pv.cv, x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  const r = 18;
  x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, H, r); x.arcTo(W, H, 0, H, r); x.arcTo(0, H, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.closePath();
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, K.top); g.addColorStop(1, K.bot);
  x.globalAlpha = .9; x.fillStyle = g; x.fill(); x.globalAlpha = 1;
  x.lineWidth = 8; x.strokeStyle = K.glow; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(14, 10, W - 28, H * .18);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const big = W < 400 ? 100 : 124;
  if (kind === 'trade') {
    const title = '유도탄 +' + mslGain(G && G.diff);
    x.font = `900 ${big * .36}px Pretendard, sans-serif`; x.lineWidth = 8; x.strokeStyle = K.edge; x.strokeText(title, W / 2, H * .26); x.fillStyle = '#fff'; x.fillText(title, W / 2, H * .26);
    x.font = `900 ${big * .82}px Pretendard, sans-serif`; x.lineWidth = 16; x.strokeText('-' + p.v, W / 2, H * .66); x.fillStyle = '#fff'; x.fillText('-' + p.v, W / 2, H * .66);
  } else {
    const s = gateLabel(p);
    let fs = big; x.font = `900 ${fs}px Pretendard, sans-serif`;
    const tw = x.measureText(s).width; if (tw > W - 34) { fs = Math.floor(fs * (W - 34) / tw); x.font = `900 ${fs}px Pretendard, sans-serif`; }   // 좁은 옆길 문에서도 숫자가 칸 안에
    x.lineWidth = Math.max(8, fs * .18); x.strokeStyle = K.edge; x.strokeText(s, W / 2, H / 2 + 8); x.fillStyle = '#fff'; x.fillText(s, W / 2, H / 2 + 8);
  }
  if (pv.swap) { x.font = '900 28px Pretendard, sans-serif'; x.fillStyle = 'rgba(255,255,255,.95)'; x.fillText('⇄ 바뀌는 문', W / 2, 26); }
  pv.label = gateLabel(p); pv.tex.needsUpdate = true;
  pv.posts.forEach(m => { m.material = postMat[kind]; m.children.forEach(c => { c.material = postMat[kind]; }); });
}
const postGeo = new THREE.CylinderGeometry(.34, .38, 5.2, 12), capGeo = new THREE.SphereGeometry(.46, 12, 10);
const postMat = {};   // 문 기둥 재질은 색마다 하나를 함께 쓴다(버리지 않음 — 셰이더를 다시 만들지 않게)
for (const k in GATEC) { postMat[k] = new THREE.MeshPhongMaterial({ color: GATEC[k].post, shininess: 80 }); postMat[k].userData.keep = true; }
postGeo.userData.keep = capGeo.userData.keep = true;
function makeGate(gt) {
  const grp = new THREE.Group(), parts = [];
  gt.parts.forEach(p => {
    const w = (p.x1 - p.x0) * S, cx = wx((p.x0 + p.x1) / 2);
    const c = document.createElement('canvas'); c.width = Math.round(512 * w / 14.4); c.height = 170;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - .6, 4.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    panel.position.set(cx, 2.6, 0); grp.add(panel);
    const posts = [];
    [p.x0, p.x1].forEach((xx, k) => {
      const m = postMat.good;
      const post = new THREE.Mesh(postGeo, m); post.position.set(wx(xx) + (k ? -.38 : .38), 2.6, 0); grp.add(post); posts.push(post);
      const cap = new THREE.Mesh(capGeo, m); cap.position.set(0, 2.7, 0); post.add(cap);   // 기둥 머리는 기둥에 붙여 색을 함께 바꾼다
    });
    const pv = { panel, tex, cv: c, posts, label: '', swap: gt.swap };
    paintGate(pv, p); parts.push(pv);
  });
  scene.add(grp);
  return { grp, parts };
}

/* ── 타이어 더미 + 위에 얹은 상품(진급 = 투구 · 유도탄 · 연사 = 플라스마총 · 위력 = 금 총알) ── */
const tireGeo = new THREE.CylinderGeometry(1.25, 1.25, .95, 20).rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(.55, .55, 1, 12).rotateZ(Math.PI / 2);
tireGeo.userData.keep = hubGeo.userData.keep = true;
const hubMat = new THREE.MeshLambertMaterial({ color: '#7d828a' }); hubMat.userData.keep = true;
function missileModel(tier, s = 1) {
  const g = new THREE.Group(), ph = (c) => new THREE.MeshPhongMaterial({ color: c, shininess: 90 });
  const bodyC = tier === 2 ? '#f4f1ea' : '#dfe5ee', noseC = tier === 2 ? '#2f6bff' : '#2a64e8', finC = tier === 2 ? '#f5b52e' : tier === 1 ? '#3b6fd8' : '#2a64e8';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, 1.5, 14).rotateX(Math.PI / 2), ph(bodyC)); g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.26, .6, 14).rotateX(-Math.PI / 2), ph(noseC)); nose.position.z = -1.05; g.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .14, 14).rotateX(Math.PI / 2), ph(tier === 2 ? '#f5b52e' : '#2a64e8')); band.position.z = -.35; g.add(band);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.04, .42 + tier * .1, .45), ph(finC)); f.position.set(Math.cos(i * Math.PI / 2) * .3, Math.sin(i * Math.PI / 2) * .3, .55); f.rotation.z = i * Math.PI / 2; g.add(f); }
  if (tier === 2) [-1, 1].forEach(sd => { const w = new THREE.Mesh(new THREE.BoxGeometry(.9, .05, .4), ph('#f5b52e')); w.position.set(sd * .45, 0, -.1); g.add(w); });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texGlow, color: tier === 2 ? '#7fd0ff' : '#ff9a3a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.z = 1.3; g.add(flame); g.userData.flame = flame;
  g.scale.setScalar(s); return g;
}
function makeBox(X) {
  const grp = new THREE.Group(), w = X.w * S, n = 4, tires = [];
  const tireMat = new THREE.MeshLambertMaterial({ color: '#2a2c30', emissive: '#000000' });
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(tireGeo, tireMat); t.position.set(-w / 2 + w / n * (i + .5), 1.25, 0); t.castShadow = true;
    t.add(new THREE.Mesh(hubGeo, hubMat)); grp.add(t); tires.push(t);
  }
  const prize = new THREE.Group(), ph = c => new THREE.MeshPhongMaterial({ color: c, shininess: 90, specular: '#ffffff' });
  if (X.gift === 'thunder') {   // 노란 번개 모양
    const sh = new THREE.Shape(); [[.15, 1.4], [-.55, -.05], [-.05, -.05], [-.35, -1.4], [.6, .25], [.05, .25], [.4, 1.4]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
    const bolt = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .3, bevelEnabled: true, bevelSize: .06, bevelThickness: .06 }), new THREE.MeshPhongMaterial({ color: '#ffd23f', emissive: '#a86b00', shininess: 90 }));
    bolt.position.z = -.15; prize.add(bolt);
  } else if (X.gift === 'missile') {
    const m = missileModel(1, 1.3); m.rotation.x = -Math.PI / 2.4; m.userData.flame.visible = false; prize.add(m);
  } else if (X.gift === 'rate') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(.7, .8, 2.2), ph('#d7dde6')); prize.add(b);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1, 10).rotateX(Math.PI / 2), ph('#9ea6b2')); br.position.z = -1.5; prize.add(br);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(.06, .25, 1.6), new THREE.MeshBasicMaterial({ color: '#3fa9ff' })); gl.position.x = .37; prize.add(gl);
  } else {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 1.3, 16), ph('#f5b52e')); prize.add(b);
    const t = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ph('#ffd76a')); t.position.y = .65; t.scale.y = 1.6; prize.add(t);
  }
  prize.position.y = 2.6; prize.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffe48a', transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = 2.8; grp.add(halo);
  grp.add(prize); scene.add(grp);
  return { grp, tires, tireMat, prize, halo };
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
const shellGeo = new THREE.SphereGeometry(.6, 12, 10); shellGeo.userData.keep = true;
function makeShell(sh, color) {
  const grp = new THREE.Group();
  const ball = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color })); grp.add(ball);
  const warn = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: .25, depthWrite: false }));
  warn.position.y = fill.position.y = .06; warn.scale.setScalar(sh.r * S); fill.scale.setScalar(.01);
  scene.add(grp, warn, fill);
  return { grp, ball, warn, fill, color: new THREE.Color(color) };
}
// 보스 · 중간보스 둘레 빛
function auraFx(x, z, color, r, n) { for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2); addSpark(x + Math.cos(a) * r, rnd(.3, 2), z + Math.sin(a) * r * .6, color, rnd(1, 2), rnd(.3, .5), Math.cos(a) * 1.5, rnd(3, 7), Math.sin(a) * 1.5); } }

function disposeObj(o) {
  o.traverse(c => {
    if (!c.isMesh) return;
    if (!c.geometry.userData.keep) c.geometry.dispose();
    if (!c.material.userData.keep) { if (c.material.map && !c.material.map.userData.keep && c.material.map !== texGlow) c.material.map.dispose(); c.material.dispose(); }
  });
  scene.remove(o);
}
function gateBurst(gt) {
  const p = gt.parts[gt.pick]; if (!p) return;
  const kind = gateKind(p), cx = (p.x0 + p.x1) / 2, fk = kind === 'bad' ? 'gateR' : kind === 'trade' ? 'gateY' : 'gateB';
  const cols = FXC[fk], n = reduce ? 10 : 34, w = (p.x1 - p.x0) * S;
  for (let i = 0; i < n; i++) if (debris.list.length < debris.cap) debris.list.push({ x: wx(cx) + rnd(-w / 2, w / 2), h: rnd(1, 4.4), z: wz(gt.y) + rnd(-.3, .3), vx: rnd(-9, 9), vh: rnd(3, 11), vz: rnd(-8, 4), r: rnd(0, 6), vr: rnd(-14, 14), s: rnd(.9, 1.7), t: rnd(.6, 1), c: colr(cols[i % cols.length]), flat: true });
  for (let i = 0; i < (reduce ? 3 : 10); i++) addSpark(wx(cx) + rnd(-w / 2, w / 2), rnd(1.2, 4), wz(gt.y), i % 2 ? '#ffffff' : cols[0], rnd(1.4, 2.4), rnd(.15, .3), rnd(-5, 5), rnd(0, 5), rnd(-4, 2));
  fxRing(cx, gt.y, kind === 'bad' ? 'red' : kind === 'trade' ? 'gold' : 'blue');
}
function syncViews(dt) {
  const live = new Set();
  for (const gt of G.gates) {
    live.add(gt); let v = views.get(gt);
    if (!v) { v = makeGate(gt); views.set(gt, v); }
    v.grp.position.z = wz(gt.y);
    if (gt.used && v.ut == null) { v.ut = 0; gateBurst(gt); }
    if (v.ut != null) {   // 지나간 문: 고른 칸은 커지며 하얗게 터지고, 나머지는 작아지며 꺼짐
      v.ut += dt; const k = Math.min(1, v.ut / .26);
      v.parts.forEach((pv, i) => {
        const mine = i === gt.pick, sc = mine ? 1 + k * .7 : 1 - k * .4;
        pv.panel.scale.set(sc, sc, 1); pv.panel.material.color.setScalar(mine ? 1 + (1 - k) * 1.5 : 1); pv.panel.material.opacity = (1 - k) * (mine ? 1 : .5);
        for (const po of pv.posts) po.scale.set(1, Math.max(.01, 1 - k), 1);
      });
      if (k >= 1) v.grp.visible = false;
      continue;
    }
    gt.parts.forEach((p, k) => {
      const pv = v.parts[k];
      if (pv.label !== gateLabel(p) && T - (pv.pt || -9) > .09) { paintGate(pv, p); pv.pt = T; }
      const sc = 1 + p.hit * .16; pv.panel.scale.set(sc, sc, 1); pv.panel.material.color.setScalar(1 + p.hit * .9);
    });
  }
  for (const X of G.boxes) {
    live.add(X); let v = views.get(X);
    if (!v) { v = makeBox(X); views.set(X, v); }
    const j = X.flash > 0 ? rnd(-.12, .12) : 0;
    v.grp.position.set(wx(X.x) + j, 0, wz(X.y));
    v.prize.rotation.y += dt * 1.6; v.prize.position.y = 3 + Math.sin(T * 3) * .2;
    v.halo.quaternion.copy(camera.quaternion); v.halo.material.opacity = .4 + Math.sin(T * 5) * .15;
    v.tireMat.emissive.setScalar(X.flash > 0 ? .5 : 0);
    v.tires.forEach((t, i) => { t.scale.setScalar(1 + X.pop * .06); t.rotation.x = Math.sin(T * 2 + i) * .03; });
  }
  for (const b of G.barrels) {
    live.add(b); let v = views.get(b);
    if (!v) { v = makeBarrel(); views.set(b, v); }
    v.grp.position.set(wx(b.x), 0, wz(b.y)); v.mat.emissive.setScalar(b.flash > 0 || b.hp <= 0 ? .6 : 0);
    v.grp.scale.setScalar(b.hp <= 0 ? 1.25 : 1);
  }
  const shellC = G.boss ? SHELL[G.boss.animal] : '#ffcf4a';
  for (const sh of G.shells) {
    live.add(sh); let v = views.get(sh);
    if (!v) { v = makeShell(sh, shellC); views.set(sh, v); }
    const k = sh.t / sh.T, x = sh.sx + (sh.x - sh.sx) * k, y = sh.sy + (sh.y - sh.sy) * k;
    v.ball.position.set(wx(x), 4 + Math.sin(k * Math.PI) * 16 * (1 - k * .2), wz(y)); v.ball.rotation.x += dt * 8;
    if (Math.random() < .8) addSpark(wx(x), v.ball.position.y, wz(y), v.color, rnd(.9, 1.5), .25, 0, 0, 0);
    v.warn.position.x = v.fill.position.x = wx(sh.x); v.warn.position.z = v.fill.position.z = wz(sh.y);
    v.fill.scale.setScalar(Math.max(.01, sh.r * S * k)); v.warn.material.opacity = .5 + Math.sin(T * 24) * .4;
  }
  // 유도탄
  for (const r of G.rockets) {
    live.add(r); let v = views.get(r);
    if (!v) { v = { grp: missileModel(r.tier, 1.25) }; scene.add(v.grp); views.set(r, v); }
    const near = r.tg ? Math.hypot(r.tg.x - r.x, r.tg.y - r.y) : 999, h = 1.5 + Math.min(1, r.t * 2.5) * 3.2 * Math.min(1, near / 160);
    v.grp.position.set(wx(r.x), h, wz(r.y));
    v.grp.rotation.set(0, Math.atan2(-r.vx, -r.vy), 0); v.grp.rotateZ(r.t * 9);
    v.grp.userData.flame.scale.set(1, 1 + Math.random() * .6, 1);
    const tail = r.tier === 2 ? '#7fd0ff' : '#ffb04a';
    for (let k = 0; k < 2; k++) addSpark(wx(r.x - r.vx * .012 * k), h, wz(r.y - r.vy * .012 * k), k ? '#ffffff' : tail, rnd(.9, 1.5), .3, 0, rnd(0, 1), 0);
    if (Math.random() < .5) smokes.list.length < smokes.cap && smokes.list.push({ x: wx(r.x), h, z: wz(r.y), vx: 0, vh: .5, vz: 0, s: .9, t: .5, L: .6, g: .95 });
  }
  // 중간보스
  for (const M of G.mobs) {
    if (!M.mb) continue;
    live.add(M); let v = views.get(M);
    if (!v) { v = makeBillboard('mid-' + M.mb, M.mb === 'drake' ? 21 : 16); views.set(M, v); }
    v.grp.position.set(wx(M.x) + (M.flash > 0 ? rnd(-.1, .1) : 0), 0, wz(M.y));
    animCard(v, T, M.step, M.flash, 0, false);
    if (M.y > SPAWN + 150 && Math.random() < .5) auraFx(wx(M.x), wz(M.y), MID_AURA[M.mb], 2.2, 1);
    if (M.mb === 'drake' && Math.random() < .6) addSpark(wx(M.x) + rnd(-.3, .3), 4.4, wz(M.y) + 4.2, Math.random() < .5 ? '#ffb030' : '#ff5a1f', rnd(1, 2), .3, rnd(-1, 1), rnd(-1, 1), rnd(4, 9));
  }
  if (G.boss) {
    const K = G.boss; live.add(K); let v = views.get(K);
    if (!v) { v = makeBillboard('boss-' + K.animal + K.evo, [19, 23, 29][K.evo]); v.aura = AURA[K.animal]; views.set(K, v); }
    v.grp.position.set(wx(K.x) + (K.flash > 0 ? rnd(-.12, .12) : 0), 0, wz(K.y));
    const moving = K.kind === 'brute' || K.y < K.stop;
    animCard(v, T, moving ? K.t * 5 : 0, K.flash, K.pop, K.bite > 0 || (K.kind === 'tank' && K.fire < .45));
    if (K.evo === 2 || Math.random() < .3) auraFx(wx(K.x), wz(K.y), v.aura, 4, K.evo === 2 ? 2 : 1);
  }
  for (const [k, v] of views) if (!live.has(k)) { dropView(v); views.delete(k); }
}
function dropView(v) { disposeObj(v.grp); if (v.warn) { disposeObj(v.warn); disposeObj(v.fill); } }
function clearViews() { for (const [, v] of views) dropView(v); views.clear(); }

/* ── 화면 크기 · 카메라 ── */
let VW = 360, VH = 640, DPR = 1, camDist = 40, camX = 0, lookR = .63, kick = 0;
let prMax = 1.5, prNow = 0, slowT = 0, fastT = 0;
function adaptRes(real) {
  if (!prNow || state !== 'play') return;
  if (real > 1 / 40) { slowT += real; fastT = 0; } else { slowT = Math.max(0, slowT - real * .5); if (real < 1 / 57) fastT += real; }
  if (slowT > 1.2) {
    slowT = 0;
    if (prNow > 1) { prNow = Math.max(1, prNow - .25); renderer.setPixelRatio(prNow); renderer.setSize(VW, VH, false); }
    else if (sun.castShadow) sun.castShadow = false;   // 가장 낮은 해상도에서도 느리면 그림자를 끈다
  } else if (fastT > 8 && prNow < prMax) { fastT = 0; prNow = Math.min(prMax, prNow + .25); renderer.setPixelRatio(prNow); renderer.setSize(VW, VH, false); }
}
const LOOK = new THREE.Vector3();
function fit() {
  const r = glc.getBoundingClientRect();
  VW = r.width || 360; VH = r.height || 640; DPR = Math.min(window.devicePixelRatio || 1, 2);
  prMax = Math.min(DPR, 1.5); if (!prNow) prNow = prMax; prNow = Math.min(prNow, prMax);
  renderer.setPixelRatio(prNow); renderer.setSize(VW, VH, false);
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  camera.aspect = VW / VH; camera.fov = FOV;
  camera.updateProjectionMatrix();
  // 거리(길 폭이 꼭 맞게)와 바라보는 곳(부대가 화면 아래 1/4 쯤)을 번갈아 맞춘다
  for (let it = 0; it < 4; it++) {
    let lo = 18, hi = 160;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; camDist = m; aimCamera(0, 0); camera.updateMatrixWorld(); if (PV.set(RW / 2 + 1.2, 0, 1).project(camera).x < .98) hi = m; else lo = m; }
    camDist = hi; lo = .2; hi = 1.6;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; lookR = m; aimCamera(0, 0); camera.updateMatrixWorld(); if (PV.set(0, 0, 1).project(camera).y < -.55) hi = m; else lo = m; }
    lookR = Math.min(.9, Math.max(.35, lookR));
  }
  scene.fog.near = camDist * 1.7; scene.fog.far = camDist * 4.6;
  camera.updateProjectionMatrix();
  scoreAt = null;
}
function aimCamera(cx, shake) {
  LOOK.set(cx * .6, 0, -camDist * lookR);
  camera.position.set(cx + rnd(-shake, shake), camDist * .62 + rnd(-shake, shake) * .5, camDist * .5);
  camera.lookAt(LOOK);
}
function placeCamera(shake, dt) {
  const tx = G ? wx(G.px) * .15 : 0; camX += (tx - camX) * .1;
  kick = Math.max(0, kick - dt * 3);
  const f = FOV - kick * 3; if (Math.abs(camera.fov - f) > .01) { camera.fov = f; camera.updateProjectionMatrix(); }
  aimCamera(camX, shake);
}

/* ── 2D 위 글자 · 콤보 · 동전 ── */
const PV = new THREE.Vector3();
function scr(x, h, z) { PV.set(x, h, z).project(camera); return { x: (PV.x + 1) / 2 * VW, y: (1 - PV.y) / 2 * VH, z: PV.z }; }
const FONT = 'Pretendard, sans-serif';
function text(s, x, y, size, c, stroke, sc) {
  ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 4.5); ctx.strokeStyle = sc || 'rgba(15,23,42,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = c; ctx.fillText(s, x, y);
}
function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function pill(x, y, s, fs, c1, c2) {
  ctx.font = `900 ${fs}px ${FONT}`;
  const w = Math.max(fs * 2, ctx.measureText(s).width + fs * 1.1), h = fs * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(x - w / 2, y - h / 2 + 3, w, h, h / 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.stroke();
  text(s, x, y + fs * .04, fs, '#fff', true, 'rgba(0,0,0,.35)');
}
const GIFT = { rate: '연사 UP', dmg: '위력 UP', thunder: '천둥번개' };
const giftLabel = g => g === 'missile' ? '유도탄 +' + mslGain(G && G.diff) : GIFT[g] || '';   // 유도탄 수는 난이도에 따라
const elastic = a => 1 + .7 * Math.exp(-a * 9) * Math.cos(a * 22);   // 톡 튀었다가 제자리로
const texts = [];
function fxFloat(x, y, s, c, size, small, h) {
  if (small) { let n = 0; for (const t of texts) if (t.small) n++; if (n >= 14) return; }
  if (!small) { let n = 0; for (let i = texts.length - 1; i >= 0; i--) if (!texts[i].small && ++n >= 5) texts.splice(i, 1); }   // 큰 글자는 동시에 5개까지
  texts.push({ x: wx(x), z: wz(y), h: h || 3, s, c, size: size || 18, t: small ? .55 : 1.1, L: small ? .55 : 1.1, small, dy: 0 }); }
let tint = null, shake = 0, banner = 0, bannerL = 1.9, hitstop = 0, flashW = 0;
// 콤보 · 외침 · 동전 · 꽃가루
let comboPop = 0, shout = null;
const SHOUTS = [[10, 'GOOD!', '#7dd3fc'], [25, 'GREAT!', '#86efac'], [50, 'AMAZING!', '#fde047'], [100, 'FANTASTIC!', '#fb923c'], [200, 'UNSTOPPABLE!', '#f472b6'], [400, 'LEGENDARY!', '#c4b5fd']];
const coins = [], confetti = [];
let inFlight = 0, dispScore = 0, scoreAt = null, bumpT = 0;
function scoreTarget() {
  if (!scoreAt) { const g = gameEl.getBoundingClientRect(), r = $('#hudScore').getBoundingClientRect(); scoreAt = { x: r.left - g.left + r.width / 2, y: r.top - g.top + r.height / 2 }; }
  return scoreAt;
}
function addCoin(x, y, val) {
  if (coins.length >= 40 || reduce) return false;
  const p = scr(wx(x), 2, wz(y)); if (p.z > 1) return false;
  coins.push({ x: p.x, y: p.y, sx: p.x, sy: p.y, t: 0, L: rnd(.45, .65), val, vx: rnd(-60, 60), vy: rnd(-140, -60) });
  inFlight += val; return true;
}
function addConfetti(n, x, y) {
  for (let i = 0; i < n; i++) confetti.push({ x: x ?? rnd(0, VW), y: y ?? rnd(-40, 0), vx: rnd(-160, 160), vy: y != null ? rnd(-420, -120) : rnd(40, 160), r: rnd(0, 6), vr: rnd(-10, 10), w: rnd(6, 11), h: rnd(3, 6), c: FXC.confetti[i % 6], t: rnd(1.4, 2.4) });
}
function bumpScore() {
  const n = performance.now(); if (reduce || n - bumpT < 90) return; bumpT = n;
  try { $('#hudScore').parentElement.animate([{ transform: 'scale(1.28)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'none' }], { duration: 220, easing: 'cubic-bezier(.22,.8,.24,1)' }); } catch (e) {}
}
const grpStat = new Map();
function drawOverlay(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (!G) return;
  const k = Math.min(1.25, VW / 360);
  // 적 무리 숫자 · 중간보스 체력 · 이름
  grpStat.clear();
  for (const M of G.mobs) { let s = grpStat.get(M.g); if (!s) grpStat.set(M.g, s = { sx: 0, n: 0, top: M }); s.sx += M.x; s.n++; if (M.y < s.top.y) s.top = M; }
  for (const q of G.groups) {
    if (q.giant) {
      const M = q.giant; if (M.y < SPAWN + 250 || M.dead) continue;
      const p = scr(wx(M.x), 8.4, wz(M.y));
      pill(p.x, p.y, String(Math.max(0, Math.ceil(M.hp))), 17 * k * (1 + M.flash * 3), '#a855f7', '#6b21a8');
      text(MID_NAME[M.mb] || '', p.x, p.y - 22 * k, 12 * k, '#fde68a', true);
      continue;
    }
    const st = grpStat.get(q);
    if (!st || st.top.y < SPAWN + 250) continue;
    const p = scr(wx(st.sx / st.n), 3.6, wz(st.top.y));
    pill(p.x, p.y, String(q.alive), 15 * k * (1 + q.pop * .3), '#f87171', '#b91c1c');
  }
  // 타이어 숫자
  for (const X of G.boxes) {
    const p = scr(wx(X.x), 1.25, wz(X.y) + 1.2); if (p.z > 1) continue;
    const near = Math.max(.55, Math.min(1.25, 1 + wz(X.y) / 90));
    text(String(Math.max(0, Math.ceil(X.hp))), p.x, p.y, 38 * k * near * (1 + X.pop * .2), '#fff', true);
    const q = scr(wx(X.x), 5.2, wz(X.y)); if (q.z < 1) pill(q.x, q.y, giftLabel(X.gift), 12 * k * near, '#fde047', '#d97706');   // 무엇을 주는지
  }
  // 내 부대 숫자
  if (G.n > 0) { const p = scr(wx(G.px), 0, squadR(G.n) * S * .8 + 1.4), py = Math.min(VH - 24, p.y); pill(clamp(p.x, 34, py > VH - 120 && !btnMsl.hidden ? VW - 118 : VW - 34), py, String(Math.round(G.shown)), 18 * k * (1 + squadPop * .25), '#60a5fa', '#1d4ed8'); }
  // 보스 체력: 화면 위쪽 큰 막대 + 이름 + 늦게 따라오는 흰 막대
  if (G.boss) {
    const K = G.boss, bw = Math.min(VW - 64, 320), x = VW / 2 - bw / 2, y = 128, f = Math.max(0, K.hp / K.max);
    K.ghost = K.ghost == null ? f : K.ghost > f ? Math.max(f, K.ghost - dt * .35) : f;
    ctx.fillStyle = 'rgba(15,23,42,.85)'; rr(x - 4, y - 4, bw + 8, 24, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; rr(x, y, bw * K.ghost, 16, 8); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + 16); g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#c81e1e');
    ctx.fillStyle = K.flash > 0 ? '#ffd0d0' : g; rr(x, y, bw * f, 16, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + 3, y + 2, Math.max(0, bw * f - 6), 5, 3); ctx.fill();
    ctx.textAlign = 'left'; ctx.font = `900 ${13 * k}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.lineJoin = 'round';
    const nm = bossName(G.L); ctx.strokeText(nm, x, y - 12); ctx.fillStyle = '#fecaca'; ctx.fillText(nm, x, y - 12);
    ctx.textAlign = 'right'; const hp = String(Math.max(0, Math.ceil(K.hp))); ctx.font = `900 ${(15 + K.pop * 4) * k}px ${FONT}`; ctx.strokeText(hp, x + bw, y - 12); ctx.fillStyle = '#fff'; ctx.fillText(hp, x + bw, y - 12);
  }
  // 떠오르는 글자: 큰 글자끼리 겹치면 먼저 뜬 것을 위로 밀어 올린다
  const boxes = [];
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]; t.t -= dt; t.h += (t.small ? 7 : 3) * dt;
    if (t.t <= 0) { texts.splice(i--, 1); continue; }
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i], life = t.t / t.L, p = scr(t.x, t.h, t.z);
    // 큰 글자는 투명해지며 탁해지지 않게, 작아지며 빠지고 맨 끝에만 사라진다
    ctx.globalAlpha = t.small ? Math.min(1, life * 2.6) : Math.min(1, t.t / .12);
    const fs = t.size * k * (t.small ? 1 + Math.max(0, life - .7) * 1.5 + (t.pop || 0) * .5 : elastic(1 - life) * (life < .3 ? .6 + life / .3 * .4 : 1));
    if (t.pop) t.pop = Math.max(0, t.pop - dt * 6); ctx.font = `900 ${fs}px ${FONT}`; const hw = ctx.measureText(t.s).width / 2 + 8;
    const top = G.boss ? 196 : 164, x = clamp(p.x, hw, VW - hw); let y = Math.max(top, p.y) - t.dy;
    if (!t.small) {
      const hh = t.size * k * .62;
      for (let tries = 0; tries < 6; tries++) { const hit = boxes.find(b => Math.abs(b.x - x) < b.w + hw && Math.abs(b.y - y) < b.h + hh); if (!hit) break; const want = hit.y - hit.h - hh - 2; t.dy += Math.min(40, (y - want)) * Math.min(1, dt * 14 + .2); y = Math.max(top, p.y) - t.dy; if (y > want) y = want; }
      if (y < top) { y = top; t.dy = Math.max(0, Math.max(top, p.y) - top); }   // 보스 체력 막대 위로는 못 올라간다
      boxes.push({ x, y, w: hw, h: hh });
    }
    text(t.s, x, y, fs, t.c, true);
  }
  ctx.globalAlpha = 1;
  // 콤보
  if (G.combo >= 3 && G.comboT > 0 && state === 'play' && !(bossWarn > 0)) {
    comboPop = Math.max(0, comboPop - dt * 5);
    const c = G.combo, cc = c >= 100 ? '#f472b6' : c >= 50 ? '#fb923c' : c >= 25 ? '#fde047' : '#ffffff';
    const x = VW - 16, y = 190, s = 1 + comboPop * .5, a = Math.min(1, G.comboT * 3);
    ctx.globalAlpha = a; ctx.textAlign = 'right';
    ctx.font = `900 ${34 * k * s}px ${FONT}`; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(c + '', x, y); ctx.fillStyle = cc; ctx.fillText(c + '', x, y);
    ctx.font = `900 ${13 * k}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText('COMBO', x, y + 22 * k); ctx.fillStyle = cc; ctx.fillText('COMBO', x, y + 22 * k);
    const bonus = '점수 ×' + (1 + Math.min(c, 100) * .02).toFixed(2); ctx.font = `800 ${11 * k}px ${FONT}`; ctx.strokeText(bonus, x, y + 38 * k); ctx.fillStyle = '#e2e8f0'; ctx.fillText(bonus, x, y + 38 * k);
    // 남은 시간 막대
    ctx.fillStyle = 'rgba(15,23,42,.6)'; rr(x - 60 * k, y + 47 * k, 60 * k, 4, 2); ctx.fill(); ctx.fillStyle = cc; rr(x - 60 * k, y + 47 * k, 60 * k * Math.min(1, G.comboT / 1.1), 4, 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 외침(GREAT! 등)
  if (shout) {
    shout.t -= dt; if (shout.t <= 0) shout = null;
    else { const a = 1 - shout.t / shout.L; ctx.globalAlpha = Math.min(1, shout.t * 3); ctx.save(); ctx.translate(VW / 2, shout.big ? VH * .4 : Math.max(250, VH * .33)); ctx.rotate(-.06); ctx.font = `900 ${46 * k}px ${FONT}`; const fit = Math.min(1, (VW - 36) / (ctx.measureText(shout.s).width + 46 * k * .5)); const s = (reduce ? 1 : Math.min(1, elastic(a))) * fit; ctx.scale(s, s); text(shout.s, 0, 0, (shout.big ? 46 : 34) * k, shout.c, true); if (shout.sub) text(shout.sub, 0, 36 * k, 15 * k, '#fff', true); ctx.restore(); ctx.globalAlpha = 1; }
  }
  // 동전: 처치한 자리에서 튀어 올랐다가 점수판으로 빨려 감
  const at = scoreTarget();
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i]; c.t += dt; const a = Math.min(1, c.t / c.L);
    if (a < .3) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt; c.sx = c.x; c.sy = c.y; }
    else { const e = (a - .3) / .7, q = e * e * (3 - 2 * e); c.x = c.sx + (at.x - c.sx) * q; c.y = c.sy + (at.y - c.sy) * q - Math.sin(e * Math.PI) * 40; }
    if (a >= 1) { coins.splice(i, 1); inFlight -= c.val; bumpScore(); SFX.coin(); continue; }
    const r = 7 * k * (1 + Math.sin(c.t * 18) * .08), sq = Math.abs(Math.cos(c.t * 10));
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.max(.25, sq), 1);
    ctx.fillStyle = '#b7791f'; ctx.beginPath(); ctx.arc(0, 1.5, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(-r * .3, -r * .3, 1, 0, 0, r); g.addColorStop(0, '#fff7c2'); g.addColorStop(.5, '#fcd34d'); g.addColorStop(1, '#f59e0b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * .62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 꽃가루
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i]; c.t -= dt; if (c.t <= 0 || c.y > VH + 20) { confetti.splice(i, 1); continue; }
    c.vy += 380 * dt; c.vx *= .99; c.vy = Math.min(c.vy, 220); c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(1, Math.cos(c.r * 1.7)); ctx.fillStyle = c.c; ctx.globalAlpha = Math.min(1, c.t * 2); ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
  }
  ctx.globalAlpha = 1;
  // 시작 안내: 스테이지 이름 · 보스
  if (banner > 0 && state === 'play') {
    banner -= dt; const st = STAGES[G.stage], a = Math.min(1, banner * 2, (bannerL - banner) * 4), y = Math.max(196, VH * .3), w = Math.min(310, VW - 32);
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 30); g.addColorStop(0, 'rgba(30,58,138,.92)'); g.addColorStop(1, 'rgba(15,23,42,.92)');
    ctx.fillStyle = g; rr(VW / 2 - w / 2, y - 30, w, 60, 16); ctx.fill(); ctx.strokeStyle = 'rgba(253,224,71,.8)'; ctx.lineWidth = 2; ctx.stroke();
    text('레벨 ' + G.L + ' · ' + st.name, VW / 2, y - 9, 20 * k, '#fde047', true);
    ctx.font = `800 ${12 * k}px ${FONT}`; ctx.fillStyle = '#fca5a5'; ctx.textAlign = 'center'; ctx.fillText('보스: ' + bossName(G.L), VW / 2, y + 15);
    const tw = G.twist && TWISTS[G.twist];
    if (tw) {   // 오늘의 변수: 판 아래 띠
      const ty = y + 50; ctx.fillStyle = 'rgba(8,47,73,.92)'; rr(VW / 2 - w / 2 + 14, ty - 17, w - 28, 34, 12); ctx.fill(); ctx.strokeStyle = 'rgba(125,211,252,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      text('오늘의 변수 · ' + tw.name, VW / 2, ty - 5, 13 * k, '#7dd3fc', true);
      ctx.font = `700 ${10.5 * k}px ${FONT}`; ctx.fillStyle = '#e0f2fe'; ctx.fillText(tw.sub, VW / 2, ty + 9);
    }
    ctx.globalAlpha = 1;
  }
  // 보스 등장 경고
  if (bossWarn > 0) {
    if (G.boss && G.boss.hp < G.boss.max) bossWarn = Math.min(bossWarn, .3);   // 첫 타격이 들어가면 바로 걷힌다
    bossWarn -= dt; const a = Math.min(1, bossWarn * 2, (2 - bossWarn) * 5), y = 186;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(127,29,29,.88)'; ctx.fillRect(0, y - 34, VW, 68);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - 34, VW, 68); ctx.clip();   // 위아래 노랑 · 검정 띠
    ctx.fillStyle = 'rgba(250,204,21,.9)'; const off = (T * 80) % 28;
    for (let i = -2; i < VW / 28 + 2; i++) { ctx.beginPath(); ctx.moveTo(i * 28 + off, y - 34); ctx.lineTo(i * 28 + off + 14, y - 34); ctx.lineTo(i * 28 + off + 4, y - 26); ctx.lineTo(i * 28 + off - 10, y - 26); ctx.fill(); ctx.beginPath(); ctx.moveTo(i * 28 + off, y + 26); ctx.lineTo(i * 28 + off + 14, y + 26); ctx.lineTo(i * 28 + off + 4, y + 34); ctx.lineTo(i * 28 + off - 10, y + 34); ctx.fill(); }
    ctx.restore();
    const s = 1 + Math.max(0, Math.sin(T * 10)) * .05;
    text('WARNING', VW / 2, y - 7, 26 * k * s, '#fde047', true);
    text(bossName(G.L) + ' 등장!', VW / 2, y + 14, 13 * k, '#fff', true);
    ctx.globalAlpha = 1;
  }
  if (tint) { tint.t -= dt; if (tint.t <= 0) tint = null; else { ctx.fillStyle = `rgba(${tint.c},${tint.t * .5})`; ctx.fillRect(0, 0, VW, VH); } }
  if (flashW > 0) { flashW -= dt; ctx.fillStyle = `rgba(255,255,255,${Math.max(0, flashW) * 2.2})`; ctx.fillRect(0, 0, VW, VH); }
}

/* ── 한 장면 그리기 ── */
let G = null, state = 'menu', last = 0, T = 0, slow = 0, endTimer = 0, walkT = 0, bossWarn = 0, bossSeen = false, squadPop = 0, lastN = 3;
const born = [];
const ME_SC = 1, EN_SC = 1;   // 꼬마 병사 크기(판정과 상관없이 보이는 크기만)   // 새로 늘어난 병사가 톡 튀어나오게(자리별 생긴 때)
const hooks = {
  // 새 대형이 나올 때: 작은 알림(큰 외침을 가리지 않게 — 이미 외침이 떠 있으면 생략)
  formation: name => { if (!shout || shout.t <= 0) shout = { s: name + '!', c: '#fecaca', t: 1.1, L: 1.1, sub: '' }; },
  // 대군 돌격 시작: 경고 외침 + 경보음
  horde: full => { shout = full ? { s: '총공격!', c: '#fca5a5', t: 2, L: 2, sub: '끝없이 밀려와요 · 천둥번개로 쓸어버려요!', big: true } : { s: '대군 돌격!', c: '#fca5a5', t: 2, L: 2, sub: '끝없이 밀려와요 · 양옆 문으로 버티세요!', big: true }; SFX.alarm(); buzz([40, 60, 40]); },
  bolt: (x, y) => fxBolt(x, y),
  // 진급: 큰 외침 + 꽃가루 + 병사들이 톡 튀어 오르며 새 모습 · 새 무기로 바뀐다
  promote: t => { shout = { s: 'LV' + (t + 1) + ' ' + TIERS[t].name + '!', c: t === 2 ? '#93c5fd' : '#fde047', t: 1.5, L: 1.5, sub: t === 2 ? '망토 · 금 갑옷 · 레이저 총' : '은 투구 · 방패 · 플라스마 총', big: true }; addConfetti(t === 2 ? 70 : 40, VW / 2, VH * .5); squadPop = 1; for (let i = 0; i < Math.min(G.n, 60); i++) born[i] = T + i * .008; },
  gateHit: (gt, p, x) => {
    SFX.gateTick(p.gain);
    for (let i = 0; i < 3; i++) addSpark(wx(x) + rnd(-.4, .4), rnd(1.5, 4), wz(gt.y) + .3, i ? '#bfefff' : '#ffffff', rnd(.7, 1.3), .14, rnd(-5, 5), rnd(1, 6), rnd(2, 6));
    if (p.t !== '+') {   // × · ÷ 문: 바뀐 값(×2.3 · ÷1.8)이 톡
      const ls = p.t === 'M' ? '-' + p.v : gateLabel(p);   // 유도탄 문은 줄어든 마이너스
      if (p.ftx && p.ftx.t > 0 && texts.includes(p.ftx)) { p.ftx.s = ls; p.ftx.t = p.ftx.L = .6; p.ftx.pop = 1; p.ftx.z = wz(gt.y); }
      else { p.ftx = { x: wx((p.x0 + p.x1) / 2), z: wz(gt.y), h: 5.4, s: ls, c: p.t === 'x' ? '#e0f7ff' : p.t === 'M' ? '#fef08a' : '#ffe4e6', size: 18, t: .6, L: .6, small: true, dy: 0, pop: 1 }; texts.push(p.ftx); }
      return;
    }
    // 칸마다 숫자 하나가 '+1 → +2 → +3' 으로 누적되며 톡 튄다(새 글자를 계속 만들지 않음)
    if (p.ftx && p.ftx.t > 0 && texts.includes(p.ftx)) { p.ftx.n++; p.ftx.s = '+' + p.ftx.n; p.ftx.t = p.ftx.L = .6; p.ftx.pop = 1; p.ftx.z = wz(gt.y); }
    else { p.ftx = { x: wx((p.x0 + p.x1) / 2), z: wz(gt.y), h: 5.4, s: '+1', n: 1, c: '#e0f7ff', size: 18, t: .6, L: .6, small: true, dy: 0, pop: 1 }; texts.push(p.ftx); }
  },
  blast: fxBlast, burst: fxBurst, spark: fxSpark, smoke: fxSmoke, float: fxFloat,
  ring: (x, y, kind) => fxRing(x, y, kind),
  sfx: n => SFX[n] && SFX[n](G ? G.tier : 0), buzz,
  shake: v => { if (!reduce) shake = Math.max(shake, v); },
  tint: c => { tint = { c: c === 'red' ? '239,68,68' : c === 'gold' ? '250,204,21' : '56,189,248', t: .35 }; },
  stop: s => { if (!reduce) hitstop = Math.max(hitstop, s); },
  // 적이 쓰러질 때: 날아가는 몸 + 동전 + 콤보 소리
  die: (M, pts) => {
    if (M.mb && !pts) { fxBurst(M.x, M.y, 'red', 12); fxSmoke(M.x, M.y, 4); tint = { c: '239,68,68', t: .35 }; return; }   // 부딪힘: 축하 없이 아픈 연출만
    if (M.mb) {
      fxBlast(M.x, M.y, 'gold'); fxBurst(M.x, M.y, 'gold', 30); fxRing(M.x, M.y, 'gold'); flashW = .12; kick = 1;
      for (let i = 0; i < 6; i++) if (!addCoin(M.x + rnd(-30, 30), M.y, pts / 6)) break;
      if (pts) fxFloat(M.x, M.y, '+' + fmt(pts), '#fde047', 30, false, 1.5);
      return;
    }
    fall(M.x, M.y, 1, M.lv || 0);
    if (pts) { SFX.kill(G ? G.combo : 0); if (!addCoin(M.x, M.y, pts)) bumpScore(); if (G && !G.boss && G.combo % 10 === 0) fxFloat(M.x, M.y, '+' + pts, '#fde68a', 15, true); }
  },
  pts: (x, y, pts, big) => {
    fxFloat(x, y - 30, '+' + fmt(pts), '#fde047', big ? 44 : 30);
    const n = big ? 14 : 5; for (let i = 0; i < n; i++) if (!addCoin(x + rnd(-40, 40), y + rnd(-20, 20), pts / n)) break;
    if (big) { addConfetti(90); flashW = .08; }
  },
  combo: (c) => {
    comboPop = 1;
    for (const [n, s, cc] of SHOUTS) if (c === n) { shout = { s, c: cc, t: 1.1, L: 1.1, sub: c + ' COMBO' }; SFX.cheer(); if (!G.boss) addConfetti(n >= 50 ? 40 : 18, VW / 2, VH * .35); buzz(30); }
  }
};
function render(dt) {
  T += dt; if (state !== 'menu' && state !== 'paused') walkT += dt * 11;
  beginSoldiers();
  if (G) {
    // 부대: 늘어난 병사는 톡 튀어나온다
    const pos = squadPos(G.n);
    if (G.n > lastN) { for (let i = Math.min(lastN, 60); i < Math.min(G.n, 60); i++) born[i] = T + (i - lastN) * .012; squadPop = 1; }
    lastN = G.n; squadPop = Math.max(0, squadPop - dt * 4);
    const rec = G.flash > 0 ? G.flash / .06 : 0;
    for (let i = 0; i < pos.length; i++) {
      const a = born[i] != null ? (T - born[i]) / .35 : 1, pop = a >= 1 ? 1 : a <= 0 ? 0 : 1 + 1.7 * Math.pow(a - 1, 3) + .7 * Math.pow(a - 1, 2);
      soldier(wx(G.px + pos[i][0]), wz(pos[i][1]), 0, ME_SC, walkT + i * .7, 0, G.tier, 0, { pop: Math.max(.01, pop), recoil: rec });
    }
    for (const M of G.mobs) { if (M.y < SPAWN + 20 || M.mb) continue; soldier(wx(M.x), wz(M.y), 0, M.size * EN_SC, M.step, 1, M.lv || 0, M.flash); }
    updateBodies(dt);
    // 총알
    let b = 0; const st = BSTYLE[TIERS[G.tier].bullet], cq = camera.quaternion;
    for (const B of G.bullets) {
      if (b >= BCAP) break;
      const grow = Math.min(1, (B.y0 - B.y) / 60), ang = -Math.atan2(B.vx, 1150);
      E.set(0, ang, 0); Q.setFromEuler(E);
      M4.compose(V.set(wx(B.x), 1.25, wz(B.y)), Q, SC.set(st.w, 1, (.3 + grow * .7) * st.l)); bullets.setMatrixAt(b, M4); bullets.setColorAt(b, st.c);
      M4.compose(V.set(wx(B.x), 1.25, wz(B.y)), cq, SC.setScalar(st.hs * (G.tier === 1 ? 1 + Math.sin(T * 40 + b) * .15 : 1))); heads.setMatrixAt(b, M4); heads.setColorAt(b, st.head);
      b++;
    }
    bullets.count = heads.count = b;
    for (const m of [bullets, heads]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // 보스 탄: 3겹 원판, 살짝 맥동
    let oc = 0; const pulse = 1 + Math.sin(T * 14) * .08;
    for (const o of (G.orbs || [])) {
      if (oc >= OCAP) break;
      const C2 = ORBC[o.c] || ORBC.o, s = o.r * S * 2 * pulse;
      M4.compose(V.set(wx(o.x), 1.4, wz(o.y)), cq, SC.setScalar(s * 1.5)); orbRim.setMatrixAt(oc, M4); orbRim.setColorAt(oc, C2.rim);
      M4.compose(V.set(wx(o.x), 1.45, wz(o.y)), cq, SC.setScalar(s * 1.15)); orbBody.setMatrixAt(oc, M4); orbBody.setColorAt(oc, C2.body);
      M4.compose(V.set(wx(o.x), 1.5, wz(o.y)), cq, SC.setScalar(s * .5)); orbCore.setMatrixAt(oc, M4); orbCore.setColorAt(oc, WHITE);
      oc++;
    }
    orbRim.count = orbBody.count = orbCore.count = oc;
    for (const m of [orbRim, orbBody, orbCore]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // 총구 불꽃 · LV3 레이저 고리
    if (G.flash > .05 && state === 'play') {
      const m = Math.min(pos.length, 10), fc = G.tier === 2 ? '#c4a8ff' : G.tier === 1 ? '#7fd0ff' : '#ffd36a';
      for (let i = 0; i < m; i++) addSpark(wx(G.px + pos[i][0]) + .26, 1.3, wz(pos[i][1]) - 1.2, fc, rnd(.9, 1.5) * (1 + G.tier * .2), .06, 0, 0, -8);
      if (G.tier === 2 && !reduce) for (let i = 0; i < Math.min(3, pos.length); i++) fxRing(G.px + pos[i][0] + 2.6, pos[i][1] - 16, 'laser', true);
    }
    syncViews(dt);
    // 보스 등장 알림
    if (G.boss && !bossSeen) { bossSeen = true; bossWarn = 2; SFX.alarm(); buzz([40, 60, 40]); }
  } else bullets.count = heads.count = orbRim.count = orbBody.count = orbCore.count = 0;
  flushSoldiers();
  updateFx(dt); updateRings(dt); updateBlasts(dt); updateBolts(dt);
  shake = Math.max(0, shake - dt);
  placeCamera(shake * 1.6, dt);
  renderer.render(scene, camera);
  drawOverlay(dt);
}

/* ── 조작 ── */
let dragX = null, dragTx = 0, dragId = null;   // 손가락 하나만 따라간다(두 번째 손가락은 무시)
cv.addEventListener('pointerdown', e => { audio(); if (state !== 'play' || dragId !== null) return; dragId = e.pointerId; dragX = e.clientX; dragTx = G.tx; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', e => { if (e.pointerId !== dragId || state !== 'play') return; G.tx = dragTx + (e.clientX - dragX) / VW * (ROAD_R - ROAD_L) * 1.25; });
const up = e => { audio(); if (e.pointerId === dragId) { dragX = null; dragId = null; } };
cv.addEventListener('lostpointercapture', up);
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const keys = {};
const LR = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
let endAt = 0;   // 끝 카드가 뜬 때 — 쏘던 스페이스가 그대로 '다시 시작'이 되지 않게 잠깐 막는다
addEventListener('keydown', e => {
  audio();
  if (LR[e.code] && !(e.target && e.target.tagName === 'INPUT')) { keys[e.code] = true; e.preventDefault(); }
  if (e.target && /^(INPUT|BUTTON)$/.test(e.target.tagName) && state !== 'play') { if (state === 'end' && e.target.tagName === 'BUTTON' && (e.repeat || performance.now() - endAt < 800 || rankLoading)) e.preventDefault(); return; } // 이름 넣는 중 · 버튼 위에서는 그 요소가 받는다
  if ((e.code === 'Space' || e.code === 'KeyM') && state === 'play') { e.preventDefault(); if (!e.repeat) shootMissile(); return; }
  if ((e.key === 'Enter' || e.code === 'Space') && state === 'paused') { e.preventDefault(); if (!e.repeat) resumeGo(); return; }
  if ((e.key === 'Enter' || e.code === 'Space') && (state === 'menu' || state === 'end')) {
    e.preventDefault();
    if (e.repeat || (state === 'end' && (performance.now() - endAt < 800 || rankLoading))) return;
    start();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const btnMsl = $('#btnMsl');
function shootMissile() {
  if (state === 'play' && G && !G.missiles) { try { btnMsl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); } catch (e) {} if (!(T - (shootMissile.tip || -9) < 2)) { shootMissile.tip = T; fxFloat(G.px, -60, '금색 문 · 타이어에서 얻어요', '#e2e8f0', 18); } return; }
  if (state === 'play' && G && fireMissile(G)) { syncHud(); try { btnMsl.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'cubic-bezier(.22,.8,.24,1)' }); } catch (e) {} } }
btnMsl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); shootMissile(); });
btnMsl.addEventListener('pointerup', () => audio());
btnMsl.addEventListener('click', e => { if (e.detail === 0) shootMissile(); });   // 키보드(Enter)로 누를 때

/* ── 흐름 ── */
const dbg = /[?&]debug/.test(location.search), botMem = {};
function loop(t) {
  const real = Math.min(.25, (t - last) / 1000 || 0);
  let dt = Math.min(.033, real); last = t; adaptRes(real);   // 끝 카드까지 기다리는 시간은 느린 화면과 상관없이 실제 시간으로
  if (slow > 0) { slow -= dt; dt *= .3; }
  let sdt = dt;
  if (hitstop > 0) { hitstop -= dt; sdt = dt * .06; }
  if (state === 'play') {
    const k = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0);
    if (k) G.tx += k * 340 * dt;
    if (dbg && window.__ls.auto) autoAim(G, 1, sdt, botMem);
    const before = G.dist;
    step(G, sdt);
    moveEnv((G.dist - before) * S, sdt);
    if (G.over === 1) { state = 'dying'; slow = 1.2; endTimer = 2.2; commitWin(); clearBurst(); }
    else if (G.over === -1) { state = 'dying'; endTimer = .9; }
    syncHud(dt);
    snapTimer += real; if (snapTimer >= 4) { snapTimer = 0; saveSnap(); }
  } else if (state === 'dying') {
    endTimer -= real; syncHud(dt); if (endTimer <= 0) end(G.over === 1);
  } else if (state === 'menu') moveEnv(4 * dt, dt);
  else if (env) env.update(envZ / ES, T, dt);
  render(state === 'play' ? sdt : dt);
  requestAnimationFrame(loop);
}
// 보스를 쓰러뜨린 순간 바로 저장(연출 중에 새로고침해도 클리어가 사라지지 않게)
function commitWin() {
  const bonus = 500 * G.L + G.n * 5;   // 레벨 클리어 보너스 + 남은 부대
  run += G.score + bonus; save('lastshot_run', run);
  level++; save('lastshot_level', level);
  if (level > best) { best = level; save('lastshot_best', best); }
  save('lastshot_live', 0); G.committed = bonus;
  clearSnap(); pushProgress({ state: null });
  fxFloat(G.px, -80, '클리어 보너스 +' + fmt(bonus), '#fde047', 26);
}
function clearBurst() {   // 보스를 쓰러뜨렸을 때: 꽃가루 · CLEAR 외침
  for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t < texts[i].L - .05) texts.splice(i, 1);   // 방금 뜬 처치 점수만 남기고 비운다
  tint = null; flashW = Math.min(flashW, .08);
  shout = { s: 'STAGE CLEAR!', c: '#fde047', t: 1.8, L: 1.8, sub: '레벨 ' + G.L, big: true }; addConfetti(140); SFX.cheer();
}
let moneyNext = false;   // 다음 판을 'Show me the money' 로 시작
function start() {
  audio();
  if (!user && !dbg) { front(); return; }   // 회원가입(로그인)해야 게임이 나온다
  if (pending) { showResume(); resumeGo(); return; }   // '이어서 하기' 버튼: 저장된 판을 바로 이어서
  pushSub();
  $('#ovAuth').hidden = true; $('#ovStart').hidden = true; $('#ovResume').hidden = true; $('#ovEnd').hidden = true; $('#ovRank').hidden = true;
  clearViews(); texts.length = 0; coins.length = 0; confetti.length = 0; bodies.length = 0; inFlight = 0; shout = null; bossWarn = 0; bossSeen = false;
  born.length = 0; lastN = 3; squadPop = 0; hitstop = 0; dragId = null; dragX = null; scoreAt = null; slow = 0; kick = 0; tint = null; flashW = 0; shake = 0; comboPop = 0;
  save('lastshot_live', 1);   // 판 도중 새로고침 = 쓰러진 것으로(누적 점수를 지키려는 새로고침 막기)
  const fails = load('lastshot_fail_lv', 0) === level ? load('lastshot_fails', 0) : 0;
  const money = moneyNext; moneyNext = false;
  G = newGame(level, hooks, { help: fails, money, diff }); state = 'play'; setTheme((G.L - 1) % 5); banner = bannerL = G.twist ? 2.6 : 1.9; dispScore = score(); syncHud(0);
  btnMsl.hidden = false; snapTimer = 0;
  clearSnap(); pushProgress({ state: null });   // 레벨 시작 저장(누적 점수 · 레벨 · 난이도)
  if (G.money) setTimeout(() => { if (G && state === 'play') { shout = { s: 'SHOW ME THE MONEY!', c: '#fde047', t: 1.8, L: 1.8, sub: '병사 ' + G.n + '명 · 유도탄 ' + G.missiles + '발', big: true }; SFX.promote(); addConfetti(60); } }, 2700);
  else if (G.help) setTimeout(() => { if (G && state === 'play') { shout = { s: '지원군 도착!', c: '#86efac', t: 1.6, L: 1.6, sub: '유도탄 ' + G.missiles + '발 · 병사 +' + G.help * 8 + ' · 적이 줄었어요' }; SFX.power(); } }, 2700);
}
function countUp(el, to, ms = 900) {
  const from = 0, t0 = performance.now();
  if (reduce) { el.textContent = fmt(to); return; }
  const tick = n => { const a = Math.min(1, (n - t0) / ms), e = 1 - Math.pow(1 - a, 3); el.textContent = fmt(from + (to - from) * e); if (a < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
// 졌을 때 장부: 같은 레벨에서 연속으로 진 횟수(지원군) · 누적 점수는 0 부터 · 계정에 저장(스냅샷은 지움)
function loseBook() {
  const f = load('lastshot_fail_lv', 0) === G.L ? load('lastshot_fails', 0) : 0; save('lastshot_fail_lv', G.L); save('lastshot_fails', f + 1);
  lastFinal = run + G.score; run = 0; save('lastshot_run', 0);
  clearSnap(); pushProgress({ state: null });
}
function end(win) {
  if (win) save('lastshot_fails', 0); else loseBook();
  state = 'end'; btnMsl.hidden = true; endAt = performance.now(); save('lastshot_live', 0);
  inFlight = 0; coins.length = 0;
  const btn = $('#btnNext');
  $('#rankBox').hidden = true; $('#moneyBox').hidden = win; $('#moneyMsl').textContent = moneyMissiles(diff) + '발';
  // 'Show me the money' 다시 시작할 난이도 — 끝 화면의 랭킹 탭(목록만 바꿈)을 난이도로 알고 누르는 일이 있어 여기서 직접 고르게 (사용자 지시 2026-11-11)
  if (!win) { if (!moneySeg) moneySeg = seg($('#moneySeg'), DIFF_ITEMS, diff, pickDiff); else moneySeg.set(diff, true); }
  if (win) {
    const bonus = G.committed || 0;
    $('#endKicker').textContent = 'STAGE CLEAR'; $('#endTitle').textContent = `레벨 ${level - 1} 클리어!`;
    $('#endSub').innerHTML = [`남은 부대 ${G.n}명`, G.bestCombo >= 3 ? `최고 콤보 ${G.bestCombo}` : '', `보너스 +${fmt(bonus)}`].filter(Boolean).map(s => `<span class="nw">${s}</span>`).join(' · ');
    $('#endScoreBox').hidden = false; countUp($('#endScore'), run);
    btn.textContent = `레벨 ${level} 시작`; btn.classList.remove('red'); SFX.win();
  } else {
    $('#endKicker').textContent = 'GAME OVER'; $('#endTitle').textContent = '부대가 쓰러졌어요';
    const pct = Math.min(100, Math.round(prog() * 100));
    $('#endSub').innerHTML = [`레벨 ${level} · ${pct}%까지`, G.bestCombo >= 3 ? `최고 콤보 ${G.bestCombo}` : ''].filter(Boolean).map(s => `<span class="nw">${s}</span>`).join(' · ');
    $('#endScoreBox').hidden = true;
    btn.textContent = '다시 도전'; btn.classList.add('red'); SFX.lose(); buzz(200);
    showRank(lastFinal, level, G.diff);
  }
  $('#ovEnd').hidden = false; syncHud(0);
  if (!touchy()) setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 50);
}
/* ── 알약 segmented control(난이도 · 랭킹 탭): 떠 있는 배경 하나가 고른 칸으로 미끄러진다(CLAUDE.md 5번). 한 번 그리고 .on 만 바꾼다 ── */
function seg(box, items, value, onPick) {
  box.innerHTML = '<i class="seg-ind" aria-hidden="true"></i>' + items.map(([v, l]) => `<button type="button" role="tab" data-v="${v}" aria-selected="${v === value}" class="${v === value ? 'on' : ''}">${l}</button>`).join('');
  const ind = box.firstElementChild; let last = null;
  const sync = jump => {   // 숨겨져 있어 폭을 못 재면 has-ind 를 빼서 칸 자체 배경으로, 보이게 되면 다시 잰다
    const on = box.querySelector('button.on'), ok = !!(on && on.offsetWidth);
    box.classList.toggle('has-ind', ok); if (!ok) return;
    const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const still = jump || !last || reduce;
    if (still) ind.style.transition = 'none';
    ind.style.width = to.w + 'px'; ind.style.height = to.h + 'px'; ind.style.transform = `translate(${to.x}px, ${to.y}px)`;
    if (still) { void ind.offsetWidth; ind.style.transition = ''; }
    last = to;
  };
  const set = (v, silent) => {
    box.querySelectorAll('button[data-v]').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    box.dataset.v = v; sync(!!silent);
    if (!silent) onPick(v);   // 배경이 먼저 움직인 뒤 자료가 뒤따른다
  };
  box.dataset.v = value;
  box.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b || b.classList.contains('on')) return; set(b.dataset.v); });
  addEventListener('resize', () => sync(true));
  if (document.fonts) document.fonts.ready.then(() => sync(true));
  requestAnimationFrame(() => sync(true));
  return { set, sync, get value() { return box.dataset.v; } };
}
const DIFF_ITEMS = Object.entries(DIFFS).map(([k, d]) => [k, d.name]);

/* ── 계정: 가입 · 로그인(라스트샷 Worker 자체 계정, 쿠키 ls_sess). 로그인하면 진행(레벨 · 최고 · 난이도)은 서버 값, localStorage 는 캐시 ── */
let user = null;
async function api(path, method = 'GET', body) {
  let r;
  try { r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' }); }
  catch (e) { throw Object.assign(new Error('서버와 연결하지 못했어요. 인터넷을 확인해 주세요.'), { status: 0 }); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(out.error || '서버 오류가 났어요.'), { status: r.status, out });
  return out;
}
const diffSeg = seg($('#diffSeg'), DIFF_ITEMS, diff, v => { diff = v; save('lastshot_diff', v); if (pending) { run = 0; save('lastshot_run', 0); clearSnap(); pushProgress({ state: null }); } else pushProgress(); syncHud(0); });
let moneySeg = null;
function pickDiff(v) { diff = v; save('lastshot_diff', v); diffSeg.set(v, true); $('#moneyMsl').textContent = moneyMissiles(v) + '발'; pushProgress(); }   // 끝 화면(머니)에서 고른 난이도 = 시작 화면 난이도와 같은 값   // 이어할 판이 있는데 난이도를 바꾸면 그 판은 버리고 새 판(누적 점수 0 부터)
function applyMe(me) {
  user = me; level = me.level || 1; best = Math.max(level, me.best || 1); diff = diffOf(me.diff); run = me.run || 0;
  save('lastshot_level', level); save('lastshot_best', best); save('lastshot_diff', diff); save('lastshot_name', me.nickname); save('lastshot_run', run);
  save('lastshot_fail_lv', me.fail_lv || 0); save('lastshot_fails', me.fails || 0);
  pending = dbg ? null : pickSnap(me.state); resumeFresh = !!pending; if (pending) { diff = diffOf(pending.diff); run = pending.run || 0; save('lastshot_run', run); } paintStart();
  diffSeg.set(diff, true); $('#whoNick').textContent = me.nickname;
  if (state === 'menu') { G = preview(); lastN = G.n; }
  syncHud(0);
}
let pushing = null;
const progBody = () => ({ level, best, diff, run, fail_lv: load('lastshot_fail_lv', 0), fails: load('lastshot_fails', 0) });
function pushProgress(extra) {   // 레벨 시작 · 클리어 · 패배 · 처음부터 · 난이도 바꿀 때 — 실패해도 게임은 계속(다음 저장 때 같이 올라간다). extra.state = null 이면 스냅샷 지움
  if (!user) return;
  pushing = api('/api/progress', 'PUT', Object.assign(progBody(), extra || {})).catch(e => { if (e.status === 401) user = null; });
}
/* ── 판 중간 저장(스냅샷): 로그인한 사람만. 4초마다 · 화면을 떠날 때 localStorage + 서버(state). 다시 열면 둘 중 새것으로 이어서 ── */
const SNAP_V = 1, SNAP_MAX = 100000;
let pending = null, snapTimer = 0, resumeFresh = false;   // pending = 이어할 판 { v, L, diff, run, t, G }. resumeFresh = 방금 불러온 것(바로 일시정지 화면으로)
const makeSnap = () => ({ v: SNAP_V, L: G.L, diff: G.diff, run, t: Date.now(), G: snapshot(G) });
function saveSnap(leaving) {
  if (state !== 'play' || !G || G.over || !user || dbg) return null;
  let snap, js;
  try { snap = makeSnap(); js = JSON.stringify(snap); } catch (e) { return null; }
  if (js.length > SNAP_MAX) return null;   // 너무 크면 이번엔 건너뛴다(100KB 상한)
  try { localStorage.setItem('lastshot_snap', js); } catch (e) {}
  const body = JSON.stringify(Object.assign(progBody(), { state: js }));
  try { fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, credentials: 'same-origin', keepalive: !!leaving && body.length < 60000 }).catch(() => {}); } catch (e) {}
  return snap;
}
function clearSnap() { pending = null; try { localStorage.removeItem('lastshot_snap'); } catch (e) {} paintStart(); }
function pickSnap(serverState) {   // 서버 · 이 브라우저 중 새것. 레벨이 서버 진행과 다르면(다른 기기에서 깼으면) 버린다
  const parse = v => { try { const o = typeof v === 'string' ? JSON.parse(v) : null; return o && o.v === SNAP_V && o.G && o.G.L && o.G.over === 0 ? o : null; } catch (e) { return null; } };
  const a = parse(serverState), b = parse(loadS('lastshot_snap', ''));
  const p = !a ? b : !b ? a : b.t > a.t ? b : a;
  return p && p.L === level ? p : null;
}
function paintStart() {
  const p = pending; $('#btnStart').textContent = p ? `이어서 하기 · 레벨 ${p.L} · 점수 ${fmt(p.run + (p.G.score || 0))}` : '시작하기';
  $('#btnGiveUp').hidden = !p;
}
// 저장된 판을 그 상태로 세워 놓고 일시정지 화면(손가락 한 번 = 소리 허가)
function showResume() {
  const p = pending; let g;
  try { g = restore(JSON.parse(JSON.stringify(p.G)), hooks); } catch (e) { clearSnap(); pushProgress({ state: null }); front(); return; }
  pushSub();
  clearViews(); texts.length = 0; coins.length = 0; confetti.length = 0; bodies.length = 0; inFlight = 0; shout = null; bossWarn = 0;
  born.length = 0; squadPop = 0; hitstop = 0; dragId = null; dragX = null; scoreAt = null; slow = 0; kick = 0; tint = null; flashW = 0; shake = 0; comboPop = 0;
  G = g; run = p.run; save('lastshot_run', run); lastN = G.n; bossSeen = !!G.boss; state = 'paused'; setTheme((G.L - 1) % 5); banner = 0; dispScore = score(); syncHud(0);
  btnMsl.hidden = true;
  $('#resumeSub').textContent = `레벨 ${G.L} · 점수 ${fmt(score())} · 진행 ${Math.round(prog() * 100)}%`;
  for (const id of ['#ovAuth', '#ovStart', '#ovEnd', '#ovRank']) $(id).hidden = true;
  $('#ovResume').hidden = false;
  if (!touchy()) setTimeout(() => { try { $('#btnResume').focus({ preventScroll: true }); } catch (e) {} }, 50);
}
function resumeGo() {   // 계속: 스냅샷을 지우고 새로 저장 시작
  if (state !== 'paused') return;
  audio(); $('#ovResume').hidden = true; state = 'play'; btnMsl.hidden = false; save('lastshot_live', 1); snapTimer = 0;
  clearSnap(); pushProgress({ state: null });
}
function giveUp() {   // 이 판 포기: 누적 점수는 0 부터(판 도중에 그만두면 이어 온 점수는 끊긴다 — 새로고침 꼼수 막기와 같은 규칙)
  run = 0; save('lastshot_run', 0); clearSnap(); pushProgress({ state: null }); home();
}
/* ── 뒤로가기: 하위 화면(게임 · 랭킹 · 끝 · 이어하기)에 들어갈 때 history 를 하나 쌓고, 뒤로가기면 그 화면을 닫고 시작 화면으로. 시작 화면에서 한 번 더면 평소처럼 나간다 ── */
let sub = false, popping = 0;
function pushSub() { if (sub || dbg) return; try { history.pushState({ ls: 1 }, ''); sub = true; } catch (e) {} }
function popSub() { if (!sub) return; sub = false; popping = performance.now(); try { history.back(); } catch (e) { popping = 0; } }
addEventListener('popstate', () => {
  if (popping && performance.now() - popping < 1500) { popping = 0; return; }   // 프로그램이 닫은 것
  popping = 0; if (!sub) return; sub = false; backHome();
});
function backHome() {
  if (state === 'play' && G && !G.over) { const p = saveSnap(true); if (p) pending = p; }   // 판 중간: 스냅샷을 남기고 시작 화면에 '이어서 하기'
  else if (state === 'dying' && G && G.over === -1) loseBook();   // 지는 연출 중에 나가면 진 것으로
  else if (state === 'paused') { /* 이어하기 화면에서 뒤로: 그대로 pending 으로 남긴다 */ }
  home();
}
// 첫 화면 고르기: 로그인돼 있으면 시작 화면, 아니면 가입 · 로그인(디버그는 건너뜀)
function front() {
  $('#ovEnd').hidden = true; $('#ovRank').hidden = true; $('#ovResume').hidden = true;
  const ok = !!user || dbg;
  if (ok && pending && resumeFresh) { resumeFresh = false; showResume(); return; }   // 로그인 직후(처음 열 때): 저장된 판을 그 자리에서. 뒤로가기로 온 시작 화면에서는 버튼으로만
  if (ok) { paintStart(); if (pending) diffSeg.set(diff, true); }
  $('#ovStart').hidden = !ok; $('#ovAuth').hidden = ok;
  if (ok) requestAnimationFrame(() => diffSeg.sync(true)); else requestAnimationFrame(() => authSeg.sync(true));
}
const authForm = $('#authForm'), authId = $('#authId'), authNick = $('#authNick'), authPw = $('#authPw'), authMsg = $('#authMsg'), authBtn = $('#authSubmit');
authNick.value = randName();
$('#btnDice').addEventListener('click', () => { authNick.value = randName(); });
// 비밀번호 눈 버튼: 가입 · 로그인 둘 다 — 입력한 글자를 보이게 / 다시 가리게. 끝(로그인 성공 · 모드 바꿈)에는 다시 가린다
const btnEye = $('#btnEye');
function showPw(on) { authPw.type = on ? 'text' : 'password'; btnEye.setAttribute('aria-pressed', on ? 'true' : 'false'); btnEye.title = btnEye.ariaLabel = on ? '비밀번호 가리기' : '비밀번호 보이기'; }
btnEye.addEventListener('mousedown', e => e.preventDefault());   // 누를 때 입력칸 포커스(폰 키보드)가 닫히지 않게
btnEye.addEventListener('click', () => { const on = authPw.type === 'password'; showPw(on); try { const n = authPw.value.length; authPw.setSelectionRange(n, n); } catch (_) {} });
function setAuthMode(v) {
  authForm.dataset.mode = v; $('#authNickRow').hidden = v !== 'signup';
  authBtn.textContent = v === 'signup' ? '가입하고 시작' : '로그인'; authMsg.textContent = ''; authMsg.classList.remove('ok');
  authPw.setAttribute('autocomplete', v === 'signup' ? 'new-password' : 'current-password'); showPw(false);
}
const authSeg = seg($('#authSeg'), [['signup', '회원가입'], ['login', '로그인']], 'signup', setAuthMode);
authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const mode = authForm.dataset.mode, id = authId.value.trim(), nick = authNick.value.replace(/\s+/g, ' ').trim().slice(0, 10), pw = authPw.value;
  const fail = (m, el) => { authMsg.textContent = m; authMsg.classList.remove('ok'); if (el) try { el.focus(); } catch (_) {} };
  if (id.length < 3) return fail('아이디(또는 이메일)를 3자 이상 넣어 주세요.', authId);
  if (!/^[A-Za-z0-9._@+-]+$/.test(id)) return fail('아이디는 영문 · 숫자 · . _ @ + - 만 쓸 수 있어요.', authId);
  if (mode === 'signup' && !nick) return fail('닉네임을 넣어 주세요(10자까지).', authNick);
  if (pw.length < 6) return fail('비밀번호는 6자 이상으로 넣어 주세요.', authPw);
  authBtn.disabled = true; authMsg.classList.add('ok'); authMsg.textContent = mode === 'signup' ? '가입하는 중…' : '로그인하는 중…';
  try {
    // 가입: 이 브라우저에서 이미 하던 진행(레벨 · 최고)이 있으면 계정의 시작 진행으로 올린다
    const remember = $('#authKeep').checked, body = mode === 'signup' ? { login_id: id, nickname: nick, password: pw, level, best, diff, remember } : { login_id: id, password: pw, remember };
    const me = await api(mode === 'signup' ? '/api/signup' : '/api/login', 'POST', body);
    authPw.value = ''; showPw(false); authMsg.textContent = '';
    applyMe(me); front();
    if (!touchy()) setTimeout(() => { try { $('#btnStart').focus({ preventScroll: true }); } catch (_) {} }, 50);
  } catch (err) { fail(err.message, err.status === 409 ? authId : err.status === 401 ? authPw : null); }
  finally { authBtn.disabled = false; }
});
$('#btnLogout').addEventListener('click', async () => {
  try { if (pushing) await pushing; await api('/api/logout', 'POST'); } catch (e) {}
  // 다음 사람이 같은 폰으로 가입할 때 내 진행이 넘어가지 않게 캐시를 비운다
  user = null; level = 1; best = 1; run = 0; save('lastshot_level', 1); save('lastshot_best', 1); save('lastshot_run', 0); clearSnap();
  authSeg.set('login', false); authId.value = ''; authPw.value = '';
  G = preview(); lastN = G.n; syncHud(0); front();
});
$('#btnRankAuth').addEventListener('click', openRank);

/* ── 랭킹: 난이도마다 1~50위 (서버: /api/rank?diff=) ── */
const TOP = 50;
let rankMine = 0, rankLoading = false, rankAllSeg = null, rankEndSeg = null, rankReq = 0;
const escH = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
function rankRows(list, box) {
  box.innerHTML = list.length
    ? list.map((r, i) => `<li${r.id === rankMine ? ' class="me"' : ''}><b>${i + 1}</b><span class="nm">${escH(r.name)}</span><span class="lv">LV ${r.level}</span><span class="sc">${fmt(r.score)}</span></li>`).join('')
    : '<li class="none">아직 기록이 없어요. 첫 주인공이 되어 보세요!</li>';
  const me = box.querySelector('li.me'); if (me) try { me.scrollIntoView({ block: 'nearest' }); } catch (e) {}
}
async function getRank(d) {
  const r = await fetch('/api/rank?diff=' + encodeURIComponent(d), { cache: 'no-store' });
  if (!r.ok) throw new Error();
  return (await r.json()).top || [];
}
// 탭을 누르면 그 난이도 목록만 바꿔 넣는다(늦게 온 옛 응답은 버림)
async function loadRank(d, list) {
  list.innerHTML = '<li class="none">불러오는 중…</li>';
  const my = ++rankReq;
  try { const top = await getRank(d); if (my === rankReq) rankRows(top, list); }
  catch (e) { if (my === rankReq) list.innerHTML = '<li class="none">랭킹을 불러오지 못했어요.</li>'; }
}
async function showRank(final, lv, d) {
  const box = $('#rankBox'), list = $('#rankList'), msg = $('#rankMsg');
  box.hidden = false; msg.textContent = '랭킹 불러오는 중…';
  countUp($('#rankScore'), final); list.innerHTML = '';
  if (!rankEndSeg) rankEndSeg = seg($('#rankSegEnd'), DIFF_ITEMS, d, v => loadRank(v, list)); else rankEndSeg.set(d, true);
  requestAnimationFrame(() => rankEndSeg.sync(true));
  let top; const my = ++rankReq;
  rankLoading = true;
  try { top = await getRank(d); } catch (e) { msg.textContent = '랭킹을 불러오지 못했어요.'; return; } finally { rankLoading = false; }
  if (state !== 'end') return;
  if (my === rankReq) rankRows(top, list);
  const ok = final > 0 && (top.length < TOP || final > top[top.length - 1].score);
  if (!ok) { msg.textContent = final > 0 ? `${TOP}위 안에 들려면 조금 더! 다시 도전해 보세요.` : ''; return; }
  const place = top.filter(r => r.score >= final).length + 1, dn = DIFFS[d].name;
  if (!user) { msg.textContent = `${dn} ${place}위 기록!` + (dbg ? ' (디버그: 등록 안 함)' : ' 로그인하면 랭킹에 올라가요.'); return; }
  // 계정 닉네임으로 바로 등록(이름 칸 없음)
  msg.textContent = `${dn} ${place}위 기록! 올리는 중…`;
  rankLoading = true;
  try {
    const out = await api('/api/rank', 'POST', { score: final, level: lv, diff: d });
    if (state !== 'end') return;
    rankMine = out.id; ++rankReq; rankEndSeg.set(d, true); rankRows(out.top, list);
    msg.textContent = `${dn} ${out.rank}위에 이름을 올렸어요!`; SFX.win();
  } catch (err) {
    if (err.status === 401) user = null;
    if (err.out && err.out.top && state === 'end') { ++rankReq; rankEndSeg.set(d, true); rankRows(err.out.top, list); }
    msg.textContent = err.message || '등록하지 못했어요.';
  } finally { rankLoading = false; }
}
async function openRank() {
  pushSub();
  $('#ovStart').hidden = true; $('#ovAuth').hidden = true; $('#ovRank').hidden = false;
  const list = $('#rankAll');
  if (!rankAllSeg) rankAllSeg = seg($('#rankSegAll'), DIFF_ITEMS, diff, v => loadRank(v, list)); else rankAllSeg.set(diff, true);
  requestAnimationFrame(() => rankAllSeg.sync(true));
  loadRank(diff, list);
  if (!touchy()) setTimeout(() => { try { $('#btnRankClose').focus({ preventScroll: true }); } catch (e) {} }, 50);
}

function preview() { setTheme((level - 1) % 5); const g = newGame(level, {}, { diff }); step(g, 0); g.mobs.forEach(m => { m.flash = 0; }); return g; }
function home() { popSub(); state = 'menu'; clearViews(); bodies.length = 0; G = preview(); lastN = G.n; btnMsl.hidden = true; front(); syncHud(0); }
const prog = () => G ? Math.max(0, Math.min(1, (G.dist - G.ev[0].d - 680) / (G.length - 680))) : 0;
let hudPowTxt = '', hudMsl = -1;
const hudCache = {};
function setT(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function syncHud(dt) {
  const playing = G && state !== 'menu';
  setT('#hudLv', String(playing ? G.L : level));
  setT('#hudBest', String(best));
  const dv = playing ? G.diff : diff; if (hudCache.diff !== dv) { hudCache.diff = dv; const el = $('#hudDiff'); el.textContent = DIFFS[dv].name; el.dataset.v = dv; }
  const target = score() - inFlight;
  dispScore = dt ? dispScore + (target - dispScore) * Math.min(1, dt * 14) : target;
  if (Math.abs(target - dispScore) < 1) dispScore = target;
  setT('#hudScore', fmt(dispScore));
  if (!playing) {
    setT('#startLv', String(level));
    const st = STAGES[stageOf(level)]; setT('#startStage', st.name); setT('#startSub', st.sub);
    setT('#startBoss', bossName(level));
    $('#btnReset').hidden = level <= 1;
  }
  const pw0 = (playing ? Math.round(prog() * 400) / 4 : 0) + '%'; if (hudCache.prog !== pw0) { hudCache.prog = pw0; $('#hudProg').style.width = pw0; }
  const pw = $('#hudPow');
  const r5 = G ? G.rate / 5 : 1, txt = playing ? TIERS[G.tier].name + (r5 > 1.01 ? ` · 연사${r5.toFixed(1)}` : '') + (G.dmg > 1.01 ? ` · 위력${G.dmg.toFixed(1)}` : '') : '';
  if (txt !== hudPowTxt) { hudPowTxt = txt; scoreAt = null; pw.hidden = !txt; pw.textContent = txt; pw.dataset.tier = playing ? G.tier : 0; }
  const m = playing ? G.missiles : 0;
  if (m !== hudMsl) { if (m > hudMsl && hudMsl >= 0 && playing) try { btnMsl.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.22,.8,.24,1)' }); } catch (e) {} hudMsl = m; $('#mslN').textContent = m; btnMsl.classList.toggle('empty', !m); btnMsl.setAttribute('aria-label', `유도탄 쏘기 (${m}발 남음)`); }
}
function paintMute() { const b = $('#btnMute'); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); b.setAttribute('aria-label', muted ? '소리 꺼짐 — 눌러서 켜기' : '소리 켜짐 — 눌러서 끄기'); }

$('#btnStart').addEventListener('click', start);
$('#btnNext').addEventListener('click', () => { if (performance.now() - endAt < 800) return; start(); });
$('#btnMoneyYes').addEventListener('click', () => { if (performance.now() - endAt < 800) return; moneyNext = true; start(); });
$('#btnMoneyNo').addEventListener('click', () => { $('#moneyBox').hidden = true; try { $('#btnNext').focus({ preventScroll: true }); } catch (e) {} });
$('#btnHome').addEventListener('click', home);
$('#btnReset').addEventListener('click', () => { level = 1; save('lastshot_level', 1); run = 0; save('lastshot_run', 0); clearSnap(); pushProgress({ state: null }); home(); });
$('#btnGiveUp').addEventListener('click', giveUp);
$('#btnResume').addEventListener('click', resumeGo);
$('#btnResumeQuit').addEventListener('click', giveUp);
addEventListener('pagehide', () => saveSnap(true));
$('#btnRank').addEventListener('click', openRank);
$('#btnRankClose').addEventListener('click', home);
$('#btnMute').addEventListener('click', () => { muted = !muted; save('lastshot_mute', muted ? 1 : 0); paintMute(); if (!muted) audio(); });
addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { last = performance.now(); for (const k in keys) keys[k] = false; if (document.hidden) saveSnap(true); if (!document.hidden && AC && AC.state !== 'running' && state === 'play') try { AC.resume(); } catch (e) {} });
if (dbg) window.__ls = { auto: false, start, end, get G() { return G; }, setLevel(l) { level = l; }, setDiff(d) { diff = diffOf(d); diffSeg.set(diff, true); }, get diff() { return diff; }, get user() { return user; }, get state() { return state; }, fireMissile: shootMissile, sfx(n, t) { audio(); muted = false; SFX[n](t); }, setTier(t) { G.tier = t; }, get timers() { return { endTimer, slow, hitstop, over: G && G.over }; } };
fit(); G = preview(); syncHud(0); paintMute();
if (dbg) front(); else api('/api/me').then(me => { applyMe(me); front(); }).catch(() => { authSeg.set(loadS('lastshot_name', '') ? 'login' : 'signup', false); front(); });   // 전에 가입한 적 있는 폰이면 로그인 탭부터
try { renderer.compile(scene, camera); } catch (e) {}   // 셰이더를 미리 만들어 첫 진급 · 첫 폭발 때 멈칫하지 않게
requestAnimationFrame(t => { last = t; loop(t); });
// 확인용: ?debug&play=레벨 → 자동 조종으로 바로 시작
if (dbg) { const d = location.search.match(/diff=(easy|normal|hard)/); if (d) { diff = d[1]; diffSeg.set(diff, true); } }
if (dbg) { const m = location.search.match(/play=(\d+)/); if (m) { level = +m[1]; window.__ls.auto = !/manual/.test(location.search); muted = true; setTimeout(start, 50); } }
if (dbg) { const w = location.search.match(/[?&]w=(\d+)&h=(\d+)/); if (w) { Object.assign($('#game').style, { width: w[1] + 'px', height: w[2] + 'px', margin: 0 }); fit(); } }
if (dbg) { const t = location.search.match(/tier=(\d)/); if (t) setTimeout(() => { if (G) G.tier = +t[1]; }, 80); }
// 확인용: &gal=croc2 · gal=golem · gal=army1 → 보스 · 중간보스 · 병사를 가까이 세워 놓고 보기(게임은 멈춤)
function gallery(k, n) {
  $('#ovStart').hidden = true; $('#ovAuth').hidden = true; clearViews(); state = 'menu'; bossSeen = true;
  G = newGame(level, {}); G.n = 30; G.tier = Math.min(2, n); G.gates = []; G.mobs = []; G.groups = []; G.boxes = []; lastN = 30;
  const anim = ['croc', 'gorilla', 'elephant', 'lion', 'tiger'], mids = ['boar', 'golem', 'lich', 'siege', 'drake'];
  if (anim.includes(k)) G.boss = { kind: 'brute', animal: k, evo: Math.min(2, n), x: MID, y: -300, r: 62, hp: 100, max: 100, t: 0, flash: 0, pop: 0, stop: -800, bite: 0, fire: 2, summon: 99 };
  else if (mids.includes(k)) G.mobs.push({ mb: k, x: MID, y: -230, size: 2.3, step: 0, flash: 0, hp: 100, max: 100, g: {}, lv: 2, ox: 0 });
  else for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 7; i++) G.mobs.push({ x: MID - 90 + i * 30, y: -140 - lv * 55, size: 1, step: i, flash: i === 3 && lv === 0 ? .1 : 0, hp: 1, max: 1, g: {}, lv, bn: lv === 2 && i === 5, ox: 0 });
  setInterval(() => { if (G.boss) G.boss.t += .016; for (const M of G.mobs) M.step += .2; }, 16);
}
if (dbg) { const g = location.search.match(/gal=([a-z]+)(\d)?/); if (g) setTimeout(() => gallery(g[1], +(g[2] || 0)), 150); }
// 확인용: &ff=초 → 시작하자마자 그 시간만큼 빨리 돌림(마지막 0.5초는 그림까지)
if (dbg) { const f = location.search.match(/ff=(\d+)/); if (f) setTimeout(() => { const n = +f[1] * 60; for (let i = 0; i < n && state === 'play'; i++) { autoAim(G, 1, 1 / 60, botMem); const b = G.dist; step(G, 1 / 60); moveEnv((G.dist - b) * S); if (G.over) break; if (i > n - 30) render(1 / 60); } window.__ls.auto = false; G.tx = G.px; banner = 0; }, 120); }
