import { describe, expect, it } from 'vitest';
import { examples, type Job } from '@/core/index';
import { mockedDatabase } from '@/platform/store/mocked-database';
import { canonicalJson, fingerprint } from '../canonical';
import { AutoSaver, decide, openJob, type RecordStore, type SyncRecord } from '../job-sync';
import type { Local, WorkingCopy } from '../working-copy';

const ROOM = 'cccccccc-0000-4000-8000-000000000001';
const choicesWith = (extra: Record<string, unknown> = {}) => ({ version: 1, rooms: [{ id: ROOM }], room: 0, pending: null, ...extra });
const room = (summary = 'Started room "Kitchen"'): Job => {
  const j = examples.kitchen();
  return { ...j, history: [...j.history, { at: '2026-11-09T00:00:00Z', by: 'aaaaaaaa-0000-4000-8000-000000000001', origin: 'designer', summary }] };
};

/** MOCKED (tests only): one browser's working copy and its sync record, in memory. */
function browser() {
  const data: { choices: unknown; rooms: Map<string, unknown> } = { choices: null, rooms: new Map() };
  const records = new Map<string, SyncRecord>();
  const copy: WorkingCopy = {
    readChoices: () => (data.choices === null ? { kind: 'none' } : ({ kind: 'found', value: structuredClone(data.choices) } as Local<never>)),
    writeChoices: (_job, state) => ((data.choices = structuredClone(state)), null),
    readRoom: (key) => (data.rooms.has(key) ? { kind: 'found', value: { job: structuredClone(data.rooms.get(key)) } } : { kind: 'none' }),
    writeRoom: (key, job) => (data.rooms.set(key, structuredClone(job)), null),
  };
  const recordStore: RecordStore = { read: (k) => records.get(k) ?? {}, write: (k, r) => (records.set(k, r), null) };
  return { data, copy, records: recordStore };
}

describe('deciding what to do with one piece when a job opens', () => {
  const shared = { version: 3, fingerprint: 'S' };
  it('takes the saved copy when this browser has none, or has not changed it', () => {
    expect(decide(shared, null, undefined)).toEqual({ kind: 'take_shared', version: 3 });
    expect(decide(shared, 'L', { version: 2, fingerprint: 'L' })).toEqual({ kind: 'take_shared', version: 3 });
  });
  it('saves this browser\'s change when it was made from the newest saved version', () => {
    expect(decide(shared, 'L2', { version: 3, fingerprint: 'S' })).toEqual({ kind: 'save_mine', madeFrom: 3 });
  });
  it('moves work that was only ever in this browser into the database', () => {
    expect(decide(null, 'L', undefined)).toEqual({ kind: 'save_mine', madeFrom: null });
    expect(decide(null, null, undefined)).toEqual({ kind: 'nothing' });
  });
  it('asks the person when both changed, instead of overwriting either', () => {
    expect(decide(shared, 'L2', { version: 2, fingerprint: 'L' })).toEqual({ kind: 'conflict', sharedVersion: 3 });
    expect(decide(shared, 'L2', undefined)).toEqual({ kind: 'conflict', sharedVersion: 3 });
  });
  it('counts identical copies as in step', () => {
    expect(decide(shared, 'S', undefined)).toEqual({ kind: 'in_step', version: 3 });
  });
});

