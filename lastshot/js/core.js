/* 라스트샷 — 게임 규칙(화면 없음). 화면(game.js)과 균형 시험(node)이 같이 쓴다.
   좌표: 위에서 본 평면. x = 길 가로(ROAD_L ~ ROAD_R), y = 길 세로(내 부대 = 0, 앞쪽이 음수).
   물건은 SPAWN 에서 생겨 +y 로 다가온다. 화면은 이 평면을 3D 로 세워 그린다.
   레벨마다 스테이지 종류(구성 · 색)가 바뀌고, 보스도 번갈아 바뀐다. 레벨이 오를수록 + 한 판 뒤로 갈수록 세짐. */
export const ROAD_L = 34, ROAD_R = 326, MID = 180, SPAWN = -1150, RANGE = 1000, START = 680;
const GAP = 22, BV = 1150;           // BV: 총알 속도                       // 병사 사이 간격
export const TIERS = [                // 부대 등급: 병사 수가 늘면 저절로 오르고(RANKUP), 타이어 · 진급 문으로도 오른다
  { name: '견습병', bullet: 0, mul: 1 },
  { name: '정예병', bullet: 1, mul: 1.6 },
  { name: '근위대장', bullet: 2, mul: 2.5 }
];
// 병사 수로 오르는 등급: 30명이면 정예병, 80명이면 근위대장. 내려갈 때는 조금 더 줄어야(20 · 60 아래) — 경계에서 깜빡이지 않게.
// 타이어 · 진급 문으로 얻은 등급(rank)은 병사 수가 줄어도 그 아래로 내려가지 않는다.
export const RANKUP = [30, 80], RANKDOWN = [20, 60];
function countTier(g) {
  let t = g.tier;
  while (t < RANKUP.length && g.n >= RANKUP[t]) t++;
  while (t > 0 && g.n < RANKDOWN[t - 1]) t--;
  return Math.max(t, g.rank);
}
function promote(g, x, y) {   // 상자 · 진급 문으로 한 등급 올리기
  g.rank = Math.min(TIERS.length - 1, g.tier + 1); setTier(g, g.rank, x, y);
}
function setTier(g, t, x = g.px, y = -60) {
  if (t === g.tier) return;
  const up = t > g.tier, h = g.h; g.tier = t;
  if (up) { if (h.promote) h.promote(t); else h.float(x, y, 'LV' + (t + 1) + ' ' + TIERS[t].name + ' 진급!', '#facc15', 40); h.sfx('promote'); h.tint('gold'); h.ring(g.px, 0, 'gold'); h.buzz(40); }
  else { h.float(g.px, -60, 'LV' + (t + 1) + ' ' + TIERS[t].name, '#cbd5e1', 30); h.sfx('demote'); }
}
// 스테이지 종류: 구성(pat) · 화면 색(theme)
export const STAGES = {
  basic:  { name: '기본 훈련', sub: '문을 골라 부대를 키우세요', theme: 0, pat: ['gate', 'mob', 'gate', 'box', 'mob', 'gate', 'mob', 'box'] },
  rush:   { name: '돌격전', sub: '돌격대가 몰려와요 · 거인은 숫자가 0 이 될 때까지', theme: 1, pat: ['gate', 'mob', 'runner', 'gate', 'giant', 'mob', 'gate', 'runner', 'box', 'mob'] },
  maze:   { name: '문 미로', sub: '값이 바뀌는 문 · 세 갈래 문을 잘 고르세요', theme: 2, pat: ['gate', 'swap', 'mob', 'gate3', 'mob', 'swap', 'box', 'gate3', 'mob'] },
  armory: { name: '무기고', sub: '타이어를 부숴 무기를 챙기고, 드럼통을 쏘면 펑!', theme: 3, pat: ['gate', 'box', 'barrel', 'gate', 'box', 'mob', 'barrel', 'gate', 'box', 'barrel'] },
  siege:  { name: '포위전', sub: '양쪽에서 동시에 와요', theme: 4, pat: ['gate', 'siege', 'gate', 'box', 'siege', 'giant', 'gate', 'siege', 'mob'] }
};
const ORDER = ['rush', 'maze', 'armory', 'siege'];
export const stageOf = L => L <= 1 ? 'basic' : ORDER[(L - 2) % ORDER.length];
export const bossOf = L => L % 2 ? 'brute' : 'tank';
// 보스 겉모습: 레벨마다 악어 → 고릴라 → 코끼리 → 사자 → 호랑이, 5레벨마다 한 단계 진화(LV1~3)
//   하는 짓은 그대로 번갈아: 홀수 레벨 = 걸어오며 졸병 부름(brute), 짝수 = 멈춰서 던짐(tank, 빨간 원 피하기)
export const ANIMALS = ['croc', 'gorilla', 'elephant', 'lion', 'tiger'];
export const ANIMAL_NAME = { croc: '악어', gorilla: '고릴라', elephant: '코끼리', lion: '사자', tiger: '호랑이' };
export const bossLook = L => ({ animal: ANIMALS[(L - 1) % 5], evo: Math.min(2, Math.floor((L - 1) / 5)) });
// 중간보스(잔챙이 사이에 나오는 덩치): 세기는 같고 겉모습만 다르다
export const MIDS = ['boar', 'golem', 'lich', 'siege', 'drake'];
export const MID_NAME = { boar: '돌격멧돼지', golem: '바위 골렘', lich: '해골 마법사', siege: '공성 전차', drake: '화염 드레이크' };
export const bossName = L => { const b = bossLook(L); return ANIMAL_NAME[b.animal] + ' 보스 LV' + (b.evo + 1); };
// 레벨 → 실제 세기: 6 까지는 가파르게, 그 뒤로는 완만하게(그래도 계속 오른다)
export const power = L => L <= 6 ? 5.4 + L * .85 : 10.5 + (L - 6) * .5;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOOP = () => {};

export function squadPos(n) {
  const p = [], m = Math.min(n, 60);
  for (let i = 0; i < m; i++) { const a = i * 2.39996, r = GAP * .52 * Math.sqrt(i); p.push([Math.cos(a) * r, Math.sin(a) * r * .8]); }
  return p;
}
export function squadR(n) { return GAP * .52 * Math.sqrt(Math.min(n, 60)) + 13; }

