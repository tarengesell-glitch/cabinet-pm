import { expect, test, type Page } from '@playwright/test';

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' });
const wallButtons = (page: Page) => page.getByRole('button', { name: /^Wall [A-Z]+:/ });

async function startRoom(page: Page) {
  await page.goto('/rooms/preview');
  await page.getByRole('textbox', { name: 'Room name' }).fill('Test kitchen');
  await page.getByRole('textbox', { name: 'Ceiling height' }).fill(`8'`);
  await page.getByRole('button', { name: 'Start room' }).click();
  await expect(page.getByRole('heading', { name: 'Test kitchen', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Select' }).click();
}

const DIRECTION = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;

/**
 * Draws one wall the way a person does: with "Draw walls" on, point the mouse the way the
 * wall goes from the current corner, type its length, press Enter. Starts a new run of
 * walls (by clicking the plan) if none is in progress.
 */
async function typeWall(page: Page, length: string, direction: keyof typeof DIRECTION) {
  const draw = page.getByRole('button', { name: 'Draw walls' });
  if ((await draw.getAttribute('aria-pressed')) !== 'true') await draw.click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  let corner = await konvaRect(page, '.chain-start');
  if (!corner) {
    await page.mouse.click(box.x + 200, box.y + 380);
    await expect.poll(() => konvaRect(page, '.chain-start')).not.toBeNull();
    corner = (await konvaRect(page, '.chain-start'))!;
  }
  const [dx, dy] = DIRECTION[direction];
  const cx = box.x + corner.x + corner.width / 2;
  const cy = box.y + corner.y + corner.height / 2;
  await page.mouse.move(cx + dx * 60, cy + dy * 60);
  await page.keyboard.type(length);
  await page.keyboard.press('Enter');
}

/** A 12' x 10' room drawn counter-clockwise; the fourth wall closes it and ends the run. */
async function typeRectangle(page: Page) {
  await typeWall(page, `12'`, 'right');
  await typeWall(page, `10'`, 'up');
  await typeWall(page, `12'`, 'left');
  await typeWall(page, `10'`, 'down');
  await expect.poll(() => konvaRect(page, '.chain-start')).toBeNull();
  await page.getByRole('button', { name: 'Select' }).click();
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

test('new walls start at the standard 5 1/2" thickness, unmeasured', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `12'`, 'right');
  await wallButtons(page).first().click();
  await expect(page.getByTestId('value-Thickness')).toHaveText('5 1/2"');
  await expect(page.locator('[data-provenance="unmeasured"]').last()).toBeVisible();
});

test('drops a standard window, then the checks react to edits', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await expect(wallButtons(page)).toHaveCount(4);
  await expect(checks(page).getByText('No problems found')).toBeVisible();

  // A standard window drops in with no typing.
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: '+ Window' }).click();
  await expect(page.getByTestId('value-Width')).toHaveText(`36"`);
  await expect(page.getByTestId('value-Height')).toHaveText(`48"`);
  await expect(page.getByTestId('value-Sill height')).toHaveText(`36"`);
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

  // Confirming is a separate step.
  await page.getByRole('button', { name: 'Confirm Height', exact: true }).click();
  await expect(page.locator('[data-provenance="confirmed"]')).toHaveCount(1);
});

test('drops a standard door by tapping a wall with the door tool', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await page.getByRole('button', { name: 'Add door' }).click();
  // Tap the middle of wall A (the bottom wall) on the plan.
  const wall1 = page.locator('canvas');
  await expect(wall1.first()).toBeVisible();
  const box = await page.getByTestId('plan').boundingBox();
  if (!box) throw new Error('no plan');
  const point = await page.evaluate(() => {
    // Konva keeps its stages in a global list; find wall A's centre on screen.
    const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } } }[] } };
    const r = w.Konva.stages[0]!.findOne('.wall-1').getClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x + point.x, box.y + point.y);
  await expect(page.getByRole('heading', { name: /^Door on/ })).toBeVisible();
  await expect(page.getByTestId('value-Width')).toHaveText(`32"`);
  await expect(page.getByTestId('value-Height')).toHaveText(`80"`);
  await expect(page.getByTestId('value-From wall start')).toHaveText(`56"`); // centred: 72" - 16"
});

