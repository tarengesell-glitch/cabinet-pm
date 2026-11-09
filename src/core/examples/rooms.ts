// Hand-written example master copies. Both must pass every wall and rough-layout check.
// Used by Core's tests and loadable in the room preview.
import { pointFromLengthAndAngle, type Point } from '../geometry';
import { JobSchema, SCHEMA_VERSION, type Job, type PlacedItem, type Wall } from '../schema/master-copy';
import { ft, id, inch, measured } from './helpers';

const THICKNESS = measured(inch(4, 1, 2));

function wall(n: number, start: Point, end: Point, extra: Partial<Wall> = {}): Wall {
  return {
    wall_id: id(n),
    kind: 'room',
    start_point: start,
    end_point: end,
    entered_length: null,
    length_source_mm: null,
    length_provenance: 'confirmed',
    thickness: THICKNESS,
    openings: [],
    obstacles: [],
    runs: [],
    appliances: [],
    ...extra,
  };
}

function job(jobId: number, rooms: Job['rooms']): Job {
  return JobSchema.parse({
    schema_version: SCHEMA_VERSION,
    job_id: id(jobId),
    shop_id: id(9000),
    catalog_version: null,
    status: 'draft',
    job_selections: {},
    rooms,
    history: [
      { at: '2026-11-05T12:00:00-06:00', by: id(9001), origin: 'designer', summary: 'Drew the room' },
    ],
  });
}

/** A 12' x 10' kitchen drawn counter-clockwise, a window on wall 1 and a door on wall 4. */
export function kitchen(): Job {
  const a = { x: 0, y: 0 };
  const b = { x: ft(12), y: 0 };
  const c = { x: ft(12), y: ft(10) };
  const d = { x: 0, y: ft(10) };
  return job(1, [
    {
      room_id: id(100),
      name: 'Kitchen',
      ceiling_height: measured(ft(8)),
      room_selections: {},
      items: [],
      walls: [
        wall(101, a, b, {
          openings: [
            {
              opening_id: id(201),
              kind: 'window',
              offset: measured(inch(48)),
              width: measured(inch(36)),
              height: measured(inch(40)),
              sill_height: measured(inch(42)),
              swing: null,
            },
          ],
          obstacles: [
            {
              obstacle_id: id(301),
              kind: 'outlet',
              offset: measured(inch(20)),
              elevation: measured(inch(44)),
              width: measured(inch(2, 3, 4)),
              height: measured(inch(4, 1, 2)),
            },
          ],
          // The rough layout: cabinets along the whole wall, the sink centred under the
          // window and its dishwasher beside it.
          runs: [{ run_id: id(601), kind: 'base_upper', offset: 0, length: ft(12), depth: inch(24) }],
          appliances: [
            { placement_id: id(701), kind: 'sink', offset: inch(50), width: measured(inch(32), 'unmeasured'), paired_with: null },
            { placement_id: id(702), kind: 'dishwasher', offset: inch(82), width: measured(inch(24), 'unmeasured'), paired_with: id(701) },
          ],
        }),
        wall(102, b, c, {
          runs: [
            { run_id: id(602), kind: 'base_upper', offset: 0, length: ft(6), depth: inch(24) },
            { run_id: id(603), kind: 'pantry', offset: ft(6), length: inch(30), depth: inch(24) },
          ],
          appliances: [{ placement_id: id(703), kind: 'range', offset: inch(30), width: measured(inch(30), 'unmeasured'), paired_with: null }],
        }),
        wall(103, c, d),
        wall(104, d, a, {
          openings: [
            {
              opening_id: id(202),
              kind: 'door',
              offset: measured(inch(30)),
              width: measured(inch(32)),
              height: measured(inch(80)),
              sill_height: measured(0),
              // Wall 4 runs down the left side of a counter-clockwise room: inside is its left.
              swing: { hinge: 'start', opens: 'left' },
            },
          ],
        }),
      ],
    },
  ]);
}

/** An L-shaped room with one 45° wall whose corner had to be rounded to 1/64". */
export function lShapeWithAngledWall(): Job {
  const a = { x: 0, y: 0 };
  const b = { x: ft(12), y: 0 };
  const c = { x: ft(12), y: ft(4) };
  const slanted = pointFromLengthAndAngle(c, ft(4), 13500); // 4' at 135°
  if (!slanted.ok) throw new Error(slanted.reason);
  const d = slanted.value.point;
  const e = { x: 0, y: d.y };
  return job(2, [
    {
      room_id: id(400),
      name: 'Laundry',
      ceiling_height: measured(ft(8), 'unmeasured'),
      room_selections: {},
      items: [],
      walls: [
        wall(401, a, b, {
          openings: [
            {
              opening_id: id(501),
              kind: 'passthrough',
              offset: measured(inch(24)),
              width: measured(inch(36)),
              height: measured(inch(84)),
              sill_height: measured(0),
              swing: null,
            },
          ],
        }),
        wall(402, b, c),
        wall(403, c, d, {
          entered_length: slanted.value.entered_length,
          openings: [
            {
              // Exactly as wide as the slanted wall's typed length minus 6": must fit.
              opening_id: id(502),
              kind: 'window',
              offset: measured(inch(3)),
              width: measured(ft(4) - inch(6)),
              height: measured(inch(30)),
              sill_height: measured(inch(40)),
              swing: null,
            },
          ],
        }),
        wall(404, d, e),
        wall(405, e, a),
      ],
    },
  ]);
}

/**
 * The 12' x 10' kitchen with cabinets placed on wall A: two bases, a sink base under the window
 * and an upper clear of it. Catalog IDs here are stand-ins (Core knows no catalog).
 * Wall A starts at the outside of wall D's centre line, so the inside corner is half of
 * wall D's 4 1/2" thickness from wall A's start: 2 1/4".
 */
export function kitchenWithCabinets(): Job {
  const j = kitchen();
  const room = j.rooms[0]!;
  const wallA = room.walls[0]!.wall_id;
  const item = (n: number, offset: number, width: number, opts: { elevation?: number; height?: number; depth?: number } = {}): PlacedItem => ({
    item_instance_id: id(n),
    catalog_item_id: id(n + 50),
    width,
    height: opts.height ?? inch(34, 3, 4),
    depth: opts.depth ?? inch(23, 3, 4),
    position: { wall_id: wallA, side: 'left', offset, elevation: opts.elevation ?? 0, setback: 0 },
    item_selections: {},
    modifications: [],
    origin: { placed_by: 'designer', last_edited_by: 'designer', approved: true },
    notes: '',
  });
  const start = inch(2, 1, 4);
  return JobSchema.parse({
    ...j,
    rooms: [
      {
        ...room,
        items: [
          item(801, start, inch(24)),
          item(802, start + inch(24), inch(21, 3, 4)),
          // The sink base, centred under the window (48" to 84"): 48 + 18 = 66, so it starts at 48".
          item(803, inch(48), inch(36)),
          // An upper at 54" off the floor, 30" tall, clear of the window.
          item(804, start, inch(30), { elevation: inch(54), height: inch(30), depth: inch(12) }),
        ],
      },
    ],
  });
}
