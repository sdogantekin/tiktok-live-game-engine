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
