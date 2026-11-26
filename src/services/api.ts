import axios from 'axios';
import type { DepthLevel } from '../types/fundflow';
import { reportSource } from '../shared/utils/sourceHealth';

// ─── fetch 统一超时兜底：行情源不可达时强制 reject，防 Promise 挂起导致加载卡死 ───
function fetchJ(url: string, ms = 6000, headers?: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { headers, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ─── 内存缓存层：同一指标 30s 内不重复请求，防止多 Hook 并发浪费配额 ───
const CACHE_TTL = 30_000;
const seriesCache = new Map<string, { ts: number; data: { date: string; value: number }[] }>();

function getCached(seriesId: string): { date: string; value: number }[] | null {
  const entry = seriesCache.get(seriesId);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(seriesId: string, data: { date: string; value: number }[]) {
  seriesCache.set(seriesId, { ts: Date.now(), data });
}

// ConvexTrade - free macro data, 无浏览器 CORS 头 -> 经 /convex 转发（dev 走 vite，生产走 server/proxy.mjs）。
// 海外直连部署时构建加 VITE_UPSTREAM=direct。
const UPSTREAM_VIA_PROXY = import.meta.env.VITE_UPSTREAM !== 'direct'

export const convexApi = axios.create({
  baseURL: UPSTREAM_VIA_PROXY ? '/convex' : 'https://convextrade.com/api/public',
  timeout: 8000,
});

// alternative.me - Fear & Greed Index
export const fngApi = axios.create({
  baseURL: 'https://api.alternative.me',
  timeout: 10000,
});

// Yahoo Finance (via rapidapi or direct - rate limited)
export const yahooApi = axios.create({
  baseURL: 'https://query1.finance.yahoo.com/v8/finance',
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0' },
});

// Helper: fetch ConvexTrade time series (with 30s in-memory cache)
export async function fetchConvexSeries(seriesId: string, limit = 60): Promise<{ date: string; value: number }[]> {
  const cached = getCached(seriesId);
  if (cached) return cached;

  try {
    const { data } = await convexApi.get(`/data/${seriesId}`, {
      params: { limit, format: 'json' },
    });
    const result = data?.data ?? [];
    setCache(seriesId, result);
    reportSource('convex', true);
    return result;
  } catch (err) {
    reportSource(
      'convex',
      false,
      err instanceof Error ? `${err.message}（已回退 FRED / 财政部曲线）` : '宏观序列接口不可达（已回退 FRED / 财政部曲线）',
    );
    return [];
  }
}

// Helper: fetch latest value from ConvexTrade (with 30s in-memory cache)
export async function fetchConvexLatest(seriesId: string): Promise<number | null> {
  const series = await fetchConvexSeries(seriesId, 2);
  if (series.length > 0) {
    return series[series.length - 1].value;
  }
  return null;
}

/**
 * 恐惧贪婪指数（alternative.me，公开 CORS API）
 * value: 0(极度恐慌) ~ 100(极度贪婪)，classification 为官方文字定性
 */
export async function fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
  try {
    const resp = await fetchJ('https://api.alternative.me/fng/?limit=1&format=json', 8000);
    const json = await resp.json();
    const d = json?.data?.[0];
    if (!d || d.value == null) return null;
    return { value: Number(d.value), classification: String(d.value_classification ?? '') };
  } catch {
    return null;
  }
}

// ─── Yahoo Finance 个股行情 ───

export interface StockCandle {
  time: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

interface YahooCandleCache {
  ts: number;
  data: StockCandle[];
}
const candleCache = new Map<string, YahooCandleCache>();
const CANDLE_CACHE_TTL = 60_000; // 1 min

/**
 * 获取个股K线数据
 * @param rawSymbol 原始代码如 'AAPL' / '600519'
 * @param market 'US' | 'CN'
 * @param range '1mo' | '3mo' | '6mo' | '1y'
 * @param interval '1d' | '1wk' | '1mo'
 */
export async function fetchStockCandles(
  rawSymbol: string,
  market: 'US' | 'CN',
  range: string = '3mo',
  interval: string = '1d',
): Promise<StockCandle[]> {
  const yahooSymbol = toYahooSymbol(rawSymbol, market);
  const cacheKey = `${market}:${rawSymbol}:${range}:${interval}`;
  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CANDLE_CACHE_TTL) return cached.data;

  let candles: StockCandle[] = [];
  try {
    const resp = await fetchJ(
      `${yahooBase()}/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}`,
      7000,
      { 'User-Agent': 'Mozilla/5.0' },
    );
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (result) {
      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0];
      if (quote && timestamps.length) {
        for (let i = 0; i < timestamps.length; i++) {
          const o = quote.open?.[i];
          const h = quote.high?.[i];
          const l = quote.low?.[i];
          const c = quote.close?.[i];
          const v = quote.volume?.[i];
          if (o == null || c == null) continue;
          const d = new Date(timestamps[i] * 1000);
          candles.push({
            time: d.toISOString().split('T')[0],
            open: o,
            high: h ?? o,
            low: l ?? o,
            close: c,
            volume: v ?? 0,
          });
        }
      }
    }
  } catch {
    candles = [];
  }

  // Yahoo 打不开/被封/被 449 拦截时，走腾讯证券 CORS 直连兜底（美股 usX、A股 sh/szX），东财殿后
  if (!candles.length) {
    const tx = await fetchTXCandles(rawSymbol, market, range);
    if (tx.length) {
      candles = tx;
      candleCache.set(cacheKey, { ts: Date.now(), data: candles });
      return candles;
    }
    const em = await fetchEMCandles(rawSymbol, market, range, interval);
    if (em.length) {
      candles = em;
      candleCache.set(cacheKey, { ts: Date.now(), data: candles });
      return candles;
    }
  }

  candleCache.set(cacheKey, { ts: Date.now(), data: candles });
  return candles;
}

/**
 * 获取个股报价摘要
 * 美股优先东财实时（国内可访问）→ Yahoo 兜底；A股维持 Yahoo（候选池现价走腾讯批量）。
 */
export async function fetchStockQuote(
  rawSymbol: string,
  market: 'US' | 'CN',
): Promise<StockQuote | null> {
  if (market === 'US') {
    // 腾讯美股实时（CORS 直连、国内可访问）→ 东财兜底 → Yahoo
    const tx = await fetchTXUSQuote(rawSymbol);
    if (tx) return tx;
    const em = await fetchEMQuote(rawSymbol);
    if (em) return em;
  }
  const yahooSymbol = toYahooSymbol(rawSymbol, market);
  try {
    const resp = await fetchJ(
      `${yahooBase()}/v8/finance/chart/${yahooSymbol}?interval=1d&range=2d`,
      7000,
      { 'User-Agent': 'Mozilla/5.0' },
    );
    const json = await resp.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      symbol: rawSymbol,
      name: meta.shortName ?? meta.symbol ?? rawSymbol,
      price: meta.regularMarketPrice ?? 0,
      change: meta.regularMarketPrice - (meta.previousClose ?? meta.regularMarketPrice),
      changePercent:
        meta.previousClose
          ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
          : 0,
      previousClose: meta.previousClose ?? meta.regularMarketPrice,
    };
  } catch {
    return null;
  }
}

