import { describe, expect, it } from 'vitest';
import { examples } from '../index';
import { ft, inch } from '../examples/helpers';
import {
  centreLengthFor,
  cornerCabinets,
  distanceToFace,
  insideLength,
  doorwayZones,
  insideSpan,
  neighbours,
  runAtEnd,
  runAtStart,
  subtract,
  upperDepth,
  upperPieces,
  wallLength,
  windowZones,
} from '../layout/room-geometry';

// Core's example kitchen: 12' x 10' on the walls' centre lines, walls 4 1/2" thick, drawn
// counter-clockwise. Wall A (0,0)→(12',0) has a window at 48"–84", a base + upper run along its
// whole length, a sink at 50" and a dishwasher at 82". Wall B starts at A's end with a base +
// upper run (0–6') then a pantry (6'–8'6"). Wall D has a door at 30"–62".
const room = () => examples.kitchen().rooms[0]!;
const wall = (i: number) => room().walls[i]!;
const run = (w: number, r = 0) => wall(w).runs[r]!;

describe('where cabinets can stand along a wall', () => {
  it('runs between the inside corners: half a wall thickness in from each centre-line corner', () => {
    expect(wallLength(wall(0))).toBe(ft(12));
    expect(insideSpan(room(), wall(0))).toEqual({ start: inch(2, 1, 4), end: ft(12) - inch(2, 1, 4) });
    expect(insideSpan(room(), wall(1))).toEqual({ start: inch(2, 1, 4), end: ft(10) - inch(2, 1, 4) });
  });

  it('is a floating wall’s whole length (an island stands on its line)', () => {
    const r = room();
    const island = { ...wall(0), wall_id: '00000000-0000-4000-8000-000000000999', kind: 'floating' as const, thickness: null, openings: [], obstacles: [], start_point: { x: ft(3), y: ft(5) }, end_point: { x: ft(9), y: ft(5) } };
    const withIsland = { ...r, walls: [...r.walls, island] };
    expect(insideSpan(withIsland, island)).toEqual({ start: 0, end: ft(6) });
    expect(neighbours(withIsland, island)).toEqual({ before: null, after: null });
  });

  it('finds the walls joined at each end', () => {
    const n = neighbours(room(), wall(0));
    expect(n.before?.wall_id).toBe(wall(3).wall_id);
    expect(n.after?.wall_id).toBe(wall(1).wall_id);
  });
});

describe('what is kept clear', () => {
  it('widens doors and windows by the clearance it is given, never past the wall', () => {
    expect(windowZones(wall(0), inch(3))).toEqual([{ start: inch(45), end: inch(87) }]);
    expect(doorwayZones(wall(3), inch(3))).toEqual([{ start: inch(27), end: inch(65) }]);
    expect(doorwayZones(wall(3), inch(40))).toEqual([{ start: 0, end: inch(102) }]);
    expect(doorwayZones(wall(0), inch(3))).toEqual([]);
  });

  it('cuts stretches out of a span, keeping anything that only touches', () => {
    expect(subtract({ start: 0, end: 100 }, [{ start: 20, end: 30 }, { start: 30, end: 40 }, { start: 100, end: 120 }])).toEqual([
      { start: 0, end: 20 },
      { start: 40, end: 100 },
    ]);
  });
});

describe('corners', () => {
  it('finds a corner cabinet where runs on two walls meet, with each side’s depth', () => {
    const corners = cornerCabinets(room(), inch(13));
    expect(corners).toEqual([
      {
        endingWallId: wall(0).wall_id,
        startingWallId: wall(1).wall_id,
        corner: { x: ft(12) - inch(2, 1, 4), y: inch(2, 1, 4) },
        base: true,
        upper: true,
        baseDepths: { ending: inch(24), starting: inch(24) },
        upperDepths: { ending: inch(13), starting: inch(13) },
      },
    ]);
    expect(runAtEnd(room(), wall(0))?.run_id).toBe(run(0).run_id);
    expect(runAtStart(room(), wall(1))?.run_id).toBe(run(1).run_id);
    // Wall B's last run (the pantry) stops at 8'6", short of the corner with wall C.
    expect(runAtEnd(room(), wall(1))).toBeNull();
  });

  it('uses the depth it is given for the upper band, or the run’s own depth if that is less', () => {
    expect(upperDepth(run(0), inch(13))).toBe(inch(13));
    expect(upperDepth(run(0), inch(30))).toBe(inch(24));
    expect(upperDepth({ ...run(0), kind: 'upper', depth: inch(12) }, inch(13))).toBe(inch(12));
  });
});

