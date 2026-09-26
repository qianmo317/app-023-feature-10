// 编辑历史用例 —— 覆盖「可连续后退/前进、上限丢最早、新改动清空重做栈、换曲目清空」
import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from '../src/lib/history';

/** 连续记录 1..n 个快照，返回最终历史 */
function pushN(n: number): History<number> {
  let h = createHistory<number>();
  for (let i = 1; i <= n; i++) h = pushHistory(h, i);
  return h;
}

describe('编辑历史：后退与前进', () => {
  it('新历史无可退、无可前进', () => {
    const h = createHistory<number>();
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(undoHistory(h, 0)[1]).toBeUndefined();
    expect(redoHistory(h, 0)[1]).toBeUndefined();
  });

  it('改动入栈后可逐步退回到最早，再逐步前进回最新', () => {
    let h = pushN(3); // past = [1,2,3]，当前 = 4
    const back: number[] = [];
    let cur = 4;
    for (let i = 0; i < 3; i++) {
      const [h2, prev] = undoHistory(h, cur);
      h = h2;
      cur = prev!;
      back.push(cur);
    }
    expect(back).toEqual([3, 2, 1]); // 连着退回若干步
    expect(undoHistory(h, cur)[1]).toBeUndefined(); // 退到底
    const fwd: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [h2, next] = redoHistory(h, cur);
      h = h2;
      cur = next!;
      fwd.push(cur);
    }
    expect(fwd).toEqual([2, 3, 4]); // 再往前走回去
    expect(redoHistory(h, cur)[1]).toBeUndefined();
  });

  it('后退途中发生新改动：重做栈清空，不能再前进', () => {
    let h = pushN(3); // 当前 4
    const [h2, prev] = undoHistory(h, 4);
    h = h2;
    expect(prev).toBe(3);
    h = pushHistory(h, 99); // 后退途中来了新改动
    expect(h.future).toHaveLength(0);
    expect(redoHistory(h, 3)[1]).toBeUndefined();
  });

  it(`历史上限 ${HISTORY_LIMIT} 步，满了丢掉最早的一步`, () => {
    const h = pushN(HISTORY_LIMIT + 5);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(6); // 最早的 1..5 已被丢掉
    // 一路退到底只能退 HISTORY_LIMIT 步
    let cur = HISTORY_LIMIT + 6;
    let hh = h;
    let steps = 0;
    for (;;) {
      const [h2, prev] = undoHistory(hh, cur);
      if (prev === undefined) break;
      hh = h2;
      cur = prev;
      steps += 1;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(cur).toBe(6);
  });

  it('换曲目/重新载入：重建空历史，不能接着别的谱退', () => {
    let h = pushN(5);
    h = createHistory<number>(); // 编辑器在 scoreId 变化时重建
    expect(undoHistory(h, 0)[1]).toBeUndefined();
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });
});
