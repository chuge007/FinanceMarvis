/**
 * 指数基准序列：给叠加实验室提供「指数走势」对照线。
 *
 * 为什么单独做一个服务而不是塞进宏观指标表：
 *  - 宏观序列来自 ConvexTrade（月度/日度经济数据），指数是行情，口径不同；
 *  - 指数需要 1 年日线，走 api.ts 的 K 线链路（Yahoo → 腾讯 → 东财三重兜底），
 *    和宏观序列的取数路径完全不一样。
 *
 * 统一换算成「滚动 Z」而不是画价格：叠加图只有一根纵轴，
 * 价格和波动率/Z 值混在一根轴上会读出错误结论（本项目的地图页也反复强调这一点）。
 *
 * 指数一律用 ETF 代理：ETF 有真实成交价，三条兜底链路都取得到日线；
 * ^NDX / ^SOX 这类纯指数代码在腾讯、东财链路取不到，容易整条线缺失。
 */
import { fetchStockCandles } from './api';
import type { DatedValue } from '../core/analysis/series';
import { zScore } from '../shared/utils/seriesStats';
import type { Market } from '../stores/useAppStore';

const ROLLING_WINDOW = 120;
const MIN_WINDOW = 20;

export interface IndexDef {
  id: string;
  market: Market;
  /** 取数用代码（ETF） */
  symbol: string;
  label: string;
  color: string;
  note: string;
}

/**
 * 可选指数清单。顺序即 UI 顺序：先大盘，再风格，最后行业。
 * 每条 note 说明「叠它到底看什么」，避免用户把所有指数都打开变成一束线。
 */
export const INDEX_DEFS: IndexDef[] = [
  {
    id: 'SPX',
    market: 'US',
    symbol: 'SPY',
    label: '标普500',
    color: '#e8ebf0',
    note: '全市场基准，宏观指标最终都是拿它做对照',
  },
  {
    id: 'NDX',
    market: 'US',
    symbol: 'QQQ',
    label: '纳指100',
    color: '#4078ff',
    note: '久期最长的成长端，对实际利率最敏感；和标普同涨同跌，直接叠只能看裂口，看相对强弱才有信息量',
  },
  {
    id: 'SOX',
    market: 'US',
    symbol: 'SMH',
    label: '半导体',
    color: '#f7d44c',
    note: 'AI 资本开支周期的纯代理，用来分辨纳指上涨是分子（订单）还是分母（利率）驱动',
  },
  {
    id: 'RUT',
    market: 'US',
    symbol: 'IWM',
    label: '罗素2000',
    color: '#9b6efb',
    note: '小盘，对信用利差和内需更敏感，利率上行时通常先破位',
  },
  {
    id: 'DJI',
    market: 'US',
    symbol: 'DIA',
    label: '道指',
    color: '#20c4d8',
    note: '价值与防御权重高，用来判断是否在切向低久期',
  },
  {
    id: 'CSI300',
    market: 'CN',
    symbol: '510300',
    label: '沪深300',
    color: '#e8ebf0',
    note: 'A 股大盘基准',
  },
  {
    id: 'CSI500',
    market: 'CN',
    symbol: '510500',
    label: '中证500',
    color: '#9b6efb',
    note: '中盘，看内需与流动性传导',
  },
  {
    id: 'CYB',
    market: 'CN',
    symbol: '159915',
    label: '创业板',
    color: '#20c4d8',
    note: 'A 股高久期一端，对应美股的纳指位置',
  },
];

export function indexOptions(market: Market): IndexDef[] {
  return INDEX_DEFS.filter((d) => d.market === market);
}

export function indexDef(id: string): IndexDef | undefined {
  return INDEX_DEFS.find((d) => d.id === id);
}

/** 旧调用方（地图页等）的默认大盘口径：保持不变。 */
export function benchmarkSymbol(market: Market): string {
  return market === 'CN' ? '510300' : 'SPY';
}

export function benchmarkLabel(market: Market): string {
  return market === 'CN' ? '沪深300ETF' : 'SPY 标普500';
}

interface Row {
  date: string;
  value: number;
}

/** 逐点滚动 Z：只用当日及之前 120 个交易日，避免用到未来数据。 */
function toRollingZ(rows: Row[]): DatedValue[] {
  const values = rows.map((r) => r.value);
  return rows.map((row, index) => {
    const from = Math.max(0, index - ROLLING_WINDOW + 1);
    const window = values.slice(from, index + 1).filter((v) => Number.isFinite(v));
    const z = window.length >= MIN_WINDOW ? zScore(window, row.value) : null;
    return { date: row.date, value: row.value, z };
  });
}

async function loadCloses(symbol: string, market: Market): Promise<Row[]> {
  const candles = await fetchStockCandles(symbol, market, '1y', '1d');
  if (candles.length < MIN_WINDOW) return [];
  return candles
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .map((c) => ({ date: c.time, value: c.close }));
}

/** 取单个指数的滚动 Z 序列；数据不足返回空数组，调用方据此提示「暂不可用」。 */
export async function fetchIndexPoints(def: IndexDef): Promise<DatedValue[]> {
  try {
    return toRollingZ(await loadCloses(def.symbol, def.market));
  } catch {
    return [];
  }
}

/** 兼容旧签名：取市场默认大盘。 */
export async function fetchBenchmarkPoints(market: Market): Promise<DatedValue[]> {
  const def = indexDef(market === 'CN' ? 'CSI300' : 'SPX');
  return def ? fetchIndexPoints(def) : [];
}
