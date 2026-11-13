import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { cabinetViews, placeholderItems, type CabinetView } from '../model/cabinets';
import { endOpen, withRuleEnds, type Context } from '../model/ends';
import { cornerCabinets } from '../model/layout';
import { draftPlaceholder } from '../model/placeholder-draft';
import { cabinet, cornerFrame, counters, drawLook, finishedEnds, seenHits, trims, type FinishLook } from '../ui/Stage3D';
import { trimsOf } from '../model/choices';
import { itemByCode, standard } from '../model/placeholder-draft';
import { realKitchenRoom } from './real-kitchen';

const IN = 64;
let n = 0;
// Not the fixture's own ID pattern, so a cabinet never shares an ID with an appliance.
const ids = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const LOOK: FinishLook = { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false, topTrim: null, trimHex: '#ffffff', valance: null, valanceHex: '#ffffff', interiorHex: null, trayOrganizers: 0 };

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

/** How far a trim group's first moulding reaches out from the wall, in its cabinet's own frame (inches). */
const depthOfMoulding = (g: Group): number => {
  const geo = (g.children.find((m) => (m as Mesh).isMesh) as Mesh).geometry;
  geo.computeBoundingBox();
  return geo.boundingBox!.getSize(new Vector3()).z;
};

describe('top trim and light valance (owner, 2026-11-13)', () => {
  it('draws only what is chosen and has a profile; anything else is reported, never drawn as another one', () => {
    expect(trimsOf({ topTrim: null, valance: null })).toEqual({ top: null, valance: null, problems: [] });
    expect(trimsOf({ topTrim: 'none', valance: 'hidden' })).toEqual({ top: null, valance: null, problems: [] });
    expect(trimsOf({ topTrim: 'none', valance: 'none' }).problems).toEqual([]);
    const crown = trimsOf({ topTrim: 'crown', valance: 'shaped' });
    expect(crown.top?.steps).toBe(3);
    expect(crown.valance?.profile).toBe('light_rail');
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
    // Fridge panels and fillers reaching the top line get the trim too (owner, 2026-11-13).
    const panels = ctx.all.filter((c) => c.code && ['filler', 'panel'].includes(itemByCode(c.code)?.type ?? '') && !c.back && (c.layer === 'upper' || c.elevation + c.height > 36 * IN));
    const fridgePanels = ctx.all.filter((c) => c.code === 'tall_filler');
    expect(fridgePanels.length).toBe(2);
    expect(panels).toEqual(expect.arrayContaining(fridgePanels));
    expect(groups.map((g) => g.userData['trimOf']).sort()).toEqual([...tops, ...panels].map((c) => c.id).sort());
    // A fridge panel open on one side returns its trim along that side to the wall.
    const returned = fridgePanels.filter((c) => {
      return depthOfMoulding(groups.find((x) => x.userData['trimOf'] === c.id)!) > (c.depth ?? 0) / IN;
    });
    expect(returned.length).toBeGreaterThan(0);
    // This kitchen's cabinets go to the ceiling: the crown stops at it.
    const ceiling = ctx.room.ceiling_height.value / IN;
    for (const g of groups) {
      g.updateMatrixWorld(true);
      expect(new Box3().setFromObject(g).max.y).toBeLessThanOrEqual(ceiling + 1e-6);
      // One moulding for the crown, and one for the valance under an upper.
      const valances = g.children.filter((m) => (m as { isMesh?: boolean }).isMesh).length - 1;
      const c = ctx.all.find((x) => x.id === g.userData['trimOf'])!;
      const overFridge = ctx.all.some((f) => f.appliance === 'fridge' && f.wallId === c.wallId && f.offset < c.offset + c.width && f.offset + f.width > c.offset);
      expect(valances).toBe(c.layer !== 'upper' || typeOf(c.id) === 'tall' || overFridge ? 0 : 1);
    }
    // The cabinet over the fridge has no valance (there is no counter under it).
    expect(ctx.all.some((c) => c.appliance === 'fridge')).toBe(true);
    // A finished end gets a return: the moulding wraps back along the side to the wall.
    const ended = tops.find((c) => typeOf(c.id) === 'wall' && finishedEnds(c).length > 0)!;
    expect(ended).toBeDefined();
    const g = groups.find((x) => x.userData['trimOf'] === ended.id)!;
    const depth = (ended.depth ?? standard(ended.code!, 'depth')!) / IN;
    expect(depthOfMoulding(g)).toBeGreaterThan(depth);
    // None of either draws nothing.
    expect(trims({ mats: new Map() }, ctx, { ...look, topTrim: 'none', valance: 'none' })).toEqual([]);
  });
});

