import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { DatedValue } from '../../../core/analysis/series';
import { alignToAxis, buildAxis, latestZ, zDelta } from '../../../core/analysis/series';
import { OverlayChart, type OverlaySeries } from '../../../core/charts/OverlayChart';
import { OverlayCorrTable } from './OverlayCorrTable';
import {
  DEFAULT_OVERLAY_IDS,
  OVERLAY_BY_ID,
  OVERLAY_DEFS,
  OVERLAY_PRESETS,
  PRESET_CORR_PAIRS,
  type OverlayDef,
} from '../../../core/data/overlayCatalog';
import { useOverlaySeriesStore } from '../../../stores/useOverlaySeriesStore';
import { useAppStore } from '../../../stores/useAppStore';
import { fetchIndexPoints, indexDef, indexOptions, type IndexDef } from '../../../services/benchmark';

const WINDOWS = [120, 250, 500];
const MAX_LINES = 6;

const GROUP_LABEL: Record<OverlayDef['group'], string> = {
  rates: '利率 / 通胀',
  credit: '信用 / 波动',
  liquidity: '金融条件 / 流动性',
  equity: '美股指数',
  factor: '派生因子',
};

function isUsable(id: string): boolean {
  return Boolean(OVERLAY_BY_ID[id]) && OVERLAY_BY_ID[id].axis === 'z';
}

