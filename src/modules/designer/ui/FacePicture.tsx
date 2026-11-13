'use client';
/**
 * A cabinet's face drawn flat, from the same layout the 3D view uses (`model/fronts.ts`), showing
 * what is inside too (owner, 2026-11-13): a shelf is a dotted line, a roll-out a dotted U, a fixed
 * divider a solid line; doors and drawers are outlined with their handles, and a drawer's insert
 * shows as its letter. Used for the library choices' icons and the cabinet editor's front editor.
 */
import type { ReactNode } from 'react';
import type { FrontPiece } from '../model/fronts';

const INK = '#57524b';
const SOFT = '#8f8a82';

export function FacePicture(props: {
  pieces: readonly FrontPiece[];
  /** The face's edges (inches, y up). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** The largest the picture may be, in pixels. */
  maxW: number;
  maxH: number;
  /** Insert letters by drawer number from the top. */
  marks?: Readonly<Record<string, string>>;
  /** Drawn over the face (in its inch coordinates, through `X` and `Y`): the front editor's clickable parts. */
  overlay?: (X: (x: number) => number, Y: (y: number) => number, k: number) => ReactNode;
  label?: string;
}) {
  const { x0, x1, y0, y1 } = props;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const k = Math.min((props.maxH - 4) / h, (props.maxW - 4) / w);
  const X = (x: number) => 2 + (x - x0) * k;
  const Y = (y: number) => 2 + (y1 - y) * k;
  const lw = Math.max(1, k * 0.15);
  let drawerNo = 0;
  return (
    <svg width={w * k + 4} height={h * k + 4} {...(props.label ? { role: props.overlay ? 'group' : 'img', 'aria-label': props.label } : { 'aria-hidden': true })} style={{ display: 'block' }}>
      <rect x={X(x0)} y={Y(y1)} width={w * k} height={h * k} fill="#f3f1ec" stroke={INK} strokeWidth={lw} />
      {props.pieces.map((p, i) => {
        if (p.kind === 'door' || p.kind === 'drawer') {
          const mark = p.kind === 'drawer' && !p.pullout ? props.marks?.[String(++drawerNo)] : undefined;
          const hx = p.kind === 'door' ? (p.hinge === 'left' ? p.x1 - 1.6 : p.x0 + 1.6) : (p.x0 + p.x1) / 2;
          return (
            <g key={i}>
              <rect x={X(p.x0) + 1} y={Y(p.y1) + 1} width={Math.max(1, (p.x1 - p.x0) * k - 2)} height={Math.max(1, (p.y1 - p.y0) * k - 2)} fill="rgba(251,250,247,0.55)" stroke={SOFT} strokeWidth={lw} />
              {p.kind === 'door' || p.pullout ? (
                p.kind === 'door' ? (
                  <line x1={X(hx)} x2={X(hx)} y1={Y(p.handleY + 2.5)} y2={Y(p.handleY - 2.5)} stroke={INK} strokeWidth={lw * 2} />
                ) : (
                  <line x1={X(hx - 2.5)} x2={X(hx + 2.5)} y1={Y(p.handleY)} y2={Y(p.handleY)} stroke={INK} strokeWidth={lw * 2} />
                )
              ) : (
                <line x1={X(hx - 2.5)} x2={X(hx + 2.5)} y1={Y(p.handleY)} y2={Y(p.handleY)} stroke={INK} strokeWidth={lw * 2} />
              )}
              {mark && (
                <text x={X(p.x0) + 4} y={Y(p.y1) + Math.min(12, (p.y1 - p.y0) * k - 2)} fontSize={Math.max(8, Math.min(11, (p.y1 - p.y0) * k * 0.5))} fontWeight={700} fill="#2f7de1">
                  {mark}
                </text>
              )}
            </g>
          );
        }
        if (p.kind === 'shelf') return <line key={i} x1={X(p.x0) + 3} x2={X(p.x1) - 3} y1={Y(p.y)} y2={Y(p.y)} stroke={INK} strokeWidth={lw * 1.4} strokeDasharray={`${lw * 0.1} ${lw * 3}`} strokeLinecap="round" />;
        if (p.kind === 'rollout') {
          // A dotted U: the tray's sides and bottom.
          const a = X(p.x0) + 4;
          const b = X(p.x1) - 4;
          const top = Y(p.y + 3);
          const bot = Y(p.y);
          return <path key={i} d={`M${a} ${top} L${a} ${bot} L${b} ${bot} L${b} ${top}`} fill="none" stroke={INK} strokeWidth={lw * 1.4} strokeDasharray={`${lw * 0.1} ${lw * 3}`} strokeLinecap="round" strokeLinejoin="round" />;
        }
        if (p.kind === 'divider') {
          const vertical = p.y1 - p.y0 > p.x1 - p.x0;
          return vertical ? (
            <line key={i} x1={X((p.x0 + p.x1) / 2)} x2={X((p.x0 + p.x1) / 2)} y1={Y(p.y1)} y2={Y(p.y0)} stroke={INK} strokeWidth={lw * 2} />
          ) : (
            <line key={i} x1={X(p.x0)} x2={X(p.x1)} y1={Y((p.y0 + p.y1) / 2)} y2={Y((p.y0 + p.y1) / 2)} stroke={INK} strokeWidth={lw * 2} />
          );
        }
        return null;
      })}
      {props.overlay?.(X, Y, k)}
    </svg>
  );
}
