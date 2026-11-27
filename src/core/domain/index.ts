/**
 * 前端领域内核入口。
 *
 * 实现只有一份（core/domain/*.mjs），这里只补 TypeScript 类型别名，
 * 让 React 侧获得完整类型提示，同时保证前后端口径不会分叉。
 */
export {
  BAND_LABEL,
  BAND_ORDER,
  bandOf,
  envelope,
  noDataMeta,
  validateFinding,
  mean,
  stdev,
  percentileOf,
  zScore,
  pointsForWindow,
  changeOf,
  rollingCorrelation,
  ratioSeries,
  annualizedVol,
  maxDrawdownFromReturns,
  summarize,
  computeRegime,
  DEFAULT_WEIGHTS,
  airoomBand,
  brinson,
  portfolioReturn,
  drift,
  concentration,
  dcaCheck,
  historicalVaR,
  historicalCVaR,
  sharpe,
  sortino,
  maxDrawdown,
  checkLimits,
  riskSummary,
  hhi,
  effectiveN,
} from '../../../core/domain/index.mjs';

export type RegimeBand = 'excellent' | 'good' | 'poor' | 'severe';
export type Confidence = 'high' | 'medium' | 'low' | 'unstructured';
export type SourceMeta = {
  source: string;
  asOf: string | null;
  caliber?: string;
  stale?: boolean;
  degraded?: boolean;
  missing?: string[];
  note?: string;
  facts?: string[];
  inferences?: string[];
};
export type Envelope<T> = { data: T; meta: SourceMeta };
export type ResearchFinding = {
  id: string;
  subject: { type: 'equity' | 'credit' | 'fund' | 'macro' | 'industry'; symbol?: string };
  framework: string;
  conclusion: string;
  factors: Array<{ name: string; value: number | string; direction: 'positive' | 'negative' | 'neutral' }>;
  score?: number;
  confidence: Confidence;
  asOf: string;
  source: string;
  rawRef?: string;
};
export type SidecarCommand = {
  id: string;
  method:
    | 'snapshot' | 'kline' | 'ticker' | 'orderbook' | 'brokerQueue' | 'capitalFlow'
    | 'optionChain' | 'stockFilter' | 'subscribe' | 'accounts' | 'portfolio'
    | 'placeOrder' | 'cancelOrder' | 'ping';
  params: Record<string, unknown>;
  env?: 'SIMULATE' | 'REAL';
};
