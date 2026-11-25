/**
 * A 股个股资金流排行（东方财富公开接口，免 key）。
 *
 * 口径：
 *  - f62 主力净流入（元）= 超大单 + 大单净额，是「钱有没有在买」的直接读数；
 *  - f184 主力净占比（%）= 主力净流入 / 成交额，用来横向比较不同市值；
 *  - f3 涨跌幅，用来找「钱进了但价没动」或「价涨但钱在走」的背离。
 *
 * 只做展示与排序，不做买卖建议；不到就返回空数组，让页面显示「缺」。
 */
import { reportSource } from '../shared/utils/sourceHealth';

export interface StockFlowRow {
  code: string;
  name: string;
  price: number | null;
  changePct: number | null;
  /** 主力净流入（万元） */
  mainNetInWan: number | null;
  /** 主力净占比（%） */
  mainNetPct: number | null;
}

const TTL = 60_000;
const BASE = import.meta.env.VITE_UPSTREAM === 'direct'
  ? 'https://push2.eastmoney.com'
  : '/eastmoney-quote';

let cache: { ts: number; rows: StockFlowRow[] } | null = null;
let inflight: Promise<StockFlowRow[]> | null = null;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 拉取主力净流入排行（默认 30 只，按 f62 降序）。 */
export async function fetchStockFlowRank(limit = 30): Promise<StockFlowRow[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.rows;
  if (inflight) return inflight;

  const task = (async (): Promise<StockFlowRow[]> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6_000);
    try {
      // fs: 沪市主板 + 深市主板/创业板 + 科创板，按主力净流入排序
      const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
      // ut 是东财公开接口的固定令牌，缺了会返回空 diff —— 这是上一版取不到数据的直接原因
      const UT = 'bd1d9ddb04089700cf9c27f6f7426281';
      const url =
        `${BASE}/api/qt/clist/get?ut=${UT}&pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f62` +
        `&fs=${encodeURIComponent(fs)}&fields=f12,f14,f2,f3,f62,f184`;
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        reportSource('eastmoney', false, `资金流排行 HTTP ${resp.status}`);
        return [];
      }
      const json = await resp.json();
      const diff = json?.data?.diff;
      const list: unknown[] = Array.isArray(diff)
        ? diff
        : diff && typeof diff === 'object'
          ? Object.values(diff as Record<string, unknown>)
          : [];

      const rows: StockFlowRow[] = [];
      for (const item of list) {
        const row = item as Record<string, unknown>;
        const code = String(row.f12 ?? '');
        const name = String(row.f14 ?? '');
        if (!code || !name) continue;
        const mainNetIn = num(row.f62);
        rows.push({
          code,
          name,
          price: num(row.f2),
          changePct: num(row.f3),
          mainNetInWan: mainNetIn === null ? null : mainNetIn / 10_000,
          mainNetPct: num(row.f184),
        });
      }
      if (!rows.length) {
        reportSource('eastmoney', false, '资金流排行返回空数据');
        return [];
      }
      reportSource('eastmoney', true);
      cache = { ts: Date.now(), rows };
      return rows;
    } catch (err) {
      reportSource('eastmoney', false, err instanceof Error ? err.message : '资金流排行不可达');
      return [];
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight = task;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}
