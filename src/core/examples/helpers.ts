// Helpers for writing readable example rooms (used by tests and the preview app).
import { fromInches, type Length } from '../units';
import type { Measured, Provenance } from '../schema/master-copy';

/** Inches (with an optional fraction) → base units. Throws if not exact: a mistake in the example itself. */
export function inch(whole: number, numerator = 0, denominator = 1): Length {
  const r = fromInches(whole, numerator, denominator);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

export const ft = (feet: number, inches = 0): Length => inch(feet * 12 + inches);

export const measured = (value: Length, provenance: Provenance = 'confirmed'): Measured => ({
  value,
  provenance,
  source_mm: null,
});

/** A readable, valid UUID: id(1) → 00000000-0000-4000-8000-000000000001. */
export const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
