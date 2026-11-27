/**
 * 云端存储：默认 SQLite（零依赖，可直接跑），生产可切 PostgreSQL。
 *
 * 切换方式：设置 DATABASE_URL 且安装 pg 后，createCloudDb 会优先走 PG。
 * 两种后端共用同一套 SQL（占位符统一用 ?，PG 适配器在 run/all 内转换）。
 */
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  blob TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,
  as_of TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_user ON findings (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS radar_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  as_of TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_radar_market ON radar_scores (market, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, created_at DESC);
`

async function tryPostgres(config) {
  if (!config.databaseUrl) return null
  try {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: config.databaseUrl })
    await pool.query('SELECT 1')
    const convert = (sql) => {
      let i = 0
      return sql.replace(/\?/g, () => `$${++i}`)
    }
    return {
      mode: 'postgres',
      all: async (sql, ...p) => (await pool.query(convert(sql), p)).rows,
      get: async (sql, ...p) => (await pool.query(convert(sql), p)).rows[0] ?? null,
      run: async (sql, ...p) => pool.query(convert(sql), p),
      close: () => pool.end(),
    }
  } catch {
    return null
  }
}

export async function createCloudDb(config) {
  const pg = await tryPostgres(config)
  if (pg) {
    await pg.run(SCHEMA)
    return pg
  }

  fs.mkdirSync(config.dataDir, { recursive: true })
  const file = path.join(config.dataDir, 'cloud.db')
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  return {
    mode: 'sqlite',
    file,
    all: async (sql, ...p) => db.prepare(sql).all(...p),
    get: async (sql, ...p) => db.prepare(sql).get(...p) ?? null,
    run: async (sql, ...p) => db.prepare(sql).run(...p),
    close: () => db.close(),
  }
}
