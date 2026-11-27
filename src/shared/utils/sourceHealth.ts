/**
 * 上游数据源健康登记表。
 *
 * 为什么需要：现在每个服务各自 catch 掉失败，UI 上只看到空白，
 * 用户无法区分「今天没数据」「没挂代理」「软件坏了」；同时同一原因会在控制台刷几十条。
 * 这里把「哪个源、什么时候、为什么失败」收敛成一份可订阅的状态，
 * 由 DataHealthBar 统一展示，页面上只保留一处提示。
 */

export type SourceId =
  | 'convex' | 'fred' | 'yahoo' | 'cboe' | 'news' | 'fed' | 'twse'
  | 'eastmoney' | 'tencent' | 'sina' | 'treasury' | 'data-sidecar'
  | 'tushare' | 'fmp' | 'edgar' | 'ccxt' | 'akshare' | 'baostock'
  | 'python-runtime' | 'strategy-runner';

export interface SourceHealth {
  id: SourceId;
  label: string;
  /** null = 还没请求过 */
  ok: boolean | null;
  message: string;
  at: number;
}

const LABELS: Record<SourceId, string> = {
  convex: '宏观序列（ConvexTrade）',
  fred: 'FRED 官方序列',
  yahoo: 'Yahoo 行情/波动率',
  cboe: 'CBOE 期权统计',
  news: '东方财富快讯',
  fed: '美联储官网日历',
  twse: '台股月营收（证交所）',
  eastmoney: '东方财富资金流',
  tencent: '腾讯行业板块',
  sina: '新浪板块',
  treasury: '美国财政部收益率曲线',
  'data-sidecar': 'Python 数据侧车（AkShare / EDGAR / ccxt）',
  tushare: 'Tushare Pro（A 股财务主源）',
  fmp: 'FMP（美股 EOD 高价值标的）',
  edgar: 'SEC EDGAR（美股财报一手）',
  ccxt: 'ccxt（加密交易所行情）',
  akshare: 'AkShare（龙虎榜 / 基金净值备源）',
  baostock: 'baostock（A 股 K 线备源）',
  'python-runtime': 'Python 3.11+ 运行时',
  'strategy-runner': '本地回测 / 绩效计算',
};

const state = new Map<SourceId, SourceHealth>();
const listeners = new Set<() => void>();
let version = 0;
let cachedSnapshot: SourceHealth[] = [];

function emit() {
  version += 1;
  cachedSnapshot = [...state.values()].sort((a, b) => a.id.localeCompare(b.id));
  listeners.forEach((fn) => fn());
}

/** 记录一次请求结果；相同状态重复上报不会触发重渲染。 */
export function reportSource(id: SourceId, ok: boolean, message = ''): void {
  const prev = state.get(id);
  if (prev && prev.ok === ok && prev.message === message) {
    state.set(id, { ...prev, at: Date.now() });
    return;
  }
  state.set(id, {
    id,
    label: LABELS[id],
    ok,
    message,
    at: Date.now(),
  });
  emit();
}

export function sourceHealthSnapshot(): SourceHealth[] {
  if (!cachedSnapshot.length && state.size) {
    cachedSnapshot = [...state.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  return cachedSnapshot;
}

export function subscribeSourceHealth(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function sourceHealthVersion(): number {
  return version;
}
