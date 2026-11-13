import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JobSchema, runChecks, type PlacedItem, type Room } from '@/core/index';
import { catalogItemCheck, CURRENT_CATALOG } from '@/modules/catalog/contract';
import { editItems, endOption, placeholderItems } from '../model/cabinets';
import { endContext, fillEnds, refreshEnds, reviewEnds, withRuleEnds } from '../model/ends';
import type { DesignChoices } from '../model/choices';
import { draftPlaceholder, itemByCode, type DraftPreferences } from '../model/placeholder-draft';
import { finishedEnds } from '../ui/Stage3D';
import { draftRoom, storedDraft } from '../ui/placeholder-store';
import { room as roomOf } from '../model/editor';
import { storageKey } from '../ui/storage';
import { realKitchen, realKitchenRoom, REAL_KITCHEN_ROOM_ID } from './real-kitchen';

const IN = 64;
let n = 0;
// Not the fixture's own ID pattern, so a cabinet never shares an ID with an appliance.
const ids = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const MAX: DraftPreferences = { drawers: 'maximum', cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet', cabinetTop: 'ceiling', roomSet: 'kitchen' };
/** The same choices as the design step receives them from the design choices. */
const MAX_CHOICES: DesignChoices = {
  roomKind: 'kitchen',
  cabinetTop: 'ceiling',
  drawerLevel: { status: 'chosen', option_id: 'maximum' },
  cornerInsert: 'lazy_susan',
  garbage: 'dedicated_cabinet',
  islandBackPanel: { status: 'unanswered' },
  islandSidePanel: { status: 'unanswered' },
  look: { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false, topTrim: null, trimHex: '#ffffff', valance: null, valanceHex: '#ffffff' },
};
const PLAIN: DraftPreferences = { drawers: null, cornerInsert: null, garbage: 'none', cabinetTop: null, roomSet: 'kitchen' };

/** The real kitchen laid out by the placeholder, without ends (as an older design was saved). */
function laidOut(prefs: DraftPreferences, room: Room = realKitchenRoom()): Room {
  const d = draftPlaceholder(room, prefs, ids);
  if (!d.ok) throw new Error(d.reason);
  const items = placeholderItems(room, d.value);
  if (!items.ok) throw new Error(items.reason);
  return { ...room, items: items.value };
}
const ended = (room: Room): Room => {
  const r = withRuleEnds(room);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
const ok = <T,>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};
/** "wall index, layer, offset in inches" for a cabinet. */
const where = (room: Room, i: PlacedItem) => `${room.walls.findIndex((w) => w.wall_id === i.position.wall_id)} ${itemByCode(itemOf(i))!.type === 'wall' ? 'upper' : 'base'} ${i.position.offset / IN}`;
const itemOf = (i: PlacedItem) => CURRENT_CATALOG.items.find((c) => c.id === i.catalog_item_id)!.code;

/**
 * Which ends the 3D view covered on the real kitchen before ends were saved (worked out while
 * drawing, captured 2026-11-11 from the code before this change). Every other end was bare.
 */
const FINISHED_BEFORE: Record<string, ('low' | 'high')[]> = {
  '0 base 37.59375': ['high'], // beside the range
  '0 base 97.46875': ['low'], // the other side of the range
  '0 upper 37.59375': ['high'], // beside the hood's clear space
  '0 upper 99.46875': ['low'],
  '1 base 132': ['high'], // the run's open end
  '1 upper 56.125': ['high'], // beside the window
  '1 upper 142': ['low', 'high'], // between the window and the door
  '5 base 0': ['low'], // the island's ends
  '5 base 62.6875': ['high'],
};

describe('cabinet ends: one decision, saved on the cabinet and drawn from what is saved', () => {
  for (const [name, prefs] of [
    ['maximum drawers', MAX],
    ['no choices', PLAIN],
  ] as const)
    it(`keeps the real kitchen's finished ends exactly as the 3D view drew them (${name})`, () => {
      const room = ended(laidOut(prefs));
      const ctx = endContext(room);
      const drawn: Record<string, string[]> = {};
      for (const c of ctx.all) {
        const sides = finishedEnds(c);
        if (sides.length) drawn[where(room, room.items.find((i) => i.item_instance_id === c.id)!)] = sides;
      }
      expect(drawn).toEqual(FINISHED_BEFORE);
    });

  it('sets unfinished against a cabinet, a wall, a fridge panel and a corner leg; applied finished beside a range and at an open end', () => {
    const room = ended(laidOut(MAX));
    const at = (key: string) => room.items.find((i) => where(room, i) === key && !itemByCode(itemOf(i))!.type.startsWith('corner'))!;
    // Wall A stands on its right side: facing the cabinet, its left end is toward the wall's start.
    const besideFridge = at('0 base 37.59375');
    expect(besideFridge.item_selections).toMatchObject({ end_left: 'unfinished', end_right: 'applied_finished' }); // fridge panel | range
    expect(at('0 base 97.46875').item_selections).toMatchObject({ end_left: 'applied_finished', end_right: 'unfinished' }); // range | corner leg
    expect(at('2 base 2.25').item_selections).toMatchObject({ end_left: 'unfinished', end_right: 'unfinished' }); // wall | wall
    expect(at('5 base 31.375').item_selections).toMatchObject({ end_left: 'unfinished', end_right: 'unfinished' }); // cabinets both sides
  });

  it('leaves the L-shaped corner cabinets’ ends for the designer (open question END-2), and never sets ends on fillers or panels', () => {
    const room = ended(laidOut(MAX));
    for (const i of room.items) {
      const type = itemByCode(itemOf(i))!.type;
      if (type.startsWith('corner') || type === 'filler' || type === 'panel' || type === 'appliance_opening') {
        expect(i.item_selections['end_left']).toBeUndefined();
        expect(i.item_selections['end_right']).toBeUndefined();
      }
    }
    // The catalog still asks for them, so the checks list them as choices to make.
    const job = { ...realKitchen(), rooms: [room] };
    const missing = runChecks([catalogItemCheck(CURRENT_CATALOG)], job, {}).issues.filter((x) => /“(Left|Right) end”/.test(x.message));
    const corners = room.items.filter((i) => itemByCode(itemOf(i))!.type.startsWith('corner')).map((i) => i.item_instance_id);
    expect(missing.length).toBeGreaterThan(0);
    for (const x of missing) expect(corners).toContain(x.ref.id);
  });

  it('names left and right as seen facing the cabinet, whichever way the wall runs (PROPOSED, END-1)', () => {
    expect(endOption('left', 'high')).toBe('end_left');
    expect(endOption('left', 'low')).toBe('end_right');
    expect(endOption('right', 'low')).toBe('end_left');
    expect(endOption('right', 'high')).toBe('end_right');
    // The island's cabinets stand on its left side: its first cabinet's open end (low) is its right end.
    const room = ended(laidOut(MAX));
    const island = room.items.find((i) => where(room, i) === '5 base 0' && itemByCode(itemOf(i))!.type === 'base')!;
    expect(island.item_selections).toMatchObject({ end_right: 'applied_finished', end_left: 'unfinished' });
  });

  it('gives the same ends when the whole room is turned a quarter turn (ends belong to the cabinet, not the plan)', () => {
    const turn = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });
    const base = realKitchenRoom();
    const turned: Room = { ...base, walls: base.walls.map((w) => ({ ...w, start_point: turn(w.start_point), end_point: turn(w.end_point) })) };
    const a = ended(laidOut(MAX, base));
    const b = ended(laidOut(MAX, turned));
    const sel = (r: Room) => r.items.map((i) => `${where(r, i)} ${JSON.stringify(i.item_selections)}`).sort();
    expect(sel(b)).toEqual(sel(a));
  });
});

