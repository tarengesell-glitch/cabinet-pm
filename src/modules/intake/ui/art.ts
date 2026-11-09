/**
 * PLACEHOLDER pictures for the intake (owner, 2026-11-07: "using placeholder images"). Simple
 * drawings that follow the client's picks, until real photos per option exist (BUILD_PLAN 7b).
 * Every picture on screen is marked "Placeholder". Built only from our own data: colours are
 * checked as #RRGGBB when the data loads, and numbers are numbers, so the markup is safe to inject.
 */

export interface Look {
  readonly door: string;
  readonly baseDoor: string;
  readonly island: string;
  readonly counter: string;
  readonly style: string;
  readonly wood: boolean;
  /** What sits on doors and on drawers; none for handleless. */
  readonly doorHw: 'handle' | 'knob' | 'none';
  readonly drawerHw: 'handle' | 'knob' | 'none';
  readonly pullFinish: string;
  readonly knobFinish: string;
  readonly doorOrient: 'vertical' | 'horizontal';
  readonly drawerTop: boolean;
  readonly drawers: 'minimum' | 'moderate' | 'maximum';
  readonly toCeiling: boolean;
  readonly topTrim: string | null;
  readonly trimHex: string;
  readonly valance: string | null;
  readonly valanceHex: string;
  /** Not a kitchen: no range or hood. */
  readonly plain: boolean;
  readonly counters: boolean;
}

const WALL = '#E7E3DC';
const FLOOR = '#C9C0B3';
let gid = 0;

export function mix(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (c: number) => Math.round(c + (t - c) * p);
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
const f1 = (n: number) => n.toFixed(1);
const R = (x: number, y: number, w: number, h: number, fill: string, ex = '') =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}" fill="${fill}" ${ex}/>`;
const C = (x: number, y: number, r: number, fill: string) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="rgba(0,0,0,.25)" stroke-width=".3"/>`;
const svg = (vb: string, body: string) => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;

function grain(color: string): { id: string; def: string } {
  const id = `intake-grain-${++gid}`;
  const s = mix(color, -0.22);
  return {
    id,
    def: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="7" height="60"><path d="M1.5 0 Q3 15 1.2 30 T1.8 60" stroke="${s}" stroke-width=".45" fill="none" opacity=".32"/><path d="M5 0 Q4 20 5.6 38 T5 60" stroke="${s}" stroke-width=".35" fill="none" opacity=".22"/></pattern>`,
  };
}

function doorShape(x: number, y: number, w: number, h: number, color: string, style: string, g: string | null): string {
  const sh = mix(color, -0.18);
  const hi = mix(color, 0.1);
  let s = R(x, y, w, h, color, `stroke="${sh}" stroke-width=".7"`);
  if (g) s += R(x, y, w, h, `url(#${g})`);
  const k = Math.max(2.4, Math.min(w, h) * 0.13);
  const fr = (i: number, sw = 0.7) => R(x + i, y + i, w - 2 * i, h - 2 * i, 'none', `stroke="${sh}" stroke-width="${sw}"`);
  if (style === 'transitional') s += fr(k * 0.6, 0.6);
  else if (style === 'country') {
    s += fr(k, 0.8);
    if (w - 2 * k > 6 && h - 2 * k > 10)
      for (let lx = x + k + 3.2; lx < x + w - k - 1; lx += 3.2)
        s += `<line x1="${f1(lx)}" y1="${f1(y + k)}" x2="${f1(lx)}" y2="${f1(y + h - k)}" stroke="${sh}" stroke-width=".35" opacity=".7"/>`;
  } else if (style === 'classic') {
    const k2 = k * 1.9;
    s += fr(k, 0.8);
    if (w > 2 * k2 + 2 && h > 2 * k2 + 2) {
      s += R(x + k2, y + k2, w - 2 * k2, h - 2 * k2, hi, `stroke="${sh}" stroke-width=".6"`);
      s += `<path d="M${x + k} ${y + k}L${x + k2} ${y + k2}M${x + w - k} ${y + k}L${x + w - k2} ${y + k2}M${x + k} ${y + h - k}L${x + k2} ${y + h - k2}M${x + w - k} ${y + h - k}L${x + w - k2} ${y + h - k2}" stroke="${sh}" stroke-width=".5"/>`;
    }
  }
  return s;
}

