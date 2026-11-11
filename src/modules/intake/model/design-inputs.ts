/**
 * A room's design choices as the rest of the studio needs them: the room drawing (which kind of
 * room), the design step (drawers, corner, garbage, cabinet height) and the 3D view (the look and
 * the island's panels). The intake answers stay the only saved copy; this reads them each time and
 * saves nothing.
 *
 * Every reading here reuses the intake's own: the handover's answers, the rough cabinet height and
 * the room's look. A missing answer stays missing (null, or "none" for the garbage pull-out),
 * never filled in.
 *
 * The drawer level and the island panels say exactly which case they are (owner, 2026-11-11), so
 * a consumer never has to guess:
 * - `chosen`: the saved answer is one of the question's options (or the owner's stated default);
 * - `unanswered`: the question applies to the room but has no answer yet;
 * - `not_applicable`: the question doesn't apply (a bathroom has no drawer level; a kitchen with no
 *   island has no island panels);
 * - `unrecognized`: an answer is saved but it isn't one of the question's options (an older or
 *   damaged save). It is reported as it is, never treated as unanswered or as another option.
 */
import type { Length } from '@/core/index';
import type { Look } from '../ui/art';
import { roomLook } from '../ui/pictures';
import type { Definition, FieldDef } from './definition';
import { Intake, type Answer, type IntakeState } from './engine';
import { roomHandover, roughCabinetTop, type RoomHandover } from './handover';

export type IntakeChoice =
  | { readonly status: 'chosen'; readonly option_id: string }
  | { readonly status: 'unanswered' }
  | { readonly status: 'not_applicable' }
  | { readonly status: 'unrecognized'; readonly value: string };

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
  /** The drawer level question's option ID, or why there is none. */
  readonly drawerLevel: IntakeChoice;
  /** The corner insert's option ID (lazy_susan or double_shelf), or null when not answered. */
  readonly cornerInsert: string | null;
  readonly garbage: GarbagePlace;
  /** How tall the cabinets go (the cabinet height question): a length, the ceiling, or null when not answered. */
  readonly cabinetTop: Length | 'ceiling' | null;
  /** The island's back and side panels: option IDs, or why there is none. */
  readonly islandBackPanel: IntakeChoice;
  readonly islandSidePanel: IntakeChoice;
  /** How the room looks (colours, door style, hardware). */
  readonly look: Look;
}

function roomKindOf(def: Definition, r: RoomHandover): RoomKind {
  const type = def.intake.room_types.types.find((t) => t.id === r.room_type);
  return type?.inserts === 'bath' ? 'bath' : 'kitchen';
}

const shown = (v: Answer): string => (typeof v === 'string' ? v : JSON.stringify(v));

/** One question's case for the room on screen, from the questions that apply to it now. */
function choiceOf(x: Intake, applying: ReadonlyMap<string, FieldDef>, saved: Readonly<Record<string, Answer>>, key: string): IntakeChoice {
  const f = applying.get(key);
  if (!f) return { status: 'not_applicable' };
  // Checked before the answer in force: the engine passes over an answer that isn't an option
  // (to the owner's default, or to nothing), which here would hide it.
  const v = saved[key];
  if (v !== undefined && !x.isValid(f, v)) return { status: 'unrecognized', value: shown(v) };
  const now = x.eff(f);
  if (now === undefined) return { status: 'unanswered' };
  return typeof now === 'string' ? { status: 'chosen', option_id: now } : { status: 'unrecognized', value: shown(now) };
}

/** A room's design inputs, read from its answers. Null when the room is not in the design choices. */
export function roomDesignInputs(def: Definition, state: IntakeState, roomId: string): RoomDesignInputs | null {
  const r = roomHandover(def, state, roomId);
  const look = roomLook(def, state, roomId);
  const i = state.rooms.findIndex((room) => room.id === roomId);
  const room = state.rooms[i];
  if (!r || !look || !room) return null;
  const option = (k: string): string | null => {
    const a = r.answers[k];
    return a && 'option_id' in a ? a.option_id : null;
  };
  const garbage = option('garbage_recycling') === 'yes' ? option('garbage_location') : null;
  const top = roughCabinetTop(def, state, roomId);
  const x = new Intake(def, state);
  const [drawerLevel, islandBackPanel, islandSidePanel] = x.inRoom(i, () => {
    // The questions that apply to the room, as the handover lists them.
    const carried = x.carried();
    const applying = new Map([...x.steps().flatMap((s) => (s.review ? [] : x.fields(s))), ...(carried?.fields ?? [])].map((f) => [f.key, f]));
    return ['drawer_level', 'island_back_panel', 'island_side_panel'].map((k) => choiceOf(x, applying, room.answers, k));
  });
  return {
    roomId,
    roomKind: roomKindOf(def, r),
    drawerLevel: drawerLevel!,
    cornerInsert: option('corner_insert'),
    garbage: garbage === 'under_sink' || garbage === 'dedicated_cabinet' ? garbage : 'none',
    cabinetTop: top.ok ? top.value : null,
    islandBackPanel: islandBackPanel!,
    islandSidePanel: islandSidePanel!,
    look,
  };
}
