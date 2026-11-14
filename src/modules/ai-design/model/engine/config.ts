/**
 * The layout builder's data (data/draft-rules.json), read and checked against the catalog and
 * the design rules it is used with. Anything missing or unknown refuses the whole builder with
 * every reason (rule 7): it never drafts with a cabinet it can't find.
 */
import { z } from 'zod';
import { ok, parseImperial, refuse, type Length, type Result } from '@/core/index';
import type { Catalog, CatalogItem } from '@/modules/catalog/contract';
import type { DesignRules } from '@/modules/shop-settings/contract';
import raw from '../../data/draft-rules.json';

const Status = z.enum(['confirmed', 'proposed']);
const Role = z.strictObject({ code: z.string(), status: Status, source: z.string().min(1) });
const Level = z.strictObject({
  banks_of_4: z.number().int().min(0),
  banks_of_3: z.number().int().min(0).nullable(),
  more_banks: z.boolean(),
  other: z.literal('drawer_over_doors'),
  status: Status.optional(),
  note: z.string().optional(),
});
const FileSchema = z.strictObject({
  source: z.string().min(1),
  max_appliance_move: z.strictObject({ value: z.string(), status: Status, source: z.string().min(1) }),
  ends: z.strictObject({ open: z.string(), closed: z.string(), status: Status, source: z.string().min(1) }),
  items: z.strictObject({
    base_doors: Role,
    drawer_over_doors: Role,
    bank_3: Role,
    bank_4: Role,
    sink_base: Role,
    dishwasher: Role,
    garbage: Role,
    base_filler: Role,
    wall_filler: Role,
    tall_filler: Role,
    uppers: z.strictObject({ codes: z.array(z.string()).min(1), status: Status, source: z.string().min(1) }),
    fridge_upper: Role,
    cooking_upper: Role,
    wall_oven: Role,
    pantry: Role,
    upper_corner: Role,
    island_back_panel: Role,
    fridge_panel: Role,
  }),
  corner_inserts: z.strictObject({ status: Status, source: z.string().min(1), lazy_susan: z.string(), double_shelf: z.string(), no_answer: Role }),
  clearances: z.strictObject({
    status: Status,
    source: z.string().min(1),
    hood_side: z.string(),
    hood_side_note: z.string().min(1),
    over_fridge: z.string(),
    over_fridge_note: z.string().min(1),
    fridge_panel_depth: z.string(),
    fridge_panel_depth_note: z.string().min(1),
    fridge_panel_kinds: z.array(z.string().min(1)).min(1),
    fridge_panel_kinds_note: z.string().min(1),
    fridge_height: z.strictObject({ value: z.string(), status: Status, source: z.string().min(1) }),
    flank_filler_max: z.strictObject({ value: z.string(), status: Status, source: z.string().min(1) }),
  }),
  drawer_levels: z.strictObject({ source: z.string().min(1), minimum: Level, moderate: Level, maximum: Level }),
  ranking: z.strictObject({ status: Status, source: z.string().min(1), strength_order: z.array(z.string()).min(1) }),
});

export type DrawerLevelId = 'minimum' | 'moderate' | 'maximum';
export interface DrawerLevel {
  readonly banksOf4: number;
  /** Null: no set number; every cabinet that can be a bank is one. */
  readonly banksOf3: number | null;
  readonly moreBanks: boolean;
}

/** The numbers a rule gives the builder, in 1/64". */
export interface RuleNumbers {
  readonly idealMin: Length;
  readonly idealMax: Length;
  readonly avoidOver: Length;
  readonly avoidUnder: Length;
  readonly oneCabinetUpTo: Length;
  readonly maxCabinet: Length;
  readonly minUpper: Length;
  readonly minDoorBase: Length;
  readonly minDrawerCabinet: Length;
  readonly endAllowance: Length;
}