export const OverlayLab = memo(function OverlayLab() {
  const market = useAppStore((s) => s.market);
  const { series, loading, load } = useOverlaySeriesStore();

  const [selected, setSelected] = useState<string[]>(DEFAULT_OVERLAY_IDS);
  const [presetId, setPresetId] = useState<string | null>('duration');
  const [days, setDays] = useState(250);
  const [corrWindow, setCorrWindow] = useState(60);

  // CN 指数仍走原有口径；美股指数已经放进序列目录（SPY/QQQ/SMH/IWM）
  const [benchIds, setBenchIds] = useState<string[]>([]);
  const [benchMap, setBenchMap] = useState<Record<string, DatedValue[]>>({});
  const [benchLoading, setBenchLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('marvis.research.pair');
      if (!raw) return;
      const pair = JSON.parse(raw) as unknown;
      if (Array.isArray(pair) && pair.length === 2 && pair.every((x) => typeof x === 'string')) {
        const valid = pair.filter(isUsable);
        if (valid.length) {
          setSelected(valid);
          setPresetId(null);
        }
      }
      window.localStorage.removeItem('marvis.research.pair');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setBenchIds(market === 'CN' ? ['CSI300', 'CYB'] : []);
  }, [market]);

  const benchDefs = useMemo<IndexDef[]>(
    () => benchIds.map((id) => indexDef(id)).filter((d): d is IndexDef => Boolean(d)),
    [benchIds],
  );

  useEffect(() => {
    if (!benchDefs.length) return;
    const missing = benchDefs.filter((d) => !benchMap[d.id]);
    if (!missing.length) return;
    let alive = true;
    setBenchLoading(true);
    Promise.all(missing.map((d) => fetchIndexPoints(d).then((points) => [d.id, points] as const)))
      .then((list) => {
        if (!alive) return;
        setBenchMap((prev) => {
          const next = { ...prev };
          list.forEach(([id, points]) => {
            next[id] = points;
          });
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBenchLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [benchDefs, benchMap]);

  const benchPoints = useMemo(
    () => benchDefs.map((def) => ({ def, points: benchMap[def.id] ?? [] })).filter((b) => b.points.length > 0),
    [benchDefs, benchMap],
  );

  const preset = OVERLAY_PRESETS.find((p) => p.id === presetId) ?? null;
  const corrPairs = useMemo(
    () => (presetId ? PRESET_CORR_PAIRS[presetId] ?? [] : []),
    [presetId],
  );

  // 只加载「图上要画的 + 相关表要算的」，不预取全量
  useEffect(() => {
    const ids = [...selected, ...corrPairs.flatMap((p) => [p.a, p.b])];
    void load(ids);
  }, [selected, corrPairs, load]);

  const pointsFor = useCallback((id: string): DatedValue[] => series[id] ?? [], [series]);

  const dates = useMemo(
    () => buildAxis([...selected.map(pointsFor), ...benchPoints.map((b) => b.points)], days),
    [selected, days, benchPoints, pointsFor],
  );

  const chartSeries = useMemo<OverlaySeries[]>(() => {
    const list = selected
      .filter((id) => OVERLAY_BY_ID[id]?.axis === 'z')
      .map((id) => {
        const def = OVERLAY_BY_ID[id];
        const values = alignToAxis(pointsFor(id), dates, 'z');
        return {
          id,
          label: def.label,
          values,
          color: def.color,
          dash: (def.frequency === 'weekly' ? 'dashed' : 'solid') as 'dashed' | 'solid',
        };
      })
      .filter((s) => s.values.some((v) => v !== null));

    benchPoints.forEach(({ def, points }) => {
      const values = alignToAxis(points, dates, 'z');
      if (values.some((v) => v !== null)) {
        list.push({ id: `IDX_${def.id}`, label: def.label, values, color: def.color, dash: 'solid' });
      }
    });
    return list;
  }, [selected, dates, benchPoints, pointsFor]);

  const chips = useMemo(
    () =>
      selected
        .filter((id) => OVERLAY_BY_ID[id]?.axis === 'z')
        .map((id) => {
          const def = OVERLAY_BY_ID[id];
          const points = pointsFor(id);
          return {
            id,
            label: def.label,
            color: def.color,
            z: latestZ(points),
            dz: zDelta(points),
            ready: points.length > 20,
          };
        }),
    [selected, pointsFor],
  );

  const missingLabels = useMemo(() => {
    const out: string[] = [];
    selected.forEach((id) => {
      const points = pointsFor(id);
      if (!points.some((p) => p.z !== null && p.z !== undefined)) {
        out.push(OVERLAY_BY_ID[id]?.label ?? id);
      }
    });
    benchDefs.forEach((def) => {
      const loaded = benchMap[def.id];
      if (loaded && loaded.length === 0) out.push(def.label);
    });
    return out;
  }, [selected, pointsFor, benchDefs, benchMap]);

  const toggle = (id: string) => {
    setPresetId(null);
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.length <= 1 ? prev : prev.filter((x) => x !== id);
      }
      return prev.length >= MAX_LINES ? prev : [...prev, id];
    });
  };

  const applyPreset = (id: string) => {
    const p = OVERLAY_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setSelected(p.ids);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">叠加实验室</h3>
            <p className="mt-0.5 text-[0.5938rem] text-[#636878]">
              宏观/指数线统一滚动 Z；相关系数单独 −1~1 面板，不混轴。宏观最多 6 条、指数最多 5 条。
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
          {OVERLAY_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              title={p.note}
              className={`rounded border px-2 py-1 text-[0.5938rem] transition-colors ${
                presetId === p.id
                  ? 'border-[#4078ff] bg-[rgba(64,120,255,0.12)] text-[#d8dce6]'
                  : 'border-[#1a1d26] text-[#8a8f9d] hover:border-[#2a3040]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset?.note && (
          <p className="mt-1.5 text-[0.5625rem] leading-relaxed text-[#636878]">{preset.note}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[0.5313rem] text-[#3a4050]">已选 {selected.length}/{MAX_LINES}</span>
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="flex items-center gap-1 rounded border border-[#1a1d26] px-2 py-0.5 text-[0.5625rem]"
              style={{ color: c.color }}
              title="点击移除"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
              <span className="text-[#3a4050]">×</span>
            </button>
          ))}
          {loading && <span className="text-[0.5313rem] text-[#3a4050]">取数中…</span>}
        </div>

        <details className="mt-2">
          <summary className="cursor-pointer text-[0.5625rem] text-[#4d5364] hover:text-[#8a8f9d]">
            添加序列（按需取数，不会一次性拉全量）
          </summary>
          <div className="mt-1.5 space-y-1">
            {(Object.keys(GROUP_LABEL) as OverlayDef['group'][]).map((group) => (
              <div key={group} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="w-[5.5rem] shrink-0 text-[0.5313rem] text-[#3a4050]">{GROUP_LABEL[group]}</span>
                {OVERLAY_DEFS.filter((d) => d.group === group && d.axis === 'z').map((d) => {
                  const on = selected.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggle(d.id)}
                      className="flex items-center gap-1 text-[0.5625rem]"
                      style={{ color: on ? '#d8dce6' : '#4d5364' }}
                      title={d.note}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: on ? d.color : '#2a3040' }}
                      />
                      {d.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </details>

        {market === 'CN' && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[0.5313rem] text-[#3a4050]">A 股指数</span>
            {indexOptions(market).map((o) => {
              const on = benchIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    setBenchIds((prev) => {
                      if (prev.includes(o.id)) return prev.length <= 1 ? prev : prev.filter((x) => x !== o.id);
                      return prev.length >= 3 ? prev : [...prev, o.id];
                    });
                  }}
                  title={o.note}
                  className="rounded border px-2 py-1 text-[0.5938rem] transition-colors"
                  style={{ borderColor: on ? `${o.color}88` : '#1a1d26', color: on ? o.color : '#8a8f9d' }}
                >
                  {o.label}
                </button>
              );
            })}
            {benchLoading && <span className="text-[0.5313rem] text-[#3a4050]">取数中…</span>}
          </div>
        )}
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.id} className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5625rem]" style={{ color: c.color }}>
              {c.label} Z {c.z === null ? '—' : c.z.toFixed(2)}
              {c.dz !== null && <span className="ml-1 text-[#636878]">20日 {c.dz >= 0 ? '+' : ''}{c.dz.toFixed(2)}σ</span>}
            </span>
          ))}
          {benchPoints.map(({ def, points }) => (
            <span key={def.id} className="rounded border border-[#2a3040] px-2 py-1 text-[0.5625rem]" style={{ color: def.color }}>
              {def.label} Z {latestZ(points) === null ? '—' : latestZ(points)!.toFixed(2)}
            </span>
          ))}
        </div>

        <OverlayChart dates={dates} series={chartSeries} height="20rem" yLabel="滚动 Z-score（统一纵轴）" />

        <OverlayCorrTable pairs={corrPairs} series={series} window={corrWindow} presetId={presetId} />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.5313rem] text-[#4d5364]">
            相关窗口
            {[20, 60, 120].map((w) => (
              <button
                key={w}
                onClick={() => setCorrWindow(w)}
                className={`ml-1 rounded px-1 py-0.5 text-[0.5313rem] ${
                  corrWindow === w ? 'bg-[rgba(255,255,255,0.08)] text-[#d8dce6]' : 'text-[#4d5364]'
                }`}
              >
                {w}D
              </button>
            ))}
          </span>
          <span className="text-[0.5313rem] text-[#4d5364]">
            相关用变化率（价格对数收益、利率一阶差分），不拿水平值硬算
          </span>
        </div>

        {missingLabels.length > 0 && (
          <p className="mt-1 text-[0.5625rem] text-[#f59e4b]">
            未取到数据（未画入图中）：{missingLabels.join('、')}。多数是上游暂时不可达或该序列当天无值，刷新可重试。
          </p>
        )}
      </div>
    </div>
  );
});
