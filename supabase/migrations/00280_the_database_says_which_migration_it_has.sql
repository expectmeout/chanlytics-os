-- 00280 · The database says which migration it has.
--
-- Production took migrations from branches, below main's head and out of order, and nothing compared what it applied
-- with main (the scorecard's defect 59). The CLI's ledger, supabase_migrations.schema_migrations, is the answer, but
-- PostgREST cannot read that schema, so the edge could not say what its own database holds. migration_head() is the
-- newest applied version and how many are applied; keyed /api/diag answers it, and a release compares it with main's
-- head (docs/runbook.md, "Apply a migration"; tooling/scripts/checks/migration-ledger.mjs).
--
-- Read-only, the service role's alone. Additive and re-runnable.

set local lock_timeout = '3s';

create or replace function public.migration_head()
returns table (head text, applied integer)
language sql
stable
security definer
set search_path = ''
as $$
  select max(m.version), count(*)::integer from supabase_migrations.schema_migrations m;
$$;

comment on function public.migration_head() is
  'The newest migration version the CLI''s ledger has applied here, and how many it has applied: keyed /api/diag answers it.';

revoke all on function public.migration_head() from public, anon, authenticated;
grant execute on function public.migration_head() to service_role;
