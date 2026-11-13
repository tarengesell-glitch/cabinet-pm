/**
 * A cabinet's fronts and what shows inside, laid out as flat pieces for the 3D view to draw (pure
 * numbers in inches, so it is tested without a browser). Laid out in the cabinet's own frame as
 * seen standing in front of it: x from its left edge (−width/2) to its right (+width/2), y up from
 * the floor.
 *
 * - **Saved sections** (`PlacedItem.sections`, divided in Customize, owner 2026-11-12) are drawn
 *   as saved. Without them, the catalog type's fronts (top to bottom) give the sections.
 * - **Doors** follow the shop's door rule (design rule CB-FACT-16, "keep these measurements for
 *   drawing in the visual tool"): one door up to 20" wide, then a pair; one door up to 48" tall,
 *   then stacked doors. A tall pantry's lower door lines up with the tops of the base cabinets'
 *   doors and drawers (owner, 2026-11-12); the part above follows the 48" rule. The cabinet's door opening (`hinge_side`: left, right or a pair, owner
 *   2026-11-12) overrides the width rule.
 * - **Drawers:** the top drawer front is the standard 6 13/16" and lines up across cabinets
 *   (DECISIONS 2026-11-07); the rest share what is left equally.
 * - **Handles:** a base door's at the top, an upper's at the bottom; a door under a drawer at the
 *   height of a three-drawer bank's middle handle (DECISIONS 2026-11-07); a garbage pull-out's at
 *   the second drawer of a four-drawer bank (owner, 2026-11-12).
 */
import type { FrontSection } from '@/core/index';
import type { CatalogItem } from '@/modules/catalog/contract';

/** Where a door hangs: hinged on its left (handle on the right) or its right. */
export type Hinge = 'left' | 'right';

export type FrontPiece =
  | { readonly kind: 'door'; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number; readonly hinge: Hinge; readonly handleY: number; readonly handle: boolean }
  /** A drawer front; `pullout`: a front that opens like a drawer (a garbage pull-out), which takes no insert. */
  | { readonly kind: 'drawer'; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number; readonly handleY: number; readonly pullout?: true }
  | { readonly kind: 'shelf'; readonly x0: number; readonly x1: number; readonly y: number }
  | { readonly kind: 'rollout'; readonly x0: number; readonly x1: number; readonly y: number }
  | { readonly kind: 'divider'; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }
  | { readonly kind: 'open'; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };

export interface FrontRules {
  /** Widest single door (CB-FACT-16 max_single_door_width), inches. */
  readonly maxSingleDoor: number;
  /** Tallest single door (CB-FACT-16 max_door_height), inches. */
  readonly maxDoorHeight: number;
  /** The standard top drawer front, inches. */
  readonly topDrawer: number;
  /** Where uppers start, inches: a door whose middle is above it gets its handle at the bottom. */
  readonly upperBottom: number;
  /** The top of the base cabinets' fronts, inches: a tall pantry's lower door lines up with it (owner, 2026-11-12). */
  readonly baseTop: number;
}

export interface FrontInput {
  readonly item: Pick<CatalogItem, 'code' | 'type' | 'front' | 'inside'>;
  /** The face's left and right edges and its bottom and top (above the toe kick for a base), inches. */
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  /** The cabinet's door opening choice (catalog `hinge_side`), if any. */
  readonly hinge: string | null;
  readonly sections: FrontSection | null;
  /** True: a drawer's handle near its top edge; false: centred (the client's hardware choice). */
  readonly drawerHandleTop: boolean;
  /** The sink base's front (catalog `sink_front`): full-height doors unless a false drawer front or tip-out is chosen. */
  readonly sinkFront?: string | null;
}

