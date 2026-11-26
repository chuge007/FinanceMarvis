/**
 * 跨资产归一化与合成：全球地形面板的唯一数据入口。
 *
 * 纪律：
 *  - 只取真实上游（Yahoo Chart / FRED / CBOE / 统一快照），失败就返回空，绝不插值或随机；
 *  - 每条序列自己算滚动 Z（250 日窗口）与近一年分位，不把不同量级混在一根轴上；
 *  - 派生量（铜金比、HYG-LQD、VIX/VIX3M、成交量比）一律用原始值按日期交集计算；
 *  - 5 分钟原始缓存 + inflight 去重，避免首屏被 20 多个请求拖垮。
 */
import { percentileOf, rollingZScores } from '../../shared/utils/seriesStats';
import type { FredPoint } from '../../services/fred';
import type { RhythmSnapshot } from '../../modules/rhythm/services/rhythm';
import type { OptionsSentimentSnapshot } from '../../types/sentiment';
import { CROSS_ASSET_DEFS, type CrossAssetDef } from './crossAssetCatalog';
import { fetchAllRaw, type RawCache } from './crossAssetSources';
import type { AssetPoint, CrossAssetReading, CrossAssetSnapshot } from './crossAssetTypes';

export type { AssetPoint, CrossAssetReading, CrossAssetSnapshot } from './crossAssetTypes';

const TTL = 5 * 60_000;
const ROLLING = 250;
const SPARK_LEN = 90;

let rawCache: RawCache | null = null;
let inflight: Promise<CrossAssetSnapshot> | null = null;

function normalize(id: string, def: CrossAssetDef, raw: { date: string; value: number; volume?: number }[]): AssetPoint[] {
  const points = raw.filter((p) => Number.isFinite(p.value));
  const values = points.map((p) => p.value);
  const zs = rollingZScores(values, ROLLING);
  return points.map((p, i) => ({ date: p.date, value: p.value, z: zs[i], volume: p.volume }));
}

function buildReading(id: string, def: CrossAssetDef, points: AssetPoint[]): CrossAssetReading {
  const values = points.map((p) => p.value);
  const latest = values.length ? values[values.length - 1] : null;
  const prev = values.length > 1 ? values[values.length - 2] : null;
  const z = points.length ? points[points.length - 1].z : null;
  const percentile = latest === null ? null : percentileOf(values, latest);
  const riskZ = def.polarity !== 0 && z !== null ? def.polarity * z : null;
  const status: CrossAssetReading['status'] =
    latest === null
      ? 'missing'
      : riskZ === null
        ? 'neutral'
        : riskZ >= 0.5
          ? 'riskOn'
          : riskZ <= -0.5
            ? 'riskOff'
            : 'neutral';

  return {
    id,
    label: def.label,
    short: def.short,
    group: def.group,
    source: def.source,
    actualSource: def.source,
    region: def.region,
    unit: def.unit,
    digits: def.digits,
    polarity: def.polarity,
    role: def.role,
    latest,
    change: latest !== null && prev !== null ? latest - prev : null,
    changePct: latest !== null && prev !== null && prev !== 0 ? (latest / prev - 1) * 100 : null,
    z,
    percentile,
    riskZ,
    spark: values.slice(-SPARK_LEN),
    asOf: points.length ? points[points.length - 1].date : null,
    status,
    note: def.note,
    pitfall: def.pitfall,
    externalUrl: def.externalUrl,
  };
}

function missingReading(id: string, def: CrossAssetDef): CrossAssetReading {
  return buildReading(id, def, []);
}

