/* 감사노트365 서비스워커 — 알림만 (캐시는 하지 않는다: 늘 최신 화면 · 기록)
   서버는 내용 없이 알림을 보내고, 여기서 /api/nudge 로 그 회원에게 맞는 다정한 문구를 받아 띄운다 */
const FALLBACK = { title: '감사노트365', body: '오늘 하루, 작은 빛 하나 찾아볼까요?' };
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let m = FALLBACK;
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/nudge', { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' });
      if (r.ok) m = await r.json();
    } catch (_) { /* 기본 문구 */ }
    await self.registration.showNotification(m.title || FALLBACK.title, {
      body: m.body || FALLBACK.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'g365-daily',
      renotify: false,
      data: { url: '/note' },
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = (e.notification.data && e.notification.data.url) || '/note';
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).pathname.startsWith('/note') && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
