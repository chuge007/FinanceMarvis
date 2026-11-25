import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useCreditRates } from '../hooks/useCreditRates';
import { directionColor, directionText } from '../../../shared/utils/colors';
import type { Market } from '../../../stores/useAppStore';

interface Props { market: Market; }

export const CreditRateTable = memo(function CreditRateTable({ market }: Props) {
  const { data: rows, loading } = useCreditRates();

  const title = market === 'CN' ? '信用 / 利率 / 流动性 · A股' : '信用 / 利率 / 流动性';

  return (
    <Panel title={title} badge={loading ? '加载中' : `${rows.length}项`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[0.6875rem]">
          <thead>
            <tr className="text-[#636878] border-b border-[#1a1d26]">
              <th className="text-left py-1.5 font-medium">指标</th>
              <th className="text-right py-1.5 font-medium">当前值</th>
              <th className="text-right py-1.5 font-medium">方向</th>
              <th className="text-left py-1.5 font-medium">解读</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-[rgba(255,255,255,0.02)]">
                <td className="py-1.5 text-[#d8dce6]">{row.name}</td>
                <td className="py-1.5 text-right font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">
                  {row.current}
                </td>
                <td className="py-1.5 text-right" style={{ color: directionColor(row.direction) }}>
                  {directionText(row.direction)}
                </td>
                <td className="py-1.5 text-[#636878]">{row.reading}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[0.625rem] text-[#636878] mt-2">数据源: ConvexTrade (FRED / CBOE) · 每 5 分钟更新</div>
    </Panel>
  );
});
