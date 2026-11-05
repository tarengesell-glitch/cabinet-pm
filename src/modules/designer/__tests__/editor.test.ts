import { describe, expect, it } from 'vitest';
import { JobSchema, WALL_CHECKS, runChecks, type Result } from '@/core/index';
import {
  addWall,
  addWallByLength,
  closeRoom,
  commit,
  deleteWall,
  deleteWalls,
  setWallsThickness,
  setWallKind,
  insideSide,
  loadJob,
  moveCorner,
  moveOpening,
  resizeOpening,
  setDoorSwing,
  doorHanding,
  swingFromHanding,
  setOpeningKind,
  slideWall,
  nearestWall,
  resizeWall,
  placeOpening,
  redo,
  room,
  setProvenance,
  setSize,
  startRoom,
  startTimeline,
  undo,
  upgradeStoredDraft,
  type Change,
  type Draft,
  type Env,
} from '../model/editor';
import { examples } from '@/core/index';
import { readStandardSizes, STANDARD_SIZES } from '../model/standard-sizes';

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
  return unwrap(startRoom(env, { name: 'Kitchen', shopId: SHOP, ceiling: size(8 * FT) }));
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
  it('needs a name; the ceiling height and the standard wall thickness start unmeasured', () => {
    const env = testEnv();
    expect(startRoom(env, { name: '  ', shopId: SHOP, ceiling: size(1) }).ok).toBe(false);
    const d = newRoom(env);
    expect(room(d).ceiling_height).toEqual({ value: 8 * FT, provenance: 'unmeasured', source_mm: null });
    expect(d.wallDefaults.thickness).toEqual({ value: 5 * IN + 32, provenance: 'unmeasured', source_mm: null });
    expect(JobSchema.safeParse(d.job).success).toBe(true);
  });

  it('types walls one after another and closes the room', () => {
    const d = rectangle(testEnv());
    const walls = room(d).walls;
    expect(walls).toHaveLength(4);
    expect(walls[3]!.end_point).toEqual(walls[0]!.start_point);
    expect(walls.slice(0, 3).every((w) => w.length_provenance === 'unmeasured')).toBe(true);
    expect(walls[3]!.length_provenance).toBe('unmeasured'); // drawn by closing, not typed
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
      `Added wall A (144")`,
      `Added wall B (120")`,
      `Added wall C (144")`,
      `Added wall D (120")`,
    ]);
  });
});

describe('typing a wall length', () => {
  it('moves the far end along the wall; the joined wall slides across keeping its angle', () => {
    const env = testEnv();
    let d = rectangle(env);
    const [w1, w2] = room(d).walls;
    d = unwrap(setProvenance(d, env, { kind: 'wall', id: w2!.wall_id, field: 'length' }, 'confirmed'));
    d = unwrap(setProvenance(d, env, { kind: 'wall', id: room(d).walls[2]!.wall_id, field: 'length' }, 'confirmed'));
    const r = setSize(d, env, { kind: 'wall', id: w1!.wall_id, field: 'length' }, size(13 * FT));
    if (!r.ok) throw new Error(r.reason);
    const walls = room(r.value.draft).walls;
    expect(walls[0]!.end_point).toEqual({ x: 13 * FT, y: 0 });
    // Wall B moved across as a whole: still upright, still 10', still confirmed.
    expect(walls[1]!.start_point).toEqual({ x: 13 * FT, y: 0 });
    expect(walls[1]!.end_point).toEqual({ x: 13 * FT, y: 10 * FT });
    expect(walls[1]!.length_provenance).toBe('confirmed');
    // Wall C stretched to stay joined, so it is no longer confirmed, and says so.
    expect(walls[2]!.start_point).toEqual({ x: 13 * FT, y: 10 * FT });
    expect(walls[2]!.length_provenance).toBe('unmeasured');
    expect(r.value.notices).toEqual([`Wall C changed length, so it's no longer confirmed. Measure it again.`]);
    // Typing a length never confirms it (owner, 2026-11-05).
    expect(walls[0]!.length_provenance).toBe('unmeasured');
    expect(runChecks(WALL_CHECKS, r.value.draft.job, {}).passed).toBe(true);
  });

  it('dragging the start end keeps doors and windows where they are in the room', () => {
    const env = testEnv();
    let d = rectangle(env);
    const w1 = room(d).walls[0]!;
    d = unwrap(placeOpening(d, env, w1.wall_id, 'window', 60 * IN)); // offset 42"
    const before = room(d).walls[0]!.openings[0]!.offset.value;
    const r = resizeWall(d, env, w1.wall_id, 'start', size(14 * FT)); // 2' longer at the start
    if (!r.ok) throw new Error(r.reason);
    const wall = room(r.value.draft).walls[0]!;
    expect(wall.start_point).toEqual({ x: -2 * FT, y: 0 });
    expect(wall.openings[0]!.offset.value).toBe(before + 2 * FT); // same place in the room
    expect(wall.length_provenance).toBe('unmeasured'); // dragged, so approximate
    // Shortening from the start through the window is refused.
    const cut = resizeWall(d, env, w1.wall_id, 'start', size(7 * FT));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.reason).toBe('That would cut through the window on wall A.');
  });

  it('is measured, never verified, when typed', () => {
    const env = testEnv();
    let d = rectangle(env);
    const w4 = room(d).walls[3]!;
    d = unwrap(setSize(d, env, { kind: 'wall', id: w4.wall_id, field: 'length' }, size(10 * FT)));
    expect(room(d).walls[3]!.length_provenance).toBe('unmeasured');
  });

  it('refuses a zero length and leaves the room unchanged', () => {
    const env = testEnv();
    const d = rectangle(env);
    const r = setSize(d, env, { kind: 'wall', id: room(d).walls[0]!.wall_id, field: 'length' }, size(0));
    expect(r.ok).toBe(false);
  });
});

