import { describe, expect, it } from 'vitest';
import { fromInches, JobSchema, type Job, type Length, type PlacedItem, type Room, type Wall } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import { INTAKE_DEFINITION } from '@/modules/intake/contract';
import { DESIGN_RULES } from '@/modules/shop-settings/contract';
import { buildDesignBrief } from '../contract';
import { readDraftConfig } from '../model/engine/config';
import { draftLayout, type DraftLayoutInput } from '../model/engine/draft';
import { KITCHEN_ROOM_ID, LAYOUT_NUMBERS, kitchenIntake, kitchenWithIsland } from './example';

if (!INTAKE_DEFINITION.ok) throw new Error(INTAKE_DEFINITION.reason);
const intakeDefinition = INTAKE_DEFINITION.value;
const inch = (n: number): Length => {
  const r = fromInches(Math.trunc(n));
  if (!r.ok || !Number.isInteger(n * 64)) throw new Error(`${n}" is not on a 1/64" mark`);
  return r.value + Math.round((n - Math.trunc(n)) * 64);
};
const code = new Map(CURRENT_CATALOG.items.map((i) => [i.id, i.code]));
const of = (items: readonly PlacedItem[], c: string) => items.filter((i) => code.get(i.catalog_item_id) === c);
const end = (i: PlacedItem) => i.position.offset + i.width;

function answersFor(job: Job) {
  const brief = buildDesignBrief({ job, roomId: KITCHEN_ROOM_ID, catalog: CURRENT_CATALOG, designRules: DESIGN_RULES, intakeDefinition, intake: kitchenIntake() });
  if (!brief.ok) throw new Error(brief.reason);
  return brief.brief.intake;
}

const input = (job: Job = kitchenWithIsland(), over: Partial<DraftLayoutInput> = {}): DraftLayoutInput => ({
  job,
  roomId: KITCHEN_ROOM_ID,
  catalog: CURRENT_CATALOG,
  designRules: DESIGN_RULES,
  layout: LAYOUT_NUMBERS,
  answers: answersFor(kitchenWithIsland()),
  cabinetTop: 'ceiling',
  ...over,
});

