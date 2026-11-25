// 심사위원(레벨1 · 2) 신청자 확인 (/member/apply/list · /member/apply/<번호>) — 찾기 · 상태로 거르기 · 상태 바꾸기 · 서류 크게 보기
import { $, $$, esc, makeApi, toast, openDialog, busy, confirmInline } from './common.js';

const admin = makeApi('/xms-api/admin');   // 최종 선정 등 레벨1 만 하는 일
const judge = makeApi('/xms-api');         // 점수 주기 — 레벨1 · 2 (레벨2 는 관리 API 에 못 들어간다)
const LABEL = { SUBMITTED: '접수', CHECKED: '서류 확인', SELECTED: '선정', REJECTED: '미선정' };
const tagHtml = (st) => `<span class="apx-tag st-${st.toLowerCase()}">${LABEL[st]}</span>`;

// 신청서에서 바꾼 점수 · 선정을 적어 두었다가, 뒤로 가기로 돌아온 목록(브라우저가 들고 있던 옛 화면)에 바로 반영한다.
//   t = 서버 시각. 목록 화면이 그린 시각(data-t)보다 나중에 바꾼 것만 덮는다 → 새로 받은 목록은 그대로.
const MEMO = 'apx-chg';
const memo = () => { try { return JSON.parse(sessionStorage.getItem(MEMO)) || {}; } catch { return {}; } };
const remember = (id, part) => {
  try { const m = memo(); m[id] = { ...m[id], ...part }; sessionStorage.setItem(MEMO, JSON.stringify(m)); } catch { /* 저장 못 하면 새로고침 때 보임 */ }
};

// 목록: 위 숫자 칸을 누르면 그 상태만, 찾기 칸은 이름 · 학과 · 학번
const list = $('[data-apx-list]');
if (list) {
  let f = 'all';
  const q = $('[data-apx-q]', list);
  const draw = () => {
    const s = (q?.value || '').trim().toLowerCase();
    let n = 0;
    $$('.apx-card', list).forEach((c) => {
      const hit = (f === 'all' || c.dataset.st === f) && (!s || c.dataset.q.includes(s));
      c.hidden = !hit; if (hit) n++;
    });
    const none = $('[data-apx-none]', list);
    if (none) none.hidden = n > 0;
  };
  $$('.apx-stat', list).forEach((b) => b.addEventListener('click', () => {
    f = b.dataset.f;
    $$('.apx-stat', list).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    draw();
  }));
  q?.addEventListener('input', draw);
  // 정렬: 번호 순(먼저 낸 사람부터) · 합계 높은 순(같으면 번호 순) — 카드만 다시 놓는다
  $('[data-apx-sort]', list)?.addEventListener('change', (e) => {
    const box = $('.apx-list', list);
    const bySum = e.target.value === 'sum';
    $$('.apx-card', box).sort((x, y) => (bySum ? y.dataset.sum - x.dataset.sum : 0) || x.dataset.no - y.dataset.no).forEach((c) => box.append(c));
  });
  $('[data-apx-round]', list)?.addEventListener('change', (e) => { location.href = `/member/apply/list?round=${e.target.value}`; });
  const sync = () => {
    const t0 = +list.dataset.t || 0;
    let moved = false;
    Object.entries(memo()).forEach(([id, c]) => {
      const card = $(`.apx-card[data-id="${id}"]`, list);
      if (!card) return;
      if (c.score && c.score.t > t0) { $('.apx-scores', card).innerHTML = c.score.html; card.dataset.sum = c.score.sum; moved = true; }
      if (c.st && c.st.t > t0) { card.dataset.st = c.st.v; $('.apx-tag', card).outerHTML = tagHtml(c.st.v); moved = true; }
    });
    if (!moved) return;
    const cnt = (k) => $$('.apx-card', list).filter((c) => k === 'all' || c.dataset.st === k).length;
    $$('.apx-stat', list).forEach((b) => { $('b', b).textContent = cnt(b.dataset.f); });
    $('[data-apx-sort]', list)?.dispatchEvent(new Event('change'));
    draw();
  };
  sync();
  addEventListener('pageshow', (e) => { if (e.persisted) sync(); });
}

