/* 라스트샷 — 게임 규칙(화면 없음). 화면(game.js)과 균형 시험(node)이 같이 쓴다.
   좌표: 위에서 본 평면. x = 길 가로(ROAD_L ~ ROAD_R), y = 길 세로(내 부대 = 0, 앞쪽이 음수).
   물건은 SPAWN 에서 생겨 +y 로 다가온다. 화면은 이 평면을 3D 로 세워 그린다.
   레벨마다 스테이지 종류(구성 · 색)가 바뀌고, 보스도 번갈아 바뀐다. 레벨이 오를수록 + 한 판 뒤로 갈수록 세짐. */
export const ROAD_L = 34, ROAD_R = 326, MID = 180, SPAWN = -1150, RANGE = 1000, START = 680;
const GAP = 22, BV = 1150, BIN = 32;           // BV: 총알 속도                       // 병사 사이 간격
export const TIERS = [                // 부대 등급: 병사 수로만 정해진다(RANKUP) — 늘면 오르고 줄면 내려간다
  { name: '견습병', bullet: 0, mul: 1 },
  { name: '정예병', bullet: 1, mul: 1.6 },
  { name: '근위대장', bullet: 2, mul: 2.5 }
];
// 등급은 병사 수로만: 100명이면 정예병, 200명이면 근위대장. 줄면 그만큼 내려간다(95 · 190 아래 — 경계에서 깜빡이지 않게 5% 여유만)
export const RANKUP = [100, 200], RANKDOWN = [95, 190];
function countTier(g) {
  let t = g.tier;
  while (t < RANKUP.length && g.n >= RANKUP[t]) t++;
  while (t > 0 && g.n < RANKDOWN[t - 1]) t--;
  return t;
}
function setTier(g, t) {
  if (t === g.tier) return;
  const up = t > g.tier, h = g.h; g.tier = t;
  if (up) { if (h.promote) h.promote(t); else h.float(g.px, -60, 'LV' + (t + 1) + ' ' + TIERS[t].name + ' 진급!', '#facc15', 40); h.sfx('promote'); h.tint('gold'); h.ring(g.px, 0, 'gold'); h.buzz(40); }
  else { h.float(g.px, -60, 'LV' + (t + 1) + ' ' + TIERS[t].name, '#cbd5e1', 30); h.sfx('demote'); }
}
// 스테이지 종류: 구성(pat) · 화면 색(theme)
export const STAGES = {
  basic:   { name: '기본 훈련', sub: '문을 골라 부대를 키우세요', theme: 0, pat: ['gate', 'mob', 'gate', 'box', 'mob', 'gate', 'mob'] },
  rush:    { name: '돌격전', sub: '빠른 돌격대가 몰려와요 · 거인은 숫자가 0 이 될 때까지', theme: 1, pat: ['gate', 'runner', 'mob', 'gate', 'runner', 'giant', 'gate', 'runner', 'box', 'runner'] },
  serpent: { name: '뱀 행렬전', sub: '구불구불 긴 행렬 · 빙글 도는 원진', theme: 0, pat: ['gate', 'snake', 'gate', 'ring', 'box', 'snake', 'gate', 'ring', 'snake'] },
  maze:    { name: '문 미로', sub: '값이 바뀌는 문 · 세 갈래 문을 잘 고르세요', theme: 2, pat: ['gate', 'swap', 'mob', 'gate3', 'mob', 'swap', 'box', 'gate3', 'mob'] },
  armory:  { name: '무기고', sub: '타이어를 부숴 무기를 챙기고, 드럼통을 쏘면 펑!', theme: 3, pat: ['gate', 'box', 'barrel', 'gate', 'box', 'barrel', 'mob', 'gate', 'box', 'barrel'] },
  assault: { name: '대군 돌격', sub: '가운데로 끝없이 밀려오는 대군 · 양옆 숫자판으로 버티세요', theme: 1, pat: ['gate', 'mob', 'gate', 'horde', 'gate', 'box', 'mob'] },
  ambush:  { name: '매복전', sub: '흩어져 덮치는 적 · 방패벽은 빈틈으로!', theme: 2, pat: ['gate', 'swarm', 'gate', 'wall', 'box', 'flank', 'gate', 'swarm', 'wall', 'flank'] },
  siege:   { name: '포위전', sub: '양쪽에서 동시에 · 화살촉 돌격', theme: 4, pat: ['gate', 'siege', 'gate', 'wedge', 'box', 'siege', 'giant', 'gate', 'wedge', 'siege'] },
  legion:  { name: '총공격', sub: '길을 꽉 메운 대군이 끝없이 · 천둥번개를 챙기세요!', theme: 1, pat: ['gate', 'mob', 'gate', 'box', 'flood', 'gate', 'mob', 'gate', 'box', 'flood'] }
};
// 레벨 순서: 2 돌격 · 3 뱀 · 4 미로 · 5 무기고 · 6 대군 · 7 매복 · 8 포위 · 9 총공격 → 10 부터 다시(더 세게)
const ORDER = ['rush', 'serpent', 'maze', 'armory', 'assault', 'ambush', 'siege', 'legion'];
const cycleOf = L => Math.floor((L - 2) / ORDER.length);
function orderOf(c) {   // 바퀴 c 의 스테이지 순서: 0 은 그대로, 1 부터는 c 로 정해지는 섞기(앞 바퀴 마지막과 같은 스테이지로 시작하지 않게)
  if (c <= 0) return ORDER;
  const a = ORDER.slice(); let s = c * 9301 + 49297;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 233 + 1013) % 65536; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  if (a[0] === orderOf(c - 1)[ORDER.length - 1]) [a[0], a[1]] = [a[1], a[0]];
  return a;
}
export const stageOf = L => L <= 1 ? 'basic' : orderOf(cycleOf(L))[(L - 2) % ORDER.length];
// 오늘의 변수: 3레벨부터 판마다 무작위로 하나(같은 레벨도 할 때마다 다르게)
export const TWISTS = {
  gold:   { name: '황금 러시', sub: '점수 2배 · 보급 상자가 많아요' },
  gust:   { name: '돌풍', sub: '적이 빨라요 · 대신 수가 적어요' },
  giants: { name: '거인의 날', sub: '중간보스가 여럿 나와요' },
  supply: { name: '보급의 날', sub: '문 숫자가 크고 문이 많아요' },
  elite:  { name: '정예 부대', sub: '단단한 정예병이 많아요 · 대신 수는 적어요' },
  storm:  { name: '천둥 폭풍', sub: '하늘에서 번개가 저절로 떨어져요' }
};
const TW_KEYS = Object.keys(TWISTS);
// 두 번째 바퀴부터 섞어 넣는 손님 요소(다른 스테이지의 것)
const GUESTS = ['runner', 'snake', 'ring', 'barrel', 'swarm', 'wall', 'flank', 'siege', 'wedge', 'giant'];
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
// 난이도(쉬움 · 중간 · 하드): 배수 1 = 원래 게임. 사용자 지시(2026-11-10) "난이도가 오르면 적이 잘 안 죽어야(더 많이 맞아야) · 유도탄은 박하게" — 적 수보다 적 체력 위주.
//   1레벨 잡졸 체력: 원래 2 → 중간 3 · 하드 5(병사 150명 기준 한 발 1.7 → 중간 2발 · 하드 3발, 적은 부대면 더) — 총알 한 발에 죽는 장면이 중간 이상에서는 거의 없게
//   mobs: 적 수(대군 물결에도), hp: 적 체력(잡졸 · 돌격대 · 거인 · 대군 · 보스 졸병 모두), boss: 보스 체력, gate: 좋은 문(+) 값,
//   msl: 유도탄이 늘어나는 모든 경로(문 · 상자 · 머니 · 지원군, 내림), startMsl: 레벨 시작 보상 유도탄(하드 0), n · missiles: 시작 병사 · 유도탄 더하기
//   그 밖(사용자 지시 2026-11-10 "난이도에 따라 달라지면 좋을 것"): mobVy 적 다가오는 속도, zig 잡졸 무리가 지그재그로 오는 비율, bad 나쁜 문 값, badP 둘 다 마이너스 문 비율,
//   swap 바뀌는 문 주기(작을수록 빨리 바뀜), stream 대군 물결 길이, helpK 지원군 양(병사 · 적 감소 · 보스 감소), comboK 콤보 점수, summon 보스 졸병 소환량, eliteK 정예병 비율
//   bul = 보스 탄막(1942 식): ring 원형 발수 · ringT 주기, aim 조준 연발 수 · aimT, fan 부채꼴(탱크) · fanT, spiral 나선(근육 대장, 탱크는 3단계), dash 돌진(근육 대장) · dashT,
//         spd 탄속 배수, dmg 한 발에 줄어드는 병사, phase 체력 70% · 40% 단계마다 격해짐, giant 거인(중간보스) 탄(3 부채꼴 / 8 원형) · giantT
//         gap 원형탄의 빈 틈(발 수, 그 틈으로 피한다), seq 하드: 패턴을 한 번에 하나씩 차례로(원형 → 부채꼴 → 나선 → 조준) + 사이에 쉼 rest
//   lv = 나오는 적 겉모습 레벨(LV1~3 → 0~2) 범위 (사용자 지시 2026-11-11): 쉬움 LV1 만, 중간 LV1 · LV2, 하드 LV2 · LV3
export const DIFFS = {
  easy:   { name: '쉬움', mobs: .7, hp: .8, boss: .7, gate: 1.25, msl: 1, startMsl: 1, n: 5, missiles: 2,
            mobVy: .9, zig: 0, bad: .8, badP: .7, swap: 1.3, stream: .85, helpK: 1, comboK: 1, summon: .7, eliteK: 0, lv: [0, 0],
            // 쉬움: 보스는 조준 미사일 한 발씩만
            bul: { ring: 0, ringT: 0, aim: 1, aimT: 3.4, fan: 0, fanT: 0, spiral: 0, dash: 0, dashT: 0, spd: .8, dmg: 1, phase: 0, giant: 0, giantT: 0 } },
  normal: { name: '중간', mobs: 1.1, hp: 1.55, boss: 1.5, gate: 1, msl: .7, startMsl: .7, n: 0, missiles: 0,
            mobVy: 1.05, zig: .25, bad: 1, badP: 1.15, swap: .9, stream: 1.1, helpK: .8, comboK: 1, summon: 1, eliteK: 1, lv: [0, 1],
            // 중간: 두 발 연속 조준(쉬움의 2배) + 틈 있는 원형(방사형)을 번갈아
            bul: { ring: 12, ringT: 5, gap: 3, aim: 2, aimT: 3, fan: 0, fanT: 0, spiral: 0, dash: 1, dashT: 10, spd: .95, dmg: 1, phase: 1, giant: 3, giantT: 3.4 } },
  hard:   { name: '하드', mobs: 1.3, hp: 2.5, boss: 3, gate: .8, msl: .4, startMsl: 0, n: 0, missiles: 0,
            mobVy: 1.2, zig: .5, bad: 1.25, badP: 1.5, swap: .65, stream: 1.3, helpK: .5, comboK: 1.25, summon: 1.4, eliteK: 1.3, lv: [1, 2],
            // 하드: 많이 쏘되 규칙적으로 — 패턴을 차례로 하나씩, 원형엔 늘 빈 틈, 패턴 사이 쉼
            bul: { seq: 1, ring: 26, gap: 4, aim: 4, fan: 7, spiral: 1, rest: .7, dash: 1, dashT: 8, spd: 1.12, dmg: 2, phase: 1, giant: 8, giantT: 3 } }
};
export const diffOf = d => DIFFS[d] ? d : 'normal';
export const mslGain = d => Math.floor(3 * DIFFS[diffOf(d)].msl);        // 문 · 상자에서 얻는 유도탄(원래 3)
export const moneyMissiles = d => Math.floor(10 * DIFFS[diffOf(d)].msl);  // 'Show me the money' 유도탄(원래 10)
let DK = DIFFS.normal, LVLK = 1;   // 지금 돌고 있는 판의 난이도(step 에서 맞춘다 — ARMY · LVK 와 같은 방식). LVLK: 1~2레벨은 난이도 배수를 덜(0.7 · 0.85), 3레벨부터 1
const FORMS = ['snake', 'wedge', 'wall', 'flank', 'ring', 'swarm'];
export const FORM_NAME = { snake: '뱀 행렬', wedge: '화살촉 돌격', wall: '방패벽', flank: '엇갈려 가로지르기', ring: '원진', swarm: '산개 습격' };
const speedOf = L => Math.min(176, 142 + L * 3);
// 대군이 밀려오는 시간(초): 레벨이 오를수록 길어진다
export const streamDur = (L, full) => (full ? 7 + Math.min(L, 24) * .3 : 9 + Math.min(L, 24) * .4) * DK.stream;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOOP = () => {};

