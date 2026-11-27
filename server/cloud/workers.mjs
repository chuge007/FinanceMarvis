/**
 * 云端任务 worker。
 *
 * 队列只负责调度，具体抓取仍复用本地那套 adapters / scheduler —— 保证
 * 云端与单机取同一口径的数据，不因为运行形态不同而算出两个值。
 */
export function registerCloudWorkers({ queue, services, store, config = {}, log = () => {} }) {
  queue.register(
    'backfill',
    async (payload) => {
      const def = services.adapters.series.find((s) => s.id === payload.id)
      if (!def) return { ok: false, reason: `未知序列 ${payload.id}` }
      const result = await services.scheduler.fetchOne(def)
      await store.log(payload.userId ?? null, 'worker.backfill', payload.id, result.ok ? `+${result.points}` : '失败')
      return result
    },
    2,
  )

  queue.register(
    'snapshot',
    async (payload) => {
      await services.scheduler.refreshSnapshots()
      await store.log(payload.userId ?? null, 'worker.snapshot', 'all', '完成')
      return { ok: true }
    },
    1,
  )

  queue.register(
    'backfill-all',
    async (payload) => {
      const result = await services.scheduler.tick('cloud:backfill-all')
      await store.log(payload.userId ?? null, 'worker.backfill-all', 'all', `${result.ok}/${result.total}`)
      return result
    },
    1,
  )

  queue.register(
    'wind-research',
    async (payload) => {
      const wind = services.wind
      if (!wind) return { ok: false, reason: 'Wind 客户端未装配' }
      const probed = await wind.probe()
      if (!probed.available) throw new Error(probed.reason ?? 'Wind 凭据不可得')

      const submitted = await wind.submit(String(payload.prompt ?? ''))
      if (!submitted.ok) throw new Error(submitted.error ?? '任务提交失败')

      // Alice 单次 2-15 分钟；这里轮询 5 分钟，超时保留 unstructured 结论
      const deadline = Date.now() + 5 * 60_000
      let markdown = ''
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20_000))
        const polled = await wind.poll(submitted.taskId)
        if (!polled.ok) continue
        markdown = wind.extractMarkdown(polled.result)
        if (markdown) break
      }
      const finding = wind.resolve(markdown || '研究任务超时，未取得可解析结论', submitted.taskId)
      await store.saveFinding(finding, payload.userId ?? null)
      await store.log(payload.userId ?? null, 'research.wind', submitted.taskId, finding.confidence)
      return finding
    },
    config?.windConcurrency ?? 2,
  )

  log('[cloud] workers 已注册：backfill / snapshot / backfill-all / wind-research')
}
