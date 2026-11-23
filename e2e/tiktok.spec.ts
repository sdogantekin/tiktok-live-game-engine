import { expect, test } from '@playwright/test';
import { button, openOperator } from './helpers';

// The e2e server runs with TikTok reading OFF (the default), which is also the safest default for anyone who just starts
// the app: nothing here ever contacts TikTok. Reading a stream is covered by the server integration tests with a fake
// connection.
test('the operator panel offers TikTok, which stays off unless the server was started with it, and never disturbs the simulator', async ({ context }) => {
  const operator = await openOperator(context);
  const panel = operator.getByTestId('tiktok');
  await expect(panel).toBeVisible();
  await expect(operator.getByTestId('tiktok-state')).toContainText('not in use');
  await expect(button(operator, 'Disconnect TikTok')).toBeDisabled(); // nothing to stop
  await expect(button(operator, 'Connect TikTok')).toBeDisabled(); // no username yet

  await operator.getByLabel('TikTok username').fill('halay.kanali');
  await button(operator, 'Connect TikTok').click();
  await expect(operator.getByTestId('last-result')).toHaveText('tiktok_connect: tiktok_disabled');
  await expect(operator.getByTestId('tiktok-state')).toContainText('not in use'); // still the simulator
  await expect(operator.getByTestId('provider')).toHaveText('provider: connected'); // and the simulator is still connected

  // The simulator keeps working: it was never switched off by the refused request.
  await operator.getByLabel('Viewers to add').fill('2');
  await button(operator, 'Add').click();
  await expect(operator.getByTestId('last-result')).toHaveText('sim_add_viewers: ok');
});
