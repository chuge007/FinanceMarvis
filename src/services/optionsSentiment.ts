/**
 * 美股大盘期权情绪：CBOE 官方全市场 Put/Call + Yahoo 波动率指数族。
 *
 * 数据链路：
 *   /cboe  → www.cboe.com/us/options/market_statistics/daily/（页面内嵌 JSON，真实官方统计）
 *   /yahoo → query1.finance.yahoo.com/v8/finance/chart/{symbol}（VIX/VVIX/SKEW/期限结构）
 *
 * 设计原则：任何单一上游失败只丢弃该部分数据，不用模拟值冒充真实读数；
 * 60 秒内存缓存 + 请求去重，避免多个 Hook 同时拉取。
 */
import type {
  OptionQuote,
  OptionRatioItem,
  OptionsSentimentSnapshot,
  OptionVolumeOI,
} from '../types/sentiment';

const CBOE_URL = 'https://www.cboe.com/us/options/market_statistics/daily/';
const CBOE_PROXY = '/cboe/us/options/market_statistics/daily/';
const YAHOO_BASE = import.meta.env.VITE_UPSTREAM === 'direct'
  ? 'https://query1.finance.yahoo.com'
  : '/yahoo';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_TTL = 60_000;

// 与 Python 参考实现一致的历史常态区间，仅用于标注高低，不参与数值生成。
const RATIO_META: Record<string, { label: string; norm: [number, number] }> = {
  'TOTAL PUT/CALL RATIO': { label: 'Total P/C', norm: [0.70, 1.10] },
  'INDEX PUT/CALL RATIO': { label: 'Index P/C', norm: [0.90, 1.40] },
  'EQUITY PUT/CALL RATIO': { label: 'Equity P/C', norm: [0.45, 0.75] },
  'EXCHANGE TRADED PRODUCTS PUT/CALL RATIO': { label: 'ETP P/C', norm: [0.90, 1.30] },
  'CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO': { label: 'VIX P/C', norm: [0.60, 1.00] },
  'SPX + SPXW + SPXO PUT/CALL RATIO': { label: 'SPX P/C', norm: [1.00, 1.60] },
};

const VOL_LABELS: Record<string, string> = {
  '^VIX9D': 'VIX 9天',
  '^VIX': 'VIX 30天',
  '^VIX3M': 'VIX 3个月',
  '^VIX6M': 'VIX 6个月',
  '^VIX1Y': 'VIX 1年',
};

const OTHER_LABELS: Record<string, string> = {
  '^SKEW': 'SKEW',
  '^VVIX': 'VVIX',
  '^GSPC': '标普500',
  '^NDX': '纳指100',
};

let cache: { ts: number; value: OptionsSentimentSnapshot } | null = null;
let inflight: Promise<OptionsSentimentSnapshot> | null = null;

async function getText(url: string, timeout: number, headers: Record<string, string> = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function computeRatio(put: number, call: number): number | null {
  return call > 0 ? Number((put / call).toFixed(3)) : null;
}

function classify(value: number | null, norm: [number, number] | null): OptionRatioItem['reading'] {
  if (value === null) return '无数据';
  if (!norm) return '常态';
  if (value > norm[1]) return '偏高';
  if (value < norm[0]) return '偏低';
  return '常态';
}

/** 解析 CBOE 页面内嵌 JSON 中的成交量/未平仓三段数值。 */
function parseTriplet(chunk: string, name: string): Omit<OptionVolumeOI, 'putCallRatio'> | null {
  const start = chunk.indexOf(`"${name}"`);
  if (start < 0) return null;
  const m = chunk.slice(start).match(
    /"call"\s*:\s*"?([0-9][0-9,.]*)"?\s*,\s*"put"\s*:\s*"?([0-9][0-9,.]*)"?\s*,\s*"total"\s*:\s*"?([0-9][0-9,.]*)"?/,
  );
  if (!m) return null;
  return {
    call: toNumber(m[1]) ?? 0,
    put: toNumber(m[2]) ?? 0,
    total: toNumber(m[3]) ?? 0,
  };
}

function parseVolumeBlock(
  flat: string,
  block: string,
): { volume: OptionVolumeOI; openInterest: OptionVolumeOI } | null {
  const idx = flat.indexOf(`"${block}":[`);
  if (idx < 0) return null;
  const chunk = flat.slice(idx, idx + 1200);
  const volume = parseTriplet(chunk, 'VOLUME');
  const openInterest = parseTriplet(chunk, 'OPEN INTEREST');
  if (!volume || !openInterest) return null;
  return {
    volume: { ...volume, putCallRatio: computeRatio(volume.put, volume.call) },
    openInterest: { ...openInterest, putCallRatio: computeRatio(openInterest.put, openInterest.call) },
  };
}

function parseCboe(html: string): {
  ratios: Record<string, number>;
  summary: Record<string, { volume: OptionVolumeOI; openInterest: OptionVolumeOI }>;
} {
  // CBOE 页面把 JSON 以字符串形式内嵌，先还原转义字符。
  const flat = html.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/&quot;/g, '"');
  const ratios: Record<string, number> = {};
  const re = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat)) !== null) {
    if (!/PUT\/CALL RATIO/i.test(m[1])) continue;
    const value = toNumber(m[2]);
    if (value !== null) ratios[m[1]] = value;
  }

  const summary: Record<string, { volume: OptionVolumeOI; openInterest: OptionVolumeOI }> = {};
  for (const block of [
    'SUM OF ALL PRODUCTS',
    'INDEX OPTIONS',
    'EXCHANGE TRADED PRODUCTS',
    'EQUITY OPTIONS',
    'CBOE VOLATILITY INDEX (VIX)',
  ]) {
    const parsed = parseVolumeBlock(flat, block);
    if (parsed) summary[block] = parsed;
  }
  return { ratios, summary };
}