// ─── 东方财富行情兜底（大陆可直连，供美股现价/K线） ───

/** 东财 secid：A股 沪 60/68/9 前缀 → 1.xxx，深 00/30 → 0.xxx；美股 → 105.XXX */
function emSecid(raw: string, market: 'US' | 'CN'): string {
  if (market === 'CN') return /^[689]/.test(raw) ? `1.${raw}` : `0.${raw}`;
  return `105.${raw}`;
}

function emQuoteBase(): string {
  return UPSTREAM_VIA_PROXY ? '/eastmoney-quote' : 'https://push2.eastmoney.com';
}

function emKlineBase(): string {
  return UPSTREAM_VIA_PROXY ? '/eastmoney-kline' : 'https://push2his.eastmoney.com';
}

/** 腾讯美股实时报价（CORS 直连，国内可访问，无需代理） */
async function fetchTXUSQuote(raw: string): Promise<StockQuote | null> {
  try {
    const sym = `us${raw}`;
    const resp = await fetchJ(`https://qt.gtimg.cn/q=${sym}`, 6000);
    const text = await resp.text();
    const m = text.match(/"([^"]*)"/);
    if (!m) return null;
    const f = m[1].split('~');
    if (f.length < 35) return null;
    const num = (i: number) => { const v = parseFloat(f[i]); return Number.isFinite(v) ? v : 0; };
    const price = num(3);
    if (!price) return null;
    return {
      symbol: raw,
      name: f[1] || raw,
      price,
      change: num(31),
      changePercent: num(32),
      previousClose: num(4),
    };
  } catch {
    return null;
  }
}

