/**
 * 今日动作：由可见规则触发，只给「检查 / 留意 / 记录」，不给买卖点。
 *
 * 设计原则：
 *  - 每条动作都能点回触发它的数据；
 *  - 没有触发时，明确告诉用户「今天不需要做事」；
 *  - 阈值写在这里，并在 UI 上公示，不做黑箱。
 */
import type { RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import type { Position, PortfolioSummary } from '../../stores/usePortfolioStore';
import type { Plan } from '../../services/investmentPlan';
import type { LastRegimeState } from '../../modules/rhythm/components/RegimeCard';
import type { LayerId } from '../metrics/registry';
import type { ResonanceResult } from './resonance';
import type { CalendarEvent } from './calendar';
import { zDelta } from './series';

export type ActionKind = 'check' | 'watch' | 'data' | 'record';

export interface ActionItem {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string;
  trigger: string;
  layer: LayerId;
  seriesIds: string[];
}

export interface ActionInput {
  snapshot: RhythmSnapshot | null;
  positions: Position[];
  summary: PortfolioSummary;
  plan: Plan;
  marketLabel: string;
  /** 上一次打开时记录的体制；由页面在写入本次之前读取一次。 */
  lastRegime: LastRegimeState | null;
  /** 四维共振结果；缺省时跳过 R9，保持对既有调用方兼容。 */
  resonance?: ResonanceResult | null;
  /** 近期可确定的交割/再平衡日；缺省时跳过 R10。 */
  calendar?: CalendarEvent[] | null;
}

export function buildActions({
  snapshot,
  positions,
  summary,
  plan,
  marketLabel,
  lastRegime,
  resonance,
  calendar,
}: ActionInput): ActionItem[] {
  const out: ActionItem[] = [];
  if (!snapshot) return out;

  const last = lastRegime;
  const tone = snapshot.regime.tone;
  const confidence = snapshot.regime.confidence;

  // R7 数据陈旧（先判断，避免用过期数据给结论）
  const stale = snapshot.indicators
    .filter((i) => i.source === 'real' && i.freshnessDays !== null && (i.freshnessDays as number) > 7)
    .map((i) => i.name);
  if (stale.length) {
    out.push({
      id: 'R7',
      kind: 'data',
      title: '数据过期，今日结论降级',
      detail: `${stale.slice(0, 3).join('、')}${stale.length > 3 ? ' 等' : ''} 已超过 7 天未更新。`,
      trigger: '新鲜度 > 7 天',
      layer: 'environment',
      seriesIds: [],
    });
  }

  // R1 体制切换
  if (last && last.tone !== tone && confidence >= 40) {
    out.push({
      id: 'R1',
      kind: 'check',
      title: `市场体制从「${last.tone}」变为「${tone}」`,
      detail: `上次记录是 ${last.date}。检查单笔风险预算是否仍按旧体制设定，尤其是新增敞口。`,
      trigger: `体制变化 · 置信度 ${confidence}%`,
      layer: 'environment',
      seriesIds: ['VIXCLS', 'BAMLH0A0HYM2'],
    });
  }

  // R2 权益偏离（没有持仓时不谈“再平衡”）
  if (summary.totalAssets > 0 && positions.length > 0) {
    const equity = (summary.totalValue / summary.totalAssets) * 100;
    const gap = equity - plan.equityPct;
    if (Math.abs(gap) > 5) {
      out.push({
        id: 'R2',
        kind: 'check',
        title: `权益仓位 ${equity.toFixed(1)}%，偏离目标 ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}pp`,
        detail: `目标 ${plan.equityPct}%，偏离超过 5pp 阈值。到「决策 → 仓位纪律」看再平衡清单，不需要立刻交易。`,
        trigger: '|权益 − 目标| > 5pp',
        layer: 'position',
        seriesIds: [],
      });
    }

    // R3 集中度
    const weights = positions.map((p) => p.weight).filter((w) => Number.isFinite(w) && w > 0);
    const maxWeight = weights.length ? Math.max(...weights) : 0;
    const hhi = weights.length ? weights.reduce((a, w) => a + (w / 100) ** 2, 0) : 0;
    if (maxWeight > 25 || hhi > 0.25) {
      out.push({
        id: 'R3',
        kind: 'check',
        title: `持仓集中度偏高：最大单票 ${maxWeight.toFixed(0)}%`,
        detail:
          hhi > 0.25
            ? `HHI ${hhi.toFixed(2)}，有效持仓约 ${(1 / hhi).toFixed(1)} 个。检查单一标的的风险是否超过你的承受范围。`
            : '单票权重超过 25%，检查止损与单一事件风险是否可承受。',
        trigger: '最大权重 > 25% 或 HHI > 0.25',
        layer: 'position',
        seriesIds: [],
      });
    }
  }

  // R5 信用-波动背离
  const hy = snapshot.series['BAMLH0A0HYM2']?.points ?? [];
  const vix = snapshot.series['VIXCLS']?.points ?? [];
  const dHy = zDelta(hy);
  const dVix = zDelta(vix);
  if (dHy !== null && dVix !== null) {
    const divergence = dHy - dVix;
    if (divergence > 0.8) {
      out.push({
        id: 'R5',
        kind: 'watch',
        title: '信用利差在走阔，VIX 没有跟随',
        detail: `20 日 Z 变化差 +${divergence.toFixed(1)}σ。这是「信用先走、波动未跟」的背离，历史上不必然下跌，先留意，不触发动作。`,
        trigger: 'Δz(HY) − Δz(VIX) > 0.8σ',
        layer: 'environment',
        seriesIds: ['BAMLH0A0HYM2', 'VIXCLS'],
      });
    }
  }

  // R6 情绪极端
  const fg = snapshot.series['FG']?.points ?? [];
  const fgValue = fg.length ? fg[fg.length - 1].value : null;
  if (fgValue !== null && (fgValue >= 85 || fgValue <= 15)) {
    out.push({
      id: 'R6',
      kind: 'watch',
      title: `情绪读数 ${fgValue.toFixed(0)}，处于极端区`,
      detail: fgValue >= 85 ? '极度贪婪：检查是否在追高、是否还有未执行的减仓规则。' : '极度恐惧：检查是否在恐慌中破坏既定计划，不用「跌得多」当买入理由。',
      trigger: 'FG ≥ 85 或 ≤ 15',
      layer: 'environment',
      seriesIds: ['FG'],
    });
  }

  // R9 四维共振：只有三票以上同向才算数，两票及以下属于分歧，不新增噪音
  if (resonance && resonance.available) {
    if (resonance.riskCount >= 3) {
      out.push({
        id: 'R9',
        kind: 'check',
        title: `四个维度里 ${resonance.riskCount} 维偏风险`,
        detail: `${resonance.verdict}先检查现有敞口是否超出你设定的风险预算，再决定要不要动；不因为「看着要跌」提前砍仓。`,
        trigger: `四维共振 · 风险 ${resonance.riskCount} 票`,
        layer: 'environment',
        seriesIds: ['VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS'],
      });
    } else if (resonance.looseCount >= 3) {
      out.push({
        id: 'R9',
        kind: 'watch',
        title: `四个维度里 ${resonance.looseCount} 维偏宽松`,
        detail: '环境友好不等于可以加码：按既定计划执行，检查是否因为「感觉不错」临时放大仓位。',
        trigger: `四维共振 · 宽松 ${resonance.looseCount} 票`,
        layer: 'environment',
        seriesIds: ['VIXCLS', 'BAMLH0A0HYM2'],
      });
    }
  }

  // R10 交割/再平衡日临近：波动放大与基本面无关，提前提示不要临时改仓位
  if (calendar && calendar.length) {
    const imminent = calendar.find(
      (e) =>
        e.daysAway <= 1 &&
        (e.kind === 'opex' ||
          e.kind === 'quadWitching' ||
          e.kind === 'cnFutures' ||
          e.kind === 'cnOption' ||
          e.kind === 'fomc'),
    );
    if (imminent) {
      out.push({
        id: 'R10',
        // 议息决议是事件级别的方向风险，按「检查」处理；交割日只按「留意」处理
        kind: imminent.kind === 'fomc' ? 'check' : 'watch',
        title: `${imminent.label}${imminent.daysAway === 0 ? '就在今天' : '在明天'}`,
        detail: `${imminent.detail}这类日子的波动放大与基本面无关，按既定规则执行，不要因为盘面急躁临时改仓位。`,
        trigger: `事件日历 · ${imminent.date}`,
        layer: 'environment',
        seriesIds: [],
      });
    }
  }

  // R8 没有动作
  if (!out.length) {
    out.push({
      id: 'R8',
      kind: 'record',
      title: '今天没有需要做的事',
      detail: `${marketLabel}环境与你的仓位都没有触发检查阈值。不交易也是决定，记录一句「为什么不动」。`,
      trigger: '所有规则均未触发',
      layer: 'position',
      seriesIds: [],
    });
  }

  const priority: Record<ActionKind, number> = { check: 0, watch: 1, data: 2, record: 3 };
  return out.sort((a, b) => priority[a.kind] - priority[b.kind]).slice(0, 3);
}
