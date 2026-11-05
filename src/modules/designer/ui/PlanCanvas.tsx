'use client';
/**
 * The 2D plan (react-konva). Draws only from the master copy (P6).
 * Room coordinates have Y up (Core's convention); the screen has Y down, so this
 * file flips Y when converting, and nowhere else does.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Arc, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import {
  distanceForDisplay,
  formatInches,
  pointFromLengthAndAngle,
  snapEndToAngle,
  snapToGrid,
  snapToPoints,
  type Issue,
  type Opening,
  type Point,
  type Provenance,
  type Room,
  type Wall,
} from '@/core/index';
import { nearestWall, standardOpeningOffset } from '../model/editor';
import { lengthText } from './format';
import { STANDARD_SIZES } from '../model/standard-sizes';

export type Tool = 'select' | 'draw' | Opening['kind'];
export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'walls'; ids: readonly string[] }
  | { kind: 'opening'; id: string }
  | null;

/** The walls a selection covers (one, several or none). */
export const selectedWallIds = (sel: Selection): readonly string[] =>
  sel?.kind === 'wall' ? [sel.id] : sel?.kind === 'walls' ? sel.ids : [];

/** A selection made of these walls: none, one or several. */
export const wallSelection = (ids: readonly string[]): Selection =>
  ids.length === 0 ? null : ids.length === 1 ? { kind: 'wall', id: ids[0] as string } : { kind: 'walls', ids };

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Whether a segment touches a rectangle (screen space). */
function segmentTouchesBox(a: V, b: V, box: Box): boolean {
  const minX = Math.min(box.x0, box.x1);
  const maxX = Math.max(box.x0, box.x1);
  const minY = Math.min(box.y0, box.y1);
  const maxY = Math.max(box.y0, box.y1);
  const inside = (p: V) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  if (inside(a) || inside(b)) return true;
  const cross = (p: V, q: V, r: V) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const hits = (p: V, q: V, r: V, t: V) => cross(p, q, r) * cross(p, q, t) <= 0 && cross(r, t, p) * cross(r, t, q) <= 0;
  const c = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ] as const;
  return [0, 1, 2, 3].some((i) => hits(a, b, c[i] as V, c[(i + 1) % 4] as V));
}

/** Drags shorter than this many pixels count as a plain click. */
const DRAG_PX = 4;

/** UI settings for drawing (not business values): snap to whole inches, 45° steps, corners within 14 px. */
const INCH = 64;
const FOOT = 12 * INCH;
const ANGLE_STEP = 4500;
const SNAP_PX = 14;
const PAD_PX = 56;
/** A door or window ghost snaps to a wall within this many pixels of the cursor. */
const GHOST_PX = 40;
/** How far you can zoom out from / in to the fitted view. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const GHOST = '#176b70';
const MUTED = '#687582';

/** Wall fill by sureness tag. Rough is a soft pastel red (owner, 2026-11-05), not alarm red. */
const FILL: Record<Provenance, string> = { rough: '#eeb8ba', measured: '#ad751a', verified: '#16805d' };
/** Label text by sureness tag: darker than the fill so it stays readable on white. */
const TEXT: Record<Provenance, string> = { rough: '#b0575b', measured: '#8a5d12', verified: '#13704f' };
const ACCENT = '#176b70';
const DANGER = '#be3d42';

interface Props {
  /** The room as drawn: during a handle drag, a preview of the move. */
  room: Room;
  /** The room as last saved. Handle drags snap against this, never against their own preview. */
  baseRoom: Room;
  tool: Tool;
  selection: Selection;
  issues: readonly Issue[];
  canEdit: boolean;
  onSelect: (selection: Selection) => void;
  onAddWall: (start: Point, end: Point) => void;
  /** The tap position along the wall (centre of the new opening). */
  onPickWallForOpening: (wallId: string, centre: number) => void;
  /** An opening dragged along its wall to a new offset. */
  onMoveOpening: (openingId: string, offset: number) => void;
  /** A corner handle dragged (done = released). The parent previews, then commits on release. */
  onCornerDrag: (from: Point, to: Point, done: boolean) => void;
  /** An end handle dragged along the wall: the wall's new length from its other end. */
  onWallResize: (wallId: string, which: 'start' | 'end', length: number, done: boolean) => void;
  /** A wall's middle handle dragged sideways by `distance` (to the wall's left, room units). */
  onWallSlide: (wallId: string, distance: number, done: boolean) => void;
  /** A drag was abandoned (Escape, or the pointer left the plan). */
  onDragCancel: () => void;
  /** Set when a chain of walls is being drawn; cleared by the parent to finish. */
  chainStart: Point | null;
  onChainStart: (p: Point | null) => void;
}

