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
import { percentileOf } from '../../shared/utils/seriesStats';

const fmt = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

export const MacroPage = memo(function MacroPage() {
  const { market } = useAppStore();
  const { spx, vix, dxy, us10y, vixSeries, dxySeries, us10ySeries, lastUpdate } = useMarketStore();
  const { ssci, sse, szse, cn10y, ssciSeries, sseSeries, szseSeries, cn10ySeries, lastUpdate: cnLastUpdate } = useCnbMarketStore();

  const isCN = market === 'CN';
  const displayUpdate = isCN ? cnLastUpdate : lastUpdate;

  const kpis = isCN
    ? [
        { value: fmt(ssci), raw: ssci, label: '沪深300', direction: 'flat' as const, series: ssciSeries },
        { value: fmt(sse), raw: sse, label: '上证指数', direction: 'flat' as const, series: sseSeries },
        { value: fmt(szse), raw: szse, label: '深证成指', direction: 'flat' as const, series: szseSeries },
        { value: fmt(cn10y, 2), raw: cn10y, label: 'CN10Y', unit: '%', direction: 'flat' as const, series: cn10ySeries },
      ]
    : [
        { value: fmt(spx), raw: spx, label: 'SPX', direction: 'flat' as const, series: [] as number[] },
        { value: fmt(vix), raw: vix, label: 'VIX', direction: 'flat' as const, series: vixSeries },
        { value: fmt(dxy, 2), raw: dxy, label: 'DXY', direction: 'flat' as const, series: dxySeries },
        { value: fmt(us10y, 2), raw: us10y, label: 'US10Y', unit: '%', direction: 'flat' as const, series: us10ySeries },
      ];

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[0.8125rem] font-bold text-[#d8dce6]">宏观水温</h2>
          {displayUpdate && (
            <span className="text-[0.625rem] text-[#636878]">更新 {displayUpdate}</span>
          )}
        </div>
        <TimeFilter />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            value={k.value}
            label={k.label}
            unit={k.unit}
            direction={k.direction}
            sparkline={k.series}
            percentile={k.raw !== null && k.series.length >= 8 ? percentileOf(k.series, k.raw) : undefined}
            percentileLabel="近120日"
          />
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
