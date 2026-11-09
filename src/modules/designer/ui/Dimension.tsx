'use client';
/** A measurement drawn on the plan: a line between two screen points, ticks at its ends and its length. Shared by the room drawing and the layout. */
import type Konva from 'konva';
import { Group, Line, Text } from 'react-konva';
import { NAVY } from './theme';

type V = { x: number; y: number };
const unit = (v: V): V => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

export function Dimension({ a, b, off, text, colour = NAVY, name, onClick }: { a: V; b: V; off: V; text: string; colour?: string; name?: string; onClick?: () => void }) {
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

