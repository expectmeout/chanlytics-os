-- 00480 · What is brought in, what the profile and the website say, and a rehearsal are told to their workspace.
--
-- Decision 0073 (and 0069's rehearsals). Setup reads three tables the database told no page of: the imports ledger
-- (00477), where a mailbox's six months, its people, its calendar and WhatsApp's chats say how far they have come; what
-- the Business Profile and the website say (00479), offered at Your receptionist as Found for you; and the rehearsals
-- (00476), whose first review finishes the first run's Rehearse step. So "Bringing it in" and Today's "Brought in" stood
-- still while a job brought a part, Found for you waited for a reload after the website was read, and Rehearse stayed
-- open after its review landed. Now a statement that makes, changes or removes a row of any of the three is told on the
-- workspace's topic as every watched table's is: the table and the event, never the row. The triggers are 00265's, made
-- the way 00376 made playbooks'; packages/db realtime.ts lists the tables (WATCHED), contracts RECORD_KINDS names their
-- kinds (`brought`, `rehearsal`), and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal.
--
-- What it costs. An import's row moves at each part (a part reads forty seconds), so a workspace bringing its mailbox in
-- is told a few times a minute while that runs and then never; a read of the website or the profile is one row each,
-- now and then; a rehearsal a handful of writes while one is made and reviewed.
--
-- No place in supabase_realtime: the notices ride realtime.send, and 00324 took every table out of the publication.
-- Either deploy order works: until the dashboard listens for a table a notice is one Realtime drops, and a dashboard
-- that listens before the triggers exist hears nothing new. Re-runnable: each trigger is dropped first.

do $$
declare
  t text;
  e text;
begin
  foreach t in array array['imports', 'business_reads', 'rehearsals'] loop
    foreach e in array array['insert', 'update', 'delete'] loop
      execute format('drop trigger if exists %I on public.%I', 'workspace_tell_' || e, t);
      execute format(
        'create trigger %I after %s on public.%I referencing %s table as changed '
        'for each statement execute function public.workspace_tell_changes()',
        'workspace_tell_' || e, e, t, case e when 'delete' then 'old' else 'new' end);
    end loop;
  end loop;
end $$;
