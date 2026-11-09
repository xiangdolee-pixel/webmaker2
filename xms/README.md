# xms — 업체별 홈페이지 관리(CMS)

각 업체가 **자기 홈페이지 주소/xms/** 에서 회원 · 게시판 · 메뉴를 관리한다. 기준 CMS 의 메뉴 · 동작을 그대로 옮겼다.
Worker `xms` + D1 `xms` (xiangdolee 계정). 업체 구분은 모든 표의 `site` 열(= xim 사이트 ID = WebMaker2 폴더 이름).

## 1차에 들어간 것

| 관리 화면 (/xms/) | 방문자 화면 |
|---|---|
| 저장 공간 (xim 의 용량 표시) | `/member/login` · `/member/signup` · `/member/mypage` |
| 회원관리: 가입회원(찾기 · 필수 항목 빈 회원 · 등급 필터, 등급 바꾸기, 로그인 막기/풀기, 비밀번호 재발급 6자리, 탈퇴, 엑셀 내려받기) · 탈퇴회원 · 등급 이름(1~10) · 가입 항목(기본 6개 + 직접 추가: 입력/숫자/날짜/리스트선택/선택/다중선택, 끌어서 순서) · 이용약관 / 개인정보 처리방침(버전 발행) | `/member/terms` · `/member/privacy` |
| 게시판: 목록(끌어서 순서, 30일 보관함 · 되살리기) · 만들기/설정(이름 · 주소, 테이블/카드/블로그, 댓글 · 비밀글 · 비회원 글쓰기, 목록 · 읽기 표시 항목, 작성자 가리기, 목록 개수, 등급별 목록/읽기/쓰기/댓글 권한, 메뉴에 바로 붙이기) | `/board/<주소>` 목록 · 검색 · 공지 고정 · NEW · 예약 발행, 글 보기 · 쓰기 · 수정 · 삭제, 댓글 |
| 메뉴: 트리(끌어서 순서 · 오른쪽으로 끌면 하위), 페이지 / 게시판 / 외부 링크, 숨기기, 누가 볼 수 있나 | 방문자 화면 위쪽 메뉴(방문자 등급별로 걸러서) · `/xms-api/menu` |
| 팝업(목록 · 만들기: 기간 · 상태 · 운영 모드 · 링크 · 그림 · 본문 · 미리보기, 끌어서 차례) | 홈 화면 팝업 — 여러 개면 한 창에서 좌우로, 오늘 하루/다시 보지 않기 |
| 파비콘(32·180·192·512 자동) · 검색엔진(제목 · 설명 · 소유권 확인 · 사이트맵 · robots.txt) · 카카오톡 미리보기(설명 · 그림 · 미리보기 카드) | 모든 페이지 머리에 자동으로 넣음, /robots.txt · /sitemap.xml |
| 방문 통계: 오늘 · 어제 · 7일 · 1 · 3 · 6 · 9 · 12개월 방문자와 페이지뷰(목록 · 표는 10개씩 쪽 나눔), 많이 본 페이지, 들어온 곳, 폰 비율, 검색으로 들어옴(검색엔진별 · 많이 찾은 검색어 · 최근 유입 한 줄씩 20개) (최근 1년치만 남김) | 사이트 Worker 가 html 페이지를 열 때마다 `Cms.visit()` 으로 기록 — 로봇 · 관리 화면 제외, 하루 방문자는 쿠키 `xms_v`. 검색 유입은 `visit_searches`(사이트마다 3000줄) — 들어온 곳이 검색엔진이면 사이트 Worker 가 그 주소의 ? 뒷부분(`rq`)을 함께 보내고 xms `visits.js` `searchOf` 가 검색어를 가려낸다(네이버 `query` · 다음 `q` 등, 구글 · 빙은 검색어를 안 넘겨 줘 '검색어 비공개') |
| 수정 요청 (xim 으로 감) · 비밀번호 변경 · 관리 로그 | |
| 운영자 "대신 들어가기" (xim → xms 버튼, 노란 띠 + 기록) | |

규칙(pcms 와 같음): 등급 1 = 관리자(관리 화면에 들어올 수 있는 유일한 등급), 9 = 가입 기본, 10 = 제한(읽기만). 마지막 관리자는 내리거나 막거나 탈퇴시킬 수 없다. 로그인 5번 틀리면 15분 잠금.

## 모든 홈페이지 공통 계정 버튼 (SSO)

- `js/account.js` — 사이트 Worker 가 모든 html 에 넣는다. 헤더의 `<span data-xms-account></span>` 자리에 로그인 링크 / 사람 동그라미(관리 · 유지보수 요청은 레벨1만, 내 정보, 로그아웃)를 그린다. 자리가 없으면 오른쪽 위에 떠 있다.
- 서비스와 관리 화면은 같은 로그인(`xms_sess`). 관리 화면은 레벨1만 — 다른 등급이 로그인해도 홈페이지 로그인은 그대로 두고 관리 화면만 막는다.
- 스타일은 `xa-` 접두어로만, 사이트 CSS 와 섞이지 않는다. 색은 `--xa-bg` · `--xa-fg`.

## 부가 기능: 맨 위로 버튼

- 관리 화면 **사이트 › 부가 기능** 에서 켜고 끈다(사이트마다, 기본은 꺼짐). 뺄 주소(예: 올리브바스켓 /app · /basket)도 여기서.
- 값은 D1 `site_options` (k = top_button, v = {"on":true,"except":[...]}). 사이트 Worker 가 페이지 끝에 버튼을 넣는다 — 그 사이트를 한 번 다시 배포해야(새 사이트 Worker) 붙는다.
- 켠 곳(2026-11-07): sound-build · sjccc · olivebasket(웹페이지만) · school-timeline.

## 강의 (사이트별로 켜는 기능)

- 켜기: `INSERT OR IGNORE INTO site_features (site, feature) VALUES ('<사이트>', 'courses')` → 관리 화면 왼쪽에 **강의 › 강의 관리**.
- 강의 → 섹션 → 차시(제목 · YouTube/Vimeo 주소 · 길이 · 맛보기). ⠿ 로 끌어서 차례(강의 목록 · 섹션 · 차시 각각). 분야 · 수준은 사이트 목록의 탭 · 칩이 된다.
- 볼 수 있는 등급(강의마다, 기본 1~8 — 9 일반회원은 맛보기만). 회원 등급을 바꿔 주면 수강 권한. 영상 주소는 볼 수 있는 사람에게만 내준다.
- 방문자 API: `GET /xms-api/courses` · `/courses/<id>` · `/lessons/<id>`(영상 · 노트, 마지막 차시 · 공부한 날 기록) · `PUT /lessons/<id>/done` · `/lessons/<id>/note` · `GET /my/courses`(다 본 차시 · 완강 · 연속 학습).
- 코드: `_worker/courses.js`, 화면 `js/admin.js` (강의 관리). 첫 사이트: sound-build.

## 수정 모드 (홈페이지 위에서 글자 고치기)

- 관리자(레벨1)로 로그인 → 계정 메뉴 **수정 모드** → 파란 점선 글자를 눌러 고치고 **저장** (Ctrl+S). 주소에 `?xe=1` 을 붙여도 바로 열린다.
- 글자 조각(text node)만 바꾼다 → 굵게 · 색 · 링크 같은 모양은 사이트 그대로. 고친 값은 D1 `page_texts` (원래 글자의 지문 = 해시.몇 번째).
- 머리(header) · 꼬리(footer) 안 글자는 모든 페이지 공통, 나머지는 그 페이지만. xms 메뉴 · 계정 버튼 · 게시판 본문 · 스크립트가 그리는 글자(강의 목록 등)는 대상이 아니다.
- 사이트 원본 글자를 바꿔 다시 배포하면 그 자리의 고친 글자는 더 이상 붙지 않는다(엉뚱한 곳에 붙지 않게).
- 구현: 사이트 Worker(`xim/_worker/site-worker.js` XE_APPLY)가 페이지 끝에서 글자를 넣고, `js/edit.js` 가 편집 화면, `POST /xms-api/admin/page-texts` 가 저장.

## 2차로 미룬 것

접수함 · 번역 다듬기 · 솔루션 공지, 사진/파일 올리기(R2) + 저장 공간 집계, 설교 게시판 · 전자책, 비밀번호 찾기 메일, 답글, 태그, 사이트 디자인 안에 메뉴 끼워 넣기(지금은 /board · /member 화면 위쪽에만 메뉴가 나온다).

## 구조

```
고객 사이트 Worker (xim/_worker/site-worker.js — build.mjs 가 모든 사이트에 붙임)
  /xms/(관리 화면) · /admin/(→ /xms/) · /xms/* · /xms-api/* · /member/* · /board/*  →  xms (Cms 엔트리, X-Xim-Site 헤더)
  정지 확인 → xim Engine
xms Worker
  _worker/index.js     라우터 (Cms 엔트리)          _worker/lib.js   세션 · 권한 · 설정 · HTML 정리(HTMLRewriter)
  _worker/admin-api.js 관리자 API                    _worker/public.js 방문자 화면(서버에서 HTML) · API
  admin/index.html + js/admin.js  관리 화면(해시 주소)   js/public.js · js/editor.js · js/drag.js · js/common.js
  css/style.css        관리 · 방문자 화면 공용 CSS 한 파일
바인딩: DB = D1 xms, XIM_DB = D1 xim (사이트 이름 · 용량, 수정요청)
xim 은 XMS_DB 로 업체 관리자 계정(xms 등급 1 회원)과 직원 입장권을 만든다.
```

## 운영 명령 (리포 루트에서)

```
node deploy.mjs xms
node deploy.mjs --wrangler d1 execute xms --remote --file xms/_worker/schema.sql -y
```
배포 순서: xms · xim 이 먼저 있어야 고객 사이트를 배포할 수 있다(서비스 바인딩).