describe('doors and windows', () => {
  it('drop in at the standard size, unmeasured, centred where the wall was tapped', () => {
    const env = testEnv();
    const d = rectangle(env);
    const wallId = room(d).walls[0]!.wall_id;
    const placed = unwrap(placeOpening(d, env, wallId, 'door', 60 * IN));
    const door = room(placed).walls[0]!.openings[0]!;
    expect(door.kind).toBe('door');
    expect(door.width).toEqual({ value: 32 * IN, provenance: 'unmeasured', source_mm: null });
    expect(door.height.value).toBe(80 * IN);
    expect(door.sill_height.value).toBe(0);
    expect(door.offset.value).toBe(44 * IN); // 60 - 32/2
  });

  it('use the owner\'s standard window size', () => {
    const env = testEnv();
    const d = rectangle(env);
    const placed = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'window', null));
    const w = room(placed).walls[0]!.openings[0]!;
    expect([w.width.value, w.height.value, w.sill_height.value]).toEqual([36 * IN, 48 * IN, 36 * IN]);
    expect(w.offset.value).toBe(54 * IN); // middle of a 12' wall: 72 - 18
  });

  it('stay inside the wall when tapped near an end', () => {
    const env = testEnv();
    const d = rectangle(env);
    const wallId = room(d).walls[0]!.wall_id;
    expect(room(unwrap(placeOpening(d, env, wallId, 'door', 2 * IN))).walls[0]!.openings[0]!.offset.value).toBe(0);
    expect(room(unwrap(placeOpening(d, env, wallId, 'door', 143 * IN))).walls[0]!.openings[0]!.offset.value).toBe(112 * IN);
    expect(runChecks(WALL_CHECKS, unwrap(placeOpening(d, env, wallId, 'door', 143 * IN)).job, {}).passed).toBe(true);
  });

  it('a standard window fits under an 8\' ceiling; a taller one is flagged', () => {
    const env = testEnv();
    const d = rectangle(env);
    const placed = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'window', null));
    expect(runChecks(WALL_CHECKS, placed.job, {}).passed).toBe(true);
    const id = room(placed).walls[0]!.openings[0]!.opening_id;
    const tall = unwrap(setSize(placed, env, { kind: 'opening', id, field: 'height', }, size(64 * IN)));
    const run = runChecks(WALL_CHECKS, tall.job, {});
    expect(run.passed).toBe(false);
    expect(run.issues[0]!.message).toMatch(/but the ceiling is only 96" high \(4" too tall\)/);
  });

  it('move along the wall when dragged, and the new position is unmeasured', () => {
    const env = testEnv();
    let d = rectangle(env);
    d = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'door', null));
    const id = room(d).walls[0]!.openings[0]!.opening_id;
    d = unwrap(setSize(d, env, { kind: 'opening', id, field: 'offset' }, size(10 * IN)));
    expect(room(d).walls[0]!.openings[0]!.offset.provenance).toBe('unmeasured');
    d = unwrap(moveOpening(d, env, id, 20 * IN));
    expect(room(d).walls[0]!.openings[0]!.offset).toEqual({ value: 20 * IN, provenance: 'unmeasured', source_mm: null });
    expect(moveOpening(d, env, id, -1).ok).toBe(false);
  });

  it('a tap near a wall finds it and the distance along it', () => {
    const d = rectangle(testEnv());
    const hit = nearestWall(room(d), { x: 30 * IN, y: 3 * IN }, 6 * IN);
    expect(hit?.wall.wall_id).toBe(room(d).walls[0]!.wall_id);
    expect(hit?.offset).toBe(30 * IN);
    expect(nearestWall(room(d), { x: 60 * IN, y: 60 * IN }, 6 * IN)).toBeNull();
  });
});

