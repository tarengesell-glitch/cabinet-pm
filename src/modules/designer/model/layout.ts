/**
 * The rough layout: where cabinetry goes (runs) and where appliances will likely sit
 * (owner, 2026-11-06). Pure functions on the master copy, in the same shape as editor.ts:
 * every action returns a Result, and a refused action leaves the room unchanged with a
 * plain-language reason (rule 7). Rules (clearances, gaps, standard widths) come from
 * data/layout-rules.json (rule 6).
 *
 * Positions along a wall are measured from its start corner (on the wall's centre line, like
 * doors and windows), in 1/64". A run on a room wall stands against the wall's inside face and
 * reaches no further than the inside corners; a run on a floating wall (an island or
 * peninsula) is centred on the line.
 */
import {
  applianceEnd,
  cornerCabinets as coreCornerCabinets,
  doorwayZones as coreDoorwayZones,
  formatInches,
  hasBase,
  insideSpan,
  meetSquare as square,
  neighbours,
  runAtEnd,
  runAtStart,
  runEnd,
  subtract,
  upperDepth as coreUpperDepth,
  upperPieces as coreUpperPieces,
  wallLength,
  windowSpans,
  windowZones as coreWindowZones,
  type AppliancePlacement,
  type CornerCabinet,
  type Span,
  type Length,
  type Point,
  type Result,
  type Room,
  type Run,
  type RunKind,
  type Wall,
} from '@/core/index';
import { addWall, room, wallLabel, withRoom, type Change, type Draft, type Env } from './editor';
import { LAYOUT_RULES, applianceType, type ApplianceType, type LayoutRules } from './layout-rules';

const ok = (draft: Draft, notices: string[] = []): Result<Change> => ({ ok: true, value: { draft, notices } });
const refuse = (reason: string): Result<Change> => ({ ok: false, reason });

// The room geometry itself (spans, corners, where uppers go) lives in Core, so the room drawing
// and the AI designer agree (BUILD_PLAN 6, step 2, 2026-11-09). These names stay here for the
// drawing's code; the few that need a number get it from this module's data (layout-rules.json).
export {
  applianceEnd,
  direction,
  halfThickness,
  hasBase,
  hasUpper,
  insideNormal,
  insideSpan,
  neighbours,
  runEnd,
  subtract,
  wallLength,
  windowSpans,
  type CornerCabinet,
  type Dir,
  type Span,
} from '@/core/index';

export const RUN_KIND_LABEL: Readonly<Record<RunKind, string>> = {
  base: 'Base only',
  upper: 'Upper only',
  base_upper: 'Base + upper',
  base_upper_pantry: 'Base, upper + pantry',
  pantry: 'All pantry',
};

const inch = 64;

export const sortedRuns = (w: Wall): Run[] => [...w.runs].sort((a, b) => a.offset - b.offset);

/** Doors and passthroughs, widened by the clearance: nothing goes there. */
export const doorwayZones = (w: Wall, rules: LayoutRules = LAYOUT_RULES): Span[] => coreDoorwayZones(w, rules.openingClearance);

/** Windows, widened by the clearance: pantry stays out of these. */
export const windowZones = (w: Wall, rules: LayoutRules = LAYOUT_RULES): Span[] => coreWindowZones(w, rules.openingClearance);

const overlaps = (a: Span, b: Span): boolean => Math.min(a.end, b.end) > Math.max(a.start, b.start);
const runSpan = (r: Run): Span => ({ start: r.offset, end: runEnd(r) });
const applianceSpan = (a: AppliancePlacement): Span => ({ start: a.offset, end: applianceEnd(a) });

/** How deep the uppers on a run are: the whole depth for upper-only, else the upper band. */
export const upperDepth = (r: Run, rules: LayoutRules = LAYOUT_RULES): Length => coreUpperDepth(r, rules.runDepths.upperBand);

/** Appliance types that get their own upper above them (a fridge's deeper upper), from the layout rules. */
const ownUpperKinds = (rules: LayoutRules): ReadonlySet<string> => new Set(rules.appliances.filter((t) => t.upperAboveDepth !== null).map((t) => t.id));

/**
 * Where the uppers on a base + upper run go (a room wall only): along the run, skipping windows
 * and the stretch over a fridge (which gets its own deeper upper). A piece left shorter than the
 * minimum run (e.g. the 3" between a pantry and a window's edge) is not made (owner, 2026-11-07).
 */
export const upperPieces = (w: Wall, run: Run, rules: LayoutRules = LAYOUT_RULES): Span[] =>
  coreUpperPieces(w, run, { minRun: rules.minRunLength, ownUpperKinds: ownUpperKinds(rules) });

/** Every corner where runs on two walls meet. Shown, not stored (DECISIONS 2026-11-06). */
export const cornerCabinets = (r: Room, rules: LayoutRules = LAYOUT_RULES): CornerCabinet[] => coreCornerCabinets(r, rules.runDepths.upperBand);

/**
 * Where a run end dragged to `t` lands. It snaps to the corners; near a corner where the next
 * wall has a run, to the corner or the corner gaps (3", 6", 9") clear of that run's front;
 * to 3" clear of openings; and to other runs' ends. `free` (Alt held) turns snapping off.
 */
export function snapRunEnd(
  r: Room,
  wallId: string,
  t: number,
  opts: { readonly tolerance: Length; readonly free?: boolean; readonly ignoreRunIds?: readonly string[] },
  rules: LayoutRules = LAYOUT_RULES,
): Length {
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w) return Math.round(t);
  const len = wallLength(w);
  const span = insideSpan(r, w);
  const at = Math.round(Math.max(span.start, Math.min(span.end, t)));
  if (opts.free) return at;
  const nearest = (cands: readonly number[]) => cands.reduce((best, c) => (Math.abs(c - at) < Math.abs(best - at) ? c : best));
  const { before, after } = neighbours(r, w);
  const maxGap = Math.max(...rules.cornerGaps);
  const pr = before && square(before, w) ? runAtEnd(r, before) : null;
  if (pr && at < span.start + pr.depth + maxGap + opts.tolerance) return nearest([span.start, ...rules.cornerGaps.map((g) => span.start + pr.depth + g)]);
  const nr = after && square(w, after) ? runAtStart(r, after) : null;
  if (nr && at > span.end - nr.depth - maxGap - opts.tolerance) return nearest([span.end, ...rules.cornerGaps.map((g) => span.end - nr.depth - g)]);
  const ignore = new Set(opts.ignoreRunIds ?? []);
  const targets = [
    span.start,
    span.end,
    ...w.openings.flatMap((o) => [o.offset.value - rules.openingClearance, o.offset.value + o.width.value + rules.openingClearance]),
    ...w.runs.filter((x) => !ignore.has(x.run_id)).flatMap((x) => [x.offset, runEnd(x)]),
  ].filter((x) => x >= span.start && x <= span.end && x <= len);
  const best = nearest(targets);
  return Math.abs(best - at) <= opts.tolerance ? best : at;
}

