import { expect, type Page, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, startFreshGame } from './helpers';

interface Stats {
  peak: number;
  rms: number;
  audibleFraction: number;
  hasInvalidSamples: boolean;
}

interface RenderOptions {
  seconds: number;
  bpm: number;
  energy: number;
  mode?: 'off' | 'calm' | 'build' | 'full';
  effects?: { at: number; request: { name: string; velocity?: number } }[];
}

/** Renders the game's real sound offline in the browser (Web Audio, faster than real time) and measures it. */
async function render(page: Page, options: RenderOptions): Promise<Stats> {
  await page.waitForFunction(() => '__soundProbe' in window);
  return page.evaluate((o) => (window as unknown as { __soundProbe: (o: RenderOptions) => Promise<Stats> }).__soundProbe(o), options);
}

test('the music is audible, does not clip, and grows with the crowd energy without getting wild', async ({ context }) => {
  const broadcast = await openBroadcast(context, '?probe=1');
  const calm = await render(broadcast, { seconds: 12, bpm: 112, energy: 0, mode: 'calm' });
  const medium = await render(broadcast, { seconds: 12, bpm: 128, energy: 0.4 });
  const high = await render(broadcast, { seconds: 12, bpm: 144, energy: 1 });

  for (const stats of [calm, medium, high]) {
    expect(stats.hasInvalidSamples).toBe(false);
    expect(stats.peak).toBeGreaterThan(0.05); // not silent
    expect(stats.peak).toBeLessThanOrEqual(0.99); // never clips
    expect(stats.rms).toBeGreaterThan(0.005);
  }
  expect(medium.audibleFraction).toBeGreaterThan(0.5);
  expect(high.audibleFraction).toBeGreaterThan(0.8);
  // More energy is louder, but by a sensible amount (under ~14 dB RMS), so a surge is exciting and not painful.
  expect(high.rms).toBeGreaterThan(medium.rms);
  expect(medium.rms).toBeGreaterThan(calm.rms);
  expect(high.rms / calm.rms).toBeGreaterThan(1.4); // the arrangement audibly builds (measured about 1.8: 5 dB)
  expect(high.rms / calm.rms).toBeLessThan(5);
});

test('a storm of effects and celebrations stays under the clipping limit', async ({ context }) => {
  const broadcast = await openBroadcast(context, '?probe=1');
  const names = ['pop', 'clap', 'whoosh', 'sparkle', 'chime', 'tick', 'go', 'fanfare', 'roll', 'cheer'];
  const effects = Array.from({ length: 400 }, (_, i) => ({ at: 1 + (i % 40) * 0.05, request: { name: names[i % names.length]!, velocity: 1 } }));
  const stats = await render(broadcast, { seconds: 6, bpm: 132, energy: 1, effects });
  expect(stats.hasInvalidSamples).toBe(false);
  expect(stats.peak).toBeLessThanOrEqual(0.99);
  expect(stats.peak).toBeGreaterThan(0.2);
});

test('the operator mutes and sets the volume, and every view and refresh keeps it', async ({ context }) => {
  const operator = await openOperator(context);
  const sound = operator.getByTestId('sound-state');
  if ((await sound.textContent()) === 'muted') await button(operator, 'Unmute').click();
  await expect(sound).toHaveText('on');

  await button(operator, 'Mute').click();
  await expect(sound).toHaveText('muted');
  await operator.getByLabel('Sound volume').fill('35');
  await expect(operator.getByText('Volume 35%')).toBeVisible();

  // A second operator view (a refresh, or another device) gets the same settings from the server.
  const another = await openOperator(context);
  await expect(another.getByTestId('sound-state')).toHaveText('muted');
  await expect(another.getByText('Volume 35%')).toBeVisible();

  // While muted there is nothing to unlock, so the broadcast shows no "tap for sound" hint.
  const broadcast = await openBroadcast(context);
  await expect(broadcast.getByTestId('sound-gate')).toHaveCount(0);

  await button(operator, 'Unmute').click();
  await expect(sound).toHaveText('on');
  await operator.getByLabel('Sound volume').fill('70');
  await expect(operator.getByText('Volume 70%')).toBeVisible();
});