describe('door swing', () => {
  it('a new door swings into the room, hinged at its start side; windows have no swing', () => {
    const env = testEnv();
    const d = rectangle(env); // drawn counter-clockwise: inside is to each wall's left
    const placed = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'door', null));
    expect(room(placed).walls[0]!.openings[0]!.swing).toEqual({ hinge: 'start', opens: 'left' });
    const win = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'window', null));
    expect(room(win).walls[0]!.openings[0]!.swing).toBeNull();
  });

  it('converts to and from left/right hand and in/out, judged from outside the door', () => {
    const d = rectangle(testEnv()); // counter-clockwise: inside is each wall's left
    const r = room(d);
    // Wall A runs left to right along the bottom; outside is below it, looking up at it.
    // Hinged at its start (the left end as seen from outside), swinging into the room: left hand.
    expect(doorHanding(r, { hinge: 'start', opens: 'left' })).toEqual({ hand: 'left', swings: 'in' });
    expect(doorHanding(r, { hinge: 'end', opens: 'right' })).toEqual({ hand: 'right', swings: 'out' });
    for (const hand of ['left', 'right'] as const) {
      for (const swings of ['in', 'out'] as const) {
        expect(doorHanding(r, swingFromHanding(r, hand, swings))).toEqual({ hand, swings });
      }
    }
  });

  it('can be flipped to the other hinge side and to swing out', () => {
    const env = testEnv();
    let d = rectangle(env);
    d = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'door', null));
    const id = room(d).walls[0]!.openings[0]!.opening_id;
    d = unwrap(setDoorSwing(d, env, id, { hinge: 'end', opens: 'right' }));
    expect(room(d).walls[0]!.openings[0]!.swing).toEqual({ hinge: 'end', opens: 'right' });
    expect(d.job.history.at(-1)?.summary).toBe('Set a door to swing out, hinged at its end side');
    expect(JobSchema.safeParse(d.job).success).toBe(true);
  });

  it('turning a window into a door gives it a swing, and back again removes it', () => {
    const env = testEnv();
    let d = rectangle(env);
    d = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'window', null));
    const id = room(d).walls[0]!.openings[0]!.opening_id;
    d = unwrap(setOpeningKind(d, env, id, 'door'));
    expect(room(d).walls[0]!.openings[0]!.swing).not.toBeNull();
    d = unwrap(setOpeningKind(d, env, id, 'window'));
    expect(room(d).walls[0]!.openings[0]!.swing).toBeNull();
    expect(setDoorSwing(d, env, id, { hinge: 'start', opens: 'left' }).ok).toBe(false);
  });
});