/* ── 레벨 설계 ── */
export function makeLevel(L) {
  const st = STAGES[stageOf(L)], ev = [], rows = Math.min(4 + Math.round(L * .7), 18);
  const space = Math.max(400, 470 - L * 4);
  // 패턴을 돌리되, 가끔 이웃끼리 자리를 바꿔 같은 종류라도 판마다 조금씩 다르게
  const seq = [];
  for (let i = 0; i < rows; i++) seq.push(st.pat[i % st.pat.length]);
  for (let i = 2; i < seq.length - 1; i++) if (Math.random() < .3) [seq[i], seq[i + 1]] = [seq[i + 1], seq[i]];
  seq[0] = 'gate';
  // 중간보스: 3레벨부터는 어느 스테이지든 한 판 가운데쯤 한 번은 나온다
  if (L >= 3 && !seq.includes('giant')) { const m = seq.indexOf('mob', Math.floor(seq.length / 3)); if (m > 0) seq[m] = 'giant'; }
  // 대군 돌격(horde): 2레벨부터 한 판에 한 번(7레벨부터 두 번) — 늘 같은 싸움이 되지 않게 판 흐름을 확 바꾼다
  if (L >= 2) {
    const at = [Math.round(seq.length * rnd(.35, .5))]; if (L >= 7) at.push(Math.round(seq.length * rnd(.75, .85)));
    for (const a of at) { const i = clamp(a, 2, seq.length - 1); seq[i] = 'horde'; if (seq[i - 1] !== 'gate') seq[i - 1] = 'gate'; }
  }
  let d = 0;
  for (let i = 0; i < rows; i++) {
    let k = seq[i];
    if (k === 'giant' && L < 3) k = 'mob';
    ev.push({ d, kind: k, p: rows > 1 ? i / (rows - 1) : 1 });
    d += k === 'runner' ? space * .75 : k === 'horde' ? space * 2.4 : space;
  }
  ev.push({ d: d + 220, kind: 'boss', p: 1 });
  return { ev, length: d + 220 + 1150 - START + 600, stage: stageOf(L), boss: bossOf(L) };
}

export function newGame(L, hooks) {
  const lv = makeLevel(L);
  return {
    L, ev: lv.ev, length: lv.length, stage: lv.stage, bossKind: lv.boss, dist: START, next: 0, t: 0,
    speed: Math.min(176, 142 + L * 3),
    px: MID, tx: MID, n: 3, shown: 3, tier: 0, rank: 0, missiles: 1, rockets: [],
    rate: 5, dmg: 1, cd: 0, pow: 0, flash: 0,
    bullets: [], gates: [], mobs: [], groups: [], boxes: [], barrels: [], shells: [], boss: null,
    h: Object.assign({ burst: NOOP, spark: NOOP, float: NOOP, sfx: NOOP, buzz: NOOP, shake: NOOP, tint: NOOP, ring: NOOP, gateHit: NOOP, smoke: NOOP, blast: NOOP, die: NOOP, pts: NOOP, combo: NOOP, stop: NOOP }, hooks || {}),
    score: 0,        // 이 판 점수: 적 · 거인 · 타이어 · 보스 (레벨이 높을수록 크게, 연속 처치(콤보)면 더 크게)
    combo: 0, comboT: 0, bestCombo: 0,
    over: 0          // 0 진행 · 1 이김 · -1 짐
  };
}

/* ── 놓기 ── */
function gateVal(G, good, p) {
  const L = power(G.L), n = Math.max(1, G.n);
  if (good) {
    if (L >= 6 && Math.random() < .22 && n < 60) return { t: 'x', v: 2 };
    return { t: '+', v: ri(4, 8) + Math.round(L + n * .3 + p * 4) };
  }
  if (L >= 8 && Math.random() < .2) return { t: '/', v: 2 };
  return { t: '+', v: -(ri(3, 6) + Math.round(L + n * .4 + p * 5)) };
}
function makeParts(vals) {
  const k = vals.length, w = (ROAD_R - ROAD_L) / k;
  return vals.map((v, i) => ({ x0: ROAD_L + w * i + (i ? 3 : 0), x1: ROAD_L + w * (i + 1) - (i < k - 1 ? 3 : 0), t: v.t, v: v.v, hit: 0, acc: 0 }));
}
function mobGroup(G, y, c, hp, cx, opt = {}) {
  const L = power(G.L);
  const cols = opt.cols || clamp(Math.ceil(Math.sqrt(c * 1.6)), 2, 16), sp = opt.sp || 17;
  const w = (cols - 1) * sp;
  cx = clamp(cx, ROAD_L + 14 + w / 2, ROAD_R - 14 - w / 2);
  const side = opt.side != null ? opt.side : 40 + Math.min(L, 30) * 2.5;
  const grp = { alive: c, pop: 0, cx, hw: w / 2 + 6, side };   // 무리는 대형을 유지한 채 가운데(cx)만 내 쪽으로 옮겨 간다
  // 겉모습 등급(LV1~3): 레벨이 오를수록 · 한 판 뒤로 갈수록 높아짐 (세기와는 상관없음)
  const lv = opt.lv != null ? opt.lv : Math.min(2, Math.floor((G.L - 1) / 3 + (G.p || 0) * 1.5));
  G.groups.push(grp);
  for (let i = 0; i < c; i++) {
    const col = i % cols, row = Math.floor(i / cols), ox = -w / 2 + col * sp + rnd(-4, 4);
    G.mobs.push({
      ox, x: clamp(cx + ox, ROAD_L + 8, ROAD_R - 8), y: y - row * 16 + rnd(-4, 4), hp, max: hp,
      vy: opt.vy != null ? opt.vy : 14 + Math.min(L, 30) * 1.3, side,
      step: Math.random() * 6, g: grp, flash: 0, kb: 0, size: 1, hurt: 1, lv, bn: lv === 2 && c > 8 && i % 9 === 4
    });
  }
  return grp;
}
const mobCount = (L, p, k = 1) => Math.min(Math.round((5 + L * 2.7) * (1 + p * 1.1) * rnd(.85, 1.15) * k * 1.08), 360);   // ×1.08: 유도탄이 생긴 만큼
const mobHp = (L, p) => 1 + Math.floor(L / 5 + p * (L / 8));