test('typing a wall length moves the joined wall across without changing its angle', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: 'Edit Length' }).click();
  await page.getByRole('textbox', { name: 'Length' }).fill(`13'`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('value-Length')).toHaveText(`156"`);
  // Wall B moved across, still 120"; wall C stretched to stay joined.
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall B: 120"/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Wall C: 156"/ })).toBeVisible();
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
  await expect(page.getByRole('button', { name: /^Wall C: ≈ 48"/ })).toBeVisible();
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

test('a right-to-left box selects walls it touches (crossing); Shift-click adds one', async ({ page }) => {
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
  // A right-to-left box across the middle of wall B only (the right wall).
  const w2 = await point('.wall-2');
  await page.mouse.move(box.x + w2.x + 30, box.y + w2.y - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + w2.x - 30, box.y + w2.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: /^Wall B/ })).toBeVisible();
  // Shift-click wall D to add it.
  const w4 = await point('.wall-4');
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + w4.x, box.y + w4.y + 80); // below the door
  await page.keyboard.up('Shift');
  await expect(page.getByRole('heading', { name: '2 walls selected' })).toBeVisible();
});

test('a left-to-right box selects only walls fully inside it (window)', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  const b = (await konvaRect(page, '.wall-2'))!;
  // Left to right, covering only part of wall B: nothing is fully inside.
  await dragFrom(page, { x: box.x + b.x - 30, y: box.y + b.y + b.height / 2 - 20 }, 60, 40);
  await expect(page.getByRole('heading', { name: /^Wall B/ })).toHaveCount(0);
  // Left to right around all of wall B: it is selected.
  await dragFrom(page, { x: box.x + b.x - 20, y: box.y + b.y - 20 }, b.width + 40, b.height + 40);
  await expect(page.getByRole('heading', { name: /^Wall B/ })).toBeVisible();
});

test('select one wall and press Delete', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).first().click();
  await expect(page.getByRole('heading', { name: /^Wall A/ })).toBeVisible();
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

  // Near wall C: the ghost snaps on, with distances to both ends of the wall.
  const wall = (await konvaRect(page, '.wall-3'))!;
  const x = box.x + wall.x + wall.width * 0.35;
  const y = box.y + wall.y + wall.height / 2 + 15;
  await page.mouse.move(x, y);
  await expect.poll(() => konvaRect(page, '.ghost-opening')).not.toBeNull();
  await expect(plan).toHaveCSS('cursor', 'copy');

  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: /^Window on/ })).toBeVisible();
  await expect(page.getByTestId('value-Width')).toHaveText(`36"`);
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

test('walls are pastel red until confirmed, then black; typing a length never confirms', async ({ page }) => {
  await startRoom(page);
  await typeRectangle(page);
  const fill = (name: string) =>
    page.evaluate((n) => {
      const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { fill: () => string } }[] } };
      return w.Konva.stages[0]!.findOne(n).fill();
    }, name);
  // Every wall was typed, and typing never confirms: all unmeasured, pastel red.
  await expect.poll(() => fill('.wall-1')).toBe('#eeb8ba');
  await expect(page.locator('[data-provenance="confirmed"]')).toHaveCount(0);
  // Confirm wall A: it turns black.
  await wallButtons(page).first().click();
  await page.getByRole('button', { name: 'Confirm Length', exact: true }).click();
  await expect.poll(() => fill('.wall-1')).toBe('#2b2f33');
  expect(await fill('.wall-2')).toBe('#eeb8ba');
  // Typing a new length on a confirmed wall makes it unmeasured again.
  await page.getByRole('button', { name: 'Edit Length' }).click();
  await page.getByRole('textbox', { name: 'Length' }).fill('140');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => fill('.wall-1')).toBe('#eeb8ba');
});

