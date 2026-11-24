import type { RiskIndicator, CreditRateIndicator, VolatilitySnapshot, BullBearForces, InstitutionView, NewsItem } from '../types/macro';
import type { Strategy, Candidate, ExecutionRule } from '../types/strategy';
import type { SectorFlowData, CumulativeFlowPoint, OrderTick, DepthData } from '../types/fundflow';
import type { FearGreedIndex, NAAIMData, McClellanData, DarkPoolData, GEXData, AlgoSentimentRow, SentimentSnapshot } from '../types/sentiment';

function rng(base: number, spread: number) {
  return +(base + (Math.random() - 0.5) * spread).toFixed(2);
}

// ===== 宏观水温 =====

export const mockRiskIndicators: RiskIndicator[] = [
  { id: '1', icon: '📊', label: 'SPX', value: rng(5800, 60), level: 'normal', reading: '标普500指数处于高位震荡区间，短期支撑5750', history: Array.from({ length: 20 }, (_, i) => rng(5750 + i * 3, 40)) },
  { id: '2', icon: '⚡', label: 'VIX', value: rng(15.5, 3), level: 'normal', reading: '波动率处于低位，市场情绪稳定', history: Array.from({ length: 20 }, () => rng(15, 4)) },
  { id: '3', icon: '💵', label: 'DXY', value: rng(104, 1.5), level: 'warning', reading: '美元指数偏强，对新兴市场构成压力', history: Array.from({ length: 20 }, () => rng(104, 2)) },
  { id: '4', icon: '📈', label: 'US10Y', value: rng(4.3, 0.2), level: 'warning', reading: '10Y收益率维持在4.3%附近，估值承压', history: Array.from({ length: 20 }, () => rng(4.3, 0.4)) },
  { id: '5', icon: '📉', label: 'IG Spread', value: rng(95, 10), level: 'normal', reading: '投资级信用利差在正常范围', history: Array.from({ length: 20 }, () => rng(95, 15)) },
  { id: '6', icon: '💎', label: 'HY Spread', value: rng(370, 30), level: 'normal', reading: '高收益债利差轻微收窄', history: Array.from({ length: 20 }, () => rng(370, 40)) },
  { id: '7', icon: '🏦', label: 'Fed Funds', value: '5.25-5.50', level: 'neutral', reading: '市场定价9月首次降息概率68%', history: Array.from({ length: 20 }, () => rng(5.3, 0.2)) },
  { id: '8', icon: '🌐', label: 'EM Flow', value: rng(-2.5, 2), level: 'warning', reading: '新兴市场连续2周净流出', history: Array.from({ length: 20 }, () => rng(-2, 4)) },
  { id: '9', icon: '🛢️', label: 'WTI', value: rng(82, 5), level: 'normal', reading: '油价在80-85区间震荡，地缘溢价有限', history: Array.from({ length: 20 }, () => rng(82, 8)) },
  { id: '10', icon: '🏠', label: 'Housing', value: rng(-1.2, 1), level: 'normal', reading: '住房市场数据疲软但未恶化', history: Array.from({ length: 20 }, () => rng(-1, 2)) },
  { id: '11', icon: '💼', label: 'Claims', value: rng(215, 15), level: 'normal', reading: '初请失业金人数稳定在22万附近', history: Array.from({ length: 20 }, () => rng(215, 20)) },
  { id: '12', icon: '🏭', label: 'ISM Mfg', value: rng(48.5, 2), level: 'warning', reading: '制造业PMI连续收缩，但服务业扩张', history: Array.from({ length: 20 }, () => rng(48, 3)) },
  { id: '13', icon: '💰', label: 'CPI YoY', value: rng(3.2, 0.2), level: 'normal', reading: '通胀稳步回落，但核心服务仍具粘性', history: Array.from({ length: 20 }, () => rng(3.3, 0.4)) },
  { id: '14', icon: '📦', label: 'PPI', value: rng(2.2, 0.3), level: 'normal', reading: 'PPI温和，上游压力可控', history: Array.from({ length: 20 }, () => rng(2.2, 0.5)) },
  { id: '15', icon: '🗣️', label: 'FOMC Tone', value: 'Neutral', level: 'neutral', reading: '鲍威尔最新讲话偏中性，数据依赖', history: [] },
  { id: '16', icon: '⚔️', label: 'Geo Risk', value: rng(32, 8), level: 'warning', reading: '地缘风险指数略高，关注中东局势', history: Array.from({ length: 20 }, () => rng(30, 15)) },
].map((item) => ({
  ...item,
  source: 'demo' as const,
  history: [] as number[],
  level: item.level as RiskIndicator['level'],
}));

