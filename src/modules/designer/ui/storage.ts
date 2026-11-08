/**
 * Browser storage for the preview (DECISIONS 2026-11-05): the draft lives only in
 * this browser until the platform master copy store exists. Every failure is
 * reported to the screen, never swallowed.
 */
import type { Draft } from '../model/editor';

const KEY = 'cabinet-pm.room-preview.v0';

/**
 * Where a room is kept. The room preview keeps its one room under the old key; inside the
 * design studio each room of the design choices has its own (the room's ID from the intake).
 */
export const storageKey = (roomKey: string | null): string => (roomKey === null ? KEY : `${KEY}.room.${roomKey}`);

export type Stored = { kind: 'none' } | { kind: 'found'; raw: string; data: unknown } | { kind: 'unreadable'; raw: string; reason: string };

export function readStored(key: string = KEY): Stored | { kind: 'unavailable'; reason: string } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    return { kind: 'unavailable', reason: describe(error) };
  }
  if (raw === null) return { kind: 'none' };
  try {
    return { kind: 'found', raw, data: JSON.parse(raw) };
  } catch (error) {
    return { kind: 'unreadable', raw, reason: describe(error) };
  }
}

/** Returns null when saved, or the reason it could not be saved. */
export function writeStored(draft: Draft | null, key: string = KEY): string | null {
  try {
    if (draft === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(draft));
    return null;
  } catch (error) {
    return describe(error);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