export function findRun(r: Room, runId: string): { wall: Wall; run: Run } | null {
  for (const wall of r.walls) {
    const run = wall.runs.find((x) => x.run_id === runId);
    if (run) return { wall, run };
  }
  return null;
}

export function findAppliance(r: Room, placementId: string): { wall: Wall; appliance: AppliancePlacement } | null {
  for (const wall of r.walls) {
    const appliance = wall.appliances.find((x) => x.placement_id === placementId);
    if (appliance) return { wall, appliance };
  }
  return null;
}

const replaceWall = (r: Room, next: Wall): Room => ({ ...r, walls: r.walls.map((w) => (w.wall_id === next.wall_id ? next : w)) });

/** Joins touching runs of the same kind and depth (used after drawing, so a drag can extend a run). */
function mergeTouching(runs: readonly Run[], onlyIds: ReadonlySet<string>): Run[] {
  const out: Run[] = [];
  for (const r of [...runs].sort((a, b) => a.offset - b.offset)) {
    const last = out[out.length - 1];
    if (last && runEnd(last) === r.offset && last.kind === r.kind && last.depth === r.depth && (onlyIds.has(r.run_id) || onlyIds.has(last.run_id))) {
      out[out.length - 1] = { ...last, length: runEnd(r) - last.offset };
    } else out.push(r);
  }
  return out;
}

/** True when every appliance on the wall stands within its runs (touching runs count as one stretch). */
function appliancesCovered(w: Wall): AppliancePlacement[] {
  const runs = sortedRuns(w);
  return w.appliances.filter((a) => {
    let reach = a.offset;
    for (const r of runs) if (r.offset <= reach && runEnd(r) > reach) reach = runEnd(r);
    return reach < applianceEnd(a);
  });
}

const kindDepth = (kind: RunKind, rules: LayoutRules) => (kind === 'upper' ? rules.runDepths.upperOnly : rules.runDepths.base);

function addPieces(draft: Draft, env: Env, w: Wall, span: Span, rules: LayoutRules, verb: string, emptyReason: string): Result<Change> {
  const r = room(draft);
  const blocked = doorwayZones(w, rules);
  const pieces = subtract(span, [...blocked, ...w.runs.map(runSpan)]).filter((p) => p.end - p.start >= rules.minRunLength);
  if (pieces.length === 0) return refuse(emptyReason);
  const floating = w.kind === 'floating';
  const kind = floating ? rules.islandRunKind : rules.defaultRunKind;
  const depth = floating ? rules.islandStartSize.depth : kindDepth(kind, rules);
  const added: Run[] = pieces.map((p) => ({ run_id: env.newId(), kind, offset: p.start, length: p.end - p.start, depth }));
  const runs = mergeTouching([...w.runs, ...added], new Set(added.map((a) => a.run_id)));
  const notices: string[] = [];
  const doorway = w.openings.find((o) => o.kind !== 'window' && overlaps(span, { start: o.offset.value - rules.openingClearance, end: o.offset.value + o.width.value + rules.openingClearance }));
  if (doorway) notices.push(`Stopped ${formatInches(rules.openingClearance)} short of the ${doorway.kind}.`);
  const total = pieces.reduce((n, p) => n + p.end - p.start, 0);
  return ok(withRoom(draft, env, `${verb} ${formatInches(total)} of cabinets on ${wallLabel(r, w.wall_id)}`, replaceWall(r, { ...w, runs })), notices);
}

/** Tap a wall: cabinets along all of it, around doorways and existing runs. */
export function fillWall(draft: Draft, env: Env, wallId: string, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w) return refuse('That wall no longer exists.');
  return addPieces(draft, env, w, insideSpan(r, w), rules, 'Filled', `${capital(wallLabel(r, wallId))} already has cabinets everywhere they can go.`);
}

/** Drag along a wall: cabinets between two points (already snapped), around doorways and existing runs. */
export function drawRun(draft: Draft, env: Env, wallId: string, from: Length, to: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w) return refuse('That wall no longer exists.');
  const inside = insideSpan(r, w);
  const span = { start: Math.max(inside.start, Math.min(from, to)), end: Math.min(inside.end, Math.max(from, to)) };
  if (span.end <= span.start) return refuse('Drag along the wall to draw cabinets there.');
  return addPieces(draft, env, w, span, rules, 'Drew', 'That stretch already has cabinets, or is a doorway.');
}

/**
 * How far a run's end can go: not past the wall, a doorway (with clearance), another run,
 * a window if it is all pantry, and not so short it drops an appliance or goes under the minimum.
 */
export function runEndLimits(r: Room, runId: string, end: 'start' | 'end', rules: LayoutRules = LAYOUT_RULES): { min: Length; max: Length } | null {
  const found = findRun(r, runId);
  if (!found) return null;
  const { wall, run } = found;
  const obstacles = [...doorwayZones(wall, rules), ...wall.runs.filter((x) => x !== run).map(runSpan), ...(run.kind === 'pantry' ? windowZones(wall, rules) : [])];
  const inside = wall.appliances.filter((a) => a.offset >= run.offset && applianceEnd(a) <= runEnd(run));
  const inSpan = insideSpan(r, wall);
  if (end === 'start') {
    const min = Math.max(inSpan.start, ...obstacles.filter((o) => o.end <= run.offset).map((o) => o.end));
    const max = Math.min(runEnd(run) - rules.minRunLength, ...inside.map((a) => a.offset));
    return { min, max };
  }
  const min = Math.max(run.offset + rules.minRunLength, ...inside.map(applianceEnd));
  const max = Math.min(inSpan.end, ...obstacles.filter((o) => o.start >= runEnd(run)).map((o) => o.start));
  return { min, max };
}

