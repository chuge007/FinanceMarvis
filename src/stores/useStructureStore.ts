/**
 * 结构快照单例：地图页与 AI 面板共用一份，避免各自调用 fetchStructure 打出重复请求。
 *
 * 行为：
 *  - 按市场分别缓存（美股 / A 股结构完全不同），5 分钟 TTL；
 *  - 同一市场并发调用共享同一个 inflight Promise；
 *  - 拉到真实快照后顺带写入本地序列仓库（原先由地图页负责，挪到这里保证只有一个入口）。
 */
import { create } from 'zustand';
import { fetchStructure, type StructureSnapshot } from '../core/data/structure';
import { recordStructure } from '../core/data/vault';
import type { Market } from './useAppStore';

const TTL = 5 * 60_000;

interface StructureState {
  byMarket: Record<Market, StructureSnapshot | null>;
  loading: Record<Market, boolean>;
  loadedAt: Record<Market, number>;
  load: (market: Market, force?: boolean) => Promise<void>;
}

const inflight = new Map<Market, Promise<StructureSnapshot>>();

export const useStructureStore = create<StructureState>((set, get) => ({
  byMarket: { US: null, CN: null },
  loading: { US: false, CN: false },
  loadedAt: { US: 0, CN: 0 },

  load: async (market, force = false) => {
    const { loading, loadedAt, byMarket } = get();
    if (loading[market]) return;
    if (!force && byMarket[market] && Date.now() - loadedAt[market] < TTL) return;

    set((state) => ({ loading: { ...state.loading, [market]: true } }));
    try {
      let task = inflight.get(market);
      if (!task) {
        task = fetchStructure(market);
        inflight.set(market, task);
      }
      const snapshot = await task;
      set((state) => ({
        byMarket: { ...state.byMarket, [market]: snapshot },
        loading: { ...state.loading, [market]: false },
        loadedAt: { ...state.loadedAt, [market]: Date.now() },
      }));
      void recordStructure(snapshot);
    } catch {
      set((state) => ({ loading: { ...state.loading, [market]: false } }));
    } finally {
      inflight.delete(market);
    }
  },
}));
