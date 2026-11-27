/**
 * 数据侧车接口：/api/v1/data-sidecar/*
 *
 * 侧车不可用（未装 Python / 依赖缺失）时返回 NO_DATA + 明确原因，
 * 不退化成模拟值。与富途接口同一纪律。
 */
import { envelope, sendJson } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'
import { isDataMethodAllowed } from '../local/dataSidecar.mjs'

const today = () => new Date().toISOString().slice(0, 10)

export function registerDataSidecarRoutes(router, { dataSidecar }) {
  router.get('/api/v1/data-sidecar/status', async (_req, res) => {
    const probe = await dataSidecar.probe()
    const missing = Object.entries(probe.libs ?? {})
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
    sendJson(
      res,
      200,
      envelope(
        {
          ...probe,
          hint: probe.available
            ? 'AkShare / EDGAR / ccxt 就绪'
            : '运行 py -3.11 -m pip install -r sidecar/requirements-data.txt 后启用；相关域显示「缺」',
        },
        {
          source: 'data-sidecar',
          asOf: today(),
          ...(probe.available ? {} : { missing: missing.length ? missing : ['数据侧车不可用'] }),
        },
      ),
    )
  })

  router.post('/api/v1/data-sidecar/call', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 200, envelope({ result: null }, {
        source: 'data-sidecar',
        asOf: today(),
        degraded: true,
        missing: ['请求体不是合法 JSON'],
      }))
      return
    }
    const { method, params = {} } = body
    if (!isDataMethodAllowed(method)) {
      sendJson(res, 200, envelope({ result: null }, {
        source: 'data-sidecar',
        asOf: today(),
        degraded: true,
        missing: [`不允许的方法 ${method}`],
      }))
      return
    }
    const result = await dataSidecar.call(method, params)
    if (!result.ok) {
      sendJson(
        res,
        200,
        envelope(
          { result: null },
          {
            source: 'data-sidecar',
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
      envelope(result.result, { source: 'data-sidecar', asOf: today(), caliber: method }),
    )
  })
}