/** A section as drawn: a saved one, or one made from the catalog type with its handle placed by rule. */
type Draw =
  | { readonly kind: 'split'; readonly direction: 'vertical' | 'horizontal'; readonly parts: readonly Draw[]; readonly size: number | null }
  | { readonly kind: 'doors'; readonly shelves: number; readonly rollouts: number; readonly size: number | null; readonly handleY?: number }
  | { readonly kind: 'drawers'; readonly count: number; readonly size: number | null }
  | { readonly kind: 'open'; readonly shelves: number; readonly size: number | null }
  | { readonly kind: 'pullout'; readonly rollouts: number; readonly size: number | null; readonly handleY?: number };

const IN = 64;

/** A drawer handle's height on a drawer from `y0` to `y1`. */
const drawerHandle = (y0: number, y1: number, top: boolean): number => (top ? y1 - 2.2 : (y0 + y1) / 2);

/** The drawer fronts of a bank of `count` filling `y0`..`y1`: the top one standard when there is room, the rest equal. */
export function bankHeights(count: number, height: number, topDrawer: number): number[] {
  if (count <= 1) return [height];
  if (topDrawer * count >= height) return Array.from({ length: count }, () => height / count);
  const rest = (height - topDrawer) / (count - 1);
  return [topDrawer, ...Array.from({ length: count - 1 }, () => rest)];
}

/** The handle height of drawer `index` (0 = top) in a bank of `count` filling `y0`..`y1`. */
function bankHandle(count: number, index: number, y0: number, y1: number, rules: FrontRules, top: boolean): number {
  const hs = bankHeights(count, y1 - y0, rules.topDrawer);
  let y = y1;
  for (let k = 0; k < index; k++) y -= hs[k]!;
  return drawerHandle(y - hs[index]!, y, top);
}

/** The sections a catalog type's fronts give, top to bottom, with the handle rules. */
function fromCatalog(input: FrontInput, rules: FrontRules): Draw {
  const { item, y0, y1 } = input;
  const fronts = item.front;
  const shelves = (item.inside?.['adjustable_shelves'] ?? 0) + (item.inside?.['fixed_shelves'] ?? 0);
  const base = item.type === 'base' || item.type === 'vanity';
  const bankMiddle = bankHandle(3, 1, y0, y1, rules, input.drawerHandleTop);
  // The garbage pull-out: a working drawer over a full-height pull-out front, its handle at the
  // second drawer of a four-drawer bank (owner, 2026-11-12).
  if (item.code === 'garbage_pullout')
    return {
      kind: 'split',
      direction: 'horizontal',
      size: null,
      parts: [
        { kind: 'drawers', count: 1, size: rules.topDrawer * IN },
        { kind: 'pullout', rollouts: 0, handleY: bankHandle(4, 1, y0, y1, rules, input.drawerHandleTop), size: null },
      ],
    };
  // The sink base: full-height doors (the catalog's default sink front; owner, 2026-11-13: "Sink
  // base. Full height doors"); a false drawer front or tip-out tray over doors when one is chosen.
  if (item.code === 'sink_base') {
    if (input.sinkFront === 'false_drawer_front' || input.sinkFront === 'tip_out_tray')
      return { kind: 'split', direction: 'horizontal', size: null, parts: [{ kind: 'drawers', count: 1, size: rules.topDrawer * IN }, { kind: 'doors', shelves: 0, rollouts: 0, size: null, handleY: bankMiddle }] };
    return { kind: 'doors', shelves: 0, rollouts: 0, size: null };
  }
  const first = fronts[0];
  if (fronts.length > 0 && fronts.every((f) => f.kind === 'doors')) {
    if (fronts.length === 1) return { kind: 'doors', shelves, rollouts: 0, size: null };
    return stackedDoors(fronts.length, y0, y1, rules);
  }
  if (first?.kind === 'drawers' && fronts.length === 1) return { kind: 'drawers', count: first.count ?? 3, size: null };
  if (first?.kind === 'drawers' && fronts[1]?.kind === 'doors' && base) {
    const n = first.count ?? 1;
    return {
      kind: 'split',
      direction: 'horizontal',
      size: null,
      parts: [
        { kind: 'drawers', count: n, size: rules.topDrawer * n * IN },
        { kind: 'doors', shelves: 0, rollouts: fronts.length > 1 && /rollouts/.test(item.code) ? 2 : 0, size: null, handleY: bankMiddle },
      ],
    };
  }
  if (first?.kind === 'pullout' && fronts.length === 1) return { kind: 'pullout', rollouts: 0, size: null };
  return { kind: 'doors', shelves, rollouts: 0, size: null };
}

