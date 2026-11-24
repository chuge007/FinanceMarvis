import type { RiskLevel, Direction } from './common';

export interface RiskIndicator {
  id: string;
  icon: string;
  label: string;
  value: number | string;
  level: RiskLevel;
  reading: string;
  history?: number[];
  /** 数据真实性：真实接口 / 演示快照 / 数据不可用 */
  source?: 'real' | 'demo' | 'missing';
}

export interface CreditRateIndicator {
  name: string;
  current: number | string;
  direction: Direction;
  unit: string;
  reading: string;
  history?: number[];
}

export interface VolatilityPoint {
  timestamp: string;
  vix: number | null;
  vvix: number | null;
  skew: number | null;
  move: number | null;
}

export interface VolatilitySnapshot {
  current: VolatilityPoint;
  vixSparkline: number[];
  vvixSparkline: number[];
  skewSparkline: number[];
  moveSparkline: number[];
  interpretation: string;
}

export interface ForceDimension {
  name: string;
  bullPct: number;
  bearPct: number;
  meta: string;
}

export interface BullBearForces {
  dimensions: ForceDimension[];
  conclusion: {
    bulls: string[];
    bears: string[];
    verdict: string;
  };
}

export interface InstitutionView {
  id: string;
  institution: string;
  logo: string;
  date: string;
  target: string;
  rating: string;
  thesis: string;
  color: string;
}

export interface NewsItem {
  id: string;
  time: string;
  tag: 'macro' | 'earn' | 'policy' | 'geo';
  content: string;
  impact: string;
  source?: 'realtime' | 'snapshot'; // 实时抓取 / 离线快照
}
