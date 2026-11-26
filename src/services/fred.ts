/**
 * FRED（圣路易斯联储）序列取数：用图表 CSV 直链，**不需要 API Key**。
 *
 *   https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2
 *
 * 通道策略：
 *  - 先走同域 `/fred`（直连），2.5s 快失败；
 *  - 直连失败再走 `/fred-proxy`（本机出海代理），3s；
 *  - 两条都失败才记一次熔断，避免每个指标都交两遍学费。
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
const DIRECT_TIMEOUT = 2_500;
const PROXY_TIMEOUT = 3_000;
const BREAKER_ID = 'fred';

const cache = new Map<string, { ts: number; data: FredPoint[] }>();
const inflight = new Map<string, Promise<FredPoint[]>>();

function paths(): string[] {
  if (import.meta.env.VITE_UPSTREAM === 'direct') {
    return ['https://fred.stlouisfed.org/graph/fredgraph.csv'];
  }
  return ['/fred/graph/fredgraph.csv', '/fred-proxy/graph/fredgraph.csv'];
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

async function fetchOne(
  base: string,
  seriesId: string,
  timeout: number,
  limit: number,
): Promise<FredPoint[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(`${base}?id=${encodeURIComponent(seriesId)}`, {
      headers: { accept: 'text/csv' },
      signal: ctrl.signal,
    });
    if (!resp.ok) return [];
    return parseCsv(await resp.text(), limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 取一条 FRED 序列的最近 limit 个观测；失败返回空数组（不抛异常、不阻塞页面）。
 * 直连失败会自动经 `/fred-proxy` 重试一次。
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
    let lastError = '不可达';
    const list = paths();
    for (let i = 0; i < list.length; i++) {
      const base = list[i];
      const timeout = base.includes('/fred-proxy') ? PROXY_TIMEOUT : DIRECT_TIMEOUT;
      const data = await fetchOne(base, seriesId, timeout, limit);
      if (data.length) {
        recordSuccess(BREAKER_ID);
        reportSource('fred', true);
        cache.set(key, { ts: Date.now(), data });
        return data;
      }
      lastError = base.includes('/fred-proxy') ? '直连与代理均无数据' : '直连无数据';
    }

    recordFailure(BREAKER_ID, lastError);
    reportSource('fred', false, `FRED 不可达：${lastError}`);
    return hit?.data ?? [];
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
