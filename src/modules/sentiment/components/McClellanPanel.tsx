import { memo, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import { Panel } from '../../../shared/components/Panel';
import { useMcClellan } from '../hooks/index';

Chart.register(...registerables);

export const McClellanPanel = memo(function McClellanPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useMcClellan();

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.sparkline.oscillator.map((_, i) => i),
        datasets: [
          { label: 'Oscillator', data: data.sparkline.oscillator, borderColor: '#4078ff', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
          { label: 'Summation', data: data.sparkline.summation, borderColor: '#f59e4b', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#b0b5c0', font: { size: 8 }, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color: '#636878', font: { size: 8 } }, grid: { color: '#1a1d26' } },
          y: { type: 'linear', position: 'left', ticks: { color: '#636878', font: { size: 8 } }, grid: { color: '#1a1d26' } },
          y1: { type: 'linear', position: 'right', ticks: { color: '#636878', font: { size: 8 } }, grid: { display: false } },
        },
      },
    });

    return () => chart.destroy();
  }, [data]);

  return (
    <Panel title="McClellan 振荡器" badge={`Osc: ${data.oscillator.toFixed(1)}`}>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="text-center">
          <div className="text-[9.5px] text-[#636878]">上涨</div>
          <div className="text-[10px] font-['JetBrains_Mono',Consolas,monospace] text-[#f04452]">{data.advances}</div>
        </div>
        <div className="text-center">
          <div className="text-[9.5px] text-[#636878]">下跌</div>
          <div className="text-[10px] font-['JetBrains_Mono',Consolas,monospace] text-[#0ca678]">{data.declines}</div>
        </div>
        <div className="text-center">
          <div className="text-[9.5px] text-[#636878]">Sum</div>
          <div className="text-[10px] font-['JetBrains_Mono',Consolas,monospace] text-[#f59e4b]">{data.summation}</div>
        </div>
      </div>
      <div style={{ height: 180 }}>
        <canvas ref={canvasRef} />
      </div>
    </Panel>
  );
});
