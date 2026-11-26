/**
 * 全球地形数据单例：首页只订阅这一份，避免每次渲染重复拉 20 多条行情。
 *
 * 与快照的关系：跨资产里 VIX / HY OAS / 10Y / 曲线 / 情绪来自 rhythm 快照，
 * 所以 rhythm.fetchedAt 变化时会就地重算（原始行情仍在 5 分钟缓存里，不重复请求）。
 */
import { create } from 'zustand';
import { fetchCrossAsset, recomputeCrossAsset, type CrossAssetSnapshot } from '../core/data/crossAsset';
import { useSnapshotStore } from '../core/data/snapshot';
import { usePositioningStore } from './usePositioningStore';
import { readJSON, writeJSON } from '../shared/utils/localStore';

const TTL = 5 * 60_000;
const CACHE_KEY = 'marvis.crossAsset.v1';
const cached = readJSON<CrossAssetSnapshot | null>(CACHE_KEY, null);

interface CrossAssetState {
  snapshot: CrossAssetSnapshot | null;
  loading: boolean;
  error: string | null;
  loadedAt: number;
  rhythmAt: string | null;
  optionsAt: string | null;
  load: (force?: boolean) => Promise<void>;
  /** 只用已有原始缓存重新合成，不发网络请求。 */
  recompute: () => void;
}

let inflight: Promise<CrossAssetSnapshot> | null = null;

export const useCrossAssetStore = create<CrossAssetState>((set, get) => ({
  // 冷启动先渲染上次快照：先看到图，再后台刷新；loadedAt=0 会强制走一次网络。
  snapshot: cached && Array.isArray(cached.readings) ? cached : null,
  loading: false,
  error: null,
  loadedAt: 0,
  rhythmAt: null,
  optionsAt: null,

  load: async (force = false) => {
    const { snapshot, loadedAt, loading, rhythmAt, optionsAt } = get();
    const rhythm = useSnapshotStore.getState().snapshot;
    const options = usePositioningStore.getState().options;

    if (loading) return;
    if (
      !force &&
      snapshot &&
      Date.now() - loadedAt < TTL &&
      rhythm?.fetchedAt === rhythmAt &&
      (options?.generatedAt ?? null) === optionsAt
    ) {
      return;
    }

    set({ loading: true, error: null });
    try {
      if (!inflight) inflight = fetchCrossAsset(rhythm, options, force);
      const next = await inflight;
      if (next.available > 0) writeJSON(CACHE_KEY, next);
      set({
        snapshot: next,
        loading: false,
        error: next.available === 0 ? '跨资产上游未返回数据' : null,
        loadedAt: Date.now(),
        rhythmAt: rhythm?.fetchedAt ?? null,
        optionsAt: options?.generatedAt ?? null,
      });

      // 拉取期间快照/期权可能刚好刷新：用新数据再合成一次（走原始缓存，不重复请求）
      const afterRhythm = useSnapshotStore.getState().snapshot;
      const afterOptions = usePositioningStore.getState().options;
      if (
        (afterRhythm?.fetchedAt ?? null) !== (rhythm?.fetchedAt ?? null) ||
        (afterOptions?.generatedAt ?? null) !== (options?.generatedAt ?? null)
      ) {
        get().recompute();
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '跨资产数据不可用',
      });
    } finally {
      inflight = null;
    }
  },

  recompute: () => {
    const rhythm = useSnapshotStore.getState().snapshot;
    const options = usePositioningStore.getState().options;
    const next = recomputeCrossAsset(rhythm, options);
    if (!next) return;
    set({
      snapshot: next,
      rhythmAt: rhythm?.fetchedAt ?? null,
      optionsAt: options?.generatedAt ?? null,
    });
  },
}));
