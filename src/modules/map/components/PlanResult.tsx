import { memo } from 'react';
import type { Plan } from '../../../services/investmentPlan';
import { AllocationTree } from '../../../shared/components/AllocationTree';

const money = (n: number) => `¥${Math.round(n).toLocaleString('zh-CN')}`;

const BUCKET_COLOR: Record<string, string> = {
  emergency: '#20c4d8',
  debt: '#f04452',
  short: '#4078ff',
  long: '#0ca678',
};

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export const PlanResult = memo(function PlanResult({ plan }: { plan: Plan }) {
  const blockers = plan.preconditions.filter((p) => !p.ok && p.level === 'blocker');
  const totalForBar = plan.buckets.reduce((a, b) => a + b.amount, 0) || 1;

  return (
    <div className="space-y-3">
      {plan.blocked && (
        <div className="rounded-[0.3125rem] border border-[rgba(240,68,82,0.4)] bg-[rgba(240,68,82,0.07)] p-3">
          <div className="text-[0.75rem] font-bold text-[#f04452]">现在还不适合开始投资</div>
          <div className="mt-1 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
            有 {blockers.length} 项前置条件未满足：
            {blockers.map((b) => b.title).join('、')}。先把这几件事做完，权益比例才会解锁。
          </div>
        </div>
      )}

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[0.625rem] text-[#636878]">你的风险等级</div>
            <div className="mt-0.5 text-[1.375rem] font-bold leading-none text-[#d8dce6]">{plan.levelLabel}</div>
            <div className="mt-1 text-[0.625rem] text-[#636878]">
              可投资资产 {money(plan.totalAssets)} · 长期资金 {money(plan.longTermAmount)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.625rem] text-[#636878]">长期资金里的权益比例</div>
            <div className="text-[1.875rem] font-bold leading-none tabular-nums" style={{ color: plan.equityPct > 0 ? '#f04452' : '#636878' }}>
              {plan.equityPct}%
            </div>
            <div className="mt-1 text-[0.5938rem] text-[#636878]">按「期限 + 意愿 + 承受力」三者取小</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[0.5938rem] text-[#636878]">
            <span>四笔钱怎么分</span>
            <span>合计 {money(totalForBar)}</span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.04)]">
            {plan.buckets.map((b) =>
              b.amount > 0 ? (
                <div
                  key={b.key}
                  style={{ width: `${(b.amount / totalForBar) * 100}%`, background: BUCKET_COLOR[b.key] }}
                  title={`${b.name} ${money(b.amount)}`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {plan.buckets.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-[0.5938rem] text-[#636878]">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: BUCKET_COLOR[b.key] }} />
                {b.name.replace(/^[①②③④]\s*/, '')} {money(b.amount)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {plan.buckets.map((b) => (
          <div key={b.key} className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[0.7188rem] font-bold text-[#d8dce6]">{b.name}</h3>
              <span className="shrink-0 text-[0.75rem] font-bold tabular-nums" style={{ color: BUCKET_COLOR[b.key] }}>
                {money(b.amount)}
              </span>
            </div>
            <p className="mt-1 text-[0.625rem] leading-relaxed text-[#9aa0ae]">{b.purpose}</p>
            <div className="mt-1.5 text-[0.5938rem] leading-relaxed text-[#636878]">
              工具：{b.tools.join(' / ')}
            </div>
            <p className="mt-1 text-[0.5938rem] leading-relaxed text-[#4d5364]">{b.note}</p>
          </div>
        ))}
      </div>

      <AllocationTree plan={plan} />

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">长期资金的内部配置</h3>
          <span className="text-[0.5938rem] text-[#636878]">基数是 {money(plan.longTermAmount)}，不是总资产</span>
        </div>

        <div className="mt-3 space-y-2">
          {[
            { n: '权益（股票类）', p: plan.equityPct, a: plan.equityAmount, c: '#f04452' },
            { n: '债券 / 存款', p: plan.bondPct, a: plan.bondAmount, c: '#4078ff' },
            { n: '现金缓冲', p: plan.cashPct, a: plan.cashAmount, c: '#636878' },
          ].map((x) => (
            <div key={x.n}>
              <div className="mb-1 flex justify-between text-[0.625rem]">
                <span className="text-[#b0b5c0]">{x.n}</span>
                <span className="tabular-nums text-[#636878]">
                  {x.p}% · {money(x.a)}
                </span>
              </div>
              <Bar pct={x.p} color={x.c} />
            </div>
          ))}
        </div>

        {plan.sleeves.length > 0 && (
          <div className="mt-4 border-t border-[#1a1d26] pt-3">
            <div className="mb-2 text-[0.625rem] text-[#636878]">权益部分再拆开（占权益的比例）</div>
            <div className="space-y-1.5">
              {plan.sleeves.map((s) => (
                <div key={s.name} className="flex items-start gap-2">
                  <span className="w-8 shrink-0 text-right text-[0.625rem] tabular-nums text-[#4078ff]">{s.pct}%</span>
                  <div className="min-w-0">
                    <div className="text-[0.6563rem] text-[#d8dce6]">
                      {s.name} <span className="tabular-nums text-[#636878]">{money(s.amount)}</span>
                    </div>
                    <div className="text-[0.5938rem] leading-relaxed text-[#4d5364]">{s.tools} · {s.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.equityPct === 0 && (
          <p className="mt-3 text-[0.625rem] leading-relaxed text-[#f59e4b]">
            权益比例暂为 0：前置条件未满足，或期限不足 3 年。这不是"看空市场"，而是这笔钱的时间不允许它承受波动。
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <h3 className="text-[0.7188rem] font-bold text-[#d8dce6]">建仓与定投</h3>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[1.5rem] font-bold leading-none tabular-nums text-[#0ca678]">
              {money(plan.monthlyInvest)}
            </span>
            <span className="pb-0.5 text-[0.625rem] text-[#636878]">/ 月 · 共 {plan.buildMonths} 个月</span>
          </div>
          <p className="mt-2 text-[0.625rem] leading-relaxed text-[#9aa0ae]">
            分批建仓是为了避免"一次性买在阶段高点"的后悔成本，不是为了提高收益。若手上有存量资金，也可以按月等额投入。
          </p>
          <p className="mt-1.5 text-[0.5938rem] leading-relaxed text-[#636878]">
            当前月结余 {money(plan.monthlySurplus)}。定投额控制在结余的一半以内，剩下的留给生活与意外。
          </p>
        </div>

        <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
          <h3 className="text-[0.7188rem] font-bold text-[#d8dce6]">再平衡规则</h3>
          <p className="mt-2 text-[0.625rem] leading-relaxed text-[#9aa0ae]">{plan.rebalance}</p>
          <p className="mt-2 text-[0.5938rem] leading-relaxed text-[#636878]">
            市场状态调整：{plan.regime.reason}
          </p>
        </div>
      </div>

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-4">
        <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">开工前的检查清单</h3>
        <div className="mt-2 space-y-1.5">
          {plan.preconditions.map((p) => (
            <div key={p.id} className="flex gap-2">
              <span
                className="mt-0.5 shrink-0 text-[0.625rem] font-bold"
                style={{ color: p.ok ? '#0ca678' : p.level === 'blocker' ? '#f04452' : '#f59e4b' }}
              >
                {p.ok ? '✓' : p.level === 'blocker' ? '!' : '·'}
              </span>
              <div>
                <span
                  className="text-[0.6563rem] font-bold"
                  style={{ color: p.ok ? '#d8dce6' : p.level === 'blocker' ? '#f04452' : '#f59e4b' }}
                >
                  {p.title}
                </span>
                <span className="ml-1.5 text-[0.625rem] leading-relaxed text-[#9aa0ae]">{p.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {plan.warnings.length > 0 && (
        <div className="rounded-[0.3125rem] border border-[rgba(247,212,76,0.3)] bg-[rgba(247,212,76,0.05)] p-3">
          <div className="text-[0.6875rem] font-bold text-[#f7d44c]">需要你注意</div>
          <ul className="mt-1 space-y-1">
            {plan.warnings.map((w, i) => (
              <li key={i} className="text-[0.625rem] leading-relaxed text-[#b0b5c0]">· {w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-4">
        <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">接下来可以做的六件事</h3>
        <ol className="mt-2 space-y-1.5">
          {plan.actions.map((a, i) => (
            <li key={i} className="flex gap-2 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
              <span className="shrink-0 tabular-nums text-[#4078ff]">{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-[0.3125rem] border border-[rgba(240,68,82,0.25)] bg-[rgba(240,68,82,0.04)] p-4">
        <h3 className="text-[0.75rem] font-bold text-[#f04452]">明确不做什么</h3>
        <ul className="mt-2 space-y-1">
          {plan.avoid.map((a, i) => (
            <li key={i} className="flex gap-2 text-[0.6563rem] leading-relaxed text-[#b0b5c0]">
              <span className="shrink-0 text-[#f04452]">×</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});
