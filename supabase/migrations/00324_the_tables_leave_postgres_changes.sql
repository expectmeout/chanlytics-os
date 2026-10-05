-- 00324 · The tables leave Postgres Changes.
--
-- Decision 0019, step 3 (docs/decisions/0019-the-database-tells-each-workspace-what-changed.md). Since step 2
-- (#1333, 29 September 2026) every tab hears its workspace's notices on its private topic (00265) and binds no table,
-- so Postgres Changes works for nobody: Realtime reads each change to the 26 published tables from the write-ahead
-- log and weighs it against subscriptions no tab holds any more. Every table leaves supabase_realtime, and that work
-- stops. The notices travel through Realtime's own publication of realtime.messages, which this does not touch.
--
-- Written as 00266 the day step 2 deployed and landed six days later, so the tabs opened before step 2 have long been
-- reloaded. In between, a migration that gave the live feed a table still put it in the publication, because the test
-- then asked for it (00321 did, for broadcasts); this walks the publication, so it takes those out too. Then "Allow
-- public access" is turned off in Realtime's settings (a setting, not a statement): nothing joins a public channel.
--
-- A table the live feed hears gets its trigger in 00265's list and packages/db realtime.ts (WATCHED), never a place
-- in this publication; database/realtime-publication.db.test.mjs fails one that is added. Re-runnable: each table
-- leaves only while it is there.

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
      from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end $$;
