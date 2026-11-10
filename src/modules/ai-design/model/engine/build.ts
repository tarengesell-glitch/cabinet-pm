/**
 * Builds one layout option for a room: real catalog cabinets at exact wall-referenced positions
 * (BUILD_PLAN 6, step 3; the owner's "fast fill for the whole project", 2026-11-09).
 *
 * The canvas is locked: walls, openings, runs and the client's design choices never change. Only
 * appliances may move, at most the data's limit along their own wall, and only for a rule
 * (PREF-023 today), each move recorded with its reason.
 *
 * Fixed things first (PREF-015): corners, then the sink base with the dishwasher touching it
 * (HARD-005) and the garbage pull-out, appliance spaces and ends (a filler at a wall, an applied
 * finished end at an open end, CB-FACT-10). The rest of each run is divided into cabinets with
 * widths the catalog accepts (split.ts). Uppers skip windows, leave the hood space centred on the
 * cooktop (HARD-007) and put a cabinet centred over the fridge (HARD-006).
 *
 * The owner's fixes after trying a real job (2026-11-10, DECISIONS "Fixes after trying a real
 * job"), with their numbers in data/draft-rules.json "clearances": a corner is the L-shaped corner
 * cabinet even when no corner insert is chosen; an appliance or millwork hood has clear space each
 * side, with uppers of the same width either side of it, or of a cabinet over the cooking
 * (PREF-019); the cabinet over a fridge comes down to just above the fridge; every fridge has a
 * full-height panel each side (part still open, AD-6); every island's back has a back panel.
 *
 * Pure and repeatable (P5): no clock, no randomness, no AI. Anything it can't do is an issue with
 * a plain reason, and the option is still returned with it (BUILD_SPEC 5.7: never hidden).
 */
import {
  applianceEnd,
  cornerCabinets,
  hasBase,
  hasUpper,
  insideSpan,
  neighbours,
  roomInsideSide,
  runAtEnd,
  runAtStart,
  runEnd,
  subtract,
  upperPieces,
  windowSpans,
  formatInches,
  type AppliancePlacement,
  type Issue,
  type Length,
  type PlacedItem,
  type Room,
  type Run,
  type Selections,
  type Span,
  type Wall,
} from '@/core/index';
import type { CatalogItem } from '@/modules/catalog/contract';
import { standard, widthAllowed, widthRange, type DraftConfig, type DrawerLevelId } from './config';
import { stableId } from './ids';
import { splitGap, SPLIT_STRATEGIES, type SplitStrategy, type WidthLimits } from './split';
import type { ApplianceMove, LayoutNumbers, OptionChoices } from './types';

export const BUILDER_CHECK_ID = 'ai_design.builder';

export type Layer = 'base' | 'upper' | 'tall';
export type SlotRole =
  | 'divided'
  | 'sink_base'
  | 'dishwasher'
  | 'garbage'
  | 'under_cooktop'
  | 'filler'
  | 'corner'
  | 'wall_oven'
  | 'pantry'
  | 'fridge_upper'
  | 'cooking_upper'
  | 'upper_corner'
  | 'fridge_panel'
  | 'island_back';

/** One cabinet along a wall, before it becomes a placed item. */
export interface Slot {
  readonly wallId: string;
  readonly runId: string;
  readonly layer: Layer;
  readonly role: SlotRole;
  readonly start: Length;
  readonly width: Length;
  item: CatalogItem;
  readonly depth: Length;
  readonly elevation: Length;
  readonly height: Length;
  /** Ends with nothing beside them (no wall, no cabinet): they get an applied finished end. */
  openLow: boolean;
  openHigh: boolean;
  /** On the far side of an island's line: its back panel. */
  readonly back?: true;
}

/** What the scorecard needs to know about where things are. */
export interface BuiltRoom {
  readonly room: Room;
  readonly slots: readonly Slot[];
  readonly moves: readonly ApplianceMove[];
  readonly issues: readonly Issue[];
  /** Where the cooking appliances and sinks are, by wall. */
  readonly cooking: readonly { readonly wallId: string; readonly span: Span }[];
  /** What the uppers flank over each range or cooktop: a hood with its clear space each side, or the cabinet over it (PREF-019). */
  readonly upperFocal: readonly { readonly wallId: string; readonly span: Span }[];
  readonly upperTop: Length | null;
  readonly level: DrawerLevelId | null;
}

export interface BuildInput {
  readonly room: Room;
  readonly config: DraftConfig;
  readonly layout: LayoutNumbers;
  /** The client's answers, by intake question key: the picked option's ID. */
  readonly answers: ReadonlyMap<string, string>;
  /** How tall the cabinets go (the client's cabinet height), or null when not chosen. */
  readonly cabinetTop: Length | 'ceiling' | null;
  readonly seed: string;
}

const COOKING = new Set(['range', 'cooktop']);
const SINKS = new Set(['sink', 'bar_sink']);
const end = (s: Span): Length => s.end;
const len = (s: Span): Length => s.end - s.start;
const overlap = (a: Span, b: Span): boolean => Math.min(a.end, b.end) > Math.max(a.start, b.start);

