/**
 * What the intake hands to other modules (AI Design reads these as the client's design desires,
 * OA-3). One record per room. The option ID is the source of truth; the label is how the client
 * saw it. Only questions that apply to the room are included, and an unanswered one is left
 * out, never filled in (rule 7). `complete` says whether every question that applies is answered.
 */
import { fromInches, refuse, type Length, type Result } from '@/core/index';
import type { Definition } from './definition';
import { heightLength, Intake, type IntakeState } from './engine';

export type HandoverAnswer =
  | { readonly status: 'selected'; readonly option_id: string; readonly label: string }
  | { readonly status: 'selected'; readonly count: number }
  | { readonly status: 'selected'; readonly option_ids: readonly string[]; readonly labels: readonly string[] }
  | { readonly status: 'selected'; readonly text: string }
  | { readonly status: 'selected'; readonly length: Length; readonly text: string };

export interface RoomHandover {
  readonly room_id: string;
  /** The primary room's ID (kitchen) or the room type the client picked. */
  readonly room_type: string;
  readonly name: string;
  readonly complete: boolean;
  /** For a matched or suggested room: where its design came from, in words. */
  readonly design_from: string | null;
  readonly answers: Readonly<Record<string, HandoverAnswer>>;
}

export function intakeHandover(def: Definition, state: IntakeState): RoomHandover[] {
  const x = new Intake(def, state);
  return state.rooms.map((room, i) =>
    x.inRoom(i, () => {
      const carried = x.carried();
      const fields = [...x.steps().flatMap((s) => (s.review ? [] : x.fields(s))), ...(carried?.fields ?? [])];
      const answers: Record<string, HandoverAnswer> = {};
      for (const f of fields) {
        const v = x.eff(f);
        const label = x.label(f);
        if (v === undefined || label === null) continue;
        if (f.type === 'height' && typeof v === 'object' && !Array.isArray(v)) {
          const h = heightLength(v as { ft: string; in: string });
          if (h.ok) answers[f.key] = { status: 'selected', length: h.value, text: label };
        } else if (f.type === 'count' && typeof v === 'string') answers[f.key] = { status: 'selected', count: Number(v) };
        else if (f.type === 'text' && typeof v === 'string') answers[f.key] = { status: 'selected', text: label };
        else if (Array.isArray(v)) {
          const os = x.options(f).filter((o) => v.includes(o.id));
          answers[f.key] = { status: 'selected', option_ids: os.map((o) => o.id), labels: os.map((o) => o.label) };
        } else if (typeof v === 'string') answers[f.key] = { status: 'selected', option_id: v, label };
      }
      const type = i === 0 ? def.intake.primary_room.id : room.answers['room_type'];
      return {
        room_id: room.id,
        room_type: typeof type === 'string' ? type : 'unknown',
        name: x.roomName(i),
        complete: x.roomComplete(i),
        design_from: carried?.from ?? null,
        answers,
      };
    }),
  );
}

/**
 * The room's rough ceiling height from the intake, as an exact length, for the room drawing to
 * start from (DECISIONS IK-17, 2026-11-08). "Match the kitchen" follows the first room. Returns a
 * refusal with the reason when there is no usable answer yet; it never guesses a height (rule 7).
 */
export function roughCeiling(def: Definition, state: IntakeState, roomId: string): Result<Length> {
  const i = state.rooms.findIndex((r) => r.id === roomId);
  if (i < 0) return refuse('That room is not in the design choices.');
  const x = new Intake(def, state);
  const ceiling = def.fields.get('ceiling_height');
  const entered = def.fields.get('ceiling_height_entered');
  if (!ceiling || !entered) return refuse('The design choices have no ceiling height question.');
  const read = (k: number): Result<Length> =>
    x.inRoom(k, () => {
      const v = x.eff(ceiling);
      if (v === undefined) return refuse(`The ${x.roomName(k).toLowerCase()} has no ceiling height yet.`);
      if (v === 'match_primary') return k === 0 ? refuse('The first room cannot match itself.') : read(0);
      if (v === 'other') {
        const typed = x.eff(entered);
        if (typeof typed !== 'object' || typed === null || Array.isArray(typed)) return refuse(`The ${x.roomName(k).toLowerCase()}'s ceiling height hasn't been typed yet.`);
        return heightLength(typed as { ft: string; in: string });
      }
      const option = x.options(ceiling).find((o) => o.id === v);
      if (!option?.def?.feet) return refuse(`The ceiling height "${String(v)}" has no length in the intake data.`);
      return fromInches(option.def.feet * 12);
    });
  return read(i);
}
