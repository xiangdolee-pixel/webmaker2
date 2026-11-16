-- 감사노트365 D1 (gamsa365). 회원 = xms 회원 이메일로 이어 붙인다.
--   node deploy.mjs --wrangler d1 execute gamsa365 --remote --file gamsa365/_worker/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nick TEXT NOT NULL DEFAULT '',
  goal INTEGER NOT NULL DEFAULT 3,            -- 하루 목표 3 · 5 · 10
  remind_on INTEGER NOT NULL DEFAULT 1,
  remind_time TEXT NOT NULL DEFAULT '21:30',  -- 한국 시간 HH:MM
  last_remind_day TEXT NOT NULL DEFAULT '',
  share_default INTEGER NOT NULL DEFAULT 0,   -- 새 감사를 나눔에 올릴지 기본값
  seen_hearts_at INTEGER NOT NULL DEFAULT 0,  -- 받은 빛 알림을 마지막으로 본 때(ms)
  helps INTEGER NOT NULL DEFAULT 1,           -- 감사꺼리 찾기 도움 질문 (끄면 그냥 생각해서 쓴다)
  onboarded INTEGER NOT NULL DEFAULT 0,       -- 처음 질문(하루 몇 개 · 도움 질문)에 답했는지
  pray INTEGER NOT NULL DEFAULT 1,            -- 한 줄 기도 칸 보이기
  avatar TEXT NOT NULL DEFAULT '',            -- xms 프로필 사진 주소 (나눔에 이름을 쓴 사람만 보인다)
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 하루 = 마음 날씨 하나
CREATE TABLE IF NOT EXISTS days (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,              -- YYYY-MM-DD (한국 시간)
  mood INTEGER NOT NULL DEFAULT 0, -- 0 안 고름 · 1 비 ~ 5 햇살
  prayer TEXT NOT NULL DEFAULT '', -- 한 줄 기도 (나만 본다, 나눔에 안 올라감)
  PRIMARY KEY (user_id, day)
);

-- 감사 한 줄
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  pos INTEGER NOT NULL,
  text TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,   -- 신고 3번 · 관리자가 숨김
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (user_id, day, pos)
);
CREATE INDEX IF NOT EXISTS entries_feed ON entries (shared, hidden, id DESC);

-- 빛 보내기 (나도 감사해요)
CREATE TABLE IF NOT EXISTS hearts (
  entry_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (entry_id, user_id)
);
CREATE INDEX IF NOT EXISTS hearts_owner ON hearts (owner_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  entry_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (entry_id, user_id)
);

-- 알림 받을 기기 (Web Push)
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS push_user ON push_subs (user_id);
