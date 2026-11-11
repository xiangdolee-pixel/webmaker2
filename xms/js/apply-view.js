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
  $$('[data-zoom]', view).forEach((b) => b.addEventListener('click', () => {
    const u = esc(b.dataset.zoom);
    openDialog(`<div class="apx-big"><img src="${u}" alt=""></div>
      <div class="apx-big-acts"><a class="btn" href="${u}?dl=1">내려받기</a><a class="btn" href="${u}" target="_blank" rel="noopener">새 창</a><button type="button" class="btn primary" data-close>닫기</button></div>`);
  }));
}
