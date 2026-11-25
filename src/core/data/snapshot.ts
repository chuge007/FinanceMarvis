/**
 * 统一市场快照：全站只从这里取一次数据，避免每个页面各拉一遍、各算一套。
 */
import { create } from 'zustand';
import { fetchRhythm, type RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import { readJSON, writeJSON } from '../../shared/utils/localStore';

/** 上次快照落本地：冷启动先画旧图，再后台刷新，避免首屏白等。 */
const CACHE_KEY = 'marvis.snapshot.v1';

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
      writeJSON(CACHE_KEY, next);
      set({ snapshot: next, loadedAt: Date.now(), loading: false, error: null });
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
