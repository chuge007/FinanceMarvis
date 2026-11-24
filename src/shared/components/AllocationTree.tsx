import { memo } from 'react';
import type { Plan } from '../../services/investmentPlan';
import { Panel } from './Panel';
import { ChartHeader } from './ChartHeader';
import { ChartInsight } from './ChartInsight';

const money = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`;
const BUCKET_COLOR: Record<string, string> = {
  emergency: '#20c4d8', debt: '#f04452', short: '#4078ff', long: '#0ca678',
};

/** 资产配置树：总资产 → 四笔钱 → 长期资金内部三类，宽度=金额。 */
export const AllocationTree = memo(function AllocationTree({ plan }: { plan: Plan }) {
  const total = plan.buckets.reduce((a, b) => a + b.amount, 0) || 1;

  return (
    <Panel
      title="资产配置树"
      hint="宽度=金额"
      extra={<ChartHeader source="rule" note="按公开规则推算，非投资建议" />}
    >
      <div className="text-[10px] text-[#636878] mb-1">
        可投资资产 {money(plan.totalAssets)} · 规则推算，不是预测
      </div>
      <div className="space-y-1.5">
        {plan.buckets.map((b) => {
          const pct = (b.amount / total) * 100;
          return (
            <div key={b.key}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#b0b5c0] truncate">{b.name.replace(/^[①②③④]\s*/, '')}</span>
                <span className="tabular-nums text-[#636878] shrink-0">{money(b.amount)} · {pct.toFixed(1)}%</span>
              </div>
              <div className="mt-0.5 h-3 w-full rounded-[2px] bg-[#1a1d26] overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: BUCKET_COLOR[b.key], opacity: 0.85 }} />
              </div>
              {b.key === 'long' && b.amount > 0 && (
                <div className="ml-4 mt-1 flex h-2 w-[calc(100%-1rem)] overflow-hidden rounded-[2px] bg-[#14161d]">
                  {[
                    { p: plan.equityPct, c: '#f04452' },
                    { p: plan.bondPct, c: '#4078ff' },
                    { p: plan.cashPct, c: '#636878' },
                  ].map((x, i) => (
                    <div key={i} style={{ width: `${x.p}%`, background: x.c, opacity: 0.8 }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <ChartInsight
          summary="先看四笔钱是否按优先级分好，再看长期资金里权益/债券/现金的比例。"
          how="任何一项前置条件未满足时，权益比例会被锁为 0，这是规则不是市场判断。"
          pitfall="这是按你填写的画像推算的配置框架，不预测收益，也不构成具体产品买卖建议。"
        />
      </div>
    </Panel>
  );
});
