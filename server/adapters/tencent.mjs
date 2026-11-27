/**
 * 腾讯行情：A 股/港股/美股指数日线与实时快照。
 *
 * 定位：A 股主源。实测在多地网络下东财 push2 系接口会被重置（socket hang up），
 * 而腾讯 ifzq / qt 稳定可用，所以把它放在主源位置，东财退为备源。
 *
 * 口径：
 *  - K 线字段顺序 [date, open, close, high, low, volume]，注意是「开收高低」不是「开高低收」；
 *  - 快照接口返回 GBK 编码文本，必须按 gbk 解码，否则中文名乱码；
 *  - 指数无复权，个股默认前复权（qfq）。
 */
import { defineSeries } from './base.mjs'

const KLINE = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
const SNAPSHOT = 'https://qt.gtimg.cn/q='
const EM_KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const EM_UT = 'fa5fd1943c7b386f172d6893dbfba10b'

/** 东财 secid 映射：同一条序列的第二条腿，不是独立序列。 */
const EM_SECID = {
  sh000001: '1.000001',
  sz399001: '0.399001',
  sz399006: '0.399006',
  sh000300: '1.000300',
  sh000905: '1.000905',
  sh000852: '1.000852',
  sh000688: '1.000688',
  hkHSI: '100.HSI',
  hkHSTECH: '124.HSTECH',
}

const INDEX = [
  { symbol: 'sh000001', id: 'sh000001', label: '上证指数', market: 'cn' },
  { symbol: 'sz399001', id: 'sz399001', label: '深证成指', market: 'cn' },
  { symbol: 'sz399006', id: 'sz399006', label: '创业板指', market: 'cn' },
  { symbol: 'sh000300', id: 'sh000300', label: '沪深 300', market: 'cn' },
  { symbol: 'sh000905', id: 'sh000905', label: '中证 500', market: 'cn' },
  { symbol: 'sh000852', id: 'sh000852', label: '中证 1000', market: 'cn' },
  { symbol: 'sh000688', id: 'sh000688', label: '科创 50', market: 'cn' },
  { symbol: 'hkHSI', id: 'hkHSI', label: '恒生指数', market: 'hk' },
  { symbol: 'hkHSTECH', id: 'hkHSTECH', label: '恒生科技', market: 'hk' },
]

