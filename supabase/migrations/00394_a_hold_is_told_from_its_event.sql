-- 00394 · A hold is told from its event (decision 0043).
--
-- A thread handed to a person has been told, until now, from where the hold was decided: fifteen places in the text
-- receptionist, inside Meta's request on WhatsApp, most of them on every message of a thread already waiting; a call's
-- callback and a delivery receipt's failed send told nobody at all. The hold and its event are one write since 00388;
-- the notice now follows the event.
--
--   notifications.source_event   the event a notice answers, unique: a second delivery of it, or a re-drive, finds the
--                                notice there and tells nobody again.
--   the subscriptions            escalation.opened and escalation.changed -> owner_notice, in lane 0 (what someone is
--                                waiting on): the event_deliver job reads the hold, the thread and the person, and tells
--                                the workspace once (core SUBSCRIBERS.owner_notice).
--
-- Deploy order: this migration first. An edge from before tells inline as it did, and the subscriber finds that notice
-- (a handoff about the thread within a minute of the event) and sends nothing; an edge that does not know the
-- subscriber keeps its deliveries until one does. Re-runnable.

set local lock_timeout = '3s';

alter table public.notifications add column if not exists source_event uuid;
create unique index if not exists notifications_source_event
  on public.notifications (source_event) where source_event is not null;
comment on column public.notifications.source_event is
  'The event this notice answers (decision 0043, 00394): a hold''s notice keeps its escalation event, so a second delivery of it tells nobody. Null for a notice no event raised.';

insert into public.event_subscriptions (kind, subscriber, lane) values
  ('escalation.opened', 'owner_notice', 0),
  ('escalation.changed', 'owner_notice', 0)
on conflict (kind, subscriber) do nothing;
