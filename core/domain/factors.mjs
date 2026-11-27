/**
 * 共享因子计算：分位、Z、相关性、比价、收益与波动。
 *
 * 从 server/compute/factors.mjs 上移为领域内核，本地 SQLite 版与云端 PG 版
 * 调用同一份公式，避免出现「页面 A 的分位和页面 B 的分位不是一回事」。
 * 纯函数、无副作用、无外部依赖。
 */

/** @param {number[]} values */
export function mean(values) {
  const clean = values.filter((x) => Number.isFinite(x))
  if (!clean.length) return null
  return clean.reduce((a, b) => a + b, 0) / clean.length
}

/** @param {number[]} values */
export function stdev(values) {
  const clean = values.filter((x) => Number.isFinite(x))
  if (clean.length < 2) return null
  const m = mean(clean)
  const variance = clean.reduce((a, b) => a + (b - m) ** 2, 0) / (clean.length - 1)
  return Math.sqrt(variance)
}

/**
 * 分位（0-100）。样本 < 20 返回 null：小样本分位没有统计意义。
 * @param {number[]} values
 * @param {number} v
 */
export function percentileOf(values, v) {
  const clean = values.filter((x) => Number.isFinite(x))
  if (clean.length < 20 || !Number.isFinite(v)) return null
  let below = 0
  for (const x of clean) if (x <= v) below += 1
  return Math.round((below / clean.length) * 1000) / 10
}

/** @param {number[]} values @param {number} v */
export function zScore(values, v) {
  const clean = values.filter((x) => Number.isFinite(x))
  if (clean.length < 20 || !Number.isFinite(v)) return null
  const m = mean(clean)
  const s = stdev(clean)
  if (!s || s === 0) return null
  return Math.round(((v - m) / s) * 100) / 100
}

/** 将 1d/5d/20d/60d/1y 语义换算成点数。 */
export function pointsForWindow(label) {
  if (typeof label === 'number') return label
  const m = String(label).match(/^(\d+)([dwmy])$/)
  if (!m) return 1
  const n = Number(m[1])
  if (m[2] === 'd') return n
  if (m[2] === 'w') return n * 5
  if (m[2] === 'm') return n * 21
  return n * 252
}

/**
 * @param {Array<{date:string,value:number}>} points
 * @param {number|string} n
 */
export function changeOf(points, n = 1) {
  const clean = points.filter((p) => Number.isFinite(p.value))
  if (clean.length < 2) return null
  const window = pointsForWindow(n)
  if (clean.length <= window) return null
  const cur = clean[clean.length - 1].value
  const prev = clean[clean.length - 1 - window].value
  return { absolute: cur - prev, pct: prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null, window: n }
}

/**
 * 两条序列按日期对齐后的对数收益 Pearson 相关。
 * @param {Array<{date:string,value:number}>} a
 * @param {Array<{date:string,value:number}>} b
 */
export function rollingCorrelation(a, b, window = 60) {
  const mapB = new Map(b.filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]))
  const pairs = []
  for (const p of a) {
    if (!Number.isFinite(p.value)) continue
    const vb = mapB.get(p.date)
    if (Number.isFinite(vb) && vb > 0 && p.value > 0) pairs.push([p.value, vb])
  }
  if (pairs.length < window + 2) return null
  const slice = pairs.slice(-window - 1)
  const ra = []
  const rb = []
  for (let i = 1; i < slice.length; i++) {
    ra.push(Math.log(slice[i][0] / slice[i - 1][0]))
    rb.push(Math.log(slice[i][1] / slice[i - 1][1]))
  }
  const ma = mean(ra)
  const mb = mean(rb)
  if (ma == null || mb == null) return null
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb)
    va += (ra[i] - ma) ** 2
    vb += (rb[i] - mb) ** 2
  }
  if (va === 0 || vb === 0) return null
  return Math.round((cov / Math.sqrt(va * vb)) * 1000) / 1000
}

