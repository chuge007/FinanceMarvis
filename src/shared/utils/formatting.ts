export function formatMoney(value: number, unit: '亿' | '万' | '元' = '亿'): string {
  if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toFixed(2) + unit;
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

export function formatBp(value: number): string {
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(0) + 'bp';
}

export function formatVolume(value: number): string {
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿手';
  if (value >= 1e4) return (value / 1e4).toFixed(1) + '万手';
  return value.toFixed(0) + '手';
}

export function formatCompact(value: number, decimals = 2): string {
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(decimals) + 'B';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(decimals) + 'M';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(decimals) + 'K';
  return value.toFixed(decimals);
}
