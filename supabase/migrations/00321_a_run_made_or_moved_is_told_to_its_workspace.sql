-- 00321 · A run made or moved is told to its workspace.
--
-- The hourly sweep makes a playbook's run on the edge, and nothing told an open tab (the 4 Oct wiring review, P1 16):
-- `broadcasts` was not among the tables the database tells a workspace about (00265), so the bell said "Playbook X is
-- ready" over a Today with no Approve row, and a run under veto, which goes by itself in half an hour "unless you stop
-- it", showed its Stop only in a tab that happened to reload. Now a statement that makes, changes or removes a run is
-- told on the workspace's topic as every watched table's is: the table and the event, never the row.
--
-- The triggers are 00265's, made the way its loop makes them, for the one table; packages/db realtime.ts lists it
-- (WATCHED) and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal. A run's row changes a
-- handful of times in its life (made, approved or stopped, sending, finished), never once a person, so the notices are
-- few. Its people (`broadcast_recipients`) are not watched: a run's page reads them when it is opened.
--
-- Either deploy order works: until the dashboard listens for the table a notice is a row Realtime drops, and a
-- dashboard that listens before the triggers exist hears nothing new. Re-runnable: each trigger is dropped first.

do $$
declare
  e text;
begin
  foreach e in array array['insert', 'update', 'delete'] loop
    execute format('drop trigger if exists %I on public.broadcasts', 'workspace_tell_' || e);
    execute format(
      'create trigger %I after %s on public.broadcasts referencing %s table as changed '
      'for each statement execute function public.workspace_tell_changes()',
      'workspace_tell_' || e, e, case e when 'delete' then 'old' else 'new' end);
  end loop;
end $$;

-- Every table the one subscription watches is in the database's publication too
-- (database/realtime-publication.db.test.mjs): guarded, so the file re-runs.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcasts'
  ) then
    alter publication supabase_realtime add table public.broadcasts;
  end if;
end $$;
