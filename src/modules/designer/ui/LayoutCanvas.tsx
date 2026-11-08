'use client';
/**
 * The rough layout on the plan (owner, 2026-11-06): cabinet runs, corner cabinets, islands and
 * appliances, drawn only from the master copy (P6), plus the pointer handling for the
 * "Cabinets & appliances" tool. Every rule (snapping, clearances, what fits) is in
 * model/layout.ts; this file only turns pointer moves into the edits it asks for.
 */
import { useRef } from 'react';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { formatInches, type AppliancePlacement, type Point, type Room, type Run, type RunKind, type Wall } from '@/core/index';
import {
  cornerCabinets,
  direction,
  findRun,
  halfThickness,
  insideNormal,
  jointLimits,
  nearestIslandDepth,
  runEnd,
  runEndLimits,
  runMoveLimits,
  snapRunEnd,
  sortedRuns,
  upperDepth,
  upperPieces,
  wallLength,
} from '../model/layout';
import { LAYOUT_RULES, applianceType } from '../model/layout-rules';
import { ERROR, INK as THEME_INK, NAVY, NAVY_FILL, NAVY_FILL_LIGHT } from './theme';
import type { LayoutEdit } from './layoutEdits';

/** UI settings (not business values): touch targets and snapping reach, in screen pixels. */
const HANDLE_PX = 14;
const WALL_REACH_PX = 40;
const DRAG_PX = 4;
const INCH = 64;
/** How far into the room from a wall's inside face a tap still means "this wall". */
const WALL_ZONE = 30 * INCH;
/** Smallest island a drag on the floor makes; anything shorter is treated as a click. */
const MIN_ISLAND_DRAG = 24 * INCH;
/** How far (screen pixels) a drag from a wall must go before its direction decides what it does. */
const INTENT_PX = 10;
/** A sink dragged at least this close to a window's centre snaps to it (more when zoomed out). */
const CENTRE_SNAP = 3 * INCH;
/** How close (in room units) an island being dragged must come to a floating wall to snap onto it. */
const ISLAND_SNAP = 10 * INCH;

const ACCENT = NAVY;
const DANGER = ERROR;
const INK = THEME_INK;
const COLOURS: Record<RunKind, { fill: string; stroke: string }> = {
  base: { fill: '#e6cfa8', stroke: '#a8824c' },
  upper: { fill: '#fff6e6', stroke: '#a8824c' },
  base_upper: { fill: '#e6cfa8', stroke: '#a8824c' },
  base_upper_pantry: { fill: '#d6b07a', stroke: '#a8824c' },
  pantry: { fill: '#c79c63', stroke: '#8a6a40' },
};
export const RUN_SHORT: Record<RunKind, string> = {
  base: 'base',
  upper: 'upper',
  base_upper: 'base + upper',
  base_upper_pantry: 'base, upper + pantry',
  pantry: 'pantry',
};

export type LayoutSelection = { kind: 'runs'; ids: readonly string[] } | { kind: 'appliance'; id: string } | null;

type ToScreen = (p: Point) => Point;
type V = { x: number; y: number };

/** A point on a wall: `t` along it from its start, `d` into the room from its centre line. */
function on(r: Room, w: Wall, t: number, d: number): Point {
  const u = direction(w);
  const n = insideNormal(r, w);
  return { x: w.start_point.x + u.x * t + n.x * d, y: w.start_point.y + u.y * t + n.y * d };
}
function project(r: Room, w: Wall, p: Point): { t: number; d: number } {
  const u = direction(w);
  const n = insideNormal(r, w);
  const x = p.x - w.start_point.x;
  const y = p.y - w.start_point.y;
  return { t: x * u.x + y * u.y, d: x * n.x + y * n.y };
}
/** How far from the centre line a run's band reaches: from the inside face into the room, or centred on an island. */
function depthRange(w: Wall, depth: number): [number, number] {
  if (w.kind === 'floating') return [-depth / 2, depth / 2];
  const h = halfThickness(w);
  return [h, h + depth];
}
function band(r: Room, w: Wall, t0: number, t1: number, d0: number, d1: number, toScreen: ToScreen): number[] {
  return [on(r, w, t0, d0), on(r, w, t1, d0), on(r, w, t1, d1), on(r, w, t0, d1)].map(toScreen).flatMap((p) => [p.x, p.y]);
}
/** The depth of the run an appliance stands on (or the base depth). */
function applianceDepth(w: Wall, a: AppliancePlacement): number {
  const mid = a.offset + a.width.value / 2;
  const run = w.runs.find((x) => x.offset <= mid && runEnd(x) >= mid);
  return run ? run.depth : LAYOUT_RULES.runDepths.base;
}
const upright = (a: V, b: V) => {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return deg > 90 || deg < -90 ? deg + 180 : deg;
};

