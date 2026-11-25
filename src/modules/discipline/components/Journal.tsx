import { memo, useState } from 'react';
import type { FormEvent } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { readJSON, writeJSON, removeKey, todayKey } from '../../../shared/utils/localStore';
import type { LastRegimeState } from '../../rhythm/components/RegimeCard';

interface Entry {
  id: string;
  date: string;
  tone: string;
  thesis: string;
  basis: string;
  plan: string;
  actual: string;
  followed: boolean;
  outcome: string;
  note: string;
  /** 决策当时的市场体制与关键分位快照，自动写入，不可事后编造。 */
  regime?: LastRegimeState | null;
}

type Draft = Omit<Entry, 'id'>;
const KEY = 'marvis.journal.v1';
const BASES = ['领先', '同步', '滞后', '情绪', '事件'];
const OUTCOMES = ['未平仓', '盈利', '亏损', '持平'];

function draft(tone: string, regime: LastRegimeState | null): Draft {
  return {
    date: todayKey(), tone, thesis: '', basis: '同步', plan: '', actual: '',
    followed: true, outcome: '未平仓', note: '', regime,
  };
}

const fieldCls = 'w-full bg-[#090b0f] border border-[#1a1d26] rounded px-2 py-1.5 text-[0.6875rem] text-[#d8dce6] outline-none focus:border-[#4078ff]';

export const Journal = memo(function Journal({ tone, regime }: { tone: string; regime: LastRegimeState | null }) {
  const [entries, setEntries] = useState<Entry[]>(() => readJSON<Entry[]>(KEY, []));
  const [form, setForm] = useState<Draft>(() => draft(tone, regime));

  const save = (next: Entry[]) => {
    setEntries(next);
    writeJSON(KEY, next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.thesis.trim() && !form.plan.trim() && !form.actual.trim()) return;
    const entry: Entry = { ...form, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    save([entry, ...entries]);
    setForm(draft(tone, regime));
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marvis-journal-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (!window.confirm('确定清空全部复盘记录？此操作不可撤销。建议先导出备份。')) return;
    removeKey(KEY);
    setEntries([]);
  };

  const total = entries.length;
  const followed = entries.filter((x) => x.followed).length;
  const lag = entries.filter((x) => x.basis === '滞后').length;
  const lucky = entries.filter((x) => !x.followed && x.outcome === '盈利').length;
  const unlucky = entries.filter((x) => x.followed && x.outcome === '亏损').length;
  const inDefensive = entries.filter((x) => x.regime && ['防守', '观望'].includes(x.regime.tone)).length;

  return (
    <Panel
      title="决策与复盘日志"
      hint="记录「当时怎么想」，而不是只记盈亏"
      extra={
        <div className="flex gap-1">
          <button onClick={exportJSON} className="text-[0.625rem] px-2 py-1 rounded border border-[#1a1d26] text-[#b0b5c0] hover:bg-[rgba(255,255,255,0.04)]">导出</button>
          <button onClick={clearAll} className="text-[0.625rem] px-2 py-1 rounded border border-[#1a1d26] text-[#f04452] hover:bg-[rgba(240,68,82,0.06)]">清空</button>
        </div>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-6 gap-2">
        <label className="block"><span className="block text-[0.625rem] text-[#636878] mb-1">日期</span>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldCls} /></label>
        <label className="block"><span className="block text-[0.625rem] text-[#636878] mb-1">当时市场状态</span>
          <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className={fieldCls} /></label>
        <label className="block"><span className="block text-[0.625rem] text-[#636878] mb-1">依据类型</span>
          <select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })} className={fieldCls}>
            {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select></label>
        <label className="block"><span className="block text-[0.625rem] text-[#636878] mb-1">结果</span>
          <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} className={fieldCls}>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select></label>
        <label className="block col-span-2"><span className="block text-[0.625rem] text-[#636878] mb-1">是否按规则执行</span>
          <select value={form.followed ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, followed: e.target.value === 'yes' })} className={fieldCls}>
            <option value="yes">是 · 按计划</option><option value="no">否 · 临时起意</option>
          </select></label>

        <label className="block col-span-3"><span className="block text-[0.625rem] text-[#636878] mb-1">我的判断 / 依据</span>
          <input value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} placeholder="例如：信用利差走阔，风险偏好转弱" className={fieldCls} /></label>
        <label className="block col-span-3"><span className="block text-[0.625rem] text-[#636878] mb-1">计划动作</span>
          <input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="例如：不加仓，等 VIX 分位回落" className={fieldCls} /></label>
        <label className="block col-span-4"><span className="block text-[0.625rem] text-[#636878] mb-1">实际动作 / 复盘备注</span>
          <input value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} placeholder="实际做了什么、下次如何改进" className={fieldCls} /></label>
        <label className="block col-span-2"><span className="block text-[0.625rem] text-[#636878] mb-1">备注</span>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={fieldCls} /></label>

        <div className="col-span-6 flex justify-end">
          <button type="submit" className="text-[0.6875rem] px-4 py-1.5 rounded bg-[#4078ff] text-white hover:brightness-110">保存记录</button>
        </div>
      </form>

      <div className="grid grid-cols-6 gap-2 mt-3">
        {[
          { label: '总记录', value: `${total}`, color: '#d8dce6' },
          { label: '按规则执行率', value: total ? `${Math.round((followed / total) * 100)}%` : '—', color: '#0ca678' },
          { label: '依据滞后指标', value: `${lag} 次`, color: lag ? '#f59e4b' : '#d8dce6' },
          { label: '违规却盈利', value: `${lucky} 次`, color: lucky ? '#f04452' : '#d8dce6' },
          { label: '守规仍亏损', value: `${unlucky} 次`, color: '#d8dce6' },
          { label: '防守/观望态决策', value: `${inDefensive} 次`, color: '#9b6efb' },
        ].map((k) => (
          <div key={k.label} className="bg-[rgba(255,255,255,0.02)] border border-[#1a1d26] rounded px-3 py-2">
            <div className="text-[0.625rem] text-[#636878]">{k.label}</div>
            <div className="text-[0.875rem] font-semibold" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <p className="text-[0.625rem] leading-relaxed text-[#636878] mt-2">
        复盘看的是「是否按规则执行」，不是只看盈亏：违规却盈利最容易把运气误当成方法；守规仍亏损也不等于规则错了。
        依据「滞后指标」次数偏多，说明决策用错了时间尺度。数据只存本机浏览器，不上传；清空前请先导出备份。
      </p>

      {total > 0 && (
        <div className="mt-3 space-y-1.5 max-h-[16.25rem] overflow-y-auto pr-1">
          {entries.slice(0, 30).map((x) => (
            <div key={x.id} className="border border-[#1a1d26] rounded-[0.25rem] px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.625rem] text-[#636878] mb-1">
                  {x.date} · 状态 {x.tone || '—'} · 依据 {x.basis} · {x.followed ? '按规则' : '临时起意'} · {x.outcome}
                </div>
                <div className="text-[0.6875rem] text-[#b0b5c0] truncate">判断：{x.thesis || '—'}</div>
                <div className="text-[0.6875rem] text-[#636878] truncate">计划：{x.plan || '—'} ｜ 实际：{x.actual || '—'} {x.note && `｜ ${x.note}`}</div>
              </div>
              <button
                onClick={() => save(entries.filter((e) => e.id !== x.id))}
                className="text-[0.625rem] text-[#636878] hover:text-[#f04452] whitespace-nowrap"
              >删除</button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
});
