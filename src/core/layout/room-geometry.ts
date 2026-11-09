/**
 * Where cabinets can go along a room's walls: the shared room geometry the room drawing and the
 * AI designer both use, so they always agree on spans and corners (BUILD_PLAN 6, step 2; moved
 * from the designer, 2026-11-09, unchanged).
 *
 * Positions along a wall are measured from its start corner, on the wall's centre line, in 1/64".
 * A run on a room wall stands against the wall's inside face and reaches no further than the
 * inside corners; a run on a floating wall (an island or peninsula) is centred on its line.
 *
 * Pure: no data files. The few numbers some functions need (the clearance kept from doors, the
 * upper band's depth, the shortest run) are business values owned by the caller's data (rule 6)
 * and are passed in.
 */
import { compareToDistance, distanceForDisplay, roomInsideSide, samePoint, type Point } from '../geometry';
import type { AppliancePlacement, Room, Run, RunKind, Wall } from '../schema/master-copy';
import type { Length } from '../units';

/** A stretch along a wall. */
export interface Span {
  readonly start: Length;
  readonly end: Length;
}

export const hasBase = (k: RunKind): boolean => k !== 'upper';
export const hasUpper = (k: RunKind): boolean => k !== 'base';
export const runEnd = (r: Run): Length => r.offset + r.length;
export const applianceEnd = (a: AppliancePlacement): Length => a.offset + a.width.value;
const runSpan = (r: Run): Span => ({ start: r.offset, end: runEnd(r) });
const applianceSpan = (a: AppliancePlacement): Span => ({ start: a.offset, end: applianceEnd(a) });

/** A wall's usable length: the stored corners' distance, rounded down so anything ending there fits. */
export function wallLength(w: Wall): Length {
  const d = distanceForDisplay(w.start_point, w.end_point).value;
  return compareToDistance(d, w.start_point, w.end_point) > 0 ? d - 1 : d;
}

/** What is left of `span` after cutting out `cuts` (anything that only touches stays). */
export function subtract(span: Span, cuts: readonly Span[]): Span[] {
  let pieces: Span[] = [span];
  for (const c of cuts) {
    pieces = pieces.flatMap((p) =>
      c.end <= p.start || c.start >= p.end
        ? [p]
        : [
            { start: p.start, end: c.start },
            { start: c.end, end: p.end },
          ].filter((q) => q.end > q.start),
    );
  }
  return pieces;
}

/** Doors and passthroughs, widened by `clearance` (and kept within the wall): nothing goes there. */
export function doorwayZones(w: Wall, clearance: Length): Span[] {
  const len = wallLength(w);
  return w.openings
    .filter((o) => o.kind !== 'window')
    .map((o) => ({ start: Math.max(0, o.offset.value - clearance), end: Math.min(len, o.offset.value + o.width.value + clearance) }));
}

/** Windows, widened by `clearance` (and kept within the wall): pantry stays out of these. */
export function windowZones(w: Wall, clearance: Length): Span[] {
  const len = wallLength(w);
  return w.openings
    .filter((o) => o.kind === 'window')
    .map((o) => ({ start: Math.max(0, o.offset.value - clearance), end: Math.min(len, o.offset.value + o.width.value + clearance) }));
}

/** Windows exactly as drawn. */
export const windowSpans = (w: Wall): Span[] =>
  w.openings.filter((o) => o.kind === 'window').map((o) => ({ start: o.offset.value, end: o.offset.value + o.width.value }));

/** The room walls that end where this one starts (before) and start where it ends (after). */
export function neighbours(r: Room, w: Wall): { before: Wall | null; after: Wall | null } {
  if (w.kind === 'floating') return { before: null, after: null };
  const others = r.walls.filter((o) => o !== w && o.kind === 'room');
  return {
    before: others.find((o) => samePoint(o.end_point, w.start_point)) ?? null,
    after: others.find((o) => samePoint(o.start_point, w.end_point)) ?? null,
  };
}

/** True when two walls meet square (at 90°), compared exactly. */
export function meetSquare(a: Wall, b: Wall): boolean {
  const ax = a.end_point.x - a.start_point.x;
  const ay = a.end_point.y - a.start_point.y;
  const bx = b.end_point.x - b.start_point.x;
  const by = b.end_point.y - b.start_point.y;
  return ax * bx + ay * by === 0;
}

/** A unit vector, in room coordinates (Y up). */
export interface Dir {
  readonly x: number;
  readonly y: number;
}