const POS = [];   // 부대 자리표(해바라기 씨 배열) — 한 번 만들어 두고 앞에서부터 잘라 쓴다
for (let i = 0; i < 60; i++) { const a = i * 2.39996, r = GAP * .52 * Math.sqrt(i); POS.push([Math.cos(a) * r, Math.sin(a) * r * .8]); }
const POS_N = Array.from({ length: 61 }, (_, n) => POS.slice(0, n));
export const squadPos = n => POS_N[Math.max(0, Math.min(60, n | 0))];
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
  const cyc = cycleOf(L), ins = (k, n) => { for (let c = 0; c < n; c++) seq.splice(ri(2, seq.length - 1), 0, k); };
  // 리믹스: 두 번째 바퀴부터 다른 스테이지의 요소 하나를 손님으로 두 번(대군은 14레벨부터 손님으로도)
  if (cyc >= 1) {
    const pool = GUESTS.concat(L >= 14 ? ['horde'] : []).filter(k => !st.pat.includes(k)), gk = pool[ri(0, pool.length - 1)];
    let c = 0; for (let i = 2; i < seq.length && c < 2; i += 3) if (!['gate', 'gate3', 'swap', 'horde', 'flood', 'box'].includes(seq[i])) { seq[i] = gk; c++; }
    if (!c) ins(gk, 1);
  }
  const twist = L >= 3 && Math.random() < .7 ? TW_KEYS[ri(0, TW_KEYS.length - 1)] : null;
  if (twist === 'gold') ins('box', 2);
  if (twist === 'supply') ins('gate', 2);
  if (twist === 'giants') ins('giant', 2);
  // 중간보스: 3레벨부터 일반 무리가 있는 스테이지면 한 판 가운데쯤 한 번
  if (L >= 3 && !seq.includes('giant')) { const m = seq.indexOf('mob', Math.floor(seq.length / 3)); if (m > 0) seq[m] = 'giant'; }
  let d = 0;
  const rowsN = seq.length; let streams = 0;
  for (let i = 0; i < rowsN; i++) {
    let k = seq[i];
    if (k === 'giant' && L < 3) k = 'mob';
    if ((k === 'horde' || k === 'flood') && (L < 6 || ++streams > 2)) k = 'mob';   // 대군은 6레벨부터, 한 판에 두 번까지
    ev.push({ d, kind: k, p: rowsN > 1 ? i / (rowsN - 1) : 1 });
    d += k === 'runner' ? space * .75 : k === 'horde' || k === 'flood' ? space + streamDur(L, k === 'flood') * speedOf(L) : space;
  }
  ev.push({ d: d + 220, kind: 'boss', p: 1 });
  return { ev, length: d + 220 + 1150 - START + 600, stage: stageOf(L), boss: bossOf(L), twist };
}

const mkHooks = hooks => Object.assign({ burst: NOOP, spark: NOOP, float: NOOP, sfx: NOOP, buzz: NOOP, shake: NOOP, tint: NOOP, ring: NOOP, gateHit: NOOP, smoke: NOOP, blast: NOOP, die: NOOP, pts: NOOP, combo: NOOP, stop: NOOP }, hooks || {});
export function newGame(L, hooks, opts = {}) {
  const help = Math.min(4, opts.help || 0), money = !!opts.money, diff = diffOf(opts.diff), D = DIFFS[diff]; DK = D; LVLK = Math.min(1, .55 + L * .15);   // money: 졌을 때 'Show me the money?' 에 예 → 병사 100 · 유도탄 10 으로 시작   // 막힌 레벨 지원: 같은 레벨에서 연속으로 진 횟수(최대 4) — 1번마다 유도탄 +3 · 시작 병사 +8 · 적 -10% · 보스 체력 -8%
  const lv = makeLevel(L);
  return {
    L, diff, ev: lv.ev, length: lv.length, stage: lv.stage, bossKind: lv.boss, twist: lv.twist, stormT: 4, dist: START, next: 0, t: 0,
    speed: Math.min(176, 142 + L * 3),
    px: MID, tx: MID, n: (money ? 100 : 3) + Math.round(help * 8 * D.helpK) + D.n, shown: (money ? 100 : 3) + Math.round(help * 8 * D.helpK) + D.n, tier: money ? 1 : 0,
    missiles: Math.max(money ? moneyMissiles(diff) : 0, Math.floor((1 + Math.floor((L - 1) / 5)) * D.startMsl)) + Math.floor(help * 3 * D.msl) + D.missiles, help, money, rockets: [],
    rate: 5, dmg: 1, cd: 0, pow: 0, flash: 0,
    bullets: [], gates: [], mobs: [], groups: [], boxes: [], barrels: [], shells: [], orbs: [], boss: null,   // orbs: 보스 · 거인이 뿌리는 탄(피해야 함)
    h: mkHooks(hooks),
    score: 0,        // 이 판 점수: 적 · 거인 · 타이어 · 보스 (레벨이 높을수록 크게, 연속 처치(콤보)면 더 크게)
    combo: 0, comboT: 0, bestCombo: 0,
    stream: null, bolts: 0, boltCd: 0,
    over: 0          // 0 진행 · 1 이김 · -1 짐
  };
}

