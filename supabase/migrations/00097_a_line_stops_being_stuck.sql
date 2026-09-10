-- 00097 · A line that stopped setting up can start again.
--
-- THE DEFECT. The provisioning saga runs inside its own request, and that request
-- is capped at 60 seconds (apps/edge/vercel.json) while the saga makes ten Twilio
-- calls at a 15-second timeout each plus four Retell calls at eight -- about 180
-- seconds worst case, three times the ceiling. So a run is killed not by a crash
-- but by a slow afternoon at the provider, and a killed run never reaches the
-- `catch` that would have written `voice_state = 'failed'`.
--
-- Everything then refused to touch the row:
--
--   * no sweep read `lines` for this -- `cron/registrations` filters
--     `sms_state in ('registering','approved')`, which is the carrier registration,
--     not the saga;
--   * `op:"retry"` demanded `voice_state = 'failed'`;
--   * `op:"buy"` refused because a line already existed (`line_exists`);
--   * `number_drift()` (00087) deliberately exempts a line still being set up, so
--     the diagnostic that would otherwise notice is silent by design;
--   * the owner's Setup row read "Setting up ... usually a minute or two; this page
--     updates by itself", with no button, for as long as the row lived.
--
-- The single exit was a platform admin pressing "Give the number back" -- which
-- returns the number to the carrier's pool permanently -- so the owner could buy a
-- different one. And that escape had a sting: `release` switches the routing row
-- off rather than deleting it, so a released-then-rebought line leaves a disabled
-- voice row beside the active one, which the page readers picked between
-- arbitrarily. Fixing the stuck line by releasing it manufactured the next bug.
--
-- WHAT THIS ADDS, and deliberately how little. One sweep, on the shape 00086
-- established, so it is watched by `sweep_health` from its first tick like the
-- other four. Nothing else here: the saga is ALREADY resumable -- `nextLineStep`
-- derives the whole plan from the SIDs and facts on the row, so a resume repeats
-- nothing -- and all that was ever missing was something to call it.
--
-- The deadline itself is NOT here. It lives in contracts
-- (`PROVISIONING_DEADLINE_MS`, five minutes) because four things have to agree
-- about it: the Setup row that offers the owner a Retry, the back office's action
-- list, the route that accepts that Retry, and this sweep. A number spelled out in
-- SQL as well would be a fifth opinion.

-- 1. The registry, so `sweep_health` watches this one too. The list is rewritten
--    rather than appended to, the way 00086 does it: a check constraint cannot be
--    extended in place.
alter table public.sweep_status drop constraint if exists sweep_status_sweep_check;
alter table public.sweep_status add constraint sweep_status_sweep_check
  check (sweep in ('calls', 'deadman', 'health', 'jobs', 'registration', 'calendar', 'google', 'playbooks', 'lines'));

-- 2. The deploy grace period, exactly like 00086's. Without a seed the first health
--    run finds no row, reports "this sweep has never enqueued a request" and mails a
--    false alarm minutes before the first real tick would have filled it in.
insert into public.sweep_status (sweep, requested_at)
     values ('lines', now())
on conflict (sweep) do nothing;

-- 3. The trigger, through `request_sweep` so the row is written for us.
create or replace function public.trigger_lines_sweep()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$ select public.request_sweep('lines', '/api/cron/lines') $$;
revoke execute on function public.trigger_lines_sweep() from public, anon, authenticated;
comment on function public.trigger_lines_sweep() is
  'Asks the edge to resume any line whose provisioning saga was killed mid-run. Recorded in public.sweep_status.';

-- 4. The schedule. Every quarter hour, offset off the others so a tick does not
--    land with the health check or the registration sweep: a resume is a whole saga
--    of up to fourteen provider calls, and it wants its 60 seconds to itself.
--
--    Quarter-hourly rather than hourly because this is the sweep a customer is
--    WAITING on -- their phone number does not work until it runs -- while the
--    registration sweep waits on the carriers, who answer in days.
select cron.unschedule('lines-sweep') where exists (select 1 from cron.job where jobname = 'lines-sweep');
select cron.schedule('lines-sweep', '8,23,38,53 * * * *', $$select public.trigger_lines_sweep()$$);

do $$
begin
  raise notice '00097: a line stuck at provisioning is resumed within a quarter hour, by the same function the owner''s Retry calls.';
end $$;
