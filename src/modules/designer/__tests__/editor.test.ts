import { describe, expect, it } from 'vitest';
import { JobSchema, WALL_CHECKS, runChecks, type Result } from '@/core/index';
import {
  addOpening,
  addWall,
  addWallByLength,
  closeRoom,
  commit,
  deleteWall,
  loadJob,
  nearestWall,
  redo,
  room,
  setProvenance,
  setSize,
  startRoom,
  startTimeline,
  undo,
  type Change,
  type Draft,
  type Env,
} from '../model/editor';
import { examples } from '@/core/index';

const IN = 64;
const FT = 12 * IN;

function testEnv(): Env {
  let n = 0;
  return {
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: () => '2026-11-05T12:00:00-06:00',
    userId: '00000000-0000-4000-8000-00000000beef',
  };
}
const SHOP = '00000000-0000-4000-8000-00000000c0de';
const size = (value: number) => ({ value, source_mm: null });

function unwrap(r: Result<Change>): Draft {
  if (!r.ok) throw new Error(r.reason);
  return r.value.draft;
}

function newRoom(env: Env): Draft {
  return unwrap(startRoom(env, { name: 'Kitchen', shopId: SHOP, ceiling: size(8 * FT), wallHeight: size(8 * FT), thickness: size(4 * IN + 32) }));
}

/** A 12' x 10' room typed wall by wall, counter-clockwise. */
function rectangle(env: Env): Draft {
  let d = newRoom(env);
  d = unwrap(addWallByLength(d, env, size(12 * FT), 0));
  d = unwrap(addWallByLength(d, env, size(10 * FT), 9000));
  d = unwrap(addWallByLength(d, env, size(12 * FT), 18000));
  d = unwrap(closeRoom(d, env));
  return d;
}

describe('starting and drawing a room', () => {
  it('needs a name and keeps every size it was given', () => {
    const env = testEnv();
    expect(startRoom(env, { name: '  ', shopId: SHOP, ceiling: size(1), wallHeight: size(1), thickness: size(1) }).ok).toBe(false);
    const d = newRoom(env);
    expect(room(d).ceiling_height).toEqual({ value: 8 * FT, provenance: 'measured', source_mm: null });
    expect(JobSchema.safeParse(d.job).success).toBe(true);
  });

  it('types walls one after another and closes the room', () => {
    const d = rectangle(testEnv());
    const walls = room(d).walls;
    expect(walls).toHaveLength(4);
    expect(walls[3]!.end_point).toEqual(walls[0]!.start_point);
    expect(walls.slice(0, 3).every((w) => w.length_provenance === 'measured')).toBe(true);
    expect(walls[3]!.length_provenance).toBe('rough'); // drawn by closing, not typed
    expect(JobSchema.safeParse(d.job).success).toBe(true);
    expect(runChecks(WALL_CHECKS, d.job, {}).passed).toBe(true);
    expect(closeRoom(d, testEnv()).ok).toBe(false);
  });

  it('keeps the typed length of a slanted wall', () => {
    const env = testEnv();
    const d = unwrap(addWallByLength(newRoom(env), env, size(4 * FT), 4500));
    expect(room(d).walls[0]!.entered_length).toBe(4 * FT);
  });

  it('refuses a wall with two identical corners', () => {
    const env = testEnv();
    expect(addWall(newRoom(env), env, { x: 5, y: 5 }, { x: 5, y: 5 }).ok).toBe(false);
  });

  it('records every change in the history', () => {
    const d = rectangle(testEnv());
    expect(d.job.history.map((h) => h.summary)).toEqual([
      'Started room "Kitchen"',
      `Added wall 1 (12' 0")`,
      `Added wall 2 (10' 0")`,
      `Added wall 3 (12' 0")`,
      `Added wall 4 (10' 0")`,
    ]);
  });
});

