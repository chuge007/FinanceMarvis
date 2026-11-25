import { memo } from 'react';
import type { CalendarEvent } from '../../../core/analysis/calendar';

interface Props {
  events: CalendarEvent[];
}

/**
 * 近期事件条：只列可确定性推导的日期（期权到期、期货交割、月末季末再平衡）。
 * 悬停看影响说明；两天内的事件用告警色，提醒「今天别按常态理解波动」。
 */
export const EventCalendar = memo(function EventCalendar({ events }: Props) {
  if (!events.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[0.3125rem] border border-[#1a1d26] bg-[#0f1118] px-3 py-1.5">
      <span className="shrink-0 text-[0.6563rem] text-[#8a8f9d]">近期事件</span>
      {events.map((event) => {
        const hot = event.daysAway <= 2;
        return (
          <span
            key={`${event.date}-${event.kind}`}
            title={event.detail}
            className="flex cursor-default items-center gap-1 rounded border px-1.5 py-0.5 text-[0.5625rem] transition-colors"
            style={{
              borderColor: hot ? 'rgba(245,158,75,0.45)' : '#1a1d26',
              color: hot ? '#f59e4b' : '#8a8f9d',
              background: hot ? 'rgba(245,158,75,0.08)' : 'transparent',
            }}
          >
            <span className="font-mono tabular-nums">{event.date.slice(5)}</span>
            <span>{event.label}</span>
            <span className="text-[#4d5364]">{event.daysAway === 0 ? '今天' : `+${event.daysAway}天`}</span>
          </span>
        );
      })}
      <span className="ml-auto shrink-0 text-[0.5313rem] text-[#3a4050]">
        FOMC 取美联储官网日程；CPI 等发布日暂无可信来源，未收录
      </span>
    </div>
  );
});