describe('moving and resizing doors and windows', () => {
  it('moves one onto another wall', () => {
    const env = testEnv();
    let d = rectangle(env);
    const [w1, w2] = room(d).walls;
    d = unwrap(placeOpening(d, env, w1!.wall_id, 'window', null));
    const id = room(d).walls[0]!.openings[0]!.opening_id;
    d = unwrap(moveOpening(d, env, id, 24 * IN, w2!.wall_id));
    expect(room(d).walls[0]!.openings).toHaveLength(0);
    expect(room(d).walls[1]!.openings[0]!.opening_id).toBe(id);
    expect(room(d).walls[1]!.openings[0]!.offset.value).toBe(24 * IN);
  });

  it('resizes from an end; changed sizes become unmeasured', () => {
    const env = testEnv();
    let d = rectangle(env);
    d = unwrap(placeOpening(d, env, room(d).walls[0]!.wall_id, 'window', null));
    const id = room(d).walls[0]!.openings[0]!.opening_id;
    d = unwrap(setSize(d, env, { kind: 'opening', id, field: 'width' }, size(36 * IN)));
    expect(room(d).walls[0]!.openings[0]!.width.provenance).toBe('unmeasured');
    d = unwrap(resizeOpening(d, env, id, 50 * IN, 40 * IN));
    const o = room(d).walls[0]!.openings[0]!;
    expect([o.offset.value, o.width.value, o.width.provenance]).toEqual([50 * IN, 40 * IN, 'unmeasured']);
    expect(resizeOpening(d, env, id, 50 * IN, 0).ok).toBe(false);
  });
});

describe('standard sizes (data/standard-sizes.json)', () => {
  it('are the owner\'s values', () => {
    expect(STANDARD_SIZES.wall_thickness).toBe(5 * IN + 32);
    expect(STANDARD_SIZES.openings.door).toEqual({ width: 32 * IN, height: 80 * IN, sill_height: 0 });
    expect(STANDARD_SIZES.openings.window).toEqual({ width: 36 * IN, height: 48 * IN, sill_height: 36 * IN });
    expect(STANDARD_SIZES.openings.passthrough).toEqual({ width: 32 * IN, height: 80 * IN, sill_height: 0 });
  });
  it('refuse a bad data file instead of filling it in', () => {
    const o = { width: '32', height: '80', sill_height: '0' };
    const good = {
      source: 'test',
      wall_thickness: '5 1/2',
      openings: { door: o, window: o, passthrough: o },
      door_swing: { hinge: 'start', opens: 'inside', source: 'test' },
    };
    expect(readStandardSizes(good).ok).toBe(true);
    const bad = readStandardSizes({ ...good, wall_thickness: '5 1/3' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/wall thickness/);
    expect(readStandardSizes({ ...good, source: undefined }).ok).toBe(false);
  });
});

describe('floating walls (islands and peninsulas)', () => {
  it('are lines with no thickness, and do not change which side of the room is inside', () => {
    const env = testEnv();
    let d = rectangle(env);
    const inside = insideSide(room(d));
    // A peninsula sticking into the room from wall A, and a free-standing island line.
    d = unwrap(addWall(d, env, { x: 6 * FT, y: 0 }, { x: 6 * FT, y: 4 * FT }, null, 'floating'));
    d = unwrap(addWall(d, env, { x: 3 * FT, y: 6 * FT }, { x: 9 * FT, y: 6 * FT }, null, 'floating'));
    const [peninsula, island] = room(d).walls.slice(4);
    expect([peninsula!.kind, peninsula!.thickness, island!.thickness]).toEqual(['floating', null, null]);
    expect(insideSide(room(d))).toBe(inside);
    expect(JobSchema.safeParse(d.job).success).toBe(true);
    expect(runChecks(WALL_CHECKS, d.job, {}).passed).toBe(true);
  });

  it('cannot hold doors or windows, or take a thickness', () => {
    const env = testEnv();
    let d = rectangle(env);
    d = unwrap(addWall(d, env, { x: 3 * FT, y: 6 * FT }, { x: 9 * FT, y: 6 * FT }, null, 'floating'));
    const island = room(d).walls[4]!.wall_id;
    expect(placeOpening(d, env, island, 'window', null).ok).toBe(false);
    expect(setSize(d, env, { kind: 'wall', id: island, field: 'thickness' }, size(4 * IN)).ok).toBe(false);
  });

  it('a wall can be switched between room and floating; not with doors or windows on it', () => {
    const env = testEnv();
    let d = rectangle(env);
    const wallB = room(d).walls[1]!.wall_id;
    d = unwrap(setWallKind(d, env, wallB, 'floating'));
    expect(room(d).walls[1]!.thickness).toBeNull();
    d = unwrap(setWallKind(d, env, wallB, 'room'));
    expect(room(d).walls[1]!.thickness).toEqual(d.wallDefaults.thickness);
    d = unwrap(placeOpening(d, env, wallB, 'window', null));
    const r = setWallKind(d, env, wallB, 'floating');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Move or delete the doors and windows on wall B first/);
  });
});

