/**
 * Test data for trying the studio again and again (owner, 2026-11-08: "save the Design choices
 * and Room Drawing info I've inputted so that I don't have to go through those choices every
 * single time"). A job's answers, drawings and designs are saved as one snapshot, in this browser
 * or as a file, and loaded into any job. Loading gives the rooms new IDs, so two jobs never share
 * a drawing. Everything failing says why (rule 7).
 */
import { exportRoomData, importRoomData, type RoomData } from '@/modules/designer/contract';
import { loadIntakeState, saveIntakeState, type IntakeState } from '@/modules/intake/contract';

export interface JobFile {
  readonly kind: 'cabinet-pm-test-job';
  readonly version: 1;
  readonly saved_at: string;
  readonly intake: IntakeState;
  readonly rooms: Readonly<Record<string, RoomData>>;
}

const START_KEY = 'cabinet-pm.test-start.v1';
const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The job as it is now, or the reason it can't be saved. */
export function snapshotJob(job: string | null): { ok: true; value: JobFile } | { ok: false; reason: string } {
  const loaded = loadIntakeState(job);
  if (loaded.kind === 'none') return { ok: false, reason: 'This job has no design choices yet, so there is nothing to save.' };
  if (loaded.kind === 'problem') return { ok: false, reason: loaded.reason };
  const rooms: Record<string, RoomData> = {};
  for (const r of loaded.state.rooms) {
    const d = exportRoomData(r.id);
    if (!d.ok) return { ok: false, reason: d.reason };
    rooms[r.id] = d.value;
  }
  return { ok: true, value: { kind: 'cabinet-pm-test-job', version: 1, saved_at: new Date().toISOString(), intake: loaded.state, rooms } };
}

/** Checks that something read from a file or from storage is a saved job. */
export function readJobFile(data: unknown): { ok: true; value: JobFile } | { ok: false; reason: string } {
  const f = data as Partial<JobFile> | null;
  if (!f || f.kind !== 'cabinet-pm-test-job' || f.version !== 1 || !f.intake || !Array.isArray(f.intake.rooms) || typeof f.rooms !== 'object' || f.rooms === null)
    return { ok: false, reason: 'That isn’t a saved job from this studio, or it’s from another version.' };
  return { ok: true, value: f as JobFile };
}

/** Replaces the job with the saved one. Returns null when done, or the reason it couldn't be. */
export function restoreJob(job: string | null, file: JobFile): string | null {
  // Fresh room IDs, everywhere they appear (a matched room names the room it matches).
  let text = JSON.stringify(file.intake);
  const ids = new Map<string, string>();
  for (const r of file.intake.rooms) {
    const fresh = crypto.randomUUID();
    ids.set(r.id, fresh);
    text = text.split(r.id).join(fresh);
  }
  for (const [old, fresh] of ids) {
    const data = file.rooms[old];
    if (!data) continue;
    const problem = importRoomData(fresh, data);
    if (problem) return problem;
  }
  return saveIntakeState(JSON.parse(text) as IntakeState, job);
}

export function saveTestStart(file: JobFile): string | null {
  try {
    window.localStorage.setItem(START_KEY, JSON.stringify(file));
    return null;
  } catch (e) {
    return `The test start couldn’t be kept in this browser (${describe(e)}).`;
  }
}

/** The saved test start: null when there is none. */
export function loadTestStart(): { ok: true; value: JobFile | null } | { ok: false; reason: string } {
  try {
    const raw = window.localStorage.getItem(START_KEY);
    if (raw === null) return { ok: true, value: null };
    return readJobFile(JSON.parse(raw));
  } catch (e) {
    return { ok: false, reason: `The saved test start can’t be read (${describe(e)}).` };
  }
}

export function downloadJob(file: JobFile, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
