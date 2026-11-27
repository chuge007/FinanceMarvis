import { create } from 'zustand';

export type Market = 'US' | 'CN';
/** 五个一级入口：今日（结论）→ 地形（位置）→ 研究（结构）→ 决策（动作）→ 档案（血缘）。 */
export type PrimaryTab = 'today' | 'radar' | 'terminal' | 'home' | 'research' | 'research-lab' | 'calendar' | 'decide' | 'portfolio' | 'catalog' | 'universe' | 'strategy-lab' | 'archive';

/** 保留旧页面 id，避免已存在的组件在迁移期编译失败；新导航只暴露五个入口。 */
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
  today: 'today',
  radar: 'radar',
  terminal: 'terminal',
  home: 'home',
  research: 'research',
  'research-lab': 'research-lab',
  calendar: 'calendar',
  decide: 'decide',
  portfolio: 'portfolio',
  catalog: 'catalog',
  universe: 'universe',
  'strategy-lab': 'strategy-lab',
  archive: 'archive',
  brief: 'today',
  rhythm: 'home',
  map: 'decide',
  discipline: 'decide',
  alerts: 'decide',
  strategy: 'decide',
  macro: 'research',
  sentiment: 'research',
  fundflow: 'research',
  technical: 'research',
  rotation: 'research',
};

export function groupOf(tab: ModuleTab): PrimaryTab {
  return GROUP[tab] ?? 'today';
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
  // 打开先回答「今天要不要动」，再决定是否下钻到地形与研究。
  activeTab: 'today',
  timeframe: '1D',
  market: 'US',
  selectedSymbol: null,
  setTab: (tab) => set({ activeTab: tab }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setMarket: (m) => set({ market: m, selectedSymbol: null }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
}));
