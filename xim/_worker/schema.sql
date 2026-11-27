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
--   ALTER TABLE leads ADD COLUMN consent INTEGER NOT NULL DEFAULT 0;     -- 상담연락 문자 (2026-11-27)
--   ALTER TABLE leads ADD COLUMN consent_note TEXT NOT NULL DEFAULT '';
--   ALTER TABLE leads ADD COLUMN consent_at INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE leads ADD COLUMN sent_at INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE leads ADD COLUMN sent_n INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE leads ADD COLUMN call TEXT NOT NULL DEFAULT '';          -- 전화 통화 표시 (2026-11-28)
--   ALTER TABLE leads ADD COLUMN call_at INTEGER NOT NULL DEFAULT 0;

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
--   ALTER TABLE sites ADD COLUMN host_start TEXT NOT NULL DEFAULT '';    -- 호스팅 시작일 'YYYY-MM-DD' (2026-11-21) — 종료일은 넣지 않으면 1년 뒤
--   ALTER TABLE sites ADD COLUMN host_end TEXT NOT NULL DEFAULT '';
--   ALTER TABLE sites ADD COLUMN domain_cost INTEGER NOT NULL DEFAULT 0; -- 도메인 비용(원 · 1년)
--   ALTER TABLE sites ADD COLUMN domain_start TEXT NOT NULL DEFAULT '';  -- 도메인 시작일 — 만료일은 넣지 않으면 1년 뒤
--   ALTER TABLE sites ADD COLUMN domain_end TEXT NOT NULL DEFAULT '';
--   ALTER TABLE sites ADD COLUMN domain_registrar TEXT NOT NULL DEFAULT '';  -- 도메인 구입처(가비아 · 후이즈 …)
--   ALTER TABLE sites ADD COLUMN pay_account TEXT NOT NULL DEFAULT '';       -- 고객에게 안내한 입금계좌(목록은 settings.pay_accounts — JSON 배열, 첫 번째가 기본)
--   ALTER TABLE sites ADD COLUMN domain_account TEXT NOT NULL DEFAULT '';    -- 누구 계정으로 샀는지(운영자 · 고객 · 아이디)
--   ALTER TABLE sites ADD COLUMN portfolio_tag TEXT NOT NULL DEFAULT '';  -- 포트폴리오 분류(홈페이지 · 솔루션개발 · 웹앱 · 웹게임), 사이트 수정 창에서

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

-- 제작문의 (2026-11-12): 포트폴리오 사이트의 '제작문의' 폼 → xim '제작문의' 메뉴. read_at = 운영자가 열어 본 때(0 이면 새 문의)
-- BookKeeping(2026-11-21): 달마다 매입(buy) · 매출(sell) 한 줄씩. month = day 의 앞 7자('YYYY-MM')
CREATE TABLE IF NOT EXISTS jest_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  month      TEXT NOT NULL,
  side       TEXT NOT NULL,               -- buy | sell
  day        TEXT NOT NULL,               -- 'YYYY-MM-DD'
  item       TEXT NOT NULL,
  amount     INTEGER NOT NULL,            -- 원
  account    TEXT NOT NULL DEFAULT '',    -- 매출: 들어온 계좌(개인 · 기업 · 직접 적은 글) / 매입: 결제 수단
  customer_id INTEGER,                    -- 매출만: 고객(customers.id)
  payer      TEXT NOT NULL DEFAULT '',    -- 매출만: 입금자명
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jest_month ON jest_entries(month, day);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  org TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  read_at INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries (created_at);
-- 2026-11-13: 여기엔 portfolio(운영자 제작문의)만. 고객 사이트 문의는 xms DB site_inquiries (사이트끼리 섞이지 않게)
-- 2026-11-12: 업체(xms '문의' 메뉴)가 열어 본 때 — 한 번만 실행해 둠: ALTER TABLE inquiries ADD COLUMN site_read_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS inquiries_site ON inquiries (site, created_at);

