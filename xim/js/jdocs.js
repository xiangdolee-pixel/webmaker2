// xim 'J-Docs' 메뉴 — 견적서 · 거래명세서 · 청구서 · 공문 (사용자 지시 2026-11-20)
//   화면은 /jd(jd.html + js/jd/*, css/jdocs.css)를 iframe 으로 끼운다 — 문서 미리보기 · PDF 코드가 xim 화면 CSS 와 섞이지 않게.
//   다른 메뉴에 다녀와도 쓰던 문서가 그대로 있게 iframe 은 한 번 만들고 숨기기만 한다.
//   안쪽 화면 주소(#/doc/12 · #/settings …)는 xim 주소 뒤(/jdocs#/doc/12)에 그대로 붙는다(F5 · 즐겨찾기) — 붙이는 일은 안쪽(js/jd/app.js)이 한다.
import { $ } from './common.js';

let frame = null;
const inner = (h) => (/^#\//.test(h) ? h : '');

export function renderJdocs({ view }) {
  view.hidden = true;
  $('#app').classList.add('jd-on');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.className = 'jd-frame';
    frame.title = 'DMS';
    frame.src = `/jd${inner(location.hash)}`;
    view.after(frame);
  } else if (frame.hidden) {
    frame.hidden = false;
    // 다녀온 사이 주소에서 빠진 안쪽 주소를 다시 붙인다
    try { const h = inner(frame.contentWindow.location.hash); if (h && h !== '#/') history.replaceState(null, '', `/jdocs${h}`); } catch { /* 아직 안 뜸 */ }
  }
}

export function stopJdocs(view) {
  if (!frame || frame.hidden) return;
  frame.hidden = true;
  view.hidden = false;
  $('#app').classList.remove('jd-on');
  if (inner(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}