/* ── 놓기 ── */
function gateVal(G, good, p) {
  const L = power(G.L), n = Math.max(1, G.n);
  if (good) {
    if (L >= 6 && Math.random() < .22 && n < 60) return { t: 'x', v: 2 };
    return { t: '+', v: Math.round((ri(3, 6) + L * .8 + n * .22 + p * 3) * (G.twist === 'supply' ? 1.35 : 1) * DK.gate) };
  }
  if (L >= 8 && Math.random() < .2) return { t: '/', v: 2 };
  return { t: '+', v: -Math.round((ri(3, 6) + Math.round(L + n * .4 + p * 5)) * DK.bad) };
}
function makeParts(vals) {
  const k = vals.length, w = (ROAD_R - ROAD_L) / k;
  return vals.map((v, i) => ({ x0: ROAD_L + w * i + (i ? 3 : 0), x1: ROAD_L + w * (i + 1) - (i < k - 1 ? 3 : 0), t: v.t, v: v.v, hit: 0, acc: 0 }));
}
function mobGroup(G, y, c, hp, cx, opt = {}) {
  const L = power(G.L);
  c = Math.max(1, Math.min(c, MAXMOBS - G.mobs.length));   // 폰에서도 부드럽게: 한 화면 적 수 한도
  const cols = opt.cols || clamp(Math.ceil(Math.sqrt(c * 1.6)), 2, 16), sp = opt.sp || 17;
  const w = (cols - 1) * sp;
  cx = clamp(cx, ROAD_L + 14 + w / 2, ROAD_R - 14 - w / 2);
  const side = opt.side != null ? opt.side : 40 + Math.min(L, 30) * 2.5;
  const grp = { alive: c, pop: 0, cx, hw: w / 2 + 6, side };   // 무리는 대형을 유지한 채 가운데(cx)만 내 쪽으로 옮겨 간다
  // 겉모습 등급(LV1~3): 난이도 범위 안에서 병사마다 (세기와는 상관없음). 따로 정한 무리(돌격대 LV1 · 정예 줄 LV3 등)도 범위 안으로
  const lv0 = opt.lv != null ? lvClamp(opt.lv) : null;
  G.groups.push(grp);
  for (let i = 0; i < c; i++) {
    const col = i % cols, row = Math.floor(i / cols), ox = -w / 2 + col * sp + rnd(-4, 4), lv = lv0 != null ? lv0 : lvPick(G);
    G.mobs.push({
      ox, x: clamp(cx + ox, ROAD_L + 8, ROAD_R - 8), y: y - row * 16 + rnd(-4, 4), hp, max: hp,
      vy: (opt.vy != null ? opt.vy : 14 + Math.min(L, 30) * 1.3) * (G.twist === 'gust' ? 1.45 : 1) * (1 + (DK.mobVy - 1) * LVLK), side,
      step: Math.random() * 6, g: grp, flash: 0, kb: 0, size: 1, hurt: 1, lv, bn: lv === 2 && c > 8 && i % 9 === 4
    });
    if (c > 4 && Math.random() < elitePctG(G) * Math.min(1, .25 + (G.p || 0))) elite(G.mobs[G.mobs.length - 1], G.L);
  }
  return grp;
}
// 적 수 = 레벨 기본 + 지금 우리 부대 크기에 비례(ARMY^0.85 × 레벨 계수) — 부대가 작으면 적도 작게, 커지면 커져서 어느 레벨이든 늘 팽팽하게.
//   레벨이 오를수록 비례 계수가 커져 확실히 어려워진다. LVK = 스테이지 보정 × 오늘의 변수 보정
const MAXMOBS = 480;
let ARMY = 10, LVL = 1, LVK = 1;
// 스테이지마다 세기 보정(구성이 달라 같은 수라도 어려움이 다르다 — 균형 시험으로 맞춤)
const STAGE_K = { basic: 1, rush: 1, serpent: 1, maze: 1, armory: .65, assault: 1.45, ambush: .75, siege: .75, legion: .9 };
const mobCount = (L, p, k = 1) => Math.min(Math.round((4 + L * 1.4 + Math.pow(ARMY, .85) * (.45 + Math.min(LVL, 25) * .022)) * (.75 + p * .6) * rnd(.85, 1.15) * k * LVK), 420);
// 대군 물결: 초당 나오는 수도 같은 방식
const streamFlux = (G, full) => (5 + Math.pow(Math.max(1, G.n), .85) * (.22 + Math.min(G.L, 25) * .012)) * (full ? 1.25 : 1) * LVK;
const hpK = v => Math.max(1, Math.round(v * (1 + (DK.hp - 1) * LVLK)));   // 난이도 체력 배수(모든 적) — 1~2레벨은 조금 덜
const mobHp = (L, p) => hpK(1 + Math.floor(L / 4 * (.35 + .65 * Math.min(1, p * 1.6)) + p * (L / 5.5)));   // 판 앞쪽은 가볍게 시작해 뒤로 갈수록 단단하게
// 정예병(큰 몸집 · 은 투구 · 방패): 3레벨부터 무리 속에 섞인다 — 체력 4배, 닿으면 3명
const elitePct = Lv => Lv < 3 ? 0 : Math.min(.24, .03 * (Lv - 2));
const elitePctG = G => Math.min(.6, (G.twist === 'elite' ? Math.min(.45, elitePct(Math.max(G.L, 4)) * 2 + .08) : elitePct(G.L)) * DK.eliteK);
function elite(M, Lv) { M.hp = M.max = Math.round(M.hp * 4 + Lv * .4); M.size = 1.25; M.lv = DK.lv[1]; M.hurt = 3; M.elite = true; }   // 정예병은 그 난이도의 가장 높은 겉모습
// 적 겉모습 레벨(LV1~3 → 0~2)은 난이도 범위 안에서만 (사용자 지시 2026-11-11). 범위가 둘이면 판 뒤로 · 레벨이 오를수록 높은 쪽이 많아진다
const lvClamp = v => clamp(v, DK.lv[0], DK.lv[1]);
const lvPick = G => { const [a, b] = DK.lv; return a === b || Math.random() > clamp(.18 + (G.p || 0) * .4 + Math.min(G.L, 10) * .02, .18, .65) ? a : b; };

