/**
 * The visual intake (image selector) as data (CLAUDE.md rule 6): questions, options, images and
 * conditions for one room type, read from a JSON file with a recorded source. A bad file fails
 * loudly with every problem listed; nothing is filled in or skipped.
 */
import { z } from 'zod';

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'IDs are lower case letters, digits and underscores');
const Text = z.string().min(1);
const Hex = z.string().regex(/^#[0-9a-f]{6}$/);

/** "placeholder" = no image yet, a labelled stand-in is drawn. A src may itself be a placeholder file. */
const ImageSchema = z.union([z.literal('placeholder'), z.strictObject({ src: z.string().regex(/^\/[\w./-]+$/), placeholder: z.boolean() })]);

const OptionSchema = z.strictObject({
  id: Id,
  label: Text,
  image: ImageSchema,
  description: Text.optional(),
  /** Placeholder swatch shades [door, counter]. Not real colours. */
  shades: z.tuple([Hex, Hex]).optional(),
  /** The intake itself asks for a price here (the drawer level). */
  shows_price: z.literal(true).optional(),
});

const ConditionSchema = z.strictObject({ question: Id, any_of: z.array(Id).min(1) });
const FidelitySchema = z.enum(['line_drawing', 'photo', 'photo_no_counters']).nullable();

const base = {
  id: Id,
  section: Id,
  label: Text,
  prompt: Text,
  fidelity: FidelitySchema,
  show_if: z.array(ConditionSchema).min(1).optional(),
};

const QuestionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('single'), options: Id }),
  z.strictObject({ ...base, kind: z.literal('counts'), items: z.array(z.strictObject({ id: Id, label: Text })).min(1) }),
  z.strictObject({ ...base, kind: z.literal('pending'), waiting_on: Text }),
]);

const FileSchema = z.strictObject({
  source: Text,
  room_type: Id,
  images_note: Text,
  sections: z.array(z.strictObject({ id: Id, label: Text })).min(1),
  option_sets: z.record(Id, z.array(OptionSchema).min(2)),
  questions: z.array(QuestionSchema).min(1),
});

export type Fidelity = z.infer<typeof FidelitySchema>;
export type IntakeImage = z.infer<typeof ImageSchema>;
export type IntakeOption = Readonly<z.infer<typeof OptionSchema>>;
export interface Condition {
  readonly question: string;
  readonly any_of: readonly string[];
}

interface QuestionBase {
  readonly id: string;
  readonly section: string;
  /** Short name, for the summary. */
  readonly label: string;
  /** The question as asked on screen. */
  readonly prompt: string;
  /** What kind of image the real option pictures will be. Null when the outline doesn't say. */
  readonly fidelity: Fidelity;
  /** All must hold for the question to be asked. Empty = always asked. */
  readonly show_if: readonly Condition[];
}

/** Pick one option. */
export interface SingleQuestion extends QuestionBase {
  readonly kind: 'single';
  readonly options: readonly IntakeOption[];
}
/** A whole number for each item; 0 means none. */
export interface CountsQuestion extends QuestionBase {
  readonly kind: 'counts';
  readonly items: readonly { readonly id: string; readonly label: string }[];
}
/** Asked in the outline, but its options haven't been supplied. It can only be flagged for follow-up. */
export interface PendingQuestion extends QuestionBase {
  readonly kind: 'pending';
  readonly waiting_on: string;
}
export type IntakeQuestion = SingleQuestion | CountsQuestion | PendingQuestion;

export interface Intake {
  readonly source: string;
  readonly room_type: string;
  readonly images_note: string;
  readonly sections: readonly { readonly id: string; readonly label: string }[];
  /** In the order they are asked. */
  readonly questions: readonly IntakeQuestion[];
}

/** Reads and checks an intake file. Returns every problem, not just the first. */
export function readIntake(data: unknown): { ok: true; value: Intake } | { ok: false; reason: string } {
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: `The intake file is not in the right shape: ${parsed.error.message}` };
  const file = parsed.data;
  const problems: string[] = [];

  const duplicates = (ids: readonly string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const id of duplicates(file.sections.map((s) => s.id))) problems.push(`section "${id}" is listed twice`);
  for (const id of duplicates(file.questions.map((q) => q.id))) problems.push(`question "${id}" is listed twice`);
  for (const [setId, options] of Object.entries(file.option_sets)) {
    for (const id of duplicates(options.map((o) => o.id))) problems.push(`option set "${setId}" lists option "${id}" twice`);
  }

  const sectionIds = new Set(file.sections.map((s) => s.id));
  const usedSets = new Set<string>();
  const usedSections = new Set<string>();
  const asked = new Map<string, IntakeQuestion>();
  const questions: IntakeQuestion[] = [];

  for (const q of file.questions) {
    const where = `question "${q.id}"`;
    if (!sectionIds.has(q.section)) problems.push(`${where} is in section "${q.section}", which isn't listed`);
    usedSections.add(q.section);
    const show_if = q.show_if ?? [];
    for (const c of show_if) {
      // Conditions may only look back, so the order of questions decides what is shown.
      const earlier = asked.get(c.question);
      if (!earlier) {
        problems.push(`${where} depends on "${c.question}", which isn't an earlier question`);
        continue;
      }
      if (earlier.kind !== 'single') {
        problems.push(`${where} depends on "${c.question}", which isn't a pick-one question`);
        continue;
      }
      for (const id of c.any_of) {
        if (!earlier.options.some((o) => o.id === id)) problems.push(`${where} depends on option "${id}", which "${c.question}" doesn't offer`);
      }
    }
    const common = { id: q.id, section: q.section, label: q.label, prompt: q.prompt, fidelity: q.fidelity, show_if };
    let question: IntakeQuestion;
    if (q.kind === 'single') {
      usedSets.add(q.options);
      const options = file.option_sets[q.options];
      if (!options) problems.push(`${where} uses option set "${q.options}", which doesn't exist`);
      question = { ...common, kind: 'single', options: options ?? [] };
    } else if (q.kind === 'counts') {
      for (const id of duplicates(q.items.map((i) => i.id))) problems.push(`${where} lists item "${id}" twice`);
      question = { ...common, kind: 'counts', items: q.items };
    } else {
      question = { ...common, kind: 'pending', waiting_on: q.waiting_on };
    }
    asked.set(q.id, question);
    questions.push(question);
  }
  for (const setId of Object.keys(file.option_sets)) {
    if (!usedSets.has(setId)) problems.push(`option set "${setId}" isn't used by any question`);
  }
  for (const s of file.sections) {
    if (!usedSections.has(s.id)) problems.push(`section "${s.id}" has no questions`);
  }

  if (problems.length > 0) return { ok: false, reason: `The intake file has problems: ${problems.join('; ')}` };
  return {
    ok: true,
    value: { source: file.source, room_type: file.room_type, images_note: file.images_note, sections: file.sections, questions },
  };
}
