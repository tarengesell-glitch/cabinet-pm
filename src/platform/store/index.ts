// The shared database: master copy versions, alerts and the signed-in staff member.
export type { StoreBackend, VersionOrigin } from './backend';
export { supabaseBackend, supabaseClient, supabaseSettings } from './supabase';
export {
  history,
  loadLatest,
  loadVersion,
  openAlerts,
  raiseAlert,
  resolveAlert,
  saveVersion,
  signedInStaff,
  type Alert,
  type SavedVersion,
  type SaveRequest,
  type VersionSummary,
} from './store';
export { sendSignInLink, signOut } from './auth';
