-- 00561 · Who a merged person became, so a person erased finds those merged into them by index.
--
-- contacts.merged_into_contact_id links to public.contacts and no index served the link (decision 0111): a delete or a
-- change of the parent's key read the whole table to find what pointed at it. Built CONCURRENTLY, alone in its file, as
-- every index on contacts is, so no write waits on the build. Push it alone (docs/migration-claims.md), then ask
-- production for an invalid index (the runbook's `pg_index ... not indisvalid`).

create index concurrently if not exists contacts_merged_into_contact on public.contacts (tenant_id, merged_into_contact_id) where merged_into_contact_id is not null;