async function fetchYahooQuote(symbol: string): Promise<OptionQuote | null> {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const json = JSON.parse(await getText(url, 9_000, { Referer: 'https://finance.yahoo.com/' }));
  const meta = json?.chart?.result?.[0]?.meta;
  const price = toNumber(meta?.regularMarketPrice);
  if (price === null) return null;
  const prev = toNumber(meta?.chartPreviousClose);
  return {
    symbol,
    label: VOL_LABELS[symbol] ?? OTHER_LABELS[symbol] ?? symbol,
    price: Number(price.toFixed(2)),
    changePct: prev !== null && prev > 0 ? Number(((price / prev - 1) * 100).toFixed(2)) : null,
  };
}

function interpretVerdict(
  total: number | null,
  equity: number | null,
  vix: number | null,
  skew: number | null,
  vix3m: number | null,
): string {
  const parts: string[] = [];
  if (total !== null) {
    if (total > 1.25) parts.push('全市场 Put/Call 显著偏高，避险/对冲需求升温（偏空）');
    else if (total < 0.55) parts.push('全市场 Put/Call 偏低，看涨情绪浓厚（偏多/需警惕过热）');
    else parts.push('全市场 Put/Call 处于常态区间');
  }
  if (equity !== null && equity > 0.85) parts.push('个股 Put/Call 偏高，个股层面避险情绪明显');
  if (vix !== null) {
    if (vix > 30) parts.push(`VIX ${vix} 处于高波动区间（恐慌）`);
    else if (vix > 20) parts.push(`VIX ${vix} 偏高（谨慎）`);
    else if (vix > 14) parts.push(`VIX ${vix} 温和`);
    else parts.push(`VIX ${vix} 低位（自满）`);
  }
  if (vix !== null && vix3m !== null && vix3m > 0) {
    const ratio = vix / vix3m;
    if (ratio < 0.92) parts.push('VIX 期限结构呈 Contango（近月低于远月，情绪平稳）');
    else if (ratio > 1.05) parts.push('VIX 期限结构倒挂（近月高于远月，短期压力上升）');
  }
  if (skew !== null) {
    if (skew > 140) parts.push(`SKEW ${skew} 偏高，尾部看跌保护需求强`);
    else if (skew < 120) parts.push(`SKEW ${skew} 偏低，尾部对冲需求清淡`);
  }
  return parts.length ? `${parts.join('；')}。` : '';
}

function buildTermStructure(quotes: Record<string, OptionQuote>): OptionsSentimentSnapshot['termStructure'] {
  const vix = quotes['^VIX']?.price ?? null;
  const vix3m = quotes['^VIX3M']?.price ?? null;
  if (vix === null || vix3m === null || vix3m <= 0) {
    return { ratio: null, shape: null, label: '—' };
  }
  const ratio = Number((vix / vix3m).toFixed(3));
  if (ratio < 0.92) return { ratio, shape: 'contango', label: 'Contango（近低远高）' };
  if (ratio > 1.05) return { ratio, shape: 'backwardation', label: '倒挂（近高远低）' };
  return { ratio, shape: 'flat', label: '平坦' };
}

/** 拉取并合并期权情绪数据；上游失败时返回带 errors 的空快照，绝不伪造数值。 */
export async function fetchOptionsSentiment(): Promise<OptionsSentimentSnapshot> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const errors: string[] = [];
    let ratios: Record<string, number> = {};
    let summary: Record<string, { volume: OptionVolumeOI; openInterest: OptionVolumeOI }> = {};

    try {
      const parsed = parseCboe(await getText(CBOE_PROXY, 15_000, { Referer: 'https://www.cboe.com/' }));
      ratios = parsed.ratios;
      summary = parsed.summary;
      if (!Object.keys(ratios).length) errors.push('CBOE 未返回 Put/Call 统计');
    } catch {
      errors.push('CBOE 数据源不可用');
    }

    const quotes: Record<string, OptionQuote> = {};
    await Promise.all(
      [...Object.keys(VOL_LABELS), ...Object.keys(OTHER_LABELS)].map(async (symbol) => {
        try {
          const quote = await fetchYahooQuote(symbol);
          if (quote) quotes[symbol] = quote;
        } catch {
          // 单个指数失败不影响其余波动率数据展示。
        }
      }),
    );
    if (!Object.keys(quotes).length) errors.push('Yahoo 波动率指数不可用');

    const ratioItems: OptionRatioItem[] = Object.entries(RATIO_META).map(([key, meta]) => {
      const value = ratios[key] ?? null;
      return {
        key,
        label: meta.label,
        officialName: key,
        value,
        norm: meta.norm,
        reading: classify(value, meta.norm),
      };
    });

    const verdict = interpretVerdict(
      ratios['TOTAL PUT/CALL RATIO'] ?? null,
      ratios['EQUITY PUT/CALL RATIO'] ?? null,
      quotes['^VIX']?.price ?? null,
      quotes['^SKEW']?.price ?? null,
      quotes['^VIX3M']?.price ?? null,
    );

    const value: OptionsSentimentSnapshot = {
      generatedAt: new Date().toISOString(),
      available: ratioItems.some((item) => item.value !== null) || Object.keys(quotes).length > 0,
      ratios: ratioItems,
      summary,
      quotes,
      termStructure: buildTermStructure(quotes),
      verdict: verdict || '期权数据源暂不可用，暂无判读。',
      sources: [CBOE_URL, 'Yahoo Finance chart API'],
      errors,
    };
    cache = { ts: Date.now(), value };
    return value;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
