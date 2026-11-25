/**
 * 跨资产目录：全球地形的唯一事实来源。
 *
 * 只放「看什么、从哪取、越高代表什么」的定义；取数、归一化、合成分别在
 * crossAsset.ts 与 core/analysis/terrain.ts，UI 不得自行写名称、阈值或极性。
 *
 * source 说明：
 *  - yahoo    → ref 是 Yahoo Chart 代码（期货、全球指数、ETF、汇率、商品、加密）
 *  - fred     → ref 是 FRED series id（利率、通胀预期、曲线）
 *  - snapshot → 复用 rhythm 统一快照里的序列，避免重复请求
 *  - cboe     → 复用期权情绪（CBOE 官方每日 Put/Call），只有当日值、无历史
 *  - derived  → 由上面几类按日期对齐后计算，见 crossAsset.ts 的 DERIVED_IDS
 *
 * role 说明：
 *  - risk      参与「风险偏好」合成分
 *  - liquidity 参与「流动性」合成分
 *  - context   只展示，不参与打分（避免把方向不明的指标硬塞进结论）
 */

export type AssetGroupId = 'futures' | 'rates' | 'credit' | 'fxCommodity' | 'positioning' | 'crypto';
export type CrossAssetSource = 'yahoo' | 'fred' | 'snapshot' | 'cboe' | 'derived';
export type AssetRole = 'risk' | 'liquidity' | 'context';
export type AssetRegion = 'US' | 'EU' | 'JP' | 'CN' | 'GLOBAL';

export interface CrossAssetDef {
  id: string;
  label: string;
  short: string;
  group: AssetGroupId;
  source: CrossAssetSource;
  ref: string;
  region: AssetRegion;
  unit: '%' | 'pt' | 'usd' | 'index' | 'ratio';
  digits: number;
  /** 1 = 越高越 risk-on；-1 = 越高越 risk-off / 钱越紧；0 = 方向不明，只展示 */
  polarity: 1 | -1 | 0;
  role: AssetRole;
  note: string;
  pitfall: string;
  externalUrl?: string;
  /** Yahoo 不可达时的腾讯现货指数代码（仅同一指数的现货兜底）。 */
  tencentSymbol?: string;
}

export const TERRAIN_GROUPS: { id: AssetGroupId; label: string; hint: string }[] = [
  { id: 'futures', label: '股指期货', hint: '隔夜谁在领涨、谁在拖后腿' },
  { id: 'rates', label: '美债与利率', hint: '钱的价格与曲线形状' },
  { id: 'credit', label: '信用与风险', hint: '市场愿意为风险付多少钱' },
  { id: 'fxCommodity', label: '美元与商品', hint: '全球美元流动性与实物需求' },
  { id: 'positioning', label: '仓位与资金', hint: '人群站在哪一边、成交是否放大' },
  { id: 'crypto', label: '加密温度计', hint: '7×24 的流动性代理，不休息' },
];

const CME_ES = 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html';
const CBOE_DAILY = 'https://www.cboe.com/markets/us/options/market-statistics/daily/';
const etfUrl = (symbol: string) => `https://finance.yahoo.com/quote/${symbol}`;
const fredUrl = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

