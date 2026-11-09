/** The layout builder's inputs and outputs (BUILD_PLAN 6, step 3). */
import type { Issue, Length, Room } from '@/core/index';
import type { SplitStrategy } from './split';

/**
 * The room drawing's own layout numbers (the designer's data/layout-rules.json), handed in by the
 * app so the builder treats doors, windows, corners and appliances exactly as the drawing does.
 */
export interface LayoutNumbers {
  readonly openingClearance: Length;
  readonly upperBand: Length;
  readonly minRunLength: Length;
  readonly appliances: readonly { readonly kind: string; readonly comesWithHood: boolean; readonly ownUpper: boolean }[];
}

export type SinkPlacement = 'as_drawn' | 'under_window';
export type UpperSplit = 'match_bases' | 'own';

/** The choices that make one option. */
export interface OptionChoices {
  readonly sink: SinkPlacement;
  readonly split: SplitStrategy;
  /** Which upper (by catalog code) the room's uppers use. */
  readonly upper: string;
  readonly upperSplit: UpperSplit;
}

/** An appliance the builder moved (owner, 2026-11-09: at most 24", along its own wall, always explained). */
export interface ApplianceMove {
  readonly placementId: string;
  readonly kind: string;
  readonly wallId: string;
  readonly from: Length;
  readonly to: Length;
  readonly ruleId: string;
  readonly why: string;
}

export type ScoreResult = 'met' | 'broken' | 'not_applicable';

/** One line of an option's scorecard: a rule, how strongly the owner holds it, and how the option does. */
export interface ScoreLine {
  readonly ruleId: string;
  readonly title: string;
  /** In the owner's words; "default" when they didn't say. */
  readonly strength: string;
  readonly result: ScoreResult;
  readonly detail: string;
}

export interface LayoutOption {
  /** Stable key made from the choices, e.g. "under_window/equal/upper_doors_36/match_bases". */
  readonly key: string;
  readonly label: string;
  readonly choices: OptionChoices;
  /** The room with its appliances as moved and its placed cabinets (origin ai, not approved). */
  readonly room: Room;
  readonly moves: readonly ApplianceMove[];
  /** Everything the checks found plus anything the builder couldn't do, never hidden. */
  readonly issues: readonly Issue[];
  readonly scorecard: readonly ScoreLine[];
}
