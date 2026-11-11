import { describe, expect, it } from 'vitest';
import { fromInches } from '@/core/index';
import { DEFINITION, type Definition } from '../model/definition';
import { Intake, startIntake } from '../model/engine';
import { roomChoices, type RoomChoices } from '../model/choices';
import { answerRoom } from './answer';

if (!DEFINITION.ok) throw new Error(DEFINITION.reason);
const def: Definition = DEFINITION.value;

const KITCHEN = { shape: 'l_shape_island', drawer_level: 'moderate', corner_insert: 'lazy_susan', garbage_recycling: 'yes', garbage_location: 'dedicated_cabinet', cabinet_height: 'to_ceiling', island_back_panel: 'shiplap', island_side_panel: 'waterfall_stone' };

function job(kitchen: Record<string, string> = KITCHEN) {
  const s = startIntake(def, 'kitchen');
  const x = new Intake(def, s);
  answerRoom(x, kitchen);
  x.finish();
  return { s, x };
}
const choicesOf = (s: ReturnType<typeof job>['s'], id: string): RoomChoices => {
  const c = roomChoices(def, s, id);
  if (!c.ok) throw new Error(c.reason);
  return c.value;
};

describe('a room’s design choices for building and drawing it', () => {
  it('reads the kitchen’s choices as chosen', () => {
    const { s } = job();
    expect(choicesOf(s, 'kitchen')).toEqual({
      room_id: 'kitchen',
      roomSet: 'kitchen',
      cabinetTop: 'ceiling',
      drawerLevel: { status: 'chosen', option_id: 'moderate' },
      cornerInsert: 'lazy_susan',
      garbage: 'dedicated_cabinet',
      islandBackPanel: { status: 'chosen', option_id: 'shiplap' },
      islandSidePanel: { status: 'chosen', option_id: 'waterfall_stone' },
    });
  });

  it('keeps a cabinet height as its length, and no garbage pull-out as "none"', () => {
    const { s } = job({ ...KITCHEN, cabinet_height: '8ft', garbage_recycling: 'no' });
    const c = choicesOf(s, 'kitchen');
    const eight = fromInches(96);
    expect(c.cabinetTop).toBe(eight.ok ? eight.value : null);
    expect(c.garbage).toBe('none');
  });

  it('says a question is not applicable when it doesn’t apply: no island panels without an island, no drawer level in a bathroom', () => {
    const { s, x } = job({ ...KITCHEN, shape: 'galley' });
    expect(choicesOf(s, 'kitchen').islandBackPanel).toEqual({ status: 'not_applicable' });
    x.addRoom('bath');
    answerRoom(x, { room_type: 'main_bath', design_basis: 'match.kitchen' });
    const bath = choicesOf(s, 'bath');
    expect(bath.roomSet).toBe('bath');
    expect(bath.drawerLevel).toEqual({ status: 'not_applicable' });
    expect(bath.islandSidePanel).toEqual({ status: 'not_applicable' });
  });

  it('says a question is unanswered when it applies and has no answer', () => {
    const s = startIntake(def, 'kitchen');
    new Intake(def, s).pick('shape', 'double_island');
    const c = choicesOf(s, 'kitchen');
    expect(c.drawerLevel).toEqual({ status: 'unanswered' });
    expect(c.islandBackPanel).toEqual({ status: 'unanswered' });
    expect(c.cabinetTop).toBeNull();
  });

  it('reports a saved answer that isn’t one of the options as unrecognized, never as unanswered or another option', () => {
    const { s } = job();
    const kitchen = s.rooms[0]!;
    const damaged = { ...s, rooms: [{ ...kitchen, answers: { ...kitchen.answers, drawer_level: 'lots', island_back_panel: 'beadboard', island_side_panel: ['waterfall_stone'] } }] };
    const c = choicesOf(damaged, 'kitchen');
    expect(c.drawerLevel).toEqual({ status: 'unrecognized', value: 'lots' });
    expect(c.islandBackPanel).toEqual({ status: 'unrecognized', value: 'beadboard' });
    expect(c.islandSidePanel).toEqual({ status: 'unrecognized', value: '["waterfall_stone"]' });
  });

  it('refuses a room that isn’t in the design choices', () => {
    const { s } = job();
    expect(roomChoices(def, s, 'nowhere').ok).toBe(false);
  });
});
