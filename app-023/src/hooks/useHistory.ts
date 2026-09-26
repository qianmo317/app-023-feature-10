// 编辑历史 hook：纯栈逻辑在 lib/history，这里只接 React 状态。
// ref 镜像保证事件回调（键盘/按钮）里读到最新栈，updater 保持纯函数（StrictMode 安全）。
import { useCallback, useRef, useState } from 'react';
import { emptyHistory, pushHistory, redoHistory, undoHistory, type HistoryState } from '../lib/history';

export function useHistory<T>() {
  const [hist, setHist] = useState<HistoryState<T>>(() => emptyHistory<T>());
  const ref = useRef(hist);
  ref.current = hist;

  /** 改动前记入当前快照（同时清空重做栈） */
  const push = useCallback((snapshot: T) => setHist((h) => pushHistory(h, snapshot)), []);

  /** 清空全部历史（换曲目/重新载入时调用） */
  const reset = useCallback(() => setHist(emptyHistory<T>()), []);

  /** 撤销一步：返回要恢复的快照；无可退返回 null */
  const undo = useCallback((current: T): T | null => {
    const { next, restored } = undoHistory(ref.current, current);
    if (restored === null) return null;
    setHist(next);
    return restored;
  }, []);

  /** 重做一步：返回要恢复的快照；无可重做返回 null */
  const redo = useCallback((current: T): T | null => {
    const { next, restored } = redoHistory(ref.current, current);
    if (restored === null) return null;
    setHist(next);
    return restored;
  }, []);

  return {
    push,
    reset,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    undoCount: hist.past.length,
    redoCount: hist.future.length,
  };
}
