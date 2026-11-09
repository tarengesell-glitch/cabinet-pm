import { expect, test, type Page } from '@playwright/test';
import { answerKitchen, next, question, tile } from './intake-steps';

const step = (page: Page, name: string) => page.getByRole('navigation', { name: 'Progress' }).getByRole('button', { name });
const roomBar = (page: Page) => page.getByRole('navigation', { name: 'Rooms' });

test.beforeEach(async ({ page }) => {
  await page.goto('/studio');
  await page.evaluate(() => window.localStorage.clear());
});

test('a client page starts that client’s design in the studio', async ({ page }) => {
  await page.goto('/clients/c1/');
  await page.getByRole('link', { name: 'Start a design' }).first().click();
  await expect(page).toHaveURL(/\/studio\/\?job=c1$/);
  await expect(page.getByText('Whitfield design')).toBeVisible();
  await expect(question(page)).toHaveText('Which layout is closest to your kitchen?');
});

test('the steps: design choices first; each later step says what it waits for', async ({ page }) => {
  await page.goto('/studio');
  await expect(step(page, 'Design choices')).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 'Room drawing')).toBeDisabled();
  await expect(step(page, 'AI design')).toBeDisabled();
  await expect(step(page, 'AI design')).toHaveAttribute('title', 'Finish the design choices for kitchen first.');
  await expect(step(page, 'Customize')).toHaveAttribute('title', 'Run the AI design step first.');
  await expect(page.getByText(/^Preview job · kept in this browser · mocked user and shop$/)).toBeVisible();
  await expect(page.getByTitle(/Preview user \(mocked.*colony shop \(mocked/)).toHaveText('mocked user and shop');
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

test('the placeholder AI design lays out the drawn room, then the customize screens open', async ({ page }) => {
  test.setTimeout(180_000); // a long flow with the 3D view; slower when the whole suite runs at once
  await answerKitchen(page, '/studio/?job=c2');
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();
  await expect(step(page, 'AI design')).toBeDisabled();
  await page.getByRole('button', { name: 'Load example kitchen' }).click();
  await expect(roomBar(page).getByRole('button', { name: /Kitchen/ })).toHaveText('✓Kitchen');

  await step(page, 'AI design').click();
  await expect(page.getByText(/This animation stands in for the AI design step. No AI model is called/)).toBeVisible();
  // When every room is laid out, it moves on by itself.
  await expect(step(page, 'Customize')).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
  await expect(page.getByTestId('stage-3d').locator('canvas')).toBeVisible();
  await expect(page.getByText('Live pricing not connected yet')).toBeVisible();
  const toReview = page.getByText(/^\d+ placements to review$/);
  await expect(toReview).toBeVisible();

  // Pick a base cabinet from its run; it is marked as placed by the placeholder until approved.
  await page.getByRole('tab', { name: 'Run' }).click();
  await page.locator('button[aria-label^="Base"]').first().click();
  await page.getByRole('tab', { name: 'Cabinet' }).click();
  await expect(page.getByText('Placed by the placeholder')).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible();

  // Its type comes from the catalog, and stays within its kind.
  await page.getByRole('radiogroup', { name: 'Cabinet type' }).getByRole('radio', { name: 'Base, 4 drawers' }).click();
  await expect(page.getByRole('heading', { name: 'Base, 4 drawers' })).toBeVisible();

  // A width the cabinet beside it can't give is refused with the reason.
  await page.getByRole('textbox', { name: 'Width' }).fill('400');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/can grow by that much at most/)).toBeVisible();

  // Approve all asks first.
  await page.getByRole('button', { name: 'Approve all' }).click();
  await page.getByRole('button', { name: /Yes, approve all/ }).click();
  await expect(page.getByText('Every placement reviewed')).toBeVisible();

  // Kept after a reload: the AI step shows it as done, and only lays out again when asked.
  await page.reload();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();
  await step(page, 'AI design').click();
  await expect(page.getByRole('heading', { name: 'Your design is ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Open the customizer' }).click();
  await expect(page.getByText('Every placement reviewed')).toBeVisible();
});

test('Test data: save a job as the test start and load it into another job', async ({ page }) => {
  test.setTimeout(180_000); // a long flow with the 3D view; slower when the whole suite runs at once
  await answerKitchen(page, '/studio/?job=c2');
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();
  await page.getByRole('button', { name: 'Load example kitchen' }).click();
  await page.getByRole('button', { name: 'Test data ▾' }).click();
  await page.getByRole('menuitem', { name: 'Save this job as my test start' }).click();
  await expect(page.getByText(/Saved as your test start/)).toBeVisible();

  // Another client's job, empty, takes the saved one: answers and drawing, ready for the AI step.
  await page.goto('/studio/?job=c4');
  await expect(question(page)).toHaveText('Which layout is closest to your kitchen?');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Test data ▾' }).click();
  await page.getByRole('menuitem', { name: 'Load my test start into this job' }).click();
  await expect(question(page)).toHaveText('Here is your kitchen so far');
  await expect(step(page, 'AI design')).toBeEnabled();
  await step(page, 'Room drawing').click();
  await expect(roomBar(page).getByRole('button', { name: /Kitchen/ })).toHaveText('✓Kitchen');
});
