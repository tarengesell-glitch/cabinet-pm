import { describe, expect, it } from 'vitest';
import { RUN_CHECKS, WALL_CHECKS, examples, runChecks, type Result, type Room, type Wall } from '@/core/index';
import { addWall, commit, loadJob, room, startTimeline, undo, upgradeStoredDraft, type Change, type Draft, type Env } from '../model/editor';
import {
  addIsland,
  addIslandOnWall,
  cornerCabinets,
  deleteAppliances,
  deleteRuns,
  drawRun,
  fillWall,
  flipPartner,
  moveAppliance,
  moveIsland,
  moveJoint,
  moveRun,
  placeAppliance,
  resizeIsland,
  runEndLimits,
  setApplianceWidth,
  setRunDepth,
  setRunEnd,
  setRunKind,
  setRunLength,
  snapRunEnd,
  splitRun,
  upperPieces,
} from '../model/layout';
import { freestandingKinds, LAYOUT_RULES, readLayoutRules, rulesForRoom } from '../model/layout-rules';
import raw from '../data/layout-rules.json';

const IN = 64;
const SNAP = { windowSnap: 14 * IN };

function testEnv(): Env {
  let n = 500;
  return {
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    now: () => '2026-11-06T12:00:00-06:00',
    userId: '00000000-0000-4000-8000-00000000beef',
  };
}

function unwrap(r: Result<Change>): Draft {
  if (!r.ok) throw new Error(r.reason);
  return r.value.draft;
}
function notices(r: Result<Change>): readonly string[] {
  if (!r.ok) throw new Error(r.reason);
  return r.value.notices;
}

/**
 * The 12' x 10' example kitchen with its layout cleared. Wall A (144") has a window at
 * 48"–84"; wall B is 120"; wall C is 144"; wall D (120") has a door at 30"–62".
 */
function bareKitchen(): Draft {
  const job = examples.kitchen();
  for (const w of job.rooms[0]!.walls) {
    w.runs = [];
    w.appliances = [];
  }
  return unwrap(loadJob(job, null));
}

const walls = (d: Draft): Wall[] => room(d).walls;
const wallOf = (d: Draft, letter: 'A' | 'B' | 'C' | 'D'): Wall => walls(d)['ABCD'.indexOf(letter)]!;
const spans = (w: Wall) =>
  [...w.runs].sort((a, b) => a.offset - b.offset).map((r) => [r.offset / IN, (r.offset + r.length) / IN, r.kind]);
const passes = (d: Draft) => runChecks([...WALL_CHECKS, ...RUN_CHECKS], d.job, {}).issues;

