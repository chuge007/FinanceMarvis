import { useMemo } from 'react';
import type { PutCallData, OptionsSentimentSnapshot } from '../../../types/sentiment';
import { useAppStore } from '../../../stores/useAppStore';
import { useFearGreed } from './useFearGreed';

/** 期权情绪明细复用主情绪快照，避免重复拉取 CBOE / Yahoo。 */
export function useOptionsSentiment(): OptionsSentimentSnapshot | null {
  const market = useAppStore((s) => s.market);
  const { data } = useFearGreed();
  return market === 'US' ? data?.options ?? null : null;
}

export function usePutCall(): PutCallData {
  const options = useOptionsSentiment();
  return useMemo(() => ({
    items: options?.ratios ?? [],
    volume: options?.summary['SUM OF ALL PRODUCTS']?.volume ?? null,
    openInterest: options?.summary['SUM OF ALL PRODUCTS']?.openInterest ?? null,
  }), [options]);
}
