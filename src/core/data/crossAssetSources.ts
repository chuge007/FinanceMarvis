/**
 * 跨资产原始数据抓取：只负责把 Yahoo / FRED / 腾讯的真实序列拿回来。
 *
 * 只做三件事：请求、超时、失败上报。归一化与合成在 crossAsset.ts，
 * 这样数据源改动不会波及计算与 UI。
 *
 * Yahoo 走 spark 批量（单批最多 20，留余量取 18），避免 24+ 条并发触发 403/429；
 * spark 只有 close，没有 volume，SPY/QQQ 再单独用 chart 补成交量。
 */
import { convexApi } from '../../services/api';
import { fetchFredSeries, type FredPoint } from '../../services/fred';
import { canRequest, recordFailure, recordSuccess } from '../../shared/utils/circuitBreaker';
import { reportSource } from '../../shared/utils/sourceHealth';
import { CROSS_ASSET_DEFS } from './crossAssetCatalog';
import type { AssetPoint } from './crossAssetTypes';

const YAHOO_TIMEOUT = 10_000;
const MAX_CONCURRENT = 3;
const BATCH_SIZE = 18;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/** 派生格子依赖、但本身不单独展示的标的。 */
const YAHOO_DEPS = ['HYG', 'LQD', '^VIX', '^VIX3M', 'SPY', 'QQQ'];

export interface RawCache {
  ts: number;
  yahoo: Record<string, AssetPoint[]>;
  fred: Record<string, FredPoint[]>;
  /** Yahoo 不可达时的现货指数兜底（腾讯）。 */
  tencent: Record<string, AssetPoint[]>;
  /** FRED/Convex 不可达时的官方利率兜底（美国财政部）。 */
  treasury: Record<string, FredPoint[]>;
}

