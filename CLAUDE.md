# WebMaker2 (webmaker2 리포) — 작업 규칙

**E:\ws\WebMaker\design 과 똑같은 규칙으로 작업한다.** (사용자 지시, 2026-11-03 "매우 중요")
다른 점은 딱 하나: **GitHub 푸시는 Claude 가 한다** (아래 Git).
design 쪽 규칙(`E:\ws\WebMaker\CLAUDE.md`, `E:\ws\WebMaker\design\CLAUDE.md`)이 바뀌면 이 파일도 맞춰 고친다.

폴더(slug)마다 웹사이트 하나씩 있는 리포다. **사용자는 Claude Code 프롬프트로만 소통한다.** 코드 작업 · git 커밋 · 푸시 · Cloudflare 배포는 Claude 가 맡고, 대시보드나 터미널 작업을 사용자에게 시키지 않는다.

---

## 웹페이지 공통 제작 규칙 (사용자가 따로 말하지 않아도 모두 적용)

### 1. 모바일 화면 깨짐 없음
- 반응형으로 만들고, 폰 폭(360px 기준, 320px까지)에서 가로 스크롤·잘림·겹침이 없는지 **실제로 확인**한다.
- 모바일 메뉴(햄버거 등)를 열었을 때도 레이아웃이 깨지지 않는지 확인한다.
- 글자는 폰에서도 읽기 편한 크기로(본문 16px 안팎).

### 2. 탭 하이라이트(파란 네모) 제거
폰에서 링크·버튼을 누를 때 잠깐 생기는 파란 영역이 보이지 않게 전역으로 넣는다.
```css
* { -webkit-tap-highlight-color: transparent; }
```
키보드 접근성을 위해 `:focus-visible` 표시는 남긴다.

### 3. 폰트는 라이선스 문제 없는 것만
- 상업적 사용·웹 임베딩이 자유로운 폰트만 쓴다(SIL OFL 등). 기본은 **Pretendard**(OFL).
- 그 밖에 허용 예: Noto Sans KR / Noto Serif KR, Nanum 계열(OFL), Gmarket Sans·Spoqa Han Sans Neo 등 무료 상업 이용 명시 폰트.
- 출처·라이선스가 불분명한 폰트, 유료 폰트 파일, 윈도우·맥 시스템 폰트 파일(맑은 고딕 등)을 웹폰트로 올리지 않는다.
- 새 폰트를 쓰게 되면 라이선스를 먼저 확인하고 사용자에게 한 줄로 알린다.

### 4. CSS는 한 파일, 공통화로 최소화
- 페이지마다·섹션마다 CSS 파일을 나누지 않고 **사이트 전체가 CSS 파일 하나**(예: `css/style.css`)를 쓴다.
- 색·간격·글꼴·반경 등은 `:root` 변수로 한 번만 정의해 재사용한다.
- 버튼·카드·섹션 제목·컨테이너처럼 반복되는 것은 공통 클래스로 만들고, 같은 선언을 여러 곳에 복붙하지 않는다.
- 쓰지 않는 규칙은 지우고, 미디어쿼리는 브레이크포인트별로 모아 중복을 줄인다.
- 인라인 `style=""` 남발이나 페이지별 `<style>` 블록 대신 공통 CSS에 넣는다.

### 5. 탭·알약 버튼은 슥 미끄러지게
알약 모양 탭(정렬 기본순·최근순·가나다순, 위쪽 메뉴, 구약/신약 같은 segmented control)은 고른 칸 배경이 **다음 칸으로 부드럽게 미끄러져** 가야 한다. 딱딱 바뀌는(새 페이지 뜨듯) 방식 금지.
- 배경은 칸마다 따로 칠하지 말고 **떠 있는 배경 하나**(`.tab-ind`/`.seg-ind`)를 `transform: translate` + `width` 로 옮긴다. 0.35s 안팎, `cubic-bezier(.22, .8, .24, 1)`, 글자색도 함께 전환. `prefers-reduced-motion` 이면 끔.
- 탭을 innerHTML 로 다시 그리면 미끄럼이 끊긴다 → 한 번 그리고 `.on` 만 바꾸고, 누르는 즉시 배경부터 옮긴다(자료는 뒤따라).
- 숨겨져 있어 폭을 못 재면 칸 자체 배경으로 대신하고, 창 크기·글꼴 로딩 뒤 다시 잰다.
- 참고 구현: `E:\ws\WebMaker\design\bstv2\cms\public\ui.js` `slideTabs`(ES 모듈), `E:\ws\WebMaker\design\bstv2\web\assets\js\site.js` `B.seg`(ES5).