export interface DraftConfig {
  readonly maxMove: Length;
  readonly ends: { readonly open: string; readonly closed: string };
  readonly items: {
    readonly baseDoors: CatalogItem;
    readonly drawerOverDoors: CatalogItem;
    readonly bank3: CatalogItem;
    readonly bank4: CatalogItem;
    readonly sinkBase: CatalogItem;
    readonly dishwasher: CatalogItem;
    readonly garbage: CatalogItem;
    readonly baseFiller: CatalogItem;
    readonly wallFiller: CatalogItem;
    readonly tallFiller: CatalogItem;
    readonly uppers: readonly CatalogItem[];
    readonly fridgeUpper: CatalogItem;
    /** The cabinet over a range or cooktop, when the designer chose one instead of a hood. */
    readonly cookingUpper: CatalogItem;
    readonly wallOven: CatalogItem;
    readonly pantry: CatalogItem;
    readonly upperCorner: CatalogItem;
    /** Covers an island's back (owner, 2026-11-10). */
    readonly islandBackPanel: CatalogItem;
    /** The part drafted as the panel each side of a fridge (DECISIONS AD-6, proposed). */
    readonly fridgePanel: CatalogItem;
  };
  readonly cornerInserts: Readonly<Record<string, CatalogItem>>;
  /** The L-shaped corner cabinet used when no corner insert is chosen (owner, 2026-11-10). */
  readonly cornerDefault: CatalogItem;
  /** The owner's clearances and panels (2026-11-10), in 1/64". */
  readonly clearances: {
    readonly hoodSide: Length;
    readonly overFridge: Length;
    readonly fridgePanelDepth: Length;
    readonly fridgePanelKinds: readonly string[];
    /** Rough until the fridge's spec is confirmed (OA-4). */
    readonly fridgeHeight: Length;
    /** The widest filler that keeps a hood's flank one cabinet when its side is a little longer (2026-11-10, proposed). */
    readonly flankFillerMax: Length;
  };
  readonly drawerLevels: Readonly<Record<DrawerLevelId, DrawerLevel>>;
  readonly strengthOrder: readonly string[];
  readonly numbers: RuleNumbers;
  /** What still waits for the owner's yes, in words, so a draft can say it used it. */
  readonly proposed: readonly string[];
}