/** Builds one option. Returns the room with its cabinets, and every issue met on the way. */
export function buildOption(input: BuildInput, choices: OptionChoices): BuiltRoom {
  const { config, layout } = input;
  const issues: Issue[] = [];
  const problem = (severity: 'block' | 'warn', ref: Issue['ref'], message: string) => issues.push({ check_id: BUILDER_CHECK_ID, severity, message, ref });
  const kindInfo = (kind: string) => layout.appliances.find((a) => a.kind === kind) ?? null;

  // 1. Appliance moves (only for a rule, within the limit, never onto another wall). The sink may
  // be centred under its window first (the option's choice); later an appliance may be moved the
  // least needed to clear something fixed. Every move is kept with its reasons.
  const shifts = moveAppliances(input, choices, problem);
  const room = input.room;
  const cur = (a: AppliancePlacement): AppliancePlacement => ({ ...a, offset: shifts.get(a.placement_id)?.to ?? a.offset });
  const shift = (ids: readonly string[], delta: Length, ruleId: string, why: string): boolean => {
    if (delta === 0) return true;
    for (const id of ids) {
      const a = room.walls.flatMap((w) => w.appliances).find((x) => x.placement_id === id)!;
      const now = shifts.get(id)?.to ?? a.offset;
      if (Math.abs(now + delta - a.offset) > config.maxMove) return false;
    }
    for (const id of ids) {
      const wallId = room.walls.find((w) => w.appliances.some((x) => x.placement_id === id))!.wall_id;
      const a = room.walls.flatMap((w) => w.appliances).find((x) => x.placement_id === id)!;
      const prev = shifts.get(id);
      shifts.set(id, { wallId, kind: a.kind, from: a.offset, to: (prev?.to ?? a.offset) + delta, reasons: [...(prev?.reasons ?? []), { ruleId, why }] });
    }
    return true;
  };

  // 2. The heights everything hangs from.
  const ceiling = room.ceiling_height.value;
  const upperTop = input.cabinetTop === null ? null : input.cabinetTop === 'ceiling' ? ceiling : Math.min(input.cabinetTop, ceiling);
  if (upperTop === null) problem('block', { kind: 'room', id: room.room_id }, 'No cabinet height is chosen in the design choices, so the uppers and their top line can\'t be placed.');
  const upperItem = config.items.uppers.find((u) => u.code === choices.upper) ?? config.items.uppers[0]!;
  const levelAnswer = input.answers.get('drawer_level');
  const level: DrawerLevelId | null = levelAnswer === 'minimum' || levelAnswer === 'moderate' || levelAnswer === 'maximum' ? levelAnswer : null;
  if (level === null) problem('block', { kind: 'room', id: room.room_id }, 'The design choices have no drawer level, so which base cabinets get drawers can\'t be decided.');
  // Corners where runs overlap are L-shaped corner cabinets, even with no corner insert chosen (owner, 2026-11-10).
  const cornerAnswer = input.answers.get('corner_insert');
  const cornerItem = cornerAnswer === undefined ? config.cornerDefault : (config.cornerInserts[cornerAnswer] ?? null);
  const cl = config.clearances;
  const garbageCabinet = input.answers.get('garbage_recycling') === 'yes' && input.answers.get('garbage_location') === 'dedicated_cabinet';

  const corners = cornerCabinets(room, layout.upperBand);
  const ownUpperKinds = new Set(layout.appliances.filter((a) => a.ownUpper).map((a) => a.kind));
  const slots: Slot[] = [];
  const cooking: { wallId: string; span: Span }[] = [];
  const upperFocal: { wallId: string; span: Span }[] = [];
  let garbagePlaced = false;
  let defaultCornerUsed = false;

  const add = (s: Omit<Slot, 'openLow' | 'openHigh'>): Slot => {
    const slot: Slot = { ...s, openLow: false, openHigh: false };
    slots.push(slot);
    return slot;
  };

  for (const wall of room.walls) {
    const inside = insideSpan(room, wall);
    const { before, after } = neighbours(room, wall);

    for (const run of [...wall.runs].sort((x, y) => x.offset - y.offset)) {
      const seg: Span = { start: Math.max(run.offset, inside.start), end: Math.min(runEnd(run), inside.end) };
      if (len(seg) <= 0) continue;
      const runRef = { kind: 'run' as const, id: run.run_id };
      const touching = (at: Length, upper: boolean) =>
        wall.runs.some((o) => o !== run && (o.offset === at || runEnd(o) === at) && (upper ? hasUpper(o.kind) || o.kind === 'pantry' : hasBase(o.kind)));
      const atWall = (at: Length, low: boolean) => wall.kind === 'room' && (low ? at <= inside.start && before !== null : at >= inside.end && after !== null);

      // ---- The base layer (or the talls of an all-pantry run) ----------------------------------
      if (hasBase(run.kind)) {
        const pantryRun = run.kind === 'pantry';
        if (run.kind === 'base_upper_pantry') problem('warn', runRef, 'Where the pantry goes in a "base, upper + pantry" run isn\'t decided yet, so it is drafted as base + upper.');
        let lo = seg.start;
        let hi = seg.end;
        const fixed: Slot[] = [];
        const openEdges: Length[] = [];

        // Corners (base): the corner cabinet stands on the wall whose run ends there.
        const endCorner = corners.find((c) => c.base && c.endingWallId === wall.wall_id && runAtEnd(room, wall) === run);
        const startCorner = corners.find((c) => c.base && c.startingWallId === wall.wall_id && runAtStart(room, wall) === run);
        if (!pantryRun && endCorner) {
          if (!cornerItem) problem('block', runRef, `The design choices' corner answer "${cornerAnswer}" has no corner cabinet in the builder's data, so the corner is left empty.`);
          else {
            if (cornerAnswer === undefined) defaultCornerUsed = true;
            const w = standard(cornerItem, 'width');
            fixed.push(add({ wallId: wall.wall_id, runId: run.run_id, layer: 'base', role: 'corner', start: hi - w, width: w, item: cornerItem, depth: standard(cornerItem, 'depth'), elevation: 0, height: standard(cornerItem, 'height') }));
            hi -= w;
          }
        }
        if (!pantryRun && startCorner && cornerItem) lo += standard(cornerItem, 'depth');

        // Ends: a filler at a wall; the end allowance left for an applied finished end at an open end.
        const filler = pantryRun ? config.items.tallFiller : config.items.baseFiller;
        const fillerW = standard(filler, 'width');
        if (!(startCorner && cornerItem)) {
          if (atWall(lo, true)) {
            fixed.push(add({ wallId: wall.wall_id, runId: run.run_id, layer: pantryRun ? 'tall' : 'base', role: 'filler', start: lo, width: fillerW, item: filler, depth: standard(filler, 'depth'), elevation: 0, height: standard(filler, 'height') }));
            lo += fillerW;
          } else if (!touching(seg.start, false)) {
            lo += config.numbers.endAllowance;
            openEdges.push(lo);
          }
        }
        if (!(endCorner && cornerItem) || pantryRun) {
          if (atWall(hi, false)) {
            hi -= fillerW;
            fixed.push(add({ wallId: wall.wall_id, runId: run.run_id, layer: pantryRun ? 'tall' : 'base', role: 'filler', start: hi, width: fillerW, item: filler, depth: standard(filler, 'depth'), elevation: 0, height: standard(filler, 'height') }));
          } else if (!touching(seg.end, false)) {
            hi -= config.numbers.endAllowance;
            openEdges.push(hi);
          }
        }

        // Appliances standing in this run.
        const here = wall.appliances.map(cur).filter((a) => overlap({ start: a.offset, end: applianceEnd(a) }, seg)).sort((a, b) => a.offset - b.offset);
        const gaps: Span[] = [];
        /** Where a group of fixed things can go: the least move (within the limit) that clears everything placed. */
        const fit = (group: Span, ignore: ReadonlySet<string>): Length | null => {
          const obstacles = [
            ...fixed.filter((f) => f.layer !== 'upper').map((f) => ({ start: f.start, end: f.start + f.width })),
            ...gaps,
            ...here.filter((o) => !ignore.has(o.placement_id) && !done.has(o.placement_id)).map((o) => ({ start: o.offset, end: applianceEnd(o) })),
          ];
          const clear = (d: Length) => group.start + d >= lo && group.end + d <= hi && !obstacles.some((o) => overlap(o, { start: group.start + d, end: group.end + d }));
          const candidates = [0, lo - group.start, hi - group.end, ...obstacles.flatMap((o) => [o.end - group.start, o.start - group.end])];
          const ok = candidates.filter((d) => Math.abs(d) <= config.maxMove && clear(d)).sort((x, y) => Math.abs(x) - Math.abs(y) || x - y);
          return ok.length ? ok[0]! : null;
        };
        const done = new Set<string>();
        const why = (what: string, d: Length) => `${formatInches(Math.abs(d))} so the ${what} clears the cabinets and appliances already placed (function first, PRIN-011).`;
        const placeFixed = (role: SlotRole, item: CatalogItem, start: Length, width: Length, layer: Layer = 'base') => {
          const span = { start, end: start + width };
          if (span.start < lo || span.end > hi) {
            problem('block', runRef, `The ${describeRole(role)} (${formatInches(width)}) doesn't fit in the run at ${formatInches(start)} from the wall's start.`);
            return null;
          }
          const clash = [...fixed.filter((f) => f.layer !== 'upper').map((f) => ({ start: f.start, end: f.start + f.width })), ...gaps].find((s) => overlap(s, span));
          if (clash) {
            problem('block', runRef, `The ${describeRole(role)} would overlap something already placed at ${formatInches(clash.start)}–${formatInches(clash.end)}.`);
            return null;
          }
          const slot = add({ wallId: wall.wall_id, runId: run.run_id, layer, role, start, width, item, depth: standard(item, 'depth'), elevation: 0, height: standard(item, 'height') });
          fixed.push(slot);
          return slot;
        };

        for (const a of here) {
          const span = { start: a.offset, end: applianceEnd(a) };
          if (SINKS.has(a.kind)) {
            if (pantryRun) {
              problem('block', { kind: 'appliance', id: a.placement_id }, 'A sink stands in an all-pantry run.');
              continue;
            }
            const sink = config.items.sinkBase;
            const step = widthRange(sink)?.step ?? 1;
            const w = Math.max(standard(sink, 'width'), Math.ceil(a.width.value / step) * step);
            if (!widthAllowed(sink, w)) {
              problem('block', { kind: 'appliance', id: a.placement_id }, `No sink base the catalog allows is wide enough for this ${formatInches(a.width.value)} sink.`);
              continue;
            }
            let centre = a.offset + Math.floor(a.width.value / 2);
            // The dishwasher paired with this sink touches the sink base (HARD-005), on its side.
            const dw = here.find((d) => d.kind === 'dishwasher' && d.paired_with === a.placement_id);
            const dwW = standard(config.items.dishwasher, 'width');
            const dwSide: 'low' | 'high' | null = dw ? (dw.offset + dw.width.value / 2 < centre ? 'low' : 'high') : null;
            const sbStart = centre - Math.floor(w / 2);
            const group = { start: dwSide === 'low' ? sbStart - dwW : sbStart, end: sbStart + w + (dwSide === 'high' ? dwW : 0) };
            const ids = [a.placement_id, ...(dw ? [dw.placement_id] : [])];
            const d = fit(group, new Set(ids));
            if (d === null || !shift(ids, d, 'HARD-005', why(dw ? 'sink base and the dishwasher beside it' : 'sink base', d ?? 0))) {
              problem('block', { kind: 'appliance', id: a.placement_id }, `The sink base${dw ? ' with the dishwasher touching it' : ''} doesn't fit here, even moving it up to ${formatInches(config.maxMove)}.`);
              continue;
            }
            centre += d;
            ids.forEach((id) => done.add(id));
            const sb = placeFixed('sink_base', sink, sbStart + d, w);
            if (!sb) continue;
            if (dw) placeFixed('dishwasher', config.items.dishwasher, dwSide === 'low' ? sb.start - dwW : sb.start + sb.width, dwW);
            // A dedicated garbage cabinet goes beside the sink, on the side away from the dishwasher (PREF-030).
            if (garbageCabinet && !garbagePlaced && a.kind === 'sink') {
              const g = config.items.garbage;
              const gw = standard(g, 'width');
              const placed = dwSide === 'high' ? placeFixed('garbage', g, sb.start - gw, gw) : placeFixed('garbage', g, sb.start + sb.width, gw);
              if (placed) garbagePlaced = true;
            }
          } else if (a.kind === 'dishwasher') {
            if (a.paired_with !== null && wall.appliances.some((x) => x.placement_id === a.paired_with)) continue; // placed with its sink
            const dwW = standard(config.items.dishwasher, 'width');
            const d = fit({ start: a.offset, end: a.offset + dwW }, new Set([a.placement_id]));
            if (d === null || !shift([a.placement_id], d, 'PRIN-011', why('dishwasher', d ?? 0))) problem('block', { kind: 'appliance', id: a.placement_id }, 'The dishwasher opening doesn\'t fit here.');
            else {
              done.add(a.placement_id);
              placeFixed('dishwasher', config.items.dishwasher, a.offset + d, dwW);
            }
          } else if (a.kind === 'cooktop') {
            // A cooktop sits on a base cabinet of its own width.
            const w = a.width.value;
            const item = w === standard(config.items.bank4, 'width') ? config.items.bank4 : config.items.drawerOverDoors;
            const d = fit(span, new Set([a.placement_id]));
            if (!widthAllowed(item, w)) problem('block', { kind: 'appliance', id: a.placement_id }, `No base cabinet the catalog allows is ${formatInches(w)} wide for under the cooktop.`);
            else if (d === null || !shift([a.placement_id], d, 'PRIN-011', why('cooktop', d ?? 0))) problem('block', { kind: 'appliance', id: a.placement_id }, 'The cooktop doesn\'t fit here.');
            else {
              done.add(a.placement_id);
              placeFixed('under_cooktop', item, a.offset + d, w);
              cooking.push({ wallId: wall.wall_id, span: { start: a.offset + d, end: a.offset + d + w } });
            }
          } else if (a.kind === 'wall_oven') {
            const o = config.items.wallOven;
            const w = standard(o, 'width');
            const start = a.offset + Math.floor((a.width.value - w) / 2);
            const d = fit({ start, end: start + w }, new Set([a.placement_id]));
            if (d === null || !shift([a.placement_id], d, 'PRIN-011', why('wall oven cabinet', d ?? 0))) problem('block', { kind: 'appliance', id: a.placement_id }, 'The wall oven cabinet doesn\'t fit here.');
            else {
              done.add(a.placement_id);
              placeFixed('wall_oven', o, start + d, w, 'tall');
            }
          } else {
            // Freestanding appliances (range, fridge, wine fridge…) take their own space; nothing is built there.
            const name = a.kind.replace(/_/g, ' ');
            if (!kindInfo(a.kind)) problem('warn', { kind: 'appliance', id: a.placement_id }, `The builder has no rule for a "${a.kind}", so its space is left open.`);
            // A fridge has a full-height panel on each side (owner, 2026-11-10): room for both is looked for first.
            const panelled = cl.fridgePanelKinds.includes(a.kind);
            const pw = standard(config.items.fridgePanel, 'width');
            const ignore = new Set([a.placement_id]);
            const withPanels = panelled ? fit({ start: span.start - pw, end: span.end + pw }, ignore) : null;
            const d = withPanels ?? fit(span, ignore);
            if (d === null || !shift([a.placement_id], d, 'PRIN-011', why(withPanels !== null && d !== 0 ? `${name} with a panel each side` : name, d ?? 0))) {
              problem('block', { kind: 'appliance', id: a.placement_id }, `The ${name} overlaps cabinets or the end of the run, and moving it up to ${formatInches(config.maxMove)} doesn't clear them.`);
              gaps.push({ start: Math.max(span.start, lo), end: Math.min(span.end, hi) });
            } else {
              done.add(a.placement_id);
              gaps.push({ start: span.start + d, end: span.end + d });
              if (COOKING.has(a.kind)) cooking.push({ wallId: wall.wall_id, span: { start: span.start + d, end: span.end + d } });
              if (panelled) {
                for (const side of ['low', 'high'] as const) {
                  const p = side === 'low' ? { start: span.start + d - pw, end: span.start + d } : { start: span.end + d, end: span.end + d + pw };
                  const where = side === 'low' ? 'toward the wall\'s start' : 'toward the wall\'s end';
                  const clash = [...fixed.filter((f) => f.layer !== 'upper').map((f) => ({ start: f.start, end: f.start + f.width })), ...gaps].some((o) => overlap(o, p));
                  if (p.start < lo || p.end > hi || clash) {
                    problem('block', { kind: 'appliance', id: a.placement_id }, `There is no room for the ${name}'s panel on its side ${where}: move the ${name} ${formatInches(pw)} away from the corner, the wall or the end of the run.`);
                    continue;
                  }
                  if (upperTop === null) {
                    problem('block', { kind: 'appliance', id: a.placement_id }, `The ${name}'s panel ${where} goes up to the cabinets' top line, and no cabinet height is chosen, so it can't be sized.`);
                    continue;
                  }
                  fixed.push(add({ wallId: wall.wall_id, runId: run.run_id, layer: 'tall', role: 'fridge_panel', start: p.start, width: pw, item: config.items.fridgePanel, depth: cl.fridgePanelDepth, elevation: 0, height: upperTop }));
                }
              }
            }
          }
        }

        // The rest of the run is divided into cabinets.
        const taken = [...fixed.filter((f) => f.layer !== 'upper').map((f) => ({ start: f.start, end: f.start + f.width })), ...gaps].sort((x, y) => x.start - y.start);
        for (const free of subtract({ start: lo, end: hi }, taken)) {
          fillBase(free, pantryRun, wall, run, choices.split, input, add, problem);
        }
        // An island's back is covered by a finished back panel, as long as the run (owner, 2026-11-10).
        if (wall.kind === 'floating' && !pantryRun) {
          const bp = config.items.islandBackPanel;
          add({ wallId: wall.wall_id, runId: run.run_id, layer: 'base', role: 'island_back', start: seg.start, width: len(seg), item: bp, depth: standard(bp, 'depth'), elevation: 0, height: standard(bp, 'height'), back: true });
        }
        markOpenEnds(slots, wall.wall_id, run.run_id, ['base', 'tall'], openEdges, gaps);
      }

      // ---- The upper layer ---------------------------------------------------------------------
      if (hasUpper(run.kind) && upperTop !== null) {
        const top = upperTop;
        const uh = standard(upperItem, 'height');
        const pieceBase =
          run.kind === 'upper'
            ? subtract(seg, windowSpans(wall))
            : upperPieces({ ...wall, appliances: wall.appliances.map(cur) }, run, { minRun: layout.minRunLength, ownUpperKinds }).map((p) => ({ start: Math.max(p.start, seg.start), end: Math.min(p.end, seg.end) }));
        // Over a range or cooktop goes what the designer chose (owner, 2026-11-09): an appliance or
        // millwork hood, whose space is left open exactly the appliance's width so it is centred
        // (HARD-007), or a cabinet centred on it. A placement from before the choice has a hood.
        const cookers = wall.appliances.map(cur).filter((a) => kindInfo(a.kind)?.comesWithHood);
        const overOf = (a: (typeof cookers)[number]) => a.above ?? 'appliance_hood';
        // An appliance or millwork hood has clear space each side; a cabinet over the cooking has none (owner, 2026-11-10).
        const focalOf = (a: (typeof cookers)[number]): Span => (overOf(a) === 'cabinet' ? { start: a.offset, end: applianceEnd(a) } : { start: a.offset - cl.hoodSide, end: applianceEnd(a) + cl.hoodSide });
        const hoods = cookers.filter((a) => overOf(a) !== 'cabinet').map(focalOf);
        const endCorner = corners.find((c) => c.upper && c.endingWallId === wall.wall_id && runAtEnd(room, wall) === run);
        const startCorner = corners.find((c) => c.upper && c.startingWallId === wall.wall_id && runAtStart(room, wall) === run);
        const uc = config.items.upperCorner;
        const cuts: Span[] = cookers.map(focalOf);
        const focals = cookers.filter((a) => overlap({ start: a.offset, end: applianceEnd(a) }, seg)).map(focalOf);
        upperFocal.push(...focals.map((span) => ({ wallId: wall.wall_id, span })));
        const openEdges: Length[] = [];
        /** Edges where an upper meets another cabinet (the upper corner, the cabinet over the fridge, a fridge panel): no end allowance. */
        const closedEdges = new Set<Length>();
        // The fridge panels stand to the top line, so the uppers stop at them.
        for (const p of slots.filter((s) => s.wallId === wall.wall_id && s.role === 'fridge_panel')) {
          cuts.push({ start: p.start, end: p.start + p.width });
          closedEdges.add(p.start);
          closedEdges.add(p.start + p.width);
        }
        if (endCorner) {
          const w = standard(uc, 'width');
          add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'upper_corner', start: seg.end - w, width: w, item: uc, depth: standard(uc, 'depth'), elevation: top - standard(uc, 'height'), height: standard(uc, 'height') });
          cuts.push({ start: seg.end - w, end: seg.end });
          closedEdges.add(seg.end - w);
        }
        if (startCorner) {
          cuts.push({ start: seg.start, end: seg.start + standard(uc, 'depth') });
          closedEdges.add(seg.start + standard(uc, 'depth'));
        }

        // The cabinet over the fridge, centred on it (HARD-006), down to just above the fridge (owner, 2026-11-10).
        for (const f of wall.appliances.map(cur).filter((a) => ownUpperKinds.has(a.kind) && overlap({ start: a.offset, end: applianceEnd(a) }, seg))) {
          const fu = config.items.fridgeUpper;
          if (!widthAllowed(fu, f.width.value)) {
            problem('block', { kind: 'appliance', id: f.placement_id }, `The catalog has no ${fu.name} ${formatInches(f.width.value)} wide for over the fridge.`);
            continue;
          }
          const bottom = cl.fridgeHeight + cl.overFridge;
          if (top <= bottom) {
            problem('block', { kind: 'appliance', id: f.placement_id }, `The cabinets end at ${formatInches(top)}, which leaves no room for a cabinet over the fridge (it starts ${formatInches(cl.overFridge)} above the fridge's rough ${formatInches(cl.fridgeHeight)}).`);
            continue;
          }
          add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'fridge_upper', start: f.offset, width: f.width.value, item: fu, depth: standard(fu, 'depth'), elevation: bottom, height: top - bottom });
          closedEdges.add(f.offset);
          closedEdges.add(applianceEnd(f));
          problem(
            'warn',
            { kind: 'appliance', id: f.placement_id },
            `The cabinet over the fridge is drafted ${formatInches(standard(fu, 'depth'))} deep: the catalog has no deeper one yet (DECISIONS AD-1). It starts ${formatInches(cl.overFridge)} above the fridge's rough ${formatInches(cl.fridgeHeight)} height until the fridge's spec is confirmed (OA-4).`,
          );
        }

        for (const a of cookers.filter((x) => overlap({ start: x.offset, end: applianceEnd(x) }, seg))) {
          const name = a.kind.replace(/_/g, ' ');
          if (overOf(a) === 'millwork_hood') problem('warn', { kind: 'appliance', id: a.placement_id }, `A millwork hood goes over the ${name}: its space is left open, because the catalog has no millwork hood yet.`);
          if (overOf(a) !== 'cabinet') continue;
          const cu = config.items.cookingUpper;
          if (!widthAllowed(cu, a.width.value)) {
            problem('block', { kind: 'appliance', id: a.placement_id }, `The catalog has no ${cu.name} ${formatInches(a.width.value)} wide for over the ${name}.`);
            continue;
          }
          add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'cooking_upper', start: a.offset, width: a.width.value, item: cu, depth: standard(cu, 'depth'), elevation: top - standard(cu, 'height'), height: standard(cu, 'height') });
          closedEdges.add(a.offset);
          closedEdges.add(applianceEnd(a));
          problem('warn', { kind: 'appliance', id: a.placement_id }, `The cabinet over the ${name} is hung from the top line; the 30" clear above the cooking surface (HARD-008) can't be checked yet, because there is no counter height in the data.`);
        }

        const wf = config.items.wallFiller;
        const wfW = standard(wf, 'width');
        const trimmed: { raw: Span; free: Span }[] = [];
        for (const piece of pieceBase.flatMap((p) => subtract(p, cuts))) {
          let lo = piece.start;
          let hi = piece.end;
          if (atWall(lo, true) && !startCorner) {
            add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'filler', start: lo, width: wfW, item: wf, depth: standard(wf, 'depth'), elevation: top - standard(wf, 'height'), height: standard(wf, 'height') });
            lo += wfW;
          } else if (!touching(lo, true) && !closedEdges.has(lo)) {
            lo += config.numbers.endAllowance;
            openEdges.push(lo);
          }
          if (atWall(hi, false) && !endCorner) {
            hi -= wfW;
            add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'filler', start: hi, width: wfW, item: wf, depth: standard(wf, 'depth'), elevation: top - standard(wf, 'height'), height: standard(wf, 'height') });
          } else if (!touching(hi, true) && !closedEdges.has(hi)) {
            hi -= config.numbers.endAllowance;
            openEdges.push(hi);
          }
          trimmed.push({ raw: piece, free: { start: lo, end: hi } });
        }
        // The uppers either side of a hood, or of the cabinet over the cooking, are the same width (PREF-019, HARD-007).
        const flankLow = new Map<number, Length>();
        const flankHigh = new Map<number, Length>();
        const limits = upperLimits(upperItem, input);
        for (const f of focals) {
          const i = trimmed.findIndex((t) => t.raw.end === f.start);
          const j = trimmed.findIndex((t) => t.raw.start === f.end);
          if (i < 0 || j < 0 || limits === null) continue;
          const w = equalFlank(len(trimmed[i]!.free), len(trimmed[j]!.free), limits, choices.split, input);
          if (w === null) {
            problem('warn', runRef, `The uppers either side of the space over the cooking at ${formatInches(f.start)}–${formatInches(f.end)} can't be made the same width (PREF-019).`);
            continue;
          }
          flankHigh.set(i, w);
          flankLow.set(j, w);
        }
        trimmed.forEach((t, k) => fillUpper(t.free, wall, run, upperItem, top - uh, uh, choices, input, slots, add, problem, { low: flankLow.get(k) ?? 0, high: flankHigh.get(k) ?? 0 }));
        markOpenEnds(slots, wall.wall_id, run.run_id, ['upper'], openEdges, hoods);
      }
    }
  }

  if (defaultCornerUsed) problem('warn', { kind: 'room', id: room.room_id }, `No corner insert is chosen, so each corner is the L-shaped ${cornerItem!.name} (owner, 2026-11-10).`);
  if (garbageCabinet && !garbagePlaced) problem('warn', { kind: 'room', id: room.room_id }, 'The client asked for a garbage cabinet, but there was no room beside the sink for it.');
  assignBaseTypes(slots, cooking, room, config, level, problem);
  const moved: Room = { ...room, walls: room.walls.map((w) => ({ ...w, appliances: w.appliances.map(cur) })) };
  const moves: ApplianceMove[] = [...shifts.entries()]
    .filter(([, m]) => m.to !== m.from)
    .map(([placementId, m]) => ({
      placementId,
      kind: m.kind,
      wallId: m.wallId,
      from: m.from,
      to: m.to,
      ruleId: m.reasons[0]!.ruleId,
      why: `${m.kind.replace(/_/g, ' ')}: moved ${formatInches(Math.abs(m.to - m.from))} ${m.to > m.from ? 'toward the wall\'s end' : 'toward the wall\'s start'}. ${m.reasons.map((r) => r.why).join(' ')}`,
    }));
  return { room: moved, slots, moves, issues, cooking, upperFocal, upperTop, level };
}

