import type { MarketType } from './common';

// ─── 交易信号（5维度综合评分） ───
export interface TradingSignal {
  overall: number;
  sentiment: number;
  volatility: number;
  rateEnvironment: number;
  creditMarket: number;
  macroCycle: number;
  timestamp: string;
}

// ─── 策略决策 ───
export interface StrategyDecision {
  action: 'buy' | 'sell' | 'hold';
  heat: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';
  summary: string;
  suggestions: string[];
  signal: TradingSignal;
}

// ─── 兼容旧类型 ───
export interface Strategy {
  id: string;
  name: string;
  priority: number;
  markets: MarketType[];
  tags: {
    label: string;
    type: 'ok' | 'warn' | 'info';
  }[];
  thesis: string;
  detail?: {
    entry: string;
    exit: string;
    hitRate: number;
    riskLevel: string;
  };
}

export interface Candidate {
  id: string;
  rank: number;
  market: MarketType;
  symbol: string;
  name: string;
  change: number;
  strategyId: string;
  thesis: string;
  score: number;
  sparkline: number[];
}

export interface ExecutionRule {
  id: string;
  category: 'entry' | 'risk' | 'position' | 'review';
  rules: string;
}

// ─── 做T综合因子（宏观 / 情绪 / 产业） ───
export interface FactorScore {
  score: number;      // 0-100，越高越利于做多/做T
  label: string;
  reading: string;    // 普通人视角解读
  meta: string;       // 关键参考数值（如 VIX=15.2、涨:跌=3200:1800）
}

export interface StrategyFactors {
  market: 'US' | 'CN';
  macro: FactorScore;
  sentiment: FactorScore;
  industry: FactorScore;
  composite: number;                 // 三因子加权综合分
  bias: { title: string; color: string; suggestion: string };  // 综合做T偏向
  updatedAt: string;
  source: 'realtime' | 'mock';
}

// ─── 个股真实K线回测统计 ───
export interface BacktestSignalBrief {
  time: string;
  type: 'buy' | 'sell';
  reason: string;
  price: number;
  meaning: string; // 出现在这个点位的意义
}

export interface BacktestPhase {
  kind: 'uptrend' | 'range' | 'downtrend';
  label: string;
  hint: string;
}

export interface BacktestStats {
  symbol: string;
  period: string;       // e.g. '2025-12 ~ 2026-09'
  signalCount: number;  // 总信号次数
  tradeCount: number;   // 完成交易笔数
  winRate: number;      // %
  profitFactor: number; // 盈亏比
  totalReturn: number;  // 累计收益率 %
  maxDrawdown: number;  // 最大回撤 %
  avgHoldDays: number;  // 平均持仓天数
  avgWin: number;       // 平均单笔盈利 %
  avgLoss: number;      // 平均单笔亏损 %
  equityCurve: { date: string; value: number }[]; // 净值曲线
  drawdownCurve: { date: string; value: number }[]; // 回撤曲线（负值，%）
  mode: 'long' | 'short';       // 正T / 反T
  modeVerdict: string;          // 模式结论（利好/利空一句话）
  phase: BacktestPhase;         // 周期阶段
  signalsBrief: BacktestSignalBrief[]; // 信号明细（与K线图同一套）
}
