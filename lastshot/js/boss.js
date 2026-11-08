/* 라스트샷 — 보스(동물 5종 × 진화 3단계) · 중간보스 5종. 모두 three.js 기본 도형으로 만든다(그림 파일 없음).
   모델은 +z(내 부대 쪽)를 바라본다. game.js 가 위치 · 크기를 잡고 animBoss / animMid 로 움직임을 준다. */
import * as THREE from './vendor/three.module.min.js';

export const AURA = { croc: '#46ff6a', gorilla: '#c65bff', elephant: '#4fb6ff', lion: '#ffc23a', tiger: '#ff6a1f' };
export const SHELL = { croc: '#9be04f', gorilla: '#8a6a4a', elephant: '#5ab8ff', lion: '#ffb02e', tiger: '#ff5a1f' };
export const MID_AURA = { boar: '#ff7a2a', golem: '#5fd0ff', lich: '#b45bff', siege: '#ffb030', drake: '#ff5a1f' };

const GOLD = '#f5b52e', SILVER = '#c6ccd5', STEEL = '#7b828e', LEATHER = '#6b4426', RED = '#d42a2f', WHITE = '#fff7ea', DARK = '#2a1a1a';

/* ── 공용 그림(줄무늬 · 문양) ── */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true; return t;
}
let stripeTex = null;
function stripes() {
  if (!stripeTex) stripeTex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = '#1b1310';
    for (let i = 0; i < 14; i++) {
      const cx = i * w / 14 + 6; x.beginPath(); x.moveTo(cx - 4, 0);
      for (let y = 0; y <= h * .62; y += 8) x.lineTo(cx + Math.sin(y * .09 + i) * 5 + (y / h) * 6, y);
      x.lineTo(cx + 9, 0); x.closePath(); x.fill();
    }
  });
  return stripeTex;
}
let runeTex = null;
function rune() {   // 코끼리 LV3 귀 갑옷의 빛나는 문양
  if (!runeTex) runeTex = canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#1d3f9a'; x.fillRect(0, 0, w, w);
    x.strokeStyle = '#8fe0ff'; x.lineWidth = 7; x.shadowColor = '#8fe0ff'; x.shadowBlur = 12;
    x.beginPath(); x.arc(64, 64, 34, .4, Math.PI * 1.7); x.stroke();
    x.beginPath(); x.moveTo(48, 50); x.lineTo(80, 58); x.lineTo(56, 80); x.stroke();
  });
  return runeTex;
}

/* ── 만들기 도우미 ── */
function kit(root) {
  const mats = [];
  const K = {
    mats,
    mat(c, shiny, map) {
      const m = shiny ? new THREE.MeshPhongMaterial({ color: c, shininess: 90, specular: new THREE.Color('#ffffff'), map: map || null })
        : new THREE.MeshLambertMaterial({ color: c, map: map || null });
      mats.push(m); return m;
    },
    glow(c) { return new THREE.MeshBasicMaterial({ color: c }); },
    add(geo, m, x, y, z, p = root, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true; p.add(o); return o;
    },
    pivot(x, y, z, p = root) { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; },
    sph: (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h),
    cap: (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14),
    cone: (r, h, n = 10) => new THREE.ConeGeometry(r, h, n),
    cyl: (a, b, h, n = 14) => new THREE.CylinderGeometry(a, b, h, n),
    box: (a, b, c) => new THREE.BoxGeometry(a, b, c)
  };
  return K;
}
// 성난 눈: 흰자 + 눈동자 + 안쪽이 내려간 눈썹. glowC 가 있으면 눈동자가 빛난다
function eyes(K, p, y, z, sep, s, browC, glowC) {
  const white = K.mat('#ffffff'), pup = glowC ? K.glow(glowC) : K.mat('#141010'), brow = K.mat(browC || '#2a1c18');
  [-1, 1].forEach(sd => {
    K.add(K.sph(s, 14, 10), white, sd * sep, y, z, p, 0, 0, 0, 1, .9, .55);
    K.add(K.sph(s * .52, 10, 8), pup, sd * sep * .92, y - s * .05, z + s * .4, p);
    K.add(K.box(s * 2.4, s * .55, s * .7), brow, sd * sep, y + s * .95, z + s * .1, p, 0, 0, sd * .5);
  });
}
// 크게 벌린 입: 속(검붉음) · 혀 · 위아래 이빨
function roar(K, p, y, z, w, h, fang) {
  K.add(K.sph(1, 16, 12), K.mat('#5a1016'), 0, y, z, p, 0, 0, 0, w, h, w * .45);
  K.add(K.sph(1, 12, 8), K.mat('#e2626e'), 0, y - h * .45, z + w * .1, p, 0, 0, 0, w * .6, h * .35, w * .35);
  const tooth = K.mat('#fffaf0');
  for (let i = 0; i < 4; i++) {
    const t = (i + .5) / 4 * 2 - 1, big = fang && (i === 0 || i === 3);
    K.add(K.cone(w * (big ? .14 : .09), h * (big ? .9 : .45), 6), tooth, t * w * .7, y + h * (big ? .45 : .7), z + w * .32, p, Math.PI);
    K.add(K.cone(w * .08, h * .35, 6), tooth, t * w * .55, y - h * .75, z + w * .3, p);
  }
}
function spikes(K, p, m, list) { for (const [x, y, z, rx, rz, s] of list) K.add(K.cone(.22 * s, .7 * s, 8), m, x, y, z, p, rx, 0, rz); }
// 어깨 갑옷: 반구 + 가시
function pad(K, p, x, y, z, r, m, spikeM, sd) {
  K.add(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), m, x, y, z, p, 0, 0, sd * .35, 1.1, .9, 1.1);
  K.add(new THREE.TorusGeometry(r * .98, r * .12, 6, 18).rotateX(Math.PI / 2), K.mat(GOLD, true), x, y - r * .05, z, p, 0, 0, sd * .35);
  if (spikeM) spikes(K, p, spikeM, [[x + sd * r * .25, y + r * .9, z, 0, -sd * .3, r * .8], [x + sd * r * .75, y + r * .45, z, 0, -sd * 1.1, r * .7]]);
}
function crown(K, p, x, y, z, r) {
  const g = K.mat(GOLD, true);
  K.add(new THREE.CylinderGeometry(r, r * .9, r * .55, 18, 1, true), g, x, y, z, p).material.side = THREE.DoubleSide;
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; K.add(K.cone(r * .2, r * .55, 6), g, x + Math.sin(a) * r * .92, y + r * .45, z + Math.cos(a) * r * .92, p); }
  K.add(K.sph(r * .2, 10, 8), K.glow('#ff2a3a'), x, y, z + r * .95, p);
}
function cape(K, p, color, top, bot, h, y, z, fur) {
  const m = K.mat(color); m.side = THREE.DoubleSide;
  const c = K.add(new THREE.CylinderGeometry(top, bot, h, 20, 1, true, -Math.PI * .4, Math.PI * .8).rotateY(Math.PI), m, 0, y, z, p);
  K.add(new THREE.TorusGeometry(top, .12, 6, 20, Math.PI * .8).rotateX(Math.PI / 2).rotateY(Math.PI * .1), K.mat(GOLD, true), 0, y - h / 2 + .05, z, p, 0, 0, 0, bot / top, 1, bot / top);
  if (fur) K.add(new THREE.TorusGeometry(top * .95, .45, 10, 20), K.mat(WHITE), 0, y + h / 2, z, p, Math.PI / 2);
  return c;
}

