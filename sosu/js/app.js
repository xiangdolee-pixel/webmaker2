// 소수 — 화면 (처음 화면 · 개념 카드 · 만져 보기 · 퀴즈 · 결과)
import { STAGES, stageById, makeRound, makeReview, fmt, fx, parse } from './core.js?v=1';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app'), sheet = $('#sheet');
const KEY = 'sosu_save', OPEN = /[?&]open\b/.test(location.search);
const S = Object.assign({ stars: {}, wrong: {}, choco: 0, day: '', streak: 0, mute: false }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 못 해도 진행 */ } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const cleared = () => STAGES.filter((s) => S.stars[s.id]).map((s) => s.id);
const unlocked = (i) => OPEN || i === 0 || !!S.stars[STAGES[i - 1].id] || !!S.stars[STAGES[i].id];

/* ---------- 소리 ---------- */
let ac;
function tone(freqs, dur = .12, type = 'sine') {
  if (S.mute) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * dur * .8; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02); });
  } catch { /* 소리 없이 */ }
}
const snd = { ok: () => tone([660, 880]), no: () => tone([220, 180], .16, 'triangle'), tap: () => tone([520], .05), win: () => tone([523, 659, 784, 1047], .16) };
const btnSnd = $('#btnSnd');
const paintSnd = () => btnSnd.classList.toggle('off', S.mute);
btnSnd.onclick = () => { S.mute = !S.mute; save(); paintSnd(); snd.tap(); };
paintSnd();

/* ---------- 모은 초콜릿 ---------- */
const bank = $('#bank'), bankN = $('#bankN');
const paintBank = (bump) => { bankN.textContent = fx(S.choco * 10, 2); if (bump) { bank.classList.remove('bump'); void bank.offsetWidth; bank.classList.add('bump'); } };
bank.onclick = () => home();
paintBank();