function describeRole(role: SlotRole): string {
  return { divided: 'cabinet', sink_base: 'sink base', dishwasher: 'dishwasher opening', garbage: 'garbage pull-out', under_cooktop: 'cabinet under the cooktop', filler: 'filler', corner: 'corner cabinet', wall_oven: 'wall oven cabinet', pantry: 'pantry', fridge_upper: 'cabinet over the fridge', cooking_upper: 'cabinet over the range or cooktop', upper_corner: 'upper corner cabinet', fridge_panel: 'fridge panel', island_back: 'island back panel' }[role];
}

/** Moves a sink to centre under its window when the option asks for it and the rules allow (PREF-023). */
/** Where each moved appliance started, where it is now, and every reason it moved. */
type Shifts = Map<string, { wallId: string; kind: string; from: Length; to: Length; reasons: { ruleId: string; why: string }[] }>;

/** Centres a sink under its window when the option asks for it and the limit allows (PREF-023). */
function moveAppliances(input: BuildInput, choices: OptionChoices, problem: (s: 'block' | 'warn', ref: Issue['ref'], m: string) => void): Shifts {
  const shifts: Shifts = new Map();
  if (choices.sink !== 'under_window') return shifts;
  for (const wall of input.room.walls) {
    for (const sink of wall.appliances.filter((a) => a.kind === 'sink')) {
      const window = windowSpans(wall).find((w) => overlap(w, { start: sink.offset, end: applianceEnd(sink) }));
      if (!window) continue;
      const delta = window.start + Math.floor((len(window) - sink.width.value) / 2) - sink.offset;
      if (delta === 0) continue;
      if (Math.abs(delta) > input.config.maxMove) {
        problem('warn', { kind: 'appliance', id: sink.placement_id }, `Centring the sink under the window would move it ${formatInches(Math.abs(delta))}, more than the ${formatInches(input.config.maxMove)} allowed, so it stays where it was drawn.`);
        continue;
      }
      // The dishwasher paired with it moves with it (DECISIONS 2026-11-06). Clashes are settled when the cabinets are placed.
      for (const a of wall.appliances.filter((x) => x.placement_id === sink.placement_id || x.paired_with === sink.placement_id)) {
        shifts.set(a.placement_id, {
          wallId: wall.wall_id,
          kind: a.kind,
          from: a.offset,
          to: a.offset + delta,
          reasons: [{ ruleId: 'PREF-023', why: a.kind === 'sink' ? 'To centre the sink under the window (PREF-023).' : 'With its sink, so they still touch (HARD-005).' }],
        });
      }
    }
  }
  return shifts;
}

