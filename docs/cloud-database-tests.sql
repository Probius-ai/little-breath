-- Run as the Supabase SQL administrator against the applied cloud-schema.sql.
-- All synthetic users and projects are inside ONE rolled-back transaction.
-- No emails, passwords, tokens, real-user data, persistent accounts or DDL.
-- Exception blocks assert exact PostgreSQL error classes; unexpected success
-- aborts the test. The final PASS query executes only after all assertions.
-- The CAS test models two clients holding the same revision, sequentially.
-- It is not a multi-session concurrency/load test.
-- Actual run: 2026-10-03, project nfoxrsuepgpelexiraqr, PostgreSQL 17.11.
-- Result: PASS; remaining_fixture_users = 0; remaining_fixture_projects = 0.

begin;
set local statement_timeout = '20s';

do $$
declare
  a constant uuid := '55555555-1000-4000-8000-0000000000a1';
  b constant uuid := '55555555-1000-4000-8000-0000000000b1';
  m1 constant uuid := '55555555-2000-4000-8000-000000000001';
  m2 constant uuid := '55555555-2000-4000-8000-000000000002';
  m3 constant uuid := '55555555-2000-4000-8000-000000000003';
  pa constant jsonb := '{"version":1,"pet":{"name":"Synthetic A"}}';
  pb constant jsonb := '{"version":1,"pet":{"name":"Synthetic B"}}';
  result jsonb;
  first_result jsonb;
  winner jsonb;
  row_data public.private_projects%rowtype;
  affected bigint;
  before_write timestamptz;