/** 腾讯证券日K（CORS 直连，data[sym].day：date,open,close,high,low,volume；美股 usX，A股 sh/szX） */
async function fetchTXCandles(raw: string, market: 'US' | 'CN', range: string): Promise<StockCandle[]> {
  const lmt = range === '1mo' ? 30 : range === '6mo' ? 180 : range === '1y' ? 320 : range === '2y' ? 500 : 90;
  try {
    const sym = market === 'US' ? `us${raw}` : toTencentSymbol(raw);
    const api = market === 'US' ? '/appstock/app/usfqkline/get' : '/appstock/app/fqkline/get';
    const resp = await fetchJ(`https://web.ifzq.gtimg.cn${api}?param=${sym},day,,,${lmt},qfq`, 7000);
    const json = await resp.json();
    const node = json?.data?.[sym];
    const rows: string[][] = node?.day ?? node?.qfqday ?? [];
    return rows
      .map((p) => {
        if (p.length < 6) return null;
        const time = p[0];
        const open = parseFloat(p[1]);
        const close = parseFloat(p[2]);
        const high = parseFloat(p[3]);
        const low = parseFloat(p[4]);
        const volume = parseFloat(p[5]) || 0;
        if ([time, open, close, high, low].includes(NaN)) return null;
        return { time, open, close, high, low, volume };
      })
      .filter((c): c is StockCandle => c != null);
  } catch {
    return [];
  }
}

/** 东财实时报价（美股 secid=105.XXX） */
async function fetchEMQuote(raw: string): Promise<StockQuote | null> {
  try {
    const resp = await fetchJ(
      `${emQuoteBase()}/api/qt/stock/get?secid=${emSecid(raw, 'US')}&fields=f43,f57,f58,f59,f60,f168,f169,f170`,
      6000,
    );
    const json = await resp.json();
    const d = json?.data;
    if (!d || d.f43 === '-' || d.f43 == null) return null;
    const digits = d.f59 ?? 2;
    const price = d.f43 / 10 ** digits;
    const prevClose = d.f60 != null && d.f60 !== '-' ? d.f60 / 10 ** digits : price;
    return {
      symbol: raw,
      name: String(d.f58 ?? raw),
      price,
      change: d.f169 != null && d.f169 !== '-' ? d.f169 / 10 ** digits : price - prevClose,
      changePercent: d.f170 != null && d.f170 !== '-' ? d.f170 / 100 : prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      previousClose: prevClose,
    };
  } catch {
    return null;
  }
}

/** 东财日/周/月K线兜底（A股+美股均支持） */
async function fetchEMCandles(
  raw: string,
  market: 'US' | 'CN',
  range: string,
  interval: string,
): Promise<StockCandle[]> {
  const klt = interval === '1wk' ? 102 : interval === '1mo' ? 103 : 101;
  const lmt = range === '1mo' ? 30 : range === '6mo' ? 180 : range === '1y' ? 320 : range === '2y' ? 500 : 90;
  try {
    const resp = await fetchJ(
      `${emKlineBase()}/api/qt/stock/kline/get?secid=${emSecid(raw, market)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&end=20500101&lmt=${lmt}`,
      6000,
    );
    const json = await resp.json();
    const klines: string[] | undefined = json?.data?.klines;
    if (!klines || !klines.length) return [];
    return klines
      .map((row) => {
        const p = row.split(',');
        if (p.length < 6) return null;
        const time = p[0];
        const open = parseFloat(p[1]);
        const close = parseFloat(p[2]);
        const high = parseFloat(p[3]);
        const low = parseFloat(p[4]);
        const volume = parseFloat(p[5]) || 0;
        if ([time, open, close, high, low].includes(NaN)) return null;
        return { time, open, close, high, low, volume };
      })
      .filter((c): c is StockCandle => c != null);
  } catch {
    return [];
  }
}

