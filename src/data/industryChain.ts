/**
 * AI 产业链静态图（T3 级：人工维护，改版才动）。
 *
 * 为什么必须人工：
 * 没有任何免费源提供「谁是谁的上下游」这种结构化关系。这里只写公认可查的产业事实，
 * 节点上的代码用于挂真实行情/月营收，不写任何预测与评级。
 *
 * 链条顺序即资金传导顺序：算力芯片 → 代工 → 封测/HBM → 服务器/ODM → 云与算力租赁。
 */

export type ChainSegment = 'chip' | 'foundry' | 'package' | 'server' | 'cloud';

export interface ChainSymbol {
  market: 'US' | 'CN' | 'TW';
  code: string;
  name: string;
  /** 台股代码用 TWSE 月营收汇总表取同比；A股/美股暂只展示名称 */
  note?: string;
}

export interface ChainNode {
  id: string;
  name: string;
  segment: ChainSegment;
  /** 这一环在看什么指标 */
  focus: string;
  symbols: ChainSymbol[];
  upstream: string[];
  downstream: string[];
}

export const SEGMENT_LABEL: Record<ChainSegment, string> = {
  chip: '算力芯片',
  foundry: '晶圆代工',
  package: '封装/HBM',
  server: '服务器整机',
  cloud: '云与算力',
};

export const INDUSTRY_CHAIN: ChainNode[] = [
  {
    id: 'chip',
    name: 'AI 算力芯片',
    segment: 'chip',
    focus: '看订单与出货指引，最领先的一环',
    symbols: [
      { market: 'US', code: 'NVDA', name: 'NVIDIA' },
      { market: 'US', code: 'AMD', name: 'AMD' },
      { market: 'US', code: 'AVGO', name: 'Broadcom' },
    ],
    upstream: [],
    downstream: ['foundry'],
  },
  {
    id: 'foundry',
    name: '晶圆代工',
    segment: 'foundry',
    focus: '看月度营收同比，是整条链最真实的景气读数',
    symbols: [
      { market: 'TW', code: '2330', name: '台积电' },
      { market: 'TW', code: '2303', name: '联电' },
    ],
    upstream: ['chip'],
    downstream: ['package'],
  },
  {
    id: 'package',
    name: '封装 / HBM',
    segment: 'package',
    focus: '看 CoWoS 与 HBM 产能是否仍是瓶颈',
    symbols: [
      { market: 'TW', code: '3711', name: '日月光投控' },
      { market: 'TW', code: '2382', name: '广达' },
      { market: 'US', code: 'MU', name: 'Micron' },
    ],
    upstream: ['foundry'],
    downstream: ['server'],
  },
  {
    id: 'server',
    name: '服务器 / ODM',
    segment: 'server',
    focus: '看月营收与出货节奏，滞后于芯片订单',
    symbols: [
      { market: 'TW', code: '2317', name: '鸿海' },
      { market: 'TW', code: '3231', name: '纬创' },
      { market: 'CN', code: '000977', name: '浪潮信息' },
    ],
    upstream: ['package'],
    downstream: ['cloud'],
  },
  {
    id: 'cloud',
    name: '云厂与算力租赁',
    segment: 'cloud',
    focus: '看资本开支指引，是需求端的最终买单方',
    symbols: [
      { market: 'US', code: 'MSFT', name: 'Microsoft' },
      { market: 'US', code: 'GOOGL', name: 'Alphabet' },
      { market: 'US', code: 'AMZN', name: 'Amazon' },
    ],
    upstream: ['server'],
    downstream: [],
  },
];

/** 需要从 TWSE 月营收汇总表取数的台股代码。 */
export const TW_CODES = INDUSTRY_CHAIN.flatMap((node) =>
  node.symbols.filter((s) => s.market === 'TW').map((s) => s.code),
);