-- 홈페이지 제작 계약서 (2026-11-12): xim '계약서' 메뉴에서 만들고, 갑은 sign.plators.com/<code> 에서 직접 서명
--   status: wait(서명 대기) · signed(서명 완료 — 그 뒤로 고칠 수 없음). 을 정보 · 사인 그림은 settings.contract_eul, 서명 때 eul_snapshot 으로 굳힌다
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 주소 5자 (대소문자 · 숫자)
  client_name TEXT NOT NULL,                 -- 갑 대표자명 (업체명 칸이 생기기 전에는 '업체 또는 대표자 이름')
  client_company TEXT NOT NULL DEFAULT '',   -- 갑 업체명 (2026-11-22 ALTER TABLE contracts ADD COLUMN client_company TEXT NOT NULL DEFAULT ''). 을 업체명은 settings.contract_eul.company
  client_phone TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',     -- 갑 이메일 (2026-11-19 ALTER TABLE contracts ADD COLUMN client_email TEXT NOT NULL DEFAULT ''). 을 이메일은 코드에 고정
  build_fee INTEGER NOT NULL DEFAULT 0,      -- 제작비(원)
  yearly_fee INTEGER NOT NULL DEFAULT 0,     -- 호스팅 · 유지보수 관리비(원) — hosting_years 년치
  build_vat INTEGER NOT NULL DEFAULT 0,      -- 제작비 VAT 표시: 0 없음 · 1 포함 · 2 별도 (2026-11-19 ALTER TABLE contracts ADD COLUMN build_vat INTEGER NOT NULL DEFAULT 0)
  hosting_vat INTEGER NOT NULL DEFAULT 0,    -- 관리비 VAT 표시 (2026-11-19 ALTER TABLE contracts ADD COLUMN hosting_vat INTEGER NOT NULL DEFAULT 0)
  hosting_years INTEGER NOT NULL DEFAULT 1,  -- 호스팅 · 유지보수 기간(년) (2026-11-19 ALTER TABLE contracts ADD COLUMN hosting_years INTEGER NOT NULL DEFAULT 1)
  hosting TEXT NOT NULL DEFAULT '1GB',       -- 호스팅 저장 용량 (2026-11-13 ALTER TABLE contracts ADD COLUMN hosting TEXT NOT NULL DEFAULT '1GB')
  contract_date TEXT NOT NULL DEFAULT '',    -- YYYY-MM-DD
  body TEXT NOT NULL,                        -- 계약서 글자 ({갑} {을} {제작비} {연간비} 자리 표시)
  status TEXT NOT NULL DEFAULT 'wait',
  viewed_at INTEGER NOT NULL DEFAULT 0,      -- 갑이 처음 열어 본 때
  client_sign TEXT NOT NULL DEFAULT '',      -- 갑 서명 그림(data URL)
  signed_at INTEGER NOT NULL DEFAULT 0,
  signed_ip TEXT NOT NULL DEFAULT '',
  signed_ua TEXT NOT NULL DEFAULT '',
  doc_hash TEXT NOT NULL DEFAULT '',         -- 서명 때 내용 지문(sha256)
  eul_snapshot TEXT NOT NULL DEFAULT '',
  mail_count INTEGER NOT NULL DEFAULT 0,     -- 서명본 PDF 를 갑 이메일로 보낸 횟수 (2026-11-19 ALTER TABLE contracts ADD COLUMN mail_count INTEGER NOT NULL DEFAULT 0)
  mailed_at INTEGER NOT NULL DEFAULT 0,      -- 마지막으로 보낸 때 (2026-11-19 ALTER TABLE contracts ADD COLUMN mailed_at INTEGER NOT NULL DEFAULT 0)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2026-11-18 테스트모드 (xms test.js) — 한 번만 실행:
--   ALTER TABLE sites ADD COLUMN test_mode INTEGER NOT NULL DEFAULT 0;  -- 1 이면 그 사이트 로그인 화면에 '테스트모드로 둘러보기' (xim 사이트 줄의 스위치)

-- 2026-11-24 봇 차단 (site-worker botGuard) — 한 번만 실행:
--   ALTER TABLE sites ADD COLUMN no_bots INTEGER NOT NULL DEFAULT 0;  -- 1 이면 검색엔진 · AI · 수집 봇을 모두 막는다 (xim 사이트 줄의 스위치)

