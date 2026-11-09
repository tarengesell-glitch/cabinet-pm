/**
 * What the design brief needs from the client's intake (OA-3: their "design desires").
 *
 * The intake module (BUILD_PLAN 7b) is still empty, so this file defines the shape it must
 * hand over, from `docs/intake/kitchen.md` (owner, 2026-10-27, marked incomplete). Only the
 * questions are listed here. The options (their IDs, labels and pictures) are intake's data
 * (rule 6), so an answer carries the option's ID and label exactly as intake stored them.
 *
 * Nothing is filled in (rule 7). A missing, "skipped" or "needs follow-up" answer refuses the
 * brief, naming the question. Intake questions have no "not sure" answer (owner, 2026-11-09),
 * so one is refused as an answer in the wrong shape.
 */
import { z } from 'zod';

/** How a question is answered. */
type AnswerShape = 'choice' | 'count' | 'yes_no';
/** When the brief needs the answer. */
type Needed = 'always' | 'island' | 'island_own_colour';

interface Question {
  readonly code: string;
  /** The question in plain words, used in refusals and in the brief. */
  readonly asks: string;
  readonly shape: AnswerShape;
  readonly needed: Needed;
  /** Whether intake may answer "not applicable" (a follow-up that an earlier answer ruled out). */
  readonly mayNotApply: boolean;
}

/** Keeps each question's exact code and shape in its type, so `KitchenIntake` is typed per question. */
const q = <const C extends string, const S extends AnswerShape, const N extends Needed = 'always', const M extends boolean = false>(
  code: C,
  asks: string,
  shape: S,
  needed: N = 'always' as N,
  mayNotApply: M = false as M,
) => ({ code, asks, shape, needed, mayNotApply });

/**
 * The questions, from `docs/intake/kitchen.md`. Ceiling height is not here: the room drawing
 * already holds it (the master copy wins, P1), and the intake's answer is only a hint.
 */
export const KITCHEN_INTAKE_QUESTIONS = [
  q('shape', 'Kitchen shape', 'choice'),
  q('cabinet_height', 'Cabinet height', 'choice'),
  q('feel', 'Feel', 'choice'),
  q('material', 'Material', 'choice'),
  q('colour_tone', 'Colour tone (door tone and counter tone)', 'choice'),
  q('door_style', 'Door style', 'choice'),
  q('door_colour', 'Door colour', 'choice'),
  q('counter_colour', 'Counter colour', 'choice'),
  q('hardware', 'Handles, knobs, or handles on drawers with knobs on doors', 'choice'),
  q('handle', 'Handle (spec, size and finish)', 'choice', 'always', true),
  q('knob', 'Knob (spec and finish)', 'choice', 'always', true),
  q('handle_position_doors', 'Handle position on doors (vertical or horizontal)', 'choice', 'always', true),
  q('handle_position_drawers', 'Handle position on drawers (centred or closer to the top)', 'choice', 'always', true),
  q('top_trim_style', 'Top trim style', 'choice'),
  q('top_trim_colour', 'Top trim colour', 'choice'),
  q('light_valance', 'Light valance style, or hidden', 'choice'),
  q('light_valance_colour', 'Light valance colour', 'choice', 'always', true),
  q('corner_insert', 'Corner cabinets: double shelf or lazy Susan', 'choice', 'always', true),
  q('cutlery_organizers', 'Cutlery organizers (how many; 0 for none)', 'count'),
  q('utility_organizers', 'Utility organizers (how many; 0 for none)', 'count'),
  q('spice_organizers', 'Spice organizers (how many; 0 for none)', 'count'),
  q('tray_organizers', 'Tray organizers (how many; 0 for none)', 'count'),
  q('garbage_recycling_cabinets', 'Cabinets for garbage and recycling (how many; 0 for none)', 'count'),
  q('interiors', 'Cabinet interiors', 'choice'),
  q('drawer_level', 'Drawers: minimum, moderate or maximum', 'choice'),
  q('island_own_colour', 'Island in an offsetting colour', 'yes_no', 'island'),
  q('island_back_panel', 'Island back panel detail', 'choice', 'island'),
  q('island_side_panel', 'Island side panel detail', 'choice', 'island'),
  q('island_material', 'Island material', 'choice', 'island_own_colour'),
  q('island_colour_tone', 'Island colour tone', 'choice', 'island_own_colour'),
  q('island_door_style', 'Island door style', 'choice', 'island_own_colour'),
  q('island_door_colour', 'Island door and panel colour', 'choice', 'island_own_colour'),
  q('island_counter_colour', 'Island counter colour', 'choice', 'island_own_colour'),
] as const satisfies readonly Question[];

type Questions = (typeof KITCHEN_INTAKE_QUESTIONS)[number];
export type IntakeQuestionCode = Questions['code'];

/** An answer the client gave. "selected" is theirs; "confirmed" was checked with them. */
type Given = 'selected' | 'confirmed';
export interface ChoiceAnswer {
  readonly status: Given;
  /** The intake option's ID: the source of truth (DATA_MODEL "intake"). */
  readonly option_id: string;
  /** The option's label as the client saw it, for the AI to read. */
  readonly label: string;
}
export interface CountAnswer {
  readonly status: Given;
  readonly count: number;
}
export interface YesNoAnswer {
  readonly status: Given;
  readonly yes: boolean;
}
/** A question the client has not answered yet. The brief refuses these. */
export interface OpenAnswer {
  readonly status: 'skipped' | 'needs_follow_up';
}
/**
 * A follow-up an earlier answer ruled out (for example "knob" when it is all handles).
 * Owner, 2026-11-09: approved as an answer status. Only follow-up questions may use it.
 */
