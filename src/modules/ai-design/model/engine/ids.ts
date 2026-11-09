/**
 * IDs for placed cabinets that are the same every time for the same input (P5: same input, same
 * output), worked out from where the cabinet is, not drawn at random. Shaped like a version-4 UUID.
 */
import { sha256Hex } from '../sha256';

export function stableId(seed: string): string {
  const h = sha256Hex(seed);
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