describe('runs', () => {
  it('a tap fills a wall end to end', () => {
    const env = testEnv();
    const d = unwrap(fillWall(bareKitchen(), env, wallOf(bareKitchen(), 'A').wall_id));
    // Walls are 4 1/2" thick: cabinets reach the inside corners, 2 1/4" in from the corner points.
    expect(spans(wallOf(d, 'A'))).toEqual([[2.25, 141.75, 'base_upper']]);
    expect(wallOf(d, 'A').runs[0]!.depth).toBe(24 * IN);
    expect(d.job.history.at(-1)!.summary).toBe('Filled 139 1/2" of cabinets on wall A');
    expect(passes(d)).toEqual([]);
  });

  it('stops 3" short of a door, and says so', () => {
    const k = bareKitchen();
    const r = fillWall(k, testEnv(), wallOf(k, 'D').wall_id);
    expect(spans(wallOf(unwrap(r), 'D'))).toEqual([
      [2.25, 27, 'base_upper'],
      [65, 117.75, 'base_upper'],
    ]);
    expect(notices(r)).toEqual(['Stopped 3" short of the door.']);
  });

  it('refuses to fill a wall that is already full', () => {
    const k = bareKitchen();
    const env = testEnv();
    const d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    const again = fillWall(d, env, wallOf(d, 'A').wall_id);
    expect(again).toEqual({ ok: false, reason: 'Wall A already has cabinets everywhere they can go.' });
  });

  it('a drag along a wall draws part of it, and extends a run it touches', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(drawRun(k, env, wallOf(k, 'C').wall_id, 10 * IN, 40 * IN));
    d = unwrap(drawRun(d, env, wallOf(d, 'C').wall_id, 60 * IN, 40 * IN));
    expect(spans(wallOf(d, 'C'))).toEqual([[10, 60, 'base_upper']]);
  });

  it('run ends snap to the corner or 3/6/9" clear of the run on the next wall, and 3" clear of openings', () => {
    const k = bareKitchen();
    const env = testEnv();
    const d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    const r = room(d);
    const b = wallOf(d, 'B').wall_id;
    const a = wallOf(d, 'A').wall_id;
    const opts = { tolerance: 2 * IN };
    // Measured from wall A's inside face, 2 1/4" in: its 24" run's front is at 26 1/4".
    expect(snapRunEnd(r, b, 31 * IN, opts)).toBe(32.25 * IN); // 6" clear
    expect(snapRunEnd(r, b, 28 * IN, opts)).toBe(29.25 * IN); // 3" clear
    expect(snapRunEnd(r, b, 10 * IN, opts)).toBe(2.25 * IN); // into the inside corner
    expect(snapRunEnd(r, b, 60 * IN, opts)).toBe(60 * IN); // nothing near
    expect(snapRunEnd(r, a, 46 * IN, { ...opts, ignoreRunIds: wallOf(d, 'A').runs.map((x) => x.run_id) })).toBe(45 * IN); // 3" before the window
    expect(snapRunEnd(r, b, 29.5 * IN, { ...opts, free: true })).toBe(29.5 * IN);
  });

  it('corners where runs meet need a corner cabinet: base, upper, or both', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    d = unwrap(fillWall(d, env, wallOf(d, 'B').wall_id));
    let corners = cornerCabinets(room(d));
    expect(corners).toHaveLength(1);
    expect(corners[0]).toMatchObject({ endingWallId: wallOf(d, 'A').wall_id, base: true, upper: true });
    d = unwrap(setRunKind(d, env, wallOf(d, 'B').runs.map((x) => x.run_id), 'upper'));
    corners = cornerCabinets(room(d));
    expect(corners[0]).toMatchObject({ base: false, upper: true, upperDepths: { ending: 13 * IN, starting: 12 * IN } });
    d = unwrap(setRunKind(d, env, wallOf(d, 'A').runs.map((x) => x.run_id), 'base'));
    expect(cornerCabinets(room(d))).toEqual([]);
  });

  it('all pantry stays 3" clear of a window: that stretch becomes base', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    const r = setRunKind(d, env, wallOf(d, 'A').runs.map((x) => x.run_id), 'pantry');
    d = unwrap(r);
    expect(spans(wallOf(d, 'A'))).toEqual([
      [2.25, 45, 'pantry'],
      [45, 87, 'base'],
      [87, 141.75, 'pantry'],
    ]);
    expect(notices(r)).toEqual(['Pantry stays 3" clear of the window. The part under the window is base cabinets.']);
    expect(passes(d)).toEqual([]);
  });

  it('a run split at the window edge, then made pantry: no tiny cabinet; the 3" goes to the run under the window', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    d = unwrap(splitRun(d, env, wallOf(d, 'A').runs[0]!.run_id));
    const [left, right] = [...wallOf(d, 'A').runs].sort((a, b) => a.offset - b.offset);
    // The divider dragged to the window's own edge (48"), not 3" clear of it.
    d = unwrap(moveJoint(d, env, left!.run_id, right!.run_id, 48 * IN));
    const r = setRunKind(d, env, [left!.run_id], 'pantry');
    d = unwrap(r);
    expect(spans(wallOf(d, 'A'))).toEqual([
      [2.25, 45, 'pantry'],
      [45, 141.75, 'base_upper'],
    ]);
    // The pantry part keeps the run's id, so it stays selected.
    expect(wallOf(d, 'A').runs.find((x) => x.run_id === left!.run_id)?.kind).toBe('pantry');
    expect(notices(r)).toEqual(['Pantry stops 3" clear of the window.']);
    expect(passes(d)).toEqual([]);
  });

  it('pantry on both sides of a window: no 3" upper between the pantry and the window (owner screenshot, 2026-11-07)', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    // Split into three: up to the window's edge, the window, and after it (window at 48"–84").
    d = unwrap(splitRun(d, env, wallOf(d, 'A').runs[0]!.run_id));
    const [left, rest] = [...wallOf(d, 'A').runs].sort((a, b) => a.offset - b.offset);
    d = unwrap(moveJoint(d, env, left!.run_id, rest!.run_id, 48 * IN));
    d = unwrap(splitRun(d, env, rest!.run_id));
    const [, middle, right] = [...wallOf(d, 'A').runs].sort((a, b) => a.offset - b.offset);
    d = unwrap(moveJoint(d, env, middle!.run_id, right!.run_id, 84 * IN));
    d = unwrap(setRunKind(d, env, [left!.run_id, right!.run_id], 'pantry'));
    expect(spans(wallOf(d, 'A'))).toEqual([
      [2.25, 45, 'pantry'],
      [45, 87, 'base_upper'],
      [87, 141.75, 'pantry'],
    ]);
    // The base + upper run in front of the window: base all along it, but no uppers in the
    // 3" either side of the window (too short to be a cabinet), and none over the window.
    const w = wallOf(d, 'A');
    const mid = w.runs.find((x) => x.kind === 'base_upper')!;
    expect(upperPieces(w, mid)).toEqual([]);
  });

  it('uppers skip windows and leave no piece shorter than the minimum run', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(drawRun(k, env, wallOf(k, 'A').wall_id, 44 * IN, 120 * IN));
    const w = wallOf(d, 'A');
    // Window at 48"–84": the 4" before it is too short for an upper; the 36" after it is kept.
    expect(upperPieces(w, w.runs[0]!).map((p) => [p.start / IN, p.end / IN])).toEqual([[84, 120]]);
    d = unwrap(setRunKind(d, env, [w.runs[0]!.run_id], 'base'));
    expect(upperPieces(wallOf(d, 'A'), wallOf(d, 'A').runs[0]!)).toEqual([]);
  });

  it('a run that stops at a window edge, made pantry, stops 3" short with nothing after it', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(drawRun(k, env, wallOf(k, 'A').wall_id, 10 * IN, 48 * IN));
    d = unwrap(setRunKind(d, env, wallOf(d, 'A').runs.map((x) => x.run_id), 'pantry'));
    expect(spans(wallOf(d, 'A'))).toEqual([[10, 45, 'pantry']]);
  });

  it('upper only takes the upper-only depth, and back again', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'C').wall_id));
    const ids = wallOf(d, 'C').runs.map((x) => x.run_id);
    d = unwrap(setRunKind(d, env, ids, 'upper'));
    expect(wallOf(d, 'C').runs[0]!.depth).toBe(12 * IN);
    d = unwrap(setRunKind(d, env, ids, 'base'));
    expect(wallOf(d, 'C').runs[0]!.depth).toBe(24 * IN);
    d = unwrap(setRunDepth(d, env, ids, 30 * IN));
    expect(wallOf(d, 'C').runs[0]!.depth).toBe(30 * IN);
  });

  it('split cuts at the middle, moved clear of a window', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'A').wall_id));
    d = unwrap(splitRun(d, env, wallOf(d, 'A').runs[0]!.run_id));
    // The middle (72") is in front of the window (45"–87" with clearance): the nearer clear edge is 87".
    expect(spans(wallOf(d, 'A'))).toEqual([
      [2.25, 87, 'base_upper'],
      [87, 141.75, 'base_upper'],
    ]);
    d = unwrap(fillWall(d, env, wallOf(d, 'B').wall_id));
    d = unwrap(splitRun(d, env, wallOf(d, 'B').runs[0]!.run_id));
    expect(spans(wallOf(d, 'B'))).toEqual([
      [2.25, 60, 'base_upper'],
      [60, 117.75, 'base_upper'],
    ]);
  });

  it('the divider between split parts moves both, within limits', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(fillWall(k, env, wallOf(k, 'B').wall_id));
    d = unwrap(splitRun(d, env, wallOf(d, 'B').runs[0]!.run_id));
    const [left, right] = [...wallOf(d, 'B').runs].sort((a, b) => a.offset - b.offset);
    d = unwrap(moveJoint(d, env, left!.run_id, right!.run_id, 48 * IN));
    expect(spans(wallOf(d, 'B'))).toEqual([
      [2.25, 48, 'base_upper'],
      [48, 117.75, 'base_upper'],
    ]);
    expect(moveJoint(d, env, left!.run_id, right!.run_id, 4 * IN).ok).toBe(false);
  });

  it('a run slides along its wall, keeping its length, with its appliances, up to what is beside it', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(drawRun(k, env, wallOf(k, 'C').wall_id, 70 * IN, 100 * IN));
    d = unwrap(placeAppliance(d, env, 'dishwasher', wallOf(d, 'C').wall_id, 85 * IN, SNAP));
    const run = wallOf(d, 'C').runs[0]!;
    const before = wallOf(d, 'C').appliances[0]!.offset;
    d = unwrap(moveRun(d, env, run.run_id, 80 * IN));
    expect(spans(wallOf(d, 'C'))).toEqual([[80, 110, 'base_upper']]);
    expect(wallOf(d, 'C').appliances[0]!.offset).toBe(before + 10 * IN);
    // Wall C has no door: the run can slide from the inside corner (2 1/4") to 141 3/4" - 30".
    expect(moveRun(d, env, run.run_id, 120 * IN)).toEqual({ ok: false, reason: 'That run can only slide between 2 1/4" and 111 3/4" from the start of the wall.' });
  });

  it('an end handle stops at the wall, doorways and appliances', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(drawRun(k, env, wallOf(k, 'D').wall_id, 70 * IN, 100 * IN));
    const run = wallOf(d, 'D').runs[0]!;
    expect(runEndLimits(room(d), run.run_id, 'start')).toEqual({ min: 65 * IN, max: 91 * IN });
    expect(runEndLimits(room(d), run.run_id, 'end')).toEqual({ min: 79 * IN, max: 117.75 * IN });
    expect(setRunEnd(d, env, run.run_id, 'end', 120 * IN).ok).toBe(false);
    d = unwrap(setRunEnd(d, env, run.run_id, 'end', 117.75 * IN));
    expect(spans(wallOf(d, 'D'))).toEqual([[70, 117.75, 'base_upper']]);
    expect(setRunEnd(d, env, run.run_id, 'start', 60 * IN).ok).toBe(false);
    d = unwrap(setRunLength(d, env, run.run_id, 30 * IN));
    expect(spans(wallOf(d, 'D'))).toEqual([[70, 100, 'base_upper']]);
    // Longer than fits after the run: its start moves back instead.
    d = unwrap(setRunLength(d, env, run.run_id, 52 * IN));
    expect(spans(wallOf(d, 'D'))).toEqual([[65.75, 117.75, 'base_upper']]);
    expect(setRunLength(d, env, run.run_id, 60 * IN)).toEqual({ ok: false, reason: 'There is only room for 52 3/4" of cabinets here.' });
  });
});

