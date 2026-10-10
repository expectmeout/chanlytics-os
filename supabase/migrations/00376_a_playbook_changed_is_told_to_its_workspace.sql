-- 00376 · A playbook changed is told to its workspace.
--
-- A playbook paused, resumed, renamed or retimed in one tab or by a teammate, or stamped by the sweep's run, reached no
-- other open page: `playbooks` was not among the tables the database tells a workspace about (00265), so Campaigns kept
-- a paused playbook running on screen until something else re-read it (the ledger's report, P1-7). Now a statement that
-- makes, changes or removes a playbook is told on the workspace's topic as every watched table's is: the table and the
-- event, never the row. The triggers are 00265's, made the way 00321 made broadcasts'; packages/db realtime.ts lists the
-- table (WATCHED) and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal. A playbook's row
-- changes a few times a day at most (an edit, the sweep's last_run stamp), so the notices are few.
--
-- No place in supabase_realtime: the notices ride realtime.send, and 00324 took every table out of the publication
-- (database/realtime-publication.db.test.mjs fails one put back), so 00321's publication step is not copied.
--
-- Either deploy order works: until the dashboard listens for the table a notice is one Realtime drops, and a dashboard
-- that listens before the triggers exist hears nothing new. Re-runnable: each trigger is dropped first.

do $$
declare
  e text;
begin
  foreach e in array array['insert', 'update', 'delete'] loop
    execute format('drop trigger if exists %I on public.playbooks', 'workspace_tell_' || e);
    execute format(
      'create trigger %I after %s on public.playbooks referencing %s table as changed '
      'for each statement execute function public.workspace_tell_changes()',
      'workspace_tell_' || e, e, case e when 'delete' then 'old' else 'new' end);
  end loop;
end $$;
