import { expect, test } from '@playwright/test';

// Trivial test so the runner is proven to work.
test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cabinet design platform');
});
