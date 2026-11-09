/**
 * MOCKED (rule 14): an in-memory stand-in for the shared database, for tests only. It follows the
 * rules the real database enforces (supabase/migrations): versions are added, never changed, and a
 * second save from the same version is refused. The real rules are tested against the real
 * database separately (src/platform/README.md). Nothing in the app may use it.
 */
import type { AlertRow, BackendFailure, BackendResult, ChoicesRow, StaffRow, StoreBackend, VersionRow } from './backend';

/** The ID the stand-in signs in as unless told otherwise. */
export const MOCKED_USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const done = <T>(value: T): Promise<BackendResult<T>> => Promise.resolve({ ok: true, value });
const fail = <T>(failure: BackendFailure): Promise<BackendResult<T>> => Promise.resolve({ ok: false, failure });

export function mockedDatabase(opts: { signedIn?: string | null; staff?: StaffRow[]; down?: boolean } = {}) {
  const versions: VersionRow[] = [];
  const choices: ChoicesRow[] = [];
  const alerts: AlertRow[] = [];
  const signedIn = opts.signedIn === undefined ? MOCKED_USER_ID : opts.signedIn;
  const staff = opts.staff ?? [{ user_id: MOCKED_USER_ID, name: 'Test designer', roles: ['designer'] }];
  const down = <T>(): Promise<BackendResult<T>> => fail({ kind: 'unreachable', detail: 'network down' });
  let clock = 0;
  const backend: StoreBackend = {
    signedInUserId: () => (opts.down ? down() : done(signedIn)),
    staffMember: (id) => (opts.down ? down() : done(staff.find((s) => s.user_id === id) ?? null)),
    latestVersion: (jobId) =>
      opts.down ? down() : done([...versions].filter((v) => v.job_id === jobId).sort((a, b) => b.version_no - a.version_no)[0] ?? null),
    version: (jobId, n) => done(versions.find((v) => v.job_id === jobId && v.version_no === n) ?? null),
    versions: (jobId) => done(versions.filter((v) => v.job_id === jobId).sort((a, b) => b.version_no - a.version_no)),
    insertVersion: (row) => {
      if (opts.down) return down();
      if (versions.some((v) => v.job_id === row.job_id && v.version_no === row.version_no)) {
        return fail({ kind: 'conflict', detail: 'duplicate key value violates unique constraint' });
      }
      const saved: VersionRow = { ...row, created_by: signedIn ?? '', created_at: `2026-11-09T00:00:0${clock++}Z` };
      versions.push(saved);
      return done(saved);
    },
    latestStudioRoom: (roomKey) =>
      opts.down ? down() : done([...versions].filter((v) => v.studio_room_key === roomKey).sort((a, b) => b.version_no - a.version_no)[0] ?? null),
    latestChoices: (jobKey) => opts.down ? down() : done([...choices].filter((c) => c.job_key === jobKey).sort((a, b) => b.version_no - a.version_no)[0] ?? null),
    insertChoices: (row) => {
      if (opts.down) return down();
      if (choices.some((c) => c.job_key === row.job_key && c.version_no === row.version_no)) {
        return fail({ kind: 'conflict', detail: 'duplicate key value violates unique constraint' });
      }
      const saved: ChoicesRow = { ...row, created_by: signedIn ?? '', created_at: 'now' };
      choices.push(saved);
      return done(saved);
    },
    insertAlert: (row) => {
      const a: AlertRow = { ...row, id: `alert-${alerts.length + 1}`, created_at: 'now', created_by: MOCKED_USER_ID, resolved_at: null, resolved_by: null, resolution_note: null };
      alerts.push(a);
      return done(a);
    },
    openAlerts: (jobId) => done(alerts.filter((a) => a.resolved_at === null && (jobId === null || a.job_id === jobId))),
    resolveAlert: (id, userId, note) => {
      const i = alerts.findIndex((a) => a.id === id && a.resolved_at === null);
      if (i < 0) return done(null);
      const resolved = { ...alerts[i]!, resolved_at: 'now', resolved_by: userId, resolution_note: note };
      alerts[i] = resolved;
      return done(resolved);
    },
  };
  return { backend, versions, choices, alerts };
}

