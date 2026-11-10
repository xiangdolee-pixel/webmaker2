-- 라스트샷 (D1 lastshot). 한 번만:  node deploy.mjs --wrangler d1 execute lastshot --remote --file lastshot/_worker/schema.sql
--   예전 표(scores)에 열 더하기(이미 있으면 오류 나므로 한 번만):
--   node deploy.mjs --wrangler d1 execute lastshot --remote --command "\"ALTER TABLE scores ADD COLUMN diff TEXT NOT NULL DEFAULT 'normal'\""
--   node deploy.mjs --wrangler d1 execute lastshot --remote --command "\"ALTER TABLE scores ADD COLUMN user_id INTEGER\""

-- 계정: 아이디 또는 이메일(소문자) · 닉네임 · 비밀번호(PBKDF2-SHA256 100,000회 + salt 16바이트) · 진행(레벨 · 최고 레벨 · 난이도)
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id   TEXT NOT NULL UNIQUE,
  nickname   TEXT NOT NULL,
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  best       INTEGER NOT NULL DEFAULT 1,
  diff       TEXT NOT NULL DEFAULT 'normal',
  run        INTEGER NOT NULL DEFAULT 0,     -- 레벨 사이 누적 점수(쓰러질 때까지)
  fail_lv    INTEGER NOT NULL DEFAULT 0,     -- 같은 레벨에서 연속으로 진 횟수(지원군) — 어느 레벨에서
  fails      INTEGER NOT NULL DEFAULT 0,
  state      TEXT,                           -- 판 중간 스냅샷 JSON(100KB 상한) — 나갔다 와도 그 자리에서 이어하기
  created_at INTEGER NOT NULL,
  last_at    INTEGER NOT NULL
);
--   예전 users 표에 열 더하기: ALTER TABLE users ADD COLUMN run INTEGER NOT NULL DEFAULT 0; … fail_lv · fails 같은 꼴; ALTER TABLE users ADD COLUMN state TEXT
-- 로그인 세션: 쿠키 ls_sess 의 토큰(32바이트 hex), 180일
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
-- 로그인 실패(같은 IP 1분 10회 제한용)
CREATE TABLE IF NOT EXISTS login_fails (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_fails ON login_fails(ip, at);
-- 랭킹: 난이도(diff: easy · normal · hard)마다 상위 50. user_id 는 계정(예전 익명 기록은 NULL)
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  diff       TEXT NOT NULL DEFAULT 'normal',
  user_id    INTEGER,
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores(score DESC, id);
CREATE INDEX IF NOT EXISTS idx_scores_diff ON scores(diff, score DESC, id);
