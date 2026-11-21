export type Direction = 'up' | 'down' | 'flat';

export type RiskLevel = 'critical' | 'warning' | 'normal' | 'neutral';

export type MarketType = 'A股' | '美股' | '期货';

export type TimeFrame = '1D' | '5D' | '20D' | '60D';

export interface KpiItem {
  value: number | string;
  label: string;
  direction?: Direction;
  unit?: string;
}

export interface PanelProps {
  title: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}
