// 해골 빌딩의 용사 — 규칙 · 레벨 만들기 (화면과 따로, node 에서도 시험할 수 있게)
//
// 규칙
//   · 용사는 맨 왼쪽 땅에서 시작한다. 지금 있는 빌딩과 바로 옆 빌딩의 방으로만 갈 수 있다(땅에서는 첫 빌딩만).
//   · 방에 들어가면 그 방의 것이 바로 일어난다. 비운 방은 그냥 지나갈 수 있다.
//       sk 해골 병사 v : 내 힘이 v 보다 커야 이긴다(같으면 진다). 이기면 힘 + v
//       po 물약 v      : 힘 + v
//       x2 수정        : 힘 × 2
//       cu 저주 v      : 힘 − v (1 밑으로는 안 내려감)
//       hf 반쪽 저주   : 힘이 절반(올림)
//   · 보스는 마지막 빌딩에서만 갈 수 있고, 내 힘이 보스보다 커야 이긴다.
//   · 레벨은 번호만으로 늘 같은 판이 나온다(seed = 레벨) → 저장은 "비운 방 · 있는 곳 · 힘 · 시간" 만 있으면 된다.
//   · 모든 판은 풀이 탐색(solve)으로 깰 수 있음을 확인한 뒤에 내놓는다. 보스 힘은 "가장 잘했을 때 힘"보다 작게 잡는다.

export const BOSSES = [
  { kind: 'knight', name: '흑기사', sort: '사람' },
  { kind: 'ogre', name: '오우거', sort: '괴물' },
  { kind: 'wolf', name: '늑대 왕', sort: '야수' },
  { kind: 'wizard', name: '어둠의 마법사', sort: '사람' },
  { kind: 'dragon', name: '붉은 드래곤', sort: '괴물' },
  { kind: 'bear', name: '큰곰 대장', sort: '야수' },
];
const KEYS = {
  dragon: /드래곤|공룡|용(?!사)|뱀|불(?!고기)|dragon/i,
  wizard: /마법|마녀|법사|유령|귀신|악마|마왕|도깨비|wizard/i,
  ogre: /오우거|괴물|거인|좀비|고블린|트롤|몬스터|슬라임|외계|로봇|ogre/i,
  wolf: /늑대|개(?!미)|여우|호랑이|사자|야수|고양이|표범|치타|상어|wolf/i,
  bear: /곰|고릴라|원숭이|멧돼지|코끼리|하마|bear/i,
  knight: /기사|사람|왕|인간|전사|용사|검|닌자|해적|장군|knight/i,
};
// 타이핑한 보스 이름 → 그림 종류 (아는 낱말이 없으면 이름 글자로 정해 늘 같은 그림)
export function bossKind(name) {
  for (const k of Object.keys(KEYS)) if (KEYS[k].test(name)) return k;
  let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return BOSSES[h % BOSSES.length].kind;
}

function rng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 방에 들어갔을 때의 힘. 지면 -1
export function apply(P, room) {
  switch (room.t) {
    case 'sk': return P > room.v ? P + room.v : -1;
    case 'po': return P + room.v;
    case 'x2': return P * 2;
    case 'cu': return Math.max(1, P - room.v);
    case 'hf': return Math.ceil(P / 2);
  }
  return P;
}

export const MAX_ROOMS = 16;
export function heroPower(L) { return 6 + L; } // 1레벨 = 7

// 빌딩 수 · 층수: 레벨이 오를수록 방이 늘어 푸는 시간이 길어진다
function shape(L, R) {
  const nb = L < 3 ? 2 : L < 8 ? 3 : L < 16 ? 4 : L < 30 ? 5 : 6;
  const maxF = L < 3 ? 2 : L < 10 ? 3 : 4;
  const want = Math.min(MAX_ROOMS, nb * maxF, 4 + Math.floor((L - 1) * 0.45));
  const fl = new Array(nb).fill(1);
  let n = nb, guard = 400;
  while (n < want && guard--) { const b = Math.floor(R() * nb); if (fl[b] < maxF) { fl[b]++; n++; } }
  return fl;
}

