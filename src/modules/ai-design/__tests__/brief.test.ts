import { describe, expect, it } from 'vitest';
import type { Job } from '@/core/index';
import { CURRENT_CATALOG, type Catalog } from '@/modules/catalog/contract';
import { DESIGN_RULES, type DesignRules } from '@/modules/shop-settings/contract';
import { buildDesignBrief, type DesignBriefInput } from '../contract';
import { KITCHEN_ROOM_ID, kitchenIntake, kitchenWithIsland } from './example';

const input = (over: Partial<DesignBriefInput> = {}): DesignBriefInput => ({
  job: kitchenWithIsland(),
  roomId: KITCHEN_ROOM_ID,
  catalog: CURRENT_CATALOG,
  designRules: DESIGN_RULES,
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
  const answers: Record<string, unknown> = { ...intake.answers };
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

describe('refusing the brief', () => {
  it('refuses when an intake answer is missing, naming the question', () => {
    const problems = refusal({ intake: intakeWith((a) => delete a['door_colour']) });
    expect(problems).toEqual(['"Door colour" has no answer.']);
  });

  it('refuses "not sure", "skipped" and "needs follow-up" instead of filling them in', () => {
    const problems = refusal({
      intake: intakeWith((a) => {
        a['drawer_level'] = { status: 'not_sure' };
        a['interiors'] = { status: 'skipped' };
        a['corner_insert'] = { status: 'needs_follow_up' };
      }),
    });
    expect(problems).toEqual([
      '"Corner cabinets: double shelf or lazy Susan" is marked "needs follow-up". It needs the client\'s answer.',
      '"Cabinet interiors" is marked skipped. It needs the client\'s answer.',
      '"Drawers: minimum, moderate or maximum" is marked "not sure". It needs the client\'s answer.',
    ]);
  });

  it('refuses "not applicable" on a question every kitchen needs', () => {
    const problems = refusal({ intake: intakeWith((a) => (a['door_style'] = { status: 'not_applicable', reason: 'n/a' })) });
    expect(problems).toEqual(['"Door style" is marked "not applicable", but every kitchen needs this answer.']);
  });

  it('needs the island answers when the room has an island, and only then', () => {
    expect(refusal({ intake: intakeWith((a) => delete a['island_side_panel']) })).toEqual(['"Island side panel detail" has no answer.']);
    expect(
      refusal({
        intake: intakeWith((a) => {
          a['island_own_colour'] = { status: 'selected', yes: false };
        }),
      }),
    ).toContain('"Island material" was answered, but the island is not in an offsetting colour. Remove the answer or change that choice.');

    const job = kitchenWithIsland();
    const noIsland: Job = { ...job, rooms: job.rooms.map((r) => ({ ...r, walls: r.walls.filter((w) => w.kind === 'room') })) };
    expect(refusal({ job: noIsland })).toContain('"Island in an offsetting colour" was answered, but the room has no island. Draw the island or remove the answer.');
  });

  it('refuses an answer in the wrong shape, or to a question it does not know', () => {
    const problems = refusal({
      intake: intakeWith((a) => {
        a['spice_organizers'] = { status: 'selected', count: -1 };
        a['favourite_colour'] = { status: 'selected', option_id: 'x', label: 'Blue' };
      }),
    });
    expect(problems).toEqual([
      'The intake has an answer to "favourite_colour", which is not a question the design brief knows.',
      '"Spice organizers (how many; 0 for none)" is not in the expected shape: it needs a whole number, 0 or more.',
    ]);
  });

  it('refuses another room type, another shop\'s catalog, a room with no cabinet runs, and an unknown room', () => {
    expect(refusal({ intake: { room_type: 'bathroom', answers: {} } })).toEqual([
      'Only the kitchen intake is defined so far; this room\'s intake is "bathroom" (DECISIONS IK-7).',
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
