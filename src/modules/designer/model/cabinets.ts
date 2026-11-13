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
import { FrontSectionSchema, formatInches, roomInsideSide, type FrontSection, type Length, type PlacedItem, type Result, type Room, type Wall } from '@/core/index';
import { lookOptions, lookProblem } from './appliance-looks';
import { DRAWER_INSERTS } from './library';
import { catalogItem, CURRENT_CATALOG, type CatalogItem } from '@/modules/catalog/contract';
import { overOf } from './layout-rules';
import { applianceEnd } from './layout';
import { DRAFT_SETTINGS, itemByCode, standard, type PlaceholderCabinet, type PlaceholderDesign } from './placeholder-draft';

/** A cabinet, appliance or hood as the screens show it. */
export type CabinetView = PlaceholderCabinet & {
  /**
   * A placed cabinet's saved end values at its low and high end along the wall (the catalog's
   * end_left / end_right, null when not chosen); absent for appliances, hoods and items with no ends.
   * The 3D view draws a finished end only from these (model/ends.ts decides them).
   */
  readonly ends?: { readonly low: string | null; readonly high: string | null };
  /** A placed cabinet's catalog choices as saved (door opening, back…); absent for appliances and hoods. */
  readonly selections?: Readonly<Record<string, string>>;
  /** Its front and interior as a person divided it; absent while it is as its catalog type shows it. */
  readonly sections?: FrontSection;
  /** Which end of the wall (its start, low, or its end, high) is this cabinet's left, seen from the front (END-1). */
  readonly leftAt?: 'low' | 'high';
  /** Drawer inserts by drawer number from the top (owner, 2026-11-13); absent when none. */
  readonly drawerInserts?: Readonly<Record<string, string>>;
  /** The catalog options a person set by hand (END-4); absent when none. */
  readonly setByHand?: readonly string[];
  /** From the wall face to its back (a cabinet pulled out from the wall); absent when against it. */
  readonly setback?: Length;
  /**
   * The appliance this view is, or the one standing in this cabinet (a sink in its sink base, a
   * dishwasher in its opening), with how it looks: clicking it opens its look choices (owner, 2026-11-12).
   */
  readonly housed?: { readonly placementId: string; readonly kind: string; readonly selections: Readonly<Record<string, string>>; readonly offset: Length; readonly width: Length };
};

export type EndOption = 'end_left' | 'end_right';

/**
 * Which catalog end option is a cabinet's end at the low or high end of its wall (the wall's start
 * or end). PROPOSED (DECISIONS END-1): left and right as seen standing in front of the cabinet,
 * facing its doors. A cabinet on the wall's left side faces to the left of the wall's direction,
 * so its left end is toward the wall's end.
 */
export function endOption(side: 'left' | 'right', at: 'low' | 'high'): EndOption {
  return (side === 'left') === (at === 'high') ? 'end_left' : 'end_right';
}

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
    const cat = itemOf(item);
    const saved = (at: 'low' | 'high'): string | null => item.item_selections[endOption(item.position.side, at)] ?? null;
    const hasEnds = cat !== null && (cat.options.includes('end_left') || cat.options.includes('end_right'));
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
      ...(hasEnds ? { ends: { low: saved('low'), high: saved('high') } } : {}),
      selections: item.item_selections,
      ...(item.sections ? { sections: item.sections } : {}),
      ...(item.set_by_hand ? { setByHand: item.set_by_hand } : {}),
      ...(item.drawer_inserts ? { drawerInserts: item.drawer_inserts } : {}),
      leftAt: endOption(item.position.side, 'high') === 'end_left' ? 'high' : 'low',
      ...(item.position.setback ? { setback: item.position.setback } : {}),
      ...(() => {
        // The sink or dishwasher standing in this cabinet (it holds the appliance's middle).
        if (!wall || isUpper(item) || SKINS.has(cat?.type ?? '')) return {};
        const a = wall.appliances.find((x) => {
          const middle = x.offset + x.width.value / 2;
          return lookOptions(x.kind).length > 0 && item.position.offset < middle && middle < item.position.offset + item.width;
        });
        return a ? { housed: { placementId: a.placement_id, kind: a.kind, selections: a.selections ?? {}, offset: a.offset, width: a.width.value } } : {};
      })(),
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
      if (!housed)
        out.push({
          id: a.placement_id,
          code: null,
          appliance: a.kind,
          wallId: wall.wall_id,
          runId,
          layer: 'base',
          offset: a.offset,
          width: a.width.value,
          depth: null,
          elevation: 0,
          height: 0,
          reviewed: true,
          ...(lookOptions(a.kind).length ? { housed: { placementId: a.placement_id, kind: a.kind, selections: a.selections ?? {}, offset: a.offset, width: a.width.value } } : {}),
        });
      // An appliance or millwork hood over a range or cooktop; a cabinet there is a placed item.
      const over = overOf(a);
      if (over === 'appliance_hood' || over === 'millwork_hood')
        out.push({ id: `${a.placement_id}-hood`, code: null, appliance: over === 'appliance_hood' ? 'hood' : 'millwork_hood', wallId: wall.wall_id, runId, layer: 'upper', offset: a.offset, width: applianceEnd(a) - a.offset, depth: null, elevation: upperBottom, height: Math.max(0, top - upperBottom), reviewed: true });
    }
  return out;
}

