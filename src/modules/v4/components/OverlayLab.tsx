import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { RhythmSnapshot } from '../../rhythm/services/rhythm';
import { DAILY_METRICS, METRIC_COLOR } from '../../../core/metrics/registry';
import { alignToAxis, buildAxis, latestZ, rollingCorrSeries, zDelta, type DatedValue } from '../../../core/analysis/series';
import { OverlayChart, type OverlaySeries } from '../../../core/charts/OverlayChart';
import { CorrelationStrip } from '../../../core/charts/CorrelationStrip';
import { benchmarkLabel, fetchBenchmarkPoints } from '../../../services/benchmark';
import { useAppStore } from '../../../stores/useAppStore';
import { usePositioningStore } from '../../../stores/usePositioningStore';

const PRESETS: { id: string; label: string; ids: string[]; note: string }[] = [
  {
    id: 'risk',
    label: '风险温度',
    ids: ['VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS', 'DGS10', 'T10Y2Y', 'FG'],
    note: '波动、信用、美元、利率、曲线、情绪放在同一条 Z 轴上。',
  },
  {
    id: 'credit',
    label: '信用-波动',
    ids: ['BAMLH0A0HYM2', 'VIXCLS'],
    note: '信用利差先走、VIX 未跟，是最常见的背离组合。',
  },
  {
    id: 'dollar',
    label: '美元潮汐',
    ids: ['DTWEXBGS', 'BAMLH0A0HYM2'],
    note: '美元走强是否同步抬升信用利差，判断全球流动性松紧。',
  },
  {
    id: 'sentiment',
    label: '情绪-价格',
    ids: ['FG', 'VIXCLS'],
    note: '情绪极端与波动率是否同步，避免只看一个读数。',
  },
  {
    id: 'curve',
    label: '曲线-长端',
    ids: ['T10Y2Y', 'DGS10'],
    note: '倒挂后重新陡峭化，往往才是压力显现的阶段。',
  },
  {
    id: 'term',
    label: '期限结构',
    ids: ['VIXCLS', 'VIX_TERM'],
    note: 'VIX÷VIX3M 抬头（尤其越过 1）说明市场开始为眼前风险定价，常先于 VIX 绝对水平变化。',
  },
];

/** 派生序列（不在宏观指标表里），单独维护名称与颜色。 */
const EXTRA_META: Record<string, { name: string; color: string }> = {
  VIX_TERM: { name: '期限结构', color: '#f7d44c' },
  BENCH: { name: '大盘基准', color: '#e8ebf0' },
};

const DEFAULT_IDS = ['VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS', 'T10Y2Y', 'FG'];
const WINDOWS = [120, 250, 500];
const BENCH_COLOR = '#e8ebf0';

function pointsOf(snapshot: RhythmSnapshot | null, id: string) {
  return snapshot?.series?.[id]?.points ?? [];
}

interface Props {
  snapshot: RhythmSnapshot | null;
}

