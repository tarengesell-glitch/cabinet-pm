/**
 * `npm run views`: pictures of the 3D view at fixed camera views, for looking at by eye after a
 * change to the layout or the drawing (docs/DEVELOPMENT.md). They don't check any measurement:
 * the unit tests do that.
 *
 * The anonymised real kitchen (src/modules/designer/__tests__/real-kitchen.ts) is left in the
 * browser; the test page (/test/views/) runs the real design step on it and shows one view.
 * Each view is captured twice from a fresh page and the two must be identical, so a picture
 * always means the same framing. Pictures go to views-output/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { wallLetter } from '../src/core/index';
import { realKitchen } from '../src/modules/designer/__tests__/real-kitchen';

const KEY = 'cabinet-pm.test-views.job';
// Its own folder: every Playwright run empties test-results/, which would lose them.
const OUT = 'views-output';
const job = realKitchen();
const VIEWS = ['overall', ...job.rooms[0]!.walls.flatMap((w, i) => (w.kind === 'room' ? [`wall-${wallLetter(i)}`] : [])), 'island'];

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

for (const name of VIEWS)
  test(`${name}: the same picture every time`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(([key, data]) => window.localStorage.setItem(key, data), [KEY, JSON.stringify(job)] as const);
    const capture = async () => {
      await page.goto(`/test/views/?view=${name}`);
      // The development server's own badge, so it isn't in the pictures (the page itself is unchanged).
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      const stage = page.getByTestId('stage-3d');
      // Set by the 3D view once a frame at this view has been drawn: no fixed wait.
      await expect(stage).toHaveAttribute('data-view', name, { timeout: 60_000 });
      await expect(page.getByTestId('views-problem')).toHaveCount(0);
      return stage.screenshot({ animations: 'disabled' });
    };
    const first = await capture();
    const second = await capture();
    writeFileSync(`${OUT}/${name}.png`, first);
    expect(Buffer.compare(first, second), `the two pictures of ${name} differ`).toBe(0);
  });
