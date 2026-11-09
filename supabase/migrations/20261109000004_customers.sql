-- Real clients (owner, 2026-11-09). Owned by the projects module (DATA_MODEL "projects: customers").
-- The repository is public and the site's code ships to every visitor, so real client details
-- live only here, readable by signed-in staff only, never in code.
-- A customer's ID is also its design job's key in the studio until jobs have their own table
-- (BUILD_PLAN 7a).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- [{ "role": "primary" | "secondary", "name": "...", "email": "..." | null, "phone": "..." | null }]
  contacts jsonb not null check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) between 1 and 2),
  address text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz
);
comment on table public.customers is 'Real clients. Staff only. Never deleted; every add and change is audited with the old and new values.';
create index customers_created_by on public.customers (created_by);
create index customers_updated_by on public.customers (updated_by);

alter table public.customers enable row level security;
create policy "staff read customers" on public.customers for select to authenticated using ((select private.is_staff()));
create policy "staff add customers as themselves" on public.customers for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));
create policy "staff change customers" on public.customers for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
revoke delete, truncate on public.customers from anon, authenticated;
create trigger customers_never_deleted before delete on public.customers
  for each row execute function public.refuse_change();

-- A change records who made it and when; who added it, and when, never change.
create function public.customers_stamp() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.id, new.created_by, new.created_at) is distinct from (old.id, old.created_by, old.created_at) then
    raise exception 'A client''s ID and who added it are kept as they were.' using errcode = 'P0001';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.customers_stamp() from public, anon, authenticated;
create trigger customers_stamp before update on public.customers
  for each row execute function public.customers_stamp();

create function public.audit_customer() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, record, summary)
  values (
    case when tg_op = 'INSERT' then new.created_by else new.updated_by end,
    case when tg_op = 'INSERT' then 'add_customer' else 'change_customer' end,
    'customers',
    case when tg_op = 'INSERT' then jsonb_build_object('id', new.id, 'new', to_jsonb(new))
         else jsonb_build_object('id', new.id, 'old', to_jsonb(old), 'new', to_jsonb(new)) end,
    case when tg_op = 'INSERT' then 'Added client ' || new.name else 'Changed client ' || new.name end
  );
  return new;
end
$$;
revoke all on function public.audit_customer() from public, anon, authenticated;
create trigger customers_audit after insert or update on public.customers
  for each row execute function public.audit_customer();
