-- 00565 · Old deliveries go with the old evidence.
--
-- event_deliveries keeps one row per event and subscriber the relay delivered (decision 0032), and until now nothing
-- removed one: a workspace's rows went only with the workspace (decision 0111, layer 8 of the backend review). The
-- privacy page already says delivery logs are kept for RETENTION_DAYS.events_evidence, 30 days, and purge_events is
-- the nightly clock that keeps that promise for the events ledger, so it now removes the relay's finished deliveries
-- too: done or failed, and untouched for p_keep. A delivery still scheduled or paused is work, and stays. The redrive
-- door and Health read the last days, never a month back.
--
-- Re-runnable.

create or replace function public.purge_events(p_keep interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_deliveries integer;
begin
  delete from public.events
   where kind in (
     'webhook.auth', 'webhook.delivery',
     'ingest.allowlist_skip', 'ingest.unreachable_sender', 'ingest.unroutable',
     'usage.llm_tokens', 'usage.ask_tokens',
     'person.resolved'
   )
     and created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  delete from public.event_deliveries
   where state in ('done', 'failed')
     and updated_at < now() - p_keep;
  get diagnostics v_deliveries = row_count;
  return v_count + v_deliveries;
end $$;

revoke execute on function public.purge_events(interval) from public, anon, authenticated;
grant execute on function public.purge_events(interval) to service_role;
comment on function public.purge_events(interval) is
  'Drops the evidence kinds (webhook receipts and deliveries, the allowlist''s skips, unreachable and unroutable inbounds, the two model-usage rows, and person.resolved, a door''s own record of a match, 00342) older than p_keep (default 30 days; contracts RETENTION_DAYS.events_evidence), and the relay''s finished deliveries (event_deliveries done or failed, 00565) untouched for as long. Every other event kind is the record and is never purged here.';
