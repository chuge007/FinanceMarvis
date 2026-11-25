import { memo } from 'react';
import { SourceBadge } from '../../../shared/components/SourceBadge';
import { Panel } from '../../../shared/components/Panel';
import { todayKey } from '../../../shared/utils/localStore';

interface EventItem {
  date: string;
  days: number;
  name: string;
  why: string;
  action: string;
}

function thirdFriday(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const firstFri = 1 + ((5 - first.getDay() + 7) % 7);
  return new Date(year, month, firstFri + 14);
}

/** 只用可推算的公开规则生成日期；FOMC/CPI/非农等一律不编造具体日期。 */
function buildEvents(): EventItem[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const horizon = 75;
  const out = new Map<string, EventItem>();

  const push = (d: Date, name: string, why: string, action: string) => {
    const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    if (days < 0 || days > horizon) return;
    const key = todayKey(d);
    const prev = out.get(key);
    if (prev) {
      prev.name += ` ／ ${name}`;
    } else {
      out.set(key, { date: key, days, name, why, action });
    }
  };

  for (let m = 0; m <= 3; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const y = base.getFullYear();
    const mo = base.getMonth();
    const tf = thirdFriday(y, mo);
    const quarterly = [2, 5, 8, 11].includes(mo);
    push(
      tf,
      quarterly ? '季度期权集中到期（四巫日）' : '月度期权到期',
      '衍生品集中到期时，对冲盘调仓可能放大日内波动；这是交易结构效应，不是基本面变化。',
      '事件前 1~2 个交易日减少新增敞口，事件后等方向确认再恢复节奏。',
    );
    if (quarterly) {
      const last = new Date(y, mo + 1, 0);
      push(last, '季末资金面与考核窗口', '季末资金面、机构考核与再平衡需求集中，短端利率与成交常出现异动。', '把再平衡提前安排好，不在季末最后一天临时追单。');
    }
    const deadlines: Record<number, { day: number; name: string }> = {
      0: { day: 31, name: '年报业绩预告披露窗口（1月底）' },
      3: { day: 30, name: '年报 + 一季报披露截止（4月底）' },
      7: { day: 31, name: '中报披露截止（8月底）' },
      9: { day: 31, name: '三季报披露截止（10月底）' },
    };
    const dl = deadlines[mo];
    if (dl) {
      push(new Date(y, mo, dl.day), dl.name, '业绩集中披露期，个股波动与预期修正更密集，指数层面的节奏容易被个股噪声掩盖。', '财报窗口前检查持仓集中度与止损是否可执行，不因单条业绩新闻临时改计划。');
    }
  }

  return Array.from(out.values()).sort((a, b) => a.days - b.days);
}

const OFFICIAL = [
  { name: 'FOMC 议息会议', note: '每年约 8 次，日期在确认前为暂定，且可能调整。' },
  { name: '美国 CPI / 非农就业', note: 'BLS 按年度日程发布，月度节奏大致稳定但具体日期须查官方日历。' },
  { name: '美国 GDP / PCE', note: 'BEA 发布日程，含初值与修订值，修订会改变「事后解读」。' },
  { name: '中国政策与披露窗口', note: '两会、中央经济工作会议、交易所披露规则逐年微调，以官方公告为准。' },
  { name: '休市与到期日调整', note: '遇节假日顺延/提前，规则推算日不等于实际交易日。' },
];

export const EventCalendar = memo(function EventCalendar() {
  const events = buildEvents();
  return (
    <Panel title="事件节奏日历" hint="未来 75 天 · 只列规则可推算的窗口" extra={<SourceBadge kind="rule" text="规则推算 · 非官方日历" />}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {events.length === 0 && <p className="text-[0.6875rem] text-[#636878]">近期无可推算的固定窗口。</p>}
          {events.map((e) => {
            const near = e.days <= 7;
            return (
              <div
                key={e.date}
                className="border rounded-[0.25rem] px-3 py-2"
                style={{ borderColor: near ? '#f7d44c66' : '#1a1d26', background: near ? 'rgba(247,212,76,0.05)' : 'rgba(255,255,255,0.015)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.75rem] text-[#d8dce6]">{e.name}</span>
                  <span className="text-[0.625rem] whitespace-nowrap" style={{ color: near ? '#f7d44c' : '#636878' }}>
                    {e.date} · {e.days === 0 ? '今天' : `${e.days} 天后`}
                  </span>
                </div>
                <p className="text-[0.625rem] leading-relaxed text-[#b0b5c0] mt-1.5">为什么影响节奏：{e.why}</p>
                <p className="text-[0.625rem] leading-relaxed mt-1" style={{ color: '#20c4d8' }}>建议：{e.action}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="border border-[#1a1d26] rounded-[0.25rem] p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[0.75rem] font-bold text-[#d8dce6]">必须由官方日历确认</span>
              <SourceBadge kind="official" />
            </div>
            <ul className="space-y-1.5">
              {OFFICIAL.map((o) => (
                <li key={o.name} className="text-[0.625rem] leading-relaxed">
                  <span className="text-[#b0b5c0]">{o.name}：</span><span className="text-[#636878]">{o.note}</span>
                </li>
              ))}
            </ul>
            <p className="text-[0.625rem] text-[#636878] mt-2 border-t border-[#1a1d26] pt-2">
              每月例行节奏大致为「上旬非农、中旬 CPI、月末 PMI」，但本工具不编造具体日期，请在官方日历确认后再安排。
            </p>
          </div>
          <p className="text-[0.625rem] leading-relaxed text-[#636878]">
            风险提示：日历效应（如「春季躁动」「持股过节」）只是历史统计描述，会失效；政策与突发消息可以在任何月份出现。
            事件窗口的正确用法是「提前安排、事后确认」，不是按日期押方向。
          </p>
        </div>
      </div>
    </Panel>
  );
});
