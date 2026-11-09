-- Step 0b: the design studio saves to the shared database (owner, 2026-11-09: saving is
-- automatic; the demo clients stay as the jobs until real client and job records exist, BUILD_PLAN 7a).

-- ---- Where a room's master copy is opened from ---------------------------------------------
-- PROPOSED stand-in until real jobs exist (projects, BUILD_PLAN 7a): the studio files each room's
-- master copy under its job (a demo client's ID, or "preview") and the room's ID in the design
-- choices. Both are set together, or neither.
alter table public.master_copy_versions
  add column studio_job_key text check (studio_job_key ~ '^[a-z0-9_-]{1,64}$'),
  add column studio_room_key uuid,
  add check ((studio_job_key is null) = (studio_room_key is null));
create index master_copy_versions_studio_room on public.master_copy_versions (studio_room_key, version_no desc);

-- ---- The design choices (intake answers) -----------------------------------------------------
-- Owned by intake (DATA_MODEL "intake"). One versioned document per studio job: the whole
-- intake state, exactly as the intake keeps it. The intake checks its shape when it reads it;
-- the database checks only that it is an object. Same rules as master copy versions: never
-- changed, one unbroken line, and two saves from the same version can't both land.
create table public.intake_answer_versions (
  job_key text not null check (job_key ~ '^[a-z0-9_-]{1,64}$'),
  version_no integer not null check (version_no >= 1),
  parent_version integer,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  summary text not null check (length(trim(summary)) > 0),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (job_key, version_no),
  check ((parent_version is null and version_no = 1) or (parent_version is not null and version_no = parent_version + 1)),
  foreign key (job_key, parent_version) references public.intake_answer_versions (job_key, version_no)
);
comment on table public.intake_answer_versions is 'Every saved version of a studio job''s design choices (intake state). Insert only.';
create index intake_answer_versions_parent on public.intake_answer_versions (job_key, parent_version);
create index intake_answer_versions_created_by on public.intake_answer_versions (created_by);

alter table public.intake_answer_versions enable row level security;
create policy "staff read design choices" on public.intake_answer_versions for select to authenticated using ((select private.is_staff()));
create policy "staff add design choices as themselves" on public.intake_answer_versions for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));
revoke update, delete, truncate on public.intake_answer_versions from anon, authenticated;
create trigger intake_answer_versions_insert_only before update or delete on public.intake_answer_versions
  for each row execute function public.refuse_change();

create function public.audit_intake_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, record, summary)
  values (new.created_by, 'save_version', 'intake_answer_versions',
          jsonb_build_object('job_key', new.job_key, 'version_no', new.version_no, 'parent_version', new.parent_version),
          new.summary);
  return new;
end
$$;
revoke all on function public.audit_intake_version() from public, anon, authenticated;
create trigger intake_answer_versions_audit after insert on public.intake_answer_versions
  for each row execute function public.audit_intake_version();
