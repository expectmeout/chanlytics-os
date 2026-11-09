-- 00559 · The channel a call came in on, so a channel taken away finds its calls by index.
--
-- calls.channel_id links to public.tenant_channels and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on calls is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists calls_channel on public.calls (tenant_id, channel_id) where channel_id is not null;
