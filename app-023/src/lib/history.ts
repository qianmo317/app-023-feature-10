// 编辑历史栈 —— 纯函数，与 computeEvents 同一约定：先纯函数再接状态，保证可测。
// past 栈顶 = 最近一步；future 栈顶 = 下一个可重做步。容量上限 HISTORY_LIMIT，满了丢最早一步。

export const HISTORY_LIMIT = 50;

export interface HistoryState<T> {
  past: T[];
  future: T[];
}

export function emptyHistory<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

/** 记入一步（改动前的快照）。新改动会清空重做栈；超过上限丢掉最早一步。 */
export function pushHistory<T>(h: HistoryState<T>, snapshot: T, limit = HISTORY_LIMIT): HistoryState<T> {
  return { past: [...h.past, snapshot].slice(-limit), future: [] };
}

/** 撤销一步：返回新栈与要恢复的快照；无可退时 restored = null、栈原样返回 */
export function undoHistory<T>(h: HistoryState<T>, current: T): { next: HistoryState<T>; restored: T | null } {
  if (h.past.length === 0) return { next: h, restored: null };
  return {
    next: { past: h.past.slice(0, -1), future: [current, ...h.future] },
    restored: h.past[h.past.length - 1],
  };
}

/** 重做一步：与撤销对称；无可重做时 restored = null、栈原样返回 */
export function redoHistory<T>(h: HistoryState<T>, current: T): { next: HistoryState<T>; restored: T | null } {
  if (h.future.length === 0) return { next: h, restored: null };
  return {
    next: { past: [...h.past, current], future: h.future.slice(1) },
    restored: h.future[0],
  };
}
