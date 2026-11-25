/**
 * 资金流分析 API - 真实数据 + 结构化模拟
 * 支持 US/CN 市场分离
 * CN: 东财真实板块资金流 + 全市场资金全景 + 涨跌家数（真实）
 * US: 结构化模拟（美股无北向资金概念）
 */
import axios from 'axios';
import { fetchConvexLatest } from './api';
import { fetchTencentSectorFlows } from './tencentSector';
import { fetchSinaSectorFlows } from './sinaSector';
import { getMarketState } from '../shared/utils/marketHours';
import type {
  SectorFlow,
  FundFlowOverview,
  MoneyFlowData,
  MarketCapitalOverview,
  CapitalTrendPoint,
  USFlowDynamicsData,
  USForceSplit,
  USMomentum,
} from '../types/fundflow';
import type { Market } from '../stores/useAppStore';

// ─── 东方财富行情 API（CORS 放行，同一指标 30s 内存缓存，防多 Hook 并发浪费） ───
const emApi = axios.create({
  baseURL: 'https://push2.eastmoney.com/api/qt',
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' },
});
const EM_TTL = 30_000;
const emCache = new Map<string, { ts: number; data: any }>();
async function emGet<T>(key: string, path: string, params: Record<string, any>): Promise<T | null> {
  const hit = emCache.get(key);
  if (hit && Date.now() - hit.ts < EM_TTL) return hit.data as T;
  try {
    const { data } = await emApi.get(path, { params });
    emCache.set(key, { ts: Date.now(), data });
    return data as T;
  } catch {
    return null;
  }
}

