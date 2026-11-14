/**
 * A PLACEHOLDER for the AI design step (owner, 2026-11-08: "a placeholder AI design animation
 * (with no actual AI design)"). No AI is called: a fixed recipe from the owner's Kitchen Studio
 * prototype fills each cabinet run with catalog cabinets, so the customize screens can be tried.
 *
 * Its layout becomes placed items in the room's master copy (`cabinets.ts`), marked as placed by
 * the draft step until a designer approves or changes them; every screen says it is a placeholder.
 * The recipe's numbers are data (`data/placeholder-draft.json`); cabinet types and sizes come
 * from the catalog. Pure: no clock, no randomness (IDs are passed in).
 */
import { formatInches, parseImperial, type Length, type Result, type Room, type Run, type Wall } from '@/core/index';
import { CURRENT_CATALOG, type Catalog, type CatalogItem } from '@/modules/catalog/contract';
import { DESIGN_RULES } from '@/modules/shop-settings/contract';
import data from '../data/placeholder-draft.json';
import type { FrontRules } from './fronts';
import { applianceType, LAYOUT_RULES, overOf, type LayoutRules } from './layout-rules';
import { applianceEnd, cornerCabinets, hasBase, hasUpper, insideSpan, runEnd, sortedRuns, subtract, upperPieces, windowSpans, type Span } from './layout';

export type DrawerLevel = 'minimum' | 'moderate' | 'maximum';

/** What the design choices say that the recipe uses. The app reads them from the intake. */
export interface DraftPreferences {
  /** Null when the room's choices have no drawer level: its base cabinets stay plain door cabinets. */
  readonly drawers: DrawerLevel | null;
  /** The corner insert's option ID (lazy_susan or double_shelf), or null when none was chosen. */
  readonly cornerInsert: string | null;
  /** Where the garbage pull-out goes: none, under the sink, or a cabinet of its own. */
  readonly garbage: 'none' | 'under_sink' | 'dedicated_cabinet';
  /** How tall the cabinets go (intake's cabinet height): a length, the ceiling, or null when not chosen. */
  readonly cabinetTop: Length | 'ceiling' | null;
  /** Which cabinets the room uses: a bathroom's vanities or the kitchen's (the design choices' room grouping). */
  readonly roomSet: 'kitchen' | 'bath';
}

export interface PlaceholderCabinet {
  readonly id: string;
  /** A catalog code; null for an appliance or a hood, which are not cabinets. */
  readonly code: string | null;
  /** The appliance kind (fridge, range…) or "hood"; null for a cabinet. */
  readonly appliance: string | null;
  readonly wallId: string;
  readonly runId: string;
  readonly layer: 'base' | 'upper';
  /** Along the wall, from its start corner to the cabinet's near edge. */
  readonly offset: Length;
  readonly width: Length;
  /** Deeper than the catalog's standard (the upper over a fridge); null for the catalog's depth. */
  readonly depth: Length | null;
  /** From the floor to the cabinet's bottom, and its height: uppers and talls reach the design's top line. */
  readonly elevation: Length;
  readonly height: Length;
  /** False while it is as the placeholder put it; true once a designer has changed or approved it. */
  readonly reviewed: boolean;
  /** On the far side of an island's line (its back panel); absent for everything else. */
  readonly back?: boolean;
}

export interface PlaceholderDesign {
  readonly version: 2;
  /** The room it was drafted for. */
  readonly roomId: string;
  /** The top line every upper and tall cabinet reaches. */
  readonly upperTop: Length;
  readonly cabinets: readonly PlaceholderCabinet[];
  /**
   * Appliances the builder moved along their own wall, each explained in the notes: a fridge drawn
   * against a wall or corner moves over just enough for its panel (owner, 2026-11-12: "the fridge
   * should have fridge panels on both sides"). `applyMoves` (cabinets.ts) saves them in the room.
   */
  readonly moves: readonly { readonly placementId: string; readonly offset: Length }[];
  /** Why it looks the way it does, in plain words. */
  readonly notes: readonly string[];
}

export interface DraftSettings {
  readonly largestWidth: Length;
  readonly widthStep: Length;
  /** The widest filler that lets the uppers either side of a hood stay one cabinet each (PROPOSED). */
  readonly flankFillerMax: Length;
  readonly codes: typeof data.cabinets;
  readonly narrowBelow: Length;
  /** Owner, 2026-11-10: the clear space beside a hood, over a fridge, and the fridge panels' depth. */
  readonly clearances: {
    readonly hoodSide: Length;
    readonly overFridge: Length;
    readonly fridgePanelDepth: Length;
    /** The case over a fridge is the panel's depth less this, so its doors are flush with the panel (owner, 2026-11-12). */
    readonly overFridgeCaseShort: Length;
  };
  /** The finished-end rule (decided 2026-11-07, CB-FACT-10): catalog values for end_left / end_right. */
  readonly ends: {
    /** The value for an end with nothing beside it. */
    readonly open: string;
    /** The value for an end against a wall, a cabinet, a panel or a corner leg. */
    readonly closed: string;
    /** The values that cover an end (the 3D view draws a finished end for these). */
    readonly finished: ReadonlySet<string>;
    /** The catalog types whose ends the builder sets. */
    readonly types: ReadonlySet<string>;
  };
  readonly visual: {
    readonly toeKick: Length;
    readonly counter: Length;
    readonly counterOverhang: Length;
    readonly upperBottom: Length;
    readonly fridgeHeight: Length;
    readonly fridgeDepth: Length;
    readonly rangeDepth: Length;
    /** Top trim and light valance profiles by option ID (PROPOSED stand-ins), and the options drawn as nothing. */
    readonly trim: TrimSettings;
  };
  /** How the 3D view lays out doors and drawers (model/fronts.ts), in inches. */
  readonly fronts: FrontRules;
}

