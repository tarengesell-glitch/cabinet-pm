/**
 * The intake's questions, options and lists, read from `data/` (rule 6) and checked against a
 * schema. Anything malformed refuses the whole intake with the reasons (rule 7): the screen
 * shows them instead of guessing.
 */
import { z } from 'zod';
import { ok, refuse, type Result } from '@/core/index';
import intakeData from '../data/intake-v1.json';
import coloursData from '../data/colours.json';
import listsData from '../data/lists.json';
import presetsData from '../data/presets-standin.json';

/** When something shows. Conditions are data, so they are plain objects, not code. */
export type Cond =
  | { readonly key: string; readonly in: readonly string[] }
  | { readonly key: string; readonly not_in: readonly string[] }
  | { readonly key: string; readonly has: string }
  | { readonly answered: string }
  | { readonly primary_answered: string }
  | { readonly any: readonly Cond[] }
  | { readonly all: readonly Cond[] }
  | { readonly room: 'primary' | 'other' | 'second' | 'third_on' }
  | { readonly island: true }
  | { readonly copied: true };

const CondSchema: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.strictObject({ key: z.string(), in: z.array(z.string()).min(1) }),
    z.strictObject({ key: z.string(), not_in: z.array(z.string()).min(1) }),
    z.strictObject({ key: z.string(), has: z.string() }),
    z.strictObject({ answered: z.string() }),
    z.strictObject({ primary_answered: z.string() }),
    z.strictObject({ any: z.array(CondSchema).min(1) }),
    z.strictObject({ all: z.array(CondSchema).min(1) }),
    z.strictObject({ room: z.enum(['primary', 'other', 'second', 'third_on']) }),
    z.strictObject({ island: z.literal(true) }),
    z.strictObject({ copied: z.literal(true) }),
  ]),
);

const Text = z.string().min(1);
const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'a colour must be written #RRGGBB');
/** Plain text, or the first variant whose condition holds (the last one has no condition). */
const TextVariants = z.union([Text, z.array(z.strictObject({ when: CondSchema.optional(), text: Text })).min(1)]);
export type TextVariants = z.infer<typeof TextVariants>;

const OptionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/, 'option IDs are lower case, digits and _'),
  label: Text,
  desc: Text.optional(),
  when: CondSchema.optional(),
  /** Shape options: this layout has an island. */
  island: z.literal(true).optional(),
  /** Feel options: the door the feel stands for, in words. */
  door_name: Text.optional(),
  /** Hardware options: what goes on doors and on drawers. */
  door: z.enum(['handle', 'knob']).optional(),
  drawer: z.enum(['handle', 'knob']).optional(),
  /** Shows that the cost comes from live pricing (not connected yet, IK-14). */
  price_note: z.literal(true).optional(),
});
export type OptionDef = z.infer<typeof OptionSchema>;

const SOURCES = [
  'room_types',
  'basis',
  'earlier_rooms',
  'presets',
  'tones',
  'tone_doors',
  'tone_counters',
  'all_doors',
  'finishes',
  'counts',
  'trim_colours',
] as const;
export type Source = (typeof SOURCES)[number];

const FieldSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z0-9_.]+$/),
    type: z.enum(['image', 'cards', 'chips', 'count', 'multi', 'swatch', 'text', 'height']),
    label: Text.optional(),
    sub: Text.optional(),
    short: Text.optional(),
    /** Words for "Choose … to continue" when the label doesn't read well there. */
    ask: Text.optional(),
    options: z.array(OptionSchema).min(1).optional(),
    source: z.enum(SOURCES).optional(),
    when: CondSchema.optional(),
    default: z.union([z.string(), z.array(z.strictObject({ when: CondSchema.optional(), value: z.string() })).min(1)]).optional(),
    art: z.string().optional(),
    fidelity: z.enum(['line', 'photo']).optional(),
    aspect: z.string().regex(/^\d+\/\d+$/).optional(),
    size: z.literal('sm').optional(),
    min: z.string().regex(/^\d+px$/).optional(),
    sample: z.literal(true).optional(),
    indent: z.literal(true).optional(),
    placeholder: Text.optional(),
    /** false: shown inside another answer in the summaries (the typed ceiling height). */
    in_summary: z.literal(false).optional(),
  })
  .refine((f) => ['text', 'height'].includes(f.type) || (f.options === undefined) !== (f.source === undefined), {
    message: 'a choice question needs exactly one of "options" or "source"',
  });
export type FieldDef = z.infer<typeof FieldSchema>;

const StepSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_]+$/),
  section: Text,
  /** primary: only the primary room · other: only later rooms · all: every room · design: the shared design questions. */
  rooms: z.enum(['primary', 'other', 'all', 'design']),
  q: TextVariants,
  help: TextVariants.optional(),
  notes: z.array(z.string()).optional(),
  when: CondSchema.optional(),
  preview: z.literal(true).optional(),
  review: z.literal(true).optional(),
  fields: z.array(FieldSchema),
});
export type StepDef = z.infer<typeof StepSchema>;

const Basis = z.strictObject({ label: Text, desc: Text });
const IntakeSchema = z.strictObject({
  source: Text,
  version: z.literal(1),
  primary_room: z.strictObject({ id: z.string(), label: Text }),
  notes: z.record(z.string(), Text),
  room_types: z.strictObject({
    source: Text,
    types: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_]+$/), label: Text, inserts: z.string() })).min(1),
  }),
  insert_sets: z.strictObject({ source: Text, sets: z.record(z.string(), z.array(z.tuple([z.string().regex(/^[a-z0-9_]+$/), Text])).min(1)) }),
  basis_options: z.strictObject({
    source: Text,
    match: Basis,
    coordinate_primary: Basis,
    contrast_primary: Basis,
    coordinate_other: Basis,
    contrast_other: Basis,
    own: Basis,
    scratch: Basis,
  }),
  steps: z.array(StepSchema).min(1),
});

