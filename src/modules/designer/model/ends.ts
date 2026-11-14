/**
 * Cabinet ends: the one place that decides whether a cabinet's end is open (nothing beside it) and
 * which catalog end value (`end_left` / `end_right`) that gives. The builder saves the result on each
 * placed cabinet; the 3D view only draws what is saved (P6), so the saved design and the picture
 * agree.
 *
 * The rule is data (`data/placeholder-draft.json` "ends", decided 2026-11-07, CB-FACT-10): an end
 * against a wall, a cabinet, a panel or a corner cabinet's leg is unfinished; an end with nothing
 * beside it (an appliance or a window doesn't count) gets an applied finished end.
 *
 * An end a person set in Customize is recorded as set by hand (`PlacedItem.set_by_hand`, DECISIONS
 * END-4) and is never changed by working ends out again: after a layout change (`refreshEnds`),
 * or when a person updates ends to match the layout (`fillEnds`). One the layout now contradicts
 * is listed by `reviewEnds` for a person to look at. Other ends are worked out again after a
 * layout change while their saved value equals what the rule gave before; a different value is
 * kept. Limitation, for ends saved before 2026-11-12 (no record of who set them): a person's
 * choice equal to the rule's old value would be worked out again too. Cabinets saved before ends
 * were stored are listed by `reviewEnds` and filled only when a person asks.
 */
import type { PlacedItem, Result, Room, Wall } from '@/core/index';
import { cabinetViews, endOption, itemOf, type CabinetView, type EndOption } from './cabinets';
import { cornerCabinets, insideSpan, neighbours, type CornerCabinet } from './layout';
import { DRAFT_SETTINGS, itemByCode, standard } from './placeholder-draft';

/** What a cabinet needs to know about the rest of the room: its neighbours and the corners. */
export interface Context {
  readonly room: Room;
  readonly all: readonly CabinetView[];
  readonly corners: readonly CornerCabinet[];
}

/** 1/32": closer than this counts as touching. */
export const TOUCH = 2;

/** The room as the end rule (and the 3D view) sees it. */
export function endContext(room: Room): Context {
  return { room, all: cabinetViews(room), corners: cornerCabinets(room) };
}

/**
 * Whether a cabinet's end at `edge` has nothing beside it: no cabinet, panel or filler at the same
 * height touching it, no wall, and not the other leg of an L-shaped corner cabinet. With
 * `withAppliances`, an appliance on the same layer also counts as beside it (the counter stops at
 * an appliance; the cabinet's end is still finished).
 */
export function endOpen(ctx: Context, c: CabinetView, wall: Wall, edge: number, side: 'low' | 'high', withAppliances = false): boolean {
  const top = c.elevation + c.height;
  const touching = ctx.all.some(
    (o) =>
      o !== c &&
      o.wallId === c.wallId &&
      !o.back &&
      (o.code !== null ? o.elevation < top && c.elevation < o.elevation + o.height : withAppliances && o.layer === c.layer) &&
      (side === 'low' ? Math.abs(o.offset + o.width - edge) <= TOUCH : Math.abs(o.offset - edge) <= TOUCH),
  );
  if (touching) return false;
  if (wall.kind !== 'room') return true;
  const sp = insideSpan(ctx.room, wall);
  // Against the wall it meets at that end; a wall end with no wall joined to it (a room drawn open
  // there) leaves the end open (owner, 2026-11-13: a fridge panel at such an end had no trim return).
  const { before, after } = neighbours(ctx.room, wall);
  if (side === 'low' ? before !== null && edge <= sp.start + TOUCH : after !== null && edge >= sp.end - TOUCH) return false;
  const corner = ctx.corners.find((k) => (side === 'high' ? k.endingWallId : k.startingWallId) === wall.wall_id && (c.layer === 'upper' ? k.upper : k.base));
  if (!corner) return true;
  const legs = ctx.all.filter((o) => o.wallId !== wall.wall_id && o.layer === c.layer && o.code !== null && (itemByCode(o.code)?.type ?? '').startsWith('corner')).map((o) => o.depth ?? (o.code ? standard(o.code, 'depth') : null) ?? 0);
  const leg = legs.length ? Math.max(...legs) : 0;
  return side === 'high' ? edge < sp.end - leg - TOUCH : edge > sp.start + leg + TOUCH;
}

/** The end values the rule gives one cabinet, by catalog option. */
export type EndValues = Partial<Record<EndOption, string>>;

