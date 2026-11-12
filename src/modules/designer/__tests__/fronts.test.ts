import { describe, expect, it } from 'vitest';
import { CURRENT_CATALOG } from '@/modules/catalog/contract';
import { DRAFT_SETTINGS } from '../model/placeholder-draft';
import { bankHeights, frontPieces, startingSections, type FrontInput, type FrontPiece } from '../model/fronts';

const rules = DRAFT_SETTINGS.ok ? DRAFT_SETTINGS.value.fronts : (null as never);
const item = (code: string) => CURRENT_CATALOG.items.find((i) => i.code === code)!;
const face = (code: string, w: number, y0: number, y1: number, extra: Partial<FrontInput> = {}): FrontPiece[] =>
  frontPieces({ item: item(code), x0: -w / 2, x1: w / 2, y0, y1, hinge: null, sections: null, drawerHandleTop: false, ...extra }, rules);
const doors = (ps: FrontPiece[]) => ps.filter((p): p is Extract<FrontPiece, { kind: 'door' }> => p.kind === 'door');
const drawers = (ps: FrontPiece[]) => ps.filter((p): p is Extract<FrontPiece, { kind: 'drawer' }> => p.kind === 'drawer');

describe('cabinet fronts (3D view)', () => {
  it('reads the shop door rule (CB-FACT-16) and the standard top drawer', () => {
    expect(rules).toMatchObject({ maxSingleDoor: 20, maxDoorHeight: 48, topDrawer: 6.8125 });
  });

  it('a door over 20" wide is a pair; up to 20" one door', () => {
    expect(doors(face('base_doors', 20, 4, 34.75))).toHaveLength(1);
    expect(doors(face('base_doors', 21, 4, 34.75))).toHaveLength(2);
  });

  it('a tall pantry has stacked doors, never one full-height door (owner, 2026-11-12)', () => {
    const ds = doors(face('tall_pantry', 30, 4, 96));
    // Two door sections, each a pair (30" wide), each under 48" tall.
    expect(ds).toHaveLength(4);
    for (const d of ds) expect(d.y1 - d.y0).toBeLessThanOrEqual(48);
    // The upper doors open from their bottom, the lower ones from their top.
    const [upperDoor, , lowerDoor] = ds;
    expect(upperDoor!.handleY).toBeLessThan((upperDoor!.y0 + upperDoor!.y1) / 2);
    expect(lowerDoor!.handleY).toBeGreaterThan((lowerDoor!.y0 + lowerDoor!.y1) / 2);
    // To a 120" top: three equal rows, each under 48".
    const tall = doors(face('tall_pantry', 30, 4, 120));
    expect(tall).toHaveLength(6);
    for (const d of tall) expect(d.y1 - d.y0).toBeCloseTo((120 - 4) / 3);
  });

  it('follows the door opening chosen: hinged left, hinged right, or a pair (owner, 2026-11-12)', () => {
    expect(doors(face('base_doors', 30, 4, 34.75, { hinge: 'left' })).map((d) => d.hinge)).toEqual(['left']);
    expect(doors(face('base_doors', 30, 4, 34.75, { hinge: 'right' })).map((d) => d.hinge)).toEqual(['right']);
    expect(doors(face('base_doors', 15, 4, 34.75, { hinge: 'pair' })).map((d) => d.hinge)).toEqual(['left', 'right']);
  });

  it('a drawer bank has the standard top drawer, the rest equal', () => {
    expect(bankHeights(4, 30.75, 6.8125)).toEqual([6.8125, 7.979166666666667, 7.979166666666667, 7.979166666666667]);
    const ds = drawers(face('base_4_drawers', 30, 4, 34.75));
    expect(ds).toHaveLength(4);
    expect(ds[0]!.y1 - ds[0]!.y0).toBeCloseTo(6.8125);
  });

  it('the garbage pull-out: a working drawer on top, a full front below with its handle where a four-drawer bank’s second handle is (owner, 2026-11-12)', () => {
    const ps = face('garbage_pullout', 16.5, 4, 34.75);
    const [top, pull] = drawers(ps);
    expect(drawers(ps)).toHaveLength(2);
    expect(top!.y1 - top!.y0).toBeCloseTo(6.8125);
    expect(pull!.y1).toBeCloseTo(top!.y0);
    expect(pull!.y0).toBeCloseTo(4);
    const bank = drawers(face('base_4_drawers', 16.5, 4, 34.75));
    expect(pull!.handleY).toBeCloseTo(bank[1]!.handleY);
    expect(pull!.handleY).not.toBeCloseTo((pull!.y0 + pull!.y1) / 2);
  });

  it('draws saved sections: a vertical split, shelves, drawers and roll-outs', () => {
    const ps = face('base_doors', 36, 4, 34.75, {
      sections: {
        kind: 'split',
        direction: 'vertical',
        size: null,
        parts: [
          { kind: 'doors', shelves: 2, rollouts: 1, size: null },
          { kind: 'drawers', count: 3, size: null },
        ],
      },
    });
    expect(doors(ps)).toHaveLength(1);
    expect(drawers(ps)).toHaveLength(3);
    expect(ps.filter((p) => p.kind === 'shelf')).toHaveLength(2);
    expect(ps.filter((p) => p.kind === 'rollout')).toHaveLength(1);
    expect(ps.filter((p) => p.kind === 'divider')).toHaveLength(1);
    // The door fills the left half, the drawers the right.
    expect(doors(ps)[0]).toMatchObject({ x0: -18, x1: 0 });
    for (const d of drawers(ps)) expect(d).toMatchObject({ x0: 0, x1: 18 });
  });

  it('starts a divided cabinet from its catalog fronts', () => {
    expect(startingSections(item('base_drawer_doors'), rules.topDrawer)).toMatchObject({ kind: 'split', direction: 'horizontal', parts: [{ kind: 'drawers', count: 1 }, { kind: 'doors' }] });
    expect(startingSections(item('base_3_drawers'), rules.topDrawer)).toMatchObject({ kind: 'drawers', count: 3 });
    expect(startingSections(item('tall_pantry'), rules.topDrawer)).toMatchObject({ kind: 'split', parts: [{ kind: 'doors' }, { kind: 'doors' }] });
  });
});
