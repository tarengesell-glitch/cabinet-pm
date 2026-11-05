import { describe, expect, it } from 'vitest';
import { angleFromDegrees, cornerAngle, directionOf, formatDegrees, normalizeAngle, snapAngle, snapDirection } from '../angles';

const value = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('angle convention (DECISIONS A-1)', () => {
  it('stores hundredths of a degree, normalized to one turn', () => {
    expect(value(angleFromDegrees('22.5'))).toBe(2250);
    expect(value(angleFromDegrees('90°'))).toBe(9000);
    expect(value(angleFromDegrees('-90'))).toBe(27000);
    expect(value(angleFromDegrees('360'))).toBe(0);
    expect(value(angleFromDegrees('450.25'))).toBe(9025);
    expect(normalizeAngle(-36000)).toBe(0);
    expect(Object.is(normalizeAngle(-36000), -0)).toBe(false);
  });

  it('refuses anything finer than 0.01°', () => {
    expect(angleFromDegrees('22.505').ok).toBe(false);
    expect(angleFromDegrees('abc').ok).toBe(false);
  });

  it('measures counter-clockwise from +X with Y up', () => {
    expect(directionOf(1, 0)).toBe(0);
    expect(directionOf(0, 1)).toBe(9000);
    expect(directionOf(-1, 0)).toBe(18000);
    expect(directionOf(0, -1)).toBe(27000);
    expect(directionOf(1, 1)).toBe(4500);
  });

  it('snaps to the nearest step', () => {
    expect(value(snapDirection(100, 3, 4500))).toBe(0);
    expect(value(snapDirection(100, 90, 4500))).toBe(4500);
    expect(value(snapDirection(-3, -100, 9000))).toBe(27000);
    expect(value(snapAngle(35990, 4500))).toBe(0);
    expect(snapAngle(100, 7000).ok).toBe(false);
  });

  it('gives corner angles for a room drawn counter-clockwise', () => {
    expect(cornerAngle(0, 9000)).toBe(9000); // left turn: 90° corner
    expect(cornerAngle(0, 27000)).toBe(27000); // right turn: 270° outside corner
    expect(cornerAngle(9000, 13500)).toBe(13500); // 45° left turn: 135° corner
  });

  it('formats for people', () => {
    expect(formatDegrees(2250)).toBe('22.5°');
    expect(formatDegrees(9000)).toBe('90°');
    expect(formatDegrees(1205)).toBe('12.05°');
  });
});