function drafted(i: DraftLayoutInput = input()) {
  const r = draftLayout(i);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/**
 * The example kitchen with walls A, B and the island cleared, and one base + upper run along the
 * whole of wall C (12'), with no corners: a 30" range at 3", a sink `sinkAt` from the wall's start
 * with its dishwasher to the right, and either a 36" window at 60" or a 36" fridge at 104".
 */
function wallC(sinkAt: number, with_: 'window' | 'fridge' = 'window'): Job {
  const job = kitchenWithIsland();
  const room = job.rooms[0]!;
  const c = room.walls[2]!;
  const measured = (v: Length) => ({ value: v, provenance: 'unmeasured' as const, source_mm: null });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const wall: Wall = {
    ...c,
    openings: with_ === 'window' ? [{ opening_id: id(880), kind: 'window', offset: measured(inch(60)), width: measured(inch(36)), height: measured(inch(40)), sill_height: measured(inch(42)), swing: null }] : [],
    runs: [{ run_id: id(881), kind: 'base_upper', offset: 0, length: inch(144), depth: inch(24) }],
    appliances: [
      { placement_id: id(882), kind: 'range', offset: inch(3), width: measured(inch(30)), paired_with: null },
      { placement_id: id(883), kind: 'sink', offset: inch(sinkAt), width: measured(inch(32)), paired_with: null },
      { placement_id: id(884), kind: 'dishwasher', offset: inch(sinkAt + 32), width: measured(inch(24)), paired_with: id(883) },
      ...(with_ === 'fridge' ? [{ placement_id: id(885), kind: 'fridge', offset: inch(104), width: measured(inch(36)), paired_with: null }] : []),
    ],
  };
  const walls = room.walls.filter((w) => w.kind === 'room').map((w, i) => (i === 2 ? wall : { ...w, runs: [], appliances: [] }));
  return JobSchema.parse({ ...job, rooms: [{ ...room, walls }] });
}

describe('the layout builder', () => {
  it('gives the same options, in the same order, every time (P5)', () => {
    expect(JSON.stringify(drafted())).toBe(JSON.stringify(drafted()));
  });

  it('places only catalog cabinets, in a valid master copy, that pass every layout check', () => {
    for (const job of [kitchenWithIsland(), wallC(56), wallC(40, 'fridge')]) {
      for (const o of drafted(input(job)).options) {
        expect(JobSchema.safeParse({ ...job, rooms: [o.room] }).success).toBe(true);
        expect(o.room.items.length).toBeGreaterThan(0);
        expect(o.issues.filter((i) => i.check_id.startsWith('layout.'))).toEqual([]);
        // The only catalog findings are the choices left as blockers until the intake is mapped (owner, 2026-11-09) and CAT-2.
        for (const i of o.issues.filter((x) => x.check_id.startsWith('catalog.'))) expect(i.message).toMatch(/needs a choice for “(Door style|Hinge side \(single door\))”\.$/);
        for (const item of o.room.items) expect(item.origin).toEqual({ placed_by: 'ai', last_edited_by: 'ai', approved: false });
      }
    }
  });

  it('keeps the dishwasher touching the sink base in every option (HARD-005)', () => {
    for (const job of [kitchenWithIsland(), wallC(56), wallC(40, 'fridge')])
      for (const o of drafted(input(job)).options) {
        const [sink] = of(o.room.items, 'sink_base');
        const [dw] = of(o.room.items, 'dishwasher_opening');
        expect(sink && dw && (end(sink) === dw.position.offset || end(dw) === sink.position.offset)).toBe(true);
      }
  });

  it('moves appliances only along their own wall, at most 24", and says why', () => {
    for (const o of drafted().options) {
      expect(o.moves.length).toBeGreaterThan(0); // the example kitchen needs room for its corner cabinet
      for (const m of o.moves) {
        expect(Math.abs(m.to - m.from)).toBeLessThanOrEqual(inch(24));
        const wall = o.room.walls.find((w) => w.wall_id === m.wallId)!;
        expect(wall.appliances.find((a) => a.placement_id === m.placementId)?.offset).toBe(m.to);
        expect(m.why).toMatch(/moved .+ (PRIN-011|PREF-023|HARD-005)/);
      }
    }
  });

  it('offers the sink centred under the window when it is close, and scores it (PREF-023)', () => {
    const { options } = drafted(input(wallC(56)));
    const centred = options.find((o) => o.choices.sink === 'under_window')!;
    const sink = centred.room.walls[2]!.appliances.find((a) => a.kind === 'sink')!;
    expect(sink.offset + sink.width.value / 2).toBe(inch(78)); // the window's centre
    expect(centred.moves.find((m) => m.kind === 'sink')).toMatchObject({ ruleId: 'PREF-023', from: inch(56), to: inch(62) });
    expect(centred.scorecard.find((l) => l.ruleId === 'PREF-023')?.result).toBe('met');
    expect(options.find((o) => o.choices.sink === 'as_drawn')!.scorecard.find((l) => l.ruleId === 'PREF-023')?.result).toBe('broken');
  });

  it('never moves the sink further than 24" to centre it, and says so', () => {
    // The sink's centre is 32" from the window's centre: too far.
    // Trying to centre it changes nothing, so that option is the same as "as drawn" and is merged with it.
    for (const o of drafted(input(wallC(30))).options) {
      expect(o.moves.some((m) => m.ruleId === 'PREF-023')).toBe(false);
      // It is still moved a little to clear the range (PRIN-011), but not to centre it.
      expect(o.scorecard.find((l) => l.ruleId === 'PREF-023')?.result).toBe('broken');
    }
  });

  it('leaves the hood space exactly over the range, so it is centred (HARD-007), and centres a cabinet over the fridge (HARD-006)', () => {
    for (const o of drafted(input(wallC(40, 'fridge'))).options) {
      const wall = o.room.walls[2]!;
      const range = wall.appliances.find((a) => a.kind === 'range')!;
      const fridge = wall.appliances.find((a) => a.kind === 'fridge')!;
      const uppers = o.room.items.filter((i) => i.position.wall_id === wall.wall_id && i.position.elevation > 0 && code.get(i.catalog_item_id) !== 'upper_no_shelf');
      expect(uppers.some((u) => u.position.offset < range.offset + range.width.value && end(u) > range.offset)).toBe(false);
      const [over] = of(o.room.items, 'upper_no_shelf');
      expect(over?.position.offset).toBe(fridge.offset);
      expect(over?.width).toBe(fridge.width.value);
    }
  });

  it('follows what the designer chose over the range: a cabinet centred on it, or a millwork hood left open (owner, 2026-11-09)', () => {
    const withAbove = (above: 'cabinet' | 'millwork_hood'): Job => {
      const job = wallC(40);
      const room = job.rooms[0]!;
      const walls = room.walls.map((w, i) => (i === 2 ? { ...w, appliances: w.appliances.map((a) => (a.kind === 'range' ? { ...a, above } : a)) } : w));
      return JobSchema.parse({ ...job, rooms: [{ ...room, walls }] });
    };
    for (const o of drafted(input(withAbove('cabinet'))).options) {
      const wall = o.room.walls[2]!;
      const range = wall.appliances.find((a) => a.kind === 'range')!;
      const over = o.room.items.filter((i) => i.position.wall_id === wall.wall_id && i.position.elevation > 0 && i.position.offset < range.offset + range.width.value && end(i) > range.offset);
      expect(over.map((i) => [code.get(i.catalog_item_id), i.position.offset, i.width])).toEqual([['upper_no_shelf', range.offset, range.width.value]]);
      expect(o.issues.some((i) => i.message.includes('HARD-008'))).toBe(true);
    }
    for (const o of drafted(input(withAbove('millwork_hood'))).options) {
      const wall = o.room.walls[2]!;
      const range = wall.appliances.find((a) => a.kind === 'range')!;
      expect(o.room.items.some((i) => i.position.wall_id === wall.wall_id && i.position.elevation > 0 && i.position.offset < range.offset + range.width.value && end(i) > range.offset)).toBe(false);
      expect(o.issues.some((i) => i.message.includes('millwork hood'))).toBe(true);
    }
  });

  it('puts the corner cabinet in the corner and starts the next wall after its leg', () => {
    const o = drafted().options[0]!;
    const room = o.room;
    const [a, b] = room.walls;
    const [corner] = of(room.items, 'corner_base');
    expect(corner?.position.wall_id).toBe(a!.wall_id);
    expect(end(corner!)).toBe(inch(144) - inch(2.25)); // wall A's inside corner
    const onB = room.items.filter((i) => i.position.wall_id === b!.wall_id && i.position.elevation === 0);
    expect(onB.every((i) => i.position.offset >= inch(2.25) + inch(36))).toBe(true);
  });

  it('finishes open ends and puts a filler at a wall (CB-FACT-10)', () => {
    const o = drafted().options[0]!;
    const island = o.room.walls.find((w) => w.kind === 'floating')!;
    const onIsland = o.room.items.filter((i) => i.position.wall_id === island.wall_id).sort((x, y) => x.position.offset - y.position.offset);
    expect(onIsland[0]!.item_selections['end_right']).toBe('applied_finished'); // the island's start: facing it, on the right
    expect(onIsland.at(-1)!.item_selections['end_left']).toBe('applied_finished');
    const a = o.room.walls[0]!;
    const fillers = of(o.room.items, 'base_filler').filter((i) => i.position.wall_id === a.wall_id);
    expect(fillers.map((f) => f.position.offset)).toEqual([inch(2.25)]); // wall A's start meets wall D
  });

  it('scores every option against the confirmed rules, in the owner\'s words, best first', () => {
    const { options, proposed } = drafted(input(wallC(56)));
    const first = options[0]!;
    expect(first.scorecard.map((l) => l.ruleId)).toEqual(expect.arrayContaining(['PREF-001', 'PREF-002', 'PREF-003', 'PREF-007', 'PREF-019', 'PREF-021', 'PREF-023', 'client:drawer_level']));
    expect(first.scorecard.find((l) => l.ruleId === 'PREF-007')?.strength).toBe('very strong, not hard');
    expect(proposed).toContain('how options are ranked');
    const blocks = options.map((o) => o.issues.filter((i) => i.severity === 'block').length);
    expect(blocks).toEqual([...blocks].sort((x, y) => x - y));
  });

  it('says what it couldn\'t do, instead of hiding it', () => {
    const o = drafted().options[0]!;
    expect(o.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^The 29 1\/4" of pantry at .* can't be filled: Tall pantry is made 30" wide only until the shop gives its limits \(CAT-1\)\.$/)]),
    );
  });
});

