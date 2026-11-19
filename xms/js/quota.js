// 저장 용량 초과 안내 창 (사용자 지시 2026-11-19)
//   서버가 올리기를 거절하면 413 + { quota: true, admin, used, quota_mb } 를 준다(_worker/uploads.js checkQuota).
//   게시판 글쓰기 · 수정 모드 · 관리 화면 어디서 올리든 같은 창을 띄운다. 관리자에게는 '수정 요청' 쓰기로 바로 가는 단추를 준다
//   (새 창으로 연다 — 쓰던 글이 날아가지 않게).
//   이 파일은 다른 파일을 부르지 않는다: 수정 모드(edit.js)는 사이트 화면에서 혼자 돌아 xms CSS 가 없으므로 모양도 여기서 넣는다.
const CSS = `
dialog.xq { width: min(420px, calc(100% - 32px)); margin: auto; padding: 0; border: 0; border-radius: 18px; background: #fff; color: #1b2030;
  box-shadow: 0 24px 60px rgba(16, 20, 32, .28); font: 400 16px/1.6 Pretendard, "Pretendard Variable", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; letter-spacing: -.01em; }
dialog.xq::backdrop { background: rgba(16, 20, 32, .5); }
dialog.xq[open] { animation: xq-pop .26s cubic-bezier(.22, .8, .24, 1); }
@keyframes xq-pop { from { opacity: 0; transform: translateY(10px) scale(.98); } }
.xq-in { padding: 26px 24px 20px; }
.xq-mark { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 14px; border-radius: 50%; background: #fdeceb; color: #d9362b; }
.xq-mark svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.xq h2 { margin: 0 0 8px; font-size: 20px; font-weight: 800; line-height: 1.35; color: inherit; }
.xq p { margin: 0; font-size: 16px; color: #3d4457; word-break: keep-all; }
.xq-use { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: #f4f5f8; font-size: 14.5px; color: #3d4457; }
.xq-use b { color: #d9362b; font-weight: 700; }
.xq-bar { height: 6px; margin-top: 8px; border-radius: 99px; background: #e3e6ee; overflow: hidden; }
.xq-bar i { display: block; height: 100%; width: 100%; border-radius: inherit; background: #d9362b; }
.xq-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.xq-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px; border: 1px solid #d5d9e3; border-radius: 12px; background: #fff; color: #1b2030;
  font: inherit; font-size: 15.5px; font-weight: 700; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.xq-btn.go { border-color: #3b4cca; background: #3b4cca; color: #fff; }
.xq-btn:focus-visible { outline: 2px solid #3b4cca; outline-offset: 2px; }
@media (max-width: 380px) { .xq-acts { flex-direction: column-reverse; } .xq-btn { width: 100%; } }
@media (prefers-reduced-motion: reduce) { dialog.xq[open] { animation: none; } }`;

const size = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)}GB` : b >= 1048576 ? `${(b / 1048576).toFixed(b >= 104857600 ? 0 : 1)}MB` : `${Math.max(1, Math.round((b || 0) / 1024))}KB`);
const limit = (mb) => (mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024}GB` : `${Number(mb).toLocaleString('ko-KR')}MB`);

// 서버 응답이 용량 초과면 창을 띄우고 true
export function quotaAlert(d) {
  if (!d || !d.quota) return false;
  if (document.querySelector('dialog.xq[open]')) return true;   // 여러 장을 한꺼번에 올리다 모두 거절돼도 창은 하나
  if (!document.getElementById('xq-style')) { const s = document.createElement('style'); s.id = 'xq-style'; s.textContent = CSS; document.head.append(s); }
  const dlg = document.createElement('dialog');
  dlg.className = 'xq';
  dlg.setAttribute('aria-labelledby', 'xq-title');
  dlg.innerHTML = `<div class="xq-in">
    <div class="xq-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
    <h2 id="xq-title">저장 용량이 초과되었습니다</h2>
    <p>${d.admin ? "더 올리려면 '수정 요청' 메뉴를 통해 용량 업그레이드를 요청해 주시기 바랍니다. 쓰지 않는 글 · 사진을 지워도 자리가 생깁니다."
      : '지금은 사진이나 파일을 올릴 수 없습니다. 사이트 관리자에게 알려 주세요.'}</p>
    ${d.quota_mb ? `<div class="xq-use">사용 중 <b>${size(d.used)}</b> / 한도 ${limit(d.quota_mb)}<div class="xq-bar" aria-hidden="true"><i></i></div></div>` : ''}
    <div class="xq-acts"><button type="button" class="xq-btn" data-x>닫기</button>${d.admin ? '<a class="xq-btn go" href="/xms/#/requests/new?about=quota" target="_blank" rel="noopener">수정 요청으로 이동</a>' : ''}</div></div>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('[data-x]').onclick = () => dlg.close();
  dlg.querySelector('a.go')?.addEventListener('click', () => setTimeout(() => dlg.close(), 0));
  dlg.showModal();
  return true;
}
// 안내 창이 떠 있는 동안에는 같은 내용을 아래 작은 알림(toast)으로 또 띄우지 않는다
export const quotaOpen = () => !!document.querySelector('dialog.xq[open]');