describe('typing a wall length', () => {
  it('moves the far corner and the next wall with it, which goes back to rough', () => {
    const env = testEnv();
    let d = rectangle(env);
    const [w1, w2] = room(d).walls;
    d = unwrap(setProvenance(d, env, { kind: 'wall', id: w2!.wall_id, field: 'length' }, 'verified'));
    const r = setSize(d, env, { kind: 'wall', id: w1!.wall_id, field: 'length' }, size(13 * FT));
    if (!r.ok) throw new Error(r.reason);
    const walls = room(r.value.draft).walls;
    expect(walls[0]!.end_point).toEqual({ x: 13 * FT, y: 0 });
    expect(walls[1]!.start_point).toEqual({ x: 13 * FT, y: 0 });
    expect(walls[1]!.length_provenance).toBe('rough');
    expect(r.value.notices[0]).toMatch(/Wall 2 changed length/);
  });

  it('is measured, never verified, when typed', () => {
    const env = testEnv();
    let d = rectangle(env);
    const w4 = room(d).walls[3]!;
    d = unwrap(setSize(d, env, { kind: 'wall', id: w4.wall_id, field: 'length' }, size(10 * FT)));
    expect(room(d).walls[3]!.length_provenance).toBe('measured');
  });

  it('refuses a zero length and leaves the room unchanged', () => {
    const env = testEnv();
    const d = rectangle(env);
    const r = setSize(d, env, { kind: 'wall', id: room(d).walls[0]!.wall_id, field: 'length' }, size(0));
    expect(r.ok).toBe(false);
  });
});

describe('doors and windows', () => {
  it('are only created once every size is filled in', () => {
    const env = testEnv();
    const d = rectangle(env);
    const wallId = room(d).walls[0]!.wall_id;
    const partial = addOpening(d, env, wallId, { kind: 'window', offset: size(48 * IN), width: size(36 * IN), height: null, sill_height: null });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.reason).toBe('Fill in the height, sill height first.');
    const full = unwrap(addOpening(d, env, wallId, { kind: 'window', offset: size(48 * IN), width: size(36 * IN), height: size(40 * IN), sill_height: size(42 * IN) }));
    expect(room(full).walls[0]!.openings).toHaveLength(1);
  });

  it('show up in the checks when they do not fit', () => {
    const env = testEnv();
    const d = rectangle(env);
    const wallId = room(d).walls[0]!.wall_id;
    const tall = unwrap(addOpening(d, env, wallId, { kind: 'window', offset: size(48 * IN), width: size(36 * IN), height: size(60 * IN), sill_height: size(42 * IN) }));
    const run = runChecks(WALL_CHECKS, tall.job, {});
    expect(run.passed).toBe(false);
    expect(run.issues[0]!.message).toMatch(/6" too tall/);
  });

  it('a tap near a wall finds it and the distance along it', () => {
    const d = rectangle(testEnv());
    const hit = nearestWall(room(d), { x: 30 * IN, y: 3 * IN }, 6 * IN);
    expect(hit?.wall.wall_id).toBe(room(d).walls[0]!.wall_id);
    expect(hit?.offset).toBe(30 * IN);
    expect(nearestWall(room(d), { x: 60 * IN, y: 60 * IN }, 6 * IN)).toBeNull();
  });
});

describe('sureness tags', () => {
  it('can be verified on purpose and taken back', () => {
    const env = testEnv();
    let d = rectangle(env);
    const target = { kind: 'room', field: 'ceiling_height' } as const;
    d = unwrap(setProvenance(d, env, target, 'verified'));
    expect(room(d).ceiling_height.provenance).toBe('verified');
    d = unwrap(setProvenance(d, env, target, 'measured'));
    expect(room(d).ceiling_height.provenance).toBe('measured');
  });
});

describe('undo and redo', () => {
  it('step back and forward through changes', () => {
    const env = testEnv();
    const d = rectangle(env);
    let t = startTimeline(d);
    t = commit(t, unwrap(deleteWall(d, env, room(d).walls[0]!.wall_id)));
    expect(room(t.present).walls).toHaveLength(3);
    t = undo(t);
    expect(room(t.present).walls).toHaveLength(4);
    t = redo(t);
    expect(room(t.present).walls).toHaveLength(3);
    expect(undo(undo(t)).present).toBe(d);
  });
});

describe('loading a master copy', () => {
  it('loads the example rooms', () => {
    for (const job of [examples.kitchen(), examples.lShapeWithAngledWall()]) {
      expect(loadJob(job, null).ok).toBe(true);
    }
  });
  it('refuses anything that is not a valid one-room master copy', () => {
    expect(loadJob({ hello: 1 }, null).ok).toBe(false);
    const two = examples.kitchen();
    expect(loadJob({ ...two, rooms: [two.rooms[0], { ...two.rooms[0], room_id: '00000000-0000-4000-8000-000000000777' }] }, null).ok).toBe(false);
  });
});
