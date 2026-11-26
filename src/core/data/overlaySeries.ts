/**
 * 叠加序列取数与派生：按需加载，不做全量预取。
 *
 * 原始序列：FRED（利率/信用/流动性）+ Yahoo（SPY/QQQ/SMH/IWM）。
 * 派生序列：对数比（QQQ/SPY、SMH/QQQ）、净流动性、滚动相关。
 *
 * 纪律：
 *  - 派生只用日期交集，不插值、不前向填充；
 *  - 相关系数单独保持 -1~1 原值，不进 Z 轴；
 *  - 取不到返回空数组，由 UI 显示「缺」。
 */
import { fetchFredSeries } from '../../services/fred';
import { fetchStockCandles } from '../../services/api';
import { rollingCorrSeries, type DatedValue } from '../analysis/series';
import { zScore } from '../../shared/utils/seriesStats';
import { OVERLAY_BY_ID, type OverlayDef } from './overlayCatalog';
import { fetchTreasuryCurve, fetchYahooDaily, type TreasuryId } from './crossAssetSources';

const TREASURY_RATES = new Set<TreasuryId>(['DFII10', 'T10YIE', 'DGS10', 'T10Y2Y']);

interface Row {
  date: string;
  value: number;
}

const TTL = 5 * 60_000;
const rawCache = new Map<string, { ts: number; data: Row[] }>();
const rawInflight = new Map<string, Promise<Row[]>>();
const outCache = new Map<string, { ts: number; data: DatedValue[] }>();

function cached(id: string): Row[] | null {
  const hit = rawCache.get(id);
  if (hit && Date.now() - hit.ts < TTL && hit.data.length) return hit.data;
  return null;
}

