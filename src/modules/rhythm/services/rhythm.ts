/**
 * 市场节奏引擎：只用真实上游历史序列做「相对位置」判断，不产生任何模拟数据。
 *
 * 设计原则（面向普通投资者）：
 *  1. 绝对值没有意义 —— 一律换算成历史分位 / Z-score / 方向；
 *  2. 明确标注每个指标是领先 / 同步 / 滞后，滞后指标只用于确认、不用于择时；
 *  3. 数据缺失就显示缺失并降低置信度，绝不编造；
 *  4. 输出是「风险预算倾向」而非买卖建议，且不预测收益。
 *
 * 数据源：ConvexTrade（/convex 同域转发，真实 FRED/CBOE 序列）+ alternative.me 恐惧贪婪指数。
 */
import { convexApi, fngApi } from '../../../services/api';
import { clamp, percentileOf, zScore, trendSlope, toYearOverYear, daysSince, rollingZScores } from '../../../shared/utils/seriesStats';

export type Phase = '领先' | '同步' | '滞后' | '情绪·同步';
export type Tone = '进攻' | '均衡' | '防守' | '观望';

export interface SeriesPoint { date: string; value: number }

export interface SeriesConfig {
  id: string;
  name: string;
  unit: string;
  dimension: string;
  phase: Phase;
  weight: number;
  limit: number;
  frequency: '日度' | '月度';
  higherIsRisk: boolean;
  transform?: 'cpiYoY';
  scoreMode?: 'neutral';
  explanation: string;
  howTo: string;
  pitfall: string;
}

export const CONFIG: SeriesConfig[] = [
  {
    id: 'VIXCLS', name: 'VIX 波动率指数', unit: '', dimension: '波动', phase: '同步',
    weight: 0.20, limit: 250, frequency: '日度', higherIsRisk: true,
    explanation: '期权市场对未来 30 天标普 500 波动的预期，俗称「恐慌指数」。数值高 = 市场愿意为保护付更多钱。',
    howTo: '看它在近一年里的分位，而不是看绝对值。分位突然抬升时，先降低换手，等它回落。',
    pitfall: '它是同步指标，描述当下、不预测反转时点；低 VIX 也可能长期维持，不等于「可以加仓」。',
  },
  {
    id: 'BAMLH0A0HYM2', name: '高收益债信用利差 (HY OAS)', unit: '%', dimension: '信用', phase: '领先',
    weight: 0.22, limit: 250, frequency: '日度', higherIsRisk: true,
    explanation: '低评级公司债相对国债多付的利息。企业借钱变难时先在这里反应，常被当作股市的预警。',
    howTo: '利差从低位持续走阔，往往先于股市承压；与波动率同向恶化时，防守信号更可信。',
    pitfall: '「领先」是经验归纳而非定时承诺，也会因发行结构、流动性出现假信号（学界对此有争议）。',
  },
  {
    id: 'T10Y2Y', name: '10Y-2Y 期限利差', unit: '%', dimension: '曲线', phase: '领先',
    weight: 0.12, limit: 250, frequency: '日度', higherIsRisk: false,
    explanation: '长债减短债的收益率差。倒挂（小于 0）历史上常出现在衰退之前。',
    howTo: '把「是否倒挂」和「是否正在回升」一起看；倒挂后重新陡峭化，往往才是压力显现的阶段。',
    pitfall: '倒挂到衰退的时滞常见估计为 6~18 个月，口径差异大、有假信号，不能当倒计时用。',
  },
  {
    id: 'DGS10', name: '10 年期美债收益率', unit: '%', dimension: '利率', phase: '同步',
    weight: 0.08, limit: 250, frequency: '日度', higherIsRisk: true,
    explanation: '全球资产定价的「基准利率」，越高越压制高估值资产的估值。',
    howTo: '快速上行比绝对水平更重要；与信用利差同时恶化时，风险资产压力通常更明显。',
    pitfall: '利率上行有时来自增长改善，不能单独当作看空理由。',
  },
  {
    id: 'DTWEXBGS', name: '美元指数 (广义)', unit: '', dimension: '流动性', phase: '同步',
    weight: 0.08, limit: 250, frequency: '日度', higherIsRisk: true,
    explanation: '美元相对一篮子货币的强弱。美元快速走强常对应全球美元流动性收紧。',
    howTo: '作为跨资产一致性的旁证：美元、信用利差、波动率同向走弱时才算风险偏好改善。',
    pitfall: '美元也受避险与利差预期驱动，单看方向容易误读。',
  },
  {
    id: 'FG', name: '恐惧贪婪指数', unit: '', dimension: '情绪', phase: '情绪·同步',
    weight: 0.15, limit: 365, frequency: '日度', higherIsRisk: true,
    explanation: 'alternative.me 的多因子情绪合成值，0 = 极度恐惧，100 = 极度贪婪。',
    howTo: '极端读数提示「人群已经站到一边」，此时最该做的是检查仓位纪律，而不是跟着加码。',
    pitfall: '官方方法论明确它描述当下、不预测反转；极端贪婪可以持续很久，抄底摸顶都危险。',
  },
  {
    id: 'CPIAUCSL', name: 'CPI 同比', unit: '%', dimension: '通胀', phase: '滞后',
    weight: 0.08, limit: 132, frequency: '月度', higherIsRisk: true, transform: 'cpiYoY',
    explanation: '消费者物价的同比涨幅，由月度 CPI 指数自行换算得到。',
    howTo: '用来确认「政策为什么这么定」，不要用来判断下周涨跌。',
    pitfall: '典型滞后指标，且常被修订；公布当天的追涨杀跌是普通人最常见的节奏错误。',
  },
  {
    id: 'UNRATE', name: '失业率', unit: '%', dimension: '就业', phase: '滞后',
    weight: 0.07, limit: 120, frequency: '月度', higherIsRisk: false, scoreMode: 'neutral',
    explanation: '劳动力市场松紧程度，属于经济周期的滞后确认指标。',
    howTo: '只作为事后确认：低失业率常出现在周期后段，不能理解成「可以追高」。',
    pitfall: '滞后且方向容易误读，本引擎让它保持中性，不参与状态打分。',
  },
];

