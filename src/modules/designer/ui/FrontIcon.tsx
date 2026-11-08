/**
 * A small front view of a cabinet, from what the catalog says its front is (doors, drawers,
 * a pull-out, open shelves…), for the customize panel: the type picker, the run strips and the
 * selected cabinet. Drawn to the cabinet's proportions; a picture, not a measurement.
 */
import type { CatalogItem } from '@/modules/catalog/contract';
import { GOLD, INK, MUTED, NAVY } from './theme';

const CARCASS = '#ffffff';
const FRONT = '#f4f1ea';

export function FrontIcon({ item, appliance, width, height, size = 56, selected = false, finish }: {
  item: CatalogItem | null;
  /** An appliance or hood in place of a cabinet. */
  appliance?: string | null;
  /** In any unit; only the proportion matters. */
  width: number;
  height: number;
  size?: number;
  selected?: boolean;
  /** The door colour, when known. */
  finish?: string;
}) {
  const ratio = Math.max(0.12, Math.min(3, width / Math.max(1, height)));
  const W = ratio >= 1 ? size : size * ratio;
  const H = ratio >= 1 ? size / ratio : size;
  const pad = 2;
  const x0 = pad;
  const y0 = pad;
  const w = W;
  const h = H;
  const stroke = selected ? NAVY : INK;
  const fill = finish ?? FRONT;
  const parts: React.ReactNode[] = [];
  const rect = (x: number, y: number, rw: number, rh: number, key: string, f = fill) =>
    parts.push(<rect key={key} x={x} y={y} width={Math.max(0, rw)} height={Math.max(0, rh)} rx={0.8} fill={f} stroke={stroke} strokeWidth={0.8} />);
  const pull = (x: number, y: number, len: number, vertical: boolean, key: string) =>
    parts.push(<line key={key} x1={x} y1={y} x2={vertical ? x : x + len} y2={vertical ? y + len : y} stroke={stroke} strokeWidth={1.1} strokeLinecap="round" />);
  const g = 1.2;
  const doors = (y: number, dh: number, key: string) => {
    const n = width > 24 * 64 || (item?.front[0]?.count ?? 1) >= 2 ? 2 : 1;
    const dw = (w - g * (n + 1)) / n;
    for (let k = 0; k < n; k++) {
      const dx = x0 + g + k * (dw + g);
      rect(dx, y, dw, dh, `${key}d${k}`);
      const nearHinge = n === 2 ? (k === 0 ? dx + dw - 3 : dx + 3) : dx + dw - 3;
      pull(nearHinge, y + 3, Math.min(8, dh * 0.3), true, `${key}p${k}`);
    }
  };
  const drawers = (y: number, dh: number, n: number, key: string) => {
    const each = (dh - g * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const dy = y + k * (each + g);
      rect(x0 + g, dy, w - 2 * g, each, `${key}r${k}`);
      pull(x0 + w / 2 - Math.min(6, w / 4), dy + each / 2, Math.min(12, w / 2), false, `${key}q${k}`);
    }
  };

  parts.push(<rect key="box" x={x0} y={y0} width={w} height={h} rx={1.2} fill={CARCASS} stroke={stroke} strokeWidth={selected ? 1.6 : 1} />);
  const inY = y0 + g;
  const inH = h - 2 * g;
  const front = item?.front[0];
  if (appliance) {
    parts.push(<rect key="app" x={x0 + g} y={inY} width={w - 2 * g} height={inH} rx={0.8} fill="#d6d9dd" stroke={stroke} strokeWidth={0.8} />);
    parts.push(
      <text key="t" x={x0 + w / 2} y={y0 + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(9, w / 4)} fill={MUTED} fontFamily="Geist, sans-serif">
        {appliance === 'hood' ? 'HOOD' : appliance.slice(0, 5).toUpperCase()}
      </text>,
    );
  } else if (!item || item.type === 'filler' || item.type === 'panel' || front?.kind === 'fixed_panel') {
    rect(x0 + g, inY, w - 2 * g, inH, 'panel');
  } else if (item.type === 'appliance_opening') {
    parts.push(<rect key="dw" x={x0 + g} y={inY} width={w - 2 * g} height={inH} rx={0.8} fill="#d6d9dd" stroke={stroke} strokeWidth={0.8} />);
    pull(x0 + w / 2 - 6, inY + 3, 12, false, 'dwp');
  } else if (front?.kind === 'open') {
    for (let k = 1; k < 4; k++) parts.push(<line key={`s${k}`} x1={x0 + g} y1={inY + (inH * k) / 4} x2={x0 + w - g} y2={inY + (inH * k) / 4} stroke={stroke} strokeWidth={0.8} />);
  } else if (front?.kind === 'drawers' && (front.count ?? 1) >= 3) {
    drawers(inY, inH, front.count ?? 3, 'b');
  } else if (front?.kind === 'drawers' && front.count === 2) {
    const top = Math.min(inH * 0.3, 14);
    drawers(inY, top, 2, 't');
    doors(inY + top + g, inH - top - g, 'l');
  } else if ((front?.kind === 'drawers' && front.count === 1 && item.code !== 'garbage_pullout') || item.code === 'sink_base') {
    const top = Math.min(inH * 0.2, 9);
    drawers(inY, top, 1, 't');
    doors(inY + top + g, inH - top - g, 'l');
  } else if (item.code === 'garbage_pullout' || front?.kind === 'pullout') {
    drawers(inY, inH, 1, 'g');
  } else {
    doors(inY, inH, 'd');
  }
  return (
    <svg width={W + 2 * pad} height={H + 2 * pad} viewBox={`0 0 ${W + 2 * pad} ${H + 2 * pad}`} aria-hidden="true" style={{ display: 'block', filter: selected ? `drop-shadow(0 0 3px ${GOLD})` : undefined }}>
      {parts}
    </svg>
  );
}
