import { expect, test, type Page } from '@playwright/test';
import { answerKitchen, next, question, tile } from './intake-steps';

const step = (page: Page, name: string) => page.getByRole('navigation', { name: 'Progress' }).getByRole('button', { name });
const roomBar = (page: Page) => page.getByRole('navigation', { name: 'Rooms' });

test.beforeEach(async ({ page }) => {
  await page.goto('/studio');
  await page.evaluate(() => window.localStorage.clear());
});

test('the start page opens the design studio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Open the design studio/ }).click();
  await expect(page).toHaveURL(/\/studio\/?$/);
  await expect(question(page)).toHaveText('Which layout is closest to your kitchen?');
});

test('the steps: design choices first; the drawing waits for them; AI design and Customize are not built yet', async ({ page }) => {
  await page.goto('/studio');
  await expect(step(page, 'Design choices')).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 'Room drawing')).toBeDisabled();
  await expect(step(page, 'AI design')).toBeDisabled();
  await expect(step(page, 'AI design')).toHaveAttribute('title', 'Not built yet.');
  await expect(step(page, 'Customize')).toBeDisabled();
  await expect(page.getByText(/Preview job · kept in this browser · Preview user \(mocked/)).toBeVisible();
});

test('a finished kitchen goes on to its drawing, started from the rough ceiling height', async ({ page }) => {
  await answerKitchen(page, '/studio');
  await expect(roomBar(page).getByRole('button', { name: /Kitchen/ })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await expect(step(page, 'Room drawing')).toBeEnabled();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();

  await expect(step(page, 'Room drawing')).toHaveAttribute('aria-current', 'step');
  // No "Start a room" form: the room starts at once, named as in the design choices, with the
  // intake's 8' ceiling as an unmeasured height (DECISIONS IK-17).
  await expect(page.getByRole('heading', { name: 'Start a room' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Room name' })).toHaveValue('Kitchen');
  const ceiling = page.getByText('Ceiling height', { exact: true }).locator('..');
  await expect(ceiling).toContainText('96"');
  await expect(ceiling).toContainText('Unmeasured');
  await expect(page.getByTestId('plan')).toBeVisible();

  // Back to the choices, and the drawing is kept.
  await step(page, 'Design choices').click();
  await expect(question(page)).toHaveText('Here is your kitchen so far');
  await step(page, 'Room drawing').click();
  await expect(page.getByRole('textbox', { name: 'Room name' })).toHaveValue('Kitchen');
});

test('every room is in the room bar, and the drawing waits until every room is finished', async ({ page }) => {
  await answerKitchen(page, '/studio');
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await page.getByRole('button', { name: /Add another room/ }).click();
  await expect(question(page)).toHaveText('Which room is next?');
  await page.getByRole('button', { name: 'Main bath', exact: true }).click();
  await expect(roomBar(page).getByRole('button')).toHaveText(['✓Kitchen', '2Main bath']);
  await expect(step(page, 'Room drawing')).toBeDisabled();

  // The room bar switches rooms.
  await roomBar(page).getByRole('button', { name: /Kitchen/ }).click();
  await expect(question(page)).toHaveText('Here is your kitchen so far');
  await roomBar(page).getByRole('button', { name: /Main bath/ }).click();
  await expect(question(page)).toHaveText('How should this main bath relate to the kitchen?');

  await tile(page, 'Match the kitchen').click();
  await page.getByRole('button', { name: 'Match the kitchen (8′)', exact: true }).click();
  await page.getByRole('button', { name: 'To the ceiling', exact: true }).click();
  await next(page).click();
  await next(page).click();
  await page.getByRole('button', { name: 'Finish main bath' }).click();
  await expect(step(page, 'Room drawing')).toBeEnabled();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();

  // Each room has its own drawing.
  await expect(page.getByRole('textbox', { name: 'Room name' })).toHaveValue('Kitchen');
  await roomBar(page).getByRole('button', { name: /Main bath/ }).click();
  await expect(page.getByRole('textbox', { name: 'Room name' })).toHaveValue('Main bath');
});
