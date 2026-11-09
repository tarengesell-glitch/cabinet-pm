// Public API of the designer module. Other code may import only this file.
export { roomDrawingStatus, type RoomDrawingStatus } from './ui/status';
/** The PLACEHOLDER for the AI design step (no AI): see model/placeholder-draft.ts. It writes placed cabinets into the master copy. */
export { draftRoom, exportRoomData, importRoomData, type RoomData } from './ui/placeholder-store';
export type { DrawerLevel, DraftPreferences } from './model/placeholder-draft';
