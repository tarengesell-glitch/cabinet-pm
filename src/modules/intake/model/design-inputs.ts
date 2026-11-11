/**
 * A room's design choices as the rest of the studio needs them: the room drawing (which kind of
 * room), the design step (drawers, corner, garbage, cabinet height) and the 3D view (the look,
 * the island's panels included). The intake answers stay the only saved copy; this reads them
 * each time and saves nothing.
 *
 * Every reading here reuses the intake's own: the handover's answers, the rough cabinet height and
 * the room's look. A missing answer stays missing (null, or "none" for the garbage pull-out),
 * never filled in.
 */
import type { Length } from '@/core/index';
import type { Look } from '../ui/art';
import { roomLook } from '../ui/pictures';
import type { Definition } from './definition';
import type { IntakeState } from './engine';
import { roomHandover, roughCabinetTop, type RoomHandover } from './handover';

/** The intake's drawer levels (its drawer_level options). */
export type DrawerLevel = 'minimum' | 'moderate' | 'maximum';
const DRAWER_LEVELS: readonly DrawerLevel[] = ['minimum', 'moderate', 'maximum'];

/**
 * Which kind of room it is for fixtures, depths and cabinets: "bath" for the room types the design
 * choices group as bathrooms (their "bath" insert set); every other room is treated as a kitchen
 * until the owner says otherwise (owner, 2026-11-09; PROPOSED for the other room types).
 */
export type RoomKind = 'kitchen' | 'bath';

/** Where the garbage pull-out goes: none (not wanted, or not answered yet), under the sink, or a cabinet of its own. */
export type GarbagePlace = 'none' | 'under_sink' | 'dedicated_cabinet';

export interface RoomDesignInputs {
  readonly roomId: string;
  readonly roomKind: RoomKind;
  /** Null when not answered. */
  readonly drawerLevel: DrawerLevel | null;
  /** The corner insert's option ID (lazy_susan or double_shelf), or null when not answered. */
  readonly cornerInsert: string | null;
  readonly garbage: GarbagePlace;
  /** How tall the cabinets go (the cabinet height question): a length, the ceiling, or null when not answered. */
  readonly cabinetTop: Length | 'ceiling' | null;
  /** How the room looks (colours, door style, hardware, the island's back and side panels). */
  readonly look: Look;
}

function roomKindOf(def: Definition, r: RoomHandover): RoomKind {
  const type = def.intake.room_types.types.find((t) => t.id === r.room_type);
  return type?.inserts === 'bath' ? 'bath' : 'kitchen';
}

/** A room's design inputs, read from its answers. Null when the room is not in the design choices. */
export function roomDesignInputs(def: Definition, state: IntakeState, roomId: string): RoomDesignInputs | null {
  const r = roomHandover(def, state, roomId);
  const look = roomLook(def, state, roomId);
  if (!r || !look) return null;
  const option = (k: string): string | null => {
    const a = r.answers[k];
    return a && 'option_id' in a ? a.option_id : null;
  };
  const drawers = option('drawer_level');
  const garbage = option('garbage_recycling') === 'yes' ? option('garbage_location') : null;
  const top = roughCabinetTop(def, state, roomId);
  return {
    roomId,
    roomKind: roomKindOf(def, r),
    drawerLevel: DRAWER_LEVELS.find((d) => d === drawers) ?? null,
    cornerInsert: option('corner_insert'),
    garbage: garbage === 'under_sink' || garbage === 'dedicated_cabinet' ? garbage : 'none',
    cabinetTop: top.ok ? top.value : null,
    look,
  };
}