const roundToInch = (v: number) => Math.round(v / INCH) * INCH;

/** The view that fits every corner (plus a margin to draw into) in the canvas. */
function fitView(corners: readonly Point[], size: { width: number; height: number }) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const margin = 3 * FOOT;
  const minX = (xs.length ? Math.min(...xs) : 0) - margin;
  const maxX = (xs.length ? Math.max(...xs) : 16 * FOOT) + margin;
  const minY = (ys.length ? Math.min(...ys) : 0) - margin;
  const maxY = (ys.length ? Math.max(...ys) : 12 * FOOT) + margin;
  const scale = Math.min((size.width - 2 * PAD_PX) / (maxX - minX), (size.height - 2 * PAD_PX) / (maxY - minY));
  const ox = (size.width - (maxX - minX) * scale) / 2;
  const oy = (size.height - (maxY - minY) * scale) / 2;
  return { minX, maxX, minY, maxY, scale, ox, oy, size };
}

export function PlanCanvas(props: Props) {
  const { room, tool, selection, issues, canEdit, chainStart } = props;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });
  const [hover, setHover] = useState<Point | null>(null);
  const firstOfChain = useRef<Point | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (chainStart === null) firstOfChain.current = null;
  }, [chainStart]);

  const corners = useMemo(() => room.walls.flatMap((w) => [w.start_point, w.end_point]), [room.walls]);

  // Fit the room (plus a margin to draw into) on screen. While a chain of walls is
  // being drawn the view stays still, so each tap lands where the person aimed.
  // The same goes for dragging a wall handle, whose preview changes the room's size.
  const [dragging, setDragging] = useState(false);
  const holdStill = chainStart !== null || dragging;
  const frozenView = useRef<View | null>(null);
  const fitted = useMemo(() => fitView(corners, size), [corners, size]);
  if (!holdStill || frozenView.current === null || frozenView.current.size !== size) frozenView.current = fitted;
  // Once the person zooms or scrolls, their view stays until they press "Fit".
  const [manual, setManual] = useState<View | null>(null);
  const view = manual ?? (holdStill ? frozenView.current : fitted);
  const zoom = view.scale / fitted.scale;

  /** Zooms by `factor` keeping the room point under (px, py) still. */
  const zoomAt = (factor: number, px: number, py: number) => {
    const scale = Math.min(Math.max(view.scale * factor, fitted.scale * MIN_ZOOM), fitted.scale * MAX_ZOOM);
    const rx = view.minX + (px - view.ox) / view.scale;
    const ry = view.maxY - (py - view.oy) / view.scale;
    setManual({ ...view, scale, ox: px - (rx - view.minX) * scale, oy: py - (view.maxY - ry) * scale });
  };

  /** Mouse wheel zooms; a sideways wheel (or Shift + wheel) scrolls left and right. */
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const { deltaX, deltaY, shiftKey } = e.evt;
    const sideways = Math.abs(deltaX) > Math.abs(deltaY) || (shiftKey && deltaY !== 0);
    if (sideways) {
      const amount = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      setManual({ ...view, ox: view.ox - amount });
      return;
    }
    const pos = e.target.getStage()?.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
    zoomAt(Math.exp(-deltaY * 0.0015), pos.x, pos.y);
  };

  const toScreen = (p: Point) => ({ x: view.ox + (p.x - view.minX) * view.scale, y: view.oy + (view.maxY - p.y) * view.scale });
  const toRoom = (sx: number, sy: number): Point => ({
    x: Math.round(view.minX + (sx - view.ox) / view.scale),
    y: Math.round(view.maxY - (sy - view.oy) / view.scale),
  });

  /** Where the next corner would go: 45° steps and whole inches, unless an existing corner is close. */
  const snapNext = (raw: Point): Point => {
    const tolerance = Math.round(SNAP_PX / view.scale);
    const corner = snapToPoints(raw, corners, tolerance);
    if (corner.snapped) return corner.point;
    if (!chainStart) {
      const g = snapToGrid(raw, INCH);
      return g.ok ? g.value : raw;
    }
    const angled = snapEndToAngle(chainStart, raw, ANGLE_STEP);
    if (!angled.ok) return raw;
    const length = roundToInch(distanceForDisplay(chainStart, angled.value.point).value);
    if (length === 0) return chainStart;
    const placed = pointFromLengthAndAngle(chainStart, length, angled.value.angle);
    return placed.ok ? placed.value.point : angled.value.point;
  };

  const pointer = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): Point | null => {
    const pos = e.target.getStage()?.getPointerPosition();
    return pos ? toRoom(pos.x, pos.y) : null;
  };

  /** For the door / window / passthrough tools: the wall the ghost snaps to, and where it would land. */
  const openingTarget = (p: Point) => {
    if (tool === 'select' || tool === 'draw') return null;
    const hit = nearestWall(room, p, GHOST_PX / view.scale);
    if (!hit) return null;
    return { wall: hit.wall, centre: hit.offset, offset: standardOpeningOffset(hit.wall, tool, hit.offset) };
  };

  // Handles on a single selected wall: drag a corner, or the middle to slide the wall.
  type Drag =
    | { kind: 'corner'; wallId: string; which: 'start' | 'end'; from: Point }
    | { kind: 'wall'; wallId: string; grabbed: Point };
  const drag = useRef<Drag | null>(null);
  const handleWall =
    tool === 'select' && canEdit && selection?.kind === 'wall' ? room.walls.find((w) => w.wall_id === selection.id) ?? null : null;

  /** Where a dragged corner goes: onto another corner if close, else lined up square with its walls, to the inch. */
  const snapCorner = (from: Point, raw: Point): Point => {
    const tolerance = Math.round(SNAP_PX / view.scale);
    const base = props.baseRoom.walls;
    const others = base.flatMap((w) => [w.start_point, w.end_point]).filter((c) => !samePoint(c, from));
    const onCorner = snapToPoints(raw, others, tolerance);
    if (onCorner.snapped) return onCorner.point;
    const g = snapToGrid(raw, INCH);
    let p = g.ok ? g.value : raw;
    // Keep joined walls straight: line up with the far end of each wall at this corner.
    for (const w of base) {
      const far = samePoint(w.start_point, from) ? w.end_point : samePoint(w.end_point, from) ? w.start_point : null;
      if (!far) continue;
      if (Math.abs(raw.x - far.x) <= tolerance) p = { ...p, x: far.x };
      if (Math.abs(raw.y - far.y) <= tolerance) p = { ...p, y: far.y };
    }
    return p;
  };

  /**
   * An end handle changes the wall's length along its own line, so no wall changes angle
   * (owner, 2026-11-05). Holding Option/Alt moves the corner freely instead.
   */
  const dragTo = (raw: Point, done: boolean, free = false) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'corner') {
      const wall = props.baseRoom.walls.find((w) => w.wall_id === d.wallId);
      if (!wall) return;
      if (free) {
        props.onCornerDrag(d.from, snapCorner(d.from, raw), done);
      } else {
        const fixed = d.which === 'end' ? wall.start_point : wall.end_point;
        const dx = d.from.x - fixed.x;
        const dy = d.from.y - fixed.y;
        const len = Math.hypot(dx, dy) || 1;
        const along = ((raw.x - fixed.x) * dx + (raw.y - fixed.y) * dy) / len;
        props.onWallResize(d.wallId, d.which, Math.max(INCH, roundToInch(along)), done);
      }
    } else {
      const wall = props.baseRoom.walls.find((w) => w.wall_id === d.wallId);
      if (!wall) return;
      const dx = wall.end_point.x - wall.start_point.x;
      const dy = wall.end_point.y - wall.start_point.y;
      const len = Math.hypot(dx, dy) || 1;
      const along = ((raw.x - d.grabbed.x) * -dy + (raw.y - d.grabbed.y) * dx) / len;
      props.onWallSlide(d.wallId, roundToInch(along), done);
    }
    if (done) {
      drag.current = null;
      setDragging(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        drag.current = null;
        setDragging(false);
        props.onDragCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Box selection: press on an empty part of the plan, drag, release.
  const [marquee, setMarquee] = useState<Box | null>(null);
  const dragged = useRef(false);
  const finishMarquee = () => {
    if (!marquee) return;
    if (dragged.current) {
      const ids = room.walls.filter((w) => segmentTouchesBox(toScreen(w.start_point), toScreen(w.end_point), marquee)).map((w) => w.wall_id);
      props.onSelect(wallSelection(ids));
    }
    setMarquee(null);
  };

  /** A tap on a wall: selects it, or with Shift adds it to (or removes it from) the selection. */
  const onWallTap = (wallId: string, additive: boolean) => {
    if (!additive) return props.onSelect({ kind: 'wall', id: wallId });
    const current = selectedWallIds(selection);
    props.onSelect(wallSelection(current.includes(wallId) ? current.filter((id) => id !== wallId) : [...current, wallId]));
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const p = pointer(e);
    if (!p) return;
    if (tool === 'select') {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      if (e.target === e.target.getStage()) props.onSelect(null);
      return;
    }
    if (!canEdit) return;
    if (tool === 'draw') {
      const next = snapNext(p);
      if (!chainStart) {
        firstOfChain.current = next;
        props.onChainStart(next);
        return;
      }
      if (next.x === chainStart.x && next.y === chainStart.y) return;
      props.onAddWall(chainStart, next);
      const first = firstOfChain.current;
      props.onChainStart(first && first.x === next.x && first.y === next.y ? null : next);
      return;
    }
    const target = openingTarget(p);
    if (target) props.onPickWallForOpening(target.wall.wall_id, target.centre);
  };

  // Which side of the walls is outside depends on which way the room was drawn.
  const outside = useMemo(() => outsideSign(room.walls), [room.walls]);
  const issueIds = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').map((i) => i.ref.id)), [issues]);
  const preview = tool === 'draw' && chainStart && hover ? snapNext(hover) : null;

  // Grid every foot, over whatever part of the room is on screen.
  const gridLines = [];
  const visMinX = view.minX + (0 - view.ox) / view.scale;
  const visMaxX = view.minX + (size.width - view.ox) / view.scale;
  const visMaxY = view.maxY - (0 - view.oy) / view.scale;
  const visMinY = view.maxY - (size.height - view.oy) / view.scale;
  for (let x = Math.ceil(visMinX / FOOT) * FOOT; x <= visMaxX; x += FOOT) {
    const a = toScreen({ x, y: visMinY });
    const b = toScreen({ x, y: visMaxY });
    gridLines.push(<Line key={`gx${x}`} points={[a.x, a.y, b.x, b.y]} stroke="#eef1f3" strokeWidth={1} listening={false} />);
  }
  for (let y = Math.ceil(visMinY / FOOT) * FOOT; y <= visMaxY; y += FOOT) {
    const a = toScreen({ x: visMinX, y });
    const b = toScreen({ x: visMaxX, y });
    gridLines.push(<Line key={`gy${y}`} points={[a.x, a.y, b.x, b.y]} stroke="#eef1f3" strokeWidth={1} listening={false} />);
  }

  // Door / window / passthrough tools: a ghost follows the cursor and snaps onto walls.
  const placing = tool !== 'select' && tool !== 'draw' ? tool : null;
  const ghost = placing && hover ? openingTarget(hover) : null;
  const cursor = tool === 'select' ? 'default' : placing ? (ghost ? 'copy' : hover ? 'not-allowed' : 'default') : 'crosshair';

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, cursor }} data-testid="plan">
      <Stage
        width={size.width}
        height={size.height}
        onClick={onStageClick}
        onTap={onStageClick}
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (tool !== 'select' || e.target !== e.target.getStage()) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          dragged.current = false;
          setMarquee({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        }}
        onPointerMove={(e) => {
          const at = pointer(e);
          setHover(at);
          if (drag.current && at) {
            dragTo(at, false, e.evt.altKey);
            return;
          }
          if (!marquee) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          if (Math.hypot(pos.x - marquee.x0, pos.y - marquee.y0) > DRAG_PX) dragged.current = true;
          setMarquee({ ...marquee, x1: pos.x, y1: pos.y });
        }}
        onPointerUp={(e) => {
          if (drag.current) {
            const at = pointer(e);
            if (at) dragTo(at, true, e.evt.altKey);
            dragged.current = true; // the click that follows is not a deselect
            return;
          }
          finishMarquee();
        }}
        onPointerLeave={() => {
          setHover(null);
          if (drag.current) {
            drag.current = null;
            setDragging(false);
            props.onDragCancel();
          }
          finishMarquee();
        }}
      >
        <Layer>
          {gridLines}
          {room.walls.map((wall, i) => (
            <WallShape
              key={wall.wall_id}
              wall={wall}
              index={i}
              neighbours={neighboursOf(room.walls, wall)}
              outside={outside}
              canEdit={canEdit}
              onMoveOpening={props.onMoveOpening}
              toScreen={toScreen}
              scale={view.scale}
              selected={selectedWallIds(selection).includes(wall.wall_id)}
              onWallTap={onWallTap}
              selectedOpening={selection?.kind === 'opening' ? selection.id : null}
              issueIds={issueIds}
              selectable={tool === 'select'}
              onSelect={props.onSelect}
            />
          ))}
          {handleWall && (
            <WallHandles
              wall={handleWall}
              toScreen={toScreen}
              onGrabCorner={(from, which) => {
                drag.current = { kind: 'corner', wallId: handleWall.wall_id, which, from };
                setDragging(true);
              }}
              onGrabMiddle={(at) => {
                const grabbed = toRoom(at.x, at.y);
                drag.current = { kind: 'wall', wallId: handleWall.wall_id, grabbed };
                setDragging(true);
              }}
            />
          )}
          {chainStart && (
            <Circle {...toScreen(chainStart)} radius={6} stroke={ACCENT} strokeWidth={2} listening={false} />
          )}
          {preview && chainStart && <PreviewWall start={chainStart} end={preview} toScreen={toScreen} />}
          {placing && ghost && (
            <GhostOpening kind={placing} wall={ghost.wall} offset={ghost.offset} toScreen={toScreen} scale={view.scale} outside={outside} />
          )}
          {placing && hover && !ghost && <FloatingGhost kind={placing} at={toScreen(hover)} scale={view.scale} />}
          {marquee && dragged.current && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill="rgba(23, 107, 112, 0.08)"
              stroke={ACCENT}
              strokeWidth={1}
              dash={[5, 4]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED, background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 6 }} data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <ZoomButton label="Zoom out" onClick={() => zoomAt(1 / 1.25, size.width / 2, size.height / 2)}>
          −
        </ZoomButton>
        <ZoomButton label="Zoom in" onClick={() => zoomAt(1.25, size.width / 2, size.height / 2)}>
          +
        </ZoomButton>
        <ZoomButton label="Fit the room on screen" onClick={() => setManual(null)}>
          Fit
        </ZoomButton>
      </div>
    </div>
  );
}

