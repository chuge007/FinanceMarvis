import { useState, useEffect, useCallback } from 'react';
import {
  fetchRiskIndicators,
  fetchCreditRates,
  fetchVolatility,
  fetchBullBearForces,
  fetchInstitutionViews,
  fetchNewsFeed,
} from '../../../services/macro';
import type { RiskIndicator, CreditRateIndicator, VolatilitySnapshot, BullBearForces, InstitutionView, NewsItem } from '../../../types/macro';

export function useMacroRisk() {
  const [data, setData] = useState<RiskIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const indicators = await fetchRiskIndicators();
      setData(indicators);
    } catch { /* keep stale data */ }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 60_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading, refresh };
}

export function useCreditRates() {
  const [data, setData] = useState<CreditRateIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchCreditRates().then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchCreditRates().then(setData), 60_000);
    return () => clearInterval(id);
  }, []);
  return { data, loading };
}

export function useVolatility() {
  const [data, setData] = useState<VolatilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchVolatility().then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchVolatility().then(setData), 60_000);
    return () => clearInterval(id);
  }, []);
  return { data, loading };
}

export function useBullBearForces() {
  const [data, setData] = useState<BullBearForces | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchBullBearForces().then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchBullBearForces().then(setData), 60_000);
    return () => clearInterval(id);
  }, []);
  return { data, loading };
}

export function useInstitutionViews() {
  const [data, setData] = useState<InstitutionView[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchInstitutionViews().then(setData).finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

export function useNewsFeed(market: 'CN' | 'US' = 'CN') {
  const [data, setData] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetchNewsFeed(market).then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchNewsFeed(market).then(setData), 30_000);
    return () => clearInterval(id);
  }, [market]);
  return { data, loading };
}
