/**
 * VIX 期限结构：近月波动率（^VIX）÷ 三个月波动率（^VIX3M）。
 *
 * 为什么单独做一个服务：
 *  - 现有 `optionsSentiment.ts` 只取最近 5 天的 meta 价，能给出「当前比值」，
 *    但画不出走势、也算不出分位；期限结构的价值恰恰在于「比值处在什么位置、在往哪走」。
 *  - 这里需要两条 1 年日线的按日对齐序列，属于另一条取数链路，故独立成服务。
 *
 * 口径说明（不做二次换算，直接用上游收盘价）：
 *  - 比值 > 1：近月比三个月贵 → 倒挂（backwardation），市场在为眼前风险定价；
 *  - 比值 < 0.92：近低远高 → Contango，常态平静；
 *  - 中间区间记为平坦。
 * 缺数据一律返回 missing，不插值、不用历史印象补。
 */
import { percentileOf, zScore } from '../shared/utils/seriesStats';
import { reportSource } from '../shared/utils/sourceHealth';

export type TermState = 'backwardation' | 'flat' | 'contango' | 'unknown';

export interface TermPoint {
  date: string;
  ratio: number;
  z: number | null;
}

export interface TermStructure {
  points: TermPoint[];
  latest: number | null;
  z: number | null;
  percentile: number | null;
  state: TermState;
  change5: number | null;
  asOf: string | null;
  source: 'real' | 'missing';
  /** 缺数据时说明原因，供 UI 直接展示，不猜。 */
  note: string;
}

const CACHE_TTL = 5 * 60_000;
const ROLLING_WINDOW = 120;
const MIN_WINDOW = 20;
const MIN_POINTS = 30;

let cache: { ts: number; value: TermStructure } | null = null;
let inflight: Promise<TermStructure> | null = null;

function yahooBase(): string {
  return import.meta.env.VITE_UPSTREAM === 'direct'
    ? 'https://query1.finance.yahoo.com'
    : '/yahoo';
}

function missing(note: string): TermStructure {
  reportSource('yahoo', false, note);
  return {
    points: [],
    latest: null,
    z: null,
    percentile: null,
    state: 'unknown',
    change5: null,
    asOf: null,
    source: 'missing',
    note,
  };
}

/** 取一条指数的 1 年日线收盘；失败返回空数组。 */
async function fetchCloses(symbol: string): Promise<{ date: string; close: number }[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);
  try {
    const url = `${yahooBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
    const resp = await fetch(url, {
      headers: { Referer: 'https://finance.yahoo.com/' },
      signal: ctrl.signal,
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    const stamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const out: { date: string; close: number }[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const close = closes[i];
      if (close === null || close === undefined || !Number.isFinite(close) || close <= 0) continue;
      out.push({ date: new Date(stamps[i] * 1000).toISOString().slice(0, 10), close });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function termStateLabel(state: TermState): string {
  if (state === 'backwardation') return '倒挂（近高远低）';
  if (state === 'contango') return 'Contango（近低远高）';
  if (state === 'flat') return '平坦';
  return '缺';
}

/** 拉取并按日对齐两条曲线，逐点算滚动 Z。 */
export async function fetchTermStructure(force = false): Promise<TermStructure> {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL) return cache.value;
  if (inflight) return inflight;

  const task = (async (): Promise<TermStructure> => {
    const [vix, vix3m] = await Promise.all([fetchCloses('^VIX'), fetchCloses('^VIX3M')]);
    if (vix.length < MIN_POINTS || vix3m.length < MIN_POINTS) {
      return missing('^VIX 或 ^VIX3M 不可达（通常需要出海代理），期限结构暂无读数');
    }

    const map3m = new Map(vix3m.map((p) => [p.date, p.close]));
    const base: { date: string; ratio: number }[] = [];
    for (const point of vix) {
      const far = map3m.get(point.date);
      if (far === undefined || far <= 0) continue;
      base.push({ date: point.date, ratio: point.close / far });
    }
    if (base.length < MIN_POINTS) {
      return missing('^VIX 与 ^VIX3M 没有足够的共同交易日，期限结构暂无读数');
    }

    const ratios = base.map((p) => p.ratio);
    const points: TermPoint[] = base.map((point, index) => {
      const from = Math.max(0, index - ROLLING_WINDOW + 1);
      const window = ratios.slice(from, index + 1);
      const z = window.length >= MIN_WINDOW ? zScore(window, point.ratio) : null;
      return { date: point.date, ratio: point.ratio, z };
    });

    const latest = ratios[ratios.length - 1];
    reportSource('yahoo', true);
    const state: TermState = latest > 1.05
      ? 'backwardation'
      : latest < 0.92
        ? 'contango'
        : 'flat';

    return {
      points,
      latest,
      z: points[points.length - 1]?.z ?? null,
      percentile: percentileOf(ratios, latest),
      state,
      change5: ratios.length > 5 ? latest - ratios[ratios.length - 6] : null,
      asOf: base[base.length - 1].date,
      source: 'real',
      note: '',
    };
  })();

  inflight = task;
  try {
    const value = await task;
    cache = { ts: Date.now(), value };
    return value;
  } finally {
    inflight = null;
  }
}

/** 供其他模块在不发起请求的前提下读取最近一次结果。 */
export function peekTermStructure(): TermStructure | null {
  return cache?.value ?? null;
}