export interface IndicatorReading {
  id: string;
  name: string;
  dimension: string;
  phase: Phase;
  unit: string;
  value: number | null;
  percentile: number | null;
  z: number | null;
  slope: number | null;
  observations: number;
  asOf: string | null;
  freshnessDays: number | null;
  source: 'real' | 'missing';
  frequency: '日度' | '月度';
  score: number | null;
  weight: number;
  explanation: string;
  howTo: string;
  pitfall: string;
}

export interface RegimeResult {
  tone: Tone;
  score: number | null;
  confidence: number;
  summary: string;
  reasons: string[];
  action: string;
  confirm: string;
  avoid: string;
  riskBudget: string;
  available: number;
  total: number;
  asOf: string | null;
}

/** 归一化后的原始序列：供叠加图、相关性矩阵与体制回溯使用，全部只含真实上游点。 */
export interface NormalizedSeries {
  id: string;
  name: string;
  phase: Phase;
  frequency: '日度' | '月度';
  unit: string;
  weight: number;
  points: { date: string; value: number; z: number | null }[];
}

export interface RhythmSnapshot {
  indicators: IndicatorReading[];
  regime: RegimeResult;
  series: Record<string, NormalizedSeries>;
  fetchedAt: string;
}

// 独立缓存：避开 services/api.ts 中按 seriesId 缓存短序列（limit=2）造成的污染
const cache = new Map<string, { ts: number; data: SeriesPoint[] }>();

