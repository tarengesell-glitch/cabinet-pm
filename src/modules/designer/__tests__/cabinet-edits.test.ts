// Customize's cabinet edits (owner, 2026-11-12): from a side, moving along the wall, sizes and
// position, options, sections and appliance looks; and the 3D handles' drag maths.
import { describe, expect, it } from 'vitest';
import { RoomSchema, type PlacedItem, type Room } from '@/core/index';
import { applyMoves, cabinetViews, editItems, placeholderItems } from '../model/cabinets';
import { draftPlaceholder } from '../model/placeholder-draft';
import { editSection, sectionAt } from '../model/sections';
import { dragResult } from '../ui/Stage3D';
import { isPreset, presetsFor } from '../model/library';
import { realKitchenRoom } from './real-kitchen';

const IN = 64;
let n = 0;
const ids = () => `00000000-0000-4000-9000-${String(++n).padStart(12, '0')}`;

function placed(): Room {
  const room = realKitchenRoom();
  const d = draftPlaceholder(room, { drawers: 'maximum', cornerInsert: null, garbage: 'none', cabinetTop: 'ceiling', roomSet: 'kitchen' }, ids);
  if (!d.ok) throw new Error(d.reason);
  const moved = applyMoves(room, d.value);
  const items = placeholderItems(moved, d.value);
  if (!items.ok) throw new Error(items.reason);
  return { ...moved, items: items.value };
}
const unwrap = <T,>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const byId = (room: Room, id: string): PlacedItem => room.items.find((i) => i.item_instance_id === id)!;
/** Three touching upper cabinets in a row, left to right, on the same wall. */
function threeUppers(room: Room): [PlacedItem, PlacedItem, PlacedItem] {
  const ups = room.items.filter((i) => i.position.elevation > 0).sort((a, b) => a.position.wall_id.localeCompare(b.position.wall_id) || a.position.offset - b.position.offset);
  for (let k = 0; k + 2 < ups.length; k++) {
    const [a, b, c] = [ups[k]!, ups[k + 1]!, ups[k + 2]!];
    if (a.position.wall_id === c.position.wall_id && a.position.offset + a.width === b.position.offset && b.position.offset + b.width === c.position.offset && a.position.elevation === b.position.elevation && b.position.elevation === c.position.elevation) return [a, b, c];
  }
  throw new Error('no three touching uppers');
}