const centreOf = async (page: Page, selector: string) => {
  const r = await konvaRect(page, selector);
  if (!r) throw new Error(`${selector} is not on the plan`);
  const box = (await page.getByTestId('plan').boundingBox())!;
  return { x: box.x + r.x + r.width / 2, y: box.y + r.y + r.height / 2 };
};

async function dragFrom(page: Page, from: { x: number; y: number }, dx: number, dy: number, holdAlt = false) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (holdAlt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
  if (holdAlt) await page.keyboard.up('Alt');
}

test('a selected wall has handles: slide it by the middle, move a corner by an end', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).nth(1).click(); // wall B, the right-hand wall
  await expect(page.getByRole('heading', { name: /^Wall B/ })).toBeVisible();

  // Slide wall B outward: it keeps its length and tag, walls 1 and 3 stretch and go rough.
  await dragFrom(page, await centreOf(page, '.handle-middle'), 40, 0);
  await expect(page.getByText(/Wall A changed length/)).toBeVisible();
  await expect(page.getByTestId('value-Length')).toHaveText(`120"`);
  await expect(page.getByRole('heading', { name: /^Wall B/ })).toBeVisible(); // still selected

  // One undo puts it back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall A: 144"/ })).toBeVisible();

  // Drag wall B's top end up: wall B gets longer along its own line; nothing changes angle.
  await wallButtons(page).nth(1).click();
  await dragFrom(page, await centreOf(page, '.handle-end'), 25, -40); // sideways part is ignored
  await expect(page.getByTestId('value-Length')).not.toHaveText(`120"`);
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall C: 144"/ })).toBeVisible(); // top wall moved up, same length
  await expect(page.getByRole('button', { name: /^Wall D: / })).not.toHaveText(/^Wall D: 120"/);
  await expect(page.locator('[data-provenance="unmeasured"]').first()).toBeVisible();
});

test('a wall drawn back over the last one is refused', async ({ page }) => {
  await startRoom(page);
  await typeWall(page, `6'`, 'right');
  await typeWall(page, `2'`, 'left');
  await expect(page.getByText(/would run back over wall A/)).toBeVisible();
  await expect(wallButtons(page)).toHaveCount(1);
});

test('a problem wall gets a dashed outline, not a glow', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await expect.poll(() => konvaRect(page, '.issue-outline')).toBeNull();
  // Option/Alt-drag wall C's far corner (a free move) down past the bottom wall, so walls cross.
  await wallButtons(page).nth(2).click();
  const corner = await centreOf(page, '.handle-end');
  const bottom = await centreOf(page, '.wall-1');
  await dragFrom(page, corner, 40, bottom.y + 40 - corner.y, true);
  await expect(page.getByRole('region', { name: 'Checks' }).getByText(/cross each other/)).toBeVisible();
  await expect.poll(() => konvaRect(page, '.issue-outline')).not.toBeNull();
});

