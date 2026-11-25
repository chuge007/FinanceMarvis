import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { usePutCall } from '../hooks/index';
import type { OptionVolumeOI, OptionRatioItem } from '../../../types/sentiment';

const READING_COLOR: Record<OptionRatioItem['reading'], string> = {
  偏高: '#f04452',
  偏低: '#0ca678',
  常态: '#d8dce6',
  无数据: '#636878',
};

const compact = (n: number) => new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(n);

function VolumeRow({ label, value }: { label: string; value: OptionVolumeOI | null }) {
  return (
    <div>
      <div className="text-[0.5938rem] text-[#636878] mb-0.5">{label}</div>
      {value ? (
        <div className="text-[0.625rem] font-['JetBrains_Mono',Consolas,monospace] text-[#b0b5c0] tabular-nums">
          总 {compact(value.total)} · C {compact(value.call)} / P {compact(value.put)} · P/C {value.putCallRatio?.toFixed(2) ?? '—'}
        </div>
      ) : (
        <div className="text-[0.625rem] text-[#636878]">—</div>
      )}
    </div>
  );
}

export const PutCallDetail = memo(function PutCallDetail() {
  const data = usePutCall();
  const hasValues = data.items.some((item) => item.value !== null);

  return (
    <Panel
      title="CBOE Put/Call 明细"
      hint="官方每日市场统计"
      badge={hasValues ? '真实数据' : '数据不可用'}
    >
      {hasValues ? (
        <div className="grid grid-cols-3 gap-2">
          {data.items.map((item) => (
            <div key={item.key} className="bg-[rgba(255,255,255,0.02)] rounded p-2" title={item.officialName}>
              <div className="text-[0.5938rem] text-[#636878] mb-0.5">{item.label}</div>
              <div
                className="text-[0.75rem] font-['JetBrains_Mono',Consolas,monospace] tabular-nums"
                style={{ color: READING_COLOR[item.reading] }}
              >
                {item.value !== null ? item.value.toFixed(2) : '—'}
              </div>
              <div className="text-[0.5625rem] text-[#636878] mt-0.5">
                {item.reading}{item.norm ? ` · 常态 ${item.norm[0]}–${item.norm[1]}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center text-[0.625rem] text-[#636878]">
          CBOE 数据暂不可用，未展示模拟值
        </div>
      )}

      {(data.volume || data.openInterest) && (
        <div className="mt-3 pt-2 border-t border-[#1a1d26] grid grid-cols-2 gap-3">
          <VolumeRow label="全市场成交量" value={data.volume} />
          <VolumeRow label="全市场未平仓" value={data.openInterest} />
        </div>
      )}
    </Panel>
  );
});
