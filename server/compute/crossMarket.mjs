/**
 * 跨市场体制与轮动：用本地真实序列计算每个市场的环境分数。
 *
 * airoom 的第三方分数是可选并列项，不参与这里的计算 ——
 * 两者来源不同、口径不同，混在一起会产生最隐蔽的错误（万象铁律 2）。
 */
import { computeRegime } from '../../core/domain/regime.mjs'
import { changeOf } from '../../core/domain/factors.mjs'

/** 每个市场用「定价锚 + 信用 + 波动 + 本币资产动量」四类代表序列。 */
export const MARKET_GROUPS = {
  US: {
    label: '美国',
    weights: {
      'fred:DGS10': { weight: 0.2, invert: true, label: '10Y 美债' },
      'fred:BAMLH0A0HYM2': { weight: 0.25, invert: true, label: 'HY OAS' },
      'fred:NFCI': { weight: 0.2, invert: true, label: '金融条件' },
      'yahoo:^VIX': { weight: 0.2, invert: true, label: 'VIX' },
      'yahoo:^GSPC': { weight: 0.15, invert: false, label: '标普动量', momentum: 60 },
    },
  },
  CN: {
    label: '中国',
    weights: {
      'cn:index:sh000300': { weight: 0.35, invert: false, label: '沪深300动量', momentum: 60 },
      'cn:index:sh000001': { weight: 0.2, invert: false, label: '上证动量', momentum: 60 },
      'fred:DCOILWTICO': { weight: 0.1, invert: true, label: '原油（输入性通胀）' },
      'yahoo:^VIX': { weight: 0.2, invert: true, label: '外部波动' },
      'fred:BAMLH0A0HYM2': { weight: 0.15, invert: true, label: '全球信用' },
    },
  },
  HK: {
    label: '香港',
    weights: {
      'cn:index:hkHSI': { weight: 0.4, invert: false, label: '恒生动量', momentum: 60 },
      'cn:index:hkHSTECH': { weight: 0.25, invert: false, label: '恒科动量', momentum: 60 },
      'yahoo:^VIX': { weight: 0.2, invert: true, label: '外部波动' },
      'fred:DGS10': { weight: 0.15, invert: true, label: '美元利率' },
    },
  },
  COMMODITY: {
    label: '商品',
    weights: {
      'yahoo:GC=F': { weight: 0.3, invert: false, label: '黄金动量', momentum: 60 },
      'yahoo:CL=F': { weight: 0.3, invert: false, label: '原油动量', momentum: 60 },
      'fred:T10YIE': { weight: 0.2, invert: false, label: '通胀预期' },
      'yahoo:DX-Y.NYB': { weight: 0.2, invert: true, label: '美元指数' },
    },
  },
  FX: {
    label: '外汇',
    weights: {
      'fred:DEXJPUS': { weight: 0.4, invert: false, label: '美元兑日元动量', momentum: 60 },
      'yahoo:DX-Y.NYB': { weight: 0.4, invert: true, label: '美元指数' },
      'fred:DGS10': { weight: 0.2, invert: false, label: '美债利率' },
    },
  },
  CRYPTO: {
    label: '加密',
    weights: {
      'yahoo:BTC-USD': { weight: 0.6, invert: false, label: '比特币动量', momentum: 60 },
      'alt:fear-greed': { weight: 0.25, invert: true, label: '恐惧贪婪（反向）' },
      'yahoo:^VIX': { weight: 0.15, invert: true, label: '传统市场波动' },
    },
  },
  // 全球主要市场：用本地指数动量 + 全球信用/波动两个共同约束打分。
  // 覆盖 airoom 声明的部分市场，口径与第三方分数分列，不混合。
  ...Object.fromEntries(
    [
      ['JP', '日本', 'yahoo:^N225'],
      ['DE', '德国', 'yahoo:^GDAXI'],
      ['GB', '英国', 'yahoo:^FTSE'],
      ['CA', '加拿大', 'yahoo:^GSPTSE'],
      ['AU', '澳大利亚', 'yahoo:^AXJO'],
      ['IN', '印度', 'yahoo:^BSESN'],
      ['KR', '韩国', 'yahoo:^KS11'],
      ['TW', '台湾', 'yahoo:^TWII'],
      ['BR', '巴西', 'yahoo:^BVSP'],
      ['CNX', '上证(Yahoo交叉)', 'yahoo:000001.SS'],
    ].map(([code, label, symbol]) => [
      code,
      {
        label,
        weights: {
          [symbol]: { weight: 0.6, invert: false, label: `${label}动量`, momentum: 60 },
          'fred:BAMLH0A0HYM2': { weight: 0.2, invert: true, label: '全球信用' },
          'yahoo:^VIX': { weight: 0.2, invert: true, label: '全球波动' },
        },
      },
    ]),
  ),
}

/**
 * @param {{getSeries:(id:string)=>Array<{date:string,value:number}>}} repo
 * @param {ReturnType<typeof import('../adapters/airoom.mjs').createAiroornSource>} [airoom]
 */
export function computeCrossMarket(repo, airoom) {
  const markets = Object.entries(MARKET_GROUPS).map(([code, def]) => {
    const regime = computeRegime(repo, { market: code, weights: def.weights })
    const representative = Object.keys(def.weights)[0]
    const pts = repo.getSeries(representative)
    const chg = changeOf(pts, 20)
    return {
      code,
      label: def.label,
      score: regime.score,
      band: regime.band,
      coverage: regime.coverage,
      drivers: regime.drivers,
      momentum20d: chg?.pct ?? null,
      source: 'compute:local-radar',
    }
  })

  // 分数高的在前；不可得排最后，不补 0
  markets.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  let thirdParty = null
  if (airoom?.available) {
    thirdParty = { available: true, source: 'airoom:csv', hint: airoom.hint }
  } else {
    thirdParty = { available: false, source: 'airoom:csv', reason: airoom?.hint ?? 'CSV 未导入' }
  }

  return {
    markets,
    thirdParty,
    asOf: new Date().toISOString().slice(0, 10),
    source: 'compute:cross-market',
    note: '本地自算分数与 airoom 第三方分数分列展示，不混合计算',
  }
}