type View = ReturnType<typeof fitView>;

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        font: 'inherit',
        fontSize: 14,
        minWidth: 34,
        height: 34,
        borderRadius: 7,
        border: '1px solid #e2e7eb',
        background: '#fff',
        color: '#17212b',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function PreviewWall({ start, end, toScreen }: { start: Point; end: Point; toScreen: (p: Point) => Point }) {
  const a = toScreen(start);
  const b = toScreen(end);
  const d = distanceForDisplay(start, end);
  return (
    <Group listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={3} dash={[8, 6]} />
      <Circle x={b.x} y={b.y} radius={5} fill={ACCENT} />
      <Text x={b.x + 10} y={b.y - 22} text={lengthText(d)} fontSize={13} fill={ACCENT} fontStyle="bold" />
    </Group>
  );
}

/**
 * +1 when the walls run counter-clockwise (in room coordinates, Y up), -1 when clockwise,
 * worked out from the area the corners enclose (shoelace). Labels go on the outside and
 * doors swing to the inside. Display only.
 */
function outsideSign(walls: readonly Wall[]): 1 | -1 {
  let twiceArea = 0;
  for (const w of walls) twiceArea += w.start_point.x * w.end_point.y - w.end_point.x * w.start_point.y;
  // An open chain: close it from the last corner back to the first.
  const first = walls[0];
  const last = walls[walls.length - 1];
  if (first && last) twiceArea += last.end_point.x * first.start_point.y - first.start_point.x * last.end_point.y;
  return twiceArea < 0 ? -1 : 1;
}

