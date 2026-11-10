/**
 * The kitchen image library's variables: every option the image selector shows, and what each
 * photorealistic image must change. Read from `data/` (rule 6) and checked against a schema and
 * against itself. Anything malformed or pointing at something that doesn't exist refuses the
 * whole catalog with the reasons (rule 7).
 *
 * This module may not import `core` (docs/ARCHITECTURE.md), so it carries its own small result
 * type with the same shape as core's.
 */
import { z } from 'zod';
import variablesData from '../data/kitchen-image-variables.json';
import tafisaData from '../data/colours/tafisa-tfl.json';
import sherwinData from '../data/colours/sherwin-williams.json';
import stainsData from '../data/colours/stains.json';

export type Loaded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const Text = z.string().min(1);
const Id = z.string().regex(/^[a-z0-9_]+$/, 'IDs are lower case, digits and _');
const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'a colour must be written #RRGGBB');

/** When a group, variable or option shows. Data, so plain objects. */
const CondSchema = z.union([
  z.strictObject({ variable: Id, in: z.array(Id).min(1) }),
  z.strictObject({ variable: Id, not_in: z.array(Id).min(1) }),
]);
export type ImageCond = z.infer<typeof CondSchema>;

const OptionSchema = z.strictObject({
  id: Id,
  label: Text,
  /** What the image editor is told to draw in the region, in words. */
  prompt: Text,
  when: CondSchema.optional(),
  /** This option's image also changes with these variables (one image per combination). */
  varies_with: z.array(Id).min(1).optional(),
  /** Room shapes: this layout has an island. */
  island: z.literal(true).optional(),
  /** Materials: a wood species. */
  wood: z.literal(true).optional(),
  /** Materials: the colour list this material offers. */
  colour_list: Id.optional(),
  /** Hardware configurations: what goes on doors and on drawers. */
  door: z.enum(['handle', 'knob']).optional(),
  drawer: z.enum(['handle', 'knob']).optional(),
});
export type ImageOption = z.infer<typeof OptionSchema>;

const VariableSchema = z.strictObject({
  id: Id,
  label: Text,
  /** The masked part of the base photo this variable's images change. */
  region: Id,
  /** Its images must be anchored to an owner-approved real reference photo. */
  needs_reference: z.boolean(),
  note: Text.optional(),
  when: CondSchema.optional(),
  varies_with: z.array(Id).min(1).optional(),
  /** The options come from the colour lists instead of `options`. */
  options_from: z.literal('colour_lists').optional(),
  options: z.array(OptionSchema),
});
export type ImageVariable = z.infer<typeof VariableSchema>;

const GroupSchema = z.strictObject({
  id: Id,
  label: Text,
  note: Text.optional(),
  when: CondSchema.optional(),
  variables: z.array(VariableSchema).min(1),
});

const CatalogSchema = z.strictObject({
  source: Text,
  version: z.literal(1),
  purpose: Text,
  regions: z.array(z.strictObject({ id: Id, label: Text })).min(1),
  groups: z.array(GroupSchema).min(1),
  default_kitchen: z.strictObject({
    note: Text,
    picks: z.array(
      z.strictObject({
        variable: Id,
        option: Id.nullable(),
        status: z.enum(['owner', 'proposed']),
        note: Text.optional(),
      }),
    ),
  }),
  rules: z.array(z.strictObject({ id: Id, text: Text })).min(1),
});
export type ImageCatalogData = z.infer<typeof CatalogSchema>;

const ColourListSchema = z.strictObject({
  id: Id,
  label: Text,
  source: Text,
  status: z.enum(['awaiting_owner', 'owner']),
  /** The material options this list is offered for. */
  applies_to: z.array(Id).min(1),
  colours: z.array(
    z.strictObject({
      id: Id,
      label: Text,
      /** The maker's own code, e.g. a paint number. */
      code: Text.optional(),
      hex: Hex.optional(),
      prompt: Text,
    }),
  ),
});
export type ColourList = z.infer<typeof ColourListSchema>;