/** Moves one end of a run (drag an end handle, or type a length). */
export function setRunEnd(draft: Draft, env: Env, runId: string, end: 'start' | 'end', at: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findRun(r, runId);
  const limits = runEndLimits(r, runId, end, rules);
  if (!found || !limits) return refuse('That cabinet run no longer exists.');
  if (at < limits.min || at > limits.max) return refuse(`That end can only go between ${formatInches(limits.min)} and ${formatInches(limits.max)} from the start of the wall.`);
  const { wall, run } = found;
  const next: Run = end === 'start' ? { ...run, offset: at, length: runEnd(run) - at } : { ...run, length: at - run.offset };
  return ok(withRoom(draft, env, `Made a run on ${wallLabel(r, wall.wall_id)} ${formatInches(next.length)} long`, replaceWall(r, { ...wall, runs: wall.runs.map((x) => (x === run ? next : x)) })));
}

/**
 * Where a run can slide along its wall, keeping its length: between whatever is on each side
 * of it now (the inside corners, doorways with clearance, other runs, and windows if it is all
 * pantry). As the smallest and largest offset of its near end.
 */
export function runMoveLimits(r: Room, runId: string, rules: LayoutRules = LAYOUT_RULES): { min: Length; max: Length } | null {
  const found = findRun(r, runId);
  if (!found) return null;
  const { wall, run } = found;
  const span = insideSpan(r, wall);
  const obstacles = [...doorwayZones(wall, rules), ...wall.runs.filter((x) => x !== run).map(runSpan), ...(run.kind === 'pantry' ? windowZones(wall, rules) : [])];
  const min = Math.max(span.start, ...obstacles.filter((o) => o.end <= run.offset).map((o) => o.end));
  const max = Math.min(span.end, ...obstacles.filter((o) => o.start >= runEnd(run)).map((o) => o.start)) - run.length;
  return { min, max: Math.max(min, max) };
}

/** Slides a run along its wall, keeping its length; the appliances standing on it go with it. */
export function moveRun(draft: Draft, env: Env, runId: string, offset: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findRun(r, runId);
  const limits = runMoveLimits(r, runId, rules);
  if (!found || !limits) return refuse('That cabinet run no longer exists.');
  if (offset < limits.min || offset > limits.max) return refuse(`That run can only slide between ${formatInches(limits.min)} and ${formatInches(limits.max)} from the start of the wall.`);
  const { wall, run } = found;
  const delta = offset - run.offset;
  if (delta === 0) return refuse('Nothing moved.');
  const on = new Set(wall.appliances.filter((a) => a.offset >= run.offset && applianceEnd(a) <= runEnd(run)).map((a) => a.placement_id));
  const next: Wall = {
    ...wall,
    runs: wall.runs.map((x) => (x === run ? { ...x, offset } : x)),
    appliances: wall.appliances.map((a) => (on.has(a.placement_id) ? { ...a, offset: a.offset + delta } : a)),
  };
  return ok(withRoom(draft, env, `Moved a run along ${wallLabel(r, wall.wall_id)}`, replaceWall(r, next)));
}

/** Sets a run's length by moving its far end, or its near end if the far one is blocked. */
export function setRunLength(draft: Draft, env: Env, runId: string, length: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findRun(r, runId);
  if (!found) return refuse('That cabinet run no longer exists.');
  if (length < rules.minRunLength) return refuse(`A run must be at least ${formatInches(rules.minRunLength)} long.`);
  const { run } = found;
  const endLimits = runEndLimits(r, runId, 'end', rules);
  const startLimits = runEndLimits(r, runId, 'start', rules);
  if (!endLimits || !startLimits) return refuse('That cabinet run no longer exists.');
  const far = Math.min(run.offset + length, endLimits.max);
  const near = far - length;
  if (near < startLimits.min) return refuse(`There is only room for ${formatInches(endLimits.max - startLimits.min)} of cabinets here.`);
  if (far < endLimits.min || near > startLimits.max) return refuse('That would leave an appliance off the run. Move it first.');
  const { wall } = found;
  const next: Run = { ...run, offset: near, length };
  return ok(withRoom(draft, env, `Made a run on ${wallLabel(r, wall.wall_id)} ${formatInches(length)} long`, replaceWall(r, { ...wall, runs: wall.runs.map((x) => (x === run ? next : x)) })));
}

/** The divider between two touching runs (a split): where it can go. */
export function jointLimits(r: Room, leftId: string, rightId: string, rules: LayoutRules = LAYOUT_RULES): { min: Length; max: Length } | null {
  const a = findRun(r, leftId);
  const b = findRun(r, rightId);
  if (!a || !b || a.wall !== b.wall || runEnd(a.run) !== b.run.offset) return null;
  let min = a.run.offset + rules.minRunLength;
  let max = runEnd(b.run) - rules.minRunLength;
  // An all-pantry part may not reach in front of a window.
  for (const z of windowZones(a.wall, rules)) {
    if (a.run.kind === 'pantry' && z.start >= a.run.offset) max = Math.min(max, z.start);
    if (b.run.kind === 'pantry' && z.end <= runEnd(b.run)) min = Math.max(min, z.end);
  }
  return min <= max ? { min, max } : null;
}

/** Moves the divider between two touching runs; both change together. */
export function moveJoint(draft: Draft, env: Env, leftId: string, rightId: string, at: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const limits = jointLimits(r, leftId, rightId, rules);
  const a = findRun(r, leftId);
  const b = findRun(r, rightId);
  if (!limits || !a || !b) return refuse('Those runs no longer meet.');
  if (at < limits.min || at > limits.max) return refuse(`The divider can only go between ${formatInches(limits.min)} and ${formatInches(limits.max)} from the start of the wall.`);
  const wall = a.wall;
  const runs = wall.runs.map((x) =>
    x.run_id === leftId ? { ...x, length: at - x.offset } : x.run_id === rightId ? { ...x, offset: at, length: runEnd(x) - at } : x,
  );
  return ok(withRoom(draft, env, `Moved the divider on ${wallLabel(r, wall.wall_id)}`, replaceWall(r, { ...wall, runs })));
}

/** Sets the depth of one or more runs. */
export function setRunDepth(draft: Draft, env: Env, runIds: readonly string[], depth: Length): Result<Change> {
  const r = room(draft);
  if (runIds.length === 0) return refuse('No cabinet runs are selected.');
  if (runIds.some((id) => !findRun(r, id))) return refuse('Some of those runs no longer exist.');
  if (!(depth > 0)) return refuse('A run needs a depth.');
  const ids = new Set(runIds);
  const walls = r.walls.map((w) => (w.runs.some((x) => ids.has(x.run_id)) ? { ...w, runs: w.runs.map((x) => (ids.has(x.run_id) ? { ...x, depth } : x)) } : w));
  return ok(withRoom(draft, env, `Made ${runIds.length === 1 ? 'a run' : `${runIds.length} runs`} ${formatInches(depth)} deep`, { ...r, walls }));
}

