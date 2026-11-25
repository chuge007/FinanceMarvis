/**
 * 大盘基准序列：给叠加实验室提供「大盘走势」这条对照线。
 *
 * 为什么单独做一个服务而不是塞进宏观指标表：
 *  - 宏观序列来自 ConvexTrade（月度/日度经济数据），大盘是行情，口径不同；
 *  - 大盘需要 1 年日线，走 api.ts 的 K 线链路（Yahoo → 腾讯 → 东财三重兜底），
 *    和宏观序列的取数路径完全不一样。
 *
 * 统一换算成「滚动 Z」而不是画价格：叠加图只有一根纵轴，
 * 价格和波动率/Z 值混在一根轴上会读出错误结论（本项目的地图页也反复强调这一点）。
 */
import { fetchStockCandles } from './api';
import type { DatedValue } from '../core/analysis/series';
import { zScore } from '../shared/utils/seriesStats';
import type { Market } from '../stores/useAppStore';

const ROLLING_WINDOW = 120;
const MIN_WINDOW = 20;

export function benchmarkSymbol(market: Market): string {
  // A 股用沪深 300ETF 代替指数：ETF 有真实成交价，腾讯/东财都能取到日线
  return market === 'CN' ? '510300' : 'SPY';
}

export function benchmarkLabel(market: Market): string {
  return market === 'CN' ? '沪深300ETF' : 'SPY 标普500';
}

/**
 * 取近一年日线，逐点算滚动 Z（只用当日及之前 120 个交易日，避免用到未来数据）。
 * 数据不足时返回空数组，调用方据此显示「大盘基准当前不可用」。
 */
export async function fetchBenchmarkPoints(market: Market): Promise<DatedValue[]> {
  try {
    const candles = await fetchStockCandles(benchmarkSymbol(market), market, '1y', '1d');
    if (candles.length < MIN_WINDOW) return [];

    const closes = candles.map((c) => c.close);
    return candles.map((candle, index) => {
      const from = Math.max(0, index - ROLLING_WINDOW + 1);
      const window = closes
        .slice(from, index + 1)
        .filter((v) => Number.isFinite(v) && v > 0);
      const z = window.length >= MIN_WINDOW ? zScore(window, candle.close) : null;
      return { date: candle.time, value: candle.close, z };
    });
  } catch {
    return [];
  }
}
