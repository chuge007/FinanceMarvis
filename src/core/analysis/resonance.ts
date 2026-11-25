/**
 * 四维共振：把散落的指标归并成四条主线，给一个可以直接核对的「几维偏风险」。
 *
 * 为什么不用加权总分：
 *  - 加权总分会被单一极端值带偏（VIX 飙一次就能把 87 分拉成 91 分），
 *    而用户没法验证 87 这个数是怎么来的；
 *  - 改成「四维各给一个方向 + 数几个同向」，用户能自己核对，也能在某一维
 *    数据缺失时清楚地知道少了一票，而不是被平均掉。
 *
 * 口径：
 *  - 每维内部先把可用的子项 Z 取平均，再压缩到 [-1, 1]（除以 1.5 后截断），
 *    避免单个 ±3σ 的极端值直接顶满；
 *  - Z > 0 一律代表「偏风险」方向（波动升高、信用走阔、美元走强、情绪过热），
 *    个别指标方向相反的在这里取负号，不留给 UI 判断；
 *  - 子项全缺 → 该维 missing，且不计入风险/宽松票数。
 */
import type { RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import type { StructureSnapshot } from '../data/structure';
import type { TermStructure } from '../../services/volTerm';
import type { OptionsSentimentSnapshot } from '../../types/sentiment';

export type ResonanceDimensionId = 'funding' | 'risk' | 'crowd' | 'structure';
export type ResonanceState = 'risk' | 'neutral' | 'loose' | 'missing';

export interface ResonanceEvidence {
  label: string;
  value: string;
  z: number | null;
}

export interface ResonanceDimension {
  id: ResonanceDimensionId;
  label: string;
  /** -1 偏宽松 … +1 偏风险；无可用子项时为 null。 */
  score: number | null;
  state: ResonanceState;
  evidence: ResonanceEvidence[];
}

export interface ResonanceResult {
  dimensions: ResonanceDimension[];
  riskCount: number;
  looseCount: number;
  neutralCount: number;
  missingCount: number;
  verdict: string;
  /** 四维里至少有一维有真实数据。 */
  available: boolean;
}

export interface ResonanceInput {
  snapshot: RhythmSnapshot | null;
  term: TermStructure | null;
  options: OptionsSentimentSnapshot | null;
  structure: StructureSnapshot | null;
}

const COMPRESS = 1.5;
const STATE_THRESHOLD = 0.33;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function compress(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return clamp(mean / COMPRESS, -1, 1);
}

function stateOf(score: number | null): ResonanceState {
  if (score === null) return 'missing';
  if (score >= STATE_THRESHOLD) return 'risk';
  if (score <= -STATE_THRESHOLD) return 'loose';
  return 'neutral';
}

/** 从宏观快照里取某个指标的 Z 与展示值；方向 sign 用于统一成「正 = 偏风险」。 */
function fromIndicator(
  snapshot: RhythmSnapshot | null,
  id: string,
  label: string,
  sign: 1 | -1 = 1,
  digits = 2,
): { z: number; evidence: ResonanceEvidence } | null {
  const reading = snapshot?.indicators.find((i) => i.id === id);
  if (!reading || reading.source !== 'real' || reading.z === null || reading.value === null) return null;
  return {
    z: reading.z * sign,
    evidence: {
      label,
      value: `${reading.value.toFixed(digits)}${reading.unit}`,
      z: reading.z,
    },
  };
}

function buildFunding(snapshot: RhythmSnapshot | null): ResonanceDimension {
  const items = [
    fromIndicator(snapshot, 'DTWEXBGS', '美元指数'),
    fromIndicator(snapshot, 'DGS10', '10 年美债收益率'),
  ].filter((x): x is { z: number; evidence: ResonanceEvidence } => x !== null);

  const score = compress(items.map((i) => i.z));
  return {
    id: 'funding',
    label: '资金价格',
    score,
    state: stateOf(score),
    evidence: items.map((i) => i.evidence),
  };
}

function buildRisk(snapshot: RhythmSnapshot | null, term: TermStructure | null): ResonanceDimension {
  const items: { z: number; evidence: ResonanceEvidence }[] = [];
  const vix = fromIndicator(snapshot, 'VIXCLS', 'VIX 波动率');
  if (vix) items.push(vix);
  const hyg = fromIndicator(snapshot, 'BAMLH0A0HYM2', '高收益信用利差');
  if (hyg) items.push(hyg);

  if (term && term.source === 'real' && term.latest !== null) {
    items.push({
      z: term.z ?? 0,
      evidence: {
        label: '期限结构 VIX/VIX3M',
        value: term.latest.toFixed(3),
        z: term.z,
      },
    });
  }

  const score = compress(items.map((i) => i.z));
  return {
    id: 'risk',
    label: '风险定价',
    score,
    state: stateOf(score),
    evidence: items.map((i) => i.evidence),
  };
}

function buildCrowd(
  snapshot: RhythmSnapshot | null,
  options: OptionsSentimentSnapshot | null,
): ResonanceDimension {
  const items: { z: number; evidence: ResonanceEvidence }[] = [];

  // 恐惧贪婪：数值越高越贪婪，贪婪本身是风险（+1 不改号）
  const fg = fromIndicator(snapshot, 'FG', '恐惧贪婪指数', 1, 1);
  if (fg) items.push(fg);

  // 全市场 Put/Call：高于常态区间 = 避险需求高 = 偏风险
  const total = options?.ratios.find((r) => r.key === 'TOTAL PUT/CALL RATIO' || /TOTAL/i.test(r.officialName));
  if (total && total.value !== null && total.norm) {
    const [lo, hi] = total.norm;
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2 || 1;
    const norm = (total.value - mid) / half;
    items.push({
      z: norm,
      evidence: { label: '全市场 Put/Call', value: total.value.toFixed(2), z: norm },
    });
  }

  const score = compress(items.map((i) => i.z));
  return {
    id: 'crowd',
    label: '人群行为',
    score,
    state: stateOf(score),
    evidence: items.map((i) => i.evidence),
  };
}

function buildStructure(structure: StructureSnapshot | null): ResonanceDimension {
  // 广度没有历史序列，只能用当期百分比直接映射：0% 全跌 = +1，100% 全涨 = -1
  if (!structure || structure.source !== 'real' || structure.breadth === null) {
    return { id: 'structure', label: '结构驱动', score: null, state: 'missing', evidence: [] };
  }
  const score = clamp((50 - structure.breadth) / 50, -1, 1);
  return {
    id: 'structure',
    label: '结构驱动',
    score,
    state: stateOf(score),
    evidence: [
      { label: '市场广度', value: `${structure.breadth.toFixed(1)}%`, z: null },
      ...(structure.dispersion !== null
        ? [{ label: '离散度', value: `${structure.dispersion.toFixed(2)}%`, z: null }]
        : []),
    ],
  };
}

export function buildResonance({ snapshot, term, options, structure }: ResonanceInput): ResonanceResult {
  const dimensions = [
    buildFunding(snapshot),
    buildRisk(snapshot, term),
    buildCrowd(snapshot, options),
    buildStructure(structure),
  ];

  const riskCount = dimensions.filter((d) => d.state === 'risk').length;
  const looseCount = dimensions.filter((d) => d.state === 'loose').length;
  const neutralCount = dimensions.filter((d) => d.state === 'neutral').length;
  const missingCount = dimensions.filter((d) => d.state === 'missing').length;
  const available = dimensions.some((d) => d.state !== 'missing');

  let verdict: string;
  if (!available) {
    verdict = '四维数据都不可用，今日不做判断。';
  } else if (riskCount >= 3) {
    verdict = `${riskCount} 维偏风险：只观察，不新增敞口。`;
  } else if (looseCount >= 3) {
    verdict = `${looseCount} 维偏宽松：环境友好，按既定计划执行，不追高。`;
  } else if (riskCount >= 2) {
    verdict = `${riskCount} 维偏风险、${looseCount} 维偏宽松：分歧状态，按规则执行，不加码。`;
  } else {
    verdict = `${riskCount} 维偏风险、${looseCount} 维偏宽松、${neutralCount} 维中性：没有共振，维持原计划。`;
  }
  if (missingCount > 0) verdict += `（${missingCount} 维缺数据，未计入）`;

  return { dimensions, riskCount, looseCount, neutralCount, missingCount, verdict, available };
}

/** 只取方向签名，供「共振翻转」检测使用（不参与展示）。 */
export function resonanceSignature(result: ResonanceResult | null): string {
  if (!result) return '';
  return result.dimensions.map((d) => `${d.id}:${d.state}`).join('|');
}
