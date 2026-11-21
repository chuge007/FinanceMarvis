import { create } from 'zustand';

export type Market = 'US' | 'CN';
export type ModuleTab =
  | 'map'
  | 'rhythm'
  | 'macro'
  | 'strategy'
  | 'fundflow'
  | 'sentiment'
  | 'discipline'
  | 'portfolio'
  | 'alerts'
  | 'technical'
  | 'rotation'
  | 'papertrading';
export type TimeFrame = '1D' | '5D' | '20D' | '60D';

interface AppState {
  activeTab: ModuleTab;
  timeframe: TimeFrame;
  market: Market;
  selectedSymbol: string | null;
  setTab: (tab: AppState['activeTab']) => void;
  setTimeframe: (tf: TimeFrame) => void;
  setMarket: (m: Market) => void;
  setSelectedSymbol: (symbol: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 默认落在「投资地图」：普通人先要一条路径，而不是 11 张图
  activeTab: 'map',
  timeframe: '1D',
  market: 'US',
  selectedSymbol: null,
  setTab: (tab) => set({ activeTab: tab }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setMarket: (m) => set({ market: m, selectedSymbol: null }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
}));
