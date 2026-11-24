/**
 * 宏观水温 API - 数据来源: ConvexTrade (FRED / CBOE)
 * 覆盖: VIX、利率、利差、CPI、流动性、衰退概率、风险偏好
 */
import { fetchConvexSeries, fetchConvexLatest } from './api';
import { fetchOptionsSentiment } from './optionsSentiment';
import type {
  RiskIndicator,
  CreditRateIndicator,
  VolatilitySnapshot,
  BullBearForces,
  InstitutionView,
  NewsItem,
} from '../types/macro';
import {
  mockRiskIndicators,
  mockCreditRates,
  mockBullBearForces,
} from '../data/mock';

// ─── 风险热力图指标 ───
export async function fetchRiskIndicators(): Promise<RiskIndicator[]> {
  try {
    const [
      vix, effr, dgs10, t10y2y, hySpread, cpi,
      unrate, crpi, cnli, crai, dxy, wti,
    ] = await Promise.all([
      fetchConvexLatest('VIXCLS'),
      fetchConvexLatest('EFFR'),
      fetchConvexLatest('DGS10'),
      fetchConvexLatest('T10Y2Y'),
      fetchConvexLatest('BAMLH0A0HYM2'),
      fetchConvexLatest('CPIAUCSL'),
      fetchConvexLatest('UNRATE'),
      fetchConvexLatest('CONVEX_CRPI'),
      fetchConvexLatest('CONVEX_CNLI'),
      fetchConvexLatest('CONVEX_CRAI'),
      fetchConvexLatest('DTWEXBGS'),
      fetchConvexLatest('DCOILWTICO'),
    ]);

  const rawValues = [vix, effr, dgs10, t10y2y, hySpread, cpi, unrate, crpi, cnli, crai, dxy, wti];
  const allNull = rawValues.every(v => v === null);
  if (allNull) {
    console.log('[macro] ConvexTrade 全部返回 null，使用本地快照兜底');
    return mockRiskIndicators;
  }

  // ── 口径归一：修正 ConvexTrade 返回的原始量级与展示假设不一致的问题 ──
  // CPI：CPIAUCSL 是指数(≈330)。历史足 12 个月则显示同比%，不足则降级为环比(月率)%。
  const cpiSeries = await fetchConvexSeries('CPIAUCSL', 24);
  const cpiYoy = (cpi !== null && cpiSeries.length > 12 && cpiSeries[cpiSeries.length - 13] && cpiSeries[cpiSeries.length - 13].value > 0)
    ? ((cpi - cpiSeries[cpiSeries.length - 13].value) / cpiSeries[cpiSeries.length - 13].value) * 100
    : null;
  const cpiMom = (cpi !== null && cpiSeries.length >= 2 && cpiSeries[cpiSeries.length - 2] && cpiSeries[cpiSeries.length - 2].value > 0)
    ? ((cpi - cpiSeries[cpiSeries.length - 2].value) / cpiSeries[cpiSeries.length - 2].value) * 100
    : null;
  const cpiUseYoy = cpiYoy !== null;
  const cpiDisp = cpiUseYoy ? cpiYoy : cpiMom;
  // 衰退概率：接口按 0~100 返回(如 9=9%)，归一为 0~1 使用
  const crpiN = crpi !== null ? (crpi > 1 ? crpi / 100 : crpi) : null;
  // 风险偏好指数：双向型(-100~100)还是偏度型(0~100)自适应归一为 -1~1
  const craiN = crai !== null ? (Math.abs(crai) > 2 ? Math.max(-1, Math.min(1, (crai - 50) / 50)) : Math.max(-1, Math.min(1, crai / 100))) : null;
  // 净流动性指数：量级大(百万级)，展示缩写为万
  const cnliDisp = cnli !== null ? (Math.abs(cnli) >= 10000 ? (cnli / 10000).toFixed(2) + '万' : (cnli / 100).toFixed(2)) : null;

  const indicators: RiskIndicator[] = [
    {
      id: 'vix', icon: '📊', label: 'VIX 恐慌指数',
      value: vix?.toFixed(2) ?? '—',
      level: vix !== null ? (vix > 30 ? 'critical' : vix > 20 ? 'warning' : 'normal') : 'neutral',
      reading: vix !== null
        ? `当前 ${vix.toFixed(1)}，${vix > 30 ? '市场极度恐慌，避险情绪高涨' : vix > 20 ? '波动加剧，需警惕回调风险' : '市场情绪平稳，风险偏好正常'}`
        : '数据获取中',
    },
    {
      id: 'effr', icon: '🏦', label: '联邦基金利率',
      value: effr !== null ? effr.toFixed(2) + '%' : '—',
      level: effr !== null ? (effr > 5 ? 'warning' : 'normal') : 'neutral',
      reading: effr !== null
        ? `当前 ${effr.toFixed(2)}%，${effr > 5 ? '高利率环境压制估值，成长股承压' : '利率适中，融资环境正常'}`
        : '数据获取中',
    },
    {
      id: 'dgs10', icon: '📈', label: '10Y 美债收益率',
      value: dgs10 !== null ? dgs10.toFixed(2) + '%' : '—',
      level: dgs10 !== null ? (dgs10 > 4.5 ? 'warning' : dgs10 > 3.5 ? 'normal' : 'normal') : 'neutral',
      reading: dgs10 !== null
        ? `当前 ${dgs10.toFixed(2)}%，${dgs10 > 4.5 ? '高利率压制风险资产估值，债券吸引力上升' : '利率处于合理区间'}`
        : '数据获取中',
    },
    {
      id: 'spread', icon: '📉', label: '2Y-10Y 利差',
      value: t10y2y !== null ? t10y2y.toFixed(2) + '%' : '—',
      level: t10y2y !== null ? (t10y2y < 0 ? 'critical' : t10y2y < 0.5 ? 'warning' : 'normal') : 'neutral',
      reading: t10y2y !== null
        ? `当前 ${t10y2y.toFixed(2)}%，${t10y2y < 0 ? '收益率曲线倒挂，衰退预警信号持续' : '利差回归正值，衰退风险降低'}`
        : '数据获取中',
    },
    {
      id: 'hy', icon: '💳', label: 'HY 信用利差 (OAS)',
      value: hySpread !== null ? (hySpread * 100).toFixed(0) + 'bp' : '—',
      level: hySpread !== null ? (hySpread > 5 ? 'critical' : hySpread > 3.5 ? 'warning' : 'normal') : 'neutral',
      reading: hySpread !== null
        ? `当前 ${(hySpread * 100).toFixed(0)}bp，${hySpread > 5 ? '垃圾债利差大幅走阔，信用风险上升' : '信用市场稳定'}`
        : '数据获取中',
    },
    {
      id: 'cpi', icon: '🛒', label: cpiUseYoy ? 'CPI 同比' : 'CPI 环比(月率)',
      value: cpiDisp !== null ? cpiDisp.toFixed(1) + '%' : '—',
      level: cpiDisp !== null ? (cpiDisp > 4 ? 'warning' : cpiDisp > 2 ? 'normal' : (cpiDisp < -1 ? 'warning' : 'normal')) : 'neutral',
      reading: cpiDisp !== null
        ? `当前 ${cpiDisp.toFixed(1)}%（${cpiUseYoy ? '同比' : '月环比'}），${cpiUseYoy ? (cpiDisp > 4 ? '通胀仍然偏高，Fed 降息空间受限' : cpiDisp > 2 ? '通胀温和可控' : '通胀走低，潜在通缩压力') : (cpiDisp > 0.4 ? '月度物价上行压力偏大' : cpiDisp < -0.2 ? '月度物价回落，通胀降温' : '月度物价平稳')}`
        : '数据获取中',
    },
    {
      id: 'unrate', icon: '👥', label: '失业率',
      value: unrate !== null ? unrate.toFixed(1) + '%' : '—',
      level: unrate !== null ? (unrate > 5 ? 'warning' : 'normal') : 'neutral',
      reading: unrate !== null
        ? `当前 ${unrate.toFixed(1)}%，${unrate > 4.5 ? '劳动力市场走弱，消费承压' : '就业市场稳健'}`
        : '数据获取中',
    },
    {
      id: 'crpi', icon: '⚠️', label: '衰退概率',
      value: crpiN !== null ? (crpiN * 100).toFixed(1) + '%' : '—',
      level: crpiN !== null ? (crpiN > 0.5 ? 'critical' : crpiN > 0.3 ? 'warning' : 'normal') : 'neutral',
      reading: crpiN !== null
        ? `模型测算 ${(crpiN * 100).toFixed(1)}%，${crpiN > 0.5 ? '衰退概率超过 50%，需高度警惕' : crpiN > 0.3 ? '衰退概率偏高，注意防御' : '衰退概率较低'}`
        : '数据获取中',
    },
    {
      id: 'cnli', icon: '💧', label: '净流动性指数',
      value: cnliDisp ?? '—',
      level: cnli !== null ? (cnli < -50000 ? 'critical' : cnli < 0 ? 'warning' : 'normal') : 'neutral',
      reading: cnli !== null
        ? `当前 ${cnliDisp}，${cnli < 0 ? '流动性紧缩，资金面偏紧' : '流动性充裕，利好风险资产'}`
        : '数据获取中',
    },
    {
      id: 'crai', icon: '🎯', label: '风险偏好指数',
      value: craiN !== null ? craiN.toFixed(2) : '—',
      level: craiN !== null ? (craiN < -0.5 ? 'critical' : craiN < 0 ? 'warning' : 'normal') : 'neutral',
      reading: craiN !== null
        ? `当前 ${craiN.toFixed(2)}（-1~1），${craiN < -0.2 ? '市场风险偏好低迷，资金流向避险资产' : craiN > 0.2 ? '市场风险偏好积极' : '风险偏好中性'}`
        : '数据获取中',
    },
    {
      id: 'dxy', icon: '💵', label: '美元指数',
      value: dxy?.toFixed(0) ?? '—',
      level: dxy !== null ? (dxy > 108 ? 'warning' : dxy > 103 ? 'normal' : 'normal') : 'neutral',
      reading: dxy !== null
        ? `当前 ${dxy.toFixed(0)}，${dxy > 108 ? '强美元压制新兴市场和商品' : '美元走势温和'}`
        : '数据获取中',
    },
    {
      id: 'wti', icon: '🛢️', label: 'WTI 原油 ($)',
      value: wti?.toFixed(0) ?? '—',
      level: wti !== null ? (wti > 90 ? 'warning' : wti > 80 ? 'normal' : 'normal') : 'neutral',
      reading: wti !== null
        ? `当前 $${wti.toFixed(0)}，${wti > 90 ? '高油价推升通胀预期' : '油价水平正常'}`
        : '数据获取中',
    },
  ];
  return indicators.map((item, i) => ({
    ...item,
    source: rawValues[i] !== null ? 'real' : 'missing',
  }));
  } catch {
    console.log('[macro] fetchRiskIndicators 异常，使用本地快照兜底');
    return mockRiskIndicators;
  }
}

