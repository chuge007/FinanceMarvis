import { memo, useMemo } from 'react';
import type { RhythmSnapshot, Tone } from '../services/rhythm';
import { CONFIG, scoreOf } from '../services/rhythm';
import { percentileOf, trendSlope } from '../../../shared/utils/seriesStats';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';

const TONE_COLOR: Record<Tone, string> = {
  进攻: '#0ca678', 均衡: '#20c4d8', 防守: '#f59e4b', 观望: '#9b6efb',
};

function toneOf(score: number): Tone {
  return score >= 70 ? '进攻' : score >= 55 ? '均衡' : score >= 40 ? '防守' : '观望';
}

interface Props { snapshot: RhythmSnapshot | null; }

/** 描述性回溯：用与当前相同的权重与打分规则，重放历史每日状态，不预测未来。 */
export const RegimeTimeline = memo(function RegimeTimeline({ snapshot }: Props) {
  const history = useMemo(() => {
    const daily = CONFIG.filter((c) => c.frequency === '日度' && c.scoreMode !== 'neutral');
    const scoreMaps = daily.map((cfg) => {
      const points = snapshot?.series[cfg.id]?.points ?? [];
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
    const dates = [...dateSet].sort().slice(-120);
    const rows = dates.map((date) => {
      let weighted = 0, used = 0;
      scoreMaps.forEach(({ cfg, map }) => {
        const v = map.get(date);
        if (v !== undefined) { weighted += v * cfg.weight; used += cfg.weight; }
      });
      const score = used > 0 ? Math.round(weighted / used) : null;
      return { date, score, tone: score === null ? null : toneOf(score) };
    }).filter((r) => r.tone !== null);

    const current = snapshot?.regime.tone ?? null;
    const same = rows.filter((r) => r.tone === current);
    const ratio = rows.length ? Math.round((same.length / rows.length) * 100) : 0;
    let run = 0, runs: number[] = [];
    rows.forEach((r) => {
      if (r.tone === current) run++;
      else if (run) { runs.push(run); run = 0; }
    });
    if (run) runs.push(run);
    return { rows, current, ratio, avgRun: runs.length ? (runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(1) : '—' };
  }, [snapshot]);

  const bands = history.rows.slice(-80);

  return (
    <Panel
      title="体制历史带"
      hint="描述性回溯 · 不预测未来"
      extra={<ChartHeader source={bands.length ? 'real' : 'missing'} note="同权重重放近 120 个交易日" />}
    >
      {bands.length ? (
        <>
          <div className="flex h-6 w-full overflow-hidden rounded-[0.1875rem] bg-[#1a1d26]">
            {bands.map((r) => (
              <div key={r.date} className="h-full flex-1" style={{ background: TONE_COLOR[r.tone as Tone] }} title={`${r.date} · ${r.tone} · ${r.score}`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[0.5625rem] text-[#636878]">
            <span>{bands[0].date.slice(5)}</span>
            <span>当前：{history.current ?? '不可用'} · 近120日占比 {history.ratio}% · 平均持续 {history.avgRun} 天</span>
            <span>{bands[bands.length - 1].date.slice(5)}</span>
          </div>
        </>
      ) : (
        <div className="h-12 flex items-center justify-center text-[0.6563rem] text-[#636878]">真实序列不足，无法回溯历史状态。</div>
      )}
      <div className="mt-2">
        <ChartInsight
          summary="色带是对历史每天套用同一套权重与阈值得到的状态，只回答“以前类似时点是什么环境”。"
          how="看当前色块在历史分布中是否常见；持续期长说明状态稳定，频繁切换说明噪声大。"
          pitfall="这不是预测模型，也不给出“接下来会涨/跌”；月度滞后指标不参与日度回放。"
        />
      </div>
    </Panel>
  );
});
