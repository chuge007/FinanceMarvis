// ─── alternative.me Fear & Greed API 响应 ───
export interface FNGDay {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update?: string;
}

export interface FNGResponse {
  name: string;
  data: FNGDay[];
  metadata?: { error: string | null };
}

// ─── 子指数 (7因子) ───
export interface SentimentSubIndex {
  key: string;
  name: string;
  value: number;
  description: string;
  reading: string;
}

// ─── 情绪快照（合并 Fear & Greed + VIX + Put/Call） ───
export interface SentimentSnapshot {
  value: number;
  classification: string;
  timestamp: string;
  trend: { date: string; value: number }[];
  subIndices: SentimentSubIndex[];
  vix: number | null;
  putCallRatio?: string;
  reading: string;
}

// ─── 兼容旧接口用的别名 ───
export interface FearGreedIndex {
  composite: number;
  state: string;
  factors: { name: string; value: number; signal: string }[];
}

export interface NAAIMData {
  current: number;
  week4MA: number;
  week13MA: number;
  historicalMedian: number;
  interpretation: string;
}

export interface McClellanData {
  oscillator: number;
  summation: number;
  advances: number;
  declines: number;
  sparkline: { oscillator: number[]; summation: number[] };
}

export interface PutCallData {
  equityPC: number;
  indexPC: number;
  totalPC: number;
  otmPutCall: number;
  callVolumeDelta: number;
  putVolumeDelta: number;
  skew25Delta: number;
  openInterestPC: number;
}

export interface DarkPoolData {
  dpi: number;
  buyRatio: number;
  sellRatio: number;
  netBuy: number;
  sparkline: { buys: number[]; sells: number[] };
}

export interface GEXData {
  netGEX: number;
  zeroGamma: number;
  callWall: number;
  putWall: number;
  distribution: { strike: number; gamma: number }[];
}

export interface AlgoSentimentRow {
  name: string;
  value: number | string;
  signal: string;
  signalColor: string;
  methodology: string;
}
