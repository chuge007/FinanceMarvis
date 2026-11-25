import { memo, useMemo, useState } from 'react';
import type { RhythmSnapshot } from '../../rhythm/services/rhythm';
import { DAILY_METRICS } from '../../../core/metrics/registry';
import { alignPair, crossCorrChanges, diff, rollingCorrSeries } from '../../../core/analysis/series';
import { pearson, spearman } from '../../../shared/utils/seriesStats';
import { OverlayChart } from '../../../core/charts/OverlayChart';
import { CorrelationStrip } from '../../../core/charts/CorrelationStrip';

function pointsOf(snapshot: RhythmSnapshot | null, id: string) {
  return snapshot?.series?.[id]?.points ?? [];
}

function shortName(id: string): string {
  return DAILY_METRICS.find((m) => m.id === id)?.name.replace(/\s*\(.*\)/, '') ?? id;
}

function cellColor(v: number | null): string {
  if (v === null) return 'rgba(99,104,120,0.08)';
  const a = Math.min(0.5, Math.abs(v) * 0.5 + 0.06);
  return v >= 0 ? `rgba(240,68,82,${a})` : `rgba(64,120,255,${a})`;
}

function pairCorr(
  snapshot: RhythmSnapshot | null,
  a: string,
  b: string,
  window: number,
  method: 'pearson' | 'spearman',
): number | null {
  const aligned = alignPair(pointsOf(snapshot, a), pointsOf(snapshot, b));
  const da = diff(aligned.a);
  const db = diff(aligned.b);
  const n = Math.min(da.length, db.length);
  if (n < Math.max(12, window)) return null;
  const fn = method === 'spearman' ? spearman : pearson;
  return fn(da.slice(-window), db.slice(-window));
}

function peakLagFrom(
  aPoints: ReturnType<typeof pointsOf>,
  bPoints: ReturnType<typeof pointsOf>,
): { lag: number; corr: number } | null {
  const points = crossCorrChanges(aPoints, bPoints, 20);
  let best: { lag: number; corr: number } | null = null;
  points.forEach((p) => {
    if (p.corr === null) return;
    if (!best || Math.abs(p.corr) > Math.abs(best.corr)) best = { lag: p.lag, corr: p.corr };
  });
  return best;
}

function peakLag(snapshot: RhythmSnapshot | null, a: string, b: string): { lag: number; corr: number } | null {
  return peakLagFrom(pointsOf(snapshot, a), pointsOf(snapshot, b));
}

interface Props {
  snapshot: RhythmSnapshot | null;
}