/** A top trim's profile: its height, how far it stands out past the doors, and in how many steps. */
export interface TopTrimSize {
  readonly height: Length;
  readonly projection: Length;
  readonly steps: number;
}
/** A light valance's profile: its height, thickness and shape (flat, or a light rail's cove and bead). */
export interface ValanceSize {
  readonly height: Length;
  readonly thickness: Length;
  readonly profile: 'flat' | 'light_rail';
}
export interface TrimSettings {
  readonly top: ReadonlyMap<string, TopTrimSize>;
  readonly valance: ReadonlyMap<string, ValanceSize>;
  readonly drawsNothing: { readonly top: ReadonlySet<string>; readonly valance: ReadonlySet<string> };
}

/** The trim profiles from the data; a size that isn't an exact length stops the view with the reason. */
function readTrim(raw: typeof data.visual.trim): Result<TrimSettings> {
  const len = (where: string, text: string): Result<Length> => {
    const r = parseImperial(text);
    return r.ok ? r : { ok: false, reason: `placeholder-draft.json "visual.trim.${where}": ${r.reason}` };
  };
  const top = new Map<string, TopTrimSize>();
  for (const [id, v] of Object.entries(raw.top)) {
    const height = len(`top.${id}.height`, v.height);
    const projection = len(`top.${id}.projection`, v.projection);
    if (!height.ok) return height;
    if (!projection.ok) return projection;
    if (!Number.isInteger(v.steps) || v.steps < 1) return { ok: false, reason: `placeholder-draft.json "visual.trim.top.${id}.steps" must be a whole number of 1 or more.` };
    top.set(id, { height: height.value, projection: projection.value, steps: v.steps });
  }
  const valance = new Map<string, ValanceSize>();
  for (const [id, v] of Object.entries(raw.valance)) {
    const height = len(`valance.${id}.height`, v.height);
    const thickness = len(`valance.${id}.thickness`, v.thickness);
    if (!height.ok) return height;
    if (!thickness.ok) return thickness;
    if (v.profile !== 'flat' && v.profile !== 'light_rail') return { ok: false, reason: `placeholder-draft.json "visual.trim.valance.${id}.profile" must be "flat" or "light_rail".` };
    valance.set(id, { height: height.value, thickness: thickness.value, profile: v.profile });
  }
  return { ok: true, value: { top, valance, drawsNothing: { top: new Set(raw.draws_nothing.top), valance: new Set(raw.draws_nothing.valance) } } };
}

function readSettings(): Result<DraftSettings> {
  const lengths: Record<string, string> = {
    largest_width: data.fill.largest_width,
    width_step: data.fill.width_step,
    flank_filler_max: data.fill.flank_filler_max,
    narrow_below: data.cabinets.base_by_drawer_level.minimum.narrow_below,
    toe_kick_height: data.visual.toe_kick_height,
    counter_thickness: data.visual.counter_thickness,
    counter_overhang: data.visual.counter_overhang,
    upper_bottom: data.visual.upper_bottom,
    top_drawer_front: data.visual.top_drawer_front,
    fridge_height: data.visual.appliances.fridge_height,
    fridge_depth: data.visual.appliances.fridge_depth,
    range_depth: data.visual.appliances.range_depth,
    hood_side: data.clearances.hood_side,
    over_fridge: data.clearances.over_fridge,
    fridge_panel_depth: data.clearances.fridge_panel_depth,
    over_fridge_case_short: data.clearances.over_fridge_case_short,
  };
  const out: Record<string, Length> = {};
  for (const [k, text] of Object.entries(lengths)) {
    const r = parseImperial(text);
    if (!r.ok) return { ok: false, reason: `placeholder-draft.json: ${k}: ${r.reason}` };
    out[k] = r.value;
  }
  // The door sizes the shop confirmed for drawing (CB-FACT-16); missing ones stop the view with the reason.
  const doorRule = DESIGN_RULES.rules.find((r) => r.id === 'CB-FACT-16');
  const doorLength = (name: string): Length | null => {
    const v = doorRule?.lengths[name];
    return typeof v === 'number' ? v : null;
  };
  const maxSingleDoor = doorLength('max_single_door_width');
  const maxDoorHeight = doorLength('max_door_height');
  if (maxSingleDoor === null || maxDoorHeight === null) return { ok: false, reason: 'Design rule CB-FACT-16 (door sizes) is missing its widest or tallest single door.' };
  // The base cabinets' fronts reach the top of the box (the 3D view draws them so).
  const baseTop = CURRENT_CATALOG.items.find((i) => i.code === data.cabinets.base)?.size.height.default.value ?? null;
  if (baseTop === null) return { ok: false, reason: `The catalog has no standard height for "${data.cabinets.base}", so a pantry's doors can't be lined up with the base cabinets.` };
  const trim = readTrim(data.visual.trim);
  if (!trim.ok) return trim;
  const codes = data.cabinets;
  const all = [
    codes.base,
    codes.base_filler,
    codes.pantry,
    codes.sink,
    codes.dishwasher,
    codes.wall_oven,
    codes.corner_lazy_susan,
    codes.corner_double_shelf,
    codes.corner_default,
    codes.island_back_panel,
    codes.fridge_panel,
    codes.garbage,
    codes.upper,
    codes.upper_over_fridge,
    codes.upper_over_cooking,
    codes.upper_corner,
    codes.upper_filler,
    codes.bath.base,
    codes.bath.sink,
    codes.bath.base_filler,
    codes.bath.maximum,
    codes.base_by_drawer_level.minimum.most,
    codes.base_by_drawer_level.minimum.narrow,
    codes.base_by_drawer_level.minimum.one_bank_of_3,
    codes.base_by_drawer_level.minimum.one_bank_of_4,
    ...codes.base_by_drawer_level.moderate.banks,
    codes.base_by_drawer_level.moderate.every_third,
    codes.base_by_drawer_level.maximum.all,
    codes.base_by_drawer_level.four_banks.code,
  ];
  const missing = all.filter((c) => !CURRENT_CATALOG.items.some((i) => i.code === c));
  if (missing.length) return { ok: false, reason: `placeholder-draft.json names cabinet types the catalog doesn't have: ${missing.join(', ')}` };
  // The end values must be choices the catalog offers for both ends.
  for (const code of ['end_left', 'end_right']) {
    const option = CURRENT_CATALOG.options.find((o) => o.code === code);
    if (!option) return { ok: false, reason: `The catalog has no "${code}" option, so the builder can't set cabinet ends.` };
    const bad = [data.ends.open, data.ends.closed, ...data.ends.finished].filter((v) => !option.values.some((x) => x.code === v));
    if (bad.length) return { ok: false, reason: `placeholder-draft.json "ends" names values the catalog's ${option.name} doesn't offer: ${bad.join(', ')}` };
  }
  const unknownTypes = data.ends.types.filter((t) => !CURRENT_CATALOG.items.some((i) => i.type === t));
  if (unknownTypes.length) return { ok: false, reason: `placeholder-draft.json "ends" names cabinet types the catalog doesn't have: ${unknownTypes.join(', ')}` };
  if (!data.ends.finished.includes(data.ends.open) || data.ends.finished.includes(data.ends.closed))
    return { ok: false, reason: 'placeholder-draft.json "ends": the open-end value must be a finished one, and the closed-end value must not be.' };
  return {
    ok: true,
    value: {
      largestWidth: out['largest_width']!,
      widthStep: out['width_step']!,
      flankFillerMax: out['flank_filler_max']!,
      narrowBelow: out['narrow_below']!,
      codes,
      clearances: { hoodSide: out['hood_side']!, overFridge: out['over_fridge']!, fridgePanelDepth: out['fridge_panel_depth']!, overFridgeCaseShort: out['over_fridge_case_short']! },
      ends: { open: data.ends.open, closed: data.ends.closed, finished: new Set(data.ends.finished), types: new Set(data.ends.types) },
      visual: {
        toeKick: out['toe_kick_height']!,
        counter: out['counter_thickness']!,
        counterOverhang: out['counter_overhang']!,
        upperBottom: out['upper_bottom']!,
        fridgeHeight: out['fridge_height']!,
        fridgeDepth: out['fridge_depth']!,
        rangeDepth: out['range_depth']!,
        trim: trim.value,
      },
      fronts: { maxSingleDoor: maxSingleDoor / 64, maxDoorHeight: maxDoorHeight / 64, topDrawer: out['top_drawer_front']! / 64, upperBottom: out['upper_bottom']! / 64, baseTop: baseTop / 64 },
    },
  };
}