function alignTwo(a: AssetPoint[], b: AssetPoint[]): { dates: string[]; av: number[]; bv: number[] } {
  const map = new Map(b.map((p) => [p.date, p.value]));
  const dates: string[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  a.forEach((p) => {
    const other = map.get(p.date);
    if (other === undefined || !Number.isFinite(other) || !Number.isFinite(p.value)) return;
    dates.push(p.date);
    av.push(p.value);
    bv.push(other);
  });
  return { dates, av, bv };
}

function ratioSeries(a: AssetPoint[], b: AssetPoint[]): AssetPoint[] {
  const { dates, av, bv } = alignTwo(a, b);
  const out: AssetPoint[] = [];
  dates.forEach((date, i) => {
    if (bv[i] !== 0) out.push({ date, value: av[i] / bv[i], z: null });
  });
  return out;
}

/** 20 日收益差（百分点）：a 跑赢 b 为正。 */
function excessReturnSeries(a: AssetPoint[], b: AssetPoint[], window = 20): AssetPoint[] {
  const { dates, av, bv } = alignTwo(a, b);
  const out: AssetPoint[] = [];
  for (let i = window; i < dates.length; i++) {
    const aBase = av[i - window];
    const bBase = bv[i - window];
    if (!aBase || !bBase) continue;
    const diff = (av[i] / aBase - 1) * 100 - (bv[i] / bBase - 1) * 100;
    out.push({ date: dates[i], value: diff, z: null });
  }
  return out;
}

/** 当日成交量相对前 20 日均量的倍数；只作关注度代理，不是净流入。 */
function volumeRatioSeries(points: AssetPoint[], window = 20): AssetPoint[] {
  const out: AssetPoint[] = [];
  for (let i = window; i < points.length; i++) {
    const prev = points.slice(i - window, i).map((p) => p.volume ?? 0).filter((v) => v > 0);
    if (!prev.length) continue;
    const avg = prev.reduce((x, y) => x + y, 0) / prev.length;
    const volume = points[i].volume ?? 0;
    if (avg > 0 && volume > 0) out.push({ date: points[i].date, value: volume / avg, z: null });
  }
  return out;
}

function fromSnapshot(rhythm: RhythmSnapshot | null, id: string): AssetPoint[] {
  const points = rhythm?.series?.[id]?.points ?? [];
  return points
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ date: p.date, value: p.value, z: p.z ?? null }));
}

function cboeReading(def: CrossAssetDef, options: OptionsSentimentSnapshot | null): CrossAssetReading {
  const item = options?.ratios.find((r) => r.officialName === def.ref) ?? null;
  const base = missingReading(def.id, def);
  if (!item || item.value === null) return base;
  const reading: CrossAssetReading = {
    ...base,
    latest: item.value,
    asOf: options ? options.generatedAt.slice(0, 10) : null,
    status: item.reading === '偏高' ? 'riskOff' : item.reading === '偏低' ? 'riskOn' : 'neutral',
    norm: item.norm ?? undefined,
  };
  return reading;
}