describe('opening cabinets (owner, 2026-11-13)', () => {
  const panels = { back: { kind: 'none' as const }, side: { kind: 'none' as const }, problems: [] };
  const build = (code: string, look: Partial<FinishLook> = {}, insides = { cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet' as const }) => {
    const ctx = scene();
    const c = ctx.all.find((x) => x.code === code)!;
    const s = { mats: new Map(), doors: [] as Object3D[] };
    const g = cabinet(s, c, ctx, drawLook({ ...LOOK, ...look }, panels), false, insides)!;
    return { ctx, c, s, g };
  };

  it('every drawer slides and every door swings, each tagged with its cabinet so one cabinet or all can open', () => {
    const { c, s } = build('base_4_drawers');
    expect(s.doors).toHaveLength(4);
    expect(s.doors.every((d) => d.userData['kind'] === 'drawer' && d.userData['cabId'] === c.id)).toBe(true);
    // A bank opens in steps: each drawer further out than the one above.
    const slides = s.doors.map((d) => d.userData['slide'] as number);
    expect([...slides].sort((a, b) => a - b)).toEqual(slides);
    expect(new Set(slides).size).toBe(4);
    // An L-shaped corner cabinet's second door opens too.
    expect(build('corner_base').s.doors.filter((d) => d.userData['kind'] === 'door')).toHaveLength(2);
  });

  it('draws the box in the chosen interior and the door backs in the door finish', () => {
    const { s } = build('upper_doors', { interiorHex: '#d9b98a', door: '#123456' });
    expect([...s.mats.keys()]).toContain('inside:#d9b98a');
    // Each door has a back panel in its finish.
    const backs = s.doors.flatMap((d) => d.children).filter((m) => (m as Mesh).isMesh && ((m as Mesh).geometry as BoxGeometry).parameters?.depth === 0.04);
    expect(backs.length).toBe(s.doors.length);
    expect(backs.every((m) => (m as Mesh).material === s.mats.get('paint:#123456'))).toBe(true);
  });

  it('keeps a Lazy Susan inside the L-shaped corner cabinet, its open quarter toward the doors', () => {
    const { ctx, c, g } = build('corner_base');
    const wall = ctx.room.walls.find((w) => w.wall_id === c.wallId)!;
    const w = c.width / IN;
    const d = (c.depth ?? 0) / IN;
    const { inward, cx0, legD } = cornerFrame(ctx.room, wall, c, w, d);
    // The insides are drawn in their own group (shown only while the cabinet is open), at the cabinet's origin.
    const inside = g.children.find((o) => o.userData['insideOf'] === c.id)!;
    const discs = inside.children.filter((m) => (m as Mesh).isMesh && (m as Mesh).geometry instanceof CylinderGeometry && ((m as Mesh).geometry as CylinderGeometry).parameters.radiusTop > 2);
    expect(discs.length).toBeGreaterThanOrEqual(2);
    for (const m of discs) {
      m.updateMatrix();
      const pos = (m as Mesh).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
        const along = (v.x - cx0) * inward; // from the corner along this wall
        const out = v.z + d / 2; // from this wall
        expect(along).toBeGreaterThan(-0.01);
        expect(out).toBeGreaterThan(-0.01);
        // Inside the L: within one leg's depth of one of the two walls.
        expect(Math.min(along, out)).toBeLessThan(legD + 0.01);
      }
    }
  });

  it('puts tray organizers in the cabinet over the fridge only', () => {
    const ctx = scene();
    const fridge = ctx.all.find((x) => x.appliance === 'fridge')!;
    const over = ctx.all.find((x) => x.layer === 'upper' && x.wallId === fridge.wallId && x.offset < fridge.offset + fridge.width && x.offset + x.width > fridge.offset)!;
    const count = (c: typeof over, n: number) => {
      const s = { mats: new Map(), doors: [] as Object3D[] };
      const g = cabinet(s, c, ctx, drawLook({ ...LOOK, trayOrganizers: n }, panels), false)!;
      let found = 0;
      g.traverse((m) => {
        if ((m as Mesh).isMesh && ((m as Mesh).geometry as BoxGeometry).parameters?.width === 0.5 && ((m as Mesh).geometry as BoxGeometry).parameters?.height > 10) found++;
      });
      return found;
    };
    expect(count(over, 1) - count(over, 0)).toBe(3);
    const other = ctx.all.find((x) => x.code === 'upper_doors' && x !== over)!;
    expect(count(other, 1) - count(other, 0)).toBe(0);
  });
});
