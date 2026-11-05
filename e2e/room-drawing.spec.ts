import { expect, test, type Page } from '@playwright/test';

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' });

async function startRoom(page: Page) {
  await page.goto('/rooms/preview');
  await page.getByRole('textbox', { name: 'Room name' }).fill('Test kitchen');
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill(`8'`);
  await page.getByRole('textbox', { name: 'Wall height' }).fill(`8'`);
  await page.getByRole('textbox', { name: 'Wall thickness' }).fill('4 1/2');
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByRole('heading', { name: 'Test kitchen', level: 1 })).toBeVisible();
}

async function typeWall(page: Page, length: string, direction: string) {
  await page.getByRole('textbox', { name: 'Next wall length' }).fill(length);
  await page.getByRole("button", { name: `Add wall going ${direction}`, exact: true }).click();
}

async function typeRectangle(page: Page) {
  await typeWall(page, `12'`, 'right');
  await typeWall(page, `10'`, 'up');
  await typeWall(page, `12'`, 'left');
  await page.getByRole('button', { name: 'Close the room' }).click();
}

test('shows that it is a preview with a mocked user', async ({ page }) => {
  await page.goto('/rooms/preview');
  await expect(page.getByText('Preview: saved in this browser only')).toBeVisible();
  await expect(page.getByText(/Preview user \(mocked/)).toBeVisible();
});

test('refuses sizes that are missing or not exact, without guessing', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByText('Required.').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Wall height' }).fill('1/3');
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByText(`"1/3" isn't on a 1/64 inch mark.`, { exact: false })).toBeVisible();
});

test('types a room, adds a window, and the checks react', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await expect(page.getByRole('button', { name: /^Wall \d:/ })).toHaveCount(4);
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // A window too tall for the wall.
  await page.getByRole('button', { name: /^Wall 1:/ }).click();
  await page.getByRole('button', { name: '+ Window' }).click();
  await page.getByRole('textbox', { name: 'From wall start' }).fill('48');
  await page.getByRole('textbox', { name: 'Width' }).fill('36');
  await page.getByRole('textbox', { name: 'Height', exact: true }).fill('60');
  await page.getByRole('textbox', { name: 'Sill height' }).fill('42');
  await page.getByRole('complementary', { name: 'Details' }).getByRole('button', { name: 'Add window' }).click();
  await expect(checks(page).getByText(`(6" too tall)`, { exact: false })).toBeVisible();

  // Fix it.
  await page.getByRole('button', { name: 'Edit Height', exact: true }).click();
  await page.getByRole('textbox', { name: 'Height', exact: true }).fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // Verifying is a separate step.
  await page.getByRole('button', { name: 'Verify Height', exact: true }).click();
  await expect(page.locator('[data-provenance="verified"]')).toHaveCount(1);
});

test('typing a wall length moves the joined wall, which goes back to rough', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await page.getByRole('button', { name: /^Wall 1:/ }).click();
  await page.getByRole('button', { name: 'Edit Length' }).click();
  await page.getByRole('textbox', { name: 'Length' }).fill(`13'`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('value-Length')).toHaveText(`13' 0"`);
  await expect(page.getByText(/Wall 2 changed length because it shares that corner/)).toBeVisible();
  // The room no longer closes neatly, so wall 3 and 4 no longer meet wall 2: still no crossing.
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});

test('keeps the room after a reload, and undo works', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `12'`, 'right');
  await typeWall(page, `10'`, 'up');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Test kitchen', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Wall \d:/ })).toHaveCount(2);
  await typeWall(page, `12'`, 'left');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /^Wall \d:/ })).toHaveCount(2);
});

test('draws walls by tapping the plan', async ({ page }) => {
  await startRoom(page);
  await page.getByRole('button', { name: 'Draw walls' }).click();
  const box = await page.getByTestId('plan').boundingBox();
  if (!box) throw new Error('no plan');
  for (const [x, y] of [[150, 500], [550, 500], [550, 250], [150, 250], [150, 500]] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await page.getByRole('button', { name: 'Select' }).click();
  await expect(page.getByRole('button', { name: /^Wall \d:/ })).toHaveCount(4);
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});

test('loads the example rooms', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example L-shaped room/ }).click();
  await expect(page.getByRole('heading', { name: 'Laundry', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Wall 3: ≈ 4' 0"/ })).toBeVisible();
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});
