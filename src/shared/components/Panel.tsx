import { memo } from 'react';
import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  badge?: string;
  hint?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const Panel = memo(function Panel({ title, badge, hint, extra, children, className = '' }: PanelProps) {
  return (
    <div className={`bg-[#0f1118] border border-[#1a1d26] rounded-[5px] ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1d26]">
        <h3 className="text-[14px] font-bold uppercase tracking-wider text-[#d8dce6]">
          {title}
          {hint && (
            <span className="ml-2 font-normal normal-case tracking-normal text-[11px] text-[#636878]">
              {hint}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-[12px] text-[#636878] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 rounded">
              {badge}
            </span>
          )}
          {extra}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
});