describe('appliances', () => {
  function withA(): { d: Draft; env: Env } {
    const k = bareKitchen();
    const env = testEnv();
    return { d: unwrap(fillWall(k, env, wallOf(k, 'A').wall_id)), env };
  }

  it('a sink near a window centres under it and brings a dishwasher', () => {
    const { d: start, env } = withA();
    const r = placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 72 * IN, SNAP);
    const d = unwrap(r);
    const [sink, dw] = wallOf(d, 'A').appliances;
    expect(sink).toMatchObject({ kind: 'sink', offset: 50 * IN, paired_with: null, width: { value: 32 * IN, provenance: 'unmeasured' } });
    expect(dw).toMatchObject({ kind: 'dishwasher', offset: 82 * IN, paired_with: sink!.placement_id });
    // Centred: nothing to warn about, so no notice about the window.
    expect(notices(r)).toEqual(['Dishwasher added beside the sink. Select it to move it to the other side.']);
    expect(passes(d)).toEqual([]);
  });

  it('a sink dragged over a window can sit off centre; it snaps back only near the centre', () => {
    const { d: start, env } = withA();
    let d = unwrap(placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 66 * IN, SNAP));
    const sinkId = wallOf(d, 'A').appliances.find((a) => a.kind === 'sink')!.placement_id;
    const sinkAt = (x: Draft) => wallOf(x, 'A').appliances.find((a) => a.kind === 'sink')!.offset / IN;
    const drag = { ...SNAP, centreSnap: 3 * IN };
    // The window is 48"-84" (centre 66"); the sink is 32" wide. Dragged 8" left of centre: it
    // stays there, with a (yellow) notice that it is off centre.
    const off = moveAppliance(d, env, sinkId, wallOf(d, 'A').wall_id, 58 * IN, drag);
    d = unwrap(off);
    expect(sinkAt(d)).toBe(42);
    expect(notices(off)).toContain('The sink is not centred under the window: it is 8" off centre.');
    // Within 3" of the centre: it snaps back to centre, and there is no window notice.
    const r = moveAppliance(d, env, sinkId, wallOf(d, 'A').wall_id, 64 * IN, drag);
    expect(sinkAt(unwrap(r))).toBe(50);
    expect(notices(r).filter((n) => n.includes('window'))).toEqual([]);
    // Moved clear of the window altogether: no notice either.
    const away = moveAppliance(unwrap(r), env, sinkId, wallOf(d, 'A').wall_id, 120 * IN, drag);
    expect(notices(away).filter((n) => n.includes('window'))).toEqual([]);
    // Alt held (no snapping): exactly where it was dragged.
    d = unwrap(moveAppliance(d, env, sinkId, wallOf(d, 'A').wall_id, 64 * IN, { ...SNAP, centreSnap: 0 }));
    expect(sinkAt(d)).toBe(48);
    // A sink dropped from the tray still centres from anywhere near the window.
    const placed = unwrap(placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 58 * IN, SNAP));
    expect(sinkAt(placed)).toBe(50);
  });

  it('a second sink brings no second dishwasher; the dishwasher can swap sides', () => {
    const { d: start, env } = withA();
    let d = unwrap(placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 66 * IN, SNAP));
    d = unwrap(placeAppliance(d, env, 'sink', wallOf(d, 'A').wall_id, 120 * IN, SNAP));
    expect(wallOf(d, 'A').appliances.filter((a) => a.kind === 'dishwasher')).toHaveLength(1);
    const dw = wallOf(d, 'A').appliances.find((a) => a.kind === 'dishwasher')!;
    d = unwrap(flipPartner(d, env, dw.placement_id));
    expect(wallOf(d, 'A').appliances.find((a) => a.kind === 'dishwasher')!.offset).toBe(26 * IN);
    expect(passes(d)).toEqual([]);
  });

  it('moving the sink brings its dishwasher; dragging the dishwasher away unties it', () => {
    const { d: start, env } = withA();
    let d = unwrap(placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 66 * IN, SNAP));
    const sink = wallOf(d, 'A').appliances.find((a) => a.kind === 'sink')!;
    d = unwrap(moveAppliance(d, env, sink.placement_id, wallOf(d, 'C').wall_id, 60 * IN, SNAP));
    const c = wallOf(d, 'C');
    expect(c.appliances.map((a) => [a.kind, a.offset / IN])).toEqual([
      ['sink', 44],
      ['dishwasher', 76],
    ]);
    expect(wallOf(d, 'A').appliances).toEqual([]);
    expect(passes(d)).toEqual([]);
    const dw = c.appliances.find((a) => a.kind === 'dishwasher')!;
    const r = moveAppliance(d, env, dw.placement_id, wallOf(d, 'C').wall_id, 120 * IN, SNAP);
    expect(notices(r)).toContain('The dishwasher is no longer tied to the sink.');
    expect(wallOf(unwrap(r), 'C').appliances.find((a) => a.kind === 'dishwasher')!.paired_with).toBeNull();
  });

  it('dropped on a bare wall, an appliance gets a short run; a fridge gets a base + upper run', () => {
    const k = bareKitchen();
    const env = testEnv();
    const r = placeAppliance(k, env, 'fridge', wallOf(k, 'C').wall_id, 100 * IN, SNAP);
    const d = unwrap(r);
    expect(spans(wallOf(d, 'C'))).toEqual([[82, 118, 'base_upper']]);
    expect(notices(r)).toEqual(['Added a short run under it.']);
    expect(passes(d)).toEqual([]);
  });

  it('nothing goes in a doorway or past a wall end', () => {
    const k = bareKitchen();
    const env = testEnv();
    const d = unwrap(placeAppliance(k, env, 'range', wallOf(k, 'D').wall_id, 46 * IN, SNAP));
    const range = wallOf(d, 'D').appliances[0]!;
    // The door is 30"–62"; with 3" clearance the range lands just past it.
    expect(range.offset).toBe(65 * IN);
    expect(passes(d)).toEqual([]);
  });

  it('an appliance keeps out of the corner square, which belongs to the corner cabinet', () => {
    const { d: start, env } = withA();
    let d = unwrap(fillWall(start, env, wallOf(start, 'B').wall_id));
    d = unwrap(placeAppliance(d, env, 'range', wallOf(d, 'B').wall_id, 5 * IN, SNAP));
    expect(wallOf(d, 'B').appliances[0]!.offset).toBe(26.25 * IN); // inside corner (2 1/4") + wall A's 24" run
  });

  it('range width toggles between the standard widths only', () => {
    const { d: start, env } = withA();
    let d = unwrap(placeAppliance(start, env, 'range', wallOf(start, 'A').wall_id, 120 * IN, SNAP));
    const range = wallOf(d, 'A').appliances[0]!;
    expect(range.width.value).toBe(30 * IN);
    d = unwrap(setApplianceWidth(d, env, range.placement_id, 36 * IN));
    expect(wallOf(d, 'A').appliances[0]!.width.value).toBe(36 * IN);
    expect(setApplianceWidth(d, env, range.placement_id, 33 * IN)).toEqual({ ok: false, reason: 'A range + hood comes 30" or 36" wide.' });
  });

  it('upper only drops the appliances on it, and says so; deleting runs takes their appliances', () => {
    const { d: start, env } = withA();
    let d = unwrap(placeAppliance(start, env, 'sink', wallOf(start, 'A').wall_id, 66 * IN, SNAP));
    const r = setRunKind(d, env, wallOf(d, 'A').runs.map((x) => x.run_id), 'upper');
    expect(notices(r)).toEqual(['Removed 2 appliances that stood on it: an upper-only run has no base cabinets.']);
    expect(wallOf(unwrap(r), 'A').appliances).toEqual([]);
    const del = deleteRuns(d, env, wallOf(d, 'A').runs.map((x) => x.run_id));
    expect(notices(del)).toEqual(['Also removed 2 appliances that stood on it.']);
    d = unwrap(deleteAppliances(d, env, [wallOf(d, 'A').appliances.find((a) => a.kind === 'sink')!.placement_id]));
    expect(wallOf(d, 'A').appliances).toEqual([expect.objectContaining({ kind: 'dishwasher', paired_with: null })]);
    expect(passes(d)).toEqual([]);
  });

  it('refuses an appliance that is not on the list', () => {
    const k = bareKitchen();
    expect(placeAppliance(k, testEnv(), 'jacuzzi', wallOf(k, 'A').wall_id, 10 * IN, SNAP)).toEqual({ ok: false, reason: '"jacuzzi" is not on the list of appliances.' });
  });
});

