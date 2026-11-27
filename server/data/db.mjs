/**
 * 历史库门面：优先 node:sqlite，失败自动降级 JSONL。
 *
 * 为什么必须双驱动：exe 双击启动无法追加 --experimental-sqlite 参数，
 * 且不同 Node 版本对 node:sqlite 的稳定性不同。降级后能力不减，只是慢。
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {{dataDir:string, log?:(m:string)=>void}} opts
 */
export async function openDatabase({ dataDir, log = () => {} }) {
  fs.mkdirSync(dataDir, { recursive: true })
  const dbFile = path.join(dataDir, 'marvis.db')

  if (process.env.MARVIS_DB_DRIVER !== 'jsonl') {
    try {
      const { createSqliteDriver } = await import('./driver-sqlite.mjs')
      const driver = await createSqliteDriver({ file: dbFile, log })
      log(`[db] SQLite 已启用: ${dbFile}`)
      return driver
    } catch (err) {
      log(`[db] node:sqlite 不可用（${err?.message ?? err}），降级 JSONL`)
    }
  }

  const { createJsonlDriver } = await import('./driver-jsonl.mjs')
  const dir = path.join(dataDir, 'jsonl')
  const driver = createJsonlDriver({ dir, log })
  log(`[db] JSONL 兜底已启用: ${dir}`)
  return driver
}
