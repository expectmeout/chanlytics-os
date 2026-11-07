-- 00558 · Who sent a message, so deleting an account finds that person's messages by index.
--
-- messages.sent_by links to auth.users and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on messages is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists messages_sent_by on public.messages (sent_by) where sent_by is not null;
