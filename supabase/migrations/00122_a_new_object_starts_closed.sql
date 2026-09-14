-- 00122 · A new object in public starts closed to anon.
--
-- Supabase's defaults give anon and authenticated every privilege on each new
-- table and sequence in public, and give anon, authenticated and PUBLIC
-- EXECUTE on each new function. Row-level security has kept that safe -- no
-- policy names anon, and 00120 made every policy say `to authenticated` -- but
-- every closed door since 00003 has been a revoke somebody remembered to write,
-- and 00121 found six that were forgotten. The product never reads data or
-- calls a function with the logged-out key: sign-up and sign-in use it for Auth
-- alone, and the public consent and business pages read through the service
-- role.
--
-- So anon holds nothing in public, now or for anything created later:
--
--   * Existing tables, sequences and functions: anon's grants go, and so does
--     PUBLIC's EXECUTE on functions, which anon inherits.
--   * Default privileges for objects postgres creates in public stop granting
--     anon anything. PUBLIC's EXECUTE on new functions is the one default that
--     lives globally rather than per schema, and a per-schema REVOKE cannot
--     take back a global default, so that one is revoked without IN SCHEMA: it
--     covers functions postgres creates in any schema, which is what every
--     migration here runs as.
--
-- authenticated keeps exactly what it has, and new objects still grant it what
-- they did: its policies and RPCs are the product, and whether one of those is
-- safe is a question for the object, not the default. service_role is
-- untouched. privileges.db.test.mjs reads both halves back, and makes a table
-- and a function to see what a new one starts with.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
