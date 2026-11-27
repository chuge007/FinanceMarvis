/**
 * 数据层 Hook：页面只调这些，不再各自 fetch。
 *
 * 好处不只是少写代码：同一序列在多个页面被引用时，React Query 会共用同一份
 * 缓存与同一个请求，请求量直接按「页面数」下降到「序列数」。
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from './client';
import { STALE } from './queryClient';
import type {
  FactorResponse,
  HealthResponse,
  RegimeBand,
  RegimeResponse,
  SeriesResponse,
  SourceMeta,
} from './contracts';

export interface CatalogResponse {
  profile: string;
  capabilities: Array<{ id: string; label: string; available: boolean; hint: string }>;
  sources: Array<{
    id: string;
    label: string;
    source: string;
    dataset: string;
    market: string;
    freq: string;
    unit?: string;
    caliber?: string;
  }>;
  snapshots: Array<{ id: string; label: string; source: string }>;
}

/** 跨市场雷达：本地自算分数与第三方分数分列，不混合。 */
export interface RadarResponse {
  markets: Array<{
    code: string;
    label: string;
    score: number | null;
    band: RegimeBand | null;
    coverage: string;
    drivers: Array<{ id: string; label: string; contribution: number; value: number | null; note?: string }>;
    momentum20d: number | null;
    source: string;
  }>;
  thirdParty: { available: boolean; source: string; reason?: string; hint?: string };
  asOf: string | null;
  source: string;
  note: string;
}

export interface RatiosResponse {
  ratios: Array<{
    id: string;
    label: string;
    value: number | null;
    asOf: string | null;
    percentile?: number | null;
    caliber?: string;
    history?: Array<{ date: string; value: number }>;
  }>;
}

export function useSeries(ids: string[], range = '1y', enabled = true) {
  const key = ids.join(',');
  return useQuery({
    queryKey: ['series', key, range],
    queryFn: () => apiGet<SeriesResponse['series']>('/series', { ids: key, range }),
    enabled: enabled && ids.length > 0,
    staleTime: STALE.daily,
    select: (env) => ({ series: env.data, meta: env.meta as SourceMeta }),
  });
}

export function useRegime(market = 'cn') {
  return useQuery({
    queryKey: ['regime', market],
    queryFn: () => apiGet<RegimeResponse>('/regime', { market }),
    staleTime: STALE.daily,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

export function useFactors(ids?: string[]) {
  const key = ids?.join(',') ?? 'auto';
  return useQuery({
    queryKey: ['factors', key],
    queryFn: () => apiGet<FactorResponse>('/factors', ids?.length ? { ids: key } : undefined),
    staleTime: STALE.daily,
    select: (env) => ({ factors: env.data.factors, meta: env.meta }),
  });
}

/** Wind Alice 凭据状态（本地检查，不烧额度）。 */
export function useWindStatus() {
  return useQuery({
    queryKey: ['wind-status'],
    queryFn: () => apiGet<{ available: boolean; reason?: string }>('/wind/status'),
    staleTime: 5 * 60_000,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

/** 财经日历快照（WSCN，未来 14 天）。 */
export function useCalendar() {
  const snap = useSnapshot<{
    available: boolean;
    events?: Array<{
      publicDate: string; country: string; title: string; importance: number;
      actual: string | null; forecast: string | null; previous: string | null; unit: string;
    }>;
    reason?: string;
    caliber?: string;
  }>(['global:calendar']);
  return { ...snap, calendar: snap.data?.snapshots?.['global:calendar'] ?? null };
}

/** 本地验证结构化解析链路：不需要 Wind Key。 */
export async function windResolve(markdown: string) {
  return apiPost<{ finding: import('../domain').ResearchFinding }>('/wind/resolve', { markdown });
}

/** 云端研究任务（需要 JWT）。 */
export async function submitResearch(prompt: string, token: string) {
  const resp = await fetch('/api/v2/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: 'wind-research', prompt }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message ?? '提交失败');
  return json.data as { id: string; status: string };
}

export async function listFindings(token: string) {
  const resp = await fetch('/api/v2/findings', { headers: { authorization: `Bearer ${token}` } });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message ?? '读取失败');
  return json.data.findings as import('../domain').ResearchFinding[];
}

/** 富途侧车状态：未装 Python / futu-api 时整条链路标不可得。 */
export function useFutuStatus() {
  return useQuery({
    queryKey: ['futu-status'],
    queryFn: () => apiGet<{ available: boolean; importError: string; hint: string; realTradingEnabled: boolean }>('/futu/status'),
    staleTime: 60_000,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

/** 调用侧车方法；返回统一信封，后端已做方法白名单与环境校验。 */
export async function futuCall<T = any>(method: string, params: Record<string, unknown> = {}, env: 'SIMULATE' | 'REAL' = 'SIMULATE') {
  return apiPost<T>('/futu/call', { method, params, env });
}

export function useRadar() {
  return useQuery({
    queryKey: ['radar'],
    queryFn: () => apiGet<RadarResponse>('/radar'),
    staleTime: STALE.daily,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

export function useRatios() {
  return useQuery({
    queryKey: ['ratios'],
    queryFn: () => apiGet<RatiosResponse>('/ratios'),
    staleTime: STALE.daily,
    select: (env) => ({ ratios: env.data.ratios, meta: env.meta }),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    staleTime: STALE.intraday,
    refetchInterval: 60_000,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiGet<CatalogResponse>('/catalog'),
    staleTime: STALE.catalog,
    select: (env) => ({ ...env.data, meta: env.meta }),
  });
}

export function useSnapshot<T = Record<string, unknown>>(ids?: string[]) {
  const key = ids?.join(',') ?? 'all';
  return useQuery({
    queryKey: ['snapshot', key],
    queryFn: () =>
      apiGet<{ snapshots: Record<string, T> }>('/snapshot', ids?.length ? { ids: key } : undefined),
    staleTime: STALE.intraday,
    select: (env) => ({ snapshots: env.data.snapshots, meta: env.meta }),
  });
}

/** 手动触发抓取：只在用户点「立即刷新」时调用，不做自动轮询。 */
export function useRefresh() {
  return async () => apiPost<{ total: number; ok: number }>('/refresh');
}
