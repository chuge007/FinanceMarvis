/**
 * 由 server/upstream/registry.mjs 生成前端类型安全的源清单。
 *
 * 用法：node scripts/gen-source-registry.mjs
 * 产物：src/core/data/registry.generated.ts（不要手改）
 *
 * 这样做的好处：源清单只有一处定义，档案页展示的「已接入 / 需 Key / 需客户端」
 * 与实际转发行为天然一致，不会出现文档写已接入、代码却没路由的漂移。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { upstreamManifest } from '../server/upstream/registry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'core', 'data', 'registry.generated.ts')

const rows = upstreamManifest()
const body = rows
  .map(
    (r) =>
      `  { id: ${JSON.stringify(r.id)}, prefix: ${JSON.stringify(r.prefix)}, label: ${JSON.stringify(r.label)}, ` +
      `datasets: ${JSON.stringify(r.datasets)}, auth: ${JSON.stringify(r.auth)}, priority: ${JSON.stringify(r.priority)}, ` +
      `markets: ${JSON.stringify(r.markets)}, ttl: ${r.ttl}, viaProxy: ${r.viaProxy}, ` +
      `domain: ${JSON.stringify(r.domain)}, role: ${JSON.stringify(r.role)}, quality: ${JSON.stringify(r.quality)}, ` +
      `stability: ${JSON.stringify(r.stability ?? 'S4')}${r.methodQuality ? `, methodQuality: ${JSON.stringify(r.methodQuality)}` : ''} },`,
  )
  .join('\n')

const content = `/**
 * 自动生成，请勿手改。
 * 源：server/upstream/registry.mjs
 * 重新生成：node scripts/gen-source-registry.mjs
 */
import type { SourceRef } from './contracts';

export const GENERATED_SOURCES: SourceRef[] = [
${body}
];

export const GENERATED_AT = ${JSON.stringify(new Date().toISOString())};
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, content, 'utf8')
console.log(`[gen-source-registry] 已生成 ${rows.length} 个源 → ${path.relative(ROOT, OUT)}`)
