'use client';
/**
 * The 2D plan (react-konva). Draws only from the master copy (P6).
 * Room coordinates have Y up (Core's convention); the screen has Y down, so this
 * file flips Y when converting, and nowhere else does.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Arc, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import {
  directionOf,
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
  type Result,
  type Room,
  type Swing,
  type Wall,
  wallLetter,
} from '@/core/index';
import { findOpening, nearestWall, projectOntoWall, standardOpeningOffset } from '../model/editor';
import { direction, findAppliance, findRun, halfThickness, insideNormal, runEnd } from '../model/layout';
import { LayoutShapes, applianceTarget, useLayoutTool } from './LayoutCanvas';
import { AppliancePopover, RUN_POPOVER, RunPopover } from './LayoutPanels';
import type { LayoutEdit } from './layoutEdits';
import { lengthText } from './format';
import { parseSize } from './parseSize';
import type { TypedSize } from '../model/editor';
import { STANDARD_SIZES } from '../model/standard-sizes';

/**
 * 'floating' draws a floating wall (island / peninsula), one segment at a time.
 * 'layout' marks cabinet runs and appliances (owner, 2026-11-06).
 */
export type Tool = 'select' | 'draw' | 'floating' | 'layout' | Opening['kind'];
export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'walls'; ids: readonly string[] }
  | { kind: 'opening'; id: string }
  | { kind: 'runs'; ids: readonly string[] }
  | { kind: 'appliance'; id: string }
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
/** Edge scrolling: within this many pixels of the plan's edge, scroll up to this many pixels a frame. */
const EDGE_PX = 40;
const EDGE_SPEED = 12;
/** A door or window ghost snaps to a wall within this many pixels of the cursor. */
const GHOST_PX = 40;
/** How far you can zoom out from / in to the fitted view. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const GHOST = '#176b70';
/** Dimension lines: thin and quieter than walls, as in drafting. */
const DIM = '#5b6670';
/** A floating wall (island / peninsula): a thin dashed line, no thickness, no status colour. */
const FLOATING = '#5b6670';
const MUTED = '#687582';

/**
 * Two wall states (owner, 2026-11-05): unmeasured walls are a soft pastel red, a "fail loudly"
 * signal; confirmed walls are black, as in every CAD program.
 */
const FILL: Record<Provenance, string> = { unmeasured: '#eeb8ba', confirmed: '#2b2f33' };
/** Label text: darker than the fill so it stays readable on white. */
const TEXT: Record<Provenance, string> = { unmeasured: '#b0575b', confirmed: '#2b2f33' };
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
  /** A wall typed while drawing: length (parsed) in a direction, from the current corner. Returns the new corner, or null if refused. */
  onAddWallTyped: (from: Point, length: TypedSize, angle: number) => Point | null;
  onDrawError: (reason: string) => void;
  /** A length typed on the plan for a wall (its far end moves). Returns a reason if refused. */
  onWallLengthTyped: (wallId: string, length: TypedSize) => Result<unknown>;
  /** The tap position along the wall (centre of the new opening). */
  onPickWallForOpening: (wallId: string, centre: number) => void;
  /** A door/window dragged: to `offset` along wall `wallId` (its own or another). Preview until done. */
  onOpeningMove: (openingId: string, wallId: string, offset: number, done: boolean) => void;
  /** A door/window end handle dragged: its new start offset and width. Preview until done. */
  onOpeningResize: (openingId: string, offset: number, width: number, done: boolean) => void;
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
  /** A rough-layout edit (Cabinets & appliances tool): `done` false previews it, true saves it. */
  onLayoutEdit: (edit: LayoutEdit, done: boolean) => void;
  /** A layout edit from a pop-up on the plan, saved at once; its result shows any refusal there. */
  onLayoutCommand: (edit: LayoutEdit) => Result<unknown>;
  /** An appliance picked in the tray, waiting to be placed (tap, or dropped from a drag). */
  armed: string | null;
  onArm: (kind: string | null) => void;
  /** A run's length label was clicked. */
  onRunLengthLabel: (runId: string) => void;
  /**
   * Filled in by the plan: an appliance dragged from the tray is at this screen (client) point.
   * `done` is the release. Pointer events, so it works the same with a mouse, a finger or a pen.
   */
  /** Undo and redo live on the plan, beside zoom and Fit, so they are there on every step. */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  trayDropRef: MutableRefObject<((kind: string, clientX: number, clientY: number, done: boolean) => void) | null>;
}

