/**
 * 指标注册表：全站唯一的指标定义来源。
 *
 * 原则：
 *  - 一个指标只允许一个名称、一个相位、一个频率、一套解释；
 *  - 页面不得自行写阈值（例如 VIX > 30），一律使用分位 / Z / 状态；
 *  - 指标说明只在这里维护，UI 通过“?”读取。
 */
import { CONFIG, type Phase, type SeriesConfig } from '../../modules/rhythm/services/rhythm';

export type MetricId =
  | 'VIXCLS'
  | 'BAMLH0A0HYM2'
  | 'T10Y2Y'
  | 'DGS10'
  | 'DTWEXBGS'
  | 'FG'
  | 'CPIAUCSL'
  | 'UNRATE';

export const METRICS: SeriesConfig[] = CONFIG;

export const METRIC_MAP: Record<string, SeriesConfig> = Object.fromEntries(
  CONFIG.map((m) => [m.id, m]),
);

export function metricOf(id: string): SeriesConfig | undefined {
  return METRIC_MAP[id];
}

export function metricName(id: string): string {
  return METRIC_MAP[id]?.name ?? id;
}

export const DAILY_METRICS = CONFIG.filter((m) => m.frequency === '日度');

export function phaseOf(id: string): Phase {
  return METRIC_MAP[id]?.phase ?? '同步';
}

/** 相位 → 线型；颜色之外的第二编码，避免只靠颜色识别。 */
export function dashOf(id: string): 'solid' | 'dashed' | 'dotted' {
  const phase = phaseOf(id);
  if (phase === '领先') return 'dashed';
  if (phase === '滞后') return 'dotted';
  return 'solid';
}

/** 指标默认颜色，只用于图表，不代表好坏。 */
export const METRIC_COLOR: Record<string, string> = {
  VIXCLS: '#f04452',
  BAMLH0A0HYM2: '#f59e4b',
  T10Y2Y: '#20c4d8',
  DGS10: '#4078ff',
  DTWEXBGS: '#9b6efb',
  FG: '#0ca678',
  CPIAUCSL: '#e8590c',
  UNRATE: '#748ffc',
};

/** 指标所属的决策层，供“点击读数跳转到对应层”使用。 */
export type LayerId = 'environment' | 'structure' | 'position';

export function layerOf(id: string): LayerId {
  if (id === 'FG') return 'environment';
  return 'environment';
}

/** 传导链节点的静态定义（动态读数由 core/analysis/chain.ts 生成）。 */
export interface ChainNodeDef {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  subtitle: string;
  metricIds: string[];
  layer: LayerId;
}

export const CHAIN_DEFS: ChainNodeDef[] = [
  {
    id: 'A',
    title: '资金价格',
    subtitle: '钱贵不贵',
    metricIds: ['DTWEXBGS', 'DGS10'],
    layer: 'environment',
  },
  {
    id: 'B',
    title: '风险定价',
    subtitle: '风险贵不贵',
    metricIds: ['BAMLH0A0HYM2', 'VIXCLS', 'T10Y2Y'],
    layer: 'environment',
  },
  {
    id: 'C',
    title: '人群行为',
    subtitle: '人挤不挤',
    metricIds: ['FG'],
    layer: 'environment',
  },
  {
    id: 'D',
    title: '结构轮动',
    subtitle: '钱往哪走',
    metricIds: [],
    layer: 'structure',
  },
  {
    id: 'E',
    title: '我的位置',
    subtitle: '我站哪',
    metricIds: [],
    layer: 'position',
  },
];
