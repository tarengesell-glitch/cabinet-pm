import { describe, expect, it } from 'vitest';
import { examples, type Room } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import { ITEM_CHECKS, JobSchema, runChecks } from '@/core/index';
import { DRAFT_SETTINGS, draftPlaceholder, fillWidths, type DraftPreferences, type PlaceholderDesign } from '../model/placeholder-draft';
import { cabinetViews, editItems, placeholderItems, replaceRunItems } from '../model/cabinets';
import { LAYOUT_RULES } from '../model/layout-rules';

const IN = 64;
const kitchen = (): Room => examples.kitchen().rooms[0]!;
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const prefs = (p: Partial<DraftPreferences> = {}): DraftPreferences => ({ drawers: 'minimum', cornerInsert: 'lazy_susan', garbage: 'none', cabinetTop: 'ceiling', ...p });
const draft = (p?: Partial<DraftPreferences>): PlaceholderDesign => {
  const r = draftPlaceholder(kitchen(), prefs(p), ids);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('the placeholder fill (no AI)', () => {
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
    const rows = new Map<string, typeof d.cabinets>();
    for (const c of d.cabinets) rows.set(`${c.runId}/${c.layer}`, [...(rows.get(`${c.runId}/${c.layer}`) ?? []), c]);
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
