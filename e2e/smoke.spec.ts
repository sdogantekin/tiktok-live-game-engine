import { expect, test } from '@playwright/test';

test('broadcast page connects to the server', async ({ page }) => {
  await page.goto('/broadcast/');
  await expect(page.getByText('Broadcast: connected')).toBeVisible();
});

test('operator page connects to the server', async ({ page }) => {
  await page.goto('/operator/');
  await expect(page.getByText('Operator: connected')).toBeVisible();
});
