import { useState, useEffect, useCallback } from 'react';
import { fetchSentiment } from '../../../services/sentiment';
import { useAppStore } from '../../../stores/useAppStore';
import type { SentimentSnapshot } from '../../../types/sentiment';

export function useFearGreed() {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<SentimentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchSentiment(market);
      setData(snapshot);
      setError(null);
    } catch (e) {
      setError('情绪数据获取失败，请稍后重试');
    }
    setLoading(false);
  }, [market]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading, error, refresh };
}
