/**
 * 序列与快照接口。
 *
 *   GET /api/v1/series?ids=fred:DGS10,yahoo:^VIX&range=1y&limit=250
 *   GET /api/v1/snapshot?ids=cn:breadth,us:options-sentiment
 *   GET /api/v1/catalog
 *
 * 一次请求可拿多条序列 —— 前端一屏所需数据在一个请求里回来，避免瀑布式请求。
 */
import { envelope, sendError, sendJson } from '../http/respond.mjs'

const RANGE_DAYS = { '1m': 31, '3m': 92, '6m': 183, '1y': 366, '2y': 731, '5y': 1827, '10y': 3653, max: 36530 }

function rangeStart(range) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['1y']
  const d = new Date(Date.now() - days * 86400_000)
  return d.toISOString().slice(0, 10)
}

export function registerSeriesRoutes(router, { db, adapters, config }) {
  router.get('/api/v1/series', (req, res, ctx) => {
    const idsParam = ctx.query.get('ids') ?? ''
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (!ids.length) {
      sendError(res, 400, 'BAD_REQUEST', '缺少 ids 参数，形如 ?ids=fred:DGS10,yahoo:^VIX')
      return
    }
    if (ids.length > 24) {
      sendError(res, 400, 'BAD_REQUEST', '单次最多 24 条序列')
      return
    }

    const range = ctx.query.get('range') ?? '1y'
    const limit = Number(ctx.query.get('limit') ?? 0)
    const from = range === 'max' ? null : rangeStart(range)
    const known = new Map(adapters.series.map((s) => [s.id, s]))
    const missing = []
    const series = []

    for (const id of ids) {
      const def = known.get(id)
      const points = db.getRange(id, from, null)
      if (!points.length) {
        missing.push(id)
        series.push({
          id,
          label: def?.label ?? id,
          unit: def?.unit,
          points: [],
          meta: { source: def?.source ?? 'unknown', asOf: null, missing: [id] },
        })
        continue
      }
      const sliced = limit > 0 ? points.slice(-limit) : points
      series.push({
        id,
        label: def?.label ?? id,
        unit: def?.unit,
        points: sliced,
        meta: {
          source: def?.source ?? 'unknown',
          asOf: sliced[sliced.length - 1]?.date ?? null,
          caliber: def?.caliber,
          ...(def && def.freq === 'daily' && daysOld(sliced[sliced.length - 1]?.date) > 5 ? { stale: true } : {}),
        },
      })
    }

    sendJson(
      res,
      200,
      envelope(
        { series },
        {
          source: 'local:sqlite',
          asOf: new Date().toISOString().slice(0, 10),
          note: `${db.driver} 历史库`,
          ...(missing.length ? { missing } : {}),
        },
      ),
    )
  })

  router.get('/api/v1/snapshot', (req, res, ctx) => {
    const idsParam = ctx.query.get('ids') ?? ''
    const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : adapters.snapshots.map((s) => s.id)
    const out = {}
    const missing = []
    for (const id of ids) {
      const hit = db.getSnapshot(id)
      if (hit) out[id] = { ...hit.payload, _fetchedAt: new Date(hit.updatedAt * 1000).toISOString() }
      else missing.push(id)
    }
    sendJson(
      res,
      200,
      envelope(
        { snapshots: out },
        {
          source: 'local:snapshot',
          asOf: new Date().toISOString().slice(0, 10),
          ...(missing.length ? { missing } : {}),
        },
      ),
    )
  })

  router.get('/api/v1/catalog', (_req, res) => {
    sendJson(
      res,
      200,
      envelope(
        {
          profile: config.profile,
          capabilities: adapters.capabilities,
          sources: adapters.series.map((s) => ({
            id: s.id,
            label: s.label,
            source: s.source,
            dataset: s.dataset,
            market: s.market,
            freq: s.freq,
            unit: s.unit,
            caliber: s.caliber,
          })),
          snapshots: adapters.snapshots.map((s) => ({ id: s.id, label: s.label, source: s.source })),
        },
        { source: 'registry', asOf: new Date().toISOString().slice(0, 10) },
      ),
    )
  })
}

function daysOld(date) {
  if (!date) return 0
  const t = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(t)) return 0
  return (Date.now() - t) / 86400_000
}
