/**
 * Walls are lettered A, B, C … in the order they were drawn, as kitchen drawings and
 * measuring guides do ("Wall A", "Wall B"; research 2026-11-05). After Z: AA, AB, …
 */
export function wallLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
