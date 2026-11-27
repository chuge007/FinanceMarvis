/**
 * 本地回测接口：/api/v1/strategy/*
 *
 * 纪律：只做本地研究，不接实盘下单、不荐股、不给目标价。
 * 标的只用主源已落库的历史序列；样本不足/序列不可得时返回「缺」，不补模拟值。
 * 结果落 SQLite（或 JSONL 兜底）的 snapshot 表，重启不丢。
 */
import { envelope, sendError, sendJson } from '../http/respond.mjs'
import { readJsonBody } from '../http/middleware.mjs'
import {
  annualizedReturn,
  annualizedVol,
  maxDrawdownFromReturns,
  sharpeRatio,
  sortinoRatio,
  calmarRatio,
} from '../compute/factors.mjs'

const RUN_INDEX = 'strategy:runs:index'
const MAX_RUNS = 30
const ENGINE = 'ma-cross'
const TODAY = () => new Date().toISOString().slice(0, 10)

/** 可执行引擎只有一个：其余框架只展示能力，状态如实标 catalog-only / python-required。 */
function engineStatus(engine) {
  if (engine === ENGINE) return null
  return `引擎 ${String(engine ?? '').slice(0, 32)} 未接本地执行（仅展示能力，需 Python 依赖）`
}

function num(v, min, max, fallback) {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
}

/**
 * 日频 MA 交叉：t 日收盘算出信号，t+1 日收盘成交，避免未来函数。
 * 多头/空仓两态，不加杠杆、不做空、忽略滑点与手续费（口径在结果里写明）。
 */
function runMaCross(points, { fast, slow, rfDaily }) {
  // 主源把休市日存成 0、极端行情可能出现负价；比值收益无定义，显式跳过并计数，不插值、不补假值。
  const closes = points
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .map((p) => ({ date: p.date, close: p.value }))
  const skipped = points.length - closes.length
  if (closes.length < slow + 2) return null

  const sma = (i, n) => {
    if (i + 1 < n) return null
    let sum = 0
    for (let k = i - n + 1; k <= i; k += 1) sum += closes[k].close
    return sum / n
  }

  /** held[i] = 第 i 根收盘后是否持仓；收益从下一根开始吃。 */
  const held = closes.map(() => 0)
  let position = 0
  for (let i = 1; i < closes.length; i += 1) {
    const prevFast = sma(i - 1, fast)
    const prevSlow = sma(i - 1, slow)
    const curFast = sma(i, fast)
    const curSlow = sma(i, slow)
    if ([prevFast, prevSlow, curFast, curSlow].some((v) => v == null)) continue
    if (prevFast <= prevSlow && curFast > curSlow) position = 1
    else if (prevFast >= prevSlow && curFast < curSlow) position = 0
    held[i] = position
  }

  const returns = []
  const equity = [{ date: closes[0].date, value: 1 }]
  let nav = 1
  let trades = 0
  let wins = 0
  let entryNav = null
  for (let i = 1; i < closes.length; i += 1) {
    const r = held[i - 1] && closes[i - 1].close > 0 ? closes[i].close / closes[i - 1].close - 1 : 0
    if (!Number.isFinite(r)) continue
    returns.push(r)
    nav *= 1 + r
    equity.push({ date: closes[i].date, value: Math.round(nav * 10000) / 10000 })
    if (held[i] === 1 && held[i - 1] === 0) entryNav = nav
    if (held[i] === 0 && held[i - 1] === 1 && entryNav != null) {
      trades += 1
      if (nav > entryNav) wins += 1
      entryNav = null
    }
  }
  if (held[held.length - 1] === 1 && entryNav != null) {
    trades += 1
    if (nav > entryNav) wins += 1
  }
  if (returns.length < 20) return null

  return {
    engine: ENGINE,
    fast,
    slow,
    rfDaily,
    skipped,
    days: returns.length,
    trades,
    winRate: trades ? Math.round((wins / trades) * 1000) / 10 : null,
    totalReturn: (nav - 1) * 100,
    metrics: {
      annualizedReturn: annualizedReturn(returns),
      annualizedVol: annualizedVol(returns),
      maxDrawdown: maxDrawdownFromReturns(returns),
      sharpe: sharpeRatio(returns, rfDaily),
      sortino: sortinoRatio(returns),
      calmar: calmarRatio(returns),
    },
    equity,
  }
}

function pushIndex(db, summary) {
  const hit = db.getSnapshot(RUN_INDEX)
  const runs = Array.isArray(hit?.payload?.runs) ? hit.payload.runs : []
  const next = [summary, ...runs.filter((r) => r?.id !== summary.id)].slice(0, MAX_RUNS)
  db.putSnapshot(RUN_INDEX, { runs: next }, { ttl: 0 })
}

