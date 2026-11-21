import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useStrategyFactors } from '../hooks/useStrategyFactors';
import type { FactorScore } from '../../../types/strategy';
import type { Market } from '../../../stores/useAppStore';

interface Props {
  symbol: string | null;
  market: Market;
}

function scoreColor(score: number): string {
  return score >= 65 ? '#0ca678' : score >= 45 ? '#f59e4b' : '#f04452';
}

function verdictOf(score: number): { text: string; label: string; color: string; bg: string } {
  if (score >= 65) return { text: '利好 · 偏多', label: '利好', color: '#0ca678', bg: 'rgba(12,166,120,0.12)' };
  if (score >= 45) return { text: '中性 · 观望', label: '中性', color: '#f59e4b', bg: 'rgba(245,158,75,0.12)' };
  return { text: '利空 · 偏空', label: '利空', color: '#f04452', bg: 'rgba(240,68,82,0.12)' };
}

function FactorCard({ f, icon }: { f: FactorScore; icon: string }) {
  const color = scoreColor(f.score);
  const v = verdictOf(f.score);
  return (
    <div className="bg-[#0d1117] border border-[#1a1d26] rounded-[5px] p-2.5 flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-[#d8dce6]">
          {icon} {f.label}因子
        </span>
        <span
          className="text-[14px] font-['JetBrains_Mono',Consolas,monospace] font-semibold tabular-nums"
          style={{ color }}
        >
          {f.score}
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#1a1d26] rounded-full mt-1.5 mb-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${f.score}%`, backgroundColor: color }} />
      </div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[11px] text-[#636878] font-['JetBrains_Mono',Consolas,monospace] truncate">{f.meta}</div>
        <span className="shrink-0 px-1 py-px rounded text-[11px] font-medium" style={{ color: v.color, backgroundColor: v.bg }}>
          {v.label} {v.label === '利好' ? '↑' : v.label === '利空' ? '↓' : '—'}
        </span>
      </div>
      <div className="text-[10px] text-[#b0b5c0] leading-relaxed line-clamp-2 min-h-[26px]">{f.reading}</div>
    </div>
  );
}

export const GlobalFactorPanel = memo(function GlobalFactorPanel({ symbol, market }: Props) {
  const { factors, loading, error } = useStrategyFactors(market, symbol);

  return (
    <Panel title="做T综合因子 · 宏观 × 情绪 × 产业" badge={factors ? `综合 ${factors.composite} 分 · ${factors.source === 'realtime' ? '实时' : '估算'}` : undefined}>
      {!symbol ? (
        <div className="h-16 flex items-center justify-center text-[#636878] text-[12px]">
          请先选择标的，基于其所属产业评估做T环境
        </div>
      ) : loading && !factors ? (
        <div className="h-16 flex items-center justify-center text-[#636878] text-[12px]">
          综合因子计算中...
        </div>
      ) : error ? (
        <div className="h-16 flex items-center justify-center text-[#f04452] text-[12px]">{error}</div>
      ) : factors ? (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <FactorCard f={factors.macro} icon="🏦" />
            <FactorCard f={factors.sentiment} icon="📊" />
            <FactorCard f={factors.industry} icon="🏭" />
          </div>

          {/* 综合做T偏向 */}
          <div
            className="rounded-[5px] p-2.5 flex items-center gap-3"
            style={{ backgroundColor: `${factors.bias.color}14`, border: `1px solid ${factors.bias.color}35` }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ border: `2px solid ${factors.bias.color}` }}
            >
              <span className="text-[16px] font-bold font-['JetBrains_Mono',Consolas,monospace]" style={{ color: factors.bias.color }}>
                {factors.composite}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium" style={{ color: factors.bias.color }}>{factors.bias.title}</span>
                <span className="text-[10.5px] text-[#636878]">综合做T偏向</span>
              </div>
              <div className="text-[10px] text-[#b0b5c0] leading-relaxed">{factors.bias.suggestion}</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#636878]">
            <span>因子解读：宏观(30%) + 情绪(30%) + 产业(40%) 加权 · 产业=标的所属板块主力资金流</span>
            <span className="font-['JetBrains_Mono',Consolas,monospace]">更新 {factors.updatedAt}</span>
          </div>
        </div>
      ) : null}
    </Panel>
  );
});
