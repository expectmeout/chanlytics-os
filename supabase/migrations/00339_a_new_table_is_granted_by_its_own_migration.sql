-- 00339 · A new table is granted by its own migration.
--
-- Supabase's defaults give authenticated and the service role every privilege on each new table and sequence postgres
-- makes in public (00122 took anon out of them), so no migration here has had to grant either: the edge, the sweeps and
-- the dashboard's server read and write through the service role on a grant nobody wrote. From 30 October 2026 Supabase
-- stops granting the Data API on new tables in existing projects (supabase.com/changelog/45329), and a table made after
-- that with no grant of its own is one the service role cannot read. A replay builds its database with the old defaults,
-- so CI would pass the migration that production then fails on.
--
-- Now the defaults are what production's will be: a table or sequence postgres makes in public from here on grants
-- authenticated and the service role nothing, and its own migration grants the service role what it needs and
-- authenticated what its policies need, as 00334, 00335 and 00336 already do. privileges.db.test.mjs holds both
-- directions on the replayed schema, and makes a table to see what a new one starts with. Every table and sequence made
-- before keeps the grants it has; functions keep their defaults (00122 decided those).
--
-- Either deploy order: no object changes. Re-runnable: revoking a default that is already gone is a no-op.

set local lock_timeout = '3s';

alter default privileges for role postgres in schema public revoke all on tables from authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated, service_role;
