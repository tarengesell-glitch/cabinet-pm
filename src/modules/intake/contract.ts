// Public API of the intake module. Other code may import only this file.
export { DEFINITION as INTAKE_DEFINITION, type Definition as IntakeDefinition } from './model/definition';
export { startIntake, type Answer as IntakeAnswer, type IntakeState } from './model/engine';
export { intakeHandover, roughCeiling, type HandoverAnswer, type RoomHandover } from './model/handover';
/** The answers kept in this browser (the preview has no database yet), for the design studio. */
export { loadState as loadIntakeState, type Loaded as LoadedIntake } from './ui/storage';