function hw(o: Look, color: string, x: number, y: number, w: number, h: number, part: 'drawer' | 'door', side: 'l' | 'r' | 'c', upper: boolean, z = 1): string {
  const kind = part === 'drawer' ? o.drawerHw : o.doorHw;
  if (kind === 'none') return o.style === 'ultra_modern' && !upper ? R(x, y, w, 1.6 * z, mix(color, -0.45)) : '';
  const pull = kind === 'handle';
  const col = pull ? o.pullFinish : o.knobFinish;
  if (part === 'drawer') {
    const cy = o.drawerTop ? y + Math.min(h * 0.28, 7 * z) : y + h / 2;
    if (pull) {
      const L = Math.min(w * 0.42, 26 * z);
      return R(x + w / 2 - L / 2, cy - 0.9 * z, L, 1.8 * z, col, `rx="${0.9 * z}"`);
    }
    return C(x + w / 2, cy, 1.8 * z, col);
  }
  const ex = side === 'l' ? x + 4.5 * z : x + w - 4.5 * z;
  const ey = upper ? y + h - 6 * z : y + 6 * z;
  if (!pull) return C(ex, ey, 1.8 * z, col);
  if (o.doorOrient === 'horizontal') {
    const L = Math.min(w * 0.4, 16 * z);
    const hx = side === 'l' ? x + 3.5 * z : x + w - 3.5 * z - L;
    return R(hx, ey - 0.9 * z, L, 1.8 * z, col, `rx="${0.9 * z}"`);
  }
  const L = Math.min(h * 0.32, 18 * z);
  const vy = upper ? y + h - 4 * z - L : y + 4 * z;
  return R(ex - 0.9 * z, vy, 1.8 * z, L, col, `rx="${0.9 * z}"`);
}

const PLANS: Record<Look['drawers'], readonly string[]> = {
  minimum: ['b4', 'td', 'R', 'td', 'td', 'b3'],
  moderate: ['b4', 'td', 'R', 'b4', 'b3', 'td'],
  maximum: ['b4', 'b3', 'R', 'b4', 'b3', 'b3'],
};
const ROWS: Record<string, readonly number[]> = { b4: [0.18, 0.22, 0.27, 0.33], b3: [0.26, 0.34, 0.4], td: [0.22, 0.78] };