/** The widths a base-layer stretch can be divided into. */
function baseLimits(input: BuildInput, total: Length): WidthLimits | null {
  const c = input.config;
  const range = widthRange(c.items.drawerOverDoors);
  if (!range) return null;
  // A cabinet with drawers is at least 12" (HARD-015); a short stretch can take a door-only base down to 8".
  const doors = widthRange(c.items.baseDoors);
  const min = total < c.numbers.minDrawerCabinet && doors ? Math.max(doors.min, c.numbers.minDoorBase) : Math.max(range.min, c.numbers.minDrawerCabinet);
  return { min, max: Math.min(range.max, c.numbers.maxCabinet), step: range.step };
}

function fillBase(
  free: Span,
  pantryRun: boolean,
  wall: Wall,
  run: Run,
  strategy: SplitStrategy,
  input: BuildInput,
  add: (s: Omit<Slot, 'openLow' | 'openHigh'>) => Slot,
  problem: (s: 'block' | 'warn', ref: Issue['ref'], m: string) => void,
): void {
  const c = input.config;
  const total = len(free);
  if (total <= 0) return;
  const ref = { kind: 'run' as const, id: run.run_id };
  const at = `${formatInches(free.start)}–${formatInches(end(free))} along the wall`;
  if (pantryRun) {
    const p = c.items.pantry;
    const range = widthRange(p);
    const widths = range ? firstSplit(total, strategy, range, input) : total % standard(p, 'width') === 0 ? Array.from({ length: total / standard(p, 'width') }, () => standard(p, 'width')) : null;
    if (!widths) {
      problem('block', ref, `The ${formatInches(total)} of pantry at ${at} can't be filled: ${p.name} is made ${formatInches(standard(p, 'width'))} wide only until the shop gives its limits (CAT-1).`);
      return;
    }
    let x = free.start;
    for (const w of widths) {
      add({ wallId: wall.wall_id, runId: run.run_id, layer: 'tall', role: 'pantry', start: x, width: w, item: p, depth: standard(p, 'depth'), elevation: 0, height: standard(p, 'height') });
      x += w;
    }
    return;
  }
  const filler = c.items.baseFiller;
  if (total === standard(filler, 'width')) {
    add({ wallId: wall.wall_id, runId: run.run_id, layer: 'base', role: 'filler', start: free.start, width: total, item: filler, depth: standard(filler, 'depth'), elevation: 0, height: standard(filler, 'height') });
    return;
  }
  const limits = baseLimits(input, total);
  if (!limits || total < limits.min) {
    problem('block', ref, `A ${formatInches(total)} space at ${at} is too narrow for a cabinet, and fillers are ${formatInches(standard(filler, 'width'))} only until the shop gives their sizes (CAT-1).`);
    return;
  }
  const usable = total - (total % limits.step);
  if (usable !== total) problem('block', ref, `The space at ${at} is ${formatInches(total)}, which isn't on the ${formatInches(limits.step)} cabinet step; ${formatInches(total - usable)} is left over.`);
  const widths = firstSplit(usable, strategy, limits, input);
  if (!widths) {
    problem('block', ref, `The ${formatInches(usable)} at ${at} can't be divided into cabinets the catalog allows.`);
    return;
  }
  let x = free.start;
  const doors = c.items.baseDoors;
  for (const w of widths) {
    // The type is settled once the whole room is laid out (drawer level, PREF-006, PREF-007).
    add({ wallId: wall.wall_id, runId: run.run_id, layer: 'base', role: 'divided', start: x, width: w, item: doors, depth: standard(doors, 'depth'), elevation: 0, height: standard(doors, 'height') });
    x += w;
  }
}

