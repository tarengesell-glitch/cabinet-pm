-- The shared master copy store (BUILD_PLAN step 0a; DECISIONS "AI designer: how it works":
-- "live work shouldn't live solely in a browser"). Owned by src/platform (DATA_MODEL "platform").
--
-- What it enforces, in the database itself:
-- * Only signed-in staff can read or write anything (row-level security on every table).
-- * Master copy versions are never changed or deleted. A save is a new version whose parent is
--   the version it was made from; two saves made from the same version can't both land, so no
--   one's work is silently overwritten.
-- * Every saved version writes an audit log row in the same transaction.
-- * Alerts stay until a person resolves them with a note, and a resolved alert can't be reopened
--   or rewritten.
-- The store only checks the master copy's outer shape; business rules live in the modules.

-- ---- Staff ----------------------------------------------------------------------------------
-- Who may use the platform, and their roles. Which permissions a role has is data in
-- src/platform/permissions/roles.json, checked in the app with can(user, permission) (rule 13).
-- PROPOSED: the database itself only checks "is this person staff"; finer permissions are the
-- app's. Rows are added by the owner in the Supabase dashboard (no one can add themselves).
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  roles text[] not null check (cardinality(roles) > 0),
  created_at timestamptz not null default now()
);
comment on table public.staff is 'Platform users and their roles. Added by the owner in the dashboard; permissions per role are data in roles.json.';

create function public.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff where user_id = (select auth.uid())) $$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

alter table public.staff enable row level security;
create policy "staff read staff" on public.staff for select to authenticated using ((select public.is_staff()));

-- ---- Shops ----------------------------------------------------------------------------------
-- A manufacturing partner (OA-1): one Hutterite colony today; more must be possible.
create table public.shops (
  shop_id uuid primary key,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
comment on table public.shops is 'Manufacturing partners (OA-1). One colony today.';
-- The colony shop, with the ID the catalog already gives it (src/modules/catalog/data/catalog-v1.json).
insert into public.shops (shop_id, name) values ('526e7ec9-47a3-5c86-9fd3-4db7010be90a', 'The colony shop');

alter table public.shops enable row level security;
create policy "staff read shops" on public.shops for select to authenticated using ((select public.is_staff()));

-- ---- Master copy versions -------------------------------------------------------------------
create table public.master_copy_versions (
  job_id uuid not null,
  version_no integer not null check (version_no >= 1),
  -- The version this one was made from; null only for a job's first version.
  parent_version integer,
  shop_id uuid not null references public.shops (shop_id),
  schema_version integer not null check (schema_version >= 1),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  origin text not null check (origin in ('designer', 'ai', 'returned')),
  summary text not null check (length(trim(summary)) > 0),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (job_id, version_no),
  -- A version follows its parent directly, so the history is one unbroken line.
  check ((parent_version is null and version_no = 1) or (parent_version is not null and version_no = parent_version + 1)),
  -- The document is the job it is filed under, in the schema it says.
  check (document ->> 'job_id' = job_id::text),
  check (document ->> 'shop_id' = shop_id::text),
  check ((document ->> 'schema_version')::integer = schema_version),
  foreign key (job_id, parent_version) references public.master_copy_versions (job_id, version_no)
);
comment on table public.master_copy_versions is 'Every saved version of every job''s master copy. Insert only: never updated or deleted.';
create index master_copy_versions_created_by on public.master_copy_versions (created_by);
create index master_copy_versions_shop on public.master_copy_versions (shop_id);

alter table public.master_copy_versions enable row level security;
create policy "staff read versions" on public.master_copy_versions for select to authenticated using ((select public.is_staff()));
create policy "staff add versions as themselves" on public.master_copy_versions for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()));
-- No update or delete policy, and no grant either: history is never overwritten (rule 12).
revoke update, delete, truncate on public.master_copy_versions from anon, authenticated;

create function public.refuse_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% rows are never changed or deleted (rule 12: never overwrite history).', tg_table_name
    using errcode = 'P0001';
end
$$;
create trigger master_copy_versions_insert_only before update or delete on public.master_copy_versions
  for each row execute function public.refuse_change();

