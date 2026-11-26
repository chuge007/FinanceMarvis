/**
 * 统一市场快照：全站只从这里取一次数据，避免每个页面各拉一遍、各算一套。
 */
import { create } from 'zustand';
import { buildRegime, fetchRhythm, type RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import { readJSON, writeJSON } from '../../shared/utils/localStore';

/** 上次快照落本地：冷启动先画旧图，再后台刷新，避免首屏白等。 */
const CACHE_KEY = 'marvis.snapshot.v1';

/**
 * 上游抖动时，用上一次成功读数补齐本次缺失项（7 天内），并标记 stale。
 * 目的：一次 FRED/Convex 超时不应该把传导链、体制分数和其它页面一起清空。
 */
function mergeSnapshot(prev: RhythmSnapshot | null, next: RhythmSnapshot): RhythmSnapshot {
  if (!prev) return next;
  const prevById = new Map(prev.indicators.map((i) => [i.id, i]));
  const indicators = next.indicators.map((item) => {
    if (item.source !== 'missing') return item;
    const old = prevById.get(item.id);
    if (old && old.source === 'real' && (old.freshnessDays ?? 999) <= 7) {
      return { ...old, stale: true };
    }
    return item;
  });

  const series = { ...next.series };
  for (const [id, old] of Object.entries(prev.series)) {
    if (!series[id] || series[id].points.length === 0) series[id] = old;
  }

  return { ...next, indicators, series, regime: buildRegime(indicators) };
}

interface SnapshotState {
  snapshot: RhythmSnapshot | null;
  loading: boolean;
  error: string | null;
  loadedAt: number;
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<RhythmSnapshot> | null = null;
const CACHE_MS = 60_000;

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshot: null,
  loading: false,
  error: null,
  loadedAt: 0,

  load: async (force = false) => {
    const { snapshot, loadedAt, loading } = get();
    if (loading) return;
    if (!force && snapshot && Date.now() - loadedAt < CACHE_MS) return;

    // 冷启动先渲染上次快照：哪怕上游慢，页面也不是空白；随后再被新数据覆盖
    if (!snapshot) {
      const cached = readJSON<RhythmSnapshot | null>(CACHE_KEY, null);
      if (cached && Array.isArray(cached.indicators)) {
        set({ snapshot: cached, loadedAt: 0 });
      }
    }

    set({ loading: true, error: null });
    try {
      if (!inflight) inflight = fetchRhythm();
      const next = await inflight;
      // 本次缺失项用上一次成功读数补齐（stale），避免一次上游超时清空全站。
      const merged = mergeSnapshot(get().snapshot, next);
      writeJSON(CACHE_KEY, merged);
      set({ snapshot: merged, loadedAt: Date.now(), loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '上游数据不可用',
      });
    } finally {
      inflight = null;
    }
  },
}));
