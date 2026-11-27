/**
 * 全球宏观补充源：纽约联储 SOFR、世界银行、CFTC COT、日本财务省 JGB。
 *
 * 这些源的价值是「交叉验证 + 补 FRED 覆盖不到的口径」：
 *  - SOFR 用 NY Fed 一手数据核对 FRED 镜像；
 *  - 世界银行给年度跨国面板（十年以上，适合长周期分位）；
 *  - CFTC COT 是唯一免费的结构化持仓拥挤度来源；
 *  - JGB 曲线是套息交易与日元流动性的锚。
 */
import { defineSeries } from './base.mjs'

// ── 纽约联储 SOFR ────────────────────────────────────────────
export const NYFED_SERIES = [
  defineSeries({
    id: 'nyfed:SOFR',
    label: 'SOFR（纽约联储一手）',
    source: 'nyfed',
    dataset: 'us:repo',
    market: 'us',
    freq: 'daily',
    unit: '%',
    caliber: '纽约联储官方发布',
    ttlSec: 3600,
    async fetch(ctx) {
      const res = await ctx.transport.getJson('https://markets.newyorkfed.org/api/rates/secured/sofr/last/260.json', {
        viaProxy: false,
        timeoutMs: 10_000,
      })
      const rows = res.json?.refRates ?? []
      const out = rows
        .map((r) => ({ date: String(r.effectiveDate ?? '').slice(0, 10), value: Number(r.percentRate) }))
        .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
      out.sort((a, b) => a.date.localeCompare(b.date))
      return out
    },
  }),
]

// ── 世界银行年度面板 ─────────────────────────────────────────
const WB_INDICATORS = [
  { code: 'NY.GDP.MKTP.CD', id: 'gdp-usd', label: 'GDP（现价美元）', unit: '美元' },
  { code: 'NY.GDP.MKTP.KD.ZG', id: 'gdp-growth', label: 'GDP 增速', unit: '%' },
  { code: 'FP.CPI.TOTL.ZG', id: 'cpi', label: 'CPI 通胀', unit: '%' },
  { code: 'BN.CAB.XOKA.GD.ZS', id: 'current-account', label: '经常账户/GDP', unit: '%' },
]

export const WORLDBANK_SERIES = WB_INDICATORS.flatMap((ind) =>
  ['CN', 'US', 'JP', 'DE'].map((country) =>
    defineSeries({
      id: `wb:${country}:${ind.id}`,
      label: `世界银行 ${country} ${ind.label}`,
      source: 'worldbank',
      dataset: 'global:macro-annual',
      market: 'global',
      freq: 'quarterly',
      unit: ind.unit,
      caliber: '年度值，世界银行口径',
      ttlSec: 86_400,
      async fetch(ctx) {
        const url =
          `https://api.worldbank.org/v2/country/${country}/indicator/${ind.code}` +
          `?format=json&per_page=200&date=1990:${new Date().getFullYear()}`
        const res = await ctx.transport.getJson(url, { viaProxy: false, timeoutMs: 15_000 })
        const rows = Array.isArray(res.json) ? res.json[1] ?? [] : []
        const out = []
        for (const row of rows) {
          const value = Number(row.value)
          if (!Number.isFinite(value)) continue
          out.push({ date: `${row.date}-12-31`, value })
        }
        out.sort((a, b) => a.date.localeCompare(b.date))
        return out
      },
    }),
  ),
)

// ── CFTC 持仓报告（COT）─────────────────────────────────────
const COT_MARKETS = [
  { key: 'GOLD', id: 'gold', label: '黄金' },
  { key: 'S&P 500', id: 'spx', label: '标普 500' },
  { key: '10-YEAR U.S. TREASURY NOTES', id: 'ust10y', label: '10Y 美债' },
  { key: 'U.S. DOLLAR INDEX', id: 'dxy', label: '美元指数' },
]

export const CFTC_SNAPSHOTS = [
  {
    id: 'positioning:cot',
    label: 'CFTC 非商业净持仓',
    source: 'cftc',
    ttlSec: 21_600,
    async fetch(ctx) {
      const url =
        'https://publicreporting.cftc.gov/resource/6dca-aqww.json' +
        '?$limit=800&$order=report_date_as_yyyy_mm_dd DESC'
      // Socrata 对匿名请求会返回 403（限流/风控），有 app token 时带上才能稳定取数。
      const headers = { accept: 'application/json' }
      if (ctx.config?.keys?.cftc) headers['X-App-Token'] = ctx.config.keys.cftc
      const res = await ctx.transport.getJson(url, { viaProxy: false, timeoutMs: 20_000, headers })
      if (res.status === 403) {
        return {
          available: false,
          reason: 'CFTC 拒绝匿名请求（403），配置 CFTC_APP_TOKEN 后启用',
        }
      }
      if (!Array.isArray(res.json)) return { available: false, reason: `CFTC 返回 ${res.status || '不可达'}` }
      const byMarket = {}
      for (const row of res.json) {
        const name = String(row.market_and_exchange_names ?? '')
        const hit = COT_MARKETS.find((m) => name.includes(m.key))
        if (!hit) continue
        const date = String(row.report_date_as_yyyy_mm_dd ?? '').slice(0, 10)
        const long = Number(row.noncomm_positions_long_all)
        const short = Number(row.noncomm_positions_short_all)
        const oi = Number(row.open_interest_all)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(long) || !Number.isFinite(short)) continue
        const prev = byMarket[hit.id]
        if (prev && prev.date >= date) continue
        byMarket[hit.id] = {
          label: hit.label,
          date,
          long,
          short,
          net: long - short,
          openInterest: Number.isFinite(oi) ? oi : null,
          netRatio: Number.isFinite(oi) && oi > 0 ? (long - short) / oi : null,
        }
      }
      return { available: Object.keys(byMarket).length > 0, markets: byMarket }
    },
  },
]

// ── 日本财务省国债曲线 ──────────────────────────────────────
export const JGB_SERIES = [
  defineSeries({
    id: 'mof:JGB10Y',
    label: '日本 10Y 国债',
    source: 'mof-jgb',
    dataset: 'jp:yield-curve',
    market: 'global',
    freq: 'daily',
    unit: '%',
    caliber: '日本财务省官方 CSV',
    ttlSec: 21_600,
    async fetch(ctx) {
      const url = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv'
      const res = await ctx.transport.getText(url, { viaProxy: false, timeoutMs: 20_000 })
      if (res.status < 200 || res.status >= 300 || !res.text) return []
      const lines = res.text.split('\n')
      // 这份 CSV 第一行是标题（"Interest Rate (November 2026),...,(Unit : %)"），
      // 第二行才是表头。固定按第 0 行取表头会找不到 10Y 列，导致整条序列静默为空。
      let headerIdx = -1
      for (let i = 0; i < Math.min(6, lines.length); i++) {
        const cells = (lines[i] ?? '').split(',').map((c) => c.trim().toUpperCase())
        if (cells.includes('DATE') || cells.includes('10Y')) {
          headerIdx = i
          if (cells.includes('10Y')) break
        }
      }
      if (headerIdx < 0) return []
      const header = (lines[headerIdx] ?? '').split(',')
      const idx = header.findIndex((h) => h.trim().toUpperCase() === '10Y')
      if (idx < 0) return []
      const out = []
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cells = lines[i].split(',')
        const raw = (cells[0] ?? '').trim()
        const m = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
        if (!m) continue
        const value = Number(cells[idx])
        if (!Number.isFinite(value)) continue
        out.push({ date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, value })
      }
      out.sort((a, b) => a.date.localeCompare(b.date))
      return out
    },
  }),
]