const roundToInch = (v: number) => Math.round(v / INCH) * INCH;
const isOpeningTool = (t: Tool): t is Opening['kind'] => t === 'door' || t === 'window' || t === 'passthrough';

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

  // Typing a new length straight onto a wall's length label; or onto the measurement beside a
  // door or window, which slides it along the wall keeping its width (owner, 2026-11-06).
  const [editingLength, setEditingLength] = useState<{ wallId: string; at: V; text: string; error: string | null; gap?: GapEdit } | null>(null);
  const commitLength = () => {
    if (!editingLength) return;
    const size = parseSize(editingLength.text);
    if (!size.ok) return setEditingLength({ ...editingLength, error: size.reason });
    const gap = editingLength.gap;
    if (gap) {
      // The measurement runs from a fixed point (a corner or another opening) to this opening.
      const offset = gap.side === 'before' ? gap.from + size.value.value : gap.from - size.value.value - gap.width;
      if (offset < 0) return setEditingLength({ ...editingLength, error: 'That would push it past the end of the wall.' });
      props.onOpeningMove(gap.openingId, editingLength.wallId, offset, true);
      setEditingLength(null);
      return;
    }
    const r = props.onWallLengthTyped(editingLength.wallId, size.value);
    if (!r.ok) return setEditingLength({ ...editingLength, error: r.reason });
    setEditingLength(null);
  };

  // Typing a length while drawing (kitchen CAD tools and AutoCAD dynamic input; see docs/ux/INDUSTRY_REVIEW.md): point the
  // way the wall should go, type its length, press Enter.
  const [typed, setTyped] = useState('');
  const typedRef = useRef({ typed, chainStart, hover, tool });
  typedRef.current = { typed, chainStart, hover, tool };
  useEffect(() => {
    if (chainStart === null) setTyped('');
  }, [chainStart]);

  // Fit the room (plus a margin to draw into) on screen. While a chain of walls is
  // being drawn the view stays still, so each tap lands where the person aimed.
  // The same goes for dragging a wall handle, whose preview changes the room's size.
  const [dragging, setDragging] = useState(false);
  const holdStill = chainStart !== null || dragging;
  const frozenView = useRef<View | null>(null);
  const fitted = useMemo(() => fitView(corners, size), [corners, size]);
  // If the plan's area changes size mid-drawing, keep the drawing where it is (only the
  // size changes); re-fitting would move every corner under the cursor.
  if (!holdStill || frozenView.current === null) frozenView.current = fitted;
  else if (frozenView.current.size !== size) frozenView.current = { ...frozenView.current, size };
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

  /**
   * Scrolling, the way CAD and design apps do it (research, 2026-11-05: AutoCAD, SketchUp,
   * Revit and Cyncly's kitchen tools zoom on the mouse wheel; Figma pans on a trackpad):
   * - a pinch on a trackpad, or Ctrl/Cmd + scroll, zooms at the cursor;
   * - a mouse wheel (coarse steps, up/down only) zooms at the cursor;
   * - a trackpad two-finger scroll (fine steps) moves the plan in any direction;
   * - a sideways mouse wheel, or Shift + wheel, moves it left and right.
   */
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    setEditingLength(null); // the box would no longer sit on its wall
    const { deltaX, deltaY, deltaMode, shiftKey, ctrlKey, metaKey } = e.evt;
    const pos = e.target.getStage()?.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
    if (ctrlKey || metaKey) {
      zoomAt(Math.exp(-deltaY * 0.01), pos.x, pos.y);
      return;
    }
    const mouseWheel = deltaMode !== 0 || (deltaX === 0 && Number.isInteger(deltaY) && Math.abs(deltaY) >= 50);
    if (mouseWheel && !shiftKey) {
      zoomAt(Math.exp(-deltaY * 0.0015), pos.x, pos.y);
      return;
    }
    const dx = shiftKey && deltaX === 0 ? deltaY : deltaX;
    const dy = shiftKey && deltaX === 0 ? 0 : deltaY;
    setManual({ ...view, ox: view.ox - dx, oy: view.oy - dy });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { typed: t, chainStart: start, hover: at, tool: tl } = typedRef.current;
      if ((tl !== 'draw' && tl !== 'floating') || !start) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      if (/^[0-9'"./ \-m]$/i.test(e.key) && !(e.key === ' ' && t === '')) {
        e.preventDefault();
        setTyped(t + e.key);
      } else if (e.key === 'Backspace' && t !== '') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTyped(t.slice(0, -1));
      } else if (e.key === 'Enter' && t.trim() !== '') {
        e.preventDefault();
        const size = parseSize(t);
        if (!size.ok) return props.onDrawError(size.reason);
        if (!at) return props.onDrawError('Point the mouse the way the wall should go, then press Enter.');
        const dir = snapEndToAngle(start, at, ANGLE_STEP);
        if (!dir.ok) return props.onDrawError(dir.reason);
        const corner = props.onAddWallTyped(start, size.value, dir.value.angle);
        if (corner) {
          setTyped('');
          const first = firstOfChain.current;
          props.onChainStart(tl === 'floating' || (first && samePoint(first, corner)) ? null : corner);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Panning by dragging: middle mouse button (AutoCAD, Revit) or Space + drag (Figma, Sweet Home 3D).
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState<V | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Edge scrolling (AutoCAD, SketchUp, Figma): while drawing walls or dragging a handle, a
  // cursor near the plan's edge scrolls the plan that way; faster the closer it is.
  const lastPointer = useRef<V | null>(null);
  const autoPanTick = useRef<() => void>(() => undefined);
  autoPanTick.current = () => {
    const p = lastPointer.current;
    if (!p) return;
    const speed = (pos: number, extent: number) =>
      pos < EDGE_PX ? -((EDGE_PX - pos) / EDGE_PX) * EDGE_SPEED : pos > extent - EDGE_PX ? ((pos - (extent - EDGE_PX)) / EDGE_PX) * EDGE_SPEED : 0;
    const sx = speed(p.x, size.width);
    const sy = speed(p.y, size.height);
    if (sx === 0 && sy === 0) return;
    const v = viewRef.current;
    const next = { ...v, ox: v.ox - sx, oy: v.oy - sy };
    viewRef.current = next;
    setManual(next);
    // The room point under the (still) cursor has changed: keep the preview or drag on it.
    const at = { x: Math.round(next.minX + (p.x - next.ox) / next.scale), y: Math.round(next.maxY - (p.y - next.oy) / next.scale) };
    setHover(at);
    if (drag.current?.moved) dragToRef.current(at, false);
  };
  const edgeScrolling = chainStart !== null || dragging;
  useEffect(() => {
    if (!edgeScrolling) return;
    let frame = 0;
    const loop = () => {
      autoPanTick.current();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [edgeScrolling]);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
      }
      // Zoom to fit: Shift+1 (Figma); the Fit button does the same.
      if (e.shiftKey && e.code === 'Digit1') setManual(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
  useEffect(() => {
    if (!panning) return;
    let last = panning;
    const move = (e: PointerEvent) => {
      const v = viewRef.current;
      setManual({ ...v, ox: v.ox + (e.clientX - last.x), oy: v.oy + (e.clientY - last.y) });
      last = { x: e.clientX, y: e.clientY };
    };
    const stop = () => setPanning(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [panning]);

  const toScreen = (p: Point) => ({ x: view.ox + (p.x - view.minX) * view.scale, y: view.oy + (view.maxY - p.y) * view.scale });
  const toRoom = (sx: number, sy: number): Point => ({
    x: Math.round(view.minX + (sx - view.ox) / view.scale),
    y: Math.round(view.maxY - (sy - view.oy) / view.scale),
  });

  /** Where the next corner would go: 45° steps and whole inches, unless an existing corner is close. */
  /** The point on an existing wall nearest `p`, to the inch along it, if within `tolerance`. */
  const onAWall = (p: Point, tolerance: number): Point | null => {
    const hit = nearestWall(room, p, tolerance);
    if (!hit) return null;
    const w = hit.wall;
    const len = distanceForDisplay(w.start_point, w.end_point).value;
    const along = Math.min(len, Math.max(0, roundToInch(hit.offset)));
    if (along === 0) return w.start_point;
    const placed = pointFromLengthAndAngle(w.start_point, along, directionOf(w.end_point.x - w.start_point.x, w.end_point.y - w.start_point.y));
    return placed.ok ? placed.value.point : null;
  };

  /**
   * Where the next corner would go, like CAD object snaps: an existing corner if close; else a
   * point on an existing wall if close (so a wall can start or end anywhere along another);
   * else 45° steps and whole inches.
   */
  const snapNext = (raw: Point): Point => {
    const tolerance = Math.round(SNAP_PX / view.scale);
    const corner = snapToPoints(raw, corners, tolerance);
    if (corner.snapped) return corner.point;
    const wallPoint = onAWall(raw, tolerance);
    if (wallPoint && !(chainStart && samePoint(wallPoint, chainStart))) return wallPoint;
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
    if (!isOpeningTool(tool)) return null;
    // Doors and windows go only on room walls, never on floating ones.
    const hit = nearestWall({ ...room, walls: room.walls.filter((w) => w.kind === 'room') }, p, GHOST_PX / view.scale);
    if (!hit) return null;
    return { wall: hit.wall, centre: hit.offset, offset: standardOpeningOffset(hit.wall, tool, hit.offset) };
  };

  // Handles on a single selected wall: drag a corner, or the middle to slide the wall.
  type Drag = (
    | { kind: 'corner'; wallId: string; which: 'start' | 'end'; from: Point }
    | { kind: 'wall'; wallId: string; grabbed: Point }
    | { kind: 'opening'; id: string; grab: number }
    | { kind: 'opening-end'; id: string; which: 'start' | 'end' }
  ) & { at: V; moved: boolean };
  /** The last wall and offset a dragged door/window snapped to, so release keeps it there. */
  const lastOpeningSpot = useRef<{ wallId: string; offset: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const openingForHandles = tool === 'select' && canEdit && selection?.kind === 'opening' ? findOpening(room, selection.id) : null;
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
    if (d.kind === 'opening') {
      // Slides along its wall, or jumps to another wall when the pointer comes near one.
      const found = findOpening(props.baseRoom, d.id);
      if (!found) return;
      const hit = nearestWall(props.baseRoom, raw, GHOST_PX / view.scale);
      if (hit) {
        const width = found.opening.width.value;
        const len = distanceForDisplay(hit.wall.start_point, hit.wall.end_point).value;
        const wanted = hit.wall.wall_id === found.wall.wall_id ? hit.offset - d.grab : hit.offset - width / 2;
        const offset = Math.min(Math.max(0, roundToInch(wanted)), Math.max(0, Math.floor((len - width) / INCH) * INCH));
        lastOpeningSpot.current = { wallId: hit.wall.wall_id, offset };
      }
      const spot = lastOpeningSpot.current;
      if (spot) props.onOpeningMove(d.id, spot.wallId, spot.offset, done);
    } else if (d.kind === 'opening-end') {
      // Stretches or shrinks it from one end, along its wall.
      const found = findOpening(props.baseRoom, d.id);
      if (!found) return;
      const len = distanceForDisplay(found.wall.start_point, found.wall.end_point).value;
      const at = Math.min(Math.max(0, roundToInch(projectOntoWall(found.wall, raw).offset)), len);
      const start = found.opening.offset.value;
      const end = start + found.opening.width.value;
      if (d.which === 'start') {
        const offset = Math.min(at, end - INCH);
        props.onOpeningResize(d.id, offset, end - offset, done);
      } else {
        props.onOpeningResize(d.id, start, Math.max(INCH, at - start), done);
      }
    } else if (d.kind === 'corner') {
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
  /** For edge scrolling, which runs between renders: always the latest dragTo. */
  const dragToRef = useRef(dragTo);
  dragToRef.current = dragTo;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        drag.current = null;
        setDragging(false);
        props.onDragCancel();
      }
      if (e.key === 'Escape') {
        layout.cancel();
        setDragging(false);
        if (props.armed) {
          props.onArm(null);
          props.onDragCancel();
        }
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
      // Like AutoCAD: dragged left to right ("window") picks walls fully inside the box;
      // right to left ("crossing") picks any wall the box touches.
      const crossing = marquee.x1 < marquee.x0;
      const inBox = (p: V) =>
        p.x >= Math.min(marquee.x0, marquee.x1) && p.x <= Math.max(marquee.x0, marquee.x1) && p.y >= Math.min(marquee.y0, marquee.y1) && p.y <= Math.max(marquee.y0, marquee.y1);
      const ids = room.walls
        .filter((w) => {
          const a = toScreen(w.start_point);
          const b = toScreen(w.end_point);
          return crossing ? segmentTouchesBox(a, b, marquee) : inBox(a) && inBox(b);
        })
        .map((w) => w.wall_id);
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
    if (!p || tool === 'layout') return;
    if (tool === 'select') {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      if (e.target === e.target.getStage()) props.onSelect(null);
      return;
    }
    if (!canEdit) return;
    if (tool === 'draw' || tool === 'floating') {
      const next = snapNext(p);
      if (!chainStart) {
        firstOfChain.current = next;
        props.onChainStart(next);
        return;
      }
      if (next.x === chainStart.x && next.y === chainStart.y) return;
      props.onAddWall(chainStart, next);
      const first = firstOfChain.current;
      // A floating wall is one line: it ends after one segment.
      props.onChainStart(tool === 'floating' || (first && first.x === next.x && first.y === next.y) ? null : next);
      return;
    }
    const target = openingTarget(p);
    if (target) props.onPickWallForOpening(target.wall.wall_id, target.centre);
  };

  // Which side of the walls is outside depends on which way the room was drawn.
  const outside = useMemo(() => outsideSign(room.walls), [room.walls]);
  const issueIds = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').map((i) => i.ref.id)), [issues]);
  const preview = (tool === 'draw' || tool === 'floating') && chainStart && hover ? snapNext(hover) : null;

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
  const placing = isOpeningTool(tool) ? tool : null;
  const ghost = placing && hover ? openingTarget(hover) : null;
  const cursor = panning
    ? 'grabbing'
    : spaceHeld
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : tool === 'layout'
          ? props.armed
            ? 'copy'
            : 'crosshair'
        : placing
          ? ghost
            ? 'copy'
            : hover
              ? 'not-allowed'
              : 'default'
          : 'crosshair';

  // The Cabinets & appliances tool: its own pointer handling (LayoutCanvas.tsx).
  const layoutSelection = selection?.kind === 'runs' || selection?.kind === 'appliance' ? selection : null;
  const layout = useLayoutTool({
    room,
    baseRoom: props.baseRoom,
    scale: view.scale,
    selection: layoutSelection,
    onSelect: props.onSelect,
    onEdit: props.onLayoutEdit,
    onCancel: props.onDragCancel,
    armed: props.armed,
    onArmedUsed: () => props.onArm(null),
    onMessage: props.onDrawError,
  });
  const layoutActive = tool === 'layout' && canEdit;
  /**
   * Where the selected appliance's pop-up goes: in front of it, on the room side, so it never
   * covers the appliance or its neighbours along the wall.
   */
  const popoverAt = (() => {
    if (tool !== 'layout' || selection?.kind !== 'appliance' || dragging) return null;
    const found = findAppliance(room, selection.id);
    if (!found) return null;
    const { wall, appliance } = found;
    const u = direction(wall);
    const n = insideNormal(room, wall);
    const t = appliance.offset + appliance.width.value / 2;
    const d = wall.kind === 'floating' ? 20 * INCH : halfThickness(wall) + 28 * INCH;
    const front = toScreen({ x: wall.start_point.x + u.x * t + n.x * d, y: wall.start_point.y + u.y * t + n.y * d });
    // The normal on screen (Y flipped): the pop-up's centre sits that way from the front.
    const sx = n.x;
    const sy = -n.y;
    const cx = front.x + sx * 118;
    const cy = front.y + sy * 70;
    return { x: cx, y: cy - 60 };
  })();
  /**
   * Where the selected run's pop-up goes (owner, 2026-11-07: next to the run, like an
   * appliance's). It tries beside the run on each side (outside the wall, in front of it, or
   * either side of an island) and to the left and right of the room, kept on the plan, and takes
   * the spot that covers the run least, then other cabinets and appliances, then the room, so
   * the plan stays usable. With
   * several runs selected, it goes by the last one picked.
   */
  const runPopoverAt = (() => {
    if (tool !== 'layout' || selection?.kind !== 'runs' || selection.ids.length === 0 || dragging) return null;
    const found = findRun(room, selection.ids[selection.ids.length - 1] as string);
    if (!found) return null;
    const { wall, run } = found;
    const u = direction(wall);
    const n = insideNormal(room, wall);
    const h = halfThickness(wall);
    const at = (t: number, d: number) => toScreen({ x: wall.start_point.x + u.x * t + n.x * d, y: wall.start_point.y + u.y * t + n.y * d });
    const { width: W, height: H } = RUN_POPOVER;
    const GAP = 10;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const boxOf = (pts: { x: number; y: number }[]): Box => ({
      x0: Math.min(...pts.map((q) => q.x)),
      y0: Math.min(...pts.map((q) => q.y)),
      x1: Math.max(...pts.map((q) => q.x)),
      y1: Math.max(...pts.map((q) => q.y)),
    });
    const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const [d0, d1] = wall.kind === 'floating' ? [-run.depth / 2, run.depth / 2] : [h, h + run.depth];
    const runBox = boxOf([at(run.offset, d0), at(runEnd(run), d0), at(runEnd(run), d1), at(run.offset, d1)]);
    const roomBox = boxOf(room.walls.flatMap((w) => [toScreen(w.start_point), toScreen(w.end_point)]));
    // Everything else standing in the room: other runs and appliances, best left uncovered too.
    const others: Box[] = room.walls.flatMap((w) => {
      const wu = direction(w);
      const wn = insideNormal(room, w);
      const wh = halfThickness(w);
      const p = (t: number, d: number) => toScreen({ x: w.start_point.x + wu.x * t + wn.x * d, y: w.start_point.y + wu.y * t + wn.y * d });
      const span = (t0: number, t1: number, depth: number) => {
        const [e0, e1] = w.kind === 'floating' ? [-depth / 2, depth / 2] : [wh, wh + depth];
        return boxOf([p(t0, e0), p(t1, e0), p(t1, e1), p(t0, e1)]);
      };
      return [
        ...w.runs.filter((x) => x.run_id !== run.run_id).map((x) => span(x.offset, runEnd(x), x.depth)),
        ...w.appliances.map((a) => span(a.offset, a.offset + a.width.value, w.runs.find((x) => x.offset <= a.offset && runEnd(x) >= a.offset)?.depth ?? run.depth)),
      ];
    });
    const mid = (run.offset + runEnd(run)) / 2;
    /** The pop-up placed with its nearest edge just past `edge`, the way `dir` (a screen direction) points. */
    const beyond = (edge: { x: number; y: number }, dir: { x: number; y: number }) => ({
      x: edge.x + dir.x * (W / 2 + GAP) - W / 2,
      y: edge.y + dir.y * (H / 2 + GAP) - H / 2,
    });
    const sn = { x: n.x, y: -n.y }; // the inside normal on screen (Y flipped)
    const back = wall.kind === 'floating' ? d0 : -h;
    const cy = (runBox.y0 + runBox.y1) / 2 - H / 2;
    const candidates = [
      beyond(at(mid, back), { x: -sn.x, y: -sn.y }),
      beyond(at(mid, d1), sn),
      { x: roomBox.x1 + GAP, y: cy },
      { x: roomBox.x0 - GAP - W, y: cy },
    ].map((c) => ({ x: clamp(c.x, 6, size.width - W - 6), y: clamp(c.y, 6, size.height - H - 6) }));
    const cost = (c: { x: number; y: number }) => {
      const b = { x0: c.x, y0: c.y, x1: c.x + W, y1: c.y + H };
      return overlap(b, runBox) * 1000 + others.reduce((sum, o) => sum + overlap(b, o), 0) * 10 + overlap(b, roomBox);
    };
    const best = candidates.reduce((x, y) => (cost(y) < cost(x) ? y : x));
    return { ...best, maxHeight: size.height - 12 };
  })();
  /** A screen point inside the plan (from a browser event) as a room point. */
  const clientToRoom = (clientX: number, clientY: number): Point | null => {
    const rect = box.current?.getBoundingClientRect();
    return rect ? toRoom(clientX - rect.left, clientY - rect.top) : null;
  };
  /** An appliance picked in the tray follows the pointer as a preview until it is placed. */
  const previewArmed = (at: Point | null, kind: string | null = props.armed) => {
    if (!kind || !at) return;
    const target = applianceTarget(props.baseRoom, at, Math.max(GHOST_PX / view.scale, 12 * INCH));
    if (target) props.onLayoutEdit({ kind: 'appliance-place', applianceKind: kind, wallId: target.wallId, centre: target.centre }, false);
    else props.onDragCancel();
  };
  props.trayDropRef.current = (kind, clientX, clientY, done) => {
    const rect = box.current?.getBoundingClientRect();
    const inside = rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const at = inside ? clientToRoom(clientX, clientY) : null;
    if (!done) {
      if (at) previewArmed(at, kind);
      else props.onDragCancel();
      return;
    }
    if (!at) return props.onDragCancel();
    const target = applianceTarget(props.baseRoom, at, Math.max(GHOST_PX / view.scale, 12 * INCH));
    if (target) props.onLayoutEdit({ kind: 'appliance-place', applianceKind: kind, wallId: target.wallId, centre: target.centre }, true);
    else {
      props.onDragCancel();
      props.onDrawError('Drop it on or near a wall or an island.');
    }
    props.onArm(null);
  };

  return (
    <div
      ref={box}
      style={{ position: 'absolute', inset: 0, cursor }}
      data-testid="plan"
      // Pan starts here, before the plan sees the press, so it works over walls and handles too.
      onPointerDownCapture={(e) => {
        if (e.button === 1 || (e.button === 0 && spaceHeld)) {
          e.preventDefault();
          e.stopPropagation();
          setPanning({ x: e.clientX, y: e.clientY });
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault(); // no browser auto-scroll on middle click
      }}
      // Double-click the middle button: zoom to fit (AutoCAD, WinnerDesign).
      onAuxClick={(e) => {
        if (e.button === 1 && e.detail === 2) setManual(null);
      }}
    >
      <Stage
        width={size.width}
        height={size.height}
        onClick={onStageClick}
        onTap={onStageClick}
        onWheel={onWheel}
        // Right-click finishes a run of walls (Mozaik); no browser menu over the plan.
        onContextMenu={(e) => {
          e.evt.preventDefault();
          if (chainStart) props.onChainStart(null);
        }}
        onPointerDown={(e) => {
          if (layoutActive) {
            const at = pointer(e);
            const pos = e.target.getStage()?.getPointerPosition();
            if (at && pos && layout.down(at, pos, e.evt.shiftKey)) setDragging(!props.armed);
            return;
          }
          if (tool !== 'select' || e.target !== e.target.getStage()) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          dragged.current = false;
          setMarquee({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        }}
        onPointerMove={(e) => {
          const at = pointer(e);
          setHover(at);
          lastPointer.current = e.target.getStage()?.getPointerPosition() ?? null;
          if (layoutActive) {
            const pos = e.target.getStage()?.getPointerPosition();
            if (at && pos && !layout.move(at, pos, e.evt.altKey) && props.armed) previewArmed(at);
            return;
          }
          if (drag.current && at) {
            const pos = e.target.getStage()?.getPointerPosition();
            if (!drag.current.moved && pos && Math.hypot(pos.x - drag.current.at.x, pos.y - drag.current.at.y) <= DRAG_PX) return;
            drag.current.moved = true;
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
          if (layoutActive) {
            const at = pointer(e);
            if (at) layout.up(at, e.evt.altKey);
            setDragging(false);
            return;
          }
          if (drag.current) {
            if (!drag.current.moved) {
              // A press without a drag: just a click (selects what was pressed).
              drag.current = null;
              setDragging(false);
              return;
            }
            const at = pointer(e);
            if (at) dragTo(at, true, e.evt.altKey);
            dragged.current = true; // the click that follows is not a deselect
            return;
          }
          finishMarquee();
        }}
        onPointerLeave={() => {
          setHover(null);
          lastPointer.current = null;
          if (layoutActive) {
            layout.cancel();
            setDragging(false);
            if (props.armed) props.onDragCancel();
          }
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
              onGrabOpening={(id, at) => {
                const found = findOpening(props.baseRoom, id);
                if (!found) return;
                const p = toRoom(at.x, at.y);
                drag.current = { kind: 'opening', id, grab: projectOntoWall(found.wall, p).offset - found.opening.offset.value, at, moved: false };
                lastOpeningSpot.current = null;
                setDragging(true);
                props.onSelect({ kind: 'opening', id });
              }}
              toScreen={toScreen}
              scale={view.scale}
              selected={selectedWallIds(selection).includes(wall.wall_id)}
              onWallTap={onWallTap}
              selectedOpening={selection?.kind === 'opening' ? selection.id : null}
              issueIds={issueIds}
              onEditGap={(gap, at, current) => {
                props.onSelect({ kind: 'opening', id: gap.openingId });
                setEditingLength({ wallId: wall.wall_id, at, text: formatInches(current), error: null, gap });
              }}
              onEditLength={(wallId, at) => {
                const w = room.walls.find((x) => x.wall_id === wallId);
                if (!w) return;
                props.onSelect({ kind: 'wall', id: wallId });
                setEditingLength({ wallId, at, text: formatInches(distanceForDisplay(w.start_point, w.end_point).value), error: null });
              }}
              selectable={tool === 'select'}
              onSelect={props.onSelect}
            />
          ))}
          <LayoutShapes
            room={room}
            toScreen={toScreen}
            scale={view.scale}
            selection={layoutSelection}
            issueIds={issueIds}
            handles={layoutActive}
            onLengthLabel={props.onRunLengthLabel}
          />
          {(() => {
            // Dragging out an island: the area dragged (dotted) and a label with the size it snaps to.
            const hint = layoutActive ? layout.islandHint() : null;
            if (!hint) return null;
            const a = toScreen(hint.from);
            const b = toScreen(hint.to);
            const w = hint.text.length * 6.6 + 16;
            return (
              <Group listening={false} name="island-hint">
                <Rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} stroke={MUTED} strokeWidth={1} dash={[4, 4]} />
                <Rect x={b.x + 12} y={b.y - 30} width={w} height={22} cornerRadius={5} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5} />
                <Text x={b.x + 20} y={b.y - 25} text={hint.text} fontSize={12} fontStyle="bold" fill={ACCENT} name="island-size" />
              </Group>
            );
          })()}
          {handleWall && (
            <WallHandles
              wall={handleWall}
              toScreen={toScreen}
              onGrabCorner={(from, which) => {
                drag.current = { kind: 'corner', wallId: handleWall.wall_id, which, from, at: toScreen(from), moved: false };
                setDragging(true);
              }}
              onGrabMiddle={(at) => {
                const grabbed = toRoom(at.x, at.y);
                drag.current = { kind: 'wall', wallId: handleWall.wall_id, grabbed, at, moved: false };
                setDragging(true);
              }}
            />
          )}
          {openingForHandles && (
            <OpeningHandles
              wall={openingForHandles.wall}
              offset={openingForHandles.opening.offset.value}
              width={openingForHandles.opening.width.value}
              toScreen={toScreen}
              onGrab={(which, at) => {
                drag.current = { kind: 'opening-end', id: openingForHandles.opening.opening_id, which, at, moved: false };
                setDragging(true);
              }}
            />
          )}
          {chainStart && (
            <Circle {...toScreen(chainStart)} radius={6} stroke={ACCENT} strokeWidth={2} listening={false} name="chain-start" />
          )}
          {preview && chainStart && <PreviewWall start={chainStart} end={preview} toScreen={toScreen} typed={typed} />}
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
              dash={marquee.x1 < marquee.x0 ? [5, 4] : []}
              listening={false}
              name={marquee.x1 < marquee.x0 ? 'marquee-crossing' : 'marquee-window'}
            />
          )}
        </Layer>
      </Stage>
      {editingLength && (
        <div style={{ position: 'absolute', left: editingLength.at.x - 55, top: editingLength.at.y - 16, width: 110, zIndex: 3 }}>
          <input
            aria-label={editingLength.gap ? `Distance to the ${editingLength.gap.kind}` : 'Wall length'}
            autoFocus
            onFocus={(e) => e.target.select()}
            value={editingLength.text}
            onChange={(e) => setEditingLength({ ...editingLength, text: e.target.value, error: null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLength();
              if (e.key === 'Escape') setEditingLength(null);
            }}
            onBlur={() => setEditingLength(null)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              padding: '4px 6px',
              borderRadius: 6,
              border: `1.5px solid ${editingLength.error ? DANGER : ACCENT}`,
              color: '#17212b',
              background: '#fff',
            }}
          />
          {editingLength.error && (
            <div role="alert" style={{ marginTop: 4, fontSize: 11, color: DANGER, background: '#fff', padding: '2px 4px', borderRadius: 4, width: 220 }}>
              {editingLength.error}
            </div>
          )}
        </div>
      )}
      {runPopoverAt && selection?.kind === 'runs' && (
        <RunPopover
          room={room}
          runIds={selection.ids}
          at={runPopoverAt}
          maxHeight={runPopoverAt.maxHeight}
          canEdit={canEdit}
          onEdit={props.onLayoutCommand}
          onClose={() => props.onSelect(null)}
        />
      )}
      {popoverAt && selection?.kind === 'appliance' && (
        <AppliancePopover room={room} placementId={selection.id} at={popoverAt} canEdit={canEdit} onEdit={(edit) => props.onLayoutEdit(edit, true)} onClose={() => props.onSelect(null)} />
      )}
      <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED, background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 6 }} data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <ZoomButton label="Undo" onClick={props.onUndo} disabled={!props.canUndo}>
          ↶
        </ZoomButton>
        <ZoomButton label="Redo" onClick={props.onRedo} disabled={!props.canRedo}>
          ↷
        </ZoomButton>
        <span style={{ width: 1, height: 22, background: '#e2e7eb', margin: '0 2px' }} aria-hidden="true" />
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

function ZoomButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        font: 'inherit',
        fontSize: 14,
        minWidth: 34,
        height: 34,
        borderRadius: 7,
        border: '1px solid #e2e7eb',
        background: '#fff',
        color: '#17212b',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function PreviewWall({ start, end, toScreen, typed }: { start: Point; end: Point; toScreen: (p: Point) => Point; typed: string }) {
  const a = toScreen(start);
  const b = toScreen(end);
  const d = distanceForDisplay(start, end);
  return (
    <Group listening={false} name="preview-wall">
      <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={3} dash={[8, 6]} />
      <Circle x={b.x} y={b.y} radius={5} fill={ACCENT} />
      {typed ? (
        <>
          <Rect x={b.x + 8} y={b.y - 28} width={Math.max(40, typed.length * 8 + 16)} height={22} cornerRadius={5} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5} />
          <Text x={b.x + 16} y={b.y - 23} text={`${typed}▏`} fontSize={13} fill={ACCENT} fontStyle="bold" name="typed-length" />
        </>
      ) : (
        <Text x={b.x + 10} y={b.y - 22} text={lengthText(d)} fontSize={13} fill={ACCENT} fontStyle="bold" />
      )}
    </Group>
  );
}

/**
 * +1 when the walls run counter-clockwise (in room coordinates, Y up), -1 when clockwise,
 * worked out from the area the corners enclose (shoelace). Labels go on the outside and
 * doors swing to the inside. Display only.
 */
function outsideSign(all: readonly Wall[]): 1 | -1 {
  const walls = all.filter((w) => w.kind !== 'floating'); // islands and peninsulas aren't the outline
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
  // Mitre a corner only when exactly two room walls meet there; three or more get square ends.
  // Floating walls are lines, never mitred, and don't count.
  if (wall.kind === 'floating') return { start: null, end: null };
  const otherEnd = (corner: Point): Point | null => {
    const found: Point[] = [];
    for (const w of walls) {
      if (w.wall_id === wall.wall_id || w.kind === 'floating') continue;
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
  /** The wall's length label was clicked: edit it there (screen point of the label). */
  onEditLength: (wallId: string, at: V) => void;
  /** The measurement beside a door or window was clicked: type a new distance to slide it. */
  onEditGap: (gap: GapEdit, at: V, current: number) => void;
  /** Pressing on a door/window: may become a drag (screen point where it was pressed). */
  onGrabOpening: (openingId: string, at: V) => void;
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
  // A floating wall is a line with no thickness (owner, closet-builder A-21).
  const floating = wall.kind === 'floating';
  const width = floating ? 0 : Math.max(5, (wall.thickness?.value ?? 0) * scale);
  const h = width / 2;
  const startC = cornerPoints(a, { x: ux, y: uy }, neighbours.start ? unit(sub(toScreen(neighbours.start), a)) : null, n, h);
  const endC = cornerPoints(b, { x: -ux, y: -uy }, neighbours.end ? unit(sub(toScreen(neighbours.end), b)) : null, n, h);
  const outline = [startC.plus, endC.plus, endC.minus, startC.minus].flatMap((p) => [p.x, p.y]);
  const line = [a.x, a.y, b.x, b.y];
  // Labels: the wall's state colour; a floating wall has no state, so it stays neutral.
  const ink = floating ? FLOATING : TEXT[wall.length_provenance];

  const fill = FILL[wall.length_provenance];
  const length = distanceForDisplay(wall.start_point, wall.end_point);
  // Less is more (owner, 2026-11-05): the colour shows how sure we are; the panel says it in words.
  // The length outside the wall (where dimensions go); the wall's letter in a circle inside.
  const label = lengthText(length);
  const letter = wallLetter(index);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // A wall with doors or windows gets a chain of measurements next to it (corner → opening edge,
  // opening width, … → corner), as cabinet planning guides and NKBA plans show; the overall
  // length then sits on a second line further out. Walls without openings show only the overall.
  const breaks = [...new Set([0, ...wall.openings.flatMap((o) => [o.offset.value, o.offset.value + o.width.value]), length.value])]
    .filter((v) => v >= 0 && v <= length.value)
    .sort((p, q) => p - q);
  const chain = wall.openings.length > 0 ? breaks.slice(1).map((end, i) => ({ start: breaks[i] as number, end })) : [];
  const labelOffset = chain.length > 0 ? h + 40 : h + 14;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const upright = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
  const select = (sel: Selection) => (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!selectable) return;
    e.cancelBubble = true;
    onSelect(sel);
  };
  const along = (offset: number) => ({ x: a.x + ux * offset * scale, y: a.y + uy * offset * scale });

  return (
    <Group>
      {issueIds.has(wall.wall_id) && (
        <Line points={floating ? line : outline} closed={!floating} stroke={DANGER} strokeWidth={floating ? 6 : 2} opacity={floating ? 0.5 : 1} dash={[6, 4]} listening={false} name="issue-outline" />
      )}
      {selected && <Line points={floating ? line : outline} closed={!floating} stroke={ACCENT} strokeWidth={8} opacity={0.4} listening={false} />}
      <Line
        points={floating ? line : outline}
        closed={!floating}
        {...(floating
          ? { stroke: FLOATING, strokeWidth: 2, dash: [8, 5], hitStrokeWidth: 18 }
          : { fill, stroke: fill, strokeWidth: 0.5, hitStrokeWidth: Math.max(0, 22 - width) })}
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
        fill={ink}
        fontStyle="bold"
        rotation={upright}
        offsetX={label.length * 3.2}
        offsetY={6}
        name={`wall-length-${index + 1}`}
        listening={selectable && canEdit}
        hitStrokeWidth={0}
        onClick={(e) => {
          // Click the length to type a new one, as in Revit and Chief Architect.
          e.cancelBubble = true;
          props.onEditLength(wall.wall_id, { x: mid.x + nx * labelOffset, y: mid.y + ny * labelOffset });
        }}
        onMouseEnter={(e) => {
          const box = e.target.getStage()?.container();
          if (box) box.style.cursor = 'text';
        }}
        onMouseLeave={(e) => {
          const box = e.target.getStage()?.container();
          if (box) box.style.cursor = '';
        }}
      />
      {chain.map(({ start, end }, k) => {
        // A measurement that ends at a door or window (or starts where one ends) can be clicked
        // to type a new distance: the opening slides over, keeping its width.
        const before = wall.openings.find((o) => o.offset.value === end);
        const after = before ? undefined : wall.openings.find((o) => o.offset.value + o.width.value === start);
        const o = before ?? after;
        const gap: GapEdit | null = o
          ? { openingId: o.opening_id, kind: o.kind, side: before ? 'before' : 'after', from: before ? start : end, width: o.width.value }
          : null;
        const p0 = along(start);
        const p1 = along(end);
        const at = { x: (p0.x + p1.x) / 2 + nx * (h + 20), y: (p0.y + p1.y) / 2 + ny * (h + 20) };
        return (
          <Dimension
            key={k}
            name={`wall-${index + 1}-segment-${k + 1}`}
            a={p0}
            b={p1}
            off={{ x: nx * (h + 10), y: ny * (h + 10) }}
            text={lengthText({ value: end - start, exact: length.exact || end !== length.value })}
            colour={gap && selectable && canEdit ? ACCENT : DIM}
            {...(gap && selectable && canEdit ? { onClick: () => props.onEditGap(gap, at, end - start) } : {})}
          />
        );
      })}
      <Group x={mid.x - nx * (h + 16)} y={mid.y - ny * (h + 16)} listening={false} name={`wall-tag-${letter}`}>
        <Circle radius={10} fill="#ffffff" stroke={ink} strokeWidth={1.5} />
        <Text text={letter} fontSize={11} fontStyle="bold" fill={ink} width={20} height={20} offsetX={10} offsetY={10} align="center" verticalAlign="middle" />
      </Group>
      {wall.openings.map((o) => {
        const s = along(o.offset.value);
        const e = along(o.offset.value + o.width.value);
        const isSel = selectedOpening === o.opening_id;
        const bad = issueIds.has(o.opening_id);
        const stroke = bad ? DANGER : isSel ? ACCENT : '#17212b';
        const sel = select({ kind: 'opening', id: o.opening_id });
        const w = o.width.value * scale;
        const draggable = selectable && canEdit;
        return (
          <Group
            key={o.opening_id}
            name={`opening-${o.kind}`}
            onClick={sel}
            onTap={sel}
            onPointerDown={(ev) => {
              if (!draggable) return;
              ev.cancelBubble = true;
              const pos = ev.target.getStage()?.getPointerPosition();
              if (pos) props.onGrabOpening(o.opening_id, pos);
            }}
          >
            <OpeningSymbol kind={o.kind} s={s} e={e} n={n} h={h} wallWidth={width} widthPx={w} swing={o.swing} stroke={stroke} thick={isSel || bad} />
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
  /** For a door: its hinge end and swing side (relative to the wall); null otherwise. */
  swing: Swing | null;
  stroke: string;
  thick?: boolean;
}) {
  const { kind, s, e, n, h, wallWidth, widthPx: w, stroke } = p;
  const door = kind === 'door' && p.swing ? doorGeometry(s, e, w, p.swing) : null;
  return (
    <>
      <Line points={[s.x, s.y, e.x, e.y]} stroke="#ffffff" strokeWidth={wallWidth + 1} hitStrokeWidth={Math.max(wallWidth, 22)} />
      {kind === 'window' && (
        <>
          <Line points={[s.x + n.x * (h / 2), s.y + n.y * (h / 2), e.x + n.x * (h / 2), e.y + n.y * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
          <Line points={[s.x - n.x * (h / 2), s.y - n.y * (h / 2), e.x - n.x * (h / 2), e.y - n.y * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
        </>
      )}
      {door && (
        <>
          <Line points={[door.hinge.x, door.hinge.y, door.leafEnd.x, door.leafEnd.y]} stroke={stroke} strokeWidth={2} name="door-leaf" />
          <Arc x={door.hinge.x} y={door.hinge.y} innerRadius={w} outerRadius={w} angle={90} rotation={door.arcStart} stroke={stroke} strokeWidth={1} dash={[4, 4]} />
        </>
      )}
      {kind === 'passthrough' && <Line points={[s.x, s.y, e.x, e.y]} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />}
      {[s, e].map((q, k) => (
        <Line key={k} points={[q.x + n.x * h, q.y + n.y * h, q.x - n.x * h, q.y - n.y * h]} stroke={stroke} strokeWidth={p.thick ? 3 : 1.5} />
      ))}
    </>
  );
}

/**
 * Where a door's leaf and swing arc go on screen. The leaf stands at 90° to the wall from the
 * hinge jamb, on the side it opens to; the arc sweeps from the leaf back to the other jamb.
 * Screen Y points down, so "left of the wall's direction" in the room is (u.y, -u.x) on screen.
 */
function doorGeometry(s: V, e: V, w: number, swing: Swing) {
  const u = unit(sub(e, s));
  const side = swing.opens === 'left' ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
  const hinge = swing.hinge === 'start' ? s : e;
  const other = swing.hinge === 'start' ? e : s;
  const leafEnd = { x: hinge.x + side.x * w, y: hinge.y + side.y * w };
  const deg = (v: V) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
  const leafAngle = deg(side);
  const jambAngle = deg(sub(other, hinge));
  // Konva draws arcs clockwise from `rotation`: start from whichever edge leads clockwise.
  const clockwiseGap = (((jambAngle - leafAngle) % 360) + 360) % 360;
  return { hinge, leafEnd, arcStart: Math.abs(clockwiseGap - 90) < 1 ? leafAngle : jambAngle };
}

/** A dimension line (screen space) from a to b, set off by `off`, with end ticks and a centred label. */
/** A measurement beside an opening, being retyped: what it measures from, and which opening moves. */
interface GapEdit {
  openingId: string;
  kind: Opening['kind'];
  /** 'before': from a fixed point at its start to the opening; 'after': from the opening to a fixed point. */
  side: 'before' | 'after';
  /** The fixed point, along the wall. */
  from: number;
  width: number;
}

function Dimension({ a, b, off, text, colour = GHOST, name, onClick }: { a: V; b: V; off: V; text: string; colour?: string; name?: string; onClick?: () => void }) {
  const p = { x: a.x + off.x, y: a.y + off.y };
  const q = { x: b.x + off.x, y: b.y + off.y };
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len < 2) return null;
  const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const tick = unit(off);
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const click = onClick
    ? {
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          onClick();
        },
        onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
          e.cancelBubble = true;
          onClick();
        },
        onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
          const box = e.target.getStage()?.container();
          if (box) box.style.cursor = 'text';
        },
        onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
          const box = e.target.getStage()?.container();
          if (box) box.style.cursor = '';
        },
      }
    : {};
  return (
    <Group listening={!!onClick} {...(name ? { name } : {})} {...click}>
      {onClick && <Line points={[p.x, p.y, q.x, q.y]} stroke="transparent" strokeWidth={1} hitStrokeWidth={22} />}
      <Line points={[p.x, p.y, q.x, q.y]} stroke={colour} strokeWidth={1} />
      {[p, q].map((t, k) => (
        <Line key={k} points={[t.x - tick.x * 5, t.y - tick.y * 5, t.x + tick.x * 5, t.y + tick.y * 5]} stroke={colour} strokeWidth={1} />
      ))}
      <Text
        x={mid.x + tick.x * 10}
        y={mid.y + tick.y * 10}
        text={text}
        fontSize={11}
        fontStyle="bold"
        fill={colour}
        rotation={upright}
        offsetX={text.length * 3}
        offsetY={6}
        {...(name ? { name: `${name}-text` } : {})}
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
  const wallWidth = Math.max(5, (wall.thickness?.value ?? 0) * scale);
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
      <OpeningSymbol kind={kind} s={s} e={e} n={n} h={h} wallWidth={wallWidth} widthPx={std.width * scale} swing={kind === 'door' ? ghostSwing(outside) : null} stroke={GHOST} thick />
      <Dimension a={a} b={s} off={inside} text={formatInches(offset)} />
      <Dimension a={e} b={b} off={inside} text={lengthText({ value: Math.max(0, after), exact: wallLength.exact })} />
    </Group>
  );
}

/** How a newly dropped door will hang (data/standard-sizes.json), for the ghost. outside=1: room drawn counter-clockwise, so inside is each wall's left. */
function ghostSwing(outside: 1 | -1): Swing {
  const inside = outside === 1 ? 'left' : 'right';
  const std = STANDARD_SIZES.door_swing;
  return { hinge: std.hinge, opens: std.opens === 'inside' ? inside : inside === 'left' ? 'right' : 'left' };
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

/** Handles on the selected door/window: a dot at each end to make it wider or narrower. */
function OpeningHandles({ wall, offset, width, toScreen, onGrab }: {
  wall: Wall;
  offset: number;
  width: number;
  toScreen: (p: Point) => Point;
  onGrab: (which: 'start' | 'end', at: V) => void;
}) {
  const a = toScreen(wall.start_point);
  const b = toScreen(wall.end_point);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const wallLen = distanceForDisplay(wall.start_point, wall.end_point).value || 1;
  const at = (d: number) => ({ x: a.x + ((b.x - a.x) / len) * (d / wallLen) * len, y: a.y + ((b.y - a.y) / len) * (d / wallLen) * len });
  return (
    <Group name="opening-handles">
      {(['start', 'end'] as const).map((which) => {
        const p = at(which === 'start' ? offset : offset + width);
        return (
          <Circle
            key={which}
            name={`opening-handle-${which}`}
            x={p.x}
            y={p.y}
            radius={7}
            fill="#ffffff"
            stroke={ACCENT}
            strokeWidth={2.5}
            hitStrokeWidth={14}
            onPointerDown={(e) => {
              e.cancelBubble = true;
              onGrab(which, p);
            }}
            onMouseEnter={(e) => {
              const box = e.target.getStage()?.container();
              if (box) box.style.cursor = 'ew-resize';
            }}
            onMouseLeave={(e) => {
              const box = e.target.getStage()?.container();
              if (box) box.style.cursor = '';
            }}
          />
        );
      })}
    </Group>
  );
}