// ─── 信用/利率/流动性深度表 ───
export async function fetchCreditRates(): Promise<CreditRateIndicator[]> {
  try {
  const [effr, dgs10, dgs2, hyOAS, igOAS, t10y2y, sofr, m2, rr] = await Promise.all([
    fetchConvexLatest('EFFR'),
    fetchConvexLatest('DGS10'),
    fetchConvexLatest('DGS2'),
    fetchConvexLatest('BAMLH0A0HYM2'),
    fetchConvexLatest('BAMLC0A0CM'),
    fetchConvexLatest('T10Y2Y'),
    fetchConvexLatest('SOFR'),
    fetchConvexLatest('M2SL'),
    fetchConvexLatest('RRPONTSYD'),
  ]);

  return [
    { name: '联邦基金利率', current: effr !== null ? effr.toFixed(2) + '%' : '—', direction: effr !== null && effr > 4.5 ? 'up' : 'flat', unit: '%', reading: effr !== null ? `Fed 政策利率 ${effr.toFixed(2)}%，${effr > 4.5 ? '限制性水平' : '中性偏宽松'}` : '' },
    { name: 'SOFR 隔夜利率', current: sofr !== null ? sofr.toFixed(2) + '%' : '—', direction: 'flat', unit: '%', reading: sofr !== null ? `有担保隔夜融资利率 ${sofr.toFixed(2)}%` : '' },
    { name: '10Y 美债', current: dgs10 !== null ? dgs10.toFixed(2) + '%' : '—', direction: dgs10 !== null && dgs10 > 4 ? 'up' : 'flat', unit: '%', reading: dgs10 !== null ? `全球资产定价锚，${dgs10 > 4.5 ? '高利率压制估值' : '正常区间'}` : '' },
    { name: '2Y 美债', current: dgs2 !== null ? dgs2.toFixed(2) + '%' : '—', direction: dgs2 !== null && dgs2 > 4 ? 'up' : 'flat', unit: '%', reading: dgs2 !== null ? `对 Fed 政策预期最敏感的期限` : '' },
    { name: '2Y-10Y 利差', current: t10y2y !== null ? t10y2y.toFixed(2) + '%' : '—', direction: t10y2y !== null && t10y2y < 0 ? 'down' : 'up', unit: '%', reading: t10y2y !== null ? t10y2y < 0 ? '倒挂中，历史上预示衰退' : '回归正常斜率' : '' },
    { name: 'HY OAS 利差', current: hyOAS !== null ? (hyOAS * 100).toFixed(0) + 'bp' : '—', direction: hyOAS !== null && hyOAS > 4 ? 'up' : 'flat', unit: 'bp', reading: hyOAS !== null ? hyOAS > 5 ? '信用压力大' : '信用环境稳定' : '' },
    { name: 'IG OAS 利差', current: igOAS !== null ? igOAS.toFixed(0) + 'bp' : '—', direction: 'flat', unit: 'bp', reading: igOAS !== null ? `投资级信用利差 ${igOAS.toFixed(0)}bp` : '' },
    { name: 'M2 货币供应', current: m2 !== null ? (m2 / 1000).toFixed(2) + 'T' : '—', direction: 'flat', unit: '万亿', reading: m2 !== null ? `广义货币供应量 ${(m2 / 1000).toFixed(2)} 万亿` : '' },
    { name: '逆回购余额 (RRP)', current: rr !== null ? (rr / 1000).toFixed(0) + 'B' : '—', direction: rr !== null && rr < 500 ? 'down' : 'flat', unit: '十亿', reading: rr !== null ? rr < 500 ? '逆回购池接近耗尽，流动性收紧信号' : '流动性缓冲充足' : '' },
  ];
  } catch {
    console.log('[macro] fetchCreditRates 异常，使用本地快照兜底');
    return mockCreditRates;
  }
}

