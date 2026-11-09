// Public API of the ai-design module. Other code may import only this file.
export {
  BRIEF_FORMAT,
  buildDesignBrief,
  type DesignBrief,
  type DesignBriefInput,
  type DesignBriefResult,
} from './model/brief';
export { type BriefAnswer } from './model/intake';
/** The layout builder (BUILD_PLAN 6, step 3): ordinary code, no AI. */
export { draftLayout, type DraftLayoutInput, type DraftLayoutResult } from './model/engine/draft';
export type { ApplianceMove, LayoutNumbers, LayoutOption, OptionChoices, ScoreLine } from './model/engine/types';
