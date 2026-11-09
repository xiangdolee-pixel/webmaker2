-- xim D1 스키마. 적용: node xim/_worker/db.mjs (원격 xim DB 에 그대로 실행)
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS 만 쓴다.

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,              -- 업체(고객) 이름
  contact     TEXT NOT NULL DEFAULT '',   -- 담당자
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  memo        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,       -- WebMaker2 폴더 이름 = Worker 이름
  name        TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  domain      TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',  -- active | suspended
  quota_mb    INTEGER NOT NULL DEFAULT 500,
  used_mb     REAL NOT NULL DEFAULT 0,
  memo        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

-- 각 업체 사이트의 관리자 계정 (사이트 주소/admin 에서 로그인)
CREATE TABLE IF NOT EXISTS site_admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  pw_hash     TEXT NOT NULL,
  pw_salt     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (site_id, username)
);

-- 수정(유지보수) 요청
CREATE TABLE IF NOT EXISTS requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES site_admins(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',  -- new | doing | done
  reply       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_site ON requests(site_id, created_at);

-- 수정 요청에 주고받은 글 (업체 관리자 site ↔ 운영자 op). 파일은 그 사이트 xms 저장소에 있다.
CREATE TABLE IF NOT EXISTS request_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  side        TEXT NOT NULL,              -- site | op
  author      TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',   -- 글자 (줄바꿈 그대로)
  attachments TEXT NOT NULL DEFAULT '[]', -- [{ id, name, size, kind, mime }]
  status      TEXT NOT NULL DEFAULT '',   -- 이 글로 바뀐 상태 (없으면 '')
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_messages ON request_messages(request_id, id);

-- 보안 감시: 의심 요청 기록 (사이트 Worker 가 알린다, 2주 보관)
CREATE TABLE IF NOT EXISTS sec_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  site    TEXT NOT NULL DEFAULT '',
  ip      TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  method  TEXT NOT NULL DEFAULT '',
  path    TEXT NOT NULL DEFAULT '',
  ua      TEXT NOT NULL DEFAULT '',
  reason  TEXT NOT NULL,                -- attack(공격 주소) | 404(없는 주소)
  action  TEXT NOT NULL DEFAULT 'log'   -- log | block(이 요청으로 차단됨)
);
CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON sec_events(ip, reason, at);
CREATE INDEX IF NOT EXISTS idx_sec_events_at ON sec_events(at);
-- 막힌 IP (until 이 지나면 풀림. 기록은 남겨 다시 걸리면 7일)
CREATE TABLE IF NOT EXISTS sec_blocks (
  ip         TEXT PRIMARY KEY,
  reason     TEXT NOT NULL DEFAULT '',
  until      INTEGER NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  country    TEXT NOT NULL DEFAULT '',
  site       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  manual     INTEGER NOT NULL DEFAULT 0
);
-- 막지 않을 IP (운영자 사무실 등)
CREATE TABLE IF NOT EXISTS sec_allow (
  ip         TEXT PRIMARY KEY,
  memo       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 로그인 세션. kind = xim(운영자) | site(업체 관리자)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  site_id     INTEGER,
  admin_id    INTEGER,
  expires_at  INTEGER NOT NULL
);

-- 로그인 실패 기록(무차별 대입 막기)
CREATE TABLE IF NOT EXISTS login_fails (
  key         TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_fails ON login_fails(key, at);

-- xim 설정값 (구글 OTP 비밀키 등). key = totp_secret | totp_pending | totp_last
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);

-- OTP 를 한 번 넣은 브라우저는 24시간 동안 비밀번호만으로 로그인 (쿠키 xim_otp)
CREATE TABLE IF NOT EXISTS otp_trust (
  token       TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);

-- 2026-11-03 xms 로 업체 관리 화면을 옮기며 추가 (한 번만 실행됨 — 이미 있으면 오류가 나므로 따로 실행):
--   ALTER TABLE requests ADD COLUMN requester TEXT;
-- site_admins 표는 더 쓰지 않는다(업체 관리자 = xms 회원 등급 1). 기록용으로 남겨 둠.
--   ALTER TABLE sites ADD COLUMN static_mb REAL NOT NULL DEFAULT 0;   -- 배포한 홈페이지 파일 크기 (deploy.mjs 가 적는다)
--   ALTER TABLE sites ADD COLUMN mail_status TEXT NOT NULL DEFAULT '';  -- 대표 도메인 Email Sending 등록 결과 ok|added|error|skip
--   ALTER TABLE sites ADD COLUMN mail_note TEXT NOT NULL DEFAULT '';
--   ALTER TABLE sites ADD COLUMN turnstile_sitekey TEXT NOT NULL DEFAULT '';  -- 사이트별 봇 확인(Turnstile) 위젯 (xim 이 만든다)
--   ALTER TABLE sites ADD COLUMN turnstile_secret TEXT NOT NULL DEFAULT '';
--   ALTER TABLE sites ADD COLUMN bot_status TEXT NOT NULL DEFAULT '';  -- 봇 확인 위젯 만들기 결과 ok|added|error|skip
--   ALTER TABLE sites ADD COLUMN bot_note TEXT NOT NULL DEFAULT '';
--   ALTER TABLE requests ADD COLUMN attachments TEXT;   -- 수정 요청 첨부 [{ id, name, size, kind }] (파일은 그 사이트 xms 업로드)
--   ALTER TABLE requests ADD COLUMN site_seen_at INTEGER NOT NULL DEFAULT 0;  -- 업체 관리자가 마지막으로 본 때 (운영자 새 글 표시)
--   ALTER TABLE sites ADD COLUMN portfolio INTEGER NOT NULL DEFAULT 0;  -- 1 이면 포트폴리오(portfolio.plators.com)에 나온다 (xim 사이트 줄의 스위치)
--   ALTER TABLE requests ADD COLUMN op_seen_at INTEGER NOT NULL DEFAULT 0;    -- 운영자가 마지막으로 본 때 (업체 새 글 표시)