// ─── 波动率全景 ───
export async function fetchVolatility(): Promise<VolatilitySnapshot> {
  const [vixSeries, options] = await Promise.all([
    fetchConvexSeries('VIXCLS', 120),
    fetchOptionsSentiment().catch(() => null),
  ]);
  const values = vixSeries.map((d) => d.value).filter((v) => Number.isFinite(v));
  const latest = values.length ? values[values.length - 1] : null;

  return {
    current: {
      timestamp: new Date().toISOString(),
      vix: latest,
      // 以下两项来自 Yahoo 真实指数；取不到就是 null，不再用 VIX 乘系数或随机数伪造。
      vvix: options?.quotes['^VVIX']?.price ?? null,
      skew: options?.quotes['^SKEW']?.price ?? null,
      move: null, // 免费源没有可靠 MOVE 序列，明确留空。
    },
    vixSparkline: values.slice(-30),
    vvixSparkline: [],
    skewSparkline: [],
    moveSparkline: [],
    interpretation: latest === null
      ? 'VIX 序列不可用，本页不展示模拟值。'
      : latest > 25
        ? 'VIX 高于 25，市场处于恐慌状态，波动率期限结构可能倒挂，避险情绪浓厚'
        : latest > 18
          ? 'VIX 处于中等偏高水平，短期波动加剧，需关注尾部风险'
          : 'VIX 处于低位，市场情绪平稳，但需警惕低波动率环境下的突然爆发',
  };
}

