import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { BarWithLabel } from '../../../shared/components/BarWithLabel';
import { useDarkPool } from '../hooks/index';

export const DarkPoolPanel = memo(function DarkPoolPanel() {
  const data = useDarkPool();

  return (
    <Panel title="Dark Pool Index" badge={`DPI ${data.dpi}%`}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[9.5px] text-[#636878] mb-1">买卖占比</div>
          <BarWithLabel label="买方" pct={data.buyRatio} color="#f04452" maxPct={100} />
          <BarWithLabel label="卖方" pct={data.sellRatio} color="#0ca678" maxPct={100} />
        </div>
        <div className="flex flex-col justify-center">
          <div className="text-[9.5px] text-[#636878] mb-1">净买入</div>
          <div className="text-[16px] font-bold font-['JetBrains_Mono',Consolas,monospace] text-[#f04452] tabular-nums">
            +{data.netBuy.toFixed(2)}亿
          </div>
          <div className="text-[9.5px] text-[#636878] mt-1">暗池成交占比</div>
          <div className="text-[11px] font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6]">{data.dpi}%</div>
        </div>
      </div>
    </Panel>
  );
});
