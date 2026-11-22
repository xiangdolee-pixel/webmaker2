// 소수 — 문제 만들기 (화면과 떨어져 있어 node 에서 시험할 수 있다)
// 수는 모두 1000분의 1 단위 정수로 다룬다: 0.29 → 290 (소수 계산 오차를 없애려고)

export const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const fmt = (n) => { const i = Math.floor(n / 1000), f = String(n % 1000).padStart(3, '0').replace(/0+$/, ''); return i + (f ? '.' + f : ''); };
export const fx = (n, d) => { const i = Math.floor(n / 1000); return d ? i + '.' + String(n % 1000).padStart(3, '0').slice(0, d) : String(i); };
export const parse = (s) => { if (!/^\d+(\.\d{1,3})?$/.test(s)) return null; const [i, f = ''] = s.split('.'); return +i * 1000 + +f.padEnd(3, '0'); };
const dec = (n) => (n % 10 ? 3 : n % 100 ? 2 : n % 1000 ? 1 : 0);   // 소수 몇 자리 수인가
const won = (n) => n.toLocaleString('ko-KR') + '원';              // 1 = 1000원으로 바꿔 생각하기

const D = '영일이삼사오육칠팔구';
const readInt = (i) => (i < 10 ? D[i] : i < 100 ? ((i / 10 | 0) > 1 ? D[i / 10 | 0] : '') + '십' + (i % 10 ? D[i % 10] : '') : String(i));
export const read = (s) => { const [i, f] = s.split('.'); return readInt(+i) + (f ? ' 점 ' + [...f].map((c) => D[c]).join('') : ''); };

// 조사: 끝 숫자에 받침이 있는지 (0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔)
const J = (s, pair) => { s = String(s); return s + ('013678'.includes(s[s.length - 1]) ? pair[0] : pair[1]); };
const jo = (s, pair) => ('013678'.includes(String(s).slice(-1)) ? pair[0] : pair[1]);
const b = (s) => `<b>${s}</b>`;

const UNIT = { 100: { u: '0.1', d: 1, name: '줄' }, 10: { u: '0.01', d: 2, name: '조각' }, 1: { u: '0.001', d: 3, name: '칩' } };

/* ---------- 문제 꼴 ---------- */
function choice(q, vis, ans, wrongs, why, whyVis, note) {
  const av = parse(ans), seen = new Set([ans]), out = [];
  for (const w of wrongs) {
    if (w == null || seen.has(w)) continue;
    const wv = parse(w);
    if (av != null && wv != null && wv === av) continue;
    if (wv != null && out.some((o) => parse(o) === wv)) continue;
    seen.add(w); out.push(w);
    if (out.length === 3) break;
  }
  return { kind: 'choice', q, vis, ans, opts: shuffle([ans, ...out]), why, whyVis, note };
}
const input = (q, vis, val, why, whyVis, note) => ({ kind: 'input', q, vis, val, ans: fmt(val), why, whyVis, note });
function compare(l, r, why, whyVis) {
  const a = parse(l), c = parse(r);
  return { kind: 'compare', q: '두 수의 크기를 비교해 봐. 더 큰 쪽을 눌러!', l, r, ans: a > c ? 'L' : a < c ? 'R' : 'E', why, whyVis };
}

/* ---------- 뛰어 세기 (0.1 · 0.01 · 0.001 하나 더 · 하나 덜) ---------- */
function jumpVis(base, s, up) {
  const ans = up ? base + s : base - s;
  if (s === 1 || Math.max(base, ans) > 3000) return { t: 'seq', items: [fmt(ans - s), fmt(ans), fmt(ans + s)], hl: 1 };
  return up ? { t: 'grid', a: base / 10, b: s / 10, unit: s === 100 ? 'bar' : 'piece' } : { t: 'grid', a: base / 10, sub: s / 10, unit: s === 100 ? 'bar' : 'piece' };
}
function jumpWhy(base, s, up) {
  const U = UNIT[s], ans = up ? base + s : base - s;
  let t = `${b(J(fmt(base), '은는'))} ${U.u}이 ${b(base / s + '개')}야. 하나 ${up ? '더하면' : '빼면'} ${b(ans / s + '개')}. ${U.u}이 ${ans / s}개인 수는 ${b(fmt(ans))}!`;
  if (dec(ans) < U.d) t += ` <span class="eq">${fx(ans, U.d)} = ${fmt(ans)}</span>`;
  if (s >= 10) t += `<span class="tip">1을 1000원이라고 생각하면: ${won(base)} ${up ? '+' : '−'} ${won(s)} = ${won(ans)}</span>`;
  return t;
}
function jumpWrongs(base, s, up) {
  const U = UNIT[s], ans = up ? base + s : base - s, w = [];
  if (up) {
    const f = fx(base, U.d);
    if (f.endsWith('9')) w.push(f.slice(0, -1) + '10');          // 0.29 + 0.01 → "0.210" (가장 흔한 실수)
    w.push(fmt(base + 10 * s), fmt(base + 1000), base - s >= 0 ? fmt(base - s) : null, fmt(ans + s));
  } else {
    w.push(fmt(ans + 10 * s), base - 10 * s >= 0 ? fmt(base - 10 * s) : null, fmt(base + s));
    if (s > 1) w.push(fmt(base - s / 10));
    w.push(ans - s >= 0 ? fmt(ans - s) : null);
  }
  return w;
}
function jumpQ(base, s, up, typed) {
  const U = UNIT[s], ans = up ? base + s : base - s;
  const q = `${b(fmt(base))}보다 ${b(U.u)} ${up ? '큰' : '작은'} 수는?`;
  const note = dec(ans) < U.d ? `${fx(ans, U.d)} = ${fmt(ans)}` : `${U.u}이 ${ans / s}개`;
  const help = s >= 10 && base <= 2000 ? { t: 'grid', a: base / 10, unit: s === 100 ? 'bar' : 'piece' } : null;
  return typed ? input(q, null, ans, jumpWhy(base, s, up), jumpVis(base, s, up), note)
    : choice(q, help, fmt(ans), jumpWrongs(base, s, up), jumpWhy(base, s, up), jumpVis(base, s, up), note);
}
function seqQ(start, s, up, typed) {
  const step = up ? s : -s, items = [0, 1, 2].map((i) => fmt(start + step * i)), last = start + step * 2, ans = last + step;
  const q = `${b(UNIT[s].u)}씩 ${up ? '커지고' : '작아지고'} 있어. 빈칸에 들어갈 수는?`, vis = { t: 'seq', items: [...items, '?'] };
  const why = jumpWhy(last, s, up), wv = { t: 'seq', items: [...items, fmt(ans)], hl: 3 };
  return typed ? input(q, vis, ans, why, wv) : choice(q, vis, fmt(ans), jumpWrongs(last, s, up), why, wv);
}
// 넘어가는 자리 고르기: s=10 이면 0.x9, s=100 이면 x.9, s=1 이면 0.xx9
const edgeUp = (s) => (s === 100 ? ri(0, 3) * 1000 + 900 : s === 10 ? pick([90, 190, 290, 390, 490, 590, 690, 790, 890, 990, 1090, 1990, 290, 990]) : pick([9, 19, 129, 199, 249, 399, 999, 1009, 459]));
const edgeDown = (s) => edgeUp(s) + s;
const plain = (s) => { let n; do n = ri(11, 180) * s; while (n % (10 * s) === 0 || (n + s) % (10 * s) === 0); return n; };

