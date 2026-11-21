import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { Sparkline } from '../../../shared/components/Sparkline';
import { KpiCard } from '../../../shared/components/KpiCard';
import { useVolatility } from '../hooks/useVolatility';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

export const VolatilityPanel = memo(function VolatilityPanel({ market }: Props) {
  const { data, loading } = useVolatility();

  const title = market === 'CN' ? '波动率全景 · A股' : '波动率全景';
  const dataSource = market === 'CN' ? '中国波指 / SSE' : 'CBOE / ConvexTrade';

  if (loading || !data) {
    return <Panel title={title} badge="加载中"><div className="h-24" /></Panel>;
  }

  const { current } = data;

  return (
    <Panel title={title} badge="实时">
      <div className="grid grid-cols-4 gap-3 mb-3">
        <KpiCard value={current.vix.toFixed(1)} label="VIX" unit="" direction={current.vix > 20 ? 'up' : 'down'} />
        <KpiCard value={current.vvix.toFixed(1)} label="VVIX" unit="" direction="flat" />
        <KpiCard value={current.skew.toFixed(1)} label="SKEW" unit="" direction={current.skew < -5 ? 'down' : 'flat'} />
        <KpiCard value={current.move.toFixed(1)} label="MOVE" unit="" direction="flat" />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-2">
        <div>
          <div className="text-[10px] text-[#636878] mb-1">VIX 趋势</div>
          <Sparkline data={data.vixSparkline} width={150} height={32} color="#f59e4b" />
        </div>
        <div>
          <div className="text-[10px] text-[#636878] mb-1">VVIX 趋势</div>
          <Sparkline data={data.vvixSparkline} width={150} height={32} color="#9b6efb" />
        </div>
        <div>
          <div className="text-[10px] text-[#636878] mb-1">SKEW 趋势</div>
          <Sparkline data={data.skewSparkline} width={150} height={32} color="#20c4d8" />
        </div>
        <div>
          <div className="text-[10px] text-[#636878] mb-1">MOVE 趋势</div>
          <Sparkline data={data.moveSparkline} width={150} height={32} color="#f04452" />
        </div>
      </div>
      <p className="text-[10.5px] text-[#636878] leading-relaxed">{data.interpretation}</p>
      <div className="text-[10px] text-[#636878] mt-2">数据源: {dataSource} · 每 5 分钟更新</div>
    </Panel>
  );
});
