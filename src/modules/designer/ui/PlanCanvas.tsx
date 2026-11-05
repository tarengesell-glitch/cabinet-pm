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
export type Selection = { kind: 'wall'; id: string } | { kind: 'opening'; id: string } | null;

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
  onPickWallForOpening: (wallId: string, offset: number) => void;
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

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const p = pointer(e);
    if (!p) return;
    if (tool === 'select') {
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
    if (hit) props.onPickWallForOpening(hit.wall.wall_id, roundToInch(hit.offset));
  };

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
        onMouseMove={(e) => setHover(pointer(e))}
        onMouseLeave={() => setHover(null)}
      >
        <Layer>
          {gridLines}
          {room.walls.map((wall, i) => (
            <WallShape
              key={wall.wall_id}
              wall={wall}
              index={i}
              toScreen={toScreen}
              scale={view.scale}
              selected={selection?.kind === 'wall' && selection.id === wall.wall_id}
              selectedOpening={selection?.kind === 'opening' ? selection.id : null}
              issueIds={issueIds}
              selectable={tool === 'select'}
              onSelect={props.onSelect}
            />
          ))}
          {corners.map((p, i) => {
            const s = toScreen(p);
            return <Circle key={`c${i}`} x={s.x} y={s.y} radius={3} fill="#17212b" listening={false} />;
          })}
          {chainStart && (
            <Circle {...toScreen(chainStart)} radius={6} stroke={ACCENT} strokeWidth={2} listening={false} />
          )}
          {preview && chainStart && <PreviewWall start={chainStart} end={preview} toScreen={toScreen} />}
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

interface WallShapeProps {
  wall: Wall;
  index: number;
  toScreen: (p: Point) => Point;
  scale: number;
  selected: boolean;
  selectedOpening: string | null;
  issueIds: Set<string>;
  selectable: boolean;
  onSelect: (selection: Selection) => void;
}

function WallShape({ wall, index, toScreen, scale, selected, selectedOpening, issueIds, selectable, onSelect }: WallShapeProps) {
  const a = toScreen(wall.start_point);
  const b = toScreen(wall.end_point);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normal pointing to the right of the direction of travel on screen: outside of a
  // room drawn counter-clockwise (Y flipped), where the length label goes.
  const nx = -uy;
  const ny = ux;
  const width = Math.max(5, wall.thickness.value * scale);
  const colour = COLOUR[wall.length_provenance];
  const length = distanceForDisplay(wall.start_point, wall.end_point);
  const label = `${ICON[wall.length_provenance]} ${index + 1}: ${length.exact ? '' : '≈ '}${formatInches(length.value)}`;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const labelOffset = width / 2 + 14;
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
        <Line points={[a.x, a.y, b.x, b.y]} stroke={DANGER} strokeWidth={width + 10} opacity={0.25} listening={false} />
      )}
      {selected && <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={width + 8} opacity={0.35} listening={false} />}
      <Line
        points={[a.x, a.y, b.x, b.y]}
        stroke={colour}
        strokeWidth={width}
        hitStrokeWidth={Math.max(width, 22)}
        onClick={select({ kind: 'wall', id: wall.wall_id })}
        onTap={select({ kind: 'wall', id: wall.wall_id })}
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
        return (
          <Group key={o.opening_id} onClick={sel} onTap={sel}>
            <Line points={[s.x, s.y, e.x, e.y]} stroke="#ffffff" strokeWidth={width + 1} hitStrokeWidth={Math.max(width, 22)} />
            {o.kind === 'window' && (
              <>
                <Line points={[s.x + nx * (width / 4), s.y + ny * (width / 4), e.x + nx * (width / 4), e.y + ny * (width / 4)]} stroke={stroke} strokeWidth={1.5} />
                <Line points={[s.x - nx * (width / 4), s.y - ny * (width / 4), e.x - nx * (width / 4), e.y - ny * (width / 4)]} stroke={stroke} strokeWidth={1.5} />
              </>
            )}
            {o.kind === 'door' && (
              <>
                <Line points={[s.x, s.y, s.x - nx * w, s.y - ny * w]} stroke={stroke} strokeWidth={2} />
                <Arc x={s.x} y={s.y} innerRadius={w} outerRadius={w} angle={90} rotation={swingAngle - 90} stroke={stroke} strokeWidth={1} dash={[4, 4]} />
              </>
            )}
            {o.kind === 'passthrough' && <Line points={[s.x, s.y, e.x, e.y]} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />}
            {[s, e].map((p, k) => (
              <Line key={k} points={[p.x + nx * (width / 2), p.y + ny * (width / 2), p.x - nx * (width / 2), p.y - ny * (width / 2)]} stroke={stroke} strokeWidth={isSel || bad ? 3 : 1.5} />
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