export interface ImageCatalog extends ImageCatalogData {
  readonly colour_lists: readonly ColourList[];
}

/** Checks the raw files and how they point at each other. */
export function buildImageCatalog(raw: { variables: unknown; colourLists: readonly unknown[] }): Loaded<ImageCatalog> {
  const problems: string[] = [];
  const parsed = CatalogSchema.safeParse(raw.variables);
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `variables, ${i.path.join('.')}: ${i.message}`));
  const lists: ColourList[] = [];
  raw.colourLists.forEach((l, n) => {
    const r = ColourListSchema.safeParse(l);
    if (r.success) lists.push(r.data);
    else problems.push(...r.error.issues.map((i) => `colour list ${n + 1}, ${i.path.join('.')}: ${i.message}`));
  });
  if (!parsed.success || problems.length > 0) return { ok: false, reason: `The image variables can't be loaded:\n${problems.join('\n')}` };

  const cat: ImageCatalog = { ...parsed.data, colour_lists: lists };
  problems.push(...crossCheck(cat));
  if (problems.length > 0) return { ok: false, reason: `The image variables can't be loaded:\n${problems.join('\n')}` };
  return { ok: true, value: cat };
}

function dupes(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function crossCheck(cat: ImageCatalog): string[] {
  const problems: string[] = [];
  const variables = cat.groups.flatMap((g) => g.variables);
  const byId = new Map(variables.map((v) => [v.id, v]));
  const regions = new Set(cat.regions.map((r) => r.id));
  const lists = new Map(cat.colour_lists.map((l) => [l.id, l]));

  for (const d of dupes(cat.groups.map((g) => g.id))) problems.push(`Group "${d}" is listed twice.`);
  for (const d of dupes(variables.map((v) => v.id))) problems.push(`Variable "${d}" is listed twice.`);
  for (const d of dupes(cat.regions.map((r) => r.id))) problems.push(`Region "${d}" is listed twice.`);
  for (const d of dupes(cat.rules.map((r) => r.id))) problems.push(`Rule "${d}" is listed twice.`);
  for (const d of dupes(cat.colour_lists.map((l) => l.id))) problems.push(`Colour list "${d}" is loaded twice.`);

  const checkCond = (where: string, c: ImageCond | undefined) => {
    if (!c) return;
    const target = byId.get(c.variable);
    if (!target) return problems.push(`${where}: its condition names variable "${c.variable}", which doesn't exist.`);
    const ids = new Set(target.options.map((o) => o.id));
    for (const o of 'in' in c ? c.in : c.not_in)
      if (!ids.has(o)) problems.push(`${where}: its condition names "${c.variable}" option "${o}", which doesn't exist.`);
  };
  const checkVaries = (where: string, list: readonly string[] | undefined, self: string) => {
    for (const id of list ?? []) {
      const target = byId.get(id);
      if (!target) problems.push(`${where}: it varies with "${id}", which doesn't exist.`);
      else if (id === self) problems.push(`${where}: it can't vary with itself.`);
      else if (target.options_from) problems.push(`${where}: it varies with "${id}", whose options come from the colour lists; that isn't supported.`);
    }
  };

  for (const g of cat.groups) {
    checkCond(`Group "${g.id}"`, g.when);
    for (const v of g.variables) {
      const at = `Variable "${v.id}"`;
      if (!regions.has(v.region)) problems.push(`${at}: region "${v.region}" isn't in the region list.`);
      checkCond(at, v.when);
      checkVaries(at, v.varies_with, v.id);
      if (v.options_from && v.options.length > 0) problems.push(`${at}: its options come from the colour lists, so its own option list must be empty.`);
      if (!v.options_from && v.options.length === 0) problems.push(`${at}: it has no options.`);
      for (const d of dupes(v.options.map((o) => o.id))) problems.push(`${at}: option "${d}" is listed twice.`);
      for (const o of v.options) {
        const oat = `${at}, option "${o.id}"`;
        checkCond(oat, o.when);
        checkVaries(oat, o.varies_with, v.id);
        if (o.colour_list) {
          const list = lists.get(o.colour_list);
          if (!list) problems.push(`${oat}: colour list "${o.colour_list}" isn't loaded.`);
          else if (!list.applies_to.includes(o.id)) problems.push(`${oat}: colour list "${o.colour_list}" doesn't say it applies to this material.`);
        }
      }
    }
  }

  const material = byId.get('material');
  for (const l of cat.colour_lists) {
    for (const d of dupes(l.colours.map((c) => c.id))) problems.push(`Colour list "${l.id}": colour "${d}" is listed twice.`);
    for (const m of l.applies_to) {
      const opt = material?.options.find((o) => o.id === m);
      if (!opt) problems.push(`Colour list "${l.id}": material "${m}" doesn't exist.`);
      else if (opt.colour_list !== l.id) problems.push(`Colour list "${l.id}": material "${m}" names a different colour list.`);
    }
  }

  const picked = new Set<string>();
  for (const p of cat.default_kitchen.picks) {
    const v = byId.get(p.variable);
    if (!v) {
      problems.push(`Default kitchen: variable "${p.variable}" doesn't exist.`);
      continue;
    }
    if (picked.has(p.variable)) problems.push(`Default kitchen: "${p.variable}" is picked twice.`);
    picked.add(p.variable);
    if (p.option === null) {
      if (!v.options_from) problems.push(`Default kitchen: "${p.variable}" has no pick.`);
      else if (!p.note) problems.push(`Default kitchen: "${p.variable}" has no pick and no note saying why.`);
    } else if (v.options_from) {
      const known = cat.colour_lists.some((l) => l.colours.some((c) => c.id === p.option));
      if (!known) problems.push(`Default kitchen: colour "${p.option}" isn't in any colour list.`);
    } else if (!v.options.some((o) => o.id === p.option)) {
      problems.push(`Default kitchen: "${p.variable}" option "${p.option}" doesn't exist.`);
    }
  }
  for (const v of variables) if (!picked.has(v.id)) problems.push(`Default kitchen: "${v.id}" has no pick.`);

  return problems;
}

export interface ImagePlanRow {
  readonly group: string;
  readonly variable: string;
  readonly label: string;
  readonly images: number;
  /** The count waits on a colour list the owner hasn't supplied yet. */
  readonly waiting_on: readonly string[];
}

/**
 * How many images each step needs. One per option, times every combination of the variables it
 * varies with. Room shapes are base photos of their own. A colour list's colours each make one
 * image per material the list applies to.
 */
export function imagePlan(cat: ImageCatalog): { readonly rows: readonly ImagePlanRow[]; readonly total: number } {
  const byId = new Map(cat.groups.flatMap((g) => g.variables).map((v) => [v.id, v]));
  const count = (id: string): number => byId.get(id)?.options.length ?? 0;
  const rows: ImagePlanRow[] = [];
  for (const g of cat.groups) {
    for (const v of g.variables) {
      if (v.options_from) {
        rows.push({
          group: g.id,
          variable: v.id,
          label: v.label,
          images: cat.colour_lists.reduce((n, l) => n + l.colours.length * l.applies_to.length, 0),
          waiting_on: cat.colour_lists.filter((l) => l.status === 'awaiting_owner').map((l) => l.id),
        });
        continue;
      }
      const images = v.options.reduce(
        (n, o) => n + (o.varies_with ?? v.varies_with ?? []).reduce((k, id) => k * count(id), 1),
        0,
      );
      rows.push({ group: g.id, variable: v.id, label: v.label, images, waiting_on: [] });
    }
  }
  return { rows, total: rows.reduce((n, r) => n + r.images, 0) };
}

export const IMAGE_CATALOG: Loaded<ImageCatalog> = buildImageCatalog({
  variables: variablesData,
  colourLists: [tafisaData, sherwinData, stainsData],
});
