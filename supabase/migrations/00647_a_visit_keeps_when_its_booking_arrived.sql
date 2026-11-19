-- 00647 · A visit keeps when its booking arrived, so a week of bookings is one read (decision 0141).
--
-- Today leads its figures with what was booked, counted from the ledger's appointment.changed events of the last day
-- (the dashboard's server/metrics/bookings.ts, by contracts bookingArriving). The other three figures show the seven days
-- behind them and booked showed none: a week by that read is cut at two hundred changes, and a change is far more than a
-- booking (a move, a member's word on a visit, the owner's own entries, a calendar's first read). A count in SQL beside it
-- would be the rule a second time.
--
--   appointments.arrived_at   When this visit arrived as a customer's booking: the ledger's own clock for the event that
--                             brought it, stamped by the rule that tells the owner of it. Null for a visit that is no
--                             customer's booking. No session writes it: members read appointments and the service role
--                             writes them, as before.
--   appointments_arrived      The visits of a workspace by the moment they arrived, where they did: a week of bookings
--                             is one range of it, whatever else happened to the calendar.
--   appointments_set_updated_at   The stamp is no change to the visit, so it does not move updated_at: the trigger is
--                             made again to pass a write that sets arrived_at. A reminder drawn for a visit asks
--                             whether its row changed since the run read the calendar (contracts appointmentHolds),
--                             and a stamp landing in between would have held a reminder that should go. Every other
--                             write moves updated_at as before.
--   event_subscriptions       appointment.changed is delivered to `visit_arrival` (core events/subscribers.ts), in the
--                             lane of the other reactions to a booking, where nobody waits: it asks the one rule of the
--                             event and stamps the visit with the event's moment. The later moment wins, so a hold
--                             added and then confirmed arrived when it was confirmed.
--
-- The bookings from before this are stamped once by tooling/scripts/ops/calendar/visit-arrivals-fill.mjs, by the same
-- rule through the same door, after this is on.
--
-- Deploy order: the build first, then this, as 00580 and 00599 were. A build that does not know the subscriber must
-- never be handed its deliveries (it would keep and alarm each as an unknown kind, 00456). Until this is on, the
-- dashboard reads no column, answers no week of bookings and says so in its log, and Today draws booked as it did.
-- Re-runnable.

set local lock_timeout = '3s';

alter table public.appointments add column if not exists arrived_at timestamptz;
comment on column public.appointments.arrived_at is
  'When this visit arrived as a customer''s booking (decision 0141): the created_at of the appointment.changed event the one rule calls a booking arriving (contracts bookingArriving), stamped by core''s visit_arrival subscriber, the later of two where a hold was added and then confirmed. Null for a visit that is no customer''s booking: a member''s own entry, the owner''s own diary, a calendar''s first read. A day''s bookings are counted from it (the dashboard''s server/metrics/bookings.ts).';

create index if not exists appointments_arrived
  on public.appointments (tenant_id, arrived_at)
  where arrived_at is not null;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  when (not (new.arrived_at is distinct from old.arrived_at))
  execute function extensions.moddatetime('updated_at');

insert into public.event_subscriptions (kind, subscriber, lane)
values ('appointment.changed', 'visit_arrival', 2)
on conflict (kind, subscriber) do nothing;