function parseKline(json, symbol) {
  const node = json?.data?.[symbol] ?? json?.data?.[symbol.toUpperCase()]
  if (!node) return []
  const rows = node.qfqday ?? node.day ?? node.hkday ?? []
  const out = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue
    const date = String(row[0])
    const close = Number(row[2])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue
    out.push({
      date,
      value: close,
      extra: { open: Number(row[1]), high: Number(row[3]), low: Number(row[4]), volume: Number(row[5]) },
    })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

async function fetchKline(ctx, symbol, count = 800) {
  const url = `${KLINE}?param=${symbol},day,,,${count},qfq`
  const res = await ctx.transport.getJson(url, {
    viaProxy: false,
    timeoutMs: 12_000,
    headers: { Referer: 'https://gu.qq.com/' },
  })
  return parseKline(res.json, symbol)
}

/** 备源：东财前复权 K 线，字段顺序「日期,开,收,高,低,量,额…」。 */
async function fetchEastmoneyKline(ctx, secid, limit = 1300) {
  const url =
    `${EM_KLINE}?secid=${secid}&ut=${EM_UT}&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${limit}`
  const res = await ctx.transport.getJson(url, {
    viaProxy: false,
    timeoutMs: 12_000,
    headers: { Referer: 'https://quote.eastmoney.com/' },
  })
  const rows = res.json?.data?.klines
  if (!Array.isArray(rows)) return []
  const out = []
  for (const line of rows) {
    const c = String(line).split(',')
    const date = c[0]
    const close = Number(c[2])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue
    out.push({
      date,
      value: close,
      extra: { open: Number(c[1]), high: Number(c[3]), low: Number(c[4]), volume: Number(c[5]) },
    })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/** @type {import('./base.mjs').SeriesDef[]} */
export const SERIES = INDEX.map((item) =>
  defineSeries({
    id: `cn:index:${item.id}`,
    label: item.label,
    source: 'tencent-web',
    dataset: 'cn:index-kline',
    market: item.market,
    freq: 'daily',
    unit: '点',
    caliber: item.market === 'cn' ? '前复权（指数无复权）' : '港股不复权',
    ttlSec: 900,
    /**
     * 主备链写在一条序列里：腾讯优先，东财兜底。
     * 成功后把实际来源带回调度器，写进 series.source —— 界面上看到的
     * 「来源」必须是真正取到数的那个，而不是定义时假定的那个。
     */
    async fetch(ctx) {
      const primary = await fetchKline(ctx, item.symbol)
      if (primary.length) return { points: primary, source: 'tencent-web' }
      const secid = EM_SECID[item.symbol]
      if (secid) {
        const fallback = await fetchEastmoneyKline(ctx, secid)
        if (fallback.length) return { points: fallback, source: 'eastmoney-kline' }
      }
      return []
    },
  }),
)

const RANK = 'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank'

/** 解析腾讯快照文本（GBK）：f[1] 名称、f[3] 现价、f[32] 涨跌幅。 */
async function fetchQuoteBatch(ctx, symbols) {
  const res = await ctx.transport.request({
    url: `${SNAPSHOT}${symbols}`,
    viaProxy: false,
    timeoutMs: 8000,
    headers: { Referer: 'https://gu.qq.com/' },
  })
  if (res.status < 200 || res.status >= 300) return []
  const text = new TextDecoder('gbk').decode(res.body)
  const rows = []
  for (const line of text.split(';')) {
    const m = line.match(/v_(\w+)="([^"]*)"/)
    if (!m) continue
    const f = m[2].split('~')
    if (f.length < 40) continue
    rows.push({
      symbol: m[1],
      name: f[1],
      price: Number(f[3]),
      prevClose: Number(f[4]),
      changePct: Number(f[32]),
      high: Number(f[33]),
      low: Number(f[34]),
      volume: Number(f[36]),
      amount: Number(f[37]),
      asOf: f[30],
    })
  }
  return rows
}

let sectorCache = { ts: 0, list: [] }

/** 腾讯行业板块榜：31 个申万一级近似分类，含当日/5/20/60 日涨跌幅与主力净流入。 */
async function fetchSectorRank(ctx) {
  if (Date.now() - sectorCache.ts < 120_000 && sectorCache.list.length) return sectorCache.list
  const url = `${RANK}?board_type=hy&sort_type=price&direct=down&offset=0&count=100`
  const res = await ctx.transport.getJson(url, { viaProxy: false, timeoutMs: 15_000 })
  const list = res.json?.data?.rank_list
  if (!Array.isArray(list) || !list.length) return []
  const rows = list.map((r) => ({
    code: r.code,
    name: r.name,
    changePct: Number(r.zdf),
    change5d: Number(r.zdf_d5),
    change20d: Number(r.zdf_d20),
    change60d: Number(r.zdf_d60),
    /** 腾讯字段单位是万元，这里转亿元，与东财口径对齐后再展示。 */
    mainNetInflow: Number.isFinite(Number(r.zljlr)) ? Number(r.zljlr) / 10000 : null,
    turnover: Number(r.turnover),
  }))
  sectorCache = { ts: Date.now(), list: rows }
  return rows
}

export const SNAPSHOTS = [
  {
    id: 'cn:quote-batch',
    label: 'A 股指数实时快照',
    source: 'tencent-quote',
    ttlSec: 30,
    async fetch(ctx) {
      const symbols = INDEX.filter((i) => i.market === 'cn').map((i) => i.symbol).join(',')
      const rows = await fetchQuoteBatch(ctx, symbols)
      return rows.length ? { available: true, quotes: rows } : { available: false, reason: '腾讯快照返回空' }
    },
  },
  {
    /**
     * 注意口径：这里是「31 个行业板块的涨跌分布」，不是「全市场个股涨跌家数」。
     * 东财 ulist 的个股宽度接口在当前网络不可用，腾讯排行也不开放全市场列表，
     * 所以只给真实可得的板块宽度，并在 label/caliber 里写清楚，避免被当成个股家数。
     */
    id: 'cn:breadth',
    label: '行业板块涨跌分布（31 个行业，非个股家数）',
    source: 'tencent-rank',
    ttlSec: 120,
    async fetch(ctx) {
      const rows = await fetchSectorRank(ctx)
      if (!rows.length) return { available: false, reason: '腾讯行业榜返回空' }
      let up = 0
      let down = 0
      let flat = 0
      for (const r of rows) {
        if (!Number.isFinite(r.changePct)) continue
        if (r.changePct > 0.01) up += 1
        else if (r.changePct < -0.01) down += 1
        else flat += 1
      }
      return {
        available: true,
        caliber: '行业板块（31 个）涨跌分布，非全市场个股家数',
        up,
        down,
        flat,
        total: rows.length,
        asOf: new Date().toISOString().slice(0, 10),
      }
    },
  },
  {
    id: 'cn:sector-flow',
    label: '行业板块涨跌与主力净流入',
    source: 'tencent-rank',
    ttlSec: 120,
    async fetch(ctx) {
      const rows = await fetchSectorRank(ctx)
      return rows.length
        ? { available: true, caliber: '腾讯行业榜，主力净流入单位已换算为亿元', rows }
        : { available: false, reason: '腾讯行业榜返回空' }
    },
  },
  {
    id: 'us:quotes',
    label: '美股主要指数快照',
    source: 'tencent-quote',
    ttlSec: 60,
    async fetch(ctx) {
      const rows = await fetchQuoteBatch(ctx, 'usDJI,usIXIC,usINX,usVIX')
      return rows.length ? { available: true, quotes: rows } : { available: false, reason: '腾讯美股快照返回空' }
    },
  },
]
