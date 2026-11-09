/**
 * Keeps a studio job's browser working copy and the shared database in step (owner, 2026-11-09:
 * saving is automatic; "live work shouldn't live solely in a browser").
 *
 * A job is made of pieces: its design choices, and each room's master copy. For each piece the
 * browser remembers which saved version it last matched (`SyncRecord`). Then:
 * - opening a job takes the newest saved version, unless this browser has changes of its own;
 * - a change made here is saved as a new version made from the one it started from;
 * - if someone else saved a newer version in the meantime, nothing is overwritten: the person is
 *   asked which copy to keep, and keeping theirs saves it as one more version (history keeps both).
 *
 * Every failure is said in plain words and stays on screen (rule 7); "Saved" is shown only when
 * the database has confirmed every piece.
 */
import {
  isSavedByOthersFirst,
  loadLatestChoices,
  loadLatestStudioRoom,
  saveChoices,
  saveVersion,
  type StoreBackend,
  type VersionOrigin,
} from '@/platform/index';
import type { Job } from '@/core/index';
import type { IntakeState } from '@/modules/intake/contract';
import { fingerprint } from './canonical';
import { roomKeysOf, type Local, type WorkingCopy } from './working-copy';

/** The database's name for a studio job: a demo client's ID, or "preview" for the preview job. */
export const jobKeyOf = (job: string | null): string => job ?? 'preview';

export type PieceId = 'choices' | `room:${string}`;
export interface PieceRecord {
  readonly version: number;
  readonly fingerprint: string;
}
export type SyncRecord = Readonly<Record<string, PieceRecord>>;

export interface RecordStore {
  read(jobKey: string): SyncRecord;
  write(jobKey: string, record: SyncRecord): string | null;
}

const RECORD_KEY = 'cabinet-pm.sync.v1.job.';
export const BROWSER_RECORDS: RecordStore = {
  read(jobKey) {
    try {
      const raw = window.localStorage.getItem(RECORD_KEY + jobKey);
      return raw === null ? {} : (JSON.parse(raw) as SyncRecord);
    } catch {
      // An unreadable record only means this browser can't tell what it last saved: it is treated
      // as "never saved here", which makes any difference with the database ask the person.
      return {};
    }
  },
  write(jobKey, record) {
    try {
      window.localStorage.setItem(RECORD_KEY + jobKey, JSON.stringify(record));
      return null;
    } catch (e) {
      return `This browser couldn't remember what was saved (${e instanceof Error ? e.message : String(e)}).`;
    }
  },
};

/** What to do with one piece when a job is opened. */
export type Decision =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'in_step'; readonly version: number }
  | { readonly kind: 'take_shared'; readonly version: number }
  | { readonly kind: 'save_mine'; readonly madeFrom: number | null }
  | { readonly kind: 'conflict'; readonly sharedVersion: number };

/**
 * The rule for one piece. `shared` is the newest saved version (null when never saved), `local`
 * the fingerprint of this browser's copy (null when it has none), `record` what this browser last
 * matched.
 */
export function decide(shared: { version: number; fingerprint: string } | null, local: string | null, record: PieceRecord | undefined): Decision {
  if (shared === null) return local === null ? { kind: 'nothing' } : { kind: 'save_mine', madeFrom: null };
  if (local === null || local === shared.fingerprint) return local === null ? { kind: 'take_shared', version: shared.version } : { kind: 'in_step', version: shared.version };
  const changedHere = record === undefined || record.fingerprint !== local;
  if (!changedHere) return { kind: 'take_shared', version: shared.version };
  if (record !== undefined && record.version === shared.version) return { kind: 'save_mine', madeFrom: shared.version };
  return { kind: 'conflict', sharedVersion: shared.version };
}

export interface Clash {
  readonly piece: PieceId;
  readonly what: string;
  readonly sharedVersion: number;
}

export type OpenResult =
  | { readonly kind: 'ready'; readonly notes: readonly string[] }
  | { readonly kind: 'clash'; readonly clashes: readonly Clash[] }
  | { readonly kind: 'problem'; readonly reason: string };

export interface SyncDeps {
  readonly backend: StoreBackend;
  readonly copy: WorkingCopy;
  readonly records: RecordStore;
}

const localPrint = <T>(l: Local<T>, pick: (v: T) => unknown): string | null => (l.kind === 'found' ? fingerprint(pick(l.value)) : null);

