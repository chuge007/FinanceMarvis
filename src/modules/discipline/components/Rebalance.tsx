import { memo, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';

export const Rebalance = memo(function Rebalance() {
  const [target, setTarget] = useState('60');
  const [current, setCurrent] = useState('68');
  const [band, setBand] = useState('5');

  const T = Number(target), C = Number(current), B = Number(band);
  const valid = [T, C, B].every(Number.isFinite) && T >= 0 && T <= 100 && C >= 0 && C <= 100 && B > 0;
  const drift = valid ? C - T : 0;
  const triggered = valid && Math.abs(drift) >= B;

  const inputCls = 'w-full bg-[#090b0f] border border-[#1a1d26] rounded px-2 py-1.5 text-[0.75rem] text-[#d8dce6] outline-none focus:border-[#4078ff]';

  return (
    <Panel title="再平衡检查" hint="控风险工具，不是增强收益工具">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '目标股票仓位 (%)', value: target, set: setTarget },
          { label: '当前股票仓位 (%)', value: current, set: setCurrent },
          { label: '容忍带 (百分点)', value: band, set: setBand },
        ].map((f) => (
          <label key={f.label} className="block">
            <span className="block text-[0.625rem] text-[#636878] mb-1">{f.label}</span>
            <input type="number" step="any" value={f.value} onChange={(e) => f.set(e.target.value)} className={inputCls} />
          </label>
        ))}
      </div>

      {valid && (
        <div className="mt-3 border border-[#1a1d26] rounded-[0.25rem] px-3 py-2.5">
          <div className="text-[0.6875rem] text-[#b0b5c0]">
            当前偏离目标 <span className="font-semibold" style={{ color: Math.abs(drift) < B ? '#d8dce6' : '#f59e4b' }}>
              {drift > 0 ? '+' : ''}{drift.toFixed(1)} 个百分点
            </span>
          </div>
          <div className="text-[0.6875rem] mt-1.5" style={{ color: triggered ? '#f7d44c' : '#0ca678' }}>
            {triggered
              ? `已超出 ±${B}pp 容忍带：触发一次「再平衡检查」，但不必立刻交易 —— 先看事件窗口、税费与止损。`
              : '仍在容忍带内：按研究结论，频繁调整带来的成本通常大于收益，维持即可。'}
          </div>
        </div>
      )}

      <div className="text-[0.625rem] leading-relaxed text-[#636878] border-t border-[#1a1d26] mt-3 pt-2 space-y-1">
        <p>· Vanguard《Best Practices for Portfolio Rebalancing》(2010)：没有普适最优频率，月/季/年风险调整后收益差别不大，而成本随频率明显上升；分散股债组合常见折中为「每年或每半年检查、偏离 5 个百分点再调整」。</p>
        <p>· 再平衡的目的是把风险拉回目标，不是提高收益；单边趋势中它可能落后于买入持有，且对税费敏感。</p>
        <p>· 最大回撤阈值更适合作为「暂停新仓 → 降风险 → 复盘 → 恢复」的治理触发器，阈值需个人化。</p>
      </div>
    </Panel>
  );
});
