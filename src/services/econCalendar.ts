/**
 * 官方宏观日历：美联储 FOMC 决议日。
 *
 * 上游：federalreserve.gov/monetarypolicy/fomccalendars.htm（美联储官网，公开页面）。
 * 解析依据：每次会议的新闻稿链接形如 `/newsevents/pressreleases/monetary20260128a.htm`，
 * 文件名里的 8 位日期就是决议公布日，比解析「January / 27-28」这类月份+日区间更可靠
 * （跨月会议、日期调整都不会误判）。同一会议会同时出现 PDF / HTML / 实施说明多个链接，按日期去重。
 *
 * 为什么只有 FOMC：
 *  - BLS 的 CPI 发布日程页（/schedule/news_release/cpi.htm）对自动请求返回 403（Akamai 拦截），
 *    拿不到就不做，绝不用记忆里的日期凑数；
 *  - 财报日历同理，没有稳定免费源。
 * 因此界面上的事件条只承诺「可确定的交割日 + FOMC 官方决议日」，其余留白。
 */
import { reportSource } from '../shared/utils/sourceHealth';
import type { CalendarEvent } from '../core/analysis/calendar';

const TTL = 6 * 60 * 60_000;
const PATH = '/monetarypolicy/fomccalendars.htm';

let cache: { ts: number; dates: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

function base(): string {
  return import.meta.env.VITE_UPSTREAM === 'direct'
    ? 'https://www.federalreserve.gov'
    : '/fed';
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * 解析「年份小节 → fomc-meeting__month + fomc-meeting__date」结构。
 *
 * 不能用新闻稿链接（monetaryYYYYMMDDa.htm）当唯一来源：未召开的会议还没有新闻稿，
 * 只能拿到已开会日期，等于永远看不到下一场。这里改为解析排期表本身，
 * 日期区间「26-27」取最后一天（决议日）。
 */
function parseMeetings(html: string): string[] {
  const out: string[] = [];
  const headers = [...html.matchAll(/(\d{4})\s*FOMC\s+Meetings/gi)];
  headers.forEach((header, index) => {
    const year = Number(header[1]);
    const start = header.index ?? 0;
    const end = index + 1 < headers.length ? (headers[index + 1].index ?? html.length) : html.length;
    const chunk = html.slice(start, end);
    const re =
      /fomc-meeting__month[^>]*>\s*<strong>([A-Za-z]+)<\/strong>\s*<\/div>\s*<div class="fomc-meeting__date[^"]*">\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\*?\s*<\/div>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(chunk)) !== null) {
      const month = MONTHS[match[1].toLowerCase()];
      const day = Number(match[3] ?? match[2]);
      if (!month || !day || day < 1 || day > 31) continue;
      out.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  });
  return [...new Set(out)].sort();
}

/** 拉取并解析 FOMC 决议日（升序、去重）；失败返回空数组并登记数据源健康。 */
export async function fetchFomcDates(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.ts < TTL) return cache.dates;
  if (inflight) return inflight;

  const task = (async (): Promise<string[]> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const resp = await fetch(`${base()}${PATH}`, {
        headers: { accept: 'text/html' },
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        reportSource('fed', false, `美联储官网返回 HTTP ${resp.status}`);
        return [];
      }
      const html = await resp.text();
      const dates = parseMeetings(html);
      if (!dates.length) {
        reportSource('fed', false, '页面结构可能已改版，未能解析出日期');
        return [];
      }
      reportSource('fed', true);
      return dates;
    } catch (err) {
      reportSource('fed', false, err instanceof Error ? err.message : '美联储官网不可达');
      return [];
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight = task;
  try {
    const dates = await task;
    cache = { ts: Date.now(), dates };
    return dates;
  } finally {
    inflight = null;
  }
}

/** 把 FOMC 日期转成事件条需要的结构，只保留 horizon 天内未发生的。 */
export function fomcToEvents(dates: string[], from: Date = new Date(), horizon = 45): CalendarEvent[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return dates
    .map((date) => {
      const d = new Date(`${date}T00:00:00`);
      const daysAway = Math.round((d.getTime() - today.getTime()) / 86_400_000);
      return {
        date,
        kind: 'fomc' as const,
        label: 'FOMC 决议',
        detail:
          '美联储议息会议决议公布（美东 14:00，北京时间次日凌晨）。会前波动常收敛，会后方向一次性释放；不要在决议前后临时放大仓位。',
        daysAway,
      };
    })
    .filter((event) => event.daysAway >= 0 && event.daysAway <= horizon)
    .sort((a, b) => a.daysAway - b.daysAway);
}
