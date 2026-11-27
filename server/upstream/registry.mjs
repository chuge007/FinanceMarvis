/**
 * 上游源注册表 —— 全项目唯一真源。
 *
 * 为什么要有这个文件：
 *   改造前，上游前缀同时存在于 vite.config.ts、server/proxy.mjs、desktop/launcher.cjs
 *   三处，加一个数据源要改三遍，且三处口径会漂移。现在只有这一份：
 *     - dev        → vite.config.ts 读取并生成 server.proxy
 *     - 本地服务    → server/app.mjs 读取并转发生效
 *     - exe 单文件  → launcher.cjs 解压 server/ 后复用同一份
 *     - 前端源清单  → scripts/gen-source-registry.mjs 生成 registry.generated.ts
 *
 * 字段约定：
 *   id        稳定标识，前端与健康度、缓存 key 都按它走（不要随前缀改）
 *   prefix    前端同域路径前缀
 *   origin    上游根地址
 *   headers   转发时固定注入的请求头（Referer / UA 等反爬校验用）
 *   viaProxy  true = 必须经本机出海代理（地区封锁源）
 *   ttl       转发层缓存秒数；0 = 不缓存（实时性要求高或非 GET）
 *   auth      none = 免 key；key = 用户填 Key；client = 需本地客户端
 *   priority  P0 免 key 必须可用 / P1 免 key 尽力 / P2 有 Key / P3 有客户端
 *   devManual true = dev 由 vite 插件单独处理，不进 server.proxy 表
 *
 * 分类标签（2026-11-26）：见下方 DOMAIN_META。不要在每条记录里重复写，
 * 由 upstreamManifest() 统一 attach，保证「唯一真源」不漂移。
 *   domain  主维度：market/fundamental/macro/flow/sentiment/sector/event/alternative/tool
 *   role    角色：primary/backup/fallback/external-only/deprecated
 *   quality 可信度：official/aggregator/scraper/derived
 *   stability 稳定性分级：S1 官方一手 / S2 Key API / S3 免密稳定 / S4 爬虫 / S5 聚合 / S6 已失效
 *   methodQuality 侧车方法级覆盖，避免 sidecar-data 整体按爬虫源拉低 EDGAR / ccxt
 */

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const EM_QUOTE_HEADERS = {
  Referer: 'https://quote.eastmoney.com/',
  Origin: 'https://quote.eastmoney.com',
}

/**
 * @typedef {Object} Upstream
 * @property {string} id
 * @property {string} prefix
 * @property {string} origin
 * @property {Record<string,string>} [headers]
 * @property {boolean} [viaProxy]
 * @property {number} [ttl]
 * @property {string} label
 * @property {string[]} datasets
 * @property {'none'|'key'|'client'} auth
 * @property {'P0'|'P1'|'P2'|'P3'} priority
 * @property {string[]} markets
 * @property {boolean} [devManual]
 * @property {'cn'|'global'} [egress] 出口归类：cn 走国内直连，global 允许出海代理
 */