describe('changing a cabinet from Customize and the 3D handles', () => {
  it('a width from one side takes it from the cabinet on that side only', () => {
    const room = placed();
    const [a, b, c] = threeUppers(room);
    const low = unwrap(editItems(room, { kind: 'resize', id: b.item_instance_id, side: 'low', width: b.width + 2 * IN }));
    expect(byId(low, a.item_instance_id).width).toBe(a.width - 2 * IN);
    expect(byId(low, b.item_instance_id).position.offset).toBe(b.position.offset - 2 * IN);
    expect(byId(low, c.item_instance_id)).toEqual(c);
    const high = unwrap(editItems(room, { kind: 'resize', id: b.item_instance_id, side: 'high', width: b.width - IN }));
    expect(byId(high, c.item_instance_id).width).toBe(c.width + IN);
    expect(byId(high, c.item_instance_id).position.offset).toBe(c.position.offset - IN);
    expect(byId(high, a.item_instance_id)).toEqual(a);
  });

  it('moving along the wall: the neighbours either side give and take, so the run keeps its length', () => {
    const room = placed();
    const [a, b, c] = threeUppers(room);
    const r = unwrap(editItems(room, { kind: 'move', id: b.item_instance_id, by: 3 * IN }));
    expect(byId(r, b.item_instance_id).position.offset).toBe(b.position.offset + 3 * IN);
    expect(byId(r, a.item_instance_id).width).toBe(a.width + 3 * IN);
    expect(byId(r, c.item_instance_id).width).toBe(c.width - 3 * IN);
    expect(byId(r, c.item_instance_id).position.offset).toBe(c.position.offset + 3 * IN);
    expect(editItems(room, { kind: 'move', id: b.item_instance_id, by: c.width + IN }).ok).toBe(false);
  });

  it('height, depth, height off the floor and distance from the wall change only what is given', () => {
    const room = placed();
    const [, b] = threeUppers(room);
    const r = unwrap(editItems(room, { kind: 'box', id: b.item_instance_id, height: b.height - 6 * IN, setback: IN }));
    expect(byId(r, b.item_instance_id)).toMatchObject({ height: b.height - 6 * IN, depth: b.depth, position: { ...b.position, setback: IN } });
    expect(byId(r, b.item_instance_id).origin.last_edited_by).toBe('designer');
    expect(editItems(room, { kind: 'box', id: b.item_instance_id, depth: 0 }).ok).toBe(false);
    expect(editItems(room, { kind: 'box', id: b.item_instance_id, elevation: -IN }).ok).toBe(false);
  });

  it('options: the door opening, ends and back, only with values the catalog lists', () => {
    const room = placed();
    const base = room.items.find((i) => cabinetViews(room).find((v) => v.id === i.item_instance_id)?.code === 'base_3_drawers')!;
    const up = threeUppers(room)[1];
    expect(unwrap(editItems(room, { kind: 'option', id: up.item_instance_id, option: 'hinge_side', value: 'pair' })).items.find((i) => i.item_instance_id === up.item_instance_id)!.item_selections['hinge_side']).toBe('pair');
    expect(editItems(room, { kind: 'option', id: up.item_instance_id, option: 'hinge_side', value: 'sideways' }).ok).toBe(false);
    // A drawer bank has no doors, so no door opening.
    expect(editItems(room, { kind: 'option', id: base.item_instance_id, option: 'hinge_side', value: 'left' }).ok).toBe(false);
    const ended = unwrap(editItems(room, { kind: 'option', id: base.item_instance_id, option: 'end_left', value: 'finished' }));
    const backed = unwrap(editItems(ended, { kind: 'option', id: base.item_instance_id, option: 'back', value: 'finished_door' }));
    expect(byId(backed, base.item_instance_id).item_selections).toMatchObject({ end_left: 'finished', back: 'finished_door' });
    const cleared = unwrap(editItems(backed, { kind: 'option', id: base.item_instance_id, option: 'back', value: null }));
    expect(byId(cleared, base.item_instance_id).item_selections['back']).toBeUndefined();
  });

  it('sections are saved on the cabinet, valid in the master copy, and can be put back', () => {
    const room = placed();
    const up = threeUppers(room)[1];
    const split = unwrap(editSection({ kind: 'doors', shelves: 1, rollouts: 0, size: null }, [], 'split_vertical'));
    const drawers = unwrap(editSection(split, [1], 'drawers'));
    const r = unwrap(editItems(room, { kind: 'sections', id: up.item_instance_id, sections: drawers }));
    expect(byId(r, up.item_instance_id).sections).toEqual(drawers);
    expect(RoomSchema.safeParse(r).success).toBe(true);
    expect(cabinetViews(r).find((v) => v.id === up.item_instance_id)!.sections).toEqual(drawers);
    const back = unwrap(editItems(r, { kind: 'sections', id: up.item_instance_id, sections: null }));
    expect('sections' in byId(back, up.item_instance_id)).toBe(false);
  });

  it('an appliance look is saved on the appliance, from its list only', () => {
    const room = placed();
    const sink = room.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'sink')!;
    const r = unwrap(editItems(room, { kind: 'appliance', placementId: sink.placement_id, option: 'bowls', value: 'double_60_40' }));
    expect(r.walls.flatMap((w) => w.appliances).find((a) => a.placement_id === sink.placement_id)!.selections).toEqual({ bowls: 'double_60_40' });
    expect(RoomSchema.safeParse(r).success).toBe(true);
    // The sink base shows it, so the 3D view draws the bowls chosen.
    expect(cabinetViews(r).find((v) => v.code === 'sink_base')!.housed).toMatchObject({ placementId: sink.placement_id, kind: 'sink', selections: { bowls: 'double_60_40' } });
    expect(editItems(room, { kind: 'appliance', placementId: sink.placement_id, option: 'bowls', value: 'triple' }).ok).toBe(false);
    const fridge = room.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'fridge')!;
    expect(editItems(room, { kind: 'appliance', placementId: fridge.placement_id, option: 'front', value: 'panelled' }).ok).toBe(true);
  });
});