export const mockCreditRates: CreditRateIndicator[] = [
  { name: 'IG OAS', current: rng(92, 8), direction: 'up', unit: 'bp', reading: '投资级利差小幅走阔' },
  { name: 'HY OAS', current: rng(365, 25), direction: 'flat', unit: 'bp', reading: '高收益利差基本持平' },
  { name: '2Y UST', current: rng(4.72, 0.1), direction: 'down', unit: '%', reading: '短端利率预期下降' },
  { name: '10Y UST', current: rng(4.32, 0.08), direction: 'down', unit: '%', reading: '长端利率小幅回落' },
  { name: '2s10s', current: rng(-40, 5), direction: 'up', unit: 'bp', reading: '曲线倒挂收窄' },
  { name: 'TIPS 5Y', current: rng(2.15, 0.1), unit: '%', direction: 'flat', reading: '实际利率稳定' },
  { name: 'MOVE', current: rng(98, 8), direction: 'down', unit: '', reading: '利率波动下降' },
  { name: 'SOFR', current: rng(5.33, 0.02), direction: 'flat', unit: '%', reading: '隔夜利率稳定' },
  { name: 'Fed RRP', current: rng(3200, 200), direction: 'down', unit: '亿$', reading: '逆回购继续减少' },
];

export const mockVolatility: VolatilitySnapshot = {
  current: { timestamp: new Date().toISOString(), vix: null, vvix: null, skew: null, move: null },
  vixSparkline: [],
  vvixSparkline: [],
  skewSparkline: [],
  moveSparkline: [],
  interpretation: '波动率数据不可用，不展示模拟值。',
};

export const mockBullBearForces: BullBearForces = {
  dimensions: [
    { name: '机构持仓', bullPct: 62, bearPct: 38, meta: 'CFTC净多头增加；对冲基金beta升至1.08' },
    { name: '期权市场', bullPct: 55, bearPct: 45, meta: 'Put/Call 0.85；SKEW -5.4；Gamma中性' },
    { name: '资金流向', bullPct: 48, bearPct: 52, meta: '美股ETF本周净流出$2.3B；EM连续流出' },
    { name: 'CFTC投机', bullPct: 58, bearPct: 42, meta: '投机性净多仓+12K；资产管理净空-3K' },
    { name: '融券数据', bullPct: 51, bearPct: 49, meta: 'SPY做空比例2.1%；QQQ 3.5%；变化不大' },
  ],
  conclusion: {
    bulls: ['机构持仓偏多，CFTC净多头增加', '波动率低位，期权市场无明显恐慌'],
    bears: ['ETF资金连续流出', '新兴市场承压，资金回流美元'],
    verdict: '多空拉锯，短线偏向震荡。关注本周CPI数据和FOMC会议纪要。',
  },
};

export const mockInstitutionViews: InstitutionView[] = [
  { id: '1', institution: 'Goldman Sachs', logo: 'GS', date: '2026-08-07', target: 'SPX 6000', rating: 'Overweight', thesis: 'AI生产力提升将推动盈利增长超预期，预计2026年SPX EPS $275', color: '#4078ff' },
  { id: '2', institution: 'Morgan Stanley', logo: 'MS', date: '2026-08-06', target: 'SPX 5500', rating: 'Neutral', thesis: '估值偏高，需要盈利兑现来支撑当前价位，建议等待回调', color: '#0ca678' },
  { id: '3', institution: 'J.P. Morgan', logo: 'JPM', date: '2026-08-05', target: 'SPX 6200', rating: 'Overweight', thesis: '软着陆叙事完整，消费者韧性超预期，上调年末目标', color: '#f59e4b' },
  { id: '4', institution: 'BlackRock', logo: 'BLK', date: '2026-08-04', target: 'SPX 5900', rating: 'Overweight', thesis: '超配美股和AI主题，建议利用波动加仓优质成长股', color: '#9b6efb' },
  { id: '5', institution: 'Bank of America', logo: 'BofA', date: '2026-08-04', target: 'SPX 5400', rating: 'Underweight', thesis: '市场情绪过热，Fear&Greed进入Greed区间，建议减仓', color: '#f04452' },
  { id: '6', institution: 'Bridgewater', logo: 'BW', date: '2026-08-03', target: 'N/A', rating: 'Cautious', thesis: '地缘风险溢价低估，建议增加黄金和TIPS配置对冲尾部风险', color: '#20c4d8' },
];