/**
 * 将原始代码转为 Yahoo Finance 符号
 * A股: 600519 → 600519.SS (上海 60xxxx) / 000858.SZ (深圳 00xxxx/30xxxx)
 */
function toYahooSymbol(raw: string, market: 'US' | 'CN'): string {
  if (market === 'CN') {
    if (/^[68]/.test(raw)) return `${raw}.SS`;
    return `${raw}.SZ`;
  }
  return raw;
}

/**
 * Yahoo 行情基址：经 /yahoo 代理（绕 449 反爬/跨域；生产走 server/proxy.mjs）。
 */
function yahooBase(): string {
  return UPSTREAM_VIA_PROXY ? '/yahoo' : 'https://query1.finance.yahoo.com';
}

// ─── 腾讯行情接口（A股实时/五档，JSONP 免 key，批量） ───

export interface TencentQuote {
  code: string;       // 原始代码 600519
  name: string;
  price: number;
  prevClose: number;
  open: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;     // 手
  amount: number;     // 万元
  turnover: number;   // 换手率 %
  pe: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
  time: string;
}

/**
 * 原始A股代码 → 腾讯带市场前缀符号
 * 600xxx/601xxx/603xxx/605xxx/688xxx → sh；000/001/002/003/300/301 → sz；4xx/8xx → bj
 */
export function toTencentSymbol(raw: string): string {
  if (/^(4|8)/.test(raw)) return `bj${raw}`;
  if (/^6/.test(raw)) return `sh${raw}`;
  return `sz${raw}`;
}

function loadTencentScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('tencent quote network error'));
    };
    document.head.appendChild(script);
  });
}

function parseTencentQuote(raw: string): TencentQuote | null {
  const f = raw.split('~');
  if (f.length < 40) return null;
  const num = (i: number) => {
    const v = parseFloat(f[i]);
    return Number.isFinite(v) ? v : 0;
  };
  const code = f[2];
  const price = num(3);
  const prevClose = num(4);
  // 买卖五档：9..18 买1价,买1量,... 19..28 卖1价,卖1量,...
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];
  let bidCum = 0;
  let askCum = 0;
  for (let i = 0; i < 5; i++) {
    const bPrice = num(9 + i * 2);
    const bVol = num(10 + i * 2);
    bidCum += bVol;
    bids.push({ price: bPrice, volume: bVol, cumulative: bidCum });
  }
  for (let i = 0; i < 5; i++) {
    const aPrice = num(19 + i * 2);
    const aVol = num(20 + i * 2);
    askCum += aVol;
    asks.push({ price: aPrice, volume: aVol, cumulative: askCum });
  }
  return {
    code,
    name: f[1],
    price,
    prevClose,
    open: num(5),
    change: num(31),
    changePercent: num(32),
    high: num(33),
    low: num(34),
    volume: num(36),
    amount: num(37),
    turnover: num(38),
    pe: num(39),
    bids,
    asks,
    time: f[30],
  };
}

/**
 * 批量获取 A股实时行情（含买卖五档）。一次请求多只，JSONP 方式。
 * @param rawCodes 原始代码数组，如 ['600519','000858']
 * @returns code → TencentQuote
 */
export async function fetchTencentQuotes(rawCodes: string[]): Promise<Record<string, TencentQuote>> {
  if (!rawCodes.length) return {};
  const symbols = rawCodes.map(toTencentSymbol);
  const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`;
  const result: Record<string, TencentQuote> = {};
  try {
    await loadTencentScript(url);
    for (const sym of symbols) {
      const rawVar = (window as any)[`v_${sym}`];
      if (typeof rawVar === 'string') {
        const q = parseTencentQuote(rawVar);
        if (q) result[q.code] = q;
      }
    }
  } catch {
    return {};
  }
  return result;
}