test('walls are lettered A, B, C in circles', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  for (const letter of ['A', 'B', 'C', 'D']) {
    await expect.poll(() => konvaRect(page, `.wall-tag-${letter}`)).not.toBeNull();
  }
  await expect(page.getByRole('button', { name: /^Wall A: 144"/ })).toBeVisible();
});

test('a door can be set to left or right hand and to swing in or out', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await wallButtons(page).nth(3).click(); // wall D has the door
  await page.getByRole('button', { name: /^Door 1:/ }).click();
  const hand = page.getByRole('group', { name: 'Hinge side' });
  const swing = page.getByRole('group', { name: 'Swing' });
  await expect(swing.getByRole('button', { name: 'Swings in' })).toHaveAttribute('aria-pressed', 'true');
  const leafBefore = (await konvaRect(page, '.door-leaf'))!;
  await swing.getByRole('button', { name: 'Swings out' }).click();
  await expect(swing.getByRole('button', { name: 'Swings out' })).toHaveAttribute('aria-pressed', 'true');
  const pressed = await hand.getByRole('button', { pressed: true }).textContent();
  await hand.getByRole('button', { pressed: false }).click();
  await expect(hand.getByRole('button', { pressed: true })).not.toHaveText(pressed!);
  const leafAfter = (await konvaRect(page, '.door-leaf'))!;
  expect(leafAfter.x === leafBefore.x && leafAfter.y === leafBefore.y).toBe(false); // redrawn the other way
});

test('a window can be dragged onto another wall and resized from its ends', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  // Drag the window from wall A (bottom) onto wall C (top).
  const win = await centreOf(page, '.opening-window');
  const top = await centreOf(page, '.wall-3');
  await dragFrom(page, win, top.x - win.x, top.y - win.y);
  await expect(page.getByRole('heading', { name: /^Window on/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Window on/ }).getByRole('button')).toHaveText('wall C');
  // Widen it from its end handle.
  const end = await centreOf(page, '.opening-handle-end');
  await dragFrom(page, end, 40, 0);
  await expect(page.getByTestId('value-Width')).not.toHaveText('36"');
  // One undo puts the width back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('value-Width')).toHaveText('36"');
});

test('trackpad scroll moves the plan; middle-drag and Space+drag pan; Shift+1 fits', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const plan = page.getByTestId('plan');
  const box = (await plan.boundingBox())!;
  const x0 = (await konvaRect(page, '.wall-1'))!;
  // A trackpad two-finger scroll sends small, fine-grained deltas: it pans (up/down too), it doesn't zoom.
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="plan"] canvas')!;
    for (let i = 0; i < 10; i++) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 3.5, deltaY: 6.25, bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
    }
  });
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  const x1 = (await konvaRect(page, '.wall-1'))!;
  expect(x1.y).toBeLessThan(x0.y - 30);
  expect(x1.x).toBeLessThan(x0.x - 20);

  // Middle-button drag pans.
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + 360, box.y + 300, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => (await konvaRect(page, '.wall-1'))!.x).toBeGreaterThan(x1.x + 40);

  // Space + drag pans too, without selecting anything.
  const x2 = (await konvaRect(page, '.wall-1'))!;
  await page.keyboard.down('Space');
  await dragFrom(page, { x: box.x + 300, y: box.y + 300 }, 0, 50);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await konvaRect(page, '.wall-1'))!.y).toBeGreaterThan(x2.y + 30);

  // Shift+1 fits the room again.
  await page.keyboard.press('Shift+Digit1');
  await expect.poll(async () => (await konvaRect(page, '.wall-1'))!.y).toBeCloseTo(x0.y, 0);
});

