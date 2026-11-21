import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { BarWithLabel } from '../../../shared/components/BarWithLabel';
import { useNAAIM } from '../hooks/index';

export const NAAIMExposure = memo(function NAAIMExposure() {
  const data = useNAAIM();

  const bars = [
    { label: '当前', pct: data.current },
    { label: '4周MA', pct: data.week4MA },
    { label: '13周MA', pct: data.week13MA },
    { label: '历史中位', pct: data.historicalMedian },
  ];

  return (
    <Panel title="NAAIM 暴露指数" badge="主动管理人">
      <div className="mb-2">
        {bars.map((b) => (
          <BarWithLabel key={b.label} label={b.label} pct={b.pct} color={b.pct > 80 ? '#f04452' : '#4078ff'} maxPct={100} />
        ))}
      </div>
      <p className="text-[10px] text-[#636878] leading-relaxed">{data.interpretation}</p>
    </Panel>
  );
});