function spawn(G, e, y) {
  const L = power(G.L), p = e.p, k = e.kind;
  G.p = p;
  if (k === 'gate' || k === 'swap') {
    let A = gateVal(G, true, p), B = gateVal(G, false, p);
    const n = Math.max(1, G.n), r = Math.random();
    if (G.next === 1) { A = { t: '+', v: 8 + Math.round(L * 2.5) }; B = { t: '+', v: ri(1, 3) }; }   // 첫 문은 넉넉히
    else if (k === 'gate' && G.L >= 2 && r < .28 && n < 70) {
      // 셈 문제: ×k 와 비슷한 크기의 +값 — 지금 부대 수로 계산해야 맞게 고른다(+쪽은 쏘면 더 오른다)
      const m = n < 14 ? 3 : 2; A = { t: 'x', v: m }; B = { t: '+', v: Math.max(3, Math.round(n * (m - 1) * rnd(.72, 1.25))) };
    } else if (k === 'gate' && G.L >= 2 && r < .46 && G.tier < TIERS.length - 1 && n > 8) {
      // 진급 문: 병사를 내주고 등급을 올린다(총 위력 ×1.6 · ×2.5) — 몇 명까지 내줘도 이득인지 따져 보기
      A = { t: 'T', v: Math.max(5, Math.round(n * rnd(.3, .45))) }; B = gateVal(G, true, p);   // 다른 쪽은 파란 문 — 둘 다 좋은 선택지
    } else if (k === 'gate' && G.L >= 2 && r < .58 && n > 6) {
      A = { t: 'M', v: Math.max(4, Math.round(n * rnd(.18, .3))) }; B = gateVal(G, true, p);   // 유도탄 문: 병사를 내주고 유도탄 3발
    }
    // 둘 다 마이너스(쏴서 올려야 함)
    else if (k === 'gate' && Math.random() < .18 + Math.min(.2, L * .012)) A = { t: '+', v: -(ri(2, 5) + Math.round(L * .4)) };
    if (Math.random() < .5) [A, B] = [B, A];
    G.gates.push({ y, h: 56, used: false, parts: makeParts([A, B]), swap: k === 'swap' ? rnd(.75, 1.05) : 0, swapT: 0 });
  } else if (k === 'gate3') {
    const vals = [gateVal(G, true, p), gateVal(G, false, p), Math.random() < .5 ? { t: '+', v: ri(1, 4) } : gateVal(G, false, p)];
    for (let i = 2; i > 0; i--) { const j = ri(0, i); [vals[i], vals[j]] = [vals[j], vals[i]]; }
    G.gates.push({ y, h: 56, used: false, parts: makeParts(vals), swap: 0, swapT: 0 });
  } else if (k === 'mob') {
    mobGroup(G, y, mobCount(L, p, G.stage === 'rush' ? .65 : 1), mobHp(L, p), rnd(ROAD_L + 60, ROAD_R - 60));
  } else if (k === 'runner') {   // 돌격대: 길을 가로지르는 한두 줄, 아주 빠르게 달려옴
    const c = Math.min(Math.round((3 + L * 1.1) * (1 + p * .7)), 60);
    mobGroup(G, y, c, 1, MID, { cols: Math.min(c, 15), sp: 19, vy: 90 + L * 3, side: 18, lv: 0 });
  } else if (k === 'giant') {    // 거인 하나 + 호위
    const grp = mobGroup(G, y, 1, Math.round((16 + L * 9) * (1 + p * .5)), rnd(ROAD_L + 80, ROAD_R - 80), { vy: 8 + L, side: 34, lv: 2 });
    const M = G.mobs[G.mobs.length - 1]; M.size = 2.3; M.hurt = 6 + Math.round(L * .8); grp.giant = M;
    M.mb = MIDS[(G.L + (G.mids = (G.mids || 0) + 1)) % MIDS.length];   // 중간보스 겉모습(번갈아)
    mobGroup(G, y + 40, Math.round(mobCount(L, p) * .25), mobHp(L, p), M.x);
  } else if (k === 'horde') {
    // 대군 돌격: 길 가운데를 빨간 군대가 빽빽이 메우고 곧장 밀려 내려온다(옆으로 따라오지 않음) + 한가운데 중간보스.
    // 양옆 좁은 길(LANE)에는 +1 문이 줄지어 서고, +100 같은 큰 문 · 보급 상자(닿기만 해도 열림)가 이어져 버틸 힘을 준다.
    const hx0 = ROAD_L + LANE, hx1 = ROAD_R - LANE, sp = 15, cols = Math.floor((hx1 - hx0) / sp);
    const c = Math.min(Math.round(mobCount(L, p) * 2.1), 300), hp = Math.max(1, Math.round(mobHp(L, p) * .5));
    const grp = mobGroup(G, y, c, hp, MID, { cols, sp, side: 0, vy: 34 + Math.min(L, 30) * 1.2 });
    grp.horde = true;
    const rowsN = Math.ceil(c / cols), depth = rowsN * 16;
    const gg = mobGroup(G, y - depth * .45, 1, Math.round((16 + L * 9) * (1 + p * .5) * .8), MID, { vy: 34 + Math.min(L, 30) * 1.2, side: 0, lv: 2 });
    const M = G.mobs[G.mobs.length - 1]; M.size = 2.3; M.hurt = 6 + Math.round(L * .8); gg.giant = M;
    M.mb = MIDS[(G.L + (G.mids = (G.mids || 0) + 1)) % MIDS.length];
    // 양옆 지원: 대군보다 조금 앞에서 시작해 대군이 다 지나갈 때까지
    const big = Math.random() < .5 ? 0 : 1, len = depth + 520, stepY = 72, minusAt = [ri(6, 8), ri(6, 8)];
    [0, 1].forEach(sd => {
      const x0 = sd ? ROAD_R - LANE + 4 : ROAD_L, x1 = sd ? ROAD_R : ROAD_L + LANE - 4, cx = (x0 + x1) / 2;
      let k2 = 0;
      for (let yy = y + 120 + sd * 31; yy > y - len; yy -= stepY, k2++) {
        const roll = k2 % 5;
        if (k2 === 4) G.gates.push(laneGate(x0, x1, yy, (sd === big ? 1 : -1) * (L >= 4 ? 100 : 50)));   // 같은 높이에 한쪽 +100 · 반대쪽 -100 — 잘 골라야
        else if (k2 === minusAt[sd] || k2 === minusAt[sd] + 6) G.gates.push(laneGate(x0, x1, yy, -10 * ri(1, 3)));   // 줄 중간중간 -10 · -20 · -30 (쏘면 줄어듦)
        else if (roll === 2 + sd) {                                               // 보급 상자: 무기 · 연사 · 유도탄
          const r = Math.random(), gift = G.tier < TIERS.length - 1 && r < .3 ? 'tier' : r < .55 ? 'missile' : r < .8 ? 'rate' : 'dmg';
          const bh = Math.round((4 + L * 1.2) * (1 + p * .3));
          G.boxes.push({ x: cx, y: yy, w: 54, h: 40, hp: bh, max: bh, gift, flash: 0, pop: 0, lane: true });
        } else G.gates.push(laneGate(x0, x1, yy, sd === big ? 1 : ri(1, 3)));                         // +1 +1 +1 …
      }
    });
    G.h.horde && G.h.horde(MID_NAME[M.mb]);
  } else if (k === 'siege') {    // 양쪽 끝에서 두 무리, 가운데로 모여듦
    const c = mobCount(L, p, .44), hp = mobHp(L, p);
    mobGroup(G, y, c, hp, ROAD_L + 40, { side: 70 + L * 3 });
    mobGroup(G, y - 60, c, hp, ROAD_R - 40, { side: 70 + L * 3 });
  } else if (k === 'barrel') {   // 무리 앞 드럼통: 쏘면 터져 둘레를 쓸어버림
    const cx = rnd(ROAD_L + 70, ROAD_R - 70);
    mobGroup(G, y - 50, mobCount(L, p, 1.5), mobHp(L, p), cx);
    const nb = 2 + (Math.random() < .5 ? 1 : 0);
    for (let i = 0; i < nb; i++) G.barrels.push({ x: clamp(cx + (i - (nb - 1) / 2) * 60 + rnd(-10, 10), ROAD_L + 20, ROAD_R - 20), y: y + 10 + rnd(-10, 10), hp: 3 + Math.round(L * .4), flash: 0 });
  } else if (k === 'box') {
    const hp = Math.round((14 + L * 6) * (1 + p * .7));
    const r = Math.random(), gift = G.tier < TIERS.length - 1 && r < .28 ? 'tier' : r < .5 ? 'missile' : r < .75 ? 'rate' : 'dmg';
    const two = L >= 6 || G.stage === 'armory';   // 두 개 나란히(하나만 고를 수 있게)
    const xs = two ? [ROAD_L + 50, ROAD_R - 50] : [rnd(ROAD_L + 60, ROAD_R - 60)];
    xs.forEach((x, i) => G.boxes.push({ x, y, w: 92, h: 46, hp: i ? Math.round(hp * 1.15) : hp, max: hp, gift: i ? (gift === 'missile' ? 'rate' : 'missile') : gift, flash: 0, pop: 0 }));
  } else if (k === 'boss') {
    const tank = G.bossKind === 'tank';
    const hp = Math.round((120 + L * 95 + L * L * 5) * (tank ? .9 : 1) * 1.08);
    const look = bossLook(G.L);
    G.boss = { kind: G.bossKind, animal: look.animal, evo: look.evo, x: MID, y: y - 40, r: tank ? 70 : 62, hp, max: hp, vy: tank ? 16 + L : 100 + Math.min(L, 20) * 3, stop: tank ? -560 : -800,
      t: 0, flash: 0, pop: 0, acc: 0, accT: 0, summon: 2.5, bite: 0, fire: 1.2, aim: 0 };
  }
}

