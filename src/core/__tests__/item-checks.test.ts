import { describe, expect, it } from 'vitest';
import { ITEM_CHECKS, JobSchema, resolveSelections, runChecks, type Job, type PlacedItem } from '../index';
import * as examples from '../examples/rooms';
import { inch } from '../examples/helpers';

const ids = (job: Job) => runChecks(ITEM_CHECKS, job, {}).issues.map((i) => i.check_id);
/** The example with one item changed. */
function withItem(n: number, change: (i: PlacedItem) => PlacedItem): Job {
  const j = examples.kitchenWithCabinets();
  const room = j.rooms[0]!;
  return { ...j, rooms: [{ ...room, items: room.items.map((it, k) => (k === n ? change(it) : it)) }] };
}

describe('placed items in the master copy', () => {
  it('the example kitchen with cabinets is valid and passes every item check', () => {
    expect(JobSchema.safeParse(examples.kitchenWithCabinets()).success).toBe(true);
    expect(ids(examples.kitchenWithCabinets())).toEqual([]);
  });

  it('refuses an item with no width, or a length that is not on a 1/64" mark', () => {
    expect(JobSchema.safeParse(withItem(0, (i) => ({ ...i, width: 0 }))).success).toBe(false);
    expect(JobSchema.safeParse(withItem(0, (i) => ({ ...i, width: 10.5 }))).success).toBe(false);
  });

  it('refuses an item ID used twice', () => {
    const j = examples.kitchenWithCabinets();
    const room = j.rooms[0]!;
    const twin = { ...room.items[1]!, item_instance_id: room.items[0]!.item_instance_id };
    expect(JobSchema.safeParse({ ...j, rooms: [{ ...room, items: [room.items[0], twin] }] }).success).toBe(false);
  });

  it('resolves selections item, then room, then job', () => {
    expect(resolveSelections({ job_selections: { door_style: 'slab', hinge: 'left' } }, { room_selections: { door_style: 'shaker' } }, { item_selections: { hinge: 'right' } })).toEqual({
      door_style: 'shaker',
      hinge: 'right',
    });
  });
});

describe('item checks: each one fails on a copy broken for it', () => {
  it('on a wall of the room, on its inside', () => {
    expect(ids(withItem(0, (i) => ({ ...i, position: { ...i.position, wall_id: '00000000-0000-4000-8000-000000009999' } })))).toContain('layout.items-on-wall');
    expect(ids(withItem(0, (i) => ({ ...i, position: { ...i.position, side: 'right' } })))).toContain('layout.items-on-wall');
  });

  it('within the wall’s length', () => {
    expect(ids(withItem(0, (i) => ({ ...i, position: { ...i.position, offset: inch(130) } })))).toContain('layout.items-fit-along-wall');
  });

  it('under the ceiling', () => {
    expect(ids(withItem(3, (i) => ({ ...i, height: inch(43) })))).toContain('layout.items-under-ceiling');
  });

  it('clear of doors and windows (a base below the sill is fine; an upper in front of it is not)', () => {
    expect(ids(withItem(3, (i) => ({ ...i, position: { ...i.position, offset: inch(50) } })))).toContain('layout.items-clear-openings');
  });

  it('not overlapping another item on the same wall, or round a corner', () => {
    expect(ids(withItem(1, (i) => ({ ...i, position: { ...i.position, offset: inch(20) } })))).toContain('layout.items-overlap');
    // An upper may hang above a base: different heights don't overlap.
    expect(ids(examples.kitchenWithCabinets())).not.toContain('layout.items-overlap');
    // A base at the start of wall B reaching into wall A's last base, at the corner.
    const j = examples.kitchenWithCabinets();
    const room = j.rooms[0]!;
    const wallB = room.walls[1]!.wall_id;
    const atEndOfA = { ...room.items[0]!, item_instance_id: '00000000-0000-4000-8000-000000000901', position: { ...room.items[0]!.position, offset: inch(120) } };
    const startOfB = { ...room.items[0]!, item_instance_id: '00000000-0000-4000-8000-000000000902', position: { ...room.items[0]!.position, wall_id: wallB, offset: inch(2, 1, 4) } };
    const corner = { ...j, rooms: [{ ...room, items: [atEndOfA, startOfB] }] };
    expect(ids(corner)).toContain('layout.items-overlap');
  });
});