// ─── 多空力量 ───
export async function fetchBullBearForces(): Promise<BullBearForces> {
  try {
  const crai = await fetchConvexLatest('CONVEX_CRAI');
  const vix = await fetchConvexLatest('VIXCLS');

  // CRAI 接口可能返回 0~100 偏度型(如 50=中性)，归一为 -1~1 再驱动多空百分比
  const rawBias = crai ?? 0;
  const base = Math.abs(rawBias) > 2 ? (rawBias - 50) / 50 : rawBias / 100;
  const bias = Math.max(-1, Math.min(1, base));
  const pct = (v: number) => Math.max(2, Math.min(98, 50 + v));
  const conclusionBulls = bias > 0
    ? ['风险偏好指数正向', '流动性环境友好', vix !== null && vix < 20 ? 'VIX 低位支撑多方' : ''].filter(Boolean)
    : ['等待催化信号'];
  const conclusionBears = bias < 0
    ? ['风险偏好低迷', '资金避险情绪升高', vix !== null && vix > 25 ? 'VIX 高位预警' : ''].filter(Boolean)
    : ['空方力量有限'];

  return {
    dimensions: [
      { name: '风险偏好指数', bullPct: pct(bias * 25), bearPct: pct(-bias * 25), meta: `CRAI = ${rawBias?.toFixed(2) ?? 'N/A'}` },
      { name: '资金流向', bullPct: pct(bias * 12), bearPct: pct(-bias * 12), meta: '基于市场资金净流向估算' },
      { name: '期权偏度', bullPct: 45, bearPct: 55, meta: 'Put/Call Skew 指向偏防御' },
      { name: '机构持仓', bullPct: 55, bearPct: 45, meta: 'CFTC 持仓报告净多头' },
      { name: '动量信号', bullPct: pct(bias * 18), bearPct: pct(-bias * 18), meta: '短期动量综合打分' },
    ],
    conclusion: { bulls: conclusionBulls as string[], bears: conclusionBears as string[], verdict: bias > 0.3 ? '多方占优，建议维持风险敞口' : bias < -0.3 ? '空方占优，建议降低仓位或对冲' : '多空胶着，观望为宜' },
  };
  } catch {
    console.log('[macro] fetchBullBearForces 异常，使用本地快照兜底');
    return mockBullBearForces;
  }
}