async function loadConvex(id: string, limit: number): Promise<SeriesPoint[]> {
  const key = `${id}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < 60_000) return hit.data;
  try {
    const { data } = await convexApi.get(`/data/${id}`, { params: { limit, format: 'json' }, timeout: 10_000 });
    const arr: SeriesPoint[] = Array.isArray(data?.data)
      ? data.data
          .filter((p: { date?: string; value?: number }) => p && p.date && typeof p.value === 'number' && Number.isFinite(p.value))
          .map((p: { date: string; value: number }) => ({ date: String(p.date), value: Number(p.value) }))
      : [];
    cache.set(key, { ts: Date.now(), data: arr });
    return arr;
  } catch {
    return [];
  }
}

async function loadFearGreed(): Promise<SeriesPoint[]> {
  const hit = cache.get('FG:365');
  if (hit && Date.now() - hit.ts < 60_000) return hit.data;
  try {
    const { data } = await fngApi.get('/fng/', { params: { limit: 365, format: 'json' }, timeout: 12_000 });
    const list = Array.isArray(data?.data) ? data.data : [];
    // alternative.me 返回最新在前，转成时间升序
    const arr: SeriesPoint[] = list
      .map((d: { value?: string | number; timestamp?: string | number }) => ({
        date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10),
        value: Number(d.value),
      }))
      .filter((p: SeriesPoint) => Number.isFinite(p.value))
      .reverse();
    cache.set('FG:365', { ts: Date.now(), data: arr });
    return arr;
  } catch {
    return [];
  }
}

export function scoreOf(cfg: SeriesConfig, value: number, pct: number | null, slope: number | null): number | null {
  if (cfg.scoreMode === 'neutral') return 50;
  if (pct === null) return null;
  let base: number;
  if (cfg.id === 'T10Y2Y') {
    base = value < 0 ? 28 : 45 + pct * 0.5;
  } else if (cfg.id === 'FG') {
    base = 100 - Math.abs(value - 50) * 1.4;
  } else {
    base = cfg.higherIsRisk ? 100 - pct : pct;
  }
  if (slope !== null && Math.abs(slope) > 0.05) {
    const adverse = cfg.higherIsRisk ? slope > 0 : slope < 0;
    base += adverse ? -8 : 6;
  }
  return clamp(base, 0, 100);
}

function describeTrend(slope: number | null): string {
  if (slope === null) return '方向数据不足';
  if (slope > 0.05) return '近期上行';
  if (slope < -0.05) return '近期回落';
  return '近期基本走平';
}

const TONE_TEXT: Record<Tone, { summary: string; action: string; confirm: string; avoid: string; riskBudget: string }> = {
  进攻: {
    summary: '波动、信用与情绪多数处在历史温和区，风险环境相对友好。倾向于按既定计划执行，而不是临时加大押注。',
    action: '按写好的计划执行，不因单日上涨临时提高风险预算；每笔交易仍要预设止损。',
    confirm: '确认条件：信用利差未走阔、VIX 分位仍低于 60，且两者至少维持数日。',
    avoid: '避免在情绪读数进入极端贪婪后追高；「环境好」不等于「不会亏」。',
    riskBudget: '维持常规单笔风险预算（常见做法是账户的 1%~2%，见纪律页计算器）。',
  },
  均衡: {
    summary: '多空信号不完全一致，属于典型「没有明确方向」的阶段。倾向于维持既定节奏，等待领先与同步指标同向。',
    action: '维持目标配置，把精力放在检查清单与复盘，而不是寻找新的入场理由。',
    confirm: '确认条件：领先指标（信用利差、期限利差）与同步指标（VIX、情绪）出现同向变化。',
    avoid: '避免因为「看不懂」而频繁试仓；震荡阶段的过度交易是收益缺口的主要来源之一。',
    riskBudget: '维持常规单笔风险预算；若近期连续未按规则执行，先降低换手。',
  },
  防守: {
    summary: '波动或信用压力处于历史偏高区，这类环境历史上回撤更频繁。倾向于先控风险预算，再讨论机会。',
    action: '降低新增敞口与换手频率；已有持仓按事先写好的止损与再平衡规则处理。',
    confirm: '确认条件：VIX 分位回落至 60 以下，且信用利差停止走阔，再考虑恢复常规节奏。',
    avoid: '避免在恐慌日临时抄底、也不要在滞后数据（CPI/失业率）公布当天追涨杀跌。',
    riskBudget: '可把单笔风险预算下调一档（如 1% → 0.5%），并暂停加杠杆。',
  },
  观望: {
    summary: '多项风险指标同时处在历史极端区，状态判断本身也可能不稳定。倾向于降低换手、减少新增敞口。',
    action: '只做计划内的必要调整；把「不操作」也当作一种明确的决定并记录下来。',
    confirm: '确认条件：至少两个领先指标企稳，且波动率从极端区连续回落。',
    avoid: '避免用杠杆「摊薄成本」、避免因为跌得多就认为「便宜」；极端状态可以持续很久。',
    riskBudget: '暂停新开仓，先完成一次复盘；恢复条件写在复盘记录里，而不是临场决定。',
  },
};

function buildRegime(indicators: IndicatorReading[]): RegimeResult {
  const scored = indicators.filter((i) => i.source === 'real' && i.score !== null);
  const totalWeight = CONFIG.reduce((a, c) => a + c.weight, 0);
  const usedWeight = scored.reduce((a, i) => a + i.weight, 0);
  if (!scored.length || usedWeight <= 0) {
    return {
      tone: '观望', score: null, confidence: 0,
      summary: '真实数据当前不可用（上游不可达或未返回序列），因此不给出状态判断。请稍后刷新；此时任何结论都不可靠。',
      reasons: ['所有指标均未取到真实历史序列，引擎拒绝用模拟值代替。'],
      action: '先确认网络与代理状态，不要依据空白判断做决策。',
      confirm: '等待数据恢复后重新计算。',
      avoid: '不要用其它页面上标注为「模型估算 / 演示」的数字替代真实数据。',
      riskBudget: '数据不足时维持原计划，不新增风险敞口。',
      available: 0, total: indicators.length, asOf: null,
    };
  }

  const weighted = scored.reduce((a, i) => a + (i.score as number) * i.weight, 0) / usedWeight;
  const score = clamp(weighted, 0, 100);
  const tone: Tone = score >= 70 ? '进攻' : score >= 55 ? '均衡' : score >= 40 ? '防守' : '观望';

  // 置信度 = 数据覆盖度 × 新鲜度
  const days = indicators
    .filter((i) => i.source === 'real' && i.freshnessDays !== null)
    .map((i) => i.freshnessDays as number)
    .sort((a, b) => a - b);
  const medianDays = days.length ? days[Math.floor(days.length / 2)] : 999;
  const freshFactor = medianDays <= 7 ? 1 : medianDays <= 30 ? 0.85 : medianDays <= 90 ? 0.65 : 0.4;
  const confidence = Math.round(clamp((usedWeight / totalWeight) * 100, 0, 100) * freshFactor);

  const reasons = scored.map((i) => {
    const fmt = i.value === null ? '—' : i.value.toFixed(i.unit === '%' ? 2 : 1);
    return `${i.name} ${fmt}${i.unit}，位于近 ${i.observations} 个观测的 ${i.percentile === null ? '—' : Math.round(i.percentile)}% 分位，${describeTrend(i.slope)}（${i.phase}）。`;
  });
  const missing = indicators.filter((i) => i.source === 'missing').map((i) => i.name);
  if (missing.length) reasons.push(`未取到真实数据、未计入判断：${missing.join('、')}。`);

  const newest = indicators.filter((i) => i.asOf).map((i) => i.asOf as string).sort().pop() ?? null;
  return {
    tone, score: Math.round(score), confidence,
    summary: TONE_TEXT[tone].summary,
    reasons,
    action: TONE_TEXT[tone].action,
    confirm: TONE_TEXT[tone].confirm,
    avoid: TONE_TEXT[tone].avoid,
    riskBudget: TONE_TEXT[tone].riskBudget,
    available: scored.length, total: indicators.length, asOf: newest,
  };
}

export async function fetchRhythm(): Promise<RhythmSnapshot> {
  const lists = await Promise.all(CONFIG.map((cfg) => (cfg.id === 'FG' ? loadFearGreed() : loadConvex(cfg.id, cfg.limit))));
  const series: Record<string, NormalizedSeries> = {};

  const indicators: IndicatorReading[] = CONFIG.map((cfg, idx) => {
    const points = lists[idx];
    let values = points.map((p) => p.value);
    let asOf: string | null = points.length ? points[points.length - 1].date : null;
    if (cfg.transform === 'cpiYoY') {
      values = toYearOverYear(values);
    }
    const aligned = points.slice(Math.max(0, points.length - values.length));
    const zs = rollingZScores(values, cfg.frequency === '月度' ? 24 : 250);
    series[cfg.id] = {
      id: cfg.id, name: cfg.name, phase: cfg.phase, frequency: cfg.frequency,
      unit: cfg.unit, weight: cfg.weight,
      points: aligned.map((p, i) => ({ date: p.date, value: values[i], z: zs[i] })),
    };
    const value = values.length ? values[values.length - 1] : null;
    const pct = value === null ? null : percentileOf(values, value);
    const z = value === null ? null : zScore(values, value);
    const slope = trendSlope(values, cfg.frequency === '月度' ? 6 : 20);
    const source: 'real' | 'missing' = value !== null && values.length >= 8 && pct !== null ? 'real' : 'missing';
    return {
      id: cfg.id, name: cfg.name, dimension: cfg.dimension, phase: cfg.phase, unit: cfg.unit,
      value, percentile: pct, z, slope, observations: values.length, asOf,
      freshnessDays: daysSince(asOf), source, frequency: cfg.frequency,
      score: source === 'real' && value !== null ? scoreOf(cfg, value, pct, slope) : null,
      weight: cfg.weight, explanation: cfg.explanation, howTo: cfg.howTo, pitfall: cfg.pitfall,
    };
  });

  return { indicators, regime: buildRegime(indicators), series, fetchedAt: new Date().toISOString() };
}
