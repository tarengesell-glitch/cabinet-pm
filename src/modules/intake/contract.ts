// Public API of the intake module. Other code may import only this file.
export { DEFINITION as INTAKE_DEFINITION, type Definition as IntakeDefinition } from './model/definition';
export { startIntake, type Answer as IntakeAnswer, type IntakeState } from './model/engine';
export { intakeHandover, roomSummary, roughCabinetTop, roughCeiling, type HandoverAnswer, type RoomHandover } from './model/handover';
/** The answers kept in this browser (the preview has no database yet), for the design studio. */
export { loadState as loadIntakeState, saveState as saveIntakeState, type Loaded as LoadedIntake } from './ui/storage';
/** A room's look (colours, door style, hardware), for drawing it elsewhere. */
export { roomLook } from './ui/pictures';
export type { Look as RoomLook } from './ui/art';
