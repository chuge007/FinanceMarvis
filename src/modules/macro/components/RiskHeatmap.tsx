import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useMacroRisk } from '../hooks/useMacroRisk';
import { RISK_COLORS } from '../../../shared/utils/colors';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

export const RiskHeatmap = memo(function RiskHeatmap({ market }: Props) {
  const { data: indicators, loading } = useMacroRisk();

  const title = market === 'CN' ? '宏观风险热力图 · A股' : '宏观风险热力图';

  return (
    <Panel title={title} badge={loading ? '加载中' : `${indicators.length}项 · 真实接口 / 降级为演示数据`}>
      <div className="grid grid-cols-4 gap-2">
        {indicators.map((item) => {
          const { bg, border } = RISK_COLORS[item.level];
          return (
            <div
              key={item.id}
              className="rounded-[5px] p-2.5 border transition-colors"
              style={{ backgroundColor: bg, borderColor: border }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{item.icon}</span>
                <span className="text-[10.5px] text-[#636878] uppercase">{item.label}</span>
              </div>
              <div className="text-[13px] font-['JetBrains_Mono',Consolas,monospace] font-semibold text-[#d8dce6] tabular-nums mb-1">
                {item.value}
              </div>
              <div className="text-[10px] text-[#636878] leading-tight">{item.reading}</div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-[#636878] mt-2">数据源: ConvexTrade (FRED / CBOE) · 每 5 分钟更新</div>
    </Panel>
  );
});
