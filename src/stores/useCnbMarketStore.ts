import { create } from 'zustand';
import { fetchConvexLatest } from '../services/api';

interface CNMarketState {
  ssci: number;   // CSI 300 Index (沪深300)
  sse: number;    // Shanghai Composite (上证指数)
  szse: number;   // Shenzhen Component (深证成指)
  cn10y: number;  // China 10Y Government Bond Yield
  lastUpdate: string;
  loading: boolean;
  fetchCNData: () => Promise<void>;
}

// ConvexTrade series IDs for CN market indices
const SSEC_SERIES = 'SSEC';     // Shanghai Composite via ConvexTrade
const SZSEC_SERIES = 'SZSEC';   // Shenzhen Component
const CN10Y_SERIES = 'CN10Y';   // China 10Y bond yield

// Yahoo Finance symbols for CN indices
const YH_CSI300 = '000300.SS';  // CSI 300 on Yahoo

export const useCnbMarketStore = create<CNMarketState>((set) => ({
  ssci: 3953.0,
  sse: 3187.5,
  szse: 10823.2,
  cn10y: 1.68,
  lastUpdate: '',
  loading: false,

  fetchCNData: async () => {
    set({ loading: true });
    try {
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });

      // Fetch CSI 300 from Yahoo Finance
      const csi300 = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${YH_CSI300}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
      )
        .then(r => r.json())
        .then(j => j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null)
        .catch(() => null);

      // Fetch SSE Composite from ConvexTrade
      const [sse, cn10y] = await Promise.all([
        fetchConvexLatest(SSEC_SERIES),
        fetchConvexLatest(CN10Y_SERIES),
      ]);

      set({
        ssci: csi300 ?? 3953.0,
        sse: sse ?? 3187.5,
        szse: 10823.2, // SZSE component as fallback/default
        cn10y: cn10y ?? 1.68,
        lastUpdate: timestamp,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));
