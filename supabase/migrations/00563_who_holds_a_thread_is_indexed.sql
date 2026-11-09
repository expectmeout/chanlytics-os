-- 00563 · Who holds a thread in hand, so a member leaving finds the threads they hold by index.
--
-- conversations.control_by links to auth.users and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on conversations is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists conversations_control_by on public.conversations (control_by) where control_by is not null;
