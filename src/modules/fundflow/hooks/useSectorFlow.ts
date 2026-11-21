import { useState, useEffect, useCallback } from 'react';
import { fetchSectorFlows, fetchFundFlowOverview, fetchMoneyFlow, fetchMarketCapitalOverview, fetchCapitalTrend, fetchUSFlowDynamics } from '../../../services/fundflow';
import { useAppStore } from '../../../stores/useAppStore';
import { getMarketState } from '../../../shared/utils/marketHours';
import type { SectorFlow, FundFlowOverview, MoneyFlowData, MarketCapitalOverview, CapitalTrendPoint, USFlowDynamicsData } from '../../../types/fundflow';

interface MarketState {
  isOpen: boolean;
  status: string;
  label: string;
  opensIn?: string;
}

export function useSectorFlow(): { data: SectorFlow[]; loading: boolean; marketState: MarketState } {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<SectorFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketState, setMarketState] = useState<MarketState>(getMarketState());
  const refresh = useCallback(async () => {
    try {
      const result = await fetchSectorFlows(market);
      setData(result.flows);
      setMarketState(result.marketState);
    } catch { /* keep stale */ }
    setLoading(false);
  }, [market]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading, marketState };
}

export function useFundFlowOverview(): { data: FundFlowOverview | null; loading: boolean } {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<FundFlowOverview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchFundFlowOverview(market).then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchFundFlowOverview(market).then(setData), 30_000);
    return () => clearInterval(id);
  }, [market]);
  return { data, loading };
}

export function useMoneyFlow(): { data: MoneyFlowData | null; loading: boolean } {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<MoneyFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchMoneyFlow(market).then(setData).finally(() => setLoading(false));
    const id = setInterval(() => fetchMoneyFlow(market).then(setData), 30_000);
    return () => clearInterval(id);
  }, [market]);
  return { data, loading };
}

export function useMarketCapitalOverview(): { data: MarketCapitalOverview | null; loading: boolean } {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<MarketCapitalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await fetchMarketCapitalOverview(market);
      if (result) setData(result);
    } catch { /* keep stale */ }
    setLoading(false);
  }, [market]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 30_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading };
}

export function useCapitalTrend(): { data: CapitalTrendPoint[] | null; loading: boolean } {
  const market = useAppStore((s) => s.market);
  const [data, setData] = useState<CapitalTrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await fetchCapitalTrend(market);
      if (result) setData(result);
    } catch { /* keep stale */ }
    setLoading(false);
  }, [market]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 60_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading };
}

export function useUSFlowDynamics(): { data: USFlowDynamicsData | null; loading: boolean } {
  const [data, setData] = useState<USFlowDynamicsData | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await fetchUSFlowDynamics();
      if (result) setData(result);
    } catch { /* keep stale */ }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 45_000); return () => clearInterval(id); }, [refresh]);
  return { data, loading };
}
