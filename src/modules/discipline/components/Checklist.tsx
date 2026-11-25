import { memo, useState } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { readJSON, writeJSON, todayKey } from '../../../shared/utils/localStore';

const QUESTIONS = [
  '我依据的是领先 / 同步 / 滞后 / 情绪哪一类？「信号」和「已确认事实」是否分开写了？',
  '这个动作与事先写好的计划一致吗？还是因为刚刚看到一根涨跌才临时决定的？',
  '未来 2 个交易日是否有事件窗口（议息、CPI/非农、期权到期、财报披露）？',
  '组合总敞口是否超上限？多笔各 1% 的风险，是不是其实押着同一件事？',
  '止损价是否明确且可执行？跳空、跌停、流动性不足会不会让亏损超过预算？',
  '我是否写下了决策理由，并约定了复盘时间？',
];

interface CheckState { date: string; checked: boolean[] }
const KEY = 'marvis.checklist.v1';

export const Checklist = memo(function Checklist() {
  const [state, setState] = useState<CheckState>(() => {
    const saved = readJSON<CheckState | null>(KEY, null);
    return saved && saved.date === todayKey() ? saved : { date: todayKey(), checked: QUESTIONS.map(() => false) };
  });
  const done = state.checked.filter(Boolean).length;

  const toggle = (i: number) => {
    const next: CheckState = { date: todayKey(), checked: state.checked.map((c, idx) => (idx === i ? !c : c)) };
    setState(next);
    writeJSON(KEY, next);
  };

  return (
    <Panel title="下单前 6 问" hint="按日期保存 · 只存本机" extra={<span className="text-[0.625rem] text-[#636878]">{done}/6</span>}>
      <div className="space-y-1.5">
        {QUESTIONS.map((q, i) => (
          <label key={i} className="flex gap-2 text-[0.6875rem] leading-relaxed cursor-pointer">
            <input type="checkbox" checked={state.checked[i]} onChange={() => toggle(i)} className="mt-0.5 accent-[#0ca678]" />
            <span style={{ color: state.checked[i] ? '#636878' : '#b0b5c0' }}>{q}</span>
          </label>
        ))}
      </div>
      <div
        className="mt-3 rounded-[0.25rem] px-3 py-2 text-[0.6875rem] leading-relaxed"
        style={{ background: done === 6 ? 'rgba(12,166,120,0.08)' : 'rgba(247,212,76,0.07)', color: done === 6 ? '#0ca678' : '#f7d44c' }}
      >
        {done === 6 ? '清单已完成。仍建议对显著偏离原计划的操作隔夜再确认一次。' : `还有 ${6 - done} 项未确认。刻意摩擦用来对抗近因偏差与过度交易；未完成前不建议下单。`}
      </div>
      <p className="text-[0.625rem] leading-relaxed text-[#636878] mt-2">
        设计依据：普通投资者的「收益缺口」多来自业绩追逐与过度交易（Sirri & Tufano 1998；Barber & Odean 2000）；
        清单与冷却期是产品层面的对抗设计，并非监管要求，也可能带来提示疲劳，可自行决定是否使用。
      </p>
    </Panel>
  );
});
