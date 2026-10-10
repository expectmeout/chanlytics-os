-- 00363 · Every sweep's request waits past the sweep's own minute.
--
-- Each edge sweep may run sixty seconds (apps/edge/vercel.json), and pg_net gave up on it sooner: the deadman and
-- health clocks call pg_net themselves with twenty seconds, and request_sweep's default, which every other clock takes
-- or names, was fifty-five. A tick that finished slowly and well was recorded timed_out, which sweep_health() reads as
-- "the request timed out before the edge answered": the platform was paged and /api/health answered 503 for a sweep
-- that had done its work. The calls clock was moved past the minute in 00149, and the domains clock was written so in
-- 00175; the rule was theirs alone.
--
-- Now every clock that asks the edge waits 65 s: request_sweep's default (calendar, channel quality, google, the jobs
-- tick and its wake, leads, lines, notes, playbooks, registrations), the three clocks that named 55 s (partners,
-- reach-out, reach-out check), and the deadman and health clocks. Each function is its latest text (supabase/
-- schema.sql) with the wait alone changed, so `create or replace` takes it and its comment and grants stand; the
-- grants are restated. A default's value may change in place; the signature does not.
--
-- Either deploy order works: the edge does not read the wait.

set local lock_timeout = '3s';

create or replace function public.request_sweep(p_sweep text, p_path text, p_timeout_ms integer default 65000)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning '% sweep not configured (missing cron_sweep_key or edge_base_url)', p_sweep;
    insert into public.sweep_status (sweep, note)
         values (p_sweep, 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || p_path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values (p_sweep, v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke all on function public.request_sweep(text, text, integer) from public, anon, authenticated;
grant all on function public.request_sweep(text, text, integer) to service_role;

create or replace function public.trigger_deadman_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'deadman sweep not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('deadman', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/deadman',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 65000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('deadman', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke all on function public.trigger_deadman_sweep() from public, anon, authenticated;
grant all on function public.trigger_deadman_sweep() to service_role;

create or replace function public.trigger_sweep_health()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'sweep health check not configured (missing cron_sweep_key or edge_base_url)';
    insert into public.sweep_status (sweep, note)
         values ('health', 'missing cron_sweep_key or edge_base_url in Vault')
    on conflict (sweep) do update set note = excluded.note, request_id = null;
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/health',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 65000
  ) into v_id;
  insert into public.sweep_status (sweep, request_id, requested_at, note)
       values ('health', v_id, now(), null)
  on conflict (sweep) do update
     set request_id = excluded.request_id, requested_at = excluded.requested_at, note = null;
  return v_id;
end $$;

revoke all on function public.trigger_sweep_health() from public, anon, authenticated;
grant all on function public.trigger_sweep_health() to service_role;

create or replace function public.trigger_partners_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only when something can be judged or can mature, or a partner has a letter due: a share held behind a review or
  -- a paused partner is not due, and asking the edge about it every day would be asking for nothing.
  if exists (select 1 from public.partner_tenants pt
              where pt.standing is null
                and exists (select 1 from public.partner_earnings e where e.tenant_id = pt.tenant_id))
     or exists (select 1 from public.partner_earnings e
                  join public.partners p on p.id = e.partner_id and p.status = 'active'
                 where e.state = 'held' and e.payable_at <= now()
                   and (e.tenant_id is null
                        or exists (select 1 from public.partner_tenants pt
                                    where pt.tenant_id = e.tenant_id and pt.standing in ('qualified', 'disqualified'))))
     or exists (select 1 from public.partner_letters_due(now())) then
    return public.request_sweep('partners', '/api/cron/partners', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('partners', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

revoke all on function public.trigger_partners_sweep() from public, anon, authenticated;
grant all on function public.trigger_partners_sweep() to service_role;

create or replace function public.trigger_reach_out_check_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.checked_at is null
          and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
          and (s.check_after is null or s.check_after <= now())
          and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
          and (b.state = 'pending_approval' or s.send_at <= now() + interval '2 hours'))
     or exists (select 1 from public.reach_out_sends
                 where state = 'held' and reason = 'check_unavailable' and hold_detail is null
                   and updated_at < now() - interval '1 hour') then
    return public.request_sweep('reach_out_check', '/api/cron/reach-out-check', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out_check', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

revoke all on function public.trigger_reach_out_check_sweep() from public, anon, authenticated;
grant all on function public.trigger_reach_out_check_sweep() to service_role;

create or replace function public.trigger_reach_out_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.send_at <= now() and s.checked_at is not null
          and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running')
     or exists (select 1 from public.reach_out_sends where state in ('claimed', 'queued'))
     or exists (select 1 from public.reach_out_sends where state = 'held' and created_at < now() - interval '14 days')
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('canceled', 'failed')
          and exists (select 1 from public.reach_out_sends s
                       where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed')))
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
          and not exists (select 1 from public.reach_out_sends s
                           where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed', 'queued'))) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

revoke all on function public.trigger_reach_out_sweep() from public, anon, authenticated;
grant all on function public.trigger_reach_out_sweep() to service_role;
