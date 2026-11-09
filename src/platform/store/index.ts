// The shared database: master copy versions, alerts and the signed-in staff member.
export type { StoreBackend, VersionOrigin } from './backend';
export { supabaseBackend, supabaseClient, supabaseSettings } from './supabase';
export {
  history,
  isSavedByOthersFirst,
  loadLatest,
  loadLatestChoices,
  loadLatestStudioRoom,
  loadVersion,
  openAlerts,
  raiseAlert,
  resolveAlert,
  saveChoices,
  saveVersion,
  signedInStaff,
  type Alert,
  type SavedChoices,
  type SavedVersion,
  type SaveRequest,
  type VersionSummary,
} from './store';
export { sendSignInLink, signOut } from './auth';