/* ---------- 덧셈 · 뺄셈 ---------- */
const digits = (n, d) => Math.round(n / 10 ** (3 - d));
function colWrong(a, c, d, op) {       // 자리마다 따로 계산한 흔한 실수들
  const A = fx(a, d).split('.'), C = fx(c, d).split('.');
  let cat = '', mod = '';
  for (let i = 0; i < d; i++) {
    const x = +A[1][i], y = +C[1][i], v = op === '+' ? x + y : Math.abs(x - y);
    cat += v; mod += v % 10;
  }
  const ip = op === '+' ? +A[0] + +C[0] : Math.abs(+A[0] - +C[0]);
  return [ip + '.' + cat, ip + '.' + mod];
}
function calcWrongs(a, c, op) {
  const d = Math.max(dec(a), dec(c), 1), r = op === '+' ? a + c : a - c, w = [];
  if (dec(a) !== dec(c)) {                                     // 0.5 + 0.23 → 0.28 (끝을 맞춰 버림)
    const x = digits(a, dec(a)), y = digits(c, dec(c)), v = op === '+' ? x + y : Math.abs(x - y);
    w.push(fmt(v * 10 ** (3 - d)));
  }
  for (const s of colWrong(a, c, d, op)) if (parse(s) != null) w.push(s);
  const u = 10 ** (3 - d);
  w.push(op === '-' ? fmt(a + c) : null, fmt(r + 10 * u), r - 10 * u > 0 ? fmt(r - 10 * u) : null, fmt(r + u), r - u > 0 ? fmt(r - u) : null, fmt(r * 10));
  return w;
}
function calcWhy(a, c, op) {
  const d = Math.max(dec(a), dec(c), 1), U = UNIT[10 ** (3 - d)], r = op === '+' ? a + c : a - c;
  const ca = digits(a, d), cc = digits(c, d), cr = digits(r, d);
  let t = `${b('소수점끼리 줄을 맞춰')} 계산해. `;
  if (dec(a) !== dec(c)) { const short = dec(a) < dec(c) ? a : c; t += `${J(fmt(short), '은는')} ${b(fx(short, d))}${jo(fx(short, d), '과와')} 같아. `; }
  t += `${U.u}이 ${ca}개 ${op === '+' ? '더하기' : '빼기'} ${cc}개 = ${b(cr + '개')} → ${b(fmt(r))}`;
  if (dec(r) < d && r > 0) t += ` <span class="eq">${fx(r, d)} = ${fmt(r)}</span>`;
  if (d <= 2) t += `<span class="tip">1을 1000원이라고 생각하면: ${won(a)} ${op === '+' ? '+' : '−'} ${won(c)} = ${won(r)}</span>`;
  return t;
}
const STORY = {
  '+': [(a, c) => `리본 ${b(a + 'm')}에 ${b(c + 'm')}를 이어 붙였어. 모두 몇 m일까?`, (a, c) => `우유 ${b(a + 'L')}가 있는 컵에 ${b(c + 'L')}를 더 부었어. 모두 몇 L일까?`, (a, c) => `집에서 문구점까지 ${b(a + 'km')}, 문구점에서 학교까지 ${b(c + 'km')}야. 모두 몇 km일까?`],
  '-': [(a, c) => `리본 ${b(a + 'm')}에서 ${b(c + 'm')}를 잘라 썼어. 남은 리본은 몇 m일까?`, (a, c) => `주스 ${b(a + 'L')} 중에서 ${b(c + 'L')}를 마셨어. 남은 주스는 몇 L일까?`, (a, c) => `${b(a + 'kg')}짜리 가방에서 ${b(c + 'kg')}인 책을 꺼냈어. 가방은 몇 kg이 됐을까?`],
};
function calcQ(a, c, op, typed, story) {
  const r = op === '+' ? a + c : a - c, A = fmt(a), C = fmt(c);
  const q = story ? pick(STORY[op])(A, C) : `<span class="expr">${A} ${op === '+' ? '+' : '−'} ${C} = ?</span>`;
  const why = calcWhy(a, c, op), wv = { t: 'col', a: A, b: C, op: op === '+' ? '+' : '−', r: fmt(r) };
  const d = Math.max(dec(a), dec(c), 1), note = dec(r) < d && r > 0 ? `${fx(r, d)} = ${fmt(r)}` : '';
  return typed ? input(q, null, r, why, wv, note) : choice(q, null, fmt(r), calcWrongs(a, c, op), why, wv, note);
}
// 수 고르기: carry = 받아올림(내림)이 있는가
function pair1(op, carry) {            // 소수 한 자리
  for (;;) {
    const a = ri(1, 29), c = ri(1, 19), x = a % 10, y = c % 10;
    if (!x || !y) continue;
    if (op === '+' && (x + y >= 10) === carry) return [a * 100, c * 100];
    if (op === '-' && a > c && (x < y) === carry) return [a * 100, c * 100];
  }
}
function pair2(op, carry) {            // 소수 두 자리
  for (;;) {
    const a = ri(11, 199), c = ri(11, 99), x = a % 10, y = c % 10;
    if (!x || !y) continue;
    if (op === '+' && (x + y >= 10 || (a % 100 - x + c % 100 - y) >= 100) === carry) return [a * 10, c * 10];
    if (op === '-' && a > c && (x < y || (a % 100) < (c % 100)) === carry) return [a * 10, c * 10];
  }
}
function pairMix(op) {                 // 자릿수가 다른 두 수
  for (;;) {
    const one = ri(1, 29) * 100, two = ri(1, 199) * 10;
    if (two % 100 === 0 || one % 1000 === 0 && Math.random() < .7) continue;
    const [a, c] = Math.random() < .5 ? [one, two] : [two, one];
    if (op === '+') return [a, c];
    if (a > c) return [a, c];
  }
}

