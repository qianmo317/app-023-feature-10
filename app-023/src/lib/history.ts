// 编辑历史 —— 过去/未来双栈快照：可连续后退若干步，也可再前进回去。
// 纯数据操作，不依赖 React，便于单测；编辑器持有 Score 快照。

/** 历史上限（步）：满则丢掉最早的一步 */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  /** 底→顶：越早的快照越靠前，栈顶 = 最近一次改动前的状态 */
  past: T[];
  /** 栈顶 = 下一个可重做的快照 */
  future: T[];
}

export function createHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** 改动成功后记录「改动前」快照；任何新改动都会清空重做栈 */
export function pushHistory<T>(h: History<T>, prev: T): History<T> {
  return { past: [...h.past.slice(-(HISTORY_LIMIT - 1)), prev], future: [] };
}

/** 回退一步：返回 [新历史, 上一快照]；无可退时返回 [原历史, undefined] */
export function undoHistory<T>(h: History<T>, current: T): [History<T>, T | undefined] {
  if (h.past.length === 0) return [h, undefined];
  const prev = h.past[h.past.length - 1];
  return [{ past: h.past.slice(0, -1), future: [...h.future, current] }, prev];
}

/** 前进一步：返回 [新历史, 下一快照]；无可前进时返回 [原历史, undefined] */
export function redoHistory<T>(h: History<T>, current: T): [History<T>, T | undefined] {
  if (h.future.length === 0) return [h, undefined];
  const next = h.future[h.future.length - 1];
  return [{ past: [...h.past, current], future: h.future.slice(0, -1) }, next];
}
