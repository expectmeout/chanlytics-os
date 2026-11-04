-- 00536 · A text Twilio could not hand us is taken in from Twilio's own record (the inbound review, B2).
--
-- Twilio posts a text to the door once and retries nothing: a text that arrived while the database was down was
-- answered 503 and lost. Twilio keeps every text a line received, so a clock reads each line's record and knocks on the
-- door again for every text the database never heard (apps/edge/lib/sms/texts-sweep.ts).
--
--   trigger_texts_sweep()   asks the edge (/api/cron/texts) every ten minutes while a line that can text exists (not a
--                           number the business kept at its carrier, not one whose provisioning failed, one with a
--                           number); otherwise records that it looked. Service role and cron only.
--   sweep_status 'texts'    judged by its requests: forty-five minutes is four missed ticks and five minutes.
--
-- A reconcile clock (tooling/scripts/tests/clocks/_clocks.mjs): it brings the database in line with the provider.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.trigger_texts_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1 from public.lines l
     where l.provider <> 'carrier' and l.voice_state <> 'failed' and l.e164 is not null
  ) then
    return public.request_sweep('texts', '/api/cron/texts');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('texts', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_texts_sweep() from public, anon, authenticated;
comment on function public.trigger_texts_sweep() is
  'The texts sweep''s clock (00536): calls the edge (/api/cron/texts), which reads each line''s record of received texts from the provider and takes in every one the database never heard, only when a line that can text exists; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('texts', 'texts-sweep', interval '45 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('texts-sweep') where exists (select 1 from cron.job where jobname = 'texts-sweep');
select cron.schedule('texts-sweep', '*/10 * * * *', $$select public.trigger_texts_sweep()$$);
