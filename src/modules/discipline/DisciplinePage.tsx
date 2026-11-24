import { memo, useMemo } from 'react';
import { PositionSizer } from './components/PositionSizer';
import { Checklist } from './components/Checklist';
import { Rebalance } from './components/Rebalance';
import { Journal } from './components/Journal';
import { readJSON } from '../../shared/utils/localStore';
import type { LastRegimeState } from '../rhythm/components/RegimeCard';

export const DisciplinePage = memo(function DisciplinePage() {
  // 复用节奏页已写入的本机状态，避免重复请求上游
  const lastRegime = useMemo(() => readJSON<LastRegimeState | null>('marvis.regime.last.v1', null), []);
  const tone = lastRegime?.tone ?? '—';

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[13px] font-bold text-[#d8dce6]">纪律与复盘 · 把节奏变成可执行的规则</h2>
        <p className="text-[10px] text-[#636878] mt-0.5">
          市场状态会变，但风险预算、检查清单与复盘流程不该跟着情绪变。以下工具只做换算与记录，不给买卖建议。
        </p>
      </div>

      <PositionSizer tone={tone} />

      <div className="grid grid-cols-2 gap-3 items-start">
        <Checklist />
        <Rebalance />
      </div>

      <Journal tone={tone} regime={lastRegime} />

      <p className="text-center text-[10px] text-[#636878] pb-2">
        StrategyLab · 纪律复盘模块 · 所有记录仅存本机浏览器 · 仓位与再平衡数值为通用风控口径，不构成投资建议
      </p>
    </div>
  );
});