/** The option's own strategy first; if it can't divide this stretch, the others in a fixed order. */
function firstSplit(total: Length, strategy: SplitStrategy, limits: WidthLimits, input: BuildInput): Length[] | null {
  const c = input.config;
  const bank = standard(c.items.bank4, 'width') === standard(c.items.bank3, 'width') ? standard(c.items.bank4, 'width') : null;
  const aims = { idealMin: c.numbers.idealMin, idealMax: c.numbers.idealMax, oneCabinetUpTo: c.numbers.oneCabinetUpTo, bankWidth: bank };
  for (const s of [strategy, ...SPLIT_STRATEGIES.filter((x) => x !== strategy)]) {
    const r = splitGap(total, s, limits, aims);
    if (r) return r;
  }
  return null;
}

function fillUpper(
  free: Span,
  wall: Wall,
  run: Run,
  item: CatalogItem,
  elevation: Length,
  height: Length,
  choices: OptionChoices,
  input: BuildInput,
  slots: readonly Slot[],
  add: (s: Omit<Slot, 'openLow' | 'openHigh'>) => Slot,
  problem: (s: 'block' | 'warn', ref: Issue['ref'], m: string) => void,
  flank: { readonly low: Length; readonly high: Length } = { low: 0, high: 0 },
): void {
  const total = len(free);
  if (total <= 0) return;
  const ref = { kind: 'run' as const, id: run.run_id };
  const limits = upperLimits(item, input);
  if (!limits) {
    problem('block', ref, `${item.name} is made in one width only, so the uppers can't be fitted.`);
    return;
  }
  // The same-width uppers beside a hood (PREF-019) go first, at the ends; the rest is filled between them.
  if ((flank.low > 0 || flank.high > 0) && flank.low + flank.high <= total) {
    if (flank.low > 0) add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'divided', start: free.start, width: flank.low, item, depth: standard(item, 'depth'), elevation, height });
    if (flank.high > 0) add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'divided', start: free.end - flank.high, width: flank.high, item, depth: standard(item, 'depth'), elevation, height });
    fillUpper({ start: free.start + flank.low, end: free.end - flank.high }, wall, run, item, elevation, height, choices, input, slots, add, problem);
    return;
  }
  if (total < limits.min) {
    problem('warn', ref, `${formatInches(total)} between ${formatInches(free.start)} and ${formatInches(free.end)} is too narrow for an upper, so it is left open.`);
    return;
  }
  let widths: Length[] | null = null;
  if (choices.upperSplit === 'match_bases') {
    // Line the uppers up with the cabinets below (PREF-018, PREF-020): cut where the bases meet.
    const cuts = slots
      .filter((s) => s.wallId === wall.wall_id && s.layer !== 'upper' && !s.back)
      .flatMap((s) => [s.start, s.start + s.width])
      .filter((x) => x > free.start && x < free.end);
    const points = [free.start, ...[...new Set(cuts)].sort((a, b) => a - b), free.end];
    const ws = points.slice(1).map((p, i) => p - points[i]!);
    if (ws.every((w) => w >= limits.min && w <= limits.max && w % limits.step === 0)) widths = ws;
  }
  if (!widths) {
    const usable = total - (total % limits.step);
    if (usable !== total) problem('block', ref, `The upper space at ${formatInches(free.start)} is ${formatInches(total)}, which isn't on the ${formatInches(limits.step)} step; ${formatInches(total - usable)} is left over.`);
    widths = firstSplit(usable, choices.split, limits, input);
  }
  if (!widths) {
    problem('block', ref, `The ${formatInches(total)} upper space at ${formatInches(free.start)} can't be divided into uppers the catalog allows.`);
    return;
  }
  let x = free.start;
  for (const w of widths) {
    add({ wallId: wall.wall_id, runId: run.run_id, layer: 'upper', role: 'divided', start: x, width: w, item, depth: standard(item, 'depth'), elevation, height });
    x += w;
  }
}