// 네발 짐승 망토: 등을 덮어 옆으로 늘어지는 반원통(앞뒤 = z)
function backCape(K, p, color, r, len, y, z) {
  const m = K.mat(color); m.side = THREE.DoubleSide;
  K.add(new THREE.CylinderGeometry(r, r * 1.08, len, 20, 1, true, Math.PI - 1.35, 2.7).rotateX(Math.PI / 2), m, 0, y, z, p);
  K.add(new THREE.TorusGeometry(r * 1.08, .14, 6, 24, 2.7).rotateZ(Math.PI / 2 - 1.35 + Math.PI / 2 * 0), K.mat(GOLD, true), 0, y, z - len / 2, p, 0, 0, Math.PI / 2 - 1.35 + Math.PI - Math.PI / 2);
}

/* ── 보스(동물) ── */
export function makeAnimal(kind, evo) {
  const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  const K = kit(body), R = { grp, body, arms: [], legs: [], jaw: null, head: null, tail: null, trunk: [], kind, evo, aura: AURA[kind], biped: kind === 'croc' || kind === 'gorilla' };
  const armorM = evo === 2 ? K.mat(GOLD, true) : K.mat(SILVER, true), trim = K.mat(GOLD, true), steel = K.mat(STEEL, true), leather = K.mat(LEATHER);
  const spikeM = evo ? K.mat(evo === 2 ? GOLD : '#dfe3ea', true) : K.mat('#e9dcc0');
  const glowEye = evo === 2 ? '#ff3030' : null;

  if (R.biped) {
    const croc = kind === 'croc';
    const skin = K.mat(croc ? '#5fae3a' : '#4a4655'), belly = K.mat(croc ? '#ecd38c' : '#77707f');
    // 다리
    [-1, 1].forEach(sd => {
      const L = K.pivot(sd * 1.15, 2.3, 0); R.legs.push(L);
      K.add(K.cap(.8, 1), skin, 0, -1, 0, L);
      K.add(K.sph(.85), skin, 0, -2.05, .45, L, 0, 0, 0, 1.1, .55, 1.4);
      if (evo) K.add(K.cyl(.88, .95, .7), armorM, 0, -.9, 0, L);
    });
    // 몸통
    const torso = K.add(K.sph(2.3, 22, 18), skin, 0, croc ? 4.3 : 4.1, croc ? 0 : -.2, body, croc ? 0 : .35, 0, 0, 1.15, 1.05, .95);
    K.add(K.sph(2, 18, 14), belly, 0, croc ? 4 : 4, croc ? .75 : .85, body, croc ? 0 : .35, 0, 0, .9, .95, .55);
    if (croc) { // 꼬리 · 등 가시
      R.tail = K.pivot(0, 2.6, -1.6);
      K.add(K.cone(1.1, 4, 10), skin, 0, 0, -1.8, R.tail, -Math.PI / 2 - .3);
      spikes(K, body, K.mat('#3f8a26'), [[0, 6.2, -1.2, -.5, 0, 1.2], [0, 5.2, -2, -.9, 0, 1.2], [0, 4, -2.3, -1.3, 0, 1.1], [0, 2.8, -2.1, -1.8, 0, 1]]);
    }
    // 팔(어깨 회전점)
    const big = croc ? 1 : 1.35;
    [-1, 1].forEach(sd => {
      const A = K.pivot(sd * 2.5, croc ? 5.4 : 5.6, croc ? 0 : .3); R.arms.push(A);
      K.add(K.cap(.75 * big, 1.5), skin, 0, -1.2, 0, A, 0, 0, sd * .2);
      K.add(K.sph(1 * big), croc ? skin : belly, sd * .35, -2.75 * (croc ? 1 : 1.05), .3, A);
      if (!croc) K.add(K.cyl(1.05, 1.1, .7), evo ? armorM : leather, sd * .25, -1.95, .15, A, 0, 0, sd * .2);
      if (evo) pad(K, A, sd * .15, .1, 0, 1.05 * big, armorM, spikeM, sd);
      else if (croc && sd < 0) pad(K, A, sd * .15, .1, 0, 1, leather, spikeM, sd);
    });
    // 무기: 악어는 가시 철퇴
    if (croc) {
      const A = R.arms[1];
      K.add(K.cyl(.16, .2, 3.2), K.mat('#7a4a28'), .4, -2.8, 1.2, A, 1.2);
      const ball = K.add(K.sph(.85), K.mat(evo === 2 ? '#5a4a3a' : '#6b4a2a'), .4, -2.1, 2.7, A);
      const sm = K.mat(evo === 2 ? GOLD : '#d8d0c0', evo === 2);
      for (let i = 0; i < 10; i++) { const a = i * 2.4, b = Math.acos(1 - 2 * (i + .5) / 10); const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); const c = K.add(K.cone(.2, .6, 6), sm, .4 + d.x * .95, -2.1 + d.y * .95, 2.7 + d.z * .95, A); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
      if (evo === 2) ball.scale.setScalar(1.3);
    }
    // 머리
    const H = K.pivot(0, croc ? 6.9 : 6.3, croc ? .5 : 1.4); R.head = H;
    if (croc) {
      K.add(K.sph(1.35), skin, 0, 0, 0, H, 0, 0, 0, 1.05, .85, 1);
      K.add(K.cap(.7, 1.8).rotateX(Math.PI / 2), skin, 0, .1, 2, H, 0, 0, 0, 1.25, .7, 1);
      K.add(K.sph(.18, 8, 6), K.mat('#1f3a14'), -.3, .45, 3.2, H); K.add(K.sph(.18, 8, 6), K.mat('#1f3a14'), .3, .45, 3.2, H);
      const tooth = K.mat('#fffaf0');
      for (let i = 0; i < 5; i++) [-1, 1].forEach(sd => K.add(K.cone(.11, .38, 5), tooth, sd * .72, -.32, 1 + i * .5, H, Math.PI));
      K.add(K.box(1.4, .5, 2.4), K.mat('#7a1a20'), 0, -.45, 1.9, H);
      const J = K.pivot(0, -.45, .6, H); R.jaw = J;
      K.add(K.cap(.62, 1.7).rotateX(Math.PI / 2), belly, 0, -.25, 1.5, J, 0, 0, 0, 1.25, .5, 1);
      for (let i = 0; i < 4; i++) [-1, 1].forEach(sd => K.add(K.cone(.1, .32, 5), tooth, sd * .65, .15, 1.1 + i * .5, J));
      [-1, 1].forEach(sd => K.add(K.sph(.5), skin, sd * .62, .75, .55, H));
      eyes(K, H, .95, .95, .62, .3, '#2c5a1a', glowEye);
      if (evo >= 1) K.add(new THREE.TorusGeometry(1.3, .35, 8, 20), K.mat(RED), 0, -1.1, -.2, H, Math.PI / 2 + .2);
    } else {
      K.add(K.sph(1.45), skin, 0, 0, 0, H, 0, 0, 0, 1.05, 1, .95);
      K.add(K.sph(1.1), belly, 0, -.35, .75, H, 0, 0, 0, 1, .85, .7);
      K.add(K.box(2.2, .45, .7), skin, 0, .55, 1.1, H, .2);
      K.add(K.sph(.13, 8, 6), K.mat('#1c1820'), -.22, .05, 1.55, H); K.add(K.sph(.13, 8, 6), K.mat('#1c1820'), .22, .05, 1.55, H);
      eyes(K, H, .3, 1.2, .5, .22, '#1c1820', glowEye);
      const J = K.pivot(0, -.55, 1, H); R.jaw = J; roar(K, J, -.15, .15, .7, .5, true);
    }
    // 진화: 띠 · 갑옷 · 왕관 · 망토
    if (evo === 0) K.add(new THREE.TorusGeometry(2.25, .16, 6, 24), leather, 0, 4.4, croc ? 0 : -.1, body, Math.PI / 2 - .2, .6, .9);
    else {
      K.add(new THREE.TorusGeometry(2.35, .28, 8, 26), armorM, 0, 3.2, croc ? 0 : -.1, body, Math.PI / 2);
      K.add(K.box(.9, .7, .3), trim, 0, 3.2, 2.45, body);
      K.add(new THREE.TorusGeometry(2.2, .16, 6, 24), leather, 0, 4.6, croc ? 0 : -.1, body, Math.PI / 2 - .2, -.6, .9);
      if (!croc) K.add(K.box(2.4, 1.8, .2), K.mat('#a02028'), 0, 1.9, 1.6, body);
    }
    if (evo === 2) {
      K.add(K.sph(1.3, 16, 12), armorM, 0, 4.7, croc ? 1.6 : 1.7, body, 0, 0, 0, 1.1, 1, .45);
      K.add(K.sph(.42, 12, 10), K.glow('#ff2438'), 0, 4.8, croc ? 2.2 : 2.3, body);
      crown(K, H, 0, croc ? 1.2 : 1.45, -.1, .85);
      cape(K, body, RED, 2, 3.2, 4.6, 3.9, -.6);
    }
  } else {
    // 네발 짐승: 코끼리 · 사자 · 호랑이
    const ele = kind === 'elephant', lion = kind === 'lion', tiger = kind === 'tiger';
    const skin = ele ? K.mat('#8f909c') : tiger ? K.mat('#f28a22', false, stripes()) : K.mat('#e9a03e');
    const pale = K.mat(ele ? '#a8a9b4' : '#fbe9c8');
    const bodyR = ele ? 2.5 : 2, legH = ele ? 1.5 : 1.3, by = ele ? 3.9 : 3.3;
    K.add(K.cap(bodyR, ele ? 3.2 : 3.6).rotateX(Math.PI / 2), skin, 0, by, -.4, body, -.08, 0, 0, 1, .95, 1);
    if (!ele) K.add(K.cap(bodyR * .75, 3).rotateX(Math.PI / 2), pale, 0, by - bodyR * .45, -.2, body, 0, 0, 0, .9, .6, 1);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
      const L = K.pivot(sx * bodyR * .62, by - bodyR * .45, sz * (ele ? 2.2 : 2.3) - .3); R.legs.push(L);
      K.add(K.cap(ele ? .95 : .72, legH), skin, 0, -legH * .7, 0, L);
      K.add(K.sph(ele ? 1 : .8), ele ? pale : pale, 0, -legH * 1.35, .25, L, 0, 0, 0, 1.05, .5, 1.25);
      if (evo && i < 2) K.add(K.cyl(ele ? 1.02 : .8, ele ? 1.08 : .86, .8), armorM, 0, -legH * .45, 0, L);
    });
    R.tail = K.pivot(0, by + .4, -.4 - (ele ? 3.4 : 3.6));
    K.add(K.cyl(.12, .2, 2.4), skin, 0, -.6, -.7, R.tail, -.9);
    if (!ele) K.add(K.sph(.42), K.mat(lion ? '#b8441a' : '#1b1310'), 0, -1.3, -1.6, R.tail);
    // 머리
    const H = K.pivot(0, by + (ele ? 1.5 : 1.3), ele ? 2.9 : 3.1); R.head = H;
    if (ele) {
      K.add(K.sph(2.1), skin, 0, 0, 0, H, 0, 0, 0, 1, 1, .95);
      [-1, 1].forEach(sd => K.add(K.sph(2, 18, 14), skin, sd * 2.1, .1, -.7, H, 0, sd * .5, 0, .22, 1.05, 1));
      let seg = K.pivot(0, -.6, 1.7, H);
      for (let i = 0; i < 6; i++) { const r = .62 - i * .07; K.add(K.cyl(r * .92, r, .8), skin, 0, -.4, 0, seg); const n = K.pivot(0, -.75, 0, seg); R.trunk.push(n); seg = n; }
      const tusk = K.mat('#fff4dc');
      [-1, 1].forEach(sd => { const t = K.pivot(sd * .85, -1.1, 1.5, H); K.add(K.cone(.28, 2.2, 10), tusk, 0, -.4, .9, t, 1.9, 0, -sd * .25); });
      eyes(K, H, .45, 1.7, .95, .3, '#3c3c48', glowEye);
      // 진화
      const cap = evo === 0 ? K.mat('#2f5fd8', true) : armorM;
      K.add(new THREE.SphereGeometry(2.18, 20, 12, 0, Math.PI * 2, 0, Math.PI * .32), cap, 0, .2, -.1, H, -.25);
      K.add(K.box(.9, 1.3, .3), evo ? trim : K.mat(SILVER, true), 0, 1.15, 1.85, H, -.35);
      K.add(K.sph(.36, 12, 10).scale(1, 1.3, .6), K.glow(evo ? '#3aa0ff' : '#9fe0ff'), 0, 1.15, 2.05, H, -.35);
      // 몸 옆 판
      [-1, 1].forEach(sd => K.add(K.box(.3, 2.2, 3.4), evo === 2 ? K.mat('#2a56c8', true) : armorM, sd * 2.45, by + .2, -.3, body, 0, 0, sd * .12));
      K.add(new THREE.TorusGeometry(2.45, .16, 6, 26).rotateX(Math.PI / 2), trim, 0, by + 1.3, -.3, body, 0, 0, 0, 1, 1, 1.3);
      if (evo === 2) {
        [-1, 1].forEach(sd => {
          const ear = K.pivot(sd * 2.5, .1, -.6, H); ear.rotation.y = sd * .5;
          K.add(K.cyl(1.9, 1.9, .3, 6).rotateZ(Math.PI / 2), trim, 0, 0, 0, ear);
          K.add(K.cyl(1.55, 1.55, .34, 6).rotateZ(Math.PI / 2), K.mat('#ffffff', false, rune()), sd * .02, 0, 0, ear, 0, 0, 0);
        });
        crown(K, H, 0, 2.1, -.2, .9);
        backCape(K, body, '#2246c6', 2.7, 4.6, by + .1, -.8);
      }
    } else {
      // 사자 · 호랑이 머리
      if (lion) {
        const mane = K.mat('#d2531c');
        K.add(new THREE.IcosahedronGeometry(2, 1), mane, 0, -.1, -.5, H, 0, 0, 0, 1.15, 1.15, .9).material.flatShading = true;
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.add(K.cone(.6, 1.6, 6), mane, Math.cos(a) * 2, Math.sin(a) * 2 - .1, -.8, H, 0, 0, a - Math.PI / 2); }
      }
      K.add(K.sph(1.45), skin, 0, 0, .3, H);
      [-1, 1].forEach(sd => K.add(K.sph(.42, 10, 8), skin, sd * .95, 1.15, 0, H, 0, 0, 0, 1, 1, .5));
      K.add(K.sph(.85), pale, 0, -.45, 1.35, H, 0, 0, 0, 1.15, .8, .8);
      if (tiger) [-1, 1].forEach(sd => K.add(K.sph(.6), pale, sd * 1.1, -.4, .9, H, 0, 0, 0, 1, .9, .7));
      K.add(K.sph(.28, 10, 8), K.mat('#3a1c1c'), 0, -.05, 2.05, H, 0, 0, 0, 1.2, .8, .8);
      eyes(K, H, .45, 1.45, .55, .24, tiger ? '#1b1310' : '#8a3a12', glowEye);
      const J = K.pivot(0, -.75, 1.3, H); R.jaw = J; roar(K, J, -.1, .25, .65, .45, true);
      if (evo >= 1) {   // 등 · 어깨 갑옷
        K.add(new THREE.SphereGeometry(bodyR * 1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * .4), evo === 2 && tiger ? K.mat('#b8262c', true) : armorM, 0, by - .1, .9, body, .1);
        [-1, 1].forEach(sd => pad(K, body, sd * 1.6, by + 1, 1.6, .9, armorM, spikeM, sd));
        K.add(new THREE.TorusGeometry(1.5, .22, 8, 20), evo === 2 ? trim : K.mat(RED), 0, -.9, -.3, H, Math.PI / 2 + .3);
      }
      if (evo === 2) {
        crown(K, H, 0, 1.45, -.1, .8);
        backCape(K, body, RED, 2.25, 4.4, by + .05, -1);
        if (lion) K.add(new THREE.TorusGeometry(1.5, .55, 10, 22), K.mat(WHITE), 0, by + 1.1, 2.3, body, Math.PI / 2 - .5);
        K.add(K.sph(.4, 12, 10), K.glow('#ff2438'), 0, by + .2, 2.35, body);
      }
    }
  }
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  R.mats = K.mats; R.base = K.mats.map(m => m.color.clone());
  R.size = [1.1, 1.3, 1.5][evo] * (R.biped ? 1 : 1.12);   // 진화할수록 화면을 압도하게
  return R;
}

