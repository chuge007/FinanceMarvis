import { memo, useCallback, useEffect, useState } from 'react';
import { fetchRhythm } from './services/rhythm';
import type { RhythmSnapshot } from './services/rhythm';
import { RegimeCard } from './components/RegimeCard';
import { RegimeContribution } from './components/RegimeContribution';
import { RiskTemperatureOverlay } from './components/RiskTemperatureOverlay';
import { CorrelationMatrix } from './components/CorrelationMatrix';
import { RegimeTimeline } from './components/RegimeTimeline';
import { DivergenceAlert } from './components/DivergenceAlert';
import { IndicatorTimeline } from './components/IndicatorTimeline';
import { TodayThree } from './components/TodayThree';
import { EventCalendar } from './components/EventCalendar';
import { DataIntegrityPanel } from './components/DataIntegrityPanel';
import { PortfolioRecommendation } from './components/PortfolioRecommendation';

export const RhythmPage = memo(function RhythmPage() {
  const [snapshot, setSnapshot] = useState<RhythmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await fetchRhythm());
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 300_000); // 序列为日度/月度，5 分钟刷新足够
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[0.8125rem] font-bold text-[#d8dce6]">市场节奏 · 今天该怎么看待风险</h2>
        <p className="text-[0.625rem] text-[#636878] mt-0.5">
          结论先行：先看状态与置信度 → 再看领先/同步/滞后依据 → 最后才是动作与纪律。
        </p>
      </div>

      <RegimeCard snapshot={snapshot} loading={loading} onRefresh={() => void load()} />
      <RegimeContribution snapshot={snapshot} />
      <RiskTemperatureOverlay snapshot={snapshot} />
      <div className="grid grid-cols-2 gap-3 items-start">
        <CorrelationMatrix snapshot={snapshot} />
        <div className="space-y-3">
          <RegimeTimeline snapshot={snapshot} />
          <DivergenceAlert snapshot={snapshot} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-start">
        <div className="col-span-2">
          <IndicatorTimeline indicators={snapshot?.indicators ?? []} />
        </div>
        <div className="space-y-3">
          <TodayThree regime={snapshot?.regime ?? null} />
        </div>
      </div>

      <EventCalendar />
      <DataIntegrityPanel />
      
      <PortfolioRecommendation />

      <p className="text-center text-[0.625rem] text-[#636878] pb-2">
        StrategyLab · 市场节奏模块 · 真实历史序列 + 历史分位 / Z-score · 不预测涨跌，不构成投资建议
      </p>
    </div>
  );
});
