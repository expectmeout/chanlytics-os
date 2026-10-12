-- 00414 · The people at a business are found by its lead.
--
-- Decision 0052 gave a person the business they work at (contacts.lead_id, 00413). Every question that starts from the
-- business asks for its people: the person page's business sheet (who works here), Leads' peek (In People), a lead
-- erased while one of its people is still here (leads_erase_on_contact, the person leg), and the lead's own trigger
-- that tells its person (lead_tells_its_person). Without this index each read the workspace's whole contacts table. It
-- leads with the workspace, as every such read does, and holds only the people who work somewhere.
--
-- Built CONCURRENTLY, so no message waits on it: contacts takes a write for every message and call, and is never locked
-- for an index. That is why this file holds one statement and nothing else, not even a lock_timeout: an index made
-- concurrently cannot share a transaction, and the migration runner sends a file of several statements as one
-- (database/migrations.test.mjs; 00355 is the first). Re-runnable; an index left invalid by a build that was interrupted
-- is dropped by hand and the file run again (docs/runbook.md).

create index concurrently if not exists contacts_tenant_lead on public.contacts (tenant_id, lead_id) where lead_id is not null;
