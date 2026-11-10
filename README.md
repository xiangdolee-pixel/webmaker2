# webmaker2

E:\ws\WebMaker2 작업 프로젝트 모음 — 폴더 하나 = 웹사이트 하나.
작업 규칙은 `CLAUDE.md` (E:\ws\WebMaker\design 과 동일), 제작 기준은 `GUIDELINES.md`.

## 폴더

- xip/ — 실시간 시세 대시보드 (https://xip.xiangdolee.workers.dev)
- sjccc/ — 나사렛장학회 (나사렛장학회.kr, 옛 xiangdolee-pixel/sjccc 리포에서 옮겨옴) · xim 연결됨
- roadbible/ — 길 성경통독 (bible.plators.com) · xim 연결됨 · / = 소개 페이지(로그인했으면 /app 으로, 홈 화면 앱은 바로 /app), /app = 성경 앱 · 로그인 = 이 사이트 회원(xms), 기록은 /api/sync (Durable Object) · 성경 본문 bible-data.js(개역개정, 대한성서공회 무료 이용 확인)
- olivebasket/ — 올리브바스켓 (olivebasket.plators.com) · xim 연결됨 · / = 소개 페이지(로그인하면 /app 으로), /app = 구절 앱, /basket = 담기 · 로그인 = 사이트 회원(xms), 구절은 예전 D1 `olivebasket` 그대로(users.email 로 회원과 이어 붙임)
- sugarbreak/ — 슈가브레이크 (예전 Pages `blood` · `sugarbreak`, blood.plators.com) · xim 연결됨 · 관리자(레벨1)만 쓰는 건강 기록, 예전 D1 `sugarbreak` 그대로. 원본이던 E:wsblood 는 이제 안 씀
- plators/ — email.plators.com (Worker plators, 사용자 도메인 · 2026-11-06 plators.com 에서 옮김) 한 장짜리 페이지(가운데 master@plators.com) · xim 연결됨
- portfolio/ — 포트폴리오 (portfolio.plators.com) · xim 연결됨 · 접속할 때마다 비밀번호(Worker 비밀값 PORTFOLIO_PASSWORD, 리포에 없음) · 카드 목록 = xim 사이트 줄의 '포트폴리오' 스위치를 켠 사이트, 이름 · 설명 · 그림 = 각 사이트 xms(검색엔진 제목 · 카톡 미리보기)
- school-timeline/ — 스쿨타임라인 (plators.com, 옛 주소 school-timeline.plators.com 은 301 이동) 초등학교 입학년도 계산기 · 2027 초등 취학 준비 · xim 연결됨 · 애드센스 신청 대상 · 빌드 없는 HTML/JS, 테스트는 폴더 안 _dev/ (npm test · npm run test:e2e)
- sound-build/ — 영소립 English, Sound & Build 영어 강의 사이트 (https://sound-build.xiangdolee.workers.dev) · xim 연결됨 · 시안 1단계: 홈 · 강의 목록 · 상세 · 강의실 · 내 강의실 · 문장 훈련(학생이 직접 표시 · 채점 · 조립도). 강의 · 문장 자료는 지금 js/data.js 예시 → 2단계에서 xms "강의" · "문장 훈련" 관리로. 게시판 notice(공지사항)
- dice/ — 주사위 (게임용, dice.plators.com) · 개수 1~10 · 종류 10가지(클래식 · 블랙 · 카지노 레드 · 사파이어 · 에메랄드 · 원목 · 대리석 · 골드 · 민트 · 갤럭시) · 녹색 펠트 판, 누르면 굴러가며 숫자 · 합계 · 이전 기록 · xim 연결됨
- rich/ — 머니로드 (직업 부자 레이스 보드게임, https://rich.xiangdolee.workers.dev) · 83칸 3겹 길(학교 → 직업 → 결혼 · 가족 → 중년 → 은퇴) · 판 가운데 전자룰렛 · 움직일 때 카메라가 차를 따라 확대, 크게 보기(끌어서 둘러보기) · 직업 카드 "○○의 길" 3단계 · 레벨업 찬스카드 · 찬스(직업 보너스 · 주식 · 부동산) · 돈 주고받는 장면 · 지폐 · LEVEL UP 카드 · 6인승 자동차에 가족 · 은퇴 주차장 · 1~4명(혼자면 PC) · 자동 모드 · 이어하기 · xim 연결됨
- lastshot/ — 라스트샷 (세로 폰 달리기 슈팅 게임, https://lastshot.plators.com) · 시작 화면 닉네임(랜덤 기본, 고칠 수 있음) · 난이도 쉬움/중간/하드(중간이 기준, 적 수 · 체력 · 보스 · 문 값 배수) · 난이도별 랭킹 TOP 50 · 좌우로 끌어 문 고르기 · 문을 쏘면 숫자 +1 · 레벨마다 스테이지가 바뀜(기본 · 돌격전 · 문 미로 · 무기고 · 포위전, 색도 다름) · 거인 · 드럼통 · 바뀌는 문 · 세 갈래 문 · 보스 2종(근육 대장 / 포탄 쏘는 탱크) · 타이어 = 진급/연사/위력 · 레벨마다 세짐(결제 없음, 레벨은 브라우저 저장) · 규칙 js/core.js(node 로 균형 시험 가능), 3D(three.js r160 MIT, js/vendor) 그림 js/game.js, ?debug 로 자동 플레이 확인 · xim 연결됨
- clone/ — 내 목소리 읽어주기 (https://clone.xiangdolee.workers.dev) · 운영자 개인용 TTS: 글을 넣으면 PC 처리기(리포 밖 D:\ws\clone, GPT-SoVITS 로 학습한 내 목소리)가 만들어 고른 음량(-16 LUFS)의 WAV 로 올림 · 대기열 D1 `clone` · 음성 R2 `clone-audio` · 비밀번호 로그인(Worker 비밀값) · xim 연결 안 함 · 자세한 건 clone/README.md
- xim/ — 고객 사이트 통합 관리(고객·사이트·정지·용량·수정요청). https://xim.xiangdolee.workers.dev , 자세한 건 xim/README.md
- xms/ — 업체별 홈페이지 관리(회원·게시판·메뉴). 각 사이트주소/admin/ , 자세한 건 xms/README.md

## 이어서 할 일 (2026-11-04 기준)

- xms: 카톡 미리보기 그림을 맞추는 창에서 '이 사진 쓰기'를 누르면 바로 저장되게 고쳐 커밋만 함 — **아직 배포 전** (`node deploy.mjs xms`, 모든 사이트 공용이라 배포 전에 확인)
- roadbible: 로그아웃하면 기기 기록을 지우는 버전 배포됨 — 사용자 폰에서 한 번 로그인 → 로그아웃해 확인

## 로컬 미리보기

`서버시작.bat` 더블클릭 → http://localhost:8732 (Node.js LTS 필요)

## Cloudflare 배포

xiangdolee@gmail.com 계정(f225d506…)에만 올린다.

```
node deploy.mjs <폴더>
```
