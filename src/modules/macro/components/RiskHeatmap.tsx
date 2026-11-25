import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { SourceBadge, type SourceKind } from '../../../shared/components/SourceBadge';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';
import { useMacroRisk } from '../hooks/useMacroRisk';
import { RISK_COLORS } from '../../../shared/utils/colors';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

export const RiskHeatmap = memo(function RiskHeatmap({ market }: Props) {
  const { data: indicators, loading } = useMacroRisk();
  const title = market === 'CN' ? '宏观风险热力图 · A股' : '宏观风险热力图';
  const demoCount = indicators.filter((i) => i.source === 'demo').length;
  const overall: SourceKind = loading ? 'missing' : demoCount > 0 ? 'demo' : 'real';

  return (
    <Panel
      title={title}
      extra={<ChartHeader source={overall} note={demoCount > 0 ? `${demoCount} 项为演示快照` : 'ConvexTrade / FRED / CBOE'} />}
    >
      <div className="grid grid-cols-4 gap-2">
        {indicators.map((item) => {
          const { bg, border } = RISK_COLORS[item.level];
          const kind: SourceKind = item.source === 'demo' ? 'demo' : item.source === 'missing' || item.value === '—' ? 'missing' : 'real';
          return (
            <div
              key={item.id}
              className={`rounded-[0.3125rem] p-2.5 border transition-colors ${kind !== 'real' ? 'border-dashed opacity-70' : ''}`}
              style={{ backgroundColor: bg, borderColor: kind === 'real' ? border : 'rgba(155,110,251,0.45)' }}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs">{item.icon}</span>
                  <span className="text-[0.6563rem] text-[#636878] uppercase truncate">{item.label}</span>
                </div>
                <SourceBadge kind={kind} />
              </div>
              <div className="text-[0.8125rem] font-['JetBrains_Mono',Consolas,monospace] font-semibold text-[#d8dce6] tabular-nums mb-1">
                {item.value}
              </div>
              <div className="text-[0.625rem] text-[#636878] leading-tight">{item.reading}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <ChartInsight
          summary="颜色越红代表风险越高，灰色代表数据不可用；虚线边框为演示快照，不能用于决策。"
          how="先看整体红绿分布，再点开单项看分位与趋势；单项数据不可用时不要用邻近指标脑补。"
          pitfall="演示快照只用于展示版式，数值不是当前市场读数。"
        />
      </div>
    </Panel>
  );
});
