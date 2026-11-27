/**
 * React Query 配置。
 *
 * 关键在于 staleTime 分级：盘中快照 30s、日线 10min、宏观 1h。
 * 以前每个 service 各写一套 TTL，是「同一指标在不同页面数字不同」的根源。
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        const code = (error as { code?: string })?.code;
        // 服务端明确说「不可得」时不要重试，重试只会拖慢首屏
        if (code === 'NO_DATA' || code === 'BAD_REQUEST') return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});

/** 按数据频率给 staleTime，避免把日线当秒级数据轮询。 */
export const STALE = {
  intraday: 30_000,
  daily: 10 * 60_000,
  macro: 60 * 60_000,
  catalog: 30 * 60_000,
} as const;
