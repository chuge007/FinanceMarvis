/**
 * 序列分析：叠加与相关性只在这里算，页面不自己实现公式。
 *
 * 关键约束：
 *  - 相关性必须用「变化率」：价格用对数收益，利率/利差/情绪用一阶差分；
 *    直接用水平值算相关会被趋势主导，产生虚假高相关。
 *  - 对齐用日期交集，不做前向填充。
 */
import { clamp, pearson, percentileOf, spearman, zScore } from '../../shared/utils/seriesStats';

export interface DatedValue {
  date: string;
  value: number;
  z?: number | null;
}

export interface AlignedPair {
  dates: string[];
  a: number[];
  b: number[];
}

/** 判断是否周末（周六/周日）。日期可能是 'YYYY-MM-DD'，也可能是带时间的 ISO 串。 */
function isWeekend(date: string): boolean {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return false;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * 取所有日度序列的日期并集，截取最近 days 个点。
 *
 * weekdaysOnly 默认开：宏观序列是交易日口径，而情绪类序列（alt.me 恐惧贪婪）全年每天都发。
 * 并集里混进周末后，交易日序列在每个周末都会空一格，叠加图上就会断成一截一截；
 * 同时 days 会被日历日稀释（120 个点只剩 4 个月）。市场休市日（节假日）仍会留单点缺口，
 * 由图表端用有限的 spanGaps 容错，不做插值。
 */
export function buildAxis(seriesList: DatedValue[][], days = 180, weekdaysOnly = true): string[] {
  const set = new Set<string>();
  seriesList.forEach((points) => points.forEach((p) => set.add(p.date)));
  let all = [...set].sort();
  if (weekdaysOnly) all = all.filter((d) => !isWeekend(d));
  return all.slice(-days);
}

/** 把一条序列对齐到统一日期轴；缺数据就是 null，不插值。 */
export function alignToAxis(points: DatedValue[], dates: string[], field: 'value' | 'z' = 'z'): (number | null)[] {
  const map = new Map(points.map((p) => [p.date, field === 'z' ? p.z ?? null : p.value]));
  return dates.map((d) => {
    const v = map.get(d);
    return v === undefined || v === null || !Number.isFinite(v) ? null : v;
  });
}

/** 一阶差分（利差、利率、情绪指数用）。 */
export function diff(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (Number.isFinite(d)) out.push(d);
  }
  return out;
}

/** 对数收益（价格序列用）。 */
export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev > 0 && cur > 0) out.push(Math.log(cur / prev));
  }
  return out;
}

/** 按日期交集对齐两条序列，返回日期与原始值。 */
export function alignPair(a: DatedValue[], b: DatedValue[]): AlignedPair {
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
  return { dates, a: av, b: bv };
}

export interface RollingCorrResult {
  dates: string[];
  values: (number | null)[];
}

/**
 * 滚动相关（变化率）。
 * @param window 观察窗口（交易日数）
 */
export function rollingCorrSeries(
  a: DatedValue[],
  b: DatedValue[],
  window = 60,
  method: 'pearson' | 'spearman' = 'pearson',
): RollingCorrResult {
  const aligned = alignPair(a, b);
  const da = diff(aligned.a);
  const db = diff(aligned.b);
  const dates = aligned.dates.slice(1);
  const fn = method === 'spearman' ? spearman : pearson;
  const values = dates.map((_, i) => {
    if (i + 1 < window) return null;
    const from = i + 1 - window;
    return fn(da.slice(from, i + 1), db.slice(from, i + 1));
  });
  return { dates, values };
}

/** 当前滚动相关；样本不足返回 null。 */
export function corrNow(
  a: DatedValue[],
  b: DatedValue[],
  window = 60,
  method: 'pearson' | 'spearman' = 'pearson',
): number | null {
  const series = rollingCorrSeries(a, b, window, method);
  for (let i = series.values.length - 1; i >= 0; i--) {
    const v = series.values[i];
    if (v !== null) return v;
  }
  return null;
}

/** 当前相关 vs back 个交易日前的相关，用于判断“关系是否翻转”。 */
export function corrChange(
  a: DatedValue[],
  b: DatedValue[],
  window = 60,
  back = 60,
): { current: number | null; previous: number | null; flipped: boolean } {
  const series = rollingCorrSeries(a, b, window);
  const valid = series.values.filter((v): v is number => v !== null);
  const current = valid.length ? valid[valid.length - 1] : null;
  const previous = valid.length > back ? valid[valid.length - 1 - back] : null;
  const flipped =
    current !== null && previous !== null && Math.abs(current) > 0.2 && Math.abs(previous) > 0.2 && Math.sign(current) !== Math.sign(previous);
  return { current, previous, flipped };
}

export interface LagPoint {
  lag: number;
  corr: number | null;
}

/** 领先-滞后交叉相关（变化率）。lag > 0 表示 a 滞后于 b。 */
export function crossCorrChanges(
  a: DatedValue[],
  b: DatedValue[],
  maxLag = 20,
  method: 'pearson' | 'spearman' = 'pearson',
): LagPoint[] {
  const aligned = alignPair(a, b);
  const da = diff(aligned.a);
  const db = diff(aligned.b);
  const n = Math.min(da.length, db.length);
  const fn = method === 'spearman' ? spearman : pearson;
  const out: LagPoint[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const len = n - Math.abs(lag);
    if (len < 12) {
      out.push({ lag, corr: null });
      continue;
    }
    const av = lag >= 0 ? da.slice(lag, lag + len) : da.slice(0, len);
    const bv = lag >= 0 ? db.slice(0, len) : db.slice(-lag, -lag + len);
    out.push({ lag, corr: fn(av, bv) });
  }
  return out;
}

/** 最新 Z 值。 */
export function latestZ(points: DatedValue[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const z = points[i].z;
    if (z !== null && z !== undefined && Number.isFinite(z)) return z;
  }
  return null;
}

/** 近 lookback 个观测的 Z 变化。 */
export function zDelta(points: DatedValue[], lookback = 20): number | null {
  const zs = points
    .map((p) => p.z)
    .filter((z): z is number => z !== null && z !== undefined && Number.isFinite(z));
  if (zs.length < lookback + 1) return null;
  return zs[zs.length - 1] - zs[zs.length - 1 - lookback];
}

/** 当前值在完整样本中的分位。 */
export function percentileNow(points: DatedValue[]): number | null {
  if (points.length < 8) return null;
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  return percentileOf(values, values[values.length - 1]);
}

/** 当前值相对完整样本的 Z（与滚动 Z 不同，用于卡片上的“历史偏离”）。 */
export function zNow(points: DatedValue[]): number | null {
  const values = points.map((p) => p.value).filter((v) => Number.isFinite(v));
  if (values.length < 8) return null;
  return zScore(values, values[values.length - 1]);
}

export function clampScore(v: number): number {
  return clamp(v, 0, 100);
}

export function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
