import { describe, expect, it } from 'vitest';
import type { Job } from '@/core/index';
import { CURRENT_CATALOG, type Catalog } from '@/modules/catalog/contract';
import { INTAKE_DEFINITION } from '@/modules/intake/contract';
import { DESIGN_RULES, type DesignRules } from '@/modules/shop-settings/contract';
import { buildDesignBrief, type DesignBriefInput } from '../contract';
import { KITCHEN_ROOM_ID, kitchenIntake, kitchenWithIsland } from './example';

if (!INTAKE_DEFINITION.ok) throw new Error(INTAKE_DEFINITION.reason);
const intakeDefinition = INTAKE_DEFINITION.value;

const input = (over: Partial<DesignBriefInput> = {}): DesignBriefInput => ({
  job: kitchenWithIsland(),
  roomId: KITCHEN_ROOM_ID,
  catalog: CURRENT_CATALOG,
  designRules: DESIGN_RULES,
  intakeDefinition,
  intake: kitchenIntake(),
  ...over,
});

function made(over: Partial<DesignBriefInput> = {}) {
  const r = buildDesignBrief(input(over));
  if (!r.ok) throw new Error(r.reason);
  return r;
}

function refusal(over: Partial<DesignBriefInput>): readonly string[] {
  const r = buildDesignBrief(input(over));
  if (r.ok) throw new Error('Expected the brief to be refused.');
  return r.problems;
}

function intakeWith(change: (answers: Record<string, unknown>) => void): unknown {
  const intake = kitchenIntake();
  const answers: Record<string, unknown> = { ...(intake.answers as Record<string, unknown>) };
  change(answers);
  return { ...intake, answers };
}

describe('the design brief', () => {
  it('matches the saved brief for the example kitchen', async () => {
    await expect(made().text).toMatchFileSnapshot('./__snapshots__/kitchen-brief.json');
  });

  it('gives the same bytes every time, whatever order the inputs list things in', () => {
    const first = made().text;
    expect(made().text).toBe(first);

    // Reverse every list whose order means nothing. Walls keep their drawing order (their letters).
    const job = kitchenWithIsland();
    const shuffledJob: Job = {
      ...job,
      rooms: job.rooms.map((room) => ({
        ...room,
        walls: room.walls.map((w) => ({
          ...w,
          openings: [...w.openings].reverse(),
          obstacles: [...w.obstacles].reverse(),
          runs: [...w.runs].reverse(),
          appliances: [...w.appliances].reverse(),
        })),
      })),
    };
    const shuffledCatalog: Catalog = {
      ...CURRENT_CATALOG,
      options: [...CURRENT_CATALOG.options].reverse().map((o) => ({ ...o, values: [...o.values].reverse() })),
      items: [...CURRENT_CATALOG.items].reverse().map((i) => ({ ...i, options: [...i.options].reverse() })),
    };
    const shuffledRules: DesignRules = { ...DESIGN_RULES, rules: [...DESIGN_RULES.rules].reverse() };
    const intake = kitchenIntake();
    const shuffledIntake = { ...intake, answers: Object.fromEntries(Object.entries(intake.answers).reverse()) };
    expect(made({ job: shuffledJob, catalog: shuffledCatalog, designRules: shuffledRules, intake: shuffledIntake }).text).toBe(first);
  });

  it('records which catalog version and design rules file it used', () => {
    const { made_from } = made().brief;
    expect(made_from.catalog).toEqual({ version: CURRENT_CATALOG.version, shop_id: CURRENT_CATALOG.shop.id, shop_name: CURRENT_CATALOG.shop.name });
    expect(made_from.design_rules.imported_on).toBe(DESIGN_RULES.importedOn);
    expect(made_from.design_rules.fingerprint_sha256).toMatch(/^[0-9a-f]{64}$/);
    const changed: DesignRules = { ...DESIGN_RULES, rules: DESIGN_RULES.rules.map((r) => (r.id === 'HARD-008' ? { ...r, says: `${r.says}!` } : r)) };
    expect(made({ designRules: changed }).brief.made_from.design_rules.fingerprint_sha256).not.toBe(made_from.design_rules.fingerprint_sha256);
  });

  it('includes only confirmed design rules, with their lengths in inches', () => {
    const { design_rules } = made().brief;
    const confirmed = DESIGN_RULES.rules.filter((r) => r.status === 'confirmed').map((r) => r.id);
    expect(design_rules.map((r) => r.id)).toEqual([...confirmed].sort());
    for (const declined of DESIGN_RULES.rules.filter((r) => r.status !== 'confirmed')) {
      expect(design_rules.some((r) => r.id === declined.id)).toBe(false);
    }
    expect(design_rules.find((r) => r.id === 'HARD-008')?.lengths).toEqual({ min_above_cooktop: '30"' });
    expect(design_rules.find((r) => r.id === 'CB-FACT-48')?.lengths).toEqual({
      crown_sizes: ['2"', '3"', '4"', '5"', '6"'],
      min_ceiling_gap: '1"',
    });
  });

  it('lists only the cabinet types available to the shop', () => {
    const { cabinet_types } = made().brief;
    expect(cabinet_types.length).toBe(CURRENT_CATALOG.items.filter((i) => i.availability === 'available').length);
    const excluded: Catalog = {
      ...CURRENT_CATALOG,
      items: CURRENT_CATALOG.items.map((i) => (i.code === 'sink_base' ? { ...i, availability: 'excluded' } : i)),
    };
    expect(made({ catalog: excluded }).brief.cabinet_types.some((c) => c.code === 'sink_base')).toBe(false);
  });
});