// 옆길 문: 한 칸짜리, 그 길로 지나갈 때만 받는다(다른 곳으로 지나가면 그냥 지나침)
const LANE = 74;
function laneGate(x0, x1, y, v) { return { y, h: 44, used: false, lane: true, parts: [{ x0, x1, t: '+', v, hit: 0, acc: 0 }], swap: 0, swapT: 0 }; }
function lose(G, k, x, y, src) {
  if (k <= 0) return;
  if (G.lost) G.lost[src] = (G.lost[src] || 0) + k;
  G.n -= k; G.h.burst(x, y, 'blue', Math.min(k, 14));
}
function killMob(g, i, M) {
  g.combo = g.comboT > 0 ? g.combo + 1 : 1; g.comboT = 1.1; g.bestCombo = Math.max(g.bestCombo, g.combo);
  const pts = Math.round((M.size > 1 ? 60 : 10) * g.L * (1 + Math.min(g.combo, 100) * .02));   // 콤보 100 이면 3배
  g.score += pts; g.mobs.splice(i, 1); M.g.alive--; M.g.pop = 1; M.dead = true;
  g.h.burst(M.x, M.y, 'red', M.size > 1 ? 24 : 3); g.h.smoke(M.x, M.y, M.size > 1 ? 4 : 1);
  g.h.die(M, pts); g.h.combo(g.combo, M.x, M.y);
  if (M.size > 1) { g.h.shake(.4); g.h.stop(.09); g.h.float(M.x, M.y - 30, MID_NAME[M.mb] + ' 처치!', '#fde047', 30); }
}
function explode(g, x, y, dmg = 20, R = 80, kind = 'gold') {   // 폭발(드럼통 · 유도탄): 둘레 적을 쓸어버리고 타이어도 깎는다
  const h = g.h, R2 = R * R;
  h.blast(x, y, kind); h.burst(x, y, 'gold', 30); h.smoke(x, y, 6); h.ring(x, y, kind); h.shake(.35); h.sfx('boom'); h.buzz(50); h.stop(.05);
  let killed = 0;
  for (let i = g.mobs.length - 1; i >= 0; i--) { const M = g.mobs[i], dx = M.x - x, dy = M.y - y, rr = R + (M.size - 1) * 20; if (dx * dx + dy * dy < rr * rr) { M.hp -= dmg; M.flash = .1; if (M.hp <= 0) { killMob(g, i, M); killed++; } } }
  for (const X of g.boxes) if (Math.abs(X.x - x) < R + 20 && Math.abs(X.y - y) < R) { X.hp -= dmg * 1.5; X.flash = .1; }
  for (const b of g.barrels) if (!b.dead && Math.abs(b.x - x) < 90 && Math.abs(b.y - y) < 90) { b.hp = 0; b.chain = .12; }
  if (killed) h.float(x, y - 20, '펑! ' + killed, '#fde047', 30);
  return killed;
}