// ---------- drawing ----------

export function LayoutShapes(props: {
  room: Room;
  toScreen: ToScreen;
  scale: number;
  selection: LayoutSelection;
  issueIds: ReadonlySet<string>;
  /** Handles show only in the Cabinets & appliances tool, for someone who can edit. */
  handles: boolean;
  onLengthLabel: (runId: string) => void;
}) {
  const { room: r, toScreen, scale, selection, issueIds, handles } = props;
  const selectedRuns = new Set(selection?.kind === 'runs' ? selection.ids : []);
  const font = 11;
  const shapes: React.ReactNode[] = [];

  for (const w of r.walls) {
    for (const run of w.runs) {
      const [d0, d1] = depthRange(w, run.depth);
      const c = COLOURS[run.kind];
      const isSel = selectedRuns.has(run.run_id);
      const bad = issueIds.has(run.run_id);
      shapes.push(
        <Line
          key={`run-${run.run_id}`}
          name={`run run-${run.kind}`}
          points={band(r, w, run.offset, runEnd(run), d0, d1, toScreen)}
          closed
          fill={c.fill}
          opacity={run.kind === 'upper' ? 0.85 : 1}
          stroke={bad ? DANGER : isSel ? ACCENT : c.stroke}
          strokeWidth={isSel || bad ? 2.5 : 1}
          dash={run.kind === 'upper' ? [6, 4] : []}
          listening={false}
        />,
      );
      // Uppers on a base + upper run: a dashed band at the back, where upperPieces says.
      for (const piece of upperPieces(w, run)) {
        shapes.push(
          <Line
            key={`up-${run.run_id}-${piece.start}`}
            name="upper-band"
            points={band(r, w, piece.start, piece.end, d0, d0 + upperDepth(run), toScreen)}
            closed
            fill="#fff6e6"
            opacity={0.6}
            stroke={c.stroke}
            strokeWidth={0.75}
            dash={[5, 4]}
            listening={false}
          />,
        );
      }
      const mid = on(r, w, (run.offset + runEnd(run)) / 2, d1 + 7 * INCH);
      const label = `${formatInches(run.length)} · ${RUN_SHORT[run.kind]}`;
      const sp = toScreen(mid);
      shapes.push(
        <Text
          key={`rl-${run.run_id}`}
          name="run-length"
          x={sp.x}
          y={sp.y}
          text={label}
          fontSize={font}
          fill={isSel ? ACCENT : '#5b6670'}
          fontStyle={isSel ? 'bold' : 'normal'}
          rotation={upright(toScreen(w.start_point), toScreen(w.end_point))}
          offsetX={label.length * 2.9}
          offsetY={6}
          listening={handles}
          onClick={(e) => {
            e.cancelBubble = true;
            props.onLengthLabel(run.run_id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            props.onLengthLabel(run.run_id);
          }}
        />,
      );
    }
    // Dividers between touching runs (a split), each with a handle that moves both.
    const runs = sortedRuns(w);
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1] as Run;
      const b = runs[i] as Run;
      if (runEnd(a) !== b.offset) continue;
      const [d0, d1] = depthRange(w, Math.max(a.depth, b.depth));
      const p0 = toScreen(on(r, w, b.offset, d0));
      const p1 = toScreen(on(r, w, b.offset, d1));
      shapes.push(<Line key={`j-${b.run_id}`} name="joint" points={[p0.x, p0.y, p1.x, p1.y]} stroke="#8a6a40" strokeWidth={2} listening={false} />);
      if (handles) {
        const hp = toScreen(on(r, w, b.offset, depthRange(w, Math.min(a.depth, b.depth)).reduce((x, y) => (x + y) / 2)));
        shapes.push(<Rect key={`jh-${b.run_id}`} name="joint-handle" x={hp.x - 4} y={hp.y - 8} width={8} height={16} cornerRadius={2} fill="#fff" stroke={ACCENT} strokeWidth={1.5} rotation={0} listening={false} />);
      }
    }
  }

  // Corner cabinets, where runs on two walls meet. The base corner is a square with a cross, as
  // plans show it. The upper corner is an L (owner, 2026-11-06): each leg runs along one wall as
  // far as the base corner reaches, and is as deep as that wall's uppers, with a diagonal.
  for (const c of cornerCabinets(r)) {
    const ending = r.walls.find((w) => w.wall_id === c.endingWallId) as Wall;
    const starting = r.walls.find((w) => w.wall_id === c.startingWallId) as Wall;
    const nE = insideNormal(r, ending);
    const nS = insideNormal(r, starting);
    const p = c.corner;
    /** The point `s` along nS (back along the ending wall) and `e` along nE (along the starting wall). */
    const at = (s: number, e: number): Point => ({ x: p.x + nS.x * s + nE.x * e, y: p.y + nS.y * s + nE.y * e });
    const line = (pts: Point[]) => pts.map(toScreen).flatMap((v) => [v.x, v.y]);
    if (c.baseDepths) {
      const { starting: s, ending: e } = c.baseDepths;
      shapes.push(
        <Group key={`corner-${c.endingWallId}-base`} name="corner-cabinet corner-base" listening={false}>
          <Line points={line([at(0, 0), at(s, 0), at(s, e), at(0, e)])} closed stroke={ACCENT} strokeWidth={1.5} fill={NAVY_FILL} />
          <Line points={line([at(0, 0), at(s, e)])} stroke={ACCENT} strokeWidth={1} />
          <Line points={line([at(s, 0), at(0, e)])} stroke={ACCENT} strokeWidth={1} />
        </Group>,
      );
    }
    if (c.upperDepths) {
      const legS = c.baseDepths?.starting ?? LAYOUT_RULES.runDepths.base;
      const legE = c.baseDepths?.ending ?? LAYOUT_RULES.runDepths.base;
      const { starting: us, ending: ue } = c.upperDepths;
      shapes.push(
        <Group key={`corner-${c.endingWallId}-upper`} name="corner-cabinet corner-upper" listening={false}>
          <Line points={line([at(0, 0), at(legS, 0), at(legS, ue), at(us, ue), at(us, legE), at(0, legE)])} closed stroke={ACCENT} strokeWidth={2} dash={[6, 3]} fill={NAVY_FILL_LIGHT} />
          <Line points={line([at(0, 0), at(us, ue)])} stroke={ACCENT} strokeWidth={1} />
        </Group>,
      );
    }
  }

  // Appliances, with the hood over a range or cooktop and the deeper upper over a fridge.
  for (const w of r.walls) {
    for (const a of w.appliances) {
      const type = applianceType(LAYOUT_RULES, a.kind);
      const depth = applianceDepth(w, a);
      const [d0, d1] = depthRange(w, depth);
      const t0 = a.offset;
      const t1 = a.offset + a.width.value;
      const isSel = selection?.kind === 'appliance' && selection.id === a.placement_id;
      const bad = issueIds.has(a.placement_id) || !type;
      shapes.push(
        <Line
          key={`ap-${a.placement_id}`}
          name={`appliance appliance-${a.kind}`}
          points={band(r, w, t0, t1, d0, d1, toScreen)}
          closed
          fill="#ffffff"
          stroke={bad ? DANGER : isSel ? ACCENT : INK}
          strokeWidth={isSel || bad ? 2.5 : 1.2}
          listening={false}
        />,
      );
      const inset = Math.min(2 * INCH, depth / 6);
      if (type?.comesWithHood) {
        shapes.push(<Line key={`hood-${a.placement_id}`} name="hood" points={band(r, w, t0 + inset, t1 - inset, d0 + inset, d0 + Math.min(20 * INCH, depth - inset), toScreen)} closed stroke={INK} strokeWidth={0.8} dash={[5, 3]} listening={false} />);
      }
      if (type?.upperAboveDepth && w.kind === 'room') {
        shapes.push(<Line key={`fu-${a.placement_id}`} name="fridge-upper" points={band(r, w, t0 + inset / 2, t1 - inset / 2, d0 + inset / 2, d0 + type.upperAboveDepth, toScreen)} closed stroke="#8a6a40" strokeWidth={1} dash={[5, 3]} listening={false} />);
      }
      const centre = toScreen(on(r, w, (t0 + t1) / 2, (d0 + d1) / 2));
      const name = type?.label ?? a.kind;
      const sub = `${formatInches(a.width.value)}${type?.comesWithHood ? ' + hood' : ''}${type?.upperAboveDepth && w.kind === 'room' ? ` · ${formatInches(type.upperAboveDepth)} upper` : ''}`;
      const size = Math.max(8, Math.min(11, (depth * scale) / 5));
      shapes.push(
        <Group key={`apl-${a.placement_id}`} x={centre.x} y={centre.y} listening={false}>
          <Text text={name} fontSize={size} fontStyle="bold" fill={INK} width={160} offsetX={80} offsetY={size} align="center" />
          <Text text={sub} fontSize={size - 1} fill="#5b6670" width={160} offsetX={80} offsetY={-2} align="center" />
        </Group>,
      );
    }
  }

  // Handles on one selected run: its ends and its depth (an island: its far end and depth).
  if (handles && selection?.kind === 'runs' && selection.ids.length === 1) {
    const found = findRun(r, selection.ids[0] as string);
    if (found) {
      const { wall: w, run } = found;
      const [d0, d1] = depthRange(w, run.depth);
      const ends = w.kind === 'floating' ? [runEnd(run)] : [run.offset, runEnd(run)];
      for (const t of ends) {
        const p = toScreen(on(r, w, t, (d0 + d1) / 2));
        shapes.push(<Circle key={`h-${t}`} name="run-end-handle" x={p.x} y={p.y} radius={7} fill="#fff" stroke={ACCENT} strokeWidth={2} listening={false} />);
      }
      const dp = toScreen(on(r, w, (run.offset + runEnd(run)) / 2, d1));
      shapes.push(<Rect key="h-depth" name="run-depth-handle" x={dp.x - 6} y={dp.y - 6} width={12} height={12} fill="#fff" stroke={ACCENT} strokeWidth={2} listening={false} />);
    }
  }
  return <Group name="layout">{shapes}</Group>;
}

