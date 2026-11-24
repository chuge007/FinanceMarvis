import { memo, useRef, useEffect, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';
import { useMoneyFlow, useCapitalTrend } from '../hooks/useSectorFlow';
import { useAppStore } from '../../../stores/useAppStore';

Chart.register(...registerables);

const PERIODS = [7, 30, 90] as const;

export const CumulativeFlowChart = memo(function CumulativeFlowChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: flowData } = useMoneyFlow();
  const { data: trend } = useCapitalTrend();
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isCN && trend?.length) {
      const series = period === 90 ? trend : trend.slice(-period);
      const labels = series.map((p) => p.date.slice(5)); // MM-DD
      const mains = series.map((p) => p.main);
      const smalls = series.map((p) => p.small);
      // 5 日均线
      const ma5 = mains.map((_, i) => {
        const from = Math.max(0, i - 4);
        const seg = mains.slice(from, i + 1);
        return +(seg.reduce((a, b) => a + b, 0) / seg.length).toFixed(1);
      });
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '主力净流入(亿)',
              data: mains,
              backgroundColor: mains.map((v) => (v >= 0 ? 'rgba(240,68,82,0.75)' : 'rgba(12,166,120,0.75)')),
              borderColor: mains.map((v) => (v >= 0 ? '#f04452' : '#0ca678')),
              borderWidth: 1,
              order: 2,
            },
            {
              label: '小单(散户)净流',
              data: smalls,
              type: 'line' as const,
              borderColor: '#f59e4b',
              borderDash: [3, 3],
              borderWidth: 1.2,
              pointRadius: 0,
              tension: 0.3,
              order: 1,
            },
            {
              label: '主力5日均线',
              data: ma5,
              type: 'line' as const,
              borderColor: '#4078ff',
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.3,
              order: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#b0b5c0', font: { size: 9 }, boxWidth: 10 } },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  const i = items[0]?.dataIndex;
                  if (i == null || !series[i]) return [];
                  const p = series[i];
                  return `超大单 ${p.superLarge.toFixed(1)}亿 / 中单 ${p.medium.toFixed(1)}亿 / 小单 ${p.small.toFixed(1)}亿`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: '#636878', font: { size: 8 }, maxTicksLimit: 8 }, grid: { color: '#1a1d26' } },
            y: { ticks: { color: '#636878', font: { size: 8 } }, grid: { color: '#1a1d26' } },
          },
        },
      });
      return () => chart.destroy();
    }

    if (!flowData?.series.length) return;
    const series = period === 90 ? flowData.series : flowData.series.slice(-period);
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.map((p) => p.date),
        datasets: [
          { label: '主力', data: series.map((p) => p.institution), borderColor: '#f04452', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
          { label: '散户', data: series.map((p) => p.retail), borderColor: '#0ca678', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#b0b5c0', font: { size: 9 }, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color: '#636878', font: { size: 8 }, maxTicksLimit: 8 }, grid: { color: '#1a1d26' } },
          y: { ticks: { color: '#636878', font: { size: 8 } }, grid: { color: '#1a1d26' } },
        },
      },
    });

    return () => chart.destroy();
  }, [flowData, trend, isCN, period]);

  return (
    <Panel
      title="大盘资金趋势"
      extra={<ChartHeader source="model" note="A股仅当日真实，其余为前端模型估算" />}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10.5px] text-[#b0b5c0] truncate">{flowData?.reading ?? '加载中...'}</div>
        <div className="flex items-center gap-1 shrink-0">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-1.5 py-0.5 rounded text-[9.5px] ${period === p ? 'bg-[#4078ff] text-white' : 'text-[#636878] hover:text-[#b0b5c0]'}`}
            >
              {p}日
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 200 }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="mt-2">
        <ChartInsight
          summary="红/绿柱表示主力净流入/净流出，橙线为散户净流，蓝线为 5 日均线。"
          how="切换 7/30/90 日看同一指标在短中长期是否一致；只看单日容易误判趋势。"
          pitfall="A股仅最新一日来自东方财富，历史为模型估算；美股序列全部为模型估算，不能当真实资金流使用。"
        />
      </div>
      <div className="text-[10px] text-[#636878] mt-2">
        {isCN ? '数据源: 东方财富仅当日真实，其余为前端模型估算 · 红=净流入 绿=净流出' : '数据源: 前端模型估算 · 非真实资金流'}
      </div>
    </Panel>
  );
});
