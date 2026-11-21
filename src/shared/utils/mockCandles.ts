/**
 * 模拟K线生成器 —— 当 Yahoo Finance 闭市/限流时兜底
 * 使用确定性伪随机种子，保证同一 symbol+日期下数据一致，不漂移
 */
import type { StockCandle } from '../../services/api';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SYMBOL_PRICES: Record<string, number> = {
  'NVDA': 110, 'AAPL': 220, 'MSFT': 420, 'GOOGL': 180, 'AMZN': 210,
  'META': 560, 'TSLA': 250, 'TSM': 170, 'AMD': 140, 'INTC': 32,
  '300750': 200, '600519': 1650, '002594': 250, '300308': 155,
  '300124': 70, '000858': 168, '601899': 18, '688981': 42,
  '600030': 22, '000001': 14, '601318': 48, '600276': 45,
};

export function generateMockCandles(symbol: string, days = 90): StockCandle[] {
  const basePrice = SYMBOL_PRICES[symbol] || 100;
  const rng = seededRandom(
    [...symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) +
    new Date().getUTCFullYear() * 10 + new Date().getUTCMonth()
  );

  const candles: StockCandle[] = [];
  let price = basePrice * (0.85 + rng() * 0.3); // 随机起始价

  for (let i = days; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // 跳过周末
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const timeStr = d.toISOString().split('T')[0];
    const volatility = basePrice * 0.025;
    const open = price + (rng() - 0.5) * volatility * 0.5;
    const close = open + (rng() - 0.5) * volatility;
    const high = Math.max(open, close) + rng() * volatility * 0.6;
    const low = Math.min(open, close) - rng() * volatility * 0.6;
    const volume = Math.round((1 + rng() * 3) * (basePrice < 100 ? 5000000 : 1000000));

    candles.push({
      time: timeStr,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume,
    });

    price = close + (rng() - 0.48) * volatility * 0.3;
  }

  return candles;
}
