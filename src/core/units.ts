/**
 * The base unit (DECISIONS U-1): every length is a whole number of 1/64 inch.
 * Conversions refuse anything that isn't exact, with one exception (U-2):
 * millimetre input is rounded to the nearest 1/64 inch and the original kept.
 */
import { ok, refuse, type Result } from './result';

/** A length: a whole number of 1/64 inch. May be negative only as a coordinate. */
export type Length = number;

/** 1/64 inch per inch. The definition of the base unit, not a business value. */
export const UNITS_PER_INCH = 64;
const INCHES_PER_FOOT = 12;

export const isLength = (value: unknown): value is Length => typeof value === 'number' && Number.isSafeInteger(value);

/** num/den inches → base units, only if exact. */
function inchesFractionToUnits(num: bigint, den: bigint, original: string): Result<Length> {
  if (den === 0n) return refuse(`"${original}" divides by zero.`);
  const scaled = num * BigInt(UNITS_PER_INCH);
  if (scaled % den !== 0n) {
    return refuse(`"${original}" isn't on a 1/64 inch mark. Lengths must be exact to 1/64 inch.`);
  }
  return toSafeLength(scaled / den, original);
}

function toSafeLength(units: bigint, original: string): Result<Length> {
  const value = Number(units);
  if (!Number.isSafeInteger(value)) return refuse(`"${original}" is too large to store.`);
  return ok(value);
}

/** "12.25" → 1225/100, exactly. */
function parseDecimal(text: string): { num: bigint; den: bigint } {
  const [whole, frac = ''] = text.split('.');
  return { num: BigInt(`${whole}${frac}`), den: 10n ** BigInt(frac.length) };
}

const FEET = /^(\d+)\s*(?:'|ft\b|feet\b|foot\b)\s*/i;
const INCH_MARK = /\s*(?:"|''|in\b|inch\b|inches\b)\s*$/i;
const WHOLE_AND_FRACTION = /^(\d+(?:\.\d+)?)(?:(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+))?$/;
const FRACTION_ONLY = /^(\d+)\s*\/\s*(\d+)$/;

/**
 * Parses a length typed in feet and inches: `10'`, `10' 2"`, `10' 2 1/4"`, `2-1/4"`,
 * `122.25`, `3/8`. Plain numbers are inches. Refuses anything not exact to 1/64 inch.
 */
export function parseImperial(text: string): Result<Length> {
  const original = text;
  let rest = text.trim();
  if (rest === '') return refuse('No length was entered.');

  let feet = 0n;
  const feetMatch = FEET.exec(rest);
  if (feetMatch) {
    feet = BigInt(feetMatch[1] as string);
    rest = rest.slice(feetMatch[0].length);
  }
  rest = rest.replace(INCH_MARK, '').trim();

  let num = 0n;
  let den = 1n;
  if (rest !== '') {
    const both = WHOLE_AND_FRACTION.exec(rest);
    const fracOnly = FRACTION_ONLY.exec(rest);
    if (both) {
      const whole = parseDecimal(both[1] as string);
      num = whole.num;
      den = whole.den;
      if (both[2] !== undefined && both[3] !== undefined) {
        if (whole.den !== 1n) return refuse(`"${original}" mixes a decimal and a fraction. Use one or the other.`);
        const fNum = BigInt(both[2]);
        const fDen = BigInt(both[3]);
        if (fDen === 0n) return refuse(`"${original}" divides by zero.`);
        num = num * fDen + fNum;
        den = fDen;
      }
    } else if (fracOnly) {
      num = BigInt(fracOnly[1] as string);
      den = BigInt(fracOnly[2] as string);
    } else {
      return refuse(`"${original}" isn't a length this can read. Try 10' 2 1/4" or 122.25.`);
    }
  } else if (!feetMatch) {
    return refuse(`"${original}" isn't a length this can read. Try 10' 2 1/4" or 122.25.`);
  }

  const totalNum = feet * BigInt(INCHES_PER_FOOT) * den + num;
  return inchesFractionToUnits(totalNum, den, original);
}

/** Whole inches plus an optional fraction (`inches(2, 1, 4)` is 2 1/4"). Refuses if not exact. */
export function fromInches(whole: number, numerator = 0, denominator = 1): Result<Length> {
  const original = numerator === 0 ? `${whole}"` : `${whole} ${numerator}/${denominator}"`;
  if (![whole, numerator, denominator].every(Number.isSafeInteger)) {
    return refuse(`"${original}" must be written with whole numbers.`);
  }
  const d = BigInt(denominator);
  return inchesFractionToUnits(BigInt(whole) * d + BigInt(numerator), d, original);
}

const DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * Millimetres → base units (DECISIONS U-2): rounded to the nearest 1/64 inch,
 * ties away from zero. The original text is returned as `source_mm` so it is kept.
 * 1 inch = 25.4 mm exactly, so units = mm × 64 / 25.4 = mm × 320 / 127.
 */
export function fromMillimetres(text: string): Result<{ value: Length; source_mm: string }> {
  const source = text.trim();
  if (!DECIMAL.test(source)) return refuse(`"${text}" isn't a millimetre value this can read. Try 595 or 595.5.`);
  const { num, den } = parseDecimal(source);
  const n = num * 320n;
  const d = den * 127n;
  // Round half away from zero (values here are never negative).
  const units = (2n * n + d) / (2n * d);
  const value = toSafeLength(units, source);
  if (!value.ok) return value;
  return ok({ value: value.value, source_mm: source });
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * A length for people to read, in inches and fractions of an inch only (owner, 2026-11-05):
 * `68 11/16"`, `2 1/4"`, `3/8"`, `-1 1/2"`. Exact. Feet are never shown, but parseImperial
 * still accepts them as input.
 */
export function formatInches(length: Length): string {
  const sign = length < 0 ? '-' : '';
  const rem = Math.abs(length);
  const wholeInches = Math.floor(rem / UNITS_PER_INCH);
  const sixtyFourths = rem - wholeInches * UNITS_PER_INCH;
  let fraction = '';
  if (sixtyFourths !== 0) {
    const g = gcd(sixtyFourths, UNITS_PER_INCH);
    fraction = `${sixtyFourths / g}/${UNITS_PER_INCH / g}`;
  }
  const inchPart =
    wholeInches === 0 && fraction !== '' ? `${fraction}"` : fraction === '' ? `${wholeInches}"` : `${wholeInches} ${fraction}"`;
  return `${sign}${inchPart}`;
}

/**
 * A length that is only approximate (for example a slanted wall's true length), rounded to
 * the nearest 1/16" so it reads easily: `about 58 7/16"`. Display only, never stored.
 */
export function formatInchesApprox(length: Length): string {
  const sixteenth = UNITS_PER_INCH / 16;
  return `about ${formatInches(Math.round(length / sixteenth) * sixteenth)}`;
}
