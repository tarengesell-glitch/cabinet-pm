/**
 * The angle convention (DECISIONS A-1).
 * - Angles are whole numbers of hundredths of a degree (22.5° is 2250).
 * - 0 points along the room's +X axis; angles grow counter-clockwise.
 * - Room coordinates have Y pointing up (as on paper), so 90° (9000) points up the plan.
 * - Stored angles are normalized to 0 … 35999.
 */
import { ok, refuse, type Result } from './result';

export type Angle = number;

/** Hundredths of a degree per full turn. The definition of the convention. */
export const FULL_TURN: Angle = 36000;
export const HALF_TURN: Angle = 18000;
export const QUARTER_TURN: Angle = 9000;

export function normalizeAngle(angle: Angle): Angle {
  const n = ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return n === 0 ? 0 : n; // avoid -0
}

const DEGREES = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** "22.5" → 2250. Refuses anything finer than 0.01°. */
export function angleFromDegrees(text: string): Result<Angle> {
  const t = text.trim().replace(/°$/, '');
  const m = DEGREES.exec(t);
  if (!m) {
    return refuse(`"${text}" isn't an angle this can read. Angles are in degrees, to at most 0.01° (for example 22.5).`);
  }
  const hundredths = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(hundredths)) return refuse(`"${text}" is too large.`);
  return ok(normalizeAngle(m[1] === '-' ? -hundredths : hundredths));
}

/** 2250 → "22.5°". */
export function formatDegrees(angle: Angle): string {
  const whole = Math.trunc(angle / 100);
  const frac = Math.abs(angle % 100);
  const fracText = frac === 0 ? '' : `.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
  return `${whole}${fracText}°`;
}

/**
 * The direction from one point to another, to the nearest 0.01°.
 * Approximate (uses trigonometry): for display and snapping, never for stored values.
 */
export function directionOf(dx: number, dy: number): Angle {
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  return normalizeAngle(Math.round(degrees * 100));
}

/** Snaps a direction to the nearest multiple of `step` (for example 4500 for 45°). */
export function snapAngle(angle: Angle, step: Angle): Result<Angle> {
  if (!Number.isSafeInteger(step) || step <= 0 || FULL_TURN % step !== 0) {
    return refuse(`A snap step of ${formatDegrees(step)} doesn't divide a full turn evenly.`);
  }
  return ok(normalizeAngle(Math.round(angle / step) * step));
}

/** The direction from (0,0) to (dx,dy), snapped to the nearest multiple of `step`. */
export function snapDirection(dx: number, dy: number, step: Angle): Result<Angle> {
  return snapAngle(directionOf(dx, dy), step);
}

/** How far you turn going from direction `from` to direction `to`, counter-clockwise. */
export function turnAngle(from: Angle, to: Angle): Angle {
  return normalizeAngle(to - from);
}

/**
 * The angle inside the corner where one wall ends and the next begins, for a room
 * drawn counter-clockwise: a left turn of 90° is a 90° corner, a right turn makes a
 * 270° (outside) corner. For display only.
 */
export function cornerAngle(directionIn: Angle, directionOut: Angle): Angle {
  return normalizeAngle(HALF_TURN - turnAngle(directionIn, directionOut));
}
