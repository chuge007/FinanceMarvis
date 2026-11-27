/**
 * 结构化置信度：解析来源决定结论能否进入因子体系。
 *
 * jsonBlock  → high（服务端按约定输出且通过 schema 校验）
 * table      → medium（从 Markdown 表格映射）
 * attachment → low（来自附件表头，字段可能歧义）
 * 失败       → unstructured（只作为文档附件，不得参与计算）
 */
import { validateFinding, envelope } from '../../core/domain/contracts.mjs'

export const CONFIDENCE_BY_SOURCE = {
  json: 'high',
  table: 'medium',
  attachment: 'low',
  none: 'unstructured',
}

/**
 * @param {any} candidate
 * @param {'json'|'table'|'attachment'} from
 * @param {{source:string, asOf:string, rawRef?:string}} base
 */
export function toFinding(candidate, from, base) {
  if (!candidate) return null
  const finding = {
    id: candidate.id ?? `${base.source}:${Date.now()}`,
    subject: candidate.subject ?? { type: 'equity' },
    framework: candidate.framework ?? '未标注框架',
    conclusion: String(candidate.conclusion ?? candidate.summary ?? '').slice(0, 4000),
    factors: Array.isArray(candidate.factors)
      ? candidate.factors
          .filter((f) => f && (f.name || f['指标']))
          .map((f) => ({
            name: String(f.name ?? f['指标']),
            value: f.value ?? f['数值'] ?? null,
            direction: ['positive', 'negative', 'neutral'].includes(f.direction) ? f.direction : 'neutral',
          }))
      : [],
    score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : undefined,
    confidence: CONFIDENCE_BY_SOURCE[from],
    asOf: candidate.asOf ?? base.asOf,
    source: base.source,
    ...(base.rawRef ? { rawRef: base.rawRef } : {}),
  }
  if (!finding.conclusion) return null
  // 表格/附件解析出的因子字段较少时不强求 factors，但仍降置信度
  const missing = validateFinding(finding).filter((m) => m !== 'factors（结构化因子）')
  if (missing.length) return null
  return finding
}

/** 三层都失败时返回一个不可结构的 Finding，前端只作为文档展示。 */
export function unstructuredFinding(markdown, base) {
  return {
    id: `${base.source}:${Date.now()}`,
    subject: { type: 'equity' },
    framework: '未结构化',
    conclusion: String(markdown ?? '').slice(0, 4000),
    factors: [],
    confidence: 'unstructured',
    asOf: base.asOf,
    source: base.source,
    ...(base.rawRef ? { rawRef: base.rawRef } : {}),
  }
}

/** 把 Finding 包成统一信封，并标注事实与推断的边界。 */
export function findingEnvelope(finding) {
  return envelope(
    { finding },
    {
      source: finding.source,
      asOf: finding.asOf,
      ...(finding.confidence === 'unstructured'
        ? { degraded: true, missing: ['结论未能结构化'], note: '仅作文档附件，不进入因子体系' }
        : {}),
      facts: finding.factors.map((f) => `${f.name}=${f.value}`),
      inferences: [finding.conclusion],
    },
  )
}
