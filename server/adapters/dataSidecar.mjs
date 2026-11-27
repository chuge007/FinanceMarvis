/**
 * 数据侧车适配器：SEC EDGAR / ccxt / AkShare 特色品类。
 *
 * 纪律：侧车未就绪或方法失败时 fetch 返回空数组 / {available:false}，
 * 调度器与健康条会显示「缺」，绝不用模拟值顶替（README 数据可信度分级）。
 */
import { defineSeries } from './base.mjs'

/** 历史库只存数值点：加密最新价用单点的「今日」序列承载，口径写在 caliber。 */
export const SERIES = [
  defineSeries({
    id: 'sidecar:btc-usdt',
    label: 'BTC/USDT 现价（ccxt · Binance）',
    source: 'sidecar-data',
    dataset: 'crypto:major',
    market: 'global',
    freq: 'intraday',
    unit: 'USDT',
    caliber: 'ccxt Binance 公共 ticker.last；非历史序列，仅当日快照，不参与跨日分位',
    ttlSec: 300,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('ccxt.ticker', { exchange: 'binance', symbol: 'BTC/USDT' })
      if (!res.ok || !Number.isFinite(res.result?.last)) return []
      return [{ date: new Date().toISOString().slice(0, 10), value: Number(res.result.last) }]
    },
  }),
  defineSeries({
    id: 'sidecar:btc-ohlcv',
    label: 'BTC/USDT 日线收盘（ccxt · Binance）',
    source: 'sidecar-data',
    dataset: 'crypto:major',
    market: 'global',
    freq: 'daily',
    unit: 'USDT',
    caliber: 'ccxt fetch_ohlcv 日线 close；单一交易所 Binance，USDT 计价不等同 USD',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('ccxt.ohlcv', { exchange: 'binance', symbol: 'BTC/USDT', timeframe: '1d', limit: 500 })
      if (!res.ok || !Array.isArray(res.result?.rows)) return []
      return res.result.rows
        .filter((r) => r?.date && Number.isFinite(Number(r.close)))
        .map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.close) }))
    },
  }),
  defineSeries({
    id: 'sidecar:hs300-kline',
    label: '沪深300 前复权日线（baostock 备源）',
    source: 'sidecar-data',
    dataset: 'cn:index-kline',
    market: 'cn',
    freq: 'daily',
    unit: '点',
    caliber: 'baostock sh.000001，请求前复权（指数实际返回 adjustflag=3，无复权语义）；与腾讯主源逐日偏差 ≤0.1% 前不得换主',
    ttlSec: 3600,
    async fetch(ctx) {
      const end = new Date().toISOString().slice(0, 10)
      const start = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
      const res = await ctx.dataSidecar.call('baostock.kline', { code: 'sh.000001', start, end, frequency: 'd', adjustflag: '2' })
      if (!res.ok || !Array.isArray(res.result?.rows)) return []
      return res.result.rows
        .filter((r) => r?.date && Number.isFinite(Number(r.close)))
        .map((r) => ({ date: String(r.date).slice(0, 10), value: Number(r.close) }))
    },
  }),
]

/** 快照：SEC 文件清单、A 股龙虎榜、基金净值——返回结构化 rows 供前端展示。 */
export const SNAPSHOTS = [
  {
    id: 'us:filings',
    label: 'SEC EDGAR 最新文件',
    source: 'sidecar-data',
    ttlSec: 21_600,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('edgar.filings', { ticker: 'AAPL', limit: 10 })
      if (!res.ok) return { available: false, reason: res.error?.message ?? 'EDGAR 不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [] }
    },
  },
  {
    id: 'cn:lhb',
    label: 'A 股龙虎榜（AkShare）',
    source: 'sidecar-data',
    ttlSec: 86_400,
    async fetch(ctx) {
      const date = new Date().toISOString().slice(0, 10)
      const res = await ctx.dataSidecar.call('akshare.stock_lhb', { date })
      if (!res.ok) return { available: false, reason: res.error?.message ?? '龙虎榜不可得' }
      return { available: true, asOf: date, rows: res.result?.rows ?? [] }
    },
  },
  {
    id: 'us:filings-13f',
    label: 'SEC EDGAR 13F 持仓文件',
    source: 'sidecar-data',
    ttlSec: 86_400,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('edgar.13f', { ticker: 'AAPL', limit: 20 })
      if (!res.ok) return { available: false, reason: res.error?.message ?? '13F 不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [] }
    },
  },
  {
    id: 'cn:margin-sidecar',
    label: 'A 股两融（AkShare 备源）',
    source: 'sidecar-data',
    ttlSec: 86_400,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('akshare.margin', {})
      if (!res.ok) return { available: false, reason: res.error?.message ?? '两融不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [], caliber: res.result?.caliber }
    },
  },
  {
    id: 'cn:sector-flow-sidecar',
    label: 'A 股行业资金流（AkShare 备源）',
    source: 'sidecar-data',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('akshare.sector_flow', {})
      if (!res.ok) return { available: false, reason: res.error?.message ?? '板块资金流不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [], caliber: res.result?.caliber }
    },
  },
  {
    id: 'cn:futures-sidecar',
    label: '商品期货连续合约（AkShare）',
    source: 'sidecar-data',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('akshare.futures', { symbol: 'RB0' })
      if (!res.ok) return { available: false, reason: res.error?.message ?? '期货数据不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [], caliber: res.result?.caliber }
    },
  },
  {
    id: 'fx:hist-sidecar',
    label: 'USDCNH 历史（AkShare）',
    source: 'sidecar-data',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.dataSidecar.call('akshare.forex', { symbol: 'USDCNH' })
      if (!res.ok) return { available: false, reason: res.error?.message ?? '外汇数据不可得' }
      return { available: true, asOf: new Date().toISOString().slice(0, 10), rows: res.result?.rows ?? [] }
    },
  },
]
