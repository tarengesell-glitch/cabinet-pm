import { describe, expect, it } from 'vitest';
import { examples, type Room } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import { ITEM_CHECKS, JobSchema, runChecks } from '@/core/index';
import { DRAFT_SETTINGS, draftPlaceholder, equalFlank, fillWidths, type DraftPreferences, type PlaceholderDesign } from '../model/placeholder-draft';
import { realKitchenRoom } from './real-kitchen';
import { applyMoves, cabinetViews, editItems, placeholderItems, replaceRunItems } from '../model/cabinets';
import { LAYOUT_RULES } from '../model/layout-rules';

const IN = 64;
const kitchen = (): Room => examples.kitchen().rooms[0]!;
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const prefs = (p: Partial<DraftPreferences> = {}): DraftPreferences => ({ drawers: 'minimum', cornerInsert: 'lazy_susan', garbage: 'none', cabinetTop: 'ceiling', roomSet: 'kitchen', ...p });
const draft = (p?: Partial<DraftPreferences>): PlaceholderDesign => {
  const r = draftPlaceholder(kitchen(), prefs(p), ids);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

/** The example kitchen with every range and cooktop given `above`. */
const kitchenWith = (above: 'cabinet' | 'millwork_hood'): Room => {
  const r = kitchen();
  return { ...r, walls: r.walls.map((w) => ({ ...w, appliances: w.appliances.map((a) => (a.kind === 'range' || a.kind === 'cooktop' ? { ...a, above } : a)) })) };
};

describe('the placeholder fill (no AI)', () => {
  it('follows what is chosen over the range: a cabinet centred on it, or a millwork hood (owner, 2026-11-09)', () => {
    const wall = kitchen().walls.find((w) => w.appliances.some((a) => a.kind === 'range' || a.kind === 'cooktop'))!;
    const cooker = wall.appliances.find((a) => a.kind === 'range' || a.kind === 'cooktop')!;
    const withCabinet = draftPlaceholder(kitchenWith('cabinet'), prefs(), ids);
    if (!withCabinet.ok) throw new Error(withCabinet.reason);
    expect(withCabinet.value.cabinets.some((c) => c.appliance === 'hood')).toBe(false);
    const over = withCabinet.value.cabinets.filter((c) => c.wallId === wall.wall_id && c.layer === 'upper' && c.offset < cooker.offset + cooker.width.value && c.offset + c.width > cooker.offset);
    expect(over.map((c) => [c.code, c.offset, c.width])).toEqual([['upper_no_shelf', cooker.offset, cooker.width.value]]);
    expect(withCabinet.value.notes.some((n) => n.includes('30"'))).toBe(true);
    const withMillwork = draftPlaceholder(kitchenWith('millwork_hood'), prefs(), ids);
    if (!withMillwork.ok) throw new Error(withMillwork.reason);
    expect(withMillwork.value.cabinets.filter((c) => c.appliance === 'millwork_hood')).toHaveLength(1);
  });


  it('reads its data, and every cabinet type it uses is in the catalog', () => {
    expect(DRAFT_SETTINGS.ok).toBe(true);
  });

  it('splits a stretch into equal cabinets in whole steps, with a filler for the rest', () => {
    const s = { largestWidth: 36 * IN, widthStep: 3 * IN };
    expect(fillWidths(72 * IN, s, 9 * IN)).toEqual({ widths: [36 * IN, 36 * IN], filler: 0 });
    expect(fillWidths(80 * IN, s, 9 * IN)).toEqual({ widths: [27 * IN, 27 * IN, 24 * IN], filler: 2 * IN });
    expect(fillWidths(5 * IN, s, 9 * IN)).toEqual({ widths: [], filler: 5 * IN });
  });

  it('fills every run of the example kitchen with catalog cabinets that never overlap', () => {
    const d = draft();
    expect(d.cabinets.length).toBeGreaterThan(5);
    for (const c of d.cabinets) {
      if (c.code !== null) expect(CURRENT_CATALOG.items.some((i) => i.code === c.code)).toBe(true);
      expect(c.reviewed).toBe(false);
    }
    // Cabinets never overlap each other. An appliance drawn into a corner cabinet's space is shown, with a note.
    const rows = new Map<string, typeof d.cabinets>();
    for (const c of d.cabinets.filter((x) => x.code !== null && !x.back)) rows.set(`${c.runId}/${c.layer}`, [...(rows.get(`${c.runId}/${c.layer}`) ?? []), c]);
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.offset).toBeGreaterThanOrEqual(sorted[i - 1]!.offset + sorted[i - 1]!.width);
    }
    expect(d.cabinets.some((c) => c.code === 'sink_base')).toBe(true);
    expect(d.cabinets.some((c) => c.appliance === 'hood')).toBe(true);
    expect(d.notes.length).toBeGreaterThan(0);
  });

  it('is the same every time for the same room (no clock, no randomness)', () => {
    n = 0;
    const a = draft();
    n = 0;
    const b = draft();
    expect(b).toEqual(a);
  });

  it('follows the drawer level', () => {
    const codes = (d: PlaceholderDesign) => d.cabinets.map((c) => c.code);
    expect(codes(draft({ drawers: 'maximum' }))).not.toContain('base_drawer_doors');
    const min = codes(draft({ drawers: 'minimum' }));
    expect(min.filter((c) => c === 'base_3_drawers')).toHaveLength(1);
  });

  it('puts a garbage pull-out beside the sink when asked for a cabinet of its own', () => {
    expect(draft({ garbage: 'dedicated_cabinet' }).cabinets.some((c) => c.code === 'garbage_pullout')).toBe(true);
  });
});