const WHITE_C = new THREE.Color('#ffffff');
export function animBoss(v, K, T) {
  const walk = K.t * (v.biped ? 5 : 6), moving = K.kind === 'brute' || K.y < K.stop;
  const sw = moving ? Math.sin(walk) : Math.sin(T * 2) * .15;
  v.legs.forEach((L, i) => { L.rotation.x = (v.biped ? (i ? -sw : sw) : ((i === 0 || i === 3) ? sw : -sw)) * .5; });
  v.body.position.y = Math.abs(Math.sin(walk)) * (moving ? .18 : .04);
  v.body.rotation.z = Math.sin(walk) * (moving ? .04 : .01);
  const attack = K.bite > 0 || (K.kind === 'tank' && K.fire < .45);
  if (v.arms.length) {
    v.arms[0].rotation.x = attack ? -2.2 + Math.sin(T * 20) * .3 : sw * .5;
    v.arms[1].rotation.x = attack ? -2.4 - Math.sin(T * 20) * .3 : -sw * .5;
  }
  const open = attack ? .55 : .18 + Math.max(0, Math.sin(T * 1.7)) * .25;
  if (v.jaw) v.jaw.rotation.x = v.jaw.rotation.x + (open - v.jaw.rotation.x) * .2;
  if (v.head) { v.head.rotation.x = attack ? -.15 : Math.sin(T * 1.7) * .05; v.head.rotation.y = Math.sin(T * .9) * .12; }
  if (v.tail) v.tail.rotation.y = Math.sin(T * 3) * .4;
  v.trunk.forEach((n, i) => { n.rotation.x = (attack ? -.35 : .18) + Math.sin(T * 3 - i * .6) * .12; });
  v.mats.forEach((m, i) => { m.color.copy(v.base[i]); if (K.flash > 0) m.color.lerp(WHITE_C, .3); });
}

