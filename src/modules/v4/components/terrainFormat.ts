/** 地形的显示格式：涨跌色、数值单位、相对位置配色。UI 组件只负责布局。 */
import type { CrossAssetReading } from '../../../core/data/crossAsset';

export const UP = '#f04452';
export const DOWN = '#0ca678';
export const MUTED = '#636878';

export function fmtValue(cell: CrossAssetReading): string {
  if (cell.latest === null) return '缺';
  const n = cell.latest;
  if (cell.unit === '%') return `${n.toFixed(cell.digits)}%`;
  if (cell.unit === 'pt') return `${n.toFixed(cell.digits)}pt`;
  if (cell.unit === 'usd') return `$${n.toLocaleString('en-US', { maximumFractionDigits: cell.digits })}`;
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: cell.digits });
  return n.toFixed(cell.digits);
}

export function fmtChange(cell: CrossAssetReading): { text: string; color: string } {
  if (cell.latest === null) return { text: '—', color: MUTED };
  if (cell.id === 'FG' && cell.change !== null) {
    return {
      text: `${cell.change >= 0 ? '+' : ''}${cell.change.toFixed(0)}`,
      color: cell.change >= 0 ? UP : DOWN,
    };
  }
  if (cell.unit === '%' && cell.change !== null) {
    const bp = cell.change * 100;
    return { text: `${bp >= 0 ? '+' : ''}${bp.toFixed(0)}bp`, color: bp >= 0 ? UP : DOWN };
  }
  if (cell.unit === 'pt' && cell.change !== null) {
    return {
      text: `${cell.change >= 0 ? '+' : ''}${cell.change.toFixed(cell.digits)}pt`,
      color: cell.change >= 0 ? UP : DOWN,
    };
  }
  if (cell.unit === 'ratio' && cell.change !== null) {
    return {
      text: `${cell.change >= 0 ? '+' : ''}${cell.change.toFixed(cell.digits)}`,
      color: cell.change >= 0 ? UP : DOWN,
    };
  }
  if (cell.changePct !== null) {
    return {
      text: `${cell.changePct >= 0 ? '+' : ''}${cell.changePct.toFixed(2)}%`,
      color: cell.changePct >= 0 ? UP : DOWN,
    };
  }
  return { text: '—', color: MUTED };
}

/** 风险相对位置：蓝（低）→ 青（中）→ 橙（高）。只表示位置，不表示涨跌。 */
export function heatColor(percentile: number | null): string {
  if (percentile === null) return '#2a3040';
  if (percentile >= 75) return '#f59e4b';
  if (percentile >= 45) return '#20c4d8';
  return '#4078ff';
}

export function sourceColor(source: CrossAssetReading['actualSource']): string {
  if (source === 'tencent') return '#f59e4b';
  if (source === 'treasury') return '#20c4d8';
  if (source === 'cboe') return '#20c4d8';
  if (source === 'derived') return '#9b6efb';
  return '#0ca678';
}

export function sourceLabel(source: CrossAssetReading['actualSource']): string {
  if (source === 'tencent') return '腾讯现货兜底（Yahoo 不可达）';
  if (source === 'treasury') return '美国财政部官方收益率曲线';
  if (source === 'cboe') return 'CBOE 期权统计（当日）';
  if (source === 'derived') return '派生（由真实序列计算）';
  if (source === 'snapshot') return '统一快照';
  if (source === 'fred') return 'FRED 官方序列';
  return 'Yahoo 真实行情';
}