describe('cabinet ends after a layout change', () => {
  /** Wall B's base cabinet before the dishwasher opening, and that opening. */
  const wallB = (room: Room) => {
    const base = room.items.find((i) => where(room, i) === '1 base 38.25')!;
    const dw = room.items.find((i) => itemOf(i) === 'dishwasher_opening')!;
    return { base, dw };
  };

  it('works out again an end that followed the layout, when what is beside it changes', () => {
    const before = ended(laidOut(MAX));
    const { base, dw } = wallB(before);
    expect(base.item_selections['end_right']).toBe('unfinished'); // against the dishwasher opening
    const after = ok(refreshEnds(before, { ...before, items: before.items.filter((i) => i !== dw) }));
    expect(after.items.find((i) => i.item_instance_id === base.item_instance_id)!.item_selections['end_right']).toBe('applied_finished');
  });

  it('keeps an end that differs from the rule (a finished end by request), and every other choice on the cabinet', () => {
    const start = ended(laidOut(MAX));
    const { base, dw } = wallB(start);
    const chosen = { ...base, item_selections: { ...base.item_selections, end_left: 'finished', door_style: 'shaker' } };
    const before = { ...start, items: start.items.map((i) => (i === base ? chosen : i)) };
    const after = ok(refreshEnds(before, { ...before, items: before.items.filter((i) => i.item_instance_id !== dw.item_instance_id) }));
    const now = after.items.find((i) => i.item_instance_id === base.item_instance_id)!;
    expect(now.item_selections).toMatchObject({ end_left: 'finished', door_style: 'shaker', end_right: 'applied_finished' });
  });

  it('gives a new cabinet (a run laid out again) the layout’s ends, and leaves an older cabinet with none as it was', () => {
    const old = laidOut(MAX); // an older design: no ends saved
    const fresh = ended(laidOut(MAX));
    const newOne = fresh.items.find((i) => where(fresh, i) === '1 base 132')!;
    const before = { ...old, items: old.items.filter((i) => where(old, i) !== '1 base 132') };
    const after = ok(refreshEnds(before, { ...before, items: [...before.items, { ...newOne, item_selections: {} }] }));
    expect(after.items.find((i) => i.item_instance_id === newOne.item_instance_id)!.item_selections).toMatchObject({ end_left: 'unfinished', end_right: 'applied_finished' });
    const untouched = after.items.find((i) => where(after, i) === '0 base 37.59375')!;
    expect(untouched.item_selections).toEqual({});
  });
});

