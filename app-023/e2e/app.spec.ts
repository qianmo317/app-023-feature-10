// E2E —— 模拟真实用户点击：建谱 → 录入 → 试听 → 调速 → 持久化 → 打印 → 性能
import { expect, test, type Page } from '@playwright/test';

async function createEmptyScore(page: Page, title: string) {
  await page.goto('#/');
  await page.getByTestId('new-title').fill(title);
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('editor-page')).toBeVisible();
}

test.describe('曲目列表', () => {
  test('新建空白谱进入编辑器', async ({ page }) => {
    await createEmptyScore(page, 'E2E 开道锣');
    await expect(page.getByTestId('score-title')).toHaveValue('E2E 开道锣');
    await expect(page.getByTestId('grid')).toBeVisible();
  });
});

test.describe('录入与齐奏', () => {
  test('点击格子 + 键盘落字 + 数字换时值 + 休止', async ({ page }) => {
    await createEmptyScore(page, 'E2E 录入');
    // 选中 0 小节 0 格，按 z → 鼓·咚（整拍）
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z');
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
    // 光标自动前进到 4 格；按 2 切半拍，再按 a → 小锣·才 落在 4 格处
    await page.keyboard.press('2');
    await page.keyboard.type('a');
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toBeVisible();
    // 0 休止
    await page.keyboard.press('0');
    await page.waitForTimeout(100);
    // 齐奏：回到 0 格，v → 大锣·哐 与 咚 同列
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('v');
    await expect(page.getByTestId('grid-glyph-0-0-daluo')).toBeVisible();
  });

  test('验收：齐奏多乐器落在同一列（x 坐标相同）', async ({ page }) => {
    await createEmptyScore(page, 'E2E 齐奏');
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z'); // 鼓
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('v'); // 大锣
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('f'); // 钹
    const xs = await page.evaluate(() => {
      const out: number[] = [];
      for (const id of ['gu', 'daluo', 'bo']) {
        const el = document.querySelector(`[data-testid="grid-glyph-0-0-${id}"] text`) as SVGTextElement | null;
        const g = el?.closest('g') as SVGGElement | null;
        if (el) {
          const bb = (g ?? el).getBoundingClientRect();
          out.push(bb.x + bb.width / 2);
        }
      }
      return out;
    });
    expect(xs.length).toBe(3);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1); // 同一列
  });
});

test.describe('曲牌库', () => {
  test('一键载入急急风并显示齐奏列', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-jijifeng').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await expect(page.getByTestId('score-title')).toHaveValue('急急风');
    await expect(page.getByTestId('grid-glyph-0-0-daluo')).toBeVisible(); // 哐
    await expect(page.getByTestId('grid-glyph-0-0-xiaoluo')).toBeVisible(); // 才
    await expect(page.getByTestId('grid-glyph-0-0-bo')).toBeVisible(); // 七
    await expect(page.locator('[data-testid="grid-bar-0"]')).toBeVisible();
  });

  test('载入收头（跨小节切分）后小节铺满', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-shutou').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    const bars = await page.locator('[data-testid^="grid-bar-"]').count();
    expect(bars).toBe(2);
  });
});

test.describe('试听', () => {
  test('播放 → 当前拍高亮 → 停止；+/− 调 BPM', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-jijifeng').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await page.getByTestId('btn-play').click();
    await expect(page.getByTestId('grid-highlight')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('btn-play').click(); // 停止
    await expect(page.getByTestId('grid-highlight')).toHaveCount(0);

    const bpm0 = await page.getByTestId('bpm-value').textContent();
    await page.getByTestId('bpm-up').click();
    await page.getByTestId('bpm-up').click();
    const bpm1 = Number(await page.getByTestId('bpm-value').textContent());
    expect(bpm1).toBe(Number(bpm0) + 4);
    await page.getByTestId('bpm-down').click();
    expect(Number(await page.getByTestId('bpm-value').textContent())).toBe(Number(bpm0) + 2);
  });

  test('验收：调度时刻偏差 < 10ms（读取 __scheduled 钩子）', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-jijifeng').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await page.getByTestId('btn-play').click();
    // 等待调度器排入足够事件（ctx resume 完成后 lookahead 持续填窗）
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => (window as unknown as { __scheduled?: () => { time: number }[] }).__scheduled?.().length ?? 0,
          ),
        { timeout: 8000, intervals: [200] },
      )
      .toBeGreaterThan(10);
    const deltas = await page.evaluate(() => {
      const evs = (window as unknown as { __scheduled?: () => { time: number }[] }).__scheduled?.() ?? [];
      const uniq = [...new Set(evs.map((e) => e.time))].sort((a, b) => a - b);
      const per = 60 / 152 / 4; // 急急风 BPM 152 每格秒数
      const errs: number[] = [];
      for (let i = 1; i < uniq.length; i++) {
        const n = Math.round((uniq[i] - uniq[i - 1]) / per);
        errs.push(Math.abs(uniq[i] - uniq[i - 1] - n * per));
      }
      return errs;
    });
    expect(deltas.length).toBeGreaterThan(3);
    for (const e of deltas) expect(e).toBeLessThan(0.01); // < 10ms
    await page.getByTestId('btn-play').click();
  });

  test('独奏/静音切换', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-jijifeng').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await page.getByTestId('solo-daluo').click();
    await expect(page.getByTestId('solo-daluo')).toHaveClass(/on/);
    await page.getByTestId('mute-gu').click();
    await expect(page.getByTestId('mute-gu')).toHaveClass(/on/);
  });
});

