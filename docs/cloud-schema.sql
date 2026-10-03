-- little-breath private cloud project store
-- Applied remotely with Supabase apply_migration: create_private_project_sync.
-- Verified migration version: 20261003075024 (PostgreSQL 17.11).
-- Apply this entire file atomically to a fresh public schema.
-- API: save_project(p_project, p_expected_revision, p_mutation_id).
-- Returns {status: saved|conflict, project, revision, updated_at}.
-- A missing row with expected_revision > 0 raises P0002, never recreates it.
-- Retry the same mutation UUID after an uncertain response. It is idempotent
-- while it remains the last accepted mutation; older retries conflict via CAS.
-- Send a new UUID for each intentional save, including conflict resolution.
-- RLS protects direct Data API writes too; the app always saves through RPC.
-- References checked 2026-10-03:
-- https://supabase.com/docs/guides/database/functions
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- https://www.postgresql.org/docs/current/explicit-locking.html
-- Security and performance advisors both returned lints: [] on 2026-10-03.

create table public.private_projects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  last_mutation_id uuid not null default pg_catalog.gen_random_uuid(),
  constraint private_projects_project_object
    check (pg_catalog.jsonb_typeof(project) = 'object'),
  constraint private_projects_project_version
    check (project ? 'version' and project -> 'version' = '1'::jsonb),
  constraint private_projects_project_keys
    check ((project - array[
      'version', 'pet', 'birth', 'createdAt', 'updatedAt', 'care',
      'preferences', 'growth'
    ]::text[]) = '{}'::jsonb),
  -- Measured after JSONB normalization, in UTF-8 bytes; 5 MiB maximum.
  constraint private_projects_project_size
    check (pg_catalog.octet_length(project::text) <= 5 * 1024 * 1024)
);

alter table public.private_projects enable row level security;
alter table public.private_projects force row level security;

create policy private_projects_select_own
on public.private_projects for select to authenticated
using ((select auth.uid()) = user_id);

create policy private_projects_insert_own
on public.private_projects for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy private_projects_update_own
on public.private_projects for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.private_projects from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on table public.private_projects to authenticated;

-- Server metadata cannot be forged even using direct INSERT / UPDATE.
-- The trigger intentionally takes no advisory lock: a direct UPDATE already
-- holds a row lock, so doing so could invert the RPC lock order and deadlock.
create function public.guard_private_project_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    if new.user_id is distinct from old.user_id then
      raise exception using errcode = '42501',
        message = 'Project ownership cannot be changed';
    end if;
    new.revision := old.revision + 1;
    -- Direct writes without a fresh mutation token invalidate the old receipt.
    if new.last_mutation_id is not distinct from old.last_mutation_id then
      new.last_mutation_id := pg_catalog.gen_random_uuid();
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_private_project_metadata()
from public, anon, authenticated;

create trigger private_projects_server_metadata
before insert or update on public.private_projects
for each row execute function public.guard_private_project_metadata();

create function public.save_project(
  p_project jsonb,
  p_expected_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.private_projects%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
      or p_mutation_id is null then
    raise exception using errcode = '22023',
      message = 'A nonnegative expected revision and mutation UUID are required';
  end if;

  -- Transaction-scoped, namespaced owner lock also serializes first inserts.
  -- Hash collisions can only cause harmless extra serialization, not access.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 180042)
  );
  select p.* into v_row from public.private_projects as p
  where p.user_id = v_user_id for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using errcode = 'P0002',
        message = 'Cloud project is missing; reload before saving';
    end if;
    -- ON CONFLICT also handles a simultaneous direct insert outside the RPC.
    insert into public.private_projects (user_id, project, last_mutation_id)
    values (v_user_id, p_project, p_mutation_id)
    on conflict (user_id) do nothing
    returning * into v_row;
    if found then
      return pg_catalog.jsonb_build_object(
        'status', 'saved', 'project', v_row.project,
        'revision', v_row.revision, 'updated_at', v_row.updated_at
      );
    end if;
    select p.* into v_row from public.private_projects as p
    where p.user_id = v_user_id for update;
  end if;

  if v_row.last_mutation_id = p_mutation_id then
    return pg_catalog.jsonb_build_object(
      'status', 'saved', 'project', v_row.project,
      'revision', v_row.revision, 'updated_at', v_row.updated_at
    );
  end if;
  if v_row.revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict', 'project', v_row.project,
      'revision', v_row.revision, 'updated_at', v_row.updated_at
    );
  end if;

  update public.private_projects as p
  set project = p_project, last_mutation_id = p_mutation_id
  where p.user_id = v_user_id
  returning * into v_row;
  return pg_catalog.jsonb_build_object(
    'status', 'saved', 'project', v_row.project,
    'revision', v_row.revision, 'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.save_project(jsonb, bigint, uuid)
from public, anon, authenticated;
grant execute on function public.save_project(jsonb, bigint, uuid)
to authenticated;

comment on table public.private_projects is
  'One private little-breath project per authenticated owner. No public read access.';
comment on function public.save_project(jsonb, bigint, uuid) is
  'Owner-only optimistic save. Expected revision 0 creates; stale revisions conflict; latest mutation retries are idempotent.';
