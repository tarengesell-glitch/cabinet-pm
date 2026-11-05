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

test('drag a box to select several walls, then press Delete', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const box = await page.getByTestId('plan').boundingBox();
  if (!box) throw new Error('no plan');
  // A box over the whole plan, starting on empty space.
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: '4 walls selected' })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('heading', { name: /walls selected/ })).toHaveCount(0);
  await expect(wallButtons(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(wallButtons(page)).toHaveCount(4);
});

test('a small box selects just the walls it touches; Shift-click adds one', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const point = (name: string) =>
    page.evaluate((n) => {
      const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } }[] } };
      const r = w.Konva.stages[0]!.findOne(n).getClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, name);
  const box = await page.getByTestId('plan').boundingBox();
  if (!box) throw new Error('no plan');
  // A box across the middle of wall 2 only (the right wall).
  const w2 = await point('.wall-2');
  await page.mouse.move(box.x + w2.x - 30, box.y + w2.y - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + w2.x + 30, box.y + w2.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: /^Wall 2/ })).toBeVisible();
  // Shift-click wall 4 to add it.
  const w4 = await point('.wall-4');
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + w4.x, box.y + w4.y + 80); // below the door
  await page.keyboard.up('Shift');
  await expect(page.getByRole('heading', { name: '2 walls selected' })).toBeVisible();
});

test('select one wall and press Delete', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).first().click();
  await expect(page.getByRole('heading', { name: /^Wall 1/ })).toBeVisible();
  await page.keyboard.press('Backspace'); // the Mac "delete" key
  await expect(wallButtons(page)).toHaveCount(3);
});

test('Delete does nothing while typing in a box', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: 'Edit Length' }).click();
  await page.getByRole('textbox', { name: 'Length' }).press('Backspace');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(wallButtons(page)).toHaveCount(4);
});

const konvaRect = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } | undefined }[] } };
    const node = w.Konva.stages[0]!.findOne(sel);
    return node ? node.getClientRect() : null;
  }, selector);

test('a window ghost follows the cursor, snaps to a wall, and lands where it showed', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await page.getByRole('button', { name: 'Add window' }).click();
  const plan = page.getByTestId('plan');
  const box = (await plan.boundingBox())!;

  // Off any wall: a faint ghost, a no-entry cursor, and a click does nothing.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => konvaRect(page, '.ghost-floating')).not.toBeNull();
  await expect(plan).toHaveCSS('cursor', 'not-allowed');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('heading', { name: /^Window on/ })).toHaveCount(0);

  // Near wall 3: the ghost snaps on, with distances to both ends of the wall.
  const wall = (await konvaRect(page, '.wall-3'))!;
  const x = box.x + wall.x + wall.width * 0.35;
  const y = box.y + wall.y + wall.height / 2 + 15;
  await page.mouse.move(x, y);
  await expect.poll(() => konvaRect(page, '.ghost-opening')).not.toBeNull();
  await expect(plan).toHaveCSS('cursor', 'copy');

  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: /^Window on/ })).toBeVisible();
  await expect(page.getByTestId('value-Width')).toHaveText(`3' 0"`);
});

test('the scroll wheel zooms, a sideways scroll moves left and right, Fit resets', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  await page.mouse.wheel(0, -400); // wheel up: zoom in
  await expect(page.getByTestId('zoom-level')).not.toHaveText('100%');
  const zoomedIn = Number((await page.getByTestId('zoom-level').textContent())!.replace('%', ''));
  expect(zoomedIn).toBeGreaterThan(100);

  const before = (await konvaRect(page, '.wall-1'))!;
  await page.mouse.wheel(200, 0); // sideways wheel: move left/right, no zoom
  await expect.poll(async () => (await konvaRect(page, '.wall-1'))!.x).toBeLessThan(before.x - 50);
  await expect(page.getByTestId('zoom-level')).toHaveText(`${zoomedIn}%`);

  await page.mouse.wheel(0, 800); // wheel down: zoom out
  await expect.poll(async () => Number((await page.getByTestId('zoom-level').textContent())!.replace('%', ''))).toBeLessThan(zoomedIn);

  await page.getByRole('button', { name: 'Fit the room on screen' }).click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
});

test('rough walls are a soft pastel red', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `12'`, 'right');
  await typeWall(page, `10'`, 'up');
  await page.getByRole('button', { name: 'Close the room' }).click(); // the closing wall is rough
  const fill = (name: string) =>
    page.evaluate((n) => {
      const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { fill: () => string } }[] } };
      return w.Konva.stages[0]!.findOne(n).fill();
    }, name);
  await expect.poll(() => fill('.wall-3')).toBe('#eeb8ba');
  expect(await fill('.wall-1')).not.toBe('#eeb8ba'); // typed, so measured
});

const centreOf = async (page: Page, selector: string) => {
  const r = await konvaRect(page, selector);
  if (!r) throw new Error(`${selector} is not on the plan`);
  const box = (await page.getByTestId('plan').boundingBox())!;
  return { x: box.x + r.x + r.width / 2, y: box.y + r.y + r.height / 2 };
};

async function dragFrom(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
}

test('a selected wall has handles: slide it by the middle, move a corner by an end', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).nth(1).click(); // wall 2, the right-hand wall
  await expect(page.getByRole('heading', { name: /^Wall 2/ })).toBeVisible();

  // Slide wall 2 outward: it keeps its length and tag, walls 1 and 3 stretch and go rough.
  await dragFrom(page, await centreOf(page, '.handle-middle'), 40, 0);
  await expect(page.getByText(/Wall 1 changed length/)).toBeVisible();
  await expect(page.getByTestId('value-Length')).toHaveText(`10' 0"`);
  await expect(page.getByRole('heading', { name: /^Wall 2/ })).toBeVisible(); // still selected

  // One undo puts it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall 1: 12' 0"/ })).toBeVisible();

  // Move wall 2's top corner straight up: wall 2 gets longer.
  await wallButtons(page).nth(1).click();
  await dragFrom(page, await centreOf(page, '.handle-end'), 0, -40);
  await expect(page.getByTestId('value-Length')).not.toHaveText(`10' 0"`);
  await expect(page.locator('[data-provenance="rough"]').first()).toBeVisible();
});

test('a wall drawn back over the last one is refused', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `6'`, 'right');
  await typeWall(page, `2'`, 'left');
  await expect(page.getByText(/would run back over wall 1/)).toBeVisible();
  await expect(wallButtons(page)).toHaveCount(1);
});

test('a problem wall gets a dashed outline, not a glow', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await expect.poll(() => konvaRect(page, '.issue-outline')).toBeNull();
  // Drag wall 3's far corner down past the bottom wall, so walls cross.
  await wallButtons(page).nth(2).click();
  const corner = await centreOf(page, '.handle-end');
  const bottom = await centreOf(page, '.wall-1');
  await dragFrom(page, corner, 40, bottom.y + 40 - corner.y);
  await expect(page.getByRole('region', { name: 'Checks' }).getByText(/cross each other/)).toBeVisible();
  await expect.poll(() => konvaRect(page, '.issue-outline')).not.toBeNull();
});
