// ─── 板块资金流 ───
export interface SectorFlow {
  id: string;
  name: string;
  color: string;
  netFlow: number;   // 主力净流入，单位：亿元
  pctChg: number;    // 板块涨跌幅 %
  reading: string;
  // 真实数据扩展字段（东财）
  mainRatio?: number;   // 主力净占比 %
  superLarge?: number;  // 超大单净额（亿元）
  large?: number;       // 大单净额（亿元）
  medium?: number;      // 中单净额（亿元）
  small?: number;       // 小单净额（亿元）
  source?: 'eastmoney' | 'model';
  // 美股细化字段（模型估算）
  usInstitution?: number; // 机构净额 $M
  usHedge?: number;       // 对冲基金净额 $M
  usRetail?: number;      // 散户净额 $M
  usStrength?: number;    // 资金强度 0-100
  usMomentum?: USMomentum; // 资金动量方向
  usShare?: number;       // 板块权重（占总资金池比例）
}

// ─── 市场资金全景（真实采集） ───
export interface MarketCapitalOverview {
  totalMain: number;      // 全市场主力净流入（亿元）
  superLarge: number;     // 超大单净额（亿元）
  large: number;          // 大单净额（亿元）
  medium: number;         // 中单净额（亿元）
  small: number;          // 小单净额（亿元）
  totalAmount: number;    // 两市成交额（亿元）
  mainRatio: number;      // 主力净占比 %
  upCount: number;        // 上涨家数
  downCount: number;      // 下跌家数
  flatCount: number;      // 平盘家数
  source: 'eastmoney' | 'model';
  reading: string;        // 通俗解读
  trend: 'up' | 'down' | 'flat';
}

// ─── 大盘资金流趋势点 ───
export interface CapitalTrendPoint {
  date: string;
  main: number;       // 主力净流入（亿元）
  superLarge: number; // 超大单
  medium: number;     // 中单
  small: number;      // 小单
}
export interface CapitalTrendData {
  points: CapitalTrendPoint[];
  source: 'eastmoney' | 'estimate';
  reading: string;
}

// ─── 资金流全景 ───
export interface FundFlowOverview {
  totalNetFlow: number;
  northBoundFlow: number;
  institutionalFlow: number;
  retailFlow: number;
  marginBalance: number;
  reading: string;
}

// ─── 资金流时序 ───
export interface MoneyFlowPoint {
  date: string;
  north: number;
  institution: number;
  retail: number;
  total: number;
}

export interface MoneyFlowData {
  series: MoneyFlowPoint[];
  summary: {
    north5d: number;
    institution5d: number;
    retail5d: number;
    trend: 'up' | 'down' | 'flat';
  };
  reading: string;
}

export interface Sector {
  id: string;
  name: string;
  netFlow: number;
}

export interface SankeyFlow {
  from: Sector;
  to: Sector;
  amount: number;
}

export interface SectorFlowData {
  sectors: Sector[];
  flows: SankeyFlow[];
  flowMatrix: number[][];
}

export interface CumulativeFlowPoint {
  time: string;
  mainForce: number;
  northBound: number;
  retail: number;
}

export interface OrderTick {
  time: string;
  direction: 'buy' | 'sell';
  price: number;
  volume: number;
  type: '超大单' | '大单' | '中单' | '小单';
  intensityPct: number;
}

export interface DepthLevel {
  price: number;
  volume: number;
  cumulative: number;
}

export interface DepthData {
  bids: DepthLevel[];
  asks: DepthLevel[];
  bidTotal: number;
  askTotal: number;
  imbalance: number;
}

// ─── 美股板块资金流细化字段 ───
export interface USForceSplit {
  institution: number; // 机构净额 $M
  hedge: number;       // 对冲基金净额 $M
  retail: number;      // 散户净额 $M
}
export type USMomentum = 'inflow_boost' | 'inflow_slow' | 'balanced' | 'outflow';

export interface USFlowDynamicsPoint {
  time: string;            // HH:MM 时段标签
  values: Record<string, number>; // 板块id -> 当日累计净流入($M)
}

export interface USFlowDynamicsData {
  points: USFlowDynamicsPoint[];
  rotation: string;        // 轮动方向一句话
  leadSector: string;      // 领涨资金去向板块
  tailSector: string;      // 资金流出板块
  splits: Record<string, USForceSplit>; // 各主导板块分口径
}