describe('where the uppers go', () => {
  it('skips windows and any appliance that gets its own upper, and drops pieces shorter than the minimum', () => {
    expect(upperPieces(wall(0), run(0), { minRun: inch(9), ownUpperKinds: new Set(['fridge']) })).toEqual([
      { start: 0, end: inch(48) },
      { start: inch(84), end: ft(12) },
    ]);
    expect(upperPieces(wall(0), run(0), { minRun: inch(9), ownUpperKinds: new Set(['dishwasher']) })).toEqual([
      { start: 0, end: inch(48) },
      { start: inch(106), end: ft(12) },
    ]);
    expect(upperPieces(wall(0), run(0), { minRun: inch(40), ownUpperKinds: new Set(['dishwasher']) })).toEqual([{ start: 0, end: inch(48) }]);
  });

  it('gives no upper band to base-only or pantry runs', () => {
    expect(upperPieces(wall(1), run(1, 1), { minRun: inch(9), ownUpperKinds: new Set() })).toEqual([]);
    expect(upperPieces(wall(0), { ...run(0), kind: 'base' }, { minRun: inch(9), ownUpperKinds: new Set() })).toEqual([]);
  });
});

describe('inside lengths, as measured on site (owner, 2026-11-09)', () => {
  // An ensuite like the owner's: three walls in a U, 4 1/2" thick, the back wall between the two sides.
  const t = inch(4, 1, 2);
  const wall = (n: number, a: { x: number; y: number }, b: { x: number; y: number }) => ({
    ...examples.kitchen().rooms[0]!.walls[0]!,
    wall_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    start_point: a,
    end_point: b,
    thickness: { value: t, provenance: 'unmeasured' as const, source_mm: null },
    openings: [],
    obstacles: [],
    runs: [],
    appliances: [],
  });
  const ensuite = (back: number) => {
    const r = room();
    return { ...r, walls: [wall(1, { x: 0, y: ft(5) }, { x: 0, y: 0 }), wall(2, { x: 0, y: 0 }, { x: back, y: 0 }), wall(3, { x: back, y: 0 }, { x: back, y: ft(5) })] };
  };

  it('a 44" ensuite is 48 1/2" between the walls\' centre lines, and shows 44"', () => {
    const r = ensuite(inch(44) + t);
    expect(insideLength(r, r.walls[1]!)).toEqual({ value: inch(44), exact: true });
    expect(centreLengthFor(r, r.walls[1]!, inch(44))).toBe(inch(48, 1, 2));
  });

  it('is the whole length for a wall with no neighbours, and for a floating wall', () => {
    const r = ensuite(inch(60));
    const lone = { ...r, walls: [r.walls[1]!] };
    expect(insideLength(lone, lone.walls[0]!)).toEqual({ value: inch(60), exact: true });
    expect(centreLengthFor(lone, lone.walls[0]!, inch(44))).toBe(inch(44));
  });

  it('says when a slanted corner rounds it', () => {
    const r = examples.lShapeWithAngledWall().rooms[0]!;
    const slanted = r.walls.find((w) => w.start_point.x !== w.end_point.x && w.start_point.y !== w.end_point.y)!;
    expect(insideLength(r, slanted).exact).toBe(false);
  });
});

describe('the distance to the opposing wall (owner, 2026-11-09)', () => {
  it('runs from a point to the first inside face in that direction', () => {
    const r = room();
    // From the middle of the room, straight up: the inside face of wall C (10' centre line, 2 1/4" in).
    expect(distanceToFace(r, { x: ft(6), y: ft(5) }, { x: 0, y: 1 })).toBe(ft(5) - inch(2, 1, 4));
    // From the front of a 24" run on wall A (2 1/4" + 24" in), straight across.
    expect(distanceToFace(r, { x: ft(6), y: inch(26, 1, 4) }, { x: 0, y: 1 }, r.walls[0]!.wall_id)).toBe(ft(10) - inch(2, 1, 4) - inch(26, 1, 4));
    // Out of the room through a wall: the first face it meets.
    expect(distanceToFace(r, { x: ft(6), y: ft(5) }, { x: -1, y: 0 })).toBe(ft(6) - inch(2, 1, 4));
  });
});
