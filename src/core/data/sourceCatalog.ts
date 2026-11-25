/**
 * 外部数据源手册：交易员每天/每周/每月该看什么、在哪看、对应地图哪一环。
 *
 * 这份目录只描述「外部有什么」，不产生任何数值；档案页直接渲染。
 * status=integrated 表示应用已接入真实数据；external 表示需要离开应用核对。
 */

export type SourceCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'event';
export type SourceKind = 'macro' | 'micro' | 'positioning' | 'flow' | 'china' | 'crypto';
export type SourceChain = 'A' | 'B' | 'C' | 'D' | 'E';
export type SourceStatus = 'integrated' | 'external';
export type SourceAccess = 'direct' | 'proxy' | 'manual';

export interface SourceEntry {
  id: string;
  name: string;
  publisher: string;
  url: string;
  cadence: SourceCadence;
  kind: SourceKind;
  watch: string;
  chain: SourceChain;
  status: SourceStatus;
  access: SourceAccess;
}

export const CADENCE_LABEL: Record<SourceCadence, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季',
  event: '事件',
};

export const CHAIN_LABEL: Record<SourceChain, string> = {
  A: 'A 资金价格',
  B: 'B 风险定价',
  C: 'C 人群行为',
  D: 'D 结构轮动',
  E: 'E 我的位置',
};

export const ACCESS_LABEL: Record<SourceAccess, string> = {
  direct: '直连',
  proxy: '需代理/镜像',
  manual: '手动/需登录',
};

export const KIND_LABEL: Record<SourceKind, string> = {
  macro: '宏观',
  micro: '微观行情',
  positioning: '仓位与情绪',
  flow: '资金流',
  china: '中国',
  crypto: '加密',
};

