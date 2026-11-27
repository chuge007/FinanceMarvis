/**
 * 冷数据迁移：把本地 SQLite 的序列历史复制到云端数据目录。
 *
 *   node scripts/cloud-migrate-data.mjs --to=<云数据目录> [--from=<本地目录>]
 *
 * 按序列分批写入（每 1000 点一次事务），不会覆盖云端更新的数据：
 * point 表主键是 (series_id, ts)，重复写入是 upsert。
 */
import fs from 'node:fs'
import path from 'node:path'
import { openDatabase } from '../server/data/db.mjs'

const args = process.argv.slice(2)
const arg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}

const localDir =
  arg('from') ||
  (process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(process.env.HOME, 'AppData', 'Roaming'), 'Marvis')
    : path.join(process.env.HOME, '.marvis'))
const cloudDir = arg('to')
if (!cloudDir) {
  console.error('需要 --to=<云数据目录>')
  process.exit(1)
}

const srcFile = path.join(localDir, 'marvis.db')
if (!fs.existsSync(srcFile)) {
  console.error(`本地库不存在: ${srcFile}`)
  process.exit(1)
}

const { DatabaseSync } = await import('node:sqlite')
const src = new DatabaseSync(srcFile, { readOnly: true })
const dst = await openDatabase({ dataDir: cloudDir, log: () => {} })

const series = src.prepare('SELECT * FROM series').all()
let points = 0
const started = Date.now()

for (const s of series) {
  dst.upsertSeries({
    id: s.id,
    source: s.source,
    symbol: s.symbol,
    label: s.label,
    market: s.market,
    freq: s.freq,
    unit: s.unit,
    caliber: s.caliber,
    firstTs: s.first_ts,
    lastTs: s.last_ts,
  })
  const rows = src.prepare('SELECT ts, value, extra FROM point WHERE series_id = ? ORDER BY ts ASC').all(s.id)
  let batch = []
  for (const r of rows) {
    batch.push({
      date: new Date(r.ts * 1000).toISOString().slice(0, 10),
      value: r.value,
      extra: r.extra ? JSON.parse(r.extra) : undefined,
    })
    if (batch.length >= 1000) {
      points += dst.writePoints(s.id, batch)
      batch = []
    }
  }
  if (batch.length) points += dst.writePoints(s.id, batch)
}

// 快照也迁过去
const snaps = src.prepare('SELECT * FROM snapshot').all()
for (const s of snaps) {
  dst.putSnapshot(s.key, JSON.parse(s.payload), { ttl: s.ttl, asOf: s.as_of ? new Date(s.as_of * 1000).toISOString() : null })
}

console.log(`[migrate] ${series.length} 条序列 / ${points} 个点 / ${snaps.length} 个快照`)
console.log(`[migrate] ${path.join(cloudDir, 'marvis.db')} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
src.close()
dst.close()