const Tone = z.strictObject({ id: z.string().regex(/^[a-z0-9_]+$/), label: Text, subs: z.array(Hex).min(1) });
const ColoursSchema = z.strictObject({
  source: Text,
  door_palettes: z.strictObject({ painted: z.array(Tone).min(1), wood: z.array(Tone).min(1) }),
  counter_tones: z.array(Tone).min(1),
  finishes: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_]+$/), label: Text, hex: Hex })).min(1),
});
export type ToneDef = z.infer<typeof Tone>;

const ListsSchema = z.strictObject({ source: Text, counts: z.array(OptionSchema).min(1), trim_colours: z.array(OptionSchema).min(1) });

const Change = z.enum(['next_colour', 'sister_style', 'neighbour_tone', 'opposite_tone', 'other_material', 'opposite_style']);
const Preset = z.strictObject({ id: z.string().regex(/^[a-z0-9_]+$/), label: Text, desc: Text, change: Change });
const PresetsSchema = z.strictObject({
  source: Text,
  tone_order: z.array(z.string()).min(2),
  sister_style: z.record(z.string(), z.string()),
  contrast_style: z.record(z.string(), z.string()),
  coordinate: z.array(Preset).min(1),
  contrast: z.array(Preset).min(1),
});
export type PresetDef = z.infer<typeof Preset>;

export interface Definition {
  readonly intake: z.infer<typeof IntakeSchema>;
  readonly colours: z.infer<typeof ColoursSchema>;
  readonly lists: z.infer<typeof ListsSchema>;
  readonly presets: z.infer<typeof PresetsSchema>;
  /** Every step, with the later rooms' insert questions filled in from the insert sets. */
  readonly steps: readonly StepDef[];
  readonly fields: ReadonlyMap<string, FieldDef>;
  /** The step each question is on. */
  readonly stepOf: ReadonlyMap<string, string>;
  /** The questions a matched, coordinated or contrasted room copies (the shared design questions). */
  readonly designKeys: readonly string[];
}

const describe = (name: string, error: z.ZodError): string[] =>
  error.issues.map((i) => `${name}: ${i.path.length ? i.path.join(' › ') + ': ' : ''}${i.message}`);

/** Builds the definition from raw data. Exported for tests; the app uses `DEFINITION`. */
export function buildDefinition(raw: { intake: unknown; colours: unknown; lists: unknown; presets: unknown }): Result<Definition> {
  const parts = {
    intake: IntakeSchema.safeParse(raw.intake),
    colours: ColoursSchema.safeParse(raw.colours),
    lists: ListsSchema.safeParse(raw.lists),
    presets: PresetsSchema.safeParse(raw.presets),
  };
  const problems: string[] = [];
  if (!parts.intake.success) problems.push(...describe('intake-v1.json', parts.intake.error));
  if (!parts.colours.success) problems.push(...describe('colours.json', parts.colours.error));
  if (!parts.lists.success) problems.push(...describe('lists.json', parts.lists.error));
  if (!parts.presets.success) problems.push(...describe('presets-standin.json', parts.presets.error));
  if (!parts.intake.success || !parts.colours.success || !parts.lists.success || !parts.presets.success) {
    return refuse(`The intake questions can't be loaded:\n${problems.join('\n')}`);
  }
  const intake = parts.intake.data;
  const sets = intake.insert_sets.sets;

  // The later rooms' insert questions: one count per insert in the room type's set.
  const steps = intake.steps.map((step): StepDef => {
    if (step.id !== 'room_inserts') return step;
    const fields: FieldDef[] = Object.entries(sets).flatMap(([set, items]) =>
      items.map(([id, label]) => ({
        key: `insert.${set}.${id}`,
        type: 'count' as const,
        label,
        short: label,
        source: 'counts' as const,
        default: '0',
        sample: true as const,
        when: { key: 'room_type', in: intake.room_types.types.filter((t) => t.inserts === set).map((t) => t.id) },
      })),
    );
    return { ...step, fields };
  });

  const fields = new Map<string, FieldDef>();
  const stepOf = new Map<string, string>();
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (stepIds.has(step.id)) problems.push(`Step "${step.id}" is listed twice.`);
    stepIds.add(step.id);
    for (const note of step.notes ?? []) if (!(note in intake.notes)) problems.push(`Step "${step.id}" names note "${note}", which isn't in the notes.`);
    for (const f of step.fields) {
      if (fields.has(f.key)) problems.push(`Question "${f.key}" is listed twice.`);
      fields.set(f.key, f);
      stepOf.set(f.key, step.id);
    }
  }
  for (const t of intake.room_types.types) {
    if (!(t.inserts in sets)) problems.push(`Room type "${t.id}" names insert set "${t.inserts}", which doesn't exist.`);
  }
  for (const id of ['room_type', 'basis', 'preset', 'review']) if (!stepIds.has(id)) problems.push(`The "${id}" step is missing.`);
  if (problems.length > 0) return refuse(`The intake questions can't be loaded:\n${problems.join('\n')}`);

  const designKeys = steps.filter((s) => s.rooms === 'design').flatMap((s) => s.fields.map((f) => f.key));
  return ok({ intake, colours: parts.colours.data, lists: parts.lists.data, presets: parts.presets.data, steps, fields, stepOf, designKeys });
}

/** The intake as shipped in `data/`. */
export const DEFINITION: Result<Definition> = buildDefinition({ intake: intakeData, colours: coloursData, lists: listsData, presets: presetsData });
