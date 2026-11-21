/**
 * 做T策略 API - 基于真实参数计算
 */
import { fetchConvexLatest } from './api';
import { fetchMarketCapitalOverview, fetchSectorFlows } from './fundflow';
import type { TradingSignal, StrategyDecision, StrategyFactors, FactorScore } from '../types/strategy';
import type { Market } from '../stores/useAppStore';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

// ─── 候选池标的 → 所属产业（用于匹配板块资金流） ───
const SYMBOL_INDUSTRY: Record<string, string> = {
  // A股
  '600519': '白酒', '000858': '白酒', '000568': '白酒', '600809': '白酒',
  '300750': '电池', '300014': '电池',
  '002594': '汽车',
  '688981': '半导体', '688041': '半导体', '603501': '半导体',
  '603259': '医疗', '600276': '医疗', '300760': '医疗',
  '600036': '银行',
  '601318': '保险',
  '300059': '证券', '600030': '证券',
  '601012': '光伏', '300274': '光伏',
  '300124': '工业',
  '000333': '家电', '000651': '家电',
  '600887': '饮料',
  '601899': '有色',
  // 美股
  NVDA: 'Technology', AMD: 'Technology', AVGO: 'Technology', QCOM: 'Technology',
  MU: 'Technology', AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology',
  AMZN: 'Technology', META: 'Technology', CRM: 'Technology', TSLA: 'Consumer Disc.',
  LLY: 'Healthcare', JNJ: 'Healthcare', MRK: 'Healthcare',
  JPM: 'Financials', BAC: 'Financials', V: 'Financials', MA: 'Financials', 'BRK.B': 'Financials',
  NFLX: 'Communication', DIS: 'Communication',
};

// ─── 综合交易信号 ───
export async function fetchTradingSignal(): Promise<TradingSignal> {
  const [vix, crai, dgs10, t10y2y, hySpread] = await Promise.all([
    fetchConvexLatest('VIXCLS'),
    fetchConvexLatest('CONVEX_CRAI'),
    fetchConvexLatest('DGS10'),
    fetchConvexLatest('T10Y2Y'),
    fetchConvexLatest('BAMLH0A0HYM2'),
  ]);

  // ─── 各维度打分 ───
  // 1. 情绪评分 (0-100)
  const sentimentScore = crai !== null ? Math.max(0, Math.min(100, 50 + crai * 8)) : 50;

  // 2. 波动评分 (0-100, 低Vix=高分利于做多)
  const volScore = vix !== null ? Math.max(0, Math.min(100, 100 - (vix - 10) * 3)) : 60;

  // 3. 利率评分
  const rateScore = dgs10 !== null ? Math.max(0, Math.min(100, 100 - (dgs10 - 3) * 12)) : 55;

  // 4. 信用评分
  const creditScore = hySpread !== null ? Math.max(0, Math.min(100, 100 - hySpread * 12)) : 60;

  // 5. 宏观评分
  const macroScore = t10y2y !== null ? Math.max(0, Math.min(100, 50 + t10y2y * 30)) : 50;

  // 综合得分
  const weights = { sentiment: 0.25, volatility: 0.20, rate: 0.15, credit: 0.20, macro: 0.20 };
  const overall = sentimentScore * weights.sentiment + volScore * weights.volatility
    + rateScore * weights.rate + creditScore * weights.credit + macroScore * weights.macro;

  return {
    overall: Math.round(overall),
    sentiment: Math.round(sentimentScore),
    volatility: Math.round(volScore),
    rateEnvironment: Math.round(rateScore),
    creditMarket: Math.round(creditScore),
    macroCycle: Math.round(macroScore),
    timestamp: new Date().toISOString(),
  };
}

