-- 00135 · A failed intake can be taken in again.
--
-- 00127 keeps one email_ingest job per received email per mailbox, so a
-- webhook Resend delivers twice schedules nothing the second time. Its index
-- counted EVERY state, failed included, and a failed job is final
-- (jobs_guard): an intake that failed held its email's key for ever, and
-- replaying the webhook from Resend once the cause was fixed answered 23505,
-- "already taken in". That is why the one email lost on email's first day
-- (18 Sep 2026) could not be brought back: it arrived while the deployment's
-- key could send mail but not read it, its job failed with 401, and the key
-- was replaced sixteen minutes later.
--
-- The ledger now tries a throwing intake again before it fails it (#672,
-- packages/jobs RETRY_WAITS_MS). This is the way back for what outlasts those
-- tries: a failed row no longer holds the key, so a replay schedules a fresh
-- job. A scheduled, running or finished intake still holds it -- an email that
-- was taken in is never taken in twice -- and a second take could not store
-- the email twice anyway: the message is written under the provider's id
-- (messages_tenant_external_uq, ingest_inbound's ON CONFLICT), and one already
-- handled ends as "already_handled".
--
-- One transaction: DROP INDEX locks jobs until the new index is in place, so
-- no webhook can slip a second live row in between.

drop index if exists public.jobs_email_ingest_uq;

create unique index jobs_email_ingest_uq
  on public.jobs ((payload->>'mailbox_id'), (payload->>'received_id'))
  where kind = 'email_ingest' and state <> 'failed';

comment on index public.jobs_email_ingest_uq is
  'One live intake per received email per mailbox: a replayed webhook schedules nothing while one is scheduled, running or done. A failed intake does not count (00135), so replaying its webhook takes the email in again.';
