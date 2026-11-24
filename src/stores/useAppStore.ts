import { create } from 'zustand';
import { readJSON } from '../shared/utils/localStore';

export type Market = 'US' | 'CN';
export type ModuleTab =
  | 'brief'
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
  | 'rotation';
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

const returningUser = readJSON<{ acknowledged?: boolean } | null>('marvis.profile.v1', null)?.acknowledged === true;

export const useAppStore = create<AppState>((set) => ({
  // 新用户先走投资地图；已确认风险揭示的老用户直接落在每日作战简报。
  activeTab: returningUser ? 'brief' : 'map',
  timeframe: '1D',
  market: 'US',
  selectedSymbol: null,
  setTab: (tab) => set({ activeTab: tab }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setMarket: (m) => set({ market: m, selectedSymbol: null }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
}));