// 가장 잘했을 때 마지막 빌딩에서의 힘(못 가면 -1). 힘이 클수록 늘 유리하므로 (비운 방 묶음, 있는 빌딩)마다 가장 큰 힘만 들고 간다.
//   from = { done: [방 번호…], pos: 빌딩(-1 = 땅), P } 을 주면 그 자리에서부터.
export function solve(lv, from) {
  const rooms = lv.rooms, n = rooms.length, nb = lv.nb;
  const dp = new Float64Array((1 << n) * nb).fill(-1);
  const bmask = new Array(nb).fill(0);
  rooms.forEach((r, i) => { bmask[r.b] |= 1 << i; });
  const put = (m, b, P) => { const k = m * nb + b; if (P > dp[k]) dp[k] = P; };
  const step = (m, b, P) => { // b 에 있을 때(-1 = 땅) 아직 안 비운 옆 방으로
    for (let i = 0; i < n; i++) {
      if (m >> i & 1) continue;
      const r = rooms[i];
      if (Math.abs(r.b - b) > 1) continue;
      const q = apply(P, r);
      if (q > 0) put(m | 1 << i, r.b, q);
    }
  };
  let m0 = 0;
  if (from) { for (const i of from.done) m0 |= 1 << i; if (from.pos < 0) step(m0, -1, from.P); else put(m0, from.pos, from.P); }
  else step(0, -1, lv.hero);
  let best = -1;
  for (let m = m0; m < 1 << n; m++) {
    if ((m & m0) !== m0) continue;
    const base = m * nb;
    // 비운 방이 있는 옆 빌딩으로는 그냥 건너갈 수 있다
    for (let b = 1; b < nb; b++) if (dp[base + b - 1] > dp[base + b] && (m & bmask[b])) dp[base + b] = dp[base + b - 1];
    for (let b = nb - 2; b >= 0; b--) if (dp[base + b + 1] > dp[base + b] && (m & bmask[b])) dp[base + b] = dp[base + b + 1];
    for (let b = 0; b < nb; b++) { const P = dp[base + b]; if (P > 0) step(m, b, P); }
    if (dp[base + nb - 1] > best) best = dp[base + nb - 1];
  }
  return best;
}

// 레벨 만들기. custom = 타이핑으로 정한 보스 이름들(가장 최근 것이 맨 뒤), customAt = 그 보스를 정한 레벨
// 아무 생각 없이(죽는 방만 피해서) 고르는 사람이 이기는 비율(0~1) — 판이 얼마나 머리를 써야 하는지 재는 자
function luck(lv, R, tries = 60) {
  let win = 0;
  const idx = lv.rooms.map((_, i) => i);
  for (let t = 0; t < tries; t++) {
    let pos = -1, P = lv.hero; const done = new Set();
    for (let s = 0; s < 60; s++) {
      if (pos === lv.nb - 1 && P > lv.boss.p) { win++; break; }
      const c = idx.filter(i => !done.has(i) && Math.abs(lv.rooms[i].b - pos) <= 1 && (pos >= 0 || lv.rooms[i].b === 0) && apply(P, lv.rooms[i]) > 0);
      const mv = idx.filter(i => done.has(i) && Math.abs(lv.rooms[i].b - pos) === 1);
      if (!c.length && !mv.length) break;
      if (c.length && (R() < 0.8 || !mv.length)) { const i = c[Math.floor(R() * c.length)]; P = apply(P, lv.rooms[i]); done.add(i); pos = lv.rooms[i].b; }
      else pos = lv.rooms[mv[Math.floor(R() * mv.length)]].b;
    }
  }
  return win / tries;
}

