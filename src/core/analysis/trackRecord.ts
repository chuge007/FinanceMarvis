/**
 * 判断留痕与命中率回看。
 *
 * 解决的问题：软件每天都在给「几维偏风险、要不要动手」，但没有任何一处认账。
 * 没有回看，用户只能用「感觉它准不准」来判断，指标体系也无法自我修正。
 *
 * 做法：
 *  - 每天首次打开把当天结论写一条（同日覆盖，不追加）；
 *  - 回看时用大盘基准的真实收盘价，算「结论之后 N 个交易日」的涨跌；
 *  - 偏风险看「之后是否下跌」、偏宽松看「之后是否上涨」，只统计有足够后续数据的样本。
 *
 * 口径限制（必须让用户看到）：
 *  - 样本很少时统计没有意义，少于 2 条不展示；
 *  - 基准不可用（无代理）时不展示，也不显示为 0，避免误读成「全错」。
 */
import type { DatedValue } from './series';
import { readJSON, todayKey, writeJSON } from '../../shared/utils/localStore';

const KEY = 'marvis.track.record.v1';
const MAX_ENTRIES = 120;
export const DEFAULT_HORIZON = 5;

export interface TrackEntry {
  date: string;
  tone: string;
  risk: number;
  loose: number;
  verdict: string;
}

export interface TrackStats {
  horizon: number;
  riskSamples: number;
  riskDown: number;
  riskAvg: number | null;
  looseSamples: number;
  looseUp: number;
  looseAvg: number | null;
}

export function loadTrack(): TrackEntry[] {
  const list = readJSON<TrackEntry[]>(KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.date === 'string') : [];
}

/** 写入/覆盖当天结论；内容没变则不写，避免每次渲染都碰 localStorage。 */
export function recordToday(entry: Omit<TrackEntry, 'date'> & { date?: string }): void {
  const date = entry.date ?? todayKey();
  const next: TrackEntry = {
    date,
    tone: entry.tone,
    risk: entry.risk,
    loose: entry.loose,
    verdict: entry.verdict,
  };
  const list = loadTrack();
  const idx = list.findIndex((e) => e.date === date);
  if (idx >= 0) {
    const prev = list[idx];
    if (prev.tone === next.tone && prev.risk === next.risk && prev.loose === next.loose && prev.verdict === next.verdict) {
      return;
    }
    list[idx] = next;
  } else {
    list.push(next);
  }
  writeJSON(KEY, list.slice(-MAX_ENTRIES));
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 用基准序列回看历史结论。
 * @param entries 历史结论
 * @param bench 大盘基准（按日期升序，含真实收盘）
 * @param horizon 观察窗口（交易日）
 */
export function evaluateTrack(
  entries: TrackEntry[],
  bench: DatedValue[],
  horizon: number = DEFAULT_HORIZON,
): TrackStats {
  const empty: TrackStats = {
    horizon,
    riskSamples: 0,
    riskDown: 0,
    riskAvg: null,
    looseSamples: 0,
    looseUp: 0,
    looseAvg: null,
  };
  if (!entries.length || bench.length <= horizon) return empty;

  const dates = bench.map((p) => p.date);
  const riskReturns: number[] = [];
  const looseReturns: number[] = [];
  let riskDown = 0;
  let looseUp = 0;

  for (const entry of entries) {
    // 找到结论日之后（含当日）的第一个基准点
    let start = dates.findIndex((d) => d >= entry.date);
    if (start < 0) continue;
    if (start + horizon >= bench.length) continue;
    const from = bench[start].value;
    const to = bench[start + horizon].value;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) continue;
    const ret = to / from - 1;

    if (entry.risk >= 3) {
      riskReturns.push(ret);
      if (ret < 0) riskDown += 1;
    }
    if (entry.loose >= 3) {
      looseReturns.push(ret);
      if (ret > 0) looseUp += 1;
    }
  }

  return {
    horizon,
    riskSamples: riskReturns.length,
    riskDown,
    riskAvg: mean(riskReturns),
    looseSamples: looseReturns.length,
    looseUp,
    looseAvg: mean(looseReturns),
  };
}
