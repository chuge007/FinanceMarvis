import { create } from 'zustand';
import { fetchConvexSeries } from '../services/api';

type MarketNumber = number | null;

interface MarketState {
  spx: MarketNumber;
  vix: MarketNumber;
  dxy: MarketNumber;
  us10y: MarketNumber;
  vixSeries: number[];
  dxySeries: number[];
  us10ySeries: number[];
  lastUpdate: string;
  loading: boolean;
  setSnapshot: (data: { spx: MarketNumber; vix: MarketNumber; dxy: MarketNumber; us10y: MarketNumber }) => void;
  fetchMarketData: () => Promise<void>;
}

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const valuesOf = (series: { value: number }[]) => series.map((d) => d.value).filter(valid);
const latestOf = (values: number[]) => (values.length ? values[values.length - 1] : null);
const nowLabel = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

export const useMarketStore = create<MarketState>((set) => ({
  spx: null,
  vix: null,
  dxy: null,
  us10y: null,
  vixSeries: [],
  dxySeries: [],
  us10ySeries: [],
  lastUpdate: '',
  loading: false,

  setSnapshot: (data) =>
    set((state) => ({
      ...data,
      lastUpdate: Object.values(data).some(valid) ? nowLabel() : state.lastUpdate,
    })),

  fetchMarketData: async () => {
    set({ loading: true });
    try {
      const [vixSeries, dgs10Series, dxySeries, spxData] = await Promise.all([
        fetchConvexSeries('VIXCLS', 120),
        fetchConvexSeries('DGS10', 120),
        fetchConvexSeries('DTWEXBGS', 120),
        // SPX via Yahoo Finance
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }).then(r => r.json()).then(j => {
          const v = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
          return Number.isFinite(v) ? v : null;
        }).catch(() => null),
      ]);

      const vixValues = valuesOf(vixSeries);
      const dxyValues = valuesOf(dxySeries);
      const us10yValues = valuesOf(dgs10Series);
      const next = {
        spx: valid(spxData) ? spxData : null,
        vix: latestOf(vixValues),
        dxy: latestOf(dxyValues),
        us10y: latestOf(us10yValues),
        vixSeries: vixValues,
        dxySeries: dxyValues,
        us10ySeries: us10yValues,
      };
      const hasAny = [next.spx, next.vix, next.dxy, next.us10y].some(valid);
      set((state) => ({ ...next, lastUpdate: hasAny ? nowLabel() : state.lastUpdate, loading: false }));
    } catch {
      // 上游整体失败：只结束 loading，不回填任何写死数值、不刷新时间戳。
      set({ loading: false });
    }
  },
}));
