import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addViewers, button, openOperator, startFreshGame } from '../helpers';

const WARMUP_MS = 4_000;
const MEASURE_MS = Number(process.env.PERF_SECONDS ?? 20) * 1000;

interface PerfWindow {
  __perf: { resetWindow: () => void; windowStats: () => Record<string, unknown>; drawCalls: number; triangles: number; avatarsVisible: number; crowdVisible: number };
}

/** At Yarışı at the planned load: 10 racing and 190 waiting, a steady stream of likes, comments and gifts, then a gift burst. */
test('browser performance of At Yarışı at 200 participants', async ({ browser }) => {
  const setup = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const operator = await openOperator(setup);
  await startFreshGame(operator);
  await button(operator, 'Stop game').click();
  await operator.getByLabel('Game', { exact: true }).selectOption('at-yarisi');
  await button(operator, 'Switch game').click();
  await expect(operator.getByTestId('current-game')).toContainText('At Yarışı');
  await button(operator, 'Start game').click();
  await addViewers(operator, 200);
  await button(operator, 'Start round now').click();
  await operator.getByLabel('Scenario', { exact: true }).selectOption('steady');
  await operator.getByLabel('Scenario viewers').fill('200');
  await operator.getByLabel('Scenario seconds').fill('600');
  await button(operator, 'Run').click();
  await expect(operator.getByTestId('last-result')).toHaveText('sim_scenario: ok');

  const results: Record<string, unknown>[] = [];
  for (const [label, width, height, gifts] of [
    ['default', 1080, 1920, false],
    ['default', 720, 1280, false],
    ['gift burst', 1080, 1920, true],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto('/broadcast/?perf=1'); // (`openBroadcast` waits for team score boxes, which this game does not show)
    await page.waitForFunction(() => '__perf' in window);
    await page.waitForTimeout(WARMUP_MS);
    await page.evaluate(() => (window as unknown as PerfWindow).__perf.resetWindow());
    if (gifts) {
      for (const gift of ['big_celebration', 'rose', 'gg', 'big_celebration', 'rose', 'big_celebration']) {
        await operator.getByLabel('Gift').selectOption(gift);
        await button(operator, 'Send gift').click();
        await page.waitForTimeout(700);
      }
    }
    await page.waitForTimeout(MEASURE_MS);
    const stats = await page.evaluate(() => {
      const perf = (window as unknown as PerfWindow).__perf;
      return { ...perf.windowStats(), drawCalls: perf.drawCalls, triangles: perf.triangles, avatars: perf.avatarsVisible, crowdVisible: perf.crowdVisible };
    });
    results.push({ label, viewport: `${width}x${height}`, ...stats });
    console.log(`${label.padEnd(11)} ${width}x${height}: ${JSON.stringify(stats)}`);
    await context.close();
  }
  writeFileSync(process.env.PERF_OUT ?? 'docs/perf/race-results.json', JSON.stringify({ measuredAt: new Date().toISOString(), measureSeconds: MEASURE_MS / 1000, results }, null, 2));
  await setup.close();
});
