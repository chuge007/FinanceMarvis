import { memo } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { useSectorFlow } from '../hooks/useSectorFlow';
import { useAppStore } from '../../../stores/useAppStore';

const MAX_PX = 120; // 条形最大宽度 px

export const SectorFlowMatrix = memo(function SectorFlowMatrix() {
  const { data: sectors, loading } = useSectorFlow();
  const market = useAppStore((s) => s.market);
  const isCN = market === 'CN';
  const unit = isCN ? '亿' : 'M';

  if (!sectors.length) {
    return <Panel title="板块资金流向" badge="加载中">
      <div className="py-6 text-center text-[10px] text-[#636878]">加载数据...</div>
    </Panel>;
  }

  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.netFlow)), 1);

  return (
    <Panel title="板块资金流向" badge={loading ? '加载中' : `${sectors.length}个板块 · 按主力净流入排序`}>
      <div className="text-[11px] text-[#636878] mb-1.5">{isCN ? '红色=净流入(主力做多) · 绿色=净流出' : 'Inflow vs Outflow'}</div>
      <div className="space-y-1.5">
        {sectors.map((s) => {
          const pct = (Math.abs(s.netFlow) / maxAbs) * MAX_PX;
          const inColor = '#f04452';
          const outColor = '#0ca678';
          const color = s.netFlow >= 0 ? inColor : outColor;
          const flowLabel = `${s.netFlow >= 0 ? '+' : '-'}${Math.abs(s.netFlow).toFixed(1)}${unit}`;
          return (
            <div key={s.id}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-[#d8dce6] w-14 shrink-0 truncate" title={s.name}>{s.name}</span>
                <div className="flex-1 h-[9px] relative bg-[#1a1d26] rounded-full overflow-hidden">
                  {/* 中性基线在中间 */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#2a2d3a]" />
                  {s.netFlow >= 0 ? (
                    <div className="absolute left-1/2 top-0 bottom-0 rounded-r-full"
                      style={{ width: `${pct / 2}%`, backgroundColor: inColor, opacity: 0.9 }} />
                  ) : (
                    <div className="absolute right-1/2 top-0 bottom-0 rounded-l-full"
                      style={{ width: `${pct / 2}%`, backgroundColor: outColor, opacity: 0.9 }} />
                  )}
                </div>
                <span className="text-[11px] font-mono w-14 text-right shrink-0 whitespace-nowrap" style={{ color }}>
                  {flowLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-[60px]">
                <span className={`text-[11px] font-mono shrink-0 ${s.pctChg >= 0 ? 'text-[#f04452]' : 'text-[#0ca678]'}`}>
                  {s.pctChg >= 0 ? '+' : ''}{s.pctChg.toFixed(2)}%
                </span>
                {isCN && typeof s.mainRatio === 'number' && (
                  <span className="text-[11px] text-[#4078ff] font-mono whitespace-nowrap shrink-0">主力占比 {s.mainRatio.toFixed(1)}%</span>
                )}
                <span className="text-[11px] text-[#636878] truncate">{s.reading}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-[#636878] mt-2">
        {isCN ? '数据源: 东方财富 板块资金流 · 主力净流入(亿) · 每2分钟更新' : '数据源: 模型估算 · 美股无北向'}
      </div>
    </Panel>
  );
});
