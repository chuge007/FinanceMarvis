import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useAlgoTable } from '../hooks/index';

export const AlgoSentimentTable = memo(function AlgoSentimentTable() {
  const rows = useAlgoTable();

  return (
    <Panel title="算法情绪综合表" badge="12项">
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px]">
          <thead>
            <tr className="text-[#636878] border-b border-[#1a1d26]">
              <th className="text-left py-1.5 font-medium">指标</th>
              <th className="text-right py-1.5 font-medium">数值</th>
              <th className="text-left py-1.5 font-medium">信号</th>
              <th className="text-left py-1.5 font-medium">方法论来源</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.01)]">
                <td className="py-1.5 text-[#d8dce6]">{row.name}</td>
                <td className="py-1.5 text-right font-['JetBrains_Mono',Consolas,monospace] text-[#d8dce6] tabular-nums">{row.value}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: `${row.signalColor}20`, color: row.signalColor }}>
                      {row.signal}
                    </span>
                    <div className="relative w-[54px] h-[6px] rounded-full bg-[#1a1d26] overflow-hidden shrink-0">
                      <div className="absolute left-1/2 top-0 w-px h-full bg-[#4d5364]" />
                      <div
                        className="absolute top-0 h-full"
                        style={{
                          background: row.signalColor,
                          opacity: 0.85,
                          left: row.signal === '偏多' ? '50%' : row.signal === '偏空' ? '12%' : '38%',
                          width: row.signal === '中性' ? '24%' : '38%',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-1.5 text-[#636878]">{row.methodology}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
});