/* ---------- 그림 ---------- */
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/></svg>';
const stars = (n) => `<span class="stars" aria-label="별 ${n}개">${[1, 2, 3].map((i) => STAR.replace('<svg', `<svg class="${i <= n ? 'on' : ''}"`)).join('')}</span>`;
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10.5V8a5 5 0 0 1 10 0v2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function plates(v) {
  const total = v.a + (v.b || 0), n = Math.max(1, Math.ceil(total / 100));
  let out = '';
  for (let p = 0; p < n; p++) {
    let c = '';
    for (let i = 0; i < 100; i++) { const k = p * 100 + i; c += `<i${k < v.a ? (v.sub && k >= v.a - v.sub ? ' class="x"' : ' class="a"') : k < total ? ' class="b"' : ''}></i>`; }
    out += `<div class="plate${v.unit === 'bar' ? ' bars' : ''}">${c}</div>`;
  }
  return { html: out, n };
}
function vis(v) {
  if (!v) return '';
  if (v.t === 'grid') {
    const p = plates(v);
    const chips = v.chips != null ? `<div class="chips"><div>${Array.from({ length: 10 }, (_, i) => `<i${i < v.chips ? ' class="a"' : ''}></i>`).join('')}</div>한 조각을 10으로 나눈 것 (하나가 0.001)</div>` : '';
    return `<div class="vis${p.n > 1 ? ' many' : ''}">${v.chips != null && !v.a ? '' : p.html}${chips}</div>`;
  }
  if (v.t === 'two') return `<div class="vis">${[[v.a, v.la], [v.b, v.lb]].map(([a, l]) => `<div class="fig">${plates({ a, unit: 'piece' }).html}<span>${l}</span></div>`).join('')}</div>`;
  if (v.t === 'line') {
    const x0 = 24, dx = 27.2; let s = `<line class="ax" x1="${x0 - 10}" y1="44" x2="${x0 + dx * 10 + 10}" y2="44"/>`;
    for (let i = 0; i <= 10; i++) { const x = x0 + dx * i, big = i % 5 === 0; s += `<line class="ax" x1="${x}" y1="${big ? 34 : 38}" x2="${x}" y2="${big ? 54 : 50}"/>`; if (i % 10 === 0) s += `<text x="${x}" y="70">${fmt(v.from + i * v.step)}</text>`; }
    if (v.mark != null) { const x = x0 + dx * v.mark, w = v.show ? 46 : 26; s += `<path class="mk" d="M${x - 6} 24h12l-6 9z"/><rect class="mk" x="${x - w / 2}" y="2" width="${w}" height="23" rx="8"/><text class="mk-t" x="${x}" y="18.5">${v.show || '?'}</text>`; }
    return `<div class="vis line"><svg viewBox="0 0 320 76" role="img" aria-label="수직선">${s}</svg></div>`;
  }
  if (v.t === 'place') {
    const [ip, fp = ''] = v.s.split('.'), names = ['소수<br>첫째 자리', '소수<br>둘째 자리', '소수<br>셋째 자리'];
    let k = 0, h = '';
    [...ip].forEach((c, i) => { const pw = ip.length - 1 - i; h += `<div class="pc${v.hi === k ? ' hi' : ''}"><small>${pw ? '십의<br>자리' : '일의<br>자리'}</small><b>${c}</b>${v.hi === -1 ? `<em>${+c * 10 ** pw}</em>` : ''}</div>`; k++; });
    h += '<div class="pc dot"><small></small><b>.</b></div>';
    [...fp].forEach((c, i) => { h += `<div class="pc${v.hi === k ? ' hi' : ''}"><small>${names[i]}</small><b>${c}</b>${v.hi === -1 ? `<em>${fmt(+c * 10 ** (2 - i))}</em>` : ''}</div>`; k++; });
    return `<div class="vis place">${h}</div>`;
  }
  if (v.t === 'col') {
    const rows = [v.a, v.b, v.r].map((s) => s.split('.')), mi = Math.max(...rows.map((r) => r[0].length)), mf = Math.max(...rows.map((r) => (r[1] || '').length));
    const row = ([ip, fp = ''], op) => `<div><span>${op}</span>${[...ip.padStart(mi, ' ')].map((c) => `<span>${c}</span>`).join('')}${mf ? `<span class="d${fp ? '' : ' g'}">.</span>` : ''}${[...fp].map((c) => `<span>${c}</span>`).join('')}${'<span class="g">0</span>'.repeat(mf - fp.length)}</div>`;
    return `<div class="vis col">${row(rows[0], '')}${row(rows[1], v.op)}${row(rows[2], '')}</div>`;
  }
  if (v.t === 'seq') return `<div class="vis seq">${v.items.map((s, i) => `${i ? '<i>›</i>' : ''}<span class="${s === '?' ? 'q' : v.hl === i ? 'hl' : ''}">${s}</span>`).join('')}</div>`;
  if (v.t === 'shift') {
    const row = (n) => { const s = String(n).padStart(5, '0'), d = n % 10 ? 3 : n % 100 ? 2 : n % 1000 ? 1 : 0; return `<tr><td>${n >= 10000 ? s[0] : ''}</td><td>${s[1]}</td><td class="d">${d ? '.' : ''}</td>${[2, 3, 4].map((i) => `<td>${i - 1 <= d ? s[i] : ''}</td>`).join('')}</tr>`; };
    return `<div class="vis shift"><table><tr><th>십</th><th>일</th><th></th><th>첫째</th><th>둘째</th><th>셋째</th></tr>${row(v.from)}${row(v.to)}</table></div>`;
  }
  return '';
}

/* ---------- 화면 바꾸기 ---------- */
let keyHandler = null, timer = 0;
function show(html, playing) {
  clearTimeout(timer); keyHandler = null; closeSheet();
  document.body.classList.toggle('playing', !!playing);
  app.innerHTML = `<div class="fade">${html}</div>`;
  window.scrollTo(0, 0);
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; sheet.className = 'sheet'; }
document.addEventListener('keydown', (e) => { if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey) keyHandler(e); });
window.addEventListener('popstate', () => home(true));
const enter = () => { if (!history.state) history.pushState({ in: 1 }, ''); };
$('#logo').onclick = (e) => { e.preventDefault(); home(); };