function spawn(G, e, y) {
  const L = power(G.L), p = e.p, k = e.kind;
  ARMY = Math.max(3, G.n); LVL = G.L; LVK = (STAGE_K[G.stage] || 1) * (G.twist === 'gust' || G.twist === 'elite' ? .8 : 1) * (1 - (G.help || 0) * .1 * DK.helpK) * (G.L >= 7 ? 1.2 : 1) * (1 + (DK.mobs - 1) * LVLK);   // 적 수 배수(1~2레벨은 덜)   // 7레벨부터 1.2배 (사용자 지시 2026-11-08)
  G.p = p;
  if (k === 'gate' || k === 'swap') {
    let A = gateVal(G, true, p), B = gateVal(G, false, p);
    const n = Math.max(1, G.n), r = Math.random();
    if (G.next === 1) { A = { t: '+', v: 6 + Math.round(L * 2) }; B = { t: '+', v: ri(1, 3) }; }   // 첫 문은 넉넉히
    else if (k === 'gate' && G.L >= 2 && r < .28 && n < 70) {
      // 셈 문제: ×k 와 비슷한 크기의 +값 — 지금 부대 수로 계산해야 맞게 고른다(+쪽은 쏘면 더 오른다)
      const m = n < 14 ? 3 : 2; A = { t: 'x', v: m }; B = { t: '+', v: Math.max(3, Math.round(n * (m - 1) * rnd(.72, 1.25))) };
    } else if (k === 'gate' && G.L >= 2 && r < .42 && n > 6) {
      A = { t: 'M', v: Math.max(4, Math.round(n * rnd(.18, .3))) }; B = gateVal(G, true, p);   // 유도탄 문: 병사를 내주고 유도탄(mslGain 발)
    }
    // 둘 다 마이너스(쏴서 올려야 함)
    else if (k === 'gate' && Math.random() < (.18 + Math.min(.2, L * .012)) * DK.badP) A = { t: '+', v: -(ri(2, 5) + Math.round(L * .4)) };
    if (Math.random() < .5) [A, B] = [B, A];
    G.gates.push({ y, h: 56, used: false, parts: makeParts([A, B]), swap: k === 'swap' ? rnd(.75, 1.05) * DK.swap : 0, swapT: 0 });
  } else if (k === 'gate3') {
    const vals = [gateVal(G, true, p), gateVal(G, false, p), Math.random() < .5 ? { t: '+', v: ri(1, 4) } : gateVal(G, false, p)];
    for (let i = 2; i > 0; i--) { const j = ri(0, i); [vals[i], vals[j]] = [vals[j], vals[i]]; }
    G.gates.push({ y, h: 56, used: false, parts: makeParts(vals), swap: 0, swapT: 0 });
  } else if (k === 'mob') {
    const s0 = G.mobs.length; mobGroup(G, y, mobCount(L, p, G.stage === 'rush' ? .65 : 1), mobHp(L, p), rnd(ROAD_L + 60, ROAD_R - 60));
    if (DK.zig && Math.random() < DK.zig) { const amp = rnd(22, 40), fr = rnd(1.6, 2.4), ph0 = rnd(0, 6); for (let i = s0; i < G.mobs.length; i++) { G.mobs[i].wav = [amp, fr, ph0 + Math.floor((i - s0) / 6) * .4]; G.mobs[i].side = Math.max(G.mobs[i].side, 120); } }   // 지그재그로 흔들리며 온다(난이도)
  } else if (k === 'runner') {   // 돌격대: 길을 가로지르는 한두 줄, 아주 빠르게 달려옴
    const c = Math.min(mobCount(L, p, .55), 60);
    mobGroup(G, y, c, hpK(1), MID, { cols: Math.min(c, 15), sp: 19, vy: 90 + L * 3, side: 18, lv: 0 });
  } else if (k === 'giant') {    // 거인 하나 + 호위
    const grp = mobGroup(G, y, 1, Math.round((16 + L * 9) * (1 + p * .5) * LVK * DK.hp), rnd(ROAD_L + 80, ROAD_R - 80), { vy: 8 + L, side: 34, lv: 2 });
    const M = G.mobs[G.mobs.length - 1]; M.size = 2.3; M.hurt = 6 + Math.round(L * .8); grp.giant = M;
    if (G.twist === 'giants') { M.hp = M.max = Math.round(M.hp * .7); M.hurt = Math.round(M.hurt * .7); }
    M.mb = MIDS[(G.L + (G.mids = (G.mids || 0) + 1)) % MIDS.length];   // 중간보스 겉모습(번갈아)
    mobGroup(G, y + 40, Math.round(mobCount(L, p) * .25), mobHp(L, p), M.x);
  } else if (FORMS.includes(k)) {
    formation(G, k, y, L, p);
  } else if (k === 'horde' || k === 'flood') {
    // 대군(horde): 길 가운데로 빨간 군대가 정해진 시간 동안 끝없이 줄줄이 밀려온다 + 중간보스, 양옆 옆길엔 문 · 보급 상자가 계속.
    // 총공격(flood): 길 전체를 꽉 메우고 밀려온다(옆길 없음) — 화력 싸움, 앞에 문 · 보급 상자가 미리 나온다.
    const full = k === 'flood', dur = streamDur(G.L, full), vy = (12 + Math.min(L, 30) * .8) * (G.twist === 'gust' ? 1.45 : 1) * DK.mobVy;
    const hx0 = full ? ROAD_L + 10 : ROAD_L + LANE + 2, hx1 = full ? ROAD_R - 10 : ROAD_R - LANE - 2, sp = 15;
    const grp = { alive: 0, pop: 0, cx: MID, hw: (hx1 - hx0) / 2, side: 0, horde: true };
    G.groups.push(grp);
    const S = G.stream = { t: dur, T: dur, acc: 0, rowDt: 15 / (G.speed + vy), x0: hx0, cols: Math.floor((hx1 - hx0) / sp) + 1, sp, vy, grp, L, p,
      hp: Math.max(1, Math.round(mobHp(L, p) * (full ? .45 : .55))), fill: 0, lanes: !full, laneAcc: 0, k2: 0, big: ri(0, 1), minusAt: ri(5, 7),
      mids: full ? [.3, .7] : [.4, .8] };
    // 초당 나오는 수(flux): 레벨이 오를수록 많이. 줄은 촘촘히(15 간격) 두고 줄마다 채우는 비율로 맞춘다 → 끝없이 이어진 사람 물결
    S.fill = clamp(streamFlux(G, full) * S.rowDt / S.cols, .08, .95);
    for (let r = 0; r < 10; r++) { const f = S.fill; S.fill = Math.min(.95, f * 2.2); streamRow(G, S, y - r * 15); S.fill = f; }   // 앞머리는 두툼하게
    G.h.horde && G.h.horde(full);
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
    const gift = pickGift(G);
    const two = L >= 6 || G.stage === 'armory';   // 두 개 나란히(하나만 고를 수 있게)
    const xs = two ? [ROAD_L + 50, ROAD_R - 50] : [rnd(ROAD_L + 60, ROAD_R - 60)];
    xs.forEach((x, i) => G.boxes.push({ x, y, w: 92, h: 46, hp: i ? Math.round(hp * 1.15) : hp, max: hp, gift: i ? (gift === 'thunder' ? 'missile' : G.L >= 2 && Math.random() < .35 ? 'thunder' : gift === 'missile' ? 'rate' : 'missile') : gift, flash: 0, pop: 0 }));
  } else if (k === 'boss') {
    const tank = G.bossKind === 'tank';
    // 보스 체력 = 지금 우리 화력(초당 피해) × 버티는 시간(레벨 1 약 5초 → 20 약 10초) — 부대가 아무리 커도 만나자마자 녹지 않게
    const dps = G.rate * G.dmg * TIERS[G.tier].mul * Math.pow(Math.max(1, G.n), .72) * .85;
    // 난이도 보스 배수(bossK): 화력에 비례하는 본값에는 그대로(싸움이 그만큼 길어진다), 최소값(부대가 작을 때 바닥)에는 제곱근만 — 작은 부대로 만난 저레벨 보스가 끝없이 길어지지 않게. 1~2레벨은 배수를 조금 덜
    const bossK = 1 + (DK.boss - 1) * LVLK;
    const hp = Math.round(Math.max((60 + L * 55 + L * L * 3) * Math.sqrt(bossK), dps * (5 + Math.min(G.L, 20) * .25) * (1 - (G.help || 0) * .08 * DK.helpK) * (G.L >= 7 ? 1.2 : 1) * bossK) * (tank ? .9 : 1));
    const look = bossLook(G.L);
    G.boss = { kind: G.bossKind, animal: look.animal, evo: look.evo, x: MID, y: y - 40, r: tank ? 70 : 62, hp, max: hp, vy: tank ? 16 + L : 100 + Math.min(L, 20) * 3, stop: tank ? -560 : -800,
      t: 0, flash: 0, pop: 0, acc: 0, accT: 0, summon: 2.5, bite: 0, fire: 1.2, aim: 0 };
  }
}

