/**
 * 美股市场时段检测
 * 常规交易时段: 美东 9:30–16:00 (Mon–Fri)
 * 转换为 UTC: 取决于夏令时/冬令时
 *   EDT (3月第2周日–11月第1周日): UTC-4 → 13:30–20:00 UTC
 *   EST (其余时间): UTC-5 → 14:30–21:00 UTC
 */

interface MarketState {
  isOpen: boolean;
  status: 'open' | 'pre-market' | 'post-market' | 'closed' | 'weekend';
  label: string;
  opensIn?: string; // 距离下次开盘的描述
}

export function getMarketState(): MarketState {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMinute;

  // 判断夏令时 (简单规则：3月第2周日到11月第1周日)
  const year = now.getUTCFullYear();
  const isDST = isUSDaylightSaving(now);

  // EDT: open 13:30 UTC (9:30 EDT), close 20:00 UTC (16:00 EDT)
  // EST: open 14:30 UTC (9:30 EST), close 21:00 UTC (16:00 EST)
  const openUTC = isDST ? 13 * 60 + 30 : 14 * 60 + 30; // 9:30 ET in UTC
  const closeUTC = isDST ? 20 * 60 : 21 * 60;           // 16:00 ET in UTC
  const preOpen = openUTC - 60;  // 1h before
  const postClose = closeUTC + 60; // 1h after

  if (day === 0 || day === 6) {
    return { isOpen: false, status: 'weekend', label: '周末休市' };
  }

  if (utcMinutes >= openUTC && utcMinutes < closeUTC) {
    return { isOpen: true, status: 'open', label: '交易中' };
  }
  if (utcMinutes >= preOpen && utcMinutes < openUTC) {
    return { isOpen: false, status: 'pre-market', label: '盘前交易', opensIn: formatMinutes(openUTC - utcMinutes) };
  }
  if (utcMinutes >= closeUTC && utcMinutes < postClose) {
    return { isOpen: false, status: 'post-market', label: '盘后交易' };
  }

  // 计算到下次开盘的剩余时间
  let nextOpenMinutes: number;
  if (utcMinutes < preOpen) {
    // 今天凌晨到盘前
    nextOpenMinutes = preOpen - utcMinutes;
  } else if (day === 5) {
    // 周五盘后 → 下周一
    nextOpenMinutes = (2 * 24 * 60) + preOpen - utcMinutes;
  } else {
    // 深夜 → 明天
    nextOpenMinutes = (24 * 60) - utcMinutes + preOpen;
  }
  return {
    isOpen: false,
    status: 'closed',
    label: '休市',
    opensIn: formatMinutes(nextOpenMinutes),
  };
}

function isUSDaylightSaving(date: Date): boolean {
  const year = date.getUTCFullYear();
  // 3月第2个周日 02:00 → EDT
  const mar = new Date(Date.UTC(year, 2, 1));
  const marSecondSun = 14 - mar.getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, marSecondSun, 7)); // 07:00 UTC

  // 11月第1个周日 02:00 → EST
  const nov = new Date(Date.UTC(year, 10, 1));
  const novFirstSun = 7 - nov.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSun, 6)); // 06:00 UTC

  return date >= dstStart && date < dstEnd;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '即将开盘';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分钟`;
  if (h > 0) return `${h}小时`;
  return `${m}分钟`;
}
