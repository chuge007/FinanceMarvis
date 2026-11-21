import { useState, useCallback, useRef } from 'react';
import { fetchTencentQuotes, fetchStockQuote, fetchFearGreed } from '../../../services/api';
import { runStockPicker, toChangeMap, type PickResult, type PickGroup, type MarketEnv } from '../../../services/stockPicker';
import type { Market } from '../../../stores/useAppStore';

export interface Candidate {
  id: number;
  rank: number;
  symbol: string;
  name: string;
  change: number;
  score: number;
  thesis: string;
  sparkline: number[];
  // ── 选股引擎输出（四维打分 + 分组 + 理由）──
  group: PickGroup;
  safetyScore: number;
  trendScore: number;
  themeScore: number;
  fundScore: number;
  envScore: number;
  valueScore: number;   // 性价比（低风险 / 回撤保护）
  upsideScore: number;  // 上涨希望（趋势+题材+资金合力）
  reasons: { label: string; verdict: '利好' | '利空' | '中性'; text: string }[];
}

export interface CandidateRaw {
  symbol: string;
  name: string;
  thesis: string;
  market: 'US' | 'CN';
}

export interface LiveQuote {
  price: number;
  changePercent: number;
  source: 'tencent' | 'yahoo';
}

export interface CandidatesData {
  aShare: Candidate[];
  usShare: Candidate[];
}

export const GROUP_LABEL: Record<PickGroup, string> = {
  safeUptrend: '安全上涨·优选',
  oversoldRebound: '超跌反弹·例外',
  watch: '观察',
};

function rng(base: number, spread: number) {
  return +(base + (Math.random() - 0.5) * spread).toFixed(2);
}

function spark(base: number, n: number) {
  const arr = [base];
  for (let i = 1; i < n; i++) arr.push(+(arr[i - 1] + (Math.random() - 0.45) * base * 0.02).toFixed(2));
  return arr;
}

function scoreOf(changePercent: number): number {
  if (!Number.isFinite(changePercent)) return 60;
  return Math.max(25, Math.min(97, Math.round(52 + changePercent * 4.2)));
}