// ---------- pointer handling for the Cabinets & appliances tool ----------

type Pending =
  | { mode: 'appliance'; id: string }
  | { mode: 'joint'; leftId: string; rightId: string; wallId: string }
  | { mode: 'run-end'; runId: string; end: 'start' | 'end'; wallId: string; island: boolean }
  | { mode: 'depth'; runId: string; wallId: string; island: boolean }
  | { mode: 'run'; runId: string; wallId: string; t: number; island: boolean; others: readonly WallSpot[] }
  | { mode: 'wall'; wallId: string; t: number; others: readonly WallSpot[] }
  | { mode: 'floor' };

/** A point near a room wall: which wall, and how far along it. */
interface WallSpot {
  readonly wallId: string;
  readonly t: number;
}

interface Active {
  pending: Pending;
  start: Point;
  at: V;
  moved: boolean;
  shift: boolean;
  /** Where the pointer is now (room), and the edit it asks for: for the island label. */
  last?: { p: Point; edit: LayoutEdit | null };
  /**
   * For a drag that starts at a wall or on a run: decided once the pointer has moved far enough
   * to tell. Along the wall draws cabinets (or slides the run); out into the room makes an island.
   */
  intent?: 'along' | 'island';
}

/** While an island is being dragged out: the area dragged, and what it snaps to. */
export interface IslandHint {
  readonly from: Point;
  readonly to: Point;
  readonly text: string;
}