describe('opening a job and saving as you work', () => {
  it('moves a job kept only in this browser into the database, then another browser opens it', async () => {
    const db = mockedDatabase();
    const a = browser();
    a.data.choices = choicesWith();
    a.data.rooms.set(ROOM, room());
    expect(await openJob({ backend: db.backend, ...a }, 'c1')).toEqual({
      kind: 'ready',
      notes: ['This browser’s design choices were saved to the shared database.', 'A room drawn in this browser was saved to the shared database.'],
    });
    expect(db.choices.map((c) => c.version_no)).toEqual([1]);
    expect(db.versions.map((v) => [v.version_no, v.studio_job_key, v.studio_room_key])).toEqual([[1, 'c1', ROOM]]);

    const b = browser();
    expect(await openJob({ backend: db.backend, ...b }, 'c1')).toEqual({ kind: 'ready', notes: [] });
    expect(canonicalJson(b.data.choices)).toBe(canonicalJson(a.data.choices));
    expect(fingerprint(b.data.rooms.get(ROOM))).toBe(fingerprint(a.data.rooms.get(ROOM)));
  });

  it('saves a change once it has settled, with the room\'s own history summary and origin', async () => {
    const db = mockedDatabase();
    const a = browser();
    a.data.choices = choicesWith();
    a.data.rooms.set(ROOM, room());
    await openJob({ backend: db.backend, ...a }, 'c1');
    const saver = new AutoSaver({ backend: db.backend, ...a }, 'c1');
    expect(await saver.tick()).toEqual({ kind: 'saved' });

    a.data.rooms.set(ROOM, room('Moved the sink'));
    expect(saver.pending()).toBe(true);
    expect(await saver.tick()).toEqual({ kind: 'saving' }); // just changed: wait for it to settle
    expect(db.versions).toHaveLength(1);
    expect(await saver.tick()).toEqual({ kind: 'saved' });
    expect(db.versions.map((v) => [v.version_no, v.parent_version, v.summary, v.origin])).toEqual([
      [1, null, 'Moved from this browser into the database', 'designer'],
      [2, 1, 'Moved the sink', 'designer'],
    ]);
    expect(saver.pending()).toBe(false);
  });

  it('never overwrites someone else\'s save: the second browser is stopped and told', async () => {
    const db = mockedDatabase();
    const a = browser();
    a.data.choices = choicesWith();
    await openJob({ backend: db.backend, ...a }, 'c1');
    const b = browser();
    await openJob({ backend: db.backend, ...b }, 'c1');

    const sa = new AutoSaver({ backend: db.backend, ...a }, 'c1');
    const sb = new AutoSaver({ backend: db.backend, ...b }, 'c1');
    await sa.tick();
    await sb.tick();
    a.data.choices = choicesWith({ room: 0, a: 'Alice' });
    b.data.choices = choicesWith({ room: 0, b: 'Bob' });
    await sa.tick();
    await sb.tick();
    expect(await sa.tick()).toEqual({ kind: 'saved' });
    expect(await sb.tick()).toEqual({ kind: 'clash' });
    expect(db.choices.map((c) => c.version_no)).toEqual([1, 2]);
    expect((db.choices[1]!.state as { a?: string }).a).toBe('Alice');

    // Reopening asks Bob which copy to keep; keeping his saves it as one more version.
    expect(await openJob({ backend: db.backend, ...b }, 'c1')).toMatchObject({ kind: 'clash', clashes: [{ piece: 'choices', sharedVersion: 2 }] });
    expect(await openJob({ backend: db.backend, ...b }, 'c1', 'keep_mine')).toMatchObject({ kind: 'ready' });
    expect(db.choices.map((c) => c.version_no)).toEqual([1, 2, 3]);
    expect((db.choices[2]!.state as { b?: string }).b).toBe('Bob');
  });

  it('can drop this browser\'s clashing change and take the saved copy instead', async () => {
    const db = mockedDatabase();
    const a = browser();
    a.data.choices = choicesWith({ a: 1 });
    await openJob({ backend: db.backend, ...a }, 'c1');
    const b = browser();
    b.data.choices = choicesWith({ b: 1 });
    expect(await openJob({ backend: db.backend, ...b }, 'c1', 'take_shared')).toMatchObject({ kind: 'ready' });
    expect(b.data.choices).toEqual(choicesWith({ a: 1 }));
    expect(db.choices).toHaveLength(1);
  });

  it('reports an unreachable database instead of opening a stale copy', async () => {
    const a = browser();
    a.data.choices = choicesWith();
    expect(await openJob({ backend: mockedDatabase({ down: true }).backend, ...a }, 'c1')).toEqual({
      kind: 'problem',
      reason: "Loading the design choices couldn't reach the shared database: network down. Nothing was changed; try again.",
    });
  });

  it('keeps reporting a save it could not make, and saves it once it can', async () => {
    const db = mockedDatabase();
    const a = browser();
    a.data.choices = choicesWith();
    a.data.rooms.set(ROOM, room());
    await openJob({ backend: db.backend, ...a }, 'c1');
    const saver = new AutoSaver({ backend: db.backend, ...a }, 'c1');
    await saver.tick();
    const broken = { ...room(), job_id: 'not-a-uuid' };
    a.data.rooms.set(ROOM, broken);
    await saver.tick();
    const r = await saver.tick();
    expect(r.kind).toBe('problem');
    expect(r.kind === 'problem' && r.reason).toMatch(/^The job wasn't saved: its master copy is not valid/);
    expect(saver.pending()).toBe(true);
    a.data.rooms.set(ROOM, room('Fixed'));
    await saver.tick();
    expect(await saver.tick()).toEqual({ kind: 'saved' });
    expect(db.versions.at(-1)?.summary).toBe('Fixed');
  });
});

describe('fingerprints', () => {
  it('ignore key order, as the database stores JSON with sorted keys', () => {
    expect(fingerprint({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(fingerprint({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
});
