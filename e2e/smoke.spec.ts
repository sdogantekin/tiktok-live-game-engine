import { expect, test } from '@playwright/test';

test('broadcast page connects to the server', async ({ page }) => {
  await page.goto('/broadcast/');
  await expect(page.getByText('Broadcast: connected')).toBeVisible();
});

test('operator page connects with the operator token', async ({ page }) => {
  await page.goto('/operator/#token=e2e-operator-token');
  await expect(page.getByText('Operator: connected')).toBeVisible();
});

test('operator page is refused without a valid token', async ({ page }) => {
  await page.goto('/operator/#token=wrong-token');
  await expect(page.getByText('Operator: disconnected')).toBeVisible();
});
