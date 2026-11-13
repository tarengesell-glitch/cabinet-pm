/**
 * The designer's input contract for a room's design choices: what the layout builder and the 3D
 * view read, as the design choices (the intake) interpret them. The studio hands them over as
 * they are; the designer checks them here, at run time, before using them (rule 7), so a value
 * the builder or the 3D view doesn't know is never quietly treated as another one.
 *
 * Layout choices become the builder's `DraftPreferences` (`layoutPreferences`); appearance-only
 * choices (the look and the island panels) go to the 3D view (`islandPanelsOf`) and never into the
 * builder.
 */
import { refuse, type Length, type Result } from '@/core/index';
import { DRAFT_SETTINGS, type DraftPreferences, type DrawerLevel, type TopTrimSize, type ValanceSize } from './placeholder-draft';

/** One choice: chosen, unanswered, not applicable to the room, or saved but not one of its options. */
export type DesignChoice =
  | { readonly status: 'chosen'; readonly option_id: string }
  | { readonly status: 'unanswered' }
  | { readonly status: 'not_applicable' }
  | { readonly status: 'unrecognized'; readonly value: string };

/** How the room looks, from the design choices: colours, door style and hardware. */
export interface FinishLook {
  readonly door: string;
  readonly baseDoor: string;
  readonly island: string;
  readonly counter: string;
  readonly style: string;
  readonly doorHw: 'handle' | 'knob' | 'none';
  readonly drawerHw: 'handle' | 'knob' | 'none';
  readonly pullFinish: string;
  readonly knobFinish: string;
  readonly doorOrient: 'vertical' | 'horizontal';
  readonly drawerTop: boolean;
  /** The top trim's option ID ("none" for none), or null when not chosen; drawn on uppers and tall cabinets. */
  readonly topTrim: string | null;
  readonly trimHex: string;
  /** The light valance's option ID ("hidden" or "none" draw nothing), or null when not chosen. */
  readonly valance: string | null;
  readonly valanceHex: string;
}

export interface DesignChoices {
  /** Which cabinets, fixtures and depths the room uses: a bathroom's or the kitchen's. */
  readonly roomKind: 'kitchen' | 'bath';
  /** How tall the cabinets go: a length, the ceiling, or null when not chosen. */
  readonly cabinetTop: Length | 'ceiling' | null;
  readonly drawerLevel: DesignChoice;
  /** The corner insert's option ID, or null when none was chosen. */
  readonly cornerInsert: string | null;
  readonly garbage: 'none' | 'under_sink' | 'dedicated_cabinet';
  readonly islandBackPanel: DesignChoice;
  readonly islandSidePanel: DesignChoice;
  readonly look: FinishLook;
}

/** The drawer levels the layout recipe has (placeholder-draft.ts, `applyDrawerLevel`). */
const DRAWER_LEVELS: readonly DrawerLevel[] = ['minimum', 'moderate', 'maximum'];

/**
 * The island panel options the 3D view can show (Stage3D.tsx). "Flat panel" and the plain gables
 * are drawn as plain panels: that is how they look.
 */
const PANELS = {
  back: { name: 'back panel', drawn: ['flat', 'door_panels', 'shiplap'] },
  side: { name: 'side panel', drawn: ['waterfall_stone', 'detailed_short', 'detailed_long', 'plain_gable', 'deep_plain_gable'] },
} as const;

/**
 * What the layout builder reads from the choices. Unanswered and not-applicable drawer levels stay
 * null (plain door cabinets, as before); a saved value that isn't an option, or that the recipe
 * doesn't have, is refused with the reason, so nothing is laid out from it.
 */
