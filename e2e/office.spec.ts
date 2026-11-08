import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
});

test('Today shows the demo calls and tasks, and says they are placeholders', async ({ page }) => {
  await page.goto('/');
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(today);
  await expect(page.getByText(/Placeholder screens · demo data · Preview user \(mocked/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  // Joining a call is mocked, and says so.
  await page.getByRole('button', { name: 'Join Google Meet' }).click();
  await expect(page.getByRole('status')).toHaveText('Joining Google Meet is mocked in this preview.');
});

test('Tasks: tick one off and it drops away; add one', async ({ page }) => {
  await page.goto('/tasks/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('6 outstanding');
  await page.getByRole('button', { name: 'Mark Send wood samples to Priya complete' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('5 outstanding');
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Call the colony about lead times');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Call the colony about lead times')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('6 outstanding');
});

test('Clients list opens a client, with contact, notes and open tasks', async ({ page }) => {
  await page.goto('/clients/');
  await page.getByRole('link', { name: /Dana & Marcus Whitfield/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dana & Marcus Whitfield');
  await expect(page.getByText('dana.whitfield@example.com')).toBeVisible();
  await expect(page.getByText('Book site measure, Whitfield')).toBeVisible();
  await expect(page.getByText(/No design yet/)).toBeVisible();
});
