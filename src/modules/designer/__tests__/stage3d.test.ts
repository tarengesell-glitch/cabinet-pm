import { describe, expect, it } from 'vitest';
import type { Room } from '@/core/index';
import { cabinetViews, placeholderItems } from '../model/cabinets';
import { cornerCabinets } from '../model/layout';
import { draftPlaceholder } from '../model/placeholder-draft';
import { counters, endOpen, type Context, type FinishLook } from '../ui/Stage3D';
import { realKitchenRoom } from './real-kitchen';

const IN = 64;
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const LOOK: FinishLook = { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false, islandBack: 'door_panels', islandSide: 'detailed_short' };

/** The real kitchen as the 3D view sees it, after the placeholder lays it out. */
function scene(): Context {
  const room = realKitchenRoom();
  const d = draftPlaceholder(room, { drawers: 'maximum', cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet', cabinetTop: 'ceiling', roomSet: 'kitchen' }, ids);
  if (!d.ok) throw new Error(d.reason);
  const items = placeholderItems(room, d.value);
  if (!items.ok) throw new Error(items.reason);
  const placed: Room = { ...room, items: items.value };
  return { room: placed, all: cabinetViews(placed), corners: cornerCabinets(placed) };
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
});
