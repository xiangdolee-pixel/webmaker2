/* 머스트 서비스워커 — 알림만 (캐시는 하지 않는다: 늘 최신 화면 · 기록)
   서버는 내용 없이 알림을 보내고, 여기서 내 구독 주소로 /api/nudge 를 불러 알릴 항목을 받아 띄운다.
   알림의 '했어요' 를 누르면 앱을 열지 않고 바로 오늘 한 것으로 적는다. */
const ICON = '/icons/icon-192.png?v=1';
const BADGE = '/icons/badge-96.png?v=1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function post(path, data) {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 5000);
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: ctl.signal, cache: 'no-store' });
  return r.ok ? r.json() : null;
}
async function endpoint() {
  const sub = await self.registration.pushManager.getSubscription();
  return sub ? sub.endpoint : '';
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let d = null;
    try { d = await post('/api/nudge', { endpoint: await endpoint() }); } catch (_) { /* 기본 문구 */ }
    const items = (d && d.items) || [];
    if (!items.length) {
      // 시험 알림이거나 내용을 못 받았을 때 (크롬은 알림을 꼭 하나 띄워야 한다)
      const left = d ? d.left : -1;
      await self.registration.showNotification('머스트', {
        body: left > 0 ? `오늘 아직 안 한 일이 ${left}개 있어요.` : left === 0 ? '알림이 잘 도착했어요. 오늘 할 일은 모두 했어요.' : '오늘 반드시 할 일을 확인해 보세요.',
        icon: ICON, badge: BADGE, tag: 'must-info', data: { url: '/' },
      });
      return;
    }
    for (const it of items) {
      await self.registration.showNotification(it.text, {
        body: `${it.alarm} · 오늘 반드시 할 일`,
        icon: ICON, badge: BADGE,
        tag: `must-${it.id}`, renotify: true, requireInteraction: true,
        actions: [{ action: 'done', title: '했어요' }],
        data: { url: '/', id: it.id },
      });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  const data = e.notification.data || {};
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (e.action === 'done' && data.id) {
      try { await post('/api/nudge/done', { endpoint: await endpoint(), id: data.id }); } catch (_) { /* 앱에서 다시 */ }
      for (const c of list) c.postMessage({ type: 'must-done', id: data.id });   // 열려 있는 화면도 맞춘다
      return;
    }
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(data.url || '/');
  })());
});