// 여러 대형 — 움직임은 병사마다: wav(좌우로 흔들림) · ring(둥글게 돎) · cross(옆으로 가로지름) · home(나를 쫓음)
function formation(G, k, y, L, p) {
  const hp = mobHp(L, p), s0 = G.mobs.length, take = () => G.mobs.slice(s0);
  if (k === 'snake') {          // 뱀 행렬: 두 줄로 길게, 머리부터 꼬리까지 물결치며 구불구불
    const c = mobCount(L, p, .9), grp = mobGroup(G, y, c, hp, MID, { cols: 2, sp: 15, side: 0 });
    const amp = rnd(70, 100), fr = rnd(1.8, 2.4);
    take().forEach((M, i) => { M.wav = [amp, fr, Math.floor(i / 2) * .32]; M.side = 170; M.y = y - Math.floor(i / 2) * 14; });
  } else if (k === 'wedge') {   // 화살촉: 뾰족한 V 자가 빠르게 찌르고 들어온다(나를 따라옴)
    const c = Math.min(mobCount(L, p, .85), 120), grp = mobGroup(G, y, c, hp, MID, { side: 55 + L * 2, vy: 46 + Math.min(L, 30) * 1.6 });
    let r = 0, inRow = 0;
    take().forEach(M => { const w = r * 2 + 1; M.ox = (inRow - r) * 15; M.y = y - r * 15; if (++inRow >= w) { r++; inRow = 0; } });
    grp.hw = r * 15 + 6;
  } else if (k === 'wall') {    // 방패벽: 길을 꽉 막은 단단한 줄 둘(빈틈 5칸 — 부대가 빠져나갈 수 있게) + 뒤에 졸병
    for (let w = 0; w < 2; w++) {
      const sp = 16, cols = Math.floor((ROAD_R - ROAD_L - 16) / sp) + 1, gap = ri(1, cols - 6), yy = y - w * 170;
      const grp = mobGroup(G, yy, cols, Math.round(hp * 2 + L * .3), MID, { cols, sp, side: 0, lv: 2, vy: 10 + L * .6 });
      const row = G.mobs.slice(G.mobs.length - cols);
      row.forEach((M, i) => { M.y = yy; if (i >= gap && i < gap + 5) { M.dead = true; grp.alive--; } });
      G.mobs = G.mobs.filter(M => !M.dead);
      mobGroup(G, yy - 50, Math.round(mobCount(L, p) * .3), hp, MID, { side: 0 });
    }
  } else if (k === 'flank') {   // 엇갈려 가로지르기: 왼쪽 무리는 오른쪽으로, 오른쪽 무리는 왼쪽으로 비스듬히
    for (let w = 0; w < 3; w++) {
      const sd = w % 2 ? 1 : -1, c = Math.round(mobCount(L, p, .32)), grp = mobGroup(G, y - w * 150, c, hp, sd < 0 ? ROAD_L + 40 : ROAD_R - 40, { side: 0, cols: Math.min(c, 4) });
      G.mobs.slice(G.mobs.length - c).forEach(M => { M.cross = -sd * (70 + Math.min(L, 20) * 3); M.cx0 = M.x; M.side = 200; });
    }
  } else if (k === 'ring') {    // 원진: 가운데 대장을 둘러싼 고리가 빙글빙글 돌며 다가온다
    const c = clamp(Math.round(mobCount(L, p, .55)), 10, 40), rr = 46 + c * .9;
    const grp = mobGroup(G, y, c, hp, MID, { side: 40 + L, cols: c });
    take().forEach((M, i) => { M.ring = [rr, (i / c) * Math.PI * 2, 1.7]; M.by = y; M.ox = 0; M.side = 260; });
    const cap = mobGroup(G, y, 1, Math.round(hp * 10 + L * 3), MID, { side: 40 + L, lv: 2 }), C = G.mobs[G.mobs.length - 1];
    C.size = 1.5; C.hurt = 3; C.leader = grp; grp.hw = rr; cap.hw = rr;
  } else if (k === 'swarm') {   // 산개 습격: 넓게 흩어진 적이 하나하나 나를 쫓아온다
    const c = mobCount(L, p, .8), grp = mobGroup(G, y, c, hp, MID, { side: 0 });
    take().forEach(M => { M.x = rnd(ROAD_L + 10, ROAD_R - 10); M.y = y - rnd(0, 360); M.home = 40 + Math.min(L, 25) * 2.5; M.ox = rnd(-40, 40); M.vy *= rnd(.8, 1.3); });
  }
  G.h.formation && G.h.formation(FORM_NAME[k]);
}
// 대군 한 줄: 띠(x0 ~ cols) 안을 fill 만큼 채운다(빈자리가 조금씩 있어 덩어리가 아니라 사람 물결처럼)
function streamRow(G, S, y) {
  if (G.mobs.length > MAXMOBS) return;
  const grp = S.grp;
  for (let c = 0; c < S.cols; c++) {
    if (Math.random() > S.fill) continue;
    const x = S.x0 + c * S.sp + rnd(-3, 3);
    const M = { ox: x - MID, x, y: y + rnd(-4, 4), hp: S.hp, max: S.hp, vy: S.vy, side: 0, step: Math.random() * 6, g: grp, flash: 0, kb: 0, size: 1, hurt: 1, lv: lvPick(G) };
    if (Math.random() < elitePctG(G) * .5) elite(M, G.L);
    G.mobs.push(M); grp.alive++;
  }
}
function midboss(G, y, x, L, p, vy) {
  const hp = Math.round((16 + L * 9) * (1 + p * .5) * .9 * LVK * DK.hp), gg = mobGroup(G, y, 1, hp, x, { vy, side: 0, lv: 2 });
  const M = G.mobs[G.mobs.length - 1]; M.size = 2.3; M.hurt = 6 + Math.round(L * .8); gg.giant = M;
  M.mb = MIDS[(G.L + (G.mids = (G.mids || 0) + 1)) % MIDS.length];
  return M;
}
// 선물 고르기: 유도탄 · 연사 · 위력 + 2레벨부터 천둥번개
function pickGift(G) {
  const w = [['missile', .2], ['rate', .14], ['dmg', .14], ['thunder', G.L >= 2 ? .17 : 0]];
  let r = Math.random() * w.reduce((a, x) => a + x[1], 0);
  for (const [g, v] of w) { if ((r -= v) < 0) return g; }
  return 'rate';
}
function streamStep(g, dt) {
  const S = g.stream; S.t -= dt;
  if (S.t <= 0) { g.stream = null; return; }
  S.acc += dt;
  while (S.acc >= S.rowDt) { S.acc -= S.rowDt; streamRow(g, S, SPAWN - S.acc * (g.speed + S.vy)); }
  const k = 1 - S.t / S.T;
  while (S.mids.length && k >= S.mids[0]) { S.mids.shift(); const M = midboss(g, SPAWN - 30, MID + (S.lanes ? 0 : rnd(-60, 60)), S.L, S.p, S.vy); g.h.float(MID, -560, MID_NAME[M.mb] + ' 등장!', '#fca5a5', 30); }
  if (!S.lanes) return;
  // 옆길: 95 마다 한 칸씩 — +1 줄 · ±100 · -10~30 · 보급 상자(천둥번개 포함)
  S.laneAcc += dt; const ld = 95 / g.speed;
  while (S.laneAcc >= ld) {
    S.laneAcc -= ld; const k2 = S.k2++, L = S.L, m = k2 % 12;
    [0, 1].forEach(sd => {
      const x0 = sd ? ROAD_R - LANE + 4 : ROAD_L, x1 = sd ? ROAD_R : ROAD_L + LANE - 4, cx = (x0 + x1) / 2, yy = SPAWN - sd * 31;
      if (m === 4 && k2 < 12) g.gates.push(laneGate(x0, x1, yy, (sd === S.big ? 1 : -1) * (L >= 4 ? 100 : 50)));   // 한쪽 +100 · 반대쪽 -100
      else if (m === S.minusAt + sd * 2 || m === (S.minusAt + 5 + sd) % 12) g.gates.push(laneGate(x0, x1, yy, -10 * ri(1, 3)));   // -10 · -20 · -30
      else if (k2 % 6 === 2 + sd) { const bh = Math.round((4 + L * 1.4) * (1 + S.p * .3)); g.boxes.push({ x: cx, y: yy, w: 54, h: 40, hp: bh, max: bh, gift: pickGift(g), flash: 0, pop: 0, lane: true }); }
      else g.gates.push(laneGate(x0, x1, yy, sd === S.big ? 1 : ri(1, 2)));   // +1 +1 +1 …
    });
    if (m === 11) S.big = 1 - S.big;
  }
}
// 천둥번개: 적이 가장 몰린 곳에 차례로 내리꽂힌다
function strike(g) {
  const top = -RANGE + 60;
  let cand = g.mobs.filter(M => M.y < -140 && M.y > -720);   // 화면에서 잘 보이는 거리 먼저
  if (!cand.length) cand = g.mobs.filter(M => M.y < -60 && M.y > top);
  let best = null, bc = -1;
  for (let i = 0; i < Math.min(50, cand.length); i++) {
    const M = cand[Math.floor(Math.random() * cand.length)]; let c = 0;
    for (const o of cand) if (Math.abs(o.x - M.x) < 70 && Math.abs(o.y - M.y) < 70) c += o.mb ? 6 : 1;
    if (c > bc) { bc = c; best = M; }
  }
  const K = g.boss, dmg = 10 + power(g.L) * 3.2;
  let x, y;
  if (best) { x = best.x; y = best.y; } else if (K && K.y > top) { x = K.x; y = K.y; } else return false;
  g.h.bolt && g.h.bolt(x, y); g.h.sfx('thunder');
  explode(g, x, y, dmg, 92, 'missile');
  if (K && Math.abs(K.x - x) < K.r + 60 && Math.abs(K.y - y) < K.r + 60) { K.hp -= dmg * 2.5; K.flash = .1; K.acc += dmg * 2.5; }
  return true;
}
// 옆길 문: 한 칸짜리, 그 길로 지나갈 때만 받는다(다른 곳으로 지나가면 그냥 지나침)
const LANE = 74;
function laneGate(x0, x1, y, v) { return { y, h: 44, used: false, lane: true, parts: [{ x0, x1, t: '+', v, hit: 0, acc: 0, cap: v > 0 ? v + 2 : 0 }], swap: 0, swapT: 0 }; }   // 쏴서 올릴 수 있는 한도(cap): 옆길 문이 많아 부대가 끝없이 불지 않게
function lose(G, k, x, y, src) {
  if (k <= 0) return;
  if (G.lost) G.lost[src] = (G.lost[src] || 0) + k;
  G.n -= k; G.h.burst(x, y, 'blue', Math.min(k, 14));
}
function killMob(g, i, M) {
  g.combo = g.comboT > 0 ? g.combo + 1 : 1; g.comboT = 1.1; g.bestCombo = Math.max(g.bestCombo, g.combo);
  const pts = Math.round((M.mb ? 60 : M.leader ? 40 : M.elite ? 25 : 10) * g.L * (1 + Math.min(g.combo, 100) * .02 * DK.comboK) * (g.twist === 'gold' ? 2 : 1));   // 콤보 100 이면 3배(하드는 더)
  g.score += pts; g.mobs.splice(i, 1); M.g.alive--; M.g.pop = 1; M.dead = true;
  g.h.burst(M.x, M.y, 'red', M.size > 1 ? 24 : 3); g.h.smoke(M.x, M.y, M.size > 1 ? 4 : 1);
  g.h.die(M, pts); g.h.combo(g.combo, M.x, M.y);
  if (M.mb || M.leader) { g.h.shake(.4); g.h.stop(.09); g.h.float(M.x, M.y - 30, (M.mb ? MID_NAME[M.mb] : '원진 대장') + ' 처치!', '#fde047', 30); }
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
  for (const M of g.mobs) if ((M.mb || M.leader) && M.y > top && M.y < 0 && !skip.has(M)) return M;
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

/* ── 판 중간 저장(스냅샷): G 는 순수 데이터지만 서로 가리키는 곳이 있다(병사 → 무리 · 무리 → 거인 · 유도탄 → 표적 · 대군 → 무리). 그것만 번호로 바꿔 JSON 으로 만들고, 복원 때 되살린다.
   빼는 것: h(훅 — 복원 때 다시 넣음) · bk(충돌 칸 캐시 — step 이 다시 만듦) · 문 칸의 ftx(화면 글자 캐시) ── */
export function snapshot(G) {
  const gi = new Map(G.groups.map((q, i) => [q, i])), mi = new Map(G.mobs.map((M, i) => [M, i]));
  const ref = t => !t ? null : t === G.boss ? { k: 'boss' } : mi.has(t) ? { k: 'mob', i: mi.get(t) } : G.boxes.includes(t) ? { k: 'box', i: G.boxes.indexOf(t) } : null;
  const o = {};
  for (const k in G) if (!['h', 'bk', 'groups', 'mobs', 'rockets', 'stream', 'gates'].includes(k)) o[k] = G[k];
  o.groups = G.groups.map(q => { const c = Object.assign({}, q); if (q.giant) c.giant = mi.has(q.giant) ? mi.get(q.giant) : -1; else delete c.giant; return c; });
  o.mobs = G.mobs.map(M => { const c = Object.assign({}, M); c.g = gi.has(M.g) ? gi.get(M.g) : -1; if (M.leader) c.leader = gi.has(M.leader) ? gi.get(M.leader) : -1; else delete c.leader; return c; });
  o.rockets = G.rockets.map(r => Object.assign({}, r, { tg: ref(r.tg) }));
  o.stream = G.stream ? Object.assign({}, G.stream, { grp: gi.has(G.stream.grp) ? gi.get(G.stream.grp) : -1 }) : null;
  o.gates = G.gates.map(gt => Object.assign({}, gt, { parts: gt.parts.map(p => { const c = Object.assign({}, p); delete c.ftx; return c; }) }));
  return o;
}
export function restore(o, hooks) {   // o = JSON.parse 한 스냅샷(그대로 고쳐 쓴다)
  const G = o, groups = G.groups = G.groups || [];
  const grpAt = (i, M) => groups[i] || (groups[groups.push({ alive: 0, pop: 0, cx: M ? M.x : MID, hw: 10, side: 0 }) - 1]);
  G.mobs = G.mobs || [];
  for (const M of G.mobs) { M.g = grpAt(M.g, M); if ('leader' in M) M.leader = groups[M.leader] || M.g; }
  for (const q of groups) { if ('giant' in q) { q.giant = G.mobs[q.giant]; if (!q.giant) delete q.giant; } }
  const deref = t => !t ? null : t.k === 'boss' ? G.boss : t.k === 'mob' ? G.mobs[t.i] || null : t.k === 'box' ? G.boxes[t.i] || null : null;
  G.rockets = (G.rockets || []).map(r => Object.assign(r, { tg: deref(r.tg) }));
  G.orbs = G.orbs || [];
  if (G.stream) G.stream.grp = grpAt(G.stream.grp);
  G.h = mkHooks(hooks);
  return G;
}

/* ── 한 장면 ── */
export function step(G, dt) {
  if (G.over) return;
  DK = DIFFS[G.diff] || DIFFS.normal; LVLK = Math.min(1, .55 + G.L * .15);
  const g = G, h = g.h;
  g.t += dt;
  g.dist += g.speed * dt;
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
  while (g.next < g.ev.length && g.dist >= g.ev[g.next].d) { const e = g.ev[g.next++]; spawn(g, e, SPAWN + (g.dist - e.d)); }

  const R = squadR(g.n);
  g.tx = clamp(g.tx, ROAD_L + R * .7, ROAD_R - R * .7);
  g.px += (g.tx - g.px) * Math.min(1, dt * 14);

  if (g.stream) streamStep(g, dt);
  if (g.twist === 'storm' && !g.boss) { g.stormT -= dt; if (g.stormT <= 0) { g.stormT = rnd(4.5, 7.5); strike(g); } }   // 천둥 폭풍: 저절로 번개
  if (g.bolts > 0) { g.boltCd -= dt; if (g.boltCd <= 0) { g.boltCd = .3; if (strike(g)) g.bolts--; else g.boltCd = .2; } }
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
  const bk = g.bk || (g.bk = new Map()); bk.clear();
  for (const M of g.mobs) { const k = Math.floor(M.y / BIN); let a = bk.get(k); if (!a) bk.set(k, a = []); a.push(M); }
  for (let b = g.bullets.length - 1; b >= 0; b--) {
    const B = g.bullets[b]; B.y -= BV * dt; B.x += B.vx * dt;
    if (B.y < B.y0 - RANGE || hitAny(g, B)) { g.bullets[b] = g.bullets[g.bullets.length - 1]; g.bullets.pop(); }   // 순서는 상관없어 끝 것과 바꿔 지움
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
      if (p.t === 'M') {   // 유도탄 문: 병사를 내주고 유도탄(병사가 모자라면 아무 일도 없다)
        if (g.n <= p.v) { h.float(g.px, -40, '병사가 모자라요', '#fca5a5', 30); h.sfx('gateDown'); p.taken = true; continue; }
        gt.pick = gt.parts.indexOf(p);
        const pay = p.v;
        lose(g, pay, g.px, 0, 'trade');
        const mk = mslGain(g.diff); g.missiles += mk; h.float(g.px, -60, '유도탄 +' + mk, '#facc15', 40);
        h.float(g.px, -10, '-' + pay, '#f87171', 30);
        h.sfx('power'); h.tint('gold'); h.ring(g.px, 0, 'gold'); h.stop(.08); h.buzz(40);
        p.taken = true; continue;
      }
      gt.pick = gt.parts.indexOf(p);
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
    const dy0 = (g.speed + M.vy) * dt - M.kb * dt * 8; M.step += dt * (M.size > 1 ? 6 : 13);
    let want = M.g.cx + M.ox;
    if (M.ring) { M.ring[1] += M.ring[2] * dt; M.by += dy0; M.y = M.by + Math.sin(M.ring[1]) * M.ring[0] * .7; want = M.g.cx + Math.cos(M.ring[1]) * M.ring[0]; }
    else M.y += dy0;
    if (M.wav) want += M.wav[0] * Math.sin(g.t * M.wav[1] + M.wav[2]);
    if (M.cross) { M.cx0 += M.cross * dt; if (M.cx0 < ROAD_L + 8 || M.cx0 > ROAD_R - 8) M.cross = -M.cross; want = M.cx0; }
    if (M.home && M.y > -700) want = g.px + M.ox * .5;
    want = clamp(want, ROAD_L + 8, ROAD_R - 8);
    M.x += Math.sign(want - M.x) * Math.min(Math.abs(want - M.x), ((M.home && M.y > -700 ? M.home : M.side) + 30) * dt);
    const dx = M.x - g.px, dy = M.y, reach = R + 4 + (M.size - 1) * 14;
    if (dy > -R * .9 - (M.size - 1) * 10 && dy < R * .8 && Math.abs(dx) < reach) {
      g.mobs.splice(i, 1); M.g.alive--; M.dead = true; h.die(M, 0); const k = Math.min(g.n, M.hurt); lose(g, k, M.x, M.y, M.size > 1 ? 'giant' : 'mob'); h.shake(M.size > 1 ? .4 : .12); h.sfx('hurt'); h.burst(M.x, M.y, 'red', 5);
      if (M.size > 1) h.float(g.px, -40, '-' + k, '#f87171', 34);
      continue;
    }
    if (M.y > 150) { g.mobs.splice(i, 1); M.g.alive--; M.dead = true; }
  }
  g.groups = g.groups.filter(q => { q.pop = Math.max(0, q.pop - dt * 6); return q.alive > 0 || (g.stream && g.stream.grp === q); });
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
          if (Math.random() < Math.min(.9, .5 * DK.summon)) { const c = Math.min(3 + Math.floor(PL), 24); mobGroup(g, K.y + 40, c, hpK(1 + Math.floor(PL / 5)), K.x + rnd(-60, 60), { vy: 40 + PL * 2, side: 60 + PL * 3 }); }
        }
      }
    } else {
      // 근육 대장: 곧장 성큼성큼 걸어오며 내 쪽으로 몸을 튼다, 졸병을 부른다. 돌진(난이도): 확 달려들었다가 물러난다
      if (K.dashing === 1) { K.y += 420 * dt; if (K.y >= -R * .4 - K.r - 8) K.dashing = 2; }
      else if (K.dashing === 2) { K.y -= 240 * dt; if (K.y <= K.stop) { K.y = K.stop; K.dashing = 0; } }
      else K.y += (K.y < K.stop ? Math.max(g.speed, K.vy) * 1.1 : K.vy) * dt;
      const dx = g.px - K.x; K.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt);
      if (K.y > K.stop) {
        K.summon -= dt;
        if (K.summon <= 0) {
          K.summon = Math.max(1.8, 4 - PL * .1);
          mobGroup(g, K.y + 30, Math.min(Math.round((4 + Math.floor(PL * 1.2)) * DK.summon), 36), hpK(1 + Math.floor(PL / 5)), K.x + rnd(-40, 40), { vy: 40 + PL * 2, side: 60 + PL * 3 });
        }
      }
    }
    if (K.y > -R * .4 - K.r) {
      K.y = -R * .4 - K.r; K.bite -= dt;
      if (K.bite <= 0) { K.bite = .25; if (Math.abs(K.x - g.px) < K.r + R * .7) { lose(g, 2 + Math.floor(PL / 4), g.px, 0, 'bite'); h.shake(.25); h.sfx('hurt'); h.buzz(40); } }   // 옆으로 비키면 안 물린다
    }
  }
  if (K && K.y > K.stop - 120) bossFire(g, K, dt, R);
  // 거인(중간보스) 탄: 가까이 오면 부채꼴(중간) · 원형(하드)
  if (DK.bul.giant) for (const M of g.mobs) {
    if (!M.mb || M.y < -760 || M.y > -90) continue;
    M.gt = (M.gt == null ? 1.6 : M.gt) - dt;
    if (M.gt <= 0) { M.gt = DK.bul.giantT; const sp = 130 * DK.bul.spd; if (DK.bul.giant >= 8) ring(g, M.x, M.y + 10, DK.bul.giant, sp * .85, 'o', 1, Math.random() * 6.28); else fan(g, M.x, M.y + 10, DK.bul.giant, .7, sp, 'o', 1); }
  }
  // 탄: 날아오고, 내 부대에 닿으면 병사가 줄고, 길 밖 · 뒤로 지나가면 사라진다(총알 · 유도탄으로 못 막는다 — 피하는 것)
  for (let i = g.orbs.length - 1; i >= 0; i--) {
    const o = g.orbs[i]; o.x += o.vx * dt; o.y += o.vy * dt;
    let gone = o.y > 160 || o.y < SPAWN || o.x < ROAD_L - 60 || o.x > ROAD_R + 60;
    if (!gone && o.y > -R * .9 && o.y < R * .8 && Math.abs(o.x - g.px) < R * .8 + o.r) {
      const k = Math.min(g.n, o.dmg); lose(g, k, o.x, o.y, 'orb'); h.burst(o.x, o.y, 'red', 3); h.sfx('hurt');
      if (!(g.t - (g.orbHit == null ? -9 : g.orbHit) < .4)) { g.orbHit = g.t; h.shake(.12); h.tint('red'); h.buzz(20); }
      gone = true;
    }
    if (gone) { g.orbs[i] = g.orbs[g.orbs.length - 1]; g.orbs.pop(); }
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
    g.boss = null; g.shells = []; g.rockets = []; g.bullets = []; g.orbs = []; h.shake(.6); h.buzz([60, 40, 120]); h.sfx('boom'); g.over = 1;
    for (const M of g.mobs) h.burst(M.x, M.y, 'red', 1);
    g.mobs = []; g.groups = [];
  }
}
const PLx = g => power(g.L);
/* ── 보스 탄막(1942 식): 원형 · 부채꼴 · 조준 연발 · 나선 · 돌진. 양 · 종류는 난이도(DIFFS.bul), 보스 체력 70% · 40% 단계마다 격해진다(phase).
   탱크 = 원형 + 부채꼴 포탄(하드 3단계엔 나선도), 근육 대장 = 조준 · 돌진 + 나선(하드). 탄 수 상한 300(폰 성능). 탄은 플레이어가 피해야 한다. ── */
