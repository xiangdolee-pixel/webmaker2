# xim — 고객 사이트 통합 관리

주소: https://xim.xiangdolee.workers.dev (운영자 비밀번호는 사용자가 정함 — Worker 비밀값 `XIM_ADMIN_PASSWORD`, 리포에 없음)

## 할 수 있는 것 (1단계)

- **구글 OTP** (보안 탭에서 QR 등록): 브라우저마다 하루 1번 OTP, 그 뒤 24시간 동안은 비밀번호만으로 로그인. 운영자 세션도 그 24시간까지만.
- **고객** 등록 · 수정 · 삭제
- **사이트** 만들기(등록) · 수정, 저장 용량(MB) 지정, **정지 / 다시 운영**
- 사이트별 **업체 관리자 계정** 만들기 (= xms 회원 등급 1) → 업체가 `사이트주소/xms/` 에서 로그인해 회원·게시판·메뉴 관리 (xms)
- **xms** 버튼: 운영자로 그 업체 관리 화면에 대신 들어간다 (1분짜리 입장권, 관리 로그에 "운영자" 으로 남음)
- **관리 로그** 탭: 운영자가 xim 에서 한 일(로그인 · 고객 · 사이트 · 정지 · 관리자 계정 · xms 들어가기 · IP 차단 · 수정요청 답변 · GitHub 연결 등)을 1개월 보관, 20개씩 쪽 나눔 (xms 관리 로그와 같은 방식)
- **계약서**: 홈페이지 제작 계약서(A4 한 장) — 갑 이름 · 연락처 · 제작비 · 1년 호스팅(1GB) · 유지보수 관리비를 넣어 만들고, 글자는 만든 뒤 고친다. 계약서마다 서명 주소 `https://sign.plators.com/<5자>` (xim Worker 에 붙인 사용자 도메인). 갑이 그 주소에서 직접 서명 → 완료(그 뒤로 고칠 수 없음, 내용 지문 sha256 남김) → PDF 내려받기. 을 정보 · 사인 그림은 '을 정보 · 사인'(settings.contract_eul). 코드: `_worker/contracts.js`, `js/contracts.js`, `js/contract-doc.js`(문서 · PDF), `sign.html` · `js/sign.js`(서명 화면)
- 업체가 xms 에서 남긴 **수정요청** 확인, 상태(접수 · 진행 중 · 완료) 바꾸기, 답변 달기 → 업체 화면에 보임

아직 없는 것: 용량은 숫자만 저장(업로드 기능이 생기면 그때 집계·제한), 고객 도메인 자동 연결.

## 구조

```
xim Worker (D1 "xim", XMS_DB = D1 "xms")
 ├─ 기본 주소        운영자 화면 index.html + /api/*
 └─ Engine (서비스 바인딩 전용, 공개 주소 없음)
       status(slug)          사이트 운영/정지 상태
       fetch                 /__suspended 중단 화면

고객 사이트 Worker (예: sjccc)
   정지된 사이트        → "서비스 일시 중단" (30초 캐시, /xms/ 관리 화면은 정지 중에도 열림)
   /xms/(관리 화면) · /admin/(→ /xms/) · /xms/* · /xms-api/* · /member/* · /board/*  → xms (../xms/README.md)
   그 밖                → 자기 정적 파일
```

- `_worker/index.js` — xim Worker (운영자 API + Engine)
- `_worker/schema.sql` — D1 스키마 (여러 번 실행해도 안전)
- `_worker/site-worker.js` — 모든 고객 사이트가 함께 쓰는 Worker (build.mjs 가 main 으로 붙인다, 폴더에 복사하지 않음)
- `js/qr.js` — QR 생성기 (OTP 비밀키를 외부 QR 서비스로 보내지 않으려고 직접 그림)
- `index.html`, `js/app.js` — 운영자 화면, `js/common.js` · `css/style.css` 는 둘이 같이 씀

