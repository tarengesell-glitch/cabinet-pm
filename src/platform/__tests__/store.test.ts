import { describe, expect, it } from 'vitest';
import { examples, type Job } from '@/core/index';
import type { AlertRow, BackendFailure, BackendResult, StaffRow, StoreBackend, VersionRow } from '../store/backend';
import {
  history,
  loadLatest,
  loadVersion,
  openAlerts,
  raiseAlert,
  resolveAlert,
  saveVersion,
  signedInStaff,
  supabaseSettings,
} from '../store/index';

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const done = <T>(value: T): Promise<BackendResult<T>> => Promise.resolve({ ok: true, value });
const fail = <T>(failure: BackendFailure): Promise<BackendResult<T>> => Promise.resolve({ ok: false, failure });

/**
 * MOCKED (tests only, rule 14): an in-memory stand-in for the shared database, following the
 * same rules its migration enforces (versions are added, never changed; a second save from the
 * same version is refused). The real rules are tested against the real database separately.
 */
function mockedDatabase(opts: { signedIn?: string | null; staff?: StaffRow[]; down?: boolean } = {}) {
  const versions: VersionRow[] = [];
  const alerts: AlertRow[] = [];
  const signedIn = opts.signedIn === undefined ? ME : opts.signedIn;
  const staff = opts.staff ?? [{ user_id: ME, name: 'Test designer', roles: ['designer'] }];
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
    insertAlert: (row) => {
      const a: AlertRow = { ...row, id: `alert-${alerts.length + 1}`, created_at: 'now', created_by: ME, resolved_at: null, resolved_by: null, resolution_note: null };
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
  return { backend, versions, alerts };
}

const job = (): Job => examples.kitchen();
const user = { id: ME, name: 'Test designer', roles: ['designer'], mocked: false } as const;

describe('who is signed in', () => {
  it('gives the staff member, with their roles from the staff list', async () => {
    expect(await signedInStaff(mockedDatabase().backend)).toEqual({ ok: true, value: user });
  });
  it('refuses when no one is signed in, or the account is not on the staff list', async () => {
    expect(await signedInStaff(mockedDatabase({ signedIn: null }).backend)).toEqual({
      ok: false,
      reason: 'No one is signed in. Sign in to see and save jobs.',
    });
    expect(await signedInStaff(mockedDatabase({ staff: [] }).backend)).toEqual({
      ok: false,
      reason: 'This account is signed in but not on the staff list. Ask the owner to add you.',
    });
  });
});

describe('saving and loading versions', () => {
  it('saves a first version, then a version made from it, and loads the newest', async () => {
    const { backend } = mockedDatabase();
    const first = await saveVersion(backend, { job: job(), madeFrom: null, origin: 'designer', summary: 'Room drawn' });
    expect(first).toMatchObject({ ok: true, value: { versionNo: 1, parentVersion: null, origin: 'designer' } });
    const second = await saveVersion(backend, { job: job(), madeFrom: 1, origin: 'ai', summary: 'AI draft' });
    expect(second).toMatchObject({ ok: true, value: { versionNo: 2, parentVersion: 1, origin: 'ai' } });
    const latest = await loadLatest(backend, job().job_id);
    expect(latest).toMatchObject({ ok: true, value: { versionNo: 2, job: job() } });
    expect(await loadVersion(backend, job().job_id, 1)).toMatchObject({ ok: true, value: { versionNo: 1 } });
    const h = await history(backend, job().job_id);
    expect(h.ok && h.value.map((v) => v.versionNo)).toEqual([2, 1]);
  });

  it('refuses a second save made from the same version, so no one\'s work is overwritten', async () => {
    const { backend, versions } = mockedDatabase();
    await saveVersion(backend, { job: job(), madeFrom: null, origin: 'designer', summary: 'Room drawn' });
    await saveVersion(backend, { job: job(), madeFrom: 1, origin: 'designer', summary: 'Alice: moved the sink' });
    const late = await saveVersion(backend, { job: job(), madeFrom: 1, origin: 'designer', summary: 'Bob: widened the run' });
    expect(late).toEqual({
      ok: false,
      reason: "The job wasn't saved: someone else saved a newer version of this job first. Reload to see it; your change is still on screen.",
    });
    expect(versions.map((v) => v.summary)).toEqual(['Room drawn', 'Alice: moved the sink']);
  });

  it('says plainly that a job has never been saved, instead of making up an empty one', async () => {
    expect(await loadLatest(mockedDatabase().backend, job().job_id)).toEqual({ ok: true, value: null });
  });

  it('refuses to save a master copy that is not valid, or with no summary, before touching the database', async () => {
    const { backend, versions } = mockedDatabase();
    const broken = { ...job(), job_id: 'not-a-uuid' } as Job;
    const r = await saveVersion(backend, { job: broken, madeFrom: null, origin: 'designer', summary: 'x' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/^The job wasn't saved: its master copy is not valid/);
    expect(await saveVersion(backend, { job: job(), madeFrom: null, origin: 'designer', summary: '  ' })).toEqual({
      ok: false,
      reason: "The job wasn't saved: a save needs a short summary of what changed.",
    });
    expect(versions).toHaveLength(0);
  });

  it('refuses a saved document that is no longer a valid master copy, and keeps it untouched', async () => {
    const { backend, versions } = mockedDatabase();
    await saveVersion(backend, { job: job(), madeFrom: null, origin: 'designer', summary: 'Room drawn' });
    versions[0] = { ...versions[0]!, document: { job_id: job().job_id } };
    const r = await loadLatest(backend, job().job_id);
    expect(!r.ok && r.reason).toMatch(/^Loading the job: the saved master copy is not valid .* It is kept as it is; nothing was changed\.$/);
  });

  it('reports an unreachable database instead of pretending it saved', async () => {
    const r = await saveVersion(mockedDatabase({ down: true }).backend, { job: job(), madeFrom: null, origin: 'designer', summary: 'Room drawn' });
    expect(r).toEqual({ ok: false, reason: "The job couldn't reach the shared database: network down. Nothing was changed; try again." });
  });

  it('refuses something that is not a job ID', async () => {
    expect(await loadLatest(mockedDatabase().backend, 'kitchen')).toEqual({ ok: false, reason: '"kitchen" is not a job ID.' });
  });
});

describe('alerts', () => {
  it('stay open until a person resolves them with a note', async () => {
    const { backend } = mockedDatabase();
    const raised = await raiseAlert(backend, { source: 'ai-design', jobId: job().job_id, message: 'The draft could not be made.' });
    expect(raised.ok).toBe(true);
    const id = raised.ok ? raised.value.id : '';
    expect(await resolveAlert(backend, user, id, ' ')).toEqual({ ok: false, reason: 'An alert is resolved only with a note saying what was done.' });
    expect(await openAlerts(backend, job().job_id)).toMatchObject({ ok: true, value: [{ id }] });
    expect(await resolveAlert(backend, user, id, 'Fixed the run.')).toEqual({ ok: true, value: undefined });
    expect(await openAlerts(backend, null)).toEqual({ ok: true, value: [] });
    expect(await resolveAlert(backend, user, id, 'Again')).toEqual({ ok: false, reason: 'That alert was not found, or it is already resolved.' });
  });
});

describe("the site's database settings", () => {
  it('refuses missing or odd settings instead of guessing', () => {
    expect(supabaseSettings(undefined, '')).toEqual({
      ok: false,
      reason: "The shared database isn't set up for this site: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing from its settings.",
    });
    expect(supabaseSettings('http://example.com', 'key').ok).toBe(false);
    expect(supabaseSettings('https://btuwrakpnlutemfdxnve.supabase.co', 'sb_publishable_x')).toEqual({
      ok: true,
      value: { url: 'https://btuwrakpnlutemfdxnve.supabase.co', key: 'sb_publishable_x' },
    });
  });
});
