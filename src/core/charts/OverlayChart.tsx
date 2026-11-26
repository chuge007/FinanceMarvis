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

/**
 * 纵轴范围按 2%~98% 分位取，而不是直接取 min/max。
 *
 * 原因：单条序列的一两个极端点（例如 VIX 冲到 8σ）会把整根轴拉满，
 * 其余几条线全被压成一条水平线，叠加图就失去意义。
 * 被裁掉的极值会穿过上下边界显示，并在轴文字里标注，不隐藏事实。
 */
function computeRange(
  series: OverlaySeries[],
  forcedMin?: number,
  forcedMax?: number,
): { min: number; max: number; clipped: boolean } {
  if (forcedMin !== undefined && forcedMax !== undefined) return { min: forcedMin, max: forcedMax, clipped: false };

  const all: number[] = [];
  for (const s of series) {
    for (const v of s.values) {
      if (v === null || !Number.isFinite(v)) continue;
      all.push(v);
    }
  }
  if (!all.length) return { min: -3, max: 3, clipped: false };

  all.sort((a, b) => a - b);
  const at = (p: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(p * (all.length - 1))))];
  const lo = forcedMin ?? at(0.02);
  const hi = forcedMax ?? at(0.98);
  const clipped = lo > all[0] + 1e-9 || hi < all[all.length - 1] - 1e-9;

  let min = lo;
  let max = hi;
  const pad = Math.max(0.2, (max - min) * 0.08);
  min -= pad;
  max += pad;
  // 所有线都贴在 0 附近时，别把小波动放大成噪声：至少给 ±1.5 的跨度
  const center = (min + max) / 2;
  if (max - min < 3) {
    min = center - 1.5;
    max = center + 1.5;
  }
  return { min: Number(min.toFixed(2)), max: Number(max.toFixed(2)), clipped };
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
  const wrapRef = useRef<HTMLDivElement>(null);
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

    // Chart.js 的 responsive 依赖父容器尺寸；父容器在 tab 切换/字体缩放后变宽时，
    // 它并不总会重新测量，导致 canvas 停在默认 300×150、图面空白。显式监听父容器。
    const wrap = wrapRef.current;
    const resize = () => chart.resize();
    const raf = requestAnimationFrame(resize);
    const observer = typeof ResizeObserver !== 'undefined' && wrap ? new ResizeObserver(resize) : null;
    observer?.observe(wrap as Element);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [yLabel]);

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
      // 节假日单点缺失（≤2 个点）连起来，长缺口仍然断开：不插值，但不让线碎成一截一截
      spanGaps: 2,
    }));

    const yScale = chart.options.scales?.y;
    if (yScale) {
      yScale.min = range.min;
      yScale.max = range.max;
    }
    chart.update('none');
    chart.resize();
  }, [labels, visible, range]);

  const toggle = (id: string) => {
    setHidden((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const empty = !dates.length || !series.length;

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
          {range.clipped && <span className="ml-1 text-[#f59e4b]">（已裁掉少数极值，穿出边界即为被裁部分）</span>}
        </span>
      </div>
      <div ref={wrapRef} className="relative w-full" style={{ height: boxHeight }}>
        <canvas ref={canvasRef} />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.6875rem] text-[#636878]">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
});
