/**
 * The catalog: our own list of cabinet types, read from a versioned data file (rule 6).
 * Every value carries the key of its source. A value that isn't known yet is null with the
 * source "unknown", and anything that needs it is refused, never filled in (rule 7).
 * A bad data file fails loudly when the app starts.
 */
import { z } from 'zod';
import { parseImperial, type Length, type Result } from '@/core/index';

const Code = z.string().regex(/^[a-z0-9_]+$/);
const Sourced = z.strictObject({ value: z.string().min(1).nullable(), source: z.string().min(1) });
const DimSchema = z.strictObject({ default: Sourced, min: Sourced, max: Sourced, step: Sourced });
const FrontRow = z.strictObject({
  kind: z.enum(['doors', 'drawers', 'false_front', 'fixed_panel', 'open', 'pullout']),
  /** null: set by the door or drawer rules from the cabinet's size. */
  count: z.number().int().positive().nullable(),
});
export const ITEM_TYPES = [
  'base',
  'wall',
  'tall',
  'vanity',
  'corner_base',
  'corner_wall',
  'bath',
  'closet',
  'filler',
  'panel',
  'shelf',
  'drawer_unit',
  'appliance_opening',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

const ItemSchema = z.strictObject({
  id: z.uuid(),
  code: Code,
  name: z.string().min(1),
  type: z.enum(ITEM_TYPES),
  availability: z.enum(['available', 'excluded', 'manual_work']),
  description: z.string().min(1).nullable(),
  from_library: z
    .array(z.strictObject({ template: z.number().int().positive(), name: z.string().min(1), example: z.string().min(1) }))
    .min(1),
  resizable: z.boolean(),
  size: z.strictObject({ width: DimSchema, height: DimSchema, depth: DimSchema }),
  front: z.array(FrontRow),
  inside: z.record(Code, z.number().int().positive()),
  toe_kick: z.boolean(),
  options: z.array(Code),
  required: z.array(Code),
  defaults: z.record(Code, Sourced),
  notes: z.array(Sourced),
  hand_meaning: z.string().min(1).optional(),
});
const OptionSchema = z.strictObject({
  code: Code,
  name: z.string().min(1),
  source: z.string().min(1),
  values: z.array(z.strictObject({ code: Code, name: z.string().min(1) })).min(2),
});
const FileSchema = z.strictObject({
  catalog_version: z.number().int().positive(),
  shop: z.strictObject({ id: z.uuid(), name: z.string().min(1) }),
  sources: z.record(z.string().min(1), z.string().min(1)),
  options: z.array(OptionSchema).min(1),
  /** Each entry: the option selections that may not be chosen together. */
  invalid_combinations: z.array(
    z.strictObject({ selections: z.record(Code, Code), reason: z.string().min(1), source: z.string().min(1) }),
  ),
  not_included: z.array(
    z.strictObject({
      template: z.number().int().positive(),
      name: z.string().min(1),
      what: z.string().min(1),
      reason: z.string().min(1),
      source: z.string().min(1),
    }),
  ),
  items: z.array(ItemSchema).min(1),
});

/** A length with where it came from. `value` null means not known yet. */
export interface SourcedLength {
  readonly value: Length | null;
  readonly source: string;
}
export interface Dimension {
  readonly default: SourcedLength;
  readonly min: SourcedLength;
  readonly max: SourcedLength;
  readonly step: SourcedLength;
}
export type DimensionName = 'width' | 'height' | 'depth';
export interface CatalogItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ItemType;
  readonly availability: 'available' | 'excluded' | 'manual_work';
  readonly description: string | null;
  readonly fromLibrary: readonly { readonly template: number; readonly name: string; readonly example: string }[];
  readonly resizable: boolean;
  readonly size: Readonly<Record<DimensionName, Dimension>>;
  readonly front: readonly { readonly kind: z.infer<typeof FrontRow>['kind']; readonly count: number | null }[];
  readonly inside: Readonly<Record<string, number>>;
  readonly toeKick: boolean;
  readonly options: readonly string[];
  readonly required: readonly string[];
  readonly defaults: Readonly<Record<string, { readonly value: string; readonly source: string }>>;
  readonly notes: readonly { readonly text: string; readonly source: string }[];
  /** For a left/right item: what "left" and "right" mean. */
  readonly handMeaning: string | null;
}
export interface CatalogOption {
  readonly code: string;
  readonly name: string;
  readonly source: string;
  readonly values: readonly { readonly code: string; readonly name: string }[];
}
export interface InvalidCombination {
  readonly selections: Readonly<Record<string, string>>;
  readonly reason: string;
  readonly source: string;
}
export interface Catalog {
  readonly version: number;
  readonly shop: { readonly id: string; readonly name: string };
  readonly sources: Readonly<Record<string, string>>;
  readonly options: readonly CatalogOption[];
  readonly invalidCombinations: readonly InvalidCombination[];
  readonly items: readonly CatalogItem[];
}

const DIMENSIONS: readonly DimensionName[] = ['width', 'height', 'depth'];

