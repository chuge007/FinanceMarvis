import { memo, useMemo } from 'react';
import type { DatedValue } from '../../../core/analysis/series';
import { corrPairNow } from '../../../core/data/overlaySeries';
import type { CorrPair } from '../../../core/data/overlayCatalog';
import { OVERLAY_BY_ID } from '../../../core/data/overlayCatalog';

const UP = '#f04452';
const DOWN = '#0ca678';
const MUTED = '#4d5364';

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function colorOf(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return MUTED;
  if (v > 0.05) return UP;
  if (v < -0.05) return DOWN;
  return '#8a8f9d';
}

interface Props {
  pairs: CorrPair[];
  series: Record<string, DatedValue[]>;
  window: number;
  presetId: string | null;
}

export const OverlayCorrTable = memo(function OverlayCorrTable({ pairs, series, window, presetId }: Props) {
  const rows = useMemo(
    () =>
      pairs.map((pair) => {
        const a = series[pair.a] ?? [];
        const b = series[pair.b] ?? [];
        const stat = corrPairNow(a, b, window);
        return {
          ...pair,
          labelA: OVERLAY_BY_ID[pair.a]?.label ?? pair.a,
          labelB: OVERLAY_BY_ID[pair.b]?.label ?? pair.b,
          ...stat,
          ready: a.length > 20 && b.length > 20,
        };
      }),
    [pairs, series, window],
  );

  if (!pairs.length) return null;

  const qqq = rows.find((r) => r.a === 'QQQ' && r.b === 'DFII10');
  const spy = rows.find((r) => r.a === 'SPY' && r.b === 'DFII10');
  const diff =
    qqq?.current !== null && qqq?.current !== undefined && spy?.current !== null && spy?.current !== undefined
      ? qqq.current - spy.current
      : null;

  return (
    <div className="mt-2 rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[0.5938rem] font-medium text-[#b0b5c0]">滚动相关 · {window}D（变化率）</span>
        <span className="text-[0.5313rem] text-[#4d5364]">−1 ~ +1；符号比绝对值重要</span>
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div key={`${r.a}-${r.b}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.5938rem]">
            <span className="min-w-[9.5rem] text-[#8a8f9d]">
              {r.labelA} <span className="text-[#3a4050]">↔</span> {r.labelB}
            </span>
            <span className="font-mono tabular-nums" style={{ color: colorOf(r.current) }}>
              {r.ready ? fmt(r.current) : '缺'}
            </span>
            <span className="font-mono text-[0.5313rem] text-[#636878] tabular-nums">
              60D前 {r.ready ? fmt(r.previous) : '—'} · Δ {r.ready ? fmt(r.delta) : '—'}
            </span>
            {r.note && <span className="text-[0.5313rem] text-[#4d5364]">{r.note}</span>}
          </div>
        ))}
      </div>

      {presetId === 'qqqRate' && (
        <div className="mt-1.5 border-t border-[#1a1d26] pt-1 text-[0.5625rem] text-[#8a8f9d]">
          纳指−标普敏感度差：
          <span className="ml-1 font-mono" style={{ color: colorOf(diff) }}>
            {diff === null ? '缺' : `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`}
          </span>
          <span className="ml-1 text-[#4d5364]">
            {diff === null
              ? '数据不足'
              : diff > 0
                ? '纳指相对标普更不抗利率，久期溢价在收窄'
                : '纳指相对标普更抗利率，久期溢价仍在'}
          </span>
        </div>
      )}
    </div>
  );
});
