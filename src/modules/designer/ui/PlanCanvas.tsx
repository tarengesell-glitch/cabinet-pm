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
import { nearestWall } from '../model/editor';

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
const PICK_PX = 18;
const PAD_PX = 56;

const COLOUR: Record<Provenance, string> = { rough: '#be3d42', measured: '#ad751a', verified: '#16805d' };
const ICON: Record<Provenance, string> = { rough: '?', measured: '✎', verified: '✓' };
const ACCENT = '#176b70';
const DANGER = '#be3d42';

interface Props {
  room: Room;
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
  const frozenView = useRef<ReturnType<typeof fitView> | null>(null);
  const fitted = useMemo(() => fitView(corners, size), [corners, size]);
  if (chainStart === null || frozenView.current === null || frozenView.current.size !== size) frozenView.current = fitted;
  const view = chainStart === null ? fitted : frozenView.current;

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
    const hit = nearestWall(room, p, PICK_PX / view.scale);
    if (hit) props.onPickWallForOpening(hit.wall.wall_id, hit.offset);
  };

  // Which side of the walls is outside depends on which way the room was drawn.
  const outside = useMemo(() => outsideSign(room.walls), [room.walls]);
  const issueIds = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').map((i) => i.ref.id)), [issues]);
  const preview = tool === 'draw' && chainStart && hover ? snapNext(hover) : null;

  // Grid every foot.
  const gridLines = [];
  for (let x = Math.ceil(view.minX / FOOT) * FOOT; x <= view.maxX; x += FOOT) {
    const a = toScreen({ x, y: view.minY });
    const b = toScreen({ x, y: view.maxY });
    gridLines.push(<Line key={`gx${x}`} points={[a.x, a.y, b.x, b.y]} stroke="#eef1f3" strokeWidth={1} listening={false} />);
  }
  for (let y = Math.ceil(view.minY / FOOT) * FOOT; y <= view.maxY; y += FOOT) {
    const a = toScreen({ x: view.minX, y });
    const b = toScreen({ x: view.maxX, y });
    gridLines.push(<Line key={`gy${y}`} points={[a.x, a.y, b.x, b.y]} stroke="#eef1f3" strokeWidth={1} listening={false} />);
  }

  const cursor = tool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, cursor }} data-testid="plan">
      <Stage
        width={size.width}
        height={size.height}
        onClick={onStageClick}
        onTap={onStageClick}
        onPointerDown={(e) => {
          if (tool !== 'select' || e.target !== e.target.getStage()) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          dragged.current = false;
          setMarquee({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        }}
        onPointerMove={(e) => {
          setHover(pointer(e));
          if (!marquee) return;
          const pos = e.target.getStage()?.getPointerPosition();
          if (!pos) return;
          if (Math.hypot(pos.x - marquee.x0, pos.y - marquee.y0) > DRAG_PX) dragged.current = true;
          setMarquee({ ...marquee, x1: pos.x, y1: pos.y });
        }}
        onPointerUp={finishMarquee}
        onPointerLeave={() => {
          setHover(null);
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
          {chainStart && (
            <Circle {...toScreen(chainStart)} radius={6} stroke={ACCENT} strokeWidth={2} listening={false} />
          )}
          {preview && chainStart && <PreviewWall start={chainStart} end={preview} toScreen={toScreen} />}
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
    </div>
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
      <Text x={b.x + 10} y={b.y - 22} text={`${d.exact ? '' : '≈ '}${formatInches(d.value)}`} fontSize={13} fill={ACCENT} fontStyle="bold" />
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

/** For a wall, the other walls meeting it at its start and at its end (the first found). */
function neighboursOf(walls: readonly Wall[], wall: Wall): { start: Point | null; end: Point | null } {
  const otherEnd = (corner: Point): Point | null => {
    for (const w of walls) {
      if (w.wall_id === wall.wall_id) continue;
      if (samePoint(w.start_point, corner)) return w.end_point;
      if (samePoint(w.end_point, corner)) return w.start_point;
    }
    return null;
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

  const colour = COLOUR[wall.length_provenance];
  const length = distanceForDisplay(wall.start_point, wall.end_point);
  const label = `${ICON[wall.length_provenance]} ${index + 1}: ${length.exact ? '' : '≈ '}${formatInches(length.value)}`;
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
      {issueIds.has(wall.wall_id) && <Line points={outline} closed stroke={DANGER} strokeWidth={10} opacity={0.3} listening={false} />}
      {selected && <Line points={outline} closed stroke={ACCENT} strokeWidth={8} opacity={0.4} listening={false} />}
      <Line
        points={outline}
        closed
        fill={colour}
        stroke={colour}
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
        fill={colour}
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
            <Line points={[s.x, s.y, e.x, e.y]} stroke="#ffffff" strokeWidth={width + 1} hitStrokeWidth={Math.max(width, 22)} />
            {o.kind === 'window' && (
              <>
                <Line points={[s.x + nx * (h / 2), s.y + ny * (h / 2), e.x + nx * (h / 2), e.y + ny * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
                <Line points={[s.x - nx * (h / 2), s.y - ny * (h / 2), e.x - nx * (h / 2), e.y - ny * (h / 2)]} stroke={stroke} strokeWidth={1.5} />
              </>
            )}
            {o.kind === 'door' && (
              <>
                <Line points={[s.x, s.y, s.x - nx * w, s.y - ny * w]} stroke={stroke} strokeWidth={2} />
                <Arc x={s.x} y={s.y} innerRadius={w} outerRadius={w} angle={90} rotation={outside === 1 ? swingAngle - 90 : swingAngle} stroke={stroke} strokeWidth={1} dash={[4, 4]} />
              </>
            )}
            {o.kind === 'passthrough' && <Line points={[s.x, s.y, e.x, e.y]} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />}
            {[s, e].map((p, k) => (
              <Line key={k} points={[p.x + nx * h, p.y + ny * h, p.x - nx * h, p.y - ny * h]} stroke={stroke} strokeWidth={isSel || bad ? 3 : 1.5} />
            ))}
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
