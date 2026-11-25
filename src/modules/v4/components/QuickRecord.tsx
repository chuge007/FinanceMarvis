import { memo, useEffect, useState } from 'react';
import { readJSON, todayKey, writeJSON } from '../../../shared/utils/localStore';
import type { LastRegimeState } from '../../rhythm/components/RegimeCard';

export interface JournalEntry {
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
  regime?: LastRegimeState | null;
}

const KEY = 'marvis.journal.v1';

const fieldCls =
  'w-full rounded border border-[#1a1d26] bg-[#090b0f] px-2 py-1.5 text-[0.6875rem] text-[#d8dce6] outline-none focus:border-[#4078ff]';

interface Props {
  open: boolean;
  title: string;
  thesis: string;
  plan: string;
  tone: string;
  regime: LastRegimeState | null;
  onClose: () => void;
  onSaved: () => void;
}

export const QuickRecord = memo(function QuickRecord({
  open,
  title,
  thesis,
  plan,
  tone,
  regime,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState({ thesis, plan, actual: '', followed: true });

  useEffect(() => {
    if (open) setForm({ thesis, plan, actual: '', followed: true });
  }, [open, thesis, plan]);

  if (!open) return null;

  const save = () => {
    if (!form.thesis.trim() && !form.plan.trim()) return;
    const entry: JournalEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: todayKey(),
      tone,
      thesis: form.thesis.trim(),
      basis: '同步',
      plan: form.plan.trim(),
      actual: form.actual.trim(),
      followed: form.followed,
      outcome: '未平仓',
      note: '',
      regime,
    };
    const existing = readJSON<JournalEntry[]>(KEY, []);
    writeJSON(KEY, [entry, ...existing]);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[32.5rem] rounded-[0.375rem] border border-[#2a3040] bg-[#0f1118] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1a1d26] px-4 py-3">
          <div>
            <h3 className="text-[0.8125rem] font-bold text-[#d8dce6]">记录今日决定</h3>
            <p className="mt-0.5 text-[0.5938rem] text-[#636878]">{title}</p>
          </div>
          <button onClick={onClose} className="text-[1rem] leading-none text-[#636878] hover:text-[#d8dce6]">
            ×
          </button>
        </div>

        <div className="space-y-2.5 p-4">
          <label className="block">
            <span className="mb-1 block text-[0.625rem] text-[#636878]">我的判断 / 依据</span>
            <input value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.625rem] text-[#636878]">计划动作（不写买卖点，写规则）</span>
            <input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className={fieldCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.625rem] text-[#636878]">实际动作 / 备注</span>
            <input
              value={form.actual}
              onChange={(e) => setForm({ ...form, actual: e.target.value })}
              placeholder="例如：今天没有操作，维持目标仓位"
              className={fieldCls}
            />
          </label>
          <label className="flex items-center gap-2 text-[0.6563rem] text-[#b0b5c0]">
            <input
              type="checkbox"
              checked={form.followed}
              onChange={(e) => setForm({ ...form, followed: e.target.checked })}
            />
            本次是否按既定规则执行
          </label>
          <div className="text-[0.5625rem] leading-relaxed text-[#4d5364]">
            保存时会自动带上当前的体制、风险温度与关键分位快照，事后可回看“当时是什么环境”。记录只存本机。
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#1a1d26] px-4 py-3">
          <button onClick={onClose} className="rounded border border-[#1a1d26] px-3 py-1.5 text-[0.6563rem] text-[#8a8f9d] hover:text-[#d8dce6]">
            取消
          </button>
          <button onClick={save} className="rounded bg-[#4078ff] px-3.5 py-1.5 text-[0.6563rem] text-white hover:brightness-110">
            保存到复盘
          </button>
        </div>
      </div>
    </div>
  );
});