/**
 * A tall cabinet's stacked doors (a pantry): the lower door's top lines up with the base cabinets'
 * fronts (owner, 2026-11-12), the rest above, stacked again by the 48" rule. When the face doesn't
 * reach past the base top, as many equal rows as the catalog lists.
 */
function stackedDoors(count: number, y0: number, y1: number, rules: FrontRules): FrontSection {
  const doors = (size: number | null): FrontSection => ({ kind: 'doors', shelves: 0, rollouts: 0, size });
  if (rules.baseTop > y0 + 1 && rules.baseTop < y1 - 1) return { kind: 'split', direction: 'horizontal', size: null, parts: [doors(null), doors(Math.round((rules.baseTop - y0) * IN))] };
  return { kind: 'split', direction: 'horizontal', size: null, parts: Array.from({ length: count }, () => doors(null)) };
}

/** The parts' lengths along a split of `total` inches: a part's own size, or an equal share of the rest. */
export function partLengths(parts: readonly { readonly size: number | null }[], total: number): number[] {
  const fixed = parts.reduce((t, p) => t + (p.size === null ? 0 : p.size / IN), 0);
  const free = parts.filter((p) => p.size === null).length;
  const each = free ? Math.max(0, total - fixed) / free : 0;
  const out = parts.map((p) => (p.size === null ? each : p.size / IN));
  // Fixed sizes that overrun the space shrink in proportion, so nothing is drawn outside the cabinet.
  const sum = out.reduce((a, b) => a + b, 0);
  return sum > total && sum > 0 ? out.map((v) => (v * total) / sum) : out;
}

