// 게시판 설정을 홈페이지 위에서 바로 (수정 모드 › 게시판 설정, 사용자 지시 2026-11-18 "xms 접속 안 해도")
//   게시판 화면(/board/<주소>)에서 관리자가 목록 모양 · 유형 · 기능 · 권한을 고치고 저장하면 화면을 새로 그린다.
//   관리 화면(/xms/ › 게시판)과 같은 값 · 같은 API(/xms-api/admin/boards) 를 쓴다.
const CSS = `
.xe-dlg{position:fixed;inset:0;z-index:2147483100;display:flex;justify-content:flex-end;background:rgba(15,23,42,.42);font:500 15px/1.5 "Pretendard Variable",Pretendard,system-ui,sans-serif;color:#15181d;-webkit-tap-highlight-color:transparent}
.xe-dlg *{box-sizing:border-box}
.xe-pan{display:flex;flex-direction:column;width:min(460px,100vw);height:100%;background:#fff;box-shadow:-20px 0 60px rgba(0,0,0,.25);animation:xe-in .28s cubic-bezier(.22,.8,.24,1)}
@keyframes xe-in{from{transform:translateX(40px);opacity:0}}
.xe-pan header{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #e6e8ee}
.xe-pan header b{flex:1;font-size:18px;font-weight:800}
.xe-pan header small{color:#7b828c;font-weight:500}
.xe-x{width:38px;height:38px;border:0;border-radius:50%;background:#f1f3f6;font-size:20px;line-height:1;cursor:pointer;color:#15181d}
.xe-body{flex:1;overflow-y:auto;padding:6px 18px 18px;overscroll-behavior:contain}
.xe-sec{padding:16px 0;border-bottom:1px solid #eef0f4}
.xe-sec:last-child{border-bottom:0}
.xe-sec>b{display:block;margin-bottom:10px;font-size:15px;font-weight:800}
.xe-sec>small{display:block;margin-top:8px;color:#7b828c;font-size:13px}
.xe-ch{display:flex;flex-wrap:wrap;gap:8px 14px}
.xe-ch label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:500}
.xe-ch input{width:18px;height:18px;margin:0;accent-color:#2f5fd0}
.xe-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px}
.xe-seg label{display:block;cursor:pointer}
.xe-seg input{position:absolute;opacity:0}
.xe-seg span{display:block;padding:10px 6px;border:1px solid #dfe3ea;border-radius:10px;text-align:center;font-weight:700;transition:border-color .2s,background .2s,color .2s}
.xe-seg input:checked+span{border-color:#15181d;background:#15181d;color:#fff}
.xe-seg input:focus-visible+span{outline:2px solid #2f5fd0;outline-offset:2px}
.xe-perm{margin-top:12px}
.xe-perm:first-of-type{margin-top:0}
.xe-perm>i{display:block;margin-bottom:6px;font-style:normal;font-weight:700;font-size:14px;color:#4b5258}
.xe-pan footer{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid #e6e8ee;background:#fafbfc}
.xe-pan footer p{flex:1;margin:0;color:#b42318;font-size:13.5px}
.xe-btn{height:44px;padding:0 18px;border-radius:12px;border:1px solid #dfe3ea;background:#fff;font:inherit;font-weight:700;cursor:pointer;color:#15181d}
.xe-btn.go{border-color:#2f5fd0;background:#2f5fd0;color:#fff}
.xe-btn:disabled{opacity:.5;cursor:default}
.xe-btn:focus-visible,.xe-x:focus-visible{outline:2px solid #2f5fd0;outline-offset:2px}
.xe-dlg{background:transparent;pointer-events:none}
.xe-pan{pointer-events:auto}
.xe-pvnote{position:fixed;left:16px;top:16px;z-index:1;padding:9px 14px;border-radius:999px;background:#fde047;color:#111827;font-weight:800;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.xe-pvnote[hidden]{display:none}
@media (prefers-reduced-motion: reduce){.xe-pan{animation:none}}
`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (u) => fetch(u, { credentials: 'same-origin' }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '불러오지 못했습니다.'); return d; });

