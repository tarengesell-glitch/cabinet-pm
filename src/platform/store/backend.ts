/**
 * The rows the shared database keeps (supabase/migrations), and the few calls the store makes on
 * them. The store's rules are written against this small interface, so they can be tested without
 * a network; `supabase.ts` is the real one.
 */

export type VersionOrigin = 'designer' | 'ai' | 'returned';

/** One saved version of a job's master copy (table `master_copy_versions`). */
export interface VersionRow {
  readonly job_id: string;
  readonly version_no: number;
  readonly parent_version: number | null;
  readonly shop_id: string;
  readonly schema_version: number;
  readonly document: unknown;
  readonly origin: VersionOrigin;
  readonly summary: string;
  readonly created_by: string;
  readonly created_at: string;
  /** PROPOSED stand-in until real jobs exist (BUILD_PLAN 7a): the studio job and room it is filed under. */
  readonly studio_job_key: string | null;
  readonly studio_room_key: string | null;
}
export type NewVersionRow = Omit<VersionRow, 'created_by' | 'created_at'>;

/** One saved version of a studio job's design choices (table `intake_answer_versions`, owned by intake). */
export interface ChoicesRow {
  readonly job_key: string;
  readonly version_no: number;
  readonly parent_version: number | null;
  readonly state: unknown;
  readonly summary: string;
  readonly created_by: string;
  readonly created_at: string;
}
export type NewChoicesRow = Omit<ChoicesRow, 'created_by' | 'created_at'>;

/** A failure that blocks a step (table `alerts`). It stays until a person resolves it with a note. */
export interface AlertRow {
  readonly id: string;
  readonly created_at: string;
  readonly created_by: string;
  readonly source: string;
  readonly job_id: string | null;
  readonly message: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly resolution_note: string | null;
}

/** A person on the staff list (table `staff`). */
export interface StaffRow {
  readonly user_id: string;
  readonly name: string;
  readonly roles: readonly string[];
}

/** Why a database call failed, sorted into the cases the store explains differently. */
export type BackendFailure =
  | { readonly kind: 'conflict'; readonly detail: string }
  | { readonly kind: 'not_allowed'; readonly detail: string }
  | { readonly kind: 'refused'; readonly detail: string }
  | { readonly kind: 'unreachable'; readonly detail: string };

export type BackendResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: BackendFailure };

export interface StoreBackend {
  /** The signed-in person's ID, or null when no one is signed in. */
  signedInUserId(): Promise<BackendResult<string | null>>;
  staffMember(userId: string): Promise<BackendResult<StaffRow | null>>;
  latestVersion(jobId: string): Promise<BackendResult<VersionRow | null>>;
  version(jobId: string, versionNo: number): Promise<BackendResult<VersionRow | null>>;
  /** Every version of a job, newest first, without the documents. */
  versions(jobId: string): Promise<BackendResult<readonly Omit<VersionRow, 'document'>[]>>;
  insertVersion(row: NewVersionRow): Promise<BackendResult<VersionRow>>;
  /** The newest master copy version filed under a studio room. */
  latestStudioRoom(roomKey: string): Promise<BackendResult<VersionRow | null>>;
  latestChoices(jobKey: string): Promise<BackendResult<ChoicesRow | null>>;
  insertChoices(row: NewChoicesRow): Promise<BackendResult<ChoicesRow>>;
  insertAlert(row: Pick<AlertRow, 'source' | 'job_id' | 'message'>): Promise<BackendResult<AlertRow>>;
  openAlerts(jobId: string | null): Promise<BackendResult<readonly AlertRow[]>>;
  resolveAlert(id: string, userId: string, note: string): Promise<BackendResult<AlertRow | null>>;
}
