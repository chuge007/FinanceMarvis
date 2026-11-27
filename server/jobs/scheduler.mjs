/**
 * 抓取调度器：按频率分组、全局并发闸门、失败退避、断点续跑。
 *
 * 三条纪律：
 *  1. 单源串行 —— 同一上游并发会触发反爬（东财/FRED 都实测过）；
 *  2. 全局并发 4 —— 首屏不抢占，回填不卡住界面；
 *  3. 失败不重试烧配额 —— 429/402 直接进入冷却，等下一轮自然刷新。
 */

const FREQ_INTERVAL_MS = {
  intraday: 30_000,
  daily: 15 * 60_000,
  weekly: 6 * 3600_000,
  monthly: 12 * 3600_000,
  quarterly: 24 * 3600_000,
}

/** 允许的滞后（用于判断「今天该不该再抓」）：非交易日不追。 */
const FREQ_MAX_LAG_DAYS = {
  intraday: 0,
  daily: 1,
  weekly: 7,
  monthly: 31,
  quarterly: 92,
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity
  return Math.abs(tb - ta) / 86400000
}

export function createScheduler({ db, adapters, transport, config, log, health, dataSidecar }) {
  const state = new Map()
  let running = false
  const timers = []

  for (const def of adapters.series) {
    state.set(def.id, { def, lastRun: 0, failures: 0, nextAllowed: 0 })
  }

  function setState(id, patch) {
    const prev = state.get(id)
    if (prev) state.set(id, { ...prev, ...patch })
  }

  async function runWithLimit(tasks, limit = 4) {
    const queue = [...tasks]
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (;;) {
        const task = queue.shift()
        if (!task) return
        await task()
      }
    })
    await Promise.all(workers)
  }

  async function fetchOne(def) {
    const started = Date.now()
    let raw = null
    try {
      raw = await def.fetch({ transport, config, log, dataSidecar })
    } catch (err) {
      raw = null
      log(`[scheduler] ${def.id} 抓取异常：${err?.message ?? err}`)
    }
    // 适配器可以返回数组（单源），也可以返回 { points, source }（主备链降级后要标实际来源）
    const points = Array.isArray(raw) ? raw : (raw?.points ?? [])
    const usedSource = (!Array.isArray(raw) && raw?.source) || def.source
    const took = Date.now() - started

    if (!Array.isArray(points) || points.length === 0) {
      health?.record(def.source, false, null, '本轮无数据')
      db.recordIngest({ sourceId: def.source, dataset: def.dataset, points: 0, ok: false, error: '无数据' })
      const failures = (state.get(def.id)?.failures ?? 0) + 1
      setState(def.id, { failures, nextAllowed: Date.now() + Math.min(30 * 60_000, 2 ** failures * 30_000) })
      return { id: def.id, ok: false, points: 0, took, failures }
    }

    const written = db.writePoints(def.id, points)
    const last = points[points.length - 1]
    db.upsertSeries({
      id: def.id,
      source: usedSource,
      symbol: def.id.split(':').slice(1).join(':'),
      label: def.label,
      market: def.market,
      freq: def.freq,
      unit: def.unit,
      caliber: def.caliber,
      firstTs: Math.floor(Date.parse(`${points[0].date}T00:00:00Z`) / 1000),
      lastTs: Math.floor(Date.parse(`${last.date}T00:00:00Z`) / 1000),
    })
    db.recordIngest({ sourceId: usedSource, dataset: def.dataset, points: written, ok: true })
    health?.record(usedSource, true, took, usedSource === def.source ? null : `已降级到 ${usedSource}`)
    setState(def.id, { lastRun: Date.now(), failures: 0, nextAllowed: 0, lastSource: usedSource })
    return { id: def.id, ok: true, points: written, took, last: last.date, source: usedSource }
  }

  function needsRefresh(def) {
    const s = state.get(def.id)
    if (!s) return false
    const now = Date.now()
    if (now < s.nextAllowed) return false
    if (now - s.lastRun < (FREQ_INTERVAL_MS[def.freq] ?? FREQ_INTERVAL_MS.daily)) {
      // 时间没到，但历史可能还没补齐（首次启动）
      const cov = db.coverage(def.id)
      if (cov.points > 0) return false
    }
    const cov = db.coverage(def.id)
    if (cov.points === 0) return true
    const lag = daysBetween(cov.last, today())
    return lag > (FREQ_MAX_LAG_DAYS[def.freq] ?? 1)
  }

  /** 抓一轮：只抓「该抓」的，避免每轮全量。 */
  async function tick(reason = 'interval') {
    if (running) return { skipped: true }
    running = true
    const started = Date.now()
    const targets = adapters.series.filter(needsRefresh)
    log(`[scheduler] ${reason} 开始，待抓 ${targets.length}/${adapters.series.length}`)

    const results = []
    const bySource = new Map()
    for (const def of targets) {
      const list = bySource.get(def.source) ?? []
      list.push(def)
      bySource.set(def.source, list)
    }

    // 单源串行，源间并发
    const tasks = [...bySource.values()].map((defs) => async () => {
      for (const def of defs) results.push(await fetchOne(def))
    })
    await runWithLimit(tasks, 4)

    await refreshSnapshots()

    running = false
    const ok = results.filter((r) => r.ok).length
    log(`[scheduler] ${reason} 完成：成功 ${ok}/${results.length}，耗时 ${Date.now() - started}ms`)
    return { total: results.length, ok, results }
  }

  /** 快照抓取：首屏要用，所以启动时先跑这一轮，不等序列回填。 */
  async function refreshSnapshots() {
    for (const snap of adapters.snapshots) {
      try {
        const payload = await snap.fetch({ transport, config, log, dataSidecar })
        db.putSnapshot(snap.id, payload, { ttl: snap.ttlSec ?? 300 })
      } catch (err) {
        log(`[scheduler] 快照 ${snap.id} 失败：${err?.message ?? err}`)
      }
    }
  }

  function start() {
    // 先抓快照（今日页/地形页首屏就要用），再跑序列回填
    void refreshSnapshots().then(() => tick('startup'))
    for (const [freq, interval] of Object.entries(FREQ_INTERVAL_MS)) {
      const t = setInterval(() => {
        const has = adapters.series.some((d) => d.freq === freq)
        if (has) void tick(freq)
      }, interval)
      t.unref?.()
      timers.push(t)
    }
    // 快照单独高频刷新（盘中宽度/资金流要快）
    const snapTimer = setInterval(() => {
      void refreshSnapshots()
    }, 120_000)
    snapTimer.unref?.()
    timers.push(snapTimer)
  }

  function stop() {
    for (const t of timers) clearInterval(t)
    timers.length = 0
  }

  function status() {
    const values = [...state.values()]
    /** 按源汇总连续失败次数：用于「某个源整体不可用」的告警，而不是逐条序列刷屏。 */
    const failuresBySource = {}
    for (const s of values) {
      if (!s.failures) continue
      failuresBySource[s.def.source] = Math.max(failuresBySource[s.def.source] ?? 0, s.failures)
    }
    return {
      running,
      total: adapters.series.length,
      failing: values.filter((s) => s.failures > 0).length,
      failuresBySource,
      lastRuns: values
        .filter((s) => s.lastRun > 0)
        .map((s) => ({ id: s.def.id, lastRun: new Date(s.lastRun).toISOString(), failures: s.failures, source: s.lastSource })),
    }
  }

  return { start, stop, tick, status, fetchOne, needsRefresh, refreshSnapshots }
}
