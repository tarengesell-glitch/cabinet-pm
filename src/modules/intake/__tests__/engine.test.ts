import { describe, expect, it } from 'vitest';
import { buildDefinition, DEFINITION, type Definition } from '../model/definition';
import { heightLength, Intake, startIntake, type IntakeState } from '../model/engine';
import { intakeHandover } from '../model/handover';
import intakeData from '../data/intake-v1.json';
import coloursData from '../data/colours.json';
import listsData from '../data/lists.json';
import presetsData from '../data/presets-standin.json';

if (!DEFINITION.ok) throw new Error(DEFINITION.reason);
const def: Definition = DEFINITION.value;

const fresh = (): { x: Intake; s: IntakeState } => {
  const s = startIntake(def, 'kitchen-room');
  return { s, x: new Intake(def, s) };
};
const stepIds = (x: Intake): string[] => x.steps().map((s) => s.id);
const field = (key: string) => {
  const f = def.fields.get(key);
  if (!f) throw new Error(`no field ${key}`);
  return f;
};

/** Answers every open question on every step of the room on screen, with `pick` overrides. */
function answerRoom(x: Intake, pick: Record<string, string> = {}): void {
  for (let guard = 0; guard < 60; guard++) {
    const { step } = x.current();
    if (step.review) return;
    for (let pass = 0; pass < 5; pass++) {
      for (const f of x.fields(step)) {
        if (x.eff(f) !== undefined) continue;
        if (f.type === 'height') {
          x.type(f.key, '9', 'ft');
          continue;
        }
        if (f.type === 'text') {
          x.type(f.key, 'the hutch');
          continue;
        }
        const os = x.options(f);
        const want = pick[f.key] ?? os[Math.min(1, os.length - 1)]?.id;
        if (!want) throw new Error(`${f.key} has no options`);
        x.pick(f.key, want);
        if (x.state.pending) throw new Error(`unexpected linked-rooms choice on ${f.key}`);
      }
    }
    if (!x.next()) throw new Error(`stuck on ${step.id}: ${x.missing(step)}`);
  }
}

const KITCHEN = { shape: 'galley', material: 'painted', feel: 'country', colour_tone: 'white.medium', door_style: 'country', hardware: 'handles', garbage_recycling: 'no' };

describe('the intake data', () => {
  it('loads and lists every question once', () => {
    expect(def.fields.get('shape')?.options?.length).toBe(5);
    expect(def.designKeys).toContain('cabinet_colour');
    expect(def.designKeys).not.toContain('room_type');
  });

  it('refuses malformed data with the reasons, instead of guessing', () => {
    const broken = structuredClone(intakeData) as { steps: { id: string; fields: { key: string; type: string }[] }[] };
    const shape = broken.steps.find((s) => s.id === 'shape');
    if (!shape?.fields[0]) throw new Error('fixture');
    shape.fields[0].type = 'dropdown';
    const r = buildDefinition({ intake: broken, colours: coloursData, lists: listsData, presets: presetsData });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/intake-v1\.json: steps › \d+ › fields › 0 › type/);
  });

  it('refuses a colour that is not #RRGGBB', () => {
    const colours = structuredClone(coloursData);
    colours.finishes[0]!.hex = 'black';
    const r = buildDefinition({ intake: intakeData, colours, lists: listsData, presets: presetsData });
    expect(r.ok).toBe(false);
  });
});

