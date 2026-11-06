import { expect, test, type Page } from '@playwright/test';

// The "Cabinets & islands" and "Appliances" steps (DECISIONS 2026-11-06): mark where cabinetry goes and where
// appliances will likely sit, on a room already drawn.

const IN = 64;

type Saved = {
  job: {
    rooms: {
      walls: {
        kind: string;
        runs: { kind: string; offset: number; length: number; depth: number }[];
        appliances: { kind: string; offset: number; paired_with: string | null; placement_id: string }[];
      }[];
    }[];
  };
};

/** What the preview keeps in this browser: the master copy as saved after every change. */
const saved = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('cabinet-pm.room-preview.v0') ?? 'null') as unknown) as Promise<Saved>;
const walls = async (page: Page) => (await saved(page)).job.rooms[0]!.walls;

const konva = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const w = window as unknown as { Konva: { stages: { find: (s: string) => { getClientRect: () => { x: number; y: number; width: number; height: number } }[] }[] } };
    return w.Konva.stages[0]!.find(sel).map((n) => n.getClientRect());
  }, selector);

/** Starts from the example kitchen with its layout cleared, with the Cabinets & islands step open. */
async function bareKitchen(page: Page) {
  await page.goto('/rooms/preview');
  await page.getByRole('button', { name: /Example kitchen/ }).click();
  await page.evaluate(() => {
    const raw = JSON.parse(window.localStorage.getItem('cabinet-pm.room-preview.v0')!);
    for (const w of raw.job.rooms[0].walls) {
      w.runs = [];
      w.appliances = [];
    }
    window.localStorage.setItem('cabinet-pm.room-preview.v0', JSON.stringify(raw));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cabinets & islands' }).click();
}

/**
 * Screen position of a room point, in inches from the kitchen's first corner. The example kitchen
 * is 144" x 120", drawn counter-clockwise: wall A along the bottom, wall D up the left side.
 */
async function plotter(page: Page) {
  const box = (await page.getByTestId('plan').boundingBox())!;
  const [a] = await konva(page, '.wall-1');
  const [d] = await konva(page, '.wall-4');
  const ax = a!.x + a!.width / 2;
  const ay = a!.y + a!.height / 2;
  const dx = d!.x + d!.width / 2;
  const scale = (ax - dx) / 72;
  return (x: number, y: number) => ({ x: box.x + dx + x * scale, y: box.y + ay - y * scale });
}

test('tap two walls: runs to the inside corners and a corner cabinet where they meet', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  let p = at(100, 12); // just inside wall A, clear of the window
  await page.mouse.click(p.x, p.y);
  p = at(132, 60); // just inside wall B
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await walls(page))[1]!.runs.length).toBe(1);
  const [a, b] = await walls(page);
  // The kitchen's walls are 4 1/2" thick: cabinets reach the inside corners, 2 1/4" in.
  expect(a!.runs).toEqual([{ run_id: expect.any(String), kind: 'base_upper', offset: 2.25 * IN, length: 139.5 * IN, depth: 24 * IN }]);
  expect(b!.runs[0]!.offset).toBe(2.25 * IN);
  expect(await konva(page, '.corner-base')).toHaveLength(1);
  expect(await konva(page, '.corner-upper')).toHaveLength(1);
  await expect(page.getByRole('region', { name: 'Checks' })).toContainText('No problems found');
});

test('split a run, make one part all pantry, and move the divider', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  const p = at(70, 108); // just inside wall C (the top wall), which has no window
  await page.mouse.click(p.x, p.y);
  const frame = page.getByRole('region', { name: 'Cabinet runs' });
  await expect(frame).toContainText('Selected: run on wall C');
  await frame.getByRole('button', { name: 'Split', exact: true }).click();
  await frame.getByRole('button', { name: 'All pantry' }).click();
  await expect.poll(async () => (await walls(page))[2]!.runs.map((r) => r.kind).sort()).toEqual(['base_upper', 'pantry']);
  // The divider has a handle; drag it 12" along the wall.
  const [handle] = await konva(page, '.joint-handle');
  const box = (await page.getByTestId('plan').boundingBox())!;
  const hx = box.x + handle!.x + handle!.width / 2;
  const hy = box.y + handle!.y + handle!.height / 2;
  const before = (await walls(page))[2]!.runs.map((r) => r.offset).sort((x, y) => x - y)[1]!;
  const scale = (at(1, 0).x - at(0, 0).x);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 6 * scale, hy, { steps: 4 });
  await page.mouse.move(hx + 12 * scale, hy, { steps: 4 });
  await page.mouse.up();
  // Wall C runs right to left, so moving right on screen moves the divider towards C's start.
  await expect.poll(async () => (await walls(page))[2]!.runs.map((r) => r.offset).sort((x, y) => x - y)[1]).toBe(before - 12 * IN);
});

test('pick a sink in the tray and tap a wall: it is placed with a dishwasher beside it', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  await page.getByRole('button', { name: 'Appliances', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Appliances' });
  await tray.getByRole('button', { name: /^Sink/ }).click();
  await expect(tray.getByRole('button', { name: /^Sink/ })).toHaveAttribute('aria-pressed', 'true');
  // Nothing is placed until the plan is tapped.
  expect((await walls(page)).flatMap((w) => w.appliances)).toEqual([]);
  const p = at(70, 10); // near wall A's window (48"–84")
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await walls(page))[0]!.appliances.map((a) => a.kind)).toEqual(['sink', 'dishwasher']);
  const [sink, dw] = (await walls(page))[0]!.appliances;
  expect(sink!.offset).toBe(50 * IN); // centred under the window
  expect(dw!.paired_with).toBe(sink!.placement_id);
  // A short run went under them, so the checks pass.
  await expect(page.getByRole('region', { name: 'Checks' })).toContainText('No problems found');
  // The sink is selected; its options pop up next to it. Select the dishwasher and swap sides.
  await expect(page.getByRole('dialog', { name: 'Sink' })).toBeVisible();
  const [dwShape] = await konva(page, '.appliance-dishwasher');
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.mouse.click(box.x + dwShape!.x + dwShape!.width / 2, box.y + dwShape!.y + dwShape!.height / 2);
  await page.getByRole('dialog', { name: 'Dishwasher' }).getByRole('button', { name: 'Move to other side of sink' }).click();
  await expect.poll(async () => (await walls(page))[0]!.appliances.find((a) => a.kind === 'dishwasher')!.offset).toBe(26 * IN);
});

