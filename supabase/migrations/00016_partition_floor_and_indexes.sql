-- Two things that are fine at pilot volume and are not fine later, plus one
-- that is a cliff on a date certain.
--
-- 1. THE EVENTS PARTITION CLIFF.
--    `events` is RANGE partitioned by created_at, precreated monthly by a
--    pg_cron job (00002:186-191) that currently reaches 2027-09-30. There is
--    no DEFAULT partition, and a partitioned table with no partition covering
--    the incoming row does not "skip the insert" — it raises.
--
--    That matters far more than it looks, because ingest_inbound INSERTS INTO
--    events inside the same transaction that records the customer's message.
--    If the cron job ever stops (extension disabled, project paused, a failed
--    run nobody watches) then on the first day past coverage EVERY inbound
--    message aborts: nothing persisted, no conversation, and — since the
--    opt-out check reads the ingest result — no consent enforcement either.
--    A silent, total ingest failure with a known start date.
--
--    A default partition turns that cliff into a slope: rows still land, in a
--    slower unpartitioned heap, and the system keeps taking messages while
--    somebody fixes the cron. RLS is enabled on it explicitly — the parent does
--    not propagate it (the lesson from 00003).
--
-- 2/3. TWO MISSING INDEXES ON `messages`, both proven by reading
--    metrics_summary rather than guessed:
--
--    `real_msgs` (00011:46-50) is `select * from messages where tenant_id = ...`
--    and the ONLY index on the table is (conversation_id, created_at). Today's
--    metrics therefore sequentially scan every message row in the database.
--
--    `fresh_contacts` (00011:75-85) is worse: for EACH contact it runs two
--    correlated subqueries filtered on messages.contact_id, and contact_id is a
--    foreign key — which Postgres does not index automatically. That is
--    contacts × messages work every time the Today page loads.
--
--    Both are invisible at pilot scale and neither is a rewrite; they are the
--    indexes the existing queries already assume.

-- ------------------------------------------------------- 1. partition floor
create table if not exists public.events_default partition of public.events default;
alter table public.events_default enable row level security;

-- Same access shape as the other partitions: service-role writes, members read
-- their own tenant's rows.
drop policy if exists events_default_member_select on public.events_default;
create policy events_default_member_select on public.events_default
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

comment on table public.events_default is
  'Catch-all so a lapsed partition precreate degrades ingest instead of aborting it. Rows here mean the monthly cron needs attention.';

-- ------------------------------------------------------------- 2/3. indexes
create index if not exists messages_tenant_created
  on public.messages (tenant_id, created_at desc);

create index if not exists messages_contact_created
  on public.messages (contact_id, created_at)
  where contact_id is not null;
