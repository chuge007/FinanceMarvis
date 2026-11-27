/**
 * 美国财政部官方收益率曲线（免 key，CSV）。
 *
 * 定位：FRED 不可达时的真实利率兜底，也是「双源交叉」的另一条腿。
 * 口径：日度收盘、名义收益率、不含 TIPS；与 FRED DGS* 允许 1bp 内差异。
 */
import { defineSeries } from './base.mjs'

const BASE = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv'

/** 表头 → 内部列名 */
const COLS = {
  '1 Mo': '1M',
  '3 Mo': '3M',
  '6 Mo': '6M',
  '1 Yr': '1Y',
  '2 Yr': '2Y',
  '5 Yr': '5Y',
  '10 Yr': '10Y',
  '20 Yr': '20Y',
  '30 Yr': '30Y',
}

function parseCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return {}
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim())
  const index = {}
  for (const [label, key] of Object.entries(COLS)) {
    const i = header.indexOf(label)
    if (i >= 0) index[key] = i
  }
  /** @type {Record<string, Array<{date:string,value:number}>>} */
  const out = {}
  for (const key of Object.keys(index)) out[key] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',')
    const rawDate = (cells[0] ?? '').replace(/"/g, '').trim()
    const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const date = m ? `${m[3]}-${m[1]}-${m[2]}` : rawDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    for (const [key, idx] of Object.entries(index)) {
      const value = Number((cells[idx] ?? '').replace(/"/g, ''))
      if (Number.isFinite(value)) out[key].push({ date, value })
    }
  }
  for (const key of Object.keys(out)) out[key].sort((a, b) => a.date.localeCompare(b.date))
  return out
}

async function fetchAllMaturities(ctx) {
  const year = new Date().getFullYear()
  const url = `${BASE}/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`
  const res = await ctx.transport.getText(url, { viaProxy: false, timeoutMs: 12_000, headers: { accept: 'text/csv' } })
  if (res.status >= 200 && res.status < 300 && res.text) return parseCsv(res.text)
  // 年初可能还没有当年文件，回退上一年
  const prev = `${BASE}/${year - 1}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year - 1}&page&_format=csv`
  const res2 = await ctx.transport.getText(prev, { viaProxy: false, timeoutMs: 12_000, headers: { accept: 'text/csv' } })
  return res2.status >= 200 && res2.status < 300 ? parseCsv(res2.text) : {}
}

const wrap = (key, label) =>
  defineSeries({
    id: `treasury:${key}`,
    label: `美债 ${label}`,
    source: 'treasury',
    dataset: 'us:yield-curve',
    market: 'us',
    freq: 'daily',
    unit: '%',
    caliber: '财政部官方日度收盘（名义）',
    ttlSec: 3600,
    async fetch(ctx) {
      const all = await fetchAllMaturities(ctx)
      return all[key] ?? []
    },
  })

/** @type {import('./base.mjs').SeriesDef[]} */
export const SERIES = ['1M', '3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y', '30Y'].map((k) => wrap(k, k))