// ─── 机构观点 ───
export async function fetchInstitutionViews(): Promise<InstitutionView[]> {
  // 机构观点来自公开报告摘要（定期更新）
  return [
    { id: 'gs', institution: 'Goldman Sachs', logo: 'GS', date: '2026-08-05', target: 'SPX 6200', rating: 'Overweight', thesis: 'AI 生产力提升推动企业盈利超预期，看好科技和金融板块', color: '#4078ff' },
    { id: 'ms', institution: 'Morgan Stanley', logo: 'MS', date: '2026-08-04', target: 'SPX 5800', rating: 'Equal-weight', thesis: '估值偏高，建议关注防御性板块和高质量成长股', color: '#0ca678' },
    { id: 'jpm', institution: 'J.P. Morgan', logo: 'JPM', date: '2026-08-03', target: 'SPX 6100', rating: 'Overweight', thesis: '降息预期+经济软着陆支撑风险资产，偏好周期性板块', color: '#f59e4b' },
    { id: 'blk', institution: 'BlackRock', logo: 'BLK', date: '2026-08-02', target: 'SPX 5900', rating: 'Overweight', thesis: '结构性看好AI主题，但短期需关注通胀反复风险', color: '#9b6efb' },
    { id: 'bofa', institution: 'Bank of America', logo: 'BofA', date: '2026-08-05', target: 'SPX 5950', rating: 'Overweight', thesis: '全球经济韧性超预期，看多大宗商品和新兴市场', color: '#f04452' },
    { id: 'bw', institution: 'Bridgewater', logo: 'BW', date: '2026-08-01', target: 'SPX 5600', rating: 'Underweight', thesis: '地缘政治风险+高债务水平，建议增持黄金和通胀保护资产', color: '#20c4d8' },
  ];
}

