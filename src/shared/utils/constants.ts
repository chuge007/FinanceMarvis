import type { ModuleTab } from '../../stores/useAppStore';

export type TabGroup = 'core' | 'advanced';

export interface TabDef {
  id: ModuleTab;
  name: string;
  icon: string;
  group: TabGroup;
  desc: string;
}

/** 导航分两层：core 是普通人走的路径，advanced 是专业工具。
 *  两层都在顶栏平铺展示，每项带一行副标题；窄屏可横向滚动。 */
export const TABS: TabDef[] = [
  { id: 'brief', name: '作战简报', icon: '◉', group: 'core', desc: '盘前30秒读完市场' },
  { id: 'map', name: '投资地图', icon: '◎', group: 'core', desc: '先安排钱，再谈投资' },
  { id: 'rhythm', name: '节奏总览', icon: '◐', group: 'core', desc: '今天的风险环境' },
  { id: 'discipline', name: '纪律复盘', icon: '✓', group: 'core', desc: '仓位、清单、复盘' },
  { id: 'portfolio', name: '持仓跟踪', icon: '▤', group: 'core', desc: '我的持仓与盈亏' },
  { id: 'fundflow', name: '资金流动', icon: '⇄', group: 'core', desc: '板块与大盘资金' },
  { id: 'macro', name: '宏观水温', icon: '◍', group: 'advanced', desc: '利率、信用、波动率' },
  { id: 'sentiment', name: '情绪引擎', icon: '◑', group: 'advanced', desc: '拥挤度与极端读数' },
  { id: 'strategy', name: '做T策略', icon: '◇', group: 'advanced', desc: '日内交易工具（高风险）' },
  { id: 'technical', name: '技术分析', icon: '／', group: 'advanced', desc: '均线、MACD、RSI' },
  { id: 'rotation', name: '板块轮动', icon: '◈', group: 'advanced', desc: '行业强弱' },
  { id: 'alerts', name: '告警', icon: '！', group: 'advanced', desc: '价格与指标提醒' },
];

export const CORE_TABS = TABS.filter((t) => t.group === 'core');
export const ADVANCED_TABS = TABS.filter((t) => t.group === 'advanced');

export const TIME_FRAMES = ['1D', '5D', '20D', '60D'] as const;
