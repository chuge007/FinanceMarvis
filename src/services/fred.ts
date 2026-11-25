/**
 * FRED（圣路易斯联储）序列取数：用图表 CSV 直链，**不需要 API Key**。
 *
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2
 *
 * 为什么换掉 ConvexTrade：
 *  - ConvexTrade 只是 FRED 的二手镜像，大陆直连常需要出海代理，超时 10s 后还要串行兜底；
 *  - 官方 CSV 是一次请求拿到整条序列，体积十几 KB，走本地服务端转发即可，不依赖代理。
 *
 * 口径提醒：CSV 里缺失值写作 "."，一律跳过，不插值。
 */
import { canRequest, recordFailure, recordSuccess } from '../shared/utils/circuitBreaker';
import { reportSource } from '../shared/utils/sourceHealth';

export interface FredPoint {
  date: string;
  value: number;
}

const TTL = 5 * 60_000;
/**
 * 3.5s 快失败：FRED 在部分网络（含本机实测）完全不可达，等满 10s 只会拖垮首屏。
 * 配合熔断器，前两条指标各等 3.5s 后该源进入 5 分钟冷却，后续直接跳过。
 */
const TIMEOUT = 3_500;
const BREAKER_ID = 'fred';

const cache = new Map<string, { ts: number; data: FredPoint[] }>();
const inflight = new Map<string, Promise<FredPoint[]>>();

function base(): string {
  return import.meta.env.VITE_UPSTREAM === 'direct'
    ? 'https://fred.stlouisfed.org'
    : '/fred';
}

function parseCsv(text: string, limit: number): FredPoint[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const out: FredPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    const comma = row.indexOf(',');
    if (comma <= 0) continue;
    const date = row.slice(0, comma).trim();
    const raw = row.slice(comma + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ date, value });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return limit > 0 ? out.slice(-limit) : out;
}

/**
 * 取一条 FRED 序列的最近 limit 个观测；失败返回空数组（不抛异常、不阻塞页面）。
 */
export async function fetchFredSeries(seriesId: string, limit = 300): Promise<FredPoint[]> {
  const key = `${seriesId}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const running = inflight.get(key);
  if (running) return running;

  if (!canRequest(BREAKER_ID)) {
    // 熔断中：直接用旧缓存（如果有），不再打网络
    return hit?.data ?? [];
  }

  const task = (async (): Promise<FredPoint[]> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const url = `${base()}/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
      const resp = await fetch(url, { headers: { accept: 'text/csv' }, signal: ctrl.signal });
      if (!resp.ok) {
        recordFailure(BREAKER_ID, `HTTP ${resp.status}`);
        reportSource('fred', false, `FRED 返回 HTTP ${resp.status}`);
        return hit?.data ?? [];
      }
      const text = await resp.text();
      const data = parseCsv(text, limit);
      if (!data.length) {
        recordFailure(BREAKER_ID, 'CSV 无有效数据');
        reportSource('fred', false, 'FRED 返回的 CSV 没有有效数据');
        return hit?.data ?? [];
      }
      recordSuccess(BREAKER_ID);
      reportSource('fred', true);
      cache.set(key, { ts: Date.now(), data });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '不可达';
      recordFailure(BREAKER_ID, message);
      reportSource('fred', false, `FRED 不可达：${message}`);
      return hit?.data ?? [];
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