export const SOURCE_ENTRIES: SourceEntry[] = [
  // ── 每日必看：钱的价格与风险的价格 ──────────────────────
  { id: 'fred', name: 'FRED 经济序列', publisher: '圣路易斯联储', url: 'https://fred.stlouisfed.org/', cadence: 'daily', kind: 'macro', watch: '2Y/10Y/30Y、实际利率 DFII10、通胀预期 T5YIE、HY OAS、金融条件 NFCI', chain: 'A', status: 'integrated', access: 'proxy' },
  { id: 'treasury', name: '美债收益率曲线', publisher: '美国财政部', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', cadence: 'daily', kind: 'macro', watch: '官方日度曲线与拍卖结果，核对 FRED 口径', chain: 'A', status: 'external', access: 'direct' },
  { id: 'fedwatch', name: 'FedWatch 降息概率', publisher: 'CME Group', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', cadence: 'daily', kind: 'macro', watch: '下一次会议的加息/降息概率，短端定价的锚', chain: 'A', status: 'external', access: 'direct' },
  { id: 'cboe', name: 'CBOE 每日市场统计', publisher: 'CBOE', url: 'https://www.cboe.com/markets/us/options/market-statistics/daily/', cadence: 'daily', kind: 'positioning', watch: '全市场/个股/ETF Put-Call、指数期权成交量与未平仓', chain: 'C', status: 'integrated', access: 'proxy' },
  { id: 'cme', name: '股指期货与基差', publisher: 'CME Group', url: 'https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html', cadence: 'daily', kind: 'micro', watch: 'ES/NQ/YM/RTY 盘前涨跌、成交量、期现基差与换月', chain: 'D', status: 'external', access: 'direct' },
  { id: 'yahoo', name: 'Yahoo Finance 行情', publisher: 'Yahoo', url: 'https://finance.yahoo.com/', cadence: 'daily', kind: 'micro', watch: '全球指数、ETF、汇率、商品、加密的日线与成交量', chain: 'D', status: 'integrated', access: 'proxy' },
  { id: 'stockcharts', name: '市场宽度与涨跌家数', publisher: 'StockCharts', url: 'https://stockcharts.com/', cadence: 'daily', kind: 'micro', watch: '$NYAD 腾落线、$NYHL 新高新低、等权 vs 市值权', chain: 'D', status: 'external', access: 'direct' },
  { id: 'finviz', name: '板块热力图', publisher: 'Finviz', url: 'https://finviz.com/map.ashx', cadence: 'daily', kind: 'micro', watch: '当日资金在哪些板块聚集，和 RS 排行互相验证', chain: 'D', status: 'external', access: 'direct' },
  { id: 'eastmoney', name: 'A 股板块资金流', publisher: '东方财富', url: 'https://data.eastmoney.com/bkzj/', cadence: 'daily', kind: 'china', watch: '主力净流入、超大单/大单、板块涨跌与成交额', chain: 'D', status: 'integrated', access: 'direct' },
  { id: 'hkconnect', name: '沪深港通与港股通', publisher: '港交所', url: 'https://www.hkex.com.hk/Mutual-Market/Stock-Connect', cadence: 'daily', kind: 'china', watch: '南向/北向成交与持股变化（注意披露口径已调整）', chain: 'D', status: 'external', access: 'direct' },
  { id: 'coinglass', name: '加密杠杆与资金费率', publisher: 'CoinGlass', url: 'https://www.coinglass.com/', cadence: 'daily', kind: 'crypto', watch: '未平仓、资金费率、爆仓分布，判断风险偏好是否过度', chain: 'C', status: 'external', access: 'direct' },

  // ── 每周：仓位、资金流、政策资产负债表 ──────────────────
  { id: 'cftc', name: 'CFTC 持仓报告 COT', publisher: '美国商品期货交易委员会', url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm', cadence: 'weekly', kind: 'positioning', watch: '非商业净持仓（投机盘）在 ES/NQ/10Y/美元/黄金上的多空变化', chain: 'C', status: 'external', access: 'manual' },
  { id: 'ici', name: '货币基金周度资产', publisher: 'ICI', url: 'https://www.ici.org/research/stats/mmf', cadence: 'weekly', kind: 'flow', watch: '货基规模变化，判断现金是在场外等待还是回流风险资产', chain: 'C', status: 'external', access: 'direct' },
  { id: 'h41', name: '美联储 H.4.1 资产负债表', publisher: '美联储', url: 'https://www.federalreserve.gov/releases/h41/', cadence: 'weekly', kind: 'macro', watch: '准备金、TGA、逆回购 RRP 的周度变化，美元流动性的源头', chain: 'A', status: 'external', access: 'direct' },
  { id: 'etfcom', name: 'ETF 资金流与份额', publisher: 'ETF.com', url: 'https://www.etf.com/', cadence: 'weekly', kind: 'flow', watch: 'SPY/QQQ/IWM、行业 ETF、HYG/LQD、GLD 的净流入与份额变化', chain: 'D', status: 'external', access: 'direct' },
  { id: 'etfdb', name: 'ETF 数据库与流向', publisher: 'ETFdb', url: 'https://etfdb.com/', cadence: 'weekly', kind: 'flow', watch: '按资产类别看周度净流入，识别是宽基还是行业在吸金', chain: 'D', status: 'external', access: 'direct' },
  { id: 'moomoo', name: 'moomoo 资金流', publisher: 'moomoo', url: 'https://www.moomoo.com/', cadence: 'weekly', kind: 'flow', watch: 'ETF 净流入、个股资金流、卖空比例（截图口径）', chain: 'D', status: 'external', access: 'manual' },
  { id: 'aaii', name: 'AAII 散户情绪', publisher: 'AAII', url: 'https://www.aaii.com/sentimentsurvey', cadence: 'weekly', kind: 'positioning', watch: '看多/看空比例，极端读数用于检查拥挤度', chain: 'C', status: 'external', access: 'direct' },
  { id: 'naaim', name: 'NAAIM 主动管理人仓位', publisher: 'NAAIM', url: 'https://www.naaim.org/programs/naaim-exposure-index/', cadence: 'weekly', kind: 'positioning', watch: '主动基金股票暴露中位数，衡量“聪明钱”仓位', chain: 'C', status: 'external', access: 'direct' },
  { id: 'epfr', name: 'EPFR 全球基金资金流', publisher: 'EPFR', url: 'https://www.epfr.com/', cadence: 'weekly', kind: 'flow', watch: '全球股票/债券/货币基金跨市场流向（付费）', chain: 'D', status: 'external', access: 'manual' },

  // ── 每月：增长、通胀、就业与杠杆 ────────────────────────
  { id: 'bls', name: 'CPI / 非农 / 失业率', publisher: '美国劳工统计局', url: 'https://www.bls.gov/', cadence: 'monthly', kind: 'macro', watch: 'CPI 同比与核心、非农新增、失业率、平均时薪', chain: 'A', status: 'external', access: 'direct' },
  { id: 'bea', name: 'GDP / PCE', publisher: '美国经济分析局', url: 'https://www.bea.gov/', cadence: 'monthly', kind: 'macro', watch: '核心 PCE 是美联储最看重的通胀口径', chain: 'A', status: 'external', access: 'direct' },
  { id: 'ism', name: 'ISM 制造业/服务业 PMI', publisher: 'ISM', url: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-report-on-business/', cadence: 'monthly', kind: 'macro', watch: '新订单与就业分项，领先于硬数据', chain: 'A', status: 'external', access: 'direct' },
  { id: 'finra', name: '保证金债务', publisher: 'FINRA', url: 'https://www.finra.org/investors/margin-statistics', cadence: 'monthly', kind: 'positioning', watch: '杠杆水平变化，衡量散户与机构的押注强度', chain: 'C', status: 'external', access: 'direct' },
  { id: 'iif', name: 'IIF 全球资本流动', publisher: 'IIF', url: 'https://www.iif.com/Products/Capital-Flows-Tracker', cadence: 'monthly', kind: 'flow', watch: '新兴市场股债资金流向，和美元周期一起看', chain: 'D', status: 'external', access: 'manual' },
  { id: 'pboc', name: '央行政策与社融', publisher: '中国人民银行', url: 'http://www.pbc.gov.cn/', cadence: 'monthly', kind: 'china', watch: 'MLF/LPR、社融与 M1-M2 剪刀差', chain: 'A', status: 'external', access: 'direct' },
  { id: 'nbs', name: '中国 CPI / PPI / PMI', publisher: '国家统计局', url: 'https://www.stats.gov.cn/', cadence: 'monthly', kind: 'china', watch: 'PPI 与 A 股上游盈利、PMI 与风格切换', chain: 'A', status: 'external', access: 'direct' },

  // ── 每季/事件：结构性证据与日历 ──────────────────────────
  { id: 'edgar', name: '13F 机构持仓', publisher: 'SEC EDGAR', url: 'https://www.sec.gov/edgar/search/', cadence: 'quarterly', kind: 'positioning', watch: '大机构季度调仓，滞后 45 天，只作结构参考', chain: 'C', status: 'external', access: 'direct' },
  { id: 'acm', name: 'ACM 期限溢价', publisher: '纽约联储', url: 'https://www.newyorkfed.org/research/data_indicators/term-premia-tabs', cadence: 'monthly', kind: 'macro', watch: '长端利率里有多少是期限溢价，多少是降息预期', chain: 'A', status: 'external', access: 'direct' },
  { id: 'fedcal', name: 'FOMC 会议日历', publisher: '美联储', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', cadence: 'event', kind: 'macro', watch: '决议、点阵图、SEP 与发布会时间，提前降低换手', chain: 'B', status: 'integrated', access: 'direct' },
  { id: 'opex', name: '期权到期与四巫日', publisher: 'CBOE', url: 'https://www.cboe.com/about/hours/us-options/', cadence: 'event', kind: 'micro', watch: '月度/季度到期周，波动与成交量容易被放大', chain: 'C', status: 'external', access: 'direct' },
];

export const CADENCE_HINT: Record<SourceCadence, { title: string; time: string; items: string }> = {
  daily: { title: '每日盘前', time: '10 分钟', items: '期指与美债、DXY、VIX、油价、隔夜新闻；先看方向再看幅度' },
  weekly: { title: '每周一次', time: '20 分钟', items: 'COT 持仓、ICI 货基、ETF 周度净流入、AAII/NAAIM 情绪' },
  monthly: { title: '每月一次', time: '30 分钟', items: 'CPI/非农/PCE/ISM、FINRA 保证金、IIF 与央行数据' },
  quarterly: { title: '每季一次', time: '1 小时', items: '13F、财报季、SEP 点阵图、ACM 期限溢价的结构变化' },
  event: { title: '事件驱动', time: '临时', items: 'FOMC、期权到期、财政部拍卖、重要财报；事件前后降低换手' },
};
