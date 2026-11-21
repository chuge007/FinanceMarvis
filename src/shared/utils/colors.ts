import type { Direction, RiskLevel } from '../../types/common';

export const RISK_COLORS: Record<RiskLevel, { bg: string; border: string }> = {
  critical: { bg: 'rgba(240,68,82,0.08)', border: 'rgba(240,68,82,0.20)' },
  warning:  { bg: 'rgba(245,158,75,0.06)', border: 'rgba(245,158,75,0.15)' },
  normal:   { bg: 'rgba(12,166,120,0.05)', border: 'rgba(12,166,120,0.12)' },
  neutral:  { bg: 'rgba(255,255,255,0.015)', border: 'rgba(255,255,255,0.06)' },
};

export const FG_COLORS: Record<string, string> = {
  'Extreme Fear':  '#0ca678',
  'Fear':          '#4ade80',
  'Neutral':       '#636878',
  'Greed':         '#f59e4b',
  'Extreme Greed': '#f04452',
};

export const INSTITUTION_COLORS: Record<string, string> = {
  gs:    '#4078ff',
  ms:    '#0ca678',
  jpm:   '#f59e4b',
  blk:   '#9b6efb',
  bofa:  '#f04452',
  bw:    '#20c4d8',
};

export function directionColor(d: Direction): string {
  if (d === 'up') return '#f04452';
  if (d === 'down') return '#0ca678';
  return '#636878';
}

export function directionText(d: Direction): string {
  if (d === 'up') return '↑';
  if (d === 'down') return '↓';
  return '—';
}
