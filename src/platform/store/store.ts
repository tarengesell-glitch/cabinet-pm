/**
 * The master copy store (ARCHITECTURE "Storage"; DATA_MODEL `master_copy_versions`).
 *
 * - Every save is a new version made from the version on screen; nothing is ever overwritten
 *   (rule 12). If someone else saved first, the save is refused and nothing is lost.
 * - Every document is checked against Core's master copy schema before it is saved and after it
 *   is loaded. The store checks only that; business rules live in the modules.
 * - Every failure comes back as a plain-language reason. Nothing is filled in, and a save is
 *   never reported unless the database confirmed it (rule 7).
 */
import { JobSchema, ok, refuse, SCHEMA_VERSION, type Job, type Result } from '@/core/index';
import type { User } from '../permissions/can';
import type { AlertRow, BackendFailure, ChoicesRow, StoreBackend, VersionOrigin, VersionRow } from './backend';

export interface SavedVersion {
  readonly jobId: string;
  readonly versionNo: number;
  /** The version it was made from; null for a job's first version. */
  readonly parentVersion: number | null;
  readonly origin: VersionOrigin;
  readonly summary: string;
  readonly savedBy: string;
  readonly savedAt: string;
  readonly job: Job;
}
export type VersionSummary = Omit<SavedVersion, 'job'>;

