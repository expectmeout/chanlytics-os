-- 00281 · The service role's statements have a bound.
--
-- A member's statements end at 8 s and a stranger's at 3 s (Supabase's own statement_timeout on authenticated and
-- anon), but the service role had none: a statement the edge, a sweep or a script ran through PostgREST could hold a
-- connection from the pool for as long as it liked, and no caller's own bound could stop it on the database's side.
-- Now it ends at 30 s. PostgREST applies a role's settings to the requests it runs as that role; the reload below
-- tells it at once rather than at its next restart.
--
-- The ledger's statements were checked against it: the claim, the completion and the kept rows are one indexed row
-- each (00098, 00286); jobs_backlog and sweep_health read indexed or small sets; purge_jobs and the
-- other purges run inside Postgres as pg_cron's own role, a thousand rows a statement, and this bound is not theirs.
-- The slowest service-role statement measured in this tree is the erasure's scan of a person's words (00238: 3.6 s on
-- a large local workspace). createServiceClient (packages/db) waits 30 s and ten more for the network before it gives
-- up on a request, so the database ends a statement before the client stops waiting for it. Re-runnable.

set local lock_timeout = '3s';

alter role service_role set statement_timeout = '30s';

notify pgrst, 'reload config';
