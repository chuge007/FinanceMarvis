/**
 * Wind 研究接口。
 *
 * 提交走云端任务队列（/api/v2/tasks，kind=wind-research），因为单次 2-15 分钟；
 * 这里只暴露状态与本地解析器，便于在没有 Key 时也能验证结构化链路。
 */
import { envelope, sendJson, sendError } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'
import { findingEnvelope } from '../resolve/confidence.mjs'

const today = () => new Date().toISOString().slice(0, 10)

export function registerWindRoutes(router, { wind }) {
  router.get('/api/v1/wind/status', async (_req, res) => {
    const probe = await wind.probe()
    sendJson(
      res,
      200,
      envelope(probe, {
        source: 'wind:alice',
        asOf: today(),
        ...(probe.available ? {} : { missing: [probe.reason ?? 'Wind 凭据不可得'] }),
      }),
    )
  })

  /** 本地解析测试：把 Markdown 喂给三层解析器，验证结构化链路。 */
  router.post('/api/v1/wind/resolve', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON')
      return
    }
    const markdown = String(body.markdown ?? '')
    if (!markdown.trim()) {
      sendError(res, 400, 'BAD_REQUEST', '缺少 markdown')
      return
    }
    const finding = wind.resolve(markdown, body.taskId)
    sendJson(res, 200, findingEnvelope(finding))
  })
}
