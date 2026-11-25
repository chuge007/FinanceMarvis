import { memo } from 'react';

interface BarWithLabelProps {
  label: string;
  pct: number;
  color?: string;
  maxPct?: number;
  showValue?: boolean;
}

export const BarWithLabel = memo(function BarWithLabel({
  label,
  pct,
  color = '#4078ff',
  maxPct = 100,
  showValue = true,
}: BarWithLabelProps) {
  const w = Math.max(1, (pct / maxPct) * 100);
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[0.6563rem] text-[#b0b5c0] w-24 text-right shrink-0">{label}</span>
      <div className="flex-1 bg-[rgba(255,255,255,0.03)] rounded h-[0.625rem] overflow-hidden">
        <div
          className="h-full rounded transition-[width] duration-500"
          style={{ width: `${w}%`, backgroundColor: color }}
        />
      </div>
      {showValue && (
        <span className="text-[0.6563rem] font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] w-10 text-right tabular-nums">
          {pct}%
        </span>
      )}
    </div>
  );
});
