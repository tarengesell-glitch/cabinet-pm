/**
 * Layout checks on placed items (BUILD_SPEC section 7, layer "layout", owner Core): items
 * overlap, an item extends past its wall, an item blocks an opening (the spec's first layout
 * checks), plus the item stands on a real wall on the room's side and under the ceiling.
 * Pure geometry, no business values. All block.
 *
 * Positions along a wall and heights are compared exactly. Whether two items on different walls
 * overlap (at a corner) needs the room's true coordinates, which on a slanted wall fall between
 * 1/64" marks; that one test uses decimal maths and lets items touch (a thousandth of a 1/64"
 * either way is treated as touching).
 */
import type { Check, Issue } from '../checks';
import { compareToDistance, describeDistance, roomInsideSide } from '../geometry';
import { wallLetter } from '../labels';
import type { Job, PlacedItem, Room, Wall } from '../schema/master-copy';
import { formatInches } from '../units';

const itemName = (room: Room, i: number) => `Item ${i + 1} in "${room.name}"`;
const wallOf = (room: Room, item: PlacedItem): { wall: Wall; index: number } | null => {
  const index = room.walls.findIndex((w) => w.wall_id === item.position.wall_id);
  const wall = room.walls[index];
  return wall ? { wall, index } : null;
};
const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

function eachItem(job: Job, visit: (room: Room, item: PlacedItem, i: number) => void): void {
  for (const room of job.rooms) room.items.forEach((item, i) => visit(room, item, i));
}

export const itemsOnWall: Check = {
  id: 'layout.items-on-wall',
  layer: 'layout',
  description: 'Every placed item stands on a wall of its room, on the room’s side of a room wall',
  run(job) {
    const issues: Issue[] = [];
    eachItem(job, (room, item, i) => {
      const found = wallOf(room, item);
      const ref = { kind: 'item' as const, id: item.item_instance_id };
      if (!found) {
        issues.push({ check_id: this.id, severity: 'block', message: `${itemName(room, i)} stands on a wall that isn’t in the room.`, ref });
        return;
      }
      if (found.wall.kind === 'room' && item.position.side !== roomInsideSide(room.walls)) {
        issues.push({ check_id: this.id, severity: 'block', message: `${itemName(room, i)} is on the outside of wall ${wallLetter(found.index)}. Cabinets go on the room’s side of a room wall.`, ref });
      }
    });
    return issues;
  },
};

export const itemsFitAlongWall: Check = {
  id: 'layout.items-fit-along-wall',
  layer: 'layout',
  description: 'Every placed item stays within the length of its wall',
  run(job) {
    const issues: Issue[] = [];
    eachItem(job, (room, item, i) => {
      const found = wallOf(room, item);
      if (!found) return;
      const far = item.position.offset + item.width;
      if (compareToDistance(far, found.wall.start_point, found.wall.end_point) > 0) {
        issues.push({
          check_id: this.id,
          severity: 'block',
          message: `${itemName(room, i)} runs past the end of wall ${wallLetter(found.index)}: its far side is ${formatInches(far)} from the start, but the wall is ${describeDistance(found.wall.start_point, found.wall.end_point)} long.`,
          ref: { kind: 'item', id: item.item_instance_id },
        });
      }
    });
    return issues;
  },
};

export const itemsUnderCeiling: Check = {
  id: 'layout.items-under-ceiling',
  layer: 'layout',
  description: 'Every placed item fits under the room’s ceiling',
  run(job) {
    const issues: Issue[] = [];
    eachItem(job, (room, item, i) => {
      const top = item.position.elevation + item.height;
      if (top > room.ceiling_height.value) {
        issues.push({
          check_id: this.id,
          severity: 'block',
          message: `${itemName(room, i)} reaches ${formatInches(top)} from the floor, above the ${formatInches(room.ceiling_height.value)} ceiling.`,
          ref: { kind: 'item', id: item.item_instance_id },
        });
      }
    });
    return issues;
  },
};