export interface NotApplicable {
  readonly status: 'not_applicable';
  readonly reason: string;
}

type AnswerFor<Q extends Questions> =
  | (Q['shape'] extends 'choice' ? ChoiceAnswer : Q['shape'] extends 'count' ? CountAnswer : YesNoAnswer)
  | OpenAnswer
  | (Q['mayNotApply'] extends true ? NotApplicable : never);

/** What the brief needs from intake for one kitchen. Missing keys are refused, never filled in. */
export interface KitchenIntake {
  readonly room_type: 'kitchen';
  readonly answers: { readonly [Q in Questions as Q['code']]?: AnswerFor<Q> };
}

/** One answer as the brief shows it. */
export interface BriefAnswer {
  readonly question: IntakeQuestionCode;
  readonly asks: string;
  /** The option's ID for a choice; null otherwise. */
  readonly option_id: string | null;
  /** The answer in words: the option's label, a number, "yes"/"no", or why it doesn't apply. */
  readonly answer: string;
  readonly confirmed_with_client: boolean;
}

const Text = z.string().trim().min(1);
const GivenSchema = z.enum(['selected', 'confirmed']);
const OPEN_STATUSES = { skipped: 'skipped', needs_follow_up: '"needs follow-up"' } as const;
const SHAPE_SCHEMAS = {
  choice: z.strictObject({ status: GivenSchema, option_id: Text, label: Text }),
  count: z.strictObject({ status: GivenSchema, count: z.number().int().min(0) }),
  yes_no: z.strictObject({ status: GivenSchema, yes: z.boolean() }),
} as const;
const SHAPE_WORDS = { choice: 'a picked option (its ID and label)', count: 'a whole number, 0 or more', yes_no: 'yes or no' };
const NotApplicableSchema = z.strictObject({ status: z.literal('not_applicable'), reason: Text });
const OpenSchema = z.strictObject({ status: z.enum(['skipped', 'needs_follow_up']) });
const InputSchema = z.strictObject({ room_type: z.string(), answers: z.record(z.string(), z.unknown()) });

/**
 * Reads the intake answers for a room. `roomHasIsland` comes from the room drawing (a floating
 * wall with cabinets on it). Returns every problem, not just the first.
 */
export function readKitchenIntake(
  input: unknown,
  roomHasIsland: boolean,
): { ok: true; value: readonly BriefAnswer[] } | { ok: false; problems: readonly string[] } {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: ['The intake answers are missing or not in the expected shape.'] };
  const { room_type, answers } = parsed.data;
  if (room_type !== 'kitchen') {
    return { ok: false, problems: [`Only the kitchen intake is defined so far; this room's intake is "${room_type}" (DECISIONS IK-7).`] };
  }

  const problems: string[] = [];
  const known = new Set<string>(KITCHEN_INTAKE_QUESTIONS.map((x) => x.code));
  for (const code of Object.keys(answers).sort()) {
    if (!known.has(code)) problems.push(`The intake has an answer to "${code}", which is not a question the design brief knows.`);
  }

  // Whether the island is in its own colour decides whether its colour questions are needed.
  const ownColour = SHAPE_SCHEMAS.yes_no.safeParse(answers['island_own_colour']);
  const islandOwnColour = roomHasIsland && ownColour.success ? ownColour.data.yes : null;

  const out: BriefAnswer[] = [];
  for (const question of KITCHEN_INTAKE_QUESTIONS) {
    const raw = answers[question.code];
    const needed =
      question.needed === 'always' ||
      (question.needed === 'island' && roomHasIsland) ||
      (question.needed === 'island_own_colour' && islandOwnColour === true);
    // Unknown until "island in an offsetting colour" is answered; that question is reported itself.
    const undecided = question.needed === 'island_own_colour' && roomHasIsland && islandOwnColour === null;
    const asks = `"${question.asks}"`;

    if (!needed) {
      if (raw !== undefined && !undecided) {
        problems.push(
          question.needed === 'island' || !roomHasIsland
            ? `${asks} was answered, but the room has no island. Draw the island or remove the answer.`
            : `${asks} was answered, but the island is not in an offsetting colour. Remove the answer or change that choice.`,
        );
      }
      continue;
    }
    if (raw === undefined) {
      problems.push(`${asks} has no answer.`);
      continue;
    }
    const open = OpenSchema.safeParse(raw);
    if (open.success) {
      problems.push(`${asks} is marked ${OPEN_STATUSES[open.data.status]}. It needs the client's answer.`);
      continue;
    }
    const notApplicable = NotApplicableSchema.safeParse(raw);
    if (notApplicable.success) {
      if (!question.mayNotApply) {
        problems.push(`${asks} is marked "not applicable", but every kitchen needs this answer.`);
        continue;
      }
      out.push({
        question: question.code,
        asks: question.asks,
        option_id: null,
        answer: `not applicable: ${notApplicable.data.reason}`,
        confirmed_with_client: false,
      });
      continue;
    }
    const given = SHAPE_SCHEMAS[question.shape].safeParse(raw);
    if (!given.success) {
      problems.push(`${asks} is not in the expected shape: it needs ${SHAPE_WORDS[question.shape]}.`);
      continue;
    }
    const a = given.data;
    out.push({
      question: question.code,
      asks: question.asks,
      option_id: 'option_id' in a ? a.option_id : null,
      answer: 'label' in a ? a.label : 'count' in a ? String(a.count) : a.yes ? 'yes' : 'no',
      confirmed_with_client: a.status === 'confirmed',
    });
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: out.sort((x, y) => compare(x.question, y.question)) };
}

/** Plain code-unit order, the same on every machine (no locale). */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