-- 관리 로그: 운영자가 xim 에서 한 일 (2026-11-04, 1개월 보관 — xms audit_log 와 같은 방식)
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(created_at);

-- 2026-11-04 사이트가 원래 쓰는 파비콘 주소(배포할 때 index.html 에서 읽음, xim 카드에 표시 — xms 에서 올린 파비콘이 먼저). 한 번만:
--   ALTER TABLE sites ADD COLUMN site_favicon TEXT NOT NULL DEFAULT '';

-- 2026-11-08 포트폴리오2: xim 에서 만들지 않은 사이트를 주소로 넣어 포트폴리오에 함께 보이기
--   넣을 때 그 페이지의 카톡 미리보기(og:title · og:description · og:image)를 읽어 채운다. xim 사이트 다음 차례로 나온다.
CREATE TABLE IF NOT EXISTS portfolio_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '홈페이지',
  shown       INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
--   ALTER TABLE sites ADD COLUMN portfolio_tag TEXT NOT NULL DEFAULT '';  -- 포트폴리오 분류(홈페이지 · 웹서비스 · 웹앱 · 웹게임), 사이트 수정 창에서

-- ───────── 스튜디오 (유튜브 발표자료 제작, 2026-11-09) ─────────
-- 작업 하나 = 발표자료 한 회차 (본편 main · 폰UI 쇼츠 phone · 썸네일만 thumb)
CREATE TABLE IF NOT EXISTS studio_jobs (
  id            TEXT PRIMARY KEY,                  -- 20자리 hex (주소에 쓰이므로 추측 불가)
  kind          TEXT NOT NULL,                     -- main | phone | thumb
  channel       TEXT NOT NULL DEFAULT '사섬',       -- 사섬 | 순섬 (썸네일 스타일 · 인사말)
  source        TEXT NOT NULL DEFAULT 'rss',       -- rss(웹 뉴스) | capture(캡쳐 올림) | text(글 직접)
  options       TEXT NOT NULL DEFAULT '{}',        -- { pick:'auto'|'manual', thumb:'auto'|'manual', engine:'api'|'pc', ... }
  status        TEXT NOT NULL DEFAULT 'queued',    -- queued | running | pick(6개 고르기 대기) | thumb(썸네일 선택 대기) | done | failed | stopped
  step          TEXT NOT NULL DEFAULT '',          -- 지금 도는 단계 이름
  title         TEXT NOT NULL DEFAULT '',          -- 목록에 보일 제목 (요약 패키지 1번 제목)
  error         TEXT NOT NULL DEFAULT '',
  wf_id         TEXT NOT NULL DEFAULT '',          -- Cloudflare Workflow 인스턴스
  cost          REAL NOT NULL DEFAULT 0,           -- 누적 비용(달러, 대략)
  assets_purged INTEGER NOT NULL DEFAULT 0,        -- 1 = 보관 규칙(최근 10개)으로 그림을 지움
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_studio_jobs_created ON studio_jobs(created_at);

CREATE TABLE IF NOT EXISTS studio_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES studio_jobs(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,                       -- rss · top15 · pick · articles · factcheck · summary · slides · review · thumb · ...
  status      TEXT NOT NULL DEFAULT 'running',     -- running | done | failed | skipped
  note        TEXT NOT NULL DEFAULT '',
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost        REAL NOT NULL DEFAULT 0,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_studio_steps_job ON studio_steps(job_id, id);

-- 글 산출물 (버전이 쌓인다 — 웹에서 고쳐 저장할 때마다 +1). 최신 = 같은 kind 중 version 최대
CREATE TABLE IF NOT EXISTS studio_docs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES studio_jobs(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                       -- candidates · top15 · articles · factcheck · summary · show_texts · phone_job · script
  version     INTEGER NOT NULL DEFAULT 1,
  body        TEXT NOT NULL,                       -- 글 또는 JSON
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_docs ON studio_docs(job_id, kind, version);

-- 그림 · 파일 (R2 xms-files 의 studio/<job>/… , 최근 10개 작업 분만 보관)
CREATE TABLE IF NOT EXISTS studio_assets (
  id          TEXT PRIMARY KEY,                    -- 24자리 hex (공개 주소 /studio/a/<id>)
  job_id      TEXT NOT NULL DEFAULT '',            -- '' = 아직 작업에 안 붙은 업로드
  kind        TEXT NOT NULL,                       -- slide · thumb · capture · face_upload · phone_cut
  idx         INTEGER NOT NULL DEFAULT 0,          -- 슬라이드 번호(1~) 등
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'image/webp',
  size        INTEGER NOT NULL DEFAULT 0,
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}',          -- { prompt, model, review, ... }
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_studio_assets_job ON studio_assets(job_id, kind, idx);

-- 스튜디오 설정 (스타일 프리셋 규칙 · 모델 이름 · 하루 한도 등)
CREATE TABLE IF NOT EXISTS studio_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