describe('older designs, saved before ends were stored', () => {
  it('lists them, sets their ends only when asked, and changes nothing else on them', () => {
    const start = laidOut(MAX);
    const withStyle = { ...start, items: start.items.map((i) => ({ ...i, item_selections: { door_style: 'slab' } })) };
    const review = ok(reviewEnds(withStyle));
    const eligible = withStyle.items.filter((i) => ['base', 'wall'].includes(itemByCode(itemOf(i))!.type));
    expect([...review.missing].sort()).toEqual(eligible.map((i) => i.item_instance_id).sort());
    expect(review.differ).toEqual([]);
    // Nothing is drawn as finished until they are set.
    expect(endContext(withStyle).all.flatMap((c) => finishedEnds(c))).toEqual([]);
    const filled = ok(fillEnds(withStyle, review.missing));
    for (const i of filled.items) expect(i.item_selections['door_style']).toBe('slab');
    expect(ok(reviewEnds(filled))).toEqual({ missing: [], differ: [], overridden: [] });
    expect(filled.items.map((i) => i.item_selections)).toEqual(ended(withStyle).items.map((i) => i.item_selections));
  });

  it('lists an end that differs from the layout, and updates only that one when asked', () => {
    const room = ended(laidOut(MAX));
    const target = room.items.find((i) => where(room, i) === '2 base 2.25')!;
    const changed = { ...room, items: room.items.map((i) => (i === target ? { ...i, item_selections: { ...i.item_selections, end_left: 'finished' } } : i)) };
    const review = ok(reviewEnds(changed));
    expect(review).toEqual({ missing: [], differ: [target.item_instance_id], overridden: [] });
    const back = ok(fillEnds(changed, review.differ));
    expect(back.items.find((i) => i.item_instance_id === target.item_instance_id)!.item_selections['end_left']).toBe('unfinished');
  });
});