/* ── 유도탄: 따로 쏘는 아이템. 보스 → 중간보스 → 가장 큰 무리 순으로 쫓아가 터진다 ── */
const missileDmg = g => (18 + power(g.L) * 4) * TIERS[g.tier].mul;
function missileTarget(g, skip) {
  const top = -RANGE - 100;
  if (g.boss) return g.boss;   // 보스는 보이기만 하면 어디든 쫓아간다
  for (const M of g.mobs) if (M.size > 1 && M.y > top && M.y < 0 && !skip.has(M)) return M;
  let best = null, bs = 0;
  for (const q of g.groups) {
    if (skip.has(q)) continue;
    let lead = null; for (const M of g.mobs) if (M.g === q && M.y > top && M.y < 0 && (!lead || M.y > lead.y)) lead = M;
    if (lead && q.alive > bs) { bs = q.alive; best = lead; }
  }
  if (best) return best;
  for (const X of g.boxes) if (X.y > top && X.y < 0 && !skip.has(X)) return X;
  return null;
}
export function fireMissile(g) {
  if (!g.missiles || g.over) return false;
  const busy = new Set(); for (const r of g.rockets) if (r.tg) { busy.add(r.tg); if (r.tg.g) busy.add(r.tg.g); }
  const tg = missileTarget(g, busy) || missileTarget(g, new Set());
  if (!tg) { if (!(g.t - (g.noTg || -9) < 1)) { g.noTg = g.t; g.h.float(g.px, -40, '쏠 곳이 없어요', '#cbd5e1', 22); } return false; }   // 아무것도 없으면 아끼기(안내는 1초에 한 번)
  g.missiles--;
  const side = g.rockets.length % 2 ? 1 : -1;
  g.rockets.push({ x: g.px + side * 14, y: -10, vx: side * rnd(160, 260), vy: -200, tg, life: 3, t: 0, tier: g.tier });
  g.h.sfx('missile'); g.h.buzz(20);
  return true;
}
const gone = (g, t) => !t || t.dead || (t.hp != null && t.hp <= 0) || (t.kind && t !== g.boss) || (t.gift && !g.boxes.includes(t));
function stepRockets(g, dt) {
  for (let i = g.rockets.length - 1; i >= 0; i--) {
    const r = g.rockets[i]; r.t += dt; r.life -= dt;
    if (gone(g, r.tg)) r.tg = missileTarget(g, new Set());
    const tg = r.tg, sp = Math.min(900, 300 + r.t * 900);
    let dx = 0, dy = -1;
    if (tg) { dx = tg.x - r.x; dy = tg.y - r.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; }
    const turn = Math.min(1, dt * (3 + r.t * 12)), v = Math.hypot(r.vx, r.vy) || 1;
    let vx = r.vx / v, vy = r.vy / v;
    vx += (dx - vx) * turn; vy += (dy - vy) * turn; const n = Math.hypot(vx, vy) || 1;
    r.vx = vx / n * sp; r.vy = vy / n * sp; r.x += r.vx * dt; r.y += r.vy * dt;
    const hitT = tg && Math.hypot(tg.x - r.x, tg.y - r.y) < (tg.r ? tg.r * .8 : 24);
    if (hitT || r.life <= 0 || r.y < SPAWN) {
      g.rockets.splice(i, 1);
      const dmg = missileDmg(g);
      explode(g, r.x, r.y, dmg, 70 + r.tier * 15, 'missile');
      const K = g.boss;
      if (K && Math.hypot(K.x - r.x, K.y - r.y) < K.r + 60) { const d = dmg * 2.5; K.hp -= d; K.flash = .12; K.pop = 1; g.h.float(K.x, K.y - 30, '-' + Math.round(d), '#c4b5fd', 36); }
    }
  }
}

