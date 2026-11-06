/**
 * Layout checks on the rough layout: cabinet runs and appliance placements (BUILD_SPEC
 * section 7, layer "layout", owner Core). Pure geometry: no thresholds or business values
 * (clearances such as 3" from a door are the designer's snapping rules, kept as data there).
 * All block.
 */
import type { Check, Issue } from '../checks';
import { compareToDistance, describeDistance, distanceForDisplay } from '../geometry';
import { wallLetter } from '../labels';
import type { AppliancePlacement, Job, Room, Run, Wall } from '../schema/master-copy';
import { formatInches } from '../units';

const RUN_LABEL: Record<Run['kind'], string> = {
  base: 'base',
  upper: 'upper',
  base_upper: 'base + upper',
  base_upper_pantry: 'base, upper + pantry',
  pantry: 'pantry',
};

const wallName = (room: Room, w: number) => `wall ${wallLetter(w)} in "${room.name}"`;
const runName = (r: Run, i: number, room: Room, w: number) => `Cabinet run ${i + 1} (${RUN_LABEL[r.kind]}) on ${wallName(room, w)}`;
const applianceName = (a: AppliancePlacement, i: number, room: Room, w: number) =>
  `Appliance ${i + 1} (${a.kind}) on ${wallName(room, w)}`;

function eachWall(job: Job, visit: (room: Room, wall: Wall, w: number) => void): void {
  for (const room of job.rooms) room.walls.forEach((wall, w) => visit(room, wall, w));
}

/** The overlap of two stretches along a wall, or 0 when they only touch or are apart. */
const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export const runsFitAlongWall: Check = {
  id: 'layout.runs-fit-along-wall',
  layer: 'layout',
  description: 'Cabinet runs and appliances stay within their wall',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      const parts = [
        ...wall.runs.map((r, i) => ({ name: runName(r, i, room, w), farEdge: r.offset + r.length, ref: { kind: 'run' as const, id: r.run_id } })),
        ...wall.appliances.map((a, i) => ({ name: applianceName(a, i, room, w), farEdge: a.offset + a.width.value, ref: { kind: 'appliance' as const, id: a.placement_id } })),
      ];
      for (const part of parts) {
        if (compareToDistance(part.farEdge, wall.start_point, wall.end_point) > 0) {
          const over = part.farEdge - distanceForDisplay(wall.start_point, wall.end_point).value;
          issues.push({
            check_id: this.id,
            severity: 'block',
            message:
              `${part.name} runs past the end of the wall: its far end is ${formatInches(part.farEdge)} from the start, ` +
              `but the wall is ${describeDistance(wall.start_point, wall.end_point)} long` +
              (over > 0 ? ` (${formatInches(over)} too far).` : '.'),
            ref: part.ref,
          });
        }
      }
    });
    return issues;
  },
};

export const runsOverlap: Check = {
  id: 'layout.runs-overlap',
  layer: 'layout',
  description: 'Cabinet runs on the same wall do not overlap',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      wall.runs.forEach((a, i) => {
        wall.runs.forEach((b, j) => {
          if (j <= i) return;
          const by = overlap(a.offset, a.offset + a.length, b.offset, b.offset + b.length);
          if (by > 0) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `${runName(a, i, room, w)} and cabinet run ${j + 1} overlap by ${formatInches(by)}.`,
              ref: { kind: 'run', id: b.run_id },
            });
          }
        });
      });
    });
    return issues;
  },
};

export const runsClearDoorways: Check = {
  id: 'layout.runs-clear-doorways',
  layer: 'layout',
  description: 'Cabinet runs and appliances do not cross a door or passthrough',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      const doorways = wall.openings.filter((o) => o.kind !== 'window');
      const parts = [
        ...wall.runs.map((r, i) => ({ name: runName(r, i, room, w), start: r.offset, end: r.offset + r.length, ref: { kind: 'run' as const, id: r.run_id } })),
        ...wall.appliances.map((a, i) => ({ name: applianceName(a, i, room, w), start: a.offset, end: a.offset + a.width.value, ref: { kind: 'appliance' as const, id: a.placement_id } })),
      ];
      for (const part of parts) {
        for (const o of doorways) {
          const by = overlap(part.start, part.end, o.offset.value, o.offset.value + o.width.value);
          if (by > 0) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `${part.name} crosses the ${o.kind} by ${formatInches(by)}. Nothing can stand in a doorway.`,
              ref: part.ref,
            });
          }
        }
      }
    });
    return issues;
  },
};

export const appliancesOverlap: Check = {
  id: 'layout.appliances-overlap',
  layer: 'layout',
  description: 'Appliances on the same wall do not overlap',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      wall.appliances.forEach((a, i) => {
        wall.appliances.forEach((b, j) => {
          if (j <= i) return;
          const by = overlap(a.offset, a.offset + a.width.value, b.offset, b.offset + b.width.value);
          if (by > 0) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `${applianceName(a, i, room, w)} and appliance ${j + 1} (${b.kind}) overlap by ${formatInches(by)}.`,
              ref: { kind: 'appliance', id: b.placement_id },
            });
          }
        });
      });
    });
    return issues;
  },
};

export const appliancesOnRuns: Check = {
  id: 'layout.appliances-on-runs',
  layer: 'layout',
  description: 'Every appliance stands within a cabinet run',
  run(job) {
    const issues: Issue[] = [];
    eachWall(job, (room, wall, w) => {
      wall.appliances.forEach((a, i) => {
        const start = a.offset;
        const end = a.offset + a.width.value;
        // Touching runs count as one stretch, so an appliance may sit across a split.
        const covered = wall.runs
          .map((r) => [r.offset, r.offset + r.length] as const)
          .sort((x, y) => x[0] - y[0])
          .reduce((reach, [s, e]) => (s <= reach && e > reach ? e : reach), start);
        if (covered < end) {
          issues.push({
            check_id: this.id,
            severity: 'block',
            message: `${applianceName(a, i, room, w)} is not within a cabinet run. Add a run under it or move it onto one.`,
            ref: { kind: 'appliance', id: a.placement_id },
          });
        }
      });
    });
    return issues;
  },
};

export const pairsExist: Check = {
  id: 'layout.appliance-pairs-exist',
  layer: 'layout',
  description: 'An appliance placed beside another (a dishwasher beside its sink) points to one that exists in the same room',
  run(job) {
    const issues: Issue[] = [];
    for (const room of job.rooms) {
      const ids = new Set(room.walls.flatMap((wall) => wall.appliances.map((a) => a.placement_id)));
      room.walls.forEach((wall, w) => {
        wall.appliances.forEach((a, i) => {
          if (a.paired_with === null) return;
          if (a.paired_with === a.placement_id || !ids.has(a.paired_with)) {
            issues.push({
              check_id: this.id,
              severity: 'block',
              message: `${applianceName(a, i, room, w)} is meant to sit beside another appliance that isn't in this room.`,
              ref: { kind: 'appliance', id: a.placement_id },
            });
          }
        });
      });
    }
    return issues;
  },
};

/** Every rough-layout check, in the order they run. */
export const RUN_CHECKS: readonly Check[] = [runsFitAlongWall, runsOverlap, runsClearDoorways, appliancesOverlap, appliancesOnRuns, pairsExist];
