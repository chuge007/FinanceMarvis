import { memo, useState } from 'react';
import type {
  ResonanceDimension,
  ResonanceDimensionId,
  ResonanceResult,
  ResonanceState,
} from '../../../core/analysis/resonance';
import type { TrackStats } from '../../../core/analysis/trackRecord';

interface Props {
  result: ResonanceResult;
  /** 历史判断的回看统计；样本不足或基准不可用时为 null，不展示。 */
  track?: TrackStats | null;
  /** 点击某个维度：跳到能看该维度明细的地方。 */
  onDimensionClick?: (id: ResonanceDimensionId) => void;
}

const STATE_META: Record<ResonanceState, { label: string; color: string }> = {
  risk: { label: '偏风险', color: '#f04452' },
  neutral: { label: '中性', color: '#8a8f9d' },
  loose: { label: '偏宽松', color: '#0ca678' },
  missing: { label: '缺数据', color: '#4d5364' },
};

function scoreText(score: number | null): string {
  if (score === null) return '—';
  return `${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
}

const DimensionBlock = memo(function DimensionBlock({
  dimension,
  onHover,
  active,
  onClick,
}: {
  dimension: ResonanceDimension;
  onHover: (id: string | null) => void;
  active: boolean;
  onClick?: (id: ResonanceDimensionId) => void;
}) {
  const meta = STATE_META[dimension.state];
  const dim = dimension.state === 'missing';

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(dimension.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(dimension.id)}
      onBlur={() => onHover(null)}
      onClick={() => onClick?.(dimension.id)}
      title={
        dim
          ? '该维度暂无真实数据，不计入票数（点击仍可查看对应指标）'
          : `${dimension.label}：${meta.label}（${scoreText(dimension.score)}）· 点击查看明细`
      }
      className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-left transition-colors"
      style={{
        borderColor: active ? meta.color : '#1a1d26',
        background: active ? `${meta.color}14` : 'transparent',
        opacity: dim ? 0.55 : 1,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
      <span className="shrink-0 text-[0.6563rem] text-[#b0b5c0]">{dimension.label}</span>
      <span className="shrink-0 font-mono text-[0.5938rem] tabular-nums" style={{ color: meta.color }}>
        {meta.label}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[0.5625rem] text-[#636878] tabular-nums">
        {scoreText(dimension.score)}
      </span>
    </button>
  );
});

/**
 * 四维共振条：结论先行。
 * 四个维度各给一个方向，右侧直接说「几维偏风险、要不要动手」，
 * hover 任一维度可在下方展开它用了哪几条证据，避免结论不可核对。
 */
export const ResonanceBar = memo(function ResonanceBar({ result, track, onDimensionClick }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = result.dimensions.find((d) => d.id === hovered) ?? null;

  const verdictColor = result.riskCount >= 3
    ? '#f04452'
    : result.looseCount >= 3
      ? '#0ca678'
      : result.available
        ? '#b0b5c0'
        : '#f59e4b';

  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[0.6875rem] font-semibold text-[#d8dce6]">四维共振</span>
          <span className="text-[0.5313rem] text-[#4d5364]">资金·风险·人群·结构</span>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4">
          {result.dimensions.map((dimension) => (
            <DimensionBlock
              key={dimension.id}
              dimension={dimension}
              onHover={setHovered}
              active={hovered === dimension.id}
              onClick={onDimensionClick}
            />
          ))}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[0.6563rem] font-medium" style={{ color: verdictColor }}>
          {result.verdict}
        </span>
        <span className="text-[0.5313rem] text-[#4d5364]">
          风险 {result.riskCount} · 宽松 {result.looseCount} · 中性 {result.neutralCount} · 缺 {result.missingCount}
        </span>
      </div>

      {track && (track.riskSamples >= 2 || track.looseSamples >= 2) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.5313rem] text-[#4d5364]">
          <span>历史回看（{track.horizon} 个交易日）：</span>
          {track.riskSamples >= 2 && (
            <span>
              偏风险 {track.riskSamples} 次，之后下跌 {track.riskDown} 次
              {track.riskAvg !== null && (
                <span className="ml-1 font-mono tabular-nums">
                  均值 {track.riskAvg >= 0 ? '+' : ''}
                  {(track.riskAvg * 100).toFixed(1)}%
                </span>
              )}
            </span>
          )}
          {track.looseSamples >= 2 && (
            <span>
              偏宽松 {track.looseSamples} 次，之后上涨 {track.looseUp} 次
              {track.looseAvg !== null && (
                <span className="ml-1 font-mono tabular-nums">
                  均值 {track.looseAvg >= 0 ? '+' : ''}
                  {(track.looseAvg * 100).toFixed(1)}%
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {active && active.evidence.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#1a1d26] pt-1.5">
          <span className="text-[0.5313rem] text-[#4d5364]">{active.label}依据：</span>
          {active.evidence.map((item) => (
            <span key={item.label} className="text-[0.5625rem] text-[#8a8f9d]">
              {item.label}
              <span className="ml-1 font-mono tabular-nums text-[#b0b5c0]">{item.value}</span>
              {item.z !== null && (
                <span className="ml-1 font-mono tabular-nums text-[#636878]">
                  z {item.z >= 0 ? '+' : ''}
                  {item.z.toFixed(2)}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
