/**
 * The PLACEHOLDER designs, kept in this browser beside each room's drawing (the preview has no
 * database, and Core has no placed cabinets yet). Every failure is returned with its reason.
 */
import { type Result, type Room } from '@/core/index';
import { loadJob, room as roomOf, upgradeStoredDraft } from '../model/editor';
import { draftPlaceholder, type DraftPreferences, type PlaceholderDesign } from '../model/placeholder-draft';
import { readStored, storageKey } from './storage';

const designKey = (roomKey: string): string => `${storageKey(roomKey)}.placeholder-design`;

/** The room as drawn, from this browser. */
export function storedRoom(roomKey: string): Result<Room> {
  const stored = readStored(storageKey(roomKey));
  if (stored.kind === 'none') return { ok: false, reason: 'This room hasn’t been drawn yet.' };
  if (stored.kind === 'unavailable' || stored.kind === 'unreadable') return { ok: false, reason: `The room’s drawing can’t be read (${stored.reason}).` };
  const upgraded = upgradeStoredDraft(stored.data);
  const loaded = loadJob(upgraded.job, upgraded.wallDefaults);
  return loaded.ok ? { ok: true, value: roomOf(loaded.value.draft) } : loaded;
}

/** The room's placeholder design, or null when it has none yet. */
export function storedDesign(roomKey: string): Result<PlaceholderDesign | null> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(designKey(roomKey));
  } catch (error) {
    return { ok: false, reason: `This browser won’t let the design be read (${error instanceof Error ? error.message : String(error)}).` };
  }
  if (raw === null) return { ok: true, value: null };
  try {
    const d = JSON.parse(raw) as PlaceholderDesign;
    if (d?.version !== 2 || !Array.isArray(d.cabinets)) return { ok: false, reason: 'The saved design is from another version and can’t be used. Run the AI design step again to replace it.' };
    return { ok: true, value: d };
  } catch (error) {
    return { ok: false, reason: `The saved design can’t be read (${error instanceof Error ? error.message : String(error)}).` };
  }
}

/** Keeps the design. Returns null when kept, or the reason it couldn’t be. */
export function saveDesign(roomKey: string, design: PlaceholderDesign): string | null {
  try {
    window.localStorage.setItem(designKey(roomKey), JSON.stringify(design));
    return null;
  } catch (error) {
    return `The design couldn’t be kept in this browser (${error instanceof Error ? error.message : String(error)}).`;
  }
}

/** Drafts the room with the placeholder recipe and keeps the result (the studio's AI design step). */
export function draftRoom(roomKey: string, prefs: DraftPreferences): Result<PlaceholderDesign> {
  const room = storedRoom(roomKey);
  if (!room.ok) return room;
  const d = draftPlaceholder(room.value, prefs, () => crypto.randomUUID());
  if (!d.ok) return d;
  const problem = saveDesign(roomKey, d.value);
  return problem ? { ok: false, reason: problem } : d;
}

/** A room's drawing and design as kept, for saving a whole job as a test start (the studio's Test data). */
export interface RoomData {
  readonly drawing: unknown;
  readonly design: unknown;
}

export function exportRoomData(roomKey: string): Result<RoomData> {
  const drawing = readStored(storageKey(roomKey));
  if (drawing.kind === 'unavailable' || drawing.kind === 'unreadable') return { ok: false, reason: `The room’s drawing can’t be read (${drawing.reason}).` };
  let design: unknown = null;
  try {
    const raw = window.localStorage.getItem(designKey(roomKey));
    design = raw === null ? null : JSON.parse(raw);
  } catch (error) {
    return { ok: false, reason: `The room’s design can’t be read (${error instanceof Error ? error.message : String(error)}).` };
  }
  return { ok: true, value: { drawing: drawing.kind === 'found' ? drawing.data : null, design } };
}

/** Puts a room's drawing and design back under a room key. Returns null when done, or the reason. */
export function importRoomData(roomKey: string, data: RoomData): string | null {
  try {
    for (const [key, value] of [
      [storageKey(roomKey), data.drawing],
      [designKey(roomKey), data.design],
    ] as const) {
      if (value === null || value === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    }
    return null;
  } catch (error) {
    return `The room couldn’t be kept in this browser (${error instanceof Error ? error.message : String(error)}).`;
  }
}
