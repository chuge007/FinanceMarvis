/**
 * 能力清单通用调用：/api/v1/capability/call
 *
 * 让「全景 → 能力目录」里状态为 catalog-only / python-required 的公开数据函数
 * 在装库后可被真正调用，同时受三层白名单约束：
 *   1. 能力 id 必须存在于生成清单（前端不能传任意符号）；
 *   2. 库必须在侧车 ALLOWED_LIBS（akshare/efinance/yahooquery/adata）；
 *   3. 函数名必须公开（侧车 SAFE_SYMBOL 校验）。
 * 不返回模拟值；失败如实表达「缺」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { envelope, sendError, sendJson } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST = path.resolve(HERE, '..', '..', 'public', 'data', 'project-capabilities.json')

const LIB_BY_PROJECT = {
  akshare: 'akshare',
  adata: 'adata',
  efinance: 'efinance',
  yahooquery: 'yahooquery',
}

let cache = null
function capabilities() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).capabilities ?? []
  } catch {
    cache = []
  }
  return cache
}

export function registerCapabilityCallRoutes(router, { dataSidecar }) {
  router.post('/api/v1/capability/call', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON')
      return
    }
    const cap = capabilities().find((c) => c.id === body.id)
    if (!cap) {
      sendError(res, 400, 'BAD_REQUEST', '能力 id 不在生成清单中')
      return
    }
    const lib = LIB_BY_PROJECT[cap.project]
    if (!lib) {
      sendJson(res, 200, envelope(
        { result: null },
        {
          source: 'capability-call',
          asOf: null,
          degraded: true,
          missing: [`${cap.project} 无通用调用通道（需本机服务 / Key / 回测框架，非数据函数）`],
        },
      ))
      return
    }
    const args = Array.isArray(body.args) ? body.args : []
    const kwargs = body.kwargs && typeof body.kwargs === 'object' ? body.kwargs : {}
    const result = await dataSidecar.call('python.call', { lib, symbol: cap.symbol, args, kwargs }, 120_000)
    if (!result.ok) {
      sendJson(res, 200, envelope(
        { result: null },
        {
          source: 'capability-call',
          asOf: null,
          degraded: true,
          missing: [`${cap.id}: ${result.error?.message ?? '不可得'}`],
        },
      ))
      return
    }
    const rows = Array.isArray(result.result?.rows) ? result.result.rows : []
    const value = result.result?.value ?? null
    sendJson(res, 200, envelope(
      { result: { id: cap.id, project: cap.project, symbol: cap.symbol, rows, value } },
      {
        source: 'capability-call',
        asOf: new Date().toISOString().slice(0, 10),
        caliber: result.result?.caliber ?? '',
        note: rows.length ? `返回 ${rows.length} 行` : '函数已执行，未返回表格数据',
      },
    ))
  })
}
