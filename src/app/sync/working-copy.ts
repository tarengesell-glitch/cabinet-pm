/**
 * The browser's working copy of a studio job: the modules keep their own data in this browser,
 * and the shared database holds every saved version. These read and write the working copy only
 * through the modules' contracts.
 */
import { exportRoomData, importRoomData } from '@/modules/designer/contract';
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
  readRoom(roomKey) {
    const d = exportRoomData(roomKey);
    if (!d.ok) return { kind: 'problem', reason: d.reason };
    const drawing = d.value.drawing as { job?: unknown } | null;
    if (drawing === null) return { kind: 'none' };
    if (typeof drawing !== 'object' || drawing.job === undefined) return { kind: 'problem', reason: 'The room’s drawing in this browser is not in the expected shape.' };
    return { kind: 'found', value: { job: drawing.job } };
  },
  // The drawing's other setting (the thickness new walls start at) goes back to the standard size.
  writeRoom: (roomKey, job) => importRoomData(roomKey, { drawing: { job }, design: null }),
};

/** The room IDs in a job's design choices. */
export const roomKeysOf = (state: IntakeState): string[] => state.rooms.map((r) => r.id);