/** Reads the builder's data against this catalog and these design rules. */
export function readDraftConfig(catalog: Catalog, rules: DesignRules, data: unknown = raw): Result<DraftConfig> {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return refuse(`The layout builder's data (draft-rules.json) is not in the right shape: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const d = parsed.data;
  const problems: string[] = [];

  const item = (code: string, what: string): CatalogItem => {
    const found = catalog.items.find((i) => i.code === code);
    if (!found) problems.push(`${what}: the catalog has no cabinet type "${code}".`);
    else if (found.availability !== 'available') problems.push(`${what}: "${found.name}" isn't available to ${catalog.shop.name}.`);
    else
      for (const dim of ['width', 'height', 'depth'] as const)
        if (found.size[dim].default.value === null) problems.push(`${what}: "${found.name}" has no standard ${dim}.`);
    return found as CatalogItem;
  };
  const length = (text: string, what: string): Length => {
    const r = parseImperial(text);
    if (!r.ok) problems.push(`${what}: ${r.reason}`);
    return r.ok ? r.value : 0;
  };
  const ruleLength = (id: string, name: string): Length => {
    const rule = rules.rules.find((r) => r.id === id);
    if (!rule) {
      problems.push(`Design rule ${id} is missing.`);
      return 0;
    }
    if (rule.status !== 'confirmed') problems.push(`Design rule ${id} is "${rule.status}", not confirmed.`);
    const v = rule.lengths[name];
    if (typeof v !== 'number') problems.push(`Design rule ${id} has no length "${name}".`);
    return typeof v === 'number' ? v : 0;
  };

  const i = d.items;
  const config: DraftConfig = {
    maxMove: length(d.max_appliance_move.value, 'max_appliance_move'),
    ends: { open: d.ends.open, closed: d.ends.closed },
    items: {
      baseDoors: item(i.base_doors.code, 'base_doors'),
      drawerOverDoors: item(i.drawer_over_doors.code, 'drawer_over_doors'),
      bank3: item(i.bank_3.code, 'bank_3'),
      bank4: item(i.bank_4.code, 'bank_4'),
      sinkBase: item(i.sink_base.code, 'sink_base'),
      dishwasher: item(i.dishwasher.code, 'dishwasher'),
      garbage: item(i.garbage.code, 'garbage'),
      baseFiller: item(i.base_filler.code, 'base_filler'),
      wallFiller: item(i.wall_filler.code, 'wall_filler'),
      tallFiller: item(i.tall_filler.code, 'tall_filler'),
      uppers: i.uppers.codes.map((c) => item(c, 'uppers')),
      fridgeUpper: item(i.fridge_upper.code, 'fridge_upper'),
      cookingUpper: item(i.cooking_upper.code, 'cooking_upper'),
      wallOven: item(i.wall_oven.code, 'wall_oven'),
      pantry: item(i.pantry.code, 'pantry'),
      upperCorner: item(i.upper_corner.code, 'upper_corner'),
      islandBackPanel: item(i.island_back_panel.code, 'island_back_panel'),
      fridgePanel: item(i.fridge_panel.code, 'fridge_panel'),
    },
    cornerInserts: { lazy_susan: item(d.corner_inserts.lazy_susan, 'corner_inserts.lazy_susan'), double_shelf: item(d.corner_inserts.double_shelf, 'corner_inserts.double_shelf') },
    cornerDefault: item(d.corner_inserts.no_answer.code, 'corner_inserts.no_answer'),
    clearances: {
      hoodSide: length(d.clearances.hood_side, 'clearances.hood_side'),
      overFridge: length(d.clearances.over_fridge, 'clearances.over_fridge'),
      fridgePanelDepth: length(d.clearances.fridge_panel_depth, 'clearances.fridge_panel_depth'),
      fridgePanelKinds: d.clearances.fridge_panel_kinds,
      fridgeHeight: length(d.clearances.fridge_height.value, 'clearances.fridge_height'),
      flankFillerMax: length(d.clearances.flank_filler_max.value, 'clearances.flank_filler_max'),
    },
    drawerLevels: {
      minimum: { banksOf4: d.drawer_levels.minimum.banks_of_4, banksOf3: d.drawer_levels.minimum.banks_of_3, moreBanks: d.drawer_levels.minimum.more_banks },
      moderate: { banksOf4: d.drawer_levels.moderate.banks_of_4, banksOf3: d.drawer_levels.moderate.banks_of_3, moreBanks: d.drawer_levels.moderate.more_banks },
      maximum: { banksOf4: d.drawer_levels.maximum.banks_of_4, banksOf3: d.drawer_levels.maximum.banks_of_3, moreBanks: d.drawer_levels.maximum.more_banks },
    },
    strengthOrder: d.ranking.strength_order,
    numbers: {
      idealMin: ruleLength('PREF-001', 'ideal_min'),
      idealMax: ruleLength('PREF-001', 'ideal_max'),
      avoidOver: ruleLength('PREF-002', 'avoid_over'),
      avoidUnder: ruleLength('PREF-003', 'avoid_under'),
      oneCabinetUpTo: ruleLength('PREF-025', 'one_cabinet_up_to'),
      maxCabinet: ruleLength('HARD-016', 'max_cabinet_width'),
      minUpper: ruleLength('HARD-015', 'min_upper'),
      minDoorBase: ruleLength('HARD-015', 'min_door_base'),
      minDrawerCabinet: ruleLength('HARD-015', 'min_drawer_cabinet'),
      endAllowance: ruleLength('CB-FACT-25', 'end_allowance'),
    },
    proposed: [
      ...(i.uppers.status === 'proposed' ? ['which upper height suits the room (30" or 36") is weighed as an option'] : []),
      ...(d.corner_inserts.status === 'proposed' ? ['the corner cabinet used for the client\'s corner choice'] : []),
      ...(i.fridge_panel.status === 'proposed' ? ['the Tall filler drafted as the panel each side of a fridge (DECISIONS AD-6)'] : []),
      ...(d.clearances.fridge_height.status === 'proposed' ? [`the fridge's rough ${d.clearances.fridge_height.value}" height, used to hang the cabinet over it, until its spec is confirmed (OA-4)`] : []),
      ...(d.clearances.flank_filler_max.status === 'proposed' ? [`a filler of up to ${d.clearances.flank_filler_max.value}" at the far end of the longer side beside a hood, so each side keeps one upper of the same width`] : []),
      ...(['moderate', 'maximum'] as const).filter((l) => d.drawer_levels[l].status === 'proposed').map((l) => `the "${l}" drawer level's cabinets that are not drawer banks`),
      ...(d.ranking.status === 'proposed' ? ['how options are ranked'] : []),
    ],
  };
  if (problems.length > 0) return refuse(`The layout builder can't start: ${problems.join(' ')}`);
  return ok(config);
}

/** Whether the catalog accepts this width for the item: its standard size, or on step within known limits. */
export function widthAllowed(item: CatalogItem, width: Length): boolean {
  const w = item.size.width;
  if (width === w.default.value) return true;
  if (!item.resizable || w.min.value === null || w.max.value === null || w.step.value === null) return false;
  return width >= w.min.value && width <= w.max.value && width % w.step.value === 0;
}

/** The widths the catalog accepts for an item, as a range, or null when only its standard size is allowed. */
export function widthRange(item: CatalogItem): { min: Length; max: Length; step: Length } | null {
  const w = item.size.width;
  if (!item.resizable || w.min.value === null || w.max.value === null || w.step.value === null) return null;
  return { min: w.min.value, max: w.max.value, step: w.step.value };
}

/** An item's standard size in one direction. Every catalog item has one (the catalog checks it). */
export function standard(item: CatalogItem, dim: 'width' | 'height' | 'depth'): Length {
  const v = item.size[dim].default.value;
  if (v === null) throw new Error(`Catalog item ${item.code} has no standard ${dim}; the catalog should have refused it.`);
  return v;
}
