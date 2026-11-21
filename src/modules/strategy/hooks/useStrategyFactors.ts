import { useState, useEffect, useCallback } from 'react';
import { fetchStrategyFactors } from '../../../services/strategy';
import type { StrategyFactors } from '../../../types/strategy';
import type { Market } from '../../../stores/useAppStore';

/**
 * 做T综合因子：宏观 / 情绪 / 产业 三因子 + 综合做T偏向。
 * 每 30s 轮询，跟随当前市场与所选标的的所属产业。
 */
export function useStrategyFactors(market: Market, symbol?: string | null) {
  const [factors, setFactors] = useState<StrategyFactors | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!symbol) {
      setFactors(null);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchStrategyFactors(market, symbol);
      setFactors(data);
      setError(null);
    } catch {
      setError('因子数据获取失败');
    } finally {
      setLoading(false);
    }
  }, [market, symbol]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { factors, loading, error, refresh };
}
