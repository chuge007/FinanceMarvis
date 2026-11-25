/**
 * 体制历史带：用与当前相同的一套权重和阈值，回放历史每日状态。
 * 只做描述，不预测未来。
 */
import { CONFIG, scoreOf, type RhythmSnapshot, type Tone } from '../../modules/rhythm/services/rhythm';
import { percentileOf, trendSlope } from '../../shared/utils/seriesStats';

export interface RegimePoint {
  date: string;
  score: number | null;
  tone: Tone | null;
}

function toneOf(score: number): Tone {
  return score >= 70 ? '进攻' : score >= 55 ? '均衡' : score >= 40 ? '防守' : '观望';
}

export function buildRegimeHistory(snapshot: RhythmSnapshot | null, days = 120): RegimePoint[] {
  if (!snapshot) return [];
  const daily = CONFIG.filter((c) => c.frequency === '日度' && c.scoreMode !== 'neutral');

  const scoreMaps = daily.map((cfg) => {
    const points = snapshot.series[cfg.id]?.points ?? [];
    const values = points.map((p) => p.value);
    const map = new Map<string, number>();
    points.forEach((p, i) => {
      const upto = values.slice(0, i + 1);
      const pct = percentileOf(upto, p.value);
      const slope = trendSlope(upto, 20);
      const score = scoreOf(cfg, p.value, pct, slope);
      if (score !== null) map.set(p.date, score);
    });
    return { cfg, map };
  });

  const dateSet = new Set<string>();
  scoreMaps.forEach((s) => s.map.forEach((_, d) => dateSet.add(d)));
  const dates = [...dateSet].sort().slice(-days);

  return dates.map((date) => {
    let weighted = 0;
    let used = 0;
    scoreMaps.forEach(({ cfg, map }) => {
      const v = map.get(date);
      if (v !== undefined) {
        weighted += v * cfg.weight;
        used += cfg.weight;
      }
    });
    const score = used > 0 ? Math.round(weighted / used) : null;
    return { date, score, tone: score === null ? null : toneOf(score) };
  });
}

export const TONE_COLOR: Record<Tone, string> = {
  进攻: '#0ca678',
  均衡: '#20c4d8',
  防守: '#f59e4b',
  观望: '#9b6efb',
};
