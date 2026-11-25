import { memo, useState } from 'react';
import type { ModuleTab } from '../../stores/useAppStore';
import { ObservationList } from './components/ObservationList';
import { StrategyPage } from '../strategy/StrategyPage';
import { FlowPage } from '../flow/FlowPage';

type DecideTab = 'observe' | 'flow' | 'toolbox';

const TABS: { id: DecideTab; label: string; hint: string }[] = [
  { id: 'observe', label: '观察清单', hint: '价格与指标提醒，只留意不下单' },
  { id: 'flow', label: '资金流分析', hint: '大盘情绪带 + 个股主力资金' },
  { id: 'toolbox', label: '工具箱', hint: '日内工具（默认折叠）' },
];

/** 旧入口（配置/纪律/持仓）已按要求移除，统一回到观察清单。 */
function tabOf(initial: ModuleTab): DecideTab {
  if (initial === 'strategy') return 'toolbox';
  return 'observe';
}

interface Props {
  initialTab: ModuleTab;
}

export const DecidePage = memo(function DecidePage({ initialTab }: Props) {
  const [tab, setTab] = useState<DecideTab>(() => tabOf(initialTab));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-[#1a1d26] bg-[#0b0e14] px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={`rounded px-2.5 py-1 text-[0.6563rem] transition-colors ${
              tab === t.id ? 'bg-[#4078ff] text-white' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-2 text-[0.5313rem] text-[#4d5364]">{TABS.find((t) => t.id === tab)?.hint}</span>
      </div>

      {tab === 'observe' && (
        <div className="p-3">
          <ObservationList />
        </div>
      )}

      {tab === 'flow' && <FlowPage />}

      {tab === 'toolbox' && (
        <div>
          <div className="m-3 rounded border-l-2 border-[#f04452] bg-[rgba(240,68,82,0.06)] px-2.5 py-1.5 text-[0.5938rem] leading-relaxed text-[#b0b5c0]">
            工具箱：日内交易工具，默认折叠。它不是决策主路径，也不提供买卖信号；没有足够经验不要打开。
          </div>
          <StrategyPage />
        </div>
      )}
    </div>
  );
});