/* ── 중간보스 ── */
export function makeMid(kind) {
  const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  const K = kit(body), R = { grp, body, legs: [], arms: [], head: null, jaw: null, wheels: [], wings: [], orb: null, kind, aura: MID_AURA[kind] };
  const gold = K.mat(GOLD, true), steel = K.mat(STEEL, true), leather = K.mat(LEATHER);
  if (kind === 'boar') {
    const fur = K.mat('#6b3e26'), snout = K.mat('#d88a86');
    K.add(K.cap(1.5, 2.2).rotateX(Math.PI / 2), fur, 0, 2.3, -.2, body);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const L = K.pivot(sx * .95, 1.5, sz * 1.5 - .2); R.legs.push(L); K.add(K.cap(.45, .7), fur, 0, -.6, 0, L); K.add(K.sph(.48), K.mat('#2a1a14'), 0, -1.2, .1, L, 0, 0, 0, 1, .6, 1.2); });
    const H = K.pivot(0, 2.7, 2); R.head = H;
    K.add(K.sph(1.2), fur, 0, 0, 0, H);
    K.add(K.cyl(.6, .75, .9).rotateX(Math.PI / 2), snout, 0, -.3, 1.2, H);
    K.add(K.sph(.1, 8, 6), K.mat(DARK), -.2, -.2, 1.67, H); K.add(K.sph(.1, 8, 6), K.mat(DARK), .2, -.2, 1.67, H);
    [-1, 1].forEach(sd => { K.add(K.cone(.18, 1.1, 8), K.mat('#fff4dc'), sd * .7, -.3, 1.15, H, 0, 0, -sd * .5); K.add(K.cone(.35, .7, 6), fur, sd * .75, 1, -.1, H, 0, 0, -sd * .4); });
    eyes(K, H, .4, .95, .45, .2, '#2a1a14', '#ffb020');
    const hair = K.mat('#c8202a'); for (let i = 0; i < 6; i++) K.add(K.cone(.38, 1.5, 6), hair, 0, 3.6 - i * .12, 1.2 - i * .6, body, -.5 - i * .15);
    [-1, 1].forEach(sd => pad(K, body, sd * 1.25, 3.1, .9, .85, steel, gold, sd));
    K.add(new THREE.TorusGeometry(1.55, .16, 6, 22), leather, 0, 2.3, .4, body, 0, 0, 0, 1, 1, 1);
    // 깃발
    K.add(K.cyl(.07, .07, 3.6), K.mat('#5a3a20'), -1.2, 4.2, -1.3, body);
    const f = K.mat('#d42a2f'); f.side = THREE.DoubleSide; R.flag = K.add(new THREE.PlaneGeometry(1.5, 1.1, 6, 1).translate(.75, 0, 0), f, -1.15, 5.3, -1.3, body);
  } else if (kind === 'golem') {
    const rock = K.mat('#8d8f96'), moss = K.mat('#6fbf3a'), crystal = new THREE.MeshPhongMaterial({ color: '#7fe3ff', emissive: '#1a6aa0', shininess: 120, transparent: true, opacity: .92 }); K.mats.push(crystal);
    const rk = (s) => new THREE.DodecahedronGeometry(s, 0);
    [-1, 1].forEach(sd => { const L = K.pivot(sd * .9, 1.6, 0); R.legs.push(L); K.add(rk(.8), rock, 0, -.8, 0, L, .3, .2, 0, 1, 1.2, 1); });
    K.add(rk(1.9), rock, 0, 3.3, 0, body, .2, .4, 0, 1.15, 1, .9);
    K.add(rk(1), K.glow('#3ac8ff'), 0, 3.2, 1.05, body, 0, 0, 0, .55, .45, .3);
    [-1, 1].forEach(sd => {
      const A = K.pivot(sd * 2.1, 4, 0); R.arms.push(A);
      K.add(rk(.75), rock, 0, -.8, 0, A, .5, .2, .3);
      K.add(rk(1.15), rock, sd * .1, -2.1, .3, A, .1, .7, .2);
      K.add(rk(.5), moss, sd * .1, -1.3, .1, A, 0, 0, 0, 1, .35, 1);
    });
    const H = K.pivot(0, 5.1, .4); R.head = H; K.add(rk(.85), rock, 0, 0, 0, H, .1, .3, 0, 1.1, .9, 1);
    K.add(K.box(1.2, .25, .4), rock, 0, .35, .7, H, .2);
    [-1, 1].forEach(sd => K.add(K.sph(.17, 10, 8), K.glow('#7fe8ff'), sd * .35, .05, .78, H));
    K.add(rk(1.2), moss, 0, 4.7, -.2, body, 0, 0, 0, 1.4, .3, 1);
    [[-1.3, 5, -.6, .4], [1.4, 5.2, -.5, -.3], [.3, 5.4, -1.1, .1], [-.6, 5.8, -.8, .6], [1.9, 4.4, -.2, -.6]].forEach(([x, y, z, r]) => K.add(new THREE.OctahedronGeometry(.7, 0), crystal, x, y, z, body, r, r, r * .5, .7, 1.5, .7));
  } else if (kind === 'lich') {
    const robe = K.mat('#5a2a9c'), bone = K.mat('#ece6da'), dark = K.mat('#2a1640');
    K.add(K.cone(1.5, 3.4, 16), robe, 0, 1.7, 0, body);
    K.add(new THREE.TorusGeometry(1.45, .12, 6, 20).rotateX(Math.PI / 2), gold, 0, .1, 0, body);
    K.add(K.box(.3, 2.8, .1), gold, 0, 1.8, .95, body, -.4);
    K.add(K.sph(.95), robe, 0, 3.3, 0, body, 0, 0, 0, 1.2, 1, .9);
    const H = K.pivot(0, 4.4, .2); R.head = H;
    K.add(K.sph(.75), bone, 0, 0, 0, H, 0, 0, 0, 1, 1.05, 1);
    K.add(K.box(.75, .35, .5), bone, 0, -.6, .3, H);
    [-1, 1].forEach(sd => K.add(K.sph(.22, 10, 8), K.glow('#d68bff'), sd * .27, .05, .6, H));
    K.add(K.cone(.08, .2, 4), dark, 0, -.25, .73, H, Math.PI);
    const hood = K.mat('#4a2088'); hood.side = THREE.DoubleSide;
    K.add(new THREE.SphereGeometry(1, 18, 12, Math.PI * .15, Math.PI * 1.7, 0, Math.PI * .62), hood, 0, .1, -.05, H, 0, Math.PI, 0, 1.05, 1.15, 1.05);
    K.add(K.cone(.5, 1, 10), hood, 0, 1.05, -.3, H, -.5);
    [-1, 1].forEach(sd => {
      const A = K.pivot(sd * 1.2, 3.6, 0); R.arms.push(A);
      K.add(K.cone(.42, 1.6, 10), robe, 0, -.7, 0, A, Math.PI);
      K.add(K.sph(.22, 8, 6), bone, 0, -1.55, .1, A);
      for (let i = 0; i < 3; i++) K.add(K.cyl(.04, .04, .45, 5), bone, (i - 1) * .1, -1.85, .15, A);
    });
    const S = K.pivot(0, -1.6, .2, R.arms[1]);
    K.add(K.cyl(.09, .09, 4.4), K.mat('#5a3a20'), 0, .8, 0, S);
    K.add(new THREE.TorusGeometry(.42, .08, 6, 16), gold, 0, 3.1, 0, S);
    spikes(K, S, gold, [[-.45, 3.4, 0, 0, .6, .7], [.45, 3.4, 0, 0, -.6, .7]]);
    R.orb = K.add(K.sph(.32, 14, 10), K.glow('#e2a8ff'), 0, 3.1, 0, S);
  } else if (kind === 'siege') {
    const wood = K.mat('#4d4a52', true), brass = gold, iron = K.mat('#3a3a42', true);
    K.add(K.box(3.4, 1.4, 4.4), wood, 0, 1.6, 0, body);
    K.add(K.box(3.6, .25, 4.6), brass, 0, 2.35, 0, body);
    K.add(K.box(2.6, 1.2, 2.6), wood, 0, 3, -.3, body);
    [-1, 1].forEach(sd => [-1.3, 1.3].forEach(z => {
      const w = K.pivot(sd * 1.95, 1, z); R.wheels.push(w);
      K.add(K.cyl(1, 1, .6, 12).rotateZ(Math.PI / 2), iron, 0, 0, 0, w);
      K.add(K.cyl(.45, .45, .66, 8).rotateZ(Math.PI / 2), brass, 0, 0, 0, w);
    }));
    const B = K.pivot(0, 3.4, .2); R.head = B;
    K.add(K.cyl(.75, .95, 3.4, 16).rotateX(Math.PI / 2), iron, 0, .2, 1.6, B);
    [.6, 2.2, 3.2].forEach(z => K.add(new THREE.TorusGeometry(.85, .14, 6, 18), brass, 0, .2, z, B));
    R.orb = K.add(K.sph(.6, 14, 10), K.glow('#ffb030'), 0, .2, 3.3, B, 0, 0, 0, 1, 1, .3);
    K.add(K.box(1.4, 1.4, .2), brass, 0, 1.7, 2.3, body, 0, 0, Math.PI / 4);
    K.add(K.box(1.2, .2, .1), K.mat('#fff4dc'), 0, 1.7, 2.42, body, 0, 0, Math.PI / 4); K.add(K.box(1.2, .2, .1), K.mat('#fff4dc'), 0, 1.7, 2.42, body, 0, 0, -Math.PI / 4);
    spikes(K, body, brass, [[-1.7, 2.6, 2.2, .6, .5, .9], [1.7, 2.6, 2.2, .6, -.5, .9]]);
    [-1, 1].forEach(sd => { K.add(K.cyl(.06, .06, 2.4), K.mat('#5a3a20'), sd * 1.4, 4, -1.8, body); const f = K.mat('#d42a2f'); f.side = THREE.DoubleSide; K.add(new THREE.PlaneGeometry(1, .8).translate(sd * .5, 0, 0), f, sd * 1.4, 4.8, -1.8, body); });
  } else {   // drake
    const scale = K.mat('#3a3550'), belly = new THREE.MeshPhongMaterial({ color: '#ffb53a', emissive: '#a23a00', shininess: 40 }); K.mats.push(belly);
    const wing = K.mat('#d8443a'); wing.side = THREE.DoubleSide;
    K.add(K.cap(1.4, 1.8).rotateX(Math.PI / 2), scale, 0, 2.4, 0, body, -.25);
    K.add(K.cap(1.05, 1.6).rotateX(Math.PI / 2), belly, 0, 2.1, .45, body, -.25, 0, 0, .85, .7, 1);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const L = K.pivot(sx * 1.05, 1.7, sz * 1.3); R.legs.push(L); K.add(K.cap(.5, .7), scale, 0, -.6, 0, L); for (let i = -1; i <= 1; i++) K.add(K.cone(.1, .4, 5), K.mat('#f2e2c0'), i * .2, -1.2, .45, L, Math.PI / 2); });
    R.tail = K.pivot(0, 2.2, -1.8); K.add(K.cone(.7, 3.6, 10), scale, 0, 0, -1.6, R.tail, -Math.PI / 2 - .25);
    spikes(K, body, K.mat('#c8303a'), [[0, 3.8, .5, -.3, 0, 1], [0, 3.6, -.5, -.6, 0, 1], [0, 3.3, -1.4, -.9, 0, .9]]);
    const H = K.pivot(0, 3.9, 1.8); R.head = H;
    K.add(K.sph(.95), scale, 0, 0, 0, H, 0, 0, 0, 1, .9, 1.1);
    K.add(K.box(1.1, .55, 1.4), scale, 0, -.1, 1, H);
    [-1, 1].forEach(sd => K.add(K.cone(.2, 1.3, 8), K.mat('#f2e2c0'), sd * .55, .75, -.4, H, -.9, 0, -sd * .3));
    eyes(K, H, .35, .75, .42, .17, '#1a1525', '#ffb020');
    const J = K.pivot(0, -.4, .55, H); R.jaw = J; K.add(K.box(1, .3, 1.3), scale, 0, -.1, .55, J);
    R.orb = K.add(K.sph(.4, 12, 8), K.glow('#ffb030'), 0, -.3, 1.6, H);
    [-1, 1].forEach(sd => {
      const W = K.pivot(sd * .9, 3.4, -.2); R.wings.push(W);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(sd * 3.6, 1.6); sh.lineTo(sd * 3.2, -.4); sh.lineTo(sd * 2.4, .1); sh.lineTo(sd * 1.8, -.9); sh.lineTo(sd * 1, -.2); sh.lineTo(0, -.6);
      K.add(new THREE.ShapeGeometry(sh), wing, 0, 0, 0, W, -.2);
      K.add(K.cyl(.09, .09, 3.8), scale, sd * 1.8, .8, 0, W, 0, 0, sd * -1.15);
    });
  }
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  R.mats = K.mats; R.base = K.mats.map(m => m.color.clone());
  return R;
}
export function animMid(v, M, T) {
  const w = M.step;
  v.legs.forEach((L, i) => { L.rotation.x = Math.sin(w + i * Math.PI * (v.kind === 'golem' ? 1 : .5)) * .5; });
  v.arms.forEach((A, i) => { A.rotation.x = v.kind === 'lich' ? (i ? -.6 : -1) + Math.sin(T * 2 + i) * .15 : Math.sin(w + i * Math.PI) * .45; });
  v.wheels.forEach(W => { W.rotation.x += .12; });
  v.wings.forEach((W, i) => { W.rotation.z = (i ? -1 : 1) * Math.sin(T * 5) * .35; });
  v.body.position.y = Math.abs(Math.sin(w)) * .12 + (v.kind === 'lich' ? Math.sin(T * 2) * .25 + .3 : 0);
  if (v.jaw) v.jaw.rotation.x = .3 + Math.sin(T * 4) * .2;
  if (v.tail) v.tail.rotation.y = Math.sin(T * 3) * .4;
  if (v.flag) v.flag.rotation.y = Math.sin(T * 4) * .3;
  if (v.head && v.kind === 'siege') v.head.rotation.x = -.08 + Math.sin(T * 2) * .05;
  if (v.orb) v.orb.scale.setScalar(1 + Math.sin(T * 9) * .25);
  v.mats.forEach((m, i) => { m.color.copy(v.base[i]); if (M.flash > 0) m.color.lerp(WHITE_C, .3); });
}
