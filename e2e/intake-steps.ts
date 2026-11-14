// Steps shared by the design-choices tests (not a test file itself).
import { expect, type Page } from '@playwright/test';

export const question = (page: Page) => page.getByRole('heading', { level: 1 });
/** A picture or card choice, by the start of its name. */
export const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
export const next = (page: Page) => page.getByRole('button', { name: 'Next ›' });

/** Answers the kitchen from the first question to the review. */
export async function answerKitchen(page: Page, path = '/intake') {
  await page.goto(path);
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


/**
 * Selects a cabinet on the customize screen: the first one to review (from the review list), then
 * "Next cabinet" until the editor's heading matches `name` (`skip` matches are passed over).
 */
export async function selectCabinet(page: Page, name: RegExp, skip = 0) {
  const heading = page.getByRole('region', { name: 'Cabinet' }).getByRole('heading', { level: 2 });
  if (!(await heading.isVisible())) await page.getByRole('region', { name: 'Checks' }).getByRole('button').first().click();
  for (let i = 0; i < 80; i++) {
    if (name.test((await heading.textContent()) ?? '') && skip-- === 0) return;
    await page.getByRole('button', { name: 'Next cabinet' }).click();
  }
  throw new Error(`No cabinet named ${name.source}`);
}
