import { describe, expect, it } from 'vitest';
import {
  compareToDistance,
  distanceForDisplay,
  isqrt,
  pointFromLengthAndAngle,
  segmentsCross,
  snapEndToAngle,
  snapToGrid,
  snapToPoints,
} from '../geometry';

const value = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const p = (x: number, y: number) => ({ x, y });

describe('exact distances', () => {
  it('integer square root', () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(99n)).toBe(9n);
    expect(isqrt(100n)).toBe(10n);
    expect(isqrt(10n ** 30n)).toBe(10n ** 15n);
  });

  it('compares a length with a distance exactly, even on a slant', () => {
    expect(compareToDistance(5, p(0, 0), p(3, 4))).toBe(0);
    expect(compareToDistance(4, p(0, 0), p(3, 4))).toBe(-1);
    expect(compareToDistance(6, p(0, 0), p(3, 4))).toBe(1);
    // A 1 x 1 diagonal is 1.414…: 1 fits, 2 does not.
    expect(compareToDistance(1, p(0, 0), p(1, 1))).toBe(-1);
    expect(compareToDistance(2, p(0, 0), p(1, 1))).toBe(1);
  });

  it('says when a displayed distance is approximate', () => {
    expect(distanceForDisplay(p(0, 0), p(3, 4))).toEqual({ value: 5, exact: true });
    expect(distanceForDisplay(p(0, 0), p(1, 1))).toEqual({ value: 1, exact: false });
    expect(distanceForDisplay(p(0, 0), p(2, 2))).toEqual({ value: 3, exact: false }); // 2.83
  });
});

describe('walls drawn from a length and an angle', () => {
  it('is exact at 0°, 90°, 180° and 270°', () => {
    expect(value(pointFromLengthAndAngle(p(10, 10), 640, 0))).toEqual({ point: p(650, 10), entered_length: null });
    expect(value(pointFromLengthAndAngle(p(10, 10), 640, 9000))).toEqual({ point: p(10, 650), entered_length: null });
    expect(value(pointFromLengthAndAngle(p(10, 10), 640, 18000))).toEqual({ point: p(-630, 10), entered_length: null });
    expect(value(pointFromLengthAndAngle(p(10, 10), 640, 27000))).toEqual({ point: p(10, -630), entered_length: null });
  });

  it('rounds slanted corners to the nearest 1/64 and keeps the typed length', () => {
    // 120" at 45°: 7680 units → 5430.58… each way.
    const r = value(pointFromLengthAndAngle(p(0, 0), 7680, 4500));
    expect(r).toEqual({ point: p(5431, 5431), entered_length: 7680 });
    // The stored wall is within 1/64" of what was typed.
    const actual = distanceForDisplay(p(0, 0), r.point);
    expect(Math.abs(actual.value - 7680)).toBeLessThanOrEqual(1);
  });

  it('refuses a wall with no length', () => {
    expect(pointFromLengthAndAngle(p(0, 0), 0, 0).ok).toBe(false);
    expect(pointFromLengthAndAngle(p(0, 0), -5, 0).ok).toBe(false);
  });
});

describe('crossing walls', () => {
  it('finds walls whose insides cross', () => {
    expect(segmentsCross(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
  });
  it('allows a shared corner and a stub wall butting into another', () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(10, 0), p(10, 10))).toBe(false);
    expect(segmentsCross(p(0, 0), p(10, 0), p(5, 0), p(5, 10))).toBe(false);
  });
  it('finds walls that run along each other', () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(5, 0), p(15, 0))).toBe(true);
    expect(segmentsCross(p(0, 0), p(0, 10), p(0, 5), p(0, 15))).toBe(true);
    expect(segmentsCross(p(0, 0), p(10, 0), p(10, 0), p(20, 0))).toBe(false);
  });
  it('ignores walls that miss each other', () => {
    expect(segmentsCross(p(0, 0), p(10, 0), p(0, 5), p(10, 5))).toBe(false);
  });
});

describe('snapping for the drawing screen', () => {
  it('snaps to the nearest corner within the tolerance, first one on a tie', () => {
    const corners = [p(100, 0), p(0, 100), p(100, 100)];
    expect(snapToPoints(p(98, 3), corners, 5)).toEqual({ point: p(100, 0), snapped: true, index: 0 });
    expect(snapToPoints(p(50, 50), corners, 5)).toEqual({ point: p(50, 50), snapped: false, index: null });
    expect(snapToPoints(p(50, 50), [p(53, 50), p(47, 50)], 5).index).toBe(0);
  });
  it('snaps to a grid', () => {
    expect(value(snapToGrid(p(70, -70), 64))).toEqual(p(64, -64));
    expect(value(snapToGrid(p(96, -96), 64))).toEqual(p(128, -128));
    expect(snapToGrid(p(1, 1), 0).ok).toBe(false);
  });
  it('snaps a drawn wall to the nearest 45°', () => {
    expect(value(snapEndToAngle(p(0, 0), p(640, 30), 4500))).toEqual({ point: p(641, 0), angle: 0 });
    expect(value(snapEndToAngle(p(0, 0), p(10, 640), 4500)).angle).toBe(9000);
    expect(value(snapEndToAngle(p(0, 0), p(600, 560), 4500)).angle).toBe(4500);
  });
});
