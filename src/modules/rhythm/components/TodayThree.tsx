import { memo, useState } from 'react';
import type { RegimeResult } from '../services/rhythm';
import { Panel } from '../../../shared/components/Panel';
import { readJSON, writeJSON, todayKey } from '../../../shared/utils/localStore';

interface TodayState { date: string; checked: boolean[] }
const KEY = 'marvis.today.v1';

const TITLES = ['① 今天做什么', '② 等什么确认', '③ 明确不做什么'];

export const TodayThree = memo(function TodayThree({ regime }: { regime: RegimeResult | null }) {
  const [state, setState] = useState<TodayState>(() => {
    const saved = readJSON<TodayState | null>(KEY, null);
    return saved && saved.date === todayKey() ? saved : { date: todayKey(), checked: [false, false, false] };
  });

  const items = regime
    ? [regime.action, regime.confirm, regime.avoid]
    : ['等待真实数据加载完成。', '等待真实数据加载完成。', '数据不足时不做临场决策。'];

  const toggle = (i: number) => {
    const next: TodayState = { date: todayKey(), checked: state.checked.map((c, idx) => (idx === i ? !c : c)) };
    setState(next);
    writeJSON(KEY, next);
  };

  const done = state.checked.filter(Boolean).length;

  return (
    <Panel title="今日三件事" hint="计划 vs 执行 · 只存本机" extra={<span className="text-[10px] text-[#636878]">{todayKey()}</span>}>
      <div className="space-y-2">
        {items.map((text, i) => (
          <label
            key={i}
            className="flex gap-2.5 border border-[#1a1d26] rounded-[4px] px-3 py-2.5 cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
            style={{ background: state.checked[i] ? 'rgba(12,166,120,0.05)' : 'rgba(255,255,255,0.015)' }}
          >
            <input
              type="checkbox"
              checked={state.checked[i]}
              onChange={() => toggle(i)}
              className="mt-0.5 accent-[#0ca678]"
            />
            <span>
              <span className="block text-[11px] font-bold text-[#d8dce6] mb-1">{TITLES[i]}</span>
              <span className="block text-[11px] leading-relaxed" style={{ color: state.checked[i] ? '#636878' : '#b0b5c0' }}>
                {text}
              </span>
            </span>
          </label>
        ))}
      </div>

      {regime && (
        <p className="text-[10px] leading-relaxed text-[#636878] mt-3 border-t border-[#1a1d26] pt-2">
          风险预算：{regime.riskBudget}
        </p>
      )}

      <div
        className="mt-3 rounded-[4px] px-3 py-2 text-[11px] leading-relaxed"
        style={{ background: done === 3 ? 'rgba(12,166,120,0.08)' : 'rgba(247,212,76,0.07)', color: done === 3 ? '#0ca678' : '#f7d44c' }}
      >
        {done === 3
          ? `计划已确认（3/3）。仍请按事先写好的止损执行，不要临场放宽。`
          : `还有 ${3 - done} 项未确认。刻意保留一步「隔夜再决定」，用来对抗追涨杀跌与过度交易；未完成前不建议新增敞口。`}
      </div>

      <p className="text-[10px] text-[#636878] mt-3">
        更完整的下单前检查清单、仓位计算与复盘记录在「纪律复盘」页。勾选状态按日期保存，只存本机浏览器。
      </p>
    </Panel>
  );
});
