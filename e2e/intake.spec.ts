import { expect, test } from '@playwright/test';
import { answerKitchen, next, question, tile } from './intake-steps';

test.beforeEach(async ({ page }) => {
  await page.goto('/intake');
  await page.evaluate(() => window.localStorage.clear());
});

test('a question waits for its answer and says what is missing', async ({ page }) => {
  await page.goto('/intake');
  await tile(page, 'Galley').click();
  await expect(next(page)).toBeDisabled();
  await expect(page.getByText('Choose ceiling height to continue')).toBeVisible();
  await page.getByRole('button', { name: 'Other height', exact: true }).click();
  await page.getByRole('textbox', { name: 'Feet' }).fill('9');
  await page.getByRole('textbox', { name: 'Inches' }).fill('6.3');
  await expect(page.getByText(/isn't on a 1\/64 inch mark/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Inches' }).fill('6.5');
  await page.getByRole('button', { name: 'To the ceiling', exact: true }).click();
  await expect(next(page)).toBeEnabled();
});

test('a kitchen is answered, finished and leads on to the room drawing', async ({ page }) => {
  await answerKitchen(page);
  await expect(page.getByText('still missing')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await expect(page.getByText('Kitchen finished.')).toBeVisible();
  // Kept after a reload (this browser only, in the preview).
  await page.reload();
  await expect(page.getByText('Kitchen finished.')).toBeVisible();
  await page.getByRole('link', { name: /Next: walls, cabinets and appliances/ }).click();
  await expect(page).toHaveURL(/\/rooms\/preview\/?$/);
});

test('a second room matches the kitchen, and a kitchen change asks about the linked room', async ({ page }) => {
  await answerKitchen(page);
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await page.getByRole('button', { name: 'Add another room' }).click();
  await expect(question(page)).toHaveText('Which room is next?');
  await page.getByRole('button', { name: 'Main bath', exact: true }).click();
  await expect(question(page)).toHaveText('How should this main bath relate to the kitchen?');
  await tile(page, 'Match the kitchen').click();
  await page.getByRole('button', { name: 'Match the kitchen (8′)', exact: true }).click();
  await page.getByRole('button', { name: 'To the ceiling', exact: true }).click();
  await next(page).click();
  await expect(question(page)).toHaveText('Which main bath inserts do you want?');
  await next(page).click();
  await expect(question(page)).toHaveText('Here is your main bath so far');
  await page.getByRole('button', { name: 'Finish main bath' }).click();

  await page.getByRole('tab', { name: /Kitchen/ }).click();
  await page.getByRole('button', { name: /^Cabinets White 2/ }).click();
  await page.getByRole('button', { name: 'White 4', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'This change affects linked rooms' });
  await expect(dialog).toContainText('Changing cabinets to White 4. Main bath is linked to this kitchen.');
  await dialog.getByRole('button', { name: /Match currently linked rooms/ }).click();
  await page.getByRole('tab', { name: /Main bath/ }).click();
  await expect(page.getByRole('button', { name: /^Cabinets White 4/ })).toBeVisible();
});
