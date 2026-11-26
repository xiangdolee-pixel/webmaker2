-- 머스트 D1 (must). 회원 = xms 회원 이메일로 이어 붙인다.
--   node deploy.mjs --wrangler d1 execute must --remote --file must/_worker/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 매일 반드시 할 일
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  alarm TEXT NOT NULL DEFAULT '',          -- 알림 시간 HH:MM (한국 시간), '' = 알림 없음
  since TEXT NOT NULL,                     -- 만든 날 YYYY-MM-DD
  until TEXT NOT NULL DEFAULT '',          -- 지운 날 (기록이 있어 남겨 둔 항목)
  archived INTEGER NOT NULL DEFAULT 0,
  last_push_day TEXT NOT NULL DEFAULT ''   -- 마지막으로 알림을 보낸 날
);
CREATE INDEX IF NOT EXISTS items_user ON items (user_id, archived);
CREATE INDEX IF NOT EXISTS items_alarm ON items (alarm, archived);

-- 한 날 = 그 항목을 한 날
CREATE TABLE IF NOT EXISTS checks (
  item_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,                       -- YYYY-MM-DD (한국 시간)
  at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (item_id, day)
);
CREATE INDEX IF NOT EXISTS checks_user ON checks (user_id, day);

-- 알림 받을 기기 (Web Push)
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS push_user ON push_subs (user_id);