export async function openBoardSettings(slug) {
  if (document.querySelector('.xe-dlg')) return;
  if (!document.getElementById('xe-dlg-style')) { const st = document.createElement('style'); st.id = 'xe-dlg-style'; st.textContent = CSS; document.head.append(st); }
  const [list, info] = await Promise.all([get('/xms-api/admin/boards'), get('/xms-api/admin/me')]);
  const b = (list.boards || []).find((x) => x.slug === slug);
  if (!b) throw new Error('게시판을 찾지 못했습니다.');
  const o = b.options || {}, ls = o.list_show || {}, vs = o.view_show || {};
  const names = info.levelNames || {};
  const lv = (n) => names[n] || (n === 1 ? '관리자' : n === 9 ? '일반회원' : `${n}등급`);
  const chk = (name, on, label) => `<label><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
  const seg = (name, cur, items) => `<div class="xe-seg">${items.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${cur === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const levels = (name, cur, from, guest) => `<div class="xe-ch">${guest ? chk(guest[0], guest[1], '비회원') : ''}${Array.from({ length: 10 - from }, (_, i) => i + from).map((n) => `<label><input type="checkbox" name="${name}" value="${n}"${(cur || []).includes(n) ? ' checked' : ''}> ${esc(lv(n))}</label>`).join('')}</div>`;

  const dlg = document.createElement('div');
  dlg.className = 'xe-dlg';
  dlg.innerHTML = `<form class="xe-pan" role="dialog" aria-modal="true" aria-label="게시판 설정">
    <header><b>게시판 설정 <small>${esc(b.name)}</small></b><button type="button" class="xe-x" aria-label="닫기">×</button></header>
    <div class="xe-body">
      <div class="xe-sec"><b>목록 모양</b>${seg('list_layout', b.list_layout, [['TABLE', '테이블'], ['CARD', '카드'], ['BLOG', '블로그']])}</div>
      <div class="xe-sec"><b>게시판 유형</b>${seg('kind', o.kind === 'sermon' ? 'sermon' : '', [['', '일반 게시판'], ['sermon', '설교 게시판']])}
        <small>설교 게시판은 글마다 성경본문 · 설교자 칸이 생기고 목록과 글에 보입니다.</small></div>
      <div class="xe-sec"><b>기능</b><div class="xe-ch">${chk('use_comment', b.use_comment, '댓글')}${chk('use_secret', b.use_secret, '비밀글')}${chk('allow_guest_write', b.allow_guest_write, '비회원도 글쓰기')}</div></div>
      <div class="xe-sec"><b>목록에 보일 것</b><div class="xe-ch">${chk('ls_no', ls.no, '번호')}${chk('ls_writer', ls.writer, '작성자')}${chk('ls_date', ls.date, '작성일')}${chk('ls_views', ls.views, '조회수')}</div></div>
      <div class="xe-sec"><b>글 읽기에 보일 것</b><div class="xe-ch">${chk('vs_writer', vs.writer, '작성자')}${chk('vs_date', vs.date, '작성일')}${chk('vs_views', vs.views, '조회수')}</div></div>
      <div class="xe-sec"><b>작성자 표시</b>${seg('writer_mode', o.writer_mode === 'HIDDEN' ? 'HIDDEN' : 'NAME', [['NAME', '이름 그대로'], ['HIDDEN', '비공개로 가리기']])}</div>
      <div class="xe-sec"><b>목록 개수</b>${seg('page_size', String(o.page_size || 20), [['10', '10개'], ['20', '20개'], ['30', '30개']])}</div>
      <div class="xe-sec"><b>PDF 첨부 보기</b>${seg('pdf_view', o.pdf_view || '', [['', '끔'], ['pdf', 'PDF 뷰어'], ['book', '전자책 뷰어']])}
        <small>켜면 글에 첨부한 PDF 가 글 안에서 뷰어로 열립니다.</small></div>
      <div class="xe-sec"><b>권한</b>
        <div class="xe-perm"><i>목록을 볼 수 있는 등급</i>${levels('list_levels', b.list_levels, 1, ['allow_guest_list', b.allow_guest_list])}</div>
        <div class="xe-perm"><i>글을 읽을 수 있는 등급</i>${levels('read_levels', b.read_levels, 1, ['allow_guest_read', b.allow_guest_read])}</div>
        <div class="xe-perm"><i>글 쓸 수 있는 등급</i>${levels('write_levels', b.write_levels, 1)}</div>
        <div class="xe-perm"><i>댓글 달 수 있는 등급</i>${levels('comment_levels', b.comment_levels, 1)}</div>
        <small>비회원 글쓰기는 위 "기능"에서 켭니다. 댓글은 회원만 달 수 있습니다.</small></div>
    </div>
    <footer><p role="alert"></p><button type="button" class="xe-btn" data-x>취소</button><button type="submit" class="xe-btn go">저장</button></footer>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form'), err = dlg.querySelector('footer p');
  const close = () => { undoPreview(); dlg.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  dlg.addEventListener('click', (e) => { if (e.target.closest('.xe-x, [data-x]')) close(); });   // 왼쪽 화면을 그대로 볼 수 있게 바탕은 가리지 않는다
  form.querySelector('.xe-x').focus();

  const read = () => {
    const fd = new FormData(form), on = (n) => fd.get(n) !== null, nums = (n) => fd.getAll(n).map(Number);
    return {
      ...b,
      list_layout: fd.get('list_layout') || b.list_layout,
      list_levels: nums('list_levels'), read_levels: nums('read_levels'), write_levels: nums('write_levels'), comment_levels: nums('comment_levels'),
      allow_guest_list: on('allow_guest_list'), allow_guest_read: on('allow_guest_read'), allow_guest_write: on('allow_guest_write'),
      use_comment: on('use_comment'), use_secret: on('use_secret'),
      options: {
        ...o, list_show: { no: on('ls_no'), writer: on('ls_writer'), date: on('ls_date'), views: on('ls_views') },
        view_show: { writer: on('vs_writer'), date: on('vs_date'), views: on('vs_views') },
        writer_mode: fd.get('writer_mode'), page_size: Number(fd.get('page_size')), pdf_view: fd.get('pdf_view') || '', kind: fd.get('kind') || '',
      },
    };
  };
  // 미리보기: 고칠 때마다 저장하지 않고 그 설정으로 그린 화면을 받아 와 왼쪽(게시판 자리)만 바꾼다. 닫으면(취소) 원래 화면으로.
  const box = document.querySelector('.xms-c');
  const before = box ? box.innerHTML : null;
  let seq = 0, timer = 0, previewed = false;
  const preview = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!box) return;
      const d = read(), n = ++seq;
      const u = new URL(location.href);
      u.searchParams.delete('xe');
      u.searchParams.set('xpv', JSON.stringify({ list_layout: d.list_layout, use_comment: d.use_comment, options: d.options }));
      try {
        const html = await fetch(u, { credentials: 'same-origin' }).then((r) => r.text());
        if (n !== seq) return;
        const got = new DOMParser().parseFromString(html, 'text/html').querySelector('.xms-c');
        if (got) { box.innerHTML = got.innerHTML; previewed = true; note.hidden = false; }
      } catch { /* 미리보기만 못 함 */ }
    }, 180);
  };
  const note = document.createElement('div');
  note.className = 'xe-pvnote'; note.hidden = true; note.textContent = '미리보기 — 아직 저장하지 않았습니다';
  dlg.append(note);
  form.addEventListener('change', preview);
  const undoPreview = () => { clearTimeout(timer); seq++; if (previewed && box && before != null) box.innerHTML = before; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = read();
    const go = form.querySelector('.go');
    go.disabled = true; err.textContent = '';
    try {
      const r = await fetch(`/xms-api/admin/boards/${b.id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '저장하지 못했습니다.');
      try { sessionStorage.setItem('xms-flash', '게시판 설정을 저장했습니다.'); } catch { /* 안내만 못 함 */ }
      location.reload();
    } catch (x) { err.textContent = x.message || '저장하지 못했습니다.'; go.disabled = false; }
  });
}
