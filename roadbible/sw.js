/* 길성경 오프라인 캐시 (서비스워커)
   - 같은 출처(앱·성경 본문 4.7MB): 설치 때 통째로 캐시 → 인터넷 없이도 열림
   - 문서(HTML): 네트워크 우선이되 2.5초 안에 안 오면 캐시로 즉시 표시
     → 완전 오프라인은 물론, '끊길 듯 말 듯'한 회선에서도 빈 화면으로 기다리지 않음
   - CDN(폰트): 버전이 박힌 불변 파일이라 캐시 우선.
     별도 캐시(roadbible-cdn)에 담아 앱 버전이 올라가도 지워지지 않음 — 배포 직후 오프라인 사고 방지
   - 필수 CDN(기본 폰트 CSS)은 설치 때 미리 받아 둠(실패해도 설치는 계속)
   - /qt(오늘의 묵상)·회원 로그인·동기화(/api/sync) 등 실시간 요청엔 개입하지 않음 */
const APP_CACHE="roadbible-v146";
const CDN_CACHE="roadbible-cdn";   // 배포마다 지우지 않는다 (폰트·SDK 보존)
const ASSETS=["/app","bible-data.js","icon.png","icon-32.png","icon-180.png","icon-192.png","manifest.json","privacy.html"];
const CDN_HOSTS=["cdn.jsdelivr.net"];
const CDN_PRECACHE=[
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
];
/* 회원 로그인 · 동기화 · 관리 화면은 서비스워커가 손대지 않는다 (늘 서버에서 — 옛 로그인 상태가 캐시로 보이지 않게) */
const LIVE=/^\/(api|xms-api|xms|member|board|admin)(\/|$)|^\/(rss\.xml|sitemap\.xml|robots\.txt)$/;
const cacheable=r=>r&&(r.ok||r.type==="opaque");

self.addEventListener("install",e=>{
  e.waitUntil((async()=>{
    const app=await caches.open(APP_CACHE);
    await app.addAll(ASSETS);                       // 앱 본체는 전부 성공해야 설치
    const cdn=await caches.open(CDN_CACHE);
    await Promise.all(CDN_PRECACHE.map(async u=>{   // CDN은 있으면 재사용, 실패해도 무시
      if(await cdn.match(u))return;
      try{const r=await fetch(u,{mode:"no-cors"});if(cacheable(r))await cdn.put(u,r);}catch(_){}
    }));
    self.skipWaiting();
  })());
});
self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==APP_CACHE&&k!==CDN_CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin){
    if(LIVE.test(url.pathname))return;
    if(url.pathname==="/qt"){
      /* 오늘의 묵상: 매일 갱신되는 실시간 콘텐츠 — 캐시 안 함. 오프라인 사본은 앱의 localStorage 담당.
         실패 시엔 조용한 JSON을 돌려줘 앱이 저장본 폴백으로 자연스럽게 넘어가게 한다. */
      e.respondWith(fetch(e.request).catch(()=>new Response('{"error":"offline"}',
        {headers:{"Content-Type":"application/json; charset=utf-8"}})));
      return;
    }
    if(e.request.mode==="navigate"){
      /* 문서(HTML): 네트워크 우선(배포 즉시 반영) + 2.5초 타임아웃 → 캐시. 캐시도 없으면 네트워크를 끝까지 대기 */
      e.respondWith((async()=>{
        const net=fetch(e.request).then(res=>{
          if(cacheable(res)){const copy=res.clone();caches.open(APP_CACHE).then(c=>c.put(e.request,copy));}
          return res;
        });
        const first=await Promise.race([net.catch(()=>null),new Promise(r=>setTimeout(()=>r("slow"),2500))]);
        if(first&&first!=="slow")return first;
        /* 첫 화면(/)은 소개 페이지 — 오프라인이면 성경 앱(/app)을 대신 연다 */
        const hit=(url.pathname==="/"&&await caches.match("/app"))||(await caches.match(e.request,{ignoreSearch:true}))||(await caches.match("/app"));
        return hit||net;
      })());
      return;
    }
    /* 그 외(본문 데이터 등): 캐시 우선(즉시 표시) + 뒤에서 새 버전 받아 캐시 갱신 */
    e.respondWith(caches.match(e.request).then(hit=>{
      const net=fetch(e.request).then(res=>{
        if(cacheable(res)){const copy=res.clone();caches.open(APP_CACHE).then(c=>c.put(e.request,copy));}
        return res;
      });
      return hit||net;
    }));
  }else if(CDN_HOSTS.includes(url.hostname)){
    /* CDN: 캐시 우선 — 오프라인 즉시 응답 + 버전 고정 파일 재다운로드 안 함 */
    e.respondWith(caches.match(e.request).then(hit=>{
      const net=fetch(e.request).then(res=>{
        if(cacheable(res)){const copy=res.clone();caches.open(CDN_CACHE).then(c=>c.put(e.request,copy));}
        return res;
      });
      return hit||net;
    }));
  }
});