describe('islands', () => {
  it('an island is a floating wall with a run, resized to the island depths and moved as one', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(addIsland(k, env, { x: 72 * IN, y: 60 * IN }, 'x', 72 * IN, 36 * IN));
    const island = walls(d).at(-1)!;
    expect(island.kind).toBe('floating');
    expect(island.start_point).toEqual({ x: 36 * IN, y: 60 * IN });
    expect(spans(island)).toEqual([[0, 72, 'base']]);
    expect(island.runs[0]!.depth).toBe(36 * IN);
    d = unwrap(placeAppliance(d, env, 'wine_fridge', island.wall_id, 20 * IN, SNAP));
    d = unwrap(resizeIsland(d, env, island.wall_id, 96 * IN, 42 * IN));
    expect(spans(walls(d).at(-1)!)).toEqual([[0, 96, 'base']]);
    expect(walls(d).at(-1)!.runs[0]!.depth).toBe(42 * IN);
    expect(resizeIsland(d, env, island.wall_id, 96 * IN, 40 * IN).ok).toBe(false);
    d = unwrap(moveIsland(d, env, island.wall_id, 6 * IN, -12 * IN));
    expect(walls(d).at(-1)!.start_point).toEqual({ x: 42 * IN, y: 48 * IN });
    expect(walls(d).at(-1)!.appliances).toHaveLength(1);
    expect(passes(d)).toEqual([]);
  });

  it('an island can be made on a floating wall already drawn, along its whole length', () => {
    const k = bareKitchen();
    const env = testEnv();
    let d = unwrap(addWall(k, env, { x: 40 * IN, y: 60 * IN }, { x: 112 * IN, y: 60 * IN }, null, 'floating'));
    const wall = walls(d).at(-1)!;
    d = unwrap(addIslandOnWall(d, env, wall.wall_id, 42 * IN));
    expect(spans(walls(d).at(-1)!)).toEqual([[0, 72, 'base']]);
    expect(walls(d).at(-1)!.runs[0]!.depth).toBe(42 * IN);
    expect(walls(d)).toHaveLength(5); // no second wall
    expect(addIslandOnWall(d, env, wall.wall_id, 42 * IN)).toEqual({ ok: false, reason: 'That floating wall already has cabinets on it.' });
    expect(addIslandOnWall(k, env, wallOf(k, 'A').wall_id, 36 * IN).ok).toBe(false); // a room wall is not an island
    expect(passes(d)).toEqual([]);
  });

  it('refuses a depth that is not on the list', () => {
    const k = bareKitchen();
    expect(addIsland(k, testEnv(), { x: 72 * IN, y: 60 * IN }, 'x', 72 * IN, 30 * IN).ok).toBe(false);
  });
});