// 레벨 만들기. custom = 타이핑으로 정한 보스 이름들(가장 최근 것이 맨 뒤), customAt = 그 보스를 정한 레벨
export function makeLevel(L, custom = [], customAt = 0) {
  // 레벨이 오를수록 "아무렇게나 해도 깨지는 판"을 걸러 낸다(레벨마다 조금씩 엄격하게). 처음엔 너무 가혹한 판도 거른다.
  const maxLuck = Math.max(L < 40 ? 0.12 : 0.05, 1 - (L - 1) * 0.047), minLuck = L < 12 ? 0.3 : 0;
  let pick = null, pickGap = 9;
  for (let tryNo = 0; tryNo < 40; tryNo++) {
    const seed = L * 7919 + tryNo * 104729 + 17;
    const lv = build(L, rng(seed));
    if (!lv) continue;
    const top = solve(lv);
    if (top < 2) continue;
    // 보스: 레벨이 오를수록 "가장 잘했을 때"에 바짝 붙는다 → 순서를 잘 골라야 한다
    const f = Math.min(0.97, 0.64 + L * 0.011);
    lv.boss.p = Math.max(1, Math.min(top - 1, Math.floor(top * f)));
    lv.top = top;
    const k = luck(lv, rng(seed ^ 0x5bd1e995));
    const gap = k > maxLuck ? k - maxLuck : k < minLuck ? minLuck - k : 0;
    if (gap < pickGap) { pick = lv; pickGap = gap; }
    if (!gap) break;
  }
  if (pick) {
    const lv = pick;
    // 보스 종류: 사람 · 괴물 · 야수가 번갈아. 타이핑한 보스는 정한 바로 다음 레벨과 그 뒤 5레벨마다 나온다(여럿이면 최근 것부터 돌아가며)
    let who = { ...BOSSES[(L - 1) % BOSSES.length] };
    if (custom.length && L > customAt && (L - customAt) % 5 === 1) {
      const name = custom[custom.length - 1 - Math.floor((L - customAt - 1) / 5) % custom.length];
      who = { kind: bossKind(name), name, sort: '내가 정한 보스' };
    }
    Object.assign(lv.boss, who);
    return lv;
  }
  // 여기까지 올 일은 없지만(시험으로 확인) 만약을 위해: 해골만 한 줄로 선 쉬운 판
  const hero = heroPower(L);
  const rooms = [0, 1, 2].map(b => ({ b, f: 0, t: 'sk', v: 0 }));
  let P = hero; rooms.forEach(r => { r.v = P - 1; P += r.v; });
  return { L, hero, nb: 3, floors: [1, 1, 1], rooms, boss: { ...BOSSES[(L - 1) % BOSSES.length], p: P - 1 }, top: P };
}

