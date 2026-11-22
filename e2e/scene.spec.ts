import { expect, type Page, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, scores, startFreshGame } from './helpers';

interface Perf {
  frames: number;
  fps: number;
  avatarsVisible: number;
  crowdVisible: number;
  effectsStarted: number;
  cuesReceived: number;
  drawCalls: number;
  clipStarts: Record<string, number>;
  pixelStats?: () => { distinctColors: number; meanLuma: number };
}

const perf = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __perf: Perf }).__perf, pixelStats: undefined }) as Perf);
const pixels = (page: Page) => page.evaluate(() => (window as unknown as { __perf: Perf }).__perf.pixelStats!());

async function sceneReady(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () => (await perf(page)).frames, { timeout: 15_000 }).toBeGreaterThan(20);
}

test('the 3D scene renders and is not blank', async ({ context }, testInfo) => {
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);
  const stats = await pixels(broadcast);
  expect(stats.distinctColors).toBeGreaterThan(40);
  expect(stats.meanLuma).toBeGreaterThan(15);
  await broadcast.screenshot({ path: testInfo.outputPath('scene-empty.png') });
});

test('200 participants are tracked while only a bounded number of avatars is animated', async ({ context }, testInfo) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);
  await startFreshGame(operator);
  await addViewers(operator, 200);
  await button(operator, 'Start round now').click();
  await operator.getByLabel('Burst viewers').fill('200');
  await operator.getByLabel('Burst spread ms').fill('1500');
  await operator.getByLabel('Burst word').selectOption('halay');
  await button(operator, 'Send burst').click();

  // The HUD counts everyone; the scene draws at most 24 avatars plus a bounded crowd.
  await expect(async () => {
    const counts = (await broadcast.locator('.team-count').allTextContents()).map((text) => Number.parseInt(text, 10));
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(200);
  }).toPass();
  await expect.poll(async () => (await perf(broadcast)).avatarsVisible).toBe(24);
  await expect.poll(async () => (await perf(broadcast)).clipStarts.halay ?? 0, { timeout: 10_000 }).toBeGreaterThan(0); // the halay clip really plays
  const stats = await perf(broadcast);
  expect(stats.crowdVisible).toBeGreaterThan(0);
  expect(stats.crowdVisible).toBeLessThanOrEqual(60);
  expect(stats.cuesReceived).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThan(150); // provisional budget; measured properly in the performance step
  await broadcast.screenshot({ path: testInfo.outputPath('scene-200.png') });

  // A refresh rebuilds the scene from the server snapshot alone.
  await broadcast.reload();
  await sceneReady(broadcast);
  await expect.poll(async () => (await perf(broadcast)).avatarsVisible).toBe(24);
});

test('gifts trigger effects and never change the score', async ({ context }, testInfo) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);
  await startFreshGame(operator);
  await addViewers(operator, 20);
  await button(operator, 'Start round now').click();
  await expect(operator.getByTestId('phase')).toHaveText('active');
  const before = await scores(operator);
  const started = (await perf(broadcast)).effectsStarted;

  for (const gift of ['rose', 'gg', 'big_celebration']) {
    await operator.getByLabel('Gift').selectOption(gift);
    await button(operator, 'Send gift').click();
    await expect(operator.getByTestId('last-result')).toHaveText('sim_gift: ok');
  }
  await expect.poll(async () => (await perf(broadcast)).effectsStarted).toBeGreaterThanOrEqual(started + 3);
  await expect.poll(async () => (await perf(broadcast)).clipStarts.jump ?? 0).toBeGreaterThan(0); // gg/big_celebration make everyone hop
  await broadcast.screenshot({ path: testInfo.outputPath('scene-gift.png') });
  expect(await scores(operator)).toEqual(before);
});

test('the scene recovers after the WebGL context is lost and restored', async ({ context }) => {
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);

  await broadcast.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
    const lose = gl.getExtension('WEBGL_lose_context')!;
    lose.loseContext();
    setTimeout(() => lose.restoreContext(), 400);
  });
  await broadcast.waitForTimeout(1500);

  const framesAfterRestore = (await perf(broadcast)).frames;
  await expect.poll(async () => (await perf(broadcast)).frames, { timeout: 10_000 }).toBeGreaterThan(framesAfterRestore + 20);
  expect((await pixels(broadcast)).distinctColors).toBeGreaterThan(40);
});

test('the modelled assets load with no errors or missing files', async ({ context }, testInfo) => {
  const problems: string[] = [];
  const page = await context.newPage();
  page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text()}`));
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('response', (response) => response.status() >= 400 && problems.push(`${response.status()} ${response.url()}`));
  await page.goto('/broadcast/?probe=1');
  await expect(page.locator('canvas')).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __perf: { modelsLoaded: unknown } }).__perf.modelsLoaded), { timeout: 20_000 })
    .toEqual({ avatars: true, crowd: true, courtyard: true });
  await expect.poll(async () => (await perf(page)).frames).toBeGreaterThan(30);
  expect(problems).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('scene-models.png') });
});