describe('saving and opening again', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => void items.set(k, v),
        removeItem: (k: string) => void items.delete(k),
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('the design step saves each cabinet’s ends in the master copy, and they come back the same', () => {
    window.localStorage.setItem(storageKey(REAL_KITCHEN_ROOM_ID), JSON.stringify({ job: realKitchen(), wallDefaults: null }));
    const drafted = ok(draftRoom(REAL_KITCHEN_ROOM_ID, MAX_CHOICES, 'ffffffff-0000-4000-8000-000000000001'));
    const reopened = roomOf(ok(storedDraft(REAL_KITCHEN_ROOM_ID)));
    expect(JobSchema.safeParse(ok(storedDraft(REAL_KITCHEN_ROOM_ID)).job).success).toBe(true);
    const sel = (r: Room) => r.items.map((i) => [i.item_instance_id, i.item_selections] as const);
    expect(sel(reopened)).toEqual(sel(drafted));
    expect(reopened.items.filter((i) => i.item_selections['end_left'] === 'applied_finished' || i.item_selections['end_right'] === 'applied_finished')).toHaveLength(9);
    expect(ok(reviewEnds(reopened))).toEqual({ missing: [], differ: [], overridden: [] });
  });
});

describe('ends set by hand in Customize (owner, 2026-11-12; DECISIONS END-4)', () => {
  /** A cabinet whose low end the rule leaves unfinished (something beside it), and the option for that end. */
  const closedEnd = (room: Room): { item: PlacedItem; option: 'end_left' | 'end_right' } => {
    for (const item of room.items) {
      const option = endOption(item.position.side, 'low');
      if (item.item_selections[option] === 'unfinished' && itemByCode(CURRENT_CATALOG.items.find((c) => c.id === item.catalog_item_id)!.code)?.type === 'base') return { item, option };
    }
    throw new Error('no closed end');
  };

  it('is recorded as set by hand, kept through a layout change and "update to match", and listed when the layout disagrees', () => {
    const room = ended(laidOut(MAX));
    const { item, option } = closedEnd(room);
    const set = editItems(room, { kind: 'option', id: item.item_instance_id, option, value: 'finished' });
    if (!set.ok) throw new Error(set.reason);
    const mine = set.value.items.find((i) => i.item_instance_id === item.item_instance_id)!;
    expect(mine.set_by_hand).toEqual([option]);
    // The layout says unfinished, so it is listed for review, never as "differs, update it".
    const review = reviewEnds(set.value);
    expect(review.ok && review.value.overridden).toContain(item.item_instance_id);
    expect(review.ok && review.value.differ).not.toContain(item.item_instance_id);
    const filled = fillEnds(set.value, [item.item_instance_id]);
    expect(filled.ok && filled.value.items.find((i) => i.item_instance_id === item.item_instance_id)!.item_selections[option]).toBe('finished');
    const refreshed = refreshEnds(room, set.value);
    expect(refreshed.ok && refreshed.value.items.find((i) => i.item_instance_id === item.item_instance_id)!.item_selections[option]).toBe('finished');
  });

  it('cleared, it goes back to the layout', () => {
    const room = ended(laidOut(MAX));
    const { item, option } = closedEnd(room);
    const set = editItems(room, { kind: 'option', id: item.item_instance_id, option, value: 'finished' });
    if (!set.ok) throw new Error(set.reason);
    const cleared = editItems(set.value, { kind: 'option', id: item.item_instance_id, option, value: null });
    if (!cleared.ok) throw new Error(cleared.reason);
    const back = fillEnds(cleared.value, [item.item_instance_id]);
    if (!back.ok) throw new Error(back.reason);
    const it2 = back.value.items.find((i) => i.item_instance_id === item.item_instance_id)!;
    expect(it2.item_selections[option]).toBe('unfinished');
    expect(it2.set_by_hand).toBeUndefined();
  });
});
