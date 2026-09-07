-- 00063 · The calendar closes its loop through Outbound.
--
-- Two playbook triggers the calendar makes possible: a reminder the day
-- before an appointment, and a thank-you with the booking link the day
-- after a visit when nothing is booked next. The reminder runs under the
-- Booking row of the Autonomy pane, so the same setting that governs
-- bookings governs their reminders.
--
-- A visit's message carries the visit's own words — "tomorrow at 2:00 PM",
-- the service — so the run keeps them on the recipient row, resolved when
-- the run is made from the calendar the run read, and sent as they were.

alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check
  check (trigger in ('quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited'));

alter table public.playbooks drop constraint if exists playbooks_policy_class_check;
alter table public.playbooks add constraint playbooks_policy_class_check
  check (policy_class in ('reengage', 'campaign', 'booking'));

alter table public.broadcast_recipients add column if not exists facts jsonb;
comment on column public.broadcast_recipients.facts is
  'Per-person words a run resolved when it was made (a visit''s time and service); the send fills the template''s slots from them.';
