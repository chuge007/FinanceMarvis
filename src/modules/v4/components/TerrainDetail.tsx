import { memo } from 'react';
import type { CrossAssetReading } from '../../../core/data/crossAsset';
import { zDelta } from '../../../core/analysis/series';
import { Sparkline } from '../../../shared/components/Sparkline';
import { DOWN, UP, fmtValue } from './terrainFormat';

interface Props {
  cell: CrossAssetReading;
  points: { date: string; value: number; z: number | null }[];
}

export const TerrainDetail = memo(function TerrainDetail({ cell, points }: Props) {
  const dz = zDelta(points, 20);
  const color = cell.changePct !== null && cell.changePct < 0 ? DOWN : UP;

  return (
    <div className="mt-2 rounded border border-[#1f2430] bg-[#11141c] p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[0.8125rem] font-semibold text-[#e8ebf0]">{cell.label}</span>
            <span className="font-mono text-[0.8125rem] text-[#b0b5c0] tabular-nums">{fmtValue(cell)}</span>
            <span className="text-[0.75rem] text-[#636878]">
              Z {cell.z === null ? '—' : cell.z.toFixed(2)}
              {cell.percentile !== null && ` · 分位 ${Math.round(cell.percentile)}%`}
              {dz !== null && ` · 20日 ${dz >= 0 ? '+' : ''}${dz.toFixed(2)}σ`}
              {cell.asOf && ` · ${cell.asOf}`}
            </span>
          </div>
          <div className="mt-1 text-[0.75rem] leading-relaxed text-[#8a8f9d]">{cell.note}</div>
          <div className="mt-0.5 text-[0.75rem] leading-relaxed text-[#f59e4b]">误读：{cell.pitfall}</div>
        </div>
        <div className="shrink-0">
          {cell.spark.length > 2 ? (
            <Sparkline data={cell.spark} width={168} height={38} color={color} lineWidth={1.4} />
          ) : (
            <span className="text-[0.75rem] text-[#4d5364]">无历史序列</span>
          )}
        </div>
      </div>
      {cell.externalUrl && (
        <a
          href={cell.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 border-b border-dashed border-[#2a3040] text-[0.75rem] text-[#7aa2ff] hover:text-[#cfd6e4]"
        >
          外部核对 ↗
        </a>
      )}
    </div>
  );
});
