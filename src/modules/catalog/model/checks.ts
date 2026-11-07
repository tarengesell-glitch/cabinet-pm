/**
 * Buildability checks (BUILD_SPEC section 7, layer "buildability"). Every issue blocks.
 *
 * Core has no placed cabinet in the master copy yet (step 1b-items), so these checks take one
 * placed item at a time. When PlacedItem lands, a Core `Check` runs them over every item in a job.
 */
import { formatInches, type Issue, type Length } from '@/core/index';
import { catalogItem, type Catalog, type CatalogItem, type DimensionName } from './catalog';

/** What a placed cabinet tells the catalog. Lengths are in the base unit. */
export interface ItemPlacement {
  /** The placed item's own ID, used in the issue so the designer can find it. */
  readonly id: string;
  readonly catalogItemId: string;
  readonly width: Length;
  readonly height: Length;
  readonly depth: Length;
  /** Option code → chosen value code. */
  readonly selections: Readonly<Record<string, string>>;
}

export const CATALOG_CHECKS = {
  available: { id: 'catalog.item-available', description: 'The cabinet type exists in this shop’s catalog and is available' },
  sizeInRange: { id: 'catalog.size-in-range', description: 'Width, height and depth are within the cabinet type’s limits' },
  sizeOnStep: { id: 'catalog.size-on-step', description: 'Width, height and depth are on the cabinet type’s size step' },
  required: { id: 'catalog.required-selections', description: 'Every required choice (door style, ends, hinge side…) is made' },
  validSelection: { id: 'catalog.selections-valid', description: 'Every choice is one this cabinet type offers' },
  invalidCombination: { id: 'catalog.no-invalid-combinations', description: 'No two choices that can’t go together' },
} as const;

const NAMES: Record<DimensionName, string> = { width: 'width', height: 'height', depth: 'depth' };

/** Runs every buildability check on one placed item. Returns every issue, not just the first. */
export function checkPlacement(catalog: Catalog, shopId: string, placement: ItemPlacement): readonly Issue[] {
  const issues: Issue[] = [];
  const issue = (check: { id: string }, message: string): void => {
    issues.push({ check_id: check.id, severity: 'block', message, ref: { kind: 'item', id: placement.id } });
  };

  if (catalog.shop.id !== shopId) {
    issue(CATALOG_CHECKS.available, `This catalog belongs to ${catalog.shop.name}, not to this job’s shop, so nothing in it can be checked.`);
    return issues;
  }
  const item = catalogItem(catalog, placement.catalogItemId);
  if (!item) {
    issue(CATALOG_CHECKS.available, `This cabinet type isn’t in catalog version ${catalog.version}.`);
    return issues;
  }
  if (item.availability === 'excluded') issue(CATALOG_CHECKS.available, `${item.name} isn’t offered by ${catalog.shop.name}.`);
  if (item.availability === 'manual_work')
    issue(CATALOG_CHECKS.available, `${item.name} needs manual work at the shop and can’t be sent as it is.`);

  for (const dim of ['width', 'height', 'depth'] as const) checkSize(item, dim, placement[dim], issue);
  checkSelections(catalog, item, placement.selections, issue);
  return issues;
}

function checkSize(
  item: CatalogItem,
  dim: DimensionName,
  value: Length,
  issue: (check: { id: string }, message: string) => void,
): void {
  const d = item.size[dim];
  const shown = formatInches(value);
  // The item's own default size is always allowed: it is either the owner's standard or the library's example.
  if (value === d.default.value) return;
  if (!item.resizable) {
    issue(CATALOG_CHECKS.sizeInRange, `${item.name} is made in one size only; its ${NAMES[dim]} can’t be ${shown}.`);
    return;
  }
  if (d.min.value === null)
    issue(CATALOG_CHECKS.sizeInRange, `The smallest ${NAMES[dim]} for ${item.name} isn’t known yet, so ${shown} can’t be checked. Only the standard size is allowed until it is.`);
  else if (value < d.min.value)
    issue(CATALOG_CHECKS.sizeInRange, `${item.name}’s ${NAMES[dim]} can’t be less than ${formatInches(d.min.value)}; it is ${shown}.`);
  if (d.max.value === null)
    issue(CATALOG_CHECKS.sizeInRange, `The largest ${NAMES[dim]} for ${item.name} isn’t known yet, so ${shown} can’t be checked. Only the standard size is allowed until it is.`);
  else if (value > d.max.value)
    issue(CATALOG_CHECKS.sizeInRange, `${item.name}’s ${NAMES[dim]} can’t be more than ${formatInches(d.max.value)}; it is ${shown}.`);
  if (d.step.value === null)
    issue(CATALOG_CHECKS.sizeOnStep, `The size step for ${item.name}’s ${NAMES[dim]} isn’t known yet, so ${shown} can’t be checked.`);
  else if (value % d.step.value !== 0)
    issue(CATALOG_CHECKS.sizeOnStep, `${item.name}’s ${NAMES[dim]} must be in steps of ${formatInches(d.step.value)}; ${shown} isn’t.`);
}

function checkSelections(
  catalog: Catalog,
  item: CatalogItem,
  selections: Readonly<Record<string, string>>,
  issue: (check: { id: string }, message: string) => void,
): void {
  for (const code of item.required) {
    if (!(code in selections)) {
      const name = catalog.options.find((o) => o.code === code)?.name ?? code;
      issue(CATALOG_CHECKS.required, `${item.name} needs a choice for “${name}”.`);
    }
  }
  for (const [code, value] of Object.entries(selections)) {
    const option = catalog.options.find((o) => o.code === code);
    if (!option || !item.options.includes(code)) {
      issue(CATALOG_CHECKS.validSelection, `${item.name} doesn’t offer the choice “${option?.name ?? code}”.`);
      continue;
    }
    if (!option.values.some((v) => v.code === value))
      issue(CATALOG_CHECKS.validSelection, `“${value}” isn’t one of the choices for ${option.name}.`);
  }
  for (const combo of catalog.invalidCombinations) {
    const all = Object.entries(combo.selections).every(([o, v]) => selections[o] === v);
    if (all) issue(CATALOG_CHECKS.invalidCombination, `${item.name}: these choices can’t go together. ${combo.reason}`);
  }
}
