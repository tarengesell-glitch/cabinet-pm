// Public API of the intake module. Other code may import only this file.
export { DEFINITION as INTAKE_DEFINITION, type Definition as IntakeDefinition } from './model/definition';
export { startIntake, type Answer as IntakeAnswer, type IntakeState } from './model/engine';
export { intakeHandover, type HandoverAnswer, type RoomHandover } from './model/handover';
