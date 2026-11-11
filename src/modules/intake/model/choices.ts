/**
 * A room's design choices, interpreted once, for the modules that build and draw the room (the
 * design studio hands them to the designer). The intake's saved answers stay the only source:
 * nothing here is saved or copied anywhere.
 *
 * Each choice the layout or the 3D view depends on says which of these it is, so a consumer never
 * has to guess (rule 7):
 * - `chosen`: the saved answer is one of the question's options (or the owner's stated default);
 * - `unanswered`: the question applies to the room but has no answer yet;
 * - `not_applicable`: the question doesn't apply to this room (a bathroom has no drawer level; a
 *   kitchen with no island has no island panels);
 * - `unrecognized`: an answer is saved but it isn't one of the question's options (an older or
 *   damaged save). It is reported as it is, never treated as unanswered or as another option.
 */
import { refuse, type Length, type Result } from '@/core/index';
import type { Definition, FieldDef } from './definition';
import { Intake, type Answer, type IntakeState } from './engine';
import { roughCabinetTop } from './handover';

export type IntakeChoice =
  | { readonly status: 'chosen'; readonly option_id: string }
  | { readonly status: 'unanswered' }
  | { readonly status: 'not_applicable' }
  | { readonly status: 'unrecognized'; readonly value: string };

export interface RoomChoices {
  readonly room_id: string;
  /** The room's cabinet set: "bath" for the room types the design choices group as bathrooms, else "kitchen". */
  readonly roomSet: 'kitchen' | 'bath';
  /** How tall the cabinets go: a length, the ceiling, or null when there is no usable answer. */
  readonly cabinetTop: Length | 'ceiling' | null;
  readonly drawerLevel: IntakeChoice;
  /** The corner insert's option ID, or null when there is none. */
  readonly cornerInsert: string | null;
  /** Where the garbage pull-out goes ("none" unless the client asked for one under the sink or in its own cabinet). */
  readonly garbage: 'none' | 'under_sink' | 'dedicated_cabinet';
  readonly islandBackPanel: IntakeChoice;
  readonly islandSidePanel: IntakeChoice;
}

/** The questions that apply to the room now, as the review and the handover list them. */
function applying(x: Intake): Map<string, FieldDef> {
  const carried = x.carried();
  const fields = [...x.steps().flatMap((s) => (s.review ? [] : x.fields(s))), ...(carried?.fields ?? [])];
  return new Map(fields.map((f) => [f.key, f]));
}

const shown = (v: Answer): string => (typeof v === 'string' ? v : JSON.stringify(v));

function choiceOf(x: Intake, fields: Map<string, FieldDef>, answers: Readonly<Record<string, Answer>>, key: string): IntakeChoice {
  const f = fields.get(key);
  if (!f) return { status: 'not_applicable' };
  // Checked before the answer in force: the engine passes over an answer that isn't an option
  // (to the owner's default, or to nothing), which here would hide it.
  const saved = answers[key];
  if (saved !== undefined && !x.isValid(f, saved)) return { status: 'unrecognized', value: shown(saved) };
  const v = x.eff(f);
  if (v === undefined) return { status: 'unanswered' };
  return typeof v === 'string' ? { status: 'chosen', option_id: v } : { status: 'unrecognized', value: shown(v) };
}

/** A room's design choices for building and drawing it. Refused only when the room isn't in the design choices. */
export function roomChoices(def: Definition, state: IntakeState, roomId: string): Result<RoomChoices> {
  const i = state.rooms.findIndex((r) => r.id === roomId);
  const room = state.rooms[i];
  if (!room) return refuse('That room is not in the design choices.');
  const x = new Intake(def, state);
  return x.inRoom(i, () => {
    const fields = applying(x);
    const choice = (key: string): IntakeChoice => choiceOf(x, fields, room.answers, key);
    const option = (key: string): string | null => {
      const c = choice(key);
      return c.status === 'chosen' ? c.option_id : null;
    };
    const garbage = option('garbage_recycling') === 'yes' ? option('garbage_location') : null;
    const type = i === 0 ? def.intake.primary_room.id : room.answers['room_type'];
    const top = roughCabinetTop(def, state, roomId);
    return {
      ok: true,
      value: {
        room_id: roomId,
        roomSet: def.intake.room_types.types.find((t) => t.id === type)?.inserts === 'bath' ? 'bath' : 'kitchen',
        cabinetTop: top.ok ? top.value : null,
        drawerLevel: choice('drawer_level'),
        cornerInsert: option('corner_insert'),
        garbage: garbage === 'under_sink' || garbage === 'dedicated_cabinet' ? garbage : 'none',
        islandBackPanel: choice('island_back_panel'),
        islandSidePanel: choice('island_side_panel'),
      },
    };
  });
}
