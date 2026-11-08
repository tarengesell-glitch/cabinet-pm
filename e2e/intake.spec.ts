import { expect, test, type Page } from '@playwright/test';

const question = (page: Page) => page.getByRole('heading', { level: 1 });
/** A picture or card choice, by the start of its name. */
const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
const next = (page: Page) => page.getByRole('button', { name: 'Next ›' });

/** Answers the kitchen from the first question to the review. */
async function answerKitchen(page: Page) {
  await page.goto('/intake');
  await expect(question(page)).toHaveText('Which layout is closest to your kitchen?');
  await tile(page, 'Galley').click();
  await expect(question(page)).toHaveText('How tall are the ceiling and the cabinets?');
  await page.getByRole('button', { name: '8′', exact: true }).first().click();
  await page.getByRole('button', { name: 'To the ceiling', exact: true }).click();
  await next(page).click();
  await tile(page, 'Country').click();
  await tile(page, 'Solid painted').click();
  await expect(question(page)).toHaveText('Pick a colour mood for doors and counters');
  await expect(page.getByText('Showing solid painted shaker options, based on your earlier answers.')).toBeVisible();
  await tile(page, 'White doors Medium counters').click();
  await tile(page, 'Country').click();
  await expect(question(page)).toHaveText('Choose your colours');
  await page.getByRole('button', { name: 'White 2', exact: true }).click();
  await page.getByRole('button', { name: 'Medium 1', exact: true }).click();
  await next(page).click();
  await tile(page, 'Handles only').click();
  await tile(page, 'Bar pull').click();
  await page.getByRole('button', { name: '5″', exact: true }).click();
  await page.getByRole('button', { name: 'Matte black', exact: true }).click();
  await next(page).click();
  await tile(page, 'Vertical').click();
  await tile(page, 'Centred').click();
  await next(page).click();
  await tile(page, 'Crown').click();
  await page.getByRole('button', { name: 'Match primary colour', exact: true }).click();
  await next(page).click();
  await tile(page, 'Flat').click();
  await page.getByRole('button', { name: 'Match primary colour', exact: true }).click();
  await next(page).click();
  await tile(page, 'Lazy Susan').click();
  await expect(question(page)).toHaveText('Which drawer organizers do you want?');
  await next(page).click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await tile(page, 'White').click();
  await tile(page, 'Moderate').click();
  await expect(question(page)).toHaveText('Here is your kitchen so far');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/intake');
  await page.evaluate(() => window.localStorage.clear());
});

test('the home page puts the design choices before the room drawing', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('listitem').getByRole('link');
  await expect(links).toHaveText(['Design choices', 'Room drawing']);
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