describe('splitting and typed widths (owner, 2026-11-12)', () => {
  it('splitting makes two separate cabinets: side by side on the width step, or one over the other', () => {
    const room = placed();
    const [, b] = threeUppers(room);
    const side = unwrap(editItems(room, { kind: 'split', id: b.item_instance_id, direction: 'side_by_side', newId: '00000000-0000-4000-a000-000000000001' }));
    const one = byId(side, b.item_instance_id);
    const two = byId(side, '00000000-0000-4000-a000-000000000001');
    expect(one.width + two.width).toBe(b.width);
    expect(one.width % 4).toBe(0);
    expect(two.position.offset).toBe(b.position.offset + one.width);
    expect(two.catalog_item_id).toBe(b.catalog_item_id);
    expect(side.items).toHaveLength(room.items.length + 1);
    expect(RoomSchema.safeParse(side).success).toBe(true);
    const stacked = unwrap(editItems(room, { kind: 'split', id: b.item_instance_id, direction: 'stacked', newId: '00000000-0000-4000-a000-000000000002' }));
    const low = byId(stacked, b.item_instance_id);
    const high = byId(stacked, '00000000-0000-4000-a000-000000000002');
    expect(low.height + high.height).toBe(b.height);
    expect(high.position.elevation).toBe(b.position.elevation + low.height);
    expect(high.width).toBe(b.width);
    // A used ID is refused.
    expect(editItems(room, { kind: 'split', id: b.item_instance_id, direction: 'stacked', newId: b.item_instance_id }).ok).toBe(false);
  });

  it('a typed width on both sides takes half from each neighbour', () => {
    const room = placed();
    const [a, b, c] = threeUppers(room);
    const r = unwrap(editItems(room, { kind: 'resize', id: b.item_instance_id, side: 'both', width: b.width + 4 * IN }));
    expect(byId(r, a.item_instance_id).width).toBe(a.width - 2 * IN);
    expect(byId(r, c.item_instance_id).width).toBe(c.width - 2 * IN);
    expect(byId(r, b.item_instance_id).position.offset).toBe(b.position.offset - 2 * IN);
    expect(byId(r, b.item_instance_id).width).toBe(b.width + 4 * IN);
  });
});

describe('editing sections', () => {
  const doors = { kind: 'doors', shelves: 0, rollouts: 0, size: null } as const;
  it('splits, adds parts beside in the same direction, and removes them', () => {
    const two = unwrap(editSection(doors, [], 'split_horizontal'));
    expect(two).toMatchObject({ kind: 'split', direction: 'horizontal', parts: [doors, doors] });
    const three = unwrap(editSection(two, [0], 'split_horizontal'));
    expect(three.kind === 'split' && three.parts).toHaveLength(3);
    const nested = unwrap(editSection(two, [1], 'split_vertical'));
    expect(sectionAt(nested, [1])).toMatchObject({ kind: 'split', direction: 'vertical' });
    const back = unwrap(editSection(unwrap(editSection(two, [1], 'remove')), [], 'add_shelf'));
    expect(back).toMatchObject({ kind: 'doors', shelves: 1 });
  });

  it('shelves, drawers and roll-outs go only where they belong', () => {
    expect(editSection(doors, [], 'add_drawer').ok).toBe(false);
    const d = unwrap(editSection(doors, [], 'drawers'));
    expect(d).toMatchObject({ kind: 'drawers', count: 3 });
    expect(editSection(d, [], 'add_shelf').ok).toBe(false);
    expect(editSection(d, [], 'add_rollout').ok).toBe(false);
    expect(unwrap(editSection(d, [], 'add_drawer'))).toMatchObject({ count: 4 });
    expect(unwrap(editSection(doors, [], 'add_rollout'))).toMatchObject({ rollouts: 1 });
    expect(editSection(doors, [], 'remove_shelf').ok).toBe(false);
    expect(editSection(doors, [], 'remove').ok).toBe(false);
  });
});

