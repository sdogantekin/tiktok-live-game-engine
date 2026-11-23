import { expect, test } from '@playwright/test';
import { OPERATOR_TOKEN } from './helpers';

test('broadcast page renders the HUD from the server snapshot', async ({ page }) => {
  await page.goto('/broadcast/');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByText('Gelin Tarafı')).toBeVisible();
  await expect(page.getByText('Damat Tarafı')).toBeVisible();
});

test('operator page connects with the operator token', async ({ page }) => {
  await page.goto(`/operator/#token=${OPERATOR_TOKEN}`);
  await expect(page.getByTestId('connection')).toHaveText('Connected');
  await expect(page.getByTestId('provider')).toHaveText('provider: connected');
});

test('operator page is refused with a wrong token', async ({ page }) => {
  await page.goto('/operator/#token=wrong-token');
  await expect(page.getByTestId('connection')).toContainText('Unauthorized');
});

test('operator page asks for a token when the URL has none', async ({ page }) => {
  await page.goto('/operator/');
  await expect(page.getByLabel(/Operator token/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled();
});
