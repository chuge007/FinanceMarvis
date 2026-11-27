import { memo, useState } from 'react';
import type { ModuleTab } from '../../stores/useAppStore';
import { ObservationList } from './components/ObservationList';
import { StrategyPage } from '../strategy/StrategyPage';
import { FlowPage } from '../flow/FlowPage';
import { MarketPulse } from './components/MarketPulse';
import { SidecarFeed } from '../../shared/components/SidecarFeed';

type DecideTab = 'observe' | 'flow' | 'project-data' | 'toolbox';

const TABS: { id: DecideTab; label: string; hint: string }[] = [
  { id: 'observe', label: '观察清单', hint: '价格与指标提醒，只留意不下单' },
  { id: 'flow', label: '资金流分析', hint: '大盘情绪带 + 个股主力资金' },
  { id: 'project-data', label: '项目数据', hint: 'AkShare 龙虎榜 / 两融 / 基金净值，逐条标项目名与可得性' },
  { id: 'toolbox', label: '工具箱', hint: '日内工具（默认折叠）' },
];

/** 业务页里的开源项目数据线：主源缺失时由备源补，侧车不可用时显示「缺」。 */
function ProjectDataPanel() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">项目数据 · AkShare 直供备源线</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-[#636878]">
          龙虎榜与两融主源是 Tushare（需 Key）；这里展示 AkShare 备源，缺库或源站改版时显示「缺」，不与主源混算。
        </p>
      </div>
      <SidecarFeed
        project="AkShare" stability="S4" title="A 股龙虎榜（备源）"
        caliber="新浪龙虎榜日榜（东财源站改版时自动回退）；席位口径与 Tushare 主源分列，不做合并统计"
        method="akshare.stock_lhb" params={{ date: today }} maxRows={25}
      />
      <SidecarFeed
        project="AkShare" stability="S4" title="A 股两融（备源）"
        caliber="上交所融资融券，T-1 18:00 后完整；与 Tushare 两融主源分列展示"
        method="akshare.margin" params={{}} maxRows={25}
      />
      <SidecarFeed
        project="AkShare" stability="S4" title="行业资金流（备源）"
        caliber="同花顺行业资金流（东财 push2 限流时自动回退）；与腾讯行业榜（主源）口径不同，分列展示"
        method="akshare.sector_flow" params={{ indicator: '今日', sectorType: '行业资金流' }} maxRows={25}
      />
      <SidecarFeed
        project="AkShare" stability="S4" title="基金净值"
        caliber="open_fund_info_em 单位净值走势；主源即 AkShare 侧车，缺库显示「缺」"
        method="akshare.fund_nav" params={{ code: '000001' }} maxRows={25}
      />
    </div>
  );
}

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
        <div>
          <MarketPulse />
          <div className="border-t border-[#1a1d26] p-3">
            <ObservationList />
          </div>
        </div>
      )}

      {tab === 'flow' && <FlowPage />}

      {tab === 'project-data' && <ProjectDataPanel />}

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
