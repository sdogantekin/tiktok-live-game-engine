import { expect, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, playerCount, startFreshGame } from './helpers';

test('the operator picks the game, only while it is stopped, and switching starts the game from scratch', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);

  // Start from a clean, stopped game with some players on screen.
  await startFreshGame(operator);
  await addViewers(operator, 6);
  await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  await expect(operator.getByLabel('Game', { exact: true })).toHaveValue('mahalle-halayi');

  // While the game runs, switching is not offered, and the reason is shown.
  await expect(button(operator, 'Switch game')).toBeDisabled();
  await expect(operator.getByText('Stop the game to switch')).toBeVisible();

  // Stopped: switching is allowed and it resets players and scores (the broadcast follows).
  await button(operator, 'Stop game').click();
  await expect(operator.getByTestId('phase')).toHaveText('stopped');
  await expect(button(operator, 'Switch game')).toBeEnabled();
  await button(operator, 'Switch game').click();
  await expect(operator.getByTestId('last-result')).toHaveText('select_game: ok');
  await expect.poll(() => playerCount(operator)).toBe(0);
  await expect(broadcast.getByTestId('stage')).toBeVisible();
  await expect(broadcast.locator('.team-count').first()).toContainText('0');
});

test('Takı Takma Töreni can be played from the dashboard: `tak` scores, a bigger gift adds a bigger bonus', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  const send = async (viewer: string, text: string) => {
    await operator.getByLabel('Viewer id').fill(viewer);
    await operator.getByLabel('Comment text').fill(text);
    await button(operator, 'Send comment').click();
  };

  try {
    await startFreshGame(operator);
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('taki-takma');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Takı Takma Töreni');
    await expect(broadcast.getByText('Takı zamanı!').or(broadcast.getByText('Tören yakında başlıyor'))).toBeVisible();

    await button(operator, 'Start game').click();
    await send('ayse', 'gelin');
    await send('burak', 'damat');
    await button(operator, 'Start round now').click();
    await expect(operator.getByTestId('phase')).toHaveText('active');

    await send('ayse', 'tak');
    await expect(operator.getByTestId('score-gelin')).toHaveText('1');

    await operator.getByLabel('Viewer id').fill('burak');
    await operator.getByLabel('Gift').selectOption('big_celebration');
    await button(operator, 'Send gift').click();
    await expect(operator.getByTestId('score-damat')).toHaveText('30');
  } finally {
    // The server is shared: put the first game back for the other tests.
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('mahalle-halayi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  }
});

test('the operator sets the laps of the horse race, and it shows on the broadcast; the setting is gone for a game without settings', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);

  try {
    await startFreshGame(operator);
    await expect(operator.getByTestId('settings')).toHaveCount(0); // Mahalle Halayı declares none
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('at-yarisi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('At Yarışı');

    await expect(operator.getByTestId('setting-laps')).toHaveText('6');
    await operator.getByLabel('Laps').fill('2');
    await operator.getByTestId('settings').getByRole('button', { name: 'Apply' }).click();
    await expect(operator.getByTestId('last-result')).toHaveText('set_setting: ok');
    await expect(operator.getByTestId('setting-laps')).toHaveText('2');

    await button(operator, 'Start game').click();
    await addViewers(operator, 4);
    await button(operator, 'Start round now').click();
    await expect(operator.getByTestId('phase')).toHaveText('active');
    await expect(broadcast.getByTestId('lap')).toContainText('Tur 1 / 2');

    // A race in progress keeps its rules.
    await operator.getByLabel('Laps').fill('3');
    await operator.getByTestId('settings').getByRole('button', { name: 'Apply' }).click();
    await expect(operator.getByTestId('last-result')).toHaveText('set_setting: round_running');
  } finally {
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('mahalle-halayi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  }
});

test('At Yarışı can be played from the dashboard: viewers join with 1, ten race, the rest wait, likes and gifts boost a horse', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);

  try {
    await startFreshGame(operator);
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('at-yarisi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('At Yarışı');

    await button(operator, 'Start game').click();
    await addViewers(operator, 14); // the simulator's viewers join with `1`
    await button(operator, 'Start round now').click();
    await expect(operator.getByTestId('phase')).toHaveText('active');

    // Ten race, four wait, and the standings list the racers (no team score boxes in this game).
    await expect(broadcast.getByTestId('lap')).toContainText('Tur 1 / 6');
    await expect(broadcast.getByText('Yarışçı 10/10 · Sırada 4')).toBeVisible();
    await expect(broadcast.getByTestId('standing-row')).toHaveCount(10);
    await expect(broadcast.locator('.scores')).toHaveCount(0);

    // Likes and a gift from a racer reach the server and the race goes on.
    await operator.getByLabel('Likes').fill('200');
    await button(operator, 'Send likes').click();
    await operator.getByLabel('Gift').selectOption('rose');
    await button(operator, 'Send gift').click();
    await expect(operator.getByTestId('last-result')).toHaveText('sim_gift: ok');
    await expect(broadcast.getByTestId('standing-row')).toHaveCount(10);
  } finally {
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('mahalle-halayi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  }
});

test('At Yarışı: ending the race shows the ranking, and the next race goes to those who were waiting', async ({ context }) => {
  test.setTimeout(120_000);
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  const say = async (viewer: string, text: string) => {
    await operator.getByLabel('Viewer id').fill(viewer);
    await operator.getByLabel('Comment text').fill(text);
    await button(operator, 'Send comment').click();
  };

  try {
    await startFreshGame(operator);
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('at-yarisi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('At Yarışı');

    await button(operator, 'Start game').click();
    await addViewers(operator, 10); // the ten who race
    await button(operator, 'Start round now').click();
    await expect(operator.getByTestId('phase')).toHaveText('active');
    await expect(broadcast.getByTestId('standing-row')).toHaveCount(10);

    // An eleventh viewer arrives after the start and has to wait.
    await say('latecomer', '1');
    await expect(broadcast.getByText('Sırada 1')).toBeVisible();
    await expect(broadcast.getByTestId('standing-row').filter({ hasText: 'latecomer' })).toHaveCount(0);

    // End the race: the ranking is shown, with the ten racers' places and no team banner.
    await button(operator, 'End round').click();
    await expect(operator.getByTestId('phase')).toHaveText('results');
    await expect(broadcast.getByTestId('race-result')).toContainText('1.');
    await expect(broadcast.locator('.result-banner, .banner')).toHaveCount(0);

    // After the results the next race forms: the viewer who waited is now on the grid.
    await expect(broadcast.getByTestId('standing-row').filter({ hasText: 'latecomer' })).toHaveCount(1, { timeout: 60_000 });
  } finally {
    await button(operator, 'Stop game').click();
    await operator.getByLabel('Game', { exact: true }).selectOption('mahalle-halayi');
    await button(operator, 'Switch game').click();
    await expect(operator.getByTestId('current-game')).toContainText('Mahalle Halayı');
  }
});