export function registerStrategyRoutes(router, { db, adapters }) {
  /** 可回测标的：主源已落库的日频序列，附样本数与口径。 */
  router.get('/api/v1/strategy/targets', (_req, res) => {
    const targets = adapters.series
      .filter((s) => s.freq === 'daily')
      .map((s) => {
        const cov = db.coverage(s.id)
        return {
          id: s.id,
          label: s.label,
          source: s.source,
          dataset: s.dataset,
          market: s.market,
          unit: s.unit ?? '',
          caliber: s.caliber ?? '',
          points: cov.points ?? 0,
          first: cov.first ?? null,
          last: cov.last ?? null,
        }
      })
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
    sendJson(res, 200, envelope(
      { targets },
      {
        source: 'local:strategy',
        asOf: TODAY(),
        note: '只用主源已落库的日频序列；points=0 表示本地无样本，不可回测',
      },
    ))
  })

  /** 执行回测并落库。 */
  router.post('/api/v1/strategy/backtest', async (req, res) => {
    let body = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendError(res, 400, 'BAD_REQUEST', '请求体不是合法 JSON')
      return
    }
    const blocked = engineStatus(body.engine)
    if (blocked) {
      sendError(res, 400, 'BAD_REQUEST', blocked)
      return
    }
    const target = adapters.series.find((s) => s.id === body.seriesId && s.freq === 'daily')
    if (!target) {
      sendError(res, 400, 'BAD_REQUEST', '标的不在日频主源序列注册表中')
      return
    }
    const fast = num(body.fast, 2, 120, 10)
    const slow = num(body.slow, fast + 1, 250, Math.min(250, fast + 20))
    const rfDaily = Number.isFinite(Number(body.rfDaily)) ? Number(body.rfDaily) : 0
    const points = db.getRange(target.id, body.start || null, body.end || null)
    const result = runMaCross(points, { fast, slow, rfDaily })
    if (!result) {
      sendJson(res, 200, envelope(
        { run: null },
        {
          source: 'local:strategy',
          asOf: body.end || TODAY(),
          degraded: true,
          missing: [`本地样本不足（${points.length} 点，至少需要 ${slow + 2} 点），不生成模拟回测`],
          note: '请先在「数据」页回填该序列，或缩短参数/扩大区间',
        },
      ))
      return
    }

    const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const run = {
      id,
      createdAt: new Date().toISOString(),
      seriesId: target.id,
      label: target.label,
      source: target.source,
      caliber: target.caliber ?? '',
      unit: target.unit ?? '',
      range: { start: points[0]?.date ?? null, end: points[points.length - 1]?.date ?? null },
      ...result,
      disclaimer: '本地研究工具：忽略滑点与手续费，满仓进出，不构成投资建议、不提供买卖点与目标价',
    }
    db.putSnapshot(`strategy:run:${id}`, run, { ttl: 0 })
    pushIndex(db, {
      id,
      createdAt: run.createdAt,
      seriesId: run.seriesId,
      label: run.label,
      fast,
      slow,
      totalReturn: run.totalReturn,
      metrics: run.metrics,
    })

    sendJson(res, 200, envelope(
      { run },
      {
        source: 'local:strategy',
        asOf: run.range.end,
        caliber: `${target.label} 主源日线；MA${fast}/${slow} 次日收盘成交；忽略滑点与手续费`,
        note: `结果已落本地历史库，重启不丢；${run.skipped} 根非正价/缺失点已跳过不插值；无风险利率口径：rfDaily 需显式标注（建议 FRED DFF ÷ 252）`,
      },
    ))
  })

  /** 历史回测列表（最近 30 次）。 */
  router.get('/api/v1/strategy/runs', (_req, res) => {
    const hit = db.getSnapshot(RUN_INDEX)
    const runs = Array.isArray(hit?.payload?.runs) ? hit.payload.runs : []
    sendJson(res, 200, envelope(
      { runs },
      { source: 'local:snapshot', asOf: runs[0]?.createdAt?.slice(0, 10) ?? null, note: `本地已落库 ${runs.length} 次回测` },
    ))
  })

  /** 单次回测详情。 */
  router.get('/api/v1/strategy/runs/:id', (_req, res, ctx) => {
    const hit = db.getSnapshot(`strategy:run:${ctx.params.id}`)
    if (!hit) {
      sendError(res, 404, 'NO_DATA', '回测记录不存在或已被清理')
      return
    }
    sendJson(res, 200, envelope(
      { run: hit.payload },
      { source: 'local:snapshot', asOf: hit.payload?.range?.end ?? null },
    ))
  })
}