test('drag a fridge from the tray onto a bare wall: a short run goes under it', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  const p = at(12, 60); // just inside wall D, clear of its door (30"–62" from D's start, at the top)
  const box = (await page.getByTestId('plan').boundingBox())!;
  await page.getByRole('button', { name: 'Appliances', exact: true }).click();
  await page
    .getByRole('region', { name: 'Appliances' })
    .getByRole('button', { name: /^Fridge/ })
    .dragTo(page.getByTestId('plan'), { targetPosition: { x: p.x - box.x, y: p.y - box.y } });
  await expect.poll(async () => (await walls(page))[3]!.appliances.map((a) => a.kind)).toEqual(['fridge']);
  const d = (await walls(page))[3]!;
  expect(d.runs).toHaveLength(1);
  expect(d.runs[0]!.kind).toBe('base_upper'); // a fridge gets an upper above it
  expect(await konva(page, '.fridge-upper')).toHaveLength(1);
});

test('drag on the open floor for an island; Delete removes the selected run, undo brings it back', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  const a = at(40, 50);
  const b = at(100, 85);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y - 5, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  const frame = page.getByRole('region', { name: 'Cabinet runs' });
  await expect(frame).toContainText('Selected: island');
  const island = (await walls(page)).find((w) => w.kind === 'floating')!;
  expect(island.runs[0]!.length).toBe(60 * IN);
  expect(island.runs[0]!.depth).toBe(36 * IN); // 35" dragged: the nearest island depth
  await frame.getByRole('button', { name: '42"' }).click();
  await expect.poll(async () => (await walls(page)).find((w) => w.kind === 'floating')!.runs[0]!.depth).toBe(42 * IN);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await walls(page)).some((w) => w.kind === 'floating')).toBe(false);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await walls(page)).some((w) => w.kind === 'floating')).toBe(true);
});

test('the steps: each opens its options right under it, and picking something on the plan opens its step', async ({ page }) => {
  await bareKitchen(page);
  // Cabinets & islands is open: its options sit right after its own button, and no other step's do.
  const steps = page.getByRole('list', { name: 'Steps' });
  const cabinets = steps.getByRole('button', { name: 'Cabinets & islands' });
  await expect(cabinets).toHaveAttribute('aria-expanded', 'true');
  expect(await cabinets.evaluate((b) => b.nextElementSibling?.id)).toBe('step-cabinets');
  await expect(page.locator('#step-walls')).toHaveCount(0);
  // Steps already visited show a tick.
  await expect(steps.getByRole('button', { name: 'Walls' })).toContainText('✓');
  // Open Walls, choose Select, then click the door on the plan: the Openings step opens with it.
  await steps.getByRole('button', { name: 'Walls' }).click();
  await page.getByRole('group', { name: 'Wall tool' }).getByRole('button', { name: 'Select', exact: true }).click();
  // The door is in wall D (the left wall), 30"–62" from D's start at the top: centred 74" up.
  const at = await plotter(page);
  const d = at(0, 74);
  await page.mouse.click(d.x, d.y);
  await expect(steps.getByRole('button', { name: 'Openings' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#step-openings').getByRole('heading', { name: /^Door on/ })).toBeVisible();
});

test('an island dragged over a floating wall snaps onto it, with its size shown while dragging', async ({ page }) => {
  await bareKitchen(page);
  const at = await plotter(page);
  // Draw a 60" floating wall across the middle of the room.
  await page.getByRole('list', { name: 'Steps' }).getByRole('button', { name: 'Walls' }).click();
  await page.getByRole('group', { name: 'Wall tool' }).getByRole('button', { name: 'Floating wall', exact: true }).click();
  let p = at(42, 60);
  await page.mouse.click(p.x, p.y);
  p = at(102, 60);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await walls(page)).filter((w) => w.kind === 'floating').length).toBe(1);
  // Drag a rough box over it in the Cabinets & islands step.
  await page.getByRole('button', { name: 'Cabinets & islands' }).click();
  const a = at(50, 47);
  const b = at(95, 72);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 5, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  const [label] = await page.evaluate(() => {
    const w = window as unknown as { Konva: { stages: { find: (s: string) => { text: () => string }[] }[] } };
    return w.Konva.stages[0]!.find('.island-size').map((n) => n.text());
  });
  expect(label).toBe(`60" × 27" deep · on the floating wall`);
  await page.mouse.up();
  const floating = (await walls(page)).filter((w) => w.kind === 'floating');
  expect(floating).toHaveLength(1); // the same wall, not a second one
  expect(floating[0]!.runs).toEqual([{ run_id: expect.any(String), kind: 'base', offset: 0, length: 60 * IN, depth: 27 * IN }]);
});

test('the appliance tray shows an icon for every appliance', async ({ page }) => {
  await bareKitchen(page);
  await page.getByRole('button', { name: 'Appliances', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Appliances' }).locator('svg[data-icon]')).toHaveCount(9);
});