/** 板块名 → 固定颜色（server 侧不确定随机） */
function colorOf(name: string): string {
  const palette = ['#4078ff', '#0ca678', '#f59e4b', '#9b6efb', '#e8590c', '#20c4d8', '#ff922b', '#f04452', '#38d9a9', '#748ffc', '#da77f2', '#12b886', '#fab005', '#e64980'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ─── 基于 CRAI 的确定性伪随机（避免闭市时 Math.random() 漂移）───
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function todaySeed(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// ─── 美股板块 ───
// growth=true 成长/进攻板块，风险偏好(bias)升高时资金偏好流入；false 防御板块，risk-off 时获青睐
const US_SECTORS = [
  { id: 'tech', name: 'Technology', color: '#4078ff', weight: 0.30, cn: '信息技术', growth: true },
  { id: 'finance', name: 'Financials', color: '#0ca678', weight: 0.12, cn: '金融', growth: false },
  { id: 'health', name: 'Healthcare', color: '#f59e4b', weight: 0.11, cn: '医疗健康', growth: false },
  { id: 'cons_disc', name: 'Consumer Disc.', color: '#9b6efb', weight: 0.10, cn: '可选消费', growth: true },
  { id: 'industrials', name: 'Industrials', color: '#e8590c', weight: 0.08, cn: '工业', growth: false },
  { id: 'comm', name: 'Communication', color: '#20c4d8', weight: 0.09, cn: '通信服务', growth: true },
  { id: 'cons_stap', name: 'Consumer Staples', color: '#ff922b', weight: 0.06, cn: '必需消费', growth: false },
  { id: 'energy', name: 'Energy', color: '#f04452', weight: 0.04, cn: '能源', growth: false },
  { id: 'materials', name: 'Materials', color: '#38d9a9', weight: 0.03, cn: '原材料', growth: false },
  { id: 'utilities', name: 'Utilities', color: '#748ffc', weight: 0.03, cn: '公用事业', growth: false },
  { id: 'realestate', name: 'Real Estate', color: '#da77f2', weight: 0.04, cn: '房地产', growth: false },
];

// ─── 东财真实数据源：板块资金流 ───
interface EMClistItem {
  f12?: string;
  f14?: string;
  f3?: number | null;
  f62?: number | null;   // 主力净流入（元）
  f66?: number | null;   // 超大单净流入（元）
  f69?: number | null;   // 超大单净占比 %
  f72?: number | null;   // 大单净流入（元）
  f75?: number | null;   // 大单净占比 %
  f78?: number | null;   // 中单净流入（元）
  f84?: number | null;   // 小单净流入（元）
  f184?: number | null;  // 主力净占比 %
  f6?: number | null;    // 成交额（元）
}
const YI = 1e8;

async function fetchEastmoneySectorList(): Promise<EMClistItem[]> {
  const resp = await emGet<{ data?: { diff?: EMClistItem[] } }>(
    'sector_clist',
    '/clist/get',
    {
      pn: 1, pz: 100, po: 1, np: 1, fltt: 2, invt: 2, fid: 'f62',
      fs: 'm:90+t:2+f:!50',
      fields: 'f12,f14,f3,f62,f66,f69,f72,f75,f78,f84,f184,f6',
    },
  );
  return resp?.data?.diff ?? [];
}

/** CN 板块资金流（真实）：按主力净流入排序，含多口径净额/占比/成交额 */
function buildCNSectorFlows(items: EMClistItem[]): SectorFlow[] {
  const flows: SectorFlow[] = items.map((it) => {
    const name = it.f14 ?? '未知';
    const netFlow = (it.f62 ?? 0) / YI;
    const pctChg = it.f3 ?? 0;
    return {
      id: it.f12 ?? name,
      name,
      color: colorOf(name),
      netFlow: +netFlow.toFixed(2),
      pctChg: +pctChg.toFixed(2),
      mainRatio: it.f184 ?? 0,
      superLarge: +((it.f66 ?? 0) / YI).toFixed(2),
      large: +((it.f72 ?? 0) / YI).toFixed(2),
      medium: +((it.f78 ?? 0) / YI).toFixed(2),
      small: +((it.f84 ?? 0) / YI).toFixed(2),
      source: 'eastmoney',
      reading: eastmoneySectorReading(netFlow),
    };
  });
  // 主力净流入为正的在前（资金流入板块），负的在后（资金流出板块）
  return flows.sort((a, b) => b.netFlow - a.netFlow);
}

function eastmoneySectorReading(netFlow: number): string {
  const signed = `${netFlow >= 0 ? '净流入' : '净流出'} ${Math.abs(netFlow).toFixed(1)} 亿`;
  if (netFlow > 50) return `${signed}，主力大举做多，板块领涨，趋势强势`;
  if (netFlow > 10) return `${signed}，资金明显回流，动能向上`;
  if (netFlow >= -10) return `${signed}，资金面平衡，方向未明，关注量能变化`;
  if (netFlow >= -50) return `${signed}，资金离场，反弹力度不足，偏弱运行`;
  return `${signed}，主力大幅撤离，趋势走弱，规避追高`;
}

/** US 板块资金流细化解读（分口径 + 动量方向） */
function usSectorReading(name: string, netFlow: number, inst: number, hedge: number, momentum: USMomentum): string {
  const dir = netFlow >= 0 ? '净流入' : '净流出';
  const mText: Record<USMomentum, string> = {
    inflow_boost: '资金加速涌入，动量向上，趋势延续性好',
    inflow_slow: '资金小幅回流，动量温和，观望跟进',
    balanced: '多空平衡，方向未明，等信号',
    outflow: '资金持续离场，趋势转弱，规避追高',
  };
  return `${name} ${dir} $${Math.abs(Math.round(netFlow))}M，机构净 $${Math.round(inst)}M + 对冲净 $${Math.round(hedge)}M，${mText[momentum]}`;
}

/** US 板块资金流（模型细化版）：分机构/对冲/散户口径 + 资金强度 + 动量方向
 *  bias: 市场风险偏好（CRAI），>0.5 偏 risk-on（成长领跑），<0.5 偏 risk-off（防御吸金）
 */
function buildUSModelFlows(bias: number, rng: () => number): SectorFlow[] {
  const totalFlow = 1500 + bias * 1200; // $M：情绪越热，资金池越大
  const totalWeight = US_SECTORS.reduce((s, sec) => s + sec.weight, 0);
  // risk-on 时成长板块 share 放大，risk-off 时防御板块拿到更多份额
  const growthFactor = (sec: { growth: boolean }) => (sec.growth ? 0.55 + bias : 1.45 - bias);
  const shareAll = US_SECTORS.reduce((s, sec) => s + (sec.weight / totalWeight) * growthFactor(sec), 0);

  return US_SECTORS.map((sec) => {
    const share = ((sec.weight / totalWeight) * growthFactor(sec)) / shareAll;
    const netFlow = totalFlow * share * (0.75 + rng() * 0.5);
    const pctChg = (rng() * 6 - 2) * (netFlow > 0 ? 1.15 : 0.6) * (0.7 + bias * 0.6);
    // 强度：净额规模 + 涨跌配合 + 噪声
    const strength = Math.max(15, Math.min(100, 26 + Math.abs(netFlow) / 16 + (pctChg > 0 ? 10 : -12) + (rng() - 0.5) * 16));
    // 分口径：机构 52%~67%，对冲 25%~42%，散户补足
    const instShare = 0.52 + rng() * 0.15;
    const hedgeShare = 0.25 + rng() * 0.17;
    const institution = netFlow * instShare;
    const hedge = netFlow * Math.min(hedgeShare, 1 - instShare - 0.05);
    const retail = netFlow - institution - hedge;
    const momentum: USMomentum =
      pctChg > 2.2 && netFlow > 0 ? 'inflow_boost'
      : netFlow > 0 ? (rng() > 0.5 ? 'inflow_boost' : 'inflow_slow')
      : netFlow < -25 ? 'outflow'
      : 'balanced';
    return {
      id: sec.id,
      name: sec.name,
      color: sec.color,
      netFlow: Math.round(netFlow),
      pctChg: +pctChg.toFixed(2),
      source: 'model' as const,
      usInstitution: Math.round(institution),
      usHedge: Math.round(hedge),
      usRetail: Math.round(retail),
      usStrength: +strength.toFixed(0),
      usMomentum: momentum,
      usShare: +share.toFixed(3),
      reading: usSectorReading(sec.name, netFlow, institution, hedge, momentum),
    };
  }).sort((a, b) => b.netFlow - a.netFlow);
}

/** US 美股资金流日内动态：模拟开盘→收盘 13 个时段，各板块当日累计净流入演变 */
export async function fetchUSFlowDynamics(): Promise<USFlowDynamicsData | null> {
  const { flows } = await fetchSectorFlows('US');
  const endMap = new Map(flows.map((f) => [f.id, f.netFlow]));
  const rng = seededRandom(todaySeed() * 29);
  const track = ['tech', 'finance', 'cons_disc', 'comm', 'health', 'industrials', 'energy', 'utilities'];

  const times: string[] = [];
  const t0 = 9 * 60 + 30; // 09:30 开盘
  for (let i = 0; i <= 13; i++) {
    const m = t0 + i * 30;
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }

  const points = times.map((time, i) => {
    const p = i / (times.length - 1);
    const values: Record<string, number> = {};
    for (const id of track) {
      const end = endMap.get(id) ?? 0;
      // 日内资金曲线：开盘冲量 + 午盘消化 + 尾盘定盘（前倾加速形状），叠加小幅噪声
      const shape = Math.pow(p, 0.85 + rng() * 0.35);
      const noise = (rng() - 0.5) * Math.abs(end) * 0.18;
      values[id] = Math.round(end * shape + noise);
    }
    return { time, values };
  });

  const ranked = [...flows].sort((a, b) => b.netFlow - a.netFlow);
  const lead = ranked[0];
  const sec = ranked[1];
  const rotation = lead && sec
    ? `资金正由 ${sec.name}（净 $${Math.round(sec.netFlow)}M）轮动向 ${lead.name}（净 $${Math.round(lead.netFlow)}M），${lead.usMomentum === 'inflow_boost' ? '领涨板块资金加速，趋势最顺' : '领涨板块资金温和，需防冲高回落'}`
    : '板块资金分布均衡，等待方向选择';

  const splits: Record<string, USForceSplit> = {};
  for (const f of flows.slice(0, 5)) {
    splits[f.id] = { institution: f.usInstitution ?? 0, hedge: f.usHedge ?? 0, retail: f.usRetail ?? 0 };
  }

  return {
    points,
    rotation,
    leadSector: lead?.id ?? 'tech',
    tailSector: ranked[ranked.length - 1]?.id ?? 'utilities',
    splits,
  };
}

// ─── 东财真实数据源：全市场涨跌家数 ───
async function fetchEastmoneyBreadth(): Promise<{ up: number; down: number; flat: number } | null> {
  const resp = await emGet<{ data?: { diff?: { f104?: number; f105?: number; f106?: number }[] } }>(
    'breadth',
    '/ulist.np/get',
    { fltt: 2, secids: '1.000001,0.399001', fields: 'f104,f105,f106' },
  );
  const diff = resp?.data?.diff ?? [];
  return {
    up: diff.reduce((s, d) => s + (d.f104 ?? 0), 0),
    down: diff.reduce((s, d) => s + (d.f105 ?? 0), 0),
    flat: diff.reduce((s, d) => s + (d.f106 ?? 0), 0),
  };
}

/** 腾讯行业榜 → 全市场资金全景：只有板块主力合计与板块涨跌数，家数/分单口径不可用。 */
function buildTencentOverview(flows: SectorFlow[]): MarketCapitalOverview {
  const totalMain = flows.reduce((sum, f) => sum + f.netFlow, 0);
  const sectorUp = flows.filter((f) => f.pctChg > 0).length;
  const sectorDown = flows.filter((f) => f.pctChg < 0).length;
  const sectorFlat = flows.length - sectorUp - sectorDown;
  const trend: 'up' | 'down' | 'flat' = totalMain > 1000 ? 'up' : totalMain < -500 ? 'down' : 'flat';
  return {
    totalMain: +totalMain.toFixed(1),
    superLarge: 0,
    large: 0,
    medium: 0,
    small: 0,
    totalAmount: 0,
    mainRatio: 0,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
    source: 'tencent',
    breadthBasis: 'sector',
    sectorUp,
    sectorDown,
    trend,
    reading: `腾讯 ${flows.length} 个行业：${sectorUp} 涨、${sectorDown} 跌、${sectorFlat} 平，主力净流入合计 ${totalMain.toFixed(0)} 亿。东财不可达，超大/大/中/小单与股票涨跌家数不可用。`,
  };
}

/** 新浪板块 → 全市场资金全景：只有价格口径，主力净流入记为不可用。 */
function buildSinaOverview(flows: SectorFlow[]): MarketCapitalOverview {
  const sectorUp = flows.filter((f) => f.pctChg > 0).length;
  const sectorDown = flows.filter((f) => f.pctChg < 0).length;
  const sectorFlat = flows.length - sectorUp - sectorDown;
  return {
    totalMain: 0,
    superLarge: 0,
    large: 0,
    medium: 0,
    small: 0,
    totalAmount: 0,
    mainRatio: 0,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
    source: 'sina',
    breadthBasis: 'sector',
    sectorUp,
    sectorDown,
    trend: 'flat',
    reading: `新浪 ${flows.length} 个板块：${sectorUp} 涨、${sectorDown} 跌、${sectorFlat} 平。东财与腾讯均不可达，本页只有价格口径，主力净流入不可用。`,
  };
}

// ─── CN 全市场资金全景（真实：板块汇总 + 涨跌家数） ───
export async function fetchMarketCapitalOverview(market: Market = 'CN'): Promise<MarketCapitalOverview | null> {
  // CN：东财板块汇总 = 全市场主力净流入近似；涨跌家数为真实
  if (market === 'CN') {
    const items = await fetchEastmoneySectorList();
    if (!items.length) {
      const tencent = await fetchTencentSectorFlows();
      if (tencent.length) return buildTencentOverview(tencent);
      const sina = await fetchSinaSectorFlows();
      if (sina.length) return buildSinaOverview(sina);
      return null;
    }
    const sum = (get: (it: EMClistItem) => number | null | undefined) => items.reduce((s, it) => s + (get(it) ?? 0), 0);
    const totalMain = sum((it) => it.f62) / YI;
    const superLarge = sum((it) => it.f66) / YI;
    const large = sum((it) => it.f72) / YI;
    const medium = sum((it) => it.f78) / YI;
    const small = sum((it) => it.f84) / YI;
    const totalAmount = sum((it) => it.f6) / YI;
    const breadth = await fetchEastmoneyBreadth();
    const mainRatio = totalAmount > 0 ? (totalMain / totalAmount) * 100 : 0;
    const trend: 'up' | 'down' | 'flat' = totalMain > 1000 ? 'up' : totalMain < -500 ? 'down' : 'flat';
    const reading =
      trend === 'up'
        ? `全市场主力净流入 ${totalMain.toFixed(0)} 亿，做多动能强，资金集中在 ${topSectors(items).join('、')} 等板块，量价配合，趋势向上`
        : trend === 'down'
        ? `全市场主力净流出 ${Math.abs(totalMain).toFixed(0)} 亿，风险偏好收缩，资金流出 ${bottomSectors(items).join('、')} 等板块，弱势格局，控制仓位`
        : `全市场主力净额 ${totalMain.toFixed(0)} 亿，多空拉锯，指数窄幅震荡，等待方向选择`;
    return {
      totalMain: +totalMain.toFixed(1),
      superLarge: +superLarge.toFixed(1),
      large: +large.toFixed(1),
      medium: +medium.toFixed(1),
      small: +small.toFixed(1),
      totalAmount: +totalAmount.toFixed(0),
      mainRatio: +mainRatio.toFixed(2),
      upCount: breadth?.up ?? 0,
      downCount: breadth?.down ?? 0,
      flatCount: breadth?.flat ?? 0,
      source: 'eastmoney',
      trend,
      reading,
    };
  }

  // US：模型（美股无北向）
  const crai = await fetchConvexLatest('CONVEX_CRAI');
  const rng = seededRandom(todaySeed() * 7);
  const instVal = -200 + rng() * 600;
  const retailVal = -150 + rng() * 300;
  const hedgeFundVal = (crai ?? 0.3) > 0.4 ? 500 + rng() * 400 : -200 + rng() * 300;
  const totalMain = instVal + hedgeFundVal;
  return {
    totalMain: Math.round(totalMain),
    superLarge: 0,
    large: Math.round(instVal),
    medium: 0,
    small: Math.round(retailVal),
    totalAmount: 0,
    mainRatio: 0,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
    source: 'model',
    trend: totalMain > 400 ? 'up' : totalMain < -200 ? 'down' : 'flat',
    reading: `美股资金流向（模型估算）：机构净 $${Math.round(instVal)}M，对冲基金净 $${Math.round(hedgeFundVal)}M，散户净 $${Math.round(retailVal)}M，关注科技 vs 防御板块切换`,
  };
}

function topSectors(items: EMClistItem[], n = 3): string[] {
  return items.filter((it) => (it.f62 ?? 0) > 0).sort((a, b) => (b.f62 ?? 0) - (a.f62 ?? 0)).slice(0, n).map((it) => it.f14 ?? '').filter(Boolean);
}
function bottomSectors(items: EMClistItem[], n = 3): string[] {
  return items.filter((it) => (it.f62 ?? 0) < 0).sort((a, b) => (a.f62 ?? 0) - (b.f62 ?? 0)).slice(0, n).map((it) => it.f14 ?? '').filter(Boolean);
}

// ─── 板块资金流 ───
export async function fetchSectorFlows(market: Market = 'US'): Promise<{ flows: SectorFlow[]; marketState: ReturnType<typeof getMarketState> }> {
  const marketState = getMarketState();
  if (market === 'CN') {
    const items = await fetchEastmoneySectorList();
    if (items.length) return { flows: buildCNSectorFlows(items), marketState };
    // 东财被网络重置时，用腾讯行业榜（含 5/20/60 日与主力净流入），再退新浪（仅价格）。
    const tencent = await fetchTencentSectorFlows();
    if (tencent.length) return { flows: tencent, marketState };
    const sina = await fetchSinaSectorFlows();
    if (sina.length) return { flows: sina, marketState };
    console.log('[fundflow] 东财/腾讯/新浪板块均不可用，CN 资金流显示不可用');
    return { flows: [], marketState };
  }
  const crai = await fetchConvexLatest('CONVEX_CRAI');
  const bias = crai ?? 0.3;
  const rng = seededRandom(todaySeed() * 13);
  return { flows: buildUSModelFlows(bias, rng), marketState };
}

// ─── 资金流全景 ───
export async function fetchFundFlowOverview(market: Market = 'US'): Promise<FundFlowOverview> {
  const overview = await fetchMarketCapitalOverview(market);
  if (
    market === 'CN' &&
    overview &&
    (overview.source === 'eastmoney' || overview.source === 'tencent' || overview.source === 'sina')
  ) {
    // 北向资金自 2024-09 起沪深港通改披露口径，不再实时公开，此处如实标注
    return {
      totalNetFlow: Math.round(overview.totalMain),
      northBoundFlow: 0,
      institutionalFlow: Math.round((overview.superLarge ?? 0) + (overview.large ?? 0)),
      retailFlow: Math.round(overview.small ?? 0),
      marginBalance: 0,
      reading: `${overview.reading}。注：北向资金实时数据已停止公开披露（沪深港通调整口径），本页采用板块主力口径。`,
    };
  }

  // ─── 美股：无北向资金概念，用板块轮动 + 对冲基金仓位替代 ───
  const crai = await fetchConvexLatest('CONVEX_CRAI');
  const rng = seededRandom(todaySeed() * 7);
  const instVal = -200 + rng() * 600;
  const retailVal = -150 + rng() * 300;
  const hedgeFundVal = (crai ?? 0.3) > 0.4 ? 500 + rng() * 400 : -200 + rng() * 300;
  const marginVal = 15200 + rng() * 800;
  return {
    totalNetFlow: Math.round(instVal + retailVal + hedgeFundVal),
    northBoundFlow: 0, // 美股不存在北向资金概念
    institutionalFlow: Math.round(instVal),
    retailFlow: Math.round(retailVal),
    marginBalance: Math.round(marginVal),
    reading: (crai ?? 0.3) > 0.5
      ? `美股资金面偏暖，机构净流入 $${Math.round(instVal)}M，对冲基金仓位提升，板块轮动积极`
      : `美股资金流向分化，总净额 $${Math.round(instVal + retailVal + hedgeFundVal)}M，关注科技vs防御板块切换`,
  };
}

// ─── 大盘资金流时序（CN：当日真实锚定 + 历史估算，US：模型） ───
export async function fetchMoneyFlow(market: Market = 'US'): Promise<MoneyFlowData> {
  const rng = seededRandom(todaySeed() * 17);
  const days = 30;
  const scale = market === 'CN' ? 0.4 : 1.0;

  // CN 当日真实锚定点（主力净流入）
  const overview = market === 'CN' ? await fetchMarketCapitalOverview('CN') : null;
  const latestMain = overview?.totalMain ?? null;

  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    const dd = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    const base = Math.sin(i / days * Math.PI) * 3 * scale;
    let main = (800 + base * 200 + rng() * 400) * scale;
    // 最后一个交易日用真实当日主力净流入锚定（CN 真实数据）
    if (i === days - 1 && latestMain != null) main = latestMain;
    return {
      date: dd,
      north: 0,                                     // 北向已停披露，置 0
      institution: Math.round(main),                // 主力口径
      retail: Math.round((-200 + rng() * 300 - base * 100) * scale),
      total: 0,
    };
  });
  series.forEach((s) => {
    s.total = Math.round(s.institution + s.retail);
  });

  const latest = series[series.length - 1];
  const isCN = market === 'CN';
  return {
    series,
    summary: {
      north5d: 0,
      institution5d: Math.round(series.slice(-5).reduce((a, b) => a + b.institution, 0) / 5),
      retail5d: Math.round(series.slice(-5).reduce((a, b) => a + b.retail, 0) / 5),
      trend: latest.total > 500 * scale ? 'up' : latest.total < -300 * scale ? 'down' : 'flat',
    },
    reading: isCN
      ? latestMain != null
        ? `当日全市场主力净流入 ${latestMain.toFixed(0)} 亿（真实数据），近5日均值 ${series.slice(-5).reduce((a, b) => a + b.institution, 0) / 5 | 0} 亿，${latest.institution > 0 ? '资金趋势向上' : '资金趋势走弱'}。历史区间为模型估算曲线，当日以真实数据锚定。`
        : '资金面平稳，等待方向选择'
      : latest.total > 1000 * scale
      ? '近5日资金净流入明显，多方占据主动'
      : latest.total < -500 * scale
      ? '资金持续流出，短期偏谨慎'
      : '资金面平稳，等待方向选择',
  };
}

// ─── 大盘资金流趋势（供图形化：CN 真实锚定 + 30日点） ───
export async function fetchCapitalTrend(market: Market = 'CN'): Promise<CapitalTrendPoint[] | null> {
  if (market !== 'CN') return null;
  const overview = await fetchMarketCapitalOverview('CN');
  if (!overview) return null;
  // 构造趋势序列：历史用模型，最新日以真实值锚定
  const rng = seededRandom(todaySeed() * 23);
  const days = 30;
  const points: CapitalTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const base = Math.sin(i / days * Math.PI) * 0.6 + (rng() - 0.5) * 0.8;
    if (i === days - 1) {
      points.push({ date, main: +overview.totalMain.toFixed(1), superLarge: +overview.superLarge.toFixed(1), medium: +overview.medium.toFixed(1), small: +overview.small.toFixed(1) });
    } else {
      const main = (overview.totalMain) * (0.4 + base);
      points.push({
        date,
        main: +main.toFixed(1),
        superLarge: +(main * 0.65).toFixed(1),
        medium: +(-main * 0.4).toFixed(1),
        small: +(-main * 0.6).toFixed(1),
      });
    }
  }
  return points;
}