/* ---------- 처음 화면 ---------- */
function home(fromPop) {
  if (!fromPop && history.state) { history.back(); return; }
  const nextI = STAGES.findIndex((s) => !S.stars[s.id]), next = STAGES[nextI], done = cleared();
  const total = STAGES.reduce((n, s) => n + (S.stars[s.id] || 0), 0);
  const units = [];
  STAGES.forEach((s, i) => { let u = units[units.length - 1]; if (!u || u.name !== s.unit) units.push(u = { name: s.unit, list: [] }); u.list.push([s, i]); });
  const reviewed = S.day === today();
  show(`
    <section class="hello">
      <div>
        <h1>${done.length ? `초콜릿으로 배우는 <em>소수</em>` : `<em>소수</em>, 초콜릿 한 판이면<br>하나도 안 어려워`}</h1>
        <p>${done.length ? `${STAGES.length}단계 중 <b>${done.length}단계</b>를 깼어. 별 ${total}개!` : '한 판은 1, 한 줄은 0.1, 한 조각은 0.01. 퀴즈를 풀며 초콜릿을 모아 보자.'}</p>
        ${next ? `<button type="button" class="btn" data-go="${next.id}">${done.length ? `${nextI + 1}단계 이어서 하기` : '시작하기'}</button>` : `<button type="button" class="btn" data-review>복습하기</button>`}
      </div>
      <div class="card jar">
        ${plates({ a: S.choco % 100, unit: 'piece' }).html}
        <div class="jar-t">모은 초콜릿<b>${fx(S.choco * 10, 2)}<small>판</small></b>정답 하나에 한 조각(0.01판)</div>
      </div>
    </section>
    ${done.length ? `<section class="card review${reviewed ? ' done' : ''}"><div><h2>오늘의 복습${S.streak > 1 ? ` · ${S.streak}일째` : ''}</h2><p>${reviewed ? '오늘 복습 끝! 또 해도 좋아.' : '깬 단계에서 10문제. 자주 틀린 곳이 더 많이 나와.'}</p></div><button type="button" class="btn${reviewed ? ' ghost' : ''}" data-review>${reviewed ? '한 번 더' : '복습 시작'}</button></section>` : ''}
    ${units.map((u) => `<section class="unit"><h2 class="unit-h"><b>${u.name}</b></h2><div class="stages">${u.list.map(([s, i]) => {
      const open = unlocked(i), st = S.stars[s.id] || 0;
      return `<button type="button" class="st${st ? ' done' : ''}${s === next && open ? ' next' : ''}${open ? '' : ' lock'}" ${open ? `data-go="${s.id}"` : 'disabled aria-label="잠김"'}><span class="st-n">${open ? i + 1 : LOCK}</span><span><span class="st-t">${s.title}${s.star ? '<span class="key">핵심</span>' : ''}</span><span class="st-s">${s.sub}</span>${st ? stars(st) : ''}</span></button>`;
    }).join('')}</div></section>`).join('')}
  `);
  paintBank();
}
app.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'), rv = e.target.closest('[data-review]'), hm = e.target.closest('[data-home]');
  if (go) { snd.tap(); enter(); openStage(stageById(go.dataset.go)); }
  else if (rv) { snd.tap(); enter(); startReview(); }
  else if (hm) { snd.tap(); home(); }
});

