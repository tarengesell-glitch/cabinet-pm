import { describe, expect, it } from 'vitest';
import { runChecks, type Check } from '../checks';
import { JobSchema, type Job } from '../schema/master-copy';
import {
  RUN_CHECKS,
  appliancesOnRuns,
  appliancesOverlap,
  pairsExist,
  runsClearDoorways,
  runsFitAlongWall,
  runsOverlap,
} from '../layout/run-checks';
import { WALL_CHECKS } from '../layout/wall-checks';
import { ft, id, inch } from '../examples/helpers';
import { kitchen, lShapeWithAngledWall } from '../examples/rooms';

const wallA = (job: Job) => job.rooms[0]!.walls[0]!;
const issuesFrom = (check: Check, job: Job) => runChecks([check], job, {}).issues;

describe('the example rooms pass every rough-layout check', () => {
  for (const [name, make] of [
    ['kitchen (with a layout)', kitchen],
    ['L-shape with a 45° wall', lShapeWithAngledWall],
  ] as const) {
    it(name, () => {
      const run = runChecks([...WALL_CHECKS, ...RUN_CHECKS], make(), {});
      expect(run.issues).toEqual([]);
    });
  }
});

describe('the schema', () => {
  it('refuses a run with no length', () => {
    const job = kitchen();
    wallA(job).runs[0]!.length = 0;
    expect(JobSchema.safeParse(job).success).toBe(false);
  });

  it('refuses a run kind that is not on the list', () => {
    const job = kitchen() as unknown as { rooms: { walls: { runs: { kind: string }[] }[] }[] };
    job.rooms[0]!.walls[0]!.runs[0]!.kind = 'tall';
    expect(JobSchema.safeParse(job).success).toBe(false);
  });

  it('refuses a run ID used twice', () => {
    const job = kitchen();
    const walls = job.rooms[0]!.walls;
    walls[1]!.runs[0]!.run_id = walls[0]!.runs[0]!.run_id;
    const parsed = JobSchema.safeParse(job);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('is used twice');
  });

  it('refuses an appliance with no paired_with field (not known is an explicit null)', () => {
    const job = kitchen() as unknown as { rooms: { walls: { appliances: Record<string, unknown>[] }[] }[] };
    delete job.rooms[0]!.walls[0]!.appliances[0]!.paired_with;
    expect(JobSchema.safeParse(job).success).toBe(false);
  });
});

describe('each check fails on a copy broken for it', () => {
  it('a run past the end of its wall', () => {
    const job = kitchen();
    wallA(job).runs[0]!.length = ft(13);
    const issues = issuesFrom(runsFitAlongWall, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      'Cabinet run 1 (base + upper) on wall A in "Kitchen" runs past the end of the wall: its far end is 156" from the start, but the wall is 144" long (12" too far).',
    );
    expect(issues[0]!.ref).toEqual({ kind: 'run', id: id(601) });
  });

  it('an appliance past the end of its wall', () => {
    const job = kitchen();
    wallA(job).appliances[1]!.offset = inch(130);
    expect(issuesFrom(runsFitAlongWall, job)[0]!.ref).toEqual({ kind: 'appliance', id: id(702) });
  });

  it('two runs on one wall overlapping (touching is fine)', () => {
    const job = kitchen();
    const b = job.rooms[0]!.walls[1]!;
    expect(issuesFrom(runsOverlap, job)).toEqual([]);
    b.runs[1]!.offset = ft(6) - inch(2);
    const issues = issuesFrom(runsOverlap, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Cabinet run 1 (base + upper) on wall B in "Kitchen" and cabinet run 2 overlap by 2".');
  });

  it('a run across a doorway (a window is fine)', () => {
    const job = kitchen();
    const d = job.rooms[0]!.walls[3]!; // door at 30"–62"
    d.runs.push({ run_id: id(604), kind: 'base', offset: inch(10), length: inch(30), depth: inch(24) });
    const issues = issuesFrom(runsClearDoorways, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Cabinet run 1 (base) on wall D in "Kitchen" crosses the door by 10". Nothing can stand in a doorway.');
    // Wall A's run passes under its window without complaint.
    expect(issues.some((i) => i.ref.id === id(601))).toBe(false);
  });

  it('two appliances overlapping', () => {
    const job = kitchen();
    wallA(job).appliances[1]!.offset = inch(80); // sink ends at 82"
    const issues = issuesFrom(appliancesOverlap, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Appliance 1 (sink) on wall A in "Kitchen" and appliance 2 (dishwasher) overlap by 2".');
  });

  it('an appliance not within a run, while one across a split is fine', () => {
    const job = kitchen();
    const b = job.rooms[0]!.walls[1]!;
    // The range moved across the joint between B's two runs: still covered.
    b.appliances[0]!.offset = ft(6) - inch(10);
    expect(issuesFrom(appliancesOnRuns, job)).toEqual([]);
    // Past the end of the pantry run (6' + 30"): not covered.
    b.appliances[0]!.offset = inch(90);
    const issues = issuesFrom(appliancesOnRuns, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe('Appliance 1 (range) on wall B in "Kitchen" is not within a cabinet run. Add a run under it or move it onto one.');
  });

  it('a dishwasher paired with a sink that is gone', () => {
    const job = kitchen();
    wallA(job).appliances.splice(0, 1);
    const issues = issuesFrom(pairsExist, job);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ref).toEqual({ kind: 'appliance', id: id(702) });
  });

  it('every rough-layout check is in RUN_CHECKS once', () => {
    const all = [runsFitAlongWall, runsOverlap, runsClearDoorways, appliancesOverlap, appliancesOnRuns, pairsExist];
    expect(RUN_CHECKS).toEqual(all);
  });
});
