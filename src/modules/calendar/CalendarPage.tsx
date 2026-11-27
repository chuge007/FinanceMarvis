/**
 * 事件日历：回答「今天有什么事件会改变体制」。
 *
 * 只展示有 actual/forecast/previous 的真实事件；WSCN 只覆盖未来 1-2 个月，
 * 官方源与预排项必须显式标注，不能把预排当实际值。
 */
import { memo } from 'react';
import { useCalendar } from '../../core/data/hooks';

type CalendarEvent = {
  publicDate: string;
  country: string;
  title: string;
  importance: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string;
};

function importanceLabel(n: number) {
  return n >= 4 ? { text: '极高', color: '#e5484d' } : n === 3 ? { text: '高', color: '#f5a524' } : n === 2 ? { text: '中', color: '#4078ff' } : { text: '低', color: '#636878' };
}

export const CalendarPage = memo(function CalendarPage() {
  const { calendar } = useCalendar();
  const events: CalendarEvent[] = calendar?.events ?? [];

  const groups = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const day = String(e.publicDate).slice(0, 10);
    (acc[day] ??= []).push(e);
    return acc;
  }, {});
  const days = Object.keys(groups).sort();

  return (
    <div className="space-y-3 p-3">
      <div>
        <h2 className="text-[1.0625rem] font-bold text-[#d8dce6]">事件日历 · 今天有什么会改变体制</h2>
        <p className="mt-1 text-[0.8125rem] text-[#636878]">
          华尔街见闻公开日历，覆盖未来 1-2 个月。actual 为空表示尚未发布，不是 0。
        </p>
      </div>

      {!calendar?.available && (
        <div className="rounded border-l-2 border-[#f5a524] bg-[#f5a524]/5 px-3 py-2 text-[0.8125rem] text-[#f5a524]">
          {calendar?.reason ?? '日历数据未就绪（WSCN 需出海代理）'}
        </div>
      )}

      {days.length === 0 ? (
        <section className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-6 text-center text-[0.8125rem] text-[#4d5364]">
          暂无未来 14 天事件，或接口不可达
        </section>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <section key={day} className="rounded-[5px] border border-[#1a1d26] bg-[#0f1118] p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[0.9375rem] font-semibold text-[#d8dce6]">{day}</h3>
                <span className="text-[0.75rem] text-[#4d5364]">{groups[day].length} 项</span>
              </div>
              <div className="space-y-1">
                {groups[day].map((e, i) => {
                  const imp = importanceLabel(e.importance);
                  return (
                    <div key={i} className="flex flex-wrap items-start gap-2 border-b border-[#151823] py-1.5 last:border-0">
                      <span className="w-[3rem] shrink-0 text-[0.75rem]" style={{ color: imp.color }}>{imp.text}</span>
                      <span className="w-[3rem] shrink-0 font-mono text-[0.75rem] text-[#636878]">{e.country}</span>
                      <span className="min-w-[12rem] flex-1 text-[0.8125rem] text-[#d8dce6]">{e.title}</span>
                      <span className="font-mono text-[0.8125rem] text-[#b0b5c0]">
                        实际 {e.actual ?? '—'} · 预期 {e.forecast ?? '—'} · 前值 {e.previous ?? '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
});
