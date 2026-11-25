import { memo } from 'react';
import type { RhythmSnapshot } from '../services/rhythm';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';

interface Props { snapshot: RhythmSnapshot | null; }

export const DivergenceAlert = memo(function DivergenceAlert({ snapshot }: Props) {
  const series = snapshot?.series ?? {};
  const check = (leadId: string, leadName: string, syncId: string, syncName: string, adverse: 1 | -1) => {
    const lead = series[leadId]?.points ?? [];
    const sync = series[syncId]?.points ?? [];
    if (lead.length < 8 || !sync.length) return null;
    const last = lead[lead.length - 1].z ?? 0;
    const prev = lead[lead.length - 6]?.z ?? last;
    const shift = (last - prev) * adverse;
    const syncZ = (sync[sync.length - 1].z ?? 0) * adverse;
    if (shift < 0.7 || syncZ > 0.3) return null;
    return `${leadName}近5日向不利方向移动 ${shift.toFixed(1)}σ，但${syncName}未跟随（${syncZ.toFixed(1)}σ）→ 背离·待确认`;
  };

  const alerts = [
    check('BAMLH0A0HYM2', '信用利差', 'VIXCLS', 'VIX', 1),
    check('T10Y2Y', '期限利差', 'FG', '情绪指数', -1),
  ].filter(Boolean) as string[];

  return (
    <Panel
      title="背离扫描"
      hint="领先动、同步未跟"
      extra={<ChartHeader source={snapshot ? 'real' : 'missing'} note="5日 Z 变化阈值 0.7σ" />}
    >
      {alerts.length ? (
        <div className="space-y-1.5">
          {alerts.map((a) => (
            <div key={a} className="rounded px-3 py-2 text-[0.6563rem] text-[#f7d44c]"
              style={{ background: 'rgba(247,212,76,0.06)', border: '1px solid rgba(247,212,76,0.18)' }}>
              {a}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center text-[0.6563rem] text-[#636878]">
          未检测到显著背离（或真实序列不足）
        </div>
      )}
      <div className="mt-2">
        <ChartInsight
          summary="领先指标先动、同步指标未跟，只提示“看一眼”，不直接触发防守。"
          how="回到风险温度叠加图确认是否多指标同向；单条背离不等于转折。"
          pitfall="阈值为固定经验参数，不是统计显著检验；所有输入必须是真实序列。"
        />
      </div>
    </Panel>
  );
});
