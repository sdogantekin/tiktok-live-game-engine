import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, playerCount, startFreshGame } from '../helpers';

/** What `window.__perf.windowStats()` returns, plus the renderer counters read at the same moment. */
interface Run {
  label: string;
  viewport: string;
  cap: number;
  crowd: number;
  note?: string;
  avgFps: number;
  onePercentLowFps: number;
  frameMs: { p50: number; p95: number; p99: number; max: number };
  slowFrameShare: number;
  longTasks: { count: number; totalMs: number };
  mixerMsPerFrame: number;
  jsHeapMB: number | null;
  latencyMs: { count: number; p50: number; p95: number; p99: number; max: number };
  drawCalls: number;
  triangles: number;
  avatars: number;
  crowdVisible: number;
}

const WARMUP_MS = 4_000;
const MEASURE_MS = Number(process.env.PERF_SECONDS ?? 20) * 1000;
const results: Run[] = [];

interface PerfWindow {
  __perf: {
    resetWindow: () => void;
    windowStats: () => Omit<Run, 'label' | 'viewport' | 'cap' | 'crowd' | 'drawCalls' | 'triangles' | 'avatars' | 'crowdVisible'>;
    drawCalls: number;
    triangles: number;
    avatarsVisible: number;
    crowdVisible: number;
  };
}

/** Restarts the steady chat traffic (200 viewers, ~25 events/s) so it never runs out during a long sweep. */
async function restartTraffic(operator: Page) {
  await button(operator, 'Stop playback').click();
  await operator.getByLabel('Scenario', { exact: true }).selectOption('steady');
  await operator.getByLabel('Scenario viewers').fill('200');
  await operator.getByLabel('Scenario seconds').fill('600');
  await button(operator, 'Run').click();
  await expect(operator.getByTestId('last-result')).toHaveText('sim_scenario: ok');
}

async function measure(page: Page, run: Pick<Run, 'label' | 'viewport' | 'cap' | 'crowd' | 'note'>, during?: () => Promise<void>): Promise<Run> {
  await page.waitForTimeout(WARMUP_MS);
  await page.evaluate(() => (window as unknown as PerfWindow).__perf.resetWindow());
  if (during) await during();
  await page.waitForTimeout(MEASURE_MS);
  const stats = await page.evaluate(() => {
    const perf = (window as unknown as PerfWindow).__perf;
    return { ...perf.windowStats(), drawCalls: perf.drawCalls, triangles: perf.triangles, avatars: perf.avatarsVisible, crowdVisible: perf.crowdVisible };
  });
  const result = { ...run, ...stats } as Run;
  results.push(result);
  console.log(
    `${run.label.padEnd(34)} ${run.viewport.padEnd(9)} cap ${String(run.cap).padStart(2)} crowd ${String(run.crowd).padStart(2)}: ` +
      `${stats.avgFps.toFixed(1)} fps, 1%low ${stats.onePercentLowFps.toFixed(1)}, frame p95 ${stats.frameMs.p95.toFixed(1)} ms, ` +
      `slow ${(stats.slowFrameShare * 100).toFixed(1)}%, calls ${stats.drawCalls}, tris ${stats.triangles}, mixer ${stats.mixerMsPerFrame.toFixed(2)} ms, ` +
      `latency p95 ${stats.latencyMs.p95.toFixed(0)} ms (n=${stats.latencyMs.count})`,
  );
  return result;
}

const open = (context: Parameters<typeof openBroadcast>[0], query: string) => openBroadcast(context, `?perf=1${query}`);

test.afterAll(() => {
  writeFileSync(process.env.PERF_OUT ?? 'docs/perf/browser-results.json', JSON.stringify({ measuredAt: new Date().toISOString(), measureSeconds: MEASURE_MS / 1000, results }, null, 2));
});

test('browser performance at 200 participants', async ({ browser }) => {
  // Prepare the game once: 200 participants, an active round, steady traffic.
  const setup = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const operator = await openOperator(setup);
  await startFreshGame(operator);
  await addViewers(operator, 200);
  await button(operator, 'Start round now').click();
  await restartTraffic(operator);

  const sizes = [
    { name: '1080x1920', width: 1080, height: 1920 },
    { name: '720x1280', width: 720, height: 1280 },
  ];

  // 1. The default configuration at both broadcast sizes.
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await open(context, '');
    await measure(page, { label: 'default (200 participants)', viewport: size.name, cap: 24, crowd: 30 });
    await context.close();
  }

  // 2. Sweep: visible-avatar cap x crowd size, at the main broadcast size.
  for (const cap of [12, 24, 36, 48]) {
    for (const crowd of [0, 30, 60]) {
      await restartTraffic(operator);
      const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
      const page = await open(context, `&cap=${cap}&crowd=${crowd}`);
      await measure(page, { label: 'sweep', viewport: '1080x1920', cap, crowd });
      await context.close();
    }
  }

  // 3. Effects burst: three big celebrations and a gg while the default scene runs.
  await restartTraffic(operator);
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const page = await open(context, '');
  await measure(page, { label: 'effects burst (gifts)', viewport: '1080x1920', cap: 24, crowd: 30, note: '3x big_celebration + gg + roses' }, async () => {
    for (const gift of ['big_celebration', 'rose', 'gg', 'big_celebration', 'rose', 'big_celebration', 'rose']) {
      await operator.getByLabel('Gift').selectOption(gift);
      await button(operator, 'Send gift').click();
      await page.waitForTimeout(700);
    }
  });
  await context.close();
  await setup.close();
});

/**
 * Finds the knee: the display refreshes at 60 Hz, so a result of "60 fps" only says the frame fits. These counts are far
 * beyond what the game uses, to show how much headroom there is before frames are dropped.
 */
test('stress: how far past the planned load before frames drop', async ({ browser }) => {
  const setup = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const operator = await openOperator(setup);
  if ((await playerCount(operator)) < 200) {
    await startFreshGame(operator);
    await addViewers(operator, 200 - (await playerCount(operator)));
    await button(operator, 'Start round now').click();
  }
  for (const [cap, crowd] of [
    [48, 60],
    [96, 60],
    [144, 120],
    [200, 200],
  ] as const) {
    await restartTraffic(operator);
    const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    const page = await open(context, `&cap=${cap}&crowd=${crowd}`);
    await measure(page, { label: 'stress', viewport: '1080x1920', cap, crowd });
    await context.close();
  }
  await setup.close();
});

/** The worst realistic input: all 200 participants send `halay` within about 1.5 s, several times. */
test('burst: latency and frame rate while 200 participants act at once', async ({ browser }) => {
  const setup = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const operator = await openOperator(setup);
  if ((await playerCount(operator)) < 200) {
    await startFreshGame(operator);
    await addViewers(operator, 200 - (await playerCount(operator)));
    await button(operator, 'Start round now').click();
  }
  await button(operator, 'Stop playback').click(); // bursts only, no background chat
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const page = await open(context, '');
  await measure(page, { label: 'burst (200 halay in 1.5 s x3)', viewport: '1080x1920', cap: 24, crowd: 30 }, async () => {
    await operator.getByLabel('Burst viewers').fill('200');
    await operator.getByLabel('Burst spread ms').fill('1500');
    await operator.getByLabel('Burst word').selectOption('halay');
    for (let i = 0; i < 3; i++) {
      await button(operator, 'Send burst').click();
      await page.waitForTimeout(6_000);
    }
  });
  await context.close();
  await setup.close();
});
