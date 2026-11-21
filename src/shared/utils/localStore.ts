/** 本机持久化：复盘日志、当日计划、上次市场状态。数据只存在用户浏览器，不上传。 */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 配额满：静默降级为「仅本次会话有效」
  }
}

export function removeKey(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

/** 本地时区的 YYYY-MM-DD（避免 toISOString 的 UTC 偏移跨日问题）。 */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
