import { memo } from 'react';
import type { CrossAssetReading } from '../../../core/data/crossAsset';
import { fmtChange, fmtValue, heatColor, sourceColor, sourceLabel } from './terrainFormat';

interface Props {
  cell: CrossAssetReading;
  selected: boolean;
  onClick: () => void;
}

export const TerrainCell = memo(function TerrainCell({ cell, selected, onClick }: Props) {
  const change = fmtChange(cell);
  const missing = cell.latest === null;
  return (
    <button
      onClick={onClick}
      title={`${cell.label} · ${cell.note}${cell.percentile === null ? '' : ` · 近一年 ${Math.round(cell.percentile)}% 分位`}`}
      className={`relative flex w-[7rem] shrink-0 flex-col gap-0.5 overflow-hidden rounded border px-2 py-1 text-left transition-colors ${
        selected
          ? 'border-[#4078ff] bg-[rgba(64,120,255,0.10)]'
          : 'border-[#1f2430] bg-[#11141c] hover:border-[#2a3040]'
      } ${missing ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[0.75rem] leading-tight text-[#d8dce6]" title={cell.label}>
          {cell.short}
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: sourceColor(cell.actualSource) }}
          title={sourceLabel(cell.actualSource)}
        />
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-mono text-[0.8125rem] leading-tight text-[#e8ebf0] tabular-nums">{fmtValue(cell)}</span>
        <span className="font-mono text-[0.75rem] leading-tight tabular-nums" style={{ color: change.color }}>
          {change.text}
        </span>
      </div>
      <span
        className="absolute bottom-0 left-0 h-[0.125rem]"
        style={{
          width: `${cell.percentile ?? 0}%`,
          background: heatColor(cell.percentile),
          opacity: cell.percentile === null ? 0.2 : 0.9,
        }}
      />
    </button>
  );
});