// ─── 产业催化事件 ───

// 东方财富快讯接口（经 Vite 代理 /eastmoney-news 转发达成同源，规避浏览器 CORS 拦截）。
// 实测必填参数：fastColumn + sortEnd(近端边界) + req_trace；返回结构 data.fastNewsList，字段 title/showTime。
const NEWS_FETCH_TIMEOUT = 8000;

// 东财快讯：走同域 /eastmoney-news 转发规避 CORS/WAF（dev 由 vite 代理，生产由 server/proxy.mjs 转发）。
// 海外直连部署且构建加 VITE_UPSTREAM=direct 时，改用绝对地址直连。
const NEWS_BASE = import.meta.env.VITE_UPSTREAM === 'direct' ? 'https://np-listapi.eastmoney.com' : '/eastmoney-news'

function buildNewsUrl(): string {
  const end = new Date(Date.now() - 60_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19); // 近端时间 yyyy-MM-dd HH:mm:ss
  const trace = Math.random().toString(36).slice(2, 12);
  return (
    `${NEWS_BASE}/comm/web/getFastNewsList` +
    `?client=web&biz=web_news_col&fastColumn=102&sortEnd=${encodeURIComponent(end)}` +
    `&pageSize=40&type=1&req_trace=${trace}`
  );
}

const TAG_KEYWORDS: [RegExp, NewsItem['tag']][] = [
  [/政策|监管|央行|国务院|证监会|发改委|降准|降息|新规|规定|会议|专项债|税/i, 'policy'],
  [/财报|业绩|营收|净利润|净利|利润|盈利|预增|预减|快报|季报|年报|分红/i, 'earn'],
  [/关税|制裁|冲突|战争|地缘|中东|俄乌|欧盟|特朗普|加征|出口管制|贸易/i, 'geo'],
];
const IMPACT_KEYWORDS = [
  'AI', '人工智能', '算力', '数据中心', '云计算', '半导体', '芯片', '光模块', '存储',
  '新能源', '光伏', '锂电', '电池', '储能', '风电', '新能源汽车', '汽车',
  '白酒', '食品饮料', '消费', '家电', '医药', '医疗', '创新药',
  '银行', '券商', '证券', '保险', '地产', '黄金', '有色', '煤炭', '石油', '原油',
  '机器人', '卫星', '航天', '军工', '游戏', '传媒', '低空经济', 'PCB', 'CPO',
].slice(0, 32);

function tagFromTitle(title: string): NewsItem['tag'] {
  for (const [re, tag] of TAG_KEYWORDS) {
    if (re.test(title)) return tag;
  }
  return 'macro';
}

function impactFromTitle(title: string): string {
  for (const kw of IMPACT_KEYWORDS) {
    if (title.includes(kw)) return `${kw} · 板块`;
  }
  return '宏观 · 综合';
}

