/**
 * Yahoo Finance 日线：全球指数、ETF、波动率、汇率、商品。
 *
 * 口径：chart API 的 close 为未复权收盘；spark 不带 volume，
 * 需要成交量的标的走 chart。单批并发上限 4，避免 429。
 */
import { defineSeries } from './base.mjs'

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const SPARK = 'https://query1.finance.yahoo.com/v7/finance/spark'

/** 核心标的表：id 稳定，前端按 id 消费。 */
const SYMBOLS = [
  { symbol: '^GSPC', label: '标普 500', dataset: 'global:index', market: 'us', unit: '点' },
  { symbol: '^IXIC', label: '纳斯达克综合', dataset: 'global:index', market: 'us', unit: '点' },
  { symbol: '^DJI', label: '道琼斯工业', dataset: 'global:index', market: 'us', unit: '点' },
  { symbol: '^RUT', label: '罗素 2000', dataset: 'global:index', market: 'us', unit: '点' },
  { symbol: '^VIX', label: 'VIX', dataset: 'us:volatility', market: 'us', unit: 'index' },
  { symbol: '^VIX3M', label: 'VIX3M', dataset: 'us:volatility', market: 'us', unit: 'index' },
  { symbol: '^VVIX', label: 'VVIX', dataset: 'us:volatility', market: 'us', unit: 'index' },
  { symbol: '^SKEW', label: 'SKEW', dataset: 'us:volatility', market: 'us', unit: 'index' },
  { symbol: '^TNX', label: '10Y 收益率（行情口径）', dataset: 'us:rates', market: 'us', unit: '%' },
  { symbol: 'DX-Y.NYB', label: '美元指数 DXY', dataset: 'fx:dxy', market: 'global', unit: 'index' },
  { symbol: 'GC=F', label: 'COMEX 黄金', dataset: 'commodity:metal', market: 'global', unit: '美元/盎司' },
  { symbol: 'SI=F', label: 'COMEX 白银', dataset: 'commodity:metal', market: 'global', unit: '美元/盎司' },
  { symbol: 'HG=F', label: 'COMEX 铜', dataset: 'commodity:metal', market: 'global', unit: '美元/磅' },
  { symbol: 'CL=F', label: 'WTI 原油期货', dataset: 'commodity:energy', market: 'global', unit: '美元/桶' },
  { symbol: 'BZ=F', label: '布伦特原油期货', dataset: 'commodity:energy', market: 'global', unit: '美元/桶' },
  { symbol: 'BTC-USD', label: '比特币', dataset: 'crypto:major', market: 'global', unit: '美元' },
  { symbol: 'SPY', label: 'SPY', dataset: 'us:etf', market: 'us', unit: '美元' },
  { symbol: 'QQQ', label: 'QQQ', dataset: 'us:etf', market: 'us', unit: '美元' },
  { symbol: 'HYG', label: 'HYG 高收益债 ETF', dataset: 'us:credit-etf', market: 'us', unit: '美元' },
  { symbol: 'LQD', label: 'LQD 投资级债 ETF', dataset: 'us:credit-etf', market: 'us', unit: '美元' },
  { symbol: 'TLT', label: 'TLT 长端国债 ETF', dataset: 'us:rates-etf', market: 'us', unit: '美元' },
]

function chartUrl(symbol, range) {
  return `${BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`
}

function parseChart(json) {
  const r = json?.chart?.result?.[0]
  if (!r) return []
  const ts = r.timestamp ?? []
  const closes = r.indicators?.quote?.[0]?.close ?? []
  const volumes = r.indicators?.quote?.[0]?.volume ?? []
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const value = Number(closes[i])
    if (!Number.isFinite(value) || value <= 0) continue
    const v = Number(volumes[i])
    out.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      value,
      extra: Number.isFinite(v) ? { volume: v } : undefined,
    })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

async function fetchOne(ctx, symbol, range = '2y') {
  const res = await ctx.transport.getJson(chartUrl(symbol, range), { viaProxy: true, timeoutMs: 10_000 })
  if (res.status >= 200 && res.status < 300 && res.json) return parseChart(res.json)
  // query1 偶发 403，换 query2 再试一次
  const alt = await ctx.transport.getJson(chartUrl(symbol, range).replace('query1', 'query2'), {
    viaProxy: true,
    timeoutMs: 10_000,
  })
  return alt.status >= 200 && alt.status < 300 && alt.json ? parseChart(alt.json) : []
}

/** @type {import('./base.mjs').SeriesDef[]} */
export const SERIES = SYMBOLS.map((item) =>
  defineSeries({
    id: `yahoo:${item.symbol}`,
    label: item.label,
    source: 'yahoo',
    dataset: item.dataset,
    market: item.market,
    freq: 'daily',
    unit: item.unit,
    caliber: '未复权收盘价',
    ttlSec: 900,
    async fetch(ctx) {
      return fetchOne(ctx, item.symbol)
    },
  }),
)

export { SPARK }
