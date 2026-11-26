/**
 * 仓位面/情绪面数据单例：期限结构与期权情绪只在这里拉一次，页面只订阅。
 *
 * 目的：首页与研究页都要用这两份数据，各自 useState + useEffect 会造成
 * 重复请求与重复定时器（App 与 MapPage 的 snapshot 定时器就是前车之鉴）。
 * 这里做 inflight 去重 + 5 分钟 TTL，页面拿到的永远是同一份结果。
 */
import { create } from 'zustand';
import { fetchTermStructure, type TermStructure } from '../services/volTerm';
import { fetchOptionsSentiment } from '../services/optionsSentiment';
import type { OptionsSentimentSnapshot } from '../types/sentiment';
import { readJSON, writeJSON } from '../shared/utils/localStore';

const TTL = 5 * 60_000;
const CACHE_KEY = 'marvis.positioning.v1';
const cached = readJSON<{ term: TermStructure | null; options: OptionsSentimentSnapshot | null } | null>(
  CACHE_KEY,
  null,
);

interface PositioningState {
  term: TermStructure | null;
  options: OptionsSentimentSnapshot | null;
  loading: boolean;
  loadedAt: number;
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<{ term: TermStructure; options: OptionsSentimentSnapshot }> | null = null;

export const usePositioningStore = create<PositioningState>((set, get) => ({
  // 冷启动先渲染上次的期限结构/期权情绪，P/C 格子不用等 CBOE 整页返回。
  term: cached?.term ?? null,
  options: cached?.options ?? null,
  loading: false,
  loadedAt: 0,

  load: async (force = false) => {
    const { loading, loadedAt, term } = get();
    if (loading) return;
    if (!force && term && Date.now() - loadedAt < TTL) return;

    set({ loading: true });
    try {
      if (!inflight) {
        inflight = Promise.all([fetchTermStructure(force), fetchOptionsSentiment()]).then(
          ([nextTerm, options]) => ({ term: nextTerm, options }),
        );
      }
      const { term: nextTerm, options } = await inflight;
      if (nextTerm || options) writeJSON(CACHE_KEY, { term: nextTerm, options });
      set({ term: nextTerm, options, loading: false, loadedAt: Date.now() });
    } catch {
      set({ loading: false });
    } finally {
      inflight = null;
    }
  },
}));
