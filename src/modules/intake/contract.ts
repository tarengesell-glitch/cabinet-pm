// Public API of the intake module. Other code may import only this file.
// AI Design reads the answers as the customer's design desires (BUILD_SPEC OA-3).
export {
  readIntake,
  type Condition,
  type CountsQuestion,
  type Fidelity,
  type Intake,
  type IntakeImage,
  type IntakeOption,
  type IntakeQuestion,
  type PendingQuestion,
  type SingleQuestion,
} from './model/intake';
export {
  askedQuestions,
  checkSavedAnswers,
  describeAnswer,
  progress,
  questionState,
  selectedOption,
  setAnswer,
  type Answer,
  type AnswerStatus,
  type Answers,
  type Choice,
  type Progress,
  type QuestionState,
} from './model/flow';
export { KITCHEN_INTAKE } from './model/kitchen';