test('while drawing walls, type a length and press Enter', async ({ page }) => {
  await startRoom(page);
  await page.getByRole('button', { name: 'Draw walls' }).click();
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.mouse.click(box.x + 150, box.y + 450);
  await page.mouse.move(box.x + 400, box.y + 452); // point to the right
  await page.keyboard.type('100 1/2');
  await expect.poll(() => konvaRect(page, '.typed-length')).not.toBeNull();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Select' }).click();
  await expect(page.getByRole('button', { name: /^Wall A: 100 1\/2"/ })).toBeVisible();
});

test('click a wall length on the plan and type a new one', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await page.mouse.click(...Object.values(await centreOf(page, '.wall-length-1')) as [number, number]);
  const box = page.getByRole('textbox', { name: 'Wall length' });
  await expect(box).toHaveValue('144"');
  // Not exact: refused, with the reason, and nothing changes.
  await box.fill('1/3');
  await box.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: /1\/64/ })).toBeVisible();
  // A good length: wall A becomes 150"; wall B moves across, keeping its angle.
  await box.fill('150');
  await box.press('Enter');
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId('value-Length')).toHaveText('150"');
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall B: 120"/ })).toBeVisible();
  // Escape leaves the length as it was.
  await page.mouse.click(...Object.values(await centreOf(page, '.wall-length-1')) as [number, number]);
  await page.getByRole('textbox', { name: 'Wall length' }).fill('99');
  await page.getByRole('textbox', { name: 'Wall length' }).press('Escape');
  await page.getByRole('button', { name: '← Room' }).click();
  await expect(page.getByRole('button', { name: /^Wall A: 150"/ })).toBeVisible();
});

test('a wall with a window shows the measurements to and across it, plus the overall', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  const text = (name: string) =>
    page.evaluate((n) => {
      const w = window as unknown as { Konva: { stages: { findOne: (s: string) => { text: () => string } | undefined }[] } };
      return w.Konva.stages[0]!.findOne(n)?.text() ?? null;
    }, name);
  // Wall A is 144" with a 36" window starting 48" from its start: 48" | 36" | 60".
  await expect.poll(() => text('.wall-1-segment-1-text')).toBe('48"');
  expect(await text('.wall-1-segment-2-text')).toBe('36"');
  expect(await text('.wall-1-segment-3-text')).toBe('60"');
  expect(await text('.wall-length-1')).toBe('144"');
  // A wall with no openings shows only its overall length.
  expect(await text('.wall-2-segment-1-text')).toBeNull();
});

test('drawing more walls later: the plan holds still and walls start where you click', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await page.getByRole('button', { name: 'Draw walls' }).click();
  const before = (await page.getByTestId('plan').boundingBox())!;
  const c = await centreOf(page, '.wall-3'); // the top wall
  await page.mouse.click(c.x + 40, c.y + 60); // inside the room, away from walls
  const after = (await page.getByTestId('plan').boundingBox())!;
  expect(after.y).toBe(before.y); // the toolbar didn't grow and push the plan down
  const start = await centreOf(page, '.chain-start');
  expect(Math.abs(start.y - (c.y + 60))).toBeLessThanOrEqual(3); // within an inch of the click
  expect(Math.abs(start.x - (c.x + 40))).toBeLessThanOrEqual(3);
});

test('a new wall snaps onto the middle of an existing wall', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await page.getByRole('button', { name: 'Draw walls' }).click();
  const c = await centreOf(page, '.wall-3');
  await page.mouse.click(c.x + 40, c.y + 8); // 8 px off wall C
  const start = await centreOf(page, '.chain-start');
  expect(Math.abs(start.y - c.y)).toBeLessThanOrEqual(1); // on the wall
  await page.mouse.click(c.x + 40, c.y + 150);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Select' }).click();
  await expect(wallButtons(page)).toHaveCount(5);
  await expect(checks(page).getByText('No problems found')).toBeVisible(); // a stub wall, not a crossing
});

test('a floating wall for an island or peninsula: a line, no thickness, no doors', async ({ page }) => {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await page.getByRole('button', { name: 'Floating wall' }).click();
  const c = await centreOf(page, '.wall-3');
  await page.mouse.click(c.x - 80, c.y + 120);
  await page.mouse.click(c.x + 80, c.y + 120);
  // One line drawn; the tool stops after it.
  await expect.poll(() => konvaRect(page, '.chain-start')).toBeNull();
  await page.getByRole('button', { name: 'Select' }).click();
  await wallButtons(page).nth(4).click();
  await expect(page.getByRole('group', { name: 'Wall kind' }).getByRole('button', { name: 'Floating wall' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('value-Thickness')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Window' })).toHaveCount(0);
  await expect(checks(page).getByText('No problems found')).toBeVisible();
  // A room wall with a window can't become floating.
  await page.getByRole('button', { name: '← Room' }).click();
  await wallButtons(page).first().click();
  await page.getByRole('group', { name: 'Wall kind' }).getByRole('button', { name: 'Floating wall' }).click();
  await expect(page.getByText(/Move or delete the doors and windows on wall A first/)).toBeVisible();
});
