/**
 * 共享组合算法：收益归因、配置漂移、定投核对。
 *
 * 逻辑来自万象 scripts/holdings.py 与 references/02 的规范，改为纯函数实现，
 * 本地与云端共用。归因口径：Brinson 简化版（allocation / selection / interaction）。
 */

/**
 * Brinson 简化归因（单期）。
 * @param {{weight:number, ret:number, benchWeight:number, benchRet:number}[]} sectors
 */
export function brinson(sectors) {
  let allocation = 0
  let selection = 0
  let interaction = 0
  let benchmark = 0
  let portfolio = 0

  for (const s of sectors) {
    const wp = Number(s.weight) || 0
    const wb = Number(s.benchWeight) || 0
    const rp = Number(s.ret) || 0
    const rb = Number(s.benchRet) || 0
    benchmark += wb * rb
    portfolio += wp * rp
    allocation += (wp - wb) * rb
    selection += wb * (rp - rb)
    interaction += (wp - wb) * (rp - rb)
  }

  const wpSum = sectors.reduce((a, s) => a + (Number(s.weight) || 0), 0)
  const wbSum = sectors.reduce((a, s) => a + (Number(s.benchWeight) || 0), 0)
  const warnings = []
  if (Math.abs(wpSum - 1) > 0.01) warnings.push(`组合权重合计 ${wpSum.toFixed(3)}，应为 1（小数口径）`)
  if (Math.abs(wbSum - 1) > 0.01) warnings.push(`基准权重合计 ${wbSum.toFixed(3)}，应为 1（小数口径）`)

  // 先算原始值并保留 excess 原值，最后统一 round，避免逐项舍入后对不上账
  const excess = portfolio - benchmark
  const result = {
    portfolio: round(portfolio * 100),
    benchmark: round(benchmark * 100),
    excess: round(excess * 100),
    allocation: round(allocation * 100),
    selection: round(selection * 100),
    interaction: round(interaction * 100),
    caliber: 'Brinson-BHB 简化版（未减基准总收益），权重须为小数且合计为 1',
    ...(warnings.length ? { warnings } : {}),
  }
  return result
}

/** 组合收益 = Σ(期初权重 × 区间收益)，返回百分数。 */
export function portfolioReturn(positions) {
  let total = 0
  for (const p of positions) {
    const w = Number(p.weight) || 0
    const r = Number(p.ret) || 0
    total += w * r
  }
  return round(total * 100)
}

/**
 * 配置漂移：实际 − 目标，单位 %。
 *
 * 阈值按 risk-manager 建议分档：
 *   大类资产 warn 2pp / breach 4pp（低波、换手成本高）
 *   单券与行业 warn 1.5pp / breach 3pp，并叠加相对阈值 20% / 50%，取更严者
 *
 * @param {Record<string, number>} actual 权重，单位 %
 * @param {Record<string, number>} target 权重，单位 %
 */
export function drift(actual, target, mode = 'asset') {
  const warnAbs = mode === 'single' ? 1.5 : 2
  const breachAbs = mode === 'single' ? 3 : 4
  const keys = Array.from(new Set([...Object.keys(actual), ...Object.keys(target)]))
  return keys
    .map((key) => {
      const a = Number(actual[key]) || 0
      const t = Number(target[key]) || 0
      const delta = round(a - t)
      const abs = Math.abs(delta)
      const relative = t !== 0 ? abs / Math.abs(t) : 0
      const relativeWarn = mode === 'single' && relative >= 0.2
      const relativeBreach = mode === 'single' && relative >= 0.5
      const level =
        abs >= breachAbs || relativeBreach ? 'breach' : abs >= warnAbs || relativeWarn ? 'warn' : 'ok'
      return { key, actual: a, target: t, delta, relative: round(relative), level }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

/** 集中度：前 N 大持仓权重和（单位 %）。 */
export function concentration(weights, topN = 5) {
  const values = Object.values(weights).map((v) => Number(v) || 0).sort((a, b) => b - a)
  return round(values.slice(0, topN).reduce((a, b) => a + b, 0))
}

/**
 * 定投核对：应投 vs 实投，定位漏投期。
 * 星期约定与 holdings.py 一致：1=周一 … 7=周日。
 * @param {{amount:number, weekday:number, startDate:string}} plan
 * @param {Array<{date:string, amount:number}>} actual
 */
export function dcaCheck(plan, actual, endDate = new Date().toISOString().slice(0, 10)) {
  const expected = []
  const start = Date.parse(`${plan.startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { expectedCount: 0, missing: [], actualTotal: 0, expectedTotal: 0 }

  let cursor = new Date(start)
  let guard = 0
  while (cursor.getTime() <= end && guard < 2000) {
    guard += 1
    const day = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay()
    if (day === Number(plan.weekday)) expected.push(cursor.toISOString().slice(0, 10))
    cursor = new Date(cursor.getTime() + 86400_000)
  }

  const done = new Set(actual.filter((a) => a.amount > 0).map((a) => a.date))
  const missing = expected.filter((d) => !done.has(d))
  const actualTotal = actual.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  return {
    expectedCount: expected.length,
    expectedTotal: expected.length * Number(plan.amount),
    actualTotal,
    missing,
  }
}

function round(v) {
  return Math.round(v * 1000) / 1000
}