/* ---------- 단계별 문제 ---------- */
const PLACE = ['일의 자리', '소수 첫째 자리', '소수 둘째 자리', '소수 셋째 자리'];
const rnd2 = () => { let n; do n = ri(101, 989); while (n % 10 === 0 || (n / 10 | 0) % 10 === 0); return n * 10; };       // 1.01~9.89, 0 없는 수
const rnd3 = () => { let n; do n = ri(1011, 9899); while (/0/.test(String(n))); return n; };
const distinct = (n, d) => new Set(fx(n, d).replace('.', '')).size === d + 1;
const typedAt = (i) => i % 2 === 1;

function placeQ(n, d, i) {             // i = 0 일의 자리, 1.. 소수 자리
  const s = fx(n, d), ch = s.replace('.', '')[i], val = +ch * 10 ** (3 - i);
  const vis = { t: 'place', s, hi: i };
  if (Math.random() < .45) return choice(`${b(s)}에서 숫자 ${b(ch)}${'013678'.includes(ch) ? '은' : '는'} 어느 자리 숫자일까?`, vis, PLACE[i], PLACE.filter((_, k) => k !== i), `소수점 바로 왼쪽이 일의 자리, 오른쪽으로 가면서 ${b('소수 첫째 · 둘째 · 셋째 자리')}야. ${ch}${'013678'.includes(ch) ? '은' : '는'} ${b(PLACE[i])} 숫자.`, vis);
  return choice(`${b(s)}에서 숫자 ${b(ch)}${'013678'.includes(ch) ? '이' : '가'} 나타내는 수는?`, vis, fmt(val), [ch, '0.' + ch, '0.0' + ch, '0.00' + ch, ch + '0'], `${ch}${'013678'.includes(ch) ? '은' : '는'} ${b(PLACE[i])}에 있어. 그 자리는 ${fmt(10 ** (3 - i))}이 몇 개인지 알려 주니까 ${b(fmt(val))}.`, vis);
}
function buildQ(n, d, typed) {         // 1이 a개, 0.1이 b개 … 인 수
  const s = fx(n, d).replace('.', ''), parts = [];
  ['1', '0.1', '0.01', '0.001'].forEach((u, i) => { if (i <= d && s[i] !== '0') parts.push(`${u}이 ${s[i]}개`); });
  const q = `${parts.join(', ')}인 수는?`, vis = { t: 'place', s: fx(n, d), hi: -1 }, why = `자리마다 하나씩 써 넣으면 돼. 빈 자리는 꼭 ${b('0')}으로 채워야 해 → ${b(fmt(n))}`;
  const z = s.replace(/0/g, '');        // 0을 빼먹은 실수
  return typed ? input(q, null, n, why, vis) : choice(q, null, fmt(n), [z[0] + '.' + z.slice(1), fmt(n * 10), fmt(Math.round(n / 10)), fmt(n + 100), fmt(n + 10)].filter((x) => !x.endsWith('.')), why, vis);
}
function countQ(k, s, typed) {         // 0.01이 k개이면?
  const U = UNIT[s], n = k * s;
  const vis = s === 1 || k > 300 ? null : { t: 'grid', a: n / 10, unit: s === 100 ? 'bar' : 'piece' };
  let why = `${U.u}이 10개면 ${fmt(s * 10)}, 100개면 ${fmt(s * 100)}. `;
  why += s === 10 ? `${k}개 = ${k >= 100 ? `판 ${k / 100 | 0}개, ` : ''}${(k % 100) / 10 | 0}줄과 ${k % 10}조각 → ${b(fmt(n))}` : `${k}개는 ${b(fmt(n))}`;
  if (dec(n) < U.d) why += ` <span class="eq">${fx(n, U.d)} = ${fmt(n)}</span>`;
  const q = `${b(U.u)}이 ${b(k + '개')}이면 얼마일까?`;
  return typed ? input(q, null, n, why, vis) : choice(q, null, fmt(n), [fmt(n * 10), fmt(Math.round(n / 10)), String(k), fmt(n * 100), '0.' + k], why, vis, dec(n) < U.d ? `${fx(n, U.d)} = ${fmt(n)}` : '');
}
function howManyQ(n, s) {              // 0.3은 0.01이 몇 개?
  const U = UNIT[s], k = n / s, d = U.d;
  return input(`${b(fmt(n))}${'013678'.includes(fmt(n).slice(-1)) ? '은' : '는'} ${b(U.u)}이 몇 개일까?`, s === 1 || k > 300 ? null : { t: 'grid', a: n / 10, unit: s === 100 ? 'bar' : 'piece' }, k * 1000,
    `${dec(n) < d ? `${fmt(n)} = ${b(fx(n, d))}. ` : ''}소수점을 빼고 읽으면 돼 → ${U.u}이 ${b(k + '개')}`, { t: 'place', s: fx(n, d), hi: -1 });
}
function readQ(s) {
  const [i, f] = s.split('.'), ans = read(s), tens = readInt(+f);
  return choice(`${b(s)}${'013678'.includes(s.slice(-1)) ? '은' : '는'} 어떻게 읽을까?`, null, ans, [`${readInt(+i)} 점 ${tens}`, [...f].reverse().join('') !== f ? read(i + '.' + [...f].reverse().join('')) : null, `${readInt(+i)} ${[...f].map((c) => D[c]).join('')}`, read(i + '.0' + f)],
    `소수점은 ${b('“점”')}이라고 읽고, 점 아래는 ${b('숫자를 하나씩')} 읽어.${f.length > 1 ? ` “${tens}”처럼 읽지 않아!` : ''} → ${b(ans)}`);
}
function fracQ(k, den) {
  const n = k * (1000 / den);
  return choice(`<span class="frac"><i>${k}</i><i>${den}</i></span> 을 소수로 쓰면?`, null, fmt(n), [fmt(n * 10), fmt(Math.round(n / 10)), String(k), k + '.' + den, '0.' + k], `${den}으로 나눈 것 중 하나가 ${b(fmt(1000 / den))}. 그게 ${k}개니까 ${b(fmt(n))}`, den === 1000 ? null : { t: 'grid', a: n / 10, unit: den === 10 ? 'bar' : 'piece' });
}
function cmpQ(type) {
  let a, c, sa, sc;
  if (type === 0) { a = ri(2, 9) * 100; c = a - ri(1, 9) * 10; }                       // 0.5 와 0.48 (길다고 큰 게 아님)
  else if (type === 1) { a = ri(1, 29) * 100; c = a; sa = fmt(a); sc = fx(c, 2); }      // 0.5 와 0.50
  else if (type === 2) { const k = ri(1, 9); a = k * 100; c = k * 10; }                 // 0.7 과 0.07
  else if (type === 3) { a = ri(11, 199) * 10; do c = a + ri(-9, 9) * 10; while (c === a || c <= 0); }
  else if (type === 4) { a = ri(1, 8) * 100 + 100; c = ri(101, a - 1); if (c % 10 === 0) c += 5; }  // 0.4 와 0.125
  else { a = ri(1, 4) * 1000; c = a - ri(1, 9) * 10; }                                  // 2 와 1.98
  sa = sa || fmt(a); sc = sc || fmt(c);
  const flip = Math.random() < .5, l = flip ? sc : sa, r = flip ? sa : sc;
  const d = Math.max(dec(a), dec(c), 1), U = UNIT[10 ** (3 - d)], L = parse(l), R = parse(r);
  const why = L === R ? `끝에 붙은 0은 있어도 없어도 같은 수야. ${b(l + ' = ' + r)}`
    : `자릿수를 똑같이 맞춰 봐: ${b(fx(L, d))} 와 ${b(fx(R, d))}. ${U.u}이 ${digits(L, d)}개와 ${digits(R, d)}개니까 ${b(L > R ? l : r)}${'013678'.includes((L > R ? l : r).slice(-1)) ? '이' : '가'} 더 커.${(L > R ? l : r).length < (L > R ? r : l).length ? ' 숫자가 길다고 큰 게 아니야!' : ''}`;
  return compare(l, r, why, d <= 2 && Math.max(L, R) <= 1000 && L !== R ? { t: 'two', a: L / 10, b: R / 10, la: l, lb: r } : null);
}
function biggestQ(small) {
  const k = ri(2, 8), set = shuffle([k * 100, k * 100 - ri(1, 9) * 10, k * 10 + ri(1, 9), k * 100 + ri(1, 9) * 10 - 100 + ri(1, 9)]).filter((v, i, arr) => arr.indexOf(v) === i);
  const ans = small ? Math.min(...set) : Math.max(...set);
  return choice(`가장 ${b(small ? '작은' : '큰')} 수는?`, null, fmt(ans), set.filter((v) => v !== ans).map(fmt), `소수 셋째 자리까지 똑같이 맞춰 봐: ${set.map((v) => fx(v, 3)).join(' , ')} → ${b(fmt(ans))}`);
}
function lineQ(s, typed) {
  const from = s === 100 ? ri(0, 2) * 1000 : s === 10 ? ri(1, 29) * 100 : ri(11, 99) * 10, i = ri(1, 9), n = from + i * s;
  const vis = { t: 'line', from, step: s, mark: i }, q = `수직선에서 ${b('화살표')}가 가리키는 수는?`;
  const why = `작은 눈금 한 칸이 ${b(UNIT[s].u)}이야. ${fmt(from)}에서 ${i}칸 갔으니까 ${b(fmt(n))}`, wv = { t: 'line', from, step: s, mark: i, show: fmt(n) };
  return typed ? input(q, vis, n, why, wv) : choice(q, vis, fmt(n), [fmt(from + i * s * 10), s > 1 ? fmt(from + i * s / 10) : null, fmt(n + s), fmt(n - s), fmt(from + i * 100)], why, wv);
}
function betweenQ() {
  const a = ri(1, 18) * 100, mid = a + ri(1, 9) * 10;
  return choice(`${b(fmt(a))}${jo(fmt(a), '과와')} ${b(fmt(a + 100))} 사이에 있는 수는?`, { t: 'line', from: a, step: 10 }, fmt(mid), [fmt(mid + 100), fmt(mid - 100), fmt(a + 100 + ri(1, 9)), fmt(mid + 200)],
    `${fmt(a)} = ${fx(a, 2)}, ${fmt(a + 100)} = ${fx(a + 100, 2)}. 그 사이에는 ${fx(a + 10, 2)}부터 ${fx(a + 90, 2)}까지 있어 → ${b(fmt(mid))}`, { t: 'line', from: a, step: 10, mark: (mid - a) / 10, show: fmt(mid) });
}
function scaleQ(mode, typed) {         // mode: 10 · 100 (배), -10 · -100 (1/10 · 1/100)
  const k = Math.abs(mode), up = mode > 0;
  let n, r;
  for (;;) {
    n = pick([ri(1, 9), ri(1, 9) * 10, ri(1, 9) * 100, ri(11, 99) * 10, ri(11, 99) * 100, ri(1, 9) * 1000, ri(101, 999) * 10, ri(11, 99), ri(11, 99) * 1000]);
    r = up ? n * k : n / k;
    if (Number.isInteger(r) && r > 0 && r < 100000) break;
  }
  const lab = up ? `${k}배` : `<span class="frac"><i>1</i><i>${k}</i></span>`;
  const q = `${b(fmt(n))}의 ${lab}${up ? '는' : '은'} 얼마일까?`;
  const why = up ? `${k}배 하면 수가 커져. 숫자들이 ${b(`왼쪽으로 ${k === 10 ? '한' : '두'} 칸`)}씩 옮겨 가 → ${b(fmt(r))}` : `1/${k} 하면 수가 작아져. 숫자들이 ${b(`오른쪽으로 ${k === 10 ? '한' : '두'} 칸`)}씩 옮겨 가 → ${b(fmt(r))}`;
  const wv = { t: 'shift', from: n, to: r };
  const cand = (up ? [n / k, k === 10 ? n * 100 : n * 10, n, r * 10, r + 1000] : [n * k, k === 10 ? n / 100 : n / 10, n, r / 10, r * 10]).filter((v) => Number.isInteger(v) && v > 0 && v < 1000000).map(fmt);
  return typed ? input(q, null, r, why, wv) : choice(q, null, fmt(r), cand, why, wv);
}
function sameQ() {
  const t = ri(0, 3);
  if (t === 0) { const n = ri(1, 29) * 100; return choice(`${b(fx(n, 2))}과 같은 수는?`, null, fmt(n), [fmt(n / 10), fmt(n + 10), fmt(n * 10 > 9999 ? n + 1000 : n * 10), fx(n / 10, 3)], `소수 ${b('맨 끝의 0')}은 지워도 같은 수야. ${b(fx(n, 2) + ' = ' + fmt(n))}`, n <= 1000 ? { t: 'grid', a: n / 10, unit: 'piece' } : null); }
  if (t === 1) { const k = ri(1, 9), n = k * 100; return choice(`${b(fmt(n))}과 같은 수는?`, null, fx(n, 2), [fx(k * 10, 2), k + '.0', `0.${k}0${k}`, fx(k, 3)], `맨 끝에 0을 붙여도 같은 수야. ${b(fmt(n) + ' = ' + fx(n, 2))} (한 줄 = 조각 10개)`, { t: 'grid', a: n / 10, unit: 'piece' }); }
  if (t === 2) { const k = ri(1, 9); return choice(`${b('0.' + k)}${jo(k, '과와')} ${b('0.0' + k)}${jo(k, '은는')} 같은 수일까?`, null, '다르다', ['같다'], `${b('가운데 있는 0')}은 지우면 안 돼! 0.${k}${jo(k, '은는')} ${k}줄, 0.0${k}${jo(k, '은는')} ${k}조각이야.`, { t: 'two', a: k * 10, b: k, la: '0.' + k, lb: '0.0' + k }); }
  const n = ri(11, 49) * 100; if (n % 1000 === 0) return sameQ();
  return choice(`${b(fmt(n))}${jo(fmt(n), '과와')} ${b(fx(n, 2))}은 같은 수일까?`, null, '같다', ['다르다'], `소수 ${b('맨 끝의 0')}은 있어도 없어도 같아. ${b(fmt(n) + ' = ' + fx(n, 2))}`);
}