function build(L, R) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)); // a..b
  const hero = heroPower(L);
  const fl = shape(L, R);
  const nb = fl.length;
  // 막는 빌딩(14레벨~): 방이 저주뿐이라 꼭 하나는 밟고 지나가야 한다 — 어느 쪽을 · 언제 밟을지 골라야 한다
  const gate = new Set();
  if (L >= 14 && R() < 0.7) gate.add(ri(1, nb - 1));
  if (L >= 26 && nb >= 5 && R() < 0.5) gate.add(ri(1, nb - 1));
  const rooms = [];
  for (let b = 0; b < nb; b++) {
    if (gate.has(b)) {
      const kind = L >= 20 ? ri(0, 3) : ri(0, 1) * 3; // 0 저주 하나 · 1 반쪽 하나 · 2 저주 + 반쪽 · 3 저주 + 센 해골
      const ts = kind === 0 ? ['cu'] : kind === 1 ? ['hf'] : kind === 2 ? ['cu', 'hf'] : ['cu', 'sk'];
      if (R() < 0.5) ts.reverse();
      fl[b] = ts.length;
      ts.forEach((t, f) => rooms.push({ b, f, t, v: 0, gate: 1 }));
      continue;
    }
    for (let f = 0; f < fl[b]; f++) rooms.push({ b, f, t: 'sk', v: 0 });
  }
  // 막는 빌딩 때문에 줄어든 방 수는 다른 빌딩에 채워 준다(레벨이 올랐는데 판이 작아지지 않게)
  {
    const maxF = L < 3 ? 2 : L < 10 ? 3 : 4, want = Math.min(MAX_ROOMS, 4 + Math.floor((L - 1) * 0.45));
    const open = () => fl.map((n, b) => b).filter(b => !gate.has(b) && fl[b] < maxF);
    for (let o = open(); rooms.length < want && o.length; o = open()) { const b = o[ri(0, o.length - 1)]; rooms.push({ b, f: fl[b]++, t: 'sk', v: 0 }); }
  }
  if (rooms.length > MAX_ROOMS) return null;
  const plain = rooms.filter(r => !r.gate);
  if (L >= 4) for (const r of plain) if (R() < 0.12) r.t = 'po';
  if (L >= 10 && R() < 0.65) plain[ri(0, plain.length - 1)].t = 'x2';
  if (!plain.some(r => r.b === 0 && r.t === 'sk')) { const r = plain.find(x => x.b === 0); if (r) r.t = 'sk'; }

  // 숨은 풀이 순서를 하나 걸으면서 숫자를 정한다 → 적어도 그 순서로는 다 깰 수 있다.
  //   wander 가 클수록 빌딩을 왔다 갔다 하는 순서가 되어, 눈앞의 방이 아직 못 이기는 방인 일이 잦아진다.
  const wander = Math.min(0.8, 0.09 * (L - 1));
  const lo = Math.min(0.6, 0.25 + L * 0.012), hi = Math.min(0.97, 0.6 + L * 0.012);
  const tight = Math.min(0.5, (L - 1) * 0.03); // 아슬아슬한(내 힘 바로 아래) 해골이 나올 확률
  const left = new Set(rooms.map((_, i) => i));
  const entered = new Array(nb).fill(false);
  let pos = -1, P = hero, guard = 500;
  while (left.size && guard--) {
    let cand = [...left].filter(i => Math.abs(rooms[i].b - pos) <= 1 && (pos >= 0 || rooms[i].b === 0));
    if (!cand.length) { // 옆에 남은 방이 없으면 남은 방이 있는 쪽으로 (비운 방을 지나)
      const bs = [...left].map(i => rooms[i].b);
      const to = bs.reduce((a, b) => Math.abs(b - pos) < Math.abs(a - pos) ? b : a);
      pos += Math.sign(to - pos);
      continue;
    }
    if (R() >= wander) {
      const here = cand.filter(i => rooms[i].b === pos);
      const next = cand.filter(i => rooms[i].b === pos + 1);
      cand = here.length ? here : next.length ? next : cand;
    }
    const i = cand[ri(0, cand.length - 1)], r = rooms[i];
    left.delete(i);
    const trap = r.t === 'cu' || r.t === 'hf';
    if (r.t === 'cu') r.v = Math.max(1, ri(Math.ceil(P * 0.15), Math.ceil(P * 0.4)));
    if (trap && entered[r.b]) continue; // 이미 지나간 빌딩의 저주는 밟지 않는다(숫자만 정함)
    if (r.t === 'sk') {
      r.v = R() < tight ? P - ri(1, Math.max(1, Math.floor(P * 0.06))) : ri(Math.max(1, Math.floor(P * lo)), Math.max(1, Math.floor(P * hi)));
      r.v = Math.max(1, Math.min(P - 1, r.v));
    } else if (r.t === 'po') { const k = Math.min(P, hero * 4); r.v = Math.max(1, ri(Math.ceil(k * 0.2), Math.ceil(k * 0.6))); } // 물약은 공짜라 너무 크면 판이 싱거워진다
    P = apply(P, r);
    if (P < 1) return null;
    pos = r.b; entered[r.b] = true;
  }
  if (left.size) return null;
  return { L, hero, nb, floors: fl, rooms, boss: { p: 1 } };
}

// 메달: 0 다이아 · 1 금 · 2 은 · 3 동 · 4 검정 — 방 수(푸는 양)와 레벨(생각할 거리)에 맞춘 시간 기준(초)
export const MEDALS = ['다이아몬드', '금', '은', '동', '검정'];
export function medalTimes(lv) {
  const n = lv.rooms.length + 1, k = 1 + Math.min(1, lv.L / 40);
  return [2.2, 4, 7, 12].map(s => Math.round(s * n * k));
}
export function medalFor(lv, sec) {
  const t = medalTimes(lv);
  for (let i = 0; i < 4; i++) if (sec <= t[i]) return i;
  return 4;
}
export const MEDAL_BONUS = [500, 300, 200, 100, 0];
export function scoreFor(lv, medal) { return 100 + lv.L * 10 + MEDAL_BONUS[medal]; }
