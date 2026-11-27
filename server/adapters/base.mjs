/**
 * 适配器契约与通用工具。
 *
 * 新增数据源 = 新增一个 SeriesDef（或一组），声明 id / 来源 / 频率 / 口径 / 抓取函数，
 * 注册表、调度、历史库、API、档案页会自动认识它。不再需要改代理、改前端。
 */

/**
 * @typedef {'intraday'|'daily'|'weekly'|'monthly'|'quarterly'} Frequency
 * @typedef {{date:string, value:number, extra?:Record<string,any>}} Point
 * @typedef {{
 *   id:string, label:string, source:string, dataset:string, market:string,
 *   freq:Frequency, unit?:string, caliber?:string, ttlSec?:number,
 *   fetch:(ctx:AdapterContext)=>Promise<Point[]>
 * }} SeriesDef
 * @typedef {{
 *   transport: ReturnType<typeof import('../upstream/transport.mjs').createTransport>,
 *   config: any, log: (m:string)=>void
 * }} AdapterContext
 */

/** 默认 TTL：按频率给，避免日频指标被 30s 轮询反复抓。 */
export const FREQ_TTL = {
  intraday: 15,
  daily: 900,
  weekly: 21600,
  monthly: 43200,
  quarterly: 86400,
}

export function defineSeries(def) {
  return {
    ttlSec: def.ttlSec ?? FREQ_TTL[def.freq] ?? 900,
    caliber: def.caliber ?? '',
    unit: def.unit ?? '',
    ...def,
  }
}

/** 两列 CSV（date,value），FRED 与财政部都用这个形状；"." 视为缺失不插值。 */
export function parseTwoColCsv(text) {
  if (!text) return []
  const out = []
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim()
    if (!row) continue
    const comma = row.indexOf(',')
    if (comma <= 0) continue
    const date = row.slice(0, comma).trim()
    const raw = row.slice(comma + 1).trim().replace(/"/g, '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    out.push({ date, value })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** 截断到最近 n 个点，回填时用大 n，日常刷新用小 n。 */
export function tail(points, n) {
  return n > 0 ? points.slice(-n) : points
}

/** 统一错误收敛：抓取失败返回空数组并记日志，绝不抛给调度器。 */
export async function safeFetch(label, fn, log) {
  try {
    return await fn()
  } catch (err) {
    log?.(`[adapter] ${label} 抓取失败: ${err?.message ?? err}`)
    return []
  }
}
