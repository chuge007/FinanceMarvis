import { memo, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';

const inputCls = 'w-full bg-[#090b0f] border border-[#1a1d26] rounded px-2 py-1.5 text-[12px] text-[#d8dce6] outline-none focus:border-[#4078ff]';

/** 必须定义在组件外，否则每次渲染都会生成新的组件类型，导致输入框失焦。 */
function NumberField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-[#636878] mb-1">{label}</span>
      <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      {hint && <span className="block text-[9px] text-[#636878] mt-0.5">{hint}</span>}
    </label>
  );
}

/** 固定风险比例仓位换算：把「我能亏多少」翻译成「能买多少」，不做收益预测。 */
export const PositionSizer = memo(function PositionSizer() {
  const [capital, setCapital] = useState('100000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('10.00');
  const [stop, setStop] = useState('9.40');
  const [lot, setLot] = useState('100');

  const C = Number(capital), R = Number(riskPct), E = Number(entry), S = Number(stop), L = Number(lot);
  const valid = [C, R, E, S, L].every(Number.isFinite) && C > 0 && R > 0 && E > 0 && S > 0 && L > 0 && E !== S;
  const budget = valid ? C * (R / 100) : 0;
  const perShareRisk = valid ? Math.abs(E - S) : 0;
  const rawShares = valid ? budget / perShareRisk : 0;
  const shares = valid ? Math.floor(rawShares / L) * L : 0;
  const amount = shares * E;
  const exposure = valid ? (amount / C) * 100 : 0;
  const stopDistance = valid ? (Math.abs(E - S) / E) * 100 : 0;
  const overCap = shares > 0 && amount > C;

  return (
    <Panel title="仓位计算器" hint="固定风险比例 · 只做风险预算换算">
      <div className="grid grid-cols-5 gap-2">
        <NumberField label="账户资金 (¥)" value={capital} onChange={setCapital} />
        <NumberField label="单笔风险 (%)" value={riskPct} onChange={setRiskPct} hint="常见 1%~2%" />
        <NumberField label="入场价" value={entry} onChange={setEntry} />
        <NumberField label="止损价" value={stop} onChange={setStop} />
        <NumberField label="每手股数" value={lot} onChange={setLot} hint="A股 100 / 美股 1" />
      </div>

      {!valid ? (
        <p className="text-[11px] text-[#f59e4b] mt-3">请填写有效数字，且入场价与止损价不能相同。</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { label: '风险预算', value: `¥${budget.toFixed(0)}`, color: '#d8dce6' },
              { label: '每股风险', value: `¥${perShareRisk.toFixed(2)}`, color: '#d8dce6' },
              { label: '建议股数', value: `${shares} 股`, color: '#20c4d8' },
              { label: '占总资产', value: `${exposure.toFixed(1)}%`, color: exposure > 50 ? '#f59e4b' : '#d8dce6' },
            ].map((k) => (
              <div key={k.label} className="bg-[rgba(255,255,255,0.02)] border border-[#1a1d26] rounded px-3 py-2">
                <div className="text-[10px] text-[#636878]">{k.label}</div>
                <div className="text-[15px] font-semibold font-['JetBrains_Mono',Consolas,monospace]" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#636878] mt-2">
            公式：风险预算 = 账户资金 × 单笔风险%；股数 = 风险预算 ÷ |入场价 − 止损价|，再按每手取整。
            本例买入金额约 ¥{amount.toFixed(0)}，止损距离 {stopDistance.toFixed(1)}%。
          </p>
          {overCap && <p className="text-[11px] mt-2" style={{ color: '#f04452' }}>计算出的买入金额超过账户资金，必须下调风险比例或收紧止损，但不能为了凑数量而把止损设得过窄。</p>}
          {stopDistance < 2 && <p className="text-[11px] mt-2" style={{ color: '#f59e4b' }}>止损距离小于 2%，容易被日常噪声触发；请确认它对应真实的结构位，而不是为了放大股数。</p>}
          {stopDistance > 15 && <p className="text-[11px] mt-2" style={{ color: '#f59e4b' }}>止损距离超过 15%，单笔波动会很大；考虑降低风险比例或换用更小的时间框架。</p>}
        </>
      )}

      <div className="text-[10px] leading-relaxed text-[#636878] border-t border-[#1a1d26] mt-3 pt-2 space-y-1">
        <p>· 这是「亏损上限换算」，不是收益预测；仓位规则无法把负期望的策略变正（业界惯例与教材口径）。</p>
        <p>· 跳空、跌停、流动性不足与滑点会让实际亏损超过预算，止损并非保证成交价。</p>
        <p>· 多笔各 1% 的风险如果押的是同一件事（同一板块、同一宏观变量），实际是同一笔更大的赌注。</p>
        <p>· 波动率目标（vol targeting）用滞后波动估计，冲击当天仍可能满仓，且「能否改善夏普」在学界有明确争议；此处不采用。</p>
      </div>
    </Panel>
  );
});