const read = readSettings();
/** The recipe's settings, or the reason they can't be used (the screen shows it). */
export const DRAFT_SETTINGS: Result<DraftSettings> = read;

/** The catalog item for a code. Every code the recipe uses was checked when the data loaded. */
export function itemByCode(code: string, catalog: Catalog = CURRENT_CATALOG): CatalogItem | null {
  return catalog.items.find((i) => i.code === code) ?? null;
}

/** The catalog's standard size of a cabinet type; null when the catalog doesn't know it. */
export function standard(code: string, dim: 'width' | 'height' | 'depth', catalog: Catalog = CURRENT_CATALOG): Length | null {
  return itemByCode(code, catalog)?.size[dim].default.value ?? null;
}

/**
 * Cabinets made to fit the space (owner, 2026-11-10: "Widths are custom and made to fit the
 * space"): as few equal cabinets as fit under the largest width, on the catalog's width step, with
 * any extra steps spread one each from the left. A space narrower than the shortest run is one filler.
 * `filler` is what is left: the whole space when it is too narrow, otherwise under one step.
 */
export function fillWidths(gap: Length, s: Pick<DraftSettings, 'largestWidth' | 'widthStep'>, minRun: Length): { widths: Length[]; filler: Length } {
  if (gap <= 0) return { widths: [], filler: 0 };
  if (gap < minRun) return { widths: [], filler: gap };
  const n = Math.ceil(gap / s.largestWidth);
  const steps = Math.floor(gap / s.widthStep);
  const each = Math.floor(steps / n);
  if (each <= 0) return { widths: [], filler: gap };
  const extra = steps - each * n;
  const widths = Array.from({ length: n }, (_, k) => (each + (k < extra ? 1 : 0)) * s.widthStep);
  return { widths, filler: gap - steps * s.widthStep };
}

/**
 * One width for the uppers either side of a hood (PREF-019): the widest, up to the largest
 * cabinet, that leaves each side's rest nothing, a stretch long enough for cabinets, or a filler
 * no wider than `flankFillerMax` at the far end.
 */
export function equalFlank(a: Length, b: Length, s: Pick<DraftSettings, 'largestWidth' | 'widthStep' | 'flankFillerMax'>, minRun: Length): Length | null {
  const fine = (rest: Length) => rest < s.widthStep || rest >= minRun || rest <= s.flankFillerMax;
  const cap = Math.min(a, b, s.largestWidth);
  for (let w = cap - (cap % s.widthStep); w >= Math.min(minRun, cap) && w > 0; w -= s.widthStep) if (fine(a - w) && fine(b - w)) return w;
  return null;
}

/** A stretch cut where the cabinets above it need a joint below them, keeping every part at least `minRun`. */
function splitAt(gap: Span, points: readonly Length[], minRun: Length): Span[] {
  const out: Span[] = [];
  let at = gap.start;
  for (const p of [...points].sort((x, y) => x - y)) {
    if (p - at >= minRun && gap.end - p >= minRun) {
      out.push({ start: at, end: p });
      at = p;
    }
  }
  out.push({ start: at, end: gap.end });
  return out;
}

/**
 * `hung`: a cabinet over a range or cooktop, hung from the top line at its own height.
 * `full`: a panel from the floor to the top line (a fridge panel). `back`: on the far side of an
 * island's line, covering the cabinets' backs.
 */
type Draft = { id: string; code: string | null; appliance: string | null; layer: 'base' | 'upper'; offset: Length; width: Length; depth: Length | null; hung?: true; full?: true; back?: true };

/** The hood views: an appliance hood or a millwork hood over a range or cooktop. */
export const isHood = (appliance: string | null): boolean => appliance === 'hood' || appliance === 'millwork_hood';

/**
 * Drafts the room. Refuses (with the reason) when the recipe's data can't be used or a cabinet
 * type it needs has no standard size in the catalog; it never makes one up (rule 7).
 */
