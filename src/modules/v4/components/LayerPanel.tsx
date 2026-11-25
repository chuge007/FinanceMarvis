import { memo, useMemo, useState } from 'react';
import type { NormalizedSeries, RhythmSnapshot } from '../../rhythm/services/rhythm';
import type { StructureSnapshot } from '../../../core/data/structure';
import type { Position, PortfolioSummary } from '../../../stores/usePortfolioStore';
import type { LayerId } from '../../../core/metrics/registry';
import { METRIC_COLOR } from '../../../core/metrics/registry';
import { alignToAxis, buildAxis, rollingCorrSeries } from '../../../core/analysis/series';
import { buildRegimeHistory, TONE_COLOR } from '../../../core/analysis/regimeHistory';
import { OverlayChart, type OverlaySeries } from '../../../core/charts/OverlayChart';
import { CorrelationStrip } from '../../../core/charts/CorrelationStrip';

const ENV_IDS = ['VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS', 'DGS10', 'T10Y2Y', 'FG'] as const;
const ENV_LABEL: Record<string, string> = {
  VIXCLS: 'VIX',
  BAMLH0A0HYM2: '信用利差',
  DTWEXBGS: '美元',
  DGS10: '10Y',
  T10Y2Y: '期限利差(反向)',
  FG: '情绪(FG)',
};

const TABS: { id: LayerId; label: string }[] = [
  { id: 'environment', label: '环境' },
  { id: 'structure', label: '结构' },
  { id: 'position', label: '我方' },
];

const WINDOWS = [60, 120, 250, 500];

function pointsOf(snapshot: RhythmSnapshot | null, id: string): NormalizedSeries['points'] {
  return snapshot?.series?.[id]?.points ?? [];
}

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return values[i];
  return null;
}

function corrOnAxis(snapshot: RhythmSnapshot | null, a: string, b: string, axis: string[], window = 60): (number | null)[] {
  const result = rollingCorrSeries(pointsOf(snapshot, a), pointsOf(snapshot, b), window);
  const map = new Map(result.dates.map((d, i) => [d, result.values[i]]));
  return axis.map((d) => map.get(d) ?? null);
}