describe('the kitchen', () => {
  it('asks the island questions only for a layout with an island', () => {
    const { x } = fresh();
    x.pick('shape', 'galley');
    expect(stepIds(x)).not.toContain('island_panels');
    expect(x.fields(def.steps.find((s) => s.id === 'colours')!).map((f) => f.key)).not.toContain('island_colour_mode');
    x.pick('shape', 'l_shape_island');
    expect(stepIds(x)).toContain('island_panels');
    expect(x.fields(def.steps.find((s) => s.id === 'colours')!).map((f) => f.key)).toContain('island_colour_mode');
  });

  it('uses the owner’s defaults and no others', () => {
    const { x } = fresh();
    expect(x.effKey('secondary_colour_mode')).toBe('none');
    expect(x.effKey('base_colour_mode')).toBe('match');
    expect(x.effKey('cutlery_organizers')).toBe('1');
    expect(x.effKey('cabinet_colour')).toBeUndefined();
    expect(x.effKey('garbage_recycling')).toBeUndefined();
  });

  it('defaults the island to the base colour once the base cabinets are a different colour', () => {
    const { x } = fresh();
    x.pick('shape', 'l_shape_island');
    expect(x.effKey('island_colour_mode')).toBe('cabinets');
    x.pick('base_colour_mode', 'own');
    expect(x.effKey('island_colour_mode')).toBe('base');
    x.pick('island_colour_mode', 'own');
    expect(x.effKey('island_colour_mode')).toBe('own');
  });

  it('offers the four hardware combinations and asks for handles and knobs only when used', () => {
    const { x } = fresh();
    expect(x.options(field('hardware')).map((o) => o.label)).toEqual([
      'Handles only',
      'Knobs only',
      'Handles on doors, knobs on drawers',
      'Knobs on doors, handles on drawers',
    ]);
    x.pick('hardware', 'knobs');
    expect(stepIds(x)).toEqual(expect.arrayContaining(['knob']));
    expect(stepIds(x)).not.toContain('handle');
    expect(x.fields(def.steps.find((s) => s.id === 'hardware_position')!).map((f) => f.key)).toEqual(['handle_position_drawers']);
  });

  it('offers "match secondary colour" for trim only when there is one, and the valance colour unless hidden', () => {
    const { x } = fresh();
    expect(x.options(field('top_trim_colour')).map((o) => o.id)).toEqual(['primary', 'other']);
    x.pick('secondary_colour_mode', 'add');
    expect(x.options(field('top_trim_colour')).map((o) => o.id)).toEqual(['primary', 'secondary', 'other']);
    const valance = def.steps.find((s) => s.id === 'valance')!;
    expect(x.fields(valance).map((f) => f.key)).toContain('light_valance_colour');
    x.pick('light_valance', 'hidden');
    expect(x.fields(valance).map((f) => f.key)).not.toContain('light_valance_colour');
  });

  it('filters the tones by material, and a colour from another tone stops counting (fails closed)', () => {
    const { x } = fresh();
    x.pick('material', 'wood');
    x.pick('colour_tone', 'white.medium');
    expect(x.options(field('cabinet_colour'))[0]?.id).toBe('wood.white.1');
    x.pick('cabinet_colour', 'wood.white.2');
    expect(x.effKey('cabinet_colour')).toBe('wood.white.2');
    x.pick('colour_tone', 'dark.medium');
    expect(x.effKey('cabinet_colour')).toBeUndefined();
    expect(x.missing(def.steps.find((s) => s.id === 'colours')!)).toBe('Choose cabinets to continue');
  });

  it('asks where else the secondary colour goes when "Other" is picked', () => {
    const { x } = fresh();
    x.pick('secondary_colour_mode', 'add');
    x.pick('secondary_areas', 'other');
    expect(x.effKey('secondary_areas')).toEqual(['other']);
    expect(x.fields(def.steps.find((s) => s.id === 'colours')!).map((f) => f.key)).toContain('secondary_where');
    x.pick('secondary_areas', 'other');
    expect(x.effKey('secondary_areas')).toBeUndefined();
  });

  it('asks where the garbage pull-outs go and how many, only after yes', () => {
    const { x } = fresh();
    const step = def.steps.find((s) => s.id === 'garbage')!;
    expect(x.fields(step).map((f) => f.key)).toEqual(['garbage_recycling']);
    x.pick('garbage_recycling', 'yes');
    expect(x.fields(step).map((f) => f.key)).toEqual(['garbage_recycling', 'garbage_location', 'garbage_slide_outs']);
  });

  it('goes through every step and finishes, then hands over every answer that applies', () => {
    const { x, s } = fresh();
    answerRoom(x, KITCHEN);
    expect(x.finish().ok).toBe(true);
    const [kitchen] = intakeHandover(def, s);
    expect(kitchen?.complete).toBe(true);
    expect(kitchen?.room_type).toBe('kitchen');
    expect(kitchen?.answers['shape']).toEqual({ status: 'selected', option_id: 'galley', label: 'Galley' });
    expect(kitchen?.answers['cutlery_organizers']).toEqual({ status: 'selected', count: 1 });
    expect(kitchen?.answers['island_back_panel']).toBeUndefined();
  });

  it('refuses to finish while anything is missing', () => {
    const { x } = fresh();
    expect(x.finish()).toEqual({ ok: false, reason: 'The kitchen still has choices missing.' });
  });
});

