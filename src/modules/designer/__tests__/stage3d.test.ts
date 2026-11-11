import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { cabinetViews, placeholderItems, type CabinetView } from '../model/cabinets';
import { endOpen, withRuleEnds, type Context } from '../model/ends';
import { cornerCabinets } from '../model/layout';
import { draftPlaceholder } from '../model/placeholder-draft';
import { counters, finishedEnds, type FinishLook } from '../ui/Stage3D';
import { realKitchenRoom } from './real-kitchen';

const IN = 64;
let n = 0;
// Not the fixture's own ID pattern, so a cabinet never shares an ID with an appliance.
const ids = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const LOOK: FinishLook = { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false, islandBack: 'door_panels', islandSide: 'detailed_short' };

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
