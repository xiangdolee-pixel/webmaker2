-- xms D1 스키마 (업체별 CMS: 회원 · 게시판 · 메뉴). 모든 표는 site(= xim 사이트 ID, 폴더 이름)로 업체를 나눈다.
-- 적용: node deploy.mjs --wrangler d1 execute xms --remote --file xms/_worker/schema.sql -y  (여러 번 실행해도 안전)

-- 업체별 설정: 등급 이름 · 가입 항목 (JSON)
CREATE TABLE IF NOT EXISTS site_settings (
  site          TEXT PRIMARY KEY,
  level_names   TEXT NOT NULL DEFAULT '{}',
  signup_fields TEXT NOT NULL DEFAULT '[]',
  updated_at    INTEGER NOT NULL DEFAULT 0
);

-- 회원 (등급 1 = 관리자: /admin 에 들어갈 수 있는 유일한 등급, 9 = 가입 기본, 10 = 제한)
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  site            TEXT NOT NULL,
  login_id        TEXT NOT NULL,
  pw_hash         TEXT NOT NULL,
  pw_salt         TEXT NOT NULL,
  name            TEXT NOT NULL,
  nickname        TEXT NOT NULL DEFAULT '',
  level           INTEGER NOT NULL DEFAULT 9,
  email           TEXT NOT NULL DEFAULT '',
  mobile          TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  extra           TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | LOCKED | WITHDRAWN
  fail_count      INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER NOT NULL DEFAULT 0,        -- 로그인 5번 실패 → 15분 잠금
  last_login_at   INTEGER,
  created_at      INTEGER NOT NULL,
  withdrawn_at    INTEGER,
  withdraw_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (site, login_id)
);
CREATE INDEX IF NOT EXISTS idx_members_site ON members(site, status, id);

-- 약관 · 개인정보 처리방침 (발행한 버전은 고치지 않는다)
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  doc_type     TEXT NOT NULL,          -- TERMS | PRIVACY
  version      INTEGER NOT NULL,
  content      TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  UNIQUE (site, doc_type, version)
);
CREATE TABLE IF NOT EXISTS member_agreements (
  member_id   INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  agreed_at   INTEGER NOT NULL,
  PRIMARY KEY (member_id, document_id)
);

-- 게시판 (권한 = 등급 1~9 비트 묶음: 등급 k → 비트 k-1, 511 = 전부)
CREATE TABLE IF NOT EXISTS boards (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  site              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,
  list_layout       TEXT NOT NULL DEFAULT 'TABLE',   -- TABLE | CARD | BLOG
  list_levels       INTEGER NOT NULL DEFAULT 511,
  read_levels       INTEGER NOT NULL DEFAULT 511,
  write_levels      INTEGER NOT NULL DEFAULT 1,
  comment_levels    INTEGER NOT NULL DEFAULT 511,
  allow_guest_list  INTEGER NOT NULL DEFAULT 1,
  allow_guest_read  INTEGER NOT NULL DEFAULT 1,
  allow_guest_write INTEGER NOT NULL DEFAULT 0,
  guest_menu        INTEGER NOT NULL DEFAULT 1,      -- 비회원에게도 메뉴 보이기
  use_comment       INTEGER NOT NULL DEFAULT 1,
  use_secret        INTEGER NOT NULL DEFAULT 0,
  options           TEXT NOT NULL DEFAULT '{}',
  sort              INTEGER NOT NULL DEFAULT 0,
  visible           INTEGER NOT NULL DEFAULT 1,
  deleted_at        INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_site ON boards(site, deleted_at, sort);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  board_id     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  is_notice    INTEGER NOT NULL DEFAULT 0,
  is_secret    INTEGER NOT NULL DEFAULT 0,
  writer_id    INTEGER,                 -- 비회원 글은 NULL
  writer_name  TEXT NOT NULL DEFAULT '',
  view_count   INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,        -- 미래 = 예약 발행(그때까지 숨김)
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  is_hidden    INTEGER NOT NULL DEFAULT 0,   -- 관리자가 "글 관리" 로 숨긴 글 (관리자만 보임)
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board_id, deleted_at, is_notice, published_at);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site        TEXT NOT NULL,
  post_id     INTEGER NOT NULL,
  writer_id   INTEGER NOT NULL,
  writer_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);

