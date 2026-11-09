'use client';
/**
 * A small plan of a room as drawn: walls, cabinet runs and, once there is one, the placeholder
 * design's cabinets. For the design studio's AI step and the client page. Drawn only from what
 * this browser keeps; a room that can't be read says so.
 */
import { useMemo } from 'react';
import { itemFootprint, type Room } from '@/core/index';
import { direction, halfThickness, insideNormal, runEnd } from '../model/layout';
import { storedRoom } from './placeholder-store';
import { MUTED, NAVY } from './theme';

const RUN_FILL = '#e6cfa8';
const RUN_STROKE = '#a8824c';
const WALL = '#2b2f33';

export function PlanThumb({ roomKey, showDesign, version = 0 }: { roomKey: string; showDesign: boolean; version?: number }) {
  const data = useMemo(() => {
    void version;
    const r = storedRoom(roomKey);
    return { room: r.ok ? r.value : null, reason: r.ok ? null : r.reason };
  }, [roomKey, version]);
  if (!data.room) return <span style={{ fontSize: 12, color: MUTED }}>{data.reason}</span>;
  return <PlanSvg room={data.room} showCabinets={showDesign} />;
}

function PlanSvg({ room, showCabinets }: { room: Room; showCabinets: boolean }) {
  const pts = room.walls.flatMap((w) => [w.start_point, w.end_point]);
  if (pts.length === 0) return <span style={{ fontSize: 12, color: MUTED }}>No walls yet</span>;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => -p.y);
  const pad = 14 * 64;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + 2 * pad;
  const h = Math.max(...ys) - Math.min(...ys) + 2 * pad;
  const sw = Math.max(w, h) / 150;
  const quad = (wallId: string, from: number, to: number, depth: number): string => {
    const wall = room.walls.find((x) => x.wall_id === wallId);
    if (!wall) return '';
    const u = direction(wall);
    const n = insideNormal(room, wall);
    const off = wall.kind === 'room' ? halfThickness(wall) : -depth / 2;
    const at = (t: number, d: number) => `${wall.start_point.x + u.x * t + n.x * (off + d)},${-(wall.start_point.y + u.y * t + n.y * (off + d))}`;
    return [at(from, 0), at(to, 0), at(to, depth), at(from, depth)].join(' ');
  };
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Plan of the ${room.name.toLowerCase()}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {room.walls.flatMap((wall) =>
        wall.runs.map((r) => <polygon key={r.run_id} points={quad(wall.wall_id, r.offset, runEnd(r), r.depth)} fill={RUN_FILL} stroke={RUN_STROKE} strokeWidth={sw * 0.5} />),
      )}
      {showCabinets &&
        room.items
          .filter((item) => item.position.elevation === 0)
          .map((item) => {
            const f = itemFootprint(room, item);
            return f ? <polygon key={item.item_instance_id} points={f.corners.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#fff6e6" stroke={RUN_STROKE} strokeWidth={sw * 0.45} /> : null;
          })}
      {room.walls.map((wall) => (
        <line
          key={wall.wall_id}
          x1={wall.start_point.x}
          y1={-wall.start_point.y}
          x2={wall.end_point.x}
          y2={-wall.end_point.y}
          stroke={wall.kind === 'room' ? WALL : NAVY}
          strokeWidth={wall.kind === 'room' ? Math.max(wall.thickness?.value ?? 0, sw * 2) : sw * 0.7}
          strokeDasharray={wall.kind === 'room' ? undefined : `${sw * 2} ${sw * 1.2}`}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}