export interface SaveRequest {
  readonly job: Job;
  /** The version the change was made from, or null for the job's first save. */
  readonly madeFrom: number | null;
  readonly origin: VersionOrigin;
  /** What changed, in words, for the history. */
  readonly summary: string;
  /** PROPOSED stand-in until real jobs exist (BUILD_PLAN 7a): the studio job and room it belongs to. */
  readonly filedUnder?: { readonly jobKey: string; readonly roomKey: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A studio job's key: a demo client's ID, or "preview" (the database checks the same pattern). */
const JOB_KEY = /^[a-z0-9_-]{1,64}$/;

const CONFLICT = 'someone else saved a newer version first';

/** True when a save was refused because someone else saved first (nothing was overwritten). */
export const isSavedByOthersFirst = (reason: string): boolean => reason.includes(CONFLICT);

function explain(what: string, f: BackendFailure): string {
  switch (f.kind) {
    case 'conflict':
      return `${what} wasn't saved: ${CONFLICT}. Reload to see it; your change is still on screen.`;
    case 'not_allowed':
      return `${what} isn't allowed for this account. Ask the owner to add you to the staff list.`;
    case 'refused':
      return `${what} was refused by the database: ${f.detail}`;
    case 'unreachable':
      return `${what} couldn't reach the shared database: ${f.detail}. Nothing was changed; try again.`;
  }
}

function toSaved(row: VersionRow, what: string): Result<SavedVersion> {
  const parsed = JobSchema.safeParse(row.document);
  if (!parsed.success) {
    return refuse(`${what}: the saved master copy is not valid (${parsed.error.issues.map((i) => i.message).join('; ')}). It is kept as it is; nothing was changed.`);
  }
  if (parsed.data.job_id !== row.job_id) return refuse(`${what}: the saved master copy belongs to another job.`);
  return ok({ ...summaryOf(row), job: parsed.data });
}

const summaryOf = (row: Omit<VersionRow, 'document'>): VersionSummary => ({
  jobId: row.job_id,
  versionNo: row.version_no,
  parentVersion: row.parent_version,
  origin: row.origin,
  summary: row.summary,
  savedBy: row.created_by,
  savedAt: row.created_at,
});

/** The person signed in, from the staff list. Not signed in, or not staff, is refused with the reason. */
export async function signedInStaff(backend: StoreBackend): Promise<Result<User>> {
  const id = await backend.signedInUserId();
  if (!id.ok) return refuse(explain('Checking who is signed in', id.failure));
  if (id.value === null) return refuse('No one is signed in. Sign in to see and save jobs.');
  const row = await backend.staffMember(id.value);
  if (!row.ok) return refuse(explain('Reading the staff list', row.failure));
  if (row.value === null) return refuse('This account is signed in but not on the staff list. Ask the owner to add you.');
  return ok({ id: row.value.user_id, name: row.value.name, roles: [...row.value.roles], mocked: false });
}

/** The job's newest version, or null when the job has never been saved (said plainly, not filled in). */
export async function loadLatest(backend: StoreBackend, jobId: string): Promise<Result<SavedVersion | null>> {
  if (!UUID.test(jobId)) return refuse(`"${jobId}" is not a job ID.`);
  const row = await backend.latestVersion(jobId);
  if (!row.ok) return refuse(explain('Loading the job', row.failure));
  return row.value === null ? ok(null) : toSaved(row.value, 'Loading the job');
}

/** One earlier version, exactly as it was saved. */
export async function loadVersion(backend: StoreBackend, jobId: string, versionNo: number): Promise<Result<SavedVersion>> {
  if (!UUID.test(jobId)) return refuse(`"${jobId}" is not a job ID.`);
  const row = await backend.version(jobId, versionNo);
  if (!row.ok) return refuse(explain(`Loading version ${versionNo}`, row.failure));
  if (row.value === null) return refuse(`The job has no version ${versionNo}.`);
  return toSaved(row.value, `Loading version ${versionNo}`);
}

/** Every version of the job, newest first. */
export async function history(backend: StoreBackend, jobId: string): Promise<Result<readonly VersionSummary[]>> {
  if (!UUID.test(jobId)) return refuse(`"${jobId}" is not a job ID.`);
  const rows = await backend.versions(jobId);
  if (!rows.ok) return refuse(explain('Loading the job history', rows.failure));
  return ok(rows.value.map(summaryOf));
}

/** Saves a new version, made from `madeFrom`. Returns it only once the database has it. */
export async function saveVersion(backend: StoreBackend, request: SaveRequest): Promise<Result<SavedVersion>> {
  const parsed = JobSchema.safeParse(request.job);
  if (!parsed.success) {
    return refuse(`The job wasn't saved: its master copy is not valid (${parsed.error.issues.map((i) => i.message).join('; ')}).`);
  }
  const job = parsed.data;
  if (!request.summary.trim()) return refuse("The job wasn't saved: a save needs a short summary of what changed.");
  if (request.madeFrom !== null && (!Number.isInteger(request.madeFrom) || request.madeFrom < 1)) {
    return refuse(`The job wasn't saved: "${request.madeFrom}" is not a version number.`);
  }
  if (request.filedUnder && (!JOB_KEY.test(request.filedUnder.jobKey) || !UUID.test(request.filedUnder.roomKey))) {
    return refuse(`The job wasn't saved: "${request.filedUnder.jobKey}" / "${request.filedUnder.roomKey}" is not a studio job and room.`);
  }
  const row = await backend.insertVersion({
    job_id: job.job_id,
    version_no: request.madeFrom === null ? 1 : request.madeFrom + 1,
    parent_version: request.madeFrom,
    shop_id: job.shop_id,
    schema_version: SCHEMA_VERSION,
    document: job,
    origin: request.origin,
    summary: request.summary.trim(),
    studio_job_key: request.filedUnder?.jobKey ?? null,
    studio_room_key: request.filedUnder?.roomKey ?? null,
  });
  if (!row.ok) return refuse(explain('The job', row.failure));
  return toSaved(row.value, 'The job was saved, but reading it back');
}

/** The newest master copy of a studio room (filed by the room's ID in the design choices), or null if never saved. */
export async function loadLatestStudioRoom(backend: StoreBackend, roomKey: string): Promise<Result<SavedVersion | null>> {
  if (!UUID.test(roomKey)) return refuse(`"${roomKey}" is not a room ID.`);
  const row = await backend.latestStudioRoom(roomKey);
  if (!row.ok) return refuse(explain('Loading the room', row.failure));
  return row.value === null ? ok(null) : toSaved(row.value, 'Loading the room');
}

// ---- Design choices (intake answers) ------------------------------------------------------------
// The intake owns their shape and checks it when it reads them; the store only keeps versions.

export interface SavedChoices {
  readonly jobKey: string;
  readonly versionNo: number;
  readonly parentVersion: number | null;
  readonly state: unknown;
  readonly summary: string;
  readonly savedBy: string;
  readonly savedAt: string;
}
const toChoices = (r: ChoicesRow): SavedChoices => ({
  jobKey: r.job_key,
  versionNo: r.version_no,
  parentVersion: r.parent_version,
  state: r.state,
  summary: r.summary,
  savedBy: r.created_by,
  savedAt: r.created_at,
});

/** A studio job's newest design choices, or null when they were never saved. */
export async function loadLatestChoices(backend: StoreBackend, jobKey: string): Promise<Result<SavedChoices | null>> {
  if (!JOB_KEY.test(jobKey)) return refuse(`"${jobKey}" is not a studio job.`);
  const row = await backend.latestChoices(jobKey);
  if (!row.ok) return refuse(explain('Loading the design choices', row.failure));
  return ok(row.value === null ? null : toChoices(row.value));
}

export async function saveChoices(
  backend: StoreBackend,
  request: { readonly jobKey: string; readonly state: unknown; readonly madeFrom: number | null; readonly summary: string },
): Promise<Result<SavedChoices>> {
  if (!JOB_KEY.test(request.jobKey)) return refuse(`The design choices weren't saved: "${request.jobKey}" is not a studio job.`);
  if (typeof request.state !== 'object' || request.state === null || Array.isArray(request.state)) {
    return refuse("The design choices weren't saved: there is nothing to save.");
  }
  if (!request.summary.trim()) return refuse("The design choices weren't saved: a save needs a short summary.");
  if (request.madeFrom !== null && (!Number.isInteger(request.madeFrom) || request.madeFrom < 1)) {
    return refuse(`The design choices weren't saved: "${request.madeFrom}" is not a version number.`);
  }
  const row = await backend.insertChoices({
    job_key: request.jobKey,
    version_no: request.madeFrom === null ? 1 : request.madeFrom + 1,
    parent_version: request.madeFrom,
    state: request.state,
    summary: request.summary.trim(),
  });
  if (!row.ok) return refuse(explain('The design choices', row.failure));
  return ok(toChoices(row.value));
}

// ---- Alerts (rule 7: a failure stays until a person resolves it with a note) --------------------

export interface Alert {
  readonly id: string;
  readonly raisedAt: string;
  readonly raisedBy: string;
  readonly source: string;
  readonly jobId: string | null;
  readonly message: string;
}
const toAlert = (r: AlertRow): Alert => ({ id: r.id, raisedAt: r.created_at, raisedBy: r.created_by, source: r.source, jobId: r.job_id, message: r.message });

export async function raiseAlert(backend: StoreBackend, alert: { source: string; jobId: string | null; message: string }): Promise<Result<Alert>> {
  if (!alert.source.trim() || !alert.message.trim()) return refuse('An alert needs where it came from and what went wrong.');
  const row = await backend.insertAlert({ source: alert.source.trim(), job_id: alert.jobId, message: alert.message.trim() });
  if (!row.ok) return refuse(explain('Raising the alert', row.failure));
  return ok(toAlert(row.value));
}

/** Alerts not yet resolved: for one job, or all of them (`null`). */
export async function openAlerts(backend: StoreBackend, jobId: string | null): Promise<Result<readonly Alert[]>> {
  const rows = await backend.openAlerts(jobId);
  if (!rows.ok) return refuse(explain('Loading the alerts', rows.failure));
  return ok(rows.value.map(toAlert));
}

export async function resolveAlert(backend: StoreBackend, user: User, alertId: string, note: string): Promise<Result<void>> {
  if (!note.trim()) return refuse('An alert is resolved only with a note saying what was done.');
  const row = await backend.resolveAlert(alertId, user.id, note.trim());
  if (!row.ok) return refuse(explain('Resolving the alert', row.failure));
  if (row.value === null) return refuse('That alert was not found, or it is already resolved.');
  return ok(undefined);
}
