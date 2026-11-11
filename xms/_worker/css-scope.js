// 사이트 안에 끼워 넣는 게시판 · 회원 화면용 CSS — xms/css/style.css 를 그대로 쓰되 모든 규칙을 .xms-c 안으로 가둔다.
//   사이트의 머리 · 꼬리 · 글꼴 · 색은 건드리지 않는다 (사용자 지시: 기존 CSS 유지한 상태에서 게시판이 들어가야 한다).
//   html · body 규칙은 버리고, :root 변수는 .xms-c 에, * 는 .xms-c 와 그 안에만.
const SCOPE = '.xms-c';

function scopeSelector(sel) {
  const s = sel.trim();
  if (!s) return null;
  if (s === ':root') return SCOPE;
  if (/^(html|body)\b/.test(s)) return null;               // 사이트 바탕은 사이트 것
  if (s === '*') return `${SCOPE}, ${SCOPE} *`;
  if (/^(dialog|::backdrop)/.test(s)) return `${SCOPE} ${s}`;
  return `${SCOPE} ${s}`;
}

// 사이트 안에서는 글자 크기(px)에 사이트 배율을 곱한다: 사이트 CSS 에서 .xms-c { --xms-fs: 1.15px } 처럼 (기본 1px = 그대로)
//   사이트 본문 글자가 큰 곳(예: sjccc 18px)에서 xms 화면만 작아 보이지 않게 (사용자 지시 2026-11-11)
const scaleFont = (decl) => decl.replace(/font-size:\s*([\d.]+)px/g, (m, n) => `font-size:calc(${n} * var(--xms-fs, 1px))`);

// 아주 작은 CSS 쪼개기: @media · @supports 는 안쪽을 다시, @keyframes · @font-face 는 그대로
function walk(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // 짝 맞는 } 찾기
    let depth = 1; let j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const inner = css.slice(open + 1, j - 1);
    if (/^@(media|supports|container)/i.test(head)) out += `${head}{${walk(inner)}}\n`;
    else if (/^@/.test(head)) out += `${head}{${inner}}\n`;
    else {
      const sels = head.split(',').map(scopeSelector).filter(Boolean);
      if (sels.length) out += `${sels.join(', ')}{${scaleFont(inner)}}\n`;
    }
    i = j;
  }
  return out;
}

// 사이트 안에서는 바탕 · 상자 꾸밈을 빼고 글자색은 사이트를 따른다. 글꼴은 늘 Pretendard(사용자 지시 2026-11-03). 강조색은 사이트가 --brand 로 바꿀 수 있다.
const BASE = `
${SCOPE}{--font:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;--ink:#1f2328;--brand:#2b2f36;--brand-ink:#fff;--brand-soft:rgba(0,0,0,.06);--top:#2b2f36;
  display:block;max-width:1100px;margin:0 auto;padding:clamp(28px,5vw,64px) 16px clamp(48px,7vw,96px);font-family:var(--font);color:inherit;line-height:1.65;text-align:left}
${SCOPE} .pub-box{background:none;border:0;box-shadow:none;padding:0;max-width:none;animation:none}
${SCOPE} .pub-box.narrow{max-width:460px;margin:0 auto}
${SCOPE} h1,${SCOPE} h2,${SCOPE} h3{color:inherit}
${SCOPE} a{color:inherit}
${SCOPE} *:not(code):not(pre):not(kbd):not(samp){font-family:var(--font)}
${SCOPE} .btn.primary,${SCOPE} .btn.dark{color:var(--brand-ink)}
`;

let cache = null;
export async function embedCss(env) {
  if (cache) return cache;
  const res = await env.ASSETS.fetch(new Request('https://assets/css/style.css'));
  const css = (await res.text()).replace(/\/\*[\s\S]*?\*\//g, '');
  cache = `/* xms 게시판 · 회원 화면 (사이트 안) — .xms-c 안에만 걸린다 */\n${walk(css)}${BASE}`;
  return cache;
}
