import { memo } from 'react';
import { mean, stdDev, percentileOf, zScore } from '../utils/seriesStats';

interface PercentileThermometerProps {
  value: number;
  values: number[];
  unit?: string;
  windowLabel?: string;
  decimals?: number;
}

/** 把绝对值变成相对位置：0–100 分位带 + 当前指针 + 均值/±1σ 参照。 */
export const PercentileThermometer = memo(function PercentileThermometer({
  value, values, unit = '', windowLabel = '历史', decimals = 1,
}: PercentileThermometerProps) {
  const pct = percentileOf(values, value);
  const z = zScore(values, value);
  const avg = mean(values);
  const sd = stdDev(values);
  const marker = (v: number | null) => (v === null ? null : percentileOf(values, v));

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[0.5938rem] text-[#636878]">
        <span>{windowLabel} {pct === null ? '样本不足' : `${pct.toFixed(0)}% 分位`}</span>
        <span>
          {z === null ? '—' : `${z >= 0 ? '高于' : '低于'}均值 ${Math.abs(z).toFixed(1)}σ`}
        </span>
      </div>
      <div className="relative h-[0.375rem] mt-1 rounded-full bg-[#1a1d26]">
        {[16, 50, 84].map((p) => (
          <div key={p} className="absolute top-[-0.125rem] h-[0.625rem] w-px bg-[#4d5364]" style={{ left: `${p}%` }} />
        ))}
        {marker(avg) !== null && (
          <div className="absolute top-[-0.1875rem] h-[0.75rem] w-[0.125rem] bg-[#9aa0ae]" style={{ left: `${marker(avg)}%` }} title={`均值 ${avg?.toFixed(decimals)}${unit}`} />
        )}
        {sd !== null && avg !== null && (
          <>
            {[avg - sd, avg + sd].map((v, i) => {
              const p = marker(v);
              return p !== null ? (
                <div key={i} className="absolute top-[-0.0625rem] h-[0.5rem] w-px bg-[#636878]" style={{ left: `${p}%` }} title={`${i === 0 ? '-1σ' : '+1σ'} ${v.toFixed(decimals)}${unit}`} />
              ) : null;
            })}
          </>
        )}
        {pct !== null && (
          <div className="absolute top-[-0.25rem] h-[0.875rem] w-[0.1875rem] rounded-full bg-[#4078ff]" style={{ left: `${pct}%` }} title={`当前 ${value.toFixed(decimals)}${unit}`} />
        )}
      </div>
    </div>
  );
});