-- 메뉴 (트리). menu_type = PAGE(사이트 안 주소) | BOARD | LINK(외부 주소)
CREATE TABLE IF NOT EXISTS menus (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  site             TEXT NOT NULL,
  parent_id        INTEGER,
  title            TEXT NOT NULL,
  menu_type        TEXT NOT NULL DEFAULT 'PAGE',
  path             TEXT NOT NULL DEFAULT '',
  board_id         INTEGER,
  sort             INTEGER NOT NULL DEFAULT 0,
  visible          INTEGER NOT NULL DEFAULT 1,
  read_levels      INTEGER,             -- NULL = 로그인한 회원 모두
  allow_guest_read INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_menus_site ON menus(site, parent_id, sort);

-- 로그인 세션. kind = keep(회원 · 관리자, 로그인 유지 — 90일, 들어올 때마다 늘어남) | member(유지 안 함 — 12시간, 브라우저 닫으면 끝) | staff(운영자가 xim 에서 대신 들어옴)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  member_id  INTEGER,
  kind       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- xim 의 "관리 화면 열기" 가 만드는 1회용 입장권 (1분)
CREATE TABLE IF NOT EXISTS staff_tickets (
  token      TEXT PRIMARY KEY,
  site       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 관리 로그 (지우지 않는다)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL,
  actor_kind TEXT NOT NULL,              -- admin | staff
  actor_name TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_site ON audit_log(site, id);

-- 아이디 단위가 아닌 IP 단위 무차별 대입 막기
CREATE TABLE IF NOT EXISTS login_fails (
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xms_login_fails ON login_fails(key, at);

-- 배포할 때(deploy.mjs) 사이트 헤더 메뉴를 xms 메뉴로 가져온 사이트 — 한 번만 가져오기 위한 표시
CREATE TABLE IF NOT EXISTS site_import (
  site        TEXT PRIMARY KEY,
  imported_at INTEGER NOT NULL
);

-- 검색엔진 · 카카오톡 미리보기 설정 (사이트마다 한 줄)
CREATE TABLE IF NOT EXISTS site_seo (
  site              TEXT PRIMARY KEY,
  title             TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  verify            TEXT NOT NULL DEFAULT '{}',   -- { naver, google, bing } 소유권 확인 값
  robots            TEXT NOT NULL DEFAULT '',     -- 비우면 기본 robots.txt
  share_description TEXT NOT NULL DEFAULT '',     -- 비우면 description
  adsense           TEXT NOT NULL DEFAULT '',     -- 구글 애드센스 게시자 ID (ca-pub-…) — 있으면 모든 페이지에 광고 코드 · /ads.txt
  updated_at        INTEGER NOT NULL DEFAULT 0
);

-- 파비콘(크기별) · 공유 그림. 작게 줄여 base64 로 둔다 (R2 를 붙이기 전까지)
CREATE TABLE IF NOT EXISTS site_files (
  site       TEXT NOT NULL,
  kind       TEXT NOT NULL,      -- favicon-32 | favicon-180 | favicon-192 | favicon-512 | og
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,      -- base64
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site, kind)
);

-- 팝업 (홈 화면). 그림은 site_files 의 popup-<id>
CREATE TABLE IF NOT EXISTS popups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL,
  title      TEXT NOT NULL,                 -- 관리용 이름 (방문자에게는 안 보임)
  body       TEXT NOT NULL DEFAULT '',
  link_url   TEXT NOT NULL DEFAULT '',
  starts_at  TEXT NOT NULL DEFAULT '',      -- YYYY-MM-DD (한국 날짜), 비면 바로
  ends_at    TEXT NOT NULL DEFAULT '',      -- YYYY-MM-DD 까지, 비면 끝없음
  status     TEXT NOT NULL DEFAULT 'OPEN',  -- WAITING | OPEN | CLOSED
  close_mode TEXT NOT NULL DEFAULT 'TODAY', -- TODAY | FOREVER | ALWAYS
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_popups_site ON popups(site, sort);

-- 올린 파일 (글 첨부 · 본문 사진 · PDF). R2 를 켜기 전까지는 data(base64) 에, 켜면 r2_key 에.
CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,               -- 추측할 수 없는 임의 값 (주소에 쓰인다)
  site       TEXT NOT NULL,
  post_id    INTEGER,                         -- 첨부로 붙은 글 (본문에만 쓰인 그림은 NULL 이어도 된다)
  kind       TEXT NOT NULL,                   -- IMAGE | FILE | INLINE (본문 안 그림 · PDF)
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       TEXT,
  r2_key     TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_post ON uploads(post_id, sort);
CREATE INDEX IF NOT EXISTS idx_uploads_site ON uploads(site);

-- 2026-11-03 간단입력(카드) 글의 구조 — 한 번만 실행:  ALTER TABLE posts ADD COLUMN blocks TEXT;
--   { order: 'media' | 'text', cards: [{ sub, text, photos: ['/xms/upload/…'], video: '<YouTube id>' }] }

-- 회원가입 이메일 인증 (6자리 번호 → 가입표)
CREATE TABLE IF NOT EXISTS signup_codes (
  site         TEXT NOT NULL,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL DEFAULT '',
  expires_at   INTEGER NOT NULL DEFAULT 0,
  tries        INTEGER NOT NULL DEFAULT 0,
  sent_at      INTEGER NOT NULL DEFAULT 0,
  ticket       TEXT NOT NULL DEFAULT '',
  ticket_until INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site, email)
);

-- 방문 통계 (2026-11-04) — 하루 단위로 모아 둔다, 최근 1년(366일)만 남기고 지운다. 날짜는 한국 시간 'YYYY-MM-DD'
--   방문자 = 그날 처음 온 브라우저(쿠키 xms_v), 페이지뷰 = html 페이지를 연 횟수. 검색엔진 로봇 · 미리 불러오기는 세지 않는다
CREATE TABLE IF NOT EXISTS visit_days (
  site     TEXT NOT NULL,
  day      TEXT NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  mobile   INTEGER NOT NULL DEFAULT 0,      -- 방문자 중 폰 · 태블릿
  PRIMARY KEY (site, day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_pages (
  site  TEXT NOT NULL,
  day   TEXT NOT NULL,
  path  TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site, day, path)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS visit_refs (   -- 방문자가 들어온 곳 (다른 사이트 주소의 호스트, 바로 들어오면 '')
  site     TEXT NOT NULL,
  day      TEXT NOT NULL,
  ref      TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (site, day, ref)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_visit_days_day ON visit_days(day);
CREATE INDEX IF NOT EXISTS idx_visit_pages_day ON visit_pages(day);
CREATE INDEX IF NOT EXISTS idx_visit_refs_day ON visit_refs(day);
CREATE TABLE IF NOT EXISTS visit_searches ( -- 검색엔진에서 들어온 기록 한 번에 한 줄 (2026-11-09): 어떤 검색엔진 · 어떤 검색어(안 넘겨 주면 '') · 어느 페이지로
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  site    TEXT NOT NULL,
  day     TEXT NOT NULL,
  at      INTEGER NOT NULL,                 -- ms
  engine  TEXT NOT NULL,                    -- 네이버 · 다음 · 구글 …
  keyword TEXT NOT NULL DEFAULT '',
  path    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_searches_site ON visit_searches(site, day, at);

-- 수정 모드(홈페이지 위에서 글자 고치기): 원래 글자의 지문(k)마다 고친 글자 조각들. path '*' = 머리 · 꼬리(모든 페이지 공통)
CREATE TABLE IF NOT EXISTS page_texts (
  site       TEXT NOT NULL,
  path       TEXT NOT NULL,
  k          TEXT NOT NULL,
  t          TEXT NOT NULL,      -- JSON 배열: 그 요소 안 글자 조각(text node)들 차례대로
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site, path, k)
);

-- 사이트별로 켜는 기능 (예: courses = 강의 관리). 켠 사이트만 관리 화면에 메뉴가 생긴다.
CREATE TABLE IF NOT EXISTS site_features (
  site    TEXT NOT NULL,
  feature TEXT NOT NULL,
  PRIMARY KEY (site, feature)
);

-- 강의: 강의 → 섹션 → 차시(영상). 볼 수 있는 등급(view_levels 비트)이 아니어도 '맛보기' 차시는 누구나.
CREATE TABLE IF NOT EXISTS courses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  no_label     TEXT NOT NULL DEFAULT '',     -- 썸네일 큰 글자 (예: Build 2)
  track        TEXT NOT NULL DEFAULT '',     -- 분야 (목록 탭: Sound · Build · 실전 …)
  level        TEXT NOT NULL DEFAULT '',     -- 수준 (입문 · 기초 · 중급 …)
  thumb        TEXT NOT NULL DEFAULT 'red',  -- 썸네일 색: red · black · split
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  who          TEXT NOT NULL DEFAULT '[]',   -- 이런 분께 (JSON 배열)
  learn        TEXT NOT NULL DEFAULT '[]',   -- 배우는 것 (JSON 배열)
  view_levels  INTEGER NOT NULL DEFAULT 255, -- 강의를 볼 수 있는 등급 (기본 1~8등급, 9 일반회원은 맛보기만)
  visible      INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0,
  opened_on    TEXT NOT NULL DEFAULT '',     -- 등록일 (최근순 정렬, YYYY-MM-DD)
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_courses_site ON courses (site, deleted_at, sort);
CREATE TABLE IF NOT EXISTS course_sections (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  site      TEXT NOT NULL,
  course_id INTEGER NOT NULL,
  title     TEXT NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_csec_course ON course_sections (course_id, sort);
CREATE TABLE IF NOT EXISTS course_lessons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site         TEXT NOT NULL,
  course_id    INTEGER NOT NULL,
  section_id   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  video_url    TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NOT NULL DEFAULT 0,
  is_free      INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_clesson_course ON course_lessons (course_id, sort);
-- 수강 기록: 다 본 차시 · 마지막으로 연 차시 · 공부한 날(연속 학습) · 노트
CREATE TABLE IF NOT EXISTS course_done (
  site      TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (site, member_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS course_last (
  site      TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (site, member_id, course_id)
);
CREATE TABLE IF NOT EXISTS course_days (
  site      TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  day       TEXT NOT NULL,
  PRIMARY KEY (site, member_id, day)
);
CREATE TABLE IF NOT EXISTS course_notes (
  site       TEXT NOT NULL,
  member_id  INTEGER NOT NULL,
  lesson_id  INTEGER NOT NULL,
  body       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site, member_id, lesson_id)
);

-- 사이트별 작은 설정 (JSON 값). 예: top_button = {"on":true,"except":["/app"]}  (맨 위로 버튼, 뺄 주소)
CREATE TABLE IF NOT EXISTS site_options (
  site       TEXT NOT NULL,
  k          TEXT NOT NULL,
  v          TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site, k)
);

-- 2026-11-11 신청서 (사이트 기능 'apply' — apply.js). 지금은 장학금 신청서 하나 (sjccc)
--   신청 기간(회차): 시작일 ~ 마감일(한국 날짜, 그날 끝까지). 회원 한 명이 회차마다 신청서 하나 — 기간 안에는 고칠 수 있다.
CREATE TABLE IF NOT EXISTS apply_rounds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL,
  title      TEXT NOT NULL,
  starts_on  TEXT NOT NULL,                  -- YYYY-MM-DD
  ends_on    TEXT NOT NULL,                  -- YYYY-MM-DD (이날까지)
  notice     TEXT NOT NULL DEFAULT '',       -- 첫 단계 '꼭 읽어 주세요' (비우면 기본 안내)
  visible    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_apply_rounds_site ON apply_rounds(site, starts_on);
CREATE TABLE IF NOT EXISTS applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT NOT NULL,
  round_id   INTEGER NOT NULL,
  member_id  INTEGER NOT NULL,
  answers    TEXT NOT NULL,                  -- { 항목: 값 } (apply.js FORM)
  files      TEXT NOT NULL,                  -- { 서류: [upload id…] } — uploads.kind 'APPLY', post_id = -1000000000 − 신청서 번호
  status     TEXT NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED 접수 | CHECKED 서류 확인 | SELECTED 선정 | REJECTED 미선정
  memo       TEXT NOT NULL DEFAULT '',       -- 관리자 메모 (신청자에게 안 보임)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (round_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_round ON applications(site, round_id, created_at);
-- 2026-11-11 신청서 임시 저장 — 적는 대로 서버에 (인터넷이 끊기거나 다른 기기에서도 이어서 쓰게). 내면 지운다.
CREATE TABLE IF NOT EXISTS apply_drafts (
  site       TEXT NOT NULL,
  round_id   INTEGER NOT NULL,
  member_id  INTEGER NOT NULL,
  data       TEXT NOT NULL,                  -- { answers, files: { 서류: [upload id…] }, agree, step }
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site, round_id, member_id)
);
