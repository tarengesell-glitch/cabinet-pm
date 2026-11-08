import { describe, expect, it } from 'vitest';
import { examples, type Room } from '@/core/index';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import { DRAFT_SETTINGS, draftPlaceholder, editDesign, fillWidths, redraftRun, type DraftPreferences, type PlaceholderDesign } from '../model/placeholder-draft';
import { LAYOUT_RULES } from '../model/layout-rules';

const IN = 64;
const kitchen = (): Room => examples.kitchen().rooms[0]!;
let n = 0;
const ids = () => `cab-${++n}`;
const prefs = (p: Partial<DraftPreferences> = {}): DraftPreferences => ({ drawers: 'minimum', cornerInsert: 'lazy_susan', garbage: 'none', ...p });
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

describe('changing the placeholder design', () => {
  it('a new width takes the difference from the cabinet beside it, so the run keeps its length', () => {
    const d = draft();
    const row = d.cabinets.filter((c) => c.layer === 'upper' && c.code === 'upper_doors');
    const [a, b] = [row[0]!, d.cabinets.find((x) => x.runId === row[0]!.runId && x.layer === 'upper' && x.offset === row[0]!.offset + row[0]!.width)!];
    const r = editDesign(d, { kind: 'width', id: a.id, width: a.width - 3 * IN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a2 = r.value.cabinets.find((x) => x.id === a.id)!;
    const b2 = r.value.cabinets.find((x) => x.id === b.id)!;
    expect(a2.width + b2.width).toBe(a.width + b.width);
    expect(b2.offset).toBe(a2.offset + a2.width);
    expect(a2.reviewed && b2.reviewed).toBe(true);
  });

  it('refuses a width the neighbour can’t give, and keeps types within their kind', () => {
    const d = draft();
    const up = d.cabinets.find((c) => c.code === 'upper_doors')!;
    expect(editDesign(d, { kind: 'width', id: up.id, width: up.width + 400 * IN }).ok).toBe(false);
    expect(editDesign(d, { kind: 'type', id: up.id, code: 'base_doors' }).ok).toBe(false);
    expect(editDesign(d, { kind: 'type', id: up.id, code: 'upper_with_lights' }).ok).toBe(true);
    const hood = d.cabinets.find((c) => c.appliance === 'hood')!;
    expect(editDesign(d, { kind: 'width', id: hood.id, width: hood.width }).ok).toBe(false);
  });

  it('approving marks cabinets reviewed; re-drafting a run replaces only that run', () => {
    const d = draft();
    const all = editDesign(d, { kind: 'approve', ids: d.cabinets.map((c) => c.id) });
    expect(all.ok && all.value.cabinets.every((c) => c.reviewed)).toBe(true);
    if (!all.ok) return;
    const runId = d.cabinets[0]!.runId;
    const again = redraftRun(all.value, draft(), runId);
    expect(again.cabinets.filter((c) => c.runId === runId).every((c) => !c.reviewed)).toBe(true);
    expect(again.cabinets.filter((c) => c.runId !== runId).every((c) => c.reviewed)).toBe(true);
  });

  it('gives an empty design for a room with no cabinet runs', () => {
    const room = { ...kitchen(), walls: kitchen().walls.map((w) => ({ ...w, runs: [], appliances: [] })) };
    const r = draftPlaceholder(room, prefs(), ids, LAYOUT_RULES);
    expect(r.ok && r.value.cabinets.length).toBe(0);
  });
});
