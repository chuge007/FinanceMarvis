/**
 * 共享风险规则：VaR / CVaR / Sharpe / Sortino / 回撤 / 限额检查。
 *
 * 全部为纯函数，能力边界：历史模拟法，不假设正态；样本不足返回 null，
 * 严禁在缺样本时用估算值顶替（万象铁律 3）。
 */
import { mean, stdev, maxDrawdownFromReturns } from './factors.mjs'

/**
 * 历史模拟 VaR，返回正数表示潜在损失百分比。
 * 样本 <100 时尾部只有 1-2 个观测，统计上不可信，返回 null（不静默放行）。
 */
/** @param {number[]} returns */
export function historicalVaR(returns, level = 0.95, periodsPerYear = 252) {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 100) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((1 - level) * sorted.length) - 1))
  // 收益率需先按周期数折算到年化口径的 VaR：σ√T；这里只做尺度换算，不改历史分布形状
  const scale = Math.sqrt(Math.max(1, periodsPerYear / 252))
  return round(Math.abs(sorted[idx]) * 100 * scale)
}

/** CVaR：超出 VaR 部分的平均损失。样本 <250 时尾部过薄，返回 null。 */
/** @param {number[]} returns */
export function historicalCVaR(returns, level = 0.95) {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 250) return null
  const sorted = [...clean].sort((a, b) => a - b)
  const cut = Math.max(2, Math.ceil((1 - level) * sorted.length))
  const tail = sorted.slice(0, cut)
  return round(Math.abs(mean(tail)) * 100)
}

/**
 * @param {number[]} returns 周期收益率（0.01 = 1%）
 * @param {number} [rf] 同周期无风险利率
 */
export function sharpe(returns, rf = 0, periodsPerYear = 252) {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 30) return null
  const excess = clean.map((r) => r - rf)
  const s = stdev(excess)
  if (!s || s === 0) return null
  return round((mean(excess) / s) * Math.sqrt(periodsPerYear))
}

/** @param {number[]} returns */
export function sortino(returns, target = 0, periodsPerYear = 252) {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 30) return null
  const downside = clean.map((r) => Math.min(0, r - target))
  const variance = downside.reduce((a, b) => a + b * b, 0) / downside.length
  if (!variance) return null
  return round(((mean(clean) - target) / Math.sqrt(variance)) * Math.sqrt(periodsPerYear))
}

export function maxDrawdown(returns) {
  const clean = returns.filter(Number.isFinite)
  if (clean.length < 2) return null
  return round(maxDrawdownFromReturns(clean))
}

/**
 * 赫芬达尔指数：权重单位 %，返回 0-1；>0.25 相当于有效持仓不足 4 只。
 * @param {Record<string, number>} weights
 */
export function hhi(weights) {
  const vals = Object.values(weights).map((v) => Number(v) || 0)
  const total = vals.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  return round(vals.reduce((a, w) => a + (w / total) ** 2, 0))
}

/** 有效持仓数 N_eff = 1/HHI。 */
/** @param {Record<string, number>} weights */
export function effectiveN(weights) {
  const h = hhi(weights)
  return h && h > 0 ? round(1 / h) : null
}

/**
 * 限额检查。所有阈值与权重单位均为 %（pairs 里的 correlation 为 -1~1）。
 *
 * 关键纪律：样本不足时返回 `unverified` 而不是静默通过 —— 「没数据」不等于「没风险」。
 *
 * limits 示例：
 *   { maxDrawdown:20, var95:15, maxSingleWeight:25, maxSectorWeight:40,
 *     minCash:5, maxHHI:0.25, maxCorrelation:0.75, liquidityFactor:0.5 }
 */
/**
 * @param {{weights?:Record<string,number>, sectorWeights?:Record<string,number>, cash?:number,
 *         returns?:number[], pairs?:Array<Record<string,any>>, adv?:Record<string,number>,
 *         marketValues?:Record<string,number>}} [portfolio]
 * @param {Record<string, number|undefined>} [limits]
 */
