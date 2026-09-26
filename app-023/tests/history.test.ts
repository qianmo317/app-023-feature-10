// 编辑历史栈用例 —— 撤销/重做/上限丢最早/新改动清空重做栈（编辑器「可来回走的历史」的纯逻辑层）
import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, emptyHistory, pushHistory, redoHistory, undoHistory } from '../src/lib/history';

describe('入栈与撤销', () => {
  it('记入一步后可撤销，撤销栈顶是最近一步', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    expect(h.past).toEqual([1, 2]);
    const u = undoHistory(h, 3); // 当前值 3，要退到 2
    expect(u.restored).toBe(2);
    expect(u.next.past).toEqual([1]);
    expect(u.next.future).toEqual([3]); // 当前值进入重做栈
  });

  it('可连着退回到若干步之前', () => {
    let h = emptyHistory<number>();
    for (const v of [1, 2, 3]) h = pushHistory(h, v);
    let cur = 4;
    const seq: number[] = [];
    for (let i = 0; i < 3; i++) {
      const u = undoHistory(h, cur);
      expect(u.restored).not.toBeNull();
      cur = u.restored!;
      seq.push(cur);
      h = u.next;
    }
    expect(seq).toEqual([3, 2, 1]); // 后进先出，逐步回到最早
    expect(h.past).toEqual([]);
    expect(undoHistory(h, cur).restored).toBeNull(); // 退到底再退 = 空
  });

  it('空栈撤销/重做返回 null 且栈不变', () => {
    const h = emptyHistory<number>();
    expect(undoHistory(h, 9)).toEqual({ next: h, restored: null });
    expect(redoHistory(h, 9)).toEqual({ next: h, restored: null });
  });
});

describe('重做', () => {
  it('撤销后能再往前走回去（往返一致）', () => {
    let h = emptyHistory<string>();
    h = pushHistory(h, 'a');
    h = pushHistory(h, 'b');
    const u1 = undoHistory(h, 'c');
    expect(u1.restored).toBe('b');
    const u2 = undoHistory(u1.next, 'b');
    expect(u2.restored).toBe('a');
    // 重做两步回到 c
    const r1 = redoHistory(u2.next, 'a');
    expect(r1.restored).toBe('b');
    const r2 = redoHistory(r1.next, 'b');
    expect(r2.restored).toBe('c');
    expect(r2.next.future).toEqual([]);
    expect(r2.next.past).toEqual(['a', 'b']);
  });

  it('撤销后发生新改动 → 重做栈清空，不能在新分支上重做旧路', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1);
    const u = undoHistory(h, 2);
    expect(u.next.future).toEqual([2]);
    const h2 = pushHistory(u.next, u.restored!); // 在退回去的状态上做了新改动
    expect(h2.future).toEqual([]);
    expect(redoHistory(h2, 3).restored).toBeNull();
  });
});

describe('容量上限', () => {
  it(`默认上限 = ${HISTORY_LIMIT} 步，满了丢最早一步`, () => {
    let h = emptyHistory<number>();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h = pushHistory(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(h.past[0]).toBe(6); // 最早的 1..5 已被丢掉
    expect(h.past[h.past.length - 1]).toBe(HISTORY_LIMIT + 5);
  });

  it('自定义上限：只能退上限步数，再退为空', () => {
    let h = emptyHistory<number>();
    for (const v of [1, 2, 3, 4]) h = pushHistory(h, v, 3);
    expect(h.past).toEqual([2, 3, 4]); // 1 被丢
    let cur = 5;
    let steps = 0;
    for (;;) {
      const u = undoHistory(h, cur);
      if (u.restored === null) break;
      cur = u.restored;
      h = u.next;
      steps += 1;
    }
    expect(steps).toBe(3);
    expect(cur).toBe(2); // 最早只能退到 2
  });

  it('上限为 1 时只保留最近一步', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1, 1);
    h = pushHistory(h, 2, 1);
    expect(h.past).toEqual([2]);
  });
});
