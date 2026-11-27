/**
 * 共享数据契约：本地单机与云端平台共用。
 *
 * 这里只放纯数据结构与常量，不依赖任何存储、框架或 Node API —— 浏览器可直接 import。
 * 万象的「每个数字标数据日期」「区分事实与推断」两条铁律在类型层面强制：
 * 任何进入 UI 的数据都必须带 meta，任何结论都必须带 confidence。
 */

/**
 * @template T
 * @typedef {{data: T, meta: SourceMeta}} Envelope
 */

/**
 * @typedef {{
 *   source: string,
 *   asOf: string|null,
 *   caliber?: string,
 *   stale?: boolean,
 *   degraded?: boolean,
 *   missing?: string[],
 *   note?: string,
 *   facts?: string[],
 *   inferences?: string[]
 * }} SourceMeta
 */

/** @typedef {'excellent'|'good'|'poor'|'severe'} RegimeBand */
/** @typedef {'high'|'medium'|'low'|'unstructured'} Confidence */

/**
 * Wind 等异步研究的统一结论结构。无法结构化时 confidence='unstructured'，
 * 此时 factors 为空，结论只能作为文档附件展示，不进入因子体系。
 *
 * @typedef {{
 *   id: string,
 *   subject: {type: 'equity'|'credit'|'fund'|'macro'|'industry', symbol?: string},
 *   framework: string,
 *   conclusion: string,
 *   factors: Array<{name: string, value: number|string, direction: 'positive'|'negative'|'neutral'}>,
 *   score?: number,
 *   confidence: Confidence,
 *   asOf: string,
 *   source: string,
 *   rawRef?: string
 * }} ResearchFinding
 */

/**
 * 本地 sidecar 与 Node 网关之间的 RPC 契约。
 * @typedef {{
 *   id: string,
 *   method: 'snapshot'|'kline'|'ticker'|'orderbook'|'brokerQueue'|'capitalFlow'|
 *           'optionChain'|'stockFilter'|'subscribe'|'accounts'|'portfolio'|
 *           'placeOrder'|'cancelOrder'|'ping',
 *   params: Record<string, any>,
 *   env?: 'SIMULATE'|'REAL'
 * }} SidecarCommand
 */

/**
 * @typedef {{ok: true, id: string, result: any, ms: number} |
 *           {ok: false, id: string, error: {code: string, message: string}, ms: number}} SidecarResponse
 */

/** @typedef {'lean'|'full'|'cloud'} RuntimeProfile */

/** 环境分数四档：与 airoom 的「优秀/良好/差/恶劣」映射保持一致。 */
export const BAND_LABEL = {
  excellent: { zh: '优秀', en: 'Excellent', action: '增持', color: '#30a46c' },
  good: { zh: '良好', en: 'Good', action: '持有', color: '#4078ff' },
  poor: { zh: '差', en: 'Poor', action: '卖出', color: '#f5a524' },
  severe: { zh: '恶劣', en: 'Severe', action: '卖出并等待', color: '#e5484d' },
}

export const BAND_ORDER = ['severe', 'poor', 'good', 'excellent']

/** @param {number|null|undefined} score @returns {RegimeBand|null} */
export function bandOf(score) {
  if (score == null || !Number.isFinite(score)) return null
  if (score >= 70) return 'excellent'
  if (score >= 55) return 'good'
  if (score >= 40) return 'poor'
  return 'severe'
}

/**
 * @template T
 * @param {T} data
 * @param {Partial<SourceMeta> & {source: string}} meta
 * @returns {Envelope<T>}
 */
export function envelope(data, meta) {
  return {
    data,
    meta: {
      source: meta.source,
      asOf: meta.asOf ?? null,
      ...(meta.caliber ? { caliber: meta.caliber } : {}),
      ...(meta.stale ? { stale: true } : {}),
      ...(meta.degraded ? { degraded: true } : {}),
      ...(meta.missing?.length ? { missing: meta.missing } : {}),
      ...(meta.note ? { note: meta.note } : {}),
      ...(meta.facts?.length ? { facts: meta.facts } : {}),
      ...(meta.inferences?.length ? { inferences: meta.inferences } : {}),
    },
  }
}

/** @returns {SourceMeta} */
export function noDataMeta(source, reason = '不可得') {
  return { source, asOf: null, degraded: true, missing: [reason] }
}

/**
 * 把自然语言结论收敛成 Finding 时的最小完整性校验。
 * @param {ResearchFinding} finding
 * @returns {string[]} 缺失项，空数组表示可用
 */
export function validateFinding(finding) {
  const missing = []
  if (!finding?.id) missing.push('id')
  if (!finding?.subject?.type) missing.push('subject.type')
  if (!finding?.conclusion) missing.push('conclusion')
  if (!finding?.asOf) missing.push('asOf（数据日期）')
  if (!finding?.source) missing.push('source（来源）')
  if (!finding?.confidence) missing.push('confidence（置信度）')
  if (finding?.confidence !== 'unstructured' && (!finding.factors || finding.factors.length === 0)) {
    missing.push('factors（结构化因子）')
  }
  return missing
}
