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
-- up on a request, so the database ends a statement before the client stops waiting for it.
--
-- And the one read of the ledger that had no index to keep under it. Everything that looks at one workspace's jobs of a
-- kind (cancelJobsFor when a reply is withdrawn, the settle reads after a failure, an erasure's scrub of a person's
-- words in job payloads, the lead finder's look at its own rounds) filters on (tenant_id, kind, state), and the ledger
-- indexes only due_at, fired_at and lease_until (00002, 00078, 00098) and the once-per-subject keys: each was a scan of
-- a week of every workspace's rows (00215 keeps about that many). jobs_tenant_kind_state is that lookup. It is one more
-- index to keep on a table every heartbeat writes, on a table of a week's rows, built under the 3 s lock guard: a busy
-- ledger fails this migration, to be run again, rather than queue the heartbeat behind the build. Re-runnable.

set local lock_timeout = '3s';

alter role service_role set statement_timeout = '30s';

create index if not exists jobs_tenant_kind_state on public.jobs (tenant_id, kind, state);

notify pgrst, 'reload config';
