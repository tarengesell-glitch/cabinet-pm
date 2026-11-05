import { formatInches, type Length } from '@/core/index';

/** 1/16 inch in base units (1/64"). Approximate lengths are shown to the nearest 1/16" so they read easily. */
const SIXTEENTH = 4;

/**
 * A distance for the plan and panels, in inches (owner, 2026-11-05): exact as `68 11/16"`,
 * or `≈ 58 7/16"` when the true value falls between 1/64" marks (slanted walls).
 */
export function lengthText(d: { value: Length; exact: boolean }): string {
  return d.exact ? formatInches(d.value) : `≈ ${formatInches(Math.round(d.value / SIXTEENTH) * SIXTEENTH)}`;
}
