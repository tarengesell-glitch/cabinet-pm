import { describe, expect, it } from 'vitest';
import { runChecks, type Check } from '../checks';
import { JobSchema, type Job } from '../schema/master-copy';
import { WALL_CHECKS, fitsAlongWall, fitsWallHeight, openingsOverlap, wallZeroLength, wallsCross } from '../layout/wall-checks';
import { inch } from '../examples/helpers';
import { kitchen, lShapeWithAngledWall } from '../examples/rooms';

const room0 = (job: Job) => job.rooms[0]!;
const ctx = {};

function issuesFrom(check: Check, job: Job) {
  return runChecks([check], job, ctx).issues;
}

describe('the example rooms pass every wall check', () => {
  for (const [name, make] of [
    ['kitchen', kitchen],
    ['L-shape with a 45° wall', lShapeWithAngledWall],
  ] as const) {
    it(name, () => {
      const run = runChecks(WALL_CHECKS, make(), ctx);
      expect(run.issues).toEqual([]);
      expect(run.passed).toBe(true);
    });
  }
});

describe('each check fails on a copy broken for it', () => {
  it('a wall with no length', () => {
    const job = kitchen();
    const w = room0(job).walls[1]!;
    room0(job).walls[1] = { ...w, end_point: w.start_point };
    const issues = issuesFrom(wallZeroLength, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Wall 2 in "Kitchen" starts and ends at the same point, so it has no length.');
  });

  it('a window running past the end of its wall', () => {
    const job = kitchen();
    const window = room0(job).walls[0]!.openings[0]!;
    window.offset = { ...window.offset, value: inch(120) }; // 120 + 36 > 144
    const issues = issuesFrom(fitsAlongWall, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      `Window 1 on wall 1 in "Kitchen" runs past the end of the wall: its far edge is 13' 0" from the start, but the wall is 12' 0" long (1' 0" too far).`,
    );
    expect(issues[0]!.ref).toEqual({ kind: 'opening', id: window.opening_id });
  });

  it('an obstacle running past the end of its wall', () => {
    const job = kitchen();
    const outlet = room0(job).walls[0]!.obstacles[0]!;
    outlet.offset = { ...outlet.offset, value: inch(143) };
    expect(issuesFrom(fitsAlongWall, job)[0]!.ref.kind).toBe('obstacle');
  });

  it('an opening on the slanted wall, by an amount smaller than the rounding', () => {
    // The slanted wall is 4' typed; its stored corners make it a hair different.
    // A window exactly 1/64" longer than the stored wall must still be caught.
    const job = lShapeWithAngledWall();
    const slanted = room0(job).walls[2]!;
    const window = slanted.openings[0]!;
    window.offset = { ...window.offset, value: 0 };
    window.width = { ...window.width, value: inch(48) + 2 };
    const issues = issuesFrom(fitsAlongWall, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/the wall is about 4' 0" long/);
  });

  it('a window taller than its wall', () => {
    const job = kitchen();
    const window = room0(job).walls[0]!.openings[0]!;
    window.height = { ...window.height, value: inch(60) }; // 42 + 60 > 96
    const issues = issuesFrom(fitsWallHeight, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      `Window 1 on wall 1 in "Kitchen" reaches 8' 6" from the floor, but the wall is only 8' 0" high (6" too tall).`,
    );
  });

  it('two openings overlapping on one wall', () => {
    const job = kitchen();
    const wall = room0(job).walls[0]!;
    const window = wall.openings[0]!;
    wall.openings.push({ ...window, opening_id: '00000000-0000-4000-8000-000000000299', offset: { ...window.offset, value: inch(80) } });
    const issues = issuesFrom(openingsOverlap, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Window 1 on wall 1 in "Kitchen" and Window 2 overlap by 4".');
  });

  it('openings that only touch do not overlap', () => {
    const job = kitchen();
    const wall = room0(job).walls[0]!;
    const window = wall.openings[0]!;
    wall.openings.push({ ...window, opening_id: '00000000-0000-4000-8000-000000000299', offset: { ...window.offset, value: inch(84) } });
    expect(issuesFrom(openingsOverlap, job)).toEqual([]);
  });

  it('two walls crossing', () => {
    const job = kitchen();
    const w = room0(job).walls[2]!;
    room0(job).walls[2] = { ...w, end_point: { x: w.end_point.x, y: -inch(12) } };
    const issues = issuesFrom(wallsCross, job);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toMatch(/^Wall 1 and wall 3 in "Kitchen" cross each other\.$/);
  });
});

describe('runChecks fails closed', () => {
  it('turns a crashing check into a blocking issue', () => {
    const broken: Check = {
      id: 'test.crash',
      layer: 'layout',
      description: 'A check that crashes',
      run() {
        throw new Error('boom');
      },
    };
    const run = runChecks([broken], kitchen(), ctx);
    expect(run.passed).toBe(false);
    expect(run.issues[0]!.message).toMatch(/could not run \(boom\)/);
  });

  it('blocks when two checks share an ID', () => {
    const run = runChecks([wallZeroLength, wallZeroLength], kitchen(), ctx);
    expect(run.passed).toBe(false);
    expect(run.issues[0]!.message).toMatch(/share the ID/);
  });

  it('warnings alone do not block', () => {
    const warn: Check = {
      id: 'test.warn',
      layer: 'design_rules',
      description: 'Always warns',
      run: (job) => [{ check_id: 'test.warn', severity: 'warn', message: 'Just so you know', ref: { kind: 'job', id: job.job_id } }],
    };
    expect(runChecks([warn], kitchen(), ctx).passed).toBe(true);
  });
});

describe('the master copy format is strict', () => {
  it('refuses an unknown field', () => {
    const job = kitchen() as Record<string, unknown>;
    expect(JobSchema.safeParse({ ...job, extra: 1 }).success).toBe(false);
  });
  it('refuses a missing field instead of filling it in', () => {
    const job = kitchen() as Record<string, unknown>;
    delete job.history;
    expect(JobSchema.safeParse(job).success).toBe(false);
  });
  it('refuses a length that is not a whole number of 1/64"', () => {
    const job = kitchen();
    const w = room0(job).walls[0]!;
    room0(job).walls[0] = { ...w, end_point: { x: 100.5, y: 0 } };
    expect(JobSchema.safeParse(job).success).toBe(false);
  });
  it('refuses a missing sureness tag', () => {
    const job = kitchen();
    const w = room0(job).walls[0]! as Record<string, unknown>;
    delete w.length_provenance;
    expect(JobSchema.safeParse(job).success).toBe(false);
  });
  it('refuses the same ID used twice', () => {
    const job = kitchen();
    room0(job).walls[1]!.wall_id = room0(job).walls[0]!.wall_id;
    const r = JobSchema.safeParse(job);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/used twice: by wall 1 in "Kitchen" and by wall 2/);
  });
});
