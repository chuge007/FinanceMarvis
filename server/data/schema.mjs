/**
 * 历史库表结构。四张主表：
 *   series / point       原始序列（可回溯、可算分位）
 *   snapshot             TTL 快照（聚合结果、外部 JSON blob）
 *   source_health        源健康度（重启不丢，档案页可见）
 *   ingest_log           抓取日志（谁在什么时候写了多少点）
 */
export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  symbol TEXT NOT NULL,
  label TEXT,
  market TEXT,
  freq TEXT,
  unit TEXT,
  caliber TEXT,
  first_ts INTEGER,
  last_ts INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS point (
  series_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  value REAL,
  extra TEXT,
  PRIMARY KEY (series_id, ts)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_point_ts ON point (series_id, ts DESC);

CREATE TABLE IF NOT EXISTS snapshot (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  as_of INTEGER,
  ttl INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS source_health (
  source_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  latency_ms INTEGER,
  error TEXT,
  checked_at INTEGER,
  cooldown_until INTEGER
);

CREATE TABLE IF NOT EXISTS ingest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  dataset TEXT,
  points INTEGER,
  ok INTEGER,
  error TEXT,
  at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ingest_at ON ingest_log (at DESC);
`
