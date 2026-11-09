import { describe, expect, it } from 'vitest';
import { evenSplit, splitGap } from '../model/engine/split';

const IN = 64;
const limits = { min: 12 * IN, max: 40 * IN + 16, step: 4 };
const aims = { idealMin: 24 * IN, idealMax: 32 * IN, oneCabinetUpTo: 38 * IN, bankWidth: 30 * IN };
const inches = (ws: number[] | null) => ws?.map((w) => w / IN);

describe('dividing a run into cabinets (CB-FACT-25, PREF-001 to PREF-004)', () => {
  it('follows the owner\'s own examples', () => {
    // PREF-004: "A 90" run is two 3/4" fillers and three 29 1/2" cabinets."
    expect(inches(splitGap(88.5 * IN, 'equal', limits, aims))).toEqual([29.5, 29.5, 29.5]);
    // PREF-004: "80" of cabinets is 32 + 32 + 16, not three of 26 5/8."
    expect(inches(splitGap(80 * IN, 'ideal_max_plus_one', limits, aims))).toEqual([32, 32, 16]);
    // PREF-025: up to 38", one cabinet beats two.
    expect(inches(splitGap(37 * IN, 'one_cabinet', limits, aims))).toEqual([37]);
    expect(splitGap(39 * IN, 'one_cabinet', limits, aims)).toBeNull();
  });

  it('gives the extra 1/16" steps to the ends first, so a run stays balanced', () => {
    expect(evenSplit(13 * 4, 3, 4)).toEqual([20, 16, 16]); // one extra step: the left end
    expect(evenSplit(14 * 4, 3, 4)).toEqual([20, 16, 20]); // two: both ends
    expect(evenSplit(91, 2, 4)).toBeNull(); // not on the step
  });

  it('makes as many 30" drawer banks as fit', () => {
    expect(inches(splitGap(90 * IN, 'drawer_banks', limits, aims))).toEqual([30, 30, 30]);
    expect(inches(splitGap(75 * IN, 'drawer_banks', limits, aims))).toEqual([30, 30, 15]);
  });

  it('never forces a width the catalog or the rules refuse', () => {
    expect(splitGap(10 * IN, 'equal', limits, aims)).toBeNull(); // under the 12" minimum
    expect(splitGap(80 * IN + 1, 'equal', limits, aims)).toBeNull(); // off the 1/16" step
    for (const s of ['equal', 'ideal_max_plus_one', 'even_wide_ends', 'drawer_banks'] as const)
      for (let total = 12 * IN; total <= 200 * IN; total += 4 * 13) {
        const r = splitGap(total, s, limits, aims);
        if (r) {
          expect(r.reduce((a, w) => a + w, 0)).toBe(total);
          expect(r.every((w) => w >= limits.min && w <= limits.max && w % 4 === 0)).toBe(true);
        }
      }
  });
});
