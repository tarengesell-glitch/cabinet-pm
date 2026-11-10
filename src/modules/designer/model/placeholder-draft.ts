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
  /** Why it looks the way it does, in plain words. */
  readonly notes: readonly string[];
}

export interface DraftSettings {
  readonly largestWidth: Length;
  readonly widthStep: Length;
  readonly codes: typeof data.cabinets;
  readonly narrowBelow: Length;
  /** Owner, 2026-11-10: the clear space beside a hood, over a fridge, and the fridge panels' depth. */
  readonly clearances: {
    readonly hoodSide: Length;
    readonly overFridge: Length;
    readonly fridgePanelDepth: Length;
  };
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
    hood_side: data.clearances.hood_side,
    over_fridge: data.clearances.over_fridge,
    fridge_panel_depth: data.clearances.fridge_panel_depth,
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
      clearances: { hoodSide: out['hood_side']!, overFridge: out['over_fridge']!, fridgePanelDepth: out['fridge_panel_depth']! },
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
    const panelW = size(c.fridge_panel, 'width');

    for (const w of room.walls) {
      const span = insideSpan(room, w);
      const startCorner = corners.find((k) => k.startingWallId === w.wall_id) ?? null;
      const endCorner = corners.find((k) => k.endingWallId === w.wall_id) ?? null;
      // A fridge always has a full-height, full-depth panel on each side (owner, 2026-11-10), in
      // the stretch the cabinets can use (not behind a corner cabinet).
      const usable: Span = {
        start: span.start + (startCorner?.base ? size(cornerCode, 'width') : 0),
        end: span.end - (endCorner?.base ? size(cornerCode, 'depth') : 0),
      };
      const fridgePanels: Span[] = [];
      for (const a of w.appliances.filter((x) => x.kind === 'fridge')) {
        for (const [side, p] of [
          ['start', { start: a.offset - panelW, end: a.offset }],
          ['end', { start: applianceEnd(a), end: applianceEnd(a) + panelW }],
        ] as const) {
          if (p.start >= usable.start && p.end <= usable.end) fridgePanels.push(p);
          else notes.push(`There is no room for the fridge panel on the fridge's ${side === 'start' ? 'left' : 'right'} side of wall ${room.walls.indexOf(w) + 1}: move the fridge ${formatInches(panelW)} away from the corner or wall.`);
        }
      }
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
          // The corner square at the end belongs to the next wall's corner cabinet: its L's other
          // leg runs this far along this wall.
          if (atEnd && endCorner?.base) to -= size(cornerCode, 'depth');
          const taken: Span[] = [];
          // Every appliance standing in this stretch, even one that pokes past its end (never skipped:
          // the layout checks then show the clash). Sinks first, so the dishwasher can touch the sink base.
          const isSink = (k: string) => k === 'sink' || k === 'bar_sink';
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
              notes.push(`The ${a.kind.replace(/_/g, ' ')} on wall ${room.walls.indexOf(w) + 1} runs ${formatInches(Math.max(from - a.offset, applianceEnd(a) - to))} into the corner cabinet or past the end of its run: move it on the room drawing.`);
            if (isSink(a.kind)) {
              const sw = Math.max(aw, size(c.sink, 'width'));
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
                notes.push(`The sink base${dw ? ' and dishwasher' : ''} on wall ${room.walls.indexOf(w) + 1} ${dw ? 'are' : 'is'} drawn ${formatInches(Math.abs(move))} ${move < 0 ? 'toward the wall’s start' : 'toward the wall’s end'} to clear the corner or the end of the run: move the sink on the room drawing to match.`);
              }
              add({ code: c.sink, appliance: null, layer: 'base', offset: o, width: sw, depth: null });
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
          // A hood has clear space each side (owner, 2026-11-10); the fridge panels stand to the top line.
          const cuts: Span[] = [...fridgePanels];
          const focal: Span[] = [];
          for (const a of w.appliances) {
            const t = applianceType(rules, a.kind);
            if (!t || a.offset < run.offset || applianceEnd(a) > runEnd(run)) continue;
            // What goes over a range or cooktop is the designer's choice (owner, 2026-11-09).
            const over = overOf(a, rules);
            if (over === 'appliance_hood' || over === 'millwork_hood') add({ code: null, appliance: over === 'appliance_hood' ? 'hood' : 'millwork_hood', layer: 'upper', offset: a.offset, width: a.width.value, depth: null });
            if (over === 'cabinet') add({ code: c.upper_over_cooking, appliance: null, layer: 'upper', offset: a.offset, width: a.width.value, depth: null, hung: true });
            if (over) {
              const g = over === 'cabinet' ? 0 : cl.hoodSide;
              cuts.push({ start: a.offset - g, end: applianceEnd(a) + g });
              focal.push({ start: a.offset - g, end: applianceEnd(a) + g });
            }
            if (t.upperAboveDepth !== null && run.kind !== 'upper') add({ code: c.upper_over_fridge, appliance: null, layer: 'upper', offset: a.offset, width: a.width.value, depth: t.upperAboveDepth });
          }
          const left = pieces.flatMap((p) => subtract(p, cuts)).filter((p) => p.end - p.start >= rules.minRunLength);
          // The uppers either side of a hood or the cabinet over the cooking are the same width (PREF-019, HARD-007).
          const natural = (p: Span) => fillWidths(p.end - p.start, s, rules.minRunLength).widths;
          const flankLow = new Map<Span, Length>();
          const flankHigh = new Map<Span, Length>();
          for (const f of focal) {
            const lo = left.find((p) => p.end === f.start);
            const hi = left.find((p) => p.start === f.end);
            if (!lo || !hi) continue;
            const a = natural(lo).slice(-1)[0];
            const b = natural(hi)[0];
            if (a === undefined || b === undefined) continue;
            const flank = Math.min(a, b);
            flankHigh.set(lo, flank);
            flankLow.set(hi, flank);
          }
          for (const p of left) {
            const fl = flankLow.get(p) ?? 0;
            const fh = flankHigh.get(p) ?? 0;
            if (fl && fl + fh <= p.end - p.start) add({ code: c.upper, appliance: null, layer: 'upper', offset: p.start, width: fl, depth: null });
            if (fh && fl + fh <= p.end - p.start) add({ code: c.upper, appliance: null, layer: 'upper', offset: p.end - fh, width: fh, depth: null });
            const ok = fl + fh <= p.end - p.start;
            fillGap({ start: p.start + (ok ? fl : 0), end: p.end - (ok ? fh : 0) }, c.upper, c.upper_filler, 'upper', add, s, rules);
          }
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
      const sink = out.find((x) => x.code === c.sink);
      // The nearest base cabinet beside the sink, with nothing but fillers between them.
      const between = (lo: Length, hi: Length) => out.filter((x) => sink && x.wallId === sink.wallId && x.layer === 'base' && x.offset < hi && x.offset + x.width > lo);
      const gapTo = (x: Draft): Length => (sink ? (x.offset >= sink.offset + sink.width ? x.offset - (sink.offset + sink.width) : sink.offset - (x.offset + x.width)) : 0);
      const beside =
        sink &&
        out
          .filter((x) => x.code !== null && isBase(x.code, s) && x.wallId === sink.wallId && gapTo(x) >= 0)
          .filter((x) => {
            const [lo, hi] = x.offset >= sink.offset ? [sink.offset + sink.width, x.offset] : [x.offset + x.width, sink.offset];
            return between(lo, hi).every((y) => y.code === c.base_filler);
          })
          .sort((x, y) => gapTo(x) - gapTo(y) || x.offset - y.offset)[0];
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
    const fillers = out.filter((x) => (x.code === c.base_filler || x.code === c.upper_filler) && !x.full).length;
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