export const mockNewsFeed: NewsItem[] = [
  { id: '1', time: '14:32', tag: 'macro', content: '美国7月CPI同比+3.2%，符合预期，核心CPI +3.8%略低于前值', impact: '宏观·通胀' },
  { id: '2', time: '13:15', tag: 'earn', content: 'NVDA Q2财报超预期，数据中心营收+42% YoY，盘后涨+5.2%', impact: 'AI链·半导体' },
  { id: '3', time: '11:48', tag: 'policy', content: '美联储Waller：倾向于9月启动降息，但需要更多数据确认', impact: '宏观·利率' },
  { id: '4', time: '10:20', tag: 'geo', content: '中东局势升温，布伦特原油突破$85，避险情绪上升', impact: '能源·通胀' },
  { id: '5', time: '09:45', tag: 'macro', content: '中国7月PPI -0.8% YoY，通缩压力持续；A股低开0.5%', impact: 'A股·工业' },
  { id: '6', time: '08:30', tag: 'earn', content: 'AAPL Q3营收+8% YoY，服务收入创纪录+14%，但大中华区-6.5%', impact: '消费电子' },
  { id: '7', time: '07:00', tag: 'policy', content: 'ECB会议纪要显示多数委员支持9月维持利率不变', impact: '欧股·利率' },
  { id: '8', time: '06:15', tag: 'macro', content: '日本Q2 GDP +2.1% QoQ超预期，日元走强至145关口', impact: '亚太·汇率' },
];

// ===== 做T策略 =====

export const mockStrategies: Strategy[] = [
  {
    id: 's1', name: '趋势回踩T', priority: 87, markets: ['A股', '美股'],
    tags: [{ label: '高匹配', type: 'ok' }, { label: 'A股适用', type: 'info' }, { label: '成交活跃', type: 'ok' }],
    thesis: '上升趋势中回调至均线支撑位，成交量萎缩后放量确认反弹',
    detail: { entry: '价格回踩20EMA且成交量缩至5日均量70%以下，放量上穿5EMA时入场', exit: '目标止盈1.5-2%，止损0.8%', hitRate: 72, riskLevel: '中低' },
  },
  {
    id: 's2', name: '事件驱动T', priority: 65, markets: ['A股'],
    tags: [{ label: '事件驱动', type: 'info' }, { label: '财报季', type: 'warn' }],
    thesis: '财报/政策事件前后的波动率扩张期，利用期权/正股联动套利',
    detail: { entry: '事件日前2日IV上升30%以上时建仓，Delta中性', exit: '事件日后1日IV回落后平仓', hitRate: 58, riskLevel: '中' },
  },
  {
    id: 's3', name: '供需共振T', priority: 52, markets: ['A股', '美股', '期货'],
    tags: [{ label: '中等匹配', type: 'info' }],
    thesis: '北向资金/主力资金与价格走势背离，捕捉纠偏机会',
    detail: { entry: '价格下跌但北向净买入>2亿，且偏离5日均线>1.5%', exit: '回归5日均线或北向转向', hitRate: 63, riskLevel: '中高' },
  },
];

export const mockCandidatesA: Candidate[] = [
  { id: 'c1', rank: 1, market: 'A股', symbol: '300750', name: '宁德时代', change: 2.35, strategyId: 's1', thesis: '放量突破20EMA，北向连续3日净买入', score: 92, sparkline: [195, 197, 199, 203, 206] },
  { id: 'c2', rank: 2, market: 'A股', symbol: '600519', name: '贵州茅台', change: 1.82, strategyId: 's1', thesis: '回踩60日线确认支撑，成交量萎缩到位', score: 88, sparkline: [1620, 1635, 1628, 1642, 1650] },
  { id: 'c3', rank: 3, market: 'A股', symbol: '002594', name: '比亚迪', change: -0.65, strategyId: 's3', thesis: '股价回调中北向逆势加仓，背离信号明显', score: 78, sparkline: [252, 250, 248, 249, 249] },
  { id: 'c4', rank: 4, market: 'A股', symbol: '300308', name: '中际旭创', change: 3.12, strategyId: 's2', thesis: '光模块板块事件催化，波动率扩张', score: 75, sparkline: [148, 150, 152, 155, 157] },
  { id: 'c5', rank: 5, market: 'A股', symbol: '300124', name: '汇川技术', change: 1.05, strategyId: 's1', thesis: '工控自动化复苏预期，技术面多头排列', score: 70, sparkline: [68, 69, 68.5, 69.2, 70] },
];