describe('a typed ceiling height', () => {
  it('takes decimals in feet and inches, exactly', () => {
    expect(heightLength({ ft: '8.5', in: '' })).toEqual({ ok: true, value: 102 * 64 });
    expect(heightLength({ ft: '9', in: '6.25' })).toEqual({ ok: true, value: (114 * 4 + 1) * 16 });
    expect(heightLength({ ft: '.75', in: '' })).toEqual({ ok: true, value: 9 * 64 });
  });

  it('refuses what isn’t a height, or isn’t on a 1/64 inch mark', () => {
    expect(heightLength({ ft: '9', in: '12' }).ok).toBe(false);
    expect(heightLength({ ft: '', in: '6' }).ok).toBe(false);
    expect(heightLength({ ft: 'nine', in: '' }).ok).toBe(false);
    const inexact = heightLength({ ft: '9', in: '6.3' });
    expect(inexact.ok).toBe(false);
    if (!inexact.ok) expect(inexact.reason).toMatch(/1\/64 inch/);
  });

  it('shows in the summary and blocks the step with the reason', () => {
    const { x } = fresh();
    x.pick('ceiling_height', 'other');
    x.pick('cabinet_height', '8ft');
    const heights = def.steps.find((s) => s.id === 'heights')!;
    expect(x.missing(heights)).toBe('Enter the ceiling height to continue');
    x.type('ceiling_height_entered', '9', 'ft');
    x.type('ceiling_height_entered', '6.3', 'in');
    expect(x.missing(heights)).toMatch(/1\/64 inch/);
    x.type('ceiling_height_entered', '6.5', 'in');
    expect(x.missing(heights)).toBeNull();
    expect(x.label(field('ceiling_height'))).toBe('9′ 6.5″');
  });
});

describe('later rooms', () => {
  const withKitchen = () => {
    const { x, s } = fresh();
    answerRoom(x, KITCHEN);
    x.finish();
    return { x, s };
  };

  it('starts with the room type and offers each type once per job', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    expect(x.current().step.id).toBe('room_type');
    expect(x.options(field('room_type'))).toHaveLength(14);
    x.pick('room_type', 'main_bath');
    x.addRoom('r3');
    expect(x.options(field('room_type')).map((o) => o.id)).not.toContain('main_bath');
  });

  it('offers match, coordinate, contrast and scratch for the second room', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    x.pick('room_type', 'main_bath');
    expect(x.options(field('design_basis')).map((o) => o.label)).toEqual([
      'Match the kitchen',
      'Coordinate with the kitchen',
      'Contrast with the kitchen',
      'Start from scratch',
    ]);
  });

  it('copies the kitchen design when matching, skips the kitchen-only and design questions, and keeps its own inserts', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'match.kitchen-room' });
    expect(stepIds(x)).toEqual(['room_type', 'basis', 'heights', 'room_inserts', 'review']);
    expect(x.effKey('cabinet_colour')).toBe(x.inRoom(0, () => x.effKey('cabinet_colour')));
    expect(x.effKey('insert.bath.linen_tower')).toBe('0');
    const inserts = x.fields(def.steps.find((s) => s.id === 'room_inserts')!).map((f) => f.key);
    expect(inserts).toContain('insert.bath.linen_tower');
    expect(inserts).not.toContain('insert.bar.wine_rack');
    expect(x.carried()?.from).toBe('Kitchen');
    expect(x.finish().ok).toBe(true);
  });

  it('offers "Match the kitchen" for the ceiling height, with the kitchen’s value', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    const labels = x.options(field('ceiling_height')).map((o) => o.label);
    expect(labels[0]).toMatch(/^Match the kitchen \(.+\)$/);
    expect(x.inRoom(0, () => x.options(field('ceiling_height')).map((o) => o.id))).not.toContain('match_primary');
  });

  it('asks the design questions again when starting from scratch, with nothing carried over', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    x.pick('room_type', 'office_1');
    x.pick('design_basis', 'match.kitchen-room');
    expect(x.effKey('feel')).toBe('country');
    x.pick('design_basis', 'scratch');
    expect(x.effKey('feel')).toBeUndefined();
    expect(stepIds(x)).toEqual(expect.arrayContaining(['feel', 'colours', 'interiors']));
    expect(stepIds(x)).not.toContain('shape');
  });

  it('suggests coordinating and contrasting designs from the kitchen', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    x.pick('room_type', 'main_bath');
    x.pick('design_basis', 'contrast');
    const options = x.options(field('design_preset'));
    expect(options.map((o) => o.label)).toEqual(['Light and dark', 'Paint and wood', 'Opposite style']);
    expect(options[0]?.answers?.['colour_tone']).toBe('dark.medium');
    expect(options[1]?.answers?.['material']).toBe('wood');
    expect(options[2]?.answers?.['door_style']).toBe('modern');
    x.pick('design_preset', 'light_and_dark');
    expect(x.effKey('colour_tone')).toBe('dark.medium');
  });

  it('from the third room on, recommends matching an earlier room and asks which room to coordinate with', () => {
    const { x } = withKitchen();
    x.addRoom('r2');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'contrast', design_preset: 'light_and_dark' });
    x.finish();
    x.addRoom('r3');
    x.pick('room_type', 'laundry_room');
    const basis = x.options(field('design_basis'));
    expect(basis.filter((o) => o.rec).map((o) => o.label)).toEqual(['Match the kitchen', 'Match the main bath']);
    expect(basis.map((o) => o.id)).toEqual(['match.kitchen-room', 'match.r2', 'coordinate', 'contrast', 'scratch']);
    x.pick('design_basis', 'coordinate');
    expect(x.fields(def.steps.find((s) => s.id === 'basis')!).map((f) => f.key)).toContain('basis_room');
    x.pick('basis_room', 'r2');
    // Based on the main bath (dark), not the kitchen (white).
    expect(x.options(field('design_preset'))[0]?.answers?.['colour_tone']).toBe('dark.medium');
  });
});

