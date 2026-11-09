import { describe, expect, it } from 'vitest';
import { examples, type Job } from '@/core/index';
import { MOCKED_USER_ID as ME, mockedDatabase } from '../store/mocked-database';
import {
  history,
  isSavedByOthersFirst,
  loadLatest,
  loadLatestChoices,
  loadLatestStudioRoom,
  loadVersion,
  openAlerts,
  raiseAlert,
  resolveAlert,
  saveChoices,
  saveVersion,
  signedInStaff,
  supabaseSettings,
} from '../store/index';

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
      reason: "The job wasn't saved: someone else saved a newer version first. Reload to see it; your change is still on screen.",
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

describe('studio rooms and design choices', () => {
  const ROOM = 'cccccccc-0000-4000-8000-000000000001';
  it('files a room under its studio job and room, and finds its newest version by the room', async () => {
    const { backend } = mockedDatabase();
    await saveVersion(backend, { job: job(), madeFrom: null, origin: 'designer', summary: 'Room drawn', filedUnder: { jobKey: 'c1', roomKey: ROOM } });
    await saveVersion(backend, { job: job(), madeFrom: 1, origin: 'ai', summary: 'AI draft', filedUnder: { jobKey: 'c1', roomKey: ROOM } });
    expect(await loadLatestStudioRoom(backend, ROOM)).toMatchObject({ ok: true, value: { versionNo: 2, origin: 'ai' } });
    expect(await loadLatestStudioRoom(backend, 'cccccccc-0000-4000-8000-000000000002')).toEqual({ ok: true, value: null });
    expect(await saveVersion(backend, { job: job(), madeFrom: 2, origin: 'designer', summary: 'x', filedUnder: { jobKey: 'C 1', roomKey: ROOM } })).toEqual({
      ok: false,
      reason: 'The job wasn\'t saved: "C 1" / "cccccccc-0000-4000-8000-000000000001" is not a studio job and room.',
    });
  });

  it('keeps every version of the design choices, and refuses a second save from the same version', async () => {
    const { backend } = mockedDatabase();
    expect(await saveChoices(backend, { jobKey: 'c1', state: { version: 1 }, madeFrom: null, summary: 'Started' })).toMatchObject({ ok: true, value: { versionNo: 1 } });
    expect(await saveChoices(backend, { jobKey: 'c1', state: { version: 1, a: 1 }, madeFrom: 1, summary: 'Changed' })).toMatchObject({ ok: true, value: { versionNo: 2 } });
    const late = await saveChoices(backend, { jobKey: 'c1', state: { version: 1, a: 2 }, madeFrom: 1, summary: 'Changed elsewhere' });
    expect(!late.ok && isSavedByOthersFirst(late.reason)).toBe(true);
    expect(await loadLatestChoices(backend, 'c1')).toMatchObject({ ok: true, value: { versionNo: 2, state: { version: 1, a: 1 } } });
    expect(await saveChoices(backend, { jobKey: 'c1', state: null, madeFrom: 2, summary: 'x' })).toEqual({
      ok: false,
      reason: "The design choices weren't saved: there is nothing to save.",
    });
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