export function draftPlaceholder(room: Room, prefs: DraftPreferences, newId: () => string, rules: LayoutRules = LAYOUT_RULES): Result<PlaceholderDesign> {
  if (!DRAFT_SETTINGS.ok) return DRAFT_SETTINGS;
  const s = DRAFT_SETTINGS.value;
  const c = s.codes;
  const size = (code: string, dim: 'width' | 'height' | 'depth'): Length => {
    const v = standard(code, dim);
    if (v === null) throw new MissingSize(`The catalog has no standard ${dim} for "${code}".`);
    return v;
  };
  try {
    const out: (Draft & { wallId: string; runId: string })[] = [];
    const notes: string[] = [];
    const corners = cornerCabinets(room, rules);
    // Corners where runs overlap are L-shaped 90-degree corner cabinets (owner, 2026-11-10).
    const cornerCode = prefs.cornerInsert === 'lazy_susan' ? c.corner_lazy_susan : prefs.cornerInsert === 'double_shelf' ? c.corner_double_shelf : c.corner_default;
    const cl = s.clearances;
    // Bathrooms use the vanity cabinets (owner, 2026-11-10); every other room the kitchen's.
    const codes = prefs.roomSet === 'bath' ? { base: c.bath.base, sink: c.bath.sink, base_filler: c.bath.base_filler } : { base: c.base, sink: c.sink, base_filler: c.base_filler };
    /** Slivers under one cabinet step where a stretch doesn't land on the step: said once in the notes. */
    const leftOver = { total: 0 };
    const panelW = size(c.fridge_panel, 'width');

    const moves: { placementId: string; offset: Length }[] = [];
    for (const w0 of room.walls) {
      const span = insideSpan(room, w0);
      const startCorner = corners.find((k) => k.startingWallId === w0.wall_id) ?? null;
      const endCorner = corners.find((k) => k.endingWallId === w0.wall_id) ?? null;
      // A fridge always has a full-height, full-depth panel on each side (owner, 2026-11-10), in
      // the stretch the cabinets can use (not behind a corner cabinet).
      const usable: Span = {
        start: span.start + (startCorner?.base ? size(cornerCode, 'width') : 0),
        end: span.end - (endCorner?.base ? size(cornerCode, 'depth') : 0),
      };
      // A fridge drawn against a wall or corner moves over just enough for its panel, never
      // skipping one (owner, 2026-11-12); said in the notes, and saved with the room (applyMoves).
      const w = shiftFridges(w0, usable, panelW, (placementId, offset, by) => {
        moves.push({ placementId, offset });
        notes.push(`The fridge on wall ${room.walls.indexOf(w0) + 1} is drawn ${formatInches(Math.abs(by))} ${by > 0 ? 'toward the wall’s end' : 'toward the wall’s start'} to make room for its panel against the wall or corner.`);
      });
      const fridgePanels: Span[] = [];
      for (const a of w.appliances.filter((x) => x.kind === 'fridge')) {
        for (const [side, p] of [
          ['start', { start: a.offset - panelW, end: a.offset }],
          ['end', { start: applianceEnd(a), end: applianceEnd(a) + panelW }],
        ] as const) {
          if (p.start >= usable.start && p.end <= usable.end) fridgePanels.push(p);
          else notes.push(`There is no room for the fridge panel on the fridge's ${side === 'start' ? 'left' : 'right'} side of wall ${room.walls.indexOf(w0) + 1}: the stretch is too short for the fridge and both panels.`);
        }
      }
      const runs = sortedRuns(w);
      const runOfSpan = (at: Span) => runs.find((r) => r.offset <= at.start && at.end <= runEnd(r)) ?? runs.find((r) => r.offset < at.end && at.start < runEnd(r)) ?? null;

      // Over each range or cooktop on this wall, whichever run it stands in: a hood with 2" clear
      // each side, or a cabinet (owner, 2026-11-09 and 2026-11-10). The uppers either side are cut back to it.
      const focal: Span[] = [];
      for (const a of w.appliances) {
        const over = overOf(a, rules);
        if (!over) continue;
        const runId = runOfSpan({ start: a.offset, end: applianceEnd(a) })?.run_id ?? '';
        if (over === 'appliance_hood' || over === 'millwork_hood') out.push({ id: newId(), code: null, appliance: over === 'appliance_hood' ? 'hood' : 'millwork_hood', layer: 'upper', offset: a.offset, width: a.width.value, depth: null, wallId: w.wall_id, runId });
        if (over === 'cabinet') out.push({ id: newId(), code: c.upper_over_cooking, appliance: null, layer: 'upper', offset: a.offset, width: a.width.value, depth: null, hung: true, wallId: w.wall_id, runId });
        const g = over === 'cabinet' ? 0 : cl.hoodSide;
        focal.push({ start: a.offset - g, end: applianceEnd(a) + g });
      }

      // Where every run's uppers go, worked out before the bases so the bases can line up with them.
      const plan = new Map<string, { pieces: Span[]; corner: Length | null }>();
      for (const run of runs) {
        if (!hasUpper(run.kind)) continue;
        const atStart = run.offset <= span.start && startCorner !== null;
        const atEnd = runEnd(run) >= span.end && endCorner !== null;
        let pieces: Span[] =
          run.kind === 'upper'
            ? subtract({ start: Math.max(run.offset, span.start), end: Math.min(runEnd(run), span.end) }, w.kind === 'room' ? windowSpans(w) : [])
            : upperPieces(w, run, rules);
        let corner: Length | null = null;
        if (atStart && startCorner?.upper && pieces[0] && pieces[0].start <= span.start) {
          const cw = size(c.upper_corner, 'width');
          corner = pieces[0].start;
          pieces = subtract(pieces[0], [{ start: pieces[0].start, end: pieces[0].start + cw }]).concat(pieces.slice(1));
        }
        if (atEnd && endCorner?.upper) pieces = pieces.flatMap((p) => subtract(p, [{ start: span.end - size(c.upper_corner, 'depth'), end: span.end }]));
        // The fridge panels stand to the top line; the hood or the cabinet over the cooking has its own space.
        plan.set(run.run_id, { pieces: pieces.flatMap((p) => subtract(p, [...fridgePanels, ...focal])).filter((p) => p.end - p.start >= rules.minRunLength), corner });
      }
      // The uppers either side of a hood, or of the cabinet over the cooking, are the same width
      // (PREF-019, HARD-007), and the base cabinets below are sized to line up with them (owner, 2026-11-10).
      const allPieces = [...plan.values()].flatMap((x) => x.pieces);
      const flankLow = new Map<Span, Length>();
      const flankHigh = new Map<Span, Length>();
      const lineUp: Length[] = [];
      for (const f of focal) {
        const lo = allPieces.find((p) => p.end === f.start);
        const hi = allPieces.find((p) => p.start === f.end);
        if (!lo || !hi) continue;
        const flank = equalFlank(lo.end - lo.start, hi.end - hi.start, s, rules.minRunLength);
        if (flank === null) {
          notes.push(`The uppers either side of the hood on wall ${room.walls.indexOf(w0) + 1} can't be made the same width.`);
          continue;
        }
        flankHigh.set(lo, flank);
        flankLow.set(hi, flank);
        lineUp.push(lo.end - flank, hi.start + flank);
      }

      for (const run of runs) {
        const items: Draft[] = [];
        const add = (d: Omit<Draft, 'id'>) => items.push({ id: newId(), ...d });
        const atStart = run.offset <= span.start && startCorner !== null;
        const atEnd = runEnd(run) >= span.end && endCorner !== null;

        if (hasBase(run.kind) || run.kind === 'pantry') {
          let from = Math.max(run.offset, span.start);
          let to = Math.min(runEnd(run), span.end);
          if (atStart && startCorner?.base) {
            const cw = size(cornerCode, 'width');
            add({ code: cornerCode, appliance: null, layer: 'base', offset: from, width: cw, depth: null });
            from += cw;
          }
          // The corner square at the end belongs to the next wall's corner cabinet: its L's other
          // leg runs this far along this wall.
          if (atEnd && endCorner?.base) to -= size(cornerCode, 'depth');
          const taken: Span[] = [];
          // Every appliance standing in this stretch, even one that pokes past its end (never skipped:
          // the layout checks then show the clash). Sinks first, so the dishwasher can touch the sink base.
          const isSink = (k: string) => k === 'sink' || k === 'bar_sink' || k === 'vanity_sink' || k === 'double_vanity_sink';
          const aps = w.appliances
            .filter((a) => a.offset < to && applianceEnd(a) > from)
            .sort((a, b) => Number(isSink(b.kind)) - Number(isSink(a.kind)) || a.offset - b.offset);
          const placedWithSink = new Set<string>();
          /** Where a cabinet of this width goes nearest `at` without overlapping anything already placed: touching it. */
          const clear = (at: Length, width: Length): Length => {
            const hit = taken.find((t) => at < t.end && at + width > t.start);
            if (!hit) return at;
            return at + width / 2 < (hit.start + hit.end) / 2 ? hit.start - width : hit.end;
          };
          for (const a of aps) {
            const aw = a.width.value;
            if (!isSink(a.kind) && !placedWithSink.has(a.placement_id) && (a.offset < from || applianceEnd(a) > to))
              notes.push(`The ${a.kind.replace(/_/g, ' ')} on wall ${room.walls.indexOf(w0) + 1} runs ${formatInches(Math.max(from - a.offset, applianceEnd(a) - to))} into the corner cabinet or past the end of its run: move it on the room drawing.`);
            if (isSink(a.kind)) {
              const sinkCode = codes.sink;
              const sw = Math.max(aw, size(sinkCode, 'width'));
              let o = Math.round(a.offset + aw / 2 - sw / 2);
              // The dishwasher paired with the sink touches the sink base, on its side (HARD-005).
              const dw = aps.find((d) => d.kind === 'dishwasher' && d.paired_with === a.placement_id) ?? null;
              const dwW = dw?.width.value ?? 0;
              const dwHigh = dw ? dw.offset + dwW / 2 >= a.offset + aw / 2 : true;
              const gs = dw && !dwHigh ? o - dwW : o;
              const ge = dw && dwHigh ? o + sw + dwW : o + sw;
              // Kept inside the stretch (clear of a corner cabinet), said when it moves.
              const move = ge > to ? Math.max(to - ge, from - gs) : Math.max(0, from - gs);
              if (move !== 0) {
                o += move;
                notes.push(`The sink base${dw ? ' and dishwasher' : ''} on wall ${room.walls.indexOf(w0) + 1} ${dw ? 'are' : 'is'} drawn ${formatInches(Math.abs(move))} ${move < 0 ? 'toward the wall’s start' : 'toward the wall’s end'} to clear the corner or the end of the run: move the sink on the room drawing to match.`);
              }
              add({ code: sinkCode, appliance: null, layer: 'base', offset: o, width: sw, depth: null });
              taken.push({ start: o, end: o + sw });
              if (dw) {
                const dOff = dwHigh ? o + sw : o - dwW;
                add({ code: c.dishwasher, appliance: null, layer: 'base', offset: dOff, width: dwW, depth: null });
                taken.push({ start: dOff, end: dOff + dwW });
                placedWithSink.add(dw.placement_id);
              }
            } else if (a.kind === 'dishwasher') {
              if (placedWithSink.has(a.placement_id)) continue;
              const o = clear(a.offset, aw);
              add({ code: c.dishwasher, appliance: null, layer: 'base', offset: o, width: aw, depth: null });
              taken.push({ start: o, end: o + aw });
            } else if (a.kind === 'wall_oven') {
              add({ code: c.wall_oven, appliance: null, layer: 'base', offset: a.offset, width: aw, depth: null });
              taken.push({ start: a.offset, end: a.offset + aw });
            } else {
              add({ code: null, appliance: a.kind, layer: 'base', offset: a.offset, width: aw, depth: null });
              taken.push({ start: a.offset, end: a.offset + aw });
            }
          }
          // Each fridge's panels, beside it (a panel may stand just past the run's end).
          const fridges = aps.filter((a) => a.kind === 'fridge');
          for (const p of fridgePanels.filter((p) => fridges.some((a) => p.end === a.offset || p.start === applianceEnd(a)))) {
            add({ code: c.fridge_panel, appliance: null, layer: 'base', offset: p.start, width: p.end - p.start, depth: cl.fridgePanelDepth, full: true });
            taken.push(p);
          }
          // An island's back is covered by a finished back panel (owner, 2026-11-10).
          if (w.kind === 'floating' && hasBase(run.kind) && to > from) add({ code: c.island_back_panel, appliance: null, layer: 'base', offset: from, width: to - from, depth: null, back: true });
          const fillCode = run.kind === 'pantry' ? c.pantry : codes.base;
          for (const gap of subtract({ start: from, end: to }, taken))
            for (const part of splitAt(gap, lineUp, rules.minRunLength)) fillGap(part, fillCode, codes.base_filler, 'base', add, s, rules, leftOver);
        }

        const up = plan.get(run.run_id);
        if (up) {
          if (up.corner !== null) add({ code: c.upper_corner, appliance: null, layer: 'upper', offset: up.corner, width: size(c.upper_corner, 'width'), depth: null });
          // A deeper upper over a fridge (upperPieces leaves its stretch out): its doors flush with
          // the fridge panels' fronts (owner, 2026-11-12).
          for (const a of w.appliances) {
            const t = applianceType(rules, a.kind);
            if (!t || t.upperAboveDepth === null || run.kind === 'upper' || a.offset < run.offset || applianceEnd(a) > runEnd(run)) continue;
            add({ code: c.upper_over_fridge, appliance: null, layer: 'upper', offset: a.offset, width: a.width.value, depth: cl.fridgePanelDepth - cl.overFridgeCaseShort });
          }
          for (const p of up.pieces) {
            const fl = flankLow.get(p) ?? 0;
            const fh = flankHigh.get(p) ?? 0;
            const ok = fl + fh <= p.end - p.start;
            if (ok && fl) add({ code: c.upper, appliance: null, layer: 'upper', offset: p.start, width: fl, depth: null });
            if (ok && fh) add({ code: c.upper, appliance: null, layer: 'upper', offset: p.end - fh, width: fh, depth: null });
            fillGap({ start: p.start + (ok ? fl : 0), end: p.end - (ok ? fh : 0) }, c.upper, c.upper_filler, 'upper', add, s, rules, leftOver);
          }
        }
        for (const it of items) out.push({ ...it, wallId: w.wall_id, runId: run.run_id });
      }
    }
    if (leftOver.total > 0) notes.push(`${formatInches(leftOver.total)} in all is left open where a stretch doesn't land on the ${formatInches(s.widthStep)} cabinet step.`);

    const wallIndex = (id: string) => room.walls.findIndex((w) => w.wall_id === id);
    // The top line: the client's cabinet height, never above the ceiling.
    const ceiling = room.ceiling_height.value;
    const asked = prefs.cabinetTop === 'ceiling' ? ceiling : prefs.cabinetTop;
    const standardTop = s.visual.upperBottom + size(c.upper, 'height');
    let upperTop = asked ?? standardTop;
    if (asked === null) notes.push(`No cabinet height was chosen for this room, so the uppers are the catalog's standard ${formatInches(size(c.upper, 'height'))} high.`);
    if (upperTop > ceiling) {
      notes.push(`The cabinet height chosen is above the ${formatInches(ceiling)} ceiling, so the cabinets stop at the ceiling.`);
      upperTop = ceiling;
    }
    const overFridgeBottom = s.visual.fridgeHeight + cl.overFridge;
    if (out.some((x) => x.code === c.upper_over_fridge && x.depth !== null) && upperTop <= overFridgeBottom) {
      notes.push(`The cabinets end at ${formatInches(upperTop)}, which leaves no room for a cabinet over the fridge (it starts ${formatInches(cl.overFridge)} above the fridge's ${formatInches(s.visual.fridgeHeight)}).`);
      for (let k = out.length - 1; k >= 0; k--) if (out[k]!.code === c.upper_over_fridge && out[k]!.depth !== null) out.splice(k, 1);
    }
    if (upperTop <= s.visual.upperBottom) return { ok: false, reason: `The cabinets would end at ${formatInches(upperTop)}, below where uppers start (${formatInches(s.visual.upperBottom)}).` };
    const vertical = (x: Draft): { elevation: Length; height: Length } => {
      if (isHood(x.appliance)) return { elevation: s.visual.upperBottom, height: upperTop - s.visual.upperBottom };
      if (x.code === null) return { elevation: 0, height: 0 };
      if (itemByCode(x.code)?.type === 'tall' || x.full) return { elevation: 0, height: upperTop };
      if (x.layer === 'base') return { elevation: 0, height: size(x.code, 'height') };
      if (x.hung) return { elevation: Math.max(s.visual.upperBottom, upperTop - size(x.code, 'height')), height: Math.min(upperTop - s.visual.upperBottom, size(x.code, 'height')) };
      // The cabinet over a fridge comes down to the clearance above it (owner, 2026-11-10).
      const bottom = x.code === c.upper_over_fridge && x.depth !== null ? overFridgeBottom : s.visual.upperBottom;
      return { elevation: bottom, height: upperTop - bottom };
    };
    if (prefs.garbage === 'dedicated_cabinet') {
      const sink = out.find((x) => x.code === codes.sink);
      // The nearest base cabinet beside the sink, with nothing but fillers between them.
      const between = (lo: Length, hi: Length) => out.filter((x) => sink && x.wallId === sink.wallId && x.layer === 'base' && x.offset < hi && x.offset + x.width > lo);
      const gapTo = (x: Draft): Length => (sink ? (x.offset >= sink.offset + sink.width ? x.offset - (sink.offset + sink.width) : sink.offset - (x.offset + x.width)) : 0);
      const beside =
        sink &&
        out
          .filter((x) => x.code === codes.base && x.wallId === sink.wallId && gapTo(x) >= 0)
          .filter((x) => {
            const [lo, hi] = x.offset >= sink.offset ? [sink.offset + sink.width, x.offset] : [x.offset + x.width, sink.offset];
            return between(lo, hi).every((y) => y.code === codes.base_filler);
          })
          .sort((x, y) => gapTo(x) - gapTo(y) || x.offset - y.offset)[0];
      if (beside) {
        beside.code = c.garbage;
        notes.push('A garbage pull-out in its own cabinet beside the sink, as asked.');
      }
    }
    if (prefs.roomSet === 'bath') {
      // A vanity's drawers (PROPOSED reading of the drawer level for vanities, placeholder-draft.json "bath").
      if (prefs.drawers === 'maximum') for (const b of out) if (b.code === codes.base && fits(c.bath.maximum, b.width)) b.code = c.bath.maximum;
    } else if (prefs.drawers) applyDrawerLevel(out, prefs.drawers, s, [codes.sink, c.dishwasher]);
    if (prefs.roomSet === 'bath') notes.push('Vanity cabinets, as this is a bathroom.');
    if (out.some((x) => x.code === codes.sink)) notes.push('Sink base under the sink, with the dishwasher beside it where one was placed.');
    notes.push(
      prefs.drawers === null
        ? 'No drawer level was chosen for this room, so its base cabinets are plain door cabinets.'
        : {
            minimum: 'Minimum drawers: a drawer over doors in most base cabinets, one bank of 4 and one bank of 3.',
            moderate: 'Moderate drawers: about two thirds of the base cabinets are drawer banks.',
            maximum: 'Maximum drawers: every base cabinet is a drawer bank.',
          }[prefs.drawers],
    );
    const fourCount = prefs.roomSet === 'bath' ? 0 : out.filter((x) => x.code === c.base_by_drawer_level.four_banks.code).length;
    if (fourCount) notes.push(`${fourCount} four-drawer bank${fourCount === 1 ? '' : 's'} beside the cooking and near the sink, as the shop's rules ask (PREF-006, PREF-007).`);
    if (out.some((x) => x.code === cornerCode))
      notes.push(
        prefs.cornerInsert === 'lazy_susan'
          ? 'L-shaped corner cabinets with a Lazy Susan, as picked.'
          : prefs.cornerInsert === 'double_shelf'
            ? 'L-shaped corner cabinets with adjustable shelves, as picked.'
            : 'L-shaped corner cabinets: no corner insert was chosen for this room.',
      );
    if (out.some((x) => x.full)) notes.push(`A full-height panel ${formatInches(cl.fridgePanelDepth)} deep on each side of the fridge, and the cabinet over it ${formatInches(cl.overFridge)} above the fridge.`);
    if (out.some((x) => x.back)) notes.push('A finished back panel on the island.');
    if (out.some((x) => isHood(x.appliance))) notes.push(`A hood over the range or cooktop, with ${formatInches(cl.hoodSide)} clear each side and the same width of upper either side; uppers stop at windows and over the fridge.`);
    if (out.some((x) => x.appliance === 'millwork_hood')) notes.push('A millwork hood is drawn as a box: the catalog has no millwork hood yet.');
    if (out.some((x) => x.hung)) notes.push('A short cabinet over the range or cooktop, hung from the top line. The 30" clear above the cooking surface is not checked yet: there is no counter height in the data.');
    const fillers = out.filter((x) => (x.code === codes.base_filler || x.code === c.upper_filler) && !x.full).length;
    notes.push(`Cabinets made to fit each space, in equal widths${fillers ? `, with ${fillers} filler${fillers === 1 ? '' : 's'} where a space is too narrow for a cabinet` : ''}.`);

    return {
      ok: true,
      value: {
        version: 2,
        roomId: room.room_id,
        upperTop,
        moves,
        cabinets: out
          .sort((a, b) => wallIndex(a.wallId) - wallIndex(b.wallId) || (a.layer === b.layer ? 0 : a.layer === 'base' ? -1 : 1) || a.offset - b.offset)
          .map((x) => ({ ...x, ...vertical(x), reviewed: false })),
        notes,
      },
    };
  } catch (error) {
    if (error instanceof MissingSize) return { ok: false, reason: error.message };
    throw error;
  }
}

