/**
 * SQLite 驱动（node:sqlite，Node 22.5+ 内置）。
 *
 * 写入策略：批量事务 + WAL。逐点 fsync 会让首次回填慢到不可用，
 * 每批 1000 点提交一次，回填 5 年日线约 1200 点/序列，一批写完。
 */
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.mjs'

const DAY = 86400

function toTs(date) {
  if (typeof date === 'number') return date
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function fromTs(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export async function createSqliteDriver({ file, log = () => {} }) {
  // 动态 import：只有真正选到 SQLite 驱动时才加载 node:sqlite，
  // 避免 build / 依赖预扫描阶段就触发 ExperimentalWarning。
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(SCHEMA_SQL)
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION))

  const stmtUpsertSeries = db.prepare(`
    INSERT INTO series (id, source, symbol, label, market, freq, unit, caliber, first_ts, last_ts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source=excluded.source, symbol=excluded.symbol, label=excluded.label,
      market=excluded.market, freq=excluded.freq, unit=excluded.unit, caliber=excluded.caliber,
      first_ts=MIN(COALESCE(series.first_ts, excluded.first_ts), excluded.first_ts),
      last_ts=MAX(COALESCE(series.last_ts, excluded.last_ts), excluded.last_ts),
      updated_at=excluded.updated_at
  `)
  const stmtPoint = db.prepare('INSERT OR REPLACE INTO point (series_id, ts, value, extra) VALUES (?, ?, ?, ?)')
  const stmtRange = db.prepare(
    'SELECT ts, value, extra FROM point WHERE series_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC',
  )
  const stmtLatest = db.prepare('SELECT ts, value, extra FROM point WHERE series_id = ? ORDER BY ts DESC LIMIT ?')
  const stmtCoverage = db.prepare('SELECT MIN(ts) AS first, MAX(ts) AS last, COUNT(*) AS n FROM point WHERE series_id = ?')
  const stmtGetSeries = db.prepare('SELECT * FROM series WHERE id = ?')
  const stmtListSeries = db.prepare('SELECT * FROM series ORDER BY id ASC')
  const stmtSnapPut = db.prepare(
    'INSERT OR REPLACE INTO snapshot (key, payload, as_of, ttl, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const stmtSnapGet = db.prepare('SELECT payload, as_of, ttl, updated_at FROM snapshot WHERE key = ?')
  const stmtHealthPut = db.prepare(
    `INSERT INTO source_health (source_id, ok, latency_ms, error, checked_at, cooldown_until)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       ok=excluded.ok, latency_ms=excluded.latency_ms, error=excluded.error,
       checked_at=excluded.checked_at, cooldown_until=excluded.cooldown_until`,
  )
  const stmtHealthList = db.prepare('SELECT * FROM source_health ORDER BY source_id ASC')
  const stmtIngest = db.prepare('INSERT INTO ingest_log (source_id, dataset, points, ok, error, at) VALUES (?, ?, ?, ?, ?, ?)')
  const stmtCounts = db.prepare('SELECT (SELECT COUNT(*) FROM series) AS s, (SELECT COUNT(*) FROM point) AS p')

  return {
    driver: 'sqlite',
    path: file,

    upsertSeries(desc) {
      const now = Math.floor(Date.now() / 1000)
      stmtUpsertSeries.run(
        desc.id,
        desc.source ?? 'unknown',
        desc.symbol ?? '',
        desc.label ?? null,
        desc.market ?? null,
        desc.freq ?? null,
        desc.unit ?? null,
        desc.caliber ?? null,
        desc.firstTs ?? null,
        desc.lastTs ?? null,
        now,
      )
    },

    /** @param {Array<{date:string|number, value:number, extra?:any}>} points */
    writePoints(seriesId, points) {
      if (!points?.length) return 0
      let written = 0
      db.exec('BEGIN')
      try {
        for (const p of points) {
          const ts = toTs(p.date)
          if (ts == null || !Number.isFinite(p.value)) continue
          stmtPoint.run(seriesId, ts, p.value, p.extra ? JSON.stringify(p.extra) : null)
          written += 1
        }
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return written
    },

    getRange(seriesId, fromDate, toDate) {
      const from = fromDate ? toTs(fromDate) - DAY : 0
      const to = toDate ? toTs(toDate) + DAY : 4102444800
      return stmtRange.all(seriesId, from, to).map((r) => ({
        date: fromTs(r.ts),
        value: Number(r.value),
        extra: r.extra ? safeParse(r.extra) : undefined,
      }))
    },

    getLatest(seriesId, n = 1) {
      return stmtLatest
        .all(seriesId, n)
        .map((r) => ({ date: fromTs(r.ts), value: Number(r.value), extra: r.extra ? safeParse(r.extra) : undefined }))
        .reverse()
    },

    coverage(seriesId) {
      const r = stmtCoverage.get(seriesId)
      if (!r || !r.n) return { first: null, last: null, points: 0 }
      return { first: fromTs(r.first), last: fromTs(r.last), points: Number(r.n) }
    },

    getSeries(seriesId) {
      const r = stmtGetSeries.get(seriesId)
      return r ? mapSeries(r) : null
    },

    listSeries() {
      return stmtListSeries.all().map(mapSeries)
    },

    putSnapshot(key, payload, { ttl = 0, asOf = null } = {}) {
      const now = Math.floor(Date.now() / 1000)
      stmtSnapPut.run(key, JSON.stringify(payload), asOf ? Math.floor(Date.parse(asOf) / 1000) : now, ttl, now)
    },

    getSnapshot(key) {
      const r = stmtSnapGet.get(key)
      if (!r) return null
      const now = Math.floor(Date.now() / 1000)
      if (r.ttl && r.ttl > 0 && now - Number(r.updated_at) > Number(r.ttl)) return null
      return { payload: safeParse(r.payload), asOf: r.as_of ? fromTs(r.as_of) : null, updatedAt: Number(r.updated_at) }
    },

    recordHealth(entry) {
      stmtHealthPut.run(
        entry.id,
        entry.ok ? 1 : 0,
        entry.latencyMs ?? null,
        entry.error ?? null,
        Math.floor(Date.now() / 1000),
        entry.cooldownUntil ? Math.floor(entry.cooldownUntil / 1000) : null,
      )
    },

    listHealth() {
      return stmtHealthList.all().map((r) => ({
        id: r.source_id,
        ok: !!r.ok,
        latencyMs: r.latency_ms,
        error: r.error,
        checkedAt: r.checked_at ? fromTs(r.checked_at) : null,
        cooldownUntil: r.cooldown_until ? fromTs(r.cooldown_until) : null,
      }))
    },

    recordIngest(entry) {
      stmtIngest.run(entry.sourceId, entry.dataset ?? null, entry.points ?? null, entry.ok ? 1 : 0, entry.error ?? null, Math.floor(Date.now() / 1000))
    },

    stats() {
      const r = stmtCounts.get()
      return { driver: 'sqlite', seriesCount: Number(r?.s ?? 0), pointCount: Number(r?.p ?? 0), path: file }
    },

    close() {
      try {
        db.close()
      } catch {
        /* 已关闭 */
      }
    },
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function mapSeries(r) {
  return {
    id: r.id,
    source: r.source,
    symbol: r.symbol,
    label: r.label,
    market: r.market,
    freq: r.freq,
    unit: r.unit,
    caliber: r.caliber,
    first: r.first_ts ? fromTs(r.first_ts) : null,
    last: r.last_ts ? fromTs(r.last_ts) : null,
  }
}
