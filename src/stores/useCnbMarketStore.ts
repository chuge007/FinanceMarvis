import { create } from 'zustand';
import { fetchConvexSeries } from '../services/api';

type MarketNumber = number | null;

interface CNMarketState {
  ssci: MarketNumber;   // CSI 300 Index (沪深300)
  sse: MarketNumber;    // Shanghai Composite (上证指数)
  szse: MarketNumber;   // Shenzhen Component (深证成指)
  cn10y: MarketNumber;  // China 10Y Government Bond Yield
  ssciSeries: number[];
  sseSeries: number[];
  szseSeries: number[];
  cn10ySeries: number[];
  lastUpdate: string;
  loading: boolean;
  fetchCNData: () => Promise<void>;
}

// ConvexTrade series IDs for CN market indices
const CSI300_SERIES = 'CSI300';    // 沪深300，优先使用真实序列
const SSEC_SERIES = 'SSEC';        // 上证指数
const SZSEC_SERIES = 'SZSEC';      // 深证成指（此前定义但未使用）
const CN10Y_SERIES = 'CN10Y';      // 中国10年国债收益率

// Yahoo fallback symbol
const YH_CSI300 = '000300.SS';

// 经同域 /yahoo 代理（生产由 server/proxy.mjs 转发），避免浏览器直连被 CORS/449 拦截。
const YAHOO_BASE = import.meta.env.VITE_UPSTREAM === 'direct'
  ? 'https://query1.finance.yahoo.com'
  : '/yahoo';

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const valuesOf = (series: { value: number }[]) => series.map((d) => d.value).filter(valid);
const latestOf = (values: number[]) => (values.length ? values[values.length - 1] : null);
const nowLabel = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

export const useCnbMarketStore = create<CNMarketState>((set) => ({
  ssci: null,
  sse: null,
  szse: null,
  cn10y: null,
  ssciSeries: [],
  sseSeries: [],
  szseSeries: [],
  cn10ySeries: [],
  lastUpdate: '',
  loading: false,

  fetchCNData: async () => {
    set({ loading: true });
    try {
      const [csi300Series, sseSeries, szseSeries, cn10ySeries] = await Promise.all([
        fetchConvexSeries(CSI300_SERIES, 120),
        fetchConvexSeries(SSEC_SERIES, 120),
        fetchConvexSeries(SZSEC_SERIES, 120),
        fetchConvexSeries(CN10Y_SERIES, 120),
      ]);

      let ssciValues = valuesOf(csi300Series);
      if (!ssciValues.length) {
        // ConvexTrade 无沪深300时再用 Yahoo 兜底，取不到就是 null。
        const yahoo = await fetch(
          `${YAHOO_BASE}/v8/finance/chart/${YH_CSI300}?interval=1d&range=5d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        ).then(r => r.json()).catch(() => null);
        const price = Number(yahoo?.chart?.result?.[0]?.meta?.regularMarketPrice);
        if (Number.isFinite(price)) ssciValues = [price];
      }

      const next = {
        ssci: latestOf(ssciValues),
        sse: latestOf(valuesOf(sseSeries)),
        szse: latestOf(valuesOf(szseSeries)),
        cn10y: latestOf(valuesOf(cn10ySeries)),
        ssciSeries: ssciValues,
        sseSeries: valuesOf(sseSeries),
        szseSeries: valuesOf(szseSeries),
        cn10ySeries: valuesOf(cn10ySeries),
      };
      const hasAny = [next.ssci, next.sse, next.szse, next.cn10y].some(valid);
      set((state) => ({ ...next, lastUpdate: hasAny ? nowLabel() : state.lastUpdate, loading: false }));
    } catch {
      set({ loading: false });
    }
  },
}));
