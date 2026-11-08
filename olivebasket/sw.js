const CACHE = 'olivebasket-v38';
const SHELL = [
  '/app',
  '/basket',
  'style.css?v=30',
  'app.js?v=33',
  'admin.js?v=25',
  'manifest.webmanifest',
  'assets/img/logo.webp',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API · 사이트 회원(로그인 · 가입 · 내 정보) · 관리 화면은 늘 네트워크 (옛 로그인 상태가 캐시로 보이지 않게)
  if (e.request.method !== 'GET' || /^\/(api|xms-api|xms|member|board|login)(\/|$)/.test(url.pathname)) return;

  // 첫 화면 · 담기 화면: 저장본을 바로 보여 주고 뒤에서 새로 받아 둔다 — 누르자마자 뜨게 (새 버전은 다음에 열 때)
  if (e.request.mode === 'navigate' && (url.pathname === '/app' || url.pathname === '/basket')) {
    const key = url.pathname;
    const net = fetch(e.request).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(key).then(hit => hit || net));
    return;
  }
  // 그 밖의 페이지 이동: 네트워크 우선, 실패(오프라인) 시 캐시
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('/app'))
      )
    );
    return;
  }

  // 이미지(바구니·아이콘)는 늘 같으니 캐시 우선 — 바꿀 땐 CACHE 버전을 올리면 새로 받음
  if (url.origin === location.origin && /\.(png|jpe?g|webp|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })));
    return;
  }

  // 같은 사이트 정적 파일(css·js): 저장본을 바로 쓰고 뒤에서 새로 받아 둔다 — 앱이 기다리지 않고 뜨게.
  //   주소에 ?v=버전 이 붙어 있어 정확히 같은 주소만 저장본을 쓴다 → 새 화면(html)에 옛 css/js 가 섞이지 않음
  if (url.origin === location.origin) {
    const net = fetch(e.request).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(e.request).then(hit => hit || net.catch(() => caches.match(e.request, { ignoreSearch: true }))));
    return;
  }

  // 외부(글꼴 등): 캐시 우선
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
