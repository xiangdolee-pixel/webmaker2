// xms 방문자 화면: 메뉴 열기 · 로그인 · 가입 · 마이페이지 · 글쓰기 · 댓글
import { $, $$, makeApi, formData, busy, toast, openDialog, confirmInline } from './common.js';
import { shrinkImage } from './editor.js';
import { cropCircle } from './crop.js';

const api = makeApi('/xms-api');

// 모바일 메뉴
const navBtn = $('[data-nav-toggle]');
navBtn?.addEventListener('click', () => {
  const open = !$('[data-nav]').classList.contains('open');
  $('[data-nav]').classList.toggle('open', open);
  navBtn.setAttribute('aria-expanded', String(open));
});

$('[data-logout]')?.addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  location.href = '/';
});

$$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

// 체크박스 묶음(다중선택) 값을 배열로, 단일 체크(동의 등)는 true/false
function values(form) {
  const data = formData(form);
  $$('fieldset[data-type=CHECKBOX]', form).forEach((fs) => {
    data[fs.dataset.group] = $$('input:checked', fs).map((i) => i.value);
  });
  return data;
}

function onForm(name, fn) {
  const form = $(`form[data-form="${name}"]`);
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const run = () => busy(btn, form.querySelector('.err'), () => fn(form, values(form)));
    if (btn?.dataset.confirm) confirmInline(btn, btn.dataset.confirm, btn.textContent.trim(), run);
    else run();
  });
}

// 필수 다중선택 확인
function checkGroups(form) {
  for (const fs of $$('fieldset[data-required]', form)) {
    if (!$$('input:checked', fs).length) throw new Error(`${fs.querySelector('legend').textContent.replace('*', '').trim()}을(를) 골라 주세요.`);
  }
}

onForm('login', async (form, data) => {
  const w = waiting(form, '로그인 중입니다…');
  try { await api('/login', { method: 'POST', data }); } catch (e) { w.done(); throw e; }
  const next = form.dataset.next || '/';
  location.href = next;
});

// 가입 1단계: 이메일 → 6자리 번호 (봇 확인 포함) / 2단계: 정보 입력
const signup = { email: '', ticket: '', timer: 0 };
const stepTo = (n) => {
  $$('form[data-step]').forEach((f) => { f.hidden = f.dataset.step !== String(n) || (n === 1 && f.dataset.form === 'signup-verify' && !signup.email); });
  $$('[data-step-dot]').forEach((d) => { d.classList.toggle('on', +d.dataset.stepDot <= n); d.classList.toggle('done', +d.dataset.stepDot < n); });
};
function startTimer(sec) {
  clearInterval(signup.timer);
  const el = $('[data-timer]');
  const end = Date.now() + sec * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    el.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '시간 지남';
    el.classList.toggle('over', !left);
    if (!left) clearInterval(signup.timer);
  };
  tick();
  signup.timer = setInterval(tick, 1000);
}
async function sendCode(form) {
  const email = form.email.value.trim();
  const turnstile = form.querySelector('[name="cf-turnstile-response"]')?.value || '';
  try {
    const r = await api('/signup/code', { method: 'POST', data: { email, turnstile } });
    signup.email = r.email;
    stepTo(1);
    const vf = $('form[data-form=signup-verify]');
    vf.code.value = '';
    vf.code.focus();
    startTimer(r.expires_in);
    toast(`${r.email} 로 인증번호를 보냈습니다.`);
  } finally {
    if (window.turnstile) try { window.turnstile.reset(); } catch { /* 위젯 없음 */ }
  }
}
onForm('signup-code', (form) => sendCode(form));
$('[data-resend]')?.addEventListener('click', () => {
  const f = $('form[data-form=signup-code]');
  busy(f.querySelector('[type=submit]'), f.querySelector('.err'), () => sendCode(f));
});
$('form[data-form=signup-code] [name=email]')?.addEventListener('input', () => {
  // 이메일을 고치면 번호 칸은 다시 숨긴다
  if (signup.email) { signup.email = ''; clearInterval(signup.timer); stepTo(1); }
});
onForm('signup-verify', async (form, data) => {
  const r = await api('/signup/verify', { method: 'POST', data: { email: signup.email, code: data.code } });
  signup.ticket = r.ticket;
  clearInterval(signup.timer);
  $('[data-email]').textContent = r.email;
  stepTo(2);
  $('form[data-form=signup] [name=password]').focus();
});
$('form[data-form=signup-verify] [name=code]')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  if (e.target.value.length === 6) e.target.form.requestSubmit();
});
// 시간이 걸리는 일(가입 · 로그인): 화면을 덮고 "…중입니다" — 다음 화면이 뜰 때까지 버튼을 다시 못 누르게
function waiting(form, text, sub = '잠시만 기다려 주세요') {
  const host = form.closest('.xms-c') || document.body;
  let el = host.querySelector(':scope > .wait-cover');
  if (!el) {
    el = document.createElement('div');
    el.className = 'wait-cover';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="wait-box"><span class="wait-spin" aria-hidden="true"></span><b></b><small>잠시만 기다려 주세요</small></div>';
    host.append(el);
  }
  el.querySelector('b').textContent = text;
  el.querySelector('small').textContent = sub;
  el.hidden = false;
  form.querySelectorAll('button, input, select').forEach((x) => { x.dataset.waitOff = x.disabled ? '1' : ''; x.disabled = true; });
  return {
    say: (t) => { el.querySelector('b').textContent = t; },
    done: () => { el.hidden = true; form.querySelectorAll('button, input, select').forEach((x) => { x.disabled = x.dataset.waitOff === '1'; }); },
  };
}
onForm('signup', async (form, data) => {
  if (data.password !== data.password2) throw new Error('비밀번호 확인이 서로 다릅니다.');
  checkGroups(form);
  delete data.password2;
  const w = waiting(form, '가입 중입니다…');
  try {
    await api('/signup', { method: 'POST', data: { ...data, email: signup.email, ticket: signup.ticket } });
  } catch (e) { w.done(); throw e; }
  // 가입하면 바로 로그인돼 있다 → 고른 프로필 사진을 이어서 올린다 (실패해도 가입은 끝났으니 넘어간다)
  if (avatar.pending) { w.say('프로필 사진을 적용하고 있어요…'); try { await uploadAvatar(avatar.pending); } catch (e) { /* 마이페이지에서 다시 */ } }
  w.say('가입 완료! 이동하는 중…');
  location.href = '/member/welcome'; // 덮개는 그대로 — 다음 화면이 뜰 때까지
});

