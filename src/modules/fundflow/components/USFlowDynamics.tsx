import { memo, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';
import { useSectorFlow, useUSFlowDynamics } from '../hooks/useSectorFlow';
import type { SectorFlow } from '../../../types/fundflow';

Chart.register(...registerables);

function SectionRow({ s }: { s: SectorFlow }) {
  const strength = s.usStrength ?? 50;
  const flows = [
    { label: '机构', v: s.usInstitution ?? 0, color: '#4078ff' },
    { label: '对冲', v: s.usHedge ?? 0, color: '#9b6efb' },
    { label: '散户', v: s.usRetail ?? 0, color: '#f59e4b' },
  ];
  return (
    <div className="rounded-md bg-[#14161d] p-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
        <span className="text-[11px] font-medium text-[#d8dce6] shrink-0">{s.name}</span>
        <span className={`text-[10px] font-mono shrink-0 ${s.pctChg >= 0 ? 'text-[#f04452]' : 'text-[#0ca678]'}`}>
          {s.pctChg >= 0 ? '+' : ''}{s.pctChg.toFixed(2)}%
        </span>
        <span className="ml-auto text-[11px] font-mono shrink-0" style={{ color: s.netFlow >= 0 ? '#f04452' : '#0ca678' }}>
          {s.netFlow >= 0 ? '+' : ''}{s.netFlow}M
        </span>
      </div>
      {/* 资金强度条 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-[#636878] shrink-0">强度</span>
        <div className="flex-1 h-[7px] bg-[#1a1d26] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${strength}%`, backgroundColor: s.netFlow >= 0 ? '#f04452' : '#0ca678', opacity: 0.85 }} />
        </div>
        <span className="text-[10.5px] font-mono text-[#b0b5c0] shrink-0">{strength}</span>
      </div>
      {/* 分口径 */}
      <div className="flex gap-3">
        {flows.map((f) => (
          <span key={f.label} className="text-[10px] font-mono" style={{ color: f.color }}>
            {f.label} {f.v >= 0 ? '+' : ''}{f.v}M
          </span>
        ))}
      </div>
      <div className="text-[10px] text-[#636878] leading-snug mt-1">{s.reading}</div>
    </div>
  );
}

export const USFlowDynamics = memo(function USFlowDynamics() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: sectors, loading } = useSectorFlow();
  const { data: dyn } = useUSFlowDynamics();

  // 日内动态曲线：各板块累计净流入演变（09:30→16:00 每30分钟）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dyn?.points.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const labels = dyn.points.map((p) => p.time);
    const colors: Record<string, string> = { tech: '#4078ff', finance: '#0ca678', cons_disc: '#9b6efb', comm: '#20c4d8', health: '#f59e4b', industrials: '#e8590c', energy: '#f04452', utilities: '#748ffc' };
    const SECTOR_LABELS: Record<string, string> = { tech: '科技', finance: '金融', cons_disc: '可选消费', comm: '通信', health: '医疗', industrials: '工业', energy: '能源', utilities: '公用事业' };
    const datasets = Object.keys(colors).map((id, i) => ({
      label: SECTOR_LABELS[id] ?? id.toUpperCase(),
      data: dyn.points.map((p) => p.values[id] ?? 0),
      borderColor: colors[id],
      backgroundColor: colors[id] + '1f',
      borderWidth: 1.4,
      // 实线/虚线交替，避免仅靠颜色区分 8 条线（色盲友好）。
      borderDash: i % 2 ? [5, 3] : undefined,
      pointRadius: 0,
      tension: 0.35,
    }));
    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, labels: { color: '#b0b5c0', font: { size: 9 }, boxWidth: 10, padding: 8 } },
          tooltip: { callbacks: { label: (item) => ` ${item.dataset.label} ${item.formattedValue}M` } },
        },
        scales: {
          x: { ticks: { color: '#636878', font: { size: 8 }, maxTicksLimit: 7 }, grid: { color: '#1a1d26' }, title: { display: true, text: '盘中时段', color: '#636878', font: { size: 8 } } },
          y: { ticks: { color: '#636878', font: { size: 8 } }, grid: { color: '#1a1d26' }, title: { display: true, text: '累计净流入 $M', color: '#636878', font: { size: 8 } } },
        },
      },
    });
    return () => chart.destroy();
  }, [dyn]);

  const topFlows = [...sectors].sort((a, b) => b.netFlow - a.netFlow);
  const lead = dyn?.leadSector ? topFlows.find((s) => s.id === dyn.leadSector) : undefined;
  const tail = dyn?.tailSector ? topFlows.find((s) => s.id === dyn.tailSector) : undefined;

  const totalSplit = { institution: 0, hedge: 0, retail: 0 };
  if (dyn) {
    Object.values(dyn.splits).forEach((s) => {
      totalSplit.institution += s.institution;
      totalSplit.hedge += s.hedge;
      totalSplit.retail += s.retail;
    });
  }

  return (
    <Panel
      title="美股资金动态 · 板块轮动雷达"
      badge={loading ? '加载中' : '模型估算 · 45s刷新'}
      extra={<ChartHeader source="model" note="CRAI + 板块权重推演，非真实资金流" />}
    >
      {/* 轮动结论解读 */}
      <div
        className="rounded px-3 py-2 text-[10.5px] leading-relaxed mb-2"
        style={{ backgroundColor: 'rgba(64,120,255,0.07)', border: '1px solid rgba(64,120,255,0.2)' }}
      >
        <span className="text-[#4078ff] font-medium">轮动解读 &nbsp;</span>
        <span className="text-[#b0b5c0]">{dyn?.rotation ?? '加载中...'}</span>
        {lead && tail && lead.id !== tail.id && (
          <div className="mt-1 flex items-center gap-2 text-[11px] flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-[rgba(240,68,82,0.14)] text-[#f04452]">资金去向 · {lead.name} +{lead.netFlow}M</span>
            <span className="text-[#636878]">→</span>
            <span className="px-1.5 py-0.5 rounded bg-[rgba(12,166,120,0.14)] text-[#0ca678]">资金流出 · {tail.name} {tail.netFlow}M</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {topFlows.slice(0, 6).map((s) => <SectionRow key={s.id} s={s} />)}
      </div>

      {/* 分口径汇总 */}
      <div className="flex items-center gap-4 mb-2 text-[10px]">
        <span className="text-[#636878]">主力口径</span>
        <span className="font-mono text-[#4078ff]">机构 +{totalSplit.institution}M</span>
        <span className="font-mono text-[#9b6efb]">对冲 +{totalSplit.hedge}M</span>
        <span className="font-mono text-[#f59e4b]">散户 +{totalSplit.retail}M</span>
        <span className="ml-auto text-[#636878] text-[10px]">合计 +{totalSplit.institution + totalSplit.hedge + totalSplit.retail}M</span>
      </div>

      <div style={{ height: 210 }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="mt-2">
        <ChartInsight
          summary="曲线是模拟的日内累计净流入；实线/虚线交替区分板块，不只看颜色。"
          how="关注曲线斜率变化而不是绝对值；斜率变陡代表模型判断资金加速。"
          pitfall="全部由 CRAI + 板块权重推演，没有真实逐笔资金数据，不能作为下单依据。"
        />
      </div>
      <div className="text-[10px] text-[#636878] mt-1.5 leading-relaxed">
        日内累计净流入演变（开盘 09:30 → 收盘 16:00 每 30 分钟模拟）。美股无北向资金披露，采用「CRAI情绪 + 板块权重 + 成长/防御轮动偏好」模型估算，分机构/对冲/散户口径用于判断资金方向与轮动强度，非下单依据。
      </div>
    </Panel>
  );
});