function yahooBase(): string {
  return import.meta.env.VITE_UPSTREAM === 'direct'
    ? 'https://query1.finance.yahoo.com'
    : '/yahoo';
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toPoints(timestamps: number[], closes: (number | null)[], volumes?: (number | null)[]): AssetPoint[] {
  const out: AssetPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = Number(closes?.[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const volume = Number(volumes?.[i]);
    out.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      value: close,
      z: null,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 单只标的的 1 年日线；失败返回空数组，不抛异常。 */
export async function fetchYahooDaily(symbol: string): Promise<AssetPoint[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), YAHOO_TIMEOUT);
  try {
    const encoded = encodeURIComponent(symbol).replace(/%3D/g, '=');
    const url = `${yahooBase()}/v8/finance/chart/${encoded}?range=1y&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || !timestamps.length) return [];
    return toPoints(timestamps, quote.close ?? [], quote.volume ?? []);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** 批量取多只标的的收盘序列；spark 单批最多 20 只。 */
async function fetchYahooSparkBatch(symbols: string[]): Promise<Record<string, AssetPoint[]>> {
  if (!symbols.length) return {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), YAHOO_TIMEOUT);
  try {
    const encoded = symbols.map((s) => encodeURIComponent(s).replace(/%3D/g, '=')).join(',');
    const url = `${yahooBase()}/v7/finance/spark?symbols=${encoded}&range=1y&interval=1d`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const result = json?.spark?.result;
    if (!Array.isArray(result)) return {};

    const out: Record<string, AssetPoint[]> = {};
    for (const item of result) {
      const symbol = String(item?.symbol ?? '');
      const resp0 = item?.response?.[0];
      const timestamps: number[] = resp0?.timestamp ?? [];
      const closes: (number | null)[] = resp0?.indicators?.quote?.[0]?.close ?? [];
      const points = toPoints(timestamps, closes);
      if (symbol && points.length) out[symbol] = points;
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** 腾讯指数日 K：Yahoo 无代理时的现货兜底（同一指数，语义不变）。 */
async function fetchTencentIndexDaily(symbol: string): Promise<AssetPoint[]> {
  const endpoint = symbol.startsWith('us')
    ? 'usfqkline'
    : symbol.startsWith('hk')
      ? 'hkfqkline'
      : 'fqkline';
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/${endpoint}/get?param=${symbol},day,,,300,qfq`;
    const resp = await fetch(url, { headers: { accept: 'application/json' } });
    if (!resp.ok) return [];
    const json = await resp.json();
    const node = json?.data?.[symbol];
    const rows: string[][] = node?.day ?? node?.qfqday ?? [];
    const out: AssetPoint[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const date = String(row[0]);
      const close = Number(row[2]);
      const volume = Number(row[5]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
      out.push({ date, value: close, z: null, volume: Number.isFinite(volume) ? volume : 0 });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

type TreasuryId =
  | 'DGS2'
  | 'DGS3M'
  | 'DGS5'
  | 'DGS10'
  | 'DGS30'
  | 'T10Y2Y'
  | 'T10Y3M'
  | 'DFII10'
  | 'T5YIE';

/** 简易 CSV 行解析：只处理双引号包裹与转义，财政部表头含 "1.5 Month" 这类字段。 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toIsoDate(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const mm = m[1].padStart(2, '0');
  const dd = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

/** 按表头名取列，返回 日期升序的序列；列名变化时返回空对象。 */
function parseTreasuryCsv(text: string, mapping: Record<string, string>): Record<string, FredPoint[]> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return {};
  const header = parseCsvLine(lines[0]);
  const idx: Record<string, number> = {};
  for (const [id, name] of Object.entries(mapping)) {
    idx[id] = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (idx[id] < 0) return {};
  }

  const out: Record<string, FredPoint[]> = {};
  for (const id of Object.keys(mapping)) out[id] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const date = toIsoDate(cols[0] ?? '');
    if (!date) continue;
    for (const id of Object.keys(mapping)) {
      const value = Number(cols[idx[id]]);
      if (Number.isFinite(value)) out[id].push({ date, value });
    }
  }
  for (const id of Object.keys(out)) out[id].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function fetchTreasuryCsv(type: string): Promise<string> {
  const year = new Date().getFullYear();
  const path =
    `/treasury/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all` +
    `?type=${type}&field_tdr_date_value=${year}&page&_format=csv`;
  const resp = await fetch(path, { headers: { accept: 'text/csv' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

let treasuryCache: { ts: number; data: Partial<Record<TreasuryId, FredPoint[]>> } | null = null;
let treasuryInflight: Promise<Partial<Record<TreasuryId, FredPoint[]>>> | null = null;

/** 5 分钟缓存 + inflight 去重：rhythm 与跨资产会同时请求，不能重复打财政部。 */
export async function fetchTreasuryCurve(): Promise<Partial<Record<TreasuryId, FredPoint[]>>> {
  if (treasuryCache && Date.now() - treasuryCache.ts < 5 * 60_000) return treasuryCache.data;
  if (treasuryInflight) return treasuryInflight;
  treasuryInflight = loadTreasuryCurve()
    .then((data) => {
      if (Object.keys(data).length) treasuryCache = { ts: Date.now(), data };
      return data;
    })
    .finally(() => {
      treasuryInflight = null;
    });
  return treasuryInflight;
}

/**
 * 美国财政部官方日度曲线：名义 + 实际两套。
 *  - 名义：2Y/3M/5Y/10Y/30Y，并派生 10Y-3M；
 *  - 实际：5Y/10Y → DFII10（10Y 实际利率）；
 *  - T5YIE = 名义 5Y − 实际 5Y，即 5 年盈亏平衡通胀。
 */
async function loadTreasuryCurve(): Promise<Partial<Record<TreasuryId, FredPoint[]>>> {
  try {
    // 名义曲线是主数据；实际曲线失败时仍保留名义曲线，不整块丢弃。
    const [nominalRes, realRes] = await Promise.allSettled([
      fetchTreasuryCsv('daily_treasury_yield_curve'),
      fetchTreasuryCsv('daily_treasury_real_yield_curve'),
    ]);
    if (nominalRes.status !== 'fulfilled') throw nominalRes.reason;
    const nominalText = nominalRes.value;
    const realText = realRes.status === 'fulfilled' ? realRes.value : '';
    const nominal = parseTreasuryCsv(nominalText, {
      DGS2: '2 Yr',
      DGS3M: '3 Mo',
      DGS5: '5 Yr',
      DGS10: '10 Yr',
      DGS30: '30 Yr',
    });
    const real = parseTreasuryCsv(realText, { R5: '5 Yr', R10: '10 Yr' });

    const out: Partial<Record<TreasuryId, FredPoint[]>> = {
      DGS2: nominal.DGS2,
      DGS3M: nominal.DGS3M,
      DGS5: nominal.DGS5,
      DGS10: nominal.DGS10,
      DGS30: nominal.DGS30,
    };
    if (nominal.DGS10?.length && nominal.DGS2?.length) {
      out.T10Y2Y = subtractSeries(nominal.DGS10, nominal.DGS2);
    }
    if (nominal.DGS10?.length && nominal.DGS3M?.length) {
      out.T10Y3M = subtractSeries(nominal.DGS10, nominal.DGS3M);
    }
    if (real.R10?.length) out.DFII10 = real.R10;
    if (nominal.DGS5?.length && real.R5?.length) {
      out.T5YIE = subtractSeries(nominal.DGS5, real.R5);
    }

    const ok = Object.values(out).some((list) => (list?.length ?? 0) > 20);
    reportSource('treasury', ok, ok ? '' : '财政部 CSV 有效行数不足');
    return ok ? out : {};
  } catch (err) {
    reportSource('treasury', false, err instanceof Error ? err.message : '财政部 CSV 不可达');
    return {};
  }
}

/** 两条序列按日期交集相减（用于 10Y - 3M、5Y 名义 - 5Y 实际）。 */
function subtractSeries(a: FredPoint[], b: FredPoint[]): FredPoint[] {
  const map = new Map(b.map((p) => [p.date, p.value]));
  const out: FredPoint[] = [];
  a.forEach((p) => {
    const other = map.get(p.date);
    if (other !== undefined) out.push({ date: p.date, value: p.value - other });
  });
  return out;
}

/** FRED 序列：先走 ConvexTrade 镜像（3s 快失败），再走官方 CSV。 */
async function fetchFred(id: string): Promise<FredPoint[]> {
  if (canRequest('convex-mirror')) {
    try {
      const { data } = await convexApi.get(`/data/${id}`, {
        params: { limit: 300, format: 'json' },
        timeout: 3_000,
      });
      const list: FredPoint[] = Array.isArray(data?.data)
        ? data.data
            .filter((p: { date?: string; value?: number }) => p && p.date && Number.isFinite(Number(p.value)))
            .map((p: { date: string; value: number }) => ({ date: String(p.date), value: Number(p.value) }))
        : [];
      if (list.length) {
        recordSuccess('convex-mirror');
        return list;
      }
      recordFailure('convex-mirror', '空序列');
    } catch (err) {
      recordFailure('convex-mirror', err instanceof Error ? err.message : '不可达');
    }
  }
  return fetchFredSeries(id, 300);
}

/** 拉取全部原始序列：SPY 探针 → spark 批量 → chart 补缺 → 腾讯指数兜底。 */
export async function fetchAllRaw(): Promise<RawCache> {
  const yahooSymbols = [
    ...new Set([
      ...CROSS_ASSET_DEFS.filter((d) => d.source === 'yahoo').map((d) => d.ref),
      ...YAHOO_DEPS,
    ]),
  ];
  // 快照缺失时也值得重试的 FRED 序列（HY OAS 没有 Yahoo/财政部等价物）。
  const fredIds = [
    ...new Set([
      ...CROSS_ASSET_DEFS.filter((d) => d.source === 'fred').map((d) => d.ref),
      'BAMLH0A0HYM2',
    ]),
  ];

  const yahoo: Record<string, AssetPoint[]> = {};
  const yahooAllowed = canRequest('cross-asset-yahoo');
  const probeSymbol = yahooSymbols.includes('SPY') ? 'SPY' : yahooSymbols[0];

  // 先用 SPY 探一次：Yahoo 整体不可达时（大陆无代理常见）直接跳过剩余请求，
  // 避免每条都等满超时，把首屏拖到 30 秒以上。
  if (yahooAllowed && probeSymbol) {
    yahoo[probeSymbol] = await fetchYahooDaily(probeSymbol);
  }

  const restSymbols = yahooSymbols.filter((symbol) => symbol !== probeSymbol);
  if (probeSymbol && yahoo[probeSymbol]?.length) {
    for (const batch of chunk(restSymbols, BATCH_SIZE)) {
      const got = await fetchYahooSparkBatch(batch);
      Object.assign(yahoo, got);
    }
    // spark 缺的、以及 spark 不返回成交量的 SPY/QQQ，用单只 chart 补。
    const needChart = restSymbols.filter(
      (symbol) => !yahoo[symbol]?.length || symbol === 'SPY' || symbol === 'QQQ',
    );
    const filled = await mapLimit(needChart, MAX_CONCURRENT, async (symbol) => {
      return [symbol, await fetchYahooDaily(symbol)] as const;
    });
    filled.forEach(([symbol, list]) => {
      if (list.length) yahoo[symbol] = list;
      else if (!yahoo[symbol]) yahoo[symbol] = [];
    });
  } else {
    restSymbols.forEach((symbol) => {
      yahoo[symbol] = [];
    });
  }

  // Yahoo 整体不可用时，只对目录里声明了 tencentSymbol 的现货指数做兜底；
  // 期指/汇率/商品没有等价标的，保持「缺」。
  const tencent: Record<string, AssetPoint[]> = {};
  const needTencent = CROSS_ASSET_DEFS.filter(
    (d) => d.tencentSymbol && !(yahoo[d.ref]?.length),
  );
  const tencentPairs = await mapLimit(needTencent, 2, async (def) => {
    const symbol = def.tencentSymbol as string;
    return [symbol, await fetchTencentIndexDaily(symbol)] as const;
  });
  tencentPairs.forEach(([symbol, list]) => {
    tencent[symbol] = list;
  });

  // FRED 官方 CSV 对并发较敏感，3 条一批，避免短时间打满被限流。
  const fredPairs = await mapLimit(fredIds, 3, async (id) => [id, await fetchFred(id)] as const);
  const fred: Record<string, FredPoint[]> = Object.fromEntries(fredPairs);

  // FRED / Convex 都不可达时，用美国财政部官方曲线补齐利率腿（同一官方口径）。
  const treasury = await fetchTreasuryCurve();

  const yahooOk = Object.values(yahoo).some((list) => list.length > 0);
  if (yahooOk) {
    recordSuccess('cross-asset-yahoo');
    reportSource('yahoo', true);
  } else {
    recordFailure('cross-asset-yahoo', '全部标的无数据');
    reportSource('yahoo', false, '跨资产行情：Yahoo 未返回任何标的');
  }

  const fredOk = Object.values(fred).some((list) => list.length > 0);
  if (fredOk) reportSource('fred', true);
  else reportSource('fred', false, 'FRED 不可达；利率已由财政部官方曲线兜底，HY OAS 仍缺');

  return { ts: Date.now(), yahoo, fred, tencent, treasury };
}
