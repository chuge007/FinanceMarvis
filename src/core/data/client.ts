/**
 * 统一数据客户端：所有新接口只从这里出去。
 *
 * 三件事：拼 URL、解信封、把「不可得」表达成数据而不是异常。
 * 前端不再关心某个数是 FRED 还是腾讯，只关心 meta.source / meta.asOf。
 */
import type { Envelope, SourceMeta } from './contracts';

const BASE = '/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** 带超时的 GET；4xx/5xx 抛 ApiError，网络失败抛 code=NETWORK。 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  timeoutMs = 15_000,
): Promise<Envelope<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BASE}${path}${qs(params)}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    const json = (await resp.json()) as Envelope<T> & { error?: { code: string; message: string } };
    if (!resp.ok) {
      throw new ApiError(json?.error?.code ?? 'UPSTREAM_ERROR', json?.error?.message ?? `HTTP ${resp.status}`, resp.status);
    }
    return json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK', err instanceof Error ? err.message : '数据服务不可达');
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPost<T>(path: string, body?: unknown, timeoutMs = 60_000): Promise<Envelope<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await resp.json()) as Envelope<T> & { error?: { code: string; message: string } };
    if (!resp.ok) throw new ApiError(json?.error?.code ?? 'UPSTREAM_ERROR', json?.error?.message ?? `HTTP ${resp.status}`, resp.status);
    return json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK', err instanceof Error ? err.message : '数据服务不可达');
  } finally {
    clearTimeout(timer);
  }
}

/** 「不可得」的统一表达：缺失域直接返回空数组而不是伪造 0。 */
export function missingOf(meta: SourceMeta | undefined): string[] {
  return meta?.missing ?? [];
}

/** 数据日期徽标文案：优先数据自身时间，其次说明缺失。 */
export function asOfLabel(meta: SourceMeta | undefined): string {
  if (!meta) return '未知来源';
  if (!meta.asOf) return meta.missing?.length ? '不可得' : '无数据';
  const stale = meta.stale ? ' · 陈旧' : '';
  const degraded = meta.degraded ? ' · 降级' : '';
  return `${meta.asOf}${stale}${degraded}`;
}

/** 数据服务是否可用：用于页面级降级提示，而不是每个组件各判一次。 */
let available: boolean | null = null;
export async function probeService(): Promise<boolean> {
  if (available != null) return available;
  try {
    await apiGet<unknown>('/health', undefined, 3000);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function resetServiceProbe() {
  available = null;
}
