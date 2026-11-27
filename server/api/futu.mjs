/**
 * 富途接口：/api/v1/futu/*
 *
 * 所有能力都经 Python 侧车；侧车不可用时统一返回 NO_DATA + 明确原因，
 * 不会退化成模拟行情（万象铁律：禁止编数）。
 */
import { envelope, sendError, sendJson } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'
import { isAllowedMethod } from '../local/sidecar.mjs'

const today = () => new Date().toISOString().slice(0, 10)

export function registerFutuRoutes(router, { sidecar, config }) {
  router.get('/api/v1/futu/status', async (_req, res) => {
    const probe = await sidecar.probe()
    sendJson(
      res,
      200,
      envelope(
        {
          ...probe,
          realTradingEnabled: !!config.allowRealTrading,
          hint: probe.available
            ? 'OpenD 与 futu-api 就绪'
            : '需安装 futu-api>=10.4.6408 并运行 OpenD 127.0.0.1:11111；本域显示不可得',
        },
        { source: 'futu:sidecar', asOf: today(), ...(probe.available ? {} : { missing: ['富途侧车不可用'] }) },
      ),
    )
  })

  router.post('/api/v1/futu/call', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON')
      return
    }
    const { method, params = {}, env = 'SIMULATE' } = body
    if (!isAllowedMethod(method)) {
      sendError(res, 400, 'BAD_REQUEST', `不允许的方法 ${method}`)
      return
    }
    if (env === 'REAL' && !config.allowRealTrading) {
      sendError(res, 403, 'BAD_REQUEST', '真实交易未启用；默认仅模拟盘')
      return
    }

    const result = await sidecar.call(method, params, env)
    if (!result.ok) {
      sendJson(
        res,
        200,
        envelope(
          { result: null },
          {
            source: 'futu:sidecar',
            asOf: today(),
            degraded: true,
            missing: [`${method}: ${result.error?.message ?? '不可得'}`],
          },
        ),
      )
      return
    }
    sendJson(
      res,
      200,
      envelope(result.result, { source: 'futu:sidecar', asOf: today(), caliber: `${env} 环境 · ${method}` }),
    )
  })
}
