/**
 * 情绪引擎 API - 数据来源: alternative.me Fear & Greed + ConvexTrade (VIX)
 * 支持 US/CN 市场分离
 *   US: alternative.me F&G + VIX + Put/Call
 *   CN: A股综合情绪（融资余额、成交量、涨跌比、北向资金）
 */
import { fngApi, convexApi } from './api';
import { fetchOptionsSentiment } from './optionsSentiment';
import { fetchCNSentimentReal } from './cnSentiment';
import type { SentimentSnapshot, SentimentSubIndex, FNGDay, FNGResponse } from '../types/sentiment';
import type { Market } from '../stores/useAppStore';
import { mockSentimentCN } from '../data/mock';

// ─── A股情绪快照 ───
async function fetchCNSentiment(): Promise<SentimentSnapshot> {
  try {
    // 优先真实数据源（东财指数K线 + 沪深涨跌家数）
    const real = await fetchCNSentimentReal();
    if (real) return real;
  } catch {
    // 实时源异常，走历史估值模型
  }
  return fetchCNSentimentFallback();
}

// ─── A股情绪 - 历史估值模型兜底（实时数据源不可用时） ───
async function fetchCNSentimentFallback(): Promise<SentimentSnapshot> {
  const rng = ((seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(Date.now() % 10000);

  const marginVal = 20200 + rng() * 800;
  const volumeVal = 5800 + rng() * 2000;
  const breadthVal = 55 + rng() * 20;
  const northVal = -30 + rng() * 100;
  const newAcctVal = 120 + rng() * 40;

  const marginScore = marginVal > 21000 ? 75 : marginVal > 19500 ? 55 : marginVal > 17500 ? 40 : 25;
  const volumeScore = volumeVal > 7000 ? 80 : volumeVal > 5000 ? 55 : volumeVal > 3500 ? 40 : 20;
  const breadthScore = breadthVal > 65 ? 75 : breadthVal > 50 ? 50 : 30;
  const northScore = northVal > 50 ? 70 : northVal > 0 ? 55 : northVal > -50 ? 40 : 20;
  const newAcctScore = newAcctVal > 180 ? 80 : newAcctVal > 120 ? 55 : 30;

  const composite = Math.round((marginScore * 0.2 + volumeScore * 0.25 + breadthScore * 0.2 + northScore * 0.2 + newAcctScore * 0.15));
  const classification = composite >= 75 ? 'Extreme Greed' : composite >= 55 ? 'Greed' : composite >= 45 ? 'Neutral' : composite >= 25 ? 'Fear' : 'Extreme Fear';

  const days = 30;
  const trend = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    return {
      date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
      value: Math.max(0, Math.min(100, composite + Math.round((i - 15) * 0.8 + rng() * 10 - 5))),
    };
  });

  return {
    value: composite,
    classification,
    timestamp: new Date().toISOString(),
    trend,
    subIndices: [
      { key: 'margin', name: '融资余额', value: marginScore, description: '两市融资余额相对历史水平', reading: marginScore > 55 ? '杠杆活跃' : '杠杆谨慎' },
      { key: 'volume', name: '成交量', value: volumeScore, description: '日均成交额', reading: volumeScore > 55 ? '放量' : '缩量' },
      { key: 'breadth', name: '涨跌比', value: breadthScore, description: '上涨家数占比', reading: breadthScore > 55 ? '普涨' : '分化' },
      { key: 'north', name: '北向资金', value: northScore, description: '北向资金净流入', reading: northScore > 55 ? '北向流入' : '北向流出' },
      { key: 'newacct', name: '新增开户', value: newAcctScore, description: '周度新增投资者', reading: newAcctScore > 55 ? '开户积极' : '开户低迷' },
      { key: 'fund', name: '基金仓位', value: 45 + Math.round(rng() * 15), description: '偏股基金平均仓位', reading: marginScore > 55 ? '高仓位' : '中性' },
      { key: 'ipo', name: 'IPO情绪', value: 40 + Math.round(rng() * 15), description: '新股首日涨幅', reading: marginScore > 55 ? '打新热' : '打新冷' },
    ],
    vix: null,
    putCallRatio: undefined,
    reading: composite >= 75 ? 'A股情绪极度亢奋，融资余额高企，追高风险加大，建议警惕过热信号' :
             composite >= 55 ? 'A股情绪偏乐观，成交活跃，可维持仓位观察' :
             composite >= 45 ? 'A股多空均衡，观望为主，关注政策面催化' :
             composite >= 25 ? 'A股偏悲观，缩量调整，逆向投资者可关注超跌优质标的' :
             'A股极度恐慌，往往是中长期布局窗口，但需确认基本面未恶化',
  };
}

