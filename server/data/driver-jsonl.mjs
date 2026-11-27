/**
 * JSONL 兜底驱动。
 *
 * 什么时候会用到：Node 版本过老 / SEA 运行时不带 node:sqlite 构建。
 * 能力等价（能回填、能算分位），只是查询慢一个量级。
 * 有兜底才能保证「双击 exe 一定跑得起来」，而不是卡在某个 Node 版本上。
 */
import fs from 'node:fs'
import path from 'node:path'

const DAY = 86400

function safeName(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function toTs(date) {
  if (typeof date === 'number') return date
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

function fromTs(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function createJsonlDriver({ dir, log = () => {} }) {
  const seriesDir = path.join(dir, 'series')
  const snapDir = path.join(dir, 'snapshots')
  fs.mkdirSync(seriesDir, { recursive: true })
  fs.mkdirSync(snapDir, { recursive: true })
  const healthFile = path.join(dir, 'health.json')

  /** @type {Map<string, {meta:any, points:Map<number,{value:number,extra:any}>}>} */
  const store = new Map()
  const stats = { seriesCount: 0, pointCount: 0 }

  function seriesFile(id) {
    return path.join(seriesDir, `${safeName(id)}.jsonl`)
  }

  function loadSeries(id) {
    if (store.has(id)) return store.get(id)
    const file = seriesFile(id)
    const entry = { meta: { id }, points: new Map() }
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line)
          if (row.t) entry.meta = { ...entry.meta, ...row.t }
          if (typeof row.ts === 'number' && Number.isFinite(row.v)) {
            entry.points.set(row.ts, { value: row.v, extra: row.x ?? undefined })
          }
        } catch {
          /* 单行损坏不影响整条序列 */
        }
      }
    }
    stats.seriesCount += 1
    stats.pointCount += entry.points.size
    store.set(id, entry)
    return entry
  }

  function appendLine(file, obj) {
    fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8')
  }

  return {
    driver: 'jsonl',
    path: dir,

    upsertSeries(desc) {
      const entry = loadSeries(desc.id)
      entry.meta = { ...entry.meta, ...desc }
      appendLine(seriesFile(desc.id), { t: entry.meta })
    },

    writePoints(seriesId, points) {
      if (!points?.length) return 0
      const entry = loadSeries(seriesId)
      let written = 0
      for (const p of points) {
        const ts = toTs(p.date)
        if (ts == null || !Number.isFinite(p.value)) continue
        if (!entry.points.has(ts)) stats.pointCount += 1
        entry.points.set(ts, { value: p.value, extra: p.extra ?? undefined })
        appendLine(seriesFile(seriesId), { ts, v: p.value, x: p.extra ?? undefined })
        written += 1
      }
      return written
    },

    getRange(seriesId, fromDate, toDate) {
      const entry = loadSeries(seriesId)
      const from = fromDate ? toTs(fromDate) - DAY : 0
      const to = toDate ? toTs(toDate) + DAY : 4102444800
      const out = []
      for (const [ts, v] of entry.points) {
        if (ts < from || ts > to) continue
        out.push({ date: fromTs(ts), value: v.value, extra: v.extra })
      }
      return out.sort((a, b) => a.date.localeCompare(b.date))
    },

    getLatest(seriesId, n = 1) {
      const entry = loadSeries(seriesId)
      return [...entry.points.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, n)
        .map(([ts, v]) => ({ date: fromTs(ts), value: v.value, extra: v.extra }))
        .reverse()
    },

    coverage(seriesId) {
      const entry = loadSeries(seriesId)
      if (!entry.points.size) return { first: null, last: null, points: 0 }
      const keys = [...entry.points.keys()].sort((a, b) => a - b)
      return { first: fromTs(keys[0]), last: fromTs(keys[keys.length - 1]), points: keys.length }
    },

    getSeries(seriesId) {
      const entry = loadSeries(seriesId)
      return entry.meta?.id ? entry.meta : null
    },

    listSeries() {
      return fs
        .readdirSync(seriesDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const id = f.slice(0, -6)
          return loadSeries(id).meta
        })
    },

    putSnapshot(key, payload, { ttl = 0, asOf = null } = {}) {
      const now = Math.floor(Date.now() / 1000)
      fs.writeFileSync(
        path.join(snapDir, `${safeName(key)}.json`),
        JSON.stringify({ payload, asOf, ttl, updatedAt: now }),
        'utf8',
      )
    },

    getSnapshot(key) {
      const file = path.join(snapDir, `${safeName(key)}.json`)
      if (!fs.existsSync(file)) return null
      try {
        const row = JSON.parse(fs.readFileSync(file, 'utf8'))
        const now = Math.floor(Date.now() / 1000)
        if (row.ttl && now - row.updatedAt > row.ttl) return null
        return { payload: row.payload, asOf: row.asOf, updatedAt: row.updatedAt }
      } catch {
        return null
      }
    },

    recordHealth(entry) {
      let all = {}
      try {
        if (fs.existsSync(healthFile)) all = JSON.parse(fs.readFileSync(healthFile, 'utf8'))
      } catch {
        all = {}
      }
      all[entry.id] = {
        ok: !!entry.ok,
        latencyMs: entry.latencyMs ?? null,
        error: entry.error ?? null,
        checkedAt: new Date().toISOString().slice(0, 10),
        cooldownUntil: entry.cooldownUntil ? new Date(entry.cooldownUntil).toISOString().slice(0, 10) : null,
      }
      fs.writeFileSync(healthFile, JSON.stringify(all, null, 2), 'utf8')
    },

    listHealth() {
      try {
        if (!fs.existsSync(healthFile)) return []
        const all = JSON.parse(fs.readFileSync(healthFile, 'utf8'))
        return Object.entries(all).map(([id, v]) => ({ id, ...v }))
      } catch {
        return []
      }
    },

    recordIngest(entry) {
      try {
        appendLine(path.join(dir, 'ingest.jsonl'), { ...entry, at: new Date().toISOString() })
      } catch {
        /* 日志失败不影响主流程 */
      }
    },

    stats() {
      return { driver: 'jsonl', seriesCount: stats.seriesCount, pointCount: stats.pointCount, path: dir }
    },

    close() {
      store.clear()
    },
  }
}