class MissingSize extends Error {}

/**
 * A wall with each fridge moved along it, when a panel beside it would stand outside `usable`
 * (against the wall or a corner cabinet), by just the shortfall, if the other side then still has
 * room. `moved` is told each move. A fridge with no room either way stays, and the notes say so.
 */
function shiftFridges(w: Wall, usable: Span, panelW: Length, moved: (placementId: string, offset: Length, by: Length) => void): Wall {
  const appliances = w.appliances.map((a) => {
    if (a.kind !== 'fridge') return a;
    const short = usable.start - (a.offset - panelW);
    const over = applianceEnd(a) + panelW - usable.end;
    const by = short > 0 && over + short <= 0 ? short : over > 0 && short + over <= 0 ? -over : 0;
    if (by === 0) return a;
    moved(a.placement_id, a.offset + by, by);
    return { ...a, offset: a.offset + by };
  });
  return { ...w, appliances };
}

function fillGap(gap: Span, code: string, fillerCode: string, layer: 'base' | 'upper', add: (d: Omit<Draft, 'id'>) => void, s: DraftSettings, rules: LayoutRules, leftOver: { total: Length }): void {
  const { widths, filler } = fillWidths(gap.end - gap.start, s, rules.minRunLength);
  let at = gap.start;
  for (const w of widths) {
    add({ code, appliance: null, layer, offset: at, width: w, depth: null });
    at += w;
  }
  // A space too narrow for a cabinet is a filler; a sliver under one step beside cabinets is left open and said.
  if (filler > 0 && widths.length === 0) add({ code: fillerCode, appliance: null, layer, offset: at, width: filler, depth: null });
  else if (filler > 0) leftOver.total += filler;
}

