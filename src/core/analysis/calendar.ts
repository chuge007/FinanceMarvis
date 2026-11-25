/**
 * 事件日历：只收录「可以由规则确定性算出来」的日期。
 *
 * 为什么不内置 FOMC / CPI / 财报日历：
 *  - 那些日期由官方公告决定，会调整；凭记忆写死等于给用户假数据，
 *    本项目的基本原则是「没有就显示没有」，所以宁可先不做，也不编。
 *  - 而期权到期、期货交割、月末/季末再平衡是可以严格推导的，
 *    既不会过期，也不需要任何上游，属于「真实且可验证」的日历。
 *
 * 这些日子为什么重要：
 *  - 月度期权到期（每月第三个周五）：做市商对冲集中换手，波动常被放大；
 *  - 季度大到期（3/6/9/12 第三个周五）：四巫日，成交与波动最集中的一天；
 *  - 月末/季末：机构再平衡，尾盘资金流对指数有一次性冲击；
 *  - A 股股指期货交割（第三个周五）与 ETF 期权到期（第四个周三）：同样的对冲换手逻辑。
 */

export type EventKind =
  | 'opex'
  | 'quadWitching'
  | 'monthEnd'
  | 'quarterEnd'
  | 'cnFutures'
  | 'cnOption'
  | 'fomc';

export interface CalendarEvent {
  date: string;
  kind: EventKind;
  label: string;
  detail: string;
  /** 距今天几个自然日；0 = 今天。 */
  daysAway: number;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 当月第 n 个星期几（weekday: 0=周日 … 5=周五）。 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (nth - 1) * 7);
}

/** 当月最后一个工作日（周一至周五）。 */
function lastBizDayOfMonth(year: number, month: number): Date {
  const last = new Date(year, month + 1, 0);
  while (last.getDay() === 0 || last.getDay() === 6) {
    last.setDate(last.getDate() - 1);
  }
  return last;
}

function dayDiff(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * 生成 `from` 之后 horizon 天内的事件。
 * @param market US 或 CN，决定用哪一套交割规则
 */
export function buildCalendarEvents(
  market: 'US' | 'CN',
  from: Date = new Date(),
  horizon = 21,
): CalendarEvent[] {
  const today = startOfDay(from);
  const out: CalendarEvent[] = [];

  // 覆盖本月与未来两个月，足够覆盖 horizon
  for (let i = 0; i < 3; i++) {
    const cursor = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const thirdFriday = nthWeekdayOfMonth(year, month, 5, 3);
    const quarter = month === 2 || month === 5 || month === 8 || month === 11;

    if (market === 'US') {
      out.push({
        date: ymd(thirdFriday),
        kind: quarter ? 'quadWitching' : 'opex',
        label: quarter ? '季度大到期' : '月度期权到期',
        detail: quarter
          ? '四巫日：股指期货、股指期权、个股期权、个股期货同日到期，换手与波动通常最集中。'
          : '月度 OpEx：做市商对冲集中换手，尾盘波动常被放大，但不是方向信号。',
        daysAway: 0,
      });
    } else {
      out.push({
        date: ymd(thirdFriday),
        kind: 'cnFutures',
        label: '股指期货交割',
        detail: 'IF/IH/IC 当月合约交割，套保盘换月，尾盘权重股波动可能放大。',
        daysAway: 0,
      });
      out.push({
        date: ymd(nthWeekdayOfMonth(year, month, 3, 4)),
        kind: 'cnOption',
        label: 'ETF 期权到期',
        detail: '50ETF/300ETF 期权到期，做市商对冲换手，标的尾盘波动可能放大。',
        daysAway: 0,
      });
    }

    const monthEnd = lastBizDayOfMonth(year, month);
    out.push({
      date: ymd(monthEnd),
      kind: quarter ? 'quarterEnd' : 'monthEnd',
      label: quarter ? '季末再平衡' : '月末再平衡',
      detail: quarter
        ? '季末：养老金与目标日期基金按季调仓，尾盘资金流对指数有一次性冲击。'
        : '月末：被动资金按市值再平衡，尾盘成交常放大，与基本面无关。',
      daysAway: 0,
    });
  }

  return out
    .map((event) => ({ ...event, daysAway: dayDiff(today, new Date(`${event.date}T00:00:00`)) }))
    .filter((event) => event.daysAway >= 0 && event.daysAway <= horizon)
    .sort((a, b) => a.daysAway - b.daysAway);
}
