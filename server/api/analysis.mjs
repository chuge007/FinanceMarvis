/**
 * 派生指标与环境分数接口。
 *
 *   GET /api/v1/factors?ids=fred:DGS10,fred:BAMLH0A0HYM2
 *   GET /api/v1/regime?market=cn
 *   GET /api/v1/ratios           金银比 / 金油比 / 铜金比
 */
import { envelope, sendJson } from '../http/respond.mjs'
import { summarize, ratioSeries, rollingCorrelation, percentileOf } from '../compute/factors.mjs'
import { computeRegime } from '../compute/regime.mjs'

/** 比价定义：分子/分母 + 量纲换算 + 说明。 */
const RATIOS = [
  {
    id: 'ratio:gold-silver',
    label: '金银比',
    a: 'yahoo:GC=F',
    b: 'yahoo:SI=F',
    caliber: 'COMEX 黄金 ÷ 白银，同为美元/盎司，裸除即标准读数',
  },
  {
    id: 'ratio:gold-oil',
    label: '金油比',
    a: 'yahoo:GC=F',
    b: 'yahoo:CL=F',
    caliber: '黄金美元/盎司 ÷ WTI 美元/桶，期货收盘口径',
  },
  {
    id: 'ratio:copper-gold',
    label: '铜金比',
    a: 'yahoo:HG=F',
    b: 'yahoo:GC=F',
    caliber: '铜按 1 磅 = 2204.62 吨换算后 ÷ 黄金，否则无经济含义',
    convert: 2204.62,
  },
]

export function registerAnalysisRoutes(router, { db, adapters }) {
  const repo = {
    getSeries: (id) => db.getRange(id, null, null),
  }

  router.get('/api/v1/factors', (req, res, ctx) => {
    const idsParam = ctx.query.get('ids') ?? ''
    const ids = idsParam
      ? idsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : adapters.series.slice(0, 24).map((s) => s.id)
    const known = new Map(adapters.series.map((s) => [s.id, s]))

    const factors = ids.map((id) => {
      const def = known.get(id)
      const points = repo.getSeries(id)
      const sum = summarize(points)
      if (!sum) {
        return { id, label: def?.label ?? id, value: null, asOf: null, source: def?.source ?? 'unknown' }
      }
      return {
        id,
        label: def?.label ?? id,
        unit: def?.unit,
        value: sum.latest,
        percentile: sum.percentile,
        z: sum.z,
        asOf: sum.asOf,
        source: def?.source ?? 'unknown',
        samples: sum.points,
      }
    })

    sendJson(
      res,
      200,
      envelope(
        { factors },
        {
          source: 'compute:factors',
          asOf: new Date().toISOString().slice(0, 10),
          note: '分位按全历史样本计算，样本 < 20 返回 null',
        },
      ),
    )
  })

  router.get('/api/v1/regime', (req, res, ctx) => {
    const market = ctx.query.get('market') ?? 'cn'
    const regime = computeRegime(repo, market)
    sendJson(
      res,
      200,
      envelope(regime, {
        source: 'compute:regime',
        asOf: regime.asOf,
        ...(regime.coverage !== '5/5' ? { missing: [`覆盖 ${regime.coverage}`] } : {}),
        note: '分数为体制描述，不构成择时预测',
      }),
    )
  })

  router.get('/api/v1/ratios', (_req, res) => {
    const out = []
    const missing = []
    for (const def of RATIOS) {
      const a = repo.getSeries(def.a)
      const b = repo.getSeries(def.b)
      if (!a.length || !b.length) {
        missing.push(def.id)
        out.push({ id: def.id, label: def.label, value: null, asOf: null, caliber: def.caliber })
        continue
      }
      const series = ratioSeries(a, b, { convert: def.convert ?? 1, label: def.label })
      const last = series[series.length - 1]
      const values = series.map((p) => p.value)
      out.push({
        id: def.id,
        label: def.label,
        value: last ? Math.round(last.value * 1000) / 1000 : null,
        asOf: last?.date ?? null,
        percentile: last ? percentileOf(values, last.value) : null,
        caliber: def.caliber,
        history: series.slice(-120),
      })
    }
    sendJson(
      res,
      200,
      envelope({ ratios: out, meta: undefined }, { source: 'compute:ratios', asOf: new Date().toISOString().slice(0, 10), ...(missing.length ? { missing } : {}) }),
    )
  })

  router.get('/api/v1/correlation', (req, res, ctx) => {
    const a = ctx.query.get('a')
    const b = ctx.query.get('b')
    const window = Number(ctx.query.get('window') ?? 60)
    if (!a || !b) {
      sendJson(res, 400, { error: { code: 'BAD_REQUEST', message: '需要 a 与 b 两个序列 id' } })
      return
    }
    const corr = rollingCorrelation(repo.getSeries(a), repo.getSeries(b), window)
    sendJson(
      res,
      200,
      envelope(
        { a, b, window, correlation: corr },
        { source: 'compute:correlation', asOf: new Date().toISOString().slice(0, 10), caliber: '对数收益 Pearson' },
      ),
    )
  })
}
