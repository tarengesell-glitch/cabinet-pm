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
import data from '../data/placeholder-draft.json';
import { applianceType, LAYOUT_RULES, type LayoutRules } from './layout-rules';
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
}

export interface PlaceholderDesign {
  readonly version: 2;
  /** The room it was drafted for. */
  readonly roomId: string;
  /** The top line every upper and tall cabinet reaches. */
  readonly upperTop: Length;
  readonly cabinets: readonly PlaceholderCabinet[];
  /** Why it looks the way it does, in plain words. */
  readonly notes: readonly string[];
}

export interface DraftSettings {
  readonly largestWidth: Length;
  readonly widthStep: Length;
  readonly codes: typeof data.cabinets;
  readonly narrowBelow: Length;
  readonly visual: {
    readonly toeKick: Length;
    readonly counter: Length;
    readonly counterOverhang: Length;
    readonly upperBottom: Length;
    readonly fridgeHeight: Length;
    readonly fridgeDepth: Length;
    readonly rangeDepth: Length;
  };
}

function readSettings(): Result<DraftSettings> {
  const lengths: Record<string, string> = {
    largest_width: data.fill.largest_width,
    width_step: data.fill.width_step,
    narrow_below: data.cabinets.base_by_drawer_level.minimum.narrow_below,
    toe_kick_height: data.visual.toe_kick_height,
    counter_thickness: data.visual.counter_thickness,
    counter_overhang: data.visual.counter_overhang,
    upper_bottom: data.visual.upper_bottom,
    fridge_height: data.visual.appliances.fridge_height,
    fridge_depth: data.visual.appliances.fridge_depth,
    range_depth: data.visual.appliances.range_depth,
  };
  const out: Record<string, Length> = {};
  for (const [k, text] of Object.entries(lengths)) {
    const r = parseImperial(text);
    if (!r.ok) return { ok: false, reason: `placeholder-draft.json: ${k}: ${r.reason}` };
    out[k] = r.value;
  }
  const codes = data.cabinets;
  const all = [
    codes.base,
    codes.base_filler,
    codes.pantry,
    codes.sink,
    codes.dishwasher,
    codes.wall_oven,
    codes.corner_lazy_susan,
    codes.corner_other,
    codes.garbage,
    codes.upper,
    codes.upper_over_fridge,
    codes.upper_corner,
    codes.upper_filler,
    codes.base_by_drawer_level.minimum.most,
    codes.base_by_drawer_level.minimum.narrow,
    codes.base_by_drawer_level.minimum.one_bank_of_3,
    codes.base_by_drawer_level.minimum.one_bank_of_4,
    ...codes.base_by_drawer_level.moderate.banks,
    codes.base_by_drawer_level.moderate.every_third,
    codes.base_by_drawer_level.maximum.all,
  ];
  const missing = all.filter((c) => !CURRENT_CATALOG.items.some((i) => i.code === c));
  if (missing.length) return { ok: false, reason: `placeholder-draft.json names cabinet types the catalog doesn't have: ${missing.join(', ')}` };
  return {
    ok: true,
    value: {
      largestWidth: out['largest_width']!,
      widthStep: out['width_step']!,
      narrowBelow: out['narrow_below']!,
      codes,
      visual: {
        toeKick: out['toe_kick_height']!,
        counter: out['counter_thickness']!,
        counterOverhang: out['counter_overhang']!,
        upperBottom: out['upper_bottom']!,
        fridgeHeight: out['fridge_height']!,
        fridgeDepth: out['fridge_depth']!,
        rangeDepth: out['range_depth']!,
      },
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
 * The prototype's fill: equal cabinets no wider than the largest width, in whole steps, the
 * extra spread one step at a time from the left, and what is left over as a filler.
 */
export function fillWidths(gap: Length, s: Pick<DraftSettings, 'largestWidth' | 'widthStep'>, minRun: Length): { widths: Length[]; filler: Length } {
  if (gap <= 0) return { widths: [], filler: 0 };
  if (gap < minRun) return { widths: [], filler: gap };
  const n = Math.ceil(gap / s.largestWidth);
  const base = Math.min(s.largestWidth, Math.floor(gap / n / s.widthStep) * s.widthStep);
  if (base <= 0) return { widths: [], filler: gap };
  const widths = Array.from({ length: n }, () => base);
  let rest = gap - base * n;
  for (let k = 0; k < n && rest >= s.widthStep; k++) {
    if (widths[k]! + s.widthStep <= s.largestWidth) {
      widths[k] = widths[k]! + s.widthStep;
      rest -= s.widthStep;
    }
  }
  return { widths, filler: rest };
}

type Draft = { id: string; code: string | null; appliance: string | null; layer: 'base' | 'upper'; offset: Length; width: Length; depth: Length | null };

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
    const lazy = prefs.cornerInsert === 'lazy_susan';
    const cornerCode = lazy ? c.corner_lazy_susan : c.corner_other;

    for (const w of room.walls) {
      const span = insideSpan(room, w);
      const startCorner = corners.find((k) => k.startingWallId === w.wall_id) ?? null;
      const endCorner = corners.find((k) => k.endingWallId === w.wall_id) ?? null;
      for (const run of sortedRuns(w)) {
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
          // The corner square at the end belongs to the next wall's corner cabinet.
          if (atEnd && endCorner?.base) to -= lazy ? size(c.corner_lazy_susan, 'width') : (endCorner.baseDepths?.starting ?? 0);
          const taken: Span[] = [];
          const aps = w.appliances.filter((a) => a.offset >= from - 1 && applianceEnd(a) <= to + 1).sort((a, b) => a.offset - b.offset);
          for (const a of aps) {
            const aw = a.width.value;
            if (a.kind === 'sink' || a.kind === 'bar_sink') {
              const sw = Math.max(aw, size(c.sink, 'width'));
              const o = Math.max(from, Math.min(to - sw, Math.round(a.offset + aw / 2 - sw / 2)));
              add({ code: c.sink, appliance: null, layer: 'base', offset: o, width: sw, depth: null });
              taken.push({ start: o, end: o + sw });
            } else if (a.kind === 'dishwasher') {
              add({ code: c.dishwasher, appliance: null, layer: 'base', offset: a.offset, width: aw, depth: null });
              taken.push({ start: a.offset, end: a.offset + aw });
            } else if (a.kind === 'wall_oven') {
              add({ code: c.wall_oven, appliance: null, layer: 'base', offset: a.offset, width: aw, depth: null });
              taken.push({ start: a.offset, end: a.offset + aw });
            } else {
              add({ code: null, appliance: a.kind, layer: 'base', offset: a.offset, width: aw, depth: null });
              taken.push({ start: a.offset, end: a.offset + aw });
            }
          }
          const fillCode = run.kind === 'pantry' ? c.pantry : c.base;
          for (const gap of subtract({ start: from, end: to }, taken)) fillGap(gap, fillCode, c.base_filler, 'base', add, s, rules);
        }

        if (hasUpper(run.kind)) {
          let pieces: Span[] =
            run.kind === 'upper'
              ? subtract({ start: Math.max(run.offset, span.start), end: Math.min(runEnd(run), span.end) }, w.kind === 'room' ? windowSpans(w) : [])
              : upperPieces(w, run, rules);
          if (atStart && startCorner?.upper && pieces[0] && pieces[0].start <= span.start) {
            const cw = size(c.upper_corner, 'width');
            add({ code: c.upper_corner, appliance: null, layer: 'upper', offset: pieces[0].start, width: cw, depth: null });
            pieces = subtract(pieces[0], [{ start: pieces[0].start, end: pieces[0].start + cw }]).concat(pieces.slice(1));
          }
          if (atEnd && endCorner?.upper) pieces = pieces.flatMap((p) => subtract(p, [{ start: span.end - size(c.upper_corner, 'depth'), end: span.end }]));
          // Hoods over ranges and cooktops; a deeper upper over a fridge (it is skipped by upperPieces).
          const cuts: Span[] = [];
          for (const a of w.appliances) {
            const t = applianceType(rules, a.kind);
            if (!t || a.offset < run.offset || applianceEnd(a) > runEnd(run)) continue;
            if (t.comesWithHood) {
              add({ code: null, appliance: 'hood', layer: 'upper', offset: a.offset, width: a.width.value, depth: null });
              cuts.push({ start: a.offset, end: applianceEnd(a) });
            }
            if (t.upperAboveDepth !== null && run.kind !== 'upper') add({ code: c.upper_over_fridge, appliance: null, layer: 'upper', offset: a.offset, width: a.width.value, depth: t.upperAboveDepth });
          }
          for (const p of pieces.flatMap((p) => subtract(p, cuts))) if (p.end - p.start >= rules.minRunLength) fillGap(p, c.upper, c.upper_filler, 'upper', add, s, rules);
        }
        for (const it of items) out.push({ ...it, wallId: w.wall_id, runId: run.run_id });
      }
    }

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
    if (upperTop <= s.visual.upperBottom) return { ok: false, reason: `The cabinets would end at ${formatInches(upperTop)}, below where uppers start (${formatInches(s.visual.upperBottom)}).` };
    const vertical = (x: Draft): { elevation: Length; height: Length } => {
      if (x.appliance === 'hood') return { elevation: s.visual.upperBottom, height: upperTop - s.visual.upperBottom };
      if (x.code === null) return { elevation: 0, height: 0 };
      if (itemByCode(x.code)?.type === 'tall') return { elevation: 0, height: upperTop };
      if (x.layer === 'base') return { elevation: 0, height: size(x.code, 'height') };
      const bottom = x.code === c.upper_over_fridge ? Math.max(upperTop - size(x.code, 'height'), s.visual.fridgeHeight) : s.visual.upperBottom;
      return { elevation: bottom, height: upperTop - bottom };
    };
    if (prefs.garbage === 'dedicated_cabinet') {
      const sink = out.find((x) => x.code === c.sink);
      const beside = sink && out.find((x) => x.code !== null && isBase(x.code, s) && x.wallId === sink.wallId && (x.offset === sink.offset + sink.width || x.offset + x.width === sink.offset));
      if (beside) {
        beside.code = c.garbage;
        notes.push('A garbage pull-out in its own cabinet beside the sink, as asked.');
      }
    }
    if (prefs.drawers) applyDrawerLevel(out, prefs.drawers, s);
    if (out.some((x) => x.code === c.sink)) notes.push('Sink base under the sink, with the dishwasher beside it where one was placed.');
    notes.push(
      prefs.drawers === null
        ? 'No drawer level was chosen for this room, so its base cabinets are plain door cabinets.'
        : {
            minimum: 'Minimum drawers: a drawer over doors in most base cabinets, one bank of 4 and one bank of 3.',
            moderate: 'Moderate drawers: about two thirds of the base cabinets are drawer banks.',
            maximum: 'Maximum drawers: every base cabinet is a drawer bank.',
          }[prefs.drawers],
    );
    if (out.some((x) => x.code === cornerCode))
      notes.push(lazy ? 'Lazy Susan corners, as picked.' : prefs.cornerInsert === null ? 'No corner insert was chosen for this room, so its corners are drawn as blind corners.' : 'Blind corners, as picked.');
    if (out.some((x) => x.appliance === 'hood')) notes.push('A hood over the range or cooktop; uppers stop at windows and over the fridge.');
    const fillers = out.filter((x) => x.code === c.base_filler || x.code === c.upper_filler).length;
    if (fillers) notes.push(`Equal cabinets in whole steps, with ${fillers} filler${fillers === 1 ? '' : 's'} to take up the rest.`);

    return {
      ok: true,
      value: {
        version: 2,
        roomId: room.room_id,
        upperTop,
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

function fillGap(gap: Span, code: string, fillerCode: string, layer: 'base' | 'upper', add: (d: Omit<Draft, 'id'>) => void, s: DraftSettings, rules: LayoutRules): void {
  const { widths, filler } = fillWidths(gap.end - gap.start, s, rules.minRunLength);
  let at = gap.start;
  for (const w of widths) {
    add({ code, appliance: null, layer, offset: at, width: w, depth: null });
    at += w;
  }
  if (filler > 0) add({ code: fillerCode, appliance: null, layer, offset: at, width: filler, depth: null });
}

const isBase = (code: string, s: DraftSettings): boolean => code === s.codes.base;
const fits = (code: string, width: Length): boolean => {
  const min = itemByCode(code)?.size.width.min.value ?? null;
  return min === null || width >= min;
};

/** Turns plain base cabinets into drawer banks by the client's drawer level (intake). */
function applyDrawerLevel(cabs: (Draft & { wallId: string })[], level: DrawerLevel, s: DraftSettings): void {
  const levels = s.codes.base_by_drawer_level;
  const bases = cabs.filter((x) => x.code !== null && isBase(x.code, s));
  // Base cabinets right beside a range or cooktop get the pots-and-pans drawers first.
  const byCooking = new Set(
    bases
      .filter((b) => cabs.some((a) => (a.appliance === 'range' || a.appliance === 'cooktop') && a.wallId === b.wallId && (a.offset === b.offset + b.width || a.offset + a.width === b.offset)))
      .map((b) => b.id),
  );
  if (level === 'maximum') {
    for (const b of bases) if (fits(levels.maximum.all, b.width)) b.code = levels.maximum.all;
    return;
  }
  if (level === 'moderate') {
    let fours = 0;
    bases.forEach((b, k) => {
      if (byCooking.has(b.id) || k % 3 !== 2) {
        const [four, three] = levels.moderate.banks as [string, string];
        const code = fours < 2 && fits(four, b.width) ? four : three;
        if (fits(code, b.width)) {
          b.code = code;
          if (code === four) fours++;
        }
      } else if (fits(levels.moderate.every_third, b.width)) b.code = levels.moderate.every_third;
    });
    return;
  }
  const m = levels.minimum;
  for (const b of bases) b.code = b.width < s.narrowBelow ? m.narrow : m.most;
  const three = bases.find((b) => byCooking.has(b.id) && fits(m.one_bank_of_3, b.width)) ?? bases.find((b) => fits(m.one_bank_of_3, b.width));
  if (three) three.code = m.one_bank_of_3;
  const four = bases.find((b) => b !== three && fits(m.one_bank_of_4, b.width) && b.width >= s.narrowBelow);
  if (four) four.code = m.one_bank_of_4;
}

/** The run a cabinet stands on, for the screens. */
export function runOf(room: Room, runId: string): { wall: Wall; run: Run } | null {
  for (const wall of room.walls) {
    const run = wall.runs.find((r) => r.run_id === runId);
    if (run) return { wall, run };
  }
  return null;
}