// 신청서 하나: 심사 상태 · 서류 사진
const view = $('[data-apx-view]');
if (view) {
  const id = view.dataset.id;
  $$('.apx-chip', view).forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('on')) return;
    busy(b, null, async () => {
      await admin(`/apply/${id}`, { method: 'PUT', data: { status: b.dataset.st } });
      $$('.apx-chip', view).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      $('[data-apx-tag]', view).innerHTML = tagHtml(b.dataset.st);
      toast(`'${LABEL[b.dataset.st]}'(으)로 바꿨습니다.`);
    });
  }));
  // 내 점수 1~10 (다시 누르면 바뀜, [내 점수 빼기])
  const sbox = $('[data-apx-score]', view);
  sbox?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pt]');
    if (!b) return;
    const n = +b.dataset.pt;
    busy(b, null, async () => {
      const r = await judge(`/apply/${id}/score`, { method: 'PUT', data: { score: n } });
      $$('.apx-pt', sbox).forEach((x) => { const on = +x.dataset.pt === n; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      $('[data-apx-scores]', sbox).innerHTML = r.html;
      remember(id, { score: { html: r.html, sum: r.sum, t: r.at } });
      $('[data-my-note]', sbox).textContent = n ? `${n}점을 줬습니다 · 다시 누르면 바뀝니다` : '1~10점 중 하나를 누르세요';
      let clr = $('.apx-pt-clear', sbox);
      if (n && !clr) { clr = document.createElement('button'); clr.type = 'button'; clr.className = 'linkish apx-pt-clear'; clr.dataset.pt = '0'; clr.textContent = '내 점수 빼기'; $('.apx-pts', sbox).after(clr); }
      if (!n) clr?.remove();
      toast(n ? `${n}점을 줬습니다. (합계 ${r.sum}점)` : '내 점수를 뺐습니다.');
    });
  });
  // 최종 선정 / 선정 취소 (레벨1 누구나 — 레벨2 화면에는 버튼이 없다)
  const fin = $('[data-apx-final]', view);
  fin?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-final]');
    if (!b) return;
    const to = b.dataset.final;
    const run = () => busy(b, null, async () => {
      const r = await admin(`/apply/${id}`, { method: 'PUT', data: { status: to } });
      const on = to === 'SELECTED';
      fin.classList.toggle('on', on);
      const t = new Date(r.at || Date.now()); const hm = `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')} ${t.toTimeString().slice(0, 5)}`;
      $('[data-final-note]', fin).innerHTML = on ? `<b>선정됐습니다</b>${r.by ? ` · ${esc(r.by)}` : ''} · ${hm}` : '점수를 보고 관리자(레벨1) 중 한 분이 정합니다. 여러 명을 선정할 수 있습니다.';
      b.dataset.final = on ? 'SUBMITTED' : 'SELECTED';
      b.textContent = on ? '선정 취소' : '선정하기';
      b.classList.toggle('primary', !on);
      $('[data-apx-tag]', view).innerHTML = tagHtml(to);
      remember(id, { st: { v: to, t: r.t } });
      toast(on ? '선정했습니다.' : '선정을 취소했습니다.');
    });
    if (to === 'SUBMITTED') confirmInline(b, '선정을 취소할까요?', '선정 취소', run); else run();
  });
  // 서류는 이 화면 위에 띄워 본다 — 뒤로 가기는 띄운 창만 닫는다.
  //   (PDF 를 새 창으로 열면 홈 화면에 설치한 앱에서는 앱 밖으로 나가, 뒤로 가기에 앱이 통째로 닫혔다 — 사용자 지적 2026-11-25)
  const sheet = (html, setup) => {
    history.pushState({ apxSheet: 1 }, '');
    let popped = false;
    const onPop = () => { popped = true; dlg.close(); };
    addEventListener('popstate', onPop, { once: true });
    const dlg = openDialog(html, setup);
    dlg.addEventListener('close', () => { removeEventListener('popstate', onPop); if (!popped && history.state?.apxSheet) history.back(); });
    return dlg;
  };
  $$('[data-zoom]', view).forEach((b) => b.addEventListener('click', () => {
    const u = esc(b.dataset.zoom);
    sheet(`<div class="apx-big"><img src="${u}" alt=""></div>
      <div class="apx-big-acts"><a class="btn" href="${u}?dl=1">내려받기</a><button type="button" class="btn primary" data-close>닫기</button></div>`);
  }));
  $$('.apx-pdf', view).forEach((a) => a.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; // 새 탭으로 열기는 그대로
    e.preventDefault();
    const u = a.getAttribute('href'), name = a.dataset.name || 'PDF';
    sheet(`<div class="xv" data-xv="pdf" data-src="${esc(u)}" data-dl="${esc(u)}?dl=1" data-name="${esc(name)}"></div>
      <div class="apx-big-acts"><button type="button" class="btn primary" data-close>닫기</button></div>`, (dlg) => {
      dlg.classList.add('apx-doc-dlg');
      import('./pdfview.js').then((m) => m.mountPdf($('.xv', dlg))).catch(() => { location.href = u; });
    });
  }));
}
