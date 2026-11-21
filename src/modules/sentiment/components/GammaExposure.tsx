import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { KpiCard } from '../../../shared/components/KpiCard';
import { BarWithLabel } from '../../../shared/components/BarWithLabel';
import { useGEX } from '../hooks/index';

export const GammaExposure = memo(function GammaExposure() {
  const data = useGEX();
  const maxGamma = Math.max(...data.distribution.map((d) => d.gamma), 1);

  return (
    <Panel title="Gamma Exposure" badge="GEX">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <KpiCard value={data.netGEX.toFixed(1) + 'B'} label="Net GEX" direction="up" />
        <KpiCard value={data.zeroGamma.toString()} label="Zero Gamma" direction="flat" />
        <KpiCard value={data.callWall.toString()} label="Call Wall" direction="up" />
      </div>
      <div className="text-[9.5px] text-[#636878] mb-2">Gamma 分布</div>
      <div className="flex items-end gap-1" style={{ height: 80 }}>
        {data.distribution.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full rounded-t"
              style={{
                height: `${(d.gamma / maxGamma) * 100}%`,
                backgroundColor: d.gamma > 0 ? '#f0445240' : '#0ca67840',
                borderLeft: '1px solid #f0445280',
                borderRight: '1px solid #f0445280',
                borderTop: '1px solid #f04452',
              }}
            />
            <span className="text-[6.5px] font-['JetBrains_Mono',Consolas,monospace] text-[#636878] mt-0.5 tabular-nums">
              {d.strike}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-[#636878]">
        Put Wall: {data.putWall} | Call Wall: {data.callWall} | Zero Gamma: {data.zeroGamma}
      </div>
    </Panel>
  );
});