/** A wall of cabinets, front on. `vb` crops it (trim, valance and drawer pictures). */
export function elevation(o: Look, vb = '0 0 400 250'): string {
  const door = o.door;
  const bd = o.baseDoor;
  const st = o.style;
  const g = o.wood ? grain(door) : null;
  const gb = o.wood ? (bd === door ? g : grain(bd)) : null;
  const glowId = `intake-glow-${++gid}`;
  let s = `<defs>${g ? g.def : ''}${gb && gb !== g ? gb.def : ''}<linearGradient id="${glowId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6DD" stop-opacity=".75"/><stop offset="1" stop-color="#FFF6DD" stop-opacity="0"/></linearGradient></defs>`;
  s += R(0, 0, 400, 250, WALL) + R(0, 0, 400, 8, '#F3F1ED') + R(0, 232, 400, 18, FLOOR) + R(0, 232, 400, 1, '#B5AB9E');
  let uT = o.toCeiling ? 8 : 26;
  const tc = o.trimHex;
  if (o.topTrim === 'flat_band') s += R(14, uT, 372, 6, tc, `stroke="${mix(tc, -0.2)}" stroke-width=".5"`);
  else if (o.topTrim === 'crown')
    s += `<path d="M16 ${uT + 8}L384 ${uT + 8}L390 ${uT}L10 ${uT}Z" fill="${tc}" stroke="${mix(tc, -0.22)}" stroke-width=".6"/><line x1="13" y1="${uT + 3}" x2="387" y2="${uT + 3}" stroke="${mix(tc, -0.2)}" stroke-width=".5"/>`;
  else if (o.topTrim === 'stepped_crown')
    s += R(10, uT, 380, 4, tc, `stroke="${mix(tc, -0.2)}" stroke-width=".5"`) + R(13, uT + 4, 374, 4, mix(tc, -0.05), `stroke="${mix(tc, -0.2)}" stroke-width=".5"`);
  if (o.topTrim) uT += o.topTrim === 'flat_band' ? 6 : 8;
  const uB = 104;
  const U = [56, 64, 72, 64, 56, 56];
  let x = 16;
  U.forEach((w, i) => {
    if (i === 2 && !o.plain) {
      s += `<path d="M${x + 22} ${uT}H${x + w - 22}V80L${x + w - 3} 98H${x + 3}L${x + 22} 80Z" fill="#C6CACD" stroke="#9AA0A4" stroke-width=".7"/>`;
      x += w;
      return;
    }
    s += R(x, uT, w, uB - uT, mix(door, -0.35));
    const n = w >= 60 ? 2 : 1;
    const dw = (w - 2 - (n - 1) * 1.4) / n;
    for (let j = 0; j < n; j++) {
      const dx = x + 1 + j * (dw + 1.4);
      s += doorShape(dx, uT + 1, dw, uB - uT - 2, door, st, g?.id ?? null);
      s += hw(o, door, dx, uT + 1, dw, uB - uT - 2, 'door', n === 2 && j === 1 ? 'l' : 'r', true);
    }
    x += w;
  });
  if (o.valance !== null) {
    x = 16;
    U.forEach((w, i) => {
      if (i !== 2 || o.plain) s += R(x, uB, w, 40, `url(#${glowId})`);
      x += w;
    });
  }
  if (o.valance === 'flat' || o.valance === 'shaped') {
    const vc = o.valanceHex;
    x = 16;
    U.forEach((w, i) => {
      if (i !== 2 || o.plain) {
        s +=
          o.valance === 'flat'
            ? R(x, uB, w, 4, vc, `stroke="${mix(vc, -0.2)}" stroke-width=".5"`)
            : `<path d="M${x} ${uB}H${x + w}V${uB + 6}Q${x + w / 2} ${uB + 1} ${x} ${uB + 6}Z" fill="${vc}" stroke="${mix(vc, -0.2)}" stroke-width=".5"/>`;
      }
      x += w;
    });
  }
  if (o.counters) s += R(12, 159, 376, 8, o.counter, `stroke="${mix(o.counter, -0.2)}" stroke-width=".6"`);
  const plan = PLANS[o.drawers];
  x = 16;
  U.forEach((w, i) => {
    const p = plan[i] === 'R' && o.plain ? 'td' : (plan[i] ?? 'td');
    if (p === 'R') {
      s += R(x + 1, 158, w - 2, 68, '#BEC2C5', 'stroke="#8E9396" stroke-width=".7"') + R(x + 1, 158, w - 2, 9, '#A3A8AC') + R(x + 1, 157, w - 2, 2, '#2F3336');
      for (let k = 0; k < 4; k++) s += C(x + 12 + (k * (w - 24)) / 3, 162.5, 1.6, '#2F3336');
      s += R(x + 9, 182, w - 18, 30, '#2F3336', 'rx="2"') + R(x + 8, 175, w - 16, 2, '#8E9396', 'rx="1"');
      x += w;
      return;
    }
    s += R(x, 167, w, 59, mix(bd, -0.35));
    const rows = ROWS[p] ?? [];
    let y = 168;
    const H = 57 - (rows.length - 1) * 1.4;
    rows.forEach((r, ri) => {
      const h = H * r;
      if (p === 'td' && ri === 1) {
        const n = w >= 60 ? 2 : 1;
        const dw = (w - 2 - (n - 1) * 1.4) / n;
        for (let j = 0; j < n; j++) {
          const dx = x + 1 + j * (dw + 1.4);
          s += doorShape(dx, y, dw, h, bd, st, gb?.id ?? null) + hw(o, bd, dx, y, dw, h, 'door', n === 2 && j === 1 ? 'l' : 'r', false);
        }
      } else s += doorShape(x + 1, y, w - 2, h, bd, st, gb?.id ?? null) + hw(o, bd, x + 1, y, w - 2, h, 'drawer', 'c', false);
      y += h + 1.4;
    });
    x += w;
  });
  s += R(16, 226, 368, 6, mix(bd, -0.5));
  return svg(vb, s);
}

