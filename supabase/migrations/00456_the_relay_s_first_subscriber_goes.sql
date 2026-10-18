-- 00456 · The relay's first subscriber goes: a customer's message no longer costs a delivery and a job that do nothing.
--
-- The closed-loop audit of 17 October 2026, I. 00334 seeded one subscriber, `audit` on message.received, that settles
-- and does nothing else, so the relay's lag was measured on real traffic before any subscriber that acts arrived (0032,
-- step 3). Five that act measure it now (reach_out_booked, owner_notice, consent_notice, visit_notice, team_notice), and
-- `audit` cost an outbox row, a delivery row and an event_deliver job for every message a customer sent.
--
--  1. The subscription goes, so a customer's message no longer reaches the outbox: events_outbox_copy copies a kind only
--     where a subscription names it, and no other names message.received.
--  2. What it was still owed is settled: a job not yet run is canceled, so no build after this one, which no longer knows
--     the name, is handed one (it would keep and alarm it as an unknown kind), and a delivery not done is marked done:
--     it would have done nothing. A job a runner holds now (fired) settles as it always did, on the build that holds it.
--     Its deliveries already done stay, as the relay's history.
--
-- Deploy order: this migration first, then the build that drops the name (contracts EVENT_SUBSCRIBERS, core
-- SUBSCRIBERS). A build from before still knows `audit`, and is handed nothing new for it. Re-runnable.

set local lock_timeout = '3s';

delete from public.event_subscriptions
 where kind = 'message.received' and subscriber = 'audit';

update public.jobs
   set state = 'canceled', last_error = 'the audit subscriber went (00456): nothing to deliver'
 where kind = 'event_deliver' and state = 'scheduled' and payload ->> 'subscriber' = 'audit';

update public.event_deliveries
   set state = 'done', last_error = null
 where subscriber = 'audit' and state <> 'done';