describe('reading the design choices', () => {
  it('lists every answer by its intake key, with the option IDs and the words the client saw', () => {
    const intake = made().brief.intake;
    expect(intake.find((a) => a.question === 'cabinet_colour')).toEqual({
      question: 'cabinet_colour',
      asks: 'Cabinets',
      option_ids: ['painted.white.2'],
      answer: 'White 2',
    });
    expect(intake.find((a) => a.question === 'garbage_slide_outs')?.answer).toBe('2');
    expect(intake.find((a) => a.question === 'cutlery_organizers')).toMatchObject({ option_ids: [], answer: '1' });
    expect(intake.map((a) => a.question)).toEqual([...intake.map((a) => a.question)].sort());
  });

  it('leaves out the ceiling height: the room drawing holds it (P1)', () => {
    expect(made().brief.intake.some((a) => a.question.startsWith('ceiling_height'))).toBe(false);
  });

  it('reads picked lists and typed text', () => {
    const r = made({
      intake: intakeWith((a) => {
        a['secondary_colour_mode'] = { status: 'selected', option_id: 'add', label: 'Add a secondary colour' };
        a['secondary_areas'] = { status: 'selected', option_ids: ['island', 'other'], labels: ['Island', 'Other'] };
        a['secondary_where'] = { status: 'selected', text: 'the hutch' };
      }),
    });
    expect(r.brief.intake.find((a) => a.question === 'secondary_areas')).toMatchObject({ option_ids: ['island', 'other'], answer: 'Island, Other' });
    expect(r.brief.intake.find((a) => a.question === 'secondary_where')).toMatchObject({ option_ids: [], answer: 'the hutch' });
  });
});

describe('refusing the brief', () => {
  it('refuses design choices that are not finished, instead of filling them in', () => {
    const intake = { ...kitchenIntake(), complete: false };
    expect(refusal({ intake })).toEqual([
      'The design choices for "Kitchen" aren\'t finished. Finish the room\'s review in Design choices first.',
    ]);
  });

  it('refuses an answer to a question the intake does not have', () => {
    const problems = refusal({ intake: intakeWith((a) => (a['favourite_colour'] = { status: 'selected', option_id: 'x', label: 'Blue' })) });
    expect(problems).toEqual(['The design choices have an answer to "favourite_colour", which is not a question the intake has.']);
  });

  it('refuses an answer in the wrong shape, or with a status the intake does not hand over', () => {
    const problems = refusal({
      intake: intakeWith((a) => {
        a['spice_organizers'] = { status: 'selected', count: -1 };
        a['drawer_level'] = { status: 'not_sure' };
        a['interiors'] = { status: 'skipped' };
      }),
    });
    expect(problems).toEqual([
      'The answer to "Drawers" is not in the expected shape: it needs one picked option (its ID and label).',
      'The answer to "Interiors" is not in the expected shape: it needs one picked option (its ID and label).',
      'The answer to "Spice" is not in the expected shape: it needs a whole number, 0 or more.',
    ]);
  });

  it('refuses an option the question does not offer', () => {
    const problems = refusal({ intake: intakeWith((a) => (a['door_style'] = { status: 'selected', option_id: 'gothic', label: 'Gothic' })) });
    expect(problems).toEqual(['The answer to "Door style" (gothic) is not one of the question\'s options.']);
  });

  it('refuses a layout with an island when the room drawing has none', () => {
    const job = kitchenWithIsland();
    const noIsland: Job = { ...job, rooms: job.rooms.map((r) => ({ ...r, walls: r.walls.filter((w) => w.kind === 'room') })) };
    expect(refusal({ job: noIsland })).toEqual([
      'The design choices say "L-shape with island", but the room drawing has no island. Draw the island (a floating wall with cabinets) or change the layout choice.',
    ]);
  });

  it('refuses a handover in the wrong shape', () => {
    expect(refusal({ intake: { answers: {} } })).toEqual([
      'The design choices for this room are missing or not in the shape the intake hands over.',
    ]);
  });

  it('refuses another room type, another shop\'s catalog, a room with no cabinet runs, and an unknown room', () => {
    expect(refusal({ intake: { ...kitchenIntake(), name: 'Main bath', room_type: 'bathroom' } })).toEqual([
      'Only the kitchen can be drafted so far; "Main bath" is a "bathroom" room (DECISIONS IK-7).',
    ]);
    const otherShop: Catalog = { ...CURRENT_CATALOG, shop: { ...CURRENT_CATALOG.shop, id: '00000000-0000-4000-8000-000000009999' } };
    expect(refusal({ catalog: otherShop })[0]).toMatch(/^The catalog is for .+ but this job belongs to shop/);
    const job = kitchenWithIsland();
    const bare: Job = { ...job, rooms: job.rooms.map((r) => ({ ...r, walls: r.walls.map((w) => ({ ...w, runs: [] })) })) };
    expect(refusal({ job: bare })).toContain('"Kitchen" has no cabinet runs. Mark where the cabinets go before asking for a draft.');
    expect(refusal({ roomId: '00000000-0000-4000-8000-000000000999' })).toEqual([
      'The job has no room with the ID 00000000-0000-4000-8000-000000000999.',
    ]);
  });

  it('refuses when there are no confirmed design rules', () => {
    const none: DesignRules = { ...DESIGN_RULES, rules: DESIGN_RULES.rules.filter((r) => r.status !== 'confirmed') };
    expect(refusal({ designRules: none })).toEqual(['There are no confirmed design rules for the AI designer to follow.']);
  });
});
