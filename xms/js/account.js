// xim 관할 모든 서비스(고객 홈페이지) 공통 계정 버튼.
//   사이트 Worker 가 처음부터 버튼을 그려서(로그인 링크 / 사람 동그라미) 보내고 스타일도 머리에 바로 넣는다 → 화면이 흔들리지 않는다.
//   이 스크립트는 그 버튼에 메뉴(관리 · 유지보수 요청(레벨1만) / 내 정보 / 로그아웃)를 붙이기만 한다. 서버가 못 그린 경우에만 직접 묻고 그린다.
//   놓을 자리: 사이트 헤더 안에 <span data-xms-account></span>  (없으면 화면 오른쪽 위에 떠 있는 버튼)
//   서비스와 xms 는 같은 로그인(SSO). 색: 자리 요소에 --xa-bg(동그라미) · --xa-fg(사람) CSS 변수.
(() => {
  if (window.__xmsAccount) return;
  const VER = ((document.currentScript && document.currentScript.src) || '').match(/\?v=[\w-]+/)?.[0] || '';
  window.__xmsAccount = true;

  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';

  function host() {
    let el = document.querySelector('[data-xms-account]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'xa-float';
      document.body.append(el);
    }
    el.classList.add('xa-host');
    return el;
  }

  async function start() {
    if (!document.getElementById('xa-style')) {
      const l = document.createElement('link');
      l.id = 'xa-style'; l.rel = 'stylesheet'; l.href = '/xms/css/account.css';
      document.head.append(l);
    }
    const el = host();
    let me = null;
    try { me = JSON.parse(el.dataset.xaMe || 'null'); } catch { me = null; }
    // 서비스워커가 저장해 둔 화면(빨리 뜨게 — 올리브바스켓 등)은 저장할 때의 로그인 상태가 박혀 있다 → 지금 상태를 다시 묻는다
    //   (2026-11-04 로그인했는데 '로그인' 버튼이 보임). 인터넷이 없으면 저장된 그대로
    if (me && navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        const r = await fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) me = await r.json();
      } catch { /* 그대로 */ }
    }
    if (!me) {
      me = { guest: true };
      try {
        const r = await fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) me = await r.json();
      } catch { /* 엔진이 없으면 로그인 링크만 */ }
    }
    if (me.guest) {
      if (!el.querySelector('.xa-login')) {
        el.innerHTML = '<a class="xa-login" href="/member/login">로그인</a>'; // 로그인하면 홈으로
      }
      return;
    }
    // 로그인 유지: 하루 한 번 쿠키 기한을 늘린다 (유지를 끈 로그인은 서버가 그냥 둔다)
    try {
      const day = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('xa-keep') !== day) {
        localStorage.setItem('xa-keep', day);
        fetch('/xms-api/keep', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      }
    } catch { /* 저장소를 못 쓰면 건너뜀 */ }
    const admin = !!me.admin;
    if (!el.querySelector('.xa-avatar')) el.innerHTML = `<button type="button" class="xa-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="내 계정 메뉴">${PERSON}</button>`;
    // 프로필 사진이 있으면 사람 모양 대신 사진 (주소는 /xms/upload/<임의 id> 만 받는다)
    if (me.avatar && /^\/xms\/upload\/[0-9a-f]{32}$/.test(me.avatar)) {
      const b = el.querySelector('.xa-avatar');
      b.innerHTML = '<img src="' + me.avatar + '" alt="">';
      b.classList.add('has-img');
    }
    // 문의 메뉴 이름 = 사이트 머리의 문의 버튼 글자(예: '생산 문의'), 없으면 '문의'
    const cta = [...document.querySelectorAll('header a')].map((a) => a.textContent.trim()).find((t) => /문의/.test(t) && t.length <= 10);
    const inqLabel = cta || '문의';
    if (admin && me.inq) el.classList.add('xa-has-new');
    const menu = document.createElement('div');
    menu.className = 'xa-menu';
    menu.setAttribute('role', 'menu');
    // 운영자 = xim "관리 화면 열기" 로 대신 들어온 로그인 (8시간). 업체 계정으로 오해하지 않게 분명히 적는다.
    // 메뉴 앞 단색 아이콘 (글자색을 따른다)
    const ic = (d) => `<svg class="xa-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const IC = {
      admin: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
      edit: ic('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
      inq: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
      req: ic('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
      me: ic('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.7 3.9-6 7.5-6s6.7 2.3 7.5 6"/>'),
      out: ic('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
    };
    menu.innerHTML = `${me.name ? `<div class="xa-me"><b>${String(me.name).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';')}</b> 님</div>` : ''}${admin ? `<a role="menuitem" href="/xms/">${IC.admin}관리</a>${document.querySelector('[data-xe]') ? `<button type="button" role="menuitem" data-xa-edit>${IC.edit}수정 모드</button>` : ''}<a role="menuitem" href="/xms/#/inquiries">${IC.inq}${inqLabel}${me.inq ? `<i class="xa-num">${me.inq > 99 ? '99+' : me.inq}</i>` : ''}</a><a role="menuitem" href="/xms/#/requests">${IC.req}유지보수 요청</a>` : ''}
      ${me.staff ? '' : `<a role="menuitem" href="/member/mypage">${IC.me}내 정보</a>`}
      <button type="button" role="menuitem" data-xa-logout>${IC.out}로그아웃</button>`;
    document.body.append(menu);
    const btn = el.querySelector('.xa-avatar');

    const place = () => {
      const r = btn.getBoundingClientRect();
      // 버튼이 화면 아래쪽(하단 메뉴 등)에 있어 메뉴가 넘치면 버튼 위로 연다
      const h = menu.offsetHeight || 220;
      menu.style.top = `${Math.round(r.bottom + 10 + h > innerHeight - 8 ? Math.max(8, r.top - 10 - h) : r.bottom + 10)}px`;
      menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    };
    const open = (v, keyboard = false) => {
      if (v) place();
      menu.classList.toggle('xa-open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v && keyboard) menu.querySelector('a,button')?.focus({ preventScroll: true });
    };
    // 키보드(Enter · Space)로 열었을 때만 첫 항목으로 초점을 옮긴다 (e.detail === 0)
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(!menu.classList.contains('xa-open'), e.detail === 0); });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('xa-open')) { open(false); btn.focus(); } });
    addEventListener('resize', () => menu.classList.contains('xa-open') && place());
    addEventListener('scroll', () => menu.classList.contains('xa-open') && place(), { passive: true });
    // 수정 모드: 홈페이지 글자를 그 자리에서 고친다 (관리자만, 글자가 있는 페이지에서만)
    menu.querySelector('[data-xa-edit]')?.addEventListener('click', async () => {
      open(false);
      try { (await import(`/xms/js/edit.js${VER}`)).startEdit(); } catch (e) { console.error('수정 모드를 열지 못했습니다.', e); }
    });
    if (admin && /[?&]xe=1(&|$)/.test(location.search) && document.querySelector('[data-xe]')) import(`/xms/js/edit.js${VER}`).then((m) => m.startEdit()).catch(() => {});
    menu.querySelector('[data-xa-logout]').addEventListener('click', async () => {
      try { await fetch('/xms-api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* 이미 끊김 */ }
      location.reload();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