const MAX_ORBS = 300;
function shoot(g, x, y, ang, spd, c, dmg, r = 9) {   // ang 0 = 내 쪽(+y), 오른쪽이 +
  if (g.orbs.length >= MAX_ORBS) return;
  g.orbs.push({ x, y, vx: Math.sin(ang) * spd, vy: Math.cos(ang) * spd, r, c, dmg });
}
const aimAng = (g, x, y) => Math.atan2(g.px - x, -y);
// gap: 내 쪽 근처에 gap 발만큼 빈 틈(gapAt = 틈 가운데 각도) — 그 틈으로 빠져나갈 수 있다
function ring(g, x, y, n, spd, c, dmg, off = 0, gap = 0, gapAt = 0) {
  const step = Math.PI * 2 / n;
  for (let i = 0; i < n; i++) {
    const a = off + i * step;
    if (gap && Math.abs(Math.atan2(Math.sin(a - gapAt), Math.cos(a - gapAt))) < step * gap / 2) continue;
    shoot(g, x, y, a, spd, c, dmg);
  }
  g.h.sfx('cannon'); g.h.spark(x, y + 30, 'gold', 8);
}
function fan(g, x, y, n, spread, spd, c, dmg) { const a0 = aimAng(g, x, y); for (let i = 0; i < n; i++) shoot(g, x, y, a0 + (n > 1 ? (i / (n - 1) - .5) * spread : 0), spd, c, dmg, 10); g.h.sfx('cannon'); }
function bossFire(g, K, dt, R) {
  // 레벨 1~2 는 조금 덜 퍼붓고(패턴을 익히는 구간) 3레벨부터 100%: 발수 × lk, 주기 ÷ lk, 탄속도 조금
  const B = DK.bul, f = K.hp / K.max, ph = B.phase ? (f > .7 ? 0 : f > .4 ? 1 : 2) : 0, lk = Math.min(1, .55 + g.L * .15), q = (1 - ph * .18) / lk, spd = 150 * B.spd * (1 + ph * .1) * (.85 + .15 * lk), dmg = lk < 1 && !ph ? 1 : B.dmg;   // 1~2레벨 1단계는 한 발 피해 1
  if (K.ph == null) K.ph = ph;
  if (ph !== K.ph) { K.ph = ph; g.h.float(K.x, K.y - 60, ph === 1 ? '보스가 화났어요!' : '보스 최후의 발악!', '#fca5a5', 32); g.h.ring(K.x, K.y, 'gold'); g.h.shake(.4); g.h.sfx('alarm'); K.pt.ring = Math.min(K.pt.ring, .6); K.pt.fan = Math.min(K.pt.fan, 1); if (K.pt.seq != null) K.pt.seq = Math.min(K.pt.seq, .6); }   // 단계가 바뀌면 바로 한 번 퍼붓는다
  const P = K.pt || (K.pt = { ring: 1.6, aim: 2.2, fan: 2.8, sp: 0, dash: 5, aimLeft: 0, aimGap: 0, seq: 1.4, k: 0, spLeft: 0, side: 1 });
  if (P.seq == null) { P.seq = 1.4; P.k = 0; P.spLeft = 0; P.side = 1; }   // 예전 판 이어하기(저장된 보스)에도
  const bx = K.x, by = K.y + 24;
  // 원형 틈: 내 자리 쪽에서 왼쪽 · 오른쪽 번갈아 살짝 비켜 난다(가만히 있으면 맞고, 조금 옮기면 피한다)
  const gapAt = () => { P.side = -P.side; return aimAng(g, bx, by) + P.side * .22; };
  const aimBurst = n => { P.aimLeft = n; P.aimGap = 0; };
  const aimTick = () => { if (P.aimLeft > 0) { P.aimGap -= dt; if (P.aimGap <= 0) { P.aimGap = .16; P.aimLeft--; shoot(g, bx, by, aimAng(g, bx, by), spd * 1.1, 'm', dmg, 10); g.h.sfx('hit'); } } };
  if (B.seq) {
    // 하드: 패턴을 한 번에 하나씩 차례로 — 원형(틈) → 부채꼴 → 나선 → 조준 연발 → … 사이에 쉼(rest). 화날수록(phase) 발 수 · 빠르기만 조금 오른다
    P.seq -= dt;
    if (P.seq <= 0) {
      const kind = ['ring', 'fan', 'spiral', 'aim'][P.k++ % 4];
      let dur = .4;
      if (kind === 'ring') ring(g, bx, by, Math.round((B.ring + ph * 3) * lk), spd * .85, 'o', Math.max(1, B.dmg - 1), (P.k * .37) % (Math.PI * 2), B.gap, gapAt());
      else if (kind === 'fan') fan(g, bx, by, B.fan + ph, .9 + ph * .1, spd, 'm', dmg);
      else if (kind === 'spiral') { P.spLeft = 1.4 + ph * .3; dur = P.spLeft; }
      else { aimBurst(B.aim + (ph >= 2 ? 1 : 0)); dur = (B.aim + 1) * .16; }
      P.seq = dur + B.rest * (1 - ph * .15) / lk;
    }
    if (P.spLeft > 0) {   // 나선: 정해진 시간 동안만 일정하게 돈다(돌아오는 방향이 보여 피할 수 있다)
      P.spLeft -= dt; K.spin = (K.spin || 0) + dt * 2.4; P.sp -= dt;
      if (P.sp <= 0) { P.sp = .1 / lk; const arms = ph >= 1 ? 3 : 2; for (let a = 0; a < arms; a++) shoot(g, bx, by, K.spin + a * Math.PI, spd * .7, 'm', dmg, 8); }
    }
    aimTick();
    if (B.dash && K.kind === 'brute' && !K.dashing) { P.dash -= dt; if (P.dash <= 0) { P.dash = B.dashT * q; K.dashing = 1; g.h.float(K.x, K.y - 50, '돌진!', '#fca5a5', 30); g.h.sfx('alarm'); } }
    return;
  }
  // 원형 탄막(중간: 틈이 있는 방사형)
  if (B.ring) { P.ring -= dt; if (P.ring <= 0) { P.ring = B.ringT * q; ring(g, bx, by, Math.round((B.ring + ph * 3) * lk), spd * .9, 'o', Math.max(1, B.dmg - 1), (P.ring * 7) % (Math.PI * 2), B.gap || 0, gapAt()); P.aim = Math.max(P.aim, 1.2); } }   // 원형 직후엔 조준을 잠깐 쉰다(겹치지 않게)
  // 조준 연발(짧은 간격으로 n 발 — 쉬움 1발, 중간 2발)
  if (B.aim) {
    P.aim -= dt; if (P.aim <= 0) { P.aim = B.aimT * q; aimBurst(B.aim + (ph >= 2 ? 1 : 0)); }
    aimTick();
  }
  // 부채꼴(탱크)
  if (B.fan && K.kind === 'tank') { P.fan -= dt; if (P.fan <= 0) { P.fan = B.fanT * q; fan(g, bx, by, B.fan + ph, .95 + ph * .15, spd * 1.05, 'm', dmg); } }
  // 나선 회전탄(근육 대장은 하드 처음부터, 탱크는 하드 3단계)
  if (B.spiral && (K.kind === 'brute' || ph >= 2)) {
    K.spin = (K.spin || 0) + dt * (2.6 + ph * .7); P.sp -= dt;
    if (P.sp <= 0) { P.sp = .11 / lk; const arms = ph >= 1 ? 2 : 1; for (let a = 0; a < arms; a++) shoot(g, bx, by, K.spin + a * Math.PI, spd * .7, 'm', dmg, 8); }
  }
  // 돌진(근육 대장)
  if (B.dash && K.kind === 'brute' && !K.dashing) { P.dash -= dt; if (P.dash <= 0) { P.dash = B.dashT * q; K.dashing = 1; g.h.float(K.x, K.y - 50, '돌진!', '#fca5a5', 30); g.h.sfx('alarm'); } }
}
// 문 한 칸을 고르면 부대가 어떻게 되는지(자동 조종 어림값)
export function partValue(G, p) {
  const n = G.n;
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
  if (X.gift === 'thunder') { g.bolts += g.L >= 8 ? 6 : 4; g.boltCd = .15; h.float(X.x, X.y - 10, '천둥번개!', '#fde047', 30); }
  else if (X.gift === 'missile') { const mk = mslGain(g.diff); g.missiles += mk; h.float(X.x, X.y - 10, '유도탄 +' + mk + '!', '#facc15', 28); }
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
  const b0 = Math.floor((B.y - 36) / BIN);
  for (let j = b0; j <= b0 + 2; j++) {
    const arr = g.bk.get(j); if (!arr) continue;
    for (const M of arr) {
      if (M.dead) continue;
      const hw = 13 * M.size, hh = 15 * M.size;
      if (Math.abs(B.x - M.x) < hw && Math.abs(B.y - M.y) < hh) {
        const left = B.d - M.hp; M.hp -= B.d; M.flash = .08; M.kb = M.size > 1 ? 1 : 6; h.spark(B.x, M.y + 4, 'hot', 2);
        if (M.hp <= 0) { B.d = left; killMob(g, g.mobs.indexOf(M), M); return B.d < .3; }
        h.sfx('hit');
        return true;
      }
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
        if (p.t === '+' && gt.y > -820 && !(p.cap != null && p.v >= p.cap)) { p.acc += 1; const need = 1 + Math.floor((p.gain || 0) / 3); if (p.acc >= need) { p.acc = 0; p.v++; p.gain = (p.gain || 0) + 1; p.hit = 1; h.gateHit(gt, p, B.x); } }
        // 유도탄 문: 쏘면 내줄 병사(마이너스)가 줄어든다 — 많이 줄일수록 조금씩 더 맞혀야 (사용자 지시 2026-11-11 "쏘는 맛")
        else if (p.t === 'M' && p.v > 1 && gt.y > -820) { p.acc += 1; const need = 1 + Math.floor((p.gain || 0) / 4); if (p.acc >= need) { p.acc = 0; p.v--; p.gain = (p.gain || 0) + 1; p.hit = 1; h.gateHit(gt, p, B.x); } }
        // × 문: 3배에서 멈추지 않는다(최대 ×9). 대신 3배를 넘으면 0.1 올릴 때마다 맞혀야 할 수가 더 빨리 는다 — 열심히 맞힐수록 올라간다
        else if ((p.t === 'x' && p.v < 9) || (p.t === '/' && p.v > 1)) {
          p.acc += 1; const need = 4 + Math.floor((p.gain || 0) / 2) + (p.t === 'x' ? Math.max(0, Math.round((p.v - 3) * 10)) : 0);
          if (p.acc >= need && gt.y > -820) { p.acc = 0; p.v = Math.round((p.v + (p.t === 'x' ? .1 : -.1)) * 10) / 10; p.gain = (p.gain || 0) + 1; p.hit = 1; h.gateHit(gt, p, B.x); }
        }
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
  // 탄막 피하기: 1.1초 안에 내 줄(y≈0)에 닿을 탄의 x 를 모아, 가려는 자리가 맞을 자리면 가까운 빈자리로 바꾼다(잘하는 사람일수록 꼬박꼬박)
  const thr = [];
  for (const o of G.orbs) { if (o.vy <= 0 || o.y > 0) continue; const tt = -o.y / o.vy; if (tt < 1.1) thr.push(o.x + o.vx * tt); }
  const w = R * .8 + 20, hits = x => { let a = 0; for (const t of thr) if (Math.abs(t - x) < w) a++; return a; };
  const safe = x => {
    if (!thr.length || !hits(x) || Math.random() > .3 + skill * .6) return x;
    let best = x, bh = hits(x) + 1e-3;
    for (const dx of [R + 30, -(R + 30), 2 * R + 60, -(2 * R + 60), 3 * R + 80, -(3 * R + 80)]) { const xx = clamp(x + dx, ROAD_L + 30, ROAD_R - 30), hh = hits(xx) + Math.abs(dx) * .002; if (hh < bh) { bh = hh; best = xx; } }
    return best;
  };
  const pick = x => { mem.x = safe(x) + (1 - skill) * rnd(-50, 50); G.tx = mem.x; };
  if (thr.length && hits(G.px) && Math.random() < .3 + skill * .6) return pick(G.px);   // 지금 자리가 위험하면 먼저 피한다
  // 포탄 피하기
  const sh = G.shells.find(s => s.T - s.t < .9 && Math.abs(s.x - G.px) < s.r + R * .5);
  if (sh && Math.random() < .3 + skill * .6) return pick(sh.x < MID ? Math.min(ROAD_R - 30, sh.x + sh.r + R) : Math.max(ROAD_L + 30, sh.x - sh.r - R));
  if (G.missiles && skill >= .5 && (G.boss || G.mobs.some(m => m.mb && m.y > -700))) fireMissile(G);
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
  if (G.boss) { const K = G.boss; if (K.y > -R * .4 - K.r - 60 && Math.abs(K.x - G.px) < K.r + R) return pick(K.x < MID ? Math.min(ROAD_R - 30, K.x + K.r + R + 30) : Math.max(ROAD_L + 30, K.x - K.r - R - 30)); return pick(K.x); }   // 붙으면 옆으로 빠져 물리지 않게, 아니면 정면에서 쏜다
  const bxs = G.boxes.filter(x => x.y < -60);
  if (bxs.length) { const bx = bxs.sort((a, b) => a.hp - b.hp)[0]; return pick(bx.x); }
  const m = G.mobs.filter(x => x.y < 0).sort((a, b) => b.y - a.y)[0];
  if (m) return pick(m.x);
}