/** The widths an upper can be, or null when the catalog makes it in one width only. */
function upperLimits(item: CatalogItem, input: BuildInput): WidthLimits | null {
  const range = widthRange(item);
  if (!range) return null;
  return { min: Math.max(range.min, input.config.numbers.minUpper), max: Math.min(range.max, input.config.numbers.maxCabinet), step: range.step };
}

/**
 * One width for the uppers either side of a hood (PREF-019): the narrower of the two the option's
 * own split would put there, or else the widest that leaves both sides fillable. Null when none does.
 */
function equalFlank(a: Length, b: Length, limits: WidthLimits, strategy: SplitStrategy, input: BuildInput): Length | null {
  const onStep = (t: Length) => t - (t % limits.step);
  const fillable = (t: Length) => onStep(t) === 0 || (onStep(t) >= limits.min && firstSplit(onStep(t), strategy, limits, input) !== null);
  const natA = firstSplit(onStep(a), strategy, limits, input)?.at(-1);
  const natB = firstSplit(onStep(b), strategy, limits, input)?.[0];
  const candidates: Length[] = natA !== undefined && natB !== undefined ? [Math.min(natA, natB)] : [];
  for (let w = onStep(Math.min(a, b, limits.max)); w >= limits.min; w -= limits.step) candidates.push(w);
  return candidates.find((w) => w >= limits.min && w <= limits.max && w % limits.step === 0 && w <= a && w <= b && fillable(a - w) && fillable(b - w)) ?? null;
}