test.describe('持久化', () => {
  test('刷新后曲目与谱面不丢（IndexedDB）', async ({ page }) => {
    await createEmptyScore(page, 'E2E 持久化');
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z');
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
    await page.waitForTimeout(800); // 等自动保存
    await page.reload();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await expect(page.getByTestId('score-title')).toHaveValue('E2E 持久化');
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
  });

  test('曲目列表展示与删除', async ({ page }) => {
    await createEmptyScore(page, 'E2E 待删除');
    await page.goto('#/');
    const row = page.locator('tr', { hasText: 'E2E 待删除' });
    await expect(row).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await row.getByTestId(/del-sc_/).click();
    await expect(page.locator('tr', { hasText: 'E2E 待删除' })).toHaveCount(0);
  });
});

test.describe('打印', () => {
  test('打印视图：A4 横排、简谱对照开关、打印/PNG 按钮', async ({ page }) => {
    await page.goto('#/library');
    await page.getByTestId('load-jijifeng').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await page.getByTestId('btn-print').click();
    await expect(page.getByTestId('print-page')).toBeVisible();
    const bars = await page.locator('[data-testid^="print-bar-"]').count();
    expect(bars).toBe(4);
    // 4 个小节一行放下（SVG 宽度 ≤ A4 内容宽 1047 + 行标）
    const w = await page.evaluate(() => (document.querySelector('[data-testid="print"]') as SVGSVGElement).width.baseVal.value);
    expect(w).toBeLessThanOrEqual(1047 + 64 + 2);
    // 简谱对照
    await page.getByTestId('chk-jianpu').check();
    await expect(page.locator('[data-testid^="print-jianpu-"]').first()).toBeVisible();
    // window.print 被调用
    await page.evaluate(() => {
      (window as unknown as { print: () => void }).print = () => {
        (window as unknown as { __printed?: boolean }).__printed = true;
      };
    });
    await page.getByTestId('btn-do-print').click();
    expect(await page.evaluate(() => (window as unknown as { __printed?: boolean }).__printed)).toBe(true);
  });
});