const wall = (w: number, h: number) => R(0, 0, w, h, WALL);

/** One door, close up. */
export function doorClose(o: Look, color: string): string {
  const g = o.wood ? grain(color) : null;
  let s = (g ? `<defs>${g.def}</defs>` : '') + wall(120, 150) + R(0, 140, 120, 10, FLOOR);
  s += R(20, 8, 80, 128, mix(color, -0.35)) + doorShape(21, 9, 78, 126, color, o.style, g?.id ?? null);
  s += hw({ ...o, drawerTop: false }, color, 21, 9, 78, 126, 'door', 'r', false, 2.2);
  return svg('0 0 120 150', s);
}

/** A base cabinet with a drawer over two doors. */
export function unitClose(o: Look): string {
  const c = o.baseDoor;
  const g = o.wood ? grain(c) : null;
  let s = (g ? `<defs>${g.def}</defs>` : '') + wall(160, 120) + R(0, 114, 160, 6, FLOOR);
  s += R(14, 10, 132, 9, o.counter, `stroke="${mix(o.counter, -0.2)}" stroke-width=".5"`) + R(20, 19, 120, 92, mix(c, -0.35));
  s += doorShape(21, 20, 118, 24, c, o.style, g?.id ?? null) + hw(o, c, 21, 20, 118, 24, 'drawer', 'c', false, 2);
  s += doorShape(21, 45.5, 58.3, 64, c, o.style, g?.id ?? null) + hw(o, c, 21, 45.5, 58.3, 64, 'door', 'r', false, 2);
  s += doorShape(80.7, 45.5, 58.3, 64, c, o.style, g?.id ?? null) + hw(o, c, 80.7, 45.5, 58.3, 64, 'door', 'l', false, 2);
  return svg('0 0 160 120', s + R(20, 111, 120, 3, mix(c, -0.5)));
}

