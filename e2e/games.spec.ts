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
