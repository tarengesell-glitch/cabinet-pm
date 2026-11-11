import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Room } from '@/core/index';
import { cabinetViews, placeholderItems, type CabinetView } from '../model/cabinets';
import { islandPanelsOf, layoutPreferences, type DesignChoice, type DesignChoices } from '../model/choices';
import { withRuleEnds, type Context } from '../model/ends';
import { cornerCabinets } from '../model/layout';
import { draftPlaceholder, type DraftPreferences } from '../model/placeholder-draft';
import { cabinet, drawLook, type FinishLook } from '../ui/Stage3D';
import { draftRoom, storedDraft } from '../ui/placeholder-store';
import { storageKey } from '../ui/storage';
import { realKitchen, realKitchenRoom, REAL_KITCHEN_ROOM_ID } from './real-kitchen';

let n = 0;
const ids = () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const chosen = (option_id: string): DesignChoice => ({ status: 'chosen', option_id });
const NONE: DesignChoice = { status: 'not_applicable' };
const LOOK: FinishLook = { door: '#eeeeee', baseDoor: '#eeeeee', island: '#666666', counter: '#cccccc', style: 'transitional', doorHw: 'handle', drawerHw: 'handle', pullFinish: '#111111', knobFinish: '#111111', doorOrient: 'vertical', drawerTop: false };
const choices = (c: Partial<DesignChoices> = {}): DesignChoices => ({
  roomKind: 'kitchen',
  cabinetTop: 'ceiling',
  drawerLevel: chosen('maximum'),
  cornerInsert: 'lazy_susan',
  garbage: 'dedicated_cabinet',
  islandBackPanel: chosen('door_panels'),
  islandSidePanel: chosen('detailed_short'),
  look: LOOK,
  ...c,
});

const prefs = (c: DesignChoices): DraftPreferences => {
  const p = layoutPreferences(c);
  if (!p.ok) throw new Error(p.reason);
  return p.value;
};
/** The real kitchen laid out from the choices, as the design step saves it. */
function laidOut(c: DesignChoices): Room {
  const room = realKitchenRoom();
  const d = draftPlaceholder(room, prefs(c), ids);
  if (!d.ok) throw new Error(d.reason);
  const items = placeholderItems(room, d.value);
  if (!items.ok) throw new Error(items.reason);
  const ended = withRuleEnds({ ...room, items: items.value });
  if (!ended.ok) throw new Error(ended.reason);
  return ended.value;
}
const codes = (room: Room): string[] => cabinetViews(room).flatMap((c) => (c.code ? [c.code] : []));

describe('the layout choices (the builder’s input)', () => {
  it('passes a chosen drawer level and the other layout choices to the builder', () => {
    expect(prefs(choices())).toEqual({ drawers: 'maximum', cornerInsert: 'lazy_susan', garbage: 'dedicated_cabinet', cabinetTop: 'ceiling', roomSet: 'kitchen' });
    for (const level of ['minimum', 'moderate', 'maximum'] as const) expect(prefs(choices({ drawerLevel: chosen(level) })).drawers).toBe(level);
  });

  it('keeps plain door cabinets (no drawer level) when the drawer level is unanswered or doesn’t apply', () => {
    expect(prefs(choices({ drawerLevel: { status: 'unanswered' } })).drawers).toBeNull();
    expect(prefs(choices({ drawerLevel: NONE, roomKind: 'bath' })).drawers).toBeNull();
  });

  it('refuses a saved drawer level that isn’t an option, or one the recipe doesn’t have, with the reason', () => {
    const saved = layoutPreferences(choices({ drawerLevel: { status: 'unrecognized', value: 'lots' } }));
    expect(saved).toEqual({ ok: false, reason: expect.stringContaining('"lots"') });
    const unknown = layoutPreferences(choices({ drawerLevel: chosen('extreme') }));
    expect(unknown).toEqual({ ok: false, reason: 'The layout recipe has no drawer level "extreme".' });
    expect(layoutPreferences(choices({ drawerLevel: { status: 'odd' } as unknown as DesignChoice })).ok).toBe(false);
  });

  it('lays the real kitchen out differently for each drawer level, and with door cabinets when none applies', () => {
    const byLevel = (['minimum', 'moderate', 'maximum'] as const).map((l) => codes(laidOut(choices({ drawerLevel: chosen(l) }))));
    const plain = codes(laidOut(choices({ drawerLevel: { status: 'unanswered' } })));
    // The base cabinets beside the corner, sink, dishwasher and garbage pull-out, by type.
    const bases = (cs: string[]) => {
      const m: Record<string, number> = {};
      for (const c of cs) if (/^base_/.test(c)) m[c] = (m[c] ?? 0) + 1;
      return m;
    };
    expect(bases(plain)).toEqual({ base_doors: 7 });
    expect(bases(byLevel[0]!)).toEqual({ base_3_drawers: 1, base_4_drawers: 1, base_drawer_doors: 5 });
    expect(bases(byLevel[1]!)).toEqual({ base_3_drawers: 3, base_4_drawers: 2, base_drawer_doors: 2 });
    expect(bases(byLevel[2]!)).toEqual({ base_3_drawers: 7 });
    // The island panels are appearance only: the layout is the same whatever they are.
    expect(codes(laidOut(choices({ islandBackPanel: chosen('shiplap'), islandSidePanel: chosen('waterfall_stone') })))).toEqual(byLevel[2]);
  });
});

