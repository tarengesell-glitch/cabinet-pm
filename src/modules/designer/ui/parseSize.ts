import { fromMillimetres, parseImperial, type Result } from '@/core/index';
import type { TypedSize } from '../model/editor';

const MM = /^\s*(.+?)\s*mm\s*$/i;

/** Reads what the person typed: feet and inches (exact), or a number followed by "mm" (rounded, U-2). */
export function parseSize(text: string): Result<TypedSize> {
  const mm = MM.exec(text);
  if (mm) {
    const r = fromMillimetres(mm[1] as string);
    return r.ok ? { ok: true, value: r.value } : r;
  }
  const r = parseImperial(text);
  return r.ok ? { ok: true, value: { value: r.value, source_mm: null } } : r;
}
