/**
 * Placed cabinets in the master copy (Core PlacedItem, schema 2), as the designer's screens see
 * them. The master copy is the only store (P1): the 3D view, the run strips and the checks are
 * all worked out from `room.items` every time (P6). Appliances and hoods are not catalog items;
 * they come from the wall's appliance placements, and are shown beside the cabinets.
 *
 * Positions are true room positions in exact base units: the wall, the side of it, the offset
 * along it from its start corner, the elevation off the floor and the setback from the wall face.
 * That is how the CAD import file places a cabinet (wall number, offset from wall start,
 * elevation; see DECISIONS "Placed cabinets in the master copy"), so nothing has to be rounded to write it.
 */
import { formatInches, roomInsideSide, type Length, type PlacedItem, type Result, type Room, type Wall } from '@/core/index';
import { catalogItem, CURRENT_CATALOG, type CatalogItem } from '@/modules/catalog/contract';
import { overOf } from './layout-rules';
import { applianceEnd } from './layout';
import { DRAFT_SETTINGS, itemByCode, standard, type PlaceholderCabinet, type PlaceholderDesign } from './placeholder-draft';

/** A cabinet, appliance or hood as the screens show it. */
export type CabinetView = PlaceholderCabinet;

const UPPER_TYPES = new Set(['wall', 'corner_wall']);
/** Panels and fillers cover or close up cabinets; they never house an appliance (an island's back panel runs behind it). */
const SKINS = new Set(['panel', 'filler']);
export const itemOf = (item: PlacedItem): CatalogItem | null => catalogItem(CURRENT_CATALOG, item.catalog_item_id);
export const isUpper = (item: PlacedItem): boolean => UPPER_TYPES.has(itemOf(item)?.type ?? '') || (item.position.elevation > 0 && itemOf(item)?.type === 'filler');
/** A cabinet counts as reviewed once a designer approved it or changed it. */
export const reviewed = (item: PlacedItem): boolean => item.origin.approved || item.origin.last_edited_by === 'designer';

/** The run a stretch along a wall belongs to (the first run that covers its middle), or null. */
function runAt(wall: Wall, offset: Length, width: Length): string | null {
  const mid = offset + width / 2;
  return wall.runs.find((r) => r.offset <= mid && mid <= r.offset + r.length)?.run_id ?? null;
}

/** The top line of the room's uppers: the highest upper's top, or the placeholder's standard. */
export function upperTopOf(room: Room): Length {
  const tops = room.items.filter(isUpper).map((i) => i.position.elevation + i.height);
  if (tops.length) return Math.max(...tops);
  const s = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value : null;
  return s ? s.visual.upperBottom + (standard(s.codes.upper, 'height') ?? 0) : room.ceiling_height.value;
}

/** Every cabinet, appliance and hood in the room, for the screens. */
export function cabinetViews(room: Room): CabinetView[] {
  const out: CabinetView[] = [];
  for (const item of room.items) {
    const wall = room.walls.find((w) => w.wall_id === item.position.wall_id);
    out.push({
      id: item.item_instance_id,
      code: itemOf(item)?.code ?? null,
      appliance: null,
      wallId: item.position.wall_id,
      runId: wall ? (runAt(wall, item.position.offset, item.width) ?? '') : '',
      layer: isUpper(item) ? 'upper' : 'base',
      offset: item.position.offset,
      width: item.width,
      depth: item.depth,
      elevation: item.position.elevation,
      height: item.height,
      reviewed: reviewed(item),
      // An island's cabinets stand on its left side; the right side is its back (the back panel).
      ...(wall?.kind === 'floating' && item.position.side === 'right' ? { back: true } : {}),
    });
  }
  const top = upperTopOf(room);
  const upperBottom = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.visual.upperBottom : 0;
  for (const wall of room.walls)
    for (const a of wall.appliances) {
      const runId = runAt(wall, a.offset, a.width.value) ?? '';
      // A sink, dishwasher or wall oven stands inside a cabinet (sink base, opening, tall oven):
      // the cabinet shows it, so the appliance isn't drawn again. The cabinet may sit a little off
      // the appliance's drawn place (a dishwasher touching a wider sink base), so it counts when it
      // holds the appliance's middle; drawing both put two boxes in one place.
      const middle = a.offset + a.width.value / 2;
      const housed = room.items.some(
        (i) => i.position.wall_id === wall.wall_id && !isUpper(i) && !SKINS.has(itemOf(i)?.type ?? '') && i.position.offset < middle && middle < i.position.offset + i.width,
      );
      if (!housed) out.push({ id: a.placement_id, code: null, appliance: a.kind, wallId: wall.wall_id, runId, layer: 'base', offset: a.offset, width: a.width.value, depth: null, elevation: 0, height: 0, reviewed: true });
      // An appliance or millwork hood over a range or cooktop; a cabinet there is a placed item.
      const over = overOf(a);
      if (over === 'appliance_hood' || over === 'millwork_hood')
        out.push({ id: `${a.placement_id}-hood`, code: null, appliance: over === 'appliance_hood' ? 'hood' : 'millwork_hood', wallId: wall.wall_id, runId, layer: 'upper', offset: a.offset, width: applianceEnd(a) - a.offset, depth: null, elevation: upperBottom, height: Math.max(0, top - upperBottom), reviewed: true });
    }
  return out;
}