/**
 * Sets what one or more runs hold. Upper only takes the upper-only depth and drops the
 * appliances standing on it (it has no base cabinets), saying so. All pantry stays clear of
 * windows: that stretch becomes base only.
 */
export function setRunKind(draft: Draft, env: Env, runIds: readonly string[], kind: RunKind, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  if (runIds.length === 0) return refuse('No cabinet runs are selected.');
  if (runIds.some((id) => !findRun(r, id))) return refuse('Some of those runs no longer exist.');
  const ids = new Set(runIds);
  const notices: string[] = [];
  let dropped = 0;
  let splitAtWindow = false;
  let stoppedShort = false;
  const walls = r.walls.map((w) => {
    if (!w.runs.some((x) => ids.has(x.run_id))) return w;
    let runs: Run[] = [];
    /** Base pieces left at a run's end that are too short to be a cabinet (see below). */
    const slivers = new Set<string>();
    for (const run of w.runs) {
      if (!ids.has(run.run_id)) {
        runs.push(run);
        continue;
      }
      let depth = run.depth;
      if (kind === 'upper' && run.depth === rules.runDepths.base) depth = rules.runDepths.upperOnly;
      if (kind !== 'upper' && run.kind === 'upper' && run.depth === rules.runDepths.upperOnly) depth = rules.runDepths.base;
      if (kind !== 'pantry') {
        runs.push({ ...run, kind, depth });
        continue;
      }
      const zones = windowZones(w, rules).filter((z) => overlaps(z, runSpan(run)));
      if (zones.length === 0) {
        runs.push({ ...run, kind, depth });
        continue;
      }
      const parts: { start: Length; end: Length; kind: RunKind }[] = [];
      let cur = run.offset;
      for (const z of [...zones].sort((p, q) => p.start - q.start)) {
        const a = Math.max(z.start, run.offset);
        const b = Math.min(z.end, runEnd(run));
        if (a > cur) parts.push({ start: cur, end: a, kind: 'pantry' });
        parts.push({ start: a, end: b, kind: 'base' });
        cur = b;
      }
      if (runEnd(run) > cur) parts.push({ start: cur, end: runEnd(run), kind: 'pantry' });
      for (const p of parts) if (p.kind === 'pantry' && p.end - p.start < rules.minRunLength) p.kind = 'base';
      const merged: typeof parts = [];
      for (const p of parts) {
        const last = merged[merged.length - 1];
        if (last && last.kind === p.kind) last.end = p.end;
        else merged.push({ ...p });
      }
      // The run keeps its id on its (first) pantry part, so it stays selected.
      const keep = Math.max(0, merged.findIndex((p) => p.kind === 'pantry'));
      merged.forEach((p, i) => {
        const id = i === keep ? run.run_id : env.newId();
        if (merged.length > 1 && p.kind !== 'pantry' && p.end - p.start < rules.minRunLength && (i === 0 || i === merged.length - 1)) slivers.add(id);
        else if (p.kind !== 'pantry') splitAtWindow = true;
        runs.push({ run_id: id, kind: p.kind, offset: p.start, length: p.end - p.start, depth });
      });
    }
    // A run that already stopped at (or just inside) a window's clearance leaves only a sliver of
    // base before the window, e.g. 3" when it was split at the window's edge (owner, 2026-11-07:
    // no tiny cabinet there). The sliver goes to the run beyond it, which already stands in front
    // of the window, or, with nothing there, is left as the clearance gap. It stays only if an
    // appliance stands on it.
    for (const id of slivers) {
      const piece = runs.find((x) => x.run_id === id) as Run;
      stoppedShort = true;
      const touches = (x: Run) => x !== piece && (runEnd(x) === piece.offset || x.offset === runEnd(piece));
      const other = runs.find((x) => touches(x) && x.kind !== 'pantry' && hasBase(x.kind));
      if (other) {
        runs = runs.filter((x) => x !== piece).map((x) => (x === other ? { ...x, offset: Math.min(x.offset, piece.offset), length: x.length + piece.length } : x));
        continue;
      }
      const standing = w.appliances.some((a) => overlaps(applianceSpan(a), runSpan(piece)));
      if (standing) splitAtWindow = true;
      else runs = runs.filter((x) => x !== piece);
    }
    if (kind === 'upper') {
      const onUpper = (a: AppliancePlacement) =>
        runs.some((x) => ids.has(x.run_id) && a.offset >= x.offset && applianceEnd(a) <= runEnd(x));
      const keep = w.appliances.filter((a) => !onUpper(a));
      dropped += w.appliances.length - keep.length;
      runs = [...runs];
      return { ...w, runs, appliances: keep };
    }
    return { ...w, runs };
  });
  const removedIds = new Set(r.walls.flatMap((w) => w.appliances.map((a) => a.placement_id)).filter((id) => !walls.some((w) => w.appliances.some((a) => a.placement_id === id))));
  const unpaired = walls.map((w) => ({ ...w, appliances: w.appliances.map((a) => (a.paired_with && removedIds.has(a.paired_with) ? { ...a, paired_with: null } : a)) }));
  if (dropped > 0) notices.push(`Removed ${dropped} appliance${dropped > 1 ? 's' : ''} that stood on it: an upper-only run has no base cabinets.`);
  if (stoppedShort && !splitAtWindow) notices.push(`Pantry stops ${formatInches(rules.openingClearance)} clear of the window.`);
  if (splitAtWindow) notices.push(`Pantry stays ${formatInches(rules.openingClearance)} clear of the window. The part under the window is base cabinets.`);
  return ok(withRoom(draft, env, `Made ${runIds.length === 1 ? 'a run' : `${runIds.length} runs`} ${RUN_KIND_LABEL[kind].toLowerCase()}`, { ...r, walls: unpaired }), notices);
}

/**
 * Splits a run in two at its middle, so each part can hold something different. The cut
 * moves clear of a window (with clearance) and never goes through an appliance.
 */