describe('refusing to draft', () => {
  it('refuses a room with no cabinet runs, or an unknown room', () => {
    const job = kitchenWithIsland();
    const bare: Job = { ...job, rooms: job.rooms.map((r: Room) => ({ ...r, walls: r.walls.map((w) => ({ ...w, runs: [], appliances: [] })) })) };
    expect(draftLayout(input(bare))).toEqual({ ok: false, reason: '"Kitchen" has no cabinet runs to fill.' });
    expect(draftLayout(input(job, { roomId: '00000000-0000-4000-8000-000000000999' })).ok).toBe(false);
  });

  it('refuses its own data when it names a cabinet the catalog doesn\'t have', async () => {
    const data = structuredClone((await import('../data/draft-rules.json')).default) as { items: { sink_base: { code: string } } };
    data.items.sink_base.code = 'no_such_cabinet';
    const r = readDraftConfig(CURRENT_CATALOG, DESIGN_RULES, data);
    expect(r).toEqual({ ok: false, reason: 'The layout builder can\'t start: sink_base: the catalog has no cabinet type "no_such_cabinet".' });
  });

  it('refuses to place uppers with no cabinet height chosen, and says so', () => {
    const o = drafted(input(wallC(56), { cabinetTop: null })).options[0]!;
    expect(o.room.items.some((i) => i.position.elevation > 0)).toBe(false);
    expect(o.issues.map((i) => i.message)).toContain('No cabinet height is chosen in the design choices, so the uppers and their top line can\'t be placed.');
  });
});
