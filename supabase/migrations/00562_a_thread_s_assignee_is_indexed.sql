-- 00562 · Who a thread is assigned to, so a member leaving finds their threads by index.
--
-- conversations.assignee_user_id links to auth.users and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on conversations is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists conversations_assignee_user on public.conversations (assignee_user_id) where assignee_user_id is not null;