export function splitRun(draft: Draft, env: Env, runId: string, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findRun(r, runId);
  if (!found) return refuse('That cabinet run no longer exists.');
  const { wall, run } = found;
  const lo = run.offset + rules.minRunLength;
  const hi = runEnd(run) - rules.minRunLength;
  if (lo > hi) return refuse(`This run is too short to split: each part needs at least ${formatInches(rules.minRunLength)}.`);
  const mid = Math.round((run.offset + runEnd(run)) / 2 / inch) * inch;
  const blocks = [...windowZones(wall, rules), ...wall.appliances.map(applianceSpan)].filter((b) => overlaps(b, runSpan(run)));
  const isFree = (t: number) => t >= lo && t <= hi && !blocks.some((b) => t > b.start && t < b.end);
  const candidates = [mid, ...blocks.flatMap((b) => [b.start, b.end])].filter(isFree).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  const at = candidates[0];
  if (at === undefined) return refuse('There is nowhere to split this run that is clear of windows and appliances.');
  const left: Run = { ...run, length: at - run.offset };
  const right: Run = { ...run, run_id: env.newId(), offset: at, length: runEnd(run) - at };
  const runs = wall.runs.flatMap((x) => (x === run ? [left, right] : [x]));
  return ok(withRoom(draft, env, `Split a run on ${wallLabel(r, wall.wall_id)}`, replaceWall(r, { ...wall, runs })));
}

/** Deletes runs. Appliances left with no run under them go too, and the person is told. */
export function deleteRuns(draft: Draft, env: Env, runIds: readonly string[]): Result<Change> {
  const r = room(draft);
  if (runIds.length === 0) return refuse('No cabinet runs are selected.');
  if (runIds.some((id) => !findRun(r, id))) return refuse('Some of those runs no longer exist.');
  const ids = new Set(runIds);
  let walls = r.walls.map((w) => (w.runs.some((x) => ids.has(x.run_id)) ? { ...w, runs: w.runs.filter((x) => !ids.has(x.run_id)) } : w));
  const gone = new Set(walls.flatMap((w) => appliancesCovered(w).map((a) => a.placement_id)));
  walls = walls.map((w) => ({
    ...w,
    appliances: w.appliances.filter((a) => !gone.has(a.placement_id)).map((a) => (a.paired_with && gone.has(a.paired_with) ? { ...a, paired_with: null } : a)),
  }));
  const notices = gone.size > 0 ? [`Also removed ${gone.size} appliance${gone.size > 1 ? 's' : ''} that stood on ${runIds.length > 1 ? 'them' : 'it'}.`] : [];
  return ok(withRoom(draft, env, runIds.length === 1 ? 'Deleted a cabinet run' : `Deleted ${runIds.length} cabinet runs`, { ...r, walls }), notices);
}

// ---------- appliances ----------

/** Where an appliance would land if dropped at `centre` along a wall. Pure, for the ghost and the drop. */
export interface AppliancePlan {
  readonly wallId: string;
  readonly offset: Length;
  readonly width: Length;
  readonly centredUnderWindow: boolean;
  /** The appliance placed (or kept) beside it: a sink's dishwasher. */
  readonly partner: { readonly kind: string; readonly offset: Length; readonly width: Length; readonly existingId: string | null } | null;
  /** A partner that had to be left where it was, because it no longer fits beside it. */
  readonly partnerLeftBehind: string | null;
}

function obstaclesFor(r: Room, w: Wall, type: ApplianceType, exclude: ReadonlySet<string>, rules: LayoutRules): Span[] {
  const span = insideSpan(r, w);
  const obs: Span[] = [...doorwayZones(w, rules)];
  if (type.keepClearOfWindows) obs.push(...windowSpans(w));
  const { before, after } = neighbours(r, w);
  const pr = before ? runAtEnd(r, before) : null;
  const nr = after ? runAtStart(r, after) : null;
  // The corner square belongs to the corner cabinet.
  if (pr && hasBase(pr.kind) && runAtStart(r, w)) obs.push({ start: span.start, end: span.start + pr.depth });
  if (nr && hasBase(nr.kind) && runAtEnd(r, w)) obs.push({ start: span.end - nr.depth, end: span.end });
  for (const a of w.appliances) if (!exclude.has(a.placement_id)) obs.push(applianceSpan(a));
  return obs;
}

/** The free spot nearest `desired` (a centre) for something `width` wide between lo and hi. */
function freeSpot(desired: number, width: Length, lo: Length, hi: Length, obs: readonly Span[]): Length | null {
  const fits = (start: number) => start >= lo && start + width <= hi && obs.every((o) => start + width <= o.start || start >= o.end);
  const want = Math.round(desired - width / 2);
  const cands = [want, lo, hi - width, ...obs.flatMap((o) => [o.start - width, o.end])].map((s) => Math.max(lo, Math.min(hi - width, s)));
  const okStarts = cands.filter(fits).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
  return okStarts[0] ?? null;
}

