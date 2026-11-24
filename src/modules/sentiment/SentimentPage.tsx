import { memo } from 'react';
import { TimeFilter } from '../../shared/components/TimeFilter';
import { FearGreedIndexPanel } from './components/FearGreedIndex';
import { PutCallDetail } from './components/PutCallDetail';
import { OptionsSentimentPanel } from './components/OptionsSentimentPanel';
import { KpiCard } from '../../shared/components/KpiCard';
import { useFearGreed } from './hooks/useFearGreed';
import { ModuleRelationshipFooter } from '../../shared/components/ModuleRelationshipFooter';
import { useAppStore } from '../../stores/useAppStore';

export const SentimentPage = memo(function SentimentPage() {
  const { market } = useAppStore();
  const { data: fg } = useFearGreed();

  const isCN = market === 'CN';
  const fgValue = fg?.value ?? null;
  const fgState = fg?.classification ?? '—';
  const vix = fg?.vix ?? null;
  const totalPC = fg?.options?.ratios.find((r) => r.key === 'TOTAL PUT/CALL RATIO')?.value
    ?? (fg?.putCallRatio ? Number(fg.putCallRatio) : null);
  const title = isCN ? '情绪引擎 · A股' : '情绪引擎';

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#d8dce6]">{title}</h2>
        <TimeFilter />
      </div>

      <div className="rounded-[4px] px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'rgba(247,212,76,0.06)', color: '#f7d44c', border: '1px solid rgba(247,212,76,0.18)' }}>
        数据可信度：F&amp;G 主值与趋势、VIX、CBOE Put/Call 分类与量能、Yahoo 波动率指数族均来自真实接口；F&amp;G 的 7 个子因子是前端估算。
        已移除 NAAIM / McClellan / 暗池 / Gamma / 算法情绪表等写死面板；取不到真实数据时不展示模拟值。
        A 股情绪合成分由真实行情计算，但属于自定义模型，并非官方指数。
      </div>

      <div className="grid grid-cols-5 gap-2">
        <KpiCard
          value={fgValue ?? '—'}
          label="F&G"
          direction={fgValue === null ? 'flat' : fgValue > 55 ? 'up' : 'down'}
          sparkline={fg?.trend?.map((p) => p.value)}
        />
        <KpiCard value={typeof vix === 'number' ? vix.toFixed(1) : '—'} label="VIX" direction="flat" />
        <KpiCard value={fgState} label="市场状态" direction={fgValue === null ? 'flat' : fgValue > 55 ? 'up' : 'down'} />
        <KpiCard
          value={totalPC !== null && Number.isFinite(totalPC) ? totalPC.toFixed(2) : '—'}
          label="Total P/C"
          direction={totalPC === null ? 'flat' : totalPC > 1.10 ? 'down' : totalPC < 0.70 ? 'up' : 'flat'}
        />
        <KpiCard value={fg?.trend?.length ?? '—'} label="数据天数" direction="flat" />
      </div>

      <FearGreedIndexPanel />
      {!isCN && (
        <>
          <OptionsSentimentPanel />
          <PutCallDetail />
        </>
      )}
      <ModuleRelationshipFooter module="sentiment" />
    </div>
  );
});