/** The room with the appliances the builder moved (a fridge moved over for its panel) at their new places. */
export function applyMoves(room: Room, design: Pick<PlaceholderDesign, 'moves'>): Room {
  if (design.moves.length === 0) return room;
  const at = new Map(design.moves.map((m) => [m.placementId, m.offset]));
  return { ...room, walls: room.walls.map((w) => ({ ...w, appliances: w.appliances.map((a) => (at.has(a.placement_id) ? { ...a, offset: at.get(a.placement_id)! } : a)) })) };
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
  /**
   * A new width from one side (a 3D handle, or typed with "change on the left or right"): the
   * cabinet beside that side gives or takes the difference; "both": half each side (owner,
   * 2026-11-12: "add it to the right, add it to the left, add equally to both").
   */
  | { readonly kind: 'resize'; readonly id: string; readonly side: 'low' | 'high' | 'both'; readonly width: Length }
  /** Along the wall by `by` (a 3D handle): the cabinets touching it on either side give and take. */
  | { readonly kind: 'move'; readonly id: string; readonly by: Length }
  /** Its height, depth, height off the floor or distance from the wall (3D handles); only what is given changes. */
  | { readonly kind: 'box'; readonly id: string; readonly height?: Length; readonly depth?: Length; readonly elevation?: Length; readonly setback?: Length }
  | { readonly kind: 'type'; readonly id: string; readonly code: string }
  /** A catalog option the cabinet offers (door opening, ends, back); null clears it. */
  | { readonly kind: 'option'; readonly id: string; readonly option: string; readonly value: string | null }
  /** The front and interior as divided in Customize; null puts it back to its catalog type's. */
  | { readonly kind: 'sections'; readonly id: string; readonly sections: FrontSection | null }
  /**
   * Splits a cabinet into two separate cabinets of its type (owner, 2026-11-12: "splitting results
   * in two new individual cabinets"): side by side, each half the width on the catalog's width
   * step, or stacked, each half the height. `newId` is the second cabinet's ID.
   */
  | { readonly kind: 'split'; readonly id: string; readonly direction: 'side_by_side' | 'stacked'; readonly newId: string }
  /** A library choice (owner, 2026-11-13): a catalog cabinet of the same kind with its front and interior. */
  | { readonly kind: 'preset'; readonly id: string; readonly code: string; readonly sections: FrontSection | null }
  /** A drawer's insert (owner, 2026-11-13), by drawer number from the top; null takes it out. */
  | { readonly kind: 'insert'; readonly id: string; readonly drawer: number; readonly insert: string | null }
  /** How an appliance looks (owner, 2026-11-12): a choice from the appliance-look list. */
  | { readonly kind: 'appliance'; readonly placementId: string; readonly option: string; readonly value: string }
  | { readonly kind: 'approve'; readonly ids: readonly string[] };

const sameRow = (a: PlacedItem, b: PlacedItem) => a.position.wall_id === b.position.wall_id && a.position.side === b.position.side && isUpper(a) === isUpper(b);
const byDesigner = (i: PlacedItem): PlacedItem => ({ ...i, origin: { ...i.origin, last_edited_by: 'designer' } });
const positive = (v: Length | undefined) => v === undefined || (Number.isSafeInteger(v) && v > 0);
const notNegative = (v: Length | undefined) => v === undefined || (Number.isSafeInteger(v) && v >= 0);

/** The cabinets touching `cab` at its low and high end, in its row. */
function touching(room: Room, cab: PlacedItem): { low: PlacedItem | null; high: PlacedItem | null } {
  const row = room.items.filter((x) => x !== cab && sameRow(x, cab));
  return {
    low: row.find((x) => x.position.offset + x.width === cab.position.offset) ?? null,
    high: row.find((x) => x.position.offset === cab.position.offset + cab.width) ?? null,
  };
}

/** True when `span` overlaps anything else in `cab`'s row, besides `except`. */
function overlapsRow(room: Room, cab: PlacedItem, span: { start: Length; end: Length }, except: readonly PlacedItem[]): boolean {
  return room.items.some((x) => x !== cab && !except.includes(x) && sameRow(x, cab) && x.position.offset < span.end && span.start < x.position.offset + x.width);
}

/**
 * Changes placed items. A new width takes the difference from the cabinet or filler right beside
 * it (after it first, then before it; or the side asked), so the run keeps its length; with
 * nothing beside it, it may grow only into open space. A move along the wall is taken up by the
 * cabinets touching it on each side (owner, 2026-11-12: "the adjacent cabinets should adjust").
 * Refused, with the reason, when nothing can give or take it. A type change stays within the
 * catalog item's type; an option must be one the cabinet offers, with a value the catalog lists.
 */
export function editItems(room: Room, edit: ItemEdit): Result<Room> {
  if (edit.kind === 'approve') {
    const ids = new Set(edit.ids);
    return { ok: true, value: { ...room, items: room.items.map((i) => (ids.has(i.item_instance_id) ? { ...i, origin: { ...i.origin, approved: true } } : i)) } };
  }
  if (edit.kind === 'appliance') {
    const wall = room.walls.find((w) => w.appliances.some((a) => a.placement_id === edit.placementId));
    const a = wall?.appliances.find((x) => x.placement_id === edit.placementId);
    if (!wall || !a) return { ok: false, reason: 'That appliance is no longer in the room.' };
    const problem = lookProblem(a.kind, edit.option, edit.value);
    if (problem) return { ok: false, reason: problem };
    const next = { ...a, selections: { ...(a.selections ?? {}), [edit.option]: edit.value } };
    return { ok: true, value: { ...room, walls: room.walls.map((w) => (w === wall ? { ...w, appliances: w.appliances.map((x) => (x === a ? next : x)) } : w)) } };
  }
  const cab = room.items.find((i) => i.item_instance_id === edit.id);
  if (!cab) return { ok: false, reason: 'An appliance or hood is moved on the Room drawing step.' };
  const replace = (changes: ReadonlyMap<PlacedItem, PlacedItem>): Result<Room> => ({
    ok: true,
    value: { ...room, items: room.items.map((x) => changes.get(x) ?? x).filter((x) => x.width > 0) },
  });
  if (edit.kind === 'type') {
    const now = itemOf(cab);
    const next = itemByCode(edit.code);
    if (!now || !next) return { ok: false, reason: `"${edit.code}" isn't in the catalog.` };
    if (now.type !== next.type) return { ok: false, reason: `A ${now.name.toLowerCase()} can only change to another cabinet of the same kind.` };
    // The new cabinet shows its own front: a front divided for the old one is dropped, with its inserts.
    const { sections: _s, drawer_inserts: _d, ...rest } = cab;
    void _s;
    void _d;
    return replace(new Map([[cab, byDesigner({ ...rest, catalog_item_id: next.id })]]));
  }
  if (edit.kind === 'preset') {
    const now = itemOf(cab);
    const next = itemByCode(edit.code);
    if (!now || !next) return { ok: false, reason: `"${edit.code}" isn't in the catalog.` };
    if (now.type !== next.type) return { ok: false, reason: `A ${now.name.toLowerCase()} can only change to another cabinet of the same kind.` };
    const { sections: _s, drawer_inserts: _d, ...rest } = cab;
    void _s;
    void _d;
    if (edit.sections === null) return replace(new Map([[cab, byDesigner({ ...rest, catalog_item_id: next.id })]]));
    const checked = FrontSectionSchema.safeParse(edit.sections);
    if (!checked.success) return { ok: false, reason: `That cabinet's front can't be saved: ${checked.error.issues[0]?.message ?? 'not valid'}.` };
    return replace(new Map([[cab, byDesigner({ ...rest, catalog_item_id: next.id, sections: checked.data })]]));
  }
  if (edit.kind === 'insert') {
    if (!Number.isSafeInteger(edit.drawer) || edit.drawer < 1) return { ok: false, reason: 'Pick a drawer.' };
    if (edit.insert !== null && !DRAWER_INSERTS.some((i) => i.code === edit.insert)) return { ok: false, reason: `"${edit.insert}" isn't one of the drawer inserts.` };
    const inserts: Record<string, string> = { ...(cab.drawer_inserts ?? {}) };
    if (edit.insert === null) delete inserts[String(edit.drawer)];
    else inserts[String(edit.drawer)] = edit.insert;
    const { drawer_inserts: _d, ...rest } = cab;
    void _d;
    return replace(new Map([[cab, byDesigner({ ...rest, ...(Object.keys(inserts).length ? { drawer_inserts: inserts } : {}) })]]));
  }
  if (edit.kind === 'option') {
    const item = itemOf(cab);
    if (!item) return { ok: false, reason: 'This cabinet type is no longer in the catalog.' };
    const option = CURRENT_CATALOG.options.find((o) => o.code === edit.option);
    if (!option || !item.options.includes(edit.option)) return { ok: false, reason: `A ${item.name.toLowerCase()} has no ${option?.name.toLowerCase() ?? `"${edit.option}"`} choice.` };
    if (edit.value !== null && !option.values.some((v) => v.code === edit.value)) return { ok: false, reason: `"${edit.value}" isn't a choice for ${option.name.toLowerCase()}.` };
    const selections = { ...cab.item_selections };
    if (edit.value === null) delete selections[edit.option];
    else selections[edit.option] = edit.value;
    // Recorded as set by hand, so working ends out again never changes it (END-4); clearing it
    // hands it back to the layout (Customize then works the end out at once).
    const hand = new Set(cab.set_by_hand ?? []);
    if (edit.value === null) hand.delete(edit.option);
    else hand.add(edit.option);
    const { set_by_hand: _old, ...rest } = cab;
    void _old;
    return replace(new Map([[cab, byDesigner({ ...rest, item_selections: selections, ...(hand.size ? { set_by_hand: [...hand].sort() } : {}) })]]));
  }
  if (edit.kind === 'split') {
    if (room.items.some((i) => i.item_instance_id === edit.newId)) return { ok: false, reason: 'The new cabinet’s ID is already in use.' };
    const step = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.widthStep : 1;
    const along = edit.direction === 'side_by_side' ? cab.width : cab.height;
    const first = Math.floor(along / 2 / step) * step;
    if (first <= 0 || along - first <= 0) return { ok: false, reason: 'This cabinet is too small to split.' };
    // Each half keeps the cabinet's choices, except ends, which the layout works out again, and its divided front.
    const keep = Object.fromEntries(Object.entries(cab.item_selections).filter(([o]) => o !== 'end_left' && o !== 'end_right'));
    const hand = (cab.set_by_hand ?? []).filter((o) => o !== 'end_left' && o !== 'end_right');
    const { sections: _s, set_by_hand: _h, ...plain } = cab;
    void _s;
    void _h;
    const base = { ...plain, item_selections: keep, ...(hand.length ? { set_by_hand: hand } : {}) };
    const a: PlacedItem = byDesigner(edit.direction === 'side_by_side' ? { ...base, width: first } : { ...base, height: first });
    const b: PlacedItem = byDesigner(
      edit.direction === 'side_by_side'
        ? { ...base, item_instance_id: edit.newId, width: along - first, position: { ...cab.position, offset: cab.position.offset + first } }
        : { ...base, item_instance_id: edit.newId, height: along - first, position: { ...cab.position, elevation: cab.position.elevation + first } },
    );
    const items = room.items.flatMap((x) => (x === cab ? [a, b] : [x]));
    return { ok: true, value: { ...room, items } };
  }
  if (edit.kind === 'sections') {
    if (edit.sections === null) {
      const { sections: _drop, ...rest } = cab;
      void _drop;
      return replace(new Map([[cab, byDesigner(rest)]]));
    }
    const checked = FrontSectionSchema.safeParse(edit.sections);
    if (!checked.success) return { ok: false, reason: `The cabinet's sections can't be saved: ${checked.error.issues[0]?.message ?? 'not valid'}.` };
    return replace(new Map([[cab, byDesigner({ ...cab, sections: checked.data })]]));
  }
  if (edit.kind === 'box') {
    if (!positive(edit.height) || !positive(edit.depth)) return { ok: false, reason: 'The height and depth must be more than zero.' };
    if (!notNegative(edit.elevation) || !notNegative(edit.setback)) return { ok: false, reason: 'A cabinet can’t go below the floor or into the wall.' };
    const next = byDesigner({
      ...cab,
      height: edit.height ?? cab.height,
      depth: edit.depth ?? cab.depth,
      position: { ...cab.position, elevation: edit.elevation ?? cab.position.elevation, setback: edit.setback ?? cab.position.setback },
    });
    return replace(new Map([[cab, next]]));
  }
  if (edit.kind === 'move') {
    if (!Number.isSafeInteger(edit.by)) return { ok: false, reason: 'The move must be a whole number of 1/64".' };
    if (edit.by === 0) return { ok: true, value: room };
    const { low, high } = touching(room, cab);
    const changes = new Map<PlacedItem, PlacedItem>();
    const at = cab.position.offset + edit.by;
    changes.set(cab, byDesigner({ ...cab, position: { ...cab.position, offset: at } }));
    // The side it moves toward gives up the space; the side it leaves takes it.
    const toward = edit.by > 0 ? high : low;
    const away = edit.by > 0 ? low : high;
    if (toward) {
      const left = toward.width - Math.abs(edit.by);
      if (left < 0) return { ok: false, reason: `The cabinet beside it is only ${formatInches(toward.width)} wide, so this one can move ${formatInches(toward.width)} that way at most.` };
      changes.set(toward, byDesigner({ ...toward, width: left, position: { ...toward.position, offset: edit.by > 0 ? toward.position.offset + edit.by : toward.position.offset } }));
    } else if (overlapsRow(room, cab, { start: at, end: at + cab.width }, [])) return { ok: false, reason: 'It would run into the next cabinet.' };
    if (away) changes.set(away, byDesigner({ ...away, width: away.width + Math.abs(edit.by), position: { ...away.position, offset: edit.by < 0 ? away.position.offset + edit.by : away.position.offset } }));
    return replace(changes);
  }
  const width = edit.width;
  if (!Number.isSafeInteger(width) || width <= 0) return { ok: false, reason: 'The width must be more than zero.' };
  if (edit.kind === 'resize' && edit.side === 'both') {
    // Half the change on each side, the low side taking any odd 1/64".
    const diff = width - cab.width;
    const low = Math.round(diff / 2);
    const first = editItems(room, { kind: 'resize', id: edit.id, side: 'low', width: cab.width + low });
    if (!first.ok) return first;
    return editItems(first.value, { kind: 'resize', id: edit.id, side: 'high', width });
  }
  const diff = width - cab.width;
  if (diff === 0) return { ok: true, value: room };
  const { low, high } = touching(room, cab);
  const side: 'low' | 'high' = edit.kind === 'resize' && edit.side !== 'both' ? edit.side : high ? 'high' : 'low';
  const nb = side === 'high' ? high : low;
  const offset = side === 'low' ? cab.position.offset - diff : cab.position.offset;
  if (!nb) {
    // Nothing beside it on that side: it may shrink, or grow into open space.
    if (edit.kind === 'width' && !low && !high) return { ok: false, reason: 'Nothing beside it can give or take the difference. Change the run on the Room drawing step.' };
    if (diff > 0 && overlapsRow(room, cab, { start: offset, end: offset + width }, [])) return { ok: false, reason: 'It would run into the next cabinet.' };
    if (offset < 0) return { ok: false, reason: 'It would run past the start of the wall.' };
    return replace(new Map([[cab, byDesigner({ ...cab, width, position: { ...cab.position, offset } })]]));
  }
  const left = nb.width - diff;
  if (left < 0) return { ok: false, reason: `The cabinet beside it is only ${formatInches(nb.width)} wide, so this one can grow by that much at most.` };
  return replace(
    new Map([
      [cab, byDesigner({ ...cab, width, position: { ...cab.position, offset } })],
      [nb, byDesigner({ ...nb, width: left, position: { ...nb.position, offset: side === 'high' ? nb.position.offset + diff : nb.position.offset } })],
    ]),
  );
}

/** Replaces one run's cabinets with freshly laid-out ones, keeping the rest of the room as it is. */
export function replaceRunItems(room: Room, fresh: readonly PlacedItem[], runId: string): Room {
  const inRun = (i: PlacedItem) => {
    const wall = room.walls.find((w) => w.wall_id === i.position.wall_id);
    return wall ? runAt(wall, i.position.offset, i.width) === runId : false;
  };
  return { ...room, items: [...room.items.filter((i) => !inRun(i)), ...fresh.filter(inRun)] };
}