const cyc = (list) => (i) => list[i % list.length](i);

export const STAGES = [
  { id: 's1', unit: '0.1 — 초콜릿 한 줄', title: '한 줄은 0.1', sub: '0.1이 몇 개?',
    intro: [
      { h: '초콜릿 한 판 = 1', p: '초콜릿 한 판을 <b>똑같이 10줄</b>로 나눴어. 그중 <b>한 줄이 0.1</b>이야. “영 점 일”이라고 읽어.', vis: { t: 'grid', a: 10, unit: 'bar' } },
      { h: '0.1이 10개면 1', p: '3줄이면 0.3, 7줄이면 0.7. <b>10줄이 다 모이면 한 판, 곧 1</b>이 돼. 13줄이면 한 판과 3줄 → 1.3', vis: { t: 'grid', a: 130, unit: 'bar' } },
    ],
    gen: cyc([
      () => { const k = ri(1, 9); return choice('색칠한 초콜릿은 얼마일까?', { t: 'grid', a: k * 10, unit: 'bar' }, fmt(k * 100), [String(k), '0.0' + k, '1.' + k, k + '.0'], `한 판을 10줄로 나눈 것 중 ${b('한 줄이 0.1')}. ${k}줄이니까 ${b(fmt(k * 100))}`); },
      (i) => countQ(pick([10, ri(11, 19), ri(2, 9), ri(21, 29), 10, 20]), 100, typedAt(i >> 1)),
      () => { const k = ri(11, 29); return choice('색칠한 초콜릿은 얼마일까?', { t: 'grid', a: k * 10, unit: 'bar' }, fmt(k * 100), [String(k), '0.' + k, fmt(k * 100 + 1000), fmt(k * 10)], `10줄이 모이면 ${b('한 판 = 1')}. ${k}줄은 ${k / 10 | 0}판과 ${k % 10}줄 → ${b(fmt(k * 100))}`); },
      () => howManyQ(pick([ri(2, 9), ri(11, 29), 10, 20]) * 100, 100),
      () => readQ(ri(0, 9) + '.' + ri(1, 9)),
    ]) },
  { id: 's2', unit: '0.1 — 초콜릿 한 줄', title: '0.1씩 뛰어 세기', sub: '0.9 다음은?', lab: { step: 100, missions: [{ from: 700, to: 1000, say: '<b>+0.1</b>을 눌러 <b>1</b>을 만들어 봐' }, { from: 1200, to: 900, say: '<b>−0.1</b>을 눌러 <b>0.9</b>를 만들어 봐' }] },
    intro: [{ h: '0.9 다음은 1', p: '0.9는 9줄. <b>한 줄 더 하면 10줄 = 한 판</b>이니까 <b>1</b>이야. “0.10”이 아니야!', vis: { t: 'grid', a: 90, b: 10, unit: 'bar' } }],
    gen: cyc([
      (i) => jumpQ(edgeUp(100), 100, true, i >= 5),
      (i) => jumpQ(edgeDown(100), 100, false, i >= 5),
      (i) => seqQ(ri(0, 2) * 1000 + 700, 100, true, i >= 5),
      (i) => seqQ(ri(1, 3) * 1000 + 200, 100, false, i >= 5),
      () => jumpQ(plain(100), 100, Math.random() < .5, true),
    ]) },

  { id: 's3', unit: '0.01 — 초콜릿 한 조각', title: '한 조각은 0.01', sub: '100조각 중 하나',
    intro: [
      { h: '한 줄을 또 10으로', p: '한 줄(0.1)을 다시 <b>10조각</b>으로 나눴어. 한 판은 모두 100조각. 그중 <b>한 조각이 0.01</b>이야. “영 점 영일”', vis: { t: 'grid', a: 1, unit: 'piece' } },
      { h: '2줄과 9조각 = 0.29', p: '줄은 소수 첫째 자리에, 조각은 소수 둘째 자리에 써. <b>2줄 9조각 → 0.29</b> “영 점 이구”', vis: { t: 'grid', a: 29, unit: 'piece' } },
      { h: '0.7과 0.07은 달라', p: '<b>0.7은 7줄</b>(70조각), <b>0.07은 겨우 7조각</b>. 가운데 0을 빼먹으면 완전히 다른 수가 돼.', vis: { t: 'two', a: 70, b: 7, la: '0.7', lb: '0.07' } },
    ],
    gen: cyc([
      () => { let h; do h = ri(11, 99); while (h % 10 === 0); return choice('색칠한 초콜릿은 얼마일까?', { t: 'grid', a: h, unit: 'piece' }, fmt(h * 10), [fmt(h * 100), fmt(h), String(h), `0.${h % 10}${h / 10 | 0}`], `${h / 10 | 0}줄과 ${h % 10}조각이야. 줄은 소수 첫째 자리, 조각은 소수 둘째 자리 → ${b(fmt(h * 10))}`); },
      () => { const h = ri(1, 9); return choice('색칠한 초콜릿은 얼마일까?', { t: 'grid', a: h, unit: 'piece' }, fmt(h * 10), [fmt(h * 100), fmt(h), String(h), fmt(h * 10 + 100)], `줄은 하나도 없고 ${h}조각뿐이야. 줄 자리에 ${b('0')}을 꼭 써야 해 → ${b(fmt(h * 10))}`); },
      () => readQ('0.' + pick([ri(11, 99), '0' + ri(1, 9), ri(11, 99)])),
      () => fracQ(pick([ri(11, 99), ri(1, 9)]), 100),
      () => { let h; do h = ri(101, 199); while (h % 10 === 0); return input('색칠한 초콜릿은 얼마일까?', { t: 'grid', a: h, unit: 'piece' }, h * 10, `한 판(1)과 ${(h % 100) / 10 | 0}줄, ${h % 10}조각 → ${b(fmt(h * 10))}`); },
    ]) },
  { id: 's4', unit: '0.01 — 초콜릿 한 조각', title: '자리마다 다른 값', sub: '2.58의 5는 얼마?',
    intro: [{ h: '자리가 값을 정해', p: '2.58에서 <b>2는 판(1)</b>이 2개, <b>5는 줄(0.1)</b>이 5개 → 0.5, <b>8은 조각(0.01)</b>이 8개 → 0.08', vis: { t: 'place', s: '2.58', hi: -1 } }],
    gen: cyc([
      () => { let n; do n = rnd2(); while (!distinct(n, 2)); return placeQ(n, 2, ri(0, 2)); },
      (i) => buildQ(rnd2(), 2, i >= 5),
      () => { let n; do n = rnd2(); while (!distinct(n, 2)); return placeQ(n, 2, ri(1, 2)); },
      (i) => buildQ(ri(1, 9) * 1000 + ri(1, 9) * 10, 2, i >= 5),          // 3.04 처럼 0 이 낀 수
    ]) },
  { id: 's5', unit: '0.01 — 초콜릿 한 조각', title: '0.01이 몇 개?', sub: '0.01이 30개면 0.3',
    intro: [
      { h: '조각으로 세어 보기', p: '0.29는 2줄 9조각. 줄을 모두 조각으로 바꾸면 <b>0.01이 29개</b>야. 소수점을 빼고 읽으면 돼!', vis: { t: 'grid', a: 29, unit: 'piece' } },
      { h: '0.01이 30개면?', p: '조각 30개는 <b>딱 3줄</b>. 그래서 0.30, 그리고 <b>0.30 = 0.3</b>이야. 100개가 모이면 한 판, 1!', vis: { t: 'grid', a: 30, unit: 'piece' } },
    ],
    gen: cyc([
      (i) => countQ(pick([ri(11, 99), ri(2, 9) * 10, ri(11, 99)]), 10, typedAt(i >> 1)),
      () => howManyQ(pick([ri(11, 99) * 10, ri(1, 9) * 100, ri(1, 9) * 100]), 10),
      (i) => countQ(pick([100, ri(101, 199), ri(2, 9) * 10, 200, ri(1, 9)]), 10, typedAt(i >> 1)),
      () => howManyQ(pick([1000, ri(101, 199) * 10, ri(11, 19) * 100]), 10),
    ]) },
  { id: 's6', unit: '0.01 — 초콜릿 한 조각', title: '0.01씩 뛰어 세기', sub: '0.29 다음은 0.3', star: true, lab: { step: 10, missions: [{ from: 270, to: 300, say: '<b>+0.01</b>을 눌러 <b>0.3</b>을 만들어 봐' }, { from: 300, to: 280, say: '<b>−0.01</b>을 눌러 <b>0.28</b>을 만들어 봐' }, { from: 970, to: 1010, say: '<b>+0.01</b>을 눌러 <b>1.01</b>을 만들어 봐' }] },
    intro: [
      { h: '0.29에 한 조각을 더하면', p: '0.29는 조각 29개. 하나 더 하면 <b>30개</b>. 낱조각 10개가 모여 <b>한 줄</b>이 되니까 딱 3줄 → <b>0.30 = 0.3</b>', vis: { t: 'grid', a: 29, b: 1, unit: 'piece' } },
      { h: '0.3에서 한 조각을 빼면', p: '0.3은 조각 30개. 하나 빼면 <b>29개 → 0.29</b>. 한 줄을 조각 10개로 쪼개서 하나를 떼는 거야.', vis: { t: 'grid', a: 30, sub: 1, unit: 'piece' } },
    ],
    gen: cyc([
      (i) => jumpQ(edgeUp(10), 10, true, i >= 5),
      (i) => jumpQ(edgeDown(10), 10, false, i >= 5),
      (i) => seqQ(edgeUp(10) - 20, 10, true, i >= 5),
      (i) => seqQ(edgeDown(10) + 20, 10, false, i >= 5),
      () => jumpQ(plain(10), 10, Math.random() < .5, true),
    ]) },
  { id: 's7', unit: '0.01 — 초콜릿 한 조각', title: '0.3과 0.30은 같아', sub: '끝자리 0',
    intro: [{ h: '맨 끝의 0은 지워도 돼', p: '3줄(0.3)과 조각 30개(0.30)는 <b>똑같은 양</b>이야. 그래서 <b>0.30 = 0.3</b>. 하지만 0.03처럼 <b>가운데 0</b>은 지우면 안 돼!', vis: { t: 'two', a: 30, b: 3, la: '0.3 = 0.30', lb: '0.03' } }],
    gen: cyc([sameQ, () => cmpQ(1), sameQ, () => cmpQ(2), sameQ]) },

  { id: 's8', unit: '0.001 — 더 작은 수', title: '0.001 만나기', sub: '한 조각을 또 10으로',
    intro: [
      { h: '조각을 또 10으로', p: '한 조각(0.01)을 다시 10으로 나눈 것 중 하나가 <b>0.001</b>이야. “영 점 영영일”. 1을 <b>1000으로</b> 나눈 것 중 하나.', vis: { t: 'grid', a: 0, chips: 1, unit: 'piece' } },
      { h: '자리가 하나 더', p: '3.276 에서 6은 <b>소수 셋째 자리</b> 숫자고 <b>0.006</b>을 나타내. 읽을 때는 “삼 점 이칠육”', vis: { t: 'place', s: '3.276', hi: 3 } },
    ],
    gen: cyc([
      (i) => countQ(pick([ri(101, 999), ri(11, 99), ri(1, 9) * 100, ri(11, 99) * 10, ri(1, 9)]), 1, typedAt(i >> 1)),
      () => { let n; do n = rnd3(); while (!distinct(n, 3)); return placeQ(n, 3, ri(1, 3)); },
      () => readQ('0.' + pick([String(ri(101, 999)), ri(1, 9) + '0' + ri(1, 9), '0' + ri(11, 99)])),
      (i) => buildQ(pick([rnd3(), ri(1, 9) * 1000 + ri(1, 9) * 100 + ri(1, 9), ri(1, 9) * 1000 + ri(1, 9)]), 3, i >= 5),
      () => fracQ(pick([ri(101, 999), ri(11, 99), ri(1, 9)]), 1000),
    ]) },
  { id: 's9', unit: '0.001 — 더 작은 수', title: '0.001씩 뛰어 세기', sub: '0.129 다음은 0.13',
    intro: [{ h: '똑같은 규칙이야', p: '0.129는 0.001이 129개. 하나 더 하면 130개 → <b>0.130 = 0.13</b>. 10개가 모이면 <b>윗자리 하나</b>가 되는 건 늘 같아.', vis: { t: 'seq', items: ['0.128', '0.129', '0.13'], hl: 2 } }],
    gen: cyc([
      (i) => jumpQ(edgeUp(1), 1, true, i >= 5),
      (i) => jumpQ(edgeDown(1), 1, false, i >= 5),
      (i) => seqQ(edgeUp(1) - 2, 1, true, i >= 5),
      (i) => seqQ(edgeDown(1) + 2, 1, false, i >= 5),
      () => jumpQ(plain(1), 1, Math.random() < .5, true),
    ]) },

  { id: 's10', unit: '크기 비교', title: '어느 쪽이 더 클까', sub: '0.5와 0.48',
    intro: [
      { h: '길다고 큰 게 아니야', p: '0.5와 0.48. 숫자가 많은 0.48이 커 보이지만, <b>0.5 = 0.50</b>이니까 조각 50개와 48개. <b>0.5가 더 커!</b>', vis: { t: 'two', a: 50, b: 48, la: '0.5', lb: '0.48' } },
      { h: '앞자리부터 비교해', p: '일의 자리 → 소수 첫째 자리 → 둘째 자리 순서로, <b>먼저 다른 자리</b>에서 큰 쪽이 큰 수야.', vis: { t: 'place', s: '0.50', hi: 1 } },
    ],
    gen: cyc([() => cmpQ(0), () => cmpQ(3), () => cmpQ(2), () => biggestQ(false), () => cmpQ(4), () => cmpQ(1), () => cmpQ(5), () => biggestQ(true)]) },
  { id: 's11', unit: '크기 비교', title: '수직선에서 찾기', sub: '0.3과 0.4 사이',
    intro: [{ h: '0.3과 0.4 사이에도 수가 있어', p: '0.3과 0.4 사이를 10칸으로 나누면 <b>한 칸이 0.01</b>. 0.31, 0.32 … 0.39가 숨어 있어.', vis: { t: 'line', from: 300, step: 10, mark: 5, show: '0.35' } }],
    gen: cyc([(i) => lineQ(100, i >= 5), (i) => lineQ(10, i >= 5), betweenQ, (i) => lineQ(10, i >= 5), (i) => lineQ(1, i >= 5)]) },

  { id: 's12', unit: '10배와 1/10', title: '10배 · 100배', sub: '0.05의 10배는 0.5',
    intro: [{ h: '10배 하면 한 칸 왼쪽으로', p: '조각(0.01) 10개가 한 줄(0.1)이었지? 그래서 <b>0.01의 10배는 0.1</b>. 10배 하면 숫자들이 <b>왼쪽으로 한 칸</b>씩 옮겨 가.', vis: { t: 'shift', from: 50, to: 500 } }],
    gen: cyc([(i) => scaleQ(10, i >= 5), (i) => scaleQ(10, i >= 5), (i) => scaleQ(100, i >= 5)]) },
  { id: 's13', unit: '10배와 1/10', title: '1/10 · 1/100', sub: '0.5의 1/10은 0.05',
    intro: [{ h: '1/10 하면 한 칸 오른쪽으로', p: '한 줄(0.1)을 10으로 나누면 한 조각(0.01). 그래서 <b>0.1의 1/10은 0.01</b>. 숫자들이 <b>오른쪽으로 한 칸</b>씩 옮겨 가.', vis: { t: 'shift', from: 500, to: 50 } }],
    gen: cyc([(i) => scaleQ(-10, i >= 5), (i) => scaleQ(-10, i >= 5), (i) => scaleQ(-100, i >= 5), (i) => scaleQ(10, i >= 5)]) },

  { id: 's14', unit: '소수의 덧셈', title: '줄끼리 더하기', sub: '0.7 + 0.5',
    intro: [{ h: '0.1이 몇 개인지 세면 돼', p: '0.7 + 0.5 는 <b>7줄 + 5줄 = 12줄</b>. 10줄은 한 판이 되니까 <b>1.2</b>. “0.12”가 아니야!', vis: { t: 'grid', a: 70, b: 50, unit: 'bar' } }],
    gen: cyc([
      (i) => calcQ(...pair1('+', false), '+', i >= 5),
      (i) => calcQ(...pair1('+', true), '+', i >= 5),
      (i) => { const a = ri(1, 9); return calcQ(a * 100, (10 - a) * 100 + pick([0, 0, 1000]), '+', i >= 5); },
      (i) => calcQ(...pair1('+', true), '+', i >= 5, true),
    ]) },
  { id: 's15', unit: '소수의 덧셈', title: '조각끼리 더하기', sub: '0.29 + 0.01', star: true,
    intro: [{ h: '0.01이 몇 개인지 세면 돼', p: '0.38 + 0.47 은 <b>조각 38개 + 47개 = 85개</b> → 0.85. 자연수 덧셈이랑 똑같아. 소수점만 <b>제자리에</b> 찍으면 돼.', vis: { t: 'col', a: '0.38', b: '0.47', op: '+', r: '0.85' } }],
    gen: cyc([
      (i) => calcQ(...pair2('+', false), '+', i >= 5),
      (i) => calcQ(edgeUp(10), 10, '+', i >= 5),
      (i) => calcQ(...pair2('+', true), '+', i >= 5),
      (i) => { const a = ri(11, 89); return calcQ(a * 10, (100 - a) * 10, '+', i >= 5); },
      (i) => calcQ(...pair2('+', true), '+', i >= 5, true),
    ]) },
  { id: 's16', unit: '소수의 덧셈', title: '자릿수가 다를 때', sub: '0.5 + 0.23',
    intro: [{ h: '소수점끼리 줄 맞추기', p: '0.5 + 0.23 을 끝을 맞춰 더하면 틀려! <b>소수점끼리</b> 맞추고, 빈자리는 0으로 채워: <b>0.50 + 0.23 = 0.73</b>', vis: { t: 'col', a: '0.5', b: '0.23', op: '+', r: '0.73' } }],
    gen: cyc([
      (i) => calcQ(...pairMix('+'), '+', i >= 5),
      (i) => calcQ(ri(1, 9) * 100, ri(1, 9) * 10, '+', i >= 5),
      (i) => calcQ(...pairMix('+'), '+', i >= 5),
      (i) => calcQ(ri(1, 4) * 1000, ri(11, 99) * 10, '+', i >= 5),
      (i) => calcQ(...pairMix('+'), '+', i >= 5, true),
    ]) },

  { id: 's17', unit: '소수의 뺄셈', title: '줄끼리 빼기', sub: '1.2 − 0.5',
    intro: [{ h: '0.1이 몇 개인지 세면 돼', p: '1.2 − 0.5 는 <b>12줄 − 5줄 = 7줄</b> → 0.7. 한 판을 10줄로 풀어서 빼는 거야.', vis: { t: 'grid', a: 120, sub: 50, unit: 'bar' } }],
    gen: cyc([
      (i) => calcQ(...pair1('-', false), '-', i >= 5),
      (i) => calcQ(...pair1('-', true), '-', i >= 5),
      (i) => calcQ(ri(1, 3) * 1000, ri(1, 9) * 100, '-', i >= 5),
      (i) => calcQ(...pair1('-', true), '-', i >= 5, true),
    ]) },
  { id: 's18', unit: '소수의 뺄셈', title: '조각끼리 빼기', sub: '0.3 − 0.01', star: true,
    intro: [{ h: '0.3 − 0.01 은?', p: '0.3 = 0.30, 조각 30개. 하나 빼면 <b>29개 → 0.29</b>. 0.52 − 0.17 도 <b>52개 − 17개 = 35개</b> → 0.35', vis: { t: 'col', a: '0.3', b: '0.01', op: '−', r: '0.29' } }],
    gen: cyc([
      (i) => calcQ(...pair2('-', false), '-', i >= 5),
      (i) => calcQ(edgeDown(10), 10, '-', i >= 5),
      (i) => calcQ(...pair2('-', true), '-', i >= 5),
      (i) => calcQ(1000, ri(1, 99) * 10, '-', i >= 5),
      (i) => calcQ(...pair2('-', true), '-', i >= 5, true),
    ]) },
  { id: 's19', unit: '소수의 뺄셈', title: '자릿수가 다를 때', sub: '0.5 − 0.23',
    intro: [{ h: '빈자리는 0으로', p: '0.5 − 0.23 도 <b>소수점끼리</b> 맞춰. 0.5 = 0.50 이니까 <b>50개 − 23개 = 27개 → 0.27</b>', vis: { t: 'col', a: '0.5', b: '0.23', op: '−', r: '0.27' } }],
    gen: cyc([
      (i) => calcQ(...pairMix('-'), '-', i >= 5),
      (i) => { const a = ri(2, 9) * 100; return calcQ(a, ri(1, a / 10 - 1) * 10, '-', i >= 5); },
      (i) => calcQ(...pairMix('-'), '-', i >= 5),
      (i) => calcQ(ri(1, 3) * 1000, ri(11, 99) * 10, '-', i >= 5),
      (i) => calcQ(...pairMix('-'), '-', i >= 5, true),
    ]) },

  { id: 's20', unit: '마지막 도전', title: '소수 박사 시험', sub: '모두 섞어서 12문제', count: 12, final: true, intro: [], gen: null },
];