describe('the layout rules file', () => {
  it('loads, with every value it needs', () => {
    expect(LAYOUT_RULES.openingClearance).toBe(3 * IN);
    expect(LAYOUT_RULES.cornerGaps).toEqual([3 * IN, 6 * IN, 9 * IN]);
    expect(LAYOUT_RULES.islandDepths).toEqual([15, 27, 36, 42, 48].map((x) => x * IN));
    expect(LAYOUT_RULES.appliances.map((a) => a.id)).toEqual([
      'fridge', 'range', 'cooktop', 'wall_oven', 'sink', 'bar_sink', 'dishwasher', 'microwave', 'wine_fridge',
      'vanity_sink', 'double_vanity_sink', 'toilet', 'tub', 'shower',
    ]);
    // The kitchen tray is today's list; every kind stays known in every room.
    expect(LAYOUT_RULES.tray.map((a) => a.id)).toEqual(['fridge', 'range', 'cooktop', 'wall_oven', 'sink', 'bar_sink', 'dishwasher', 'microwave', 'wine_fridge']);
  });

  it('gives bathrooms their own fixtures, base-only runs 21" deep (owner, 2026-11-09)', () => {
    const bath = rulesForRoom('bath');
    expect(bath.tray.map((a) => [a.id, a.widths[0]! / IN])).toEqual([['vanity_sink', 20], ['double_vanity_sink', 60], ['toilet', 30], ['tub', 60], ['shower', 48]]);
    expect(bath.defaultRunKind).toBe('base');
    expect(bath.runDepths.base).toBe(21 * IN);
    // Any other kind of room uses the kitchen's.
    expect(rulesForRoom('laundry').tray).toEqual(LAYOUT_RULES.tray);
    expect(rulesForRoom(null).runDepths.base).toBe(24 * IN);
    expect(freestandingKinds()).toEqual(['toilet', 'tub', 'shower']);
  });

  it('a toilet stands on the floor: no run is made under it, and the checks do not ask for one', () => {
    const k = bareKitchen();
    const env = testEnv();
    const d = unwrap(placeAppliance(k, env, 'toilet', wallOf(k, 'C').wall_id, 72 * IN, SNAP, rulesForRoom('bath')));
    const c = wallOf(d, 'C');
    expect(c.appliances.map((a) => a.kind)).toEqual(['toilet']);
    expect(c.runs).toEqual([]);
    expect(runChecks(RUN_CHECKS, d.job, { freestanding_kinds: freestandingKinds() }).issues).toEqual([]);
    // Without the list, the check fails closed: every appliance needs a run.
    expect(runChecks(RUN_CHECKS, d.job, {}).issues.map((i) => i.check_id)).toEqual(['layout.appliances-on-runs']);
  });

  it('a vanity sink on a bare bathroom wall gets a base-only run, 21" deep', () => {
    const k = bareKitchen();
    const d = unwrap(placeAppliance(k, testEnv(), 'vanity_sink', wallOf(k, 'C').wall_id, 72 * IN, SNAP, rulesForRoom('bath')));
    expect(wallOf(d, 'C').runs.map((r) => [r.kind, r.depth / IN])).toEqual([['base', 21]]);
  });

  it('fails loudly on a bad width or a partner that is not on the list', () => {
    const bad = structuredClone(raw) as typeof raw;
    bad.appliances[0]!.widths = ['36 1/100'];
    bad.appliances[4]!.adds_beside = 'butler';
    const r = readLayoutRules(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('fridge width');
      expect(r.reason).toContain('sink adds "butler" beside it, which is not on the list');
    }
  });
});

