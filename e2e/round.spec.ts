import { expect, test } from '@playwright/test';
import { addViewers, button, openBroadcast, openOperator, scores, startFreshGame, startRoundWithScores } from './helpers';

test('an operator plays a full round and the broadcast follows along', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);

  await startRoundWithScores(operator, 30);

  // Scores are computed on the server and shown identically in both views.
  await expect.poll(async () => (await scores(operator)).gelin + (await scores(operator)).damat).toBeGreaterThan(0);
  await expect(async () => {
    const op = await scores(operator);
    const shown = await broadcast.locator('.team-score').allTextContents();
    expect(shown.map(Number)).toEqual([op.gelin, op.damat]);
  }).toPass();
  await expect(broadcast.locator('.phase')).toHaveText('Halay zamanı!');
  await expect(broadcast.locator('.clock')).toHaveText(/^0[0-3]:\d\d$/);

  // Pause freezes play and says so on stream; resume clears it.
  await button(operator, 'Pause').click();
  await expect(broadcast.getByText('Oyun duraklatıldı')).toBeVisible();
  await button(operator, 'Resume').click();
  await expect(broadcast.getByText('Oyun duraklatıldı')).toBeHidden();

  // End the round: the server decides the result and the stream announces it.
  const final = await scores(operator);
  await button(operator, 'End round').click();
  await expect(operator.getByTestId('phase')).toHaveText('results');
  const banner = broadcast.locator('.overlay.result');
  await expect(banner).toBeVisible();
  if (final.gelin === final.damat) {
    await expect(banner).toContainText('Berabere!');
  } else {
    await expect(banner).toContainText(final.gelin > final.damat ? 'Gelin Takımı' : 'Damat Takımı');
  }
});

test('operator corrections and controls take effect', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  await startRoundWithScores(operator, 20);
  await expect.poll(async () => (await scores(operator)).gelin + (await scores(operator)).damat).toBeGreaterThan(0);

  // Reset needs a second, explicit confirmation.
  await button(operator, 'Reset score…').click();
  await expect(button(operator, 'Confirm reset')).toBeVisible();
  await button(operator, 'Confirm reset').click();
  await expect.poll(() => scores(operator)).toEqual({ gelin: 0, damat: 0 });
  await expect(broadcast.locator('.team-score')).toHaveText(['0', '0']);

  // Celebrations are accepted; unknown effects would be rejected by the server.
  await button(operator, 'big_celebration').click();
  await expect(operator.getByTestId('last-result')).toHaveText('trigger_celebration: ok');
  await expect(operator.getByTestId('feed')).toContainText('Celebration: big_celebration');

  // Removing a player removes them from the roster in the operator view.
  const first = operator.locator('[data-testid="players"] tbody tr').first();
  const id = await first.getAttribute('data-player');
  await first.getByRole('button', { name: 'Remove' }).click();
  await expect(operator.locator(`[data-player="${id}"]`)).toHaveCount(0);
});

test('a provider outage is shown on stream while the game keeps running', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  await startFreshGame(operator);

  await button(operator, 'Disconnect').click();
  await expect(broadcast.getByText('Yorum bağlantısı koptu, oyun devam ediyor')).toBeVisible();
  await expect(operator.getByTestId('provider')).toHaveText('provider: disconnected');
  await expect(broadcast.locator('.clock')).toHaveText(/^\d\d:\d\d$/); // the countdown keeps going

  await button(operator, 'Connect').click();
  await expect(broadcast.getByText('Yorum bağlantısı koptu, oyun devam ediyor')).toBeHidden();
});

test('both views recover their state after a page refresh', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  await startRoundWithScores(operator, 20);
  await expect.poll(async () => (await scores(operator)).gelin + (await scores(operator)).damat).toBeGreaterThan(0);
  const before = await scores(operator);

  await broadcast.reload();
  await expect(broadcast.locator('.team-name').first()).toBeVisible();
  await expect(broadcast.locator('.phase')).toHaveText('Halay zamanı!');
  expect((await broadcast.locator('.team-score').allTextContents()).map(Number)).toEqual([before.gelin, before.damat]);

  await operator.reload();
  await expect(operator.getByTestId('connection')).toHaveText('Connected');
  await expect(operator.getByTestId('phase')).toHaveText('active');
  expect(await scores(operator)).toEqual(before);
  await addViewers(operator, 1); // and it is still fully usable
});
