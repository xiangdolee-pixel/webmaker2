-- 라스트샷 랭킹 (D1 lastshot). 한 번만:  node deploy.mjs --wrangler d1 execute lastshot --remote --file lastshot/_worker/schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  ip         TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores(score DESC, id);
