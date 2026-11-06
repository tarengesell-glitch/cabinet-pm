/**
 * The rough-layout actions the plan and panels can ask for, and how each maps onto the
 * editing functions in model/layout.ts. Display glue only: every rule lives in the model.
 */
import type { Length, Point, Result, RunKind } from '@/core/index';
import { deleteWalls, room as roomOf, type Change, type Draft, type Env } from '../model/editor';
import {
  addIsland,
  addIslandOnWall,
  deleteAppliances,
  deleteRuns,
  drawRun,
  fillWall,
  findRun,
  flipPartner,
  moveAppliance,
  moveIsland,
  moveJoint,
  placeAppliance,
  resizeIsland,
  setApplianceWidth,
  setRunDepth,
  setRunEnd,
  setRunKind,
  setRunLength,
  splitRun,
} from '../model/layout';

/** UI setting, not a business value: a sink dropped this close beyond a window's edge centres under it. */
export const WINDOW_SNAP: Length = 14 * 64;

export type LayoutEdit =
  | { kind: 'fill'; wallId: string }
  | { kind: 'draw'; wallId: string; from: Length; to: Length }
  | { kind: 'run-end'; runId: string; end: 'start' | 'end'; at: Length }
  | { kind: 'run-length'; runId: string; length: Length }
  | { kind: 'joint'; leftId: string; rightId: string; at: Length }
  | { kind: 'run-depth'; runIds: readonly string[]; depth: Length }
  | { kind: 'run-kind'; runIds: readonly string[]; runKind: RunKind }
  | { kind: 'split'; runId: string }
  | { kind: 'delete-runs'; runIds: readonly string[] }
  | { kind: 'island-add'; centre: Point; along: 'x' | 'y'; length: Length; depth: Length }
  | { kind: 'island-onto-wall'; wallId: string; depth: Length }
  | { kind: 'island-move'; wallId: string; dx: Length; dy: Length }
  | { kind: 'island-resize'; wallId: string; length: Length; depth: Length }
  | { kind: 'appliance-place'; applianceKind: string; wallId: string; centre: number }
  | { kind: 'appliance-move'; placementId: string; wallId: string; centre: number }
  | { kind: 'appliance-width'; placementId: string; width: Length }
  | { kind: 'appliance-flip'; placementId: string }
  | { kind: 'delete-appliances'; placementIds: readonly string[] };

export function applyLayoutEdit(draft: Draft, env: Env, edit: LayoutEdit): Result<Change> {
  switch (edit.kind) {
    case 'fill':
      return fillWall(draft, env, edit.wallId);
    case 'draw':
      return drawRun(draft, env, edit.wallId, edit.from, edit.to);
    case 'run-end':
      return setRunEnd(draft, env, edit.runId, edit.end, edit.at);
    case 'run-length':
      return setRunLength(draft, env, edit.runId, edit.length);
    case 'joint':
      return moveJoint(draft, env, edit.leftId, edit.rightId, edit.at);
    case 'run-depth':
      return setRunDepth(draft, env, edit.runIds, edit.depth);
    case 'run-kind':
      return setRunKind(draft, env, edit.runIds, edit.runKind);
    case 'split':
      return splitRun(draft, env, edit.runId);
    case 'delete-runs': {
      // Deleting every run on an island deletes the island (its floating wall) too.
      const r = roomOf(draft);
      const islands = new Set<string>();
      for (const id of edit.runIds) {
        const found = findRun(r, id);
        if (found && found.wall.kind === 'floating' && found.wall.runs.every((x) => edit.runIds.includes(x.run_id))) islands.add(found.wall.wall_id);
      }
      const rest = edit.runIds.filter((id) => !islands.has(findRun(r, id)?.wall.wall_id ?? ''));
      if (islands.size > 0 && rest.length === 0) return deleteWalls(draft, env, [...islands]);
      return deleteRuns(draft, env, edit.runIds);
    }
    case 'island-add':
      return addIsland(draft, env, edit.centre, edit.along, edit.length, edit.depth);
    case 'island-onto-wall':
      return addIslandOnWall(draft, env, edit.wallId, edit.depth);
    case 'island-move':
      return moveIsland(draft, env, edit.wallId, edit.dx, edit.dy);
    case 'island-resize':
      return resizeIsland(draft, env, edit.wallId, edit.length, edit.depth);
    case 'appliance-place':
      return placeAppliance(draft, env, edit.applianceKind, edit.wallId, edit.centre, { windowSnap: WINDOW_SNAP });
    case 'appliance-move':
      return moveAppliance(draft, env, edit.placementId, edit.wallId, edit.centre, { windowSnap: WINDOW_SNAP });
    case 'appliance-width':
      return setApplianceWidth(draft, env, edit.placementId, edit.width);
    case 'appliance-flip':
      return flipPartner(draft, env, edit.placementId);
    case 'delete-appliances':
      return deleteAppliances(draft, env, edit.placementIds);
  }
}