/** The example kitchen with the placeholder's cabinets placed in its master copy. */
function placed(p?: Partial<DraftPreferences>): Room {
  const room = kitchen();
  const items = placeholderItems(room, draft(p));
  if (!items.ok) throw new Error(items.reason);
  return { ...room, items: items.value };
}

describe('placed in the master copy', () => {
  it('becomes valid placed items (catalog IDs, exact positions on the room’s side) that pass Core’s item checks', () => {
    const room = placed();
    const job = { ...examples.kitchen(), rooms: [room] };
    expect(JobSchema.safeParse(job).success).toBe(true);
    expect(room.items.length).toBeGreaterThan(5);
    for (const i of room.items) {
      expect(CURRENT_CATALOG.items.some((c) => c.id === i.catalog_item_id)).toBe(true);
      expect(i.position.side).toBe('left'); // the example is drawn counter-clockwise
      expect(i.origin).toEqual({ placed_by: 'ai', last_edited_by: 'ai', approved: false });
    }
    expect(runChecks(ITEM_CHECKS, job, {}).issues).toEqual([]);
  });

  it('shows appliances and a hood beside the cabinets, from the wall’s appliance placements', () => {
    const views = cabinetViews(placed());
    expect(views.some((v) => v.appliance === 'range')).toBe(true);
    // The sink stands inside its sink base, so it isn't drawn again.
    expect(views.some((v) => v.appliance === 'sink')).toBe(false);
    expect(views.some((v) => v.appliance === 'hood')).toBe(true);
  });
});