/** The rule's end values for every cabinet it applies to, by item ID. */
export function ruleEnds(room: Room): Result<Map<string, EndValues>> {
  if (!DRAFT_SETTINGS.ok) return DRAFT_SETTINGS;
  const rule = DRAFT_SETTINGS.value.ends;
  const ctx = endContext(room);
  const out = new Map<string, EndValues>();
  for (const item of room.items) {
    const cat = itemOf(item);
    if (!cat || !rule.types.has(cat.type)) continue;
    const view = ctx.all.find((v) => v.id === item.item_instance_id && v.code !== null);
    const wall = room.walls.find((w) => w.wall_id === item.position.wall_id);
    if (!view || !wall) return { ok: false, reason: 'A cabinet stands on a wall that is no longer in the room, so its ends can’t be worked out.' };
    const values: EndValues = {};
    for (const [at, edge] of [
      ['low', view.offset],
      ['high', view.offset + view.width],
    ] as const) {
      const option = endOption(item.position.side, at);
      if (!cat.options.includes(option)) continue;
      values[option] = endOpen(ctx, view, wall, edge, at) ? rule.open : rule.closed;
    }
    out.set(item.item_instance_id, values);
  }
  return { ok: true, value: out };
}

/** The item with these end values, except any end a person set by hand (END-4), which is kept. */
const withValues = (item: PlacedItem, values: EndValues): PlacedItem => {
  const hand = new Set(item.set_by_hand ?? []);
  const kept = Object.fromEntries(Object.entries(values).filter(([o]) => !hand.has(o)));
  return { ...item, item_selections: { ...item.item_selections, ...kept } };
};

/** An end a person set by hand. */
const byHand = (item: PlacedItem, option: string): boolean => (item.set_by_hand ?? []).includes(option);

/** A freshly laid-out room with every cabinet's ends set by the rule. */
export function withRuleEnds(room: Room): Result<Room> {
  const rule = ruleEnds(room);
  if (!rule.ok) return rule;
  return { ok: true, value: { ...room, items: room.items.map((i) => withValues(i, rule.value.get(i.item_instance_id) ?? {})) } };
}

/**
 * The ends after a layout change (a width, a cabinet type, a run laid out again). A new cabinet
 * gets the rule's ends. An existing cabinet's end is worked out again only while it still follows
 * the rule (its saved value is what the rule gave before the change); a different value (a
 * finished end by request) is kept, and a missing one stays missing for `reviewEnds`. A person's
 * choice equal to the rule's old value can't be told apart and is worked out again (END-4).
 */
export function refreshEnds(before: Room, after: Room): Result<Room> {
  const was = ruleEnds(before);
  if (!was.ok) return was;
  const now = ruleEnds(after);
  if (!now.ok) return now;
  const items = after.items.map((item) => {
    const target = now.value.get(item.item_instance_id);
    if (!target) return item;
    const prev = was.value.get(item.item_instance_id);
    const next: EndValues = {};
    for (const [option, value] of Object.entries(target) as [EndOption, string][]) {
      const saved = item.item_selections[option];
      if (prev === undefined || (saved !== undefined && saved === prev[option])) next[option] = value;
    }
    return withValues(item, next);
  });
  return { ok: true, value: { ...after, items } };
}

/** Cabinets whose saved ends don't match the rule: none saved (an older design), or different. */
export interface EndReview {
  /** Cabinets saved before ends were stored: the 3D view shows no finished end on them. */
  readonly missing: readonly string[];
  /** Cabinets with a saved end that differs from the rule: chosen on purpose, or out of date after the room drawing changed. */
  readonly differ: readonly string[];
  /** Cabinets with an end set by hand that the layout now contradicts: listed for a person to look at, never changed (END-4). */
  readonly overridden: readonly string[];
}

export function reviewEnds(room: Room): Result<EndReview> {
  const rule = ruleEnds(room);
  if (!rule.ok) return rule;
  const missing: string[] = [];
  const differ: string[] = [];
  const overridden: string[] = [];
  for (const item of room.items) {
    const target = rule.value.get(item.item_instance_id);
    if (!target) continue;
    const entries = Object.entries(target) as [EndOption, string][];
    const auto = entries.filter(([o]) => !byHand(item, o));
    if (auto.some(([o]) => item.item_selections[o] === undefined)) missing.push(item.item_instance_id);
    else if (auto.some(([o, v]) => item.item_selections[o] !== v)) differ.push(item.item_instance_id);
    if (entries.some(([o, v]) => byHand(item, o) && item.item_selections[o] !== v)) overridden.push(item.item_instance_id);
  }
  return { ok: true, value: { missing, differ, overridden } };
}

/** Sets the listed cabinets' ends from the rule, when a person asks. Nothing else on them changes. */
export function fillEnds(room: Room, ids: readonly string[]): Result<Room> {
  const rule = ruleEnds(room);
  if (!rule.ok) return rule;
  const wanted = new Set(ids);
  return { ok: true, value: { ...room, items: room.items.map((i) => (wanted.has(i.item_instance_id) ? withValues(i, rule.value.get(i.item_instance_id) ?? {}) : i)) } };
}