describe('the 3D handles', () => {
  const h = { id: 'c', sign: 1, w: 30, h: 34, d: 24, y0: 0, setback: 0 };
  it('the left handle grows the cabinet from its left: the wall’s start when offsets run left to right', () => {
    const r = dragResult({ ...h, handle: 'left' }, { x: -2, y: 0, z: 0 });
    expect(r.edit).toEqual({ kind: 'resize', id: 'c', side: 'low', width: 32 * IN });
    expect(r.text).toBe('Width 32"');
    expect(dragResult({ ...h, sign: -1, handle: 'left' }, { x: -2, y: 0, z: 0 }).edit).toMatchObject({ side: 'high' });
  });
  it('snaps to 1/16", and a drag that changes nothing is no edit', () => {
    expect(dragResult({ ...h, handle: 'right' }, { x: 1.06, y: 0, z: 0 }).edit).toMatchObject({ width: 31 * IN + 4 });
    expect(dragResult({ ...h, handle: 'right' }, { x: 0.01, y: 0, z: 0 }).edit).toBeNull();
  });
  it('top, front and move', () => {
    expect(dragResult({ ...h, handle: 'top' }, { x: 0, y: -4, z: 0 }).edit).toEqual({ kind: 'box', id: 'c', height: 30 * IN });
    expect(dragResult({ ...h, handle: 'front' }, { x: 0, y: 0, z: -3 }).edit).toEqual({ kind: 'box', id: 'c', depth: 21 * IN });
    expect(dragResult({ ...h, handle: 'move' }, { x: 3, y: 1, z: 0 }).edit).toEqual({ kind: 'move', id: 'c', by: 3 * IN });
    expect(dragResult({ ...h, sign: -1, handle: 'move' }, { x: 3, y: 1, z: 0 }).edit).toEqual({ kind: 'move', id: 'c', by: -3 * IN });
    expect(dragResult({ ...h, handle: 'move' }, { x: 1, y: 5, z: 0 }).edit).toEqual({ kind: 'box', id: 'c', elevation: 5 * IN });
  });
});

describe('library choices and drawer inserts (owner, 2026-11-13)', () => {
  it('offers the owner’s twelve base choices, each a catalog base with its interior', () => {
    const list = presetsFor('base');
    expect(list.map((p) => p.name)).toEqual([
      'Full door',
      'Door and drawer',
      'Door and drawer, two roll-outs',
      'Full door, three roll-outs',
      'Full door, four roll-outs',
      'Four drawer bank',
      'Three drawer bank',
      'Garbage pull-out',
      'Garbage pull-out, full height',
      'Garbage pull-out, full height, roll-out',
      'Sink base',
      'Angled cabinet',
    ]);
    expect(list.find((p) => p.id === 'full_door')!.sections).toMatchObject({ kind: 'doors', shelves: 2 });
    expect(list.find((p) => p.id === 'door_drawer')!.sections).toMatchObject({ parts: [{ kind: 'drawers', count: 1, size: 6 * IN + 52 }, { kind: 'doors', shelves: 1 }] });
    expect(list.find((p) => p.id === 'garbage_full_ro')!.sections).toEqual({ kind: 'pullout', rollouts: 1, size: null });
    expect(presetsFor('wall')).toEqual([]);
  });

  it('choosing one sets the catalog cabinet and its interior; it shows as chosen', () => {
    const room = placed();
    const base = room.items.find((i) => cabinetViews(room).find((v) => v.id === i.item_instance_id)?.code === 'base_3_drawers')!;
    const p = presetsFor('base').find((x) => x.id === 'full_door_4ro')!;
    const r = unwrap(editItems(room, { kind: 'preset', id: base.item_instance_id, code: p.code, sections: p.sections }));
    const v = cabinetViews(r).find((x) => x.id === base.item_instance_id)!;
    expect(v.code).toBe('base_doors_rollouts');
    expect(isPreset(p, v.code, v.sections ?? null)).toBe(true);
    expect(RoomSchema.safeParse(r).success).toBe(true);
    // Another kind of cabinet is refused.
    expect(editItems(room, { kind: 'preset', id: base.item_instance_id, code: 'upper_doors', sections: null }).ok).toBe(false);
  });

  it('a drawer insert is saved by drawer number, from the list only, and dropped with a new library cabinet', () => {
    const room = placed();
    const base = room.items.find((i) => cabinetViews(room).find((v) => v.id === i.item_instance_id)?.code === 'base_3_drawers')!;
    const r = unwrap(editItems(room, { kind: 'insert', id: base.item_instance_id, drawer: 1, insert: 'cutlery' }));
    expect(byId(r, base.item_instance_id).drawer_inserts).toEqual({ '1': 'cutlery' });
    expect(RoomSchema.safeParse(r).success).toBe(true);
    expect(editItems(room, { kind: 'insert', id: base.item_instance_id, drawer: 1, insert: 'bread' }).ok).toBe(false);
    const out = unwrap(editItems(r, { kind: 'insert', id: base.item_instance_id, drawer: 1, insert: null }));
    expect(byId(out, base.item_instance_id).drawer_inserts).toBeUndefined();
    const changed = unwrap(editItems(r, { kind: 'type', id: base.item_instance_id, code: 'base_doors' }));
    expect(byId(changed, base.item_instance_id).drawer_inserts).toBeUndefined();
  });
});
