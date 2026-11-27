/**
 * CBOE 每日市场统计：Put/Call 比率 + 成交量/持仓。
 *
 * CBOE 把统计以 JSON 字符串内嵌在页面里，需要先还原转义再按 name/value 抽取。
 * 口径：全市场与分品种（Equity / ETP / VIX / SPX）分别计算，不可混用。
 */

const URL_DAILY = 'https://www.cboe.com/markets/us/options/market-statistics/daily/'

const RATIO_LABELS = {
  'EQUITY PUT/CALL RATIO': 'Equity P/C',
  'EXCHANGE TRADED PRODUCTS PUT/CALL RATIO': 'ETP P/C',
  'CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO': 'VIX P/C',
  'SPX + SPXW + SPXO PUT/CALL RATIO': 'SPX P/C',
  'INDEX PUT/CALL RATIO': 'Index P/C',
}

function flatten(html) {
  return html.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/&quot;/g, '"')
}

function parseRatios(flat) {
  const out = {}
  const re = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]*)"\s*\}/g
  let m
  while ((m = re.exec(flat))) {
    const label = RATIO_LABELS[m[1].trim()]
    if (!label) continue
    const value = Number(String(m[2]).replace(/,/g, ''))
    if (Number.isFinite(value)) out[label] = value
  }
  return out
}

function parseTriplet(flat, name) {
  const start = flat.indexOf(`"${name}"`)
  if (start < 0) return null
  const slice = flat.slice(start, start + 1200)
  const nums = slice
    .split(/[,{}\[\]"]+/)
    .map((s) => Number(s.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
  if (nums.length < 3) return null
  return { call: nums[0], put: nums[1], total: nums[2] }
}

export const SNAPSHOTS = [
  {
    id: 'us:options-sentiment',
    label: 'CBOE Put/Call 与成交量',
    source: 'cboe',
    ttlSec: 1800,
    async fetch(ctx) {
      const res = await ctx.transport.getText(URL_DAILY, {
        viaProxy: true,
        timeoutMs: 15_000,
        headers: { Referer: 'https://www.cboe.com/' },
      })
      if (res.status < 200 || res.status >= 300 || !res.text) {
        return { available: false, reason: `CBOE 返回 ${res.status || '不可达'}` }
      }
      const flat = flatten(res.text)
      const ratios = parseRatios(flat)
      const volume = {}
      for (const block of ['EQUITY OPTIONS', 'EXCHANGE TRADED PRODUCTS', 'CBOE VOLATILITY INDEX (VIX)']) {
        const parsed = parseTriplet(flat, block)
        if (parsed) volume[block] = parsed
      }
      const ok = Object.keys(ratios).length > 0
      return {
        available: ok,
        ratios,
        volume,
        asOf: new Date().toISOString().slice(0, 10),
        reason: ok ? undefined : 'CBOE 页面结构变化，未解析到 Put/Call',
      }
    },
  },
]