/** The summary and origin a room's new version is saved with: its own latest history entry. */
function roomSaveInfo(job: unknown): { summary: string; origin: VersionOrigin } {
  const last = (job as Partial<Job> | null)?.history?.at(-1);
  return { summary: last?.summary?.trim() || 'Room changed', origin: last?.origin === 'ai' ? 'ai' : 'designer' };
}

/**
 * Opens a job: brings this browser's copy and the database into step, piece by piece, before
 * any screen reads it. `resolve` says how to settle clashes the person has already chosen.
 */
export async function openJob(deps: SyncDeps, job: string | null, resolve?: 'take_shared' | 'keep_mine'): Promise<OpenResult> {
  const jobKey = jobKeyOf(job);
  const record: Record<string, PieceRecord> = { ...deps.records.read(jobKey) };
  const clashes: Clash[] = [];
  const notes: string[] = [];

  // 1. The design choices: they say which rooms the job has.
  const sharedChoices = await loadLatestChoices(deps.backend, jobKey);
  if (!sharedChoices.ok) return { kind: 'problem', reason: sharedChoices.reason };
  const localChoices = deps.copy.readChoices(job);
  if (localChoices.kind === 'problem') return { kind: 'problem', reason: localChoices.reason };
  const shared = sharedChoices.value;
  let d = decide(shared && { version: shared.versionNo, fingerprint: fingerprint(shared.state) }, localPrint(localChoices, (v) => v), record['choices']);
  if (d.kind === 'conflict' && resolve) d = resolve === 'take_shared' ? { kind: 'take_shared', version: d.sharedVersion } : { kind: 'save_mine', madeFrom: d.sharedVersion };
  switch (d.kind) {
    case 'conflict':
      clashes.push({ piece: 'choices', what: 'the design choices', sharedVersion: d.sharedVersion });
      break;
    case 'take_shared': {
      const problem = deps.copy.writeChoices(job, shared!.state);
      if (problem) return { kind: 'problem', reason: problem };
      record['choices'] = { version: d.version, fingerprint: fingerprint(shared!.state) };
      break;
    }
    case 'in_step':
      record['choices'] = { version: d.version, fingerprint: fingerprint(shared!.state) };
      break;
    case 'save_mine': {
      const state = (localChoices as { value: IntakeState }).value;
      const saved = await saveChoices(deps.backend, { jobKey, state, madeFrom: d.madeFrom, summary: d.madeFrom === null ? 'Design choices moved from this browser into the database' : 'Design choices changed' });
      if (!saved.ok) return { kind: 'problem', reason: saved.reason };
      record['choices'] = { version: saved.value.versionNo, fingerprint: fingerprint(state) };
      if (d.madeFrom === null) notes.push('This browser’s design choices were saved to the shared database.');
      break;
    }
    case 'nothing':
      break;
  }

  // 2. Each room of the design choices.
  const nowLocal = deps.copy.readChoices(job);
  const rooms = nowLocal.kind === 'found' ? roomKeysOf(nowLocal.value) : [];
  for (const roomKey of rooms) {
    const piece: PieceId = `room:${roomKey}`;
    const sharedRoom = await loadLatestStudioRoom(deps.backend, roomKey);
    if (!sharedRoom.ok) return { kind: 'problem', reason: sharedRoom.reason };
    const localRoom = deps.copy.readRoom(roomKey);
    if (localRoom.kind === 'problem') return { kind: 'problem', reason: localRoom.reason };
    const sr = sharedRoom.value;
    let r = decide(sr && { version: sr.versionNo, fingerprint: fingerprint(sr.job) }, localPrint(localRoom, (v) => v.job), record[piece]);
    if (r.kind === 'conflict' && resolve) r = resolve === 'take_shared' ? { kind: 'take_shared', version: r.sharedVersion } : { kind: 'save_mine', madeFrom: r.sharedVersion };
    switch (r.kind) {
      case 'conflict':
        clashes.push({ piece, what: 'a room’s drawing or design', sharedVersion: r.sharedVersion });
        break;
      case 'take_shared': {
        const problem = deps.copy.writeRoom(roomKey, sr!.job);
        if (problem) return { kind: 'problem', reason: problem };
        record[piece] = { version: r.version, fingerprint: fingerprint(sr!.job) };
        break;
      }
      case 'in_step':
        record[piece] = { version: r.version, fingerprint: fingerprint(sr!.job) };
        break;
      case 'save_mine': {
        const job = (localRoom as { value: { job: unknown } }).value.job;
        const info = roomSaveInfo(job);
        const saved = await saveVersion(deps.backend, {
          job: job as Job,
          madeFrom: r.madeFrom,
          origin: info.origin,
          summary: r.madeFrom === null ? 'Moved from this browser into the database' : info.summary,
          filedUnder: { jobKey, roomKey },
        });
        if (!saved.ok) return { kind: 'problem', reason: saved.reason };
        record[piece] = { version: saved.value.versionNo, fingerprint: fingerprint(job) };
        if (r.madeFrom === null) notes.push('A room drawn in this browser was saved to the shared database.');
        break;
      }
      case 'nothing':
        break;
    }
  }

  const problem = deps.records.write(jobKey, record);
  if (problem) return { kind: 'problem', reason: problem };
  return clashes.length > 0 ? { kind: 'clash', clashes } : { kind: 'ready', notes };
}

