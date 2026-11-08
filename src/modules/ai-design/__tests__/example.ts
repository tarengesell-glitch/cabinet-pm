// An example kitchen for the design brief tests: Core's example kitchen (a 12' x 10' room with a
// window, a door, a sink and dishwasher under the window, a range and a pantry), plus an island,
// on the colony shop's catalog, with a complete set of intake answers.
import { examples, fromInches, JobSchema, type Job, type Length } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import type { KitchenIntake } from '../model/intake';

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

const pick = (option: number, label: string) => ({ status: 'selected', option_id: `opt-${option}`, label }) as const;

export function kitchenIntake(): KitchenIntake {
  return {
    room_type: 'kitchen',
    answers: {
      shape: pick(1, 'L-Shape with Island'),
      cabinet_height: pick(2, 'To the Ceiling'),
      feel: pick(3, 'Transitional'),
      material: pick(4, 'Solid painted'),
      colour_tone: pick(5, 'White doors, dark counters'),
      door_style: pick(6, 'Transitional'),
      door_colour: { status: 'confirmed', option_id: 'opt-7', label: 'Chantilly Lace' },
      counter_colour: pick(8, 'Charcoal quartz'),
      hardware: pick(9, 'All handles'),
      handle: pick(10, 'Bar pull, 6", matte black'),
      knob: { status: 'not_applicable', reason: 'all handles' },
      handle_position_doors: pick(11, 'Vertical'),
      handle_position_drawers: pick(12, 'Centred'),
      top_trim_style: pick(13, 'Flat crown'),
      top_trim_colour: pick(14, 'Match doors'),
      light_valance: pick(15, 'Hidden'),
      light_valance_colour: { status: 'not_applicable', reason: 'the light valance is hidden' },
      corner_insert: pick(16, 'Lazy Susan'),
      cutlery_organizers: { status: 'selected', count: 1 },
      utility_organizers: { status: 'selected', count: 1 },
      spice_organizers: { status: 'selected', count: 0 },
      tray_organizers: { status: 'selected', count: 1 },
      garbage_recycling_cabinets: { status: 'selected', count: 1 },
      interiors: pick(17, 'White'),
      drawer_level: pick(18, 'Moderate'),
      island_own_colour: { status: 'selected', yes: true },
      island_back_panel: pick(19, 'Shaker panels'),
      island_side_panel: pick(20, 'Waterfall stone'),
      island_material: pick(21, 'Wood grain'),
      island_colour_tone: pick(22, 'Dark-medium doors, white counters'),
      island_door_style: pick(23, 'Transitional'),
      island_door_colour: pick(24, 'Walnut'),
      island_counter_colour: pick(25, 'White quartz'),
    },
  };
}