export const CorrelationLab = memo(function CorrelationLab({ snapshot }: Props) {
  const [window, setWindow] = useState(60);
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson');
  const [pairA, setPairA] = useState('VIXCLS');
  const [pairB, setPairB] = useState('FG');

  const daily = useMemo(
    () => DAILY_METRICS.filter((m) => pointsOf(snapshot, m.id).length >= window + 20),
    [snapshot, window],
  );

  const matrix = useMemo(() => {
    return daily.map((a) => daily.map((b) => (a.id === b.id ? 1 : pairCorr(snapshot, a.id, b.id, window, method))));
  }, [snapshot, daily, window, method]);

  const rolling = useMemo(
    () => rollingCorrSeries(pointsOf(snapshot, pairA), pointsOf(snapshot, pairB), window),
    [snapshot, pairA, pairB, window],
  );

  const lag = useMemo(() => {
    const points = crossCorrChanges(pointsOf(snapshot, pairA), pointsOf(snapshot, pairB), 20);
    return { points, peak: peakLag(snapshot, pairA, pairB) };
  }, [snapshot, pairA, pairB]);

  const stability = useMemo(() => {
    const a = pointsOf(snapshot, pairA);
    const b = pointsOf(snapshot, pairB);
    if (a.length < 80 || b.length < 80) return null;
    const mid = Math.floor(a.length / 2);
    const p1 = peakLagFrom(a.slice(0, mid), b.slice(0, mid));
    const p2 = peakLagFrom(a.slice(mid), b.slice(mid));
    if (!p1 || !p2) return null;
    return Math.abs(p1.lag - p2.lag) <= 10;
  }, [snapshot, pairA, pairB]);

  const matrixRows = matrix.map((row) => row);

  return (
    <div className="space-y-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">相关性矩阵</h3>
            <p className="mt-0.5 text-[0.5938rem] text-[#636878]">
              用收益率/一阶差分算，不用价格水平；颜色和数字同时显示。
            </p>
          </div>
          <div className="flex items-center gap-1">
            {[20, 60, 120].map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`rounded px-1.5 py-0.5 text-[0.5625rem] ${
                  window === w ? 'bg-[#4078ff] text-white' : 'text-[#4d5364]'
                }`}
              >
                {w}D
              </button>
            ))}
            <button
              onClick={() => setMethod(method === 'pearson' ? 'spearman' : 'pearson')}
              className="rounded border border-[#1a1d26] px-1.5 py-0.5 text-[0.5625rem] text-[#8a8f9d]"
            >
              {method === 'pearson' ? 'Pearson' : 'Spearman'}
            </button>
          </div>
        </div>

        {daily.length < 2 ? (
          <div className="flex h-24 items-center justify-center text-[0.625rem] text-[#4d5364]">
            真实日度序列不足，无法计算相关性。
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-auto border-collapse text-[0.5625rem] tabular-nums">
              <thead>
                <tr>
                  <th className="w-[4.75rem] py-1 text-left font-normal text-[#4d5364]" />
                  {daily.map((m) => (
                    <th key={m.id} className="w-[4rem] px-1 py-1 text-center font-normal text-[#636878]">
                      {shortName(m.id).slice(0, 4)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daily.map((a, i) => (
                  <tr key={a.id}>
                    <td className="w-[4.75rem] whitespace-nowrap py-1 pr-2 text-[#636878]">{shortName(a.id).slice(0, 6)}</td>
                    {daily.map((b, j) => {
                      const v = matrixRows[i][j];
                      return (
                        <td
                          key={b.id}
                          className="w-[4rem] px-1 py-1 text-center font-mono text-[#d8dce6]"
                          style={{ background: cellColor(v) }}
                          title={`${shortName(a.id)} ↔ ${shortName(b.id)}`}
                        >
                          {v === null ? '—' : v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">滚动相关</h3>
            <div className="flex items-center gap-1">
              <select value={pairA} onChange={(e) => setPairA(e.target.value)} className="rounded border border-[#1a1d26] bg-[#090b0f] px-1 py-0.5 text-[0.5625rem] text-[#b0b5c0]">
                {DAILY_METRICS.map((m) => <option key={m.id} value={m.id}>{shortName(m.id)}</option>)}
              </select>
              <span className="text-[0.5625rem] text-[#4d5364]">↔</span>
              <select value={pairB} onChange={(e) => setPairB(e.target.value)} className="rounded border border-[#1a1d26] bg-[#090b0f] px-1 py-0.5 text-[0.5625rem] text-[#b0b5c0]">
                {DAILY_METRICS.map((m) => <option key={m.id} value={m.id}>{shortName(m.id)}</option>)}
              </select>
            </div>
          </div>
          <CorrelationStrip
            dates={rolling.dates.slice(-250)}
            values={rolling.values.slice(-250)}
            label={`${shortName(pairA)} ↔ ${shortName(pairB)}`}
            height={150}
          />
          <div className="mt-1 text-[0.5625rem] leading-relaxed text-[#636878]">
            0 线以上为同向，以下为反向；符号翻转往往比数值大小更值得注意。
          </div>
        </div>

        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">领先-滞后</h3>
            <span className="text-[0.5625rem] text-[#4d5364]">lag &gt; 0：A 滞后于 B</span>
          </div>
          {lag.peak ? (
            <>
              <div className="mb-1 text-[0.625rem] text-[#b0b5c0]">
                峰值：lag {lag.peak.lag > 0 ? '+' : ''}{lag.peak.lag} 天 · 相关 {lag.peak.corr.toFixed(2)}
                {stability === false && <span className="ml-2 text-[#f59e4b]">前后半段不一致，别当规律</span>}
                {stability === true && <span className="ml-2 text-[#0ca678]">前后半段较稳定</span>}
              </div>
              <OverlayChart
                dates={lag.points.map((p) => `lag${p.lag}`)}
                series={[
                  {
                    id: 'lag',
                    label: '交叉相关',
                    values: lag.points.map((p) => p.corr),
                    color: '#9b6efb',
                    dash: 'solid',
                  },
                ]}
                height={150}
                yLabel="相关系数"
                yMin={-1}
                yMax={1}
              />
            </>
          ) : (
            <div className="flex h-40 items-center justify-center text-[0.625rem] text-[#4d5364]">样本不足</div>
          )}
        </div>
      </div>
    </div>
  );
});
