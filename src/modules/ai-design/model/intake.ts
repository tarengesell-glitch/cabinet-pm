/**
 * What the design brief reads from the client's design choices (OA-3: their "design desires").
 *
 * It reads the intake's own handover (`intakeHandover`, intake contract), one record per room,
 * exactly as intake hands it over (DECISIONS IK-15, closed 2026-11-09). The questions, their
 * wording and their options are intake's data (rule 6); this file keeps no copy of them, so the
 * two can't drift apart again. Which questions apply to a room is intake's call too: the
 * handover includes only questions that apply, and says whether every one of them is answered.
 *
 * Nothing is filled in (rule 7). An unfinished room, an answer to a question intake doesn't
 * have, an answer in the wrong shape or an option the question doesn't offer refuses the brief,
 * naming each one.
 */
import { z } from 'zod';
import type { IntakeDefinition } from '@/modules/intake/contract';

/** One answer as the brief shows it. */
export interface BriefAnswer {
  /** The intake question's key. */
  readonly question: string;
  /** The question in the intake's own short words. */
  readonly asks: string;
  /** The picked options' IDs (the source of truth, DATA_MODEL "intake"); empty for a number or typed text. */
  readonly option_ids: readonly string[];
  /** The answer in words, as the client saw it: the options' labels, a number, or the typed text. */
  readonly answer: string;
}

/**
 * Questions the brief leaves out, with the reason. The room drawing holds the ceiling height
 * (owner, IK-17), and the master copy wins over the intake's rough answer (P1).
 */
const LEFT_OUT: Readonly<Record<string, string>> = {
  ceiling_height: 'the room drawing holds the ceiling height (P1)',
  ceiling_height_entered: 'the room drawing holds the ceiling height (P1)',
};

const Text = z.string().trim().min(1);
const Status = z.literal('selected');
const ANSWER_SHAPES = {
  option: z.strictObject({ status: Status, option_id: Text, label: Text }),
  count: z.strictObject({ status: Status, count: z.number().int().min(0) }),
  options: z.strictObject({ status: Status, option_ids: z.array(Text).min(1), labels: z.array(Text).min(1) }),
  text: z.strictObject({ status: Status, text: Text }),
  length: z.strictObject({ status: Status, length: z.number().int().min(0), text: Text }),
} as const;
type Shape = keyof typeof ANSWER_SHAPES;
const SHAPE_WORDS: Readonly<Record<Shape, string>> = {
  option: 'one picked option (its ID and label)',
  count: 'a whole number, 0 or more',
  options: 'one or more picked options (their IDs and labels)',
  text: 'typed text',
  length: 'a length',
};
/** The answer shape each kind of intake question hands over (intake `handover.ts`). */
const SHAPE_OF_TYPE: Readonly<Record<string, Shape>> = {
  image: 'option',
  cards: 'option',
  chips: 'option',
  swatch: 'option',
  count: 'count',
  multi: 'options',
  text: 'text',
  height: 'length',
};

const HandoverSchema = z.strictObject({
  room_id: Text,
  room_type: Text,
  name: Text,
  complete: z.boolean(),
  design_from: Text.nullable(),
  answers: z.record(z.string(), z.unknown()),
});

export type ReadIntakeResult = { ok: true; value: readonly BriefAnswer[] } | { ok: false; problems: readonly string[] };

/**
 * Reads one room's handover from the intake. `roomHasIsland` comes from the room drawing (a
 * floating wall with cabinets on it). Returns every problem, not just the first.
 */
export function readRoomIntake(handover: unknown, definition: IntakeDefinition, roomHasIsland: boolean): ReadIntakeResult {
  const parsed = HandoverSchema.safeParse(handover);
  if (!parsed.success) return { ok: false, problems: ['The design choices for this room are missing or not in the shape the intake hands over.'] };
  const room = parsed.data;
  const kitchen = definition.intake.primary_room;
  if (room.room_type !== kitchen.id) {
    return {
      ok: false,
      problems: [`Only the ${kitchen.label.toLowerCase()} can be drafted so far; "${room.name}" is a "${room.room_type}" room (DECISIONS IK-7).`],
    };
  }

  const problems: string[] = [];
  if (!room.complete) {
    problems.push(`The design choices for "${room.name}" aren't finished. Finish the room's review in Design choices first.`);
  }

  const out: BriefAnswer[] = [];
  for (const key of Object.keys(room.answers).sort(compare)) {
    const field = definition.fields.get(key);
    if (field === undefined) {
      problems.push(`The design choices have an answer to "${key}", which is not a question the intake has.`);
      continue;
    }
    if (key in LEFT_OUT) continue;
    const asks = field.short ?? field.label ?? key;
    const shape = SHAPE_OF_TYPE[field.type];
    if (shape === undefined) {
      problems.push(`"${asks}" is a kind of question (${field.type}) the design brief can't read.`);
      continue;
    }
    const given = ANSWER_SHAPES[shape].safeParse(room.answers[key]);
    if (!given.success) {
      problems.push(`The answer to "${asks}" is not in the expected shape: it needs ${SHAPE_WORDS[shape]}.`);
      continue;
    }
    const a = given.data;
    const ids = 'option_id' in a ? [a.option_id] : 'option_ids' in a ? a.option_ids : [];
    // Questions with a fixed list of options are checked against it. Lists the intake works out
    // from earlier answers (colours, finishes, counts) can only be checked by the intake itself.
    if (field.options !== undefined) {
      const known = new Set(field.options.map((o) => o.id));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        problems.push(`The answer to "${asks}" (${unknown.join(', ')}) is not one of the question's options.`);
        continue;
      }
    }
    out.push({
      question: key,
      asks,
      option_ids: [...ids],
      answer: 'label' in a ? a.label : 'labels' in a ? a.labels.join(', ') : 'count' in a ? String(a.count) : a.text,
    });
  }

  // The layout the client picked and the room as drawn must agree about an island: the island's
  // colour and panels are only asked when the layout has one.
  const shapeField = definition.fields.get('shape');
  const shapeAnswer = out.find((x) => x.question === 'shape');
  const shapeOption = shapeField?.options?.find((o) => o.id === shapeAnswer?.option_ids[0]);
  if (shapeOption?.island === true && !roomHasIsland) {
    problems.push(
      `The design choices say "${shapeOption.label}", but the room drawing has no island. Draw the island (a floating wall with cabinets) or change the layout choice.`,
    );
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: out };
}

/** Plain code-unit order, the same on every machine (no locale). */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
