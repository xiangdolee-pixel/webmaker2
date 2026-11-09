// xim 스튜디오 — 슬라이드 · 썸네일 템플릿 (Worker 의 방송용 슬라이드쇼 페이지와 운영자 화면이 같이 쓴다. DOM 없이 문자열만)
//   슬라이드: Claude 가 뽑은 구조(JSON) → 16:9 HTML. 썸네일: 캔버스 그리기 함수는 studio.js(브라우저)에 있고 여기는 색 · 규격만.

export const CHANNEL = {
  사섬: { accent: '#F7931A', accentDark: '#C2410C', glow: 'rgba(247,147,26,.35)', name: '사적인 자산왕' },
  순섬: { accent: '#A3E635', accentDark: '#6B9E00', glow: 'rgba(163,230,53,.32)', name: '순수한 크립토' },
};

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 슬라이드 한 장의 CSS (가로 1400 기준, 컨테이너 쿼리로 축소되도록 폰트는 cqw 단위)
export const SLIDE_CSS = `
.sl { container-type: inline-size; position: relative; aspect-ratio: 16 / 9; overflow: hidden; color: #fff; background: #0b1230;
  font-family: "Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif; letter-spacing: -.02em; }
.sl::before { content: ""; position: absolute; inset: 0; background:
  radial-gradient(60% 80% at 85% 20%, var(--glow) 0%, transparent 60%),
  linear-gradient(135deg, #0b1230 0%, #141c3a 55%, #1b2447 100%); }
.sl::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1.1cqw; background: var(--accent); }
.sl > * { position: relative; }
.sl .in { position: absolute; inset: 7cqw 5cqw 6cqw; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: 4cqw; }
.sl .kicker { display: inline-block; padding: .5cqw 1.4cqw; border-radius: 99cqw; background: var(--accent); color: #0b1230; font-weight: 800; font-size: 1.7cqw; }
.sl h2 { margin: 1.6cqw 0 2.4cqw; font-size: 5cqw; line-height: 1.15; font-weight: 800; word-break: keep-all; }
.sl ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 1.6cqw; }
.sl li { position: relative; padding-left: 3cqw; font-size: 2.6cqw; line-height: 1.3; font-weight: 600; color: #e8ebf5; word-break: keep-all; }
.sl li::before { content: ""; position: absolute; left: 0; top: .9cqw; width: 1.4cqw; height: 1.4cqw; border-radius: .3cqw; background: var(--accent); transform: rotate(45deg); }
.sl .right { display: grid; align-content: start; gap: 2.4cqw; }
.sl .num { padding: 2.4cqw 2.8cqw; border-radius: 1.6cqw; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); }
.sl .num b { display: block; font-size: 5.6cqw; line-height: 1; color: var(--accent); font-weight: 800; letter-spacing: -.03em; }
.sl .num span { display: block; margin-top: 1cqw; font-size: 1.9cqw; color: #c3c9dc; }
.sl .chart { padding: 2cqw 2.4cqw 1.6cqw; border-radius: 1.6cqw; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.sl .chart svg { display: block; width: 100%; height: auto; }
.sl .chart .unit { font-size: 1.5cqw; color: #9aa3bd; margin-bottom: .6cqw; }
.sl .icon { justify-self: center; width: 22cqw; height: 22cqw; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.14), rgba(255,255,255,.03)); border: 1px solid rgba(255,255,255,.1); }
.sl .icon svg { width: 12cqw; height: 12cqw; fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.sl .banner { position: absolute; left: 5cqw; right: 5cqw; bottom: 2.6cqw; display: flex; align-items: center; justify-content: space-between; gap: 2cqw;
  font-size: 2cqw; font-weight: 700; color: #fff; }
.sl .banner .copy { padding: .7cqw 1.8cqw; border-left: .5cqw solid var(--accent); background: rgba(255,255,255,.05); }
.sl .banner .pg { color: #8d95ad; font-weight: 600; font-variant-numeric: tabular-nums; }
.sl.tone-down { --accent: #ff5d5d; --glow: rgba(255,93,93,.3); }
.sl.tone-down .num b { color: #ff7b7b; }
.sl.tone-up .num b { color: #3dd68c; }
.sl .empty { position: absolute; inset: 0; display: grid; place-items: center; color: #8d95ad; font-size: 3cqw; }
`;

