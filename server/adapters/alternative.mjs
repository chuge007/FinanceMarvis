/**
 * alternative.me 恐惧贪婪指数（加密市场情绪代理，免 key）。
 *
 * 口径：0 极度恐慌 ~ 100 极度贪婪；日频，与 A 股/美股情绪不可直接比较，
 * 只作全球风险偏好的旁证。
 */
import { defineSeries } from './base.mjs'

const URL = 'https://api.alternative.me/fng/'

async function fetchSeries(ctx, limit = 730) {
  const res = await ctx.transport.getJson(`${URL}?limit=${limit}&format=json`, { viaProxy: true, timeoutMs: 10_000 })
  const rows = res.json?.data ?? []
  const out = []
  for (const row of rows) {
    const ts = Number(row.timestamp)
    const value = Number(row.value)
    if (!Number.isFinite(ts) || !Number.isFinite(value)) continue
    out.push({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      value,
      extra: { classification: row.value_classification },
    })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** @type {import('./base.mjs').SeriesDef[]} */
export const SERIES = [
  defineSeries({
    id: 'alt:fear-greed',
    label: '恐惧贪婪指数',
    source: 'alternative',
    dataset: 'sentiment:fear-greed',
    market: 'global',
    freq: 'daily',
    unit: 'index',
    caliber: 'alternative.me 官方分类',
    ttlSec: 3600,
    async fetch(ctx) {
      return fetchSeries(ctx)
    },
  }),
]