begin
  if exists (select 1 from auth.users where id in (a, b)) then
    raise exception 'Fixture UUID already exists; stop without changing it';
  end if;
  insert into auth.users (id, aud, role, is_anonymous)
  values (a, 'authenticated', 'authenticated', false),
         (b, 'authenticated', 'authenticated', false);

  if not (select relrowsecurity and relforcerowsecurity
          from pg_catalog.pg_class where oid = 'public.private_projects'::regclass)
      or (select count(*) from pg_catalog.pg_policies
          where schemaname = 'public' and tablename = 'private_projects') <> 3 then
    raise exception 'Expected forced RLS and exactly three policies';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.private_projects', 'SELECT')
      or pg_catalog.has_table_privilege('anon', 'public.private_projects', 'INSERT')
      or pg_catalog.has_table_privilege('anon', 'public.private_projects', 'UPDATE')
      or pg_catalog.has_table_privilege('authenticated', 'public.private_projects', 'DELETE')
      or pg_catalog.has_function_privilege('anon', 'public.save_project(jsonb,bigint,uuid)', 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', 'public.guard_private_project_metadata()', 'EXECUTE') then
    raise exception 'Unexpected table/function privileges';
  end if;
  if exists (select 1 from pg_catalog.pg_proc
      where oid in ('public.save_project(jsonb,bigint,uuid)'::regprocedure,
                    'public.guard_private_project_metadata()'::regprocedure)
      and (prosecdef or not ('search_path=""' = any(proconfig)))) then
    raise exception 'Functions must be invoker and use an empty search_path';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform * from public.private_projects;
    raise exception 'Anonymous SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.private_projects(user_id, project) values (a, pa);
    raise exception 'Anonymous INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.private_projects set project = pa where user_id = a;
    raise exception 'Anonymous UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_project(pa, 0, m1);
    raise exception 'Anonymous RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- The authenticated role without an actual caller identity cannot save.
  execute 'set local role authenticated';
  begin
    perform public.save_project(pa, 0, m1);
    raise exception 'Identity-less RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if auth.uid() <> a then raise exception 'A identity not established'; end if;
  begin
    perform public.save_project(pa, 1, m1);
    raise exception 'Missing-row stale save unexpectedly recreated a row';
  exception when no_data_found then null;
  end;
  begin
    perform public.save_project(pa, -1, m1);
    raise exception 'Negative revision unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_project(pa, 0, null);
    raise exception 'Null mutation UUID unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.private_projects(user_id, project) values (b, pb);
    raise exception 'Forged-owner INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  before_write := pg_catalog.clock_timestamp();
  first_result := public.save_project(pa, 0, m1);
  if first_result ->> 'status' <> 'saved'
      or (first_result ->> 'revision')::bigint <> 1
      or first_result -> 'project' <> pa
      or (first_result ->> 'updated_at')::timestamptz < before_write then
    raise exception 'Initial owner save returned an invalid result: %', first_result;
  end if;
  result := public.save_project(pa, 0, m1);
  if result <> first_result then raise exception 'Initial retry changed receipt'; end if;
  result := public.save_project(pb, 0, m3);
  if result ->> 'status' <> 'conflict' or result -> 'project' <> pa
      or (result ->> 'revision')::bigint <> 1 then
    raise exception 'Duplicate create failed to report the existing row';
  end if;

  -- A owns one row and cannot see B, even before B creates a project.
  if (select count(*) from public.private_projects) <> 1
      or exists (select 1 from public.private_projects where user_id = b) then
    raise exception 'Owner SELECT policy failed';
  end if;
  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claim.sub', b::text, true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists (select 1 from public.private_projects where user_id = a) then
    raise exception 'B can read A';
  end if;
  before_write := pg_catalog.clock_timestamp();
  insert into public.private_projects
    (user_id, project, revision, updated_at, last_mutation_id)
  values (b, pb, 999, '2000-01-01T00:00:00Z', m3)
  returning * into row_data;
  if row_data.revision <> 1 or row_data.updated_at < before_write then
    raise exception 'Direct INSERT forged server metadata';
  end if;
  update public.private_projects set project = pb where user_id = a;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B can UPDATE A'; end if;
  result := public.save_project(pb, 1, m2);
  if result ->> 'status' <> 'saved' or (result ->> 'revision')::bigint <> 2 then
    raise exception 'B cannot save its own project';
  end if;
  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claim.sub', a::text, true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.private_projects) <> 1
      or exists (select 1 from public.private_projects where user_id = b) then
    raise exception 'A can read B';
  end if;
  update public.private_projects set project = pa where user_id = b;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'A can UPDATE B'; end if;
  begin
    update public.private_projects set user_id = b where user_id = a;
    raise exception 'Owner reassignment unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.private_projects where user_id = a;
    raise exception 'Unapproved DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  -- Two client snapshots both at revision 1: the winner becomes 2, loser
  -- returns exactly the winner's stored project without overwriting it.
  winner := public.save_project(pa || '{"care":{"meals":1}}', 1, m2);
  result := public.save_project(pa || '{"care":{"meals":2}}', 1, m3);
  if winner ->> 'status' <> 'saved' or (winner ->> 'revision')::bigint <> 2
      or result ->> 'status' <> 'conflict'
      or (result - 'status') <> (winner - 'status') then
    raise exception 'CAS winner/loser isolation failed';
  end if;
  result := public.save_project(pa || '{"care":{"meals":1}}', 1, m2);
  if result <> winner then raise exception 'Update retry was not idempotent'; end if;
  result := public.save_project(pa, 0, m1);
  if result ->> 'status' <> 'conflict'
      or (result - 'status') <> (winner - 'status') then
    raise exception 'Old mutation replay overwrote a later accepted save';
  end if;

  begin
    perform public.save_project(pa || '{"secret":"must not store"}', 2, m3);
    raise exception 'Unsupported top-level key unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_project('[]', 2, m3);
    raise exception 'Non-object project unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_project('{"version":2}', 2, m3);
    raise exception 'Unsupported project version unexpectedly accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_project(null, 2, m3);
    raise exception 'Null project unexpectedly accepted';
  exception when not_null_violation then null;
  end;
  begin
    perform public.save_project(pg_catalog.jsonb_build_object(
      'version', 1, 'pet', pg_catalog.repeat('x', 5 * 1024 * 1024)), 2, m3);
    raise exception 'Oversized project unexpectedly accepted';
  exception when check_violation then null;
  end;
  if (select revision from public.private_projects where user_id = a) <> 2 then
    raise exception 'Rejected writes changed the revision';
  end if;

  before_write := pg_catalog.clock_timestamp();
  update public.private_projects
  set revision = 9000, updated_at = '2000-01-01T00:00:00Z', project = pa
  where user_id = a returning * into row_data;
  if row_data.revision <> 3 or row_data.updated_at < before_write
      or row_data.last_mutation_id = m2 then
    raise exception 'Direct UPDATE forged metadata or kept stale receipt';
  end if;
  result := public.save_project(pa, 1, m2);
  if result ->> 'status' <> 'conflict' or (result ->> 'revision')::bigint <> 3 then
    raise exception 'Direct UPDATE did not invalidate the old RPC receipt';
  end if;
  execute 'reset role';
  if (select count(*) from public.private_projects where user_id in (a, b)) <> 2
      or (select revision from public.private_projects where user_id = b) <> 2 then
    raise exception 'Fixture row counts or cross-owner state changed';
  end if;
end;
$$;

rollback;

select 'PASS: all RLS, privilege, CAS, idempotency, validation and metadata assertions completed' as test_result,
  (select count(*) from auth.users where id in (
    '55555555-1000-4000-8000-0000000000a1',
    '55555555-1000-4000-8000-0000000000b1'
  )) as remaining_fixture_users,
  (select count(*) from public.private_projects where user_id in (
    '55555555-1000-4000-8000-0000000000a1',
    '55555555-1000-4000-8000-0000000000b1'
  )) as remaining_fixture_projects;