export const CROSS_ASSET_DEFS: CrossAssetDef[] = [
  // ── 股指期货 ─────────────────────────────────────────────
  { id: 'ES', label: '标普500 期货', short: '标普期指', group: 'futures', source: 'yahoo', ref: 'ES=F', region: 'US', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '美股风险偏好的第一现场，盘前看它比看现货更早。', pitfall: '期货有基差与到期换月，涨跌幅不等于现货指数。', externalUrl: CME_ES },
  { id: 'NQ', label: '纳指100 期货', short: '纳指期指', group: 'futures', source: 'yahoo', ref: 'NQ=F', region: 'US', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '利率敏感度最高的股指，实际利率上行时它先受压。', pitfall: '权重集中在少数科技巨头，不等于美国经济全貌。', externalUrl: CME_ES },
  { id: 'YM', label: '道指期货', short: '道指期指', group: 'futures', source: 'yahoo', ref: 'YM=F', region: 'US', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '价值/工业权重更高，和纳指对照能看出风格切换。', pitfall: '30 只成分股、价格加权，代表性有限。' },
  { id: 'RTY', label: '罗素2000 期货', short: '小盘期指', group: 'futures', source: 'yahoo', ref: 'RTY=F', region: 'US', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '小盘股对信用与国内流动性更敏感，是风险偏好的边缘探针。', pitfall: '流动性差、波动大，单日噪声多。' },
  { id: 'GDAXI', label: '德国 DAX', short: '德指', group: 'futures', source: 'yahoo', ref: '^GDAXI', region: 'EU', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '欧洲风险偏好与制造业景气的窗口。', pitfall: '受欧元汇率与出口周期影响，和美股不总是同步。' },
  { id: 'FTSE', label: '英国富时100', short: '英指', group: 'futures', source: 'yahoo', ref: '^FTSE', region: 'EU', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '能源与金融权重高，油价和利率的交叉读数。', pitfall: '英镑计价，汇率会扭曲本币涨跌。' },
  { id: 'N225', label: '日经225', short: '日经', group: 'futures', source: 'yahoo', ref: '^N225', region: 'JP', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '日元与全球风险偏好的杠杆读数，常领先美欧开盘。', pitfall: '日元贬值会推高名义指数，需同时看汇率。' },
  { id: 'HSI', label: '恒生指数', short: '恒指', group: 'futures', source: 'yahoo', ref: '^HSI', region: 'CN', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '离岸中国资产的定价窗口，对美元流动性敏感。', pitfall: '受政策与地缘消息驱动，技术面容易失效。', tencentSymbol: 'hkHSI' },
  { id: 'SSE', label: '上证指数', short: '上证', group: 'futures', source: 'yahoo', ref: '000001.SS', region: 'CN', unit: 'index', digits: 0, polarity: 1, role: 'risk', note: '在岸 A 股的温度计，和恒指对照看内外资分歧。', pitfall: '指数受权重股影响大，个股体验可能完全不同。', tencentSymbol: 'sh000001' },

  // ── 美债与利率 ───────────────────────────────────────────
  { id: 'DGS2', label: '2 年期美债', short: '2Y', group: 'rates', source: 'fred', ref: 'DGS2', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: '对美联储路径最敏感的期限，短端上行=钱变贵。', pitfall: '单日跳动常来自拍卖与期货交割，不等于政策转向。', externalUrl: fredUrl('DGS2') },
  { id: 'DGS5', label: '5 年期美债', short: '5Y', group: 'rates', source: 'fred', ref: 'DGS5', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: '曲线腹部，兼顾政策预期与期限溢价。', pitfall: '单看绝对水平会忽略通胀与实际利率的分解。', externalUrl: fredUrl('DGS5') },
  { id: 'DGS10', label: '10 年期美债', short: '10Y', group: 'rates', source: 'snapshot', ref: 'DGS10', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: '全球资产定价的基准利率，估值的分母。', pitfall: '上行可能来自增长改善，不能单独当看空理由。', externalUrl: fredUrl('DGS10') },
  { id: 'DGS30', label: '30 年期美债', short: '30Y', group: 'rates', source: 'fred', ref: 'DGS30', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: '长端看财政与期限溢价，失控时压制所有久期资产。', pitfall: '长端受供给与海外需求影响，和经济周期关系更弱。', externalUrl: fredUrl('DGS30') },
  { id: 'T10Y2Y', label: '10Y-2Y 利差', short: '2s10s', group: 'rates', source: 'snapshot', ref: 'T10Y2Y', region: 'US', unit: 'pt', digits: 2, polarity: 1, role: 'context', note: '倒挂是历史衰退前兆；倒挂后重新陡峭化常伴随压力显现。', pitfall: '时滞 6~18 个月、口径差异大，不能当倒计时。', externalUrl: fredUrl('T10Y2Y') },
  { id: 'T10Y3M', label: '10Y-3M 利差', short: '3m10y', group: 'rates', source: 'fred', ref: 'T10Y3M', region: 'US', unit: 'pt', digits: 2, polarity: 1, role: 'context', note: '比 2s10s 更贴近银行负债成本，倒挂信号更早。', pitfall: '短端由政策利率锚定，解读要和降息预期一起看。', externalUrl: fredUrl('T10Y3M') },
  { id: 'DFII10', label: '10 年期实际利率', short: '实际利率', group: 'rates', source: 'fred', ref: 'DFII10', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: 'TIPS 定价的真实资金成本，对成长股估值杀伤最直接。', pitfall: 'TIPS 流动性不如名义债，极端行情下会失真。', externalUrl: fredUrl('DFII10') },
  { id: 'T5YIE', label: '5 年通胀预期', short: '通胀预期', group: 'rates', source: 'fred', ref: 'T5YIE', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'liquidity', note: '市场对未来通胀的定价，抬升会限制降息空间。', pitfall: '它是市场定价而非真实通胀，会被流动性溢价污染。', externalUrl: fredUrl('T5YIE') },

  // ── 信用与风险 ───────────────────────────────────────────
  { id: 'HY_OAS', label: '高收益债信用利差', short: 'HY OAS', group: 'credit', source: 'snapshot', ref: 'BAMLH0A0HYM2', region: 'US', unit: '%', digits: 2, polarity: -1, role: 'risk', note: '企业借钱变难时先在这里反应，常被当作股市预警。', pitfall: '领先是经验而非承诺，发行结构会造成假信号。', externalUrl: fredUrl('BAMLH0A0HYM2') },
  { id: 'VIX', label: 'VIX 波动率指数', short: 'VIX', group: 'credit', source: 'snapshot', ref: 'VIXCLS', region: 'US', unit: 'index', digits: 2, polarity: -1, role: 'risk', note: '期权市场愿意为保护付多少钱，风险的实时价格。', pitfall: '低波动可以长期维持，不等于低风险。', externalUrl: fredUrl('VIXCLS') },
  { id: 'HYG_LQD', label: '高收益-投资级 20日超额', short: 'HYG-LQD', group: 'credit', source: 'derived', ref: 'HYG,LQD', region: 'US', unit: 'pt', digits: 2, polarity: 1, role: 'risk', note: '信用内部的风险偏好：高收益跑赢投资级，说明市场愿意下沉。', pitfall: 'ETF 价格含流动性溢价，和现金债利差不是同一口径。', externalUrl: etfUrl('HYG') },
  { id: 'SKEW', label: 'SKEW 尾部风险', short: 'SKEW', group: 'credit', source: 'yahoo', ref: '^SKEW', region: 'US', unit: 'index', digits: 1, polarity: -1, role: 'risk', note: '价外看跌期权的相对贵贱，衡量尾部保护需求。', pitfall: '读数常年偏高，边际变化比绝对值更有意义。' },

  // ── 美元与商品 ───────────────────────────────────────────
  { id: 'DXY', label: '美元指数', short: 'DXY', group: 'fxCommodity', source: 'yahoo', ref: 'DX-Y.NYB', region: 'GLOBAL', unit: 'index', digits: 2, polarity: -1, role: 'liquidity', note: '美元走强常对应全球美元流动性收紧。', pitfall: '美元也受避险与利差驱动，单看方向容易误读。' },
  { id: 'EURUSD', label: '欧元 / 美元', short: '欧元', group: 'fxCommodity', source: 'yahoo', ref: 'EURUSD=X', region: 'EU', unit: 'ratio', digits: 4, polarity: 1, role: 'liquidity', note: '美元指数的最大权重，反过来读美元强弱。', pitfall: '欧洲自身政策与能源冲击也会驱动，不纯是美元故事。' },
  { id: 'USDJPY', label: '美元 / 日元', short: '美日', group: 'fxCommodity', source: 'yahoo', ref: 'USDJPY=X', region: 'JP', unit: 'ratio', digits: 2, polarity: -1, role: 'liquidity', note: '日元是套息交易的资金来源，走弱常伴随风险偏好升温。', pitfall: '干预与避险会让它在风险事件中急转，方向不稳定。' },
  { id: 'USDCNH', label: '美元 / 离岸人民币', short: '美元CNH', group: 'fxCommodity', source: 'yahoo', ref: 'USDCNH=X', region: 'CN', unit: 'ratio', digits: 4, polarity: -1, role: 'liquidity', note: '新兴市场美元压力的直接读数，影响北向与港股。', pitfall: '中间价与政策意图会打断市场定价。' },
  { id: 'WTI', label: 'WTI 原油', short: 'WTI', group: 'fxCommodity', source: 'yahoo', ref: 'CL=F', region: 'GLOBAL', unit: 'usd', digits: 2, polarity: 0, role: 'context', note: '通胀与地缘的双向指标；上行既可能是需求好，也可能是供给冲击。', pitfall: '方向不明，不能简单当 risk-on 或 risk-off。' },
  { id: 'GOLD', label: 'COMEX 黄金', short: '黄金', group: 'fxCommodity', source: 'yahoo', ref: 'GC=F', region: 'GLOBAL', unit: 'usd', digits: 0, polarity: -1, role: 'risk', note: '实际利率与避险需求的合成读数，常与风险资产反向。', pitfall: '央行购金与去美元化会打破与实际利率的旧关系。' },
  { id: 'COPPER', label: 'COMEX 铜', short: '铜', group: 'fxCommodity', source: 'yahoo', ref: 'HG=F', region: 'GLOBAL', unit: 'usd', digits: 3, polarity: 1, role: 'risk', note: '工业需求与全球制造业景气的实物探针。', pitfall: '库存与矿端扰动会造成与需求无关的波动。' },
  { id: 'COPPER_GOLD', label: '铜金比', short: '铜金比', group: 'fxCommodity', source: 'derived', ref: 'HG=F,GC=F', region: 'GLOBAL', unit: 'ratio', digits: 4, polarity: 1, role: 'risk', note: '增长/避险的相对定价，历史上与 10Y 收益率同向。', pitfall: '两端各有独立驱动，比值会放大噪声。' },

  // ── 仓位与资金 ───────────────────────────────────────────
  { id: 'PC_TOTAL', label: '全市场 Put/Call', short: '总P/C', group: 'positioning', source: 'cboe', ref: 'TOTAL PUT/CALL RATIO', region: 'US', unit: 'ratio', digits: 3, polarity: 0, role: 'context', note: '官方口径的多空对冲需求；极高=避险拥挤，极低=自满。', pitfall: '只有当日值、无历史；不能当分位用。', externalUrl: CBOE_DAILY },
  { id: 'PC_EQUITY', label: '个股 Put/Call', short: '个股P/C', group: 'positioning', source: 'cboe', ref: 'EQUITY PUT/CALL RATIO', region: 'US', unit: 'ratio', digits: 3, polarity: 0, role: 'context', note: '个股层面的避险情绪，比指数 P/C 更贴近散户行为。', pitfall: '常态区间随市场结构漂移，别用固定阈值。', externalUrl: CBOE_DAILY },
  { id: 'PC_ETP', label: 'ETF Put/Call', short: 'ETP P/C', group: 'positioning', source: 'cboe', ref: 'EXCHANGE TRADED PRODUCTS PUT/CALL RATIO', region: 'US', unit: 'ratio', digits: 3, polarity: 0, role: 'context', note: 'ETF 对冲需求，常与散户和量化策略相关。', pitfall: '同一 ETF 既可能被对冲也可能被做市，方向不纯。', externalUrl: CBOE_DAILY },
  { id: 'VIX_TERM', label: 'VIX / VIX3M 期限比', short: '期限比', group: 'positioning', source: 'derived', ref: '^VIX3M', region: 'US', unit: 'ratio', digits: 3, polarity: -1, role: 'risk', note: '近月高于远月（>1）说明市场在为眼前风险定价。', pitfall: '换月与期权到期会造成短暂失真。' },
  { id: 'SPY_ACT', label: 'SPY 成交活跃度', short: 'SPY量比', group: 'positioning', source: 'derived', ref: 'SPY', region: 'US', unit: 'ratio', digits: 2, polarity: 0, role: 'context', note: '当日成交量 / 前 20 日均量，只表示关注度，不是资金净流入。', pitfall: '放量既可能是买入也可能是卖出，不能当方向。', externalUrl: etfUrl('SPY') },
  { id: 'QQQ_ACT', label: 'QQQ 成交活跃度', short: 'QQQ量比', group: 'positioning', source: 'derived', ref: 'QQQ', region: 'US', unit: 'ratio', digits: 2, polarity: 0, role: 'context', note: '科技板块的关注度，配合价格方向才有意义。', pitfall: '指数再平衡与期权到期会放大成交量。', externalUrl: etfUrl('QQQ') },
  { id: 'FG', label: '恐惧贪婪指数', short: '情绪FG', group: 'positioning', source: 'snapshot', ref: 'FG', region: 'US', unit: 'index', digits: 0, polarity: 0, role: 'context', note: '多因子情绪合成值；极端读数提示人群已站到一边。', pitfall: '极端可以更极端，不能据此抄底摸顶。' },

  // ── 加密温度计 ───────────────────────────────────────────
  { id: 'BTC', label: '比特币', short: 'BTC', group: 'crypto', source: 'yahoo', ref: 'BTC-USD', region: 'GLOBAL', unit: 'usd', digits: 0, polarity: 1, role: 'risk', note: '7×24 交易，常在全球流动性转向时先动。', pitfall: '加密自身叙事与监管冲击很大，不能单独代表风险偏好。' },
  { id: 'ETH', label: '以太坊', short: 'ETH', group: 'crypto', source: 'yahoo', ref: 'ETH-USD', region: 'GLOBAL', unit: 'usd', digits: 0, polarity: 1, role: 'risk', note: '风险曲线更远端，弹性大、噪声也大。', pitfall: '与 BTC 高度相关，容易重复计数。' },
];

/** 需要额外计算、没有直接上游序列的格子。 */
export const DERIVED_IDS = new Set(['HYG_LQD', 'COPPER_GOLD', 'VIX_TERM', 'SPY_ACT', 'QQQ_ACT']);

export const TERRAIN_BY_ID: Record<string, CrossAssetDef> = Object.fromEntries(
  CROSS_ASSET_DEFS.map((def) => [def.id, def]),
);

export function groupOfAsset(def: CrossAssetDef): AssetGroupId {
  return def.group;
}

export function isRiskCell(def: CrossAssetDef): boolean {
  return def.role === 'risk';
}

export function isLiquidityCell(def: CrossAssetDef): boolean {
  return def.role === 'liquidity';
}
