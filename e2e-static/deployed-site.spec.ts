import { expect, test } from '@playwright/test';

// Checks the built files exactly as Netlify serves them (out/, no Next.js server).

test('the home page loads and links to the room drawing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cabinet design platform');
  await page.getByRole('link', { name: 'Room drawing' }).click();
  await expect(page.getByRole('heading', { name: 'Start a room' })).toBeVisible();
});

test('the design choices load at /intake (with or without a trailing slash)', async ({ page }) => {
  for (const path of ['/intake', '/intake/']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which layout is closest to your kitchen?');
  }
});

test('the room drawing works at /rooms/preview (with or without a trailing slash)', async ({ page }) => {
  for (const path of ['/rooms/preview', '/rooms/preview/']) {
    await page.goto(path);
    await expect(page.getByText('Preview: saved in this browser only')).toBeVisible();
  }
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await expect(page.getByRole('region', { name: 'Checks' }).getByText('No problems found')).toBeVisible();
});

test('an unknown address shows a page-not-found page', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
});
