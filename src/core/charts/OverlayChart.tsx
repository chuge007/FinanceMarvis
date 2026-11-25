/**
 * 统一叠加图：全站只有这一套图表语法。
 *  - 单一 Y 轴（Z / 分位 / 重定基由调用方先换算好）
 *  - 缺数据就是断点，不插值
 *
 * 渲染生命周期（本次重写的关键）：
 *  1. 只在挂载时创建一次 Chart 实例，卸载时销毁 —— 避免重建过程中残留上一帧的 tooltip；
 *  2. 数据变化走 `chart.update()`，不再 destroy/rebuild，杜绝「图面与实际数据不同步」；
 *  3. 图例移出画布改为 HTML 胶囊，不再和 X 轴刻度挤在同一行；
 *  4. Y 轴按真实数据取范围并留 10% 余量，数据都在 ±1.5 内时不再被固定 ±3 压扁；
 *  5. 高度用 rem 字符串，跟随根字号缩放。
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface OverlaySeries {
  id: string;
  label: string;
  values: (number | null)[];
  color: string;
  dash?: 'solid' | 'dashed' | 'dotted';
}

interface Props {
  dates: string[];
  series: OverlaySeries[];
  /** 优先传 rem 字符串（如 '20rem'）；传数字按 px 处理，仅为兼容旧调用。 */
  height?: string | number;
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  emptyText?: string;
  /** 初始隐藏的序列 id：默认只画前几条，避免 6 条线挤在一起看成一团。 */
  initialHidden?: string[];
}

const DASH: Record<string, number[] | undefined> = {
  solid: undefined,
  dashed: [5, 3],
  dotted: [2, 3],
};

function computeRange(series: OverlaySeries[], forcedMin?: number, forcedMax?: number) {
  if (forcedMin !== undefined && forcedMax !== undefined) return { min: forcedMin, max: forcedMax };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const v of s.values) {
      if (v === null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -3, max: 3 };
  const pad = Math.max(0.3, (max - min) * 0.1);
  return { min: Number((min - pad).toFixed(2)), max: Number((max + pad).toFixed(2)) };
}

export const OverlayChart = memo(function OverlayChart({
  dates,
  series,
  height = '20rem',
  yLabel = '滚动 Z-score',
  yMin,
  yMax,
  emptyText = '数据不足，暂不绘图',
  initialHidden,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);
  const [hidden, setHidden] = useState<string[]>(initialHidden ?? []);
  const boxHeight = typeof height === 'number' ? `${height}px` : height;

  const labels = useMemo(() => dates.map((d) => (d.length > 7 ? d.slice(5) : d)), [dates]);
  const visible = useMemo(() => series.filter((s) => !hidden.includes(s.id)), [series, hidden]);
  const range = useMemo(() => computeRange(visible, yMin, yMax), [visible, yMin, yMax]);

  // 只创建一次
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
            titleColor: '#d8dce6',
            bodyColor: '#b0b5c0',
            callbacks: {
              label: (item) => {
                const v = item.parsed.y;
                return ` ${item.dataset.label}: ${v === null || Number.isNaN(v) ? '缺' : Number(v).toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#636878', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            title: { display: Boolean(yLabel), text: yLabel, color: '#636878', font: { size: 9 } },
            ticks: { color: '#636878', font: { size: 9 } },
            grid: {
              color: (c) =>
                (c.tick as { value: number }).value === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
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
  }, []);

  // 数据/范围变化只更新，不重建
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.data.labels = labels;
    chart.data.datasets = visible.map((s) => ({
      label: s.label,
      data: s.values,
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: 1.6,
      borderDash: DASH[s.dash ?? 'solid'],
      pointRadius: 0,
      pointHoverRadius: 2,
      tension: 0.2,
      spanGaps: false,
    }));

    const yScale = chart.options.scales?.y;
    if (yScale) {
      yScale.min = range.min;
      yScale.max = range.max;
    }
    chart.update('none');
  }, [labels, visible, range]);

  const toggle = (id: string) => {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!dates.length || !series.length) {
    return (
      <div className="flex items-center justify-center text-[0.6875rem] text-[#636878]" style={{ height: boxHeight }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {series.map((s) => {
          const off = hidden.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              title={off ? `显示 ${s.label}` : `隐藏 ${s.label}`}
              className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.5625rem] transition-opacity"
              style={{
                borderColor: off ? '#1a1d26' : `${s.color}55`,
                color: off ? '#4d5364' : s.color,
                opacity: off ? 0.6 : 1,
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: off ? '#2a3040' : s.color }} />
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto text-[0.5313rem] text-[#3a4050]">
          纵轴 {range.min} ~ {range.max}
        </span>
      </div>
      <div style={{ height: boxHeight }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
});