/** A handle or knob on a drawer front. */
export function hardwareClose(kind: 'handle' | 'knob', spec: string, door: string, fin: string, nearTop = false): string {
  const sh = mix(fin, -0.3);
  const hi = mix(fin, 0.35);
  const base = wall(160, 100) + R(10, 16, 140, 68, door, `stroke="${mix(door, -0.18)}" stroke-width=".8"`);
  let s = '';
  if (kind === 'handle') {
    if (spec === 'bar') s += R(46, 48, 68, 5, fin, `rx="2.5" stroke="${sh}" stroke-width=".5"`) + R(52, 46, 4, 4, sh) + R(104, 46, 4, 4, sh);
    if (spec === 'edge') s += R(50, 12, 60, 8, fin, `rx="1.5" stroke="${sh}" stroke-width=".5"`) + R(50, 19, 60, 1.5, sh);
    if (spec === 'cup') s += `<path d="M56 44H104A24 16 0 0 1 56 44Z" fill="${fin}" stroke="${sh}" stroke-width=".6"/><path d="M62 46H98A18 10 0 0 1 62 46Z" fill="${sh}" opacity=".7"/>`;
    if (spec === 'arch') s += `<path d="M50 56Q80 32 110 56" stroke="${fin}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  } else {
    if (spec === 'round') s += `<circle cx="80" cy="50" r="10" fill="${fin}" stroke="${sh}" stroke-width=".6"/><circle cx="77" cy="47" r="3.5" fill="${hi}" opacity=".5"/>`;
    if (spec === 'square') s += R(70, 40, 20, 20, fin, `rx="3" stroke="${sh}" stroke-width=".6"`);
    if (spec === 't_bar') s += R(64, 46, 32, 8, fin, `rx="4" stroke="${sh}" stroke-width=".6"`);
    if (spec === 'mushroom') s += `<circle cx="80" cy="50" r="12" fill="${sh}"/><circle cx="80" cy="50" r="10" fill="${fin}"/><circle cx="76.5" cy="46.5" r="4" fill="${hi}" opacity=".5"/>`;
  }
  return svg('0 0 160 100', base + `<g transform="translate(0 ${nearTop && spec !== 'edge' ? -20 : 0})">${s}</g>`);
}

/** A floor plan in lines (the layout question). Drawn in the text colour. */
export function plan(id: string): string {
  const st = 'stroke="currentColor"';
  const run = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor" fill-opacity=".08" ${st} stroke-width="1.4"/>`;
  const walls = (d: string) => `<path d="${d}" fill="none" ${st} stroke-width="3.5" stroke-linecap="square"/>`;
  const sink = (x: number, y: number) => `<rect x="${x}" y="${y}" width="18" height="10" rx="2.5" fill="none" ${st} stroke-width="1"/>`;
  const range = (x: number, y: number) =>
    [[4, 4], [12, 4], [4, 12], [12, 12]].map(([a = 0, b = 0]) => `<circle cx="${x + a}" cy="${y + b}" r="2.6" fill="none" ${st} stroke-width=".9"/>`).join('');
  let s = '';
  if (id === 'galley') s = walls('M20 14H180M20 136H180') + run(20, 16, 160, 18) + run(20, 116, 160, 18) + sink(90, 20) + range(60, 117);
  if (id === 'l_shape_island') s = walls('M120 136H180V14H20V100') + run(20, 16, 158, 18) + run(20, 34, 18, 66) + run(78, 68, 62, 26) + sink(110, 20) + range(22, 52);
  if (id === 'peninsula') s = walls('M120 136H180V14H20V100') + run(20, 16, 158, 18) + run(20, 34, 18, 66) + run(140, 34, 18, 62) + sink(100, 20) + range(22, 52);
  if (id === 'u_shape') s = walls('M20 136V14H180V136') + run(20, 16, 160, 18) + run(20, 34, 18, 80) + run(162, 34, 18, 80) + sink(90, 20) + range(22, 60);
  if (id === 'double_island') s = walls('M20 136V14H180V136') + run(20, 16, 160, 18) + run(52, 56, 96, 22) + run(52, 96, 96, 22) + sink(90, 20) + range(130, 57);
  return svg('0 0 200 150', s);
}

/** The perimeter cabinets with an island in front. */
export function islandScene(o: Look): string {
  const c = o.counter;
  let s = wall(200, 125) + R(0, 112, 200, 13, FLOOR);
  s += R(10, 22, 180, 26, mix(o.door, -0.3));
  for (let i = 0; i < 6; i++) s += doorShape(11 + i * 29.8, 23, 28.6, 24, o.door, o.style, null);
  s += R(8, 60, 184, 4, c) + R(10, 64, 180, 30, mix(o.baseDoor, -0.3));
  for (let i = 0; i < 6; i++) s += doorShape(11 + i * 29.8, 65, 28.6, 28, o.baseDoor, o.style, null);
  s += R(36, 76, 128, 6, c, `stroke="${mix(c, -0.2)}" stroke-width=".5"`) + R(40, 82, 120, 32, mix(o.island, -0.3));
  for (let i = 0; i < 4; i++) s += doorShape(41 + i * 29.75, 83, 28.5, 29, o.island, o.style, null);
  return svg('0 0 200 125', s);
}

export function backPanel(o: Look, id: string): string {
  const col = o.island;
  const c = o.counter;
  let s = wall(200, 120) + R(0, 108, 200, 12, FLOOR) + R(14, 30, 172, 8, c, `stroke="${mix(c, -0.2)}" stroke-width=".5"`) + R(22, 38, 156, 70, col, `stroke="${mix(col, -0.2)}" stroke-width=".7"`);
  if (id === 'door_panels') for (let i = 0; i < 4; i++) s += doorShape(25 + i * 38.2, 41, 36, 64, col, o.style === 'modern' || o.style === 'ultra_modern' ? 'transitional' : o.style, null);
  if (id === 'shiplap') for (let y = 44; y < 106; y += 6) s += `<line x1="22" y1="${y}" x2="178" y2="${y}" stroke="${mix(col, -0.22)}" stroke-width=".7"/>`;
  return svg('0 0 200 120', s);
}

export function sidePanel(o: Look, id: string): string {
  const col = o.island;
  const c = o.counter;
  let s = wall(200, 120) + R(0, 108, 200, 12, FLOOR) + R(36, 30, 134, 8, c, `stroke="${mix(c, -0.2)}" stroke-width=".5"`);
  if (id === 'waterfall_stone') s += R(60, 38, 94, 70, mix(col, -0.1)) + R(154, 30, 8, 78, c, `stroke="${mix(c, -0.2)}" stroke-width=".5"`) + R(36, 30, 126, 8, c);
  if (id === 'detailed_short') s += R(70, 38, 92, 70, col, `stroke="${mix(col, -0.2)}" stroke-width=".7"`) + doorShape(76, 44, 80, 58, col, 'classic', null);
  if (id === 'detailed_long') s += R(36, 38, 126, 70, col, `stroke="${mix(col, -0.2)}" stroke-width=".7"`) + doorShape(42, 44, 52, 58, col, 'classic', null) + doorShape(104, 44, 52, 58, col, 'classic', null);
  // Plain gables: a flat end panel, 3/4" or 1 1/2" (owner, 2026-11-09), drawn on the island's end.
  if (id === 'plain_gable' || id === 'deep_plain_gable') {
    const t = id === 'plain_gable' ? 4 : 8;
    s += R(44, 38, 110, 70, mix(col, -0.08)) + R(154 - t, 38, t + 4, 70, col, `stroke="${mix(col, -0.22)}" stroke-width=".7"`);
  }
  return svg('0 0 200 120', s);
}

/** A corner cabinet from above, in lines. */
export function corner(id: string): string {
  const st = 'stroke="currentColor"';
  let s = `<path d="M14 14H106V50H50V106H14Z" fill="currentColor" fill-opacity=".06" ${st} stroke-width="1.6"/><path d="M10 10H110M10 10V110" ${st} stroke-width="4"/>`;
  if (id === 'double_shelf') s += `<path d="M20 20H98V44H44V98H20Z" fill="none" ${st} stroke-width="1" stroke-dasharray="4 3"/>`;
  if (id === 'lazy_susan') s += `<path d="M36 36 L36 14 A22 22 0 1 0 58 36 Z" fill="currentColor" fill-opacity=".12" ${st} stroke-width="1.2"/><circle cx="36" cy="36" r="2" fill="currentColor"/>`;
  return svg('0 0 120 120', s);
}

/** An open cabinet showing its inside colour. */
export function interior(id: string, o: Look): string {
  const col = id === 'white' ? '#F4F3EF' : id === 'prestige_maple' ? '#D9B98A' : o.door;
  const g = id === 'prestige_maple' ? grain(col) : null;
  let s = (g ? `<defs>${g.def}</defs>` : '') + wall(160, 128) + R(0, 118, 160, 10, FLOOR);
  s += R(38, 12, 84, 106, mix(col, -0.08), `stroke="${mix(col, -0.3)}" stroke-width="1"`) + R(44, 16, 72, 96, col) + (g ? R(44, 16, 72, 96, `url(#${g.id})`) : '');
  s += `<path d="M44 16L52 24H108L116 16Z" fill="${mix(col, -0.15)}"/><path d="M44 112L52 104H108L116 112Z" fill="${mix(col, -0.06)}"/><path d="M44 16L52 24V104L44 112Z" fill="${mix(col, -0.12)}"/>`;
  for (const y of [50, 78]) s += R(52, y, 56, 3, mix(col, -0.05), `stroke="${mix(col, -0.25)}" stroke-width=".5"`);
  s += `<path d="M122 12L146 20V110L122 118Z" fill="${o.door}" stroke="${mix(o.door, -0.25)}" stroke-width=".8"/>`;
  return svg('0 0 160 128', s);
}