/** Ends at an open run end, or beside an appliance space, have nothing beside them (CB-FACT-10). */
function markOpenEnds(slots: Slot[], wallId: string, runId: string, layers: readonly Layer[], openEdges: readonly Length[], spaces: readonly Span[]): void {
  for (const s of slots) {
    if (s.wallId !== wallId || s.runId !== runId || !layers.includes(s.layer) || s.role === 'filler' || s.role === 'fridge_panel' || s.back) continue;
    const lo = s.start;
    const hi = s.start + s.width;
    if (openEdges.includes(lo) || spaces.some((g) => g.end === lo)) s.openLow = true;
    if (openEdges.includes(hi) || spaces.some((g) => g.start === hi)) s.openHigh = true;
  }
}

/**
 * Which base cabinets get drawers (the client's drawer level, in the intake's own words) and
 * where the four-drawer banks go: beside the cooktop first (PREF-007), then by the sink (PREF-006).
 * Drawer banks are made 30" only until the shop gives their limits (CAT-1), so only cabinets of
 * that width can be banks.
 */
function assignBaseTypes(
  slots: Slot[],
  cooking: readonly { wallId: string; span: Span }[],
  room: Room,
  config: DraftConfig,
  level: DrawerLevelId | null,
  problem: (s: 'block' | 'warn', ref: Issue['ref'], m: string) => void,
): void {
  const divided = slots.filter((s) => s.layer === 'base' && s.role === 'divided');
  const bankW = standard(config.items.bank4, 'width');
  const sinks = slots.filter((s) => s.role === 'sink_base' || s.role === 'dishwasher');
  const distance = (s: Slot, targets: readonly { wallId: string; span: Span }[]): number => {
    const ds = targets.filter((t) => t.wallId === s.wallId).map((t) => Math.max(0, t.span.start - (s.start + s.width), s.start - t.span.end));
    return ds.length ? Math.min(...ds) : Number.POSITIVE_INFINITY;
  };
  const sinkSpans = sinks.map((s) => ({ wallId: s.wallId, span: { start: s.start, end: s.start + s.width } }));
  const order = (targets: readonly { wallId: string; span: Span }[]) => (a: Slot, b: Slot) => distance(a, targets) - distance(b, targets) || a.wallId.localeCompare(b.wallId) || a.start - b.start;

  for (const s of divided) s.item = s.width < config.numbers.minDrawerCabinet ? config.items.baseDoors : config.items.drawerOverDoors;
  if (level === null) return;
  const rule = config.drawerLevels[level];
  const candidates = divided.filter((s) => s.width === bankW);
  const take = (n: number, sortBy: (a: Slot, b: Slot) => number, item: CatalogItem) => {
    const picked = candidates.filter((s) => s.item !== config.items.bank4 && s.item !== config.items.bank3).sort(sortBy).slice(0, n);
    for (const s of picked) s.item = item;
    return picked.length;
  };
  // Four-drawer banks: beside the cooktop first, then by the sink.
  let fours = 0;
  if (rule.banksOf4 > 0) fours += take(1, order(cooking), config.items.bank4);
  if (rule.banksOf4 > 1) fours += take(rule.banksOf4 - fours, order(sinkSpans), config.items.bank4);
  let threes = 0;
  if (rule.banksOf3 !== null) threes = take(rule.banksOf3, order(cooking), config.items.bank3);
  if (rule.moreBanks) threes += take(candidates.length, order(cooking), config.items.bank3);
  const wanted = rule.banksOf4 + (rule.banksOf3 ?? 0);
  if (fours + threes < wanted)
    problem('warn', { kind: 'room', id: room.room_id }, `The "${level}" drawer level asks for ${wanted} drawer banks, but only ${fours + threes} cabinets are the ${formatInches(bankW)} drawer banks are made in (CAT-1).`);
}

