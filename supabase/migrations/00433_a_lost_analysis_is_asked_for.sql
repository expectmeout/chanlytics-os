-- 00433 · A call whose analysis was lost is asked for, and settled as if it had come.
--
-- The wiring's second audit, lane R11 (S11-3). A caller who asked to be called back was dropped when the provider's
-- "call analysed" message was lost: the hold, the owner's notice and the mail are all made by the webhook's plan for
-- that one delivery (the claim on calls.notified_at keeps them to once), and the calls clock never ran it. It asked
-- only about calls still marked ongoing, and its last leg wrote a thread line for a call with no analysis, nothing else.
-- Retell retries a refused delivery three times; a kept delivery is replayed by hand.
--
-- The calls sweep now has a leg that asks the provider about a call that ended at least ten minutes ago (contracts
-- ANALYSIS_GRACE_MS), ran past the seconds of a caller who hung up at once (ABANDONED_MS), whose owner was never told
-- (notified_at is null), with no analysis yet (no summary) or one that asked for a call back. Once the provider has its
-- analysis, the webhook's own second half runs on it (apps/edge/lib/voice/call-webhook.ts settleCall), the claim
-- keeping the notice to once.
-- A call is asked about for two hours after it ended and no longer: one the provider never analyses is not asked about
-- every five minutes all day. This clock wakes the sweep for that owed work too. Signature, grants and schedule are
-- unchanged.
--
-- Re-runnable.

create or replace function public.trigger_call_reconcile()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pending int;
begin
  select count(*) into v_pending
    from public.calls
   where (status = 'ongoing'
          and (updated_at < now() - interval '5 minutes'
               or started_at < now() - interval '30 minutes'))
      or (status in ('ended', 'error')
          and updated_at < now() - interval '5 minutes'
          and recording->>'fetch_state' = 'pending'
          and coalesce((recording->>'attempts')::int, 0) < 3)
      -- a call that ended without an analysis still owes the thread a line
      or (status in ('ended', 'error')
          and message_id is null
          and conversation_id is not null
          and ended_at < now() - interval '15 minutes')
      -- a call whose owner was never told, its analysis not here or asking for a call back: asked of the provider for
      -- two hours after it ended (00433, the sweep's settle leg)
      or (status in ('ended', 'error')
          and notified_at is null
          and conversation_id is not null
          and coalesce(duration_ms, 0) >= 15000
          and ended_at < now() - interval '10 minutes'
          and ended_at > now() - interval '2 hours'
          and (summary is null or outcome = 'callback_needed'))
      -- audio past its retention (contracts RETENTION_DAYS.call_recordings):
      -- exactly what the sweep's first leg, purgeExpiredRecordings, selects
      or (recording->>'fetch_state' = 'stored'
          and started_at < now() - interval '90 days');
  if v_pending = 0 then
    -- 00026: clearing the note here is load-bearing. On an idle line this is
    -- every tick, and a note one transient Vault failure wrote would otherwise
    -- outlive its fault and be mailed to the platform four times a day.
    update public.sweep_status set note = null where sweep = 'calls' and note is not null;
    return null;
  end if;

  -- The request id and when it was enqueued, or, when Vault cannot send it,
  -- the note: whichever it is, where sweep_health() reads it.
  return public.request_sweep('calls', '/api/cron/calls', 65000);
end $$;

revoke execute on function public.trigger_call_reconcile() from public, anon, authenticated;

comment on function public.trigger_call_reconcile() is
  'Asks the edge (api/cron/calls) to sweep when the calls table owes it work: a call still marked ongoing, a recording copy still pending, a thread still owed its call line, a call whose owner was never told (for two hours after it ended), or audio past its retention. Asks through request_sweep(), which records the request so sweep_health() judges the answer, and waits 65 s, past the sweep''s own 60. With nothing owed, clears the note and records nothing else.';
