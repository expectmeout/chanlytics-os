-- 00121 · A column grant is a fence only when the table-wide grant is gone.
--
-- Supabase hands authenticated and anon UPDATE on every table in public. To let
-- a session change some columns and not others, a migration has to take the
-- table-wide UPDATE back and then grant the columns. 00037 did both for
-- conversations, messages and escalations, and 00084 did both for tenants. Six
-- later migrations granted columns and never revoked the table grant, so their
-- column lists fenced nothing, every write the product makes kept working, and
-- no test had anything to fail on:
--
--   ask_threads    00040          title, scope, last_at
--   ask_messages   00041          content
--   segments       00044          name
--   broadcasts     00046, 00119   state, scheduled_for
--   playbooks      00048          name, state, the template and its params, the run rules
--   tenant_config  00085          updated_by
--
-- What that allowed, inside what each table's policies already allow: a person
-- could re-file their own Ask threads and messages under any workspace id, since
-- the own-rows update policies check only user_id; an acting member could
-- rewrite a scheduled broadcast's template, params or audience without the
-- route's checks; an owner could store a config the save rules refuse. No row
-- of another workspace could be read or changed. The production audit of 14 Sep
-- 2026 read it off the ACLs: authenticated=arwdDxtm on these six, ardDxtm on the
-- four done right.
--
-- REVOKE UPDATE on a table also takes back every column UPDATE granted on it, so
-- each revoke below is followed by its whole column list. Two lists were short
-- of what the dashboard writes, hidden until now by the table grant: the
-- playbook editor rewrites `trigger` (PUT /api/v1/playbooks/:id), and the
-- settings save writes `config` and `version` beside `updated_by`
-- (putTenantConfig, on the owner's session). Both are in. The edge, the jobs and
-- every definer function write these tables as the service role or as the
-- function's owner, which none of this touches.
--
-- The rest of the same audit's floor, here because it is the same question --
-- does each grant say what the product needs and no more:
--
--   * Three trigger functions that run with definer rights were executable by
--     anon and authenticated. Postgres will not run a trigger function outside
--     a trigger, so nothing was reachable; they are closed anyway, as
--     record_workspace_created already is. Firing a trigger never checks EXECUTE.
--   * messages_guard, enforce_money_lock and ensure_events_partition resolved
--     names through the caller's search_path. They are pinned to public, as
--     every definer function already is.
--   * The partitions of events kept anon and authenticated grants. A partition
--     is read through events, whose policy scopes it, and Postgres checks the
--     table a query names, not the partitions it reaches; the grants did nothing
--     but sit beside RLS with no policy, the pairing 00120 closed on the service
--     role's tables. ensure_events_partition now revokes on every month it makes.
--   * lookup_user_for_invite told any workspace owner, for any address, whether
--     it has an account, and whose. Sign-up is open, so any owner is anyone. The
--     invite route already requires an owner and a rate bucket; it now asks with
--     the service role, and a session cannot call the function.
--
-- What does NOT change: no policy, no predicate, no column the dashboard writes.
-- privileges.db.test.mjs reads these rules back out of the catalog, and
-- tenancy.db.test.mjs now tries to move a person's own rows.

-- ----------------------------------------------------------------- the fences

revoke update on public.ask_threads from authenticated, anon;
grant update (title, scope, last_at) on public.ask_threads to authenticated;

revoke update on public.ask_messages from authenticated, anon;
grant update (content) on public.ask_messages to authenticated;

revoke update on public.segments from authenticated, anon;
grant update (name) on public.segments to authenticated;

revoke update on public.broadcasts from authenticated, anon;
grant update (state, scheduled_for) on public.broadcasts to authenticated;

revoke update on public.playbooks from authenticated, anon;
grant update (name, trigger, state, template_id, template_name, template_language, params,
              policy_class, run_hour, cap_per_run, gap_days, cadence_days)
  on public.playbooks to authenticated;

revoke update on public.tenant_config from authenticated, anon;
grant update (config, version, updated_by) on public.tenant_config to authenticated;

-- --------------------------------------------------- trigger functions, closed

revoke execute on function public.marketing_consent_on_erase() from public, anon, authenticated;
revoke execute on function public.provision_tenant_on_insert() from public, anon, authenticated;
revoke execute on function public.segment_members_on_erase() from public, anon, authenticated;

-- ------------------------------------------------------- search paths, pinned

alter function public.messages_guard() set search_path = public;
alter function public.enforce_money_lock() set search_path = public;

-- ---------------------------------------------------- the partitions of events

create or replace function public.ensure_events_partition(p_month date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'events_y' || to_char(v_start, 'YYYY') || 'm' || to_char(v_start, 'MM');
begin
  execute format(
    'create table if not exists public.%I partition of public.events for values from (%L) to (%L)',
    v_name, v_start, v_end
  );
  execute format('alter table public.%I enable row level security', v_name);
  -- Read through events, never by name, so the month keeps no session grant
  -- (00121). Also run for a month that already exists: a stray grant goes.
  execute format('revoke all on table public.%I from anon, authenticated', v_name);
end
$$;

revoke execute on function public.ensure_events_partition(date) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
     where i.inhparent = 'public.events'::regclass
  loop
    execute format('revoke all on table public.%I from anon, authenticated', r.relname);
  end loop;
end
$$;

-- -------------------------------------------------- the invite's email lookup

create or replace function public.lookup_user_for_invite(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- OWNER, not merely a member. This answers "does this address have an
  -- account", which is an enumeration oracle. Since 00121 only the service role
  -- may call it, asked by the invite route after the route's own owner check and
  -- rate bucket; a session that somehow held EXECUTE again would still have to
  -- own the workspace.
  if auth.uid() is not null and not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Only an owner can invite people.' using errcode = '42501';
  end if;

  -- auth.users.email is stored lowercased, but the caller's input is not
  -- guaranteed to be, and a case mismatch here would re-create the bug this
  -- function exists to fix: a known account read as new.
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;

  return v_id;
end
$$;

revoke execute on function public.lookup_user_for_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_user_for_invite(uuid, text) to service_role;