-- J-Docs (2026-11-20): xim 'J-Docs' 메뉴 — 견적서 · 거래명세서 · 청구서 · 공문. 코드 _worker/jdocs.js
--   문서 내용은 data(JSON) 한 칸, 목록 · 검색용 값만 따로 둔다. slug = 고객에게 보내는 주소 6자(/d/<slug>)
CREATE TABLE IF NOT EXISTS jd_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no TEXT NOT NULL UNIQUE,                   -- 문서번호 YYYY-MMDD-NNN (날짜별 순번)
  type TEXT NOT NULL,                        -- quote · statement · invoice · letter
  title TEXT,
  client TEXT,                               -- 수신
  doc_date TEXT,
  amount INTEGER DEFAULT 0,
  vat TEXT,
  search TEXT,                               -- 검색용 글자 모음(소문자)
  data TEXT NOT NULL,
  parent_id INTEGER,                         -- 견적서 → 거래명세서 · 청구서로 바꿔 만든 원본
  deleted INTEGER DEFAULT 0,                 -- 1 = 휴지통
  version INTEGER DEFAULT 1,                 -- 저장할 때마다 +1 (다른 창에서 먼저 고쳤는지 확인)
  slug TEXT UNIQUE,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS jd_docs_date ON jd_docs(deleted, doc_date DESC);
CREATE TABLE IF NOT EXISTS jd_counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jd_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER);   -- k = 'main': 회사 정보(주소 없음) · 기본값 · 항목 창고
CREATE TABLE IF NOT EXISTS jd_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT, data TEXT NOT NULL, sort INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS jd_clients (name TEXT PRIMARY KEY, recipient TEXT, aliases TEXT, ref TEXT, tel TEXT, memo TEXT, created_at INTEGER, updated_at INTEGER);

-- 상담연락 (2026-11-26): 지도에 나온 업체 한 줄씩 — 그 업체의 홈페이지 · 블로그 · 인스타그램과, 거기 공개된 휴대폰 번호(없으면 phone = '')
--   source = 번호가 나온 곳(map 지도 업체 정보 | place | homepage | blog | instagram | manual),  checked = 그 업체에서 무엇을 확인했나,  done = 연락함
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL DEFAULT '',      -- 무엇을 찾다 모았나 (예: 상담)
  area TEXT NOT NULL DEFAULT '',         -- 어느 영역(lead_scopes.area)
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tel TEXT NOT NULL DEFAULT '',          -- 지도에 적힌 대표 전화
  phone TEXT NOT NULL DEFAULT '',        -- 휴대폰 010-0000-0000 (없으면 빈칸)
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',   -- 번호가 적혀 있던 주소
  place_url TEXT NOT NULL DEFAULT '',
  homepage TEXT NOT NULL DEFAULT '',
  blog TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '',        -- 그 밖의 링크(띄어쓰기로 나눔)
  checked TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  consent INTEGER NOT NULL DEFAULT 0,     -- 문자 수신 동의(정보통신망법 제50조) — 동의한 곳에만 문자가 나간다
  consent_note TEXT NOT NULL DEFAULT '',  -- 어떻게 받았나(예: 11/28 통화)
  consent_at INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL DEFAULT 0,     -- 마지막으로 문자 보낸 때
  sent_n INTEGER NOT NULL DEFAULT 0,
  call TEXT NOT NULL DEFAULT '',         -- 전화 통화: '' 안 함 · ok 통화함 · miss 부재중 · no 거절
  call_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone ON leads (phone) WHERE phone != '';
-- 어디까지 알아봤나: 영역마다 한 줄(어느 목록 · 몇 곳 · 무엇을 확인했는지)
-- 상담연락 통화 표시를 바꾼 기록(통화 · 동의받음 / 거절 / 부재중 — 날짜 · 시간)
CREATE TABLE IF NOT EXISTS lead_call_log (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL, call TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lead_call_log_lead ON lead_call_log (lead_id);
-- 상담연락 문자 보낸 기록(네이버 클라우드 SENS)
CREATE TABLE IF NOT EXISTS lead_sms_log (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL, phone TEXT NOT NULL, type TEXT NOT NULL, ad INTEGER NOT NULL DEFAULT 1, content TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, request_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lead_sms_log_lead ON lead_sms_log (lead_id);
CREATE TABLE IF NOT EXISTS lead_scopes (area TEXT PRIMARY KEY, keyword TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, checked_at INTEGER NOT NULL);
