/**
 * How far a room's drawing has got, for the design studio's room list. Read from what this
 * browser keeps (the preview has no database yet). A drawing that can't be read says so with
 * the reason; it is never reported as empty (rule 7).
 */
import { RUN_CHECKS, WALL_CHECKS, runChecks } from '@/core/index';
import { loadJob, room as roomOf, upgradeStoredDraft } from '../model/editor';
import { readStored, storageKey } from './storage';

export type RoomDrawingStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'drawn'; readonly walls: number; readonly runs: number; readonly problems: number }
  | { readonly kind: 'problem'; readonly reason: string };

export function roomDrawingStatus(roomKey: string): RoomDrawingStatus {
  const stored = readStored(storageKey(roomKey));
  if (stored.kind === 'none') return { kind: 'none' };
  if (stored.kind === 'unavailable' || stored.kind === 'unreadable') return { kind: 'problem', reason: stored.reason };
  const upgraded = upgradeStoredDraft(stored.data);
  const loaded = loadJob(upgraded.job, upgraded.wallDefaults);
  if (!loaded.ok) return { kind: 'problem', reason: loaded.reason };
  const room = roomOf(loaded.value.draft);
  const result = runChecks([...WALL_CHECKS, ...RUN_CHECKS], loaded.value.draft.job, {});
  return {
    kind: 'drawn',
    walls: room.walls.filter((w) => w.kind === 'room').length,
    runs: room.walls.reduce((n, w) => n + w.runs.length, 0),
    problems: result.issues.length,
  };
}