export function planAppliance(
  r: Room,
  kind: string,
  wallId: string,
  centre: number,
  opts: {
    readonly width?: Length;
    readonly movingId?: string | null;
    /** Dropped this close beyond a window's edge, it centres under the window. */
    readonly windowSnap: Length;
    /**
     * Instead: it centres only when its centre comes this close to the window's centre (a drag,
     * so it can sit off centre; owner, 2026-11-07). Zero never snaps.
     */
    readonly centreSnap?: Length;
  },
  rules: LayoutRules = LAYOUT_RULES,
): Result<AppliancePlan> {
  const type = applianceType(rules, kind);
  if (!type) return { ok: false, reason: `"${kind}" is not on the list of appliances.` };
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w) return { ok: false, reason: 'That wall no longer exists.' };
  const width = opts.width ?? (type.widths[0] as Length);
  const span = insideSpan(r, w);
  const moving = opts.movingId ?? null;
  const existingPartner = moving ? r.walls.flatMap((x) => x.appliances).find((a) => a.paired_with === moving) ?? null : null;
  const partnerType = type.addsBeside ? applianceType(rules, type.addsBeside) : null;
  const roomHasPartnerKind = partnerType ? r.walls.some((x) => x.appliances.some((a) => a.kind === partnerType.id && a.placement_id !== existingPartner?.placement_id)) : true;
  const wantPartner = partnerType !== null && (existingPartner !== null || !roomHasPartnerKind);

  const place = (exclude: ReadonlySet<string>): { offset: Length; underWindow: boolean } | null => {
    const obs = obstaclesFor(r, w, type, exclude, rules);
    if (type.centreUnderWindow) {
      for (const win of w.openings.filter((o) => o.kind === 'window')) {
        const wc = win.offset.value + win.width.value / 2;
        const reach = opts.centreSnap !== undefined ? opts.centreSnap : win.width.value / 2 + opts.windowSnap;
        if (opts.centreSnap !== 0 && Math.abs(centre - wc) <= reach) {
          const at = freeSpot(wc, width, span.start, span.end, obs);
          if (at !== null && at === Math.round(wc - width / 2)) return { offset: at, underWindow: true };
        }
      }
    }
    const at = freeSpot(centre, width, span.start, span.end, obs);
    return at === null ? null : { offset: at, underWindow: false };
  };
  const besideSpot = (offset: Length, pWidth: Length, prefer: 1 | -1, exclude: ReadonlySet<string>): Length | null => {
    if (!partnerType) return null;
    const obs = [...obstaclesFor(r, w, partnerType, exclude, rules), { start: offset, end: offset + width }];
    for (const side of [prefer, -prefer as 1 | -1]) {
      const start = side === 1 ? offset + width : offset - pWidth;
      if (start >= span.start && start + pWidth <= span.end && obs.every((o) => start + pWidth <= o.start || start >= o.end)) return start;
    }
    return null;
  };

  const excludeAll = new Set([moving, existingPartner?.placement_id].filter((x): x is string => !!x));
  if (wantPartner && partnerType) {
    const spot = place(excludeAll);
    if (spot) {
      const pWidth = existingPartner?.width.value ?? (partnerType.widths[0] as Length);
      const oldSide: 1 | -1 = existingPartner ? (existingPartner.offset >= (findAppliance(r, moving ?? '')?.appliance.offset ?? 0) ? 1 : -1) : 1;
      const pAt = besideSpot(spot.offset, pWidth, oldSide, excludeAll);
      if (pAt !== null) {
        return {
          ok: true,
          value: { wallId, offset: spot.offset, width, centredUnderWindow: spot.underWindow, partner: { kind: partnerType.id, offset: pAt, width: pWidth, existingId: existingPartner?.placement_id ?? null }, partnerLeftBehind: null },
        };
      }
    }
  }
  const exclude = new Set([moving].filter((x): x is string => !!x));
  const spot = place(exclude);
  if (!spot) return { ok: false, reason: `There is no room for a ${formatInches(width)} ${type.name.toLowerCase()} on ${wallLabel(r, wallId)} there.` };
  return { ok: true, value: { wallId, offset: spot.offset, width, centredUnderWindow: spot.underWindow, partner: null, partnerLeftBehind: existingPartner?.placement_id ?? null } };
}

/**
 * A sink (anything that centres under a window) standing in front of a window but not centred
 * under it: a yellow notice saying how far off centre it is (owner, 2026-11-07: tell me when it
 * is NOT centred, not when it is). Null when it is centred, or not in front of a window.
 */
export function offCentreNotice(w: Wall, type: ApplianceType, offset: Length, width: Length): string | null {
  if (!type.centreUnderWindow) return null;
  const win = windowSpans(w).find((x) => overlaps(x, { start: offset, end: offset + width }));
  if (!win) return null;
  const off = Math.abs(offset + width / 2 - (win.start + win.end) / 2);
  if (off === 0) return null;
  return `The ${type.name.toLowerCase()} is not centred under the window: it is ${formatInches(Math.round(off))} off centre.`;
}

/**
 * Makes sure a stretch stands within runs: extends a run that touches or overlaps it, or adds a
 * short run of the given kind. An upper-only run under an appliance becomes base + upper.
 */
function ensureRun(env: Env, w: Wall, span: Span, kind: RunKind, rules: LayoutRules, notices: string[]): Wall {
  let runs = [...w.runs];
  for (const run of runs.filter((x) => overlaps(runSpan(x), span) && x.kind === 'upper')) {
    runs = runs.map((x) => (x === run ? { ...x, kind: 'base_upper' as const, depth: rules.runDepths.base } : x));
    notices.push('The upper-only run under it now has base cabinets too.');
  }
  for (const gap of subtract(span, runs.map(runSpan))) {
    const toLeft = runs.find((x) => runEnd(x) === gap.start);
    const toRight = runs.find((x) => x.offset === gap.end);
    if (toLeft) runs = runs.map((x) => (x === toLeft ? { ...x, length: gap.end - x.offset } : x));
    else if (toRight) runs = runs.map((x) => (x === toRight ? { ...x, offset: gap.start, length: runEnd(x) - gap.start } : x));
    else {
      const next = sortedRuns({ ...w, runs }).find((x) => x.offset > gap.end);
      const prev = [...sortedRuns({ ...w, runs })].reverse().find((x) => runEnd(x) < gap.start);
      // A short gap to a neighbouring run is closed by extending it, so the appliance stays on one stretch.
      if (prev && gap.start - runEnd(prev) < rules.minRunLength) runs = runs.map((x) => (x === prev ? { ...x, length: gap.end - x.offset } : x));
      else if (next && next.offset - gap.end < rules.minRunLength) runs = runs.map((x) => (x === next ? { ...x, offset: gap.start, length: runEnd(x) - gap.start } : x));
      else {
        runs.push({ run_id: env.newId(), kind, offset: gap.start, length: gap.end - gap.start, depth: w.kind === 'floating' ? rules.islandStartSize.depth : kindDepth(kind, rules) });
        notices.push('Added a short run under it.');
      }
    }
  }
  return { ...w, runs };
}

/** Drops an appliance. A sink centres under a nearby window and brings a dishwasher when the room has none. */
export function placeAppliance(
  draft: Draft,
  env: Env,
  kind: string,
  wallId: string,
  centre: number,
  opts: { readonly windowSnap: Length },
  rules: LayoutRules = LAYOUT_RULES,
): Result<Change> {
  const r = room(draft);
  const planned = planAppliance(r, kind, wallId, centre, { windowSnap: opts.windowSnap }, rules);
  if (!planned.ok) return refuse(planned.reason);
  const plan = planned.value;
  const type = applianceType(rules, kind) as ApplianceType;
  const w = r.walls.find((x) => x.wall_id === wallId) as Wall;
  const notices: string[] = [];
  const id = env.newId();
  const placed: AppliancePlacement[] = [{ placement_id: id, kind, offset: plan.offset, width: unmeasured(plan.width), paired_with: null }];
  const offCentre = offCentreNotice(w, type, plan.offset, plan.width);
  if (offCentre) notices.push(offCentre);
  let next: Wall = { ...w, appliances: [...w.appliances, ...placed] };
  next = ensureRun(env, next, { start: plan.offset, end: plan.offset + plan.width }, type.runWhenAlone, rules, notices);
  if (plan.partner) {
    const pType = applianceType(rules, plan.partner.kind) as ApplianceType;
    next = { ...next, appliances: [...next.appliances, { placement_id: env.newId(), kind: plan.partner.kind, offset: plan.partner.offset, width: unmeasured(plan.partner.width), paired_with: id }] };
    next = ensureRun(env, next, { start: plan.partner.offset, end: plan.partner.offset + plan.partner.width }, pType.runWhenAlone, rules, notices);
    notices.push(`${pType.name} added beside the ${type.name.toLowerCase()}. Select it to move it to the other side.`);
  }
  return ok(withRoom(draft, env, `Placed a ${type.name.toLowerCase()} on ${wallLabel(r, wallId)}`, replaceWall(r, next)), dedupe(notices));
}

