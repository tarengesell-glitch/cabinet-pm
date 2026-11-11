/**
 * Representative design choices for checking how a room's answers are read: kitchens with and
 * without an island, each island-panel choice, a bathroom, another room type, and missing answers.
 */
import { DEFINITION, type Definition } from '../model/definition';
import { Intake, startIntake, type IntakeState } from '../model/engine';

if (!DEFINITION.ok) throw new Error(DEFINITION.reason);
export const def: Definition = DEFINITION.value;

/** Answers every open question of the room on screen, with `pick` overrides (as engine.test.ts does). */
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

const BASE = { material: 'painted', feel: 'country', colour_tone: 'white.medium', door_style: 'country', hardware: 'handles' };

/** Each scenario: a name and the design choices it makes. */
export function scenarios(): { name: string; state: IntakeState }[] {
  const out: { name: string; state: IntakeState }[] = [];
  {
    const x = new Intake(def, startIntake(def, 'kitchen-room'));
    answerRoom(x, { ...BASE, shape: 'l_shape_island', cabinet_height: '8ft', drawer_level: 'maximum', corner_insert: 'lazy_susan', garbage_recycling: 'yes', garbage_location: 'dedicated_cabinet', island_back_panel: 'door_panels', island_side_panel: 'detailed_short' });
    x.addRoom('bath-room');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'match.kitchen-room' });
    x.addRoom('office-room');
    answerRoom(x, { room_type: 'office_1', design_basis: 'match.kitchen-room' });
    out.push({ name: 'island kitchen with a bathroom and an office', state: x.state });
  }
  {
    const x = new Intake(def, startIntake(def, 'kitchen-room'));
    answerRoom(x, { ...BASE, shape: 'galley', cabinet_height: 'to_ceiling', drawer_level: 'minimum', corner_insert: 'double_shelf', garbage_recycling: 'yes', garbage_location: 'under_sink' });
    out.push({ name: 'galley kitchen to the ceiling, garbage under the sink', state: x.state });
  }
  {
    const x = new Intake(def, startIntake(def, 'kitchen-room'));
    answerRoom(x, { ...BASE, shape: 'double_island', cabinet_height: '10ft', drawer_level: 'moderate', garbage_recycling: 'no', island_back_panel: 'shiplap', island_side_panel: 'waterfall_stone' });
    out.push({ name: 'two islands, shiplap and waterfall sides, no garbage pull-out', state: x.state });
  }
  {
    const x = new Intake(def, startIntake(def, 'kitchen-room'));
    answerRoom(x, { ...BASE, shape: 'l_shape_island', island_back_panel: 'flat', island_side_panel: 'plain_gable' });
    out.push({ name: 'island with a flat back and plain gable sides', state: x.state });
  }
  out.push({ name: 'nothing answered yet', state: startIntake(def, 'kitchen-room') });
  return out;
}
