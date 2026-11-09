/**
 * The real store backend: the shared Supabase database (project cabinet-pm, Canada; DECISIONS
 * AD-3). Its URL and publishable key come from the site's settings (Netlify environment
 * variables), never from code. Without them, nothing is pretended: the store says it isn't set up.
 */
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { ok, refuse, type Result } from '@/core/index';
import type { AlertRow, BackendFailure, BackendResult, ChoicesRow, StaffRow, StoreBackend, VersionRow } from './backend';

/** The two public settings. Next.js writes them into the pages when the site is built. */
export function supabaseSettings(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Result<{ url: string; key: string }> {
  const missing = [
    ...(url?.trim() ? [] : ['NEXT_PUBLIC_SUPABASE_URL']),
    ...(key?.trim() ? [] : ['NEXT_PUBLIC_SUPABASE_ANON_KEY']),
  ];
  if (missing.length > 0) {
    return refuse(`The shared database isn't set up for this site: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing from its settings.`);
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url!.trim())) {
    return refuse(`The shared database address in the site's settings doesn't look right: ${url}.`);
  }
  return ok({ url: url!.trim(), key: key!.trim() });
}

let shared: SupabaseClient | null = null;

/** One client per page, signed in as the person using it (their session is kept by Supabase). */
export function supabaseClient(): Result<SupabaseClient> {
  if (shared) return ok(shared);
  const settings = supabaseSettings();
  if (!settings.ok) return settings;
  shared = createClient(settings.value.url, settings.value.key, {
    // The implicit flow lets a sign-in link work even when it is opened in another browser.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
  return ok(shared);
}

/** Postgres error codes the store explains (https://www.postgresql.org/docs/current/errcodes-appendix.html). */
function failure(error: PostgrestError | { message: string; code?: string }): BackendFailure {
  const detail = error.message;
  switch (error.code) {
    case '23505': // unique_violation: someone already saved a version from the same parent
      return { kind: 'conflict', detail };
    case '42501': // insufficient_privilege: row-level security said no
      return { kind: 'not_allowed', detail };
    case '23502': // not_null_violation
    case '23503': // foreign_key_violation
    case '23514': // check_violation
    case '22P02': // invalid_text_representation (a bad UUID)
    case 'P0001': // raised by our own triggers: history is never changed
      return { kind: 'refused', detail };
    default:
      return { kind: 'unreachable', detail: error.code ? `${detail} (${error.code})` : detail };
  }
}

const VERSION_COLUMNS = 'job_id, version_no, parent_version, shop_id, schema_version, origin, summary, created_by, created_at, studio_job_key, studio_room_key';

export function supabaseBackend(client: SupabaseClient): StoreBackend {
  const run = async <T>(call: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<BackendResult<T>> => {
    try {
      const { data, error } = await call();
      if (error) return { ok: false, failure: failure(error) };
      return { ok: true, value: data as T };
    } catch (e) {
      // A network failure throws instead of returning an error; it is reported, never swallowed.
      return { ok: false, failure: { kind: 'unreachable', detail: e instanceof Error ? e.message : String(e) } };
    }
  };
  return {
    async signedInUserId() {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) return { ok: false, failure: { kind: 'unreachable', detail: error.message } };
        return { ok: true, value: data.session?.user.id ?? null };
      } catch (e) {
        return { ok: false, failure: { kind: 'unreachable', detail: e instanceof Error ? e.message : String(e) } };
      }
    },
    staffMember: (userId) => run<StaffRow | null>(() => client.from('staff').select('user_id, name, roles').eq('user_id', userId).maybeSingle()),
    latestVersion: (jobId) =>
      run<VersionRow | null>(() =>
        client.from('master_copy_versions').select(`${VERSION_COLUMNS}, document`).eq('job_id', jobId).order('version_no', { ascending: false }).limit(1).maybeSingle(),
      ),
    version: (jobId, versionNo) =>
      run<VersionRow | null>(() =>
        client.from('master_copy_versions').select(`${VERSION_COLUMNS}, document`).eq('job_id', jobId).eq('version_no', versionNo).maybeSingle(),
      ),
    versions: (jobId) =>
      run<Omit<VersionRow, 'document'>[]>(() => client.from('master_copy_versions').select(VERSION_COLUMNS).eq('job_id', jobId).order('version_no', { ascending: false })),
    insertVersion: (row) => run<VersionRow>(() => client.from('master_copy_versions').insert(row).select(`${VERSION_COLUMNS}, document`).single()),
    latestStudioRoom: (roomKey) =>
      run<VersionRow | null>(() =>
        client
          .from('master_copy_versions')
          .select(`${VERSION_COLUMNS}, document`)
          .eq('studio_room_key', roomKey)
          .order('version_no', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    latestChoices: (jobKey) =>
      run<ChoicesRow | null>(() =>
        client.from('intake_answer_versions').select().eq('job_key', jobKey).order('version_no', { ascending: false }).limit(1).maybeSingle(),
      ),
    insertChoices: (row) => run<ChoicesRow>(() => client.from('intake_answer_versions').insert(row).select().single()),
    insertAlert: (row) => run<AlertRow>(() => client.from('alerts').insert(row).select().single()),
    openAlerts: (jobId) =>
      run<AlertRow[]>(() => {
        const q = client.from('alerts').select().is('resolved_at', null).order('created_at', { ascending: true });
        return jobId === null ? q : q.eq('job_id', jobId);
      }),
    resolveAlert: (id, userId, note) =>
      run<AlertRow | null>(() =>
        // resolved_at is set by the database's own clock (trigger alerts_resolve_only); this value only says "resolve".
        client.from('alerts').update({ resolved_at: new Date(0).toISOString(), resolved_by: userId, resolution_note: note }).eq('id', id).select().maybeSingle(),
      ),
  };
}
