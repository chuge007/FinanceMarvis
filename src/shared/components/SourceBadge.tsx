import { memo } from 'react';

export type SourceKind = 'real' | 'model' | 'demo' | 'missing' | 'rule' | 'official';

const STYLE: Record<SourceKind, { label: string; color: string; bg: string; title: string }> = {
  real: { label: '真实接口', color: '#0ca678', bg: 'rgba(12,166,120,0.10)', title: '来自公开上游接口的历史/实时序列' },
  model: { label: '模型估算', color: '#f59e4b', bg: 'rgba(245,158,75,0.10)', title: '前端按规则或线性映射推算，不是上游原始数据' },
  demo: { label: '演示常量', color: '#9b6efb', bg: 'rgba(155,110,251,0.10)', title: '写死的示例数据，不可用于实盘决策' },
  missing: { label: '数据不可用', color: '#636878', bg: 'rgba(99,104,120,0.10)', title: '上游未返回可用序列，引擎不编造数值' },
  rule: { label: '规则推算', color: '#f7d44c', bg: 'rgba(247,212,76,0.10)', title: '按公开日历规则推算，非官方发布日程' },
  official: { label: '待官方确认', color: '#4078ff', bg: 'rgba(64,120,255,0.10)', title: '具体日期每年由官方发布，本工具不编造' },
};

export const SourceBadge = memo(function SourceBadge({ kind, text }: { kind: SourceKind; text?: string }) {
  const s = STYLE[kind];
  return (
    <span
      title={s.title}
      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}33` }}
    >
      {text ?? s.label}
    </span>
  );
});
