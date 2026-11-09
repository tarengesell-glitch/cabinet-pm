/**
 * Dividing a stretch of a run into cabinet widths (CB-FACT-25, PREF-001 to PREF-004, PREF-025).
 * Pure arithmetic in 1/64". Each strategy is one way the owner's rules read; the builder tries
 * them all and the scorecard says what each gets right and wrong. A strategy that can't divide
 * the stretch within the widths allowed returns null; nothing is forced.
 */
import type { Length } from '@/core/index';

export type SplitStrategy = 'equal' | 'ideal_max_plus_one' | 'even_wide_ends' | 'drawer_banks' | 'one_cabinet';
export const SPLIT_STRATEGIES: readonly SplitStrategy[] = ['equal', 'ideal_max_plus_one', 'even_wide_ends', 'drawer_banks', 'one_cabinet'];

export interface WidthLimits {
  readonly min: Length;
  readonly max: Length;
  readonly step: Length;
}

export interface SplitAims {
  readonly idealMin: Length;
  readonly idealMax: Length;
  readonly oneCabinetUpTo: Length;
  /** The one width drawer banks are made in today (null: none). */
  readonly bankWidth: Length | null;
}

/**
 * `n` widths that add up to `total`, all on the step, as equal as possible. The extra steps go to
 * the ends first, alternating left and right (PREF-004: wider ones at both ends).
 */
export function evenSplit(total: Length, n: number, step: Length): Length[] | null {
  if (n < 1 || total % step !== 0) return null;
  const steps = total / step;
  const base = Math.floor(steps / n);
  let extra = steps - base * n;
  const out = Array.from({ length: n }, () => base * step);
  for (let k = 0; extra > 0; k++) {
    const i = k % 2 === 0 ? Math.floor(k / 2) : n - 1 - Math.floor(k / 2);
    out[i]! += step;
    extra--;
  }
  return out;
}

const fits = (ws: readonly Length[] | null, l: WidthLimits): ws is Length[] => ws !== null && ws.length > 0 && ws.every((w) => w >= l.min && w <= l.max && w % l.step === 0);

/** Divides `total` with one strategy, or null when it can't within the limits. */
export function splitGap(total: Length, strategy: SplitStrategy, limits: WidthLimits, aims: SplitAims): Length[] | null {
  if (total <= 0 || total % limits.step !== 0) return null;
  let out: Length[] | null = null;
  switch (strategy) {
    case 'one_cabinet':
      out = total <= aims.oneCabinetUpTo ? [total] : null;
      break;
    case 'equal': {
      // The fewest equal cabinets that are no wider than the ideal (PREF-004: "equal cabinets if they land in 24–32").
      const n = Math.max(1, Math.ceil(total / aims.idealMax));
      out = evenSplit(total, n, limits.step);
      break;
    }
    case 'even_wide_ends': {
      // The number of cabinets closest to the middle of the ideal range.
      const mid = (aims.idealMin + aims.idealMax) / 2;
      out = evenSplit(total, Math.max(1, Math.round(total / mid)), limits.step);
      break;
    }
    case 'ideal_max_plus_one': {
      // Full ideal-width cabinets, then one more for what is left, at the right end (PREF-004).
      const k = Math.floor(total / aims.idealMax);
      const rest = total - k * aims.idealMax;
      if (rest === 0) out = Array.from({ length: k }, () => aims.idealMax);
      else if (rest >= limits.min) out = [...Array.from({ length: k }, () => aims.idealMax), rest];
      else if (k >= 1) {
        // Too little left for a cabinet: the last full one and the rest share evenly.
        const pair = evenSplit(aims.idealMax + rest, 2, limits.step);
        out = pair ? [...Array.from({ length: k - 1 }, () => aims.idealMax), ...pair] : null;
      }
      break;
    }
    case 'drawer_banks': {
      // As many cabinets of the drawer-bank width as fit, the rest shared at the ends.
      const b = aims.bankWidth;
      if (b === null || b > total) break;
      const k = Math.floor(total / b);
      const rest = total - k * b;
      if (rest === 0) out = Array.from({ length: k }, () => b);
      else if (rest >= limits.min) out = [...Array.from({ length: k }, () => b), rest];
      else if (k >= 2) {
        const pair = evenSplit(b + rest, 2, limits.step);
        out = pair ? [pair[0]!, ...Array.from({ length: k - 1 }, () => b), pair[1]!] : null;
      }
      break;
    }
  }
  return fits(out, limits) && out.reduce((a, w) => a + w, 0) === total ? out : null;
}
