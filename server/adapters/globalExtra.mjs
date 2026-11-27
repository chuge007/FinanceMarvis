/**
 * 全球宏观补充（实测可用，2026-11-26）：
 *   - DefiLlama 稳定币市值：离岸美元流动性的影子指标
 *   - BIS 政策利率：WS_CBPOL 月度，覆盖美/中/日/欧/英
 *   - Yahoo 全球指数：日/德/英/加/澳/印/韩/台/巴西/上证
 *
 * 全部免 key。经实测：LLAMA 200 / BIS 200（需出海）/ Yahoo 全球指数 200（需出海）。
 */
import { defineSeries } from './base.mjs'

// ── BIS 政策利率 ────────────────────────────────────────────
const BIS_URLS = {
  US: 'https://stats.bis.org/api/v1/data/WS_CBPOL/D.US?format=csv',
  CN: 'https://stats.bis.org/api/v1/data/WS_CBPOL/D.CN?format=csv',
  JP: 'https://stats.bis.org/api/v1/data/WS_CBPOL/D.JP?format=csv',
  EA: 'https://stats.bis.org/api/v1/data/WS_CBPOL/D.EA?format=csv',
  GB: 'https://stats.bis.org/api/v1/data/WS_CBPOL/D.GB?format=csv',
}

function parseBis(text) {
  if (!text) return []
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((c) => c.trim())
  const tIdx = header.indexOf('TIME_PERIOD')
  const vIdx = header.indexOf('OBS_VALUE')
  if (tIdx < 0 || vIdx < 0) return []
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    const date = String(cells[tIdx] ?? '').trim()
    const value = Number(cells[vIdx])
    // BIS 该序列是日频 D，TIME_PERIOD 形如 1954-07-01；也兼容月频 1954-07
    const normalized = /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
    if (!normalized || !Number.isFinite(value)) continue
    out.push({ date: normalized, value })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const BIS_SERIES = Object.entries(BIS_URLS).map(([code, url]) =>
  defineSeries({
    id: `bis:${code}`,
    label: `${code} 政策利率（BIS）`,
    source: 'bis',
    dataset: 'global:policy-rate',
    market: 'global',
    freq: 'monthly',
    unit: '%',
    caliber: 'BIS WS_CBPOL 官方政策利率，月度',
    ttlSec: 86_400,
    async fetch(ctx) {
      const res = await ctx.transport.getText(url, { viaProxy: true, timeoutMs: 20_000 })
      return res.status >= 200 && res.status < 300 ? parseBis(res.text) : []
    },
  }),
)

// ── Yahoo 全球指数 ──────────────────────────────────────────
const GLOBAL_INDICES = [
  { symbol: '^N225', label: '日经 225', market: 'jp' },
  { symbol: '^GDAXI', label: '德国 DAX', market: 'de' },
  { symbol: '^FTSE', label: '英国富时 100', market: 'gb' },
  { symbol: '^GSPTSE', label: '加拿大 S&P/TSX', market: 'ca' },
  { symbol: '^AXJO', label: '澳洲 ASX 200', market: 'au' },
  { symbol: '^BSESN', label: '印度 BSE Sensex', market: 'in' },
  { symbol: '^KS11', label: '韩国 KOSPI', market: 'kr' },
  { symbol: '^TWII', label: '台湾加权', market: 'tw' },
  { symbol: '^BVSP', label: '巴西 Bovespa', market: 'br' },
  { symbol: '000001.SS', label: '上证综指（Yahoo 交叉）', market: 'cn' },
]

async function fetchYahoo(ctx, symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`
  const res = await ctx.transport.getJson(url, { viaProxy: true, timeoutMs: 12_000 })
  const r = res.json?.chart?.result?.[0]
  const ts = r?.timestamp ?? []
  const closes = r?.indicators?.quote?.[0]?.close ?? []
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const v = Number(closes[i])
    if (!Number.isFinite(v) || v <= 0) continue
    out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: v })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const GLOBAL_INDEX_SERIES = GLOBAL_INDICES.map((item) =>
  defineSeries({
    id: `yahoo:${item.symbol}`,
    label: item.label,
    source: 'yahoo-global',
    dataset: 'global:index',
    market: item.market,
    freq: 'daily',
    unit: '点',
    caliber: '未复权收盘（Yahoo）',
    ttlSec: 900,
    async fetch(ctx) {
      return fetchYahoo(ctx, item.symbol)
    },
  }),
)

// ── 稳定币市值 ──────────────────────────────────────────────
export const SNAPSHOTS = [
  {
    id: 'global:stablecoins',
    label: '稳定币市值（离岸美元影子）',
    source: 'defillama',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.transport.getJson('https://stablecoins.llama.fi/stablecoins?includePrices=false', {
        viaProxy: false,
        timeoutMs: 15_000,
      })
      const assets = res.json?.peggedAssets
      if (!Array.isArray(assets)) return { available: false, reason: `DefiLlama 返回 ${res.status || '不可达'}` }
      const coins = assets
        .map((a) => ({
          symbol: a.symbol,
          name: a.name,
          marketCap: Number(a.circulating?.peggedUSD ?? a.circulating?.peggedCny ?? 0),
        }))
        .filter((c) => c.marketCap > 0)
        .sort((a, b) => b.marketCap - a.marketCap)
      const total = coins.reduce((s, c) => s + c.marketCap, 0)
      return {
        available: total > 0,
        total,
        coins: coins.slice(0, 12),
        asOf: new Date().toISOString().slice(0, 10),
        caliber: 'DefiLlama 稳定币流通市值，美元；仅作离岸美元流动性旁证',
      }
    },
  },
]