export const stageById = (id) => STAGES.find((s) => s.id === id);

// 한 판(문제 묶음) 만들기: 그 단계 문제 + 앞 단계 복습 2문제
export function makeRound(stage, cleared = []) {
  const n = stage.count || 10, out = [];
  if (stage.final) {
    const pool = shuffle(STAGES.filter((s) => s.gen));
    for (let i = 0; i < n; i++) { const s = pool[i % pool.length]; out.push(tag(s.gen(ri(0, 9)), s.id)); }
    return out;
  }
  const prev = cleared.filter((id) => id !== stage.id && stageById(id) && stageById(id).gen), rev = prev.length ? 2 : 0;
  for (let i = 0; i < n - rev; i++) out.push(tag(stage.gen(i), stage.id));
  for (let i = 0; i < rev; i++) { const s = stageById(pick(prev)); out.push(tag(s.gen(ri(0, 9)), s.id, true)); }
  return out;
}
// 오늘의 복습: 깬 단계에서, 많이 틀린 곳일수록 자주
export function makeReview(cleared, wrong = {}, n = 10) {
  const bag = [];
  for (const id of cleared) { const s = stageById(id); if (!s || !s.gen) continue; const w = 1 + Math.min(4, (wrong[id] || 0)) + (s.star ? 2 : 0); for (let i = 0; i < w; i++) bag.push(s); }
  const out = [];
  for (let i = 0; i < n && bag.length; i++) { const s = pick(bag); out.push(tag(s.gen(ri(0, 9)), s.id, true)); }
  return out;
}
function tag(q, sid, review) { q.sid = sid; q.review = !!review; return q; }
