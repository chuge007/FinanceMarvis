/**
 * 传导链：把“资金价格 → 风险定价 → 人群行为 → 结构轮动 → 我的位置”串成一条主线。
 *
 * 说明：
 *  - 节点分数是 0~100 的相对位置，不是涨跌概率；
 *  - 箭头是历史同步性（60 日滚动相关，用变化率算），不代表因果；
 *  - 没有历史的节点明确标记“数据不足”，不假装连通。
 */
import type { NormalizedSeries, RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import type { Position, PortfolioSummary } from '../../stores/usePortfolioStore';
import type { StructureSnapshot } from '../data/structure';
import type { LayerId } from '../metrics/registry';
import { avg, clampScore, corrChange, percentileNow, zDelta } from './series';

export type NodeStatus = 'normal' | 'high' | 'extreme' | 'low' | 'divergence' | 'missing';
export type NodeSource = 'real' | 'model' | 'unavailable';

export interface ChainNode {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  subtitle: string;
  score: number | null;
  /** 参与打分的分量覆盖度 0~1；低于 0.67 时标记“单项”，避免单指标高分被误读。 */
  coverage: number;
  valueLabel: string;
  sublabel: string;
  directionLabel: string;
  status: NodeStatus;
  source: NodeSource;
  spark: number[];
  detail: string;
  layer: LayerId;
  seriesIds: string[];
}

export interface ChainLink {
  from: 'A' | 'B' | 'C' | 'D';
  to: 'B' | 'C' | 'D' | 'E';
  value: number | null;
  label: string;
  note: string;
  /** corr = 相关系数；deviation = 仓位偏离（pp） */
  kind: 'corr' | 'deviation';
  flipped: boolean;
}

export interface ChainModel {
  nodes: ChainNode[];
  links: ChainLink[];
  narrative: string;
}

export interface ChainInput {
  snapshot: RhythmSnapshot | null;
  structure: StructureSnapshot | null;
  positions: Position[];
  summary: PortfolioSummary;
  targetEquityPct: number;
}

function seriesOf(snapshot: RhythmSnapshot | null, id: string): NormalizedSeries | null {
  return snapshot?.series?.[id] ?? null;
}

function pointsOf(snapshot: RhythmSnapshot | null, id: string) {
  return seriesOf(snapshot, id)?.points ?? [];
}

function pctOf(snapshot: RhythmSnapshot | null, id: string): number | null {
  return percentileNow(pointsOf(snapshot, id));
}

function latestValue(snapshot: RhythmSnapshot | null, id: string): number | null {
  const points = pointsOf(snapshot, id);
  return points.length ? points[points.length - 1].value : null;
}

function zSpark(snapshot: RhythmSnapshot | null, id: string, len = 60): number[] {
  return pointsOf(snapshot, id)
    .slice(-len)
    .map((p) => p.z)
    .filter((z): z is number => z !== null && Number.isFinite(z));
}

function valueSpark(snapshot: RhythmSnapshot | null, id: string, len = 60): number[] {
  return pointsOf(snapshot, id)
    .slice(-len)
    .map((p) => p.value)
    .filter((v) => Number.isFinite(v));
}

function statusOfScore(score: number | null): NodeStatus {
  if (score === null) return 'missing';
  if (score >= 80) return 'extreme';
  if (score >= 62) return 'high';
  if (score <= 25) return 'low';
  return 'normal';
}

function directionOf(change: number | null, unit = 'σ'): string {
  if (change === null) return '—';
  if (change > 0.15) return `↑ ${Math.abs(change).toFixed(1)}${unit}`;
  if (change < -0.15) return `↓ ${Math.abs(change).toFixed(1)}${unit}`;
  return '→ 走平';
}

function fmt(v: number | null, digits = 1, suffix = ''): string {
  return v === null ? '—' : `${v.toFixed(digits)}${suffix}`;
}

export function buildChain(input: ChainInput): ChainModel {
  const { snapshot, structure, positions, summary, targetEquityPct } = input;

  // A 资金价格：美元 + 10Y，越高越紧
  const aPcts = [pctOf(snapshot, 'DTWEXBGS'), pctOf(snapshot, 'DGS10')];
  const aScore = avg(aPcts);
  const aDelta = avg([zDelta(pointsOf(snapshot, 'DTWEXBGS')), zDelta(pointsOf(snapshot, 'DGS10'))]);
  const dxyValue = latestValue(snapshot, 'DTWEXBGS');
  const us10Value = latestValue(snapshot, 'DGS10');
  const nodeA: ChainNode = {
    id: 'A',
    title: '资金价格',
    subtitle: '钱贵不贵',
    score: aScore,
    coverage: aPcts.filter((v) => v !== null).length / 2,
    valueLabel: aScore === null ? '—' : `${Math.round(aScore)} / 100`,
    sublabel: `美元 ${fmt(dxyValue, 1)} · 10Y ${fmt(us10Value, 2, '%')}`,
    directionLabel: directionOf(aDelta),
    status: statusOfScore(aScore),
    source: aScore === null ? 'unavailable' : 'real',
    spark: zSpark(snapshot, 'DTWEXBGS'),
    detail: '美元走强、长端利率上行，都意味着资金变贵，风险资产的估值分母变大。',
    layer: 'environment',
    seriesIds: ['DTWEXBGS', 'DGS10'],
  };

  // B 风险定价：HY OAS + VIX + 期限利差（反向）
  const curvePct = pctOf(snapshot, 'T10Y2Y');
  const bPcts = [pctOf(snapshot, 'BAMLH0A0HYM2'), pctOf(snapshot, 'VIXCLS'), curvePct === null ? null : 100 - curvePct];
  const bScore = avg(bPcts);
  const curveDelta = zDelta(pointsOf(snapshot, 'T10Y2Y'));
  const bDelta = avg([
    zDelta(pointsOf(snapshot, 'BAMLH0A0HYM2')),
    zDelta(pointsOf(snapshot, 'VIXCLS')),
    curveDelta === null ? null : -curveDelta,
  ]);
  const hyValue = latestValue(snapshot, 'BAMLH0A0HYM2');
  const vixValue = latestValue(snapshot, 'VIXCLS');
  const nodeB: ChainNode = {
    id: 'B',
    title: '风险定价',
    subtitle: '风险贵不贵',
    score: bScore,
    coverage: bPcts.filter((v) => v !== null).length / 3,
    valueLabel: bScore === null ? '—' : `${Math.round(bScore)} / 100`,
    sublabel: `HY ${fmt(hyValue, 2, '%')} · VIX ${fmt(vixValue, 1)}`,
    directionLabel: directionOf(bDelta),
    status: statusOfScore(bScore),
    source: bScore === null ? 'unavailable' : 'real',
    spark: zSpark(snapshot, 'BAMLH0A0HYM2'),
    detail: '信用利差与波动率是市场为风险支付的价格；两者同向走阔，才是可信的防守信号。',
    layer: 'environment',
    seriesIds: ['BAMLH0A0HYM2', 'VIXCLS', 'T10Y2Y'],
  };

  // C 人群行为：恐惧贪婪的极端度
  const fgPoints = pointsOf(snapshot, 'FG');
  const fgValue = latestValue(snapshot, 'FG');
  const cScore = fgValue === null ? null : clampScore(Math.abs(fgValue - 50) * 2);
  const cDelta = zDelta(fgPoints);
  const fgText = fgValue === null ? '—' : fgValue >= 75 ? '贪婪' : fgValue <= 25 ? '恐惧' : '中性';
  const nodeC: ChainNode = {
    id: 'C',
    title: '人群行为',
    subtitle: '人挤不挤',
    score: cScore,
    coverage: fgValue === null ? 0 : 1,
    valueLabel: cScore === null ? '—' : `${Math.round(cScore)} / 100`,
    sublabel: `FG ${fmt(fgValue, 0)} · ${fgText}`,
    directionLabel: directionOf(cDelta),
    status: cScore === null ? 'missing' : cScore >= 70 ? 'extreme' : cScore >= 50 ? 'high' : 'normal',
    source: cScore === null ? 'unavailable' : 'real',
    spark: valueSpark(snapshot, 'FG'),
    detail: '情绪越极端，人群越站到一边；这时候检查仓位纪律，比预测反转更有用。',
    layer: 'environment',
    seriesIds: ['FG'],
  };

  // D 结构轮动：板块宽度 / 相对强弱
  const breadth = structure?.breadth ?? null;
  const outperf = structure?.items?.filter((i) => (i.rs20 ?? 0) > 0).length ?? 0;
  const totalSectors = structure?.items?.length ?? 0;
  const dDelta = structure?.items?.length
    ? avg(structure.items.map((i) => (i.rs5 !== null && i.rs20 !== null ? i.rs5 - i.rs20 : null)))
    : null;
  const nodeD: ChainNode = {
    id: 'D',
    title: '结构轮动',
    subtitle: '钱往哪走',
    score: breadth,
    coverage: structure?.source === 'real' ? 1 : 0,
    valueLabel: breadth === null ? '—' : `${Math.round(breadth)} / 100`,
    sublabel: totalSectors ? `${totalSectors} 个板块中 ${outperf} 个跑赢` : '板块数据不足',
    directionLabel: directionOf(dDelta, 'pp'),
    status: breadth === null ? 'missing' : breadth < 35 ? 'extreme' : breadth < 50 ? 'high' : 'normal',
    source: structure?.source === 'real' ? 'real' : 'unavailable',
    spark: [],
    detail: structure?.note ?? '板块数据不可用；不用演示值替代。',
    layer: 'structure',
    seriesIds: [],
  };

  // E 我的位置：权益偏离 + 集中度
  const totalAssets = summary.totalAssets;
  const hasPositions = positions.length > 0 && totalAssets > 0;
  const equityPct = hasPositions ? (summary.totalValue / totalAssets) * 100 : null;
  const gap = equityPct === null ? null : equityPct - targetEquityPct;
  const weights = positions.map((p) => p.weight).filter((w) => Number.isFinite(w) && w > 0);
  const maxWeight = weights.length ? Math.max(...weights) : 0;
  const hhi = weights.length ? weights.reduce((a, w) => a + (w / 100) ** 2, 0) : 0;
  const top3 = [...weights].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const eScore =
    gap === null ? null : clampScore(50 + gap * 2 + Math.max(0, maxWeight - 20) * 0.6 + Math.max(0, hhi * 100 - 15));
  const nodeE: ChainNode = {
    id: 'E',
    title: '我的位置',
    subtitle: '我站哪',
    score: eScore,
    coverage: equityPct === null ? 0 : 1,
    valueLabel: equityPct === null ? '—' : `${equityPct.toFixed(0)}%`,
    sublabel:
      equityPct === null
        ? '尚未录入持仓'
        : `目标 ${targetEquityPct.toFixed(0)}% · 偏离 ${gap !== null && gap >= 0 ? '+' : ''}${gap?.toFixed(1)}pp`,
    directionLabel: positions.length ? `${positions.length} 个持仓` : '—',
    status: eScore === null ? 'missing' : Math.abs(gap ?? 0) > 10 ? 'extreme' : Math.abs(gap ?? 0) > 5 ? 'high' : 'normal',
    source: equityPct === null ? 'unavailable' : 'real',
    spark: [],
    detail:
      equityPct === null
        ? '录入持仓后，这里会把你的仓位与目标带、集中度放在同一张图上。'
        : `前三大持仓 ${top3.toFixed(0)}% · 最大单票 ${maxWeight.toFixed(0)}% · 有效持仓约 ${hhi > 0 ? (1 / hhi).toFixed(1) : '—'} 个。`,
    layer: 'position',
    seriesIds: [],
  };

  // 箭头：用变化率算相关，避免水平值造成的虚假高相关
  const ab = corrChange(pointsOf(snapshot, 'DTWEXBGS'), pointsOf(snapshot, 'BAMLH0A0HYM2'), 60, 60);
  const bc = corrChange(pointsOf(snapshot, 'VIXCLS'), pointsOf(snapshot, 'FG'), 60, 60);
  const deValue = gap;
  const links: ChainLink[] = [
    {
      from: 'A',
      to: 'B',
      value: ab.current,
      label: ab.current === null ? '—' : ab.current.toFixed(2),
      note: '美元 ↔ 信用利差 · 60日',
      kind: 'corr',
      flipped: ab.flipped,
    },
    {
      from: 'B',
      to: 'C',
      value: bc.current,
      label: bc.current === null ? '—' : bc.current.toFixed(2),
      note: 'VIX ↔ 情绪 · 60日',
      kind: 'corr',
      flipped: bc.flipped,
    },
    {
      from: 'C',
      to: 'D',
      value: null,
      label: '—',
      note: '板块历史需本地累积',
      kind: 'corr',
      flipped: false,
    },
    {
      from: 'D',
      to: 'E',
      value: deValue,
      label: deValue === null ? '—' : `${deValue >= 0 ? '+' : ''}${deValue.toFixed(1)}pp`,
      note: '主线 vs 仓位偏离',
      kind: 'deviation',
      flipped: false,
    },
  ];

  const aCoverage = aPcts.filter((v) => v !== null).length / 2;
  const bCoverage = bPcts.filter((v) => v !== null).length / 3;
  const narrative = [
    aScore === null
      ? '资金价格数据不足'
      : aCoverage < 0.67
        ? `资金价格单项${aScore >= 62 ? '偏高' : aScore <= 38 ? '偏低' : '中性'}（覆盖不足）`
        : aScore >= 62 ? '钱在变贵' : aScore <= 38 ? '钱在变松' : '资金价格中性',
    bScore === null
      ? '风险定价数据不足'
      : bCoverage < 0.67
        ? `风险定价单项${bScore >= 62 ? '偏高' : bScore <= 38 ? '偏低' : '中性'}（覆盖不足）`
        : bScore >= 62 ? '风险在变贵' : bScore <= 38 ? '风险在变便宜' : '风险定价中性',
    cScore === null ? '情绪数据不足' : cScore >= 70 ? '人群走向极端' : '人群情绪中性',
    breadth === null ? '结构数据不足' : breadth < 40 ? '结构收窄' : breadth > 60 ? '结构扩散' : '结构分化',
    gap === null ? '尚未录入仓位' : Math.abs(gap) > 5 ? `仓位偏离目标 ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}pp` : '仓位在目标带内',
  ].join(' → ');

  return {
    nodes: [nodeA, nodeB, nodeC, nodeD, nodeE],
    links,
    narrative,
  };
}
