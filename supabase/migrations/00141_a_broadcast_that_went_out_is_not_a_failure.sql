-- A broadcast that went out is not a job that did not finish.
--
-- Every alert a background job raised was kept as kind 'job_failed', because
-- apps/edge/lib/job-alert.ts hard-coded that kind for all six of its callers
-- and the alert port carried no classification. Five of the six are not a job
-- failing: three are a broadcast stopped (the job completes), one is a reply
-- that could not be delivered and is already flagged in the Inbox, and one,
-- "Broadcast “Spring offer” sent, 38 people got it", is the best news the
-- workspace had that day. Today counted all of them into "6 jobs did not
-- finish", in warn amber, sorted above everything else, behind a door to the
-- Inbox.
--
-- Same defect as 00134's, and the same answer: the kind follows the meaning,
-- so nothing has to be inferred from the title's spelling. job_failed now
-- means a job that did not finish and nothing else.
--
-- The list below is the constraint as it stands after 00134 plus the two new
-- kinds. Every widening of this CHECK is drop-and-add with its own full list,
-- so the next one (the lead finder's leads_ready and leads_question are
-- planned) must be written from the list as it stands then, or it silently
-- removes these two and recordNotification swallows the insert error.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped'));