export const OverlayLab = memo(function OverlayLab({ snapshot }: Props) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_IDS);
  const [days, setDays] = useState(250);
  const [corrWindow, setCorrWindow] = useState(60);

  const market = useAppStore((s) => s.market);

  // 期限结构走 store 单例，和首页共用同一份数据，不额外发请求
  const term = usePositioningStore((s) => s.term);
  const loadPositioning = usePositioningStore((s) => s.load);

  useEffect(() => {
    void loadPositioning();
  }, [loadPositioning]);

  const termPoints = useMemo<DatedValue[]>(
    () => (term?.points ?? []).map((p) => ({ date: p.date, value: p.ratio, z: p.z })),
    [term],
  );

  const pointsFor = useCallback(
    (id: string): DatedValue[] => (id === 'VIX_TERM' ? termPoints : pointsOf(snapshot, id)),
    [snapshot, termPoints],
  );

  const [showBench, setShowBench] = useState(false);
  const [bench, setBench] = useState<DatedValue[]>([]);
  const [benchLoading, setBenchLoading] = useState(false);
  const [benchEmpty, setBenchEmpty] = useState(false);

  // 大盘基准按需加载：只在用户打开时才去拉一年日线，避免拖慢首屏
  useEffect(() => {
    if (!showBench) return;
    let alive = true;
    setBench([]);
    setBenchEmpty(false);
    setBenchLoading(true);
    fetchBenchmarkPoints(market)
      .then((points) => {
        if (!alive) return;
        setBench(points);
        setBenchEmpty(points.length === 0);
      })
      .catch(() => {
        if (!alive) return;
        setBench([]);
        setBenchEmpty(true);
      })
      .finally(() => {
        if (alive) setBenchLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showBench, market]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('marvis.research.pair');
      if (!raw) return;
      const pair = JSON.parse(raw) as unknown;
      if (Array.isArray(pair) && pair.length === 2 && pair.every((x) => typeof x === 'string')) {
        setSelected(pair as string[]);
      }
      window.localStorage.removeItem('marvis.research.pair');
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  };

  const dates = useMemo(
    () => buildAxis([...selected.map((id) => pointsFor(id)), showBench ? bench : []], days),
    [selected, days, showBench, bench, pointsFor],
  );

  const series = useMemo<OverlaySeries[]>(() => {
    const list = selected
      .map((id) => {
        const meta = DAILY_METRICS.find((m) => m.id === id);
        const extra = EXTRA_META[id];
        return {
          id,
          label: meta?.name.replace(/\s*\(.*\)/, '') ?? extra?.name ?? id,
          values: alignToAxis(pointsFor(id), dates, 'z'),
          color: METRIC_COLOR[id] ?? extra?.color ?? '#636878',
          dash: (meta?.phase === '领先' ? 'dashed' : 'solid') as 'dashed' | 'solid',
        };
      })
      .filter((s) => s.values.some((v) => v !== null));

    if (showBench && bench.length) {
      const benchValues = alignToAxis(bench, dates, 'z');
      if (benchValues.some((v) => v !== null)) {
        list.push({
          id: 'BENCH',
          label: benchmarkLabel(market),
          values: benchValues,
          color: BENCH_COLOR,
          dash: 'solid',
        });
      }
    }
    return list;
  }, [selected, dates, showBench, bench, market, pointsFor]);

  const benchChip = useMemo(() => {
    if (!showBench || !bench.length) return null;
    return { label: benchmarkLabel(market), z: latestZ(bench), dz: zDelta(bench) };
  }, [showBench, bench, market]);

  // 相关性只取“有数据”的前两条，避免默认组合里缺一条就整条不能算。
  const availableSelected = selected.filter((id) => pointsFor(id).length > 20);
  const corrPair = availableSelected.slice(0, 2);
  const corr = useMemo(() => {
    if (corrPair.length < 2) return { dates: [], values: [] };
    return rollingCorrSeries(pointsFor(corrPair[0]), pointsFor(corrPair[1]), corrWindow);
  }, [corrPair[0], corrPair[1], corrWindow, pointsFor]);

  const chips = selected.map((id) => {
    const points = pointsFor(id);
    const z = latestZ(points);
    const dz = zDelta(points);
    const meta = DAILY_METRICS.find((m) => m.id === id);
    const extra = EXTRA_META[id];
    return {
      id,
      label: meta?.name.replace(/\s*\(.*\)/, '') ?? extra?.name ?? id,
      z,
      dz,
      color: METRIC_COLOR[id] ?? extra?.color ?? '#636878',
    };
  });

  return (
    <div className="space-y-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">叠加实验室</h3>
            <p className="mt-0.5 text-[0.5938rem] text-[#636878]">
              所有线统一到滚动 Z 轴；最多 6 条。相关性单独放在图下，不用双 Y 轴。
            </p>
          </div>
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
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.ids)}
              title={p.note}
              className={`rounded border px-2 py-1 text-[0.5938rem] transition-colors ${
                JSON.stringify(selected) === JSON.stringify(p.ids)
                  ? 'border-[#4078ff] bg-[rgba(64,120,255,0.12)] text-[#d8dce6]'
                  : 'border-[#1a1d26] text-[#8a8f9d] hover:border-[#2a3040]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowBench((v) => !v)}
            title="把大盘指数也换算成滚动 Z 叠加进来，看资金面指标相对大盘处在什么位置"
            className={`rounded border px-2 py-1 text-[0.5938rem] transition-colors ${
              showBench
                ? 'border-[#e8ebf0] bg-[rgba(232,235,240,0.10)] text-[#e8ebf0]'
                : 'border-[#1a1d26] text-[#8a8f9d] hover:border-[#2a3040]'
            }`}
          >
            {benchLoading ? '加载大盘…' : benchEmpty ? '大盘暂不可用' : `+ 大盘基准（${benchmarkLabel(market)}）`}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {DAILY_METRICS.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className="flex items-center gap-1 text-[0.5625rem]"
                style={{ color: on ? '#d8dce6' : '#4d5364' }}
                title={m.explanation}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: on ? METRIC_COLOR[m.id] : '#2a3040' }}
                />
                {m.name.replace(/\s*\(.*\)/, '')}
              </button>
            );
          })}
          <span className="text-[0.5313rem] text-[#3a4050]">已选 {selected.length}/6</span>
        </div>
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.id} className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5625rem]" style={{ color: c.color }}>
              {c.label} Z {c.z === null ? '—' : c.z.toFixed(2)}
              {c.dz !== null && <span className="ml-1 text-[#636878]">20日 {c.dz >= 0 ? '+' : ''}{c.dz.toFixed(2)}σ</span>}
            </span>
          ))}
          {benchChip && (
            <span className="rounded border border-[#2a3040] px-2 py-1 text-[0.5625rem]" style={{ color: BENCH_COLOR }}>
              {benchChip.label} Z {benchChip.z === null ? '—' : benchChip.z.toFixed(2)}
              {benchChip.dz !== null && (
                <span className="ml-1 text-[#636878]">20日 {benchChip.dz >= 0 ? '+' : ''}{benchChip.dz.toFixed(2)}σ</span>
              )}
            </span>
          )}
        </div>

        <OverlayChart dates={dates} series={series} height="20rem" yLabel="滚动 Z-score（统一纵轴）" />

        {corrPair.length === 2 && (
          <div className="mt-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.5938rem] text-[#636878]">
                {chips.find((c) => c.id === corrPair[0])?.label} ↔ {chips.find((c) => c.id === corrPair[1])?.label} · 滚动相关（变化率）
              </span>
              <div className="flex items-center gap-1">
                {[20, 60, 120].map((w) => (
                  <button
                    key={w}
                    onClick={() => setCorrWindow(w)}
                    className={`rounded px-1 py-0.5 text-[0.5313rem] ${
                      corrWindow === w ? 'bg-[rgba(255,255,255,0.08)] text-[#d8dce6]' : 'text-[#4d5364]'
                    }`}
                  >
                    {w}D
                  </button>
                ))}
              </div>
            </div>
            <CorrelationStrip dates={corr.dates.slice(-Math.max(days, corrWindow))} values={corr.values.slice(-Math.max(days, corrWindow))} label="corr" height="5rem" />
          </div>
        )}
      </div>
    </div>
  );
});
