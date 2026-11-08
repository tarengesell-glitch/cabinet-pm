// Public API of the designer module. Other code may import only this file.
export { roomDrawingStatus, type RoomDrawingStatus } from './ui/status';
/** The PLACEHOLDER for the AI design step (no AI): see model/placeholder-draft.ts. */
export { draftRoom, storedDesign } from './ui/placeholder-store';
export type { DrawerLevel, DraftPreferences, PlaceholderDesign } from './model/placeholder-draft';
