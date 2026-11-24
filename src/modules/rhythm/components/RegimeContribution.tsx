import { memo } from 'react';
import type { RhythmSnapshot } from '../services/rhythm';
import { Panel } from '../../../shared/components/Panel';
import { ChartHeader } from '../../../shared/components/ChartHeader';
import { ChartInsight } from '../../../shared/components/ChartInsight';

const PALETTE = ['#4078ff', '#20c4d8', '#f59e4b', '#9b6efb', '#0ca678', '#f04452', '#636878', '#b0b5c0'];

interface Props { snapshot: RhythmSnapshot | null; }

/** 把「防守/进攻」综合分拆成每个真实指标的加权贡献，回答“这个结论怎么来的”。 */
export const RegimeContribution = memo(function RegimeContribution({ snapshot }: Props) {
  const indicators = snapshot?.indicators ?? [];
  const scored = indicators.filter((i) => i.source === 'real' && i.score !== null);
  const usedWeight = scored.reduce((a, i) => a + i.weight, 0);

  return (
    <Panel
      title="综合结论贡献分解"
      hint="每个指标投了多少票"
      extra={<ChartHeader source={snapshot ? 'real' : 'missing'} note="仅计入取到真实序列的指标" />}
    >
      {!scored.length || usedWeight <= 0 ? (
        <div className="h-16 flex items-center justify-center text-[10.5px] text-[#636878]">
          真实指标不足，不做贡献分解。
        </div>
      ) : (
        <>
          <div className="flex h-5 w-full overflow-hidden rounded-[3px] bg-[#1a1d26]">
            {scored.map((item, i) => {
              const contribution = ((item.score as number) * item.weight) / usedWeight;
              return (
                <div
                  key={item.id}
                  className="h-full"
                  style={{ width: `${contribution}%`, background: PALETTE[i % PALETTE.length], opacity: 0.85 }}
                  title={`${item.name}：贡献 ${contribution.toFixed(1)} 分，权重 ${(item.weight * 100).toFixed(0)}%`}
                />
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {indicators.map((item) => {
              const active = item.source === 'real' && item.score !== null;
              const contribution = active ? ((item.score as number) * item.weight) / usedWeight : null;
              return (
                <div key={item.id} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ background: active ? PALETTE[scored.findIndex((s) => s.id === item.id) % PALETTE.length] : '#2a2d3a' }}
                    />
                    <span className="truncate" style={{ color: active ? '#b0b5c0' : '#4d5364' }}>{item.name}</span>
                    <span className="text-[#4d5364]">权重 {(item.weight * 100).toFixed(0)}%</span>
                  </div>
                  <span className="font-mono tabular-nums" style={{ color: active ? '#d8dce6' : '#4d5364' }}>
                    {contribution === null ? '未计入' : `${contribution.toFixed(1)} 分`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <ChartInsight
              summary="色块宽度=该指标对最终综合分的贡献；未取到真实数据的指标不计入，也不脑补。"
              how="若结论与直觉不符，先看这里哪个指标贡献最大，再回到时间轴看它的历史分位。"
              pitfall="贡献分解是可追溯的展示，不是新的预测模型；不要单独拿某一项当买卖信号。"
            />
          </div>
        </>
      )}
    </Panel>
  );
});
