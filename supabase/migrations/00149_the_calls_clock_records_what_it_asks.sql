-- 00149 · The calls clock records what it asks, so the edge's answer is judged.
--
-- The register (00107) says the calls sweep is judged on what the edge
-- answered: ('calls', 'call-reconcile', null, 'request'). Nothing has been
-- judged since 00031, which re-declared trigger_call_reconcile from 00020's
-- text and lost what 00026 had it record: the pg_net request id and when it
-- was enqueued. 00148 restored the note and only the note. So a rotated
-- cron_sweep_key (401), a moved edge_base_url (404), a deployment without
-- RETELL_API_KEY (503), or a purge the bucket refuses (500 since this change,
-- apps/edge/api/cron/calls.ts) reached nobody, while pg_cron called every run
-- a success.
--
-- trigger_call_reconcile, from 00148, now asks through request_sweep (00086),
-- the one body that records what it asks, so sweep_health() reads the edge's
-- answer, /api/health says 503 to the outside monitor while it is bad, and
-- the health sweep mails the platform. Two choices keep a slow tick from
-- paging anybody:
--
--  * pg_net waits 65 s, past the sweep's own maxDuration of 60. A tick can run
--    that long: two recording copies, each fetched and uploaded on 20 s bounds,
--    and the provider's lookups have none. At 30 s, or request_sweep's default
--    of 55, a tick that finished would read "the request timed out". At 65
--    pg_net hears the edge's own answer: the sweep's, when it finished, or
--    Vercel's 504 when it cut the function off, which is a tick that did not
--    finish.
--
--  * A turn with nothing owed clears the note (00026, load-bearing) and records
--    nothing else. Unlike the jobs and leads clocks, it stamps no look: 'calls'
--    has no max_silence, because silence is an idle line, so a look would buy
--    nothing, and it would hold the last ask inside sweep_health()'s one-hour
--    window for ever -- once pg_net drops that answer after six hours, the row
--    would read "pg_net never recorded a response". The last ask is judged for
--    an hour, or until the next one.
--
-- Signature, grants and schedule are unchanged.

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
  'Asks the edge (api/cron/calls) to sweep when the calls table owes it work: a call still marked ongoing, a recording copy still pending, a thread still owed its call line, or audio past its retention. Asks through request_sweep(), which records the request so sweep_health() judges the answer, and waits 65 s, past the sweep''s own 60. With nothing owed, clears the note and records nothing else.';
