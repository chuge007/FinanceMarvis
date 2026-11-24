import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Sparkline } from '../../../shared/components/Sparkline';
import { KpiCard } from '../../../shared/components/KpiCard';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';
import { SourceBadge } from '../../../shared/components/SourceBadge';
import { PercentileThermometer } from '../../../shared/components/PercentileThermometer';
import { useVolatility } from '../hooks/useVolatility';
import { useMarketStore } from '../../../stores/useMarketStore';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

const fmt = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

export const VolatilityPanel = memo(function VolatilityPanel({ market }: Props) {
  const { data, loading } = useVolatility();
  const vixSeries = useMarketStore((s) => s.vixSeries);

  const title = '波动率全景 · 美股';
  const asOf = data ? new Date(data.current.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : null;

  if (loading || !data) {
    return <Panel title={title} badge="加载中"><div className="h-24" /></Panel>;
  }

  const { current } = data;

  return (
    <Panel
      title={title}
      extra={<ChartHeader source="real" asOf={asOf} note="VIX 来自 ConvexTrade/FRED，VVIX/SKEW 来自 Yahoo" />}
    >
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <KpiCard
            value={fmt(current.vix)}
            label="VIX"
            direction={current.vix === null ? undefined : current.vix > 20 ? 'up' : 'down'}
          />
          {current.vix !== null && vixSeries.length >= 8 && (
            <PercentileThermometer value={current.vix} values={vixSeries} windowLabel="近120日" />
          )}
        </div>
        <div>
          <div className="mb-1"><SourceBadge kind={current.vvix === null ? 'missing' : 'real'} /></div>
          <KpiCard value={fmt(current.vvix)} label="VVIX" direction="flat" />
        </div>
        <div>
          <div className="mb-1"><SourceBadge kind={current.skew === null ? 'missing' : 'real'} /></div>
          <KpiCard
            value={fmt(current.skew)}
            label="SKEW"
            direction={current.skew === null ? undefined : current.skew > 140 ? 'up' : current.skew < 120 ? 'down' : 'flat'}
          />
        </div>
        <div>
          <div className="mb-1"><SourceBadge kind="missing" text="无免费源" /></div>
          <KpiCard value={fmt(current.move)} label="MOVE" direction="flat" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-2">
        {[
          { label: 'VIX 趋势', values: data.vixSparkline, color: '#f59e4b' },
          { label: 'VVIX 趋势', values: data.vvixSparkline, color: '#9b6efb' },
          { label: 'SKEW 趋势', values: data.skewSparkline, color: '#20c4d8' },
          { label: 'MOVE 趋势', values: data.moveSparkline, color: '#f04452' },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[10px] text-[#636878] mb-1">{s.label}</div>
            {s.values.length >= 2 ? (
              <Sparkline data={s.values} width={150} height={32} color={s.color} />
            ) : (
              <div className="h-[32px] flex items-center text-[9.5px] text-[#4d5364]">暂无真实序列</div>
            )}
          </div>
        ))}
      </div>

      <ChartInsight
        summary={data.interpretation}
        how="VIX 看绝对水平，也看历史分位；SKEW >140 表示尾部看跌保护需求偏强。"
        pitfall="VVIX/SKEW 仅为当前点位，本地无历史序列；MOVE 无可靠免费源，显示“—”，不要用随机数代替。"
      />
      <div className="mt-2 text-[10px] text-[#636878]">
        {market === 'CN' ? '注意：本组为美股波动率指标，不代表 A 股波动率。' : ''}
        {' '}数据源：ConvexTrade / Yahoo Finance · VIX 序列 120 日，迷你图按相对首值绘制。
      </div>
    </Panel>
  );
});
