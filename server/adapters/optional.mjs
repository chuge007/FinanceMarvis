/**
 * 可选通道：Tushare / DataBull（都是「填了 Key 才出现」的增强域）。
 *
 * 设计原则：
 *  - 没 Key 时整条链路从注册表摘除，界面显示「需 Key」，不假装可用；
 *  - 有 Key 时也只补免 key 源拿不到的部分（财务三表、两融、龙虎榜、一致预期）；
 *  - 配额错误（429/402）立即降级，不重试烧配额。
 */
import { defineSeries } from './base.mjs'

export function createTushareClient({ transport, config, log }) {
  const token = config.keys?.tushare
  async function call(apiName, params = {}, fields = '') {
    if (!token) return { ok: false, reason: '未配置 TUSHARE_TOKEN' }
    const res = await transport.request({
      url: 'https://api.tushare.pro',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_name: apiName, token, params, fields }),
      viaProxy: false,
      timeoutMs: 20_000,
    })
    if (res.status === 429) return { ok: false, reason: '配额耗尽（429），已降级' }
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` }
    let json = null
    try {
      json = JSON.parse(res.body.toString('utf8'))
    } catch {
      return { ok: false, reason: 'JSON 解析失败' }
    }
    if (json.code !== 0) return { ok: false, reason: json.msg ?? `code ${json.code}` }
    return { ok: true, fields: json.data?.fields ?? [], items: json.data?.items ?? [] }
  }
  return { available: !!token, call, log }
}

export function createDataBullClient({ transport, config }) {
  const key = config.keys?.databull
  /** DataBull 要求裸代码：带 .SH/.SZ 个股会 400，指数会静默返回空数组。 */
  function normalizeSymbol(symbol) {
    return String(symbol).replace(/\.(SH|SZ|BJ|SS)$/i, '')
  }
  /** /cn/index/history 严格要求 YYYYMMDD。 */
  function normalizeDate(date) {
    const m = String(date).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`
    return String(date).replace(/-/g, '')
  }
  async function get(path, params = {}) {
    if (!key) return { ok: false, reason: '未配置 DATABULL_API_KEY' }
    const qs = new URLSearchParams(params).toString()
    const res = await transport.getJson(`https://api.databull.cn${path}${qs ? `?${qs}` : ''}`, {
      viaProxy: false,
      timeoutMs: 15_000,
      headers: { Authorization: `Bearer ${key}`, 'X-API-Key': key },
    })
    if (res.status === 429) {
      const retryAfter = Number(res.headers?.['retry-after'] ?? 0)
      return { ok: false, reason: `配额耗尽，${retryAfter || 60}s 后重试`, retryAfter }
    }
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` }
    return { ok: true, data: res.json }
  }
  return { available: !!key, get, normalizeSymbol, normalizeDate }
}

/**
 * FMP（Financial Modeling Prep）官方 API：美股 EOD 备源。
 * 免费档 250 req/天；402 是时点性配额耗尽，立即降级、不重试烧配额。
 * 口径：stable/historical-price-eod/full 的日线收盘，非复权语义需与 Yahoo 交叉。
 */
export function createFmpClient({ transport, config }) {
  const key = config.keys?.fmp
  async function get(path, params = {}) {
    if (!key) return { ok: false, reason: '未配置 FMP_API_KEY' }
    const qs = new URLSearchParams({ ...params, apikey: key }).toString()
    const res = await transport.getJson(`https://financialmodelingprep.com/stable${path}?${qs}`, {
      viaProxy: true,
      timeoutMs: 20_000,
    })
    if (res.status === 402 || res.status === 429) {
      return { ok: false, reason: `配额耗尽（${res.status}），已降级且不重试`, quotaExhausted: true }
    }
    if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` }
    return { ok: true, data: res.json }
  }
  return { available: !!key, get }
}

/** 只有配置了 Key 才会被注册进调度（index.mjs 负责过滤）。 */
export function createOptionalSeries({ tushare, databull, fmp }) {
  const series = []

  if (databull?.available) {
    series.push(
      defineSeries({
        id: 'databull:sh000001',
        label: '上证指数（DataBull）',
        source: 'databull',
        dataset: 'cn:index',
        market: 'cn',
        freq: 'daily',
        unit: '点',
        caliber: 'DataBull 裸代码口径',
        ttlSec: 900,
        async fetch(ctx) {
          const res = await databull.get('/cn/index/history', {
            index_code: databull.normalizeSymbol('000001'),
            start_date: databull.normalizeDate('2015-01-01'),
            end_date: databull.normalizeDate(new Date().toISOString().slice(0, 10)),
          })
          const rows = res.ok ? res.data?.data ?? res.data ?? [] : []
          if (!Array.isArray(rows)) return []
          return rows
            .map((r) => ({
              date: String(r.trade_date ?? r.date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
              value: Number(r.close),
            }))
            .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
            .sort((a, b) => a.date.localeCompare(b.date))
        },
      }),
    )
  }

  if (tushare?.available) {
    series.push(
      defineSeries({
        id: 'tushare:index-daily',
        label: '沪深 300（Tushare）',
        source: 'tushare',
        dataset: 'cn:index',
        market: 'cn',
        freq: 'daily',
        unit: '点',
        caliber: 'Tushare index_daily',
        ttlSec: 900,
        async fetch() {
          const res = await tushare.call('index_daily', { ts_code: '000300.SH' }, 'trade_date,close')
          if (!res.ok) return []
          const iDate = res.fields.indexOf('trade_date')
          const iClose = res.fields.indexOf('close')
          if (iDate < 0 || iClose < 0) return []
          return res.items
            .map((row) => ({
              date: String(row[iDate]).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
              value: Number(row[iClose]),
            }))
            .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
            .sort((a, b) => a.date.localeCompare(b.date))
        },
      }),
    )
  }

  if (fmp?.available) {
    series.push(
      defineSeries({
        id: 'fmp:spy-eod',
        label: '标普 500 ETF SPY（FMP EOD 备源）',
        source: 'fmp',
        dataset: 'us:index-kline',
        market: 'us',
        freq: 'daily',
        unit: '美元',
        caliber: 'FMP stable EOD，sp500 EOD 备源；402/429 立即降级不重试',
        ttlSec: 3600,
        async fetch() {
          const res = await fmp.get('/historical-price-eod/full', { symbol: 'SPY' })
          if (!res.ok) return []
          const rows = Array.isArray(res.data) ? res.data : res.data?.historical ?? []
          if (!Array.isArray(rows)) return []
          return rows
            .map((r) => ({
              date: String(r.date ?? '').slice(0, 10),
              value: Number(r.close),
            }))
            .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
            .sort((a, b) => a.date.localeCompare(b.date))
        },
      }),
    )
  }

  return series
}

/** Tushare 返回 fields + items；转成对象行，保留 ann_date 作为 PIT 锚点。 */
function tushareRows(res) {
  if (!res.ok || !Array.isArray(res.fields)) return []
  return res.items.map((item) => {
    const row = {}
    res.fields.forEach((field, i) => { row[field] = item[i] })
    return row
  })
}

/**
 * 有 Key 才注册的结构化快照：财务三表 / 指标 / 两融 / 龙虎榜。
 * 全部带 ann_date（公告日）锚点，S4 爬虫源不得顶替这些主源。
 */
export function createOptionalSnapshots({ tushare }) {
  if (!tushare?.available) return []
  const defs = [
    { id: 'cn:financial-income', label: 'A 股利润表（Tushare）', api: 'income', fields: 'ts_code,ann_date,end_date,revenue,operate_profit,n_income_attr_p', ttlSec: 86_400 },
    { id: 'cn:financial-balance', label: 'A 股资产负债表（Tushare）', api: 'balance', fields: 'ts_code,ann_date,end_date,total_assets,total_liab,total_hldr_eqy_exc_min_int', ttlSec: 86_400 },
    { id: 'cn:financial-cashflow', label: 'A 股现金流量表（Tushare）', api: 'cashflow', fields: 'ts_code,ann_date,end_date,net_cash_flows_oper_act,free_cashflow', ttlSec: 86_400 },
    { id: 'cn:financial-indicator', label: 'A 股财务指标（Tushare）', api: 'fina_indicator', fields: 'ts_code,ann_date,end_date,eps,roe,grossprofit_margin', ttlSec: 86_400 },
    { id: 'cn:margin-tushare', label: 'A 股两融明细（Tushare 主源）', api: 'margin', fields: 'trade_date,exchange_id,rzye,rzmre,rzche', ttlSec: 86_400 },
    { id: 'cn:lhb-tushare', label: 'A 股龙虎榜（Tushare 主源）', api: 'top_list', fields: 'trade_date,ts_code,name,close,pct_change,net_amount', ttlSec: 86_400 },
  ]
  return defs.map((def) => ({
    id: def.id,
    label: def.label,
    source: 'tushare',
    ttlSec: def.ttlSec,
    async fetch() {
      const params = { ts_code: '000001.SZ' }
      if (def.api === 'margin') delete params.ts_code
      const res = await tushare.call(def.api, params, def.fields)
      const rows = tushareRows(res)
      if (!rows.length) return { available: false, reason: res.reason ?? `${def.api} 不可得` }
      const asOf = String(rows[0].ann_date ?? rows[0].trade_date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
      return {
        available: true,
        asOf: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
        rows,
        caliber: rows[0].ann_date ? 'PIT：以 ann_date 公告日为可得时点' : 'trade_date 口径',
      }
    },
  }))
}