const ICONS = {
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5h3.2a2 2 0 0 1 0 4H9.5zM9.5 12.5h3.8a2 2 0 0 1 0 4H9.5zM11 6.5v2M11 16.5v2"/>',
  'chart-up': '<path d="M3 20h18M4 16l5-5 4 3 7-8"/><path d="M16 6h4v4"/>',
  'chart-down': '<path d="M3 20h18M4 6l5 5 4-3 7 8"/><path d="M16 16h4v-4"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  rocket: '<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 16l-2 4M15 16l2 4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
  gavel: '<path d="M4 20h9M8.5 7.5l5 5M11 5l6 6M7 9l6 6M14 12l6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
  whale: '<path d="M3 14c3-5 8-7 13-6l4-3-1 5c1 3-1 6-5 7H7c-2 0-4-1-4-3z"/><circle cx="14" cy="11" r=".8"/>',
  building: '<rect x="4" y="4" width="10" height="16" rx="1"/><path d="M14 10h6v10M7 8h2M7 12h2M7 16h2M11 8h1M11 12h1M11 16h1M17 14h1M17 17h1M3 20h18"/>',
};

function chartSvg(chart) {
  const pts = (chart?.points || []).filter((p) => p && isFinite(+p.value)).slice(0, 8);
  if (!chart?.type || pts.length < 2) return '';
  const W = 400, H = 180, padL = 10, padB = 34, padT = 14;
  const max = Math.max(...pts.map((p) => +p.value)), min = Math.min(0, ...pts.map((p) => +p.value));
  const span = (max - min) || 1;
  const x = (i) => padL + (i * (W - padL * 2)) / Math.max(1, pts.length - 1);
  const y = (v) => padT + (H - padB - padT) * (1 - (v - min) / span);
  let body = '';
  if (chart.type === 'bar') {
    const bw = Math.min(56, ((W - padL * 2) / pts.length) * .62);
    body = pts.map((p, i) => { const cx = padL + ((i + .5) * (W - padL * 2)) / pts.length; const yy = y(+p.value), y0 = y(0); return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${Math.min(yy, y0).toFixed(1)}" width="${bw}" height="${Math.max(2, Math.abs(y0 - yy)).toFixed(1)}" rx="4" fill="var(--accent)" opacity="${i === pts.length - 1 ? 1 : .55}"/><text x="${cx.toFixed(1)}" y="${H - 14}" text-anchor="middle" fill="#c3c9dc" font-size="13">${esc(p.label)}</text><text x="${cx.toFixed(1)}" y="${(Math.min(yy, y0) - 6).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">${esc(p.value)}</text>`; }).join('');
  } else {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(+p.value).toFixed(1)}`).join(' ');
    const area = `${d} L${x(pts.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
    body = `<path d="${area}" fill="var(--accent)" opacity=".15"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
      + pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(+p.value).toFixed(1)}" r="5" fill="#fff"/><text x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="middle" fill="#c3c9dc" font-size="13">${esc(p.label)}</text><text x="${x(i).toFixed(1)}" y="${(y(+p.value) - 12).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">${esc(p.value)}</text>`).join('');
  }
  return `<div class="chart">${chart.unit ? `<div class="unit">${esc(chart.unit)}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg></div>`;
}

// 슬라이드 한 장 → HTML. spec 이 없으면 빈 장.
export function slideHtml(spec, idx, total, channel = '사섬') {
  const ch = CHANNEL[channel] || CHANNEL.사섬;
  const style = `--accent:${ch.accent};--glow:${ch.glow}`;
  if (!spec) return `<div class="sl" style="${style}"><div class="empty">슬라이드 ${idx} 준비 중</div></div>`;
  const tone = spec.tone === 'down' ? 'tone-down' : spec.tone === 'up' ? 'tone-up' : '';
  const bullets = (spec.bullets || []).slice(0, 4).map((b) => `<li>${esc(b)}</li>`).join('');
  const num = spec.number?.value ? `<div class="num"><b>${esc(spec.number.value)}</b><span>${esc(spec.number.label || '')}</span></div>` : '';
  const chart = chartSvg(spec.chart);
  const icon = !chart ? `<div class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[spec.icon] || ICONS.coin}</svg></div>` : '';
  return `<div class="sl ${tone}" style="${style}">
    <div class="in">
      <div class="left">${spec.kicker ? `<span class="kicker">${esc(spec.kicker)}</span>` : ''}<h2>${esc(spec.title || '')}</h2><ul>${bullets}</ul></div>
      <div class="right">${num}${chart}${icon}</div>
    </div>
    <div class="banner"><span class="copy">${esc(spec.banner || '')}</span><span class="pg">${idx} / ${total}</span></div>
  </div>`;
}

// 썸네일 캔버스 규격 (브라우저에서 그린다 — studio.js drawThumb). 1280×720.
export const THUMB = { w: 1280, h: 720 };

// ───────── 썸네일 캔버스 그리기 (브라우저 전용) ─────────
//   opts: { channel, titleLines[], accentWords[], face: HTMLImageElement|null, badgeName, badgeRole }
//   규칙(6.1_thumbnail): 제목은 왼쪽에 3~4줄 큼직하게(높이의 55~65%), 흰 글자 + 강조 단어만 채널색, 검정 외곽선.
//   인물은 오른쪽 바스트업. 명찰은 2줄(윗줄 이름 = 톤다운 채널색 띠 + 흰 글씨, 아랫줄 소속 = 흰 띠 + 검정 글씨), 가로 42~49%.
let fontReady;
export function loadThumbFont() {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    try {
      for (const [w, f] of [[800, 'ExtraBold'], [700, 'Bold']]) {
        const ff = new FontFace('Pretendard Thumb', `url(https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-${f}.woff2)`, { weight: String(w) });
        document.fonts.add(await ff.load());
      }
    } catch { /* 폰트 못 받으면 시스템 글꼴로 */ }
  })();
  return fontReady;
}
export async function drawThumb(canvas, opts) {
  await loadThumbFont();
  const W = THUMB.w, H = THUMB.h;
  canvas.width = W; canvas.height = H;
  const ch = CHANNEL[opts.channel] || CHANNEL.사섬;
  const g = canvas.getContext('2d');
  // 배경: 어두운 남색 + 오른쪽 위 채널색 빛
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0a1028'); bg.addColorStop(.55, '#121a38'); bg.addColorStop(1, '#1a2347');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * .78, H * .3, 20, W * .78, H * .3, W * .55); glow.addColorStop(0, ch.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // 바닥 쪽 어둡게 (명찰 · 인물 하단 대비)
  const vg = g.createLinearGradient(0, H * .55, 0, H); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // 인물 (오른쪽, 바닥에 붙여 바스트업)
  let faceLeft = W;
  if (opts.face && opts.face.naturalWidth) {
    const fh = H * .92, fw = fh * (opts.face.naturalWidth / opts.face.naturalHeight);
    const fx = W - fw - 24, fy = H - fh + 6;
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 40; g.shadowOffsetY = 10;
    g.drawImage(opts.face, fx, fy, fw, fh); g.restore();
    faceLeft = fx;
  }
  // 제목: 왼쪽, 3~4줄, 폭에 맞춰 글자 크기 자동 (70~118px), 흰색 + 강조 단어 채널색, 검정 외곽선
  const lines = (opts.titleLines || []).filter(Boolean).slice(0, 4);
  const maxW = Math.min(W * .55, faceLeft - 40) - 56;
  let fs = 118;
  const font = (s) => `800 ${s}px "Pretendard Thumb", "Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif`;
  g.font = font(fs);
  for (const ln of lines) { const w = g.measureText(ln).width; if (w > maxW) fs = Math.min(fs, Math.floor(fs * maxW / w)); g.font = font(fs); }
  fs = Math.max(64, fs);
  const lh = fs * 1.14, blockH = lh * lines.length;
  let y = Math.max(H * .11, (H - blockH) / 2 - H * .04) + fs * .85;
  const accents = (opts.accentWords || []).filter(Boolean);
  g.font = font(fs); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineWidth = Math.max(8, fs * .13); g.strokeStyle = '#000';
  for (const ln of lines) {
    // 강조 단어 부분만 색을 바꾸기 위해 조각으로 나눠 그린다
    const parts = []; let rest = ln;
    while (rest) {
      let hit = null, at = -1;
      for (const a of accents) { const i = rest.indexOf(a); if (i >= 0 && (at < 0 || i < at)) { at = i; hit = a; } }
      if (!hit) { parts.push([rest, false]); break; }
      if (at > 0) parts.push([rest.slice(0, at), false]);
      parts.push([hit, true]); rest = rest.slice(at + hit.length);
    }
    let x = 56;
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    for (const [t] of parts) { g.strokeText(t, x, y); x += g.measureText(t).width; }
    g.shadowColor = 'transparent'; x = 56;
    for (const [t, acc] of parts) { g.fillStyle = acc ? ch.accent : '#fff'; g.fillText(t, x, y); x += g.measureText(t).width; }
    y += lh;
  }
  // 명찰
  if (opts.badgeName) {
    const nameFs = 40, roleFs = 28, padX = 26;
    g.font = `800 ${nameFs}px "Pretendard Thumb", Pretendard, sans-serif`;
    const nameW = g.measureText(opts.badgeName).width + padX * 2;
    g.font = `700 ${roleFs}px "Pretendard Thumb", Pretendard, sans-serif`;
    const roleW = opts.badgeRole ? g.measureText(opts.badgeRole).width + padX * 2 : 0;
    const bw = Math.max(nameW, roleW, W * .42), bh1 = 62, bh2 = opts.badgeRole ? 48 : 0;
    const bx = Math.max(40, Math.min(faceLeft + 10, W - bw - 40)), by = H - 36 - bh1 - bh2;
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
    rr(g, bx, by, bw, bh1, 12, ch.accentDark);
    if (bh2) rr(g, bx, by + bh1, bw, bh2, 12, '#fff', true);
    g.shadowColor = 'transparent';
    g.fillStyle = '#fff'; g.font = `800 ${nameFs}px "Pretendard Thumb", Pretendard, sans-serif`; g.textBaseline = 'middle'; g.fillText(opts.badgeName, bx + padX, by + bh1 / 2 + 2);
    if (bh2) { g.fillStyle = '#111'; g.font = `700 ${roleFs}px "Pretendard Thumb", Pretendard, sans-serif`; g.fillText(opts.badgeRole, bx + padX, by + bh1 + bh2 / 2 + 1); }
  }
  // 위 띠(채널색) — 브랜드 일관성
  g.fillStyle = ch.accent; g.fillRect(0, 0, W, 10);
}
function rr(g, x, y, w, h, r, color, bottomOnly) {
  g.beginPath();
  const tl = bottomOnly ? 0 : r, tr = bottomOnly ? 0 : r;
  g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); g.quadraticCurveTo(x + w, y, x + w, y + tr);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + tl); g.quadraticCurveTo(x, y, x + tl, y);
  g.closePath(); g.fillStyle = color; g.fill();
}