/**
 * Moves an appliance along its wall or onto another; a sink's dishwasher comes with it. With
 * `centreSnap`, a sink centres under a window only when brought that close to its centre.
 */
export function moveAppliance(
  draft: Draft,
  env: Env,
  placementId: string,
  wallId: string,
  centre: number,
  opts: { readonly windowSnap: Length; readonly centreSnap?: Length },
  rules: LayoutRules = LAYOUT_RULES,
): Result<Change> {
  const r = room(draft);
  const found = findAppliance(r, placementId);
  if (!found) return refuse('That appliance no longer exists.');
  const { appliance } = found;
  const type = applianceType(rules, appliance.kind);
  if (!type) return refuse(`"${appliance.kind}" is not on the list of appliances.`);
  const planned = planAppliance(r, appliance.kind, wallId, centre, { width: appliance.width.value, movingId: placementId, windowSnap: opts.windowSnap, ...(opts.centreSnap !== undefined ? { centreSnap: opts.centreSnap } : {}) }, rules);
  if (!planned.ok) return refuse(planned.reason);
  const plan = planned.value;
  const notices: string[] = [];
  const offCentre = offCentreNotice(r.walls.find((x) => x.wall_id === wallId) as Wall, type, plan.offset, plan.width);
  if (offCentre) notices.push(offCentre);
  const partnerId = plan.partner?.existingId ?? null;
  const takeOut = new Set([placementId, ...(partnerId ? [partnerId] : [])]);
  let rr: Room = { ...r, walls: r.walls.map((x) => ({ ...x, appliances: x.appliances.filter((a) => !takeOut.has(a.placement_id)) })) };
  let target = rr.walls.find((x) => x.wall_id === wallId) as Wall;
  // A dishwasher dragged away from its sink is no longer tied to it.
  let pairedWith = appliance.paired_with;
  if (pairedWith) {
    const sink = findAppliance(rr, pairedWith);
    const beside = sink && sink.wall.wall_id === wallId && (plan.offset === applianceEnd(sink.appliance) || plan.offset + plan.width === sink.appliance.offset);
    if (!beside) {
      pairedWith = null;
      notices.push('The dishwasher is no longer tied to the sink.');
    }
  }
  target = { ...target, appliances: [...target.appliances, { ...appliance, offset: plan.offset, paired_with: pairedWith }] };
  target = ensureRun(env, target, { start: plan.offset, end: plan.offset + plan.width }, type.runWhenAlone, rules, notices);
  if (plan.partner && partnerId) {
    const partner = findAppliance(r, partnerId)?.appliance as AppliancePlacement;
    const pType = applianceType(rules, partner.kind) as ApplianceType;
    target = { ...target, appliances: [...target.appliances, { ...partner, offset: plan.partner.offset }] };
    target = ensureRun(env, target, { start: plan.partner.offset, end: plan.partner.offset + plan.partner.width }, pType.runWhenAlone, rules, notices);
  }
  rr = replaceWall(rr, target);
  if (plan.partnerLeftBehind) {
    rr = { ...rr, walls: rr.walls.map((x) => ({ ...x, appliances: x.appliances.map((a) => (a.placement_id === plan.partnerLeftBehind ? { ...a, paired_with: null } : a)) })) };
    // It never left its place: only a partner that fits beside the sink moves with it.
    notices.push('There is no room for the dishwasher beside the sink here, so it stayed where it was.');
  }
  return ok(withRoom(draft, env, `Moved a ${type.name.toLowerCase()} to ${wallLabel(r, wallId)}`, rr), dedupe(notices));
}

/** Changes an appliance to another of its standard widths, keeping its centre where it fits. */
export function setApplianceWidth(draft: Draft, env: Env, placementId: string, width: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findAppliance(r, placementId);
  if (!found) return refuse('That appliance no longer exists.');
  const { wall, appliance } = found;
  const type = applianceType(rules, appliance.kind);
  if (!type) return refuse(`"${appliance.kind}" is not on the list of appliances.`);
  if (!type.widths.includes(width)) return refuse(`A ${type.name.toLowerCase()} comes ${type.widths.map(formatInches).join(' or ')} wide.`);
  if (width === appliance.width.value) return refuse('Nothing changed.');
  const centre = appliance.offset + appliance.width.value / 2;
  const inSpan = insideSpan(r, wall);
  const at = freeSpot(centre, width, inSpan.start, inSpan.end, obstaclesFor(r, wall, type, new Set([placementId]), rules));
  if (at === null) return refuse(`There is no room for a ${formatInches(width)} ${type.name.toLowerCase()} here.`);
  const notices: string[] = [];
  let next: Wall = { ...wall, appliances: wall.appliances.map((a) => (a === appliance ? { ...a, offset: at, width: unmeasured(width) } : a)) };
  next = ensureRun(env, next, { start: at, end: at + width }, type.runWhenAlone, rules, notices);
  return ok(withRoom(draft, env, `Made a ${type.name.toLowerCase()} ${formatInches(width)} wide`, replaceWall(r, next)), dedupe(notices));
}

/** Moves a dishwasher to the other side of its sink. */
export function flipPartner(draft: Draft, env: Env, placementId: string, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const found = findAppliance(r, placementId);
  if (!found || !found.appliance.paired_with) return refuse('That appliance is not tied to a sink.');
  const { wall, appliance } = found;
  const sink = wall.appliances.find((a) => a.placement_id === appliance.paired_with);
  if (!sink) return refuse('Its sink is on another wall.');
  const type = applianceType(rules, appliance.kind);
  if (!type) return refuse(`"${appliance.kind}" is not on the list of appliances.`);
  const onRight = appliance.offset >= applianceEnd(sink);
  const start = onRight ? sink.offset - appliance.width.value : applianceEnd(sink);
  const obs = obstaclesFor(r, wall, type, new Set([placementId]), rules);
  const inSpan = insideSpan(r, wall);
  if (start < inSpan.start || start + appliance.width.value > inSpan.end || !obs.every((o) => start + appliance.width.value <= o.start || start >= o.end)) {
    return refuse('There is no room on the other side of the sink.');
  }
  const notices: string[] = [];
  let next: Wall = { ...wall, appliances: wall.appliances.map((a) => (a === appliance ? { ...a, offset: start } : a)) };
  next = ensureRun(env, next, { start, end: start + appliance.width.value }, type.runWhenAlone, rules, notices);
  return ok(withRoom(draft, env, `Moved the ${type.name.toLowerCase()} to the other side of the sink`, replaceWall(r, next)), dedupe(notices));
}

