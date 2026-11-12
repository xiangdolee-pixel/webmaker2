/* BSF 3D 지구본 (사용자 지시 2026-11-12) — 천천히 돌고, 서울에서 생산 거점 · 바이어 시장으로 선이 뻗어 나간다. 끌어서 돌릴 수 있다.
   점 지도 = images/world-dots.svg 와 같은 데이터(Natural Earth, 퍼블릭 도메인)를 1도 격자로. js/globe.js 는 _dev/globe-build.mjs 가 이 파일(_dev/globe.src.js)에 점 데이터를 넣어 만든다 — 고칠 땐 이 파일을. */
(function () {
  'use strict';
  var box = document.querySelector('[data-globe]');
  if (!box) return;
  var DATA = __DATA__;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var D2R = Math.PI / 180;
  var canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d'), labelBox = box.querySelector('.globe-labels');

  // 반 칸 격자 → 경위도 (world-dots.svg: 등장방형 경도 -170~190, 위도 78~-56, 9px 간격)
  function ll(x2, y2) { return [(x2 / 2 * 9 + 4) / 1600 * 360 - 170, 78 - (y2 / 2 * 9 + 4) / 596 * 134]; }
  function vec(lon, lat) { var p = lat * D2R, l = lon * D2R; return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]; }
  var KINDS = { land: 0, cn: 1, vn: 1, mm: 1, bd: 1, kr: 2 };
  var dots = [[], [], []];   // 0 땅 · 1 생산국 · 2 한국 — [x, y, z] 단위 벡터
  Object.keys(DATA.d).forEach(function (k) {
    var s = DATA.d[k];
    for (var i = 0; i < s.length; i += 4) {
      var x2 = parseInt(s.substr(i, 2), 36), y2 = parseInt(s.substr(i + 2, 2), 36), p = ll(x2, y2);
      // 높은 위도는 경도 간격이 좁아 점이 몰리므로 솎아 낸다
      var keep = Math.max(1, Math.round(1 / Math.max(.2, Math.cos(p[1] * D2R))));
      if (x2 % keep) continue;
      var v = vec(p[0], p[1]); v.fine = (x2 % 2) || (y2 % 2);   // fine = 반 칸 사이 점(작은 화면에선 뺀다)
      dots[KINDS[k]].push(v);
    }
  });

  var SEOUL = [126.98, 37.57];
  var HUBS = DATA.pins.filter(function (p) { return Math.abs(p[0] - SEOUL[0]) + Math.abs(p[1] - SEOUL[1]) > 1; });
  var MARKETS = [[-98, 39.5], [10, 50.5], [145, -33]];
  var LABELS = [
    { at: SEOUL, t: '대한민국', s: 'BSF 서울 본사', hq: true },
    { at: [113, 33], t: '중국', s: '10개 도시', side: 'l' },
    { at: [106.7, 14], t: '베트남', s: '호찌민 · 하노이', side: 'rd' },
    { at: [96.2, 17], t: '미얀마', s: '양곤', side: 'ld' },
    { at: [90.4, 23.8], t: '방글라데시', s: '다카', side: 'l' },
    { at: MARKETS[0], t: '북미', s: '바이어', mk: true },
    { at: MARKETS[1], t: '유럽', s: '바이어', mk: true },
    { at: MARKETS[2], t: '오세아니아', s: '바이어', mk: true },
  ];
  labelBox.innerHTML = LABELS.map(function (l) {
    return '<span class="g-lab' + (l.hq ? ' hq' : l.mk ? ' mk' : '') + '"><b>' + l.t + '</b><small>' + l.s + '</small></span>';
  }).join('');
  var labEls = [].slice.call(labelBox.children);

  // 서울에서 뻗는 선: 큰 원(최단 경로)을 따라 땅 위로 살짝 떠오른 활 모양
  var A = vec(SEOUL[0], SEOUL[1]);
  function arc(to, kind, i) {
    var B = vec(to[0], to[1]);
    var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2], w = Math.acos(Math.max(-1, Math.min(1, dot))), sw = Math.sin(w) || 1;
    var lift = .03 + .32 * w / Math.PI, n = Math.max(60, Math.round(w * 130)), pts = [];
    for (var k = 0; k <= n; k++) {
      var t = k / n, a = Math.sin((1 - t) * w) / sw, b = Math.sin(t * w) / sw, h = 1 + lift * Math.sin(Math.PI * t);
      pts.push([(a * A[0] + b * B[0]) * h, (a * A[1] + b * B[1]) * h, (a * A[2] + b * B[2]) * h]);
    }
    return { pts: pts, end: B, kind: kind, dur: 1.8 + w * 1.6, delay: i * .45 };
  }
  var arcs = HUBS.map(function (p, i) { return arc(p, 'hub', i % 6); }).concat(MARKETS.map(function (p, i) { return arc(p, 'mk', 2 + i * 1.3); }));
  var grat = [];   // 경선 · 위선
  for (var lo = -180; lo < 180; lo += 30) { var g = []; for (var la = -90; la <= 90; la += 3) g.push(vec(lo, la)); grat.push(g); }
  for (var la2 = -60; la2 <= 60; la2 += 30) { var g2 = []; for (var lo2 = -180; lo2 <= 180; lo2 += 3) g2.push(vec(lo2, la2)); grat.push(g2); }

  // 보기 회전: 경도 lon0 이 가운데, 위도 tilt 만큼 숙여 북반구가 잘 보이게
  var lon0 = 112, tilt = 24, W = 0, R = 0, cx = 0, cy = 0, dpr = 1;
  var cl, sl, ct, st;
  var slct, stzz, clct;
  function setRot() { cl = Math.cos(lon0 * D2R); sl = Math.sin(lon0 * D2R); ct = Math.cos(tilt * D2R); st = Math.sin(tilt * D2R); slct = sl * ct; stzz = st; clct = cl * ct; }
  function rot(v, o) {
    var x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl, y1 = v[1];
    o[0] = x1; o[1] = y1 * ct - z1 * st; o[2] = y1 * st + z1 * ct; return o;
  }
  var tmp = [0, 0, 0];
  function resize() {
    W = box.clientWidth; dpr = Math.min(1.75, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(W * dpr);
    R = W * (W < 500 ? .42 : .4); cx = W / 2; cy = W / 2;
    labEls.forEach(function (el) { el._w = 0; el._h = 0; });
    draw(last);
  }

  var C = { land: 'rgba(21, 60, 84, ', hub: '#ea6b0c', hq: '#e2392b', mk: '#38769d' };
  function draw(time) {
    if (!W) return;
    setRot();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    // 바깥 빛(대기) + 공 음영
    var glow = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.22);
    glow.addColorStop(0, 'rgba(110, 166, 203, .38)'); glow.addColorStop(1, 'rgba(110, 166, 203, 0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, 7); ctx.fill();
    var ball = ctx.createRadialGradient(cx - R * .38, cy - R * .42, R * .05, cx, cy, R);
    ball.addColorStop(0, '#ffffff'); ball.addColorStop(.55, '#eef2f6'); ball.addColorStop(.88, '#d3dce5'); ball.addColorStop(1, '#b7c5d2');
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    // 경선 · 위선
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(21, 60, 84, .09)';
    for (var gi = 0; gi < grat.length; gi++) {
      var line = grat[gi], pen = false; ctx.beginPath();
      for (var j = 0; j < line.length; j++) {
        rot(line[j], tmp);
        if (tmp[2] > 0) { var X = cx + R * tmp[0], Y = cy - R * tmp[1]; if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true; } else pen = false;
      }
      ctx.stroke();
    }
    // 땅 점 — 가장자리로 갈수록 작고 옅게(둥근 느낌). 점마다 한 번만 돌려 깊이 4단계 길에 나눠 담는다
    var coarse = R < 230, size = Math.max(coarse ? 1.25 : .9, R / 300);
    for (var kind = 0; kind < 3; kind++) {
      var list = dots[kind], bins = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], k0 = size * (kind ? 1.55 : 1.15), sq = !kind && k0 < 1.6;
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (coarse && v.fine) continue;
        var z = v[0] * slct + v[1] * stzz + v[2] * clct;   // rot() 의 z 만 먼저 — 뒤쪽 점은 바로 건너뛴다
        if (z <= 0) continue;
        var x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl;
        var px = cx + R * x1, py = cy - R * (v[1] * ct - z1 * st), r = k0 * (.45 + .55 * z), bin = bins[z > .75 ? 3 : z > .5 ? 2 : z > .25 ? 1 : 0];
        if (sq) bin.rect(px - r, py - r, r * 2, r * 2); else { bin.moveTo(px + r, py); bin.arc(px, py, r, 0, 6.2832); }
      }
      for (var b = 0; b < 4; b++) {
        var a = .18 + .62 * (b / 4 + .125);
        ctx.fillStyle = kind === 0 ? C.land + (a * .75).toFixed(3) + ')' : kind === 1 ? 'rgba(234, 107, 12, ' + (a + .15).toFixed(3) + ')' : 'rgba(226, 57, 43, ' + Math.min(1, a + .3).toFixed(3) + ')';
        ctx.fill(bins[b]);
      }
    }
    // 선 · 움직이는 빛
    var t = time / 1000;
    for (var ai = 0; ai < arcs.length; ai++) drawArc(arcs[ai], t);
    // 거점 점
    for (var hi = 0; hi < HUBS.length; hi++) pin(vec(HUBS[hi][0], HUBS[hi][1]), C.hub, 3, t + hi * .3);
    for (var mi = 0; mi < MARKETS.length; mi++) pin(vec(MARKETS[mi][0], MARKETS[mi][1]), C.mk, 4, t + mi);
    pin(A, C.hq, 5.5, t, true);
    // 이름표 — 앞 순서(대한민국 · 중국 …)가 먼저 자리를 잡고, 겹치는 뒤 이름표는 잠시 감춘다
    var placed = [];
    for (var li = 0; li < LABELS.length; li++) {
      rot(vec(LABELS[li].at[0], LABELS[li].at[1]), tmp);
      var el = labEls[li], o = Math.max(0, Math.min(1, (tmp[2] - .12) / .2));
      el.style.opacity = o.toFixed(2);
      el.style.visibility = o > 0 ? 'visible' : 'hidden';
      if (o > 0) {
        var lw = el._w || (el._w = el.offsetWidth), lh = el._h || (el._h = el.offsetHeight), gap = W < 500 ? 7 : 12;
        var sx = cx + R * tmp[0], sy = cy - R * tmp[1], side = LABELS[li].side || 'r';
        var lx = side.charAt(0) === 'l' ? sx - lw - gap : sx + gap, ly = side.charAt(1) === 'd' ? sy + gap * .6 : sy - lh - gap * .6;
        if (lx + lw > W) lx = sx - lw - gap; if (lx < 0) lx = sx + gap;   // 화면 밖이면 반대쪽으로
        el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
        var hit = placed.some(function (r) { return lx < r[2] + 4 && lx + lw > r[0] - 4 && ly < r[3] + 4 && ly + lh > r[1] - 4; });
        if (hit) { el.style.opacity = '0'; el.style.visibility = 'hidden'; } else placed.push([lx, ly, lx + lw, ly + lh]);
      }
    }
  }
  function visible(p) { return p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1; }   // 공 뒤에 가려지지 않았나
  var q = [0, 0, 0];
  function drawArc(a, t) {
    var pts = a.pts, n = pts.length - 1, col = a.kind === 'mk' ? '56, 118, 157' : '234, 107, 12';
    // 바탕 선(옅게)
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(' + col + ', .32)'; ctx.beginPath();
    var pen = false;
    for (var i = 0; i <= n; i++) {
      rot(pts[i], q);
      if (visible(q)) { var X = cx + R * q[0], Y = cy - R * q[1]; if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true; } else pen = false;
    }
    ctx.stroke();
    // 서울에서 떠나 도착하는 빛 (머리 + 꼬리)
    var cyc = a.dur + 1.2, ph = reduce ? 1 : ((t - a.delay) % cyc + cyc) % cyc / a.dur;
    if (ph > 1.0001) return;
    var e = ph < 1 ? ph * ph * (3 - 2 * ph) : 1;   // 부드럽게 출발 · 도착
    var hf = e * n, head = Math.min(n - 1, Math.floor(hf)), fr = hf - head, tl = Math.max(0, hf - n * .28), tail = Math.floor(tl);
    var lerp = function (k, f, o) { var a1 = pts[k], b1 = pts[Math.min(n, k + 1)]; o[0] = a1[0] + (b1[0] - a1[0]) * f; o[1] = a1[1] + (b1[1] - a1[1]) * f; o[2] = a1[2] + (b1[2] - a1[2]) * f; return o; };
    var pA = [0, 0, 0], pB = [0, 0, 0], q2 = [0, 0, 0];
    ctx.lineCap = 'round';
    for (var k = tail; k <= head; k++) {
      var s0 = k === tail ? tl - tail : 0, s1 = k === head ? fr : 1;
      if (s1 <= s0) continue;
      rot(lerp(k, s0, pA), q); var x1 = cx + R * q[0], y1 = cy - R * q[1], v1 = visible(q);
      rot(lerp(k, s1, pB), q2); var x2 = cx + R * q2[0], y2 = cy - R * q2[1];
      if (!v1 || !visible(q2)) continue;
      var f = (k + s1 - tl) / Math.max(1e-6, hf - tl);
      ctx.lineWidth = 1 + 1.8 * f; ctx.strokeStyle = 'rgba(' + col + ', ' + (.12 + .88 * f).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    rot(lerp(head, fr, pA), q);
    if (!reduce && visible(q) && ph < 1) {
      var hx = cx + R * q[0], hy = cy - R * q[1], g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9);
      g.addColorStop(0, 'rgba(255, 255, 255, .95)'); g.addColorStop(.35, 'rgba(' + col + ', .8)'); g.addColorStop(1, 'rgba(' + col + ', 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fill();
    }
  }
  function pin(v, color, r, t, hq) {
    rot(v, q); if (q[2] < .02) return;
    var x = cx + R * q[0], y = cy - R * q[1], s = .5 + .5 * q[2];
    if (!reduce) {   // 퍼지는 고리
      var p = (t % 2.4) / 2.4;
      ctx.strokeStyle = color; ctx.globalAlpha = (1 - p) * .7; ctx.lineWidth = hq ? 2 : 1.2;
      ctx.beginPath(); ctx.arc(x, y, r * s * (1 + p * (hq ? 3.2 : 2.4)), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (hq) { ctx.fillStyle = 'rgba(226, 57, 43, .18)'; ctx.beginPath(); ctx.arc(x, y, r * 2.6 * s, 0, 7); ctx.fill(); }
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * s * .38, 0, 7); ctx.fill();
  }

  // 돌리기: 저절로 천천히 + 끌면 따라 돈다(손을 떼면 다시 저절로)
  var last = 0, running = false, onScreen = false, dragging = null, SPIN = 8, vel = SPIN;   // 초당 8도, vel = 지금 도는 속도(끌고 놓으면 관성)
  function frame(now) {
    if (!running) return;
    var dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (!dragging) { vel += (SPIN - vel) * Math.min(1, dt * 1.6); lon0 -= vel * dt; }
    draw(now);
    requestAnimationFrame(frame);
  }
  function play() { if (running || reduce || !onScreen || document.hidden) return; running = true; last = 0; requestAnimationFrame(frame); }
  function stop() { running = false; }
  canvas.addEventListener('pointerdown', function (e) { dragging = { x: e.clientX, y: e.clientY, lon: lon0, tilt: tilt, px: e.clientX, pt: performance.now(), v: 0 }; canvas.setPointerCapture(e.pointerId); box.classList.add('is-drag'); });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    lon0 = dragging.lon - (e.clientX - dragging.x) / R * 57;
    var tn = performance.now(), dtm = Math.max(1, tn - dragging.pt);
    dragging.v = dragging.v * .6 + ((e.clientX - dragging.px) / R * 57 / dtm * 1000) * .4; dragging.px = e.clientX; dragging.pt = tn;
    tilt = Math.max(-10, Math.min(55, dragging.tilt + (e.clientY - dragging.y) / R * 40));
    if (!running) draw(performance.now());
  });
  function up() { if (dragging) vel = Math.max(-240, Math.min(240, dragging.v)) || SPIN; dragging = null; box.classList.remove('is-drag'); }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) play(); else stop(); }, { threshold: .05 }).observe(box);
  } else { onScreen = true; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else play(); });
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  resize(); play();
})();
