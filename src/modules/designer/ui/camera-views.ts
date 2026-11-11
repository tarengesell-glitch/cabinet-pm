/**
 * Where the 3D view's camera stands for each fixed view: the whole room (the starting view, also
 * the reset button's), each room wall seen straight on, and the island. Pure numbers worked out
 * from the room and its cabinets, so the same room always gets the same framing (used by the
 * screenshot command, `npm run views`). 3D units are inches; the plan's y becomes −z.
 *
 * These are framing choices for looking at the drawing, not business values.
 */
import { wallLetter, type Room, type Wall } from '@/core/index';
import type { CabinetView } from '../model/cabinets';
import { direction, halfThickness, insideNormal } from '../model/layout';

const IN = 64;
const inch = (v: number): number => v / IN;
type V3 = readonly [number, number, number];

/** A fixed view: the whole room, one room wall by its letter (A, B, C…), or the island. */
export type CameraView = { readonly kind: 'overall' } | { readonly kind: 'wall'; readonly letter: string } | { readonly kind: 'island' };

export interface CameraPose {
  readonly position: V3;
  readonly target: V3;
  /** The near clipping distance: a wall view clips everything in front of that wall's cabinets (an island in the way). */
  readonly near: number;
  /** How far the camera may then be zoomed in and out. */
  readonly minDistance: number;
  readonly maxDistance: number;
}

/** The camera's vertical field of view, in degrees (the 3D view's camera). */
export const FOV = 32;
const FAR_NEAR = 1;

/** The room's centre, size and main wall's facing, as the starting view frames it. */
export function roomFrame(room: Room, cabinets: readonly CabinetView[]): { centre: V3; span: number; facing: V3 } {
  const pts = room.walls.filter((w) => w.kind === 'room').flatMap((w) => [w.start_point, w.end_point]);
  const xs = pts.map((p) => inch(p.x));
  const zs = pts.map((p) => -inch(p.y));
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
  const span = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 60) : 200;
  const widths = new Map<string, number>();
  for (const c of cabinets) widths.set(c.wallId, (widths.get(c.wallId) ?? 0) + c.width);
  const main = room.walls.filter((w) => w.kind === 'room').sort((a, b) => (widths.get(b.wall_id) ?? 0) - (widths.get(a.wall_id) ?? 0))[0];
  const m = main ? insideNormal(room, main) : null;
  return { centre: [cx, 34, cz], span, facing: m ? [m.x, 0, -m.y] : [0, 0, 1] };
}

/** The room walls by letter, as the room drawing names them. */
export function wallByLetter(room: Room, letter: string): Wall | null {
  return room.walls.find((w, i) => w.kind === 'room' && wallLetter(i) === letter) ?? null;
}

/** The letters of the room's walls, in drawing order. */
export function roomWallLetters(room: Room): string[] {
  return room.walls.flatMap((w, i) => (w.kind === 'room' ? [wallLetter(i)] : []));
}

const rotateY = (v: V3, a: number): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** How far back the camera stands so `w` × `h` inches fill the frame (aspect = width / height). */
function fitDistance(w: number, h: number, aspect: number): number {
  const t = Math.tan((FOV * Math.PI) / 360);
  return Math.max(h / 2 / t, w / 2 / (t * aspect));
}

/** The camera pose for a view, or the reason it can't be framed (no such wall, no island). */
export function cameraPose(room: Room, cabinets: readonly CabinetView[], view: CameraView, aspect: number): CameraPose | { readonly problem: string } {
  const frame = roomFrame(room, cabinets);
  if (view.kind === 'overall') {
    // From across the room, a little to one side and above, looking at the main wall.
    const a = Math.max(0.5, aspect);
    const dist = (frame.span / (2 * Math.tan((FOV * Math.PI) / 360)) / Math.min(1, a)) * 1.25 + 40;
    const el = 0.6;
    const dir = rotateY(frame.facing, 0.45);
    const flat = Math.cos(el) * dist;
    return { position: [frame.centre[0] + dir[0] * flat, frame.centre[1] + Math.sin(el) * dist, frame.centre[2] + dir[2] * flat], target: frame.centre, near: FAR_NEAR, minDistance: dist * 0.25, maxDistance: dist * 2.2 };
  }
  if (view.kind === 'wall') {
    const wall = wallByLetter(room, view.letter);
    if (!wall) return { problem: `The room has no wall ${view.letter}.` };
    const u = direction(wall);
    const n = insideNormal(room, wall);
    const on = cabinets.filter((c) => c.wallId === wall.wall_id);
    const total = Math.hypot(wall.end_point.x - wall.start_point.x, wall.end_point.y - wall.start_point.y);
    const lo = on.length ? Math.min(...on.map((c) => c.offset)) : 0;
    const hi = on.length ? Math.max(...on.map((c) => c.offset + c.width)) : total;
    const mid = (lo + hi) / 2;
    const face = halfThickness(wall);
    // The middle of what stands on the wall, on its face, half way up the room.
    const ceiling = inch(room.ceiling_height.value);
    const at: V3 = [inch(wall.start_point.x + u.x * mid + n.x * face), ceiling / 2, -inch(wall.start_point.y + u.y * mid + n.y * face)];
    const width = inch(hi - lo) + 24;
    const dist = fitDistance(width, ceiling + 36, aspect);
    // Straight on, from a little higher, so the toe kicks, the counter's top and the hood's clear space all show.
    const out: V3 = [n.x, 0, -n.y];
    const position: V3 = [at[0] + out[0] * dist, at[1] + 16, at[2] + out[2] * dist];
    return { position, target: at, near: Math.max(FAR_NEAR, len(position, at) - 40), minDistance: dist * 0.25, maxDistance: dist * 2.2 };
  }
  const island = room.walls.find((w) => w.kind === 'floating' && cabinets.some((c) => c.wallId === w.wall_id));
  if (!island) return { problem: 'The room has no island with cabinets.' };
  const u = direction(island);
  const n = insideNormal(room, island);
  const mid = Math.hypot(island.end_point.x - island.start_point.x, island.end_point.y - island.start_point.y) / 2;
  const at: V3 = [inch(island.start_point.x + u.x * mid), 30, -inch(island.start_point.y + u.y * mid)];
  const width = inch(mid * 2) + 36;
  const dist = fitDistance(width, 60, aspect) * 1.4;
  // From the back corner at the island's end, above: its back panel, one end and its counter.
  const back: V3 = [-n.x, 0, n.y];
  const along: V3 = [u.x, 0, -u.y];
  const yaw = (35 * Math.PI) / 180;
  const el = (28 * Math.PI) / 180;
  const flat = add([back[0] * Math.cos(yaw), 0, back[2] * Math.cos(yaw)], along, Math.sin(yaw));
  const position: V3 = [at[0] + flat[0] * Math.cos(el) * dist, at[1] + Math.sin(el) * dist, at[2] + flat[2] * Math.cos(el) * dist];
  return { position, target: at, near: FAR_NEAR, minDistance: dist * 0.25, maxDistance: dist * 2.2 };
}

/** A view as a short name: "overall", "wall-A", "island" (the screenshot files and the page's ?view=). */
export const viewName = (v: CameraView): string => (v.kind === 'wall' ? `wall-${v.letter}` : v.kind);

/** Reads a view name back, or null when it isn't one. */
export function parseView(name: string): CameraView | null {
  if (name === 'overall' || name === 'island') return { kind: name };
  const m = /^wall-([A-Z]{1,2})$/.exec(name);
  return m ? { kind: 'wall', letter: m[1]! } : null;
}
