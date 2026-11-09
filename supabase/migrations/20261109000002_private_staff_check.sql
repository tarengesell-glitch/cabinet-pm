-- Supabase's security check (lint 0029): is_staff() could be called directly over the web
-- (/rest/v1/rpc/is_staff). It only says whether the caller is staff, but it has no reason to be
-- public. It moves to a schema the web API doesn't expose; the policies keep using it.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_staff() set schema private;

-- Supabase's performance check (lint 0001): the link from a version to its parent had no index.
create index master_copy_versions_parent on public.master_copy_versions (job_id, parent_version);
