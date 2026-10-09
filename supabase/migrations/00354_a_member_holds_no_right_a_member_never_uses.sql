-- 00354 · A member holds no right a member never uses.
--
-- Row security decides which rows a member reads and writes, and column grants which columns. Four table privileges sat
-- outside both: TRUNCATE (row security does not apply to it), TRIGGER, REFERENCES and MAINTAIN. About fifty tables
-- granted them to `authenticated`, some by a `grant all` an early migration wrote and some by the platform's old
-- default, messages, tenants and tenant_config among them. Nothing a session does through the Data API can use any of
-- the four, which is why nothing failed; the floor should not rest on what the API happens not to offer.
--
-- Taken from `authenticated` and `anon` on every table of `public`, in one statement. What a member reads, inserts,
-- updates and deletes is untouched: SELECT, INSERT, UPDATE and DELETE and their column lists stay as each table's
-- migration left them, and the service role keeps everything. A table made later is granted what its own migration
-- says (the platform grants nothing by default to a table made after 30 October 2026), and
-- database/privileges.db.test.mjs holds every table to this, so a later `grant all` to a session is a red build.
--
-- Either deploy order: no code asks for any of the four. Re-runnable.

set local lock_timeout = '3s';

revoke truncate, trigger, references, maintain on all tables in schema public from authenticated, anon;