export function checkLimits(
  { weights = {}, sectorWeights = {}, cash = 0, returns = [], pairs = [], adv = {}, marketValues = {} } = {},
  limits = {},
) {
  const violations = []
  const unverified = []
  const totalWeight = Object.values(weights).reduce((a, w) => a + (Number(w) || 0), 0)
  const weightSum = round(totalWeight + (Number(cash) || 0))

  if (Math.abs(weightSum - 100) > 1) {
    violations.push({ rule: 'weightSum', actual: weightSum, limit: 100, level: 'breach', note: '权重+现金应约等于100%' })
  }
  for (const [symbol, w] of Object.entries(weights)) {
    if (Number(w) < 0) violations.push({ rule: 'noNegativeWeight', symbol, actual: Number(w), level: 'breach' })
  }

  const dd = maxDrawdown(returns)
  const vr = historicalVaR(returns)
  if (limits.maxDrawdown != null) {
    if (dd == null) unverified.push({ rule: 'maxDrawdown', reason: '收益样本不足' })
    else if (Math.abs(dd) > limits.maxDrawdown) {
      violations.push({ rule: 'maxDrawdown', actual: Math.abs(dd), limit: limits.maxDrawdown, level: 'breach' })
    }
  }
  if (limits.var95 != null) {
    if (vr == null) unverified.push({ rule: 'var95', reason: '样本 <100，尾部不可信' })
    else if (vr > limits.var95) {
      violations.push({ rule: 'var95', actual: vr, limit: limits.var95, level: 'breach' })
    }
  }

  for (const [symbol, w] of Object.entries(weights)) {
    if (limits.maxSingleWeight != null && Number(w) > limits.maxSingleWeight) {
      violations.push({ rule: 'maxSingleWeight', symbol, actual: Number(w), limit: limits.maxSingleWeight, level: 'breach' })
    }
  }
  for (const [sector, w] of Object.entries(sectorWeights)) {
    if (limits.maxSectorWeight != null && Number(w) > limits.maxSectorWeight) {
      violations.push({ rule: 'maxSectorWeight', sector, actual: Number(w), limit: limits.maxSectorWeight, level: 'breach' })
    }
  }

  const concentration = hhi(weights)
  if (limits.maxHHI != null && concentration != null && concentration > limits.maxHHI) {
    violations.push({ rule: 'concentration', actual: concentration, limit: limits.maxHHI, level: 'breach', note: '有效持仓不足 4 只' })
  }

  // 相关性拥挤：相关系数高且合计权重过半时预警
  const maxCorr = limits.maxCorrelation ?? 0.75
  for (const pair of pairs) {
    if (Number(pair.correlation) > maxCorr && (Number(pair.weightA) || 0) + (Number(pair.weightB) || 0) > 30) {
      violations.push({
        rule: 'correlationCrowding',
        pair: `${pair.a}/${pair.b}`,
        actual: Number(pair.correlation),
        limit: maxCorr,
        level: 'warn',
      })
    }
  }

  // 流动性变现：ADV 打 5 折压力下，单券市值不得超过 1 天折后成交额
  const factor = limits.liquidityFactor ?? 0.5
  for (const [symbol, value] of Object.entries(marketValues)) {
    const daily = Number(adv[symbol])
    if (!Number.isFinite(daily) || daily <= 0) continue
    const days = Number(value) / (daily * factor)
    if (days > 1) {
      violations.push({ rule: 'liquidity', symbol, actual: round(days), limit: 1, level: 'warn', note: '折后需超过1天变现' })
    }
  }

  if (limits.minCash != null && Number(cash) < limits.minCash) {
    violations.push({ rule: 'minCash', actual: Number(cash), limit: limits.minCash, level: 'warn' })
  }

  return {
    violations,
    unverified,
    summary: { weightSum, hhi: concentration, effectiveN: effectiveN(weights) },
  }
}

/** 风险指标一次性汇总，缺样本字段为 null 并在 missing 中标出（不给估算值）。 */
/** @param {number[]} returns */
export function riskSummary(returns) {
  const metrics = {
    var95: historicalVaR(returns),
    cvar95: historicalCVaR(returns),
    sharpe: sharpe(returns),
    sortino: sortino(returns),
    maxDrawdown: maxDrawdown(returns),
    samples: returns.filter(Number.isFinite).length,
  }
  const missing = Object.entries(metrics)
    .filter(([k, v]) => k !== 'samples' && v == null)
    .map(([k]) =>
      k === 'var95' ? 'var95（需≥100个样本）' : k === 'cvar95' ? 'cvar95（需≥250个样本）' : k,
    )
  return { metrics, missing, verified: missing.length === 0 }
}

function round(v) {
  return Math.round(v * 1000) / 1000
}
