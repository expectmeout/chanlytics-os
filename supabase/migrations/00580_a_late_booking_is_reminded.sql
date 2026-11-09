-- 00580 · A late booking is reminded: a booking that lands after the reminder's daily look is handed to the reminder.
--
-- Decision 0118. The appointment reminder looks once a day, at its hour, for tomorrow's visits (sequence_steps_due,
-- contracts runDueNow), and one batch a step a day is the rule here (sequence_batches_step_run). So a customer who books
-- at three in the afternoon for nine the next morning was reminded by nobody: today's look was at ten, and tomorrow's
-- looks at the day after.
--
-- The reaction (0032): the subscriber `visit_reminder` in core/events/subscribers.ts, in the background lane with
-- visit_notice and freed_time_offer. An appointment added, confirmed or moved is handed to the edge's door, which runs
-- the workspace's step on visit_tomorrow for that one person, at 8:00 PM the evening before (contracts lateReminderAt),
-- where the day's look can no longer name the visit. A row only: no table, column or function changes.
--
-- Deploy order: the build first, then this row. A build that does not know the name must never be handed its
-- deliveries: it would keep and alarm each as an unknown kind (00456). Until the row is in, nothing new is delivered
-- and the reminder behaves as it did. Re-runnable.

set local lock_timeout = '3s';

insert into public.event_subscriptions (kind, subscriber, lane)
values ('appointment.changed', 'visit_reminder', 2)
on conflict (kind, subscriber) do nothing;
