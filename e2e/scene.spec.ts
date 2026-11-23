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

test('the halay lines walk on the beat, with the couple and the traditional musicians dancing', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);
  await startFreshGame(operator);
  await addViewers(operator, 12);
  await expect.poll(async () => (await perf(broadcast)).avatarsVisible).toBeGreaterThan(0);

  // Everyone (the lines, the halaybaşı leaders and the couple) steps sideways with one of the two step clips, depending on which way they
  // walk; each musician plays their own clip.
  await expect
    .poll(async () => {
      const clips = (await perf(broadcast)).clipStarts;
      return [(clips.step_left ?? 0) + (clips.step_right ?? 0), (clips.leader_step_left ?? 0) + (clips.leader_step_right ?? 0), clips.davul_play ?? 0, clips.zurna_play ?? 0, clips.saz_play ?? 0].map((n) => n > 0);
    }, { timeout: 15_000 })
    .toEqual([true, true, true, true, true]);

  // Each line has a halaybaşı at both ends, marked on their name tags (two lines, two ends each).
  await expect.poll(() => broadcast.locator('.name-tag.leader').count()).toBe(4);

  // The lines really move, and the name tags move with them.
  const tagTop = () => broadcast.locator('.name-tag').first().evaluate((el) => el.getBoundingClientRect().top);
  const first = await tagTop();
  await expect.poll(async () => Math.abs((await tagTop()) - first), { timeout: 8000 }).toBeGreaterThan(5);
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
  await expect.poll(async () => (await perf(broadcast)).clipStarts.halay_kick ?? 0, { timeout: 10_000 }).toBeGreaterThan(0); // the halay flourish really plays
  await expect.poll(async () => (await perf(broadcast)).clipStarts.mendil_flourish ?? 0, { timeout: 10_000 }).toBeGreaterThan(0); // and the halaybaşı waves the mendil
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

test('every avatar gets a name tag that stays readable, does not overlap, and renders names as plain text', async ({ context }, testInfo) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context, '?probe=1');
  await sceneReady(broadcast);
  await startFreshGame(operator);

  // A hostile display name goes in first so it gets an avatar; it must show up as inert text.
  const hostile = '<img src=x onerror=window.__pwned=1>';
  await operator.getByLabel('Viewer id').fill(hostile);
  await operator.getByLabel('Comment text').fill('gelin');
  await button(operator, 'Send comment').click();
  await expect(broadcast.locator('.name-tag', { hasText: '<img src=x' })).toHaveCount(1); // it joined and took an avatar
  await operator.getByLabel('Viewer id').fill('');
  await addViewers(operator, 100);

  const tags = broadcast.locator('.name-tag');
  await expect(tags).toHaveCount(24); // one per avatar, however many players there are
  await expect(broadcast.locator('.name-tag', { hasText: '<img src=x' })).toHaveCount(1);
  expect(await broadcast.locator('.name-tags img').count()).toBe(0);
  expect(await broadcast.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  // Joining emphasises tags briefly; once that has faded, only quiet tags remain.
  await expect(broadcast.locator('.name-tag.emphasized')).toHaveCount(0, { timeout: 10_000 });
  await broadcast.waitForTimeout(400); // let the shrink transition finish before measuring
  const layout = await broadcast.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="stage"]')!.getBoundingClientRect();
    const rects = [...document.querySelectorAll<HTMLElement>('.name-tag')].map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, font: Number.parseFloat(getComputedStyle(el).fontSize) };
    });
    let overlaps = 0;
    const pairs: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          overlaps++;
          pairs.push(`${a.name} [${a.left.toFixed(0)},${a.top.toFixed(0)},${a.right.toFixed(0)},${a.bottom.toFixed(0)}] x ${b.name} [${b.left.toFixed(0)},${b.top.toFixed(0)},${b.right.toFixed(0)},${b.bottom.toFixed(0)}]`);
        }
      }
    }
    const inside = rects.every((r) => r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom);
    return { overlaps, pairs, inside, minFont: Math.min(...rects.map((r) => r.font)), stageWidth: stage.width };
  });
  await broadcast.screenshot({ path: testInfo.outputPath('tags-quiet.png') });
  expect(layout.pairs).toEqual([]);
  expect(layout.inside).toBe(true);
  expect(layout.minFont).toBeGreaterThanOrEqual(layout.stageWidth * 0.022);

  // Acting makes that player's tag prominent, then it settles back.
  await button(operator, 'Start round now').click();
  await operator.getByLabel('Viewer id').fill(hostile);
  await operator.getByLabel('Comment text').fill('halay');
  await button(operator, 'Send comment').click();
  const mine = broadcast.locator('.name-tag', { hasText: '<img src=x' });
  await expect(mine).toHaveClass(/emphasized/);
  await broadcast.screenshot({ path: testInfo.outputPath('tags-emphasized.png') });
  await expect(mine).not.toHaveClass(/emphasized/, { timeout: 8_000 });
});