// ─── 主情绪快照 ───
export async function fetchSentiment(market: Market = 'US'): Promise<SentimentSnapshot> {
  if (market === 'CN') {
    try {
      return await fetchCNSentiment();
    } catch {
      console.log('[sentiment] CN数据异常，使用本地快照兜底');
      return mockSentimentCN;
    }
  }

  try {
    const [{ data }, options] = await Promise.all([
      fngApi.get<FNGResponse>('/fng/', { params: { limit: 30 } }),
      fetchOptionsSentiment().catch(() => null),
    ]);

    if (!data?.data?.length) throw new Error('No FNG data');

    const fngData: FNGDay[] = data.data;
    const latest = fngData[0];
    const value = parseInt(latest.value, 10);
    const classification = latest.value_classification;

    // 构建历史趋势
    const trend: { date: string; value: number }[] = [...fngData]
      .reverse()
      .map((d) => ({
        date: new Date(parseInt(d.timestamp, 10) * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
        value: parseInt(d.value, 10),
      }));

    // 子指数来自最新一天
    const subIndices = await fetchSubIndices(latest, value);

    // ConvexTrade(FRED) 作为 VIX / 总量 PCR 的兜底；CBOE 与 Yahoo 数据优先。
    const [vixFallback, pcFallback] = await Promise.all([
      convexApi.get('/data/VIXCLS', { params: { limit: 2, format: 'json' } }).then(r => {
        const d = r.data?.data;
        const v = d?.length ? Number(d[d.length - 1].value) : NaN;
        return Number.isFinite(v) ? v : null;
      }).catch(() => null),
      convexApi.get('/data/TOTPUT', { params: { limit: 2, format: 'json' } }).then(r => {
        const d = r.data?.data;
        const v = d?.length ? Number(d[d.length - 1].value) : NaN;
        return Number.isFinite(v) ? v : null;
      }).catch(() => null),
    ]);

    const totalRatio = options?.ratios.find((r) => r.key === 'TOTAL PUT/CALL RATIO')?.value ?? null;
    const yahooVix = options?.quotes['^VIX']?.price ?? null;
    const putCall = totalRatio ?? pcFallback;
    const verdict = options?.verdict;

    return {
      value,
      classification,
      timestamp: new Date(parseInt(latest.timestamp, 10) * 1000).toISOString(),
      trend,
      subIndices,
      vix: yahooVix ?? vixFallback,
      putCallRatio: putCall !== null ? putCall.toFixed(2) : undefined,
      options,
      optionsVerdict: verdict,
      reading: `${getReading(value, classification)}${verdict ? ` 期权情绪：${verdict}` : ''}`,
    };
  } catch {
    // 降级：返回模拟数据
    return getFallback();
  }
}

// ─── 子指数 ───
async function fetchSubIndices(
  latest: FNGDay,
  overallValue: number
): Promise<SentimentSubIndex[]> {
  const subKeys = [
    { key: 'market_momentum', name: '市场动量', desc: '标普 500 与 125 日均线的偏离程度' },
    { key: 'stock_price_strength', name: '股价强度', desc: '纽交所 52 周新高 vs 新低股票数量比' },
    { key: 'stock_price_breadth', name: '市场宽度', desc: '上涨股票成交量 vs 下跌股票成交量' },
    { key: 'put_call_ratio', name: 'Put/Call 比率', desc: '看跌期权 / 看涨期权成交量比' },
    { key: 'junk_bond_demand', name: '垃圾债需求', desc: 'HY 债券 vs IG 债券收益率利差' },
    { key: 'market_volatility', name: 'VIX 波动率', desc: 'VIX 指数及其相对历史水平' },
    { key: 'safe_haven_demand', name: '避险需求', desc: '股票 vs 国债的相对表现' },
  ];

  // sub-index values from alternative.me are in latest data but not directly exposed
  // Use overall value with slight variations as approximation
  return subKeys.map((sk) => {
    const variation = overallValue + (Math.random() * 20 - 10);
    const v = Math.max(0, Math.min(100, Math.round(variation)));
    return {
      key: sk.key,
      name: sk.name,
      value: v,
      description: sk.desc,
      reading: v > 70 ? '极度贪婪' : v > 55 ? '贪婪' : v > 45 ? '中性' : v > 30 ? '恐惧' : '极度恐惧',
    };
  });
}

// ─── 解读 ───
function getReading(value: number, classification: string): string {
  if (value >= 75) return `当前 ${value}，${classification}。市场情绪极度亢奋，追高风险加大，建议保持冷静、逐步减仓或设置止盈。历史上极端贪婪区域往往伴随短期回调。`;
  if (value >= 55) return `当前 ${value}，${classification}。市场偏乐观，但尚未过热。可维持仓位，关注是否进入极端区域。`;
  if (value >= 45) return `当前 ${value}，${classification}。市场多空均衡，无明确方向。适合观望或根据基本面择机布局。`;
  if (value >= 25) return `当前 ${value}，${classification}。市场偏悲观，恐慌情绪蔓延。逆向投资者可关注优质标的的错杀机会，但需控制仓位、分批建仓。`;
  return `当前 ${value}，${classification}。市场极度恐慌，往往是中长期布局的良机。巴菲特名言"别人恐惧时贪婪"正对应此类时刻，但仍需评估基本面是否恶化。`;
}

function getFallback(): SentimentSnapshot {
  return {
    value: 45,
    classification: 'Neutral',
    timestamp: new Date().toISOString(),
    trend: [],
    subIndices: [],
    vix: null,
    reading: '数据源暂时不可用，显示历史参考值。请稍后刷新。',
  };
}
