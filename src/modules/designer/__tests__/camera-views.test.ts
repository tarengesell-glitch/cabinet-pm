import { describe, expect, it } from 'vitest';
import type { Room } from '@/core/index';
import { cabinetViews, placeholderItems } from '../model/cabinets';
import { withRuleEnds } from '../model/ends';
import { direction, insideNormal } from '../model/layout';
import { draftPlaceholder } from '../model/placeholder-draft';
import { cameraPose, FOV, parseView, roomFrame, roomWallLetters, viewName, wallByLetter, type CameraPose, type CameraView } from '../ui/camera-views';
import { realKitchenRoom } from './real-kitchen';

let n = 0;
const ids = () => `bbbbbbbb-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const ASPECT = 1280 / 800;

/** The real kitchen as the design step saves it. */
function kitchen(): Room {
  const room = realKitchenRoom();
  const d = draftPlaceholder(room, { drawers: 'maximum', cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet', cabinetTop: 'ceiling', roomSet: 'kitchen' }, ids);
  if (!d.ok) throw new Error(d.reason);
  const items = placeholderItems(room, d.value);
  if (!items.ok) throw new Error(items.reason);
  const r = withRuleEnds({ ...room, items: items.value });
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
const pose = (room: Room, view: CameraView): CameraPose => {
  const p = cameraPose(room, cabinetViews(room), view, ASPECT);
  if ('problem' in p) throw new Error(p.problem);
  return p;
};

describe('fixed camera views', () => {
  it('names the kitchen’s views, and reads the names back', () => {
    const room = kitchen();
    expect(roomWallLetters(room)).toEqual(['A', 'B', 'C', 'D', 'E']);
    for (const v of [{ kind: 'overall' }, { kind: 'island' }, { kind: 'wall', letter: 'B' }] as const) expect(parseView(viewName(v))).toEqual(v);
    expect(parseView('wall-b')).toBeNull();
    expect(cameraPose(room, cabinetViews(room), { kind: 'wall', letter: 'Q' }, ASPECT)).toEqual({ problem: 'The room has no wall Q.' });
  });

  it('frames the same room the same way every time, from new objects', () => {
    for (const v of ['overall', 'wall-A', 'wall-B', 'island'])
      expect(pose(kitchen(), parseView(v)!)).toEqual(pose(kitchen(), parseView(v)!));
  });

  it('keeps the starting view the 3D view always had (the reset button’s)', () => {
    const room = kitchen();
    const f = roomFrame(room, cabinetViews(room));
    // The starting view's own sums, as fit() worked them out before.
    const dist = (f.span / (2 * Math.tan((FOV * Math.PI) / 360)) / Math.min(1, ASPECT)) * 1.25 + 40;
    const a = 0.45;
    const dir = [f.facing[0] * Math.cos(a) + f.facing[2] * Math.sin(a), -f.facing[0] * Math.sin(a) + f.facing[2] * Math.cos(a)];
    const p = pose(room, { kind: 'overall' });
    expect(p.target).toEqual(f.centre);
    expect(p.position[0]).toBeCloseTo(f.centre[0] + dir[0]! * Math.cos(0.6) * dist, 9);
    expect(p.position[1]).toBeCloseTo(f.centre[1] + Math.sin(0.6) * dist, 9);
    expect(p.position[2]).toBeCloseTo(f.centre[2] + dir[1]! * Math.cos(0.6) * dist, 9);
    expect(p.near).toBe(1);
  });

  it('looks at each wall straight on from inside the room, with all its cabinets in the frame and the island clipped away', () => {
    const room = kitchen();
    const views = cabinetViews(room);
    const island = room.walls.find((w) => w.kind === 'floating')!;
    const islandMid: [number, number] = [(island.start_point.x + island.end_point.x) / 128, -(island.start_point.y + island.end_point.y) / 128];
    for (const letter of ['A', 'B', 'C']) {
      const wall = wallByLetter(room, letter)!;
      const p = pose(room, { kind: 'wall', letter });
      const nIn = insideNormal(room, wall);
      const look: [number, number] = [p.target[0] - p.position[0], p.target[2] - p.position[2]];
      const ln = Math.hypot(...look);
      // Facing the wall: the camera looks against the wall's inside normal (plan y is −z).
      expect(look[0] / ln).toBeCloseTo(-nIn.x, 9);
      expect(look[1] / ln).toBeCloseTo(nIn.y, 9);
      // Both ends of every cabinet on the wall are inside the frame's width (projected at their depth).
      const u = direction(wall);
      const t = Math.tan((FOV * Math.PI) / 360) * ASPECT;
      const fwd: [number, number] = [look[0] / ln, look[1] / ln];
      const right: [number, number] = [-fwd[1], fwd[0]];
      for (const c of views.filter((v) => v.wallId === wall.wall_id))
        for (const along of [c.offset, c.offset + c.width]) {
          const x = (wall.start_point.x + u.x * along) / 64 - p.position[0];
          const z = -(wall.start_point.y + u.y * along) / 64 - p.position[2];
          const depth = x * fwd[0] + z * fwd[1];
          const side = x * right[0] + z * right[1];
          expect(depth).toBeGreaterThan(p.near);
          expect(Math.abs(side)).toBeLessThan(depth * t);
        }
      // Anything nearer than the wall's cabinets (the island) is clipped.
      const toIsland = Math.hypot(islandMid[0] - p.position[0], islandMid[1] - p.position[2]);
      if (letter !== 'C') expect(toIsland).toBeLessThan(p.near);
    }
  });

  it('looks at the island from behind one end, above its counter', () => {
    const room = kitchen();
    const p = pose(room, { kind: 'island' });
    const island = room.walls.find((w) => w.kind === 'floating')!;
    const n = insideNormal(room, island);
    // Behind: on the back panel's side of the island's line (its cabinets face the other way).
    const side = (p.position[0] - p.target[0]) * n.x + (p.position[2] - p.target[2]) * -n.y;
    expect(side).toBeLessThan(0);
    expect(p.position[1]).toBeGreaterThan(36);
  });
});