export const mockCandidatesB: Candidate[] = [
  { id: 'c6', rank: 1, market: '美股', symbol: 'NVDA', name: 'NVIDIA', change: 3.8, strategyId: 's1', thesis: '财报超预期后回踩5日线，动能极强', score: 95, sparkline: [980, 995, 1010, 1025, 1040] },
  { id: 'c7', rank: 2, market: '美股', symbol: 'TSLA', name: 'Tesla', change: -1.2, strategyId: 's3', thesis: '交付数据后过度回调，资金面显示机构低吸', score: 72, sparkline: [245, 242, 238, 240, 241] },
  { id: 'c8', rank: 3, market: '美股', symbol: 'AAPL', name: 'Apple', change: 0.8, strategyId: 's1', thesis: '在220附近横盘整理，蓄力待突破', score: 68, sparkline: [218, 219, 220, 221, 221] },
];

export const mockExecutionRules: ExecutionRule[] = [
  { id: 'e1', category: 'entry', rules: '1. 确认趋势方向（日线级别EMA排列）\n2. 等待价格回踩关键均线（20EMA / 60EMA）\n3. 成交量萎缩至5日均量的70%以下\n4. 放量上穿5EMA时入场\n5. 单笔仓位不超过总资金2%' },
  { id: 'e2', category: 'risk', rules: '1. 止损设于入场价下方-0.8%\n2. 日内最大回撤超过1.5%强制停止交易\n3. 单日亏损超2%次日仓位减半\n4. 连续3笔亏损暂停1天' },
  { id: 'e3', category: 'position', rules: '1. 底仓5成，做T仓位1-3成\n2. 趋势强时T仓可放大至5成\n3. 震荡市T仓控制在2成内\n4. 下午2点半后不再开新仓' },
  { id: 'e4', category: 'review', rules: '1. 每日收盘后复盘所有交易\n2. 统计胜率/盈亏比/最大回撤\n3. 每周总结策略匹配度变化\n4. 月度评估是否需要调整策略权重' },
];

// ===== 资金流 =====

