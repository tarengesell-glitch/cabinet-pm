/**
 * The browser's working copy of a studio job: the modules keep their own data in this browser,
 * and the shared database holds every saved version. These read and write the working copy only
 * through the modules' contracts.
 */
import { importRoomData, roomMasterCopy } from '@/modules/designer/contract';
import { loadIntakeState, saveIntakeState, type IntakeState } from '@/modules/intake/contract';

export type Local<T> = { readonly kind: 'none' } | { readonly kind: 'found'; readonly value: T } | { readonly kind: 'problem'; readonly reason: string };

export interface WorkingCopy {
  readChoices(job: string | null): Local<IntakeState>;
  writeChoices(job: string | null, state: unknown): string | null;
  /** A room's master copy (the Job), from the drawing the designer keeps. */
  readRoom(roomKey: string): Local<{ readonly job: unknown }>;
  writeRoom(roomKey: string, job: unknown): string | null;
}

export const BROWSER_WORKING_COPY: WorkingCopy = {
  readChoices(job) {
    const l = loadIntakeState(job);
    return l.kind === 'found' ? { kind: 'found', value: l.state } : l.kind === 'none' ? { kind: 'none' } : { kind: 'problem', reason: l.reason };
  },
  writeChoices: (job, state) => saveIntakeState(state as IntakeState, job),
  // Brought up to date the way the room drawing does it, so a room drawn by an older version
  // of the studio is saved in today's format (found on the live site, 2026-11-09).
  readRoom(roomKey) {
    const r = roomMasterCopy(roomKey);
    return r.kind === 'found' ? { kind: 'found', value: { job: r.job } } : r;
  },
  // The drawing's other setting (the thickness new walls start at) goes back to the standard size.
  writeRoom: (roomKey, job) => importRoomData(roomKey, { drawing: { job }, design: null }),
};

/** The room IDs in a job's design choices. */
export const roomKeysOf = (state: IntakeState): string[] => state.rooms.map((r) => r.id);
