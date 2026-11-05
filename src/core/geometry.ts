/**
 * Generic plan geometry in room coordinates (base units, Y up; see angles.ts).
 * Comparisons are exact: they use squared lengths in BigInt, so they stay exact
 * even on slanted walls, whose true length is rarely a whole number of 1/64 inch.
 */
import { FULL_TURN, HALF_TURN, QUARTER_TURN, directionOf, normalizeAngle, snapAngle, type Angle } from './angles';
import { ok, refuse, type Result } from './result';
import { formatInches, isLength, type Length } from './units';

export interface Point {
  readonly x: Length;
  readonly y: Length;
}

const big = (n: number): bigint => BigInt(n);

export const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** Squared distance between two points, exact. */
export function distanceSquared(a: Point, b: Point): bigint {
  const dx = big(b.x) - big(a.x);
  const dy = big(b.y) - big(a.y);
  return dx * dx + dy * dy;
}

/** Integer square root (floor). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt of a negative number');
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}

/** Compares a length with the distance between two points: -1 shorter, 0 equal, 1 longer. Exact. */
export function compareToDistance(length: Length, a: Point, b: Point): -1 | 0 | 1 {
  const l = big(length);
  const lsq = l * l;
  const dsq = distanceSquared(a, b);
  if (l < 0n || lsq < dsq) return -1;
  return lsq === dsq ? 0 : 1;
}

/**
 * The distance between two points for people to read. `exact` is false when the
 * true distance falls between 1/64 inch marks (common on slanted walls).
 */
export function distanceForDisplay(a: Point, b: Point): { value: Length; exact: boolean } {
  const dsq = distanceSquared(a, b);
  const floor = isqrt(dsq);
  if (floor * floor === dsq) return { value: Number(floor), exact: true };
  // Nearest: compare against the midpoint (floor + 1/2)² = floor² + floor + 1/4.
  const nearest = 4n * dsq >= 4n * floor * floor + 4n * floor + 1n ? floor + 1n : floor;
  return { value: Number(nearest), exact: false };
}

export function describeDistance(a: Point, b: Point): string {
  const d = distanceForDisplay(a, b);
  return d.exact ? formatInches(d.value) : `about ${formatInches(d.value)}`;
}

/** Sign of the cross product (b - a) × (c - a): 1 left turn, -1 right turn, 0 in line. */
function orientation(a: Point, b: Point, c: Point): -1 | 0 | 1 {
  const v = (big(b.x) - big(a.x)) * (big(c.y) - big(a.y)) - (big(b.y) - big(a.y)) * (big(c.x) - big(a.x));
  return v > 0n ? 1 : v < 0n ? -1 : 0;
}

/**
 * Whether two segments cross. Allowed (not crossing): sharing a corner, and one
 * segment ending on the other (a stub wall butting into a wall). Crossing: the
 * insides cross each other, or they lie along the same line and overlap.
 */
export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && o2 === 0) {
    // Same line: overlapping by a positive length counts as crossing.
    const useX = a1.x !== a2.x;
    const key = (p: Point) => (useX ? p.x : p.y);
    const aMin = Math.min(key(a1), key(a2));
    const aMax = Math.max(key(a1), key(a2));
    const bMin = Math.min(key(b1), key(b2));
    const bMax = Math.max(key(b1), key(b2));
    return Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0;
  }
  return false;
}

/** Round half away from zero. */
const roundHalfAway = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

/**
 * The end point of a wall drawn from `start`, `length` long, in direction `angle`.
 *
 * Walls at 0°, 90°, 180° and 270° are exact. Any other direction rarely lands on
 * 1/64 inch marks, so the corner is rounded to the nearest 1/64 inch and the typed
 * length is returned as `entered_length` to be kept with the wall (owner decision,
 * 2026-11-05). Otherwise `entered_length` is null.
 */
export function pointFromLengthAndAngle(
  start: Point,
  length: Length,
  angle: Angle,
): Result<{ point: Point; entered_length: Length | null }> {
  if (!isLength(length) || length <= 0) return refuse('A wall needs a length greater than zero.');
  const a = normalizeAngle(angle);
  const exact: Record<number, [number, number]> = {
    0: [1, 0],
    [QUARTER_TURN]: [0, 1],
    [HALF_TURN]: [-1, 0],
    [HALF_TURN + QUARTER_TURN]: [0, -1],
  };
  const unit = exact[a];
  if (unit) {
    return ok({ point: { x: start.x + unit[0] * length, y: start.y + unit[1] * length }, entered_length: null });
  }
  const radians = ((a / 100) * Math.PI) / 180;
  const point = {
    x: start.x + roundHalfAway(length * Math.cos(radians)),
    y: start.y + roundHalfAway(length * Math.sin(radians)),
  };
  if (!isLength(point.x) || !isLength(point.y)) return refuse('That wall is too long to store.');
  return ok({ point, entered_length: length });
}

/**
 * Snaps a point to the nearest candidate within `tolerance` (a UI setting passed
 * in). Ties go to the earlier candidate, so the result is always the same.
 */
export function snapToPoints(
  point: Point,
  candidates: readonly Point[],
  tolerance: Length,
): { point: Point; snapped: boolean; index: number | null } {
  const limit = big(tolerance) * big(tolerance);
  let best: { index: number; d: bigint } | null = null;
  candidates.forEach((c, index) => {
    const d = distanceSquared(point, c);
    if (d <= limit && (best === null || d < best.d)) best = { index, d };
  });
  if (best === null) return { point, snapped: false, index: null };
  const { index } = best as { index: number; d: bigint };
  return { point: candidates[index] as Point, snapped: true, index };
}

/** Snaps each coordinate to the nearest multiple of `grid` (a UI setting passed in). */
export function snapToGrid(point: Point, grid: Length): Result<Point> {
  if (!isLength(grid) || grid <= 0) return refuse('The grid size must be greater than zero.');
  const snap = (v: number) => roundHalfAway(v / grid) * grid;
  return ok({ x: snap(point.x), y: snap(point.y) });
}

/**
 * Snaps the far end of a wall being drawn to the nearest allowed direction
 * (for example every 45°), keeping roughly the drawn length. For pointer drawing
 * only; a typed length goes through pointFromLengthAndAngle directly.
 */
export function snapEndToAngle(start: Point, end: Point, step: Angle): Result<{ point: Point; angle: Angle }> {
  const drawn = distanceForDisplay(start, end).value;
  if (drawn === 0) return ok({ point: end, angle: 0 });
  const dir = snapAngle(directionOf(end.x - start.x, end.y - start.y), step);
  if (!dir.ok) return dir;
  const placed = pointFromLengthAndAngle(start, drawn, dir.value % FULL_TURN);
  if (!placed.ok) return placed;
  return ok({ point: placed.value.point, angle: dir.value });
}
