import { memo } from 'react';

interface BadgeProps {
  label: string;
  type?: 'ok' | 'warn' | 'info' | 'default';
}

const STYLES: Record<string, string> = {
  ok: 'bg-[rgba(12,166,120,0.1)] text-[#0ca678]',
  warn: 'bg-[rgba(245,158,75,0.1)] text-[#f59e4b]',
  info: 'bg-[rgba(64,120,255,0.1)] text-[#4078ff]',
  default: 'bg-[rgba(255,255,255,0.04)] text-[#636878]',
};

export const Badge = memo(function Badge({ label, type = 'default' }: BadgeProps) {
  return (
    <span className={`text-[0.625rem] px-1.5 py-0.5 rounded font-medium ${STYLES[type]}`}>
      {label}
    </span>
  );
});