/* ── 한 장면 ── */
export function step(G, dt) {
  if (G.over) return;
  const g = G, h = g.h;
  g.t += dt;
  g.dist += g.speed * dt;
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
  while (g.next < g.ev.length && g.dist >= g.ev[g.next].d) { const e = g.ev[g.next++]; spawn(g, e, SPAWN + (g.dist - e.d)); }

  const R = squadR(g.n);
  g.tx = clamp(g.tx, ROAD_L + R * .7, ROAD_R - R * .7);
  g.px += (g.tx - g.px) * Math.min(1, dt * 14);

  setTier(g, countTier(g));   // 병사 수가 30 · 80 을 넘으면 진급(모습 · 무기 · 총알이 함께 바뀜)
  // 사격: 총알 수는 병사 수만큼(최대 18), 위력은 병사 수에 따라 커짐
  const T = TIERS[g.tier];
  g.cd -= dt; g.flash = Math.max(0, g.flash - dt);
  if (g.cd <= 0 && g.n > 0) {
    g.cd = 1 / g.rate; g.flash = .06;
    const shots = Math.min(g.n, 18), per = g.dmg * T.mul * Math.pow(g.n, .72) / shots * .85;
    const pos = squadPos(g.n), tg = targets(g);
    for (let s = 0; s < shots; s++) {
      const q = pos[s] || [0, 0], bx = g.px + q[0], by = q[1] - 10;
      // 조준 보정: 앞쪽 가까운 적(타이어 · 드럼통 · 보스 포함)을 향해 살짝 꺾여 날아간다
      let best = null, bs = 1e9;
      for (const t of tg) { const dy = by - t.y, dx = Math.abs(t.x - bx); if (dy < 20 || dx > 50 + dy * .12) continue; const sc = dx * 2 + dy * .35 + (t.used || 0) * 18; if (sc < bs) { bs = sc; best = t; } }
      let vx = rnd(-4, 4);
      if (best) { best.used = (best.used || 0) + 1; vx = (best.x - bx) / ((by - best.y) / BV) + rnd(-3, 3); }
      g.bullets.push({ x: bx, y: by, y0: by, d: per, vx });
    }
    h.sfx('shot');
  }
  stepRockets(g, dt);
  for (let b = g.bullets.length - 1; b >= 0; b--) {
    const B = g.bullets[b]; B.y -= BV * dt; B.x += B.vx * dt;
    if (B.y < B.y0 - RANGE || hitAny(g, B)) g.bullets.splice(b, 1);
  }
  // 문
  for (const gt of g.gates) {
    gt.y += g.speed * dt;
    for (const p of gt.parts) p.hit = Math.max(0, p.hit - dt * 5);
    if (gt.swap && !gt.used) {   // 바뀌는 문: 일정 시간마다 두 값이 자리를 바꾼다
      gt.swapT += dt;
      if (gt.swapT >= gt.swap) { gt.swapT = 0; const [a, b] = gt.parts; [a.t, a.v, a.gain, a.acc, b.t, b.v, b.gain, b.acc] = [b.t, b.v, b.gain, b.acc, a.t, a.v, a.gain, a.acc]; a.hit = b.hit = .6; }
    }
    if (!gt.used && gt.y >= -6) {
      gt.used = true;
      if (gt.lane) {   // 옆길 문: 부대가 그 길에 걸쳐 있으면 받는다(큰 부대는 길 끝까지 못 가니 부대 반지름만큼 넉넉히)
        const q = gt.parts[0], tol = 3 + R * .55;
        if (g.px < q.x0 - tol || g.px > q.x1 + tol) { q.taken = true; continue; }
      }
      const p = gt.parts.find(q => g.px >= q.x0 - 3 && g.px <= q.x1 + 3) || (gt.lane ? gt.parts[0] : null) || gt.parts[0], before = g.n;
      if (p.t === 'T' || p.t === 'M') {   // 내주고 얻는 문: 병사가 모자라면 아무 일도 없다
        if (g.n <= p.v) { h.float(g.px, -40, '병사가 모자라요', '#fca5a5', 30); h.sfx('gateDown'); p.taken = true; continue; }
        const pay = p.v, maxed = p.t === 'T' && g.tier >= TIERS.length - 1;   // 이미 최고 등급이면 진급 대신 유도탄
        lose(g, pay, g.px, 0, 'trade');
        if (p.t === 'T' && !maxed) promote(g, g.px, -60);
        else { g.missiles += 3; h.float(g.px, -60, '유도탄 +3', '#facc15', 40); }
        h.float(g.px, -10, '-' + pay, '#f87171', 30);
        h.sfx('power'); h.tint('gold'); h.ring(g.px, 0, 'gold'); h.stop(.08); h.buzz(40);
        p.taken = true; continue;
      }
      const after = Math.max(0, Math.round(p.t === 'x' ? g.n * p.v : p.t === '/' ? g.n / p.v : g.n + p.v));
      if (after < before) { lose(g, before - after, g.px, 0, 'gate'); h.sfx('gateDown'); h.buzz(60); h.shake(.3); h.tint('red'); }
      else { g.n = after; h.sfx('gateUp'); h.tint('blue'); h.ring(g.px, 0, 'blue'); }
      h.float(g.px, -40, (after >= before ? '+' : '') + (after - before), after >= before ? '#7dd3fc' : '#f87171', 34);
      p.taken = true;
    }
  }
  g.gates = g.gates.filter(gt => gt.y < 160);
  // 적: 무리 가운데가 내 쪽으로 오고, 각자는 자기 자리(가운데 + ox)로
  for (const q of g.groups) {
    if (q.cx == null) continue;
    const near = g.mobs.some(M => M.g === q && M.y > -520);
    if (near) { const lim = Math.max(0, (ROAD_R - ROAD_L) / 2 - q.hw - 8), want = clamp(g.px, MID - lim, MID + lim); q.cx += Math.sign(want - q.cx) * Math.min(Math.abs(want - q.cx), q.side * dt); }
  }
  for (let i = g.mobs.length - 1; i >= 0; i--) {
    const M = g.mobs[i];
    M.flash = Math.max(0, M.flash - dt); M.kb = Math.max(0, M.kb - dt * 60);
    M.y += (g.speed + M.vy) * dt - M.kb * dt * 8; M.step += dt * (M.size > 1 ? 6 : 13);
    const want = clamp(M.g.cx + M.ox, ROAD_L + 8, ROAD_R - 8); M.x += Math.sign(want - M.x) * Math.min(Math.abs(want - M.x), (M.side + 30) * dt);
    const dx = M.x - g.px, dy = M.y, reach = R + 4 + (M.size - 1) * 14;
    if (dy > -R * .9 - (M.size - 1) * 10 && dy < R * .8 && Math.abs(dx) < reach) {
      g.mobs.splice(i, 1); M.g.alive--; M.dead = true; h.die(M, 0); const k = Math.min(g.n, M.hurt); lose(g, k, M.x, M.y, M.size > 1 ? 'giant' : 'mob'); h.shake(M.size > 1 ? .4 : .12); h.sfx('hurt'); h.burst(M.x, M.y, 'red', 5);
      if (M.size > 1) h.float(g.px, -40, '-' + k, '#f87171', 34);
      continue;
    }
    if (M.y > 150) { g.mobs.splice(i, 1); M.g.alive--; M.dead = true; }
  }
  g.groups = g.groups.filter(q => { q.pop = Math.max(0, q.pop - dt * 6); return q.alive > 0; });
  // 드럼통
  for (let j = g.barrels.length - 1; j >= 0; j--) {
    const b = g.barrels[j]; b.y += g.speed * dt; b.flash = Math.max(0, b.flash - dt);
    if (b.hp <= 0) { b.chain = (b.chain || 0) - dt; if (b.chain <= 0) { g.barrels.splice(j, 1); explode(g, b.x, b.y); } continue; }
    if (b.y > -R * .6 && b.y < R * .6 && Math.abs(b.x - g.px) < R * .7 + 12) { g.barrels.splice(j, 1); explode(g, b.x, b.y); const k = Math.min(g.n, 4 + Math.round(power(g.L) * .6)); lose(g, k, g.px, 0, 'barrel'); h.float(g.px, -40, '-' + k, '#f87171', 34); continue; }
    if (b.y > 160) g.barrels.splice(j, 1);
  }
  // 타이어 더미
  for (let j = g.boxes.length - 1; j >= 0; j--) {
    const X = g.boxes[j]; if (!X) continue; X.y += g.speed * dt; X.flash = Math.max(0, X.flash - dt); X.pop = Math.max(0, X.pop - dt * 6);
    if (X.hp <= 0) { breakBox(g, X); continue; }
    if (X.y + X.h / 2 > -R * .6 && X.y - X.h / 2 < R * .6 && Math.abs(X.x - g.px) < X.w / 2 + R * .5) {
      if (X.lane) { breakBox(g, X); continue; }   // 옆길 보급 상자는 닿기만 해도 열린다
      g.boxes.splice(j, 1); const loss = Math.min(Math.ceil(g.n * .45), Math.ceil(X.hp / 5)); lose(g, loss, g.px, 0, 'box'); h.shake(.4); h.buzz(80); h.sfx('boom');
      h.float(g.px, -40, '-' + loss, '#f87171', 34); h.burst(X.x, X.y, 'tire', 18); continue;
    }
    if (X.y > 160) g.boxes.splice(j, 1);
  }
  // 보스
  const K = g.boss;
  if (K) {
    K.t += dt; K.flash = Math.max(0, K.flash - dt); K.fcd = (K.fcd || 0) - dt; K.pop = Math.max(0, K.pop - dt * 6);
    K.accT -= dt; if (K.acc > 0 && K.accT <= 0) { h.float(K.x + rnd(-30, 30), K.y - 20, '-' + Math.round(K.acc), '#fde68a', 20, true); K.acc = 0; K.accT = .15; }
    const PL = power(g.L);
    if (K.kind === 'tank') {
      // 대포 탱크: 멀리서 멈춰 내 자리에 포탄을 쏜다(빨간 원이 보이면 피하기), 천천히 밀고 들어온다
      K.y += (K.y < K.stop ? Math.max(g.speed, 120) * 1.1 : K.vy) * dt;
      const dx = g.px - K.x; K.x += Math.sign(dx) * Math.min(Math.abs(dx), 30 * dt);
      K.aim = Math.atan2(g.px - K.x, -K.y);
      if (K.y > K.stop) {
        K.fire -= dt;
        if (K.fire <= 0) {
          K.fire = Math.max(1.4, 2.6 - PL * .07);
          const tx = clamp(g.px + rnd(-20, 20), ROAD_L + 30, ROAD_R - 30);
          g.shells.push({ x: tx, y: -6, sx: K.x, sy: K.y + 30, t: 0, T: 1.2, r: 50 });
          h.sfx('cannon'); h.shake(.12); h.spark(K.x, K.y + 40, 'gold', 6);
          if (Math.random() < .5) { const c = Math.min(3 + Math.floor(PL), 24); mobGroup(g, K.y + 40, c, 1 + Math.floor(PL / 5), K.x + rnd(-60, 60), { vy: 40 + PL * 2, side: 60 + PL * 3 }); }
        }
      }
    } else {
      // 근육 대장: 곧장 성큼성큼 걸어오며 내 쪽으로 몸을 튼다, 졸병을 부른다
      K.y += (K.y < K.stop ? Math.max(g.speed, K.vy) * 1.1 : K.vy) * dt;
      const dx = g.px - K.x; K.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt);
      if (K.y > K.stop) {
        K.summon -= dt;
        if (K.summon <= 0) {
          K.summon = Math.max(1.8, 4 - PL * .1);
          mobGroup(g, K.y + 30, Math.min(4 + Math.floor(PL * 1.2), 36), 1 + Math.floor(PL / 5), K.x + rnd(-40, 40), { vy: 40 + PL * 2, side: 60 + PL * 3 });
        }
      }
    }
    if (K.y > -R * .4 - K.r) {
      K.y = -R * .4 - K.r; K.bite -= dt;
      if (K.bite <= 0) { K.bite = .25; lose(g, 2 + Math.floor(PL / 4), g.px, 0, 'bite'); h.shake(.25); h.sfx('hurt'); h.buzz(40); }
    }
  }
  // 포탄
  for (let i = g.shells.length - 1; i >= 0; i--) {
    const s = g.shells[i]; s.t += dt;
    if (s.t >= s.T) {
      g.shells.splice(i, 1); h.blast(s.x, s.y); h.burst(s.x, s.y, 'gold', 16); h.smoke(s.x, s.y, 4); h.shake(.3); h.sfx('boom');
      const zone = s.r + R * .5, dd = Math.abs(g.px - s.x);
      if (dd < zone) { const f = 1 - dd / zone, k = Math.min(g.n, Math.ceil(f * (g.n * .14 + 2 + PLx(g) * .2))); lose(g, k, g.px, 0, 'shell'); h.float(g.px, -40, '-' + k, '#f87171', 34); h.tint('red'); h.buzz(80); }
    }
  }
  g.shown = g.shown > g.n ? Math.max(g.n, g.shown - Math.max(1, (g.shown - g.n) * dt * 10)) : g.n;

  if (g.n <= 0) { g.n = 0; g.over = -1; g.rockets = []; g.bullets = []; return; }
  if (K && K.hp <= 0) {
    h.burst(K.x, K.y, 'red', 50); h.burst(K.x, K.y, 'gold', 40); h.ring(K.x, K.y, 'gold'); h.blast(K.x, K.y);
    g.score += 1000 * g.L; h.pts(K.x, K.y, 1000 * g.L, true); h.stop(.25);
    g.boss = null; g.shells = []; g.rockets = []; g.bullets = []; h.shake(.6); h.buzz([60, 40, 120]); h.sfx('boom'); g.over = 1;
    for (const M of g.mobs) h.burst(M.x, M.y, 'red', 1);
    g.mobs = []; g.groups = [];
  }
}
const PLx = g => power(g.L);
// 문 한 칸을 고르면 부대가 어떻게 되는지(자동 조종 어림값)
export function partValue(G, p) {
  const n = G.n;
  if (p.t === 'T') return G.tier < TIERS.length - 1 ? (n - p.v) * TIERS[G.tier + 1].mul / TIERS[G.tier].mul : n - p.v;
  if (p.t === 'M') return n - p.v + 9;
  return p.t === 'x' ? n * p.v : p.t === '/' ? n / p.v : n + p.v;
}

