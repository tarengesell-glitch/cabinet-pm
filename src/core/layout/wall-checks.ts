/**
 * Layout checks on the room shell (BUILD_SPEC section 7, layer "layout", owner Core).
 * Pure geometry: no thresholds or business values. All block.
 */
import type { Check, Issue } from '../checks';
import { compareToDistance, describeDistance, distanceForDisplay, samePoint, segmentsCross } from '../geometry';
import type { Job, Obstacle, Opening, Room, Wall } from '../schema/master-copy';
import { formatInches } from '../units';

const KIND_LABEL: Record<Opening['kind'], string> = {
  window: 'Window',
  door: 'Door',
  passthrough: 'Passthrough',
};

const wallName = (room: Room, w: number) => `wall ${w + 1} in "${room.name}"`;
const openingName = (o: Opening, i: number, room: Room, w: number) =>
  `${KIND_LABEL[o.kind]} ${i + 1} on ${wallName(room, w)}`;
const obstacleName = (o: Obstacle, i: number, room: Room, w: number) =>
  `Obstacle "${o.kind}" (${i + 1}) on ${wallName(room, w)}`;

/** Calls `visit` for every wall, with its room and index, in drawing order. */
function eachWall(job: Job, visit: (room: Room, wall: Wall, w: number) => void): void {
  for (const room of job.rooms) room.walls.forEach((wall, w) => visit(room, wall, w));
}

export const wallZeroLength: Check = {
  id: 'layout.wall-zero-length',
  layer: 'layout',
  description: 'Every wall has a length',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      if (samePoint(wall.start_point, wall.end_point)) {
        issues.push({
          check_id: this.id,
          severity: 'block',
          message: `${capital(wallName(room, w))} starts and ends at the same point, so it has no length.`,
          ref: { kind: 'wall', id: wall.wall_id },
        });
      }
    });
    return issues;
  },
};

export const fitsAlongWall: Check = {
  id: 'layout.fits-along-wall',
  layer: 'layout',
  description: 'Openings and obstacles stay within their wall',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      const parts = [
        ...wall.openings.map((o, i) => ({ name: openingName(o, i, room, w), offset: o.offset, width: o.width, ref: { kind: 'opening' as const, id: o.opening_id } })),
        ...wall.obstacles.map((o, i) => ({ name: obstacleName(o, i, room, w), offset: o.offset, width: o.width, ref: { kind: 'obstacle' as const, id: o.obstacle_id } })),
      ];
      for (const part of parts) {
        const farEdge = part.offset.value + part.width.value;
        if (compareToDistance(farEdge, wall.start_point, wall.end_point) > 0) {
          const wallLength = distanceForDisplay(wall.start_point, wall.end_point);
          const over = farEdge - wallLength.value;
          issues.push({
            check_id: this.id,
            severity: 'block',
            message:
              `${part.name} runs past the end of the wall: its far edge is ${formatInches(farEdge)} from the start, ` +
              `but the wall is ${describeDistance(wall.start_point, wall.end_point)} long` +
              (over > 0 ? ` (${wallLength.exact ? '' : 'about '}${formatInches(over)} too far).` : '.'),
            ref: part.ref,
          });
        }
      }
    });
    return issues;
  },
};

export const fitsWallHeight: Check = {
  id: 'layout.fits-wall-height',
  layer: 'layout',
  description: 'Openings and obstacles are no taller than their wall',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      const parts = [
        ...wall.openings.map((o, i) => ({ name: openingName(o, i, room, w), bottom: o.sill_height.value, height: o.height.value, ref: { kind: 'opening' as const, id: o.opening_id } })),
        ...wall.obstacles.map((o, i) => ({ name: obstacleName(o, i, room, w), bottom: o.elevation.value, height: o.height.value, ref: { kind: 'obstacle' as const, id: o.obstacle_id } })),
      ];
      for (const part of parts) {
        const top = part.bottom + part.height;
        if (top > wall.height.value) {
          issues.push({
            check_id: this.id,
            severity: 'block',
            message:
              `${part.name} reaches ${formatInches(top)} from the floor, but the wall is only ` +
              `${formatInches(wall.height.value)} high (${formatInches(top - wall.height.value)} too tall).`,
            ref: part.ref,
          });
        }
      }
    });
    return issues;
  },
};

export const openingsOverlap: Check = {
  id: 'layout.openings-overlap',
  layer: 'layout',
  description: 'Openings on the same wall do not overlap',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      wall.openings.forEach((a, i) => {
        wall.openings.forEach((b, j) => {
          if (j <= i) return;
          const aEnd = a.offset.value + a.width.value;
          const bEnd = b.offset.value + b.width.value;
          const overlap = Math.min(aEnd, bEnd) - Math.max(a.offset.value, b.offset.value);
          if (overlap > 0) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `${openingName(a, i, room, w)} and ${openingName(b, j, room, w).replace(/ on wall.*$/, '')} overlap by ${formatInches(overlap)}.`,
              ref: { kind: 'opening', id: b.opening_id },
            });
          }
        });
      });
    });
    return issues;
  },
};

export const wallsCross: Check = {
  id: 'layout.walls-cross',
  layer: 'layout',
  description: 'Walls in a room do not cross each other',
  run(job) {
    const issues: Issue[] = [];
    for (const room of job.rooms) {
      room.walls.forEach((a, i) => {
        room.walls.forEach((b, j) => {
          if (j <= i) return;
          if (segmentsCross(a.start_point, a.end_point, b.start_point, b.end_point)) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `Wall ${i + 1} and wall ${j + 1} in "${room.name}" cross each other.`,
              ref: { kind: 'wall', id: b.wall_id },
            });
          }
        });
      });
    }
    return issues;
  },
};

/** Every wall layout check, in the order they run. */
export const WALL_CHECKS: readonly Check[] = [wallZeroLength, fitsAlongWall, fitsWallHeight, openingsOverlap, wallsCross];

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
