/**
 * 跨市场雷达接口：GET /api/v1/radar
 *
 * 本地自算分数与 airoom 第三方分数**分列**返回，字段 source 各自标注。
 */
import { envelope, sendJson } from '../http/respond.mjs'
import { computeCrossMarket } from '../compute/crossMarket.mjs'
import { createAiroornSource } from '../adapters/airoom.mjs'

export function registerRadarRoutes(router, { db, config, log }) {
  const airoorn = createAiroornSource({ config, log })
  const repo = { getSeries: (id) => db.getRange(id, null, null) }

  router.get('/api/v1/radar', (_req, res) => {
    const radar = computeCrossMarket(repo, airoorn)
    sendJson(
      res,
      200,
      envelope(radar, {
        source: 'compute:cross-market',
        asOf: radar.asOf,
        ...(radar.thirdParty.available ? {} : { missing: ['airoom CSV 未导入'] }),
        note: '第三方分数与本地分数分列展示，不混合计算',
      }),
    )
  })
}
