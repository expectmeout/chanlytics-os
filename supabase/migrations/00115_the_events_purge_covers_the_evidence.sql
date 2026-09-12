-- The events purge covers the evidence kinds, not two.
--
-- 00038 purged webhook.auth and webhook.delivery after thirty days and left
-- every other kind for ever, on the rule that everything else is the record.
-- Five kinds written since are evidence by the same rule: the allowlist's
-- skips, an unreachable sender, an unroutable inbound, and the two
-- model-usage rows the budgets read over a rolling day (budget.ts,
-- ask-gateway.ts: twenty-four hours; seven hundred rows of assistant usage
-- sat on the live ledger with nothing reading past a day). The list lives in
-- contracts (EVENT_EVIDENCE_KINDS) and here, and retention.db.test.mjs holds
-- the two together on a real database. usage.voice_seconds and
-- usage.wa_conversation stay: a call's cost and a conversation's opening are
-- the record, and the reports read them.
--
-- The schedule is 00038's (purge-events, 04:23 daily); create or replace
-- keeps it, and keeps the function's owner and grants.

create or replace function public.purge_events(p_keep interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.events
   where kind in (
     'webhook.auth', 'webhook.delivery',
     'ingest.allowlist_skip', 'ingest.unreachable_sender', 'ingest.unroutable',
     'usage.llm_tokens', 'usage.ask_tokens'
   )
     and created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_events(interval) from public, anon, authenticated;

comment on function public.purge_events(interval) is
  'Drops the evidence kinds (webhook receipts and deliveries, the allowlist''s skips, unreachable and unroutable inbounds, the two model-usage rows) older than p_keep (default 30 days; contracts RETENTION_DAYS.events_evidence). Every other event kind is the record and is never purged here.';