describe('linked rooms', () => {
  /** Kitchen, a main bath matching it, a laundry room matching the main bath. */
  const chain = () => {
    const { x, s } = fresh();
    answerRoom(x, KITCHEN);
    x.finish();
    x.addRoom('r2');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'match.kitchen-room' });
    x.finish();
    x.addRoom('r3');
    answerRoom(x, { room_type: 'laundry_room', design_basis: 'match.r2' });
    x.finish();
    return { x, s };
  };
  const cabinets = (x: Intake) => [0, 1, 2].map((i) => x.inRoom(i, () => x.effKey('cabinet_colour')));

  it('holds a kitchen change back until the person chooses; "Match currently linked rooms" changes them all', () => {
    const { x, s } = chain();
    x.switchRoom(0);
    x.pick('cabinet_colour', 'painted.white.4');
    expect(s.pending?.mode).toBe('source');
    expect(x.pendingText()?.intro).toBe('Main bath and Laundry room are linked to this kitchen.');
    expect(cabinets(x)).toEqual(['painted.white.2', 'painted.white.2', 'painted.white.2']);
    x.resolve('all');
    expect(cabinets(x)).toEqual(['painted.white.4', 'painted.white.4', 'painted.white.4']);
  });

  it('"Change only the kitchen" leaves the main bath with its design, no longer matching', () => {
    const { x } = chain();
    x.switchRoom(0);
    x.pick('cabinet_colour', 'painted.white.1');
    x.resolve('one');
    expect(cabinets(x)).toEqual(['painted.white.1', 'painted.white.2', 'painted.white.2']);
    expect(x.inRoom(1, () => x.effKey('design_basis'))).toBe('own');
    expect(x.inRoom(1, () => x.options(field('design_basis')).find((o) => o.id === 'own')?.desc)).toBe('Copied from the kitchen, no longer linked.');
  });

  it('cancel changes nothing', () => {
    const { x, s } = chain();
    x.switchRoom(0);
    x.pick('cabinet_colour', 'painted.white.1');
    x.resolve('cancel');
    expect(s.pending).toBeNull();
    expect(cabinets(x)).toEqual(['painted.white.2', 'painted.white.2', 'painted.white.2']);
  });

  it('a change made in a matched room can go back up to the kitchen and on to every linked room', () => {
    const { x } = chain();
    x.switchRoom(2);
    x.go('colours');
    expect(stepIds(x)).toContain('colours');
    x.pick('cabinet_colour', 'painted.white.3');
    expect(x.pendingText()?.intro).toBe('This laundry room matches the main bath.');
    expect(x.pendingText()?.all).toBe('Kitchen and Main bath change too.');
    x.resolve('all');
    expect(cabinets(x)).toEqual(['painted.white.3', 'painted.white.3', 'painted.white.3']);
  });

  it('or stay in that room only, which stops it matching', () => {
    const { x } = chain();
    x.switchRoom(2);
    x.go('colours');
    x.pick('cabinet_colour', 'painted.white.3');
    x.resolve('one');
    expect(cabinets(x)).toEqual(['painted.white.2', 'painted.white.2', 'painted.white.3']);
    expect(x.effKey('design_basis')).toBe('own');
    expect(stepIds(x)).toContain('feel');
  });

  it('a suggested-design room can only change itself', () => {
    const { x } = fresh();
    answerRoom(x, KITCHEN);
    x.finish();
    x.addRoom('r2');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'coordinate', design_preset: 'softer_shade' });
    x.go('colours');
    x.pick('counter_colour', 'counter.medium.1');
    expect(x.state.pending?.mode).toBe('suggested');
    expect(x.pendingText()?.all).toBeNull();
  });

  it('a kitchen change carries through a suggested design to a room coordinating with it', () => {
    const { x } = fresh();
    answerRoom(x, KITCHEN);
    x.finish();
    x.addRoom('r2');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'contrast', design_preset: 'light_and_dark' });
    x.finish();
    x.addRoom('r3');
    answerRoom(x, { room_type: 'laundry_room', design_basis: 'coordinate', basis_room: 'r2', design_preset: 'softer_shade' });
    x.switchRoom(0);
    x.pick('door_style', 'classic');
    x.resolve('all');
    expect([1, 2].map((i) => x.inRoom(i, () => x.effKey('door_style')))).toEqual(['classic', 'classic']);
  });
});
