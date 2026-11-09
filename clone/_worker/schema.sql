-- clone — 내 목소리 읽어주기 (D1 `clone`)
--   jobs: 읽어 달라는 요청 하나 = 한 줄. 상태 queued(대기) → running(PC 가 생성 중) → done(완료, R2 audio/<id>.wav) / failed(실패)
--   agent: PC 처리기(agent.py)가 마지막으로 다녀간 시각 — 화면의 "PC 연결됨" 표시
CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  done_at    INTEGER,
  status     TEXT NOT NULL DEFAULT 'queued',
  title      TEXT NOT NULL DEFAULT '',
  text       TEXT NOT NULL,
  chars      INTEGER NOT NULL DEFAULT 0,
  speed      REAL NOT NULL DEFAULT 1.0,
  seconds    REAL,                 -- 결과 길이(초)
  lufs       REAL,                 -- 결과 통합 음량
  lra        REAL,                 -- 음량 변동폭
  tp         REAL,                 -- 트루피크(dBTP)
  sentences  INTEGER,              -- 문장 수
  engine     TEXT,                 -- 어떤 모델로 만들었나(예: gsv-v2Pro me_e8)
  error      TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
CREATE TABLE IF NOT EXISTS agent (
  id      TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL,
  info    TEXT NOT NULL DEFAULT ''
);