test.describe('撤销/重做', () => {
  test('落字进历史：按钮步数可见，可连退、可重做（按钮与 Ctrl+Z）', async ({ page }) => {
    await createEmptyScore(page, 'E2E 历史');
    // 初始：不能退也不能重做
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    await expect(page.getByTestId('undo-count')).toHaveText('0');
    // 落两字 → 历史 2 步
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z'); // 鼓·咚 落 0 格，光标进到 4 格
    await page.keyboard.type('a'); // 小锣·才 落 4 格
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toBeVisible();
    await expect(page.getByTestId('undo-count')).toHaveText('2');
    // 连退两步：两字依次消失
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toHaveCount(0);
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
    await expect(page.getByTestId('undo-count')).toHaveText('1');
    await expect(page.getByTestId('redo-count')).toHaveText('1');
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toHaveCount(0);
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    // 再往前走回去
    await page.getByTestId('btn-redo').click();
    await page.getByTestId('btn-redo').click();
    await expect(page.getByTestId('grid-glyph-0-0-gu')).toBeVisible();
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toBeVisible();
    await expect(page.getByTestId('btn-redo')).toBeDisabled();
    // 键盘 Ctrl+Z / Ctrl+Shift+Z
    await page.getByTestId('grid-cell-0-0').click(); // 焦点收回编辑区
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toHaveCount(0);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('grid-glyph-0-4-xiaoluo')).toBeVisible();
  });

  test('改拍号/增减小节可撤销；没有改动成功的点击不进历史', async ({ page }) => {
    await createEmptyScore(page, 'E2E 历史守卫');
    // 空步上切技法、清除空步、末步连线 → 都不是有效改动，不进历史
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.press('e');
    await page.keyboard.press('Backspace');
    await page.getByTestId('grid-cell-0-13').click(); // 末步覆盖 12–15 格（12 格中心被下一小节行标压住，点 13）
    await page.keyboard.press('t');
    await expect(page.getByTestId('undo-count')).toHaveText('0');
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    // 改拍号 4/4 → 2/4 进历史，撤销后还原
    await page.getByTestId('beats-per-bar').selectOption('2');
    await expect(page.getByTestId('undo-count')).toHaveText('1');
    await page.getByTestId('btn-undo').click();
    await expect(page.getByTestId('beats-per-bar')).toHaveValue('4');
    // +4 小节进历史；−末小节到只剩 1 小节后不再进历史
    await page.getByRole('button', { name: '+4 小节' }).click();
    await expect(page.locator('[data-testid^="grid-bar-"]')).toHaveCount(8);
    await expect(page.getByTestId('undo-count')).toHaveText('1');
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '−末小节' }).click();
    await expect(page.locator('[data-testid^="grid-bar-"]')).toHaveCount(1);
    await expect(page.getByTestId('undo-count')).toHaveText('8'); // 1(加小节)+7(删小节)，最后点不动的不计
    await page.getByRole('button', { name: '−末小节' }).click(); // 只剩 1 小节 → 无改动
    await expect(page.getByTestId('undo-count')).toHaveText('8');
    // 撤销「加 4 小节」之外的删除：连退 7 步回到 8 小节
    for (let i = 0; i < 7; i++) await page.getByTestId('btn-undo').click();
    await expect(page.locator('[data-testid^="grid-bar-"]')).toHaveCount(8);
  });

  test('重新载入同一曲或换到另一份曲目 → 历史清空', async ({ page }) => {
    await createEmptyScore(page, 'E2E 历史甲');
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z');
    await expect(page.getByTestId('undo-count')).toHaveText('1');
    // 回列表再进同一曲 → 不能接着退
    await page.goto('#/');
    await page.locator('tr', { hasText: 'E2E 历史甲' }).locator('a.score-link').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    await expect(page.getByTestId('undo-count')).toHaveText('0');
    // 换到另一份曲目 → 同样清空
    await createEmptyScore(page, 'E2E 历史乙');
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.type('z');
    await expect(page.getByTestId('undo-count')).toHaveText('1');
    await page.goto('#/');
    await page.locator('tr', { hasText: 'E2E 历史甲' }).locator('a.score-link').click();
    await expect(page.getByTestId('editor-page')).toBeVisible();
    await expect(page.getByTestId('btn-undo')).toBeDisabled();
    await expect(page.getByTestId('undo-count')).toHaveText('0');
  });
});

test.describe('设置', () => {
  test('改键位并持久化', async ({ page }) => {
    await page.goto('#/settings');
    await page.getByTestId('rebind-z').click(); // 把 z（鼓·咚）改绑到 p
    await page.keyboard.press('p');
    await expect(page.getByTestId('rebind-msg')).toContainText('已绑定 p');
    await page.waitForTimeout(300); // 等 IndexedDB 落盘
    await page.reload();
    const row = page.locator('tr', { hasText: '咚' });
    await expect(row).toContainText('p');
  });
});

test.describe('性能', () => {
  test('验收：100 小节谱面滚动 ≥ 50fps', async ({ page }) => {
    await createEmptyScore(page, 'E2E 百小节');
    for (let i = 0; i < 24; i++) await page.getByRole('button', { name: '+4 小节' }).click(); // 4+96=100
    const bars = await page.locator('[data-testid^="grid-bar-"]').count();
    expect(bars).toBe(100);
    const fps = await page.evaluate(async () => {
      const scroller = document.querySelector('[data-testid="score-scroll"]') as HTMLElement;
      scroller.scrollLeft = 0;
      let frames = 0;
      const start = performance.now();
      const tick = () => {
        frames += 1;
        scroller.scrollLeft = ((performance.now() - start) / 2000) * (scroller.scrollWidth - scroller.clientWidth);
        if (performance.now() - start < 2000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 2100));
      return (frames / 2) * 1; // 帧/秒
    });
    console.log('滚动 fps =', fps);
    expect(fps).toBeGreaterThanOrEqual(50);
  });
});