/** @type {Upstream[]} */
export const UPSTREAMS = [
  // ── 中国 A 股：行情 / 资金 / 板块 ───────────────────────────────
  {
    id: 'eastmoney-quote',
    prefix: '/eastmoney-quote',
    origin: 'https://push2.eastmoney.com',
    headers: EM_QUOTE_HEADERS,
    viaProxy: false,
    egress: 'cn',
    ttl: 15,
    label: '东财实时报价',
    datasets: ['a-share:quote', 'a-share:fundflow', 'a-share:sector-flow'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn'],
  },
  {
    id: 'eastmoney-kline',
    prefix: '/eastmoney-kline',
    origin: 'https://push2his.eastmoney.com',
    headers: EM_QUOTE_HEADERS,
    viaProxy: false,
    egress: 'cn',
    ttl: 60,
    label: '东财 K 线',
    datasets: ['a-share:kline', 'a-share:index-kline'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn'],
  },
  {
    id: 'eastmoney-news',
    prefix: '/eastmoney-news',
    origin: 'https://np-listapi.eastmoney.com',
    headers: { Referer: 'https://www.eastmoney.com/', Origin: 'https://www.eastmoney.com' },
    viaProxy: false,
    egress: 'cn',
    ttl: 30,
    label: '东财快讯',
    datasets: ['news:flash', 'news:cn'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn'],
  },
  {
    id: 'tencent',
    prefix: '/tencent-rank',
    origin: 'https://proxy.finance.qq.com',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://gu.qq.com/' },
    viaProxy: false,
    egress: 'cn',
    ttl: 60,
    label: '腾讯行情与板块榜',
    datasets: ['cn:sector-rank', 'cn:quote', 'hk:quote', 'us:quote'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn', 'hk', 'us'],
  },
  {
    id: 'tencent-quote',
    prefix: '/tencent-quote',
    origin: 'https://qt.gtimg.cn',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://gu.qq.com/' },
    viaProxy: false,
    egress: 'cn',
    ttl: 10,
    label: '腾讯实时快照',
    datasets: ['cn:quote', 'hk:quote', 'us:quote', 'fx:quote'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn', 'hk', 'us', 'global'],
  },
  {
    id: 'tencent-web',
    prefix: '/tencent-web',
    origin: 'https://web.ifzq.gtimg.cn',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://gu.qq.com/' },
    viaProxy: false,
    egress: 'cn',
    ttl: 30,
    label: '腾讯分时与 K 线',
    datasets: ['cn:kline', 'cn:minute'],
    auth: 'none',
    priority: 'P0',
    markets: ['cn'],
  },
  {
    id: 'sina-sector',
    prefix: '/sina-sector',
    origin: 'https://vip.stock.finance.sina.com.cn',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://finance.sina.com.cn/' },
    viaProxy: false,
    egress: 'cn',
    ttl: 60,
    label: '新浪板块（GBK 兜底）',
    datasets: ['cn:sector-rank'],
    auth: 'none',
    priority: 'P1',
    markets: ['cn'],
  },
  {
    id: 'sina-hq',
    prefix: '/sina-hq',
    origin: 'https://hq.sinajs.cn',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://finance.sina.com.cn/' },
    viaProxy: false,
    egress: 'cn',
    ttl: 5,
    label: '新浪实时行情',
    datasets: ['cn:quote-realtime'],
    auth: 'none',
    priority: 'P1',
    markets: ['cn'],
  },

  // ── 美国：行情 / 波动率 / 期权情绪 ─────────────────────────────
  {
    id: 'yahoo',
    prefix: '/yahoo',
    origin: 'https://query1.finance.yahoo.com',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' },
    viaProxy: true,
    egress: 'global',
    ttl: 30,
    label: 'Yahoo Finance',
    datasets: ['us:quote', 'us:kline', 'global:index', 'fx:kline', 'commodity:kline'],
    auth: 'none',
    priority: 'P0',
    markets: ['us', 'hk', 'global'],
  },
  {
    id: 'yahoo-alt',
    prefix: '/yahoo-alt',
    origin: 'https://query2.finance.yahoo.com',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://finance.yahoo.com/', Origin: 'https://finance.yahoo.com' },
    viaProxy: true,
    egress: 'global',
    ttl: 30,
    label: 'Yahoo 备用节点',
    datasets: ['us:quote', 'us:kline'],
    auth: 'none',
    priority: 'P1',
    markets: ['us'],
  },
  {
    id: 'cboe',
    prefix: '/cboe',
    origin: 'https://www.cboe.com',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.cboe.com/', Origin: 'https://www.cboe.com' },
    viaProxy: true,
    egress: 'global',
    ttl: 1800,
    label: 'CBOE 每日市场统计',
    datasets: ['us:options:pcr', 'us:options:volume', 'us:options:oi'],
    auth: 'none',
    priority: 'P0',
    markets: ['us'],
  },
  {
    id: 'alternative',
    prefix: '/alternative',
    origin: 'https://api.alternative.me',
    headers: { 'User-Agent': BROWSER_UA },
    viaProxy: true,
    egress: 'global',
    ttl: 300,
    label: '恐惧贪婪指数',
    datasets: ['sentiment:fear-greed'],
    auth: 'none',
    priority: 'P1',
    markets: ['global'],
  },

  // ── 宏观：利率 / 流动性 / 增长 ─────────────────────────────────
  {
    id: 'fred',
    prefix: '/fred',
    origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fred.stlouisfed.org/' },
    viaProxy: false,
    egress: 'global',
    ttl: 1800,
    label: 'FRED 经济序列',
    datasets: ['us:rates', 'us:inflation', 'us:employment', 'us:liquidity', 'us:credit-spread', 'commodity:spot'],
    auth: 'none',
    priority: 'P0',
    markets: ['us', 'global'],
  },
  {
    id: 'fred-proxy',
    prefix: '/fred-proxy',
    origin: 'https://fred.stlouisfed.org',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://fred.stlouisfed.org/' },
    viaProxy: true,
    egress: 'global',
    ttl: 1800,
    label: 'FRED 代理通道',
    datasets: ['us:rates', 'us:inflation'],
    auth: 'none',
    priority: 'P1',
    markets: ['us'],
  },
  {
    id: 'treasury',
    prefix: '/treasury',
    origin: 'https://home.treasury.gov',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://home.treasury.gov/' },
    viaProxy: false,
    egress: 'global',
    ttl: 3600,
    label: '美国财政部收益率曲线',
    datasets: ['us:yield-curve'],
    auth: 'none',
    priority: 'P0',
    markets: ['us'],
  },
  {
    id: 'nyfed',
    prefix: '/nyfed',
    origin: 'https://markets.newyorkfed.org',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: false,
    egress: 'global',
    ttl: 3600,
    label: '纽约联储回购与 SOFR',
    datasets: ['us:repo', 'us:sofr'],
    auth: 'none',
    priority: 'P1',
    markets: ['us'],
  },
  {
    id: 'fed',
    prefix: '/fed',
    origin: 'https://www.federalreserve.gov',
    headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.federalreserve.gov/' },
    viaProxy: false,
    egress: 'global',
    ttl: 21600,
    label: '美联储 FOMC 日历',
    datasets: ['event:fomc'],
    auth: 'none',
    priority: 'P0',
    markets: ['us'],
  },
  {
    id: 'bis',
    prefix: '/bis',
    origin: 'https://stats.bis.org',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: false,
    egress: 'global',
    ttl: 86400,
    label: 'BIS 全球政策利率',
    datasets: ['global:policy-rate'],
    auth: 'none',
    priority: 'P1',
    markets: ['global'],
  },
  {
    id: 'worldbank',
    prefix: '/worldbank',
    origin: 'https://api.worldbank.org',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: false,
    egress: 'global',
    ttl: 86400,
    label: '世界银行宏观序列',
    datasets: ['global:macro-annual'],
    auth: 'none',
    priority: 'P1',
    markets: ['global'],
  },
  {
    id: 'cftc',
    prefix: '/cftc',
    origin: 'https://www.cftc.gov',
    headers: { 'User-Agent': BROWSER_UA },
    viaProxy: false,
    egress: 'global',
    ttl: 21600,
    label: 'CFTC 持仓报告 COT',
    datasets: ['positioning:cot'],
    auth: 'none',
    priority: 'P1',
    markets: ['us', 'global'],
  },
  {
    id: 'mof-jgb',
    prefix: '/mof-jgb',
    origin: 'https://www.mof.go.jp',
    headers: { 'User-Agent': BROWSER_UA },
    viaProxy: false,
    egress: 'global',
    ttl: 21600,
    label: '日本财务省国债曲线',
    datasets: ['jp:yield-curve'],
    auth: 'none',
    priority: 'P1',
    markets: ['global'],
  },
  {
    id: 'pbc',
    prefix: '/pbc',
    origin: 'http://www.pbc.gov.cn',
    headers: { 'User-Agent': BROWSER_UA },
    viaProxy: false,
    egress: 'cn',
    ttl: 21600,
    label: '中国人民银行',
    datasets: ['cn:credit', 'cn:policy-rate'],
    auth: 'none',
    priority: 'P1',
    markets: ['cn'],
  },
  {
    id: 'stats-cn',
    prefix: '/stats-cn',
    origin: 'https://www.stats.gov.cn',
    headers: { 'User-Agent': BROWSER_UA },
    viaProxy: false,
    egress: 'cn',
    ttl: 21600,
    label: '国家统计局',
    datasets: ['cn:cpi', 'cn:ppi', 'cn:pmi'],
    auth: 'none',
    priority: 'P1',
    markets: ['cn'],
  },
  {
    id: 'convex',
    prefix: '/convex',
    origin: 'https://convextrade.com/api/public',
    headers: {},
    viaProxy: true,
    egress: 'global',
    ttl: 300,
    label: 'ConvexTrade 宏观镜像',
    datasets: ['us:macro-mirror', 'global:macro-mirror'],
    auth: 'none',
    priority: 'P0',
    markets: ['us', 'global'],
    devManual: true,
  },
  {
    id: 'twse',
    prefix: '/twse',
    origin: 'https://openapi.twse.com.tw',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: false,
    egress: 'global',
    ttl: 21600,
    label: '台湾证交所开放数据',
    datasets: ['tw:revenue'],
    auth: 'none',
    priority: 'P2',
    markets: ['global'],
  },

  // ── 本地 Python 数据侧车（缺库/缺 Python 时能力探测摘除，数据显「缺」）──
  {
    id: 'sidecar-data',
    prefix: '/sidecar-data',
    origin: 'http://127.0.0.1:8765',
    headers: { 'content-type': 'application/json' },
    viaProxy: false,
    egress: 'cn',
    ttl: 0,
    label: '本地数据侧车（AkShare / EDGAR / ccxt）',
    datasets: ['cn:lhb', 'cn:fund-nav', 'us:filings', 'crypto:quote'],
    auth: 'client',
    priority: 'P3',
    markets: ['cn', 'us', 'global'],
  },

  // ── 可选 Key 通道（未配置时自动摘除，不影响启动）─────────────────
  {
    id: 'tushare',
    prefix: '/tushare',
    origin: 'https://api.tushare.pro',
    headers: { 'Content-Type': 'application/json' },
    viaProxy: false,
    egress: 'cn',
    ttl: 60,
    label: 'Tushare Pro（Key）',
    datasets: ['cn:financials', 'cn:margin', 'cn:lhb', 'cn:consensus', 'cn:fund-nav'],
    auth: 'key',
    priority: 'P2',
    markets: ['cn'],
  },
  {
    id: 'fmp',
    prefix: '/fmp',
    origin: 'https://financialmodelingprep.com',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: true,
    egress: 'global',
    ttl: 3600,
    label: 'FMP 美股 EOD（Key）',
    datasets: ['us:index-kline', 'us:financials'],
    auth: 'key',
    priority: 'P2',
    markets: ['us'],
  },
  {
    id: 'databull',
    prefix: '/databull',
    origin: 'https://api.databull.cn',
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    viaProxy: false,
    egress: 'cn',
    ttl: 30,
    label: 'DataBull（Key）',
    datasets: ['cn:quote', 'cn:kline', 'cn:index', 'cn:news', 'cn:tick'],
    auth: 'key',
    priority: 'P2',
    markets: ['cn', 'hk', 'us'],
  },
]

/**
 * 分类标签唯一真源：按上游 id 映射主维度 / 角色 / 可信度。
 * 新增源时在这里补一行，前端清单与档案页会自动带上标签。
 * role=deprecated 的源仍保留条目以便旧前端兜底，但不再作为可选主源。
 */
const DOMAIN_META = {
  'eastmoney-quote': { domain: 'market', role: 'fallback', quality: 'scraper', stability: 'S4' },
  'eastmoney-kline': { domain: 'market', role: 'fallback', quality: 'scraper', stability: 'S4' },
  'eastmoney-news': { domain: 'event', role: 'fallback', quality: 'scraper', stability: 'S4' },
  tencent: { domain: 'sector', role: 'primary', quality: 'aggregator', stability: 'S5' },
  'tencent-quote': { domain: 'market', role: 'primary', quality: 'aggregator', stability: 'S5' },
  'tencent-web': { domain: 'market', role: 'primary', quality: 'aggregator', stability: 'S5' },
  'sina-sector': { domain: 'sector', role: 'fallback', quality: 'aggregator', stability: 'S4' },
  'sina-hq': { domain: 'market', role: 'fallback', quality: 'aggregator', stability: 'S4' },
  yahoo: { domain: 'market', role: 'primary', quality: 'scraper', stability: 'S4' },
  'yahoo-alt': { domain: 'market', role: 'backup', quality: 'scraper', stability: 'S4' },
  cboe: { domain: 'sentiment', role: 'primary', quality: 'official', stability: 'S1' },
  alternative: { domain: 'sentiment', role: 'primary', quality: 'aggregator', stability: 'S5' },
  fred: { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  'fred-proxy': { domain: 'macro', role: 'backup', quality: 'official', stability: 'S1' },
  treasury: { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  nyfed: { domain: 'macro', role: 'backup', quality: 'official', stability: 'S1' },
  fed: { domain: 'event', role: 'primary', quality: 'official', stability: 'S1' },
  bis: { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  worldbank: { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  cftc: { domain: 'flow', role: 'primary', quality: 'official', stability: 'S1' },
  'mof-jgb': { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  pbc: { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  'stats-cn': { domain: 'macro', role: 'primary', quality: 'official', stability: 'S1' },
  convex: { domain: 'macro', role: 'deprecated', quality: 'derived', stability: 'S6' },
  // 侧车整体按最差的爬虫源分级；方法级质量单列，避免把 EDGAR 官方一手拉低。
  'sidecar-data': {
    domain: 'alternative', role: 'backup', quality: 'scraper', stability: 'S4',
    methodQuality: {
      'edgar.*': { quality: 'official', stability: 'S1' },
      'ccxt.*': { quality: 'official', stability: 'S3' },
      'baostock.*': { quality: 'official', stability: 'S3' },
      'akshare.*': { quality: 'scraper', stability: 'S4' },
      'efinance.*': { quality: 'scraper', stability: 'S4' },
    },
  },
  fmp: { domain: 'market', role: 'backup', quality: 'official', stability: 'S2' },

  twse: { domain: 'fundamental', role: 'primary', quality: 'official', stability: 'S1' },
  tushare: { domain: 'fundamental', role: 'primary', quality: 'official', stability: 'S2' },
  databull: { domain: 'market', role: 'backup', quality: 'aggregator', stability: 'S2' },
}

export const DATA_DOMAINS = [
  { id: 'market', label: '行情与价格' },
  { id: 'fundamental', label: '基本面与财务' },
  { id: 'macro', label: '宏观与利率' },
  { id: 'flow', label: '资金与持仓' },
  { id: 'sentiment', label: '情绪与波动' },
  { id: 'sector', label: '板块与结构' },
  { id: 'event', label: '事件与日历' },
  { id: 'alternative', label: '另类与加密' },
  { id: 'tool', label: '研究工具' },
]

/** 按前缀匹配（最长前缀优先，避免 /yahoo 抢 /yahoo-alt）。 */
export function matchUpstream(pathname) {
  let best = null
  for (const u of UPSTREAMS) {
    if (pathname === u.prefix || pathname.startsWith(u.prefix + '/')) {
      if (!best || u.prefix.length > best.prefix.length) best = u
    }
  }
  return best
}

/** 前端与档案页展示用的精简清单（不含 headers / origin 细节）。 */
export function upstreamManifest() {
  return UPSTREAMS.map((u) => ({
    id: u.id,
    prefix: u.prefix,
    label: u.label,
    datasets: u.datasets,
    auth: u.auth,
    priority: u.priority,
    markets: u.markets,
    ttl: u.ttl ?? 0,
    viaProxy: !!u.viaProxy,
    ...(DOMAIN_META[u.id] ?? { domain: 'market', role: 'backup', quality: 'aggregator', stability: 'S4' }),
  }))
}