describe('changing placed cabinets', () => {
  it('a new width takes the difference from the cabinet beside it, so the run keeps its length', () => {
    const room = placed();
    const views = cabinetViews(room).filter((v) => v.code === 'upper_doors').sort((a, b) => a.offset - b.offset);
    const a = views[0]!;
    const r = editItems(room, { kind: 'width', id: a.id, width: a.width - 3 * IN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a2 = r.value.items.find((x) => x.item_instance_id === a.id)!;
    const b2 = r.value.items.find((x) => x.position.offset === a2.position.offset + a2.width && x.position.elevation === a2.position.elevation)!;
    expect(b2).toBeDefined();
    expect(a2.origin.last_edited_by).toBe('designer');
    const before = room.items.filter((x) => x.position.wall_id === a2.position.wall_id && x.position.elevation === a2.position.elevation).reduce((t, x) => t + x.width, 0);
    const after = r.value.items.filter((x) => x.position.wall_id === a2.position.wall_id && x.position.elevation === a2.position.elevation).reduce((t, x) => t + x.width, 0);
    expect(after).toBe(before);
  });

  it('refuses a width the neighbour can’t give, keeps types within their kind, and leaves appliances to the drawing', () => {
    const room = placed();
    const up = cabinetViews(room).find((c) => c.code === 'upper_doors')!;
    expect(editItems(room, { kind: 'width', id: up.id, width: up.width + 400 * IN }).ok).toBe(false);
    expect(editItems(room, { kind: 'type', id: up.id, code: 'base_doors' }).ok).toBe(false);
    expect(editItems(room, { kind: 'type', id: up.id, code: 'upper_with_lights' }).ok).toBe(true);
    const range = cabinetViews(room).find((c) => c.appliance === 'range')!;
    expect(editItems(room, { kind: 'width', id: range.id, width: range.width }).ok).toBe(false);
  });

  it('approving marks cabinets approved; re-drafting a run replaces only that run', () => {
    const room = placed();
    const all = editItems(room, { kind: 'approve', ids: room.items.map((c) => c.item_instance_id) });
    expect(all.ok && all.value.items.every((c) => c.origin.approved)).toBe(true);
    if (!all.ok) return;
    const runId = cabinetViews(room).find((v) => v.code !== null)!.runId;
    const fresh = placeholderItems(room, draft());
    if (!fresh.ok) throw new Error(fresh.reason);
    const again = replaceRunItems(all.value, fresh.value, runId);
    const inRun = new Set(cabinetViews(again).filter((v) => v.runId === runId && v.code !== null).map((v) => v.id));
    expect(again.items.filter((i) => inRun.has(i.item_instance_id)).every((i) => !i.origin.approved)).toBe(true);
    expect(again.items.filter((i) => !inRun.has(i.item_instance_id)).every((i) => i.origin.approved)).toBe(true);
  });

  it('gives an empty design for a room with no cabinet runs', () => {
    const room = { ...kitchen(), walls: kitchen().walls.map((w) => ({ ...w, runs: [], appliances: [] })) };
    const r = draftPlaceholder(room, prefs(), ids, LAYOUT_RULES);
    expect(r.ok && r.value.cabinets.length).toBe(0);
  });
});

describe('heights', () => {
  it('takes every upper and tall cabinet to the same top line: the ceiling when asked', () => {
    const d = draft({ cabinetTop: 'ceiling' });
    const ceiling = kitchen().ceiling_height.value;
    expect(d.upperTop).toBe(ceiling);
    for (const c of d.cabinets.filter((x) => x.layer === 'upper' && x.code !== null)) expect(c.elevation + c.height).toBe(ceiling);
    for (const c of d.cabinets.filter((x) => x.code === 'tall_pantry' || x.code === 'tall_oven')) expect(c.height).toBe(ceiling);
  });

  it('uses a picked height, never above the ceiling, and says so when none was chosen', () => {
    expect(draft({ cabinetTop: 84 * IN }).upperTop).toBe(84 * IN);
    const high = draft({ cabinetTop: 120 * IN });
    expect(high.upperTop).toBe(kitchen().ceiling_height.value);
    expect(high.notes.join(' ')).toMatch(/above the .* ceiling/);
    const none = draft({ cabinetTop: null });
    expect(none.notes.join(' ')).toMatch(/No cabinet height was chosen/);
  });
});

/** The example kitchen with wall 1 cleared (no window, no appliances) and given these appliances. */
const wallOneWith = (...apps: readonly { kind: string; offset: number; width: number }[]): Room => {
  const r = kitchen();
  const template = r.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'range')!;
  const plain = { ...template };
  delete plain.above;
  return {
    ...r,
    walls: r.walls.map((w, i) =>
      i === 0
        ? {
            ...w,
            openings: [],
            appliances: apps.map((a, k) => ({ ...plain, placement_id: `00000000-0000-4000-8000-${String(900 + k).padStart(12, '0')}`, kind: a.kind, offset: a.offset, width: { ...plain.width, value: a.width }, paired_with: null })),
          }
        : { ...w, appliances: w.appliances.filter((a) => a.kind !== 'range') },
    ),
  };
};
const draftOf = (room: Room, p?: Partial<DraftPreferences>): PlaceholderDesign => {
  const r = draftPlaceholder(room, prefs(p), ids);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('owner fixes, 2026-11-10 (after trying a real job)', () => {
  it('makes every corner where runs overlap an L-shaped 90-degree corner cabinet, never a blind corner', () => {
    for (const [insert, code] of [
      [null, 'corner_base'],
      ['lazy_susan', 'corner_base'],
      ['double_shelf', 'corner_base_adjustable'],
    ] as const) {
      const d = draft({ cornerInsert: insert });
      expect(d.cabinets.filter((c) => c.layer === 'base' && c.code?.startsWith('corner_')).map((c) => c.code)).toEqual([code]);
      expect(d.cabinets.some((c) => c.code === 'blind_corner_base')).toBe(false);
      expect(d.notes.join(' ')).toMatch(/L-shaped corner cabinets/);
    }
    // The wall that ends at the corner stops where the L's other leg starts (its depth along this wall).
    const d = draft({ cornerInsert: null });
    const room = kitchen();
    const wallA = room.walls[0]!.wall_id;
    const lastBase = Math.max(...d.cabinets.filter((c) => c.wallId === wallA && c.layer === 'base').map((c) => c.offset + c.width));
    const corner = d.cabinets.find((c) => c.code === 'corner_base')!;
    expect(corner.wallId).toBe(room.walls[1]!.wall_id);
    expect(lastBase).toBeLessThanOrEqual(144 * IN - 9 * IN / 4 - 36 * IN);
    expect(d.cabinets.find((c) => c.code === 'upper_corner_90')).toBeDefined();
  });

  it('leaves 2" clear each side of a hood, with the same width of upper either side', () => {
    const d = draftOf(wallOneWith({ kind: 'range', offset: 60 * IN, width: 30 * IN }));
    const wallA = kitchen().walls[0]!.wall_id;
    const uppers = d.cabinets.filter((c) => c.wallId === wallA && c.layer === 'upper' && c.code !== null).sort((a, b) => a.offset - b.offset);
    const left = uppers.filter((c) => c.offset + c.width <= 60 * IN).at(-1)!;
    const right = uppers.find((c) => c.offset >= 90 * IN)!;
    expect(left.offset + left.width).toBe(58 * IN);
    expect(right.offset).toBe(92 * IN);
    expect(left.code).toBe('upper_doors');
    expect(right.width).toBe(left.width);
    expect(uppers.some((c) => c.offset < 92 * IN && c.offset + c.width > 58 * IN)).toBe(false);
  });

  it('splits the bases below so a joint lines up with the outer edge of each upper beside the hood (owner, 2026-11-10)', () => {
    const d = draftOf(wallOneWith({ kind: 'range', offset: 60 * IN, width: 30 * IN }));
    const wallA = kitchen().walls[0]!.wall_id;
    const row = (layer: 'base' | 'upper') => d.cabinets.filter((c) => c.wallId === wallA && c.layer === layer && c.code !== null);
    const left = row('upper').filter((c) => c.offset + c.width <= 60 * IN).sort((a, b) => b.offset - a.offset)[0]!;
    expect(row('base').some((c) => c.offset === left.offset || c.offset + c.width === left.offset)).toBe(true);
  });

  it('puts a full-height 26" panel on each side of a fridge, and the cabinet over it 2" above the fridge', () => {
    const d = draftOf(wallOneWith({ kind: 'fridge', offset: 60 * IN, width: 36 * IN }));
    const s = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value : null;
    const panels = d.cabinets.filter((c) => c.code === 'tall_filler').sort((a, b) => a.offset - b.offset);
    expect(panels.map((p) => [p.offset, p.width, p.depth, p.elevation, p.height])).toEqual([
      [60 * IN - 48, 48, 26 * IN, 0, d.upperTop],
      [96 * IN, 48, 26 * IN, 0, d.upperTop],
    ]);
    const over = d.cabinets.find((c) => c.code === 'upper_no_shelf' && c.depth !== null)!;
    expect([over.offset, over.width]).toEqual([60 * IN, 36 * IN]);
    expect(over.elevation).toBe(s!.visual.fridgeHeight + 2 * IN);
    expect(over.elevation + over.height).toBe(d.upperTop);
    // Nothing else stands where the panels are.
    for (const p of panels) expect(d.cabinets.filter((c) => c !== p && c.wallId === p.wallId && c.code !== null && c.offset < p.offset + p.width && c.offset + c.width > p.offset)).toEqual([]);
    expect(d.notes.join(' ')).toMatch(/full-height panel/);
  });

  it('puts the dishwasher touching the sink base, and draws it once (inside its opening)', () => {
    const d = draft();
    const sb = d.cabinets.find((c) => c.code === 'sink_base')!;
    const dw = d.cabinets.find((c) => c.code === 'dishwasher_opening')!;
    expect(dw.offset === sb.offset + sb.width || dw.offset + dw.width === sb.offset).toBe(true);
    const views = cabinetViews(placed());
    expect(views.filter((v) => v.appliance === 'dishwasher')).toEqual([]);
    expect(views.filter((v) => v.code === 'dishwasher_opening')).toHaveLength(1);
  });

  it('covers an island’s back with a finished back panel on the far side of its line', () => {
    const r = kitchen();
    const island = {
      ...r.walls[0]!,
      wall_id: '00000000-0000-4000-8000-000000000105',
      kind: 'floating' as const,
      start_point: { x: 36 * IN, y: 66 * IN },
      end_point: { x: 108 * IN, y: 66 * IN },
      thickness: null,
      openings: [],
      obstacles: [],
      runs: [{ run_id: '00000000-0000-4000-8000-000000000604', kind: 'base' as const, offset: 0, length: 72 * IN, depth: 36 * IN }],
      appliances: [],
    };
    const room = { ...r, walls: [...r.walls, island] };
    const d = draftOf(room);
    const backs = d.cabinets.filter((c) => c.back);
    expect(backs.map((c) => [c.code, c.wallId, c.offset, c.width])).toEqual([['island_back_panel', island.wall_id, 0, 72 * IN]]);
    const items = placeholderItems(room, d);
    if (!items.ok) throw new Error(items.reason);
    const panel = items.value.find((i) => i.position.wall_id === island.wall_id && i.position.side === 'right')!;
    expect(panel.depth).toBe(48);
    expect(items.value.filter((i) => i.position.wall_id === island.wall_id && i.position.side === 'left').length).toBeGreaterThan(0);
    const job = { ...examples.kitchen(), rooms: [{ ...room, items: items.value }] };
    expect(JobSchema.safeParse(job).success).toBe(true);
    expect(runChecks(ITEM_CHECKS, job, {}).issues).toEqual([]);
    expect(cabinetViews({ ...room, items: items.value }).filter((v) => v.back)).toHaveLength(1);
  });
});

describe('owner fixes, 2026-11-10 round 2 (a real kitchen)', () => {
  const real = (p: Partial<DraftPreferences> = {}) => {
    const r = draftPlaceholder(realKitchenRoom(), prefs({ drawers: 'maximum', garbage: 'dedicated_cabinet', ...p }), ids);
    if (!r.ok) throw new Error(r.reason);
    return r.value;
  };
  const wallA = realKitchenRoom().walls[0]!;
  const range = wallA.appliances.find((a) => a.kind === 'range')!;

  it('makes cabinets to fit the space on the 1/16" step, not 3" steps with a filler ("Widths are custom and made to fit the space")', () => {
    const s = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value : null;
    expect(s!.widthStep).toBe(4); // 1/16"
    expect(fillWidths(29 * IN + 56, s!, 9 * IN)).toEqual({ widths: [29 * IN + 56], filler: 0 }); // 29 7/8": one cabinet
    expect(fillWidths(94 * IN, s!, 9 * IN)).toEqual({ widths: [31 * IN + 24, 31 * IN + 20, 31 * IN + 20], filler: 0 });
    expect(fillWidths(94 * IN + 2, s!, 9 * IN).filler).toBe(2); // only a sliver under one step is left over
    // The real kitchen: no fillers but the one beside the hood's flank, against the corner.
    const d = real();
    const fillers = d.cabinets.filter((c) => c.code === 'base_filler' || c.code === 'wall_filler');
    expect(fillers.map((f) => [f.wallId, f.width])).toEqual([[wallA.wall_id, 26]]);
  });

  it('cuts the uppers back 2" from a hood even when the range stands in a run of its own', () => {
    const uppers = real().cabinets.filter((c) => c.wallId === wallA.wall_id && c.layer === 'upper' && c.code !== null);
    const near = uppers.filter((c) => c.offset < applianceEndOf(range) + 2 * IN && c.offset + c.width > range.offset - 2 * IN);
    expect(near).toEqual([]);
    const left = uppers.filter((c) => c.offset + c.width <= range.offset).sort((a, b) => b.offset - a.offset)[0]!;
    const right = uppers.filter((c) => c.offset >= applianceEndOf(range)).sort((a, b) => a.offset - b.offset)[0]!;
    expect(left.offset + left.width).toBe(range.offset - 2 * IN);
    expect(right.offset).toBe(applianceEndOf(range) + 2 * IN);
  });

  it('makes the uppers either side of the hood one width, and sizes the base below to line up with them (PREF-019)', () => {
    const d = real();
    const at = (layer: 'base' | 'upper', side: 'low' | 'high') => {
      const row = d.cabinets.filter((c) => c.wallId === wallA.wall_id && c.layer === layer && c.code !== null && c.code !== 'tall_filler' && !c.depth);
      return side === 'low' ? row.filter((c) => c.offset + c.width <= range.offset).sort((a, b) => b.offset - a.offset)[0]! : row.filter((c) => c.offset >= applianceEndOf(range)).sort((a, b) => a.offset - b.offset)[0]!;
    };
    const [ul, ur] = [at('upper', 'low'), at('upper', 'high')];
    expect(ul.width).toBe(ur.width);
    expect(ul.width).toBe(27 * IN + 56); // one 27 7/8" upper each side, not split into narrow ones
    // The base beside the range starts where the upper above it starts.
    expect(at('base', 'low').offset).toBe(ul.offset);
    expect(equalFlank(27 * IN + 56, 28 * IN + 16, DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value : (null as never), 9 * IN)).toBe(27 * IN + 56);
  });

  it('uses the vanities in a bathroom, never the kitchen\'s base cabinets', () => {
    const r = kitchen();
    const bath = { ...r, walls: r.walls.map((w) => ({ ...w, appliances: w.appliances.filter((a) => a.kind !== 'range' && a.kind !== 'fridge' && a.kind !== 'dishwasher').map((a) => (a.kind === 'sink' ? { ...a, kind: 'vanity_sink' } : a)) })) };
    const d = draftPlaceholder(bath, prefs({ roomSet: 'bath', drawers: null }), ids);
    if (!d.ok) throw new Error(d.reason);
    const bases = d.value.cabinets.filter((c) => c.layer === 'base' && c.code !== null && !c.code.startsWith('corner') && c.code !== 'tall_pantry');
    expect(bases.length).toBeGreaterThan(0);
    expect(new Set(bases.map((c) => c.code))).toEqual(new Set(['vanity_sink', 'vanity_drawer_doors', ...(bases.some((c) => c.code === 'vanity_filler') ? ['vanity_filler'] : [])]));
    expect(d.value.notes).toContain('Vanity cabinets, as this is a bathroom.');
  });
});

const applianceEndOf = (a: { offset: number; width: { value: number } }) => a.offset + a.width.value;

describe('owner fixes, 2026-11-12', () => {
  /** The real kitchen with its fridge pushed against the end of its wall (no room for a panel there). */
  const fridgeAtWall = (): Room => {
    const r = realKitchenRoom();
    return { ...r, walls: r.walls.map((w) => ({ ...w, runs: w.runs.map((x, i) => (i === 0 && w.appliances.some((a) => a.kind === 'fridge') ? { ...x, offset: 9, length: x.length + 45 } : x)), appliances: w.appliances.map((a) => (a.kind === 'fridge' ? { ...a, offset: 9 } : a)) })) };
  };

  it('moves a fridge drawn against the wall over by its panel, so it has a full panel on both sides', () => {
    const room = fridgeAtWall();
    const d = draftPlaceholder(room, prefs(), ids);
    if (!d.ok) throw new Error(d.reason);
    const fridge = room.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'fridge')!;
    const panelW = CURRENT_CATALOG.items.find((i) => i.code === 'tall_filler')!.size.width.default.value!;
    // Moved toward the wall's end by just what the panel needed, never more than the panel's width.
    expect(d.value.moves).toHaveLength(1);
    const at = d.value.moves[0]!.offset;
    expect(d.value.moves[0]!.placementId).toBe(fridge.placement_id);
    expect(at - fridge.offset).toBeGreaterThan(0);
    expect(at - fridge.offset).toBeLessThanOrEqual(panelW);
    const panels = d.value.cabinets.filter((c) => c.code === 'tall_filler').map((c) => [c.offset, c.width]);
    expect(panels).toEqual([
      [at - panelW, panelW],
      [at + fridge.width.value, panelW],
    ]);
    // Saved with the room: the fridge the 3D view draws stands between its panels.
    const moved = applyMoves(room, d.value);
    expect(moved.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'fridge')!.offset).toBe(at);
    expect(d.value.notes.some((n) => n.includes('to make room for its panel'))).toBe(true);
    expect(d.value.notes.some((n) => n.includes('no room for the fridge panel'))).toBe(false);
  });

  it('makes four-drawer banks beside the range and near the sink at every drawer level (PREF-006, PREF-007)', () => {
    for (const drawers of ['minimum', 'moderate', 'maximum'] as const) {
      const d = draftPlaceholder(realKitchenRoom(), prefs({ drawers }), ids);
      if (!d.ok) throw new Error(d.reason);
      const fours = d.value.cabinets.filter((c) => c.code === 'base_4_drawers');
      const range = d.value.cabinets.find((c) => c.appliance === 'range')!;
      const besideRange = fours.filter((c) => c.wallId === range.wallId && (c.offset === range.offset + range.width || c.offset + c.width === range.offset));
      if (drawers === 'minimum') expect(fours).toHaveLength(1);
      else {
        expect(besideRange).toHaveLength(2);
        expect(fours).toHaveLength(3);
        const sink = d.value.cabinets.find((c) => c.code === 'sink_base')!;
        expect(fours.some((c) => c.wallId === sink.wallId)).toBe(true);
      }
      expect(besideRange.length).toBeGreaterThan(0);
    }
  });
});
