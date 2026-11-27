/**
 * 共享体制判定：0-100 环境分数 + 四档信号 + 驱动因子。
 *
 * 界面上必须同时展示 airoom 第三方环境分数与这里自算的分数，两者各自标源，
 * 不可混为一谈（见方案 Implementation Notes）。
 */
import { bandOf } from './contracts.mjs'
import { percentileOf } from './factors.mjs'

/** 默认权重：信用 / 金融条件 / 波动 / 通胀预期 / A 股动量。 */
export const DEFAULT_WEIGHTS = {
  'fred:BAMLH0A0HYM2': { weight: 0.25, invert: true, label: '高收益债 OAS' },
  'fred:NFCI': { weight: 0.2, invert: true, label: '金融条件指数' },
  'yahoo:^VIX': { weight: 0.2, invert: true, label: 'VIX' },
  'fred:T10YIE': { weight: 0.1, invert: false, label: '通胀预期' },
  'cn:index:sh000300': { weight: 0.25, invert: false, label: '沪深 300 动量', momentum: 60 },
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

/**
 * @param {{getSeries:(id:string)=>Array<{date:string,value:number}>}} repo
 * @param {{market?:string, weights?:Record<string,any>}} [options]
 */
export function computeRegime(repo, options = {}) {
  const weights = options.weights ?? DEFAULT_WEIGHTS
  const drivers = []
  let weighted = 0
  let totalWeight = 0

  for (const [id, cfg] of Object.entries(weights)) {
    const points = repo.getSeries(id)
    if (!points.length) {
      drivers.push({ id, label: cfg.label, contribution: 0, value: null, note: '不可得' })
      continue
    }
    const clean = points.map((p) => p.value).filter(Number.isFinite)
    const latest = clean[clean.length - 1]

    let health
    if (cfg.momentum) {
      if (clean.length <= cfg.momentum) {
        drivers.push({ id, label: cfg.label, contribution: 0, value: latest, note: '样本不足' })
        continue
      }
      const prev = clean[clean.length - 1 - cfg.momentum]
      const pct = prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : 0
      health = clamp(50 + pct * 2.5, 0, 100)
    } else {
      const pct = percentileOf(clean.slice(-750), latest)
      if (pct == null) {
        drivers.push({ id, label: cfg.label, contribution: 0, value: latest, note: '样本不足' })
        continue
      }
      health = cfg.invert ? 100 - pct : pct
    }

    weighted += health * cfg.weight
    totalWeight += cfg.weight
    drivers.push({
      id,
      label: cfg.label,
      contribution: Math.round((health - 50) * cfg.weight * 10) / 10,
      value: Math.round(latest * 1000) / 1000,
      health: Math.round(health),
    })
  }

  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 10) / 10 : null
  drivers.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return {
    market: options.market ?? 'cn',
    score,
    band: bandOf(score),
    drivers,
    asOf: new Date().toISOString().slice(0, 10),
    source: 'compute:regime',
    coverage: `${drivers.filter((d) => d.value != null).length}/${drivers.length}`,
  }
}

/**
 * 把 airoom 第三方「优秀/良好/差/恶劣」映射到统一四档，但保留 source 标注。
 * @param {string} raw
 */
export function airoomBand(raw) {
  const map = { 优秀: 'excellent', 良好: 'good', 差: 'poor', 恶劣: 'severe' }
  return map[String(raw).trim()] ?? null
}