/** Deletes appliances. One placed beside a deleted one is kept and no longer tied to it. */
export function deleteAppliances(draft: Draft, env: Env, placementIds: readonly string[]): Result<Change> {
  const r = room(draft);
  if (placementIds.length === 0) return refuse('No appliances are selected.');
  if (placementIds.some((id) => !findAppliance(r, id))) return refuse('Some of those appliances no longer exist.');
  const ids = new Set(placementIds);
  const walls = r.walls.map((w) => ({
    ...w,
    appliances: w.appliances.filter((a) => !ids.has(a.placement_id)).map((a) => (a.paired_with && ids.has(a.paired_with) ? { ...a, paired_with: null } : a)),
  }));
  return ok(withRoom(draft, env, placementIds.length === 1 ? 'Deleted an appliance' : `Deleted ${placementIds.length} appliances`, { ...r, walls }));
}

// ---------- islands (floating walls with a run, DECISIONS A-21) ----------

/** The island depth on the list nearest `depth`. */
export const nearestIslandDepth = (depth: number, rules: LayoutRules = LAYOUT_RULES): Length =>
  rules.islandDepths.reduce((best, d) => (Math.abs(d - depth) < Math.abs(best - depth) ? d : best));

/**
 * Adds an island: a floating wall along its length through `centre`, with one run on it.
 * `along` is the direction of its length. The depth must be one of the island depths.
 */
export function addIsland(
  draft: Draft,
  env: Env,
  centre: Point,
  along: 'x' | 'y',
  length: Length,
  depth: Length,
  rules: LayoutRules = LAYOUT_RULES,
): Result<Change> {
  if (!rules.islandDepths.includes(depth)) return refuse(`An island is ${rules.islandDepths.map(formatInches).join(', ')} deep.`);
  if (length < rules.minRunLength) return refuse(`An island must be at least ${formatInches(rules.minRunLength)} long.`);
  const half = Math.floor(length / 2);
  const start = along === 'x' ? { x: centre.x - half, y: centre.y } : { x: centre.x, y: centre.y - half };
  const end = along === 'x' ? { x: start.x + length, y: centre.y } : { x: centre.x, y: start.y + length };
  const added = addWall(draft, env, start, end, null, 'floating');
  if (!added.ok) return added;
  const d = added.value.draft;
  const r = room(d);
  const wall = r.walls[r.walls.length - 1] as Wall;
  const withRun: Wall = { ...wall, runs: [{ run_id: env.newId(), kind: rules.islandRunKind, offset: 0, length, depth }] };
  return ok(withRoom(draft, env, `Added a ${formatInches(length)} island, ${formatInches(depth)} deep`, replaceWall(r, withRun)));
}

/**
 * Makes an island on a floating wall already drawn (owner, 2026-11-06: an island dragged over a
 * floating wall snaps onto it): one run along the whole wall, centred on it, with a depth from
 * the island list. Refused if the wall already has cabinets.
 */
export function addIslandOnWall(draft: Draft, env: Env, wallId: string, depth: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w || w.kind !== 'floating') return refuse('That floating wall no longer exists.');
  if (w.runs.length > 0) return refuse('That floating wall already has cabinets on it.');
  if (!rules.islandDepths.includes(depth)) return refuse(`An island is ${rules.islandDepths.map(formatInches).join(', ')} deep.`);
  const length = wallLength(w);
  if (length < rules.minRunLength) return refuse(`An island must be at least ${formatInches(rules.minRunLength)} long.`);
  const run: Run = { run_id: env.newId(), kind: rules.islandRunKind, offset: 0, length, depth };
  return ok(withRoom(draft, env, `Made a ${formatInches(length)} island on ${wallLabel(r, wallId)}, ${formatInches(depth)} deep`, replaceWall(r, { ...w, runs: [run] })));
}

/** Moves an island (its floating wall, with everything on it) by dx, dy. */
export function moveIsland(draft: Draft, env: Env, wallId: string, dx: Length, dy: Length): Result<Change> {
  const r = room(draft);
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w || w.kind !== 'floating') return refuse('That island no longer exists.');
  const shift = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  return ok(withRoom(draft, env, 'Moved an island', replaceWall(r, { ...w, start_point: shift(w.start_point), end_point: shift(w.end_point) })));
}

/** Resizes an island: its length (from its start end) and its depth (one of the island depths). */
export function resizeIsland(draft: Draft, env: Env, wallId: string, length: Length, depth: Length, rules: LayoutRules = LAYOUT_RULES): Result<Change> {
  const r = room(draft);
  const w = r.walls.find((x) => x.wall_id === wallId);
  if (!w || w.kind !== 'floating') return refuse('That island no longer exists.');
  if (!rules.islandDepths.includes(depth)) return refuse(`An island is ${rules.islandDepths.map(formatInches).join(', ')} deep.`);
  if (length < rules.minRunLength) return refuse(`An island must be at least ${formatInches(rules.minRunLength)} long.`);
  const oldLen = wallLength(w);
  const dx = w.end_point.x - w.start_point.x;
  const dy = w.end_point.y - w.start_point.y;
  if (dx !== 0 && dy !== 0) return refuse('Only a straight (not slanted) island can be resized here.');
  const end = { x: w.start_point.x + Math.sign(dx) * length, y: w.start_point.y + Math.sign(dy) * length };
  if (w.appliances.some((a) => applianceEnd(a) > length)) return refuse('That would leave an appliance off the island. Move it first.');
  const runs = w.runs
    .filter((x) => x.offset < length)
    .map((x) => ({ ...x, depth, length: runEnd(x) >= oldLen || runEnd(x) > length ? length - x.offset : x.length }));
  return ok(withRoom(draft, env, `Made an island ${formatInches(length)} long and ${formatInches(depth)} deep`, replaceWall(r, { ...w, end_point: end, runs })));
}

const unmeasured = (value: Length) => ({ value, provenance: 'unmeasured' as const, source_mm: null });
const dedupe = (xs: string[]) => [...new Set(xs)];
function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
