/**
 * 相关性条带：独立 -1~1 轴，与主图共享 X 轴；绝不做双 Y 轴。
 *
 * 与叠加图同一套生命周期：只创建一次，数据变化走 update，不重建。
 * 高度改用 rem，并在右上方直接标出当前值 —— 原来只有一条贴在中线的窄带，看不出结论。
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface Props {
  dates: string[];
  values: (number | null)[];
  label: string;
  height?: string | number;
}

export const CorrelationStrip = memo(function CorrelationStrip({ dates, values, label, height = '5rem' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  const boxHeight = typeof height === 'number' ? `${height}px` : height;

  const labels = useMemo(() => dates.map((d) => d.slice(5)), [dates]);
  const last = useMemo(() => {
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i];
      if (v !== null && Number.isFinite(v)) return v;
    }
    return null;
  }, [values]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#11141c',
            borderColor: '#2a3040',
            borderWidth: 1,
            callbacks: {
              label: (item) => ` ${label}: ${item.parsed.y === null ? '缺' : Number(item.parsed.y).toFixed(2)}`,
            },
          },
        },
        scales: {
          x: { display: false, grid: { display: false } },
          y: {
            min: -1,
            max: 1,
            ticks: {
              color: '#4d5364',
              font: { size: 8 },
              stepSize: 0.5,
              callback: (v) => (v === 0 || v === 1 || v === -1 ? String(v) : ''),
            },
            grid: {
              color: (c) =>
                (c.tick as { value: number }).value === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.03)',
            },
          },
        },
      },
    });

    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [label]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets = [
      {
        label,
        data: values,
        borderWidth: 1.4,
        pointRadius: 0,
        pointHoverRadius: 2,
        tension: 0.2,
        spanGaps: false,
        fill: {
          target: 'origin',
          above: 'rgba(240,68,82,0.10)',
          below: 'rgba(64,120,255,0.10)',
        },
        segment: {
          borderColor: (c: { p0: { parsed: { y: number | null } } }) =>
            (c.p0.parsed.y ?? 0) >= 0 ? 'rgba(240,68,82,0.85)' : 'rgba(64,120,255,0.85)',
        },
      } as never,
    ];
    chart.update('none');
  }, [labels, values, label]);

  if (!dates.length) {
    return <div className="flex h-14 items-center justify-center text-[0.625rem] text-[#4d5364]">相关性样本不足</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[0.5313rem] text-[#4d5364]">−1 反向 · 0 无关 · +1 同向</span>
        <span className="font-mono text-[0.5313rem] tabular-nums text-[#8a8f9d]">
          {label} 当前 {last === null ? '缺' : last.toFixed(2)}
        </span>
      </div>
      <div style={{ height: boxHeight }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
});