const isBase = (code: string, s: DraftSettings): boolean => code === s.codes.base;
const fits = (code: string, width: Length): boolean => {
  const min = itemByCode(code)?.size.width.min.value ?? null;
  return min === null || width >= min;
};

/** The gap between two stretches along a wall (0 when they touch or overlap). */
const gapBetween = (a: { offset: Length; width: Length }, b: { offset: Length; width: Length }): Length => Math.max(0, a.offset - (b.offset + b.width), b.offset - (a.offset + a.width));

/**
 * The plain base cabinets that become four-drawer banks (PREF-006, PREF-007; placeholder-draft.json
 * "four_banks"): right beside a range or cooktop, up to `beside_cooking`, touching it or the next one
 * along from a bank that does; then the nearest to the sink base or dishwasher, up to `near_sink`.
 * Minimum drawers makes only one. Each must be wide enough for the four-drawer bank.
 */
function fourBanks(cabs: readonly (Draft & { wallId: string })[], bases: readonly (Draft & { wallId: string })[], level: DrawerLevel, s: DraftSettings, sinkCodes: readonly string[]): Set<string> {
  const rule = s.codes.base_by_drawer_level.four_banks;
  const max = level === 'minimum' ? 1 : rule.beside_cooking + rule.near_sink;
  const chosen: (Draft & { wallId: string })[] = [];
  const ok = (b: Draft & { wallId: string }) => !chosen.includes(b) && fits(rule.code, b.width) && b.width >= s.narrowBelow;
  const touching = (a: { offset: Length; width: Length }, b: { offset: Length; width: Length }) => a.offset === b.offset + b.width || a.offset + a.width === b.offset;
  for (const cook of cabs.filter((a) => a.appliance === 'range' || a.appliance === 'cooktop')) {
    const beside: (Draft & { wallId: string })[] = [];
    for (const b of bases) if (b.wallId === cook.wallId && touching(b, cook) && ok(b)) beside.push(b);
    // Only one touching (a corner or the run's end on the other side): the next one along from it.
    if (beside.length === 1) {
      const next = bases.find((b) => b.wallId === cook.wallId && b !== beside[0] && touching(b, beside[0]!) && gapBetween(b, cook) > 0 && ok(b));
      if (next) beside.push(next);
    }
    for (const b of beside.slice(0, rule.beside_cooking)) if (chosen.length < Math.min(max, rule.beside_cooking)) chosen.push(b);
  }
  // Near the sink: within the first `near_sink_within` cabinets from the sink base or the dishwasher,
  // counted along the wall, the nearer the better (owner, 2026-11-12).
  const sinks = cabs.filter((x) => x.code !== null && sinkCodes.includes(x.code));
  const placesAway = (b: Draft & { wallId: string }): number =>
    Math.min(
      ...sinks
        .filter((x) => x.wallId === b.wallId)
        .map((x) => {
          const [lo, hi] = b.offset >= x.offset + x.width ? [x.offset + x.width, b.offset] : [b.offset + b.width, x.offset];
          // The cabinets between them, plus this one.
          return 1 + cabs.filter((y) => y !== b && y !== x && y.wallId === b.wallId && y.layer === 'base' && y.code !== null && !sinkCodes.includes(y.code) && !['filler', 'panel'].includes(itemByCode(y.code)?.type ?? '') && y.offset >= lo && y.offset + y.width <= hi).length;
        }),
    );
  for (let k = 0; k < rule.near_sink && chosen.length < max; k++) {
    const near = bases
      .filter((b) => ok(b) && sinks.some((x) => x.wallId === b.wallId))
      .map((b) => ({ b, places: placesAway(b), d: Math.min(...sinks.filter((x) => x.wallId === b.wallId).map((x) => gapBetween(b, x))) }))
      .filter((x) => x.places <= rule.near_sink_within)
      .sort((p, q) => p.places - q.places || p.d - q.d || p.b.offset - q.b.offset)[0];
    if (near) chosen.push(near.b);
  }
  return new Set(chosen.map((b) => b.id));
}