export const itemsClearOpenings: Check = {
  id: 'layout.items-clear-openings',
  layer: 'layout',
  description: 'No placed item covers a door, window or passthrough on its wall',
  run(job) {
    const issues: Issue[] = [];
    eachItem(job, (room, item, i) => {
      const found = wallOf(room, item);
      if (!found || found.wall.kind !== 'room') return;
      for (const o of found.wall.openings) {
        const along = overlap(item.position.offset, item.position.offset + item.width, o.offset.value, o.offset.value + o.width.value);
        const up = overlap(item.position.elevation, item.position.elevation + item.height, o.sill_height.value, o.sill_height.value + o.height.value);
        if (along > 0 && up > 0) {
          issues.push({
            check_id: this.id,
            severity: 'block',
            message: `${itemName(room, i)} covers the ${o.kind} on wall ${wallLetter(found.index)} (${formatInches(along)} along the wall, ${formatInches(up)} up).`,
            ref: { kind: 'item', id: item.item_instance_id },
          });
        }
      }
    });
    return issues;
  },
};

/** An item's footprint on the floor: four corners in room coordinates (decimal), and its height span. */
export function itemFootprint(room: Room, item: PlacedItem): { corners: [number, number][]; bottom: number; top: number } | null {
  const wall = room.walls.find((w) => w.wall_id === item.position.wall_id);
  if (!wall) return null;
  const dx = wall.end_point.x - wall.start_point.x;
  const dy = wall.end_point.y - wall.start_point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const u = [dx / len, dy / len];
  const n = item.position.side === 'left' ? [-u[1]!, u[0]!] : [u[1]!, -u[0]!];
  const face = wall.kind === 'room' ? (wall.thickness?.value ?? 0) / 2 : 0;
  const at = (along: number, out: number): [number, number] => [wall.start_point.x + u[0]! * along + n[0]! * out, wall.start_point.y + u[1]! * along + n[1]! * out];
  const a0 = item.position.offset;
  const a1 = a0 + item.width;
  const o0 = face + item.position.setback;
  const o1 = o0 + item.depth;
  return { corners: [at(a0, o0), at(a1, o0), at(a1, o1), at(a0, o1)], bottom: item.position.elevation, top: item.position.elevation + item.height };
}

const TOUCH = 1e-3;
/** True when two convex quadrilaterals overlap by more than touching (separating axis test). */
function quadsOverlap(a: [number, number][], b: [number, number][]): boolean {
  for (const poly of [a, b]) {
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k]!;
      const q = poly[(k + 1) % poly.length]!;
      const axis = [q[1] - p[1], p[0] - q[0]];
      const project = (pts: [number, number][]) => pts.map((v) => v[0] * axis[0]! + v[1] * axis[1]!);
      const pa = project(a);
      const pb = project(b);
      const scale = Math.hypot(axis[0]!, axis[1]!) || 1;
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= TOUCH * scale) return false;
    }
  }
  return true;
}

export const itemsOverlap: Check = {
  id: 'layout.items-overlap',
  layer: 'layout',
  description: 'Placed items do not overlap each other (touching is fine)',
  run(job) {
    const issues: Issue[] = [];
    for (const room of job.rooms) {
      const shapes = room.items.map((item) => itemFootprint(room, item));
      room.items.forEach((a, i) => {
        room.items.forEach((b, j) => {
          if (j <= i) return;
          const sa = shapes[i];
          const sb = shapes[j];
          if (!sa || !sb) return;
          if (overlap(sa.bottom, sa.top, sb.bottom, sb.top) <= 0) return;
          if (!quadsOverlap(sa.corners, sb.corners)) return;
          issues.push({
            check_id: this.id,
            severity: 'block',
            message: `${itemName(room, i)} and item ${j + 1} overlap.`,
            ref: { kind: 'item', id: b.item_instance_id },
          });
        });
      });
    }
    return issues;
  },
};

/** The placed-item layout checks, in a stable order. */
export const ITEM_CHECKS: readonly Check[] = [itemsOnWall, itemsFitAlongWall, itemsUnderCeiling, itemsClearOpenings, itemsOverlap];