test('live: the music is scheduled during a round, effects answer viewers, and mute silences it', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context, '?probe=1');
  await broadcast.waitForFunction(() => '__soundEngine' in window);
  const engine = () =>
    broadcast.evaluate(() => {
      const e = (window as unknown as { __soundEngine: { running: boolean; stats: { notes: number; effects: number } } | null }).__soundEngine;
      return e ? { running: e.running, notes: e.stats.notes, effects: e.stats.effects } : null;
    });
  const initial = await engine();
  test.skip(initial === null || !initial.running, 'this browser starts audio suspended until a user gesture; the offline render covers the sound itself');

  if ((await operator.getByTestId('sound-state').textContent()) === 'muted') await button(operator, 'Unmute').click();
  await startFreshGame(operator);
  await addViewers(operator, 12);
  await button(operator, 'Start round now').click();
  await expect(operator.getByTestId('phase')).toHaveText('active');

  // Music notes keep arriving while the round runs, and viewer actions add effects.
  const before = (await engine())!;
  await operator.getByLabel('Burst viewers').fill('12');
  await operator.getByLabel('Burst spread ms').fill('500');
  await operator.getByLabel('Burst word').selectOption('halay');
  await button(operator, 'Send burst').click();
  await expect.poll(async () => (await engine())!.notes, { timeout: 8000 }).toBeGreaterThan(before.notes + 10);
  await expect.poll(async () => (await engine())!.effects, { timeout: 8000 }).toBeGreaterThan(before.effects);

  // Muted: nothing more is scheduled.
  await button(operator, 'Mute').click();
  await expect(operator.getByTestId('sound-state')).toHaveText('muted');
  await broadcast.waitForTimeout(600);
  const muted = (await engine())!;
  await broadcast.waitForTimeout(1500);
  expect((await engine())!.notes).toBe(muted.notes);
  await button(operator, 'Unmute').click();
});

test("the game's music file loads and takes over from the built-in music (when the file is present)", async ({ context, request }) => {
  const present = await request.head('/game-modes/mahalle-halayi/audio/halay.mp3');
  test.skip(!present.ok(), 'the music file is kept out of git, so a fresh clone does not have it and plays the built-in music');
  expect(present.headers()['content-type']).toBe('audio/mpeg');

  const broadcast = await openBroadcast(context, '?probe=1');
  await broadcast.waitForFunction(() => '__soundEngine' in window);
  await expect
    .poll(() => broadcast.evaluate(() => (window as unknown as { __soundEngine: { stats: { track: string } } | null }).__soundEngine?.stats.track), { timeout: 20_000 })
    .toBe('ready');
});

test('At Yarışı\'s music is audible, does not clip, and builds with the race without getting wild', async ({ context }) => {
  const operator = await openOperator(context);
  await startFreshGame(operator);
  await button(operator, 'Stop game').click();
  await operator.getByLabel('Game', { exact: true }).selectOption('at-yarisi');
  await button(operator, 'Switch game').click();
  await expect(operator.getByTestId('current-game')).toContainText('At Yarışı');

  try {
    // (`openBroadcast` waits for the team score boxes, which this game does not have: `render` waits for the sound probe instead.)
    const broadcast = await context.newPage();
    await broadcast.goto('/broadcast/?probe=1');
    const calm = await render(broadcast, { seconds: 12, bpm: 112, energy: 0, mode: 'calm' });
    const medium = await render(broadcast, { seconds: 12, bpm: 128, energy: 0.4 });
    const high = await render(broadcast, { seconds: 12, bpm: 150, energy: 1 });
    for (const stats of [calm, medium, high]) {
      expect(stats.hasInvalidSamples).toBe(false);
      expect(stats.peak).toBeGreaterThan(0.05);
      expect(stats.peak).toBeLessThanOrEqual(0.99);
      expect(stats.rms).toBeGreaterThan(0.005);
    }
    expect(high.audibleFraction).toBeGreaterThan(0.8);
    expect(high.rms).toBeGreaterThan(calm.rms);
    expect(high.rms / calm.rms).toBeLessThan(5);

    // The race's own effects, all at once, still stay under the limit.
    const names = ['pop', 'whoosh', 'sparkle', 'chime', 'tick', 'go', 'fanfare', 'cheer'];
    const effects = Array.from({ length: 300 }, (_, i) => ({ at: 1 + (i % 40) * 0.05, request: { name: names[i % names.length]!, velocity: 1 } }));
    const storm = await render(broadcast, { seconds: 6, bpm: 150, energy: 1, effects });
    expect(storm.hasInvalidSamples).toBe(false);
    expect(storm.peak).toBeLessThanOrEqual(0.99);
  } finally {
    // The game was switched while stopped and never started, so it is already stopped: just switch back.
    await operator.getByLabel('Game', { exact: true }).selectOption('mahalle-halayi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  }
});