/** Turns the placeholder recipe's cabinets into placed items in the master copy. */
export function placeholderItems(room: Room, design: PlaceholderDesign): Result<PlacedItem[]> {
  const inside = roomInsideSide(room.walls);
  const items: PlacedItem[] = [];
  for (const c of design.cabinets) {
    if (c.code === null) continue;
    const item = itemByCode(c.code);
    if (!item) return { ok: false, reason: `The catalog has no cabinet type "${c.code}".` };
    const depth = c.depth ?? item.size.depth.default.value;
    if (depth === null) return { ok: false, reason: `The catalog has no standard depth for ${item.name}.` };
    const wall = room.walls.find((w) => w.wall_id === c.wallId);
    if (!wall) return { ok: false, reason: 'A cabinet was laid out on a wall that is no longer in the room.' };
    items.push({
      item_instance_id: c.id,
      catalog_item_id: item.id,
      width: c.width,
      height: c.height,
      depth,
      // On a room wall, the room's side, against the wall; on a floating wall, its left side, backed
      // onto the line, and the island's back panel on the right side, covering their backs.
      position: { wall_id: c.wallId, side: wall.kind === 'room' ? inside : c.back ? 'right' : 'left', offset: c.offset, elevation: c.elevation, setback: 0 },
      item_selections: {},
      modifications: [],
      origin: { placed_by: 'ai', last_edited_by: 'ai', approved: false },
      notes: '',
    });
  }
  return { ok: true, value: items };
}

export type ItemEdit =
  | { readonly kind: 'width'; readonly id: string; readonly width: Length }
  | { readonly kind: 'type'; readonly id: string; readonly code: string }
  | { readonly kind: 'approve'; readonly ids: readonly string[] };

const sameRow = (a: PlacedItem, b: PlacedItem) => a.position.wall_id === b.position.wall_id && a.position.side === b.position.side && isUpper(a) === isUpper(b);
const byDesigner = (i: PlacedItem): PlacedItem => ({ ...i, origin: { ...i.origin, last_edited_by: 'designer' } });

/**
 * Changes placed items. A new width takes the difference from the cabinet or filler right beside
 * it (after it first, then before it), so the run keeps its length. Refused, with the reason, when
 * nothing beside it can give or take it. A type change stays within the catalog item's type.
 */
export function editItems(room: Room, edit: ItemEdit): Result<Room> {
  if (edit.kind === 'approve') {
    const ids = new Set(edit.ids);
    return { ok: true, value: { ...room, items: room.items.map((i) => (ids.has(i.item_instance_id) ? { ...i, origin: { ...i.origin, approved: true } } : i)) } };
  }
  const cab = room.items.find((i) => i.item_instance_id === edit.id);
  if (!cab) return { ok: false, reason: 'An appliance or hood is moved on the Room drawing step.' };
  if (edit.kind === 'type') {
    const now = itemOf(cab);
    const next = itemByCode(edit.code);
    if (!now || !next) return { ok: false, reason: `"${edit.code}" isn't in the catalog.` };
    if (now.type !== next.type) return { ok: false, reason: `A ${now.name.toLowerCase()} can only change to another cabinet of the same kind.` };
    return { ok: true, value: { ...room, items: room.items.map((i) => (i === cab ? byDesigner({ ...i, catalog_item_id: next.id }) : i)) } };
  }
  if (!Number.isSafeInteger(edit.width) || edit.width <= 0) return { ok: false, reason: 'The width must be more than zero.' };
  const diff = edit.width - cab.width;
  if (diff === 0) return { ok: true, value: room };
  const after = room.items.find((x) => x !== cab && sameRow(x, cab) && x.position.offset === cab.position.offset + cab.width);
  const before = room.items.find((x) => x !== cab && sameRow(x, cab) && x.position.offset + x.width === cab.position.offset);
  const nb = after ?? before;
  if (!nb) return { ok: false, reason: 'Nothing beside it can give or take the difference. Change the run on the Room drawing step.' };
  const left = nb.width - diff;
  if (left < 0) return { ok: false, reason: `The cabinet beside it is only ${formatInches(nb.width)} wide, so this one can grow by that much at most.` };
  const items = room.items
    .map((x) => {
      if (x === cab) return byDesigner({ ...x, width: edit.width, position: { ...x.position, offset: nb === before ? x.position.offset - diff : x.position.offset } });
      if (x === nb) return byDesigner({ ...x, width: left, position: { ...x.position, offset: nb === after ? x.position.offset + diff : x.position.offset } });
      return x;
    })
    .filter((x) => x.width > 0);
  return { ok: true, value: { ...room, items } };
}

/** Replaces one run's cabinets with freshly laid-out ones, keeping the rest of the room as it is. */
export function replaceRunItems(room: Room, fresh: readonly PlacedItem[], runId: string): Room {
  const inRun = (i: PlacedItem) => {
    const wall = room.walls.find((w) => w.wall_id === i.position.wall_id);
    return wall ? runAt(wall, i.position.offset, i.width) === runId : false;
  };
  return { ...room, items: [...room.items.filter((i) => !inRun(i)), ...fresh.filter(inRun)] };
}
