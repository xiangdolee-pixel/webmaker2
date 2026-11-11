// 레벨1 신청자 확인 (/member/apply/list · /member/apply/<번호>) — 찾기 · 상태로 거르기 · 상태 바꾸기 · 서류 크게 보기
import { $, $$, esc, makeApi, toast, openDialog, busy } from './common.js';

const admin = makeApi('/xms-api/admin');
const LABEL = { SUBMITTED: '접수', CHECKED: '서류 확인', SELECTED: '선정', REJECTED: '미선정' };

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
  // 정렬: 접수 순(최근 먼저) · 합계 높은 순 — 카드만 다시 놓는다
  $('[data-apx-sort]', list)?.addEventListener('change', (e) => {
    const box = $('.apx-list', list);
    const key = e.target.value === 'sum' ? (c) => +c.dataset.sum * 1e13 + +c.dataset.at : (c) => +c.dataset.at;
    $$('.apx-card', box).sort((x, y) => key(y) - key(x)).forEach((c) => box.append(c));
  });
  $('[data-apx-round]', list)?.addEventListener('change', (e) => { location.href = `/member/apply/list?round=${e.target.value}`; });
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
      $('[data-apx-tag]', view).innerHTML = `<span class="apx-tag st-${b.dataset.st.toLowerCase()}">${LABEL[b.dataset.st]}</span>`;
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
      const r = await admin(`/apply/${id}/score`, { method: 'PUT', data: { score: n } });
      $$('.apx-pt', sbox).forEach((x) => { const on = +x.dataset.pt === n; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      $('[data-apx-scores]', sbox).innerHTML = r.html;
      $('[data-my-note]', sbox).textContent = n ? `${n}점을 줬습니다 · 다시 누르면 바뀝니다` : '1~10점 중 하나를 누르세요';
      let clr = $('.apx-pt-clear', sbox);
      if (n && !clr) { clr = document.createElement('button'); clr.type = 'button'; clr.className = 'linkish apx-pt-clear'; clr.dataset.pt = '0'; clr.textContent = '내 점수 빼기'; $('.apx-pts', sbox).after(clr); }
      if (!n) clr?.remove();
      toast(n ? `${n}점을 줬습니다. (합계 ${r.sum}점)` : '내 점수를 뺐습니다.');
    });
  });
  $$('[data-zoom]', view).forEach((b) => b.addEventListener('click', () => {
    const u = esc(b.dataset.zoom);
    openDialog(`<div class="apx-big"><img src="${u}" alt=""></div>
      <div class="apx-big-acts"><a class="btn" href="${u}?dl=1">내려받기</a><a class="btn" href="${u}" target="_blank" rel="noopener">새 창</a><button type="button" class="btn primary" data-close>닫기</button></div>`);
  }));
}
