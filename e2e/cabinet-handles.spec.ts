import { expect, test, type Page } from '@playwright/test';
import { answerKitchen, selectCabinet } from './intake-steps';
const step = (page: Page, name: string) => page.getByRole('navigation', { name: 'Progress' }).getByRole('button', { name: new RegExp(name) });

// The 3D view's drag handles (owner, 2026-11-12): a selected cabinet shows blue handles; dragging
// its right handle changes its width, live, and saves it on release (the cabinet beside it gives or
// takes the difference; model/cabinets.ts, tested in designer/__tests__/cabinet-edits.test.ts).
// The handles are found on a screenshot by their colour (the selection blue, drawn without tone mapping).
test.beforeEach(async ({ page }) => {
  await page.goto('/studio');
  await page.evaluate(() => window.localStorage.clear());
});

test('dragging a selected cabinet’s handle in the 3D view changes its width', async ({ page }) => {
  test.setTimeout(240_000);
  await answerKitchen(page, '/studio/?job=c2');
  await page.getByRole('button', { name: 'Finish kitchen' }).click();
  await page.getByRole('button', { name: /Start laying out room dimensions/ }).click();
  await page.getByRole('button', { name: 'Load example kitchen' }).click();
  await step(page, 'AI design').click();
  await expect(step(page, 'Customize')).toHaveAttribute('aria-current', 'step', { timeout: 20_000 });
  await selectCabinet(page, /^Upper/, 1);
  const width = page.getByRole('textbox', { name: 'Width' });
  const before = await width.inputValue();
  // Wait until the handles are drawn (the 3D view draws only when something changes).
  await page.waitForTimeout(1500);
  const stage = page.getByTestId('stage-3d');
  const box = (await stage.boundingBox())!;
  const shot = (await stage.screenshot()).toString('base64');
  const pts = await page.evaluate(async ({ shot, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${shot}`;
    await img.decode();
    const k = document.createElement('canvas');
    k.width = img.width; k.height = img.height;
    const x = k.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, k.width, k.height).data;
    const out: [number, number][] = [];
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - 47) < 14 && Math.abs(d[i + 1]! - 125) < 16 && Math.abs(d[i + 2]! - 225) < 16) out.push([((i / 4) % k.width) * (w / k.width), Math.floor(i / 4 / k.width) * (h / k.height)]);
    return out;
  }, { shot, w: box.width, h: box.height });
  expect(pts.length).toBeGreaterThan(20);
  // The grips are blue rings; the right width grip is the one that names itself so when pointed at.
  const candidates = [...pts].sort((p, q) => q[0] - p[0]).filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1]![0], p[1] - all[i - 1]![1]) > 3);
  let sx = 0;
  let sy = 0;
  for (const c of candidates.slice(0, 60)) {
    await page.mouse.move(box.x + c[0] - 3, box.y + c[1]);
    if ((await page.getByTestId('drag-size').textContent()) === 'Width (from the right)' && (await page.getByTestId('drag-size').isVisible())) {
      sx = box.x + c[0] - 3;
      sy = box.y + c[1];
      break;
    }
  }
  expect(sx).toBeGreaterThan(0);
  await page.mouse.down();
  await page.mouse.move(sx - 30, sy, { steps: 8 });
  await expect(page.getByTestId('drag-size')).toBeVisible();
  await expect(page.getByTestId('drag-size')).toHaveText(/^Width \d/);
  await page.mouse.up();
  await expect(width).not.toHaveValue(before);
  // A click on empty space lets go of the cabinet (owner, 2026-11-13).
  await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20);
  await expect(page.getByText('Click a cabinet in the 3D view.')).toBeVisible();
});
