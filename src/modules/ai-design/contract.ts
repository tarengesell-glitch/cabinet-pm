// Public API of the ai-design module. Other code may import only this file.
export {
  BRIEF_FORMAT,
  buildDesignBrief,
  type DesignBrief,
  type DesignBriefInput,
  type DesignBriefResult,
} from './model/brief';
export {
  KITCHEN_INTAKE_QUESTIONS,
  type BriefAnswer,
  type ChoiceAnswer,
  type CountAnswer,
  type IntakeQuestionCode,
  type KitchenIntake,
  type NotApplicable,
  type OpenAnswer,
  type YesNoAnswer,
} from './model/intake';