function align(a: Row[], b: Row[]): { dates: string[]; av: number[]; bv: number[] } {
  const bm = new Map(b.map((p) => [p.date, p.value]));
  const dates: string[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  a.forEach((p) => {
    const other = bm.get(p.date);
    if (other === undefined || !Number.isFinite(p.value) || !Number.isFinite(other)) return;
    dates.push(p.date);
    av.push(p.value);
    bv.push(other);
  });
  return { dates, av, bv };
}

function ratioRows(a: Row[], b: Row[], log: boolean): Row[] {
  const { dates, av, bv } = align(a, b);
  const out: Row[] = [];
  dates.forEach((date, i) => {
    if (bv[i] <= 0 || av[i] <= 0) return;
    out.push({ date, value: log ? Math.log(av[i] / bv[i]) : av[i] / bv[i] });
  });
  return out;
}

function netLiquidityRows(walcl: Row[], rrp: Row[], tga: Row[]): Row[] {
  const byRrp = new Map(rrp.map((p) => [p.date, p.value]));
  const byTga = new Map(tga.map((p) => [p.date, p.value]));
  const out: Row[] = [];
  walcl.forEach((p) => {
    const r = byRrp.get(p.date);
    const t = byTga.get(p.date);
    if (r === undefined || t === undefined) return;
    // WALCL 单位百万美元 → 十亿美元；RRP / TGA 本身就是十亿美元。
    out.push({ date: p.date, value: p.value / 1000 - r - t });
  });
  return out;
}

function corrRows(a: Row[], b: Row[], window = 60): Row[] {
  const av: DatedValue[] = a.map((p) => ({ date: p.date, value: p.value, z: null }));
  const bv: DatedValue[] = b.map((p) => ({ date: p.date, value: p.value, z: null }));
  const res = rollingCorrSeries(av, bv, window);
  const out: Row[] = [];
  res.dates.forEach((date, i) => {
    const v = res.values[i];
    if (v !== null && Number.isFinite(v)) out.push({ date, value: v });
  });
  return out;
}

async function fetchRawRows(def: OverlayDef): Promise<Row[]> {
  if (def.source === 'fred' && def.ref) {
    // 利率腿优先用财政部（快且官方）；FRED 只在财政部缺失时兜底。
    if (TREASURY_RATES.has(def.ref as TreasuryId)) {
      const treasury = await fetchTreasuryCurve();
      const points = treasury[def.ref as TreasuryId];
      if (points?.length) return points.map((p) => ({ date: p.date, value: p.value }));
    }
    // VIX 用 Yahoo ^VIX 更快；同一指数，口径一致。
    if (def.ref === 'VIXCLS') {
      const vix = await fetchYahooDaily('^VIX', '2y');
      if (vix.length) return vix.map((p) => ({ date: p.date, value: p.value }));
    }
    return (await fetchFredSeries(def.ref, 500)).map((p) => ({ date: p.date, value: p.value }));
  }
  if (def.source === 'yahoo' && def.ref) {
    // 和全球地形共用同一个 Yahoo 取数函数（8s 超时、代理头已在服务端注入）。
    // 2 年日线保证与周度序列对齐后仍有 60 个以上观测，周度相关才算得出来。
    const points = await fetchYahooDaily(def.ref, '2y');
    if (points.length) return points.map((p) => ({ date: p.date, value: p.value }));
    const candles = await fetchStockCandles(def.ref, 'US', '2y', '1d');
    return candles
      .filter((c) => Number.isFinite(c.close) && c.close > 0)
      .map((c) => ({ date: c.time, value: c.close }));
  }
  return [];
}

/** 任意序列的原始值（派生序列递归解析依赖）。 */
async function rawOf(id: string, seen = new Set<string>()): Promise<Row[]> {
  const hit = cached(id);
  if (hit) return hit;
  const running = rawInflight.get(id);
  if (running) return running;

  const def = OVERLAY_BY_ID[id];
  if (!def) return [];
  if (seen.has(id)) return [];
  const nextSeen = new Set(seen).add(id);

  const task = (async (): Promise<Row[]> => {
    let rows: Row[] = [];
    if (def.source === 'fred' || def.source === 'yahoo') {
      rows = await fetchRawRows(def);
    } else if (def.id === 'QQQ_SPY' || def.id === 'SMH_QQQ') {
      const [a, b] = await Promise.all((def.deps ?? []).map((d) => rawOf(d, nextSeen)));
      rows = ratioRows(a, b, true);
    } else if (def.id === 'NET_LIQ') {
      const [walcl, rrp, tga] = await Promise.all((def.deps ?? []).map((d) => rawOf(d, nextSeen)));
      rows = netLiquidityRows(walcl, rrp, tga);
    } else if (def.deps && def.deps.length === 2) {
      const [a, b] = await Promise.all(def.deps.map((d) => rawOf(d, nextSeen)));
      rows = corrRows(a, b, 60);
    }

    if (rows.length) rawCache.set(id, { ts: Date.now(), data: rows });
    return rows;
  })();

  rawInflight.set(id, task);
  try {
    return await task;
  } finally {
    rawInflight.delete(id);
  }
}

/** 滚动 Z：只用当日及之前 window 个观测，样本不足 20 返回 null。 */
function toRollingZ(rows: Row[], window = 250, min = 20): DatedValue[] {
  const values = rows.map((r) => r.value);
  return rows.map((row, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = values.slice(from, i + 1).filter((v) => Number.isFinite(v));
    return {
      date: row.date,
      value: row.value,
      z: slice.length >= min ? zScore(slice, row.value) : null,
    };
  });
}

/** 取一组序列，按 axis 决定是否转成滚动 Z；返回的 value 始终是原始值。 */
export async function loadOverlaySeries(ids: string[]): Promise<Record<string, DatedValue[]>> {
  const uniq = [...new Set(ids)];
  const pairs = await Promise.all(
    uniq.map(async (id) => {
      const hit = outCache.get(id);
      if (hit && Date.now() - hit.ts < TTL) return [id, hit.data] as const;

      const def = OVERLAY_BY_ID[id];
      const rows = await rawOf(id);
      const data =
        def?.axis === 'corr'
          ? rows.map((p) => ({ date: p.date, value: p.value, z: null }))
          : toRollingZ(rows);
      if (data.length) outCache.set(id, { ts: Date.now(), data });
      return [id, data] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

/** 给相关性面板直接算当前值/60 日前值，避免 UI 自己实现公式。 */
export function corrPairNow(
  a: DatedValue[],
  b: DatedValue[],
  window = 60,
): { current: number | null; previous: number | null; delta: number | null } {
  const series = rollingCorrSeries(a, b, window);
  const valid = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  const current = valid.length ? valid[valid.length - 1] : null;
  const previous = valid.length > window ? valid[valid.length - 1 - window] : null;
  return {
    current,
    previous,
    delta: current !== null && previous !== null ? current - previous : null,
  };
}
