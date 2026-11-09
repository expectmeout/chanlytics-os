-- 00579 · The wires are proved once a day (the inbound review, D6).
--
-- Nothing showed that a real text gets a real answer while real traffic is near zero: the suite fakes the wires, and
-- the nightly cannot send one. A canary does, once a day: a text from a number of the platform's own to the platform's
-- own line, and a quarter of an hour later the proof that the door took it in and the receptionist's reply left, or a
-- page (apps/edge/lib/sms/canary.ts).
--
--   trigger_text_canary_sweep()   asks the edge (/api/cron/text-canary) at 14:00 and 14:15 UTC: the first sends today's text, the
--                            second judges it. The edge says it is off, and sends nothing, until CANARY_SMS_SERVICE and
--                            CANARY_SMS_TO are set. Service role and cron only.
--   sweep_status 'text_canary'    judged by its requests: twenty-six hours is one missed day and two hours.
--
-- A judge clock (tests/clocks/_clocks.mjs). Re-runnable.

set local lock_timeout = '3s';

create or replace function public.trigger_text_canary_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return public.request_sweep('text_canary', '/api/cron/text-canary');
end $$;
revoke execute on function public.trigger_text_canary_sweep() from public, anon, authenticated;
comment on function public.trigger_text_canary_sweep() is
  'The daily text canary''s clock (00579): calls the edge (/api/cron/text-canary), which sends a text from the platform''s own canary number to its own line and, on the next tick, checks that it was taken in and answered, or pages the platform. Off at the edge until its two settings are set.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('text_canary', 'text-canary', interval '26 hours', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('text-canary') where exists (select 1 from cron.job where jobname = 'text-canary');
select cron.schedule('text-canary', '0,15 14 * * *', $$select public.trigger_text_canary_sweep()$$);
