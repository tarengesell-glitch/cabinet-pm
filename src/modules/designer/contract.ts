// Public API of the designer module. Other code may import only this file.
export { roomDrawingStatus, type RoomDrawingStatus } from './ui/status';
/** The PLACEHOLDER for the AI design step (no AI): see model/placeholder-draft.ts. It writes placed cabinets into the master copy. */
export { draftRoom, exportRoomData, importRoomData, roomMasterCopy, type RoomData } from './ui/placeholder-store';
/** The input contract for a room's design choices (from the intake), checked before the builder or the 3D view uses them. */
export { islandPanelsOf, layoutPreferences, type DesignChoice, type DesignChoices, type FinishLook, type IslandPanels, type PanelLook } from './model/choices';