describe('two states: unmeasured and confirmed', () => {
  it('typing a size never confirms it; only Confirm does', () => {
    const env = testEnv();
    let d = rectangle(env);
    const id = room(d).walls[0]!.wall_id;
    d = unwrap(setProvenance(d, env, { kind: 'wall', id, field: 'thickness' }, 'confirmed'));
    d = unwrap(setSize(d, env, { kind: 'wall', id, field: 'thickness' }, size(6 * IN)));
    expect(room(d).walls[0]!.thickness!.provenance).toBe('unmeasured');
    d = unwrap(setProvenance(d, env, { kind: 'wall', id, field: 'thickness' }, 'confirmed'));
    expect(room(d).walls[0]!.thickness!.provenance).toBe('confirmed');
  });

  it('rooms saved with the old three tags convert: only "verified" was a confirmation', () => {
    const job = structuredClone(examples.kitchen()) as unknown as Record<string, unknown>;
    const text = JSON.stringify(job).replaceAll('"confirmed"', '"measured"');
    const old = JSON.parse(text.replace('"length_provenance":"measured"', '"length_provenance":"verified"'));
    const up = upgradeStoredDraft({ job: old, wallDefaults: { thickness: { value: 352, provenance: 'rough', source_mm: null } } });
    expect(up.notes.some((n) => /unmeasured \(red\) or confirmed \(black\)/.test(n))).toBe(true);
    const loaded = loadJob(up.job, up.wallDefaults);
    if (!loaded.ok) throw new Error(loaded.reason);
    const walls = room(loaded.value.draft).walls;
    expect(walls[0]!.length_provenance).toBe('confirmed');
    expect(walls[1]!.length_provenance).toBe('unmeasured');
    expect(loaded.value.draft.wallDefaults.thickness.provenance).toBe('unmeasured');
  });
});

describe('older saved drafts', () => {
  it('give doors saved before swings existed the swing they were drawn with', () => {
    const job = structuredClone(examples.kitchen()) as unknown as { rooms: { walls: { openings: Record<string, unknown>[] }[] }[] };
    for (const w of job.rooms[0]!.walls) for (const o of w.openings) delete o.swing;
    const up = upgradeStoredDraft({ job, wallDefaults: null });
    const loaded = loadJob(up.job, up.wallDefaults);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(room(loaded.value.draft).walls[3]!.openings[0]!.swing).toEqual({ hinge: 'start', opens: 'left' });
    expect(room(loaded.value.draft).walls[0]!.openings[0]!.swing).toBeNull();
  });

  it('drop the old wall height and say so', () => {
    const job = structuredClone(examples.kitchen()) as unknown as { rooms: { walls: Record<string, unknown>[] }[] };
    for (const w of job.rooms[0]!.walls) w.height = { value: 6144, provenance: 'unmeasured', source_mm: null };
    const up = upgradeStoredDraft({ job, wallDefaults: { height: {}, thickness: { value: 288, provenance: 'unmeasured', source_mm: null } } });
    expect(up.notes[0]).toMatch(/4 removed/);
    expect(loadJob(up.job, up.wallDefaults).ok).toBe(true);
  });
});

describe('sureness tags', () => {
  it('can be verified on purpose and taken back', () => {
    const env = testEnv();
    let d = rectangle(env);
    const target = { kind: 'room', field: 'ceiling_height' } as const;
    d = unwrap(setProvenance(d, env, target, 'confirmed'));
    expect(room(d).ceiling_height.provenance).toBe('confirmed');
    d = unwrap(setProvenance(d, env, target, 'unmeasured'));
    expect(room(d).ceiling_height.provenance).toBe('unmeasured');
  });
});