export function layoutPreferences(c: DesignChoices): Result<DraftPreferences> {
  const d = c.drawerLevel;
  let drawers: DrawerLevel | null;
  switch (d.status) {
    case 'unanswered':
    case 'not_applicable':
      drawers = null;
      break;
    case 'chosen': {
      const level = DRAWER_LEVELS.find((l) => l === d.option_id);
      if (!level) return refuse(`The layout recipe has no drawer level "${d.option_id}".`);
      drawers = level;
      break;
    }
    case 'unrecognized':
      return refuse(`The drawer level saved in the design choices ("${d.value}") isn't one of its options. Choose the drawer level again in the design choices.`);
    default:
      return refuse('The drawer level in the design choices can’t be read.');
  }
  return { ok: true, value: { drawers, cornerInsert: c.cornerInsert, garbage: c.garbage, cabinetTop: c.cabinetTop, roomSet: c.roomKind } };
}

/** How the 3D view shows one island panel: as chosen, plain (nothing chosen or no island), or a value it can't show. */
export type PanelLook = { readonly kind: 'chosen'; readonly option_id: string } | { readonly kind: 'none' } | { readonly kind: 'unknown'; readonly value: string };

export interface IslandPanels {
  readonly back: PanelLook;
  readonly side: PanelLook;
  /** One plain sentence per panel the 3D view can't show as chosen, for the screen to say. */
  readonly problems: readonly string[];
}

/** The island panels for the 3D view. A value it can't show is reported, never shown as another option. */
export function islandPanelsOf(c: DesignChoices): IslandPanels {
  const problems: string[] = [];
  const panel = (choice: DesignChoice, part: keyof typeof PANELS): PanelLook => {
    const { name, drawn } = PANELS[part];
    const stand = 'It is drawn plain only as a stand-in, so the 3D view doesn’t show it as chosen.';
    switch (choice.status) {
      case 'unanswered':
      case 'not_applicable':
        return { kind: 'none' };
      case 'chosen':
        if ((drawn as readonly string[]).includes(choice.option_id)) return { kind: 'chosen', option_id: choice.option_id };
        problems.push(`The 3D view can’t show the island ${name} "${choice.option_id}" yet. ${stand}`);
        return { kind: 'unknown', value: choice.option_id };
      case 'unrecognized':
        problems.push(`The island ${name} saved in the design choices ("${choice.value}") isn’t one of its options. ${stand} Choose it again in the design choices.`);
        return { kind: 'unknown', value: choice.value };
      default:
        problems.push(`The island ${name} in the design choices can’t be read. ${stand}`);
        return { kind: 'unknown', value: '' };
    }
  };
  return { back: panel(c.islandBackPanel, 'back'), side: panel(c.islandSidePanel, 'side'), problems };
}

/** What the 3D view draws along the tops of the cabinets and under the uppers, and any choice it can't show. */
export interface TrimLook {
  readonly top: TopTrimSize | null;
  readonly valance: ValanceSize | null;
  readonly problems: readonly string[];
}

/**
 * The top trim and light valance the 3D view draws (owner, 2026-11-13: "Top trim and light valance
 * doesn't seem to be rendering"), with PROPOSED stand-in profiles. Not chosen, None or Hidden draws
 * nothing; a choice with no profile is drawn as nothing and reported, never drawn as another one.
 */
export function trimsOf(look: Pick<FinishLook, 'topTrim' | 'valance'>): TrimLook {
  if (!DRAFT_SETTINGS.ok) return { top: null, valance: null, problems: [] };
  const t = DRAFT_SETTINGS.value.visual.trim;
  const problems: string[] = [];
  const pick = <T>(id: string | null, sizes: ReadonlyMap<string, T>, nothing: ReadonlySet<string>, name: string): T | null => {
    if (id === null || nothing.has(id)) return null;
    const size = sizes.get(id);
    if (!size) problems.push(`The 3D view can’t show the ${name} "${id}" yet, so it draws none.`);
    return size ?? null;
  };
  return { top: pick(look.topTrim, t.top, t.drawsNothing.top, 'top trim'), valance: pick(look.valance, t.valance, t.drawsNothing.valance, 'light valance'), problems };
}
