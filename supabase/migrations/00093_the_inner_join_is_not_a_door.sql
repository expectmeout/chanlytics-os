-- 00093 · The back office's inner join answered the service role. It should
--         answer nobody.
--
-- 00092 revoked EXECUTE on `platform_overview_rows()` from public, anon and
-- authenticated, and its comment said "execute is revoked from every role".
-- That was wrong, and calling it over REST proved it in one request:
--
--   platform_overview()       → 403  Not a Chanlytics platform admin.   (right)
--   platform_overview_rows()  → 200  [every workspace...]               (wrong)
--
-- Supabase grants `service_role` execute on functions in `public` through
-- default privileges, so revoking the three roles I thought of left the fourth.
--
-- This is not an escalation: the service-role key bypasses RLS and can already
-- select from `tenants` directly, so no data was reachable that was not
-- reachable before. It is worse than that in a different way. It is a SECOND
-- DOOR to cross-tenant data, sitting on the public REST surface, named almost
-- identically to the guarded one -- which is exactly the mistake the guard
-- exists to make impossible: "a route can be added that forgets".
--
-- Enumerating roles is how the hole got there, so the fix says what is true
-- once rather than listing who is excluded: the only caller is the guarded
-- function above it, which runs as this function's owner and needs no grant.

do $$
begin
  -- Every role Postgres knows about, minus the owner, which keeps its implicit
  -- rights on its own function. A role added by a future Supabase release is
  -- covered, because this asks pg_roles rather than trusting a list I wrote.
  execute (
    select coalesce(string_agg(format('revoke execute on function public.platform_overview_rows() from %I;', r.rolname), ' '), '')
      from pg_roles r
     where not r.rolsuper
       and r.rolname not like 'pg\_%'
       and r.rolname <> (
         select pg_get_userbyid(p.proowner) from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'platform_overview_rows'
       )
  );
  revoke execute on function public.platform_overview_rows() from public;
end $$;

comment on function public.platform_overview_rows() is
  'The back office join, in a SQL-language function so every column is validated when the migration applies. Not a door: EXECUTE is held by the owner alone, and platform_overview() -- which carries the platform-admin check -- is the only caller. Do not grant this to anything; grant the guarded function instead.';

-- Proof, in the migration, that the hole is shut. A grant that comes back --
-- from a default-privileges rule, a future release, a well-meaning hand -- is
-- a deploy failure rather than a quiet second door.
do $$
declare
  v_grantees text;
begin
  select string_agg(distinct r.grantee, ', ')
    into v_grantees
    from information_schema.role_routine_grants r
    join pg_proc p on p.proname = r.routine_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where r.routine_schema = 'public'
     and r.routine_name = 'platform_overview_rows'
     and r.grantee <> pg_get_userbyid(p.proowner)
     and r.grantee <> 'PUBLIC';
  if v_grantees is not null then
    raise exception '00093: platform_overview_rows() is still granted to %, which makes it a second door to cross-tenant data', v_grantees;
  end if;
  raise notice '00093: platform_overview_rows() is owner-only';
end $$;