export const mockSectorFlowData: SectorFlowData = {
  sectors: [
    { id: 'sec1', name: '半导体', netFlow: 45.2 },
    { id: 'sec2', name: '新能源', netFlow: 28.7 },
    { id: 'sec3', name: '医药', netFlow: -12.5 },
    { id: 'sec4', name: '消费', netFlow: -8.3 },
    { id: 'sec5', name: '金融', netFlow: 18.6 },
    { id: 'sec6', name: '地产', netFlow: -22.1 },
    { id: 'sec7', name: '军工', netFlow: 5.4 },
    { id: 'sec8', name: 'AI算力', netFlow: 62.8 },
  ],
  flows: [
    { from: { id: 'sec4', name: '消费', netFlow: -8.3 }, to: { id: 'sec1', name: '半导体', netFlow: 45.2 }, amount: 18.5 },
    { from: { id: 'sec6', name: '地产', netFlow: -22.1 }, to: { id: 'sec8', name: 'AI算力', netFlow: 62.8 }, amount: 22.1 },
    { from: { id: 'sec3', name: '医药', netFlow: -12.5 }, to: { id: 'sec2', name: '新能源', netFlow: 28.7 }, amount: 10.2 },
    { from: { id: 'sec4', name: '消费', netFlow: -8.3 }, to: { id: 'sec5', name: '金融', netFlow: 18.6 }, amount: 5.8 },
    { from: { id: 'sec3', name: '医药', netFlow: -12.5 }, to: { id: 'sec7', name: '军工', netFlow: 5.4 }, amount: 3.2 },
  ],
  flowMatrix: [
    [0, 3.2, 0.5, 0, 1.8, 0, 0.8, 5.5],
    [0, 0, 0, 0, 2.1, 0, 1.5, 8.2],
    [1.2, 2.5, 0, 0.3, 0, 0, 0, 1.5],
    [18.5, 0, 0, 0, 5.8, 0, 0, 0],
    [0, 2.1, 0, 0, 0, 1.2, 0, 4.5],
    [0, 5.2, 0, 0, 0, 0, 0, 0],
    [0, 0, 3.2, 0, 0, 0, 0, 1.8],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
};

export const mockCumulativeFlow: CumulativeFlowPoint[] = Array.from({ length: 30 }, (_, i) => ({
  time: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
  mainForce: rng(20, 10) + i * 1.2,
  northBound: rng(8, 6) + i * 0.6,
  retail: rng(-5, 8) - i * 0.3,
}));

export function mockOrderTicks(): OrderTick[] {
  return Array.from({ length: 20 }, (_, i) => ({
    time: `14:${String(30 + i).padStart(2, '0')}:${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    direction: Math.random() > 0.45 ? 'buy' as const : 'sell' as const,
    price: rng(3.86, 0.05),
    volume: Math.floor(rng(800, 3000)),
    type: ['超大单', '大单', '大单', '中单', '中单', '小单'][Math.floor(Math.random() * 6)] as OrderTick['type'],
    intensityPct: Math.floor(rng(45, 30)),
  }));
}

export function mockDepthData(): DepthData {
  const basePrice = 3.86;
  const bids = Array.from({ length: 5 }, (_, i) => {
    const price = +(basePrice - (i + 1) * 0.001).toFixed(3);
    const volume = Math.floor(rng(3000, 2000));
    return { price, volume, cumulative: 0 };
  });
  const asks = Array.from({ length: 5 }, (_, i) => {
    const price = +(basePrice + (i + 1) * 0.001).toFixed(3);
    const volume = Math.floor(rng(2500, 2000));
    return { price, volume, cumulative: 0 };
  });
  let cum = 0;
  bids.forEach((b) => { cum += b.volume; b.cumulative = cum; });
  cum = 0;
  asks.forEach((a) => { cum += a.volume; a.cumulative = cum; });
  const bidTotal = bids.reduce((s, b) => s + b.volume, 0);
  const askTotal = asks.reduce((s, a) => s + a.volume, 0);
  return { bids, asks, bidTotal, askTotal, imbalance: +((bidTotal - askTotal) / (bidTotal + askTotal)).toFixed(4) };
}

// ===== 情绪引擎 =====

export const mockFearGreed: FearGreedIndex = {
  composite: 62,
  state: 'Greed',
  factors: [
    { name: 'Stock Price Breadth', value: 68, signal: 'Greed' },
    { name: 'Market Momentum', value: 72, signal: 'Greed' },
    { name: 'Put/Call Ratio', value: 45, signal: 'Neutral' },
    { name: 'Junk Bond Demand', value: 58, signal: 'Greed' },
    { name: 'Market Volatility', value: 35, signal: 'Fear' },
    { name: 'Safe Haven Demand', value: 42, signal: 'Neutral' },
    { name: 'Stock Price Strength', value: 70, signal: 'Greed' },
  ],
};

export const mockNAAIM: NAAIMData = {
  current: 88.5,
  week4MA: 85.2,
  week13MA: 78.6,
  historicalMedian: 72.0,
  interpretation: 'NAAIM暴露度处于高位（88.5），显示主动管理人对市场乐观情绪浓厚，接近极端水平。',
};

export const mockMcClellan: McClellanData = {
  oscillator: 24.5,
  summation: 450,
  advances: 1820,
  declines: 1350,
  sparkline: {
    oscillator: Array.from({ length: 30 }, () => rng(20, 40)),
    summation: Array.from({ length: 30 }, (_, i) => 300 + i * 5 + rng(0, 20)),
  },
};

export const mockDarkPool: DarkPoolData = {
  dpi: 38.5,
  buyRatio: 58,
  sellRatio: 42,
  netBuy: 1.85,
  sparkline: {
    buys: Array.from({ length: 20 }, () => rng(55, 10)),
    sells: Array.from({ length: 20 }, () => rng(45, 10)),
  },
};

export const mockGEX: GEXData = {
  netGEX: 6.8,
  zeroGamma: 5820,
  callWall: 6000,
  putWall: 5650,
  distribution: Array.from({ length: 12 }, (_, i) => ({
    strike: 5500 + i * 80,
    gamma: rng(0.5, 2.5) * (i > 5 ? 1.5 : 1),
  })),
};

export const mockAlgoSentiment: AlgoSentimentRow[] = [
  { name: 'Fear & Greed', value: 62, signal: 'Greed', signalColor: '#f59e4b', methodology: 'CNN 7因子加权综合' },
  { name: 'NAAIM', value: 88.5, signal: 'High', signalColor: '#f59e4b', methodology: '主动管理人周度暴露调查' },
  { name: 'McClellan Osc', value: 24.5, signal: 'Bullish', signalColor: '#f04452', methodology: 'A-D差值EMA计算' },
  { name: 'Put/Call', value: 0.74, signal: 'Neutral', signalColor: '#636878', methodology: '全市场P/C加权' },
  { name: 'Dark Pool', value: 38.5, signal: 'Buy', signalColor: '#f04452', methodology: '暗池成交占比与净买卖比' },
  { name: 'Gamma Exposure', value: 6.8, signal: 'Long', signalColor: '#f04452', methodology: '期权做市商Gamma敞口' },
  { name: 'Smart Money', value: 1.25, signal: 'Buy', signalColor: '#f04452', methodology: '聪明钱指数（开盘/收盘强度）' },
  { name: 'HY Spread', value: 365, signal: 'Normal', signalColor: '#636878', methodology: '高收益债OAS利差' },
  { name: 'AAII Bull/Bear', value: 1.42, signal: 'Bullish', signalColor: '#f04452', methodology: '散户情绪调查多空比' },
  { name: 'VIX Term', value: 0.92, signal: 'Contango', signalColor: '#0ca678', methodology: 'VIX期货期限结构' },
  { name: 'McClellan Sum', value: 450, signal: 'Bull Trend', signalColor: '#f04452', methodology: 'A-D累计净差值' },
  { name: 'OEX Put/Call', value: 1.15, signal: 'Bearish', signalColor: '#0ca678', methodology: 'OEX指数期权P/C比率' },
];

// ===== 情绪兜底快照（US / CN）=====

export const mockSentimentUS: SentimentSnapshot = {
  value: 62,
  classification: 'Greed',
  timestamp: new Date().toISOString(),
  trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    value: Math.max(20, Math.min(85, 55 + Math.round((i - 15) * 0.6 + (Math.random() - 0.5) * 10))),
  })),
  subIndices: [
    { key: 'momentum', name: '市场动量', value: 72, description: 'SPX vs 125日均线', reading: '贪婪' },
    { key: 'strength', name: '股价强度', value: 68, description: '52周新高 vs 新低', reading: '贪婪' },
    { key: 'breadth', name: '市场宽度', value: 55, description: '涨跌成交量比', reading: '中性' },
    { key: 'putcall', name: 'Put/Call', value: 45, description: '看跌/看涨比', reading: '中性' },
    { key: 'junk', name: '垃圾债需求', value: 58, description: 'HY vs IG利差', reading: '贪婪' },
    { key: 'vol', name: 'VIX波动率', value: 35, description: 'VIX水平', reading: '恐惧' },
    { key: 'safe', name: '避险需求', value: 42, description: '股票vs国债表现', reading: '中性' },
  ],
  vix: 15.3,
  putCallRatio: '0.74',
  reading: '当前 62，Greed。市场偏乐观但尚未过热。可维持仓位，关注是否进入极端区域。',
};

export const mockSentimentCN: SentimentSnapshot = {
  value: 52,
  classification: 'Neutral',
  timestamp: new Date().toISOString(),
  trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    value: Math.max(20, Math.min(80, 48 + Math.round((i - 15) * 0.5 + (Math.random() - 0.5) * 8))),
  })),
  subIndices: [
    { key: 'margin', name: '融资余额', value: 55, description: '两市融资余额', reading: '杠杆活跃' },
    { key: 'volume', name: '成交量', value: 52, description: '日均成交额', reading: '中性' },
    { key: 'breadth', name: '涨跌比', value: 50, description: '上涨家数占比', reading: '分化' },
    { key: 'north', name: '北向资金', value: 48, description: '北向净流入', reading: '小幅流出' },
    { key: 'newacct', name: '新增开户', value: 45, description: '周度新增', reading: '中性' },
    { key: 'fund', name: '基金仓位', value: 55, description: '偏股基金仓位', reading: '中性偏高' },
    { key: 'ipo', name: 'IPO情绪', value: 48, description: '新股首日涨幅', reading: '中性' },
  ],
  vix: null,
  reading: 'A股情绪中性偏稳，成交温和，资金面分歧。建议观望或轻仓布局政策受益方向。',
};