/** For a wall, the one other wall meeting it at its start and at its end (null if none, or several). */
function neighboursOf(walls: readonly Wall[], wall: Wall): { start: Point | null; end: Point | null } {
  // Mitre a corner only when exactly two walls meet there; three or more get square ends.
  const otherEnd = (corner: Point): Point | null => {
    const found: Point[] = [];
    for (const w of walls) {
      if (w.wall_id === wall.wall_id) continue;
      if (samePoint(w.start_point, corner)) found.push(w.end_point);
      else if (samePoint(w.end_point, corner)) found.push(w.start_point);
    }
    return found.length === 1 ? (found[0] as Point) : null;
  };
  return { start: otherEnd(wall.start_point), end: otherEnd(wall.end_point) };
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
type V = { x: number; y: number };
const unit = (v: V): V => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * The two outline points of a wall at one corner (screen space, display only).
 * With a neighbour, the outline is mitred so the corner is solid; otherwise square.
 * `away` points from the corner along this wall; `n` is this wall's normal.
 */
function cornerPoints(c: V, away: V, neighbourAway: V | null, n: V, h: number): { plus: V; minus: V } {
  const square = { plus: { x: c.x + n.x * h, y: c.y + n.y * h }, minus: { x: c.x - n.x * h, y: c.y - n.y * h } };
  if (!neighbourAway) return square;
  const dot = away.x * neighbourAway.x + away.y * neighbourAway.y;
  const sinHalf = Math.sqrt(Math.max(0, (1 - dot) / 2));
  // Walls in a straight line, or folding back sharply (which would make a long spike): square ends.
  if (dot < -0.999 || sinHalf < 0.25) return square;
  const u = unit({ x: away.x + neighbourAway.x, y: away.y + neighbourAway.y });
  const d = h / sinHalf;
  const inner = { x: c.x + u.x * d, y: c.y + u.y * d };
  const outer = { x: c.x - u.x * d, y: c.y - u.y * d };
  return (inner.x - c.x) * n.x + (inner.y - c.y) * n.y > 0 ? { plus: inner, minus: outer } : { plus: outer, minus: inner };
}

interface WallShapeProps {
  wall: Wall;
  index: number;
  neighbours: { start: Point | null; end: Point | null };
  /** +1 or -1: flips which side counts as outside (see outsideSign). */
  outside: 1 | -1;
  toScreen: (p: Point) => Point;
  scale: number;
  selected: boolean;
  selectedOpening: string | null;
  issueIds: Set<string>;
  selectable: boolean;
  canEdit: boolean;
  onSelect: (selection: Selection) => void;
  onWallTap: (wallId: string, additive: boolean) => void;
  onMoveOpening: (openingId: string, offset: number) => void;
}

function WallShape(props: WallShapeProps) {
  const { wall, index, neighbours, outside, toScreen, scale, selected, selectedOpening, issueIds, selectable, canEdit, onSelect } = props;
  const a = toScreen(wall.start_point);
  const b = toScreen(wall.end_point);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normal pointing outside the room, where the length label goes. On screen (Y flipped)
  // the right of the direction of travel is outside for a counter-clockwise room.
  const nx = -uy * outside;
  const ny = ux * outside;
  const n = { x: nx, y: ny };
  const width = Math.max(5, wall.thickness.value * scale);
  const h = width / 2;
  const startC = cornerPoints(a, { x: ux, y: uy }, neighbours.start ? unit(sub(toScreen(neighbours.start), a)) : null, n, h);
  const endC = cornerPoints(b, { x: -ux, y: -uy }, neighbours.end ? unit(sub(toScreen(neighbours.end), b)) : null, n, h);
  const outline = [startC.plus, endC.plus, endC.minus, startC.minus].flatMap((p) => [p.x, p.y]);

  const fill = FILL[wall.length_provenance];
  const length = distanceForDisplay(wall.start_point, wall.end_point);
  // Less is more (owner, 2026-11-05): the colour shows how sure we are; the panel says it in words.
  const label = `${index + 1}: ${lengthText(length)}`;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const labelOffset = h + 14;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const upright = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
  const select = (sel: Selection) => (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!selectable) return;
    e.cancelBubble = true;
    onSelect(sel);
  };
  const along = (offset: number) => ({ x: a.x + ux * offset * scale, y: a.y + uy * offset * scale });
  const wallLength = length.value;

  return (
    <Group>
      {issueIds.has(wall.wall_id) && (
        <Line points={outline} closed stroke={DANGER} strokeWidth={2} dash={[6, 4]} listening={false} name="issue-outline" />
      )}
      {selected && <Line points={outline} closed stroke={ACCENT} strokeWidth={8} opacity={0.4} listening={false} />}
      <Line
        points={outline}
        closed
        fill={fill}
        stroke={fill}
        strokeWidth={0.5}
        hitStrokeWidth={Math.max(0, 22 - width)}
        onClick={(e) => {
          if (!selectable) return;
          e.cancelBubble = true;
          props.onWallTap(wall.wall_id, e.evt.shiftKey);
        }}
        onTap={(e) => {
          if (!selectable) return;
          e.cancelBubble = true;
          props.onWallTap(wall.wall_id, false);
        }}
        name={`wall-${index + 1}`}
      />
      <Text
        x={mid.x + nx * labelOffset}
        y={mid.y + ny * labelOffset}
        text={label}
        fontSize={12}
        fill={TEXT[wall.length_provenance]}
        fontStyle="bold"
        rotation={upright}
        offsetX={label.length * 3.2}
        offsetY={6}
        listening={false}
      />
      {wall.openings.map((o) => {
        const s = along(o.offset.value);
        const e = along(o.offset.value + o.width.value);
        const isSel = selectedOpening === o.opening_id;
        const bad = issueIds.has(o.opening_id);
        const stroke = bad ? DANGER : isSel ? ACCENT : '#17212b';
        const sel = select({ kind: 'opening', id: o.opening_id });
        const w = o.width.value * scale;
        const swingAngle = (Math.atan2(uy, ux) * 180) / Math.PI;
        const draggable = selectable && canEdit;
        return (
          <Group
            key={o.opening_id}
            name={`opening-${o.kind}`}
            onClick={sel}
            onTap={sel}
            draggable={draggable}
            // Only along the wall.
            dragBoundFunc={function (this: Konva.Node, pos) {
              const parent = this.getParent()?.getAbsolutePosition() ?? { x: 0, y: 0 };
              const t = (pos.x - parent.x) * ux + (pos.y - parent.y) * uy;
              return { x: parent.x + ux * t, y: parent.y + uy * t };
            }}
            onDragStart={() => onSelect({ kind: 'opening', id: o.opening_id })}
            onDragEnd={(ev) => {
              const node = ev.target;
              const moved = (node.x() * ux + node.y() * uy) / scale;
              node.position({ x: 0, y: 0 });
              const max = Math.max(0, wallLength - o.width.value);
              const next = Math.min(Math.max(0, Math.round((o.offset.value + moved) / INCH) * INCH), Math.floor(max / INCH) * INCH);
              if (next !== o.offset.value) props.onMoveOpening(o.opening_id, next);
            }}
          >
            <OpeningSymbol kind={o.kind} s={s} e={e} n={n} h={h} wallWidth={width} widthPx={w} swingAngle={swingAngle} outside={outside} stroke={stroke} thick={isSel || bad} />
          </Group>
        );
      })}
      {wall.obstacles.map((o) => {
        const s = along(o.offset.value + o.width.value / 2);
        const side = Math.max(6, o.width.value * scale);
        return (
          <Group key={o.obstacle_id} listening={false}>
            <Rect x={s.x - side / 2} y={s.y - side / 2} width={side} height={side} fill="#f6e7c9" stroke="#ad751a" strokeWidth={1} />
            <Text x={s.x - nx * (width + 12)} y={s.y - ny * (width + 12)} text={o.kind} fontSize={10} fill="#687582" offsetX={o.kind.length * 2.6} offsetY={5} />
          </Group>
        );
      })}
    </Group>
  );
}

