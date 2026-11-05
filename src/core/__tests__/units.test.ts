import { describe, expect, it } from 'vitest';
import { formatInches, formatInchesApprox, fromInches, fromMillimetres, parseImperial, UNITS_PER_INCH } from '../units';

const value = (r: { ok: boolean; value?: unknown; reason?: string }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('base unit: 1/64 inch', () => {
  it('stores every increment the shop uses exactly', () => {
    expect(value(parseImperial('1/64'))).toBe(1);
    expect(value(parseImperial('1/32'))).toBe(2);
    expect(value(parseImperial('1/16'))).toBe(4);
    expect(value(parseImperial('1/8'))).toBe(8);
    expect(value(parseImperial('1/4'))).toBe(16);
    expect(value(parseImperial('1/2'))).toBe(32);
    expect(value(parseImperial('1'))).toBe(UNITS_PER_INCH);
    expect(value(parseImperial("1'"))).toBe(12 * 64);
  });

  it('reads feet, inches and fractions in the usual ways', () => {
    const tenTwoQuarter = (10 * 12 + 2) * 64 + 16;
    expect(value(parseImperial(`10' 2 1/4"`))).toBe(tenTwoQuarter);
    expect(value(parseImperial(`10'2-1/4"`))).toBe(tenTwoQuarter);
    expect(value(parseImperial('122 1/4 in'))).toBe(tenTwoQuarter);
    expect(value(parseImperial('122.25'))).toBe(tenTwoQuarter);
    expect(value(parseImperial('10 ft 2.25 in'))).toBe(tenTwoQuarter);
    expect(value(parseImperial('3/8"'))).toBe(24);
    expect(value(parseImperial('0'))).toBe(0);
  });

  it('refuses anything that is not on a 1/64 mark, with a reason', () => {
    for (const text of ['1/3', '1/128', '2.1', '10.001']) {
      const r = parseImperial(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/1\/64/);
    }
  });

  it('refuses text it cannot read', () => {
    for (const text of ['', 'abc', '2.5 1/4', '1/0', "10' abc", '-3']) {
      expect(parseImperial(text).ok).toBe(false);
    }
  });

  it('fromInches is exact or refused', () => {
    expect(value(fromInches(2, 1, 4))).toBe(144);
    expect(fromInches(2, 1, 3).ok).toBe(false);
    expect(fromInches(2.5).ok).toBe(false);
  });
});

describe('millimetres (DECISIONS U-2): rounded to the nearest 1/64, original kept', () => {
  it('converts whole and decimal millimetres', () => {
    // 25.4 mm is exactly 1 inch.
    expect(value(fromMillimetres('25.4'))).toEqual({ value: 64, source_mm: '25.4' });
    // 600 mm = 23.622" = 1511.81 → 1512.
    expect(value(fromMillimetres('600'))).toEqual({ value: 1512, source_mm: '600' });
    // 595.5 mm = 1500.47 → 1500.
    expect(value(fromMillimetres(' 595.5 '))).toEqual({ value: 1500, source_mm: '595.5' });
  });

  it('rounds an exact half away from zero', () => {
    // 0.1984375 mm is exactly 1/128 inch: half a unit.
    expect(value(fromMillimetres('0.1984375'))).toEqual({ value: 1, source_mm: '0.1984375' });
  });

  it('never moves a value by more than half a unit', () => {
    for (let mm = 0; mm <= 3000; mm += 7) {
      const r = fromMillimetres(String(mm));
      if (!r.ok) throw new Error(r.reason);
      expect(Math.abs(r.value.value - (mm * 64) / 25.4)).toBeLessThanOrEqual(0.5);
    }
  });

  it('refuses text it cannot read', () => {
    for (const text of ['', '-5', '5mm', '1,5', '.5']) expect(fromMillimetres(text).ok).toBe(false);
  });
});

describe('formatInches', () => {
  it('writes lengths the way people read them', () => {
    expect(formatInches((10 * 12 + 2) * 64 + 16)).toBe(`122 1/4"`);
    expect(formatInches((5 * 12 + 8) * 64 + 44)).toBe(`68 11/16"`); // the owner's example
    expect(formatInches(144)).toBe('2 1/4"');
    expect(formatInches(24)).toBe('3/8"');
    expect(formatInches(0)).toBe('0"');
    expect(formatInches(12 * 64)).toBe(`12"`);
    expect(formatInches(-96)).toBe('-1 1/2"');
    expect(formatInches(1)).toBe('1/64"');
  });

  it('rounds approximate lengths to the nearest 1/16"', () => {
    expect(formatInchesApprox(58 * 64 + 27)).toBe('about 58 7/16"'); // 27/64 → 28/64 = 7/16
    expect(formatInchesApprox(10 * 64 + 1)).toBe('about 10"');
  });

  it('round-trips with parseImperial', () => {
    for (let units = 0; units < 3000; units += 13) {
      expect(value(parseImperial(formatInches(units)))).toBe(units);
    }
  });
});
