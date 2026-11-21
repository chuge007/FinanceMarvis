import { memo } from 'react';
import { TimeFilter } from '../../shared/components/TimeFilter';
import { EventLinkageFlow } from '../../shared/components/EventLinkageFlow';
import { FearGreedIndexPanel } from './components/FearGreedIndex';
import { NAAIMExposure } from './components/NAAIMExposure';
import { McClellanPanel } from './components/McClellanPanel';
import { PutCallDetail } from './components/PutCallDetail';
import { DarkPoolPanel } from './components/DarkPoolPanel';
import { GammaExposure } from './components/GammaExposure';
import { AlgoSentimentTable } from './components/AlgoSentimentTable';
import { KpiCard } from '../../shared/components/KpiCard';
import { useFearGreed } from './hooks/useFearGreed';
import { ModuleRelationshipFooter } from '../../shared/components/ModuleRelationshipFooter';
import { useAppStore } from '../../stores/useAppStore';

export const SentimentPage = memo(function SentimentPage() {
  const { market } = useAppStore();
  const { data: fg } = useFearGreed();

  const isCN = market === 'CN';
  // 数据缺失时显示「—」，不用假默认值冒充真实读数
  const fgValue = fg?.value ?? null;
  const fgState = fg?.classification ?? '—';
  const vix = fg?.vix ?? null;
  const title = isCN ? '情绪引擎 · A股' : '情绪引擎';

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#d8dce6]">{title}</h2>
        <TimeFilter />
      </div>

      <div className="rounded-[4px] px-3 py-2 text-[11px] leading-relaxed" style={{ background: 'rgba(247,212,76,0.06)', color: '#f7d44c', border: '1px solid rgba(247,212,76,0.18)' }}>
        数据可信度：F&amp;G 主值与趋势、VIX、Put/Call 来自真实接口；F&amp;G 的 7 个子因子是前端估算。
        NAAIM、McClellan、Put/Call 明细、暗池、Gamma 敞口、算法情绪表为写死的演示常量，不可用于实盘决策。
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
        <KpiCard value={fg?.subIndices?.length ?? '—'} label="因子数(估算)" direction="flat" />
        <KpiCard value={fg?.trend?.length ?? '—'} label="数据天数" direction="flat" />
      </div>

      <FearGreedIndexPanel />
      <EventLinkageFlow module="sentiment" />

      <div className="grid grid-cols-2 gap-3">
        <NAAIMExposure />
        <McClellanPanel />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PutCallDetail />
        <DarkPoolPanel />
      </div>
      <GammaExposure />
      <AlgoSentimentTable />
      <ModuleRelationshipFooter module="sentiment" />
    </div>
  );
});
