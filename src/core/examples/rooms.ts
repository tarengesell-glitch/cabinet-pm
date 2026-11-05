// Hand-written example master copies (room shell). Both must pass every wall check.
// Used by Core's tests and loadable in the room preview.
import { pointFromLengthAndAngle, type Point } from '../geometry';
import { JobSchema, SCHEMA_VERSION, type Job, type Wall } from '../schema/master-copy';
import { ft, id, inch, measured } from './helpers';

const WALL_HEIGHT = measured(ft(8));
const THICKNESS = measured(inch(4, 1, 2));

function wall(n: number, start: Point, end: Point, extra: Partial<Wall> = {}): Wall {
  return {
    wall_id: id(n),
    start_point: start,
    end_point: end,
    entered_length: null,
    length_source_mm: null,
    length_provenance: 'measured',
    height: WALL_HEIGHT,
    thickness: THICKNESS,
    openings: [],
    obstacles: [],
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
        }),
        wall(102, b, c),
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
      ceiling_height: measured(ft(8), 'rough'),
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
            },
          ],
        }),
        wall(404, d, e),
        wall(405, e, a),
      ],
    },
  ]);
}
