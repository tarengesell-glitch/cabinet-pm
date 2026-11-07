import { describe, expect, it } from 'vitest';
import { parseImperial, type Length } from '@/core/index';
import { CATALOG_CHECKS, CURRENT_CATALOG, catalogVersion, checkPlacement, readCatalog, type ItemPlacement } from '../contract';
import raw from '../data/catalog-v1.json';

const len = (text: string): Length => {
  const r = parseImperial(text);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const item = (code: string) => {
  const found = CURRENT_CATALOG.items.find((i) => i.code === code);
  if (!found) throw new Error(`no item ${code}`);
  return found;
};
const SHOP = CURRENT_CATALOG.shop.id;
const ENDS = { end_left: 'unfinished', end_right: 'applied_finished' };

/** A base with doors at a size and with choices that pass every check. */
const good = (over: Partial<ItemPlacement> = {}): ItemPlacement => ({
  id: 'placed-1',
  catalogItemId: item('base_doors').id,
  width: len('30'),
  height: len('34 3/4'),
  depth: len('23 3/4'),
  selections: { door_style: 'shaker_2_1_4', ...ENDS },
  ...over,
});
const ids = (issues: readonly { check_id: string }[]) => issues.map((i) => i.check_id);
const copy = () => JSON.parse(JSON.stringify(raw)) as typeof raw;

describe('the catalog file', () => {
  it('loads, as version 1, with the 50 cabinet types from the owner’s review', () => {
    expect(CURRENT_CATALOG.version).toBe(1);
    expect(CURRENT_CATALOG.items).toHaveLength(50);
    expect(catalogVersion(1)).toBe(CURRENT_CATALOG);
    expect(catalogVersion(2)).toBeNull();
  });

  it('records the owner’s answers', () => {
    expect(item('base_doors').size.width.min.value).toBe(len('8'));
    expect(item('base_drawer_doors').size.width.min.value).toBe(len('12'));
    expect(item('base_doors').size.width.max.value).toBe(len('40 1/4'));
    expect(item('base_doors').size.width.step.value).toBe(len('1/16'));
    expect(item('base_doors').size.height.default.value).toBe(len('34 3/4'));
    expect(item('tall_pantry').size.depth.default.value).toBe(len('26'));
    expect(item('upper_doors').size.depth.default.value).toBe(len('12'));
    expect(item('vanity_sink').size.depth.default.value).toBe(len('20 3/4'));
    expect(item('base_filler').size.width.default.value).toBe(len('3/4'));
    expect(item('angled_end_base').toeKick).toBe(true);
    expect(item('sink_base').defaults.sink_front?.value).toBe('full_height_doors_skirt');
    expect(item('vanity_sink_side_drawers').defaults.sink_front?.value).toBe('false_drawer_front');
    expect(item('corner_drawer_base').resizable).toBe(false);
  });

  it('marks values that aren’t known yet as unknown, never filled in', () => {
    const h = item('base_doors').size.height;
    expect(h.min).toEqual({ value: null, source: 'unknown' });
    expect(h.max).toEqual({ value: null, source: 'unknown' });
  });

  it('refuses a value whose source isn’t listed', () => {
    const bad = copy();
    bad.items[0]!.size.width.default.source = 'a hunch';
    const r = readCatalog(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('source "a hunch"');
  });

  it('refuses a missing value that doesn’t say it is unknown', () => {
    const bad = copy();
    bad.items[7]!.size.height.min.source = 'owner-review';
    expect(readCatalog(bad).ok).toBe(false);
  });

  it('refuses a required choice the item doesn’t offer', () => {
    const bad = copy();
    (bad.items[7]!.required as string[]).push('sink_front');
    expect(readCatalog(bad).ok).toBe(false);
  });

  it('refuses an ID used twice', () => {
    const bad = copy();
    bad.items[1]!.id = bad.items[0]!.id;
    expect(readCatalog(bad).ok).toBe(false);
  });

  it('refuses a fixed-size item whose limits differ from its size', () => {
    const bad = copy();
    const fixed = bad.items.find((i) => i.code === 'corner_drawer_base')!;
    fixed.size.width.max.value = '40';
    expect(readCatalog(bad).ok).toBe(false);
  });
});

describe('buildability checks', () => {
  it('passes a base with doors at a normal size with every choice made', () => {
    expect(checkPlacement(CURRENT_CATALOG, SHOP, good())).toEqual([]);
  });

  it(CATALOG_CHECKS.available.id, () => {
    expect(ids(checkPlacement(CURRENT_CATALOG, 'another-shop', good()))).toEqual([CATALOG_CHECKS.available.id]);
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ catalogItemId: 'not-in-catalog' })))).toEqual([CATALOG_CHECKS.available.id]);
    const bad = copy();
    bad.items.find((i) => i.code === 'base_doors')!.availability = 'excluded';
    const excluded = readCatalog(bad);
    if (!excluded.ok) throw new Error(excluded.reason);
    expect(ids(checkPlacement(excluded.value, SHOP, good()))).toEqual([CATALOG_CHECKS.available.id]);
  });

  it(CATALOG_CHECKS.sizeInRange.id, () => {
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('7') })))).toEqual([CATALOG_CHECKS.sizeInRange.id]);
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('41') })))).toEqual([CATALOG_CHECKS.sizeInRange.id]);
    expect(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('40 1/4') }))).toEqual([]);
    expect(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('8') }))).toEqual([]);
  });

  it('refuses a height the catalog has no limits for yet, but allows the standard height', () => {
    const issues = checkPlacement(CURRENT_CATALOG, SHOP, good({ height: len('30') }));
    expect(ids(issues)).toEqual([CATALOG_CHECKS.sizeInRange.id, CATALOG_CHECKS.sizeInRange.id, CATALOG_CHECKS.sizeOnStep.id]);
    expect(issues[0]!.message).toContain('isn’t known yet');
  });

  it(CATALOG_CHECKS.sizeOnStep.id, () => {
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('30 1/32') })))).toEqual([CATALOG_CHECKS.sizeOnStep.id]);
    expect(checkPlacement(CURRENT_CATALOG, SHOP, good({ width: len('30 1/16') }))).toEqual([]);
  });

  it('refuses any other size for a fixed-size item', () => {
    const corner = item('corner_drawer_base');
    const placement = good({
      catalogItemId: corner.id,
      width: corner.size.width.default.value!,
      height: corner.size.height.default.value!,
      depth: corner.size.depth.default.value!,
    });
    expect(checkPlacement(CURRENT_CATALOG, SHOP, placement)).toEqual([]);
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, { ...placement, width: len('36') }))).toEqual([CATALOG_CHECKS.sizeInRange.id]);
  });

  it(CATALOG_CHECKS.required.id, () => {
    const issues = checkPlacement(CURRENT_CATALOG, SHOP, good({ selections: ENDS }));
    expect(ids(issues)).toEqual([CATALOG_CHECKS.required.id]);
    expect(issues[0]!.message).toContain('Door style');
  });

  it(CATALOG_CHECKS.validSelection.id, () => {
    expect(ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ selections: { door_style: 'oak', ...ENDS } })))).toEqual([
      CATALOG_CHECKS.validSelection.id,
    ]);
    expect(
      ids(checkPlacement(CURRENT_CATALOG, SHOP, good({ selections: { door_style: 'slab', sink_front: 'tip_out_tray', ...ENDS } }))),
    ).toEqual([CATALOG_CHECKS.validSelection.id]);
  });

  it(CATALOG_CHECKS.invalidCombination.id, () => {
    const bad = copy();
    (bad.invalid_combinations as unknown[]).push({
      selections: { door_style: 'slab', end_left: 'finished' },
      reason: 'Test only.',
      source: 'owner-review',
    });
    const r = readCatalog(bad);
    if (!r.ok) throw new Error(r.reason);
    const placement = good({ selections: { door_style: 'slab', end_left: 'finished', end_right: 'unfinished' } });
    expect(ids(checkPlacement(r.value, SHOP, placement))).toEqual([CATALOG_CHECKS.invalidCombination.id]);
    expect(checkPlacement(CURRENT_CATALOG, SHOP, placement)).toEqual([]);
  });
});
