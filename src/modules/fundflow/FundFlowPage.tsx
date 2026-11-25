import { memo } from 'react';
import { TimeFilter } from '../../shared/components/TimeFilter';
import { EventLinkageFlow } from '../../shared/components/EventLinkageFlow';
import { MarketCapitalOverviewCard } from './components/MarketCapitalOverviewCard';
import { SankeyFlowChart } from './components/SankeyFlow';
import { SectorFlowMatrix } from './components/SectorFlowMatrix';
import { CumulativeFlowChart } from './components/CumulativeFlowChart';
import { OrderFlowTape } from './components/OrderFlowTape';
import { USFlowDynamics } from './components/USFlowDynamics';
import { DepthMap } from './components/DepthMap';
import { ModuleRelationshipFooter } from '../../shared/components/ModuleRelationshipFooter';
import { useSectorFlow } from './hooks/useSectorFlow';
import { useAppStore } from '../../stores/useAppStore';

export const FundFlowPage = memo(function FundFlowPage() {
  const { market } = useAppStore();
  const { marketState } = useSectorFlow();

  const isCN = market === 'CN';
  const title = isCN ? '资金流动 · A股' : '资金流动 · 美股';

  const statusColor = marketState.isOpen
    ? 'bg-[#0ca678]'
    : 'bg-[#636878]';
  const statusLabel = marketState.isOpen
    ? marketState.label
    : marketState.status === 'weekend'
      ? '周末休市'
      : `休市 · 上次收盘数据`;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[0.8125rem] font-bold text-[#d8dce6]">{title}</h2>
          <span className={`text-[0.625rem] px-1.5 py-0.5 rounded-full text-white ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <TimeFilter />
      </div>
      <MarketCapitalOverviewCard />
      <SankeyFlowChart />
      <EventLinkageFlow module="fundflow" />
      <div className="grid grid-cols-2 gap-3">
        <SectorFlowMatrix />
        <CumulativeFlowChart />
      </div>
      {isCN ? (
        <div className="grid grid-cols-2 gap-3">
          <OrderFlowTape />
          <DepthMap />
        </div>
      ) : (
        <USFlowDynamics />
      )}
      <ModuleRelationshipFooter module="fundflow" />
    </div>
  );
});