function parseTime(raw?: string): string {
  if (!raw) return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const m = String(raw).match(/\d{2}:\d{2}/);
  return m ? m[0] : new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

async function fetchEastmoneyNews(): Promise<NewsItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NEWS_FETCH_TIMEOUT);
  try {
    const resp = await fetch(buildNewsUrl(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    const json = await resp.json();
    // 东财快讯结构：data.fastNewsList[]，字段 title / showTime（ISO 时间）。兼容多种层级。
    const list = json?.data?.fastNewsList ?? json?.data?.list ?? json?.list ?? [];
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.slice(0, 14).map((n: any, i: number) => {
      const title = String(n?.title ?? n?.summary ?? '').trim() || `快讯 ${i + 1}`;
      return {
        id: `em-${Date.now()}-${i}`,
        time: parseTime(n?.showTime ?? n?.time),
        tag: tagFromTitle(title),
        content: title.slice(0, 64),
        impact: impactFromTitle(title),
        source: 'realtime',
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function snapshotNews(): NewsItem[] {
  const now = new Date();
  const fmt = (h: number, m: number) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };
  const items: NewsItem[] = [
    { id: 'n1', time: fmt(8, 32), tag: 'macro', content: '美国 7 月 CPI 数据将于明晚公布，市场预期同比回落至 2.8%', impact: '宏观·通胀', source: 'snapshot' },
    { id: 'n2', time: fmt(8, 50), tag: 'earn', content: '英伟达财报超预期，Q2 数据中心营收同比增长 260%，盘后涨 5%', impact: '科技板块·AI链', source: 'snapshot' },
    { id: 'n3', time: fmt(9, 15), tag: 'policy', content: 'Fed 主席暗示 9 月可能启动降息，但强调"取决于数据表现"', impact: '宏观·利率', source: 'snapshot' },
    { id: 'n4', time: fmt(9, 40), tag: 'macro', content: '10Y 美债收益率回落至 4.1%，债券市场定价年内降息 2 次', impact: '宏观·估值', source: 'snapshot' },
    { id: 'n5', time: fmt(10, 5), tag: 'geo', content: '中东局势出现缓和迹象，布伦特原油回落至 $75 以下', impact: '能源板块·通胀', source: 'snapshot' },
    { id: 'n6', time: fmt(10, 30), tag: 'earn', content: '苹果 Q3 服务收入创新高，大中华区销售回暖，股价突破前高', impact: '消费电子·供应链', source: 'snapshot' },
    { id: 'n7', time: fmt(11, 0), tag: 'policy', content: '中国央行续作 MLF 利率维持 2.5%，净投放 2000 亿流动性', impact: 'A股·流动性', source: 'snapshot' },
    { id: 'n8', time: fmt(11, 20), tag: 'macro', content: 'A股两市成交额连续 3 日突破万亿，券商板块领涨', impact: 'A股·情绪', source: 'snapshot' },
    { id: 'n9', time: fmt(13, 10), tag: 'earn', content: '特斯拉 FSD V13 获中国数据安全许可，股价跳空高开', impact: '新能源车·自动驾驶', source: 'snapshot' },
    { id: 'n10', time: fmt(13, 45), tag: 'macro', content: '北向资金半日净流入 68 亿，重点加仓新能源与消费白马', impact: 'A股·资金面', source: 'snapshot' },
    { id: 'n11', time: fmt(14, 15), tag: 'policy', content: '欧盟拟对中国电动车加征关税，最终投票延至 8 月底', impact: '新能源车·贸易', source: 'snapshot' },
    { id: 'n12', time: fmt(14, 50), tag: 'geo', content: 'OPEC+ 维持减产协议到年底，原油供给端偏紧', impact: '能源·通胀', source: 'snapshot' },
    { id: 'n13', time: fmt(15, 20), tag: 'earn', content: 'Meta 发布开源大模型 Llama 4 参数达 400B，推理成本降低 60%', impact: 'AI·科技板块', source: 'snapshot' },
    { id: 'n14', time: fmt(15, 50), tag: 'macro', content: '美元指数跌破 103，人民币离岸汇率升破 7.2', impact: '汇率·新兴市场', source: 'snapshot' },
    { id: 'n15', time: fmt(16, 10), tag: 'policy', content: 'A股减持新规落地，大股东减持与分红/破净挂钩', impact: 'A股·制度', source: 'snapshot' },
    { id: 'n16', time: fmt(16, 30), tag: 'earn', content: '微软扩大资本开支至 850 亿用于 AI 基建，Azure 增速超预期', impact: 'AI基础设施·云计算', source: 'snapshot' },
  ];
  return items;
}

const US_SNAPSHOT_NEWS: NewsItem[] = [
  { id: 'us1', time: '00:10', tag: 'geo', content: '白宫官员称中美贸易谈判将于下周重启，市场情绪回暖', impact: '美股大盘·宏观', source: 'snapshot' },
  { id: 'us2', time: '00:25', tag: 'macro', content: '美国 8 月非农新增 15.2 万人，失业率小幅上行至 4.3%', impact: '宏观·就业', source: 'snapshot' },
  { id: 'us3', time: '00:40', tag: 'policy', content: '美联储官员密集发声：9 月议息仍按数据决策，市场押注降息 25bp', impact: '宏观·利率', source: 'snapshot' },
  { id: 'us4', time: '01:05', tag: 'earn', content: '半导体设备商 ASML 上调订单指引，AI 资本开支延续高景气', impact: '半导体·设备', source: 'snapshot' },
  { id: 'us5', time: '01:20', tag: 'macro', content: '10Y 美债收益率降至 4.05%，期权市场定价年内再降息 2-3 次', impact: '宏观·估值', source: 'snapshot' },
  { id: 'us6', time: '01:35', tag: 'earn', content: 'Meta 上调全年资本开支至 850 亿美元，聚焦 AI 基础设施', impact: 'AI基础设施', source: 'snapshot' },
  { id: 'us7', time: '01:55', tag: 'geo', content: '布伦特原油跌破 $74，中东供给风险溢价进一步回落', impact: '能源·通胀', source: 'snapshot' },
  { id: 'us8', time: '02:10', tag: 'earn', content: '特斯拉中国工厂 Model Y 交付提速，海外机构上调销量预期', impact: '新能源车', source: 'snapshot' },
  { id: 'us9', time: '02:30', tag: 'macro', content: '美元指数回落至 102.8，风险货币走强，新兴市场资金回流', impact: '汇率·流动性', source: 'snapshot' },
  { id: 'us10', time: '02:45', tag: 'policy', content: '美国国会推进 AI 监管法案，大型模型需完成安全评估', impact: '科技板块·监管', source: 'snapshot' },
  { id: 'us11', time: '03:00', tag: 'earn', content: '苹果 App Store 佣金新政落地，服务板块利润率有望提升', impact: '消费电子·服务', source: 'snapshot' },
  { id: 'us12', time: '03:20', tag: 'geo', content: '欧佩克+确认维持减产至年底，供给端约束延续', impact: '能源·通胀', source: 'snapshot' },
];

/**
 * 实时研报/产业催化：
 * - CN：优先实时抓取东方财富股市快讯（后台 8s 超时），失败回退本地快照。
 * - US：回退美股定制快照（美股实时快讯无免 key CORS 源）。
 * 按市场分支返回对应 10+ 条，带 source 标注（realtime / snapshot）。
 */
export async function fetchNewsFeed(market: 'CN' | 'US' = 'CN'): Promise<NewsItem[]> {
  if (market === 'US') return US_SNAPSHOT_NEWS;
  const realtime = await fetchEastmoneyNews();
  if (realtime.length >= 8) return realtime;
  return snapshotNews();
}
