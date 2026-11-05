import { expect, test, type Page } from '@playwright/test';

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' });
const wallButtons = (page: Page) => page.getByRole('button', { name: /^Wall \d:/ });

async function startRoom(page: Page) {
  await page.goto('/rooms/preview');
  await page.getByRole('textbox', { name: 'Room name' }).fill('Test kitchen');
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill(`8'`);
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByRole('heading', { name: 'Test kitchen', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Select' }).click();
}

async function typeWall(page: Page, length: string, direction: string) {
  await page.getByRole('textbox', { name: 'Next wall length' }).fill(length);
  await page.getByRole('button', { name: `Add wall going ${direction}`, exact: true }).click();
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

test('asks only for a name and ceiling height, and refuses sizes that are not exact', async ({ page }) => {
  await page.goto('/rooms/preview');
  await expect(page.getByRole('textbox', { name: 'Wall height' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByText('Required.').first()).toBeVisible();
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill('1/3');
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByText(`"1/3" isn't on a 1/64 inch mark.`, { exact: false })).toBeVisible();
});

test('new walls start at the standard 5 1/2" thickness, rough', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `12'`, 'right');
  await wallButtons(page).first().click();
  await expect(page.getByTestId('value-Thickness')).toHaveText('5 1/2"');
  await expect(page.locator('[data-provenance="rough"]').last()).toBeVisible();
});

test('drops a standard window, then the checks react to edits', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await expect(wallButtons(page)).toHaveCount(4);
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // A standard window drops in with no typing.
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: '+ Window' }).click();
  await expect(page.getByTestId('value-Width')).toHaveText(`3' 0"`);
  await expect(page.getByTestId('value-Height')).toHaveText(`4' 0"`);
  await expect(page.getByTestId('value-Sill height')).toHaveText(`3' 0"`);
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // Make it too tall for the 8' ceiling.
  await page.getByRole('button', { name: 'Edit Height', exact: true }).click();
  await page.getByRole('textbox', { name: 'Height', exact: true }).fill('64');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(checks(page).getByText(`(4" too tall)`, { exact: false })).toBeVisible();

  // Fix it.
  await page.getByRole('button', { name: 'Edit Height', exact: true }).click();
  await page.getByRole('textbox', { name: 'Height', exact: true }).fill('48');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // Verifying is a separate step.
  await page.getByRole('button', { name: 'Verify Height', exact: true }).click();
  await expect(page.locator('[data-provenance="verified"]')).toHaveCount(1);
});

test('drops a standard door by tapping a wall with the door tool', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await page.getByRole('button', { name: 'Add door' }).click();
  // Tap the middle of wall 1 (the bottom wall) on the plan.
  const wall1 = page.locator('canvas');
  await expect(wall1.first()).toBeVisible();
  const box = await page.getByTestId('plan').boundingBox();
  if (!box) throw new Error('no plan');
  const point = await page.evaluate(() => {
    // Konva keeps its stages in a global list; find wall 1's centre on screen.
    const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } }[] } };
    const r = w.Konva.stages[0]!.findOne('.wall-1').getClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x + point.x, box.y + point.y);
  await expect(page.getByRole('heading', { name: /^Door on/ })).toBeVisible();
  await expect(page.getByTestId('value-Width')).toHaveText(`2' 8"`);
  await expect(page.getByTestId('value-Height')).toHaveText(`6' 8"`);
  await expect(page.getByTestId('value-From wall start')).toHaveText(`4' 8"`); // centred: 72" - 16"
});

test('typing a wall length moves the joined wall, which goes back to rough', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: 'Edit Length' }).click();
  await page.getByRole('textbox', { name: 'Length' }).fill(`13'`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('value-Length')).toHaveText(`13' 0"`);
  await expect(page.getByText(/Wall 2 changed length because it shares that corner/)).toBeVisible();
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});

test('keeps the room after a reload, and undo works', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `12'`, 'right');
  await typeWall(page, `10'`, 'up');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Test kitchen', level: 1 })).toBeVisible();
  await expect(wallButtons(page)).toHaveCount(2);
  await typeWall(page, `12'`, 'left');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(wallButtons(page)).toHaveCount(2);
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
  await expect(wallButtons(page)).toHaveCount(4);
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});

test('loads the example rooms', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example L-shaped room/ }).click();
  await expect(page.getByRole('heading', { name: 'Laundry', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Wall 3: ≈ 4' 0"/ })).toBeVisible();
  await expect(checks(page).getByText('No problems found')).toBeVisible();
});
