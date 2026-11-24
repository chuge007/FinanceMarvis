import { memo } from 'react';
import { directionColor, directionText } from '../utils/colors';
import type { Direction } from '../../types/common';
import { Sparkline } from './Sparkline';

interface KpiCardProps {
  value: number | string;
  label: string;
  direction?: Direction;
  unit?: string;
  /** 可选走势数据：有值时在卡片底部画迷你走势图 */
  sparkline?: number[];
  /** 历史分位（0~100），有值时显示相对位置副标题 */
  percentile?: number | null;
  /** 分位参照窗口说明，如「近1年」 */
  percentileLabel?: string;
}

export const KpiCard = memo(function KpiCard({
  value, label, direction, unit, sparkline, percentile, percentileLabel,
}: KpiCardProps) {
  const color = direction ? directionColor(direction) : '#d8dce6';
  const sparkColor = direction ? directionColor(direction) : '#4078ff';
  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[#1a1d26] rounded-[5px] px-3 py-2.5">
      <div className="text-[10px] text-[#636878] mb-1 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-1" style={{ color }}>
        <span className="font-['JetBrains_Mono',Consolas,monospace] text-[16px] font-semibold tabular-nums">
          {value}
        </span>
        {unit && <span className="text-[11px]">{unit}</span>}
        {direction && <span className="text-[11px] ml-0.5">{directionText(direction)}</span>}
      </div>
      {percentile !== null && percentile !== undefined && (
        <div className="mt-0.5 text-[9px] text-[#636878]">
          {percentileLabel ?? '历史'} {percentile.toFixed(0)}% 分位
          <span className="ml-1" style={{ color: percentile > 80 ? '#f04452' : percentile < 20 ? '#0ca678' : '#636878' }}>
            {percentile > 80 ? '偏高' : percentile < 20 ? '偏低' : '中性'}
          </span>
        </div>
      )}
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-1.5 -mb-1">
          <Sparkline data={sparkline} width={96} height={20} color={sparkColor} />
        </div>
      )}
    </div>
  );
});