export interface LayoutToolArgs {
  room: Room;
  /** The room as last saved: hits and snaps use it, never a drag's own preview. */
  baseRoom: Room;
  scale: number;
  selection: LayoutSelection;
  onSelect: (sel: LayoutSelection) => void;
  /** A layout edit: `done` false previews it, true saves it (one undo step). */
  onEdit: (edit: LayoutEdit, done: boolean) => void;
  onCancel: () => void;
  /** An appliance picked in the tray, waiting for a tap on the plan. */
  armed: string | null;
  onArmedUsed: () => void;
  /** Something the person should know (a tap that did nothing). */
  onMessage: (text: string) => void;
}

/** The wall an appliance dropped at `p` goes on, and where along it (its centre). */
export function applianceTarget(r: Room, p: Point, reach: number): { wallId: string; centre: number } | null {
  let best: { wallId: string; centre: number; dist: number } | null = null;
  for (const w of r.walls) {
    const { t, d } = project(r, w, p);
    const len = wallLength(w);
    if (t < -reach || t > len + reach) continue;
    // How far from where cabinets stand: an island's line, or a room wall's inside face
    // (anything within the usual cabinet zone counts, but nearer the face wins).
    const fromFace = w.kind === 'floating' ? Math.abs(d) : Math.abs(d - halfThickness(w));
    const outOfZone = w.kind === 'floating' ? Math.max(0, fromFace - LAYOUT_RULES.islandStartSize.depth) : d < halfThickness(w) ? fromFace : Math.max(0, fromFace - WALL_ZONE);
    if (outOfZone > reach) continue;
    const dist = fromFace;
    if (!best || dist < best.dist) best = { wallId: w.wall_id, centre: Math.max(0, Math.min(len, t)), dist };
  }
  return best ? { wallId: best.wallId, centre: best.centre } : null;
}

