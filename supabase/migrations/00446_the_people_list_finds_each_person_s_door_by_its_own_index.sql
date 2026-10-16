-- 00446 · The People list finds each person's door by its own index.
--
-- people_list reads, for each person on the page, how they were added: their first contact.added event
--   where tenant_id = … and subject_type = 'contact' and subject_id = … and kind = 'contact.added' order by created_at
-- Two of 00002's indexes serve that, and the planner prices them the same. SQL functions plan their body once for any
-- workspace, so it sees one row either way (0.29..8.31 each, a tie):
--   events_tenant_subject (tenant_id, subject_type, subject_id, created_at) reads that person's door alone;
--   events_tenant_kind_created (tenant_id, kind, created_at) walks the workspace's contact.added events in time order
--     until it meets theirs, which is quadratic in a workspace's people.
-- The tie broke the second way on main's Database run after #1617 (statistics the rest of the suite left):
-- reads-go-through-their-own-rows.db.test.mjs read 255 event rows for 10 doors. It had passed seven runs before.
--
-- This index holds those events alone, keyed by the person, in the order the lookup reads them. It matches every
-- condition and is far smaller than either general index, so it is the cheaper path whatever the statistics say
-- (0.14..8.16 on the same stack). It takes a row only when someone is added, and none of the list's answers change.
--
-- events is partitioned, so the index is built on each partition and cannot be built concurrently. On production
-- (15 Oct 2026: 6,275 events, 5 contact.added, 5 MB in all) the build holds its lock for milliseconds.

create index if not exists events_contact_added
  on public.events (tenant_id, subject_id, created_at)
  where kind = 'contact.added' and subject_type = 'contact';
