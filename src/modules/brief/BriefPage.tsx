import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchRhythm, type RhythmSnapshot } from '../rhythm/services/rhythm';
import { rollingCorrelation } from '../../shared/utils/seriesStats';
import { readJSON } from '../../shared/utils/localStore';
import type { LastRegimeState } from '../rhythm/components/RegimeCard';
import { RiskTemperatureOverlay } from '../rhythm/components/RiskTemperatureOverlay';
import { DivergenceAlert } from '../rhythm/components/DivergenceAlert';
import { ChartHeader } from '../../shared/components/ChartHeader';
import { useAppStore } from '../../stores/useAppStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { usePortfolioStore } from '../../stores/usePortfolioStore';
import { buildPlan } from '../../services/investmentPlan';
import { Panel } from '../../shared/components/Panel';

const KEY = 'marvis.regime.last.v1';
const fmt = (n: number | null | undefined, digits = 1) => n === null || n === undefined ? '—' : n.toFixed(digits);

export const BriefPage = memo(function BriefPage() {
  const [snapshot, setSnapshot] = useState<RhythmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const setTab = useAppStore((s) => s.setTab);
  const profile = useProfileStore((s) => s.profile);
  const { summary, loadPositions } = usePortfolioStore();

  const load = useCallback(async () => {
    setLoading(true);
    try { setSnapshot(await fetchRhythm()); } catch { setSnapshot(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    void loadPositions();
    const id = window.setInterval(() => void load(), 300_000);
    return () => window.clearInterval(id);
  }, [load, loadPositions]);

  const last = useMemo(() => readJSON<LastRegimeState | null>(KEY, null), []);
  const regime = snapshot?.regime ?? null;

  const overnight = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    const ids = [
      ['VIXCLS', 'VIX', 1], ['BAMLH0A0HYM2', 'HY OAS', 1],
      ['DTWEXBGS', '美元', 1], ['DGS10', '10Y', 1],
    ] as const;
    ids.forEach(([id, label]) => {
      const pts = snapshot?.series[id]?.points ?? [];
      if (pts.length < 2) return;
      const cur = pts[pts.length - 1], prev = pts[pts.length - 2];
      const pct = prev.value !== 0 ? ((cur.value - prev.value) / Math.abs(prev.value)) * 100 : null;
      rows.push({ label, value: pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` });
    });
    return rows;
  }, [snapshot]);

  const correlation = useMemo(() => {
    const vix = snapshot?.series.VIXCLS?.points.map((p) => p.value) ?? [];
    const hy = snapshot?.series.BAMLH0A0HYM2?.points.map((p) => p.value) ?? [];
    return rollingCorrelation(vix, hy, 60, 'pearson');
  }, [snapshot]);

  const rebalanceGap = useMemo(() => {
    if (!summary.totalAssets || summary.totalAssets <= 0) return null;
    const target = buildPlan(profile).equityPct;
    const actual = ((summary.totalValue - summary.cash) / summary.totalAssets) * 100;
    return { target, actual: Math.max(0, actual), gap: Math.abs(target - Math.max(0, actual)) };
  }, [summary, profile]);

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-bold text-[#d8dce6]">今日作战简报</h2>
          <p className="text-[10px] text-[#636878] mt-0.5">盘前 30 秒：体制 → 隔夜变化 → 背离 → 联动 → 你的地图</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('rhythm')} className="text-[11px] px-2 py-1 rounded border border-[#1a1d26] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.04)]">看完整分析</button>
          <button onClick={() => setTab('discipline')} className="text-[11px] px-2 py-1 rounded bg-[#4078ff] text-white">记录今日决策</button>
        </div>
      </div>

      <Panel title="一句话" hint="只读，不给买卖点" extra={<ChartHeader source={regime ? 'real' : 'missing'} note={last?.date ?? ''} />}>
        {loading && !regime ? (
          <div className="py-6 text-center text-[11px] text-[#636878]">正在读取真实序列…</div>
        ) : !regime || regime.confidence === 0 ? (
          <div className="py-6 text-center text-[11px] text-[#f59e4b]">真实数据不可用，今日不给判断。</div>
        ) : (
          <div className="space-y-2">
            <div className="text-[15px] font-bold text-[#d8dce6]">
              市场体制：{regime.tone} · 综合分 {regime.score} · 置信度 {regime.confidence}%
            </div>
            <div className="text-[11px] text-[#b0b5c0] leading-relaxed">{regime.riskBudget}</div>
            <div className="text-[10.5px] text-[#636878]">你的地图建议：维持既定框架；体制只调整风险预算，不产生买卖信号。</div>
          </div>
        )}
      </Panel>

      <Panel title="隔夜变化" hint="相对上一交易日">
        {overnight.length ? (
          <div className="grid grid-cols-4 gap-2">
            {overnight.map((r) => (
              <div key={r.label} className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.02)] p-2">
                <div className="text-[10px] text-[#636878]">{r.label}</div>
                <div className="text-[13px] font-mono text-[#d8dce6] tabular-nums">{r.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10.5px] text-[#636878]">真实序列不足，无法计算隔夜变化。</div>
        )}
        <div className="mt-2 text-[10.5px] text-[#b0b5c0]">
          股债/信用联动：VIX 与 HY OAS 近 60 日相关性 {correlation === null ? '—' : correlation.toFixed(2)}
          {correlation !== null && correlation > 0.3 ? '（同向恶化风险上升）' : ''}
        </div>
      </Panel>

      <RiskTemperatureOverlay snapshot={snapshot} />
      <DivergenceAlert snapshot={snapshot} />

      <Panel title="你的地图" hint="战略层仍在投资地图">
        {rebalanceGap ? (
          <div className="text-[11px] text-[#b0b5c0] leading-relaxed">
            当前权益实际占比 {fmt(rebalanceGap.actual)}%，目标 {rebalanceGap.target}%，偏离 {fmt(rebalanceGap.gap)} 个百分点。
            详细再平衡清单请到「纪律复盘」。
          </div>
        ) : (
          <div className="text-[11px] text-[#636878]">尚未读取到持仓，先到「持仓跟踪」录入后再看偏离。</div>
        )}
      </Panel>
    </div>
  );
});