/* ---------- 개념 카드 → 만져 보기 → 퀴즈 ---------- */
const stageTop = (s, tag) => `<div class="stage-top"><button type="button" class="back" data-home aria-label="처음 화면으로">${BACK}</button><h2><small>${tag}</small>${s.title}</h2></div>`;
function openStage(s) {
  const no = STAGES.indexOf(s) + 1;
  let i = 0;
  const slide = () => {
    if (i >= s.intro.length) return s.lab ? lab(s, no) : startStage(s);
    const c = s.intro[i];
    show(`${stageTop(s, `${no}단계 · 먼저 알아보기`)}<section class="card learn"><div class="dots">${s.intro.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}${s.lab ? '<i></i>' : ''}</div><h3>${c.h}</h3>${vis(c.vis)}<p>${c.p}</p><button type="button" class="btn wide" id="nx">${i === s.intro.length - 1 && !s.lab ? '문제 풀러 가기' : '다음'}</button>${S.stars[s.id] ? '<button type="button" class="skip" id="sk">바로 문제 풀기</button>' : ''}</section>`, true);
    $('#nx').onclick = () => { snd.tap(); i++; slide(); };
    if ($('#sk')) $('#sk').onclick = () => startStage(s);
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#nx').click(); } };
  };
  slide();
}
function lab(s, no) {
  const L = s.lab, st = L.step, d = st === 100 ? 1 : 2, u = fmt(st);
  let mi = 0, val = L.missions[0].from, last = 0, busy = false;
  show(`${stageTop(s, `${no}단계 · 직접 만져 보기`)}<section class="card learn"><div class="dots">${s.intro.map(() => '<i></i>').join('')}<i class="on"></i></div><p class="lab-say" id="say"></p><div class="lab-num" id="num"></div><div id="lv"></div><p class="lab-msg" id="msg"></p><div class="lab-btns"><button type="button" class="btn ghost" id="mn">− ${u}</button><button type="button" class="btn" id="pl">+ ${u}</button></div><button type="button" class="skip" id="sk">건너뛰고 문제 풀기</button></section>`, true);
  const paint = () => {
    const m = L.missions[mi];
    $('#say').innerHTML = `${mi + 1}/${L.missions.length} · ${m.say}`;
    $('#num').innerHTML = fx(val, d) + (fx(val, d) !== fmt(val) ? `<small>= ${fmt(val)}</small>` : '');
    const h = val / 10, sp = last > 0 ? { a: h - st / 10, b: st / 10 } : last < 0 ? { a: h + st / 10, sub: st / 10 } : { a: h };
    $('#lv').innerHTML = vis({ t: 'grid', unit: st === 100 ? 'bar' : 'piece', ...sp });
  };
  const press = (dir) => {
    if (busy) return;
    const nv = val + dir * st; if (nv < 0 || nv > 2900) return;
    const roll = dir > 0 ? nv % (st * 10) === 0 : val % (st * 10) === 0;
    val = nv; last = dir; snd.tap(); paint();
    const msg = $('#msg'), big = st === 100 ? '한 판(1)' : '한 줄(0.1)', small = st === 100 ? '줄' : '조각';
    msg.className = 'lab-msg';
    msg.innerHTML = roll ? (dir > 0 ? `${small} 10개가 모여 <b>${big}</b>이 됐어! ${fx(val - st, d)} 다음은 <b>${fmt(val)}</b>` : `${big}을 ${small} 10개로 쪼개서 하나를 뺐어! ${fmt(val + st)}보다 ${u} 작은 수는 <b>${fmt(val)}</b>`) : '';
    if (val === L.missions[mi].to) {
      busy = true; snd.ok(); msg.className = 'lab-msg ok'; msg.innerHTML = `${roll ? msg.innerHTML + '<br>' : ''}성공!`;
      timer = setTimeout(() => { busy = false; mi++; if (mi >= L.missions.length) return startStage(s); val = L.missions[mi].from; last = 0; msg.innerHTML = ''; paint(); }, roll ? 2600 : 1100);
    }
  };
  $('#pl').onclick = () => press(1); $('#mn').onclick = () => press(-1); $('#sk').onclick = () => startStage(s);
  paint();
}
function startStage(s) {
  const no = STAGES.indexOf(s) + 1;
  quiz(makeRound(s, cleared()), (r) => {
    const st = r.rate >= .9 ? 3 : r.rate >= .7 ? 2 : 1, first = !S.stars[s.id];
    S.stars[s.id] = Math.max(S.stars[s.id] || 0, st);
    const bonus = st * 2; S.choco += bonus; save();
    const nx = STAGES[no];
    result({ title: s.final ? '소수 박사 탄생!' : `${no}단계 완료!`, st, r, bonus, msg: st === 3 ? '완벽해! 이 단계는 머리에 쏙 들어갔어.' : st === 2 ? '잘했어! 한 번 더 하면 별 3개도 가능해.' : '끝까지 해냈어! 한 번 더 풀면 훨씬 쉬울 거야.',
      btns: `${nx && (st >= 2 || !first) ? `<button type="button" class="btn wide" data-go="${nx.id}">다음 단계로</button>` : ''}<button type="button" class="btn wide ${nx && (st >= 2 || !first) ? 'ghost' : ''}" data-go="${s.id}">${st < 3 ? '한 번 더 해서 별 모으기' : '다시 하기'}</button>${nx && st < 2 && first ? `<button type="button" class="btn wide ghost" data-go="${nx.id}">다음 단계로</button>` : ''}` });
  });
}
function startReview() {
  const qs = makeReview(cleared(), S.wrong);
  if (!qs.length) return home();
  quiz(qs, (r) => {
    const t = today();
    if (S.day !== t) { const y = new Date(); y.setDate(y.getDate() - 1); S.streak = S.day === `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}` ? S.streak + 1 : 1; S.day = t; }
    const st = r.rate >= .9 ? 3 : r.rate >= .7 ? 2 : 1, bonus = st * 2; S.choco += bonus; save();
    result({ title: '오늘의 복습 끝!', st, r, bonus, msg: S.streak > 1 ? `${S.streak}일째 이어서 하고 있어. 대단해!` : '내일 또 하면 더 오래 기억에 남아.', btns: '' });
  });
}
function result({ title, st, r, bonus, msg, btns }) {
  snd.win();
  show(`<section class="card result"><h2>${title}</h2>${stars(st)}<p>${msg}</p><div class="got">한 번에 맞힌 문제 <b>${r.first}</b> / ${r.total}<br>초콜릿 <b>+${fx((r.first + bonus) * 10, 2)}</b>판 (보너스 ${bonus}조각 포함)</div>${btns}<button type="button" class="btn wide ghost" data-home>처음 화면으로</button></section>`, true);
  paintBank(true);
}