### 6. 끌어서 순서 바꾸기는 자연스럽게 (사용자 지시 2026-11-03, WebMaker2 의 모든 순서 조정 UI)
메뉴 · 게시판 · 가입 항목 등 **순서를 바꾸는 모든 목록**은 끌 때:
- 끄는 항목은 마우스/손가락을 그대로 따라오고(살짝 떠오른 그림자), **나머지 항목은 밀려나며 미끄러지듯 비켜난다**(FLIP: 옮기기 전 위치 → 옮긴 뒤 차이만큼 되돌렸다가 `transform` 을 0 으로, 0.22s 안팎 `cubic-bezier(.22, .8, .24, 1)`).
- 놓으면 제자리로 부드럽게 내려앉고, 애니메이션이 끝난 뒤에 화면을 다시 그린다(바로 다시 그리면 끊긴다). 단계(들여쓰기) 바뀜도 부드럽게. `prefers-reduced-motion` 이면 끔.
- 참고 구현: `xms/js/drag.js` `sortable` — 새 목록도 이걸 그대로 쓴다.

### 7. 색이 바뀌면 그 위의 것도 함께 반전 (사용자 지시 2026-11-04, "따로 얘기 안 해도 알아서")
어두운 구간 · 강조색 버튼 · `:hover` / `.on` / `.active` · 다크 모드처럼 **배경색이 바뀌는 모든 상태**에서는 그 위의 작은 점(::before/::after) · 아이콘(svg) · 테두리 · 보조 글자 · 그림자도 새 배경에서 잘 보이게 함께 바꾼다(같은 색끼리 겹치면 반대 색). 두 상태를 화면으로 다 확인한다.
- 예: 올리브바스켓 '이용하기' 버튼이 어두운 구간에서 라임색이 되면 옆 점은 라임 → 검정.

### 8. 첫 화면(히어로) 큰 글자는 폭과 높이 중 작은 쪽 기준 (사용자 지시 2026-11-14, "근본적인 해결")
화면 높이를 꽉 채우는 구간(`100vh` · `100svh` 히어로 등)의 큰 제목 · 글 묶음을 **`vw` 로만 키우지 않는다.**
- 원인: 글 크기는 화면 **폭**만 보는데, 보이는 칸은 화면 **높이**에 묶여 있다. 윈도우 배율 125·150% 노트북(1920×1080 → 실제 CSS 화면 1536×730 · 1280×620), 1366×768 노트북, 태블릿 가로, 폰 가로처럼 **폭에 비해 낮은 화면**에서는 글이 화면 대부분을 덮거나 아래가 잘린다. 같이 쓰인 고정 px(버튼 높이 · 여백 · `min-height: 660px` 같은 최소 높이)는 줄지 않아 더 심해진다. 내 PC(100%, 큰 모니터)에서는 멀쩡해 보여 놓치기 쉽다.
- 방법: 그 구간에 단위 하나 `--hu: min(1vw, 2.05vh); --hu: min(1vw, 2.05svh);` 를 두고 제목 · 본문 · 작은 제목 · 여백 · 버튼 높이를 모두 `clamp(최소px, calc(N * var(--hu)), 최대px)` 로. (2.05 = 1920×940 에서 폭이 작은 쪽이 되는 값 — 큰 PC 화면 크기는 그대로) 구간 최소 높이는 360px 안팎으로 낮춘다.
- 제일 큰 제목은 비율만 맞추면 태블릿처럼 화면 자체가 작은 기기에서 본문보다 너무 커 보인다(본문 · 버튼은 최소 크기에 걸려 더 안 줄기 때문) → `calc(7.8 * var(--hu) - 52px)` 처럼(1920 폭 98px · 태블릿 가로 48px 안팎) **px 를 빼서** 작은 화면일수록 비율도 조금 작게. 높이가 넉넉한 태블릿 세로는 `(orientation: portrait)` 에서 폭 기준으로 따로.
- 확인: 1920×940 · 1536×730 · 1280×620 · 1366×650 · 1180×760 · 844×340(폰 가로)에서 글 묶음이 화면 높이의 절반 안팎이고 잘리지 않는지 잰다. 참고 구현: `bsf/css/style.css` `.hero`.
- 헤더 메뉴도 같은 원리: 1024~1279px 에서 글자 · 여백이 고정 px 이면 버튼 글자가 두 줄로 깨진다 → `clamp(…, vw, …)` + `white-space: nowrap`.