describe('saved drafts and undo', () => {
  it('a room saved before the layout existed loads with empty runs and appliances', () => {
    const job = examples.kitchen() as unknown as { schema_version: number; rooms: { walls: Record<string, unknown>[] }[] };
    job.schema_version = 0;
    for (const w of job.rooms[0]!.walls) {
      delete w.runs;
      delete w.appliances;
    }
    const up = upgradeStoredDraft({ job });
    const d = unwrap(loadJob(up.job, null));
    expect(walls(d).every((w) => w.runs.length === 0 && w.appliances.length === 0)).toBe(true);
  });

  it('one undo takes back a sink and its dishwasher together', () => {
    const k = bareKitchen();
    const env = testEnv();
    let t = startTimeline(k);
    t = commit(t, unwrap(fillWall(t.present, env, wallOf(t.present, 'A').wall_id)));
    t = commit(t, unwrap(placeAppliance(t.present, env, 'sink', wallOf(t.present, 'A').wall_id, 66 * IN, SNAP)));
    expect(wallOf(t.present, 'A').appliances).toHaveLength(2);
    t = undo(t);
    expect(wallOf(t.present, 'A').appliances).toHaveLength(0);
    expect((room(t.present) as Room).walls[0]!.runs).toHaveLength(1);
  });
});