// ─── 策略决策 ───
export async function fetchStrategyDecision(): Promise<StrategyDecision> {
  const signal = await fetchTradingSignal();
  const overall = signal.overall;

  let action: 'buy' | 'sell' | 'hold';
  let heat: 'hot' | 'warm' | 'neutral' | 'cool' | 'cold';

  if (overall >= 75) { action = 'buy'; heat = 'hot'; }
  else if (overall >= 60) { action = 'buy'; heat = 'warm'; }
  else if (overall >= 45) { action = 'hold'; heat = 'neutral'; }
  else if (overall >= 30) { action = 'sell'; heat = 'cool'; }
  else { action = 'sell'; heat = 'cold'; }

  const decisionMessages = {
    hot_buy:    '综合信号强劲，各维度共振向上。建议积极做多，可适当提高仓位至 80-90%，优先选择 beta 较高的标的。',
    warm_buy:   '多数指标偏多，但个别维度存疑。建议维持 60-70% 仓位，逢低加仓，分批建仓。',
    neutral_hold: '多空信号交织，方向不明确。建议保持 40-50% 仓位，观望为主，减少操作频率。',
    cool_sell:  '多个维度发出预警。建议降低仓位至 20-30%，逐步减仓或设置更紧的止损。',
    cold_sell:  '信号全面偏空，风险急剧上升。建议仓位降至 10% 以下，或配置对冲工具（期权/反向ETF）保护组合。',
  };

  const key = heat === 'hot' || heat === 'warm' ? (action === 'buy' ? `${heat}_buy` : `${heat}_sell`)
    : heat === 'cool' || heat === 'cold' ? `${heat}_sell`
    : 'neutral_hold';

  const summary = decisionMessages[key as keyof typeof decisionMessages] || decisionMessages.neutral_hold;

  const suggestions = action === 'buy'
    ? [
        '优先配置高 beta 科技成长股，享受趋势弹性',
        '关注 AI、半导体等产业催化密集板块',
        '设置移动止盈，保护盈利不回吐',
      ]
    : action === 'sell'
    ? [
        '减仓高风险头寸，转向防御性板块（公用事业、必需消费）',
        '增加现金或短期国债配置比例',
        '考虑买入 VIX 相关产品做波动率对冲',
      ]
    : [
        '保持现有仓位，不急于操作',
        '研究个股基本面，为下一轮行情做准备',
        '关注关键数据（CPI、FOMC）发布时间窗口',
      ];

  return {
    action,
    heat,
    summary,
    suggestions,
    signal,
  };
}