그 밖의 기본 제작 기준(폴더 구조, 순수 HTML/CSS/JS 등)은 `GUIDELINES.md`.

---

## 작업 흐름

1. 폴더별로 시안 작업 → 로컬 미리보기로 확인 (`서버시작.bat` → http://localhost:8732 , design 의 8731 과 겹치지 않게)
2. git 은 `main` 에서 바로 커밋 (아래 Git)
3. 작업이 끝나면 **Claude 가 바로 push** — https://github.com/xiangdolee-pixel/webmaker2
4. "클라우드플레어에 배포해줘" / "○○ 배포해줘" → **그 폴더 하나만** Workers 로 배포 (아래 배포)

## Git: main 하나로 작업 (trunk-based)

- 리포 루트는 `E:\ws\WebMaker2` (E:\ws 상위 리포와 별개). 커밋은 반드시 여기서.
- **새 브랜치를 만들지 않는다.** 모든 커밋을 `main` 에 바로 한다. 브랜치를 제안하거나 묻지도 않는다.
- 커밋 메시지는 design 과 같은 꼴: `feat(<폴더>): 한국어 설명`, `style(<폴더>): …`, `fix(<폴더>): …`
- **WebMaker2 에서 작업했으면 묻지 않고 커밋 + push 까지 한다.** (design 은 사용자가 GitHub Desktop 으로 푸시하지만 여기는 Claude 가 한다)
- 새 폴더를 만들면 README.md 의 폴더 목록에 추가한다. 빈 폴더는 `.gitkeep`.
- 리포가 **PUBLIC** 이다 → 비밀값(.env, .dev.vars, 키) · 고객 원본 자료는 절대 커밋하지 않는다(.gitignore 참고).
- E:\ws\WebMaker2 밖의 작업은 이 리포에 올리지 않는다.

## Cloudflare 배포: 폴더 하나 = Worker 하나

- **Pages 는 절대 만들지 않는다. Workers 로만 만든다.** (사용자 지시 2026-11-13 "꼭 기억하고 그대로") Compute › Workers & Pages 에 새로 추가할 때 — wrangler · 대시보드(크롬) · API 어느 길이든 — Pages 프로젝트(`wrangler pages …`, Pages 만들기 버튼)는 쓰지 않고 Worker(정적 파일은 Workers assets)로 만든다. 옛 Pages 사이트를 옮길 때도 Worker 로(예: olivebasket · sugarbreak).

- **계정: 반드시 xiangdolee@gmail.com 의 Cloudflare 계정**(account id `f225d506d8cf6ddf97704a36c69f5ce7`, https://dash.cloudflare.com/f225d506d8cf6ddf97704a36c69f5ce7/workers-and-pages). design 리포의 다른 계정(`7ce9…`, master-7ce.workers.dev)에는 절대 올리지 않는다. (사용자 지시, 2026-11-03 "매우 중요")
- 그래서 `npx wrangler deploy` 를 그냥 치지 않는다(기본 로그인이 design 리포의 다른 계정). **항상 `node deploy.mjs <폴더>`** — xiangdolee 전용 로그인(`%USERPROFILE%\.wrangler-xiangdolee`, 리포 밖)으로 빌드 + 배포한다. `build.mjs` 가 wrangler.jsonc 에 account_id 를 박아 두어 다른 계정으로는 올라가지 않는다.
- 로그인이 풀렸으면 `node deploy.mjs --login` (브라우저 승인 필요 — 엣지에 xiangdolee 계정이 로그인돼 있음, 계정 고르는 화면에서 xiangdolee 를 고르라고 사용자에게 한 줄로 안내). 확인은 `node deploy.mjs --whoami`.
- "배포해줘" 요청을 받으면 Claude 가 직접 배포하고 주소를 알려준다.
- 리포 루트(`E:\ws\WebMaker2`)에서 한 줄:
  ```
  node deploy.mjs <폴더>
  ```
  (안에서 `node build.mjs <폴더>` → `npx wrangler deploy`.) `build.mjs` 가 그 폴더만 `dist/` 로 모으고(메모 `.md` · 설정 · 숨김 파일 제외) `wrangler.jsonc`(name = 폴더 이름)를 만든다. 단 deploy.mjs 는 `.deploy/<폴더>` + `.deploy-<폴더>.wrangler.jsonc` 에 따로 빌드한다 — 다른 세션이 `dist` 를 다시 빌드해도 섞이지 않게. (섞여 올라가면 그 파일 해시에 엉뚱한 내용이 굳어, 내용을 한 글자라도 바꿔 다시 올려야 고쳐진다.)
- **리포 전체를 올리지 않는다.** `build.mjs` 없이 `wrangler deploy` 하지 않고, 리포 루트를 통째로 assets 로 쓰지 않고, `webmaker` 이름의 Worker 를 만들지 않는다.
- 어느 폴더인지: 요청에 폴더 이름이 있으면 그것, 없으면 지금 작업 중인 폴더. 애매하면 한 줄로 묻는다.
- 로컬 파일을 그대로 올린다(커밋 · 푸시 전이어도 된다).
- 배포 뒤 curl 로 확인: `/` 가 200, `README.md` · 다른 폴더 같은 리포 파일은 404.
- 주소: `https://<Worker이름>.<xiangdolee 계정 workers.dev 서브도메인>.workers.dev` (배포 결과에 나오는 주소를 그대로 알려준다) — Worker 이름은 폴더 이름 소문자, `_` · `.` 은 `-` (`4D` → `4d`).
- Worker 삭제처럼 되돌릴 수 없는 작업은 먼저 묻는다.
- 첫 화면: index.html 이 없으면 landing.html(또는 html 이 하나뿐이면 그 파일).
- 서버 기능이 필요한 폴더는 `<폴더>/_worker/index.js`(+ `bindings.json` 에 D1 · KV 연결)를 두면 build.mjs 가 정적 파일과 함께 Worker 로 올린다. `_worker/` 는 웹에 공개되지 않는다. 비밀값은 `npx wrangler secret put` (리포에 두지 않음).

## xim (고객 사이트 통합 관리)

- `xim/` = 운영자 관리 화면 + 공용 엔진(Worker `xim`, D1 `xim`). 구조 · 연결 방법 · 운영 명령은 `xim/README.md`.
- **새 고객 사이트는 디자인해서 `node deploy.mjs <폴더>` 로 올리기만 하면 자동으로 xim · xms 에 연결된다** (사용자 지시 2026-11-03 — "매번 프롬프트로 연결해 달라고 하면 xim 이 있을 이유가 없다"):
  - build.mjs: 공통 사이트 Worker(`xim/_worker/site-worker.js`)를 main 으로 붙이고(폴더에 복사하지 않는다), dist html 의 헤더 첫 `<nav>` 에 `data-xms-menu` · 링크에 `data-xms-item` · 계정 버튼 자리를 넣는다(원본은 그대로, 이미 표시가 있으면 손대지 않음).
  - deploy.mjs: 처음이면 xim 에 사이트 등록(이름 = index.html `<title>`), 헤더 메뉴 링크를 xms 메뉴 목록으로 한 번 가져온다. 그 뒤 메뉴 · 게시판은 업체가 xms 에서 고친다.
  - deploy.mjs: xim 대표 도메인이 비어 있으면 그 Worker 에 Cloudflare 로 붙인 사용자 도메인(Custom Domain)을 읽어 채운다(이미 있으면 그대로). xim 은 사이트 목록을 열 때 메일 · 봇 확인을 자동 등록. 따로 하려면 `node deploy.mjs --domain <폴더>`.
  - 빠지는 폴더: xim · xms 자신, 자기 서버 Worker(`_worker/index.js`)가 있는 폴더(예: xip), `.xim-off` 파일을 둔 폴더.
  - 옛 주소를 새 주소로 옮길 때: 폴더에 `.xim-redirect`(한 줄에 "옛호스트 새호스트", 웹에 안 올라감)를 두면 공통 사이트 Worker 가 301 로 보낸다(예: school-timeline).
  - 헤더 메뉴 중 버튼 모양(class 에 cta · btn · button)은 xms 메뉴로 바뀌지 않고 그대로 남는다(예: "후원하기").
  - **웹에서(xim "GitHub에서 연결")**: 폴더 주소(https://github.com/xiangdolee-pixel/webmaker2/tree/main/<폴더>)를 넣으면 xim 이 GitHub Actions `.github/workflows/xim-connect.yml` 을 실행 → 위와 똑같이 `node deploy.mjs <폴더>` (Cloudflare API 토큰 = 저장소 비밀값 `CLOUDFLARE_API_TOKEN`, xim 쪽 = Worker 비밀값 `GITHUB_TOKEN`: webmaker2 저장소 Actions 읽기·쓰기 전용 토큰).
- "xim 요청 처리해줘" → `node deploy.mjs --wrangler d1 execute xim --remote --json --command "..."` 로 처리할 수정요청(status != 'done')을 읽고, 해당 폴더를 고쳐 배포한 뒤 요청 상태 · 답변을 갱신한다.
- 배포 순서: xim · xms 가 먼저 있어야 고객 사이트 배포가 된다(서비스 바인딩).

## xms (업체별 CMS)

- 회원가입 = 이메일 인증(6자리 번호) → 정보 입력, 아이디 = 이메일. 인증 메일은 **그 사이트 도메인의 `noreply@<도메인>`** 으로 보낸다(Cloudflare Email Service). xim 에서 사이트의 **대표 도메인**을 저장하면 xim 이 Cloudflare Email Sending 에 자동 등록한다(xim 비밀값 `CF_MAIL_TOKEN`: Zone Read · DNS Edit · Email Sending Edit · Account Turnstile Edit). 같은 때에 사이트별 봇 확인(Turnstile) 위젯도 만들어 가입 인증번호 받기 앞에 붙인다(키는 xim DB sites.turnstile_*). 카드의 "메일 · 봇확인" 표시를 누르면 다시 등록). 등록 전에는 예비 주소 noreply@plators.com 으로 나간다. 이 PC 에서 직접: `node deploy.mjs --mail <폴더>`.

- `xms/` = 업체가 `사이트주소/xms/` 에서 쓰는 관리 화면 + 방문자용 `/member/*` · `/board/*` (Worker `xms`, D1 `xms`). 구조·범위는 `xms/README.md`.
- 기능 기준은 사용자 PC 의 기준 CMS 소스(경로는 Claude 메모리 xim-project 에 있다). 새 기능을 옮길 때 그 소스를 먼저 읽고 문구·동작을 맞춘다.
- 업체 관리자 = xms 회원 중 등급 1. xim 의 "관리자 계정" 이 xms DB 에 만든다. "xms" 버튼 = 1분 입장권으로 그 사이트 첫 관리자(등급 1) 계정으로 로그인 — 일반 관리자 로그인과 구분하지 않는다(사용자 지시 2026-11-03). 관리자 계정이 없을 때만 운영자 모드(그때 비밀번호 변경 화면에서 관리자 비밀번호를 바로 바꿀 수 있음).

## 맨 위로 버튼 (사용자 지시 2026-11-12, xim 의 모든 사이트)

- 스크롤을 내리면 오른쪽 아래에 **맨 위로** 동그라미 버튼 — 공통 사이트 Worker 가 넣고, **기본으로 켜져 있다**(xms 관리 › 부가 기능에서 끈 사이트 · 뺄 주소만 빠짐). 사이트에 떠 있는 버튼(문의 등)이 오른쪽 아래에 있으면 사이트 CSS 에서 `body .xms-top { bottom: … }` 으로 그 위에 둔다(예: bsf).

## 고객 정보는 그 사이트 xms 에만 (사용자 지시 2026-11-13, "정말 주의해야해")

- 고객 사이트의 문의 · 신청 · 회원 정보는 **그 사이트의 xms 에서만** 보인다. 다른 사이트의 xms 에도, xim 운영자 화면에도 섞여 나오면 안 된다.
- 고객 사이트 문의 폼 → xms DB `site_inquiries`(site 칸으로 나뉨). xms 의 모든 읽기 · 고치기 쿼리에 `WHERE site = <로그인한 사이트>` 를 꼭 붙인다(id 하나로만 찾지 않는다).
- xim '제작문의' 는 portfolio.plators.com 에서 온 것만(xim DB `inquiries`, site = 'portfolio').
- 새 기능에서 사이트끼리 나눠야 할 자료를 만들면 같은 원칙: 그 사이트 xms 저장소 + site 조건.

## 화면 파일 캐시 (xim · xms)

- css · js 주소에 배포 번호 `?v=<Worker 버전>` 을 붙여(첫 화면 html 과 js 안 import 를 Worker 가 고쳐 줌) 1년 캐시한다. 배포하면 번호가 바뀌어 브라우저가 바로 새 파일을 받는다 — 사용자에게 Ctrl+F5 를 시키지 않는다. 새 css · js 파일을 추가할 때도 이 경로(/xms/css · /xms/js, xim 의 css/ · js/) 아래에 둔다.

## 용어 금지 (사용자 지시 2026-11-03, "명심해")

- 이 리포 · xim · xms · 고객 사이트 어디에도(화면 문구 · 코드 · 주석 · 문서 · 데이터 · 커밋 메시지) 그 회사 이름(한글·영문)을 넣지 않는다. 대신 들어가는 사람은 "운영자" 라고 쓴다.

## 게시판 · 회원 화면은 사이트 디자인 안에 (사용자 지시 2026-11-03, "이러면 안 돼!")

- `/board/*` · `/member/*` 는 **사이트의 기존 페이지(틀)를 그대로 쓰고 `<main>` 자리에만** xms 내용을 끼운다. 머리 · 꼬리 · 사이트 CSS 를 절대 바꾸지 않는다.
- 틀 고르기(build.mjs → `XIM_SHELL`): 폴더에 `_layout.html` 이 있으면 그것, 없으면 `<main>` 이 있는 첫 하위 페이지, 그것도 없으면 첫 화면. 새 사이트를 디자인할 때 하위 페이지에 `<main>` 을 꼭 둔다(게시판 틀로 쓰인다). 첫 화면처럼 꾸밈이 많은 페이지뿐이면 `_layout.html`(머리 · 빈 main · 꼬리)을 따로 만든다.
- 게시판 CSS 는 `/xms/css/embed.css` — xms CSS 를 `.xms-c` 안에만 걸리게 바꾼 것. 글자색은 사이트를 따르고, **글꼴은 게시판 · 글 · 회원가입 등 xms 화면 모두 Pretendard** (사용자 지시 2026-11-03). 강조색은 사이트 CSS 에서 `.xms-c { --brand: … }` 한 줄로 맞춘다(예: sjccc).

## 모든 홈페이지 공통: 로그인 · 계정 버튼 (사용자 지시 2026-11-03, xim 관할 모든 서비스)

- 서비스(홈페이지)와 xms 는 **같은 로그인(SSO)** — 같은 주소의 `xms_sess` 쿠키. 홈페이지에서 로그인하면 관리 화면도, 관리 화면에서 로그인하면 홈페이지도 로그인돼 있다.
- **관리 화면(/xms/)은 레벨1(관리자)만.** 다른 등급은 홈페이지 로그인은 되지만 관리 화면은 막힌다.
- 로그인하면 헤더에 **사람 모양 동그라미 버튼** → 누르면 `관리` · `유지보수 요청`(레벨1만) / `내 정보` / `로그아웃`. 로그인 전에는 `로그인` 링크.
- 구현: 공통 사이트 Worker 가 모든 html 에 `/xms/js/account.js` 를 자동으로 넣는다. 자리(`<span data-xms-account></span>`)는 build.mjs 가 헤더 메뉴 바로 뒤에 자동으로 넣지만, **모바일에서도 늘 보이도록 디자인할 때 헤더 안(햄버거 옆)에 직접 두는 게 가장 좋다.** 헤더 `<nav>` 가 없으면 화면 오른쪽 위에 떠 있는 버튼으로 나온다.
- 색: 자리 요소에 `--xa-bg`(동그라미) · `--xa-fg`(사람) CSS 변수로 사이트 색에 맞춘다. 로그인 링크 글자는 `.xa-login` 으로 사이트 메뉴 글꼴에 맞춘다. 예: `sjccc/css/style.css` 의 `.gnb-account`.
