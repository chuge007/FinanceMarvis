/**
 * FRED（圣路易斯联储）序列：图表 CSV 直链，免 key。
 *
 * 通道：先直连 /fred/graph/fredgraph.csv，失败再走 /fred-proxy（出海代理）。
 * 口径：CSV 缺失值写作 "."，一律跳过不插值 —— 插值会污染分位与相关性。
 */
import { defineSeries, parseTwoColCsv, tail } from './base.mjs'

const PATH = '/graph/fredgraph.csv'

/** @type {Array<{id:string,label:string,unit:string,freq:string,dataset:string}>} */
const CATALOG = [
  // 利率与真实利率
  { id: 'DGS2', label: '2Y 美债收益率', unit: '%', freq: 'daily', dataset: 'us:rates' },
  { id: 'DGS10', label: '10Y 美债收益率', unit: '%', freq: 'daily', dataset: 'us:rates' },
  { id: 'DGS30', label: '30Y 美债收益率', unit: '%', freq: 'daily', dataset: 'us:rates' },
  { id: 'DFF', label: '联邦基金有效利率', unit: '%', freq: 'daily', dataset: 'us:rates' },
  { id: 'SOFR', label: 'SOFR', unit: '%', freq: 'daily', dataset: 'us:rates' },
  { id: 'DFII10', label: '10Y 实际利率（TIPS）', unit: '%', freq: 'daily', dataset: 'us:real-rate' },
  { id: 'DFII5', label: '5Y 实际利率（TIPS）', unit: '%', freq: 'daily', dataset: 'us:real-rate' },
  { id: 'T10YIE', label: '10Y 通胀预期', unit: '%', freq: 'daily', dataset: 'us:inflation' },
  { id: 'T5YIE', label: '5Y 通胀预期', unit: '%', freq: 'daily', dataset: 'us:inflation' },
  { id: 'MICH', label: '密歇根 1Y 通胀预期', unit: '%', freq: 'monthly', dataset: 'us:inflation' },
  // 通胀
  { id: 'CPIAUCSL', label: '美国 CPI 指数', unit: 'index', freq: 'monthly', dataset: 'us:inflation' },
  { id: 'CPILFESL', label: '美国核心 CPI 指数', unit: 'index', freq: 'monthly', dataset: 'us:inflation' },
  { id: 'PCEPILFE', label: '核心 PCE 指数', unit: 'index', freq: 'monthly', dataset: 'us:inflation' },
  { id: 'PPIACO', label: 'PPI 最终品', unit: 'index', freq: 'monthly', dataset: 'us:inflation' },
  // 就业
  { id: 'PAYEMS', label: '非农就业人数', unit: '千人', freq: 'monthly', dataset: 'us:employment' },
  { id: 'UNRATE', label: '失业率', unit: '%', freq: 'monthly', dataset: 'us:employment' },
  { id: 'ICSA', label: '初请失业金', unit: '人', freq: 'weekly', dataset: 'us:employment' },
  { id: 'JTSJOL', label: '职位空缺', unit: '千人', freq: 'monthly', dataset: 'us:employment' },
  // 增长与消费
  { id: 'WEI', label: '周度经济指数 WEI', unit: 'index', freq: 'weekly', dataset: 'us:growth' },
  { id: 'CFNAI', label: '芝加哥联储全国活动指数', unit: 'index', freq: 'monthly', dataset: 'us:growth' },
  { id: 'RSAFS', label: '零售销售', unit: '百万美元', freq: 'monthly', dataset: 'us:consumption' },
  { id: 'UMCSENT', label: '密歇根消费者信心', unit: 'index', freq: 'monthly', dataset: 'us:consumption' },
  // 流动性
  { id: 'RRPONTSYD', label: '隔夜逆回购 RRP', unit: '十亿美元', freq: 'daily', dataset: 'us:liquidity' },
  { id: 'WTREGEN', label: '财政部一般账户 TGA', unit: '十亿美元', freq: 'weekly', dataset: 'us:liquidity' },
  { id: 'WALCL', label: '美联储资产负债表', unit: '百万美元', freq: 'weekly', dataset: 'us:liquidity' },
  // 金融条件与信用
  { id: 'NFCI', label: '芝加哥联储金融条件', unit: 'index', freq: 'weekly', dataset: 'us:financial-conditions' },
  { id: 'BAMLH0A0HYM2', label: '高收益债 OAS', unit: '%', freq: 'daily', dataset: 'us:credit-spread' },
  { id: 'VIXCLS', label: 'VIX 收盘', unit: 'index', freq: 'daily', dataset: 'us:volatility' },
  // 商品与汇率
  { id: 'DCOILWTICO', label: 'WTI 原油现货', unit: '美元/桶', freq: 'daily', dataset: 'commodity:energy' },
  { id: 'DEXJPUS', label: 'USDJPY 官方汇率', unit: '日元', freq: 'daily', dataset: 'fx:official' },
]

const UPSTREAM = 'https://fred.stlouisfed.org'

/** 适配器直接打上游，不经自己的转发层（否则会绕一圈回环）。 */
async function fetchOne(ctx, seriesId, limit) {
  const url = `${UPSTREAM}${PATH}?id=${encodeURIComponent(seriesId)}`
  for (const viaProxy of [false, true]) {
    const res = await ctx.transport.getText(url, { viaProxy, timeoutMs: 8000 })
    if (res.status >= 200 && res.status < 300 && res.text) {
      const points = parseTwoColCsv(res.text)
      if (points.length) return tail(points, limit)
    }
  }
  return []
}

/** @type {import('./base.mjs').SeriesDef[]} */
export const SERIES = CATALOG.map((item) =>
  defineSeries({
    id: `fred:${item.id}`,
    label: item.label,
    source: 'fred',
    dataset: item.dataset,
    market: 'us',
    freq: /** @type {any} */ (item.freq),
    unit: item.unit,
    caliber: item.freq === 'daily' ? '日度收盘/当日值' : '官方发布值',
    async fetch(ctx) {
      return fetchOne(ctx, item.id, 2600)
    },
  }),
)