describe('the island panels (the 3D view’s input)', () => {
  it('shows a chosen panel as chosen, and nothing chosen or no island as plain, with nothing to report', () => {
    expect(islandPanelsOf(choices())).toEqual({ back: { kind: 'chosen', option_id: 'door_panels' }, side: { kind: 'chosen', option_id: 'detailed_short' }, problems: [] });
    expect(islandPanelsOf(choices({ islandBackPanel: { status: 'unanswered' }, islandSidePanel: NONE }))).toEqual({ back: { kind: 'none' }, side: { kind: 'none' }, problems: [] });
  });

  it('reports a panel it can’t show, saying it is drawn plain only as a stand-in', () => {
    const p = islandPanelsOf(choices({ islandBackPanel: { status: 'unrecognized', value: 'beadboard' }, islandSidePanel: chosen('carved') }));
    expect(p.back).toEqual({ kind: 'unknown', value: 'beadboard' });
    expect(p.side).toEqual({ kind: 'unknown', value: 'carved' });
    expect(p.problems).toHaveLength(2);
    expect(p.problems[0]).toMatch(/back panel .*"beadboard".*stand-in/);
    expect(p.problems[1]).toMatch(/side panel "carved".*stand-in/);
  });

  it('draws the island back panel as chosen: door panels and shiplap add to the plain panel; an unknown one adds nothing', () => {
    const room = laidOut(choices());
    const ctx: Context = { room, all: cabinetViews(room), corners: cornerCabinets(room) };
    const back = ctx.all.find((c) => c.back)!;
    const meshes = (c: DesignChoices, view: CabinetView = back) => {
      const g = cabinet({ mats: new Map(), doors: [] }, view, ctx, drawLook(LOOK, islandPanelsOf(c)), false);
      let k = 0;
      g?.traverse((o) => void ((o as { isMesh?: boolean }).isMesh && k++));
      return k;
    };
    const flat = meshes(choices({ islandBackPanel: chosen('flat') }));
    expect(meshes(choices({ islandBackPanel: chosen('door_panels') }))).toBeGreaterThan(flat);
    expect(meshes(choices({ islandBackPanel: chosen('shiplap') }))).toBeGreaterThan(flat);
    expect(meshes(choices({ islandBackPanel: { status: 'unrecognized', value: 'beadboard' } }))).toBe(flat);
    expect(drawLook(LOOK, islandPanelsOf(choices({ islandBackPanel: { status: 'unrecognized', value: 'beadboard' } }))).islandBack).toBeNull();
    // The side panel: a waterfall replaces the finished end; a detailed panel adds to it.
    const end = ctx.all.find((c) => c.wallId === back.wallId && !c.back && c.code !== null && (c.ends?.low === 'applied_finished' || c.ends?.high === 'applied_finished'))!;
    const plainSide = meshes(choices({ islandSidePanel: chosen('plain_gable') }), end);
    expect(meshes(choices({ islandSidePanel: chosen('detailed_long') }), end)).toBeGreaterThan(plainSide);
    expect(meshes(choices({ islandSidePanel: { status: 'unrecognized', value: 'carved' } }), end)).toBe(plainSide);
  });
});

describe('generating from choices that can’t be used', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => void items.set(k, v),
        removeItem: (k: string) => void items.delete(k),
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('refuses the design step with the reason and leaves the saved design exactly as it was', () => {
    window.localStorage.setItem(storageKey(REAL_KITCHEN_ROOM_ID), JSON.stringify({ job: realKitchen(), wallDefaults: null }));
    const designed = draftRoom(REAL_KITCHEN_ROOM_ID, choices(), 'ffffffff-0000-4000-8000-000000000001');
    expect(designed.ok).toBe(true);
    const before = window.localStorage.getItem(storageKey(REAL_KITCHEN_ROOM_ID));
    const refused = draftRoom(REAL_KITCHEN_ROOM_ID, choices({ drawerLevel: { status: 'unrecognized', value: 'lots' } }), 'ffffffff-0000-4000-8000-000000000001');
    expect(refused).toEqual({ ok: false, reason: expect.stringContaining('"lots"') });
    expect(window.localStorage.getItem(storageKey(REAL_KITCHEN_ROOM_ID))).toBe(before);
    // The saved design still opens, cabinets and all.
    const kept = storedDraft(REAL_KITCHEN_ROOM_ID);
    expect(kept.ok && kept.value.job.rooms[0]!.items.length).toBeGreaterThan(0);
  });
});