/** Turns the slots into placed items (origin ai, not approved), with the ends and defaults set. */
export function toPlacedItems(built: BuiltRoom, config: DraftConfig, seed: string): PlacedItem[] {
  const side = roomInsideSide(built.room.walls);
  return [...built.slots]
    .sort((a, b) => a.wallId.localeCompare(b.wallId) || a.layer.localeCompare(b.layer) || a.start - b.start)
    .map((s, i) => {
      const wall = built.room.walls.find((w) => w.wall_id === s.wallId)!;
      const itemSide = wall.kind === 'room' ? side : 'left';
      // Facing the cabinet, its left end is toward the wall's end when it stands on the left side.
      const leftOpen = itemSide === 'left' ? s.openHigh : s.openLow;
      const rightOpen = itemSide === 'left' ? s.openLow : s.openHigh;
      const selections: Record<string, string> = {};
      if (s.item.options.includes('end_left')) selections['end_left'] = leftOpen ? config.ends.open : config.ends.closed;
      if (s.item.options.includes('end_right')) selections['end_right'] = rightOpen ? config.ends.open : config.ends.closed;
      for (const [code, d] of Object.entries(s.item.defaults)) if (s.item.options.includes(code)) selections[code] = d.value;
      return {
        item_instance_id: stableId(`${seed}|${s.wallId}|${s.layer}|${s.start}|${s.width}|${i}`),
        catalog_item_id: s.item.id,
        width: s.width,
        height: s.height,
        depth: s.depth,
        // An island's back panel stands on the far side of its line (owner, 2026-11-10).
        position: { wall_id: s.wallId, side: s.back ? 'right' : itemSide, offset: s.start, elevation: s.elevation, setback: 0 },
        item_selections: selections as Selections,
        modifications: [],
        origin: { placed_by: 'ai', last_edited_by: 'ai', approved: false },
        notes: '',
      };
    });
}