/** 用选股引擎输出覆盖候选的评分 / 分组 / 理由，并按总分降序 */
function applyPicks(list: Candidate[], picks: PickResult[]): Candidate[] {
  const bySymbol = new Map(picks.map((p) => [p.symbol, p]));
  return list
    .map((c) => {
      const p = bySymbol.get(c.symbol);
      if (!p) return c;
      return {
        ...c,
        score: p.totalScore,
        group: p.group,
        safetyScore: p.safetyScore,
        trendScore: p.trendScore,
        themeScore: p.themeScore,
        fundScore: p.fundScore,
        envScore: p.envScore,
        valueScore: p.valueScore,
        upsideScore: p.upsideScore,
        reasons: p.reasons,
        thesis: p.thesis,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildBaseList(meta: CandidateRaw[], market: Market, base: number): Candidate[] {
  return meta.map((item, i) => {
    const change = rng(6, 8);
    const sp = spark(base, 8);
    return {
      id: i + 1,
      rank: i + 1,
      symbol: item.symbol,
      name: item.name,
      change,
      score: 60,
      thesis: item.thesis,
      sparkline: sp,
      group: 'watch' as PickGroup,
      safetyScore: 60,
      trendScore: 60,
      themeScore: 60,
      fundScore: 60,
      envScore: 50,
      valueScore: 60,
      upsideScore: 60,
      reasons: [],
    };
  });
}

/** 恐惧贪婪分 → 大盘温度 */
function temperatureOf(fg: number): MarketEnv['temperature'] {
  if (fg >= 72) return 'hot';
  if (fg >= 38) return 'warm';
  return 'cold';
}

export const CANDIDATE_LIST: CandidateRaw[] = [
  // ─── A股 ───
  { symbol: '600519', name: '贵州茅台',       thesis: '高股息防御，品牌护城河稳固，消费复苏首选', market: 'CN' },
  { symbol: '000858', name: '五粮液',         thesis: '消费复苏+估值修复，机构增持白酒龙头', market: 'CN' },
  { symbol: '000568', name: '泸州老窖',       thesis: '高端白酒梯队升级，省外渠道加速铺开', market: 'CN' },
  { symbol: '600809', name: '山西汾酒',       thesis: '清香型全国化扩张，现金流充裕', market: 'CN' },
  { symbol: '300750', name: '宁德时代',       thesis: '锂电龙头产能出清接近尾声，储能第二曲线', market: 'CN' },
  { symbol: '002594', name: '比亚迪',         thesis: '新能源车出海加速，DM-i 5.0换代放量', market: 'CN' },
  { symbol: '300014', name: '亿纬锂能',       thesis: '大圆柱电池量产突破，海外定点订单放量', market: 'CN' },
  { symbol: '688981', name: '中芯国际',       thesis: '先进制程突破，国产替代核心标的', market: 'CN' },
  { symbol: '688041', name: '海光信息',       thesis: '国产CPU+DCU双轮驱动，信创市场独占', market: 'CN' },
  { symbol: '603501', name: '韦尔股份',       thesis: 'CIS芯片需求回暖，汽车摄像头渗透率提升', market: 'CN' },
  { symbol: '603259', name: '药明康德',       thesis: 'CXO龙头，GLP-1多肽产能扩张', market: 'CN' },
  { symbol: '600276', name: '恒瑞医药',       thesis: '创新药管线兑现，PD-1海外授权落地', market: 'CN' },
  { symbol: '300760', name: '迈瑞医疗',       thesis: '医疗器械出海，监护仪/超声全球份额提升', market: 'CN' },
  { symbol: '600036', name: '招商银行',       thesis: '零售之王，资产质量改善+高ROE', market: 'CN' },
  { symbol: '601318', name: '中国平安',       thesis: '保险负债端复苏，综合金融平台价值重估', market: 'CN' },
  { symbol: '300059', name: '东方财富',       thesis: '券商+基金代销双龙头，行情回暖弹性最大', market: 'CN' },
  { symbol: '601012', name: '隆基绿能',       thesis: '光伏BC电池量产，行业出清后龙头溢价', market: 'CN' },
  { symbol: '300274', name: '阳光电源',       thesis: '逆变器+储能全球出货第一，海外毛利率高', market: 'CN' },
  { symbol: '300124', name: '汇川技术',       thesis: '工控自动化进口替代，新能源汽车电驱放量', market: 'CN' },
  { symbol: '000333', name: '美的集团',       thesis: '家电出海KUKA整合完成，暖通空调份额提升', market: 'CN' },
  { symbol: '000651', name: '格力电器',       thesis: '空调龙头高分红，精密制造增量可期', market: 'CN' },
  { symbol: '600887', name: '伊利股份',       thesis: '乳业龙头份额集中，婴配粉+奶酪第二曲线', market: 'CN' },
  { symbol: '601899', name: '紫金矿业',       thesis: '铜金双主线，全球矿业资产并购扩张', market: 'CN' },
  { symbol: '600030', name: '中信证券',       thesis: '投行+资管双引擎，监管打造航母券商', market: 'CN' },
  // ─── 美股 ───
  { symbol: 'NVDA', name: '英伟达',          thesis: 'AI算力需求爆发，Blackwell架构放量', market: 'US' },
  { symbol: 'AMD',  name: 'AMD',             thesis: 'MI300系列超算GPU，抢占推理市场份额', market: 'US' },
  { symbol: 'AVGO', name: '博通',            thesis: 'ASIC定制芯片订单激增，VMware协同', market: 'US' },
  { symbol: 'QCOM', name: '高通',            thesis: '端侧AI推理芯片，深度参与AI PC生态', market: 'US' },
  { symbol: 'MU',   name: '美光',            thesis: 'HBM3e产能满载，AI存储需求刚性', market: 'US' },
  { symbol: 'AAPL', name: '苹果',            thesis: 'Vision Pro 生态扩展，换机周期催化', market: 'US' },
  { symbol: 'MSFT', name: '微软',            thesis: 'Copilot商业化加速，Azure云份额提升', market: 'US' },
  { symbol: 'GOOGL',name: '谷歌',            thesis: 'Gemini大模型全产品线接入，搜索广告稳健', market: 'US' },
  { symbol: 'AMZN', name: '亚马逊',          thesis: 'AWS增长重启+零售利润率改善双轮驱动', market: 'US' },
  { symbol: 'META', name: 'Meta',            thesis: 'Llama开源生态+广告AI推荐效率提升', market: 'US' },
  { symbol: 'TSLA', name: '特斯拉',          thesis: 'FSD V13+Optimus量产预期，储能增速超车', market: 'US' },
  { symbol: 'LLY',  name: '礼来',            thesis: 'GLP-1管线王者，Zepbound放量超预期', market: 'US' },
  { symbol: 'JNJ',  name: '强生',            thesis: '医疗设备+创新药双引擎，稳定分红防御', market: 'US' },
  { symbol: 'MRK',  name: '默沙东',          thesis: 'Keytruda峰值未至，ADC管线接力', market: 'US' },
  { symbol: 'JPM',  name: '摩根大通',        thesis: '净息差受益高利率，投行业务回暖', market: 'US' },
  { symbol: 'BAC',  name: '美国银行',        thesis: '消费者银行业务稳健，利率敏感性最高', market: 'US' },
  { symbol: 'V',    name: 'Visa',            thesis: '全球支付网络垄断，跨境旅行复苏', market: 'US' },
  { symbol: 'MA',   name: '万事达',          thesis: '数字支付龙头，增值服务收入占比提升', market: 'US' },
  { symbol: 'BRK.B',name: '伯克希尔B',       thesis: '多元保险+铁路能源，现金储备创纪录', market: 'US' },
  { symbol: 'NFLX', name: '奈飞',            thesis: '广告分层+密码共享打击，ARPU抬升', market: 'US' },
  { symbol: 'DIS',  name: '迪士尼',          thesis: '乐园利润新高，流媒体扭亏后加速增长', market: 'US' },
  { symbol: 'CRM',  name: 'Salesforce',      thesis: '企业AI Agent平台，Agentforce订单暴增', market: 'US' },
];

const CN_LIST = CANDIDATE_LIST.filter(c => c.market === 'CN');
const US_LIST = CANDIDATE_LIST.filter(c => c.market === 'US');
const CN_SYMBOLS = CN_LIST.map(c => c.symbol);
const US_SYMBOLS = US_LIST.map(c => c.symbol);

const baseA = buildBaseList(CN_LIST, 'CN', 180);
const baseU = buildBaseList(US_LIST, 'US', 500);

export function useCandidates() {
  const [data, setData] = useState<CandidatesData>(() => ({
    aShare: baseA,
    usShare: baseU,
  }));
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [marketEnv, setMarketEnv] = useState<MarketEnv | null>(null);
  const [envSource, setEnvSource] = useState<string>('恐惧贪婪指数');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // 用 ref 缓存市场环境，避免 refresh 每次都依赖最新 env 重建导致循环请求
  const envRef = useRef<MarketEnv | null>(null);
  const srcRef = useRef<string>('恐惧贪婪指数');

  const refresh = useCallback(async (market: Market) => {
    setRefreshing(true);
    try {
      const next: Record<string, LiveQuote> = {};
      if (market === 'CN') {
        const qs = await fetchTencentQuotes(CN_SYMBOLS);
        for (const code of Object.keys(qs)) {
          const q = qs[code];
          if (q.price > 0) next[code] = { price: q.price, changePercent: q.changePercent, source: 'tencent' };
        }
      } else {
        const CHUNK = 6;
        for (let i = 0; i < US_SYMBOLS.length; i += CHUNK) {
          const chunk = US_SYMBOLS.slice(i, i + CHUNK);
          const results = await Promise.allSettled(chunk.map((s) => fetchStockQuote(s, 'US')));
          results.forEach((r, j) => {
            if (r.status === 'fulfilled' && r.value && r.value.price > 0) {
              next[r.value.symbol] = {
                price: r.value.price,
                changePercent: r.value.changePercent,
                source: 'tencent',
              };
            }
          });
        }
      }

      // 恐惧贪婪 → 市场环境（动态：驱动选股环境维度）
      let env: MarketEnv | null = envRef.current;
      let envSrc = srcRef.current;
      try {
        const fg = await fetchFearGreed();
        if (fg && Number.isFinite(fg.value)) {
          env = { temperature: temperatureOf(fg.value), fearGreed: fg.value };
          envSrc = `${fg.classification || '恐惧贪婪指数'} ${fg.value}`;
        }
      } catch { /* 保留旧环境 */ }

      // 用四维选股引擎重算分/组/理由
      const changeMap = toChangeMap(next);
      const cnPicks = runStockPicker({ list: CN_LIST, quotes: changeMap, market: 'CN', env: env ?? undefined }).all;
      const usPicks = runStockPicker({ list: US_LIST, quotes: changeMap, market: 'US', env: env ?? undefined }).all;

      setQuotes(next);
      envRef.current = env;
      srcRef.current = envSrc;
      setMarketEnv(env);
      setEnvSource(envSrc);
      setData((prev) => ({
        aShare: applyPicks(prev.aShare, cnPicks),
        usShare: applyPicks(prev.usShare, usPicks),
      }));
      setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch {
      // 失败保留上次行情，不打断表格
    } finally {
      setRefreshing(false);
    }
  }, []);

  return {
    aShare: data.aShare,
    usShare: data.usShare,
    quotes,
    marketEnv,
    envSource,
    refreshing,
    lastUpdated,
    refresh,
  };
}