// ---- Saving as the person works ---------------------------------------------------------------

export type SaveStatus =
  | { readonly kind: 'saved' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'clash' }
  | { readonly kind: 'problem'; readonly reason: string };

/**
 * One pass of automatic saving: every piece that changed here and has stayed the same since the
 * last pass (so a save never lands mid-drag) is saved as a new version. Call it every second or so.
 */
export class AutoSaver {
  private last = new Map<PieceId, string | null>();
  private busy = false;
  private stopped: SaveStatus | null = null;

  constructor(
    private readonly deps: SyncDeps,
    private readonly job: string | null,
  ) {}

  /** True while something changed here hasn't been saved yet. */
  pending(): boolean {
    const record = this.deps.records.read(jobKeyOf(this.job));
    return this.pieces().some(({ id, print }) => print !== null && record[id]?.fingerprint !== print);
  }

  private pieces(): { id: PieceId; print: string | null; data: unknown }[] {
    const choices = this.deps.copy.readChoices(this.job);
    const out: { id: PieceId; print: string | null; data: unknown }[] = [
      { id: 'choices', print: choices.kind === 'found' ? fingerprint(choices.value) : null, data: choices.kind === 'found' ? choices.value : null },
    ];
    if (choices.kind === 'found') {
      for (const roomKey of roomKeysOf(choices.value)) {
        const room = this.deps.copy.readRoom(roomKey);
        out.push({ id: `room:${roomKey}`, print: room.kind === 'found' ? fingerprint(room.value.job) : null, data: room.kind === 'found' ? room.value.job : null });
      }
    }
    return out;
  }

  async tick(): Promise<SaveStatus> {
    if (this.stopped) return this.stopped;
    if (this.busy) return { kind: 'saving' };
    this.busy = true;
    try {
      const jobKey = jobKeyOf(this.job);
      const record: Record<string, PieceRecord> = { ...this.deps.records.read(jobKey) };
      let waiting = false;
      for (const { id, print, data } of this.pieces()) {
        const before = this.last.get(id);
        this.last.set(id, print);
        if (print === null || record[id]?.fingerprint === print) continue;
        if (before !== print) {
          waiting = true; // still changing: wait for it to settle
          continue;
        }
        const madeFrom = record[id]?.version ?? null;
        const saved =
          id === 'choices'
            ? await saveChoices(this.deps.backend, { jobKey, state: data, madeFrom, summary: madeFrom === null ? 'Design choices started' : 'Design choices changed' })
            : await saveVersion(this.deps.backend, {
                job: data as Job,
                madeFrom,
                ...roomSaveInfo(data),
                filedUnder: { jobKey, roomKey: id.slice('room:'.length) },
              });
        if (!saved.ok) {
          if (isSavedByOthersFirst(saved.reason)) {
            this.stopped = { kind: 'clash' };
            return this.stopped;
          }
          return { kind: 'problem', reason: saved.reason };
        }
        record[id] = { version: saved.value.versionNo, fingerprint: print };
        const problem = this.deps.records.write(jobKey, record);
        if (problem) return { kind: 'problem', reason: problem };
      }
      return waiting ? { kind: 'saving' } : { kind: 'saved' };
    } finally {
      this.busy = false;
    }
  }
}