// ─── 做T综合因子：宏观 / 情绪 / 产业 ───
export async function fetchStrategyFactors(
  market: Market = 'CN',
  symbol?: string | null,
): Promise<StrategyFactors> {
  const trading = await fetchTradingSignal();
  const overview = market === 'CN' ? await fetchMarketCapitalOverview('CN') : null;
  const sectorData = await fetchSectorFlows(market);
  const flows = sectorData?.flows ?? [];

  // ─── ① 宏观因子（利率 / 信用 / 周期） ───
  const macroScore = clamp(0.3 * trading.macroCycle + 0.3 * trading.creditMarket + 0.4 * trading.rateEnvironment);
  const macroMeta = `利率${trading.rateEnvironment} · 信用${trading.creditMarket} · 周期${trading.macroCycle}`;
  const macro: FactorScore = {
    label: '宏观',
    score: macroScore,
    meta: macroMeta,
    reading:
      macroScore >= 70
        ? '流动性宽松、信用环境友好，利率压力小，宏观面支持风险偏好抬升，利于做多与持有'
        : macroScore >= 45
        ? '宏观中性：利率与信用水平均衡，未形成明确趋势助推，做T主要靠个股自身波动'
        : '宏观偏紧：高利率+信用利差走阔压制估值，系统性回调风险上升，做T需轻仓快进快出',
  };

  // ─── ② 情绪因子（风险偏好 + 涨跌家数） ───
  let sentimentScore: number;
  let sentimentMeta: string;
  if (market === 'CN' && overview && overview.upCount + overview.downCount > 0) {
    const total = overview.upCount + overview.downCount;
    const upRatio = overview.upCount / total;
    sentimentScore = clamp(0.55 * trading.sentiment + 0.45 * (50 + (upRatio - 0.5) * 200));
    sentimentMeta = `涨${overview.upCount} 跌${overview.downCount} · CRAI=${trading.sentiment}`;
  } else {
    sentimentScore = clamp(0.7 * trading.sentiment + 0.3 * trading.volatility);
    sentimentMeta = `风险偏好${trading.sentiment} · 波动${trading.volatility}`;
  }
  const sentiment: FactorScore = {
    label: '情绪',
    score: sentimentScore,
    meta: sentimentMeta,
    reading:
      sentimentScore >= 70
        ? market === 'CN'
          ? '市场赚钱效应强，上涨家数占优，做T容错率高，回踩敢接、冲高敢T'
          : '风险偏好高涨，情绪面支撑做多，板块普涨时做T效率高'
        : sentimentScore >= 45
        ? '情绪中性，多空分歧，做T频率宜降低，专注强势主线不恋战'
        : '情绪偏弱，跌多涨少，追涨易套，做T以减仓降成本为主，不轻易接飞刀',
  };

  // ─── ③ 产业因子（标的所属板块资金流） ───
  let industry: FactorScore;
  const industryKey = (symbol && SYMBOL_INDUSTRY[symbol]) || '';
  let matchedFlow = industryKey
    ? flows.find((f) => (market === 'US' ? f.name === industryKey : f.name.includes(industryKey)))
    : undefined;
  const fallbackFlow = flows[0];
  if (!matchedFlow && fallbackFlow) {
    matchedFlow = fallbackFlow;
  }
  if (matchedFlow) {
    const f = matchedFlow as { name: string; netFlow: number; pctChg?: number };
    const netYI = market === 'US' ? f.netFlow * 0.01 : f.netFlow; // US换算为亿美元口径展示
    const isCN = market === 'CN';
    const flowScore = isCN ? clamp(50 + f.netFlow * 9, 15, 95) : clamp(50 + f.netFlow * 0.05, 20, 95);
    const flowLabel = market === 'US' ? (f.netFlow >= 0 ? 'net inflow' : 'net outflow') : (f.netFlow >= 0 ? '净流入' : '净流出');
    const flowVal = market === 'US' ? `${Math.abs(f.netFlow).toFixed(0)}M` : `${Math.abs(netYI).toFixed(1)}亿`;
    const prettyFlow = `${markSign(f.netFlow)}${flowVal}`;
    industry = {
      label: '产业',
      score: flowScore,
      meta: `所属:${f.name} · 主力${flowLabel} ${prettyFlow}`,
      reading:
        flowScore >= 65
          ? `所属「${f.name}」板块主力资金流入明显（${prettyFlow}），产业景气度与资金关注度双高，做T成功率高`
          : flowScore >= 45
          ? `所属「${f.name}」板块资金面平衡，无显著溢出，做T以跟随个股量价为主`
          : `所属「${f.name}」板块资金持续流出（${prettyFlow}），产业动能走弱，做T优先减仓锁盈而非加仓`,
    };
  } else {
    // 全真数据源都失败：确定性 mock 兜底，避免面板空白
    const mockScore = clamp(40 + trading.sentiment * 0.5);
    industry = {
      label: '产业',
      score: mockScore,
      meta: '板块资金流暂不可用',
      reading: '板块资金流数据暂不可用，产业因子按中性偏情绪估算，请以个股技术面为准',
    };
  }

  // ─── 综合做T偏向 ───
  const composite = Math.round(macro.score * 0.3 + sentiment.score * 0.3 + industry.score * 0.4);
  let bias: StrategyFactors['bias'];
  const cn = market === 'CN';
  if (composite >= 72) {
    bias = { title: '积极做T', color: '#0ca678', suggestion: cn ? '宏观情绪产业三线共振，盘中回踩不破分时均线可大胆低吸高抛，仓位可至 5-8 成' : 'Macro/sentiment/industry aligned, intraday pullbacks are buyable, hold 50-80% for T trades' };
  } else if (composite >= 55) {
    bias = { title: '正常做T', color: '#4078ff', suggestion: cn ? '环境支持做T，但非无脑行情，聚焦产业资金流入的强势主线，控制单日 T 仓 3-5 成' : 'Environment favors T-trading, focus on sectors with inflows, keep positions moderate' };
  } else if (composite >= 45) {
    bias = { title: '谨慎做T', color: '#f59e4b', suggestion: cn ? '宏观情绪一般，产业分化，做T以保本降成本为主，破位果断走，不逆势加仓' : 'Mixed signals, T-trade defensively, cut losses fast, avoid adding into weakness' };
  } else {
    bias = { title: '回避做T', color: '#f04452', suggestion: cn ? '宏观情绪产业全面走弱，系统性风险升温，建议空仓观望或仅持有底仓，暂停做T' : 'Risk-off regime, avoid intraday trading, hold high-quality base positions only' };
  }

  return {
    market,
    macro,
    sentiment,
    industry,
    composite,
    bias,
    updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    source: market === 'CN' && overview && overview.source === 'eastmoney' ? 'realtime' : 'mock',
  };
}

function markSign(v: number): string {
  return v > 0 ? '+' : v < 0 ? '-' : '';
}
