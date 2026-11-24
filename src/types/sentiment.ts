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

// ─── 美股大盘期权情绪（CBOE + Yahoo） ───
export interface OptionRatioItem {
  key: string;
  label: string;
  officialName: string;
  value: number | null;
  norm: [number, number] | null;
  reading: '偏高' | '偏低' | '常态' | '无数据';
}

export interface OptionVolumeOI {
  call: number;
  put: number;
  total: number;
  putCallRatio: number | null;
}

export interface OptionQuote {
  symbol: string;
  label: string;
  price: number;
  changePct: number | null;
}

export interface OptionsSentimentSnapshot {
  generatedAt: string;
  available: boolean;
  ratios: OptionRatioItem[];
  summary: Record<string, { volume: OptionVolumeOI; openInterest: OptionVolumeOI }>;
  quotes: Record<string, OptionQuote>;
  termStructure: {
    ratio: number | null;
    shape: 'contango' | 'backwardation' | 'flat' | null;
    label: string;
  };
  verdict: string;
  sources: string[];
  errors: string[];
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
  /** 美股期权情绪明细；A 股为 null。 */
  options?: OptionsSentimentSnapshot | null;
  optionsVerdict?: string;
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
  items: OptionRatioItem[];
  volume: OptionVolumeOI | null;
  openInterest: OptionVolumeOI | null;
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
