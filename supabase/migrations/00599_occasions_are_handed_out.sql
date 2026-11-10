-- 00599 · Occasions are handed out: the switch that turns decision 0119 on.
--
-- 00598 made the table, its doors and the job's kind, and nothing called them. Here the two things that do:
--
--   event_subscriptions       appointment.changed and booking_link.sent are delivered to `occasion_enrol` (core
--                             events/subscribers.ts), in the bulk lane with the other reactions to a booking: a visit
--                             added, confirmed or moved enrols its person for the two-hour reminder, one marked missed for
--                             the missed visit's message, and a booking link sent for the follow-up; a cancellation and a
--                             Missed taken back take their occasions out.
--   trigger_sequences_clock   each minute it also hands a sequence_occasions job to every workspace with an occasion due
--                             (sequence_occasions_hand_out), within twenty seconds: a reminder two hours before a visit
--                             cannot wait for the hour (00449's form otherwise).
--
-- Deploy order: the build first, then this, as 00580 was. A build that does not know the subscriber must never be handed
-- its deliveries (it would keep and alarm each as an unknown kind, 00456), and one that does not know the job's kind would
-- fail each job the clock wrote. Until this is on, no occasion is enrolled and nothing is handed out. Re-runnable.

set local lock_timeout = '3s';

insert into public.event_subscriptions (kind, subscriber, lane) values
  ('appointment.changed', 'occasion_enrol', 2),
  ('booking_link.sent', 'occasion_enrol', 2)
on conflict (kind, subscriber) do nothing;

create or replace function public.trigger_sequences_clock(p_at timestamp with time zone default now())
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  -- The moments: once an hour, at five past, as playbooks-sweep ran.
  if extract(minute from p_at)::int = 5 then
    begin
      perform public.trigger_playbooks_sweep();
    exception when others then
      raise warning 'sequences-clock: the moments were not asked: %', sqlerrm;
    end;
  end if;
  -- The check before each cold email: every minute, asked only when a send waits for it.
  begin
    perform public.trigger_reach_out_check_sweep();
  exception when others then
    raise warning 'sequences-clock: the check was not asked: %', sqlerrm;
  end;
  -- The leads' send clock: every minute, asked only when a checked send is due or a run is ready to finish.
  begin
    perform public.trigger_reach_out_sweep();
  exception when others then
    raise warning 'sequences-clock: the send clock was not asked: %', sqlerrm;
  end;
  -- The occasions due (decision 0119): every minute, a job for each workspace with a person's step due, written here
  -- with no call to the edge. Spread over twenty seconds: a time of someone's own is kept to the minute.
  begin
    perform public.sequence_occasions_hand_out(p_at, 20);
  exception when others then
    raise warning 'sequences-clock: the occasions were not handed out: %', sqlerrm;
  end;
end $$;
revoke execute on function public.trigger_sequences_clock(timestamptz) from public, anon, authenticated;
comment on function public.trigger_sequences_clock(timestamptz) is
  'The one clock every sequence runs on (0060, S2): each minute it asks the moments'' sweep (at five past the hour), the check before each cold email and the leads'' send clock, and hands a job to each workspace with an occasion due (0119). Each in its own block: one that fails is said in a warning and the others still run.';