/** 把原始序列组装成读数；rhythm 与 options 必传，缺失的格子自然变「缺」。 */
function buildSnapshot(
  yahoo: Record<string, AssetPoint[]>,
  fred: Record<string, FredPoint[]>,
  tencent: Record<string, AssetPoint[]>,
  treasury: Record<string, FredPoint[]>,
  rhythm: RhythmSnapshot | null,
  options: OptionsSentimentSnapshot | null,
  errors: string[],
): CrossAssetSnapshot {
  const readings: Record<string, CrossAssetReading> = {};
  const series: Record<string, AssetPoint[]> = {};

  const pickFallback = (ref: string): { points: FredPoint[]; source: 'fred' | 'treasury' } | null => {
    if (fred[ref]?.length) return { points: fred[ref], source: 'fred' };
    if (treasury[ref]?.length) return { points: treasury[ref], source: 'treasury' };
    return null;
  };

  CROSS_ASSET_DEFS.forEach((def) => {
    if (def.source === 'cboe') {
      readings[def.id] = cboeReading(def, options);
      return;
    }
    if (def.source === 'derived') return;

    let points: AssetPoint[] = [];
    let actualSource: CrossAssetReading['actualSource'] = def.source;
    if (def.source === 'yahoo') {
      points = normalize(def.id, def, yahoo[def.ref] ?? []);
      // Yahoo 不可达时，仅对同一现货指数做腾讯兜底；期指/汇率/商品不找替代。
      if (!points.length && def.tencentSymbol) {
        const fallback = tencent[def.tencentSymbol] ?? [];
        if (fallback.length) {
          points = normalize(def.id, def, fallback);
          actualSource = 'tencent';
        }
      }
    }
    if (def.source === 'snapshot') {
      points = fromSnapshot(rhythm, def.ref);
      // 快照缺失时的兜底顺序：Yahoo 同口径（VIX）→ FRED → 财政部曲线。
      if (!points.length && def.yahooFallback && yahoo[def.yahooFallback]?.length) {
        points = normalize(def.id, def, yahoo[def.yahooFallback]);
        actualSource = 'yahoo';
      }
      if (!points.length) {
        const fallback = pickFallback(def.ref);
        if (fallback) {
          points = normalize(def.id, def, fallback.points);
          actualSource = fallback.source;
        }
      }
    }
    if (def.source === 'fred') {
      const fallback = pickFallback(def.ref);
      if (fallback) {
        points = normalize(def.id, def, fallback.points);
        actualSource = fallback.source;
      }
    }

    series[def.id] = points;
    readings[def.id] = { ...buildReading(def.id, def, points), actualSource };
  });

  // 官方 2s10s 缺失时，用 10Y - 2Y 的日期交集补齐：同一数学定义，不插值、不估算。
  if ((readings.T10Y2Y?.latest ?? null) === null) {
    const ten = series.DGS10 ?? [];
    const two = series.DGS2 ?? [];
    if (ten.length && two.length) {
      const { dates, av, bv } = alignTwo(ten, two);
      const def = CROSS_ASSET_DEFS.find((d) => d.id === 'T10Y2Y');
      const points = dates.map((date, i) => ({ date, value: av[i] - bv[i], z: null }));
      if (def && points.length) {
        const normalized = normalize('T10Y2Y', def, points);
        series.T10Y2Y = normalized;
        readings.T10Y2Y = {
          ...buildReading('T10Y2Y', def, normalized),
          source: 'derived',
          actualSource: 'derived',
        };
      }
    }
  }

  // 派生量：只能用原始值按日期交集计算，不拿 Z 再算一次。
  const derived = (id: string, points: AssetPoint[]) => {
    const def = CROSS_ASSET_DEFS.find((d) => d.id === id);
    if (!def) return;
    const normalized = normalize(id, def, points);
    series[id] = normalized;
    readings[id] = buildReading(id, def, normalized);
  };

  derived('HYG_LQD', excessReturnSeries(yahoo.HYG ?? [], yahoo.LQD ?? []));
  derived('COPPER_GOLD', ratioSeries(yahoo['HG=F'] ?? [], yahoo['GC=F'] ?? []));
  // 用 series.VIX 而不是原始快照：VIX 快照缺失时会由 Yahoo ^VIX 兜底，期限比才能一起恢复。
  derived('VIX_TERM', ratioSeries(series.VIX ?? [], yahoo['^VIX3M'] ?? []));
  derived('SPY_ACT', volumeRatioSeries(yahoo.SPY ?? []));
  derived('QQQ_ACT', volumeRatioSeries(yahoo.QQQ ?? []));

  const all = Object.values(readings);
  const available = all.filter((r) => r.latest !== null).length;

  // 汇总缺失：只记一条能指导排查的信息，不逐格刷屏
  const missingYahoo = CROSS_ASSET_DEFS.filter(
    (d) => d.source === 'yahoo' && (readings[d.id]?.latest ?? null) === null,
  ).map((d) => d.ref);
  const missingFred = CROSS_ASSET_DEFS.filter(
    (d) => d.source === 'fred' && (readings[d.id]?.latest ?? null) === null,
  ).map((d) => d.ref);
  if (missingYahoo.length) errors.push(`Yahoo 缺 ${missingYahoo.length} 条：${missingYahoo.slice(0, 6).join('、')}`);
  if (missingFred.length) errors.push(`FRED 缺 ${missingFred.length} 条：${missingFred.slice(0, 6).join('、')}`);

  return {
    readings,
    series,
    fetchedAt: new Date().toISOString(),
    available,
    total: all.length,
    errors,
  };
}

/**
 * 取全球地形快照。rhythm 用于复用 VIX / HY OAS / 10Y / 曲线 / 情绪，避免重复请求。
 */
export async function fetchCrossAsset(
  rhythm: RhythmSnapshot | null,
  options: OptionsSentimentSnapshot | null,
  force = false,
): Promise<CrossAssetSnapshot> {
  if (inflight) return inflight;

  inflight = (async () => {
    const usableCache = rawCache && !force && Date.now() - rawCache.ts < TTL ? rawCache : null;
    const raw = usableCache ?? (await fetchAllRaw());
    rawCache = raw;
    return buildSnapshot(raw.yahoo, raw.fred, raw.tencent, raw.treasury, rhythm, options, []);
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}


