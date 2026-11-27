/**
 * 组合与风险工作台：回答「我赚的是 beta 还是 alpha、现在有没有超风险预算」。
 *
 * 计算全部走 core/domain 的纯函数（本地与云端共用）；
 * 样本不足时指标显示「不可得」并列出原因，绝不填 0 冒充安全。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { usePortfolioStore } from '../../stores/usePortfolioStore';
import { useSeries } from '../../core/data/hooks';
import { checkLimits, riskSummary, drift, hhi, effectiveN } from '../../core/domain';

const DEFAULT_LIMITS = {
  maxDrawdown: 20,
  var95: 15,
  maxSingleWeight: 25,
  maxSectorWeight: 40,
  minCash: 5,
  maxHHI: 0.25,
};

function MetricCard({ label, value, suffix, missing }: { label: string; value: number | null; suffix?: string; missing?: boolean }) {
  return (
    <div className="rounded border border-[#151823] bg-[#0b0d13] p-2.5">
      <div className="text-[0.75rem] text-[#636878]">{label}</div>
      <div className={`mt-1 font-mono text-[1.125rem] ${missing ? 'text-[#f5a524]' : 'text-[#d8dce6]'}`}>
        {missing ? '不可得' : value == null ? '—' : `${value.toFixed(2)}${suffix ?? ''}`}
      </div>
    </div>
  );
}

export const PortfolioPage = memo(function PortfolioPage() {
  const positions = usePortfolioStore((s) => s.positions);
  const summary = usePortfolioStore((s) => s.summary);
  const loadPositions = usePortfolioStore((s) => s.loadPositions);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'asset' | 'single'>('asset');

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  // 收益序列：用沪深300真实日线算日收益（样本足够才算 VaR/CVaR）
  const bench = useSeries(['cn:index:sh000300'], '2y');
  const returns = useMemo(() => {
    const pts = bench.data?.series?.[0]?.points ?? [];
    const out: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const prev = Number(pts[i - 1].value);
      const cur = Number(pts[i].value);
      if (prev > 0 && Number.isFinite(cur)) out.push(cur / prev - 1);
    }
    return out;
  }, [bench.data]);

  const risk = useMemo(() => riskSummary(returns), [returns]);
  const weights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of positions) out[p.symbol] = Number(p.weight) || 0;
    return out;
  }, [positions]);

  const cashPct = summary.totalAssets > 0 ? (summary.cash / summary.totalAssets) * 100 : 100;
  const checked = useMemo(
    () => checkLimits({ weights, cash: cashPct, returns }, DEFAULT_LIMITS),
    [weights, cashPct, returns],
  );

  const targetWeights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of positions) {
      const t = Number(targets[p.symbol]);
      out[p.symbol] = Number.isFinite(t) ? t : (100 - cashPct) / Math.max(1, positions.length);
    }
    return out;
  }, [positions, targets, cashPct]);

  const drifts = useMemo(() => drift(weights, targetWeights, mode), [weights, targetWeights, mode]);
  const missingSet = new Set(risk.missing.map((m) => m.split('（')[0]));

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">组合与风险 · 我有没有超风险预算</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          指标来自真实日线；样本不足写「不可得」而不是填 0。VaR 需≥100 样本，CVaR 需≥250。
        </p>
      </div>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="VaR 95%" value={risk.metrics.var95} suffix="%" missing={missingSet.has('var95')} />
        <MetricCard label="CVaR 95%" value={risk.metrics.cvar95} suffix="%" missing={missingSet.has('cvar95')} />
        <MetricCard label="Sharpe" value={risk.metrics.sharpe} missing={missingSet.has('sharpe')} />
        <MetricCard label="Sortino" value={risk.metrics.sortino} missing={missingSet.has('sortino')} />
        <MetricCard label="最大回撤" value={risk.metrics.maxDrawdown} suffix="%" missing={missingSet.has('maxDrawdown')} />
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">持仓台账</h3>
            <span className="text-[0.75rem] text-[#4d5364]">
              有效持仓 {checked.summary.effectiveN ?? '—'} · HHI {checked.summary.hhi ?? '—'}
            </span>
          </div>
          {positions.length === 0 ? (
            <div className="py-6 text-center text-[0.8125rem] text-[#4d5364]">还没有持仓记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] border-collapse text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-[#1a1d26] text-left text-[0.75rem] text-[#4d5364]">
                    <th className="py-1.5 pr-2 font-normal">标的</th>
                    <th className="py-1.5 pr-2 font-normal">数量</th>
                    <th className="py-1.5 pr-2 font-normal">成本</th>
                    <th className="py-1.5 pr-2 font-normal">现价</th>
                    <th className="py-1.5 pr-2 font-normal">盈亏</th>
                    <th className="py-1.5 pr-2 font-normal">权重%</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-b border-[#151823] last:border-0">
                      <td className="py-1.5 pr-2 text-[#d8dce6]">{p.name || p.symbol}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#b0b5c0]">{p.quantity}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#b0b5c0]">{p.avgCost.toFixed(2)}</td>
                      <td className="py-1.5 pr-2 font-mono text-[#b0b5c0]">{p.currentPrice.toFixed(2)}</td>
                      <td className={`py-1.5 pr-2 font-mono ${p.pnl >= 0 ? 'text-[#e5484d]' : 'text-[#30a46c]'}`}>
                        {p.pnlPercent.toFixed(2)}%
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-[#b0b5c0]">{p.weight.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
          <h3 className="mb-2 text-[0.875rem] font-semibold text-[#d8dce6]">纪律与限额检查</h3>
          {checked.violations.length === 0 && checked.unverified.length === 0 ? (
            <p className="text-[0.8125rem] text-[#30a46c]">全部通过</p>
          ) : (
            <div className="space-y-1.5">
              {checked.violations.map((v, i) => (
                <div key={i} className="rounded border-l-2 border-[#e5484d] bg-[#e5484d]/5 px-2 py-1 text-[0.8125rem] text-[#e5484d]">
                  {v.rule} · 实际 {String(v.actual)} / 限额 {String(v.limit ?? '—')}
                  {v.note ? ` · ${v.note}` : ''}
                </div>
              ))}
              {checked.unverified.map((u, i) => (
                <div key={`u${i}`} className="rounded border-l-2 border-[#f5a524] bg-[#f5a524]/5 px-2 py-1 text-[0.8125rem] text-[#f5a524]">
                  {u.rule} 无法验证 · {u.reason}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-[#151823] pt-2 text-[0.75rem] text-[#4d5364]">
            相关性拥挤与流动性变现需要逐笔相关矩阵与 ADV20，本版未接入，不计入通过。
          </p>
        </section>
      </div>

      <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.875rem] font-semibold text-[#d8dce6]">配置漂移</h3>
          <div className="flex gap-1">
            {(['asset', 'single'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded px-2.5 py-1 text-[0.8125rem] transition-colors ${
                  mode === m ? 'bg-[rgba(64,120,255,0.16)] text-[#d8dce6]' : 'text-[#787e8e] hover:text-[#d8dce6]'
                }`}
              >
                {m === 'asset' ? '大类资产' : '单券/行业'}
              </button>
            ))}
          </div>
        </div>
        {drifts.length === 0 ? (
          <div className="py-5 text-center text-[0.8125rem] text-[#4d5364]">没有可核对的持仓权重</div>
        ) : (
          drifts.map((d) => (
            <div key={d.key} className="flex items-center gap-2 border-b border-[#151823] py-1.5 last:border-0">
              <span className="w-[8rem] shrink-0 truncate text-[0.8125rem] text-[#b0b5c0]">{d.key}</span>
              <span className="w-[4rem] shrink-0 text-[0.75rem] text-[#636878]">现 {d.actual.toFixed(1)}%</span>
              <input
                aria-label={`${d.key} 目标权重`}
                value={targets[d.key] ?? ''}
                onChange={(e) => setTargets((prev) => ({ ...prev, [d.key]: e.target.value }))}
                placeholder={d.target.toFixed(1)}
                className="w-[5rem] rounded border border-[#1a1d26] bg-[#0b0d13] px-2 py-1 font-mono text-[0.8125rem] text-[#d8dce6] outline-none focus:border-[#4078ff]"
              />
              <span className={`font-mono text-[0.8125rem] ${d.delta >= 0 ? 'text-[#e5484d]' : 'text-[#30a46c]'}`}>
                {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(2)}pp
              </span>
              <span
                className={`ml-auto rounded px-1.5 text-[0.75rem] ${
                  d.level === 'breach' ? 'bg-[#e5484d]/15 text-[#e5484d]' : d.level === 'warn' ? 'bg-[#f5a524]/15 text-[#f5a524]' : 'text-[#4d5364]'
                }`}
              >
                {d.level === 'breach' ? '超限' : d.level === 'warn' ? '预警' : '正常'}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
});