/**
 * 按日期对齐的比价序列（金银比、金油比、铜金比等）。
 * @param {Array<{date:string,value:number}>} a
 * @param {Array<{date:string,value:number}>} b
 */
export function ratioSeries(a, b, { convert = 1, label = '' } = {}) {
  const mapB = new Map(b.filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]))
  const out = []
  for (const p of a) {
    if (!Number.isFinite(p.value)) continue
    const vb = mapB.get(p.date)
    if (!Number.isFinite(vb) || vb === 0) continue
    out.push({ date: p.date, value: (p.value * convert) / vb, label })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

/** @param {number[]} returns */
export function annualizedVol(returns) {
  const s = stdev(returns)
  return s == null ? null : s * Math.sqrt(252)
}

/** @param {number[]} returns */
export function maxDrawdownFromReturns(returns) {
  let equity = 1
  let peak = 1
  let worst = 0
  for (const r of returns) {
    if (!Number.isFinite(r)) continue
    equity *= 1 + r
    if (equity > peak) peak = equity
    const dd = equity / peak - 1
    if (dd < worst) worst = dd
  }
  return worst * 100
}

/** 年化收益：几何口径，日频固定 √252 年化因子；缺失点跳过，不插值。 */
export function annualizedReturn(returns) {
  const clean = returns.filter((r) => Number.isFinite(r))
  if (!clean.length) return null
  const equity = clean.reduce((acc, r) => acc * (1 + r), 1)
  if (!Number.isFinite(equity) || equity <= 0) return null
  return Math.pow(equity, 252 / clean.length) - 1
}

/**
 * 夏普比率：(年化收益 − 无风险利率) / 年化波动。
 * @param {number[]} returns 日收益率序列
 * @param {number} [riskFreeDaily] 日频无风险利率；建议用 FRED DFF ÷ 252，必须显式标注口径
 */
export function sharpeRatio(returns, riskFreeDaily = 0) {
  const annReturn = annualizedReturn(returns)
  const vol = annualizedVol(returns)
  const rf = Number.isFinite(riskFreeDaily) ? riskFreeDaily * 252 : 0
  if (annReturn == null || vol == null || vol === 0) return null
  return (annReturn - rf) / vol
}

/**
 * 索提诺比率：(年化收益 − 目标收益) / 下行波动。
 * @param {number} [targetDaily] 日频目标收益，默认 0，需在界面标注
 */
export function sortinoRatio(returns, targetDaily = 0) {
  const annReturn = annualizedReturn(returns)
  const clean = returns.filter((r) => Number.isFinite(r))
  if (annReturn == null || !clean.length) return null
  const target = Number.isFinite(targetDaily) ? targetDaily : 0
  const downside = clean.filter((r) => r < target).map((r) => r - target)
  if (!downside.length) return null
  const dd = Math.sqrt(downside.reduce((sum, r) => sum + r * r, 0) / clean.length) * Math.sqrt(252)
  if (!Number.isFinite(dd) || dd === 0) return null
  return (annReturn - target * 252) / dd
}

/** 卡玛比率：年化收益 / |最大回撤|；回撤用净值序列而非收益率近似。 */
export function calmarRatio(returns) {
  const annReturn = annualizedReturn(returns)
  const dd = maxDrawdownFromReturns(returns)
  if (annReturn == null || !Number.isFinite(dd) || dd === 0) return null
  return annReturn / Math.abs(dd / 100)
}

/**
 * @param {Array<{date:string,value:number}>} points
 */
export function summarize(points) {
  const clean = points.filter((p) => Number.isFinite(p.value))
  if (!clean.length) return null
  const values = clean.map((p) => p.value)
  const last = clean[clean.length - 1]
  return {
    latest: last.value,
    asOf: last.date,
    points: clean.length,
    percentile: percentileOf(values, last.value),
    z: zScore(values, last.value),
    change1d: changeOf(clean, 1),
    change20d: changeOf(clean, 20),
  }
}