/** Reads and checks a catalog data file. Returns every problem, not just the first. */
export function readCatalog(data: unknown): Result<Catalog> {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `The catalog file is not in the right shape: ${parsed.error.message}` };
  const d = parsed.data;
  const problems: string[] = [];
  const source = (where: string, key: string): string => {
    if (!(key in d.sources)) problems.push(`${where}: source "${key}" is not listed under "sources"`);
    return key;
  };
  const length = (where: string, s: z.infer<typeof Sourced>): SourcedLength => {
    source(where, s.source);
    if (s.value === null) {
      if (s.source !== 'unknown' && !where.endsWith('step')) problems.push(`${where}: a missing value must say its source is "unknown"`);
      return { value: null, source: s.source };
    }
    if (s.source === 'unknown') problems.push(`${where}: has a value but says its source is unknown`);
    const r = parseImperial(s.value);
    if (!r.ok) {
      problems.push(`${where}: ${r.reason}`);
      return { value: null, source: s.source };
    }
    if (r.value <= 0) problems.push(`${where}: must be more than zero`);
    return { value: r.value, source: s.source };
  };

  const options = new Map<string, CatalogOption>();
  for (const o of d.options) {
    if (options.has(o.code)) problems.push(`option "${o.code}" is listed twice`);
    const values = new Set(o.values.map((v) => v.code));
    if (values.size !== o.values.length) problems.push(`option "${o.code}" lists a value twice`);
    options.set(o.code, { code: o.code, name: o.name, source: source(`option ${o.code}`, o.source), values: o.values });
  }
  const validValue = (where: string, option: string, value: string): void => {
    const o = options.get(option);
    if (!o) problems.push(`${where}: option "${option}" is not in the catalog`);
    else if (!o.values.some((v) => v.code === value)) problems.push(`${where}: "${value}" is not a choice for ${o.name}`);
  };

  const ids = new Set<string>();
  const codes = new Set<string>();
  const items = d.items.map((it): CatalogItem => {
    const at = `item ${it.code}`;
    if (ids.has(it.id)) problems.push(`${at}: its ID is used twice`);
    if (codes.has(it.code)) problems.push(`${at}: its code is used twice`);
    ids.add(it.id);
    codes.add(it.code);
    const size = Object.fromEntries(
      DIMENSIONS.map((dim) => {
        const raw = it.size[dim];
        const dimension: Dimension = {
          default: length(`${at} ${dim} default`, raw.default),
          min: length(`${at} ${dim} min`, raw.min),
          max: length(`${at} ${dim} max`, raw.max),
          step: length(`${at} ${dim} step`, raw.step),
        };
        const { default: def, min, max, step } = dimension;
        if (def.value === null) problems.push(`${at} ${dim}: every item needs a default size`);
        if (min.value !== null && max.value !== null && min.value > max.value) problems.push(`${at} ${dim}: min is more than max`);
        if (!it.resizable && (min.value !== def.value || max.value !== def.value))
          problems.push(`${at} ${dim}: a fixed-size item's min and max must equal its default`);
        if (it.resizable && step.value === null && step.source !== 'unknown') problems.push(`${at} ${dim}: a missing step must say "unknown"`);
        return [dim, dimension];
      }),
    ) as Record<DimensionName, Dimension>;
    for (const o of it.options) if (!options.has(o)) problems.push(`${at}: option "${o}" is not in the catalog`);
    if (new Set(it.options).size !== it.options.length) problems.push(`${at}: an option is listed twice`);
    for (const r of it.required) if (!it.options.includes(r)) problems.push(`${at}: requires "${r}" but doesn't offer it`);
    for (const [o, v] of Object.entries(it.defaults)) {
      if (!it.options.includes(o)) problems.push(`${at}: has a default for "${o}" but doesn't offer it`);
      validValue(`${at} default`, o, v.value ?? '');
      source(`${at} default ${o}`, v.source);
    }
    if (it.options.includes('hand') !== (it.hand_meaning !== undefined))
      problems.push(`${at}: a left/right item must say what left and right mean, and only a left/right item may`);
    for (const n of it.notes) source(`${at} note`, n.source);
    return {
      id: it.id,
      code: it.code,
      name: it.name,
      type: it.type,
      availability: it.availability,
      description: it.description,
      fromLibrary: it.from_library,
      resizable: it.resizable,
      size,
      front: it.front,
      inside: it.inside,
      toeKick: it.toe_kick,
      options: it.options,
      required: it.required,
      defaults: Object.fromEntries(Object.entries(it.defaults).map(([k, v]) => [k, { value: v.value ?? '', source: v.source }])),
      notes: it.notes.map((n) => ({ text: n.value ?? '', source: n.source })),
      handMeaning: it.hand_meaning ?? null,
    };
  });
  for (const c of d.invalid_combinations) {
    source('invalid combination', c.source);
    for (const [o, v] of Object.entries(c.selections)) validValue('invalid combination', o, v);
    if (Object.keys(c.selections).length < 2) problems.push('an invalid combination needs at least two selections');
  }
  for (const n of d.not_included) source(`not included #${n.template}`, n.source);

  if (problems.length > 0) return { ok: false, reason: `The catalog file has bad values: ${problems.join('; ')}` };
  return {
    ok: true,
    value: {
      version: d.catalog_version,
      shop: d.shop,
      sources: d.sources,
      options: [...options.values()],
      invalidCombinations: d.invalid_combinations,
      items,
    },
  };
}

/** The item with this ID, or null (the caller refuses). */
export function catalogItem(catalog: Catalog, id: string): CatalogItem | null {
  return catalog.items.find((i) => i.id === id) ?? null;
}
