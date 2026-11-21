import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { usePutCall } from '../hooks/index';

export const PutCallDetail = memo(function PutCallDetail() {
  const data = usePutCall();
  const items = [
    { label: 'Equity P/C', value: data.equityPC.toFixed(2), bar: data.equityPC / 1.5 * 100 },
    { label: 'Index P/C', value: data.indexPC.toFixed(2), bar: data.indexPC / 1.5 * 100 },
    { label: 'Total P/C', value: data.totalPC.toFixed(2), bar: data.totalPC / 1.5 * 100 },
    { label: 'OTM P/C', value: data.otmPutCall.toFixed(2), bar: data.otmPutCall / 1.5 * 100 },
    { label: 'Call Vol Δ', value: `${data.callVolumeDelta > 0 ? '+' : ''}${data.callVolumeDelta}%`, delta: data.callVolumeDelta },
    { label: 'Put Vol Δ', value: `${data.putVolumeDelta > 0 ? '+' : ''}${data.putVolumeDelta}%`, delta: data.putVolumeDelta },
    { label: '25Δ Skew', value: data.skew25Delta.toFixed(1), bar: Math.min(100, Math.abs(data.skew25Delta) * 4) },
    { label: 'OI P/C', value: data.openInterestPC.toFixed(2), bar: data.openInterestPC / 1.5 * 100 },
  ];

  return (
    <Panel title="Put/Call 细项">
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const isDelta = item.delta !== undefined;
          const color = isDelta ? (item.delta! >= 0 ? '#0ca678' : '#f04452') : '#4078ff';
          const w = isDelta
            ? Math.min(50, Math.abs(item.delta!) / 15 * 50)
            : Math.max(2, Math.min(100, item.bar ?? 0));
          return (
            <div key={item.label} className="bg-[rgba(255,255,255,0.02)] rounded p-2 text-center">
              <div className="text-[9.5px] text-[#636878] mb-0.5">{item.label}</div>
              <div className="text-[11px] font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">{item.value}</div>
              <div className="relative h-[4px] mt-1.5 rounded-full bg-[#1a1d26]">
                {isDelta && <div className="absolute left-1/2 top-[-1px] w-px h-[6px] bg-[#4d5364]" />}
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    background: color,
                    opacity: 0.85,
                    left: isDelta ? (item.delta! >= 0 ? '50%' : `${50 - w}%`) : '0%',
                    width: `${w}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
});
