/**
 * 上游熔断器：连续失败达到阈值后进入冷却，冷却期内直接跳过该上游。
 *
 * 解决的问题：原来每条指标各自等 10s 超时再串行兜底，10 条叠加就是十几秒，
 * 而绝大多数失败是「这个源整体不可达」而不是「某一条数据慢」。
 * 熔断之后，第 3 条指标开始就直接走兜底，不再重复交学费。
 *
 * 语义：进程内存态，不落盘。重启视为恢复探测。
 */

const FAIL_THRESHOLD = 2;
const COOLDOWN_MS = 5 * 60_000;

interface BreakerState {
  fails: number;
  openUntil: number;
  lastError: string;
}

const states = new Map<string, BreakerState>();

/** 该上游当前是否允许发起请求。 */
export function canRequest(id: string): boolean {
  const state = states.get(id);
  if (!state) return true;
  if (state.openUntil === 0) return true;
  if (Date.now() >= state.openUntil) {
    // 冷却结束，重新给一次机会
    states.set(id, { ...state, openUntil: 0, fails: 0 });
    return true;
  }
  return false;
}

export function recordSuccess(id: string): void {
  states.set(id, { fails: 0, openUntil: 0, lastError: '' });
}

export function recordFailure(id: string, error = ''): void {
  const prev = states.get(id) ?? { fails: 0, openUntil: 0, lastError: '' };
  const fails = prev.fails + 1;
  states.set(id, {
    fails,
    openUntil: fails >= FAIL_THRESHOLD ? Date.now() + COOLDOWN_MS : 0,
    lastError: error,
  });
}

/** 供 UI 展示：哪些上游正在冷却。 */
export function breakerSnapshot(): { id: string; open: boolean; retryInMs: number; lastError: string }[] {
  return [...states.entries()].map(([id, s]) => ({
    id,
    open: s.openUntil > Date.now(),
    retryInMs: Math.max(0, s.openUntil - Date.now()),
    lastError: s.lastError,
  }));
}