-- ---- Audit log ------------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id),
  action text not null,
  table_name text not null,
  record jsonb not null,
  summary text not null
);
comment on table public.audit_log is 'Every write, written by triggers in the same transaction. Insert only.';
create index audit_log_actor on public.audit_log (actor);

alter table public.audit_log enable row level security;
create policy "staff read audit log" on public.audit_log for select to authenticated using ((select public.is_staff()));
-- Written only by the triggers below (security definer), never directly by a person.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
create trigger audit_log_insert_only before update or delete on public.audit_log
  for each row execute function public.refuse_change();

create function public.audit_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, record, summary)
  values (new.created_by, 'save_version', 'master_copy_versions',
          jsonb_build_object('job_id', new.job_id, 'version_no', new.version_no, 'parent_version', new.parent_version, 'origin', new.origin),
          new.summary);
  return new;
end
$$;
create trigger master_copy_versions_audit after insert on public.master_copy_versions
  for each row execute function public.audit_version();

-- ---- Alerts ---------------------------------------------------------------------------------
-- A failure that blocks a step (rule 7). It stays until a person resolves it with a note.
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),
  source text not null check (length(trim(source)) > 0),
  job_id uuid,
  message text not null check (length(trim(message)) > 0),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  resolution_note text,
  check (
    (resolved_at is null and resolved_by is null and resolution_note is null)
    or (resolved_at is not null and resolved_by is not null and length(trim(coalesce(resolution_note, ''))) > 0)
  )
);
comment on table public.alerts is 'Failures that block a step. Stay until a person resolves them with a note (rule 7).';
create index alerts_open on public.alerts (created_at) where resolved_at is null;
create index alerts_created_by on public.alerts (created_by);
create index alerts_resolved_by on public.alerts (resolved_by);

alter table public.alerts enable row level security;
create policy "staff read alerts" on public.alerts for select to authenticated using ((select public.is_staff()));
create policy "staff raise alerts as themselves" on public.alerts for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()) and resolved_at is null);
create policy "staff resolve alerts" on public.alerts for update to authenticated
  using ((select public.is_staff()) and resolved_at is null)
  with check ((select public.is_staff()) and resolved_by = (select auth.uid()));
revoke delete, truncate on public.alerts from anon, authenticated;

-- Resolving is the only change allowed: it sets the three resolution fields once, by the person doing it.
create function public.alert_resolve_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Alerts are never deleted; resolve them with a note.' using errcode = 'P0001';
  end if;
  if old.resolved_at is not null then
    raise exception 'This alert is already resolved and can''t be changed.' using errcode = 'P0001';
  end if;
  if (new.id, new.created_at, new.created_by, new.source, new.job_id, new.message)
     is distinct from (old.id, old.created_at, old.created_by, old.source, old.job_id, old.message) then
    raise exception 'Only an alert''s resolution can be filled in; what it says is kept as raised.' using errcode = 'P0001';
  end if;
  if new.resolved_at is null then
    raise exception 'An alert is changed only to resolve it, with a note.' using errcode = 'P0001';
  end if;
  new.resolved_at := now();
  return new;
end
$$;
create trigger alerts_resolve_only before update or delete on public.alerts
  for each row execute function public.alert_resolve_only();

create function public.audit_alert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, record, summary)
  values (
    case when tg_op = 'INSERT' then new.created_by else new.resolved_by end,
    case when tg_op = 'INSERT' then 'raise_alert' else 'resolve_alert' end,
    'alerts',
    jsonb_build_object('id', new.id, 'job_id', new.job_id, 'source', new.source),
    case when tg_op = 'INSERT' then new.message else new.resolution_note end
  );
  return new;
end
$$;
create trigger alerts_audit after insert or update on public.alerts
  for each row execute function public.audit_alert();

revoke all on function public.refuse_change() from public, anon, authenticated;
revoke all on function public.audit_version() from public, anon, authenticated;
revoke all on function public.alert_resolve_only() from public, anon, authenticated;
revoke all on function public.audit_alert() from public, anon, authenticated;
