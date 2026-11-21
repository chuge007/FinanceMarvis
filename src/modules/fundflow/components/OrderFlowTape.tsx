import { memo, useRef, useEffect } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useOrderFlow } from '../hooks/useOrderFlow';
import { directionColor } from '../../../shared/utils/colors';

export const OrderFlowTape = memo(function OrderFlowTape() {
  const ticks = useOrderFlow('600519');

  return (
    <Panel title="逐笔大单流" badge={`${ticks.length}笔`}>
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[#0f1118]">
            <tr className="text-[#636878] border-b border-[#1a1d26]">
              <th className="text-left py-1 font-medium">时间</th>
              <th className="text-left py-1 font-medium">方向</th>
              <th className="text-right py-1 font-medium">价格</th>
              <th className="text-right py-1 font-medium">成交量</th>
              <th className="text-left py-1 font-medium">类型</th>
              <th className="text-right py-1 font-medium">强度</th>
            </tr>
          </thead>
          <tbody>
            {ticks.map((t, i) => (
              <tr key={i} className="border-b border-[rgba(255,255,255,0.01)]">
                <td className="py-0.5 font-['JetBrains_Mono',Consolas,monospace] text-[#636878] tabular-nums">{t.time}</td>
                <td className="py-0.5" style={{ color: directionColor(t.direction === 'buy' ? 'up' : 'down') }}>
                  {t.direction === 'buy' ? '买入' : '卖出'}
                </td>
                <td className="py-0.5 text-right font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">{t.price}</td>
                <td className="py-0.5 text-right font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">{t.volume}</td>
                <td className="py-0.5 text-[#b0b5c0]">{t.type}</td>
                <td className="py-0.5 text-right font-['JetBrains_Mono',Consolas,monospace] tabular-nums" style={{ color: directionColor(t.direction === 'buy' ? 'up' : 'down') }}>{t.intensityPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
});