/** Along the wall, start to end. */
export function direction(w: Wall): Dir {
  const dx = w.end_point.x - w.start_point.x;
  const dy = w.end_point.y - w.start_point.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Square to the wall, pointing into the room (for a floating wall, to its left). */
export function insideNormal(r: Room, w: Wall): Dir {
  const u = direction(w);
  return w.kind === 'room' && roomInsideSide(r.walls) === 'right' ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
}

/** Half a room wall's thickness: its inside face is this far from its centre line. */
export const halfThickness = (w: Wall): number => (w.kind === 'room' ? (w.thickness?.value ?? 0) / 2 : 0);

/** How far along `w` its inside face meets the inside face of `o` (which shares a corner with it). */
function insideCornerOffset(r: Room, w: Wall, o: Wall): number | null {
  const u = direction(w);
  const v = direction(o);
  const n = insideNormal(r, w);
  const m = insideNormal(r, o);
  const hw = halfThickness(w);
  const ho = halfThickness(o);
  // w.start + n·hw + u·t = o.start + m·ho + v·s, solved for t.
  const dx = o.start_point.x + m.x * ho - (w.start_point.x + n.x * hw);
  const dy = o.start_point.y + m.y * ho - (w.start_point.y + n.y * hw);
  const det = -u.x * v.y + u.y * v.x;
  if (Math.abs(det) < 1e-9) return null;
  return (dx * -v.y - dy * -v.x) / det;
}

/**
 * The stretch of a wall that cabinets can stand along: between the inside corners where its
 * inside face meets the walls before and after it. A floating wall's whole length.
 */
export function insideSpan(r: Room, w: Wall): Span {
  const len = wallLength(w);
  if (w.kind === 'floating') return { start: 0, end: len };
  const { before, after } = neighbours(r, w);
  const a = before ? insideCornerOffset(r, w, before) : null;
  const b = after ? insideCornerOffset(r, w, after) : null;
  const start = a === null ? 0 : Math.max(0, Math.min(len, Math.round(a)));
  const end = b === null ? len : Math.max(start, Math.min(len, Math.round(b)));
  return { start, end };
}

/** The run that reaches the wall's first inside corner, if any. */
export const runAtStart = (r: Room, w: Wall): Run | null => w.runs.find((x) => x.offset <= insideSpan(r, w).start) ?? null;
/** The run that reaches the wall's last inside corner, if any. */
export const runAtEnd = (r: Room, w: Wall): Run | null => w.runs.find((x) => runEnd(x) >= insideSpan(r, w).end) ?? null;

/** How deep the uppers on a run are: the whole depth for upper-only, else `upperBand` (or the run's depth if less). */
export const upperDepth = (r: Run, upperBand: Length): Length => (r.kind === 'upper' ? r.depth : Math.min(upperBand, r.depth));

/**
 * Where the uppers on a base + upper run go (a room wall only): along the run, skipping windows
 * and the stretch over any appliance in `ownUpperKinds` (a fridge gets its own deeper upper).
 * A piece left shorter than `minRun` is not made (owner, 2026-11-07). Other runs have no upper
 * band: an upper-only run is uppers end to end, the rest have none.
 */
export function upperPieces(w: Wall, run: Run, opts: { readonly minRun: Length; readonly ownUpperKinds: ReadonlySet<string> }): Span[] {
  if (w.kind !== 'room' || (run.kind !== 'base_upper' && run.kind !== 'base_upper_pantry')) return [];
  const own = w.appliances.filter((a) => opts.ownUpperKinds.has(a.kind)).map(applianceSpan);
  return subtract(runSpan(run), [...windowSpans(w), ...own]).filter((p) => p.end - p.start >= opts.minRun);
}

/** A corner where runs on two walls meet. Worked out, not stored (DECISIONS 2026-11-06). */
export interface CornerCabinet {
  /** The wall whose end is the corner, and the wall that starts there. */
  readonly endingWallId: string;
  readonly startingWallId: string;
  /** The inside corner, in room coordinates (rounded to 1/64"). */
  readonly corner: Point;
  readonly base: boolean;
  readonly upper: boolean;
  /** Depths of the overlap square for the bases (if any) and for the uppers (if any). */
  readonly baseDepths: { readonly ending: Length; readonly starting: Length } | null;
  readonly upperDepths: { readonly ending: Length; readonly starting: Length } | null;
}

/** The inside corner at the end of a room wall. */
function insideCorner(r: Room, w: Wall): Point {
  const u = direction(w);
  const n = insideNormal(r, w);
  const t = insideSpan(r, w).end;
  const h = halfThickness(w);
  return { x: Math.round(w.start_point.x + u.x * t + n.x * h), y: Math.round(w.start_point.y + u.y * t + n.y * h) };
}

/** Every corner where runs on two walls meet: base where both have bases, upper where both have uppers. */
export function cornerCabinets(r: Room, upperBand: Length): CornerCabinet[] {
  const out: CornerCabinet[] = [];
  for (const w of r.walls) {
    const { after } = neighbours(r, w);
    if (!after) continue;
    const a = runAtEnd(r, w);
    const b = runAtStart(r, after);
    if (!a || !b) continue;
    const base = hasBase(a.kind) && hasBase(b.kind);
    const upper = hasUpper(a.kind) && hasUpper(b.kind);
    if (!base && !upper) continue;
    out.push({
      endingWallId: w.wall_id,
      startingWallId: after.wall_id,
      corner: insideCorner(r, w),
      base,
      upper,
      baseDepths: base ? { ending: a.depth, starting: b.depth } : null,
      upperDepths: upper ? { ending: upperDepth(a, upperBand), starting: upperDepth(b, upperBand) } : null,
    });
  }
  return out;
}
