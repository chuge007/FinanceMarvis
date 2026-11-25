import { memo, useRef, useEffect, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import type { NormalizedSeries, RhythmSnapshot } from '../services/rhythm';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';

Chart.register(...registerables);

const COLORS: Record<string, string> = {
  VIXCLS: '#f04452', BAMLH0A0HYM2: '#f59e4b', T10Y2Y: '#20c4d8',
  DGS10: '#4078ff', DTWEXBGS: '#9b6efb', FG: '#0ca678',
  CPIAUCSL: '#e8590c', UNRATE: '#748ffc',
};

const dashFor = (phase: string) =>
  phase === '领先' ? [5, 3] : phase === '滞后' ? [2, 3] : phase === '情绪·同步' ? [7, 2] : undefined;

interface Props { snapshot: RhythmSnapshot | null; }

export const RiskTemperatureOverlay = memo(function RiskTemperatureOverlay({ snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seriesList = useMemo(
    () => Object.values(snapshot?.series ?? {}).filter((s) => s.points.length > 8),
    [snapshot],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !seriesList.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 以日度序列的并集为横轴；月度序列前向填充，虚线区分。
    const daily = seriesList.filter((s) => s.frequency === '日度');
    const dateSet = new Set<string>();
    daily.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
    const dates = [...dateSet].sort().slice(-90);

    const aligned = (s: NormalizedSeries) => {
      const byDate = new Map(s.points.map((p) => [p.date, p.z]));
      const sorted = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
      let cursor = 0;
      return dates.map((d) => {
        if (byDate.has(d)) return byDate.get(d) ?? null;
        if (s.frequency === '月度') {
          while (cursor < sorted.length && sorted[cursor].date <= d) cursor++;
          return cursor > 0 ? sorted[cursor - 1].z : null;
        }
        return null;
      });
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map((d) => d.slice(5)),
        datasets: seriesList.map((s) => ({
          label: `${s.name}${s.frequency === '月度' ? '（月度·前向填充）' : ''}`,
          data: aligned(s),
          borderColor: COLORS[s.id] ?? '#636878',
          borderWidth: s.frequency === '月度' ? 1 : 1.5,
          borderDash: dashFor(s.phase),
          pointRadius: 0,
          tension: 0.25,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, labels: { color: '#b0b5c0', font: { size: 8 }, boxWidth: 12, padding: 6 } },
          tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: Z ${Number(item.formattedValue).toFixed(2)}` } },
        },
        scales: {
          x: { ticks: { color: '#636878', font: { size: 8 }, maxTicksLimit: 7 }, grid: { color: '#1a1d26' } },
          y: {
            type: 'linear',
            suggestedMin: -3, suggestedMax: 3,
            title: { display: true, text: '滚动 Z-score（统一纵轴）', color: '#636878', font: { size: 8 } },
            ticks: { color: '#636878', font: { size: 8 } },
            grid: { color: (c) => (c.tick.value === 0 ? '#4d5364' : '#1a1d26') },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [seriesList]);

  const indicators = snapshot?.indicators ?? [];
  const adverse = indicators.filter((i) => i.source === 'real' && i.score !== null && (i.score as number) < 40).length;
  const benign = indicators.filter((i) => i.source === 'real' && i.score !== null && (i.score as number) > 60).length;
  const usable = indicators.filter((i) => i.source === 'real').length;

  return (
    <Panel
      title="风险温度叠加图"
      hint="多指标同向才可信"
      extra={<ChartHeader source={seriesList.length ? 'real' : 'missing'} note="统一 Z 轴 · 实线=同步 虚线=领先 点线=滞后" />}
    >
      <div className="mb-2 rounded px-3 py-2 text-[0.6875rem] leading-relaxed"
        style={{ background: adverse >= 2 ? 'rgba(240,68,82,0.07)' : 'rgba(64,120,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="font-medium text-[#d8dce6]">
          {usable === 0 ? '真实序列不足，暂不判断。' : `${usable} 项中 ${adverse} 项处于风险偏高区间、${benign} 项偏低。`}
        </span>
        <span className="text-[#636878]"> 单项异动不触发防守；领先与同步同向才提高置信度。</span>
      </div>
      {seriesList.length ? (
        <div style={{ height: 240 }}><canvas ref={canvasRef} /></div>
      ) : (
        <div className="h-40 flex items-center justify-center text-[0.6563rem] text-[#636878]">真实序列不足，叠加图不可用</div>
      )}
      <div className="mt-2">
        <ChartInsight
          summary="多条线同时向上或向下偏离零轴，代表风险温度方向一致；只有一条动就是背离。"
          how="先看领先指标（虚线）转向，再看同步线（实线）是否跟随；月度线（点线）只做事后确认。"
          pitfall="全部统一到 Z 轴，绝不使用双 Y 轴；缺任一序列时会明示，不用插值伪造。"
        />
      </div>
    </Panel>
  );
});