describe('handles on a selected wall', () => {
  it('dragging a corner moves it and the joined wall; changed confirmed walls lose it, with a notice', () => {
    const env = testEnv();
    let d = rectangle(env);
    for (const w of room(d).walls) d = unwrap(setProvenance(d, env, { kind: 'wall', id: w.wall_id, field: 'length' }, 'confirmed'));
    const r = moveCorner(d, env, { x: 12 * FT, y: 0 }, { x: 13 * FT, y: 0 });
    if (!r.ok) throw new Error(r.reason);
    const walls = room(r.value.draft).walls;
    expect(walls[0]!.end_point).toEqual({ x: 13 * FT, y: 0 });
    expect(walls[1]!.start_point).toEqual({ x: 13 * FT, y: 0 });
    expect(walls[0]!.length_provenance).toBe('unmeasured');
    expect(walls[1]!.length_provenance).toBe('unmeasured');
    expect(walls[2]!.length_provenance).toBe('confirmed'); // untouched
    expect(r.value.notices).toHaveLength(2);
  });

  it('dragging the middle slides the wall; it keeps its length and tag, its neighbours stretch', () => {
    const env = testEnv();
    const d = rectangle(env);
    const right = room(d).walls[1]!; // runs up the right side; its left is inside the room
    const r = slideWall(d, env, right.wall_id, -2 * FT); // to its right: outward
    if (!r.ok) throw new Error(r.reason);
    const walls = room(r.value.draft).walls;
    expect(walls[1]!.start_point).toEqual({ x: 14 * FT, y: 0 });
    expect(walls[1]!.end_point).toEqual({ x: 14 * FT, y: 10 * FT });
    expect(walls[1]!.length_provenance).toBe('unmeasured');
    expect(walls[0]!.end_point).toEqual({ x: 14 * FT, y: 0 });
    expect(walls[2]!.start_point).toEqual({ x: 14 * FT, y: 10 * FT });
    expect(walls[0]!.length_provenance).toBe('unmeasured');
    expect(runChecks(WALL_CHECKS, r.value.draft.job, {}).passed).toBe(true);
  });

  it('refuses moves that squash a wall or stack walls on top of each other', () => {
    const env = testEnv();
    const d = rectangle(env);
    expect(moveCorner(d, env, { x: 12 * FT, y: 0 }, { x: 12 * FT, y: 10 * FT }).ok).toBe(false);
    expect(moveCorner(d, env, { x: 5, y: 5 }, { x: 6, y: 6 }).ok).toBe(false);
    expect(moveCorner(d, env, { x: 12 * FT, y: 0 }, { x: 12 * FT, y: 0 }).ok).toBe(false);
  });

  it('refuses drawing a wall back over the last one', () => {
    const env = testEnv();
    let d = newRoom(env);
    d = unwrap(addWall(d, env, { x: 0, y: 0 }, { x: 4 * FT, y: 0 }));
    const back = addWall(d, env, { x: 4 * FT, y: 0 }, { x: 1 * FT, y: 0 });
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.reason).toMatch(/run back over wall A/);
  });
});

describe('several walls at once', () => {
  it('deletes them as one step', () => {
    const env = testEnv();
    const d = rectangle(env);
    const ids = room(d).walls.slice(0, 2).map((w) => w.wall_id);
    let t = startTimeline(d);
    t = commit(t, unwrap(deleteWalls(d, env, ids)));
    expect(room(t.present).walls).toHaveLength(2);
    expect(t.present.job.history.at(-1)?.summary).toBe('Deleted 2 walls (wall A, wall B)');
    expect(room(undo(t).present).walls).toHaveLength(4);
    expect(deleteWalls(d, env, []).ok).toBe(false);
  });
  it('sets their thickness together, as measured', () => {
    const env = testEnv();
    const d = rectangle(env);
    const ids = room(d).walls.slice(1, 3).map((w) => w.wall_id);
    const next = unwrap(setWallsThickness(d, env, ids, size(4 * IN)));
    expect(room(next).walls.map((w) => w.thickness!.value)).toEqual([5 * IN + 32, 4 * IN, 4 * IN, 5 * IN + 32]);
    expect(room(next).walls[1]!.thickness!.provenance).toBe('unmeasured');
    expect(setWallsThickness(d, env, ids, size(0)).ok).toBe(false);
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