/** The pieces of a cabinet's face, ready to draw. */
export function frontPieces(input: FrontInput, rules: FrontRules): FrontPiece[] {
  const out: FrontPiece[] = [];
  const root: Draw = input.sections ?? fromCatalog(input, rules);
  // A cabinet divided side by side opens each door on its own; a single door's hinge is the person's choice.
  const lay = (sec: Draw, x0: number, x1: number, y0: number, y1: number, topOfFace: boolean): void => {
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    switch (sec.kind) {
      case 'split': {
        const along = sec.direction === 'vertical' ? w : h;
        const lengths = partLengths(sec.parts, along);
        let at = sec.direction === 'vertical' ? x0 : y1;
        sec.parts.forEach((p, k) => {
          const len = lengths[k]!;
          if (sec.direction === 'vertical') {
            lay(p, at, at + len, y0, y1, topOfFace);
            at += len;
            if (k < sec.parts.length - 1) out.push({ kind: 'divider', x0: at - 0.375, x1: at + 0.375, y0, y1 });
          } else {
            lay(p, x0, x1, at - len, at, topOfFace && k === 0);
            at -= len;
            if (k < sec.parts.length - 1) out.push({ kind: 'divider', x0, x1, y0: at - 0.375, y1: at + 0.375 });
          }
        });
        return;
      }
      case 'drawers': {
        const hs = topOfFace ? bankHeights(sec.count, h, rules.topDrawer) : Array.from({ length: sec.count }, () => h / sec.count);
        let y = y1;
        for (const dh of hs) {
          out.push({ kind: 'drawer', x0, x1, y0: y - dh, y1: y, handleY: drawerHandle(y - dh, y, input.drawerHandleTop) });
          y -= dh;
        }
        return;
      }
      case 'pullout': {
        // Its handle where a top drawer's would be, unless placed by rule (the garbage pull-out's).
        const top = Math.min(rules.topDrawer, h);
        out.push({ kind: 'drawer', x0, x1, y0, y1, handleY: sec.handleY ?? drawerHandle(y1 - top, y1, input.drawerHandleTop), pullout: true });
        for (let k = 0; k < sec.rollouts; k++) out.push({ kind: 'rollout', x0, x1, y: y1 - 4 - k * 5 });
        return;
      }
        return;
      case 'open':
        out.push({ kind: 'open', x0, x1, y0, y1 });
        for (let k = 1; k <= sec.shelves; k++) out.push({ kind: 'shelf', x0, x1, y: y0 + (h * k) / (sec.shelves + 1) });
        return;
      case 'doors': {
        for (let k = 1; k <= sec.shelves; k++) out.push({ kind: 'shelf', x0, x1, y: y0 + (h * k) / (sec.shelves + 1) });
        for (let k = 0; k < sec.rollouts; k++) out.push({ kind: 'rollout', x0, x1, y: y0 + 1 + (k * (h - 2)) / Math.max(1, sec.rollouts) });
        const pair = input.hinge === 'pair' || (input.hinge !== 'left' && input.hinge !== 'right' && w > rules.maxSingleDoor);
        const rows = Math.max(1, Math.ceil(h / rules.maxDoorHeight - 1e-9));
        const fixedHandle = sec.handleY ?? null;
        for (let r = 0; r < rows; r++) {
          const ry1 = y1 - (h * r) / rows;
          const ry0 = ry1 - h / rows;
          // An upper (or the upper part of a tall cabinet) opens from the bottom; anything lower from the top.
          const fromBottom = (ry0 + ry1) / 2 > rules.upperBottom;
          const handleY = fixedHandle ?? (fromBottom ? ry0 + 5 : ry1 - 5);
          if (pair) {
            out.push({ kind: 'door', x0, x1: x0 + w / 2, y0: ry0, y1: ry1, hinge: 'left', handleY, handle: true });
            out.push({ kind: 'door', x0: x0 + w / 2, x1, y0: ry0, y1: ry1, hinge: 'right', handleY, handle: true });
          } else out.push({ kind: 'door', x0, x1, y0: ry0, y1: ry1, hinge: input.hinge === 'right' ? 'right' : 'left', handleY, handle: true });
        }
        return;
      }
    }
  };
  lay(root, input.x0, input.x1, input.y0, input.y1, true);
  return out;
}

/**
 * The sections a cabinet starts from when a person first divides it in Customize: its catalog
 * type's fronts as saved sections (drawers, then doors), so a split keeps what was there.
 */
export function startingSections(item: Pick<CatalogItem, 'code' | 'type' | 'front' | 'inside'>, rules: FrontRules, y0: number, y1: number): FrontSection {
  const topDrawer = rules.topDrawer;
  const fronts = item.front;
  const shelves = (item.inside?.['adjustable_shelves'] ?? 0) + (item.inside?.['fixed_shelves'] ?? 0);
  const first = fronts[0];
  if (first?.kind === 'drawers' && fronts.length === 1) return { kind: 'drawers', count: first.count ?? 3, size: null };
  if (first?.kind === 'drawers' && fronts.length > 1)
    return {
      kind: 'split',
      direction: 'horizontal',
      size: null,
      parts: [
        { kind: 'drawers', count: first.count ?? 1, size: Math.round(topDrawer * (first.count ?? 1) * IN) },
        { kind: 'doors', shelves: 0, rollouts: /rollouts/.test(item.code) ? 2 : 0, size: null },
      ],
    };
  if (fronts.length > 1 && fronts.every((f) => f.kind === 'doors')) return stackedDoors(fronts.length, y0, y1, rules);
  return { kind: 'doors', shelves, rollouts: 0, size: null };
}
