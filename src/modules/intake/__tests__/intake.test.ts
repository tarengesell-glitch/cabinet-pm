import { describe, expect, it } from 'vitest';
import raw from '../data/kitchen.json';
import { askedQuestions, checkSavedAnswers, describeAnswer, progress, setAnswer, type Answer, type Answers } from '../model/flow';
import { readIntake, type Intake } from '../model/intake';
import { KITCHEN_INTAKE } from '../model/kitchen';

const by = 'u';
const at = '2026-11-07T00:00:00.000Z';
const pick = (option: string): Answer => ({ status: 'selected', choice: { kind: 'option', option }, by, at });
const ids = (intake: Intake, answers: Answers) => askedQuestions(intake, answers).map((q) => q.id);
const copy = () => JSON.parse(JSON.stringify(raw)) as typeof raw;

describe('the kitchen intake data', () => {
  it('reads cleanly and records its source', () => {
    expect(readIntake(raw).ok).toBe(true);
    expect(KITCHEN_INTAKE.source).toMatch(/Taren/);
  });

  it('offers the shapes, feels and 12 colour tones from the outline', () => {
    const q = (id: string) => KITCHEN_INTAKE.questions.find((x) => x.id === id)!;
    const labels = (id: string) => {
      const x = q(id);
      return x.kind === 'single' ? x.options.map((o) => o.label) : [];
    };
    expect(labels('shape')).toEqual(['Galley', 'L-Shape with Island', 'Peninsula', 'U Shape', 'Double Island']);
    expect(labels('feel')).toEqual(['Ultra modern', 'Modern', 'Transitional', 'Country', 'Classic']);
    expect(labels('colour_tone')).toHaveLength(12);
    expect(labels('drawer_level')).toEqual(['Minimum', 'Moderate', 'Maximum']);
  });

  it('marks every image as a placeholder until real ones are supplied', () => {
    for (const q of KITCHEN_INTAKE.questions) {
      if (q.kind !== 'single') continue;
      for (const o of q.options) expect(o.image === 'placeholder' || o.image.placeholder, `${q.id}/${o.id}`).toBe(true);
    }
  });
});

