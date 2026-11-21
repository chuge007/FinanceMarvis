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
