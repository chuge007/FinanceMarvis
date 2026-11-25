import { memo } from 'react';
import type { ActionItem } from '../../../core/analysis/actions';

const KIND_META: Record<string, { label: string; color: string }> = {
  check: { label: '检查', color: '#f59e4b' },
  watch: { label: '留意', color: '#20c4d8' },
  data: { label: '数据', color: '#9b6efb' },
  record: { label: '记录', color: '#0ca678' },
};

interface Props {
  actions: ActionItem[];
  onLocate: (action: ActionItem) => void;
  onRecord: (action: ActionItem) => void;
}

export const ActionList = memo(function ActionList({ actions, onLocate, onRecord }: Props) {
  return (
    <div className="rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[0.75rem] font-bold text-[#d8dce6]">
          今日动作
          <span className="ml-2 text-[0.625rem] font-normal text-[#636878]">{actions.length} 项</span>
        </h3>
        <span className="text-[0.5625rem] text-[#4d5364]">只给检查/留意/记录，不给买卖点</span>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {actions.map((a) => {
          const meta = KIND_META[a.kind] ?? KIND_META.record;
          return (
            <div
              key={a.id}
              className="rounded border border-[#1a1d26] bg-[rgba(255,255,255,0.015)] p-2.5"
              style={{ borderLeft: `3px solid ${meta.color}` }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded px-1 py-0.5 text-[0.5625rem]" style={{ color: meta.color, background: `${meta.color}18` }}>
                  {meta.label}
                </span>
                <span className="text-[0.5313rem] text-[#4d5364]">{a.trigger}</span>
              </div>
              <div className="mt-1.5 text-[0.7188rem] font-medium leading-snug text-[#d8dce6]">{a.title}</div>
              <div className="mt-1 text-[0.5938rem] leading-relaxed text-[#636878]">{a.detail}</div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => onLocate(a)}
                  className="rounded border border-[#1a1d26] px-2 py-1 text-[0.5938rem] text-[#9aa0ae] hover:border-[#2a3040] hover:text-[#d8dce6]"
                >
                  定位数据
                </button>
                <button
                  onClick={() => onRecord(a)}
                  className="rounded bg-[#4078ff] px-2.5 py-1 text-[0.5938rem] text-white hover:brightness-110"
                >
                  {a.kind === 'record' ? '记录无事' : '记录决定'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
