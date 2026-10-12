-- 00410 · A booking that arrived and a teammate who joined are told from their events (wiring plan, task 2.4; S1-01, S1-19).
--
-- A customer's booking reached the Calendar and nothing else: the only bell row about the calendar was "2 people added from
-- your calendar", written by the hourly sweep alone and only when it made a person. A teammate who accepted an invitation
-- reached nobody: the invitation's pending row stayed on the bell until the Team read was repeated, and no line said they
-- had joined. Both are facts the ledger already holds. A booking is an appointment.changed event written in the row's own
-- transaction by whichever door kept it (00389's trigger for a booking tool's email, 00348's door for the owner's feed); a
-- seat is a member.joined event written by the read that took it (acceptOpenInvites). The owner is told from the event, once,
-- as a hold is (00396) and a customer's no is (00409).
--
--   notifications_kind_check   00409's list, with `booking` (a booking arrived: a line on the bell that opens the visit on its
--                              day, no mail, no phone) and `member_joined` (a teammate joined: a line on the bell that opens
--                              Settings > Team, no mail, no phone). Contracts SERVER_NOTIFICATION_KINDS, NOTIFICATION_DELIVERY
--                              ("bell"), BELL_LINE_KINDS.
--   event_subscriptions        appointment.changed -> visit_notice and member.joined -> team_notice, both in lane 2 (news for the
--                              bell, nobody waiting: a reply or a person waiting must never queue behind them). The
--                              subscribers are core's (SUBSCRIBERS.visit_notice, team_notice). Beside reach_out_booked on the
--                              same kind: a kind may have many subscribers, and each delivery is its own row.
--
-- notifications.source_event (00396) keeps the event a notice answers, unique, so a second delivery of an event, a re-drive, or
-- the harness's second run tells nobody again. The calendar feed writes every visit it adds as an event of its own in one
-- transaction; the subscriber tells those of one read as one line, by the first of them, and says nothing of a read that adds
-- more than a customer could book in an hour (a calendar newly connected), so no row is written here for that.
--
-- Deploy order: this migration first, or either. An edge from before does not know the subscribers, and a delivery to an
-- unknown subscriber is kept for the edge that does (00334) and told then. An edge from after, on a database from before,
-- cannot keep the kind and tries the delivery again until this lands. Re-runnable.

set local lock_timeout = '3s';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out','booking','member_joined'));

insert into public.event_subscriptions (kind, subscriber, lane)
values ('appointment.changed', 'visit_notice', 2),
       ('member.joined', 'team_notice', 2)
on conflict (kind, subscriber) do nothing;
