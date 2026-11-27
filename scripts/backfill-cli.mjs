/**
 * 手工回填：把历史库补齐到最新，跑完即退出。
 *
 *   node scripts/backfill-cli.mjs                    # 全部序列
 *   node scripts/backfill-cli.mjs --ids=fred:DGS10   # 指定序列
 *   node scripts/backfill-cli.mjs --data-dir=D:\x    # 指定数据目录
 *
 * 用途：首次安装后预填历史、换机器迁移、某条序列长期缺失后补洞。
 */
import { loadConfig } from '../server/config.mjs'
import { createTransport } from '../server/upstream/transport.mjs'
import { createServices } from '../server/services.mjs'

const args = process.argv.slice(2)
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}

const config = loadConfig(getArg('data-dir') ? { dataDir: getArg('data-dir') } : {})
const transport = createTransport({ ports: config.proxyPorts })
await transport.init()

const services = await createServices({ config, transport, log: (m) => console.log(m) })
const only = getArg('ids')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const targets = only.length
  ? services.adapters.series.filter((s) => only.includes(s.id))
  : services.adapters.series

console.log(`[backfill] 目标 ${targets.length} 条序列，数据目录 ${config.dataDir}`)

let ok = 0
let failed = 0
const started = Date.now()

// 单源串行：同一上游并发会触发反爬
const bySource = new Map()
for (const def of targets) {
  const list = bySource.get(def.source) ?? []
  list.push(def)
  bySource.set(def.source, list)
}

const queue = [...bySource.values()]
const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
  for (;;) {
    const group = queue.shift()
    if (!group) return
    for (const def of group) {
      const r = await services.scheduler.fetchOne(def)
      if (r.ok) {
        ok += 1
        console.log(`  ok   ${def.id}  +${r.points}  @${r.last}`)
      } else {
        failed += 1
        console.log(`  miss ${def.id}`)
      }
    }
  }
})
await Promise.all(workers)

console.log(
  `[backfill] 完成：成功 ${ok} / 失败 ${failed}，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
)
console.log('[backfill] 库统计', JSON.stringify(services.db.stats()))
services.db.close()
process.exit(0)
