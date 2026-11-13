import { describe, expect, it } from 'vitest';
import { roomDesignInputs, type RoomDesignInputs } from '../model/design-inputs';
import { Intake } from '../model/engine';
import { intakeHandover } from '../model/handover';
import capture from './design-inputs.before.json';
import { def, scenarios } from './scenarios';

/**
 * What the design studio read from each room before `roomDesignInputs` replaced its own helpers
 * (`prefsOf` and `roomSetOf` in src/app/studio/Studio.tsx, and `roomLook`), captured 2026-11-11
 * from that code: design-inputs.before.json. The new reading must give the same for every room.
 */
interface Captured {
  readonly name: string;
  readonly rooms: readonly {
    readonly room_id: string;
    readonly room_type: string;
    readonly prefs: { readonly drawers: string | null; readonly cornerInsert: string | null; readonly garbage: string; readonly roomSet: string; readonly cabinetTop: number | string | null };
    readonly roomSet: string;
    readonly look: { readonly islandBack: string | null } | null;
  }[];
}
const before = capture as unknown as readonly Captured[];

// The look's interior colour and tray organizer count were added after the capture (2026-11-13): checked on their own below.
const asBefore = (i: RoomDesignInputs) => {
  const look: Record<string, unknown> = { ...i.look };
  delete look['interiorHex'];
  delete look['trayOrganizers'];
  return {
    prefs: { drawers: i.drawerLevel.status === 'chosen' ? i.drawerLevel.option_id : null, cornerInsert: i.cornerInsert, garbage: i.garbage, roomSet: i.roomKind, cabinetTop: i.cabinetTop },
    roomSet: i.roomKind,
    look,
  };
};

describe('a room’s design inputs, read from its answers', () => {
  it('reads the interior colour and the tray organizers for the 3D view (owner, 2026-11-13)', () => {
    for (const { state } of scenarios())
      for (const r of intakeHandover(def, state)) {
        const look = roomDesignInputs(def, state, r.room_id)!.look;
        const room = state.rooms.find((x) => x.id === r.room_id)!;
        const interiors = room.answers['interiors'];
        // White and maple are their own colours; Tafisa matching is the cabinet colour; unanswered is none.
        if (interiors === 'tafisa_matching') expect(look.interiorHex).toBe(look.door);
        else if (interiors === undefined) expect([null, '#D9B98A', '#F4F3EF', look.door]).toContain(look.interiorHex);
        else expect(look.interiorHex).toMatch(/^#[0-9A-F]{6}$/i);
        expect(Number.isInteger(look.trayOrganizers) && look.trayOrganizers >= 0).toBe(true);
      }
  });
  const all = scenarios();
  for (const [k, { name, state }] of all.entries())
    it(`gives what the studio read before: ${name}`, () => {
      const was = before[k]!;
      expect(was.name).toBe(name);
      const rooms = intakeHandover(def, state);
      expect(rooms.map((r) => r.room_id)).toEqual(was.rooms.map((r) => r.room_id));
      for (const [j, r] of rooms.entries()) {
        const now = roomDesignInputs(def, state, r.room_id);
        expect(now).not.toBeNull();
        const { prefs, roomSet, look } = was.rooms[j]!;
        expect(asBefore(now!)).toEqual(JSON.parse(JSON.stringify({ prefs, roomSet, look })));
        // The island panels the 3D view drew before (from the look) are the ones chosen now.
        const panel = (c: RoomDesignInputs['islandBackPanel']) => (c.status === 'chosen' ? c.option_id : null);
        expect([panel(now!.islandBackPanel), panel(now!.islandSidePanel)]).toEqual([look?.islandBack ?? null, (look as { islandSide?: string | null } | null)?.islandSide ?? null]);
      }
    });

  it('covers kitchens, a bathroom, another room type, every island-panel case and missing answers', () => {
    const rooms = before.flatMap((s) => s.rooms);
    expect(new Set(rooms.map((r) => r.roomSet))).toEqual(new Set(['kitchen', 'bath']));
    expect(rooms.map((r) => r.room_type)).toContain('office_1');
    expect(new Set(rooms.map((r) => r.look?.islandBack ?? null))).toEqual(new Set([null, 'door_panels', 'shiplap', 'flat']));
    expect(rooms.some((r) => r.prefs.drawers === null && r.prefs.cabinetTop === null && r.prefs.garbage === 'none')).toBe(true);
  });

  it('reads the answers as they are now: a change after drafting shows at once, and nothing is kept elsewhere', () => {
    const state = all[0]!.state;
    const x = new Intake(def, structuredClone(state));
    expect(roomDesignInputs(def, x.state, 'kitchen-room')?.drawerLevel).toEqual({ status: 'chosen', option_id: 'maximum' });
    x.switchRoom(0); // the kitchen
    x.pick('drawer_level', 'minimum');
    expect(roomDesignInputs(def, x.state, 'kitchen-room')?.drawerLevel).toEqual({ status: 'chosen', option_id: 'minimum' });
    expect(roomDesignInputs(def, state, 'kitchen-room')?.drawerLevel).toEqual({ status: 'chosen', option_id: 'maximum' });
  });

  it('says plainly when the room isn’t in the design choices', () => {
    expect(roomDesignInputs(def, all[0]!.state, 'no-such-room')).toBeNull();
  });
});