function EnvironmentLayer({ snapshot, days }: { snapshot: RhythmSnapshot | null; days: number }) {
  const dates = useMemo(
    () => buildAxis(ENV_IDS.map((id) => pointsOf(snapshot, id)), days),
    [snapshot, days],
  );

  const series = useMemo<OverlaySeries[]>(
    () =>
      ENV_IDS.map((id) => {
        const raw = alignToAxis(pointsOf(snapshot, id), dates, 'z');
        return {
          id,
          label: ENV_LABEL[id],
          values: id === 'T10Y2Y' ? raw.map((v) => (v === null ? null : -v)) : raw,
          color: METRIC_COLOR[id] ?? '#636878',
          dash: (id === 'BAMLH0A0HYM2' || id === 'T10Y2Y' ? 'dashed' : 'solid') as 'dashed' | 'solid',
        };
      }).filter((s) => s.values.some((v) => v !== null)),
    [snapshot, dates],
  );

  const history = useMemo(() => buildRegimeHistory(snapshot, Math.min(180, Math.max(60, days))), [snapshot, days]);
  const latest = series.map((s) => lastNonNull(s.values));
  const available = series.length;
  const missing = ENV_IDS.length - available;
  const adverse = latest.filter((v) => v !== null && v > 0.5).length;
  const benign = latest.filter((v) => v !== null && v < -0.5).length;

  return (
    <>
      <div className="mb-2 rounded border-l-2 border-[#4078ff] bg-[rgba(64,120,255,0.05)] px-2.5 py-1.5 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
        {snapshot
          ? `${available} 条可用${missing ? ` · 缺 ${missing} 条` : ''} · ${adverse} 条偏风险 · ${benign} 条偏宽松。多指标同向才提高可信度；只有一条动是背离。`
          : '真实序列不可用，暂不绘图。'}
      </div>
      <OverlayChart
        dates={dates}
        series={series}
        height="18rem"
        yLabel="滚动 Z-score（统一纵轴）"
        /* 默认只画三条：6 条同时铺在 250 个交易日上会看成一团乱麻，其余点击图例再加回来 */
        initialHidden={['DTWEXBGS', 'DGS10', 'T10Y2Y']}
      />
      {history.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[0.5625rem] text-[#4d5364]">
            <span>体制历史带 · 同权重重放近 {history.length} 个交易日</span>
            <span>{history[history.length - 1]?.tone ?? '—'} · {history[history.length - 1]?.score ?? '—'}</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-[0.125rem] bg-[#1a1d26]">
            {history.map((p) => (
              <div
                key={p.date}
                className="h-full flex-1"
                style={{ background: p.tone ? TONE_COLOR[p.tone] : '#1a1d26' }}
                title={`${p.date} · ${p.tone ?? '不可用'} · ${p.score ?? '—'}`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function StructureLayer({ snapshot, structure }: { snapshot: RhythmSnapshot | null; structure: StructureSnapshot | null }) {
  const axis = useMemo(
    () =>
      buildAxis(
        ['VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS', 'T10Y2Y', 'DGS10'].map((id) => pointsOf(snapshot, id)),
        180,
      ),
    [snapshot],
  );

  const pairs = [
    { a: 'BAMLH0A0HYM2', b: 'VIXCLS', label: '信用 ↔ 波动' },
    { a: 'DTWEXBGS', b: 'VIXCLS', label: '美元 ↔ 风险' },
    { a: 'T10Y2Y', b: 'DGS10', label: '曲线 ↔ 长端' },
  ];

  const rows = structure?.source === 'real' ? [...(structure.top ?? []), ...(structure.bottom ?? [])] : [];
  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.rs20 ?? 0)), 1);

  return (
    <>
      <div className="mb-2 rounded border-l-2 border-[#20c4d8] bg-[rgba(32,196,216,0.05)] px-2.5 py-1.5 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
        {structure?.source === 'real'
          ? `板块宽度 ${structure.breadth === null ? '—' : Math.round(structure.breadth)}/100 · 离散度 ${structure.dispersion === null ? '—' : structure.dispersion.toFixed(1)}pp · ${structure.note}`
          : structure?.note ?? '结构数据加载中'}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[0.625rem] text-[#636878]">相关性条带（60 日 · 变化率）</div>
          <div className="space-y-1">
            {pairs.map((p) => {
              const values = corrOnAxis(snapshot, p.a, p.b, axis, 60);
              return (
                <div key={p.label}>
                  <div className="flex items-center justify-between text-[0.5625rem]">
                    <span className="text-[#8a8f9d]">{p.label}</span>
                    <span className="font-mono text-[#636878] tabular-nums">
                      {lastNonNull(values) === null ? '—' : (lastNonNull(values) as number).toFixed(2)}
                    </span>
                  </div>
                  <CorrelationStrip dates={axis} values={values} label={p.label} height={54} />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[0.625rem] text-[#636878]">
            <span>板块相对强弱（{structure?.market === 'CN' ? '20 日涨跌' : '20 日 vs 基准'}）</span>
            <span className="text-[0.5313rem] text-[#4d5364]">
              {structure?.market === 'CN'
                ? structure.note.includes('腾讯')
                  ? '腾讯行业'
                  : structure.note.includes('新浪')
                    ? '新浪板块'
                    : '东财快照'
                : 'ETF 真实日线'}
            </span>
          </div>
          {rows.length ? (
            <div className="space-y-1">
              {rows.map((r) => {
                const v = r.rs20 ?? 0;
                const positive = v >= 0;
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="w-[3.25rem] shrink-0 truncate text-[0.5938rem] text-[#b0b5c0]" title={r.name}>
                      {r.name}
                    </span>
                    <div className="relative h-[0.4375rem] flex-1 rounded bg-[#151922]">
                      <div
                        className="absolute top-0 h-full rounded"
                        style={{
                          left: positive ? '50%' : `${50 - (Math.abs(v) / maxAbs) * 48}%`,
                          width: `${(Math.abs(v) / maxAbs) * 48}%`,
                          background: positive ? '#f04452' : '#0ca678',
                          opacity: 0.75,
                        }}
                      />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-[#2a3040]" />
                    </div>
                    <span className="w-[2.75rem] shrink-0 text-right font-mono text-[0.5625rem] tabular-nums" style={{ color: positive ? '#f04452' : '#0ca678' }}>
                      {v >= 0 ? '+' : ''}{v.toFixed(1)}pp
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-[0.625rem] text-[#4d5364]">
              {structure?.source === 'unavailable' ? structure.note : '板块数据加载中…'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PositionLayer({
  positions,
  summary,
  targetEquityPct,
}: {
  positions: Position[];
  summary: PortfolioSummary;
  targetEquityPct: number;
}) {
  const totalAssets = summary.totalAssets;
  const equity = totalAssets > 0 ? (summary.totalValue / totalAssets) * 100 : 0;
  const cash = Math.max(0, 100 - equity);
  const gap = equity - targetEquityPct;
  const weights = positions.map((p) => p.weight).filter((w) => w > 0);
  const maxWeight = weights.length ? Math.max(...weights) : 0;
  const hhi = weights.length ? weights.reduce((a, w) => a + (w / 100) ** 2, 0) : 0;
  const top3 = [...weights].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const sorted = [...positions].sort((a, b) => b.weight - a.weight);

  if (!positions.length) {
    return (
      <div className="flex h-[17.5rem] flex-col items-center justify-center gap-2 text-center">
        <div className="text-[0.75rem] text-[#b0b5c0]">还没有持仓数据</div>
        <div className="max-w-[22.5rem] text-[0.625rem] leading-relaxed text-[#636878]">
          到「决策 → 持仓与暴露」录入后，这里会显示权益仓位与目标带的偏离、集中度、前三大持仓。
          没有数据时不使用示例值替代。
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] p-2.5">
        <div className="mb-1 flex items-center justify-between text-[0.625rem]">
          <span className="text-[#8a8f9d]">权益仓位 vs 目标带</span>
          <span className="font-mono tabular-nums" style={{ color: Math.abs(gap) > 5 ? '#f59e4b' : '#0ca678' }}>
            {equity.toFixed(1)}% / 目标 {targetEquityPct.toFixed(0)}%
          </span>
        </div>
        <div className="relative h-3 w-full rounded bg-[#151922]">
          <div
            className="absolute top-0 h-full rounded bg-[rgba(64,120,255,0.18)]"
            style={{ left: `${Math.max(0, targetEquityPct - 5)}%`, width: '10%' }}
            title="目标带 ±5pp"
          />
          <div
            className="absolute top-[-0.1875rem] h-[1.125rem] w-[0.1875rem] rounded"
            style={{ left: `${Math.max(0, Math.min(100, equity))}%`, background: Math.abs(gap) > 5 ? '#f59e4b' : '#0ca678' }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[0.5313rem] text-[#4d5364]">
          <span>0%</span>
          <span>偏离 {gap >= 0 ? '+' : ''}{gap.toFixed(1)}pp · 现金 {cash.toFixed(1)}%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {[
          { k: '持仓数', v: String(positions.length) },
          { k: '前三大', v: `${top3.toFixed(0)}%` },
          { k: '最大单票', v: `${maxWeight.toFixed(0)}%` },
          { k: '有效持仓', v: hhi > 0 ? (1 / hhi).toFixed(1) : '—' },
        ].map((s) => (
          <div key={s.k} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] px-2 py-1.5">
            <div className="text-[0.5313rem] text-[#4d5364]">{s.k}</div>
            <div className="font-mono text-[0.75rem] text-[#d8dce6] tabular-nums">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="max-h-[11.875rem] space-y-1 overflow-y-auto pr-1">
        {sorted.slice(0, 10).map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-[5.125rem] shrink-0 truncate text-[0.5938rem] text-[#b0b5c0]" title={p.name}>{p.name}</span>
            <div className="h-[0.375rem] flex-1 rounded bg-[#151922]">
              <div className="h-full rounded bg-[#4078ff]" style={{ width: `${Math.min(100, p.weight)}%`, opacity: 0.75 }} />
            </div>
            <span className="w-[2.375rem] shrink-0 text-right font-mono text-[0.5625rem] text-[#8a8f9d] tabular-nums">{p.weight.toFixed(1)}%</span>
            <span className="w-[2.875rem] shrink-0 text-right font-mono text-[0.5625rem] tabular-nums" style={{ color: p.pnlPercent >= 0 ? '#f04452' : '#0ca678' }}>
              {p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  snapshot: RhythmSnapshot | null;
  structure: StructureSnapshot | null;
  positions: Position[];
  summary: PortfolioSummary;
  targetEquityPct: number;
  layer: LayerId;
  onLayerChange: (layer: LayerId) => void;
}

export const LayerPanel = memo(function LayerPanel({
  snapshot,
  structure,
  positions,
  summary,
  targetEquityPct,
  layer,
  onLayerChange,
}: Props) {
  const [days, setDays] = useState(120);

  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onLayerChange(t.id)}
              className={`rounded px-2.5 py-1 text-[0.6563rem] transition-colors ${
                layer === t.id ? 'bg-[#4078ff] text-white' : 'text-[#8a8f9d] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-1 text-[0.5625rem] text-[#4d5364]">一次只看一层</span>
        </div>

        {layer === 'environment' && (
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setDays(w)}
                className={`rounded px-1.5 py-0.5 text-[0.5625rem] ${
                  days === w ? 'bg-[rgba(255,255,255,0.08)] text-[#d8dce6]' : 'text-[#4d5364] hover:text-[#8a8f9d]'
                }`}
              >
                {w >= 250 ? `${Math.round(w / 250)}Y` : `${w}D`}
              </button>
            ))}
          </div>
        )}
      </div>

      {layer === 'environment' && <EnvironmentLayer snapshot={snapshot} days={days} />}
      {layer === 'structure' && <StructureLayer snapshot={snapshot} structure={structure} />}
      {layer === 'position' && (
        <PositionLayer positions={positions} summary={summary} targetEquityPct={targetEquityPct} />
      )}
    </div>
  );
});
