/**
 * Rules for the rough layout (cabinet runs and appliances): data with a recorded source
 * (rule 6), in data/layout-rules.json. A bad data file fails loudly when the app starts;
 * it is never filled in.
 */
import { z } from 'zod';
import { RunKindSchema, parseImperial, type Length, type RunKind } from '@/core/index';
import raw from '../data/layout-rules.json';

const Size = z.string().min(1);
const ApplianceSchema = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string().min(1),
  label: z.string().min(1),
  widths: z.array(Size).min(1),
  comes_with_hood: z.boolean(),
  keep_clear_of_windows: z.boolean(),
  run_when_alone: RunKindSchema,
  centre_under_window: z.boolean(),
  adds_beside: z.string().nullable(),
  upper_above_depth: Size.nullable(),
});
const FileSchema = z.strictObject({
  source: z.string().min(1),
  proposed: z.record(z.string(), z.string().min(1)),
  default_run_kind: RunKindSchema,
  island_run_kind: RunKindSchema,
  run_depths: z.strictObject({ base: Size, upper_only: Size, upper_band: Size }),
  min_run_length: Size,
  opening_clearance: Size,
  corner_gaps: z.array(Size).min(1),
  island_depths: z.array(Size).min(1),
  island_start_size: z.strictObject({ length: Size, depth: Size }),
  appliances: z.array(ApplianceSchema).min(1),
});

export interface ApplianceType {
  readonly id: string;
  /** For people: "Range + hood". */
  readonly name: string;
  /** Short, for the plan: "RANGE". */
  readonly label: string;
  /** Standard widths; the first is used when it is placed. */
  readonly widths: readonly Length[];
  readonly comesWithHood: boolean;
  readonly keepClearOfWindows: boolean;
  /** The kind of run made under it when it is dropped on a bare wall. */
  readonly runWhenAlone: RunKind;
  readonly centreUnderWindow: boolean;
  /** Another appliance type added right beside it when the room has none (sink → dishwasher). */
  readonly addsBeside: string | null;
  /** The depth of the upper cabinet above it, when that differs from the run's (a fridge's 24" upper). */
  readonly upperAboveDepth: Length | null;
}

export interface LayoutRules {
  readonly source: string;
  readonly defaultRunKind: RunKind;
  readonly islandRunKind: RunKind;
  readonly runDepths: { readonly base: Length; readonly upperOnly: Length; readonly upperBand: Length };
  readonly minRunLength: Length;
  /** Run ends and appliances stay this far from doors, passthroughs and (for pantry) windows. */
  readonly openingClearance: Length;
  /** Where a run ends short of the run on the next wall, measured from that run's front. */
  readonly cornerGaps: readonly Length[];
  readonly islandDepths: readonly Length[];
  /** What the "Add island" button makes. */
  readonly islandStartSize: { readonly length: Length; readonly depth: Length };
  readonly appliances: readonly ApplianceType[];
}

/** Reads and checks the layout rules. Returns every problem, not just the first. */
export function readLayoutRules(data: unknown): { ok: true; value: LayoutRules } | { ok: false; reason: string } {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `layout-rules.json is not in the right shape: ${parsed.error.message}` };
  const d = parsed.data;
  const problems: string[] = [];
  const length = (where: string, text: string): Length => {
    const r = parseImperial(text);
    if (!r.ok) problems.push(`${where}: ${r.reason}`);
    else if (r.value <= 0) problems.push(`${where}: must be more than zero`);
    return r.ok ? r.value : 0;
  };
  const ids = new Set<string>();
  const appliances = d.appliances.map((a): ApplianceType => {
    if (ids.has(a.id)) problems.push(`appliance "${a.id}" is listed twice`);
    ids.add(a.id);
    return {
      id: a.id,
      name: a.name,
      label: a.label,
      widths: a.widths.map((w) => length(`${a.id} width`, w)),
      comesWithHood: a.comes_with_hood,
      keepClearOfWindows: a.keep_clear_of_windows,
      runWhenAlone: a.run_when_alone,
      centreUnderWindow: a.centre_under_window,
      addsBeside: a.adds_beside,
      upperAboveDepth: a.upper_above_depth === null ? null : length(`${a.id} upper above`, a.upper_above_depth),
    };
  });
  for (const a of appliances) {
    if (a.addsBeside !== null && !ids.has(a.addsBeside)) problems.push(`${a.id} adds "${a.addsBeside}" beside it, which is not on the list`);
  }
  const value: LayoutRules = {
    source: d.source,
    defaultRunKind: d.default_run_kind,
    islandRunKind: d.island_run_kind,
    runDepths: {
      base: length('base run depth', d.run_depths.base),
      upperOnly: length('upper-only run depth', d.run_depths.upper_only),
      upperBand: length('upper band depth', d.run_depths.upper_band),
    },
    minRunLength: length('shortest run', d.min_run_length),
    openingClearance: length('opening clearance', d.opening_clearance),
    cornerGaps: d.corner_gaps.map((g) => length('corner gap', g)),
    islandDepths: d.island_depths.map((g) => length('island depth', g)),
    islandStartSize: { length: length('island start length', d.island_start_size.length), depth: length('island start depth', d.island_start_size.depth) },
    appliances,
  };
  if (problems.length > 0) return { ok: false, reason: `layout-rules.json has bad values: ${problems.join('; ')}` };
  return { ok: true, value };
}

const read = readLayoutRules(raw);
if (!read.ok) throw new Error(read.reason);

export const LAYOUT_RULES: LayoutRules = read.value;

/** The appliance type with this ID, or null when it isn't on the list (the caller refuses). */
export function applianceType(rules: LayoutRules, id: string): ApplianceType | null {
  return rules.appliances.find((a) => a.id === id) ?? null;
}
