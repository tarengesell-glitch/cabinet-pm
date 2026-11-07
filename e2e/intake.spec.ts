import { expect, test, type Page } from '@playwright/test';

// The kitchen intake preview (src/modules/intake): one question at a time, picked by clicking pictures.

const prompt = (page: Page) => page.locator('#intake-prompt');
const option = (page: Page, name: string) => page.getByRole('group').getByRole('button', { name, exact: true });
const summary = (page: Page) => page.getByRole('complementary', { name: 'Your answers' });
const saved = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('cabinet-pm.intake-preview.kitchen.v0') ?? 'null') as { answers: Record<string, { status: string; choice?: { option?: string; counts?: Record<string, number> } }> } | null);

test.beforeEach(async ({ page }) => {
  await page.goto('/intake/preview');
  await expect(prompt(page)).toHaveText('What shape is the kitchen?');
});

test('says it is a preview, with placeholder images and a mocked user', async ({ page }) => {
  await expect(page.getByText('Preview: saved in this browser only')).toBeVisible();
  await expect(page.getByText('Placeholder images')).toBeVisible();
  await expect(page.getByText(/Preview user \(mocked/)).toBeVisible();
  await expect(page.getByText('Placeholder', { exact: true }).first()).toBeVisible();
});

test('a pick moves on by itself, and the summary keeps it', async ({ page }) => {
  await option(page, 'Galley').click();
  await expect(prompt(page)).toHaveText('How high is the ceiling?');
  await expect(summary(page).getByRole('button', { name: /Shape\s*Galley/ })).toBeVisible();
  expect((await saved(page))?.answers.shape?.choice?.option).toBe('galley');

  // Number keys pick too; Back returns to the earlier answer, still selected.
  await page.keyboard.press('2');
  await expect(prompt(page)).toHaveText('How high should the cabinets go?');
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(option(page, "8'")).toHaveAttribute('aria-pressed', 'true');
});

test('island questions appear only for a shape with an island', async ({ page }) => {
  await option(page, 'Galley').click();
  await expect(prompt(page)).toHaveText('How high is the ceiling?');
  await expect(summary(page).getByText('Island', { exact: true })).toHaveCount(0);

  await summary(page).getByRole('button', { name: /Shape/ }).click();
  await option(page, 'L-Shape with Island').click();
  await expect(prompt(page)).toHaveText('How high is the ceiling?');
  await expect(summary(page).getByRole('button', { name: /Island colour\s*Not answered/ })).toBeVisible();
});

test('options not supplied yet can only be flagged for follow-up', async ({ page }) => {
  await summary(page).getByRole('button', { name: /Door colour/ }).click();
  await expect(page.getByText('Options not supplied yet')).toBeVisible();
  await page.getByRole('button', { name: 'Flag for follow-up' }).click();
  await expect(prompt(page)).toHaveText('Pick the counter colour.');
  await expect(summary(page).getByRole('button', { name: /Door colour\s*Needs follow-up/ })).toBeVisible();
});

test('organizer counts are saved, and the drawer cost says it is not available rather than showing a number', async ({ page }) => {
  await summary(page).getByRole('button', { name: /Organizers/ }).click();
  await page.getByRole('button', { name: 'More: Cutlery' }).click();
  await page.getByRole('button', { name: 'More: Spice' }).click();
  await page.getByRole('button', { name: 'More: Spice' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(summary(page).getByRole('button', { name: /Organizers\s*1 cutlery, 2 spice/ })).toBeVisible();
  expect((await saved(page))?.answers.organizers?.choice?.counts).toEqual({ cutlery: 1, utility: 0, spice: 2, tray: 0 });

  await summary(page).getByRole('button', { name: /Drawers/ }).click();
  await expect(page.getByText(/Cost of drawers: not available yet/)).toBeVisible();
});

test('the review never claims complete while anything is open, and answers survive a reload', async ({ page }) => {
  await option(page, 'U Shape').click();
  await expect(prompt(page)).toHaveText('How high is the ceiling?');
  await page.getByRole('button', { name: 'Not sure' }).click();
  await page.getByRole('button', { name: 'Review answers' }).click();
  await expect(page.locator('#intake-review')).toHaveText(/^1 of \d+ questions answered$/);
  await expect(page.getByText(/1 not sure/)).toBeVisible();

  await page.reload();
  await expect(summary(page).getByRole('button', { name: /Shape\s*U Shape/ })).toBeVisible();
  await expect(summary(page).getByRole('button', { name: /Ceiling height\s*Not sure/ })).toBeVisible();
});

test('saved answers that no longer fit are listed in red, not dropped quietly', async ({ page }) => {
  await page.evaluate(() =>
    window.localStorage.setItem('cabinet-pm.intake-preview.kitchen.v0', JSON.stringify({ answers: { shape: { status: 'selected', choice: { kind: 'option', option: 'round' }, by: 'u', at: 'x' } } })),
  );
  await page.reload();
  await expect(page.getByRole('alert').getByText(/Some saved answers couldn’t be used/)).toBeVisible();
  await expect(page.getByRole('alert').getByText(/has no option "round"/)).toBeVisible();
});
