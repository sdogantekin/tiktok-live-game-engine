import { expect, test } from '@playwright/test';
import { button, openBroadcast, openOperator, startFreshGame } from './helpers';

test('a joined viewer\'s comment appears as a bubble; unsafe text and switched-off chat show nothing', async ({ context }) => {
  const operator = await openOperator(context);
  const broadcast = await openBroadcast(context);
  await startFreshGame(operator);

  const send = async (viewer: string, text: string) => {
    await operator.getByLabel('Viewer id').fill(viewer);
    await operator.getByLabel('Comment text').fill(text);
    await button(operator, 'Send comment').click();
  };
  const bubbles = broadcast.locator('.chat-bubble');

  // Not joined yet: nothing is shown.
  await send('misafir', 'merhaba herkese');
  await expect(bubbles).toHaveCount(0);

  // Joined: the comment appears, as plain text.
  await send('misafir', 'gelin');
  await expect(operator.getByRole('heading', { name: 'Players (1)' })).toBeVisible(); // joined before they speak
  await send('misafir', 'çok güzel <b>halay</b>');
  await expect(bubbles).toHaveCount(1);
  await expect(bubbles.first()).toHaveText('çok güzel <b>halay</b>');
  await expect(bubbles.first().locator('b')).toHaveCount(0);

  // Links and blocked words never show (wait out the bubble and the player's cooldown first).
  await expect(bubbles).toHaveCount(0, { timeout: 8_000 });
  await send('misafir', 'bak https://example.com');
  await send('misafir', 's1kt1r');
  await broadcast.waitForTimeout(500);
  await expect(bubbles).toHaveCount(0);

  // The operator switch turns it off and on.
  await expect(operator.getByTestId('chat-state')).toHaveText('on');
  await button(operator, 'Turn off').click();
  await expect(operator.getByTestId('chat-state')).toHaveText('off');
  await send('misafir', 'bu görünmemeli');
  await broadcast.waitForTimeout(500);
  await expect(bubbles).toHaveCount(0);
  await button(operator, 'Turn on').click();
  await expect(operator.getByTestId('chat-state')).toHaveText('on');
});
