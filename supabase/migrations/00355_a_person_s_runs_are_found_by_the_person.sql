-- 00355 · A person's runs are found by the person.
--
-- broadcast_recipients is keyed (broadcast_id, contact_id), so every question that starts from a person read the whole
-- table: the same-workspace foreign key's check when a person is erased or merged
-- (broadcast_recipients_contact_id_same_workspace, 00279), merge_people folding one person's lines into another's
-- (00326), and a person's page listing what they were sent. The index leads with the workspace, as that foreign key and
-- every such read do.
--
-- Built CONCURRENTLY, so no send waits on it: a table that takes a write for every person of every run is never locked
-- for an index. That is why this file holds one statement and nothing else, not even a lock_timeout: an index made
-- concurrently cannot share a transaction, and the migration runner sends a file of several statements as one.
-- database/migrations.test.mjs holds every later index on such a table to the same shape. Re-runnable; an index left
-- invalid by a build that was interrupted is dropped by hand and the file run again (docs/runbook.md).

create index concurrently if not exists broadcast_recipients_person on public.broadcast_recipients (tenant_id, contact_id);