function breakBox(g, X) {
  const h = g.h;
  g.score += 30 * g.L; h.pts(X.x, X.y, 30 * g.L); h.stop(.06);
  g.boxes = g.boxes.filter(o => o !== X);
  h.burst(X.x, X.y, 'tire', 26); h.burst(X.x, X.y, 'gold', 16); h.ring(X.x, X.y, 'gold'); h.smoke(X.x, X.y, 3);
  // 나란한 짝은 함께 사라진다(하나만 얻음)
  if (!X.lane) g.boxes = g.boxes.filter(o => { if (!o.lane && Math.abs(o.y - X.y) < 4) { h.burst(o.x, o.y, 'tire', 10); return false; } return true; });
  if (X.gift === 'tier' && g.tier < TIERS.length - 1) promote(g, X.x, X.y - 10);
  else if (X.gift === 'missile') { g.missiles += 3; h.float(X.x, X.y - 10, '유도탄 +3!', '#facc15', 28); }
  else if (X.gift === 'rate') { g.rate = Math.min(14, g.rate * 1.25); h.float(X.x, X.y - 10, '연사 UP!', '#facc15', 28); }
  else { g.dmg = +(g.dmg * 1.3).toFixed(2); h.float(X.x, X.y - 10, '위력 UP!', '#facc15', 28); }
  g.pow++; h.shake(.25); h.sfx('power'); h.buzz(40);
}

