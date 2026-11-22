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
- sang/ — 해골 빌딩의 용사 (사다리 두뇌 게임, https://sang.plators.com) · 아이가 쓴 기획 그대로: 용사(1레벨 힘 7)가 사다리로 바로 옆 빌딩까지만 옮겨 다니며 나보다 약한 해골을 이겨 힘을 모으고 보스를 쓰러뜨림 · 규칙 · 레벨 만들기 js/core.js(레벨 번호 = 같은 판, 풀이 탐색으로 깰 수 있음 확인, node 로 시험 가능), 화면 js/game.js · 시간별 메달 5종 · 이 기기에 저장 · 30의 배수 레벨을 깨면 보스 이름 타이핑 · 그림은 GPT 시트에서 오림(_pc/sang) · xim 연결됨
- sosu/ — 소수 (https://sosu.plators.com) · 초4-2 '소수의 덧셈과 뺄셈'을 초콜릿 한 판(1) · 한 줄(0.1) · 한 조각(0.01)으로 배우는 퀴즈 20단계 · 개념 카드 → 만져 보기(+0.01 · −0.01) → 10문제, 틀리면 그림 설명 뒤 다시 나옴 · 오늘의 복습(많이 틀린 단계 위주) · 정답 하나 = 초콜릿 0.01판 · 문제 만들기 js/core.js(node 로 시험 가능), 화면 js/app.js · 기록은 이 기기에(localStorage sosu_save) · 주소 뒤 ?open = 모든 단계 열림 · xim 연결됨
- clone/ — 내 목소리 읽어주기 (https://clone.xiangdolee.workers.dev) · 운영자 개인용 TTS: 글을 넣으면 PC 처리기(리포 밖 D:\ws\clone, GPT-SoVITS 로 학습한 내 목소리)가 만들어 고른 음량(-16 LUFS)의 WAV 로 올림 · 대기열 D1 `clone` · 음성 R2 `clone-audio` · 비밀번호 로그인(Worker 비밀값) · xim 연결 안 함 · 자세한 건 clone/README.md
- domains/ — 도메인 연결 도구 (xim 메뉴 '도메인 연결', 따로 https://domains.plators.com) · 다른 도메인을 plators.com(Pro) IP 로 태우는 Cloudflare for SaaS 등록 · 인증서 TXT · 회색 CNAME 바꾸기를 화면에서 · 비밀번호 = Worker 비밀값 DOMAINS_PASS · xim 연결 안 함 · 자세한 건 domains/README.md
- bsf/ — BSF COMPANY 의류 OEM · ODM 해외생산 소싱 회사 홈페이지 (https://bsf.xiangdolee.workers.dev) · xim 연결됨 · 6쪽(홈 · 회사소개 · 생산역량 · 납품실적 · 자체브랜드 · 생산 문의) · 문의는 /site-api/inquiry → xim 제작문의 · html 은 bsf/_dev/gen.py 로 만든다(머리 · 꼬리 공통) · 고객 원본 자료 · 기획안은 bsf/_src(리포에 안 올림)
- gamsa365/ — 감사노트365 (thanks365.plators.com) · xim 연결됨 · 하루 3 · 5 · 10가지 감사("~해서 감사합니다.") · 처음 들어오면 하루 몇 개 · 도움 질문 여부를 묻고 설정에서 바꿈 · 마음 날씨 · 빛 달력(연속 기록 없음) · 이웃 나눔(빛 보내기, 신고 3번이면 숨김, 이름 비우면 익명 · 사진 없음) · 한 줄 기도(하루 하나, 나만 봄, 설정에서 끔) · 기억 꺼내기 · 시간대 하늘 그림 · 알림 = Web Push(본체 gamsa365-core cron 10분, 비밀값 VAPID_JWK) · 기록은 D1 `gamsa365` (회원 = xms 이메일)
- kinderwill/ — 킨더윌 사회성언어전문센터(서울 노원 상계동 아동 발달 센터: 사회성 그룹 프로그램 · 언어 · 놀이 · 미술 · 감각통합 · 인지 치료 · 심리상담 · 학습 · 키즈스텝). 21쪽. html 은 손으로 고치지 않고 `python kinderwill/_dev/build.py` 가 찍는다(`_dev/kit.py` 머리 · 꼬리 · 부품, `home.py`, `pages_*.py`). 블로그 최신 글은 `python kinderwill/_dev/blog.py` 로 받아 다시 찍는다. 그림은 모두 GPT 로 새로 만든 것(센터 실제 공간을 다시 찍은 듯 + 얼굴 없는 연출 사진 + 선생님 3D 캐릭터), 원장 사진 · 로고 심볼만 원본. 하위 메뉴 탭은 페이지 전환(view-transition)으로 미끄러진다.
- neulhaerang/ — 늘해랑심리상담센터(서울 노원 · 상계, 아동 · 청소년 · 성인 심리상담, https://늘해랑심리상담.kr — 도메인 부스터 적용 · nhr.plators.com 도 열림) · xim 연결됨 · 7쪽(홈 · 센터소개 3쪽 about 인사말 · team 담당 선생님 · location 오시는 길 · program 상담프로그램 · space 공간안내 · guide 이용안내) — **하위 6쪽은 `_dev/build-pages.py` 가 index.html 의 머리 · 꼬리를 가져와 만든다(머리 · 꼬리를 고치면 다시 실행)** · 센터소개 아래 메뉴와 알약 탭은 js/site.js · 예약은 네이버 예약으로 연결 · 분위기 = 센터 홍보물(아이보리 · 잎사귀 초록 · 해 노랑 · 손글씨 나눔손글씨 펜 + 제목 고운바탕, 둘 다 OFL — 쓰는 글자만 담은 fonts/nh-*.woff2 를 `_dev/build-fonts.py` 로 만들어 미리 받는다. 글을 고쳐 새 글자가 생기면 다시 실행) · 로고는 받은 그림에서 땀(마크 색은 간판의 짙은 올리브 회색) · 사진은 센터 실제 사진을 GPT 로 정리 · 자료 · 기획 · 사진 도구는 _pc/neulhaerang(비공개)
- ongil/ — 온길교회 교회 홈페이지 (https://ongil.plators.com) · xim 연결됨 · 6쪽(홈 · 교회소개 · 담임목사 · 예배시간 · 오시는 길 · 교회사역) + 게시판 sermon(설교말씀, 카드) · news(주보·소식, 표) · gallery(갤러리, 카드) · 교회소개 아래 4쪽은 알약 탭(페이지를 옮겨도 미끄러짐)과 머리 메뉴 아래 메뉴(js/site.js ABOUT) · 첫 화면 최근 글은 data-xms-latest(공통 사이트 Worker 가 페이지에 함께 넣음) · 로고 = 받은 그림에서 심볼(images/logo-symbol.webp) · 글자(images/logo-word.png, 마스크라 색은 CSS 가 칠함)를 잘라 씀, 색은 로고의 남색 #20344e · 금색 #c28f45 · 사진은 GPT 로 만든 것(담임목사 사진은 받은 것) · 주소 · 전화 · 메일은 예시 값
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
