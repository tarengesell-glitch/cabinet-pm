import { describe, expect, it } from 'vitest';
import { buildImageCatalog, IMAGE_CATALOG, imagePlan, type ImageCatalog } from '../model/variables';
import variablesData from '../data/kitchen-image-variables.json';
import tafisaData from '../data/colours/tafisa-tfl.json';
import sherwinData from '../data/colours/sherwin-williams.json';
import stainsData from '../data/colours/stains.json';

if (!IMAGE_CATALOG.ok) throw new Error(IMAGE_CATALOG.reason);
const cat: ImageCatalog = IMAGE_CATALOG.value;
const variable = (id: string) => {
  const v = cat.groups.flatMap((g) => g.variables).find((x) => x.id === id);
  if (!v) throw new Error(`no variable ${id}`);
  return v;
};
const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(variablesData)) as Record<string, unknown>;
const lists = [tafisaData, sherwinData, stainsData];
const reasonFor = (variables: unknown, colourLists: readonly unknown[] = lists): string => {
  const r = buildImageCatalog({ variables, colourLists });
  if (r.ok) throw new Error('expected a refusal');
  return r.reason;
};
type Raw = {
  groups: { id: string; when?: unknown; variables: { id: string; region: string; options: { id: string; varies_with?: string[] }[] }[] }[];
};

describe('kitchen image variables', () => {
  it("holds every item from the owner's list (2026-11-10)", () => {
    expect(variable('room_shape').options).toHaveLength(12);
    expect(variable('material').options).toHaveLength(10);
    expect(variable('door_style').options.map((o) => o.id)).toEqual(['slab_handleless', 'slab', 'slim_shaker', 'shaker', 'raised_panel']);
    expect(variable('hardware_config').options).toHaveLength(4);
    // The five finishes as listed; colour and texture are not combined (owner, 2026-11-13).
    expect(variable('hardware_finish').options.map((o) => o.id)).toEqual(['brushed_nickel', 'brushed_aluminum', 'brushed', 'black', 'oil_rubbed_bronze']);
    expect(variable('handle_length').options).toHaveLength(3);
    expect(variable('counter_pattern').options).toHaveLength(3);
    expect(variable('counter_colour').options).toHaveLength(7);
    expect(variable('island_back').options).toHaveLength(16);
    expect(variable('island_end').options).toHaveLength(6);
    expect(variable('top_trim').options).toHaveLength(4);
    expect(variable('valance').options).toHaveLength(4);
  });

  it('shows island options only for shapes with an island, and never for a peninsula', () => {
    const island = cat.groups.find((g) => g.id === 'island');
    const withIsland = variable('room_shape').options.filter((o) => o.island).map((o) => o.id);
    expect(island?.when).toEqual({ variable: 'room_shape', in: withIsland });
    expect(withIsland).not.toContain('peninsula');
  });

  it('skips handles for slab handleless doors, and lengths for knobs', () => {
    expect(cat.groups.find((g) => g.id === 'hardware')?.when).toEqual({ variable: 'door_style', not_in: ['slab_handleless'] });
    expect(variable('handle_length').when).toEqual({ variable: 'hardware_config', not_in: ['all_knobs'] });
  });

  it('counts images per step, combinations included', () => {
    const plan = imagePlan(cat);
    const rows = new Map(plan.rows.map((r) => [r.variable, r]));
    expect(rows.get('room_shape')?.images).toBe(12);
    expect(rows.get('counter_colour')?.images).toBe(21);
    // 15 back panels, plus "matching doors" once per door style.
    expect(rows.get('island_back')?.images).toBe(15 + 5);
    // 4 gables, plus "match back" per back-panel image (20, matching doors included), plus waterfall per counter image.
    expect(rows.get('island_end')?.images).toBe(4 + 20 + 21);
    // Every Tafisa and paint colour once, every stain on each of the 8 wood species.
    expect(rows.get('colour')).toMatchObject({ images: 155 + 1728 + 12 * 8, waiting_on: [] });
    expect(plan.total).toBe(plan.rows.reduce((n, r) => n + r.images, 0));
  });

  it('makes one image per stain per wood species', () => {
    const none = (l: object) => ({ ...l, colours: [] });
    const stains = { ...stainsData, colours: [{ id: 'natural', label: 'Natural', prompt: 'clear natural finish' }] };
    const r = buildImageCatalog({ variables: variablesData, colourLists: [none(tafisaData), none(sherwinData), stains] });
    if (!r.ok) throw new Error(r.reason);
    expect(imagePlan(r.value).rows.find((x) => x.variable === 'colour')?.images).toBe(8);
  });

  it('shortlists 12 Sherwin-Williams colours in each of the 5 families (owner, 2026-11-13)', () => {
    const sw = cat.colour_lists.find((l) => l.id === 'sherwin_williams')!;
    const per = new Map<string, number>();
    for (const c of sw.colours) if (c.shortlist) per.set(c.shortlist, (per.get(c.shortlist) ?? 0) + 1);
    expect(Object.fromEntries(per)).toEqual({ white_off_white: 12, cream_taupe: 12, medium: 12, dark: 12, accent: 12 });
  });

  it('refuses a condition that names an option that does not exist', () => {
    const raw = clone() as unknown as Raw;
    raw.groups.find((g) => g.id === 'island')!.when = { variable: 'room_shape', in: ['l_shape_islnd'] };
    expect(reasonFor(raw)).toMatch(/"room_shape" option "l_shape_islnd", which doesn't exist/);
  });

  it('refuses a region that is not in the region list', () => {
    const raw = clone() as unknown as Raw;
    raw.groups[0]!.variables[0]!.region = 'ceiling';
    expect(reasonFor(raw)).toMatch(/region "ceiling" isn't in the region list/);
  });

  it('refuses an option listed twice', () => {
    const raw = clone() as unknown as Raw;
    const opts = raw.groups.find((g) => g.id === 'door')!.variables[0]!.options;
    opts.push({ ...opts[0]! });
    expect(reasonFor(raw)).toMatch(/option "slab_handleless" is listed twice/);
  });

  it('refuses images that depend on themselves through a chain', () => {
    const raw = clone() as unknown as Raw;
    const island = raw.groups.find((g) => g.id === 'island')!;
    island.variables[0]!.options[0]!.varies_with = ['island_end'];
    expect(reasonFor(raw)).toMatch(/depend on themselves \(island_back → island_end → island_back\)/);
  });

  it('refuses varying with a variable that does not exist', () => {
    const raw = clone() as unknown as Raw;
    raw.groups.find((g) => g.id === 'island')!.variables[0]!.options[1]!.varies_with = ['door_styles'];
    expect(reasonFor(raw)).toMatch(/varies with "door_styles", which doesn't exist/);
  });

  it('refuses a colour list that is missing or does not match its materials', () => {
    expect(reasonFor(variablesData, [tafisaData, sherwinData])).toMatch(/colour list "stains" isn't loaded/);
    const wrong = { ...tafisaData, applies_to: ['painted'] };
    expect(reasonFor(variablesData, [wrong, sherwinData, stainsData])).toMatch(/material "painted" names a different colour list/);
  });

  it('refuses a colour without a hex in #RRGGBB form', () => {
    const bad = { ...sherwinData, colours: [{ id: 'x', label: 'X', hex: 'white', prompt: 'white' }] };
    expect(reasonFor(variablesData, [tafisaData, bad, stainsData])).toMatch(/#RRGGBB/);
  });
});
