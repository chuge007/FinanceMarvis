import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useBullBearForces } from '../hooks/useBullBearForces';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

function verdictOf(text: string): { label: string; color: string; bg: string } {
  const t = text || '';
  if (/偏多|利好|走强|占优|多头|乐观|支撑/.test(t)) return { label: '利好', color: '#f04452', bg: 'rgba(240,68,82,0.12)' };
  if (/偏空|利空|走弱|承压|悲观|下行|警惕/.test(t)) return { label: '利空', color: '#0ca678', bg: 'rgba(12,166,120,0.12)' };
  return { label: '中性', color: '#f59e4b', bg: 'rgba(245,158,75,0.12)' };
}

export const BullBearForce = memo(function BullBearForce({ market }: Props) {
  const { data, loading } = useBullBearForces();

  const title = market === 'CN' ? '多空力量博弈 · A股' : '多空力量博弈';

  if (loading || !data) {
    return <Panel title={title} badge="加载中"><div className="h-16" /></Panel>;
  }

  const { dimensions, conclusion } = data;
  const v = verdictOf(conclusion.verdict);

  return (
    <Panel title={title} badge="5维分析">
      <div className="space-y-2 mb-3">
        {dimensions.map((d) => (
          <div key={d.name}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-[#d8dce6] w-16 shrink-0">{d.name}</span>
              <div className="flex-1 flex h-[10px] rounded overflow-hidden">
                <div style={{ width: `${d.bullPct}%` }} className="bg-[#f04452] transition-all duration-500" />
                <div style={{ width: `${d.bearPct}%` }} className="bg-[#0ca678] transition-all duration-500" />
              </div>
              <span className="text-[11px] font-['JetBrains_Mono',Consolas,monospace] w-16 text-right text-[#b0b5c0] whitespace-nowrap">
                {d.bullPct}% / {d.bearPct}%
              </span>
            </div>
            <div className="text-[11px] text-[#636878] pl-[72px]">{d.meta}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#1a1d26] pt-3">
        <div className="flex items-center gap-2 text-[10px] text-[#d8dce6] font-medium mb-2">
          综合研判
          <span className="px-1.5 py-px rounded text-[11px] font-medium" style={{ color: v.color, backgroundColor: v.bg }}>
            {v.label} {v.label === '利好' ? '↑' : v.label === '利空' ? '↓' : '—'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-[rgba(240,68,82,0.04)] border border-[rgba(240,68,82,0.1)] rounded p-2">
            <div className="text-[11px] text-[#f04452] mb-1 font-medium">多方因素（利好端）</div>
            {conclusion.bulls.map((b, i) => (
              <div key={i} className="text-[11px] text-[#b0b5c0] leading-relaxed">+ {b}</div>
            ))}
          </div>
          <div className="bg-[rgba(12,166,120,0.04)] border border-[rgba(12,166,120,0.1)] rounded p-2">
            <div className="text-[11px] text-[#0ca678] mb-1 font-medium">空方因素（利空端）</div>
            {conclusion.bears.map((b, i) => (
              <div key={i} className="text-[11px] text-[#b0b5c0] leading-relaxed">- {b}</div>
            ))}
          </div>
        </div>
        <div className="bg-[rgba(64,120,255,0.04)] border border-[rgba(64,120,255,0.1)] rounded p-2">
          <div className="text-[11px] text-[#4078ff] mb-0.5 font-medium">Verdict · 研判结论</div>
          <div className="text-[10px] text-[#d8dce6] leading-relaxed">{conclusion.verdict}</div>
        </div>
      </div>
    </Panel>
  );
});
