import { create } from 'zustand';
import { fetchConvexLatest } from '../services/api';

interface MarketState {
  spx: number;
  vix: number;
  dxy: number;
  us10y: number;
  lastUpdate: string;
  loading: boolean;
  setSnapshot: (data: { spx: number; vix: number; dxy: number; us10y: number }) => void;
  fetchMarketData: () => Promise<void>;
}

export const useMarketStore = create<MarketState>((set) => ({
  spx: 5804.25,
  vix: 15.32,
  dxy: 104.18,
  us10y: 4.32,
  lastUpdate: '',
  loading: false,

  setSnapshot: (data) =>
    set({
      ...data,
      lastUpdate: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }),

  fetchMarketData: async () => {
    set({ loading: true });
    try {
      const [vix, dgs10, dxy, spxData] = await Promise.all([
        fetchConvexLatest('VIXCLS'),
        fetchConvexLatest('DGS10'),
        fetchConvexLatest('DTWEXBGS'),
        // SPX via Yahoo Finance
        fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }).then(r => r.json()).then(j => j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null).catch(() => null),
      ]);

      set({
        spx: spxData ?? 5804.25,
        vix: vix ?? 15.32,
        dxy: dxy ?? 104.18,
        us10y: dgs10 ?? 4.32,
        lastUpdate: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