const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y });

/** The plan symbol of a door, window or passthrough between screen points s and e on a wall. */
function OpeningSymbol(p: {
  kind: Opening['kind'];
  s: V;
  e: V;
  n: V;
  h: number;
  wallWidth: number;
  widthPx: number;
  swingAngle: number;
  outside: 1 | -1;
  stroke: string;
  thick?: boolean;
}) {
  const { kind, s, e, n, h, wallWidth, widthPx: w, swingAngle, outside, stroke } = p;
  return (
    <>
      <Line points={[s.x, s.y, e.x, e.y]} stroke="#ffffff" strokeWidth={wallWidth + 1} hitStrokeWidth={Math.max(wallWidth, 22)} />
      {kind === 'window' && (
        <>
          <Line points={[s.x + n.x * (h / 2), s.y + n.y * (h / 2), e.x + n.x * (h / 2), e.y + n.y * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
          <Line points={[s.x - n.x * (h / 2), s.y - n.y * (h / 2), e.x - n.x * (h / 2), e.y - n.y * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
        </>
      )}
      {kind === 'door' && (
        <>
          <Line points={[s.x, s.y, s.x - n.x * w, s.y - n.y * w]} stroke={stroke} strokeWidth={2} />
          <Arc x={s.x} y={s.y} innerRadius={w} outerRadius={w} angle={90} rotation={outside === 1 ? swingAngle - 90 : swingAngle} stroke={stroke} strokeWidth={1} dash={[4, 4]} />
        </>
      )}
      {kind === 'passthrough' && <Line points={[s.x, s.y, e.x, e.y]} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />}
      {[s, e].map((q, k) => (
        <Line key={k} points={[q.x + n.x * h, q.y + n.y * h, q.x - n.x * h, q.y - n.y * h]} stroke={stroke} strokeWidth={p.thick ? 3 : 1.5} />
      ))}
    </>
  );
}

/** A dimension line (screen space) from a to b, set off by `off`, with end ticks and a centred label. */
function Dimension({ a, b, off, text }: { a: V; b: V; off: V; text: string }) {
  const p = { x: a.x + off.x, y: a.y + off.y };
  const q = { x: b.x + off.x, y: b.y + off.y };
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len < 2) return null;
  const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const tick = unit(off);
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return (
    <Group listening={false}>
      <Line points={[p.x, p.y, q.x, q.y]} stroke={GHOST} strokeWidth={1} />
      {[p, q].map((t, k) => (
        <Line key={k} points={[t.x - tick.x * 5, t.y - tick.y * 5, t.x + tick.x * 5, t.y + tick.y * 5]} stroke={GHOST} strokeWidth={1} />
      ))}
      <Text
        x={mid.x + tick.x * 10}
        y={mid.y + tick.y * 10}
        text={text}
        fontSize={12}
        fontStyle="bold"
        fill={GHOST}
        rotation={upright}
        offsetX={text.length * 3.2}
        offsetY={6}
      />
    </Group>
  );
}

/**
 * The door / window / passthrough that will be placed, snapped onto a wall under the
 * cursor, with its distance to each end of the wall. Clicking places exactly this.
 */
function GhostOpening(p: { kind: Opening['kind']; wall: Wall; offset: number; toScreen: (q: Point) => Point; scale: number; outside: 1 | -1 }) {
  const { kind, wall, offset, toScreen, scale, outside } = p;
  const a = toScreen(wall.start_point);
  const b = toScreen(wall.end_point);
  const u = unit(sub(b, a));
  const n = { x: -u.y * outside, y: u.x * outside };
  const wallWidth = Math.max(5, wall.thickness.value * scale);
  const h = wallWidth / 2;
  const std = STANDARD_SIZES.openings[kind];
  const at = (d: number) => ({ x: a.x + u.x * d * scale, y: a.y + u.y * d * scale });
  const s = at(offset);
  const e = at(offset + std.width);
  const wallLength = distanceForDisplay(wall.start_point, wall.end_point);
  const after = wallLength.value - offset - std.width;
  const inside = { x: -n.x * (h + 22), y: -n.y * (h + 22) };
  return (
    <Group listening={false} opacity={0.9} name="ghost-opening">
      <OpeningSymbol kind={kind} s={s} e={e} n={n} h={h} wallWidth={wallWidth} widthPx={std.width * scale} swingAngle={(Math.atan2(u.y, u.x) * 180) / Math.PI} outside={outside} stroke={GHOST} thick />
      <Dimension a={a} b={s} off={inside} text={formatInches(offset)} />
      <Dimension a={e} b={b} off={inside} text={lengthText({ value: Math.max(0, after), exact: wallLength.exact })} />
    </Group>
  );
}

/** Off any wall: a faint ghost at the cursor saying where it needs to go. */
function FloatingGhost({ kind, at, scale }: { kind: Opening['kind']; at: V; scale: number }) {
  const w = STANDARD_SIZES.openings[kind].width * scale;
  return (
    <Group listening={false} opacity={0.55} name="ghost-floating">
      <Rect x={at.x - w / 2} y={at.y - 4} width={w} height={8} stroke={MUTED} dash={[4, 3]} strokeWidth={1} />
      <Text x={at.x - 60} y={at.y + 10} width={120} align="center" text="Move onto a wall" fontSize={11} fill={MUTED} />
    </Group>
  );
}

/** Handles on the selected wall: a dot at each end (move that corner) and a bar in the middle (slide the wall). */
function WallHandles({ wall, toScreen, onGrabCorner, onGrabMiddle }: {
  wall: Wall;
  toScreen: (p: Point) => Point;
  onGrabCorner: (corner: Point, which: 'start' | 'end') => void;
  onGrabMiddle: (at: V) => void;
}) {
  const a = toScreen(wall.start_point);
  const b = toScreen(wall.end_point);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const cursor = (c: string) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    const box = e.target.getStage()?.container();
    if (box) box.style.cursor = c;
  };
  const grab = (fn: () => void) => (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.cancelBubble = true;
    fn();
  };
  return (
    <Group name="wall-handles">
      {[
        { p: a, corner: wall.start_point, name: 'handle-start', which: 'start' as const },
        { p: b, corner: wall.end_point, name: 'handle-end', which: 'end' as const },
      ].map(({ p, corner, name, which }) => (
        <Circle
          key={name}
          name={name}
          x={p.x}
          y={p.y}
          radius={8}
          fill="#ffffff"
          stroke={ACCENT}
          strokeWidth={2.5}
          hitStrokeWidth={14}
          onPointerDown={grab(() => onGrabCorner(corner, which))}
          onMouseEnter={cursor('move')}
          onMouseLeave={cursor('')}
        />
      ))}
      <Rect
        name="handle-middle"
        x={mid.x}
        y={mid.y}
        width={26}
        height={12}
        offsetX={13}
        offsetY={6}
        cornerRadius={6}
        rotation={angle}
        fill={ACCENT}
        stroke="#ffffff"
        strokeWidth={2}
        hitStrokeWidth={12}
        onPointerDown={grab(() => onGrabMiddle(mid))}
        onMouseEnter={cursor(Math.abs(Math.cos((angle * Math.PI) / 180)) > 0.7 ? 'ns-resize' : 'ew-resize')}
        onMouseLeave={cursor('')}
      />
    </Group>
  );
}