// 조준 후보: 앞쪽(사거리 안)의 적 · 타이어 · 드럼통 · 보스
function targets(g) {
  const t = [], top = -RANGE + 40;
  for (const M of g.mobs) if (M.y < -10 && M.y > top) t.push({ x: M.x, y: M.y + g.speed * .15 });
  for (const X of g.boxes) if (X.y < -10 && X.y > top) t.push({ x: X.x + rnd(-X.w * .3, X.w * .3), y: X.y });
  for (const b of g.barrels) if (b.hp > 0 && b.y < -10 && b.y > top) t.push({ x: b.x, y: b.y });
  if (g.boss && g.boss.y > top) for (let i = 0; i < 6; i++) t.push({ x: g.boss.x + rnd(-g.boss.r * .6, g.boss.r * .6), y: g.boss.y });
  return t;
}
function hitAny(g, B) {
  const h = g.h, K = g.boss;
  if (K && Math.abs(B.x - K.x) < K.r && Math.abs(B.y - K.y) < K.r * .7) {
    K.hp -= B.d; K.acc += B.d; if (!(K.fcd > 0)) { K.flash = .05; K.fcd = .16; } K.pop = 1;   // 번쩍임은 가끔만(연사에 하얗게 바래지 않게)
    h.spark(B.x, K.y + K.r * .5, 'gold', 2); h.sfx('hit'); h.shake(.05); return true;
  }
  for (const b of g.barrels) {
    if (b.hp > 0 && Math.abs(B.x - b.x) < 14 && Math.abs(B.y - b.y) < 14) { b.hp -= 1; b.flash = .06; h.spark(B.x, b.y + 6, 'hot', 2); return true; }
  }
  for (let i = 0; i < g.mobs.length; i++) {
    const M = g.mobs[i], hw = 13 * M.size, hh = 15 * M.size;
    if (Math.abs(B.x - M.x) < hw && Math.abs(B.y - M.y) < hh) {
      const left = B.d - M.hp; M.hp -= B.d; M.flash = .08; M.kb = M.size > 1 ? 1 : 6; h.spark(B.x, M.y + 4, 'hot', 2);
      if (M.hp <= 0) { B.d = left; killMob(g, i, M); return B.d < .3; }
      h.sfx('hit');
      return true;
    }
  }
  for (const X of g.boxes) {
    if (Math.abs(B.x - X.x) < X.w / 2 && Math.abs(B.y - X.y) < X.h / 2) {
      X.hp -= B.d; X.flash = .05; X.pop = 1; h.spark(B.x, X.y + X.h / 2, 'hot', 2); h.sfx('hit');
      if (X.hp <= 0) breakBox(g, X);
      return true;
    }
  }
  for (const gt of g.gates) {
    if (gt.used || Math.abs(B.y - gt.y) > gt.h / 2) continue;
    for (const p of gt.parts) {
      if (B.x >= p.x0 && B.x <= p.x1) {
        // 처음엔 한 발에 +1, 많이 올릴수록 조금씩 더 맞혀야 오른다(무한정 커지지 않게)
        if (p.t === '+' && gt.y > -820) { p.acc += 1; const need = 1 + Math.floor((p.gain || 0) / 3); if (p.acc >= need) { p.acc = 0; p.v++; p.gain = (p.gain || 0) + 1; p.hit = 1; h.gateHit(gt, p, B.x); } }
        h.spark(B.x, gt.y + gt.h / 2, 'cool', 1);
        return true;
      }
    }
  }
  return false;
}

/* ── 자동 조종(균형 시험 · 확인용). skill 1 = 잘하는 사람, 0 = 대충 하는 사람 ── */
export function autoAim(G, skill, dt, mem) {
  mem.t = (mem.t || 0) - dt;
  if (mem.t > 0) { if (mem.x !== undefined) G.tx = mem.x; return; }
  mem.t = skill > .5 ? .12 : .45;
  const R = squadR(G.n);
  const pick = x => { mem.x = x + (1 - skill) * rnd(-50, 50); G.tx = mem.x; };
  // 포탄 피하기
  const sh = G.shells.find(s => s.T - s.t < .9 && Math.abs(s.x - G.px) < s.r + R * .5);
  if (sh && Math.random() < .3 + skill * .6) return pick(sh.x < MID ? Math.min(ROAD_R - 30, sh.x + sh.r + R) : Math.max(ROAD_L + 30, sh.x - sh.r - R));
  if (G.missiles && skill >= .5 && (G.boss || G.mobs.some(m => m.size > 1 && m.y > -700))) fireMissile(G);
  const near = G.boxes.filter(x => x.y > -230 && Math.abs(x.x - G.px) < x.w / 2 + R && !G.boxes.some(o => o !== x && Math.abs(o.y - x.y) < 4));
  if (near.length && skill > .3) { const x = near[0].x, w = near[0].w / 2 + R + 10; return pick(x < MID ? Math.min(ROAD_R - 30, x + w) : Math.max(ROAD_L + 30, x - w)); }
  const gt = G.gates.filter(x => !x.used && x.y > -520 && !(x.lane && partValue(G, x.parts[0]) < G.n)).sort((a, b) => b.y - a.y)[0];
  if (gt) {
    const val = p => partValue(G, p);
    let best = 0; gt.parts.forEach((p, i) => { if (val(p) > val(gt.parts[best])) best = i; });
    if (mem.gate !== gt) { mem.gate = gt; mem.wrong = Math.random() < (1 - skill) * .3; }
    if (mem.wrong) best = (best + 1) % gt.parts.length;
    const p = gt.parts[best]; return pick((p.x0 + p.x1) / 2);
  }
  const bar = G.barrels.filter(b => b.hp > 0 && b.y < -150).sort((a, b) => b.y - a.y)[0];
  if (bar && skill > .5) return pick(bar.x);
  if (G.boss) return pick(G.boss.x);
  const bxs = G.boxes.filter(x => x.y < -60);
  if (bxs.length) { const bx = bxs.sort((a, b) => (G.tier < TIERS.length - 1 && a.gift === 'tier' ? -1 : 0) - (G.tier < TIERS.length - 1 && b.gift === 'tier' ? -1 : 0) || a.hp - b.hp)[0]; return pick(bx.x); }
  const m = G.mobs.filter(x => x.y < 0).sort((a, b) => b.y - a.y)[0];
  if (m) return pick(m.x);
}
