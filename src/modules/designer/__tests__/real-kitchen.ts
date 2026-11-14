// The room geometry of a real kitchen the owner tried on 2026-11-10 (walls, openings, runs and
// appliances only, with new IDs; no client details): an L along walls A and B with a short run on
// wall C, a fridge and a range with a hood on wall A (the range in a base-only run of its own), a
// sink with its dishwasher under a window on wall B, and a 94" island.
import { JobSchema, type Job, type Room } from '@/core/index';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const m = (value: number) => ({ value, source_mm: null, provenance: 'unmeasured' as const });
const wall = (n: number, start: [number, number], end: [number, number], extra: object = {}) => ({
  wall_id: id(n),
  kind: 'room',
  start_point: { x: start[0], y: start[1] },
  end_point: { x: end[0], y: end[1] },
  entered_length: null,
  length_source_mm: null,
  length_provenance: 'unmeasured',
  thickness: m(288),
  openings: [],
  obstacles: [],
  runs: [],
  appliances: [],
  ...extra,
});

export const REAL_KITCHEN_ROOM_ID = id(1);

export function realKitchen(): Job {
  return JobSchema.parse({
    job_id: id(2),
    shop_id: '526e7ec9-47a3-5c86-9fd3-4db7010be90a',
    status: 'ai_draft',
    schema_version: 2,
    catalog_version: null,
    job_selections: {},
    history: [],
    rooms: [
      {
        room_id: REAL_KITCHEN_ROOM_ID,
        name: 'Kitchen',
        ceiling_height: m(7680),
        room_selections: {},
        items: [],
        walls: [
          wall(10, [-384, -1408], [-384, 8448], {
            runs: [
              { run_id: id(11), kind: 'base_upper', offset: 54, length: 4264, depth: 1536 },
              { run_id: id(12), kind: 'base', offset: 4318, length: 1920, depth: 1536 },
              { run_id: id(13), kind: 'base_upper', offset: 6238, length: 3474, depth: 1536 },
            ],
            appliances: [
              { placement_id: id(14), kind: 'fridge', offset: 54, width: m(2304), paired_with: null },
              { placement_id: id(15), kind: 'range', offset: 4318, width: m(1920), paired_with: null },
            ],
          }),
          wall(20, [-384, 8448], [14208, 8448], {
            openings: [
              { opening_id: id(21), kind: 'door', offset: m(10048), width: m(2240), height: m(5120), sill_height: m(0), swing: { hinge: 'start', opens: 'right' } },
              { opening_id: id(22), kind: 'window', offset: m(5504), width: m(3584), height: m(3072), sill_height: m(2304), swing: null },
            ],
            runs: [{ run_id: id(23), kind: 'base_upper', offset: 144, length: 9712, depth: 1536 }],
            appliances: [
              { placement_id: id(24), kind: 'sink', offset: 6272, width: m(2048), paired_with: null },
              { placement_id: id(25), kind: 'dishwasher', offset: 4736, width: m(1536), paired_with: id(24) },
            ],
          }),
          wall(30, [14208, 8448], [14208, 5888], { runs: [{ run_id: id(31), kind: 'base_upper', offset: 144, length: 2272, depth: 1536 }] }),
          wall(40, [14208, 5888], [12672, 5888]),
          wall(50, [12672, 5888], [12672, 512], {
            openings: [{ opening_id: id(51), kind: 'door', offset: m(1024), width: m(2304), height: m(5120), sill_height: m(0), swing: { hinge: 'start', opens: 'right' } }],
          }),
          { ...wall(60, [3520, 2752], [9536, 2752]), kind: 'floating', thickness: null, runs: [{ run_id: id(61), kind: 'base', offset: 0, length: 6016, depth: 2688 }] },
        ],
      },
    ],
  });
}

export const realKitchenRoom = (): Room => realKitchen().rooms[0]!;