## 사이트를 xim 에 연결하기 — 자동

디자인한 폴더를 `node deploy.mjs <폴더>` 로 올리면 끝이다.

1. build.mjs — 공통 Worker(`_worker/site-worker.js`) + 바인딩(XIM · XMS, `XIM_SITE` = 폴더 이름)을 붙이고, dist html 헤더 메뉴에 xms 표시 · 계정 버튼 자리를 넣는다.
2. deploy.mjs — xim 에 사이트가 없으면 등록(이름 = `<title>`, 용량 500MB), xms 에 헤더 메뉴를 처음 한 번 가져온다.
3. 그다음은 xim 사이트 카드에서 고객 지정 · 도메인 · 업체 관리자 계정을 정하면 된다.

빠지는 폴더: xim · xms, 자기 `_worker/index.js` 가 있는 폴더, `.xim-off` 파일이 있는 폴더.

## 폰을 잃어버려 OTP 를 못 넣을 때

Claude 에게 "xim OTP 초기화해줘" → 아래를 실행하면 비밀번호만으로 로그인되고, 보안 탭에서 다시 등록한다.

```
node deploy.mjs --wrangler d1 execute xim --remote --command "\"DELETE FROM settings WHERE key IN ('totp_secret','totp_pending'); DELETE FROM otp_trust;\""
```

## 운영 명령 (리포 루트에서)

```
node deploy.mjs xim                                                     # 배포
node deploy.mjs --wrangler d1 execute xim --remote --file xim/_worker/schema.sql -y   # 스키마 반영
node deploy.mjs --wrangler secret put XIM_ADMIN_PASSWORD --name xim     # 운영자 비밀번호 바꾸기
```

## 무료 플랜에서 알아둘 것

- 연결된 사이트는 모든 요청에서 Worker 가 돈다(정지 확인 때문). 무료 한도: 계정 전체 하루 10만 요청.
- 비밀번호 해시(PBKDF2)는 무료 CPU 10ms 에 맞춰 반복 횟수를 낮게 잡았다. 유료로 가면 올린다.

## 빠르게: 사진 · 첨부는 R2(서울)에서 (2026-11-13)

국내 통신사는 Cloudflare 사이트 주소를 미국 서부(SEA/LAX)로 보내 사진 · 파일이 느리다(1MB 10초). R2 S3 주소(<계정>.r2.cloudflarestorage.com)는 서울(ICN)이라 0.2초.
- **홈페이지 사진 · 글꼴 · 동영상**: `node deploy.mjs <폴더>` 가 R2 `xms-files/static/<사이트>/<hash 12자>/<경로>` 에 올리고(바뀐 것만, `r2-static.mjs`) xms D1 `site_static` 을 바꾼다. 사이트 Worker 가 html 의 img · srcset · poster · style url() 을 xms 가 서명한 주소로 바꾼다(그날 0시로 서명 고정 → 하루 동안 같은 주소). CSS · JS 는 그대로 사이트에서. 열쇠는 이 PC `%USERPROFILE%\.wrangler-xiangdolee2.json`(없으면 건너뜀 — GitHub Actions 배포 등).
- **사진 · CSS · JS 는 사이트 Worker 를 거치지 않는다**(build.mjs run_worker_first 예외 + `_headers` 캐시) — html 만 Worker.
- **게시판 첨부**: 올리기 = 브라우저 → R2 바로(xms `/xms-api/uploads/sign` · `/done`), 내려받기 · 보기 · 본문 그림 · 목록 썸네일 = 공개 글이면 R2 서명 주소, 아니면 `/xms/upload/<id>`(권한 확인 뒤 R2 로 넘김).
- 열쇠: R2 계정 토큰 `xms-upload`(xms-files 읽기 · 쓰기) → xms 비밀값 `R2_KEY_ID` · `R2_SECRET`. 버킷 CORS: PUT · GET · HEAD 허용.
