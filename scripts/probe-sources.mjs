/**
 * 源探活：只抓不写库，回答「现在哪些源能用、哪些坏了、坏在哪」。
 *
 *   node scripts/probe-sources.mjs                 # 全部
 *   node scripts/probe-sources.mjs --source=fred    # 只探一个源
 *   node scripts/probe-sources.mjs --ids=fred:DGS10,cn:index:sh000300
 *   node scripts/probe-sources.mjs --verbose        # 打印每个序列的样本末尾
 *
 * 退出码：全部可用 0；存在失败 1（可直接接 CI 或启动前自检）。
 */
import { loadConfig } from '../server/config.mjs'
import { createTransport } from '../server/upstream/transport.mjs'
import { buildAdapters } from '../server/adapters/index.mjs'
import { createDataSidecar } from '../server/local/dataSidecar.mjs'

const args = process.argv.slice(2)
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const verbose = args.includes('--verbose')

const config = loadConfig()
const transport = createTransport({ ports: config.proxyPorts, log: () => {} })
await transport.init()

const adapters = buildAdapters({ transport, config, log: () => {} })
// 侧车适配器需要 dataSidecar.call；探活必须和真实调度使用同一上下文，否则会假报「undefined.call」。
const dataSidecar = createDataSidecar({ config, log: () => {} })
const ctx = { transport, config, log: () => {}, dataSidecar }
const sourceFilter = getArg('source')
const idFilter = getArg('ids')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const targets = adapters.series.filter(
  (s) => (!sourceFilter || s.source === sourceFilter) && (!idFilter.length || idFilter.includes(s.id)),
)

console.log(`[probe] 目标 ${targets.length} 条序列，出口代理 ${transport.proxyUrl || '直连'}\n`)

const results = []
const started = Date.now()

// 单源串行，源间并发 4（与调度器同策略）
const bySource = new Map()
for (const def of targets) {
  const list = bySource.get(def.source) ?? []
  list.push(def)
  bySource.set(def.source, list)
}

const queue = [...bySource.entries()]
await Promise.all(
  Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const entry = queue.shift()
      if (!entry) return
      const [source, defs] = entry
      for (const def of defs) {
        const t0 = Date.now()
        let raw = null
        let error = ''
        try {
          raw = await def.fetch(ctx)
        } catch (err) {
          error = err?.message ?? String(err)
        }
        const points = Array.isArray(raw) ? raw : (raw?.points ?? [])
        const usedSource = (!Array.isArray(raw) && raw?.source) || def.source
        results.push({
          id: def.id,
          source,
          usedSource,
          ok: points.length > 0,
          points: points.length,
          last: points.length ? points[points.length - 1].date : null,
          ms: Date.now() - t0,
          error: points.length ? '' : error || '返回空',
        })
      }
    }
  }),
)

// 快照类单独探：它们不进 series 表，但同样是页面数据源（宽度、板块资金流、CBOE、COT）
const snapshots = []
for (const snap of adapters.snapshots) {
  const t0 = Date.now()
  let payload = null
  let error = ''
  try {
    payload = await snap.fetch(ctx)
  } catch (err) {
    error = err?.message ?? String(err)
  }
  const ok = !!(payload && (payload.available === undefined ? true : payload.available))
  snapshots.push({
    id: snap.id,
    source: snap.source,
    ok,
    ms: Date.now() - t0,
    error: ok ? '' : error || payload?.reason || '返回不可用',
  })
}

const failed = results.filter((r) => !r.ok)
const bySrc = new Map()
for (const r of results) {
  const s = bySrc.get(r.source) ?? { total: 0, ok: 0 }
  s.total += 1
  if (r.ok) s.ok += 1
  bySrc.set(r.source, s)
}

console.log('源'.padEnd(20) + '可用/总数'.padEnd(12) + '状态')
for (const [source, s] of [...bySrc.entries()].sort()) {
  const state = s.ok === s.total ? '正常' : s.ok === 0 ? '全挂' : '部分可用'
  console.log(`${source.padEnd(20)}${`${s.ok}/${s.total}`.padEnd(12)}${state}`)
}

if (verbose) {
  console.log('\n明细：')
  for (const r of results) {
    const tag = r.ok ? 'ok  ' : 'FAIL'
    const extra = r.ok ? `+${r.points} @${r.last}` : r.error
    const degrade = r.usedSource && r.usedSource !== r.source ? `（降级到 ${r.usedSource}）` : ''
    console.log(`  ${tag} ${r.id.padEnd(28)} ${String(r.ms).padStart(6)}ms  ${extra}${degrade}`)
  }
}

console.log('\n快照：')
for (const s of snapshots) {
  const tag = s.ok ? 'ok  ' : 'FAIL'
  console.log(`  ${tag} ${s.id.padEnd(24)} ${String(s.ms).padStart(6)}ms  ${s.ok ? '' : s.error}`)
}

const failedSnaps = snapshots.filter((s) => !s.ok)

if (failed.length) {
  console.log(`\n失败序列 ${failed.length} 条：`)
  for (const r of failed) console.log(`  - ${r.id}：${r.error}`)
}

console.log(
  `\n[probe] 完成：序列 ${results.length - failed.length}/${results.length}，快照 ${snapshots.length - failedSnaps.length}/${snapshots.length}，耗时 ${Date.now() - started}ms`,
)
dataSidecar.close()
process.exit(failed.length || failedSnaps.length ? 1 : 0)
