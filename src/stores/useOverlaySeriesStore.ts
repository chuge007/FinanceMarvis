/**
 * 叠加序列单例：按需加载选中的序列，避免叠加页一打开就拉全量。
 * 原始/派生缓存都在 core/data/overlaySeries 里，这里只负责合并到 React 状态。
 */
import { create } from 'zustand';
import type { DatedValue } from '../core/analysis/series';
import { loadOverlaySeries } from '../core/data/overlaySeries';

interface OverlaySeriesState {
  series: Record<string, DatedValue[]>;
  loading: boolean;
  error: string | null;
  load: (ids: string[]) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useOverlaySeriesStore = create<OverlaySeriesState>((set) => ({
  series: {},
  loading: false,
  error: null,

  load: async (ids) => {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    // 上一次加载还没结束时，等它完成再拉新选择的序列；不能直接 return，
    // 否则切换预设时新增的 SPY/DFII10 等永远不会被请求。
    if (inflight) await inflight;

    set({ loading: true, error: null });
    const task = (async () => {
      try {
        const next = await loadOverlaySeries(unique);
        set((state) => ({ series: { ...state.series, ...next }, loading: false, error: null }));
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : '叠加序列不可用' });
      }
    })();
    inflight = task;
    await task;
    if (inflight === task) inflight = null;
  },
}));
