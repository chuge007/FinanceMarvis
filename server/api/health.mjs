/**
 * 健康度与手动刷新接口。
 *
 *   GET  /api/v1/health    源状态 + 库统计 + 可用能力
 *   POST /api/v1/refresh   手动触发一轮抓取（前端「立即刷新」按钮）
 */
import { envelope, sendJson } from '../http/respond.mjs'

export function registerHealthRoutes(router, { db, adapters, scheduler, startedAt }) {
  router.get('/api/v1/health', (_req, res) => {
    const healthRows = db.listHealth()
    const byId = new Map(healthRows.map((h) => [h.id, h]))
    const sched = scheduler.status()

    // 按源聚合覆盖区间（不是取该源第一条序列，否则会低估）
    const sources = adapters.series
      .reduce((acc, s) => {
        const existing = acc.find((x) => x.id === s.source)
        if (existing) {
          const cov = db.coverage(s.id)
          existing.seriesCount += 1
          existing.coverage.points += cov.points
          if (cov.first && (!existing.coverage.first || cov.first < existing.coverage.first)) existing.coverage.first = cov.first
          if (cov.last && (!existing.coverage.last || cov.last > existing.coverage.last)) existing.coverage.last = cov.last
          return acc
        }
        const h = byId.get(s.source)
        const cov = db.coverage(s.id)
        acc.push({
          id: s.source,
          ok: h ? h.ok : false,
          latencyMs: h?.latencyMs ?? null,
          error: h?.error ?? null,
          checkedAt: h?.checkedAt ?? null,
          cooldownUntil: h?.cooldownUntil ?? null,
          consecutiveFailures: sched.failuresBySource?.[s.source] ?? 0,
          seriesCount: 1,
          coverage: { ...cov },
        })
        return acc
      }, [])
      .sort((a, b) => a.id.localeCompare(b.id))

    const stats = db.stats()
    const uptimeSec = Math.round((Date.now() - startedAt) / 1000)
    const degraded = Object.entries(sched.failuresBySource ?? {})
      .filter(([, n]) => n >= 2)
      .map(([id, n]) => `${id} 连续 ${n} 轮失败`)

    sendJson(
      res,
      200,
      envelope(
        {
          sources,
          db: stats,
          capabilities: adapters.capabilities,
          scheduler: sched,
          uptimeSec,
        },
        {
          source: 'local:health',
          asOf: new Date().toISOString().slice(0, 10),
          ...(degraded.length ? { degraded: true, missing: degraded, note: '有源连续失败，已按主备链降级' } : {}),
        },
      ),
    )
  })

  router.post('/api/v1/refresh', async (req, res, ctx) => {
    const scope = ctx.query.get('scope') ?? 'auto'
    // 只刷快照：首屏依赖这些，不该等 100 条日线回填完
    const result =
      scope === 'snapshots'
        ? await (async () => {
            await scheduler.refreshSnapshots()
            return { total: 0, ok: 0, scope: 'snapshots' }
          })()
        : await scheduler.tick(`manual:${scope}`)
    sendJson(
      res,
      200,
      envelope(result, { source: 'scheduler', asOf: new Date().toISOString().slice(0, 10), note: '手动触发' }),
    )
  })
}