describe('readIntake refuses a bad file, listing every problem', () => {
  it('a condition on an option that does not exist', () => {
    const data = copy();
    data.questions.find((q) => q.id === 'island_offset')!.show_if = [{ question: 'shape', any_of: ['l_shape_island', 'triple_island'] }];
    const r = readIntake(data);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/option "triple_island", which "shape" doesn't offer/);
  });

  it('a condition on a later question, a missing option set and a duplicate question', () => {
    const data = copy();
    data.questions[0]!.show_if = [{ question: 'feel', any_of: ['modern'] }];
    data.questions[1]!.options = 'no_such_set';
    data.questions.push({ ...data.questions[3]! });
    const r = readIntake(data);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/depends on "feel", which isn't an earlier question/);
    expect(r.reason).toMatch(/option set "no_such_set", which doesn't exist/);
    expect(r.reason).toMatch(/question "feel" is listed twice/);
  });

  it('an option with no image entry at all', () => {
    const data = copy() as unknown as { option_sets: Record<string, Record<string, unknown>[]> };
    delete data.option_sets.material![0]!.image;
    expect(readIntake(data).ok).toBe(false);
  });
});

describe('which questions are asked', () => {
  const k = KITCHEN_INTAKE;

  it('asks island questions only for shapes with an island', () => {
    expect(ids(k, {})).not.toContain('island_offset');
    expect(ids(k, { shape: pick('galley') })).not.toContain('island_offset');
    expect(ids(k, { shape: pick('peninsula') })).not.toContain('island_side_panel');
    const withIsland = ids(k, { shape: pick('l_shape_island') });
    expect(withIsland).toContain('island_offset');
    expect(withIsland).toContain('island_side_panel');
    expect(withIsland).not.toContain('island_material');
  });

  it('repeats material, tone, door style and colours for an island only when its colour is offset', () => {
    const asked = ids(k, { shape: pick('double_island'), island_offset: pick('yes') });
    expect(asked).toEqual(expect.arrayContaining(['island_material', 'island_colour_tone', 'island_door_style', 'island_colours']));
    expect(ids(k, { shape: pick('double_island'), island_offset: pick('no') })).not.toContain('island_material');
  });

  it('drops island follow-ups when the shape changes away from an island', () => {
    expect(ids(k, { shape: pick('u_shape'), island_offset: pick('yes') })).not.toContain('island_material');
  });

  it('asks door handle direction only for all handles, and knob or handle picks to match', () => {
    expect(ids(k, { hardware: pick('all_handles') })).toEqual(expect.arrayContaining(['handle_selection', 'door_handle_position', 'drawer_hardware_position']));
    const knobs = ids(k, { hardware: pick('all_knobs') });
    expect(knobs).toContain('knob_selection');
    expect(knobs).not.toContain('handle_selection');
    expect(knobs).not.toContain('door_handle_position');
    const mixed = ids(k, { hardware: pick('handles_drawers_knobs_doors') });
    expect(mixed).toEqual(expect.arrayContaining(['handle_selection', 'knob_selection']));
    expect(mixed).not.toContain('door_handle_position');
  });

  it('asks nothing that depends on a "not sure" answer', () => {
    expect(ids(k, { hardware: { status: 'not_sure', by, at } })).not.toContain('drawer_hardware_position');
  });
});

describe('answers', () => {
  const k = KITCHEN_INTAKE;

  it('refuses an option the question does not offer, and a pending question being "selected"', () => {
    expect(setAnswer(k, {}, 'shape', pick('round')).ok).toBe(false);
    expect(setAnswer(k, {}, 'door_colour', pick('white')).ok).toBe(false);
    expect(setAnswer(k, {}, 'door_colour', { status: 'needs_follow_up', by, at }).ok).toBe(true);
    expect(setAnswer(k, {}, 'nope', pick('galley')).ok).toBe(false);
  });

  it('needs a whole number, 0 or more, for every count', () => {
    const counts = (c: Record<string, number>): Answer => ({ status: 'selected', choice: { kind: 'counts', counts: c }, by, at });
    expect(setAnswer(k, {}, 'organizers', counts({ cutlery: 1, utility: 0, spice: 2, tray: 0 })).ok).toBe(true);
    expect(setAnswer(k, {}, 'organizers', counts({ cutlery: 1 })).ok).toBe(false);
    expect(setAnswer(k, {}, 'organizers', counts({ cutlery: -1, utility: 0, spice: 0, tray: 0 })).ok).toBe(false);
    expect(setAnswer(k, {}, 'organizers', counts({ cutlery: 1.5, utility: 0, spice: 0, tray: 0 })).ok).toBe(false);
    const q = k.questions.find((x) => x.id === 'organizers')!;
    expect(describeAnswer(q, counts({ cutlery: 1, utility: 0, spice: 2, tray: 0 }))).toBe('1 cutlery, 2 spice');
  });

  it('lists saved answers that no longer fit instead of dropping them quietly', () => {
    const r = checkSavedAnswers(k, { shape: pick('galley'), feel: pick('gothic'), retired_question: pick('x'), material: { status: 'maybe' } });
    expect(Object.keys(r.answers)).toEqual(['shape']);
    expect(r.problems).toHaveLength(3);
    expect(checkSavedAnswers(k, 'junk').problems).toHaveLength(1);
  });

  it('is complete only when every asked question has a picked answer', () => {
    let answers: Answers = {};
    expect(progress(k, answers).complete).toBe(false);
    // Answering opens follow-up questions, so keep going until nothing new is asked.
    for (let open = askedQuestions(k, answers).filter((q) => !answers[q.id]); open.length > 0; open = askedQuestions(k, answers).filter((q) => !answers[q.id])) {
      for (const q of open) {
        const a: Answer = q.kind === 'single' ? pick(q.options[0]!.id) : q.kind === 'counts' ? { status: 'selected', choice: { kind: 'counts', counts: Object.fromEntries(q.items.map((i) => [i.id, 0])) }, by, at } : { status: 'needs_follow_up', by, at };
        answers = { ...answers, [q.id]: a };
      }
    }
    const p = progress(k, answers);
    // Pending questions (no options supplied yet) can only be flagged, so the kitchen intake can't be complete yet.
    expect(p.counts.needs_follow_up).toBeGreaterThan(0);
    expect(p.complete).toBe(false);
    expect(p.counts.unanswered).toBe(0);
  });
});
