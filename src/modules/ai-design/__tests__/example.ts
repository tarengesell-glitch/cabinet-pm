// An example kitchen for the design brief tests: Core's example kitchen (a 12' x 10' room with a
// window, a door, a sink and dishwasher under the window, a range and a pantry), plus an island,
// on the colony shop's catalog, with a finished set of design choices.
import { examples, fromInches, JobSchema, type Job, type Length } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import type { RoomHandover } from '@/modules/intake/contract';
import handover from './kitchen-handover.json';

function inch(whole: number): Length {
  const r = fromInches(whole);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const KITCHEN_ROOM_ID = id(100);

export function kitchenWithIsland(): Job {
  const base = examples.kitchen();
  const [room] = base.rooms;
  if (!room) throw new Error('The example kitchen has no room.');
  return JobSchema.parse({
    ...base,
    shop_id: CURRENT_CATALOG.shop.id,
    rooms: [
      {
        ...room,
        walls: [
          ...room.walls,
          {
            wall_id: id(105),
            kind: 'floating',
            start_point: { x: inch(36), y: inch(66) },
            end_point: { x: inch(108), y: inch(66) },
            entered_length: null,
            length_source_mm: null,
            length_provenance: 'unmeasured',
            thickness: null,
            openings: [],
            obstacles: [],
            runs: [{ run_id: id(604), kind: 'base', offset: 0, length: inch(72), depth: inch(36) }],
            appliances: [],
          },
        ],
      },
    ],
  });
}

/**
 * A finished kitchen, exactly as the intake hands it over (`intakeHandover`): an L-shape with an
 * island, cabinets to the ceiling, handles only, a lazy Susan, a dedicated garbage cabinet with
 * two slide-outs, and moderate drawers. Made by answering the real intake questions (2026-11-09),
 * so every option ID is the intake's own. A copy, so tests can change it freely.
 */
export function kitchenIntake(): RoomHandover {
  return structuredClone(handover) as RoomHandover;
}

/**
 * The room drawing's layout numbers, copied from the designer's data/layout-rules.json on
 * 2026-11-09 for these tests (the app hands the builder the real ones).
 */
export const LAYOUT_NUMBERS = {
  openingClearance: inch(3),
  upperBand: inch(13),
  minRunLength: inch(9),
  appliances: [
    { kind: 'fridge', comesWithHood: false, ownUpper: true },
    { kind: 'range', comesWithHood: true, ownUpper: false },
    { kind: 'cooktop', comesWithHood: true, ownUpper: false },
    { kind: 'wall_oven', comesWithHood: false, ownUpper: false },
    { kind: 'sink', comesWithHood: false, ownUpper: false },
    { kind: 'bar_sink', comesWithHood: false, ownUpper: false },
    { kind: 'dishwasher', comesWithHood: false, ownUpper: false },
    { kind: 'microwave', comesWithHood: false, ownUpper: false },
    { kind: 'wine_fridge', comesWithHood: false, ownUpper: false },
  ],
} as const;
