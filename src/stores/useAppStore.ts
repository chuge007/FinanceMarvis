import { create } from 'zustand';

export type Market = 'US' | 'CN';
export type PrimaryTab = 'home' | 'research' | 'decide' | 'archive';

/** 保留旧页面 id，避免已存在的组件在迁移期编译失败；新导航只暴露 4 个入口。 */
export type ModuleTab =
  | PrimaryTab
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

const GROUP: Record<ModuleTab, PrimaryTab> = {
  home: 'home',
  research: 'research',
  decide: 'decide',
  archive: 'archive',
  brief: 'home',
  rhythm: 'home',
  map: 'decide',
  discipline: 'decide',
  portfolio: 'decide',
  alerts: 'decide',
  strategy: 'decide',
  macro: 'research',
  sentiment: 'research',
  fundflow: 'research',
  technical: 'research',
  rotation: 'research',
};

export function groupOf(tab: ModuleTab): PrimaryTab {
  return GROUP[tab] ?? 'home';
}

interface AppState {
  activeTab: ModuleTab;
  timeframe: TimeFrame;
  market: Market;
  selectedSymbol: string | null;
  setTab: (tab: ModuleTab) => void;
  setTimeframe: (tf: TimeFrame) => void;
  setMarket: (m: Market) => void;
  setSelectedSymbol: (symbol: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 打开即进入今日地图；未完成配置时由地图页顶部横幅引导去配置。
  activeTab: 'home',
  timeframe: '1D',
  market: 'US',
  selectedSymbol: null,
  setTab: (tab) => set({ activeTab: tab }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setMarket: (m) => set({ market: m, selectedSymbol: null }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
}));
