-- ---------------------------------------------------------------------------
-- Call reconciliation schedule
--
-- calls.status = 'ongoing' is written from Retell's own call_status and is only
-- ever cleared by a LATER webhook. A single lost call_ended — a deploy mid-call,
-- a provider blip, a 500 on our side — leaves that row 'ongoing' forever.
--
-- isLiveCall() already stops such a row being RENDERED as live after ten
-- minutes, but the row stays wrong underneath: metrics count it, the
-- calls_live partial index carries it, and anything querying status directly
-- still sees a call in progress that hung up last week.
--
-- The provider is the authority on whether a call is still up, so the edge asks
-- it. This migration only schedules that question; the logic lives in
-- /api/cron/calls, for the same reason the deadman sweep's does — a second copy
-- of the reconciliation rules in plpgsql is the duplication this codebase keeps
-- paying for.
--
-- Reuses the deadman sweep's Vault secrets (cron_sweep_key, edge_base_url) and
-- its fire-and-forget shape: if a request is lost, the next tick finds the same
-- candidates, because the guard is the row's own status rather than this call.
-- ---------------------------------------------------------------------------

create or replace function public.trigger_call_reconcile()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
  v_pending int;
begin
  -- Cheap guard: on a quiet line this is every tick, and there is no reason to
  -- wake the edge to tell it there is nothing to do.
  select count(*) into v_pending
    from public.calls
   where status = 'ongoing'
     and updated_at < now() - interval '5 minutes';
  if v_pending = 0 then
    return null;
  end if;

  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'call reconcile not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;

  select net.http_post(
    url     := v_url || '/api/cron/calls',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end $$;

revoke execute on function public.trigger_call_reconcile() from public, anon, authenticated;

comment on function public.trigger_call_reconcile() is
  'Asks the edge to reconcile ongoing calls against the voice provider. No-ops when nothing is stale.';

-- Every 5 minutes. The edge only considers rows untouched for 5 minutes, so a
-- dropped call_ended is corrected within roughly ten — well inside the ten
-- minute window isLiveCall() will already have hidden it for.
select cron.unschedule('call-reconcile') where exists (select 1 from cron.job where jobname = 'call-reconcile');
select cron.schedule('call-reconcile', '*/5 * * * *', $$select public.trigger_call_reconcile()$$);
