import { expect, test } from '@playwright/test';
import { openBroadcast, openOperator, startRoundWithScores } from './helpers';

/** The smallest text on the broadcast must stay readable on a phone: at least 3.5% of the stage width. */
const MIN_FONT_RATIO = 0.035;

for (const size of [
  { width: 1080, height: 1920 },
  { width: 540, height: 960 },
]) {
  test(`broadcast is legible at ${size.width}×${size.height}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: size });
    const operator = await openOperator(context);
    const broadcast = await openBroadcast(context); // open first, so it sees the joins arrive
    await startRoundWithScores(operator, 40);
    await expect(broadcast.locator('.joiner').first()).toBeVisible();
    await expect(broadcast.locator('.team-score').first()).not.toHaveText('0');

    // The 9:16 stage fills the window exactly.
    const stage = await broadcast.getByTestId('stage').boundingBox();
    expect(stage).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height });

    // Every piece of visible text is large enough, and nothing is clipped or overflowing.
    const report = await broadcast.evaluate(() => {
      const stageEl = document.querySelector<HTMLElement>('[data-testid="stage"]')!;
      const stageWidth = stageEl.getBoundingClientRect().width;
      const smallest = { px: Infinity, text: '' };
      const clipped: string[] = [];
      for (const el of stageEl.querySelectorAll<HTMLElement>('*')) {
        const hasOwnText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (!hasOwnText) continue;
        const px = Number.parseFloat(getComputedStyle(el).fontSize);
        if (px < smallest.px) {
          smallest.px = px;
          smallest.text = el.textContent ?? '';
        }
        if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent ?? '');
      }
      return {
        stageWidth,
        smallest,
        clipped,
        pageOverflowsX: document.documentElement.scrollWidth > window.innerWidth,
        pageOverflowsY: document.documentElement.scrollHeight > window.innerHeight,
      };
    });

    expect(report.smallest.px, `smallest text "${report.smallest.text}"`).toBeGreaterThanOrEqual(report.stageWidth * MIN_FONT_RATIO);
    expect(report.clipped).toEqual([]);
    expect(report.pageOverflowsX).toBe(false);
    expect(report.pageOverflowsY).toBe(false);

    await broadcast.screenshot({ path: testInfo.outputPath(`broadcast-active-${size.width}.png`) });
    await context.close();
  });
}
