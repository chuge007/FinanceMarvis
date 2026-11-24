/**
 * 序列统计工具：把「绝对值」变成「相对位置」。
 *
 * 面向普通投资者的节奏判断，关键不是"VIX 等于 18"而是"18 在近一年里算高还是低"。
 * 这里只做纯数学，不产生任何数据；所有输入必须来自真实上游序列。
 */

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function stdDev(values: number[]): number | null {
  const m = mean(values)
  if (m === null || values.length < 2) return null
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** 当前值在历史序列中的百分位（0~100，含当前值本身）。 */
export function percentileOf(values: number[], current: number): number | null {
  if (values.length < 8) return null
  const below = values.filter((v) => v <= current).length
  return clamp((below / values.length) * 100, 0, 100)
}

/** 当前值相对历史均值偏离多少个标准差。 */
export function zScore(values: number[], current: number): number | null {
  const m = mean(values)
  const sd = stdDev(values)
  if (m === null || sd === null || sd === 0) return null
  return (current - m) / sd
}

/**
 * 近 window 个观测均值 vs 前 window 个观测均值的变化率。
 * 用于判断"这个指标正在往哪个方向走"，正数=上升。
 */
export function trendSlope(values: number[], window = 20): number | null {
  if (values.length < window * 2) return null
  const recent = mean(values.slice(-window))
  const previous = mean(values.slice(-window * 2, -window))
  if (recent === null || previous === null || previous === 0) return null
  return (recent - previous) / Math.abs(previous)
}

/** 把月度 CPI 指数水平序列换算成同比序列（需要至少 13 个月）。 */
export function toYearOverYear(values: number[]): number[] {
  const out: number[] = []
  for (let i = 12; i < values.length; i++) {
    const base = values[i - 12]
    if (base !== 0) out.push(((values[i] - base) / Math.abs(base)) * 100)
  }
  return out
}

/** 距今天数；无法解析返回 null。 */
export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

/**
 * 滚动 Z-score：每个点只用「截至当天」的窗口，避免未来函数。
 * 用于把不同量级的序列叠加到同一条 Z 轴上。
 */
export function rollingZScores(values: number[], window = 250): (number | null)[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - window + 1)
    return zScore(values.slice(from, i + 1), values[i])
  })
}

/** Pearson 相关系数；样本不足或方差为 0 返回 null。 */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 3) return null
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  if (ma === null || mb === null) return null
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb
    num += x * y; da += x * x; db += y * y
  }
  if (da === 0 || db === 0) return null
  return clamp(num / Math.sqrt(da * db), -1, 1)
}

/** 秩转换（Spearman 用）；并列值取平均秩。 */
function ranks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg
    i = j + 1
  }
  return out
}

/** Spearman 秩相关；对极端值比 Pearson 稳健。 */
export function spearman(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 3) return null
  return pearson(ranks(a.slice(0, n)), ranks(b.slice(0, n)))
}

/** 取两条序列截至末尾的滚动窗口相关系数。 */
export function rollingCorrelation(
  a: number[],
  b: number[],
  window = 60,
  method: 'pearson' | 'spearman' = 'pearson',
): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 3) return null
  const from = Math.max(0, n - window)
  const fn = method === 'spearman' ? spearman : pearson
  return fn(a.slice(from, n), b.slice(from, n))
}

/** 滞后 k：b 提前 k 期与 a 比较，返回各 lag 的相关曲线。 */
export function crossCorrelation(a: number[], b: number[], maxLag = 30, method: 'pearson' | 'spearman' = 'pearson') {
  const fn = method === 'spearman' ? spearman : pearson
  const out: { lag: number; corr: number | null }[] = []
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const len = Math.min(a.length, b.length) - Math.abs(lag)
    if (len < 10) { out.push({ lag, corr: null }); continue }
    if (lag >= 0) out.push({ lag, corr: fn(a.slice(lag, lag + len), b.slice(0, len)) })
    else out.push({ lag, corr: fn(a.slice(0, len), b.slice(-lag, -lag + len)) })
  }
  return out
}
