/**
 * Reading and saving a room's master copy from this browser for the studio's later steps (the
 * preview has no database; the room drawing keeps the same copy under the same key). The
 * placeholder AI step writes its cabinets into the master copy here, as placed items (schema 2).
 * Every failure is returned with its reason (rule 7).
 */
import { type Result, type Room } from '@/core/index';
import { PREVIEW_USER } from '@/platform/index';
import { placeholderItems } from '../model/cabinets';
import { loadJob, room as roomOf, upgradeStoredDraft, type Draft } from '../model/editor';
import { draftPlaceholder, type DraftPreferences } from '../model/placeholder-draft';
import { readStored, storageKey, writeStored } from './storage';

/** History entries the placeholder writes start with this, so its notes can be found again. */
const PLACEHOLDER = 'Placeholder layout (no AI was used)';

/** The room's master copy, as kept in this browser. */
export function storedDraft(roomKey: string): Result<Draft> {
  const stored = readStored(storageKey(roomKey));
  if (stored.kind === 'none') return { ok: false, reason: 'This room hasn’t been drawn yet.' };
  if (stored.kind === 'unavailable' || stored.kind === 'unreadable') return { ok: false, reason: `The room’s drawing can’t be read (${stored.reason}).` };
  const upgraded = upgradeStoredDraft(stored.data);
  const loaded = loadJob(upgraded.job, upgraded.wallDefaults);
  return loaded.ok ? { ok: true, value: loaded.value.draft } : loaded;
}

/** The room as drawn, with its placed cabinets. */
export function storedRoom(roomKey: string): Result<Room> {
  const d = storedDraft(roomKey);
  return d.ok ? { ok: true, value: roomOf(d.value) } : d;
}

/**
 * Saves a changed room into the master copy, with a history entry saying who changed what.
 * Returns the saved copy, or the reason it couldn't be saved.
 */
export function saveRoom(roomKey: string, draft: Draft, next: Room, summary: string, origin: 'ai' | 'designer', status?: Draft['job']['status']): Result<Draft> {
  const saved: Draft = {
    ...draft,
    job: {
      ...draft.job,
      ...(status ? { status } : {}),
      rooms: [next],
      history: [...draft.job.history, { at: new Date().toISOString(), by: PREVIEW_USER.id, origin, summary }],
    },
  };
  // Never save what isn't a valid master copy.
  const checked = loadJob(saved.job, saved.wallDefaults);
  if (!checked.ok) return checked;
  const problem = writeStored(saved, storageKey(roomKey));
  return problem ? { ok: false, reason: `The room couldn’t be kept in this browser (${problem}).` } : { ok: true, value: saved };
}

/**
 * The studio's AI design step (a PLACEHOLDER, no AI): lays out the room's runs with catalog
 * cabinets and writes them into its master copy as an AI draft, replacing any cabinets it had.
 */
export function draftRoom(roomKey: string, prefs: DraftPreferences): Result<Room> {
  const d = storedDraft(roomKey);
  if (!d.ok) return d;
  const room = roomOf(d.value);
  const design = draftPlaceholder(room, prefs, () => crypto.randomUUID());
  if (!design.ok) return design;
  const items = placeholderItems(room, design.value);
  if (!items.ok) return items;
  const saved = saveRoom(roomKey, d.value, { ...room, items: items.value }, [PLACEHOLDER, ...design.value.notes].join(' · '), 'ai', 'ai_draft');
  return saved.ok ? { ok: true, value: roomOf(saved.value) } : saved;
}

/** What the placeholder said about its last layout of this room, in plain words. */
export function placeholderNotes(draft: Draft): string[] {
  const last = [...draft.job.history].reverse().find((h) => h.summary.startsWith(PLACEHOLDER));
  return last ? last.summary.split(' · ').slice(1) : [];
}

/** A room's master copy as kept, for saving a whole job as a test start (the studio's Test data). */
export interface RoomData {
  readonly drawing: unknown;
  /** Kept for files saved before cabinets moved into the master copy; always null now. */
  readonly design: unknown;
}

export function exportRoomData(roomKey: string): Result<RoomData> {
  const drawing = readStored(storageKey(roomKey));
  if (drawing.kind === 'unavailable' || drawing.kind === 'unreadable') return { ok: false, reason: `The room’s drawing can’t be read (${drawing.reason}).` };
  return { ok: true, value: { drawing: drawing.kind === 'found' ? drawing.data : null, design: null } };
}

/** Puts a room's master copy back under a room key. Returns null when done, or the reason. */
export function importRoomData(roomKey: string, data: RoomData): string | null {
  try {
    if (data.drawing === null || data.drawing === undefined) window.localStorage.removeItem(storageKey(roomKey));
    else window.localStorage.setItem(storageKey(roomKey), JSON.stringify(data.drawing));
    return null;
  } catch (error) {
    return `The room couldn’t be kept in this browser (${error instanceof Error ? error.message : String(error)}).`;
  }
}
