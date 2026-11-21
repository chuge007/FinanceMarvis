import { memo } from 'react';
import { KpiCard } from '../../shared/components/KpiCard';
import { EventLinkageFlow } from '../../shared/components/EventLinkageFlow';
import { RiskHeatmap } from './components/RiskHeatmap';
import { CreditRateTable } from './components/CreditRateTable';
import { VolatilityPanel } from './components/VolatilityPanel';
import { BullBearForce } from './components/BullBearForce';
import { InstitutionViews } from './components/InstitutionViews';
import { IndustryNewsFeed } from './components/IndustryNewsFeed';
import { TimeFilter } from '../../shared/components/TimeFilter';
import { ModuleRelationshipFooter } from '../../shared/components/ModuleRelationshipFooter';
import { useMarketStore } from '../../stores/useMarketStore';
import { useAppStore } from '../../stores/useAppStore';
import { useCnbMarketStore } from '../../stores/useCnbMarketStore';

export const MacroPage = memo(function MacroPage() {
  const { market } = useAppStore();
  const { spx, vix, dxy, us10y, lastUpdate } = useMarketStore();
  const { ssci, sse, szse, cn10y, lastUpdate: cnLastUpdate } = useCnbMarketStore();

  const isCN = market === 'CN';
  const displayUpdate = isCN ? cnLastUpdate : lastUpdate;

  const kpis = isCN
    ? [
        { value: ssci.toFixed(1), label: '沪深300', direction: 'up' as const },
        { value: sse.toFixed(1), label: '上证指数', direction: 'up' as const },
        { value: szse.toFixed(1), label: '深证成指', direction: 'flat' as const },
        { value: cn10y.toFixed(2), label: 'CN10Y', unit: '%', direction: 'flat' as const },
      ]
    : [
        { value: spx.toFixed(1), label: 'SPX', direction: 'up' as const },
        { value: vix.toFixed(1), label: 'VIX', direction: 'down' as const },
        { value: dxy.toFixed(2), label: 'DXY', direction: 'flat' as const },
        { value: us10y.toFixed(2), label: 'US10Y', unit: '%', direction: 'flat' as const },
      ];

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-bold text-[#d8dce6]">宏观水温</h2>
          {displayUpdate && (
            <span className="text-[10px] text-[#636878]">更新 {displayUpdate}</span>
          )}
        </div>
        <TimeFilter />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {kpis.map((k) => (
          <KpiCard key={k.label} value={k.value} label={k.label} unit={k.unit} direction={k.direction} />
        ))}
      </div>

      <RiskHeatmap market={market} />
      <EventLinkageFlow module="macro" />
      <div className="grid grid-cols-2 gap-3">
        <CreditRateTable market={market} />
        <VolatilityPanel market={market} />
      </div>
      <BullBearForce market={market} />
      <div className="grid grid-cols-2 gap-3">
        <InstitutionViews market={market} />
        <IndustryNewsFeed market={market} />
      </div>
      <ModuleRelationshipFooter module="macro" />
    </div>
  );
});