onForm('profile', async (form, data) => {
  checkGroups(form);
  await api('/profile', { method: 'PUT', data });
  toast('저장했습니다.');
});
onForm('password', async (form, data) => {
  if (data.next !== data.next2) throw new Error('새 비밀번호 확인이 서로 다릅니다.');
  await api('/password', { method: 'POST', data: { current: data.current, next: data.next } });
  form.reset();
  toast('비밀번호를 바꿨습니다.');
});
onForm('withdraw', async (form, data) => {
  await api('/withdraw', { method: 'POST', data });
  location.href = '/';
});
if (new URLSearchParams(location.search).get('welcome')) toast('가입을 환영합니다!');

// 가입: 비밀번호 같음 확인 · 보기 · 모두 동의 · 약관 전문
const pw = $('form[data-form=signup] [name=password]');
const pw2 = $('form[data-form=signup] [name=password2]');
const pwMsg = $('[data-pw-match]');
const checkPw = () => { if (pwMsg) pwMsg.textContent = pw2.value ? (pw.value === pw2.value ? '같습니다 ✓' : '서로 다릅니다') : ''; };
pw?.addEventListener('input', checkPw);
pw2?.addEventListener('input', checkPw);
// 비밀번호 칸 옆 눈 모양: 누르면 보였다 안 보였다
$$('[data-pw-eye]').forEach((b) => b.addEventListener('click', () => {
  const i = b.parentElement.querySelector('input');
  const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show));
  b.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
  b.classList.toggle('on', show);
}));
const all = $('[data-agree-all]');
all?.addEventListener('change', () => $$('input[name^=agree_]').forEach((i) => { i.checked = all.checked; }));
$$('input[name^=agree_]').forEach((i) => i.addEventListener('change', () => { all.checked = $$('input[name^=agree_]').every((x) => x.checked); }));
$$('[data-doc]').forEach((b) => b.addEventListener('click', () => {
  const tpl = $(`#doc-${b.dataset.doc}`);
  openDialog(`<h2>${b.dataset.doc === 'terms' ? '이용약관' : '개인정보 처리방침'}</h2><div class="prose">${tpl.innerHTML}</div>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
}));

// 글쓰기: 에디터(↔ 간단입력) · 첨부(이미지 · 파일)
// 편집기 스크립트는 글쓰기 화면에서만 받는다 (목록 · 글 보기는 가볍게)
const edHost = $('[data-editor]');
const { mountEditor, mountAttach } = edHost || $('[data-attach]') ? await import('./editor.js') : {};
const ed = edHost ? mountEditor(edHost, { modeBox: $('[data-mode]') }) : null;
const attachBox = $('[data-attach]');
let attach = null;
if (attachBox) {
  let files = [];
  try { files = JSON.parse($('[data-init]', attachBox).textContent) || []; } catch { files = []; }
  attach = mountAttach(attachBox, { ed, target: $('form[data-form=post]').dataset.board, files });
}
onForm('post', async (form, data) => {
  ed?.sync();
  data.content = form.querySelector('[name=content]').value;
  data.attachments = attach ? attach.ids() : [];
  data.mode = ed ? ed.mode() : 'editor';
  data.blocks = ed ? ed.blocks() : null;
  const { board, id, after } = form.dataset;   // after = 게시판 '목록 주소'(사이트 안 목록 화면) — 있으면 저장 뒤 그리로
  if (id) {
    await api(`/posts/${id}`, { method: 'PUT', data });
    location.href = after || `/board/${board}/${id}`;
  } else {
    const r = await api(`/boards/${board}/posts`, { method: 'POST', data });
    location.href = after || `/board/${board}/${r.id}`;
  }
});

// 글쓰기 · 댓글: Ctrl+Enter(맥은 ⌘+Enter)로 바로 등록 — 등록 단추를 누른 것과 같다
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
  const form = e.target.closest?.('form[data-form=post], form[data-form=comment]')
    || (e.target.closest?.('[data-editor], [data-attach]') ? $('form[data-form=post]') : null);
  if (!form) return;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  if (btn && !btn.disabled) form.requestSubmit(btn);
}, true); // 편집기가 Enter 를 먼저 가로채도 받도록 capture

// 글 · 댓글 지우기
$$('[data-del-post]').forEach((b) => b.addEventListener('click', () => confirmInline(b, '이 글을 지울까요? 지운 글은 목록에서 사라집니다.', '지우기', async () => {
  await api(`/posts/${b.dataset.delPost}`, { method: 'DELETE' });
  location.href = b.dataset.back;
})));
$$('[data-del-comment]').forEach((b) => b.addEventListener('click', () => confirmInline(b, '이 댓글을 지울까요?', '지우기', async () => {
  await api(`/comments/${b.dataset.delComment}`, { method: 'DELETE' });
  location.reload();
})));
onForm('comment', async (form, data) => {
  await api(`/posts/${form.dataset.post}/comments`, { method: 'POST', data });
  location.reload();
});

// 글 관리 (관리자): [글 관리] → 고르는 칸 · 위 막대 [전체 선택 · 숨김 · 보이기 · 삭제 · 끝내기]
const mbar = $('[data-manage-bar]');
if (mbar) {
  const box = mbar.closest('.pub-box');
  const picks = () => $$('.pick input', box);
  const chosen = () => picks().filter((i) => i.checked).map((i) => +i.value);
  const sync = () => {
    const n = chosen().length;
    $('[data-pick-count]', mbar).textContent = n ? `${n}개 골랐습니다` : '';
    $('[data-pick-all]', mbar).checked = n > 0 && n === picks().length;
    $$('[data-act]', mbar).forEach((b) => { b.disabled = !n; });
    $$('[data-pid]', box).forEach((el) => el.classList.toggle('picked', !!el.querySelector('.pick input:checked')));
  };
  const setMode = (on) => {
    box.classList.toggle('managing', on);
    mbar.hidden = !on;
    $('[data-manage]', box).hidden = on;
    if (!on) picks().forEach((i) => { i.checked = false; });
    sync();
  };
  $('[data-manage]', box).addEventListener('click', () => setMode(true));
  $('[data-manage-end]', mbar).addEventListener('click', () => setMode(false));
  $('[data-pick-all]', mbar).addEventListener('change', (e) => { picks().forEach((i) => { i.checked = e.target.checked; }); sync(); });
  // 고르는 중에는 글을 눌러도 열리지 않고 골라진다
  box.addEventListener('click', (e) => {
    if (!box.classList.contains('managing')) return;
    const item = e.target.closest('[data-pid]');
    if (!item || e.target.closest('.pick')) { sync(); return; }
    e.preventDefault();
    const i = item.querySelector('.pick input');
    if (i) { i.checked = !i.checked; sync(); }
  });
  box.addEventListener('change', (e) => { if (e.target.closest('.pick')) sync(); });
  $$('[data-act]', mbar).forEach((btn) => btn.addEventListener('click', () => {
    const ids = chosen();
    if (!ids.length) return;
    const act = btn.dataset.act;
    const run = () => busy(btn, null, async () => {
      const r = await api(`/boards/${mbar.dataset.board}/manage`, { method: 'POST', data: { ids, action: act } });
      toast(`${r.changed}개 글을 ${{ hide: '숨겼습니다', show: '보이게 했습니다', delete: '지웠습니다' }[act]}.`);
      setTimeout(() => location.reload(), 400);
    });
    if (act === 'delete') confirmInline(btn, `고른 글 <b>${ids.length}개</b>를 지웁니다. 지운 글은 이 화면에서 되살릴 수 없습니다.`, '삭제', run);
    else run();
  }));
  sync();
}

// 닉네임 · 이메일 중복: 입력하는 동안 칸 아래에 바로 알려 준다 (가입 · 내 정보)
$$('form[data-form=signup] [name=nickname], form[data-form=profile] [name=nickname], form[data-form=profile] [name=email]').forEach((input) => {
  const note = document.createElement('small');
  note.className = 'dup-note';
  note.setAttribute('aria-live', 'polite');
  input.after(note);
  const first = input.value.trim();
  let timer = 0;
  let seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    note.textContent = '';
    note.className = 'dup-note';
    input.setCustomValidity('');
    if (!v || v === first) return;
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await api(`/check?${input.name}=${encodeURIComponent(v)}`);
        if (my !== seq) return;
        note.textContent = r.message;
        note.className = `dup-note ${r.ok ? 'ok' : 'bad'}`;
        input.setCustomValidity(r.ok ? '' : r.message);
      } catch { /* 확인 못 하면 저장할 때 서버가 다시 본다 */ }
    }, 350);
  });
});

// ───── 프로필 사진 ─────
//   고르면 먼저 동그라미에 맞춰 자르고(crop.js) 512px WEBP 로 올린다. 가입 화면은 골라 두었다가 가입 뒤에, 마이페이지는 자르자마자 올린다.
//   움직이는 GIF 는 자르지 않고 그대로(자르면 움직임이 사라진다)
const avatar = { pending: null, url: '' };
async function uploadAvatar(file) {
  const res = await fetch('/xms-api/uploads?for=avatar&kind=IMAGE', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'image/webp', 'X-File-Name': encodeURIComponent(file.name || 'avatar.webp') },
    body: file,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || '사진을 올리지 못했습니다.');
  return d.avatar;
}
const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';
// 화면 안 모든 동그라미(머리글 계정 버튼 포함)를 같은 사진으로
function showAvatar(src) {
  $$('[data-avatar-view], .xa-avatar').forEach((el) => {
    el.innerHTML = src ? '<img src="' + src + '" alt="">' : PERSON;
    el.classList.toggle('has-img', !!src);
  });
  $$('[data-avatar-clear]').forEach((b) => { b.hidden = !src; });
  $$('.mb-pick-acts [data-avatar-btn]').forEach((b) => { b.textContent = src ? (b.closest('.mb-who') ? '사진 바꾸기' : '바꾸기') : (b.closest('.mb-who') ? '사진 넣기' : '사진 고르기'); });
}
const pick = $('[data-avatar-pick]');
if (pick) {
  const live = pick.hasAttribute('data-avatar-live');
  const input = $('[data-avatar-file]', pick);
  $$('[data-avatar-btn]').forEach((b) => b.addEventListener('click', () => input.click()));
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('사진 파일을 골라 주세요.'); return; }
    let w = null;
    try {
      const small = f.type === 'image/gif' ? await shrinkImage(f, { max: 512, maxBytes: 160000 }) : await cropCircle(f);
      if (!small) return; // 자르기 취소
      if (!live) { // 가입 화면: 미리 보기만
        avatar.pending = small;
        if (avatar.url) URL.revokeObjectURL(avatar.url);
        avatar.url = URL.createObjectURL(small);
        showAvatar(avatar.url);
        return;
      }
      // 올리고 새 사진을 받아 오기까지 몇 초 걸린다 → 화면을 덮고 안내 (사용자 지시 2026-11-04: "기다릴 수 있는 안내문")
      w = waiting(pick, '프로필 사진을 적용하고 있어요…', '사진을 올리는 중이에요. 몇 초면 끝나요.');
      const url = await uploadAvatar(small);
      // 새 사진을 다 받아 둔 뒤에 바꾼다 (덮개가 걷혔는데 빈 동그라미가 보이지 않게)
      await new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = url; setTimeout(r, 8000); });
      showAvatar(url);
      toast('프로필 사진을 바꿨습니다.');
    } catch (e) {
      toast(e.message || '사진을 올리지 못했습니다.');
    } finally {
      w?.done();
    }
  });
  $$('[data-avatar-clear]').forEach((b) => b.addEventListener('click', async () => {
    if (!live) { avatar.pending = null; showAvatar(''); return; }
    try { await api('/avatar', { method: 'DELETE' }); showAvatar(''); toast('프로필 사진을 뺐습니다.'); } catch (e) { toast(e.message); }
  }));
}

// 뒤로 가기로 돌아왔을 때 덮개가 남아 있지 않게
addEventListener('pageshow', (e) => { if (e.persisted) document.querySelectorAll('.wait-cover').forEach((el) => { el.hidden = true; }); });

// 신청서 화면 (/member/apply)
if ($('[data-apply]')) import('./apply.js');
if ($('[data-apx-list], [data-apx-view]')) import('./apply-view.js'); // 레벨1 신청자 확인
