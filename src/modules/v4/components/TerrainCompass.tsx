import { memo } from 'react';
import type { TerrainModel } from '../../../core/analysis/terrain';

/** 风险偏好 × 流动性象限：只描述现在的位置与近 60 日轨迹。 */
export const TerrainCompass = memo(function TerrainCompass({ model }: { model: TerrainModel }) {
  const x = model.liquidityScore;
  const y = model.riskScore;
  const point = x !== null && y !== null ? { x: 4 + (x / 100) * 92, y: 96 - (y / 100) * 92 } : null;
  const path = model.trail
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(4 + (p.x / 100) * 92).toFixed(1)},${(96 - (p.y / 100) * 92).toFixed(1)}`)
    .join(' ');

  return (
    <div className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] p-2">
      <div className="mb-1 flex items-center justify-between text-[0.6875rem] text-[#636878]">
        <span>象限罗盘</span>
        <span>{model.trail.length ? `${model.trail.length} 日轨迹` : '轨迹不足'}</span>
      </div>

      <div className="text-center text-[0.6875rem] text-[#4d5364]">↑ 风险偏好强</div>
      <svg viewBox="0 0 100 100" className="h-[10.5rem] w-full" role="img" aria-label="风险偏好与流动性象限">
        <rect x="4" y="4" width="46" height="46" fill="rgba(245,158,75,0.07)" />
        <rect x="50" y="4" width="46" height="46" fill="rgba(12,166,120,0.07)" />
        <rect x="4" y="50" width="46" height="46" fill="rgba(240,68,82,0.06)" />
        <rect x="50" y="50" width="46" height="46" fill="rgba(64,120,255,0.06)" />
        <line x1="50" y1="4" x2="50" y2="96" stroke="#2a3040" strokeWidth="0.6" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="#2a3040" strokeWidth="0.6" />
        <text x="73" y="14" fill="#8a8f9d" fontSize="6.5" textAnchor="middle">金发姑娘</text>
        <text x="27" y="14" fill="#8a8f9d" fontSize="6.5" textAnchor="middle">再通胀</text>
        <text x="73" y="92" fill="#8a8f9d" fontSize="6.5" textAnchor="middle">避险</text>
        <text x="27" y="92" fill="#8a8f9d" fontSize="6.5" textAnchor="middle">紧缩</text>
        {path && <path d={path} fill="none" stroke="#4078ff" strokeWidth="0.9" opacity="0.5" />}
        {point && (
          <>
            <circle cx={point.x} cy={point.y} r="3.2" fill="rgba(245,158,75,0.20)" />
            <circle cx={point.x} cy={point.y} r="1.6" fill="#f59e4b" />
          </>
        )}
      </svg>
      <div className="flex justify-between text-[0.6875rem] text-[#4d5364]">
        <span>← 钱紧</span>
        <span>流动性</span>
        <span>钱松 →</span>
      </div>
      <div className="mt-1 text-[0.6875rem] leading-snug text-[#8a8f9d]">
        {model.quadrantLabel ?? '评分不足，暂不落点'}
      </div>
    </div>
  );
});
