-- 00560 · The message a call left, so a message erased finds its call by index.
--
-- calls.message_id links to public.messages and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on calls is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists calls_message on public.calls (tenant_id, message_id) where message_id is not null;
