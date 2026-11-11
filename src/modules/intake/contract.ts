// Public API of the intake module. Other code may import only this file.
export { DEFINITION as INTAKE_DEFINITION, type Definition as IntakeDefinition } from './model/definition';
export { startIntake, type Answer as IntakeAnswer, type IntakeState } from './model/engine';
export { intakeHandover, roomSummary, roughCeiling, type HandoverAnswer, type RoomHandover } from './model/handover';
/**
 * A room's design choices as the room drawing, the design step and the 3D view need them, read
 * from the answers (the only saved copy). New design choices that other steps use are added here.
 */
export { roomDesignInputs, type DrawerLevel as IntakeDrawerLevel, type GarbagePlace, type RoomDesignInputs, type RoomKind } from './model/design-inputs';
/** The answers kept in this browser (the preview has no database yet), for the design studio. */
export { loadState as loadIntakeState, saveState as saveIntakeState, type Loaded as LoadedIntake } from './ui/storage';
/** A room's look (colours, door style, hardware, island panels): part of `roomDesignInputs`. */
export type { Look as RoomLook } from './ui/art';
