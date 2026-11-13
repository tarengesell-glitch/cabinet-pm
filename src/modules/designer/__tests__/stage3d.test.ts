import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Raycaster, Vector3 } from 'three';
import { cabinetViews, placeholderItems, type CabinetView } from '../model/cabinets';
import { endOpen, withRuleEnds, type Context } from '../model/ends';
import { cornerCabinets } from '../model/layout';
import { draftPlaceholder } from '../model/placeholder-draft';
import { counters, finishedEnds, seenHits, trims, type FinishLook } from '../ui/Stage3D';
import { trimsOf } from '../model/choices';
import { itemByCode } from '../model/placeholder-draft';
import { realKitchenRoom } from './real-kitchen';

const IN = 64;
let n = 0;
// Not the fixture's own ID pattern, so a cabinet never shares an ID with an appliance.
const ids = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const LOOK: FinishLook = { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false, topTrim: null, trimHex: '#ffffff', valance: null, valanceHex: '#ffffff' };

/** The real kitchen as the 3D view sees it, after the placeholder lays it out. */
function scene(): Context {
  const room = realKitchenRoom();
  const d = draftPlaceholder(room, { drawers: 'maximum', cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet', cabinetTop: 'ceiling', roomSet: 'kitchen' }, ids);
  if (!d.ok) throw new Error(d.reason);
  const items = placeholderItems(room, d.value);
  if (!items.ok) throw new Error(items.reason);
  // As the design step saves it: with every cabinet's ends worked out (model/ends.ts).
  const placed = withRuleEnds({ ...room, items: items.value });
  if (!placed.ok) throw new Error(placed.reason);
  return { room: placed.value, all: cabinetViews(placed.value), corners: cornerCabinets(placed.value) };
}

describe('the 3D view (owner, 2026-11-10)', () => {
  it('draws one counter for each stretch of touching base cabinets: no break beside the dishwasher or on the island', () => {
    const ctx = scene();
    const tops = counters({ mats: new Map() }, ctx, LOOK);
    const on = (i: number) => tops.filter((g) => g.userData['wallId'] === ctx.room.walls[i]!.wall_id).map((g) => g.userData['span'] as [number, number]);
    // Wall B: one top from the corner cabinet's end to the end of the run, over the dishwasher opening.
    const dw = ctx.all.find((c) => c.code === 'dishwasher_opening')!;
    expect(on(1)).toHaveLength(1);
    expect(on(1)[0]![0]).toBeLessThan(dw.offset);
    expect(on(1)[0]![1]).toBeGreaterThan(dw.offset + dw.width);
    // The island: one top, end to end.
    expect(on(5)).toEqual([[0, 94 * IN]]);
    // Wall A: broken only by the range (and the fridge with its panels), never between cabinets.
    expect(on(0)).toHaveLength(2);
  });

  it('finishes an end with nothing beside it (beside the range, an island end), but not one against a cabinet, a wall or a corner leg', () => {
    const ctx = scene();
    const wallA = ctx.room.walls[0]!;
    const range = wallA.appliances.find((a) => a.kind === 'range')!;
    const base = (wallId: string) => ctx.all.filter((c) => c.wallId === wallId && c.layer === 'base' && c.code !== null && !c.back && c.code !== 'tall_filler').sort((a, b) => a.offset - b.offset);
    const besideRange = base(wallA.wall_id).find((c) => c.offset === range.offset + range.width.value)!;
    expect(endOpen(ctx, besideRange, wallA, besideRange.offset, 'low')).toBe(true);
    // Its other end meets the leg of the L-shaped corner cabinet on wall B.
    expect(endOpen(ctx, besideRange, wallA, besideRange.offset + besideRange.width, 'high')).toBe(false);
    const island = ctx.room.walls[5]!;
    const isl = base(island.wall_id);
    expect(endOpen(ctx, isl[0]!, island, isl[0]!.offset, 'low')).toBe(true);
    expect(endOpen(ctx, isl[0]!, island, isl[0]!.offset + isl[0]!.width, 'high')).toBe(false);
  });

  it('draws finished ends from the saved choice, not from the layout, and the counter follows it', () => {
    const ctx = scene();
    const island = ctx.room.walls[5]!;
    const first = ctx.all.filter((c) => c.wallId === island.wall_id && c.code !== null && !c.back).sort((a, b) => a.offset - b.offset)[0]!;
    expect(finishedEnds(first)).toEqual(['low']);
    const top = (all: readonly CabinetView[]) => counters({ mats: new Map() }, { ...ctx, all }, LOOK).find((g) => g.userData['wallId'] === island.wall_id)!;
    const width = (g: ReturnType<typeof top>) => new Box3().setFromObject(g).getSize(new Vector3()).x;
    // Saved as unfinished on purpose: no finished end drawn, and the counter stops flush.
    const plain = { ...first, ends: { low: 'unfinished', high: first.ends!.high } };
    expect(finishedEnds(plain)).toEqual([]);
    const all = ctx.all.map((c) => (c === first ? plain : c));
    expect(width(top(ctx.all)) - width(top(all))).toBeCloseTo(1, 5);
    // Saved as a finished end by request: drawn like the applied one.
    expect(finishedEnds({ ...first, ends: { low: 'finished', high: null } })).toEqual(['low']);
  });
});

describe('what the pointer is over (owner, 2026-11-13)', () => {
  it('passes through a wall cut away for the camera, so zoom and clicks reach the wall seen behind it', () => {
    const root = new Group();
    const near = new Group();
    near.add(new Mesh(new BoxGeometry(100, 100, 1)));
    near.position.set(0, 0, -10);
    near.userData['name'] = 'cut-away wall';
    const far = new Mesh(new BoxGeometry(100, 100, 1));
    far.position.set(0, 0, -200);
    far.userData['name'] = 'far wall';
    root.add(near, far);
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
    expect(seenHits(ray, root)[0]?.object.parent?.userData['name']).toBe('cut-away wall');
    near.visible = false;
    expect(seenHits(ray, root)[0]?.object.userData['name']).toBe('far wall');
    // Three.js's own ray test still hits the hidden wall: that is what made zoom stop at it.
    expect(ray.intersectObjects(root.children, true)[0]?.object.parent?.userData['name']).toBe('cut-away wall');
  });
});

describe('top trim and light valance (owner, 2026-11-13)', () => {
  it('draws only what is chosen and has a profile; anything else is reported, never drawn as another one', () => {
    expect(trimsOf({ topTrim: null, valance: null })).toEqual({ top: null, valance: null, problems: [] });
    expect(trimsOf({ topTrim: 'none', valance: 'hidden' })).toEqual({ top: null, valance: null, problems: [] });
    expect(trimsOf({ topTrim: 'none', valance: 'none' }).problems).toEqual([]);
    const crown = trimsOf({ topTrim: 'crown', valance: 'shaped' });
    expect(crown.top?.steps).toBe(3);
    expect(crown.valance?.rise).toBeGreaterThan(0);
    const odd = trimsOf({ topTrim: 'egg_and_dart', valance: 'scalloped' });
    expect(odd.top).toBeNull();
    expect(odd.valance).toBeNull();
    expect(odd.problems).toHaveLength(2);
  });

  it('puts a crown on every upper and tall cabinet, under the ceiling, and a valance under the uppers only', () => {
    const ctx = scene();
    const look = { ...LOOK, topTrim: 'crown', trimHex: '#123456', valance: 'flat', valanceHex: '#654321' };
    const groups = trims({ mats: new Map() }, ctx, look);
    const typeOf = (id: string) => itemByCode(ctx.all.find((c) => c.id === id)!.code!)?.type;
    const tops = ctx.all.filter((c) => c.code && !c.appliance && ['wall', 'corner_wall', 'tall'].includes(itemByCode(c.code)?.type ?? ''));
    expect(tops.length).toBeGreaterThan(0);
    expect(groups.map((g) => g.userData['trimOf']).sort()).toEqual(tops.map((c) => c.id).sort());
    // This kitchen's cabinets go to the ceiling: the crown stops at it.
    const ceiling = ctx.room.ceiling_height.value / IN;
    for (const g of groups) {
      g.updateMatrixWorld(true);
      expect(new Box3().setFromObject(g).max.y).toBeLessThanOrEqual(ceiling + 1e-6);
      const valances = g.children.filter((m) => (m as { geometry?: { type: string } }).geometry?.type === 'ExtrudeGeometry');
      const c = ctx.all.find((x) => x.id === g.userData['trimOf'])!;
      const overFridge = ctx.all.some((f) => f.appliance === 'fridge' && f.wallId === c.wallId && f.offset < c.offset + c.width && f.offset + f.width > c.offset);
      expect(valances).toHaveLength(typeOf(c.id) === 'tall' || overFridge ? 0 : 1);
    }
    // The cabinet over the fridge has no valance (there is no counter under it).
    expect(ctx.all.some((c) => c.appliance === 'fridge')).toBe(true);
    // None of either draws nothing.
    expect(trims({ mats: new Map() }, ctx, { ...look, topTrim: 'none', valance: 'none' })).toEqual([]);
  });
});