/** Turns plain base cabinets into drawer banks by the client's drawer level (intake), with the four-drawer banks the shop's rules ask for. */
function applyDrawerLevel(cabs: (Draft & { wallId: string })[], level: DrawerLevel, s: DraftSettings, sinkCodes: readonly string[]): void {
  const levels = s.codes.base_by_drawer_level;
  const bases = cabs.filter((x) => x.code !== null && isBase(x.code, s));
  const fours = fourBanks(cabs, bases, level, s, sinkCodes);
  for (const b of bases) if (fours.has(b.id)) b.code = levels.four_banks.code;
  const rest = bases.filter((b) => !fours.has(b.id));
  // Base cabinets right beside a range or cooktop get the pots-and-pans drawers first.
  const byCooking = new Set(
    rest
      .filter((b) => cabs.some((a) => (a.appliance === 'range' || a.appliance === 'cooktop') && a.wallId === b.wallId && (a.offset === b.offset + b.width || a.offset + a.width === b.offset)))
      .map((b) => b.id),
  );
  if (level === 'maximum') {
    for (const b of rest) if (fits(levels.maximum.all, b.width)) b.code = levels.maximum.all;
    return;
  }
  if (level === 'moderate') {
    let fourCount = fours.size;
    rest.forEach((b, k) => {
      if (byCooking.has(b.id) || k % 3 !== 2) {
        const [four, three] = levels.moderate.banks as [string, string];
        const code = fourCount < 2 && fits(four, b.width) ? four : three;
        if (fits(code, b.width)) {
          b.code = code;
          if (code === four) fourCount++;
        }
      } else if (fits(levels.moderate.every_third, b.width)) b.code = levels.moderate.every_third;
    });
    return;
  }
  const m = levels.minimum;
  for (const b of rest) b.code = b.width < s.narrowBelow ? m.narrow : m.most;
  const three = rest.find((b) => byCooking.has(b.id) && fits(m.one_bank_of_3, b.width)) ?? rest.find((b) => fits(m.one_bank_of_3, b.width));
  if (three) three.code = m.one_bank_of_3;
  if (fours.size === 0) {
    const four = rest.find((b) => b !== three && fits(m.one_bank_of_4, b.width) && b.width >= s.narrowBelow);
    if (four) four.code = m.one_bank_of_4;
  }
}

/** The run a cabinet stands on, for the screens. */
export function runOf(room: Room, runId: string): { wall: Wall; run: Run } | null {
  for (const wall of room.walls) {
    const run = wall.runs.find((r) => r.run_id === runId);
    if (run) return { wall, run };
  }
  return null;
}