/* ---------- 퀴즈 ---------- */
function quiz(list, onDone) {
  const queue = list.slice(), total = list.length;
  let solved = 0, first = 0, combo = 0, cur = null, locked = false, typed = '';
  const next = () => {
    closeSheet(); locked = false; typed = '';
    if (!queue.length) return onDone({ first, total, rate: first / total });
    cur = queue.shift(); draw();
  };
  const answers = () => {
    if (cur.kind === 'choice') return `<div class="opts">${cur.opts.map((o) => `<button type="button" class="opt${/^[\d.]+$/.test(o) ? '' : ' txt'}" data-a="${o}">${o}</button>`).join('')}</div>`;
    if (cur.kind === 'compare') return `<div class="cmp"><button type="button" class="opt" data-a="L">${cur.l}</button><button type="button" class="opt" data-a="R">${cur.r}</button><button type="button" class="opt eq-btn txt" data-a="E">두 수는 같아</button></div>`;
    return `<div class="inp" id="inp" aria-live="polite"></div><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, '←'].map((k) => `<button type="button" data-k="${k}"${k === '←' ? ' aria-label="지우기"' : ''}>${k}</button>`).join('')}<button type="button" class="go" id="go" disabled>확인</button></div>`;
  };
  const draw = () => {
    show(`<div class="qbar"><button type="button" class="back" data-home aria-label="그만하고 처음 화면으로">${BACK}</button><div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${solved}"><i style="width:${solved / total * 100}%"></i></div><span class="combo">${combo >= 2 ? `${combo}연속!` : `${solved + 1} / ${total}`}</span></div>
      <div class="qbody"><div class="qleft">${cur.missed ? '<span class="qtag">다시 도전</span><br>' : cur.review ? '<span class="qtag">복습</span><br>' : ''}<h2 class="qq">${cur.q}</h2>${vis(cur.vis)}</div><div class="qright">${answers()}</div></div>`, true);
    const right = $('.qright');
    right.onclick = (e) => {
      if (locked) return;
      const a = e.target.closest('[data-a]'), k = e.target.closest('[data-k]');
      if (a) pickAns(a.dataset.a, a);
      else if (k) key(k.dataset.k);
      else if (e.target.id === 'go') submit();
    };
    keyHandler = (e) => {
      if (!sheet.hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('.btn', sheet).click(); } return; }
      if (locked) return;
      if (cur.kind === 'input') { if (/^[\d.]$/.test(e.key)) key(e.key); else if (e.key === 'Backspace') key('←'); else if (e.key === 'Enter') submit(); }
      else if (/^[1-4]$/.test(e.key)) { const b = right.querySelectorAll('[data-a]')[+e.key - 1]; if (b) b.click(); }
    };
  };
  const key = (k) => {
    if (k === '←') typed = typed.slice(0, -1);
    else if (k === '.') { if (!typed.includes('.')) typed = (typed || '0') + '.'; }
    else if (typed.replace('.', '').length < 6) typed = typed === '0' ? k : typed + k;
    snd.tap(); $('#inp').textContent = typed; $('#go').disabled = parse(typed) == null;
  };
  const submit = () => { const v = parse(typed); if (v == null) return; const ok = v === cur.val; $('#inp').classList.add(ok ? 'ok' : 'no'); judge(ok, ok && typed !== cur.ans ? `${typed} = ${cur.ans} (맨 끝의 0은 안 써도 돼)` : ''); };
  const pickAns = (a, el) => {
    const ok = a === cur.ans; el.classList.add(ok ? 'ok' : 'no');
    if (!ok) { const r = [...$('.qright').querySelectorAll('[data-a]')].find((b) => b.dataset.a === cur.ans); if (r) r.classList.add('ok'); }
    judge(ok, '');
  };
  const judge = (ok, extra) => {
    locked = true; $('.qright').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const shown = cur.kind === 'compare' ? (cur.ans === 'E' ? '두 수는 같아' : cur.ans === 'L' ? cur.l : cur.r) : cur.ans;
    if (ok) {
      solved++; combo++;
      if (!cur.missed) { first++; S.choco++; paintBank(true); }
      save(); snd.ok();
      const note = extra || cur.note || '';
      sheet.className = 'sheet ok';
      sheet.innerHTML = `<div class="wrap sheet-in"><h3>${pick(['정답!', '맞았어!', '좋아!', '바로 그거야!'])}${cur.missed ? '' : ' <b>+0.01</b>'}</h3>${note ? `<p class="note">${note}</p>` : ''}<button type="button" class="btn wide">다음</button></div>`;
      timer = setTimeout(next, note ? 2000 : 1000);
    } else {
      combo = 0; S.wrong[cur.sid] = (S.wrong[cur.sid] || 0) + 1; save(); snd.no();
      cur.missed = true; queue.splice(Math.min(queue.length, 3), 0, cur);
      sheet.className = 'sheet no';
      sheet.innerHTML = `<div class="wrap sheet-in"><h3>괜찮아, 같이 보자. 정답은 <b>${shown}</b></h3><p class="why">${cur.why}</p>${vis(cur.whyVis)}<button type="button" class="btn wide dark">알겠어! (조금 뒤에 다시 나와)</button></div>`;
    }
    sheet.hidden = false; sheet.scrollTop = 0;
    $('.btn', sheet).onclick = () => { clearTimeout(timer); next(); };
  };
  if (OPEN) window.__sosu = () => cur;      // 시험용(?open)
  next();
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

home(true);