export function useLayoutTool(args: LayoutToolArgs) {
  const active = useRef<Active | null>(null);
  const tol = HANDLE_PX / args.scale;

  const hit = (p: Point): Pending => {
    const r = args.baseRoom;
    // Appliances first: they sit on top of runs.
    for (const w of r.walls) {
      for (const a of w.appliances) {
        const { t, d } = project(r, w, p);
        const [d0, d1] = depthRange(w, applianceDepth(w, a));
        if (t >= a.offset && t <= a.offset + a.width.value && d >= d0 - 1 && d <= d1 + 1) return { mode: 'appliance', id: a.placement_id };
      }
    }
    // Dividers between runs, always grabbable.
    for (const w of r.walls) {
      const runs = sortedRuns(w);
      for (let i = 1; i < runs.length; i++) {
        const a = runs[i - 1] as Run;
        const b = runs[i] as Run;
        if (runEnd(a) !== b.offset) continue;
        const [d0, d1] = depthRange(w, Math.min(a.depth, b.depth));
        const q = on(r, w, b.offset, (d0 + d1) / 2);
        if (Math.hypot(p.x - q.x, p.y - q.y) < tol) return { mode: 'joint', leftId: a.run_id, rightId: b.run_id, wallId: w.wall_id };
      }
    }
    // The selected run's handles.
    const sel = args.selection;
    if (sel?.kind === 'runs' && sel.ids.length === 1) {
      const found = findRun(r, sel.ids[0] as string);
      if (found) {
        const { wall: w, run } = found;
        const island = w.kind === 'floating';
        const [d0, d1] = depthRange(w, run.depth);
        const dq = on(r, w, (run.offset + runEnd(run)) / 2, d1);
        if (Math.hypot(p.x - dq.x, p.y - dq.y) < tol) return { mode: 'depth', runId: run.run_id, wallId: w.wall_id, island };
        for (const end of island ? (['end'] as const) : (['start', 'end'] as const)) {
          const q = on(r, w, end === 'start' ? run.offset : runEnd(run), (d0 + d1) / 2);
          if (Math.hypot(p.x - q.x, p.y - q.y) < tol) return { mode: 'run-end', runId: run.run_id, end, wallId: w.wall_id, island };
        }
      }
    }
    // Every room wall whose cabinet zone holds the point: in a corner that is two walls, and a
    // drag then goes along whichever one it follows (owner, 2026-11-07).
    const near: (WallSpot & { score: number })[] = [];
    for (const w of r.walls) {
      if (w.kind !== 'room') continue;
      const { t, d } = project(r, w, p);
      const h = halfThickness(w);
      if (t < 0 || t > wallLength(w) || d < -h - tol || d > h + WALL_ZONE) continue;
      near.push({ wallId: w.wall_id, t, score: Math.abs(d - h - 6 * INCH) });
    }
    near.sort((x, y) => x.score - y.score);
    const othersThan = (wallId: string): WallSpot[] => near.filter((x) => x.wallId !== wallId).map(({ wallId: id, t }) => ({ wallId: id, t }));
    // A run's band.
    for (const w of r.walls) {
      for (const run of w.runs) {
        const { t, d } = project(r, w, p);
        const [d0, d1] = depthRange(w, run.depth);
        if (t >= run.offset && t <= runEnd(run) && d >= d0 - 1 && d <= d1 + 1) {
          const island = w.kind === 'floating';
          return { mode: 'run', runId: run.run_id, wallId: w.wall_id, t, island, others: island ? [] : othersThan(w.wall_id) };
        }
      }
    }
    // Near a room wall's inside face: the nearest such wall.
    const best = near[0];
    if (best) return { mode: 'wall', wallId: best.wallId, t: best.t, others: othersThan(best.wallId) };
    return { mode: 'floor' };
  };

  /** The edit a drag to `p` asks for, or null when it asks for nothing (yet). */
  const editFor = (a: Active, p: Point, free: boolean): LayoutEdit | null => {
    const r = args.baseRoom;
    const pend = a.pending;
    const wallOf = (id: string) => r.walls.find((w) => w.wall_id === id);
    const snap = (wallId: string, t: number, ignore: string[] = []) => snapRunEnd(r, wallId, t, { tolerance: tol, free, ignoreRunIds: ignore });
    const inch = (v: number) => Math.round(v / INCH) * INCH;
    switch (pend.mode) {
      case 'appliance': {
        const target = applianceTarget(r, p, Math.max(WALL_REACH_PX / args.scale, 12 * INCH));
        // Dragged, a sink snaps to a window's centre only near it, so it can sit off centre; Alt: never.
        const centreSnap = free ? 0 : Math.max(CENTRE_SNAP, tol);
        return target ? { kind: 'appliance-move', placementId: pend.id, wallId: target.wallId, centre: target.centre, centreSnap } : null;
      }
      case 'joint': {
        const w = wallOf(pend.wallId);
        const lim = jointLimits(r, pend.leftId, pend.rightId);
        if (!w || !lim) return null;
        const at = Math.max(lim.min, Math.min(lim.max, snap(w.wall_id, project(r, w, p).t, [pend.leftId, pend.rightId])));
        return { kind: 'joint', leftId: pend.leftId, rightId: pend.rightId, at };
      }
      case 'run-end': {
        const w = wallOf(pend.wallId);
        if (!w) return null;
        if (pend.island) {
          const run = findRun(r, pend.runId)?.run;
          if (!run) return null;
          return { kind: 'island-resize', wallId: w.wall_id, length: Math.max(MIN_ISLAND_DRAG, inch(project(r, w, p).t)), depth: run.depth };
        }
        const lim = runEndLimits(r, pend.runId, pend.end);
        if (!lim) return null;
        const at = Math.max(lim.min, Math.min(lim.max, snap(w.wall_id, project(r, w, p).t, [pend.runId])));
        return { kind: 'run-end', runId: pend.runId, end: pend.end, at };
      }
      case 'depth': {
        const w = wallOf(pend.wallId);
        if (!w) return null;
        const d = project(r, w, p).d;
        if (pend.island) return { kind: 'island-resize', wallId: w.wall_id, length: wallLength(w), depth: nearestIslandDepth(2 * Math.abs(d)) };
        return { kind: 'run-depth', runIds: [pend.runId], depth: Math.max(3 * INCH, inch(d - halfThickness(w))) };
      }
      case 'run':
      case 'wall': {
        const w = wallOf(pend.wallId);
        if (!w) return null;
        if (pend.mode === 'run' && pend.island) {
          return { kind: 'island-move', wallId: w.wall_id, dx: inch(p.x - a.start.x), dy: inch(p.y - a.start.y) };
        }
        // Which way is the drag going? Decided once, when it has gone far enough to tell.
        if (!a.intent) {
          const vx = p.x - a.start.x;
          const vy = p.y - a.start.y;
          if (Math.hypot(vx, vy) * args.scale < INTENT_PX) return null;
          const follows = (wall: Wall) => {
            const u = direction(wall);
            return Math.abs(vx * u.x + vy * u.y) >= Math.abs(vx * u.y - vy * u.x);
          };
          if (follows(w)) a.intent = 'along';
          else {
            // Across this wall, but along another wall that meets it here (a corner): draw a run
            // on that wall, starting from the corner, instead of making an island.
            const other = pend.others.find((o) => {
              const ow = wallOf(o.wallId);
              return ow !== undefined && follows(ow);
            });
            if (other) {
              a.pending = { mode: 'wall', wallId: other.wallId, t: other.t, others: [] };
              a.intent = 'along';
              return editFor(a, p, free);
            }
            a.intent = 'island';
          }
        }
        if (a.intent === 'island') return editFor({ ...a, pending: { mode: 'floor' } }, p, free);
        if (pend.mode === 'run') {
          // Grabbing cabinets and dragging along the wall slides them, keeping their length.
          const run = w.runs.find((x) => x.run_id === pend.runId);
          const lim = runMoveLimits(r, pend.runId);
          if (!run || !lim) return null;
          const want = run.offset + (project(r, w, p).t - pend.t);
          const byStart = snap(w.wall_id, want, [run.run_id]);
          const byEnd = snap(w.wall_id, want + run.length, [run.run_id]) - run.length;
          const snapped = [byStart, byEnd].filter((x) => x !== Math.round(want)).sort((x, y) => Math.abs(x - want) - Math.abs(y - want))[0] ?? Math.round(want);
          return { kind: 'run-move', runId: run.run_id, offset: Math.max(lim.min, Math.min(lim.max, snapped)) };
        }
        return { kind: 'draw', wallId: w.wall_id, from: snap(w.wall_id, pend.t), to: snap(w.wall_id, project(r, w, p).t) };
      }
      case 'floor': {
        const dx = Math.abs(p.x - a.start.x);
        const dy = Math.abs(p.y - a.start.y);
        const along = dx >= dy ? 'x' : 'y';
        const length = inch(Math.max(dx, dy));
        if (length < MIN_ISLAND_DRAG) return null;
        const depth = nearestIslandDepth(Math.min(dx, dy));
        // Over a floating wall with nothing on it, running the same way: the island snaps onto
        // it, centred on the line and the wall's length (owner, 2026-11-06). Alt turns this off.
        if (!free) {
          const mid = { x: (p.x + a.start.x) / 2, y: (p.y + a.start.y) / 2 };
          for (const w of r.walls) {
            if (w.kind !== 'floating' || w.runs.length > 0) continue;
            const u = direction(w);
            if ((Math.abs(u.x) >= Math.abs(u.y)) !== (along === 'x')) continue;
            const { t, d } = project(r, w, mid);
            if (Math.abs(d) <= Math.max(ISLAND_SNAP, depth / 2) && t >= -ISLAND_SNAP && t <= wallLength(w) + ISLAND_SNAP) {
              return { kind: 'island-onto-wall', wallId: w.wall_id, depth };
            }
          }
        }
        return { kind: 'island-add', centre: { x: inch((p.x + a.start.x) / 2), y: inch((p.y + a.start.y) / 2) }, along, length, depth };
      }
    }
  };

  const down = (p: Point, screen: V, shift: boolean): boolean => {
    if (args.armed) {
      const target = applianceTarget(args.baseRoom, p, Math.max(WALL_REACH_PX / args.scale, 12 * INCH));
      if (!target) {
        args.onMessage('Tap on or near a wall or an island to place it.');
        return true;
      }
      args.onEdit({ kind: 'appliance-place', applianceKind: args.armed, wallId: target.wallId, centre: target.centre }, true);
      args.onArmedUsed();
      return true;
    }
    active.current = { pending: hit(p), start: p, at: screen, moved: false, shift };
    return true;
  };

  const move = (p: Point, screen: V, free: boolean): boolean => {
    const a = active.current;
    if (!a) return false;
    if (!a.moved && Math.hypot(screen.x - a.at.x, screen.y - a.at.y) <= DRAG_PX) return true;
    a.moved = true;
    const edit = editFor(a, p, free);
    a.last = { p, edit };
    if (edit) args.onEdit(edit, false);
    else if (a.pending.mode === 'floor' || a.intent === 'island') args.onCancel();
    return true;
  };

  const up = (p: Point, free: boolean): boolean => {
    const a = active.current;
    if (!a) return false;
    active.current = null;
    if (a.moved) {
      const edit = editFor(a, p, free);
      if (edit) args.onEdit(edit, true);
      else args.onCancel();
      return true;
    }
    // A click.
    const pend = a.pending;
    const sel = args.selection;
    if (pend.mode === 'appliance') args.onSelect({ kind: 'appliance', id: pend.id });
    else if (pend.mode === 'run' || pend.mode === 'run-end' || pend.mode === 'depth') {
      if (a.shift && sel?.kind === 'runs') {
        args.onSelect(sel.ids.includes(pend.runId) ? (sel.ids.length > 1 ? { kind: 'runs', ids: sel.ids.filter((x) => x !== pend.runId) } : null) : { kind: 'runs', ids: [...sel.ids, pend.runId] });
      } else args.onSelect({ kind: 'runs', ids: [pend.runId] });
    } else if (pend.mode === 'joint') args.onSelect({ kind: 'runs', ids: [pend.rightId] });
    else if (pend.mode === 'wall') args.onEdit({ kind: 'fill', wallId: pend.wallId }, true);
    else args.onSelect(null);
    return true;
  };

  const cancel = () => {
    if (!active.current) return;
    active.current = null;
    args.onCancel();
  };

  /** The label and dragged area while an island is being dragged out on the floor. */
  const islandHint = (): IslandHint | null => {
    const a = active.current;
    if (!a || !a.moved || !a.last) return null;
    if (a.pending.mode !== 'floor' && a.intent !== 'island') return null;
    const e = a.last.edit;
    const r = args.baseRoom;
    const text =
      e?.kind === 'island-add'
        ? `${formatInches(e.length)} × ${formatInches(e.depth)} deep`
        : e?.kind === 'island-onto-wall'
          ? `${formatInches(wallLength(r.walls.find((w) => w.wall_id === e.wallId) as Wall))} × ${formatInches(e.depth)} deep · on the floating wall`
          : 'Drag further for an island';
    return { from: a.start, to: a.last.p, text };
  };

  return { down, move, up, cancel, islandHint, dragging: () => active.current?.moved === true };
}
