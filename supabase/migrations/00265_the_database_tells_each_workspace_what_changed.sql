-- 00265 · The database tells each workspace what changed.
--
-- Decision 0019, step 1 (docs/decisions/0019-the-database-tells-each-workspace-what-changed.md). A tab hears a
-- change through Postgres Changes: each of 23 tables bound for every open tab, each change weighed against every
-- tab's binding to its table and read again as that member, on one thread, and a delete never placed in its
-- workspace. Now the database says what changed, once, to the workspace it changed in: a notice for each workspace a
-- statement on a watched table changed, through realtime.send, on the private topic workspace:<tenant_id>:changes,
-- and one per transaction for each workspace, table and event. A notice names the table and the operation, and a
-- call's statuses, which Today and Setup judge a call by. It never carries a row: a surface that wants the row reads
-- it, through its own policies.
--
--   workspace_tell_changes         the trigger function every watched table shares: a notice for each workspace
--                                  among the rows the statement changed, read from its transition table, unless the
--                                  transaction told it already (chanlytics.workspace_told). Definer rights, so a
--                                  member's own write is told too (no session may insert into realtime.messages).
--                                  realtime.send catches its own error, so a notice never fails its write, and a
--                                  write that rolls back tells nothing.
--   workspace_tell_<event>         the triggers, made by the loop below from the list packages/db realtime.ts
--                                  watches (WATCHED), which each-workspace-is-told-what-changed.db.test.mjs holds equal:
--                                  insert only for messages, notifications and google_reviews, every event for the
--                                  rest. A transition table takes one event per trigger, so each event has its own.
--   workspace_changes_member_read  a member may listen to their workspaces' topics, and read a notice only on the
--                                  topic asked for. It reads memberships as every table's read policy does, so a
--                                  partner's seat on a session without its second factor cannot listen (00218).
--                                  There is no insert policy: no session may speak on a workspace's topic.
--
-- Nothing listens until the dashboard joins the topic (step 2, the same pull request), so until then each notice is a
-- row Realtime drops with its day's partition. Realtime's own migrations make realtime.messages, realtime.send and
-- realtime.topic before ours run: in production, and in `supabase start`'s replay, which runs them while it
-- initialises the schema. Re-runnable: the function is replaced, and each trigger and the policy dropped first.

create or replace function public.workspace_tell_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What this transaction has told already. Its notices all become visible at its commit, together, so a second
  -- notice of a workspace's table and event (and a call's same statuses) would tell a tab nothing more: a loop of
  -- statements, as the lead finder's commits are, tells each workspace once, not once a row. A savepoint rolled back
  -- takes its notices and this memory of them back with it.
  told text := coalesce(current_setting('chanlytics.workspace_told', true), '');
  had text := told;
  w record;
  said text;
begin
  -- A trigger's argument names the column its table's changes are judged by (calls: status), carried as the distinct
  -- values the statement left; every other table's notice is its name and the operation alone.
  for w in
    select c.tenant_id, null::jsonb as statuses from changed c where tg_nargs = 0 group by c.tenant_id
    union all
    select c.tenant_id, jsonb_agg(distinct to_jsonb(c) ->> tg_argv[0]) from changed c where tg_nargs > 0 group by c.tenant_id
  loop
    said := '|' || w.tenant_id::text || ' ' || tg_table_name || ' ' || tg_op || coalesce(' ' || w.statuses::text, '') || '|';
    continue when strpos(told, said) > 0;
    told := told || said;
    perform realtime.send(
      jsonb_strip_nulls(jsonb_build_object('table', tg_table_name, 'op', tg_op, 'statuses', w.statuses)),
      tg_op,
      'workspace:' || w.tenant_id::text || ':changes',
      true);
  end loop;
  if told <> had then
    perform set_config('chanlytics.workspace_told', told, true);
  end if;
  return null;
end $$;

comment on function public.workspace_tell_changes() is
  'Decision 0019: a notice on the private topic workspace:<tenant_id>:changes for each workspace a statement on a watched table changed, naming the table, the operation and, where a trigger names a column, its values; once per transaction for each. Never a row.';

revoke execute on function public.workspace_tell_changes() from public, anon, authenticated;

-- The watched tables, as packages/db realtime.ts lists them (WATCHED): the events each is heard for, and the column a
-- surface judges its changes by. Each event's trigger is dropped first, so a table heard for fewer events loses the
-- others when this runs again.
do $$
declare
  w record;
  e text;
begin
  for w in
    select *
      from (values
        ('messages', array['insert'], null::text),
        ('conversations', array['insert', 'update', 'delete'], null),
        ('escalations', array['insert', 'update', 'delete'], null),
        ('calls', array['insert', 'update', 'delete'], 'status'),
        ('notifications', array['insert'], null),
        ('lines', array['insert', 'update', 'delete'], null),
        ('google_listings', array['insert', 'update', 'delete'], null),
        ('google_reviews', array['insert'], null),
        ('billing_accounts', array['insert', 'update', 'delete'], null),
        ('tenant_channels', array['insert', 'update', 'delete'], null),
        ('capability_activations', array['insert', 'update', 'delete'], null),
        ('business_records', array['insert', 'update', 'delete'], null),
        ('google_connections', array['insert', 'update', 'delete'], null),
        ('sending_domains', array['insert', 'update', 'delete'], null),
        ('leads', array['insert', 'update', 'delete'], null),
        ('lead_searches', array['insert', 'update', 'delete'], null),
        ('lead_rounds', array['insert', 'update', 'delete'], null),
        ('lead_search_members', array['insert', 'update', 'delete'], null),
        ('deals', array['insert', 'update', 'delete'], null),
        ('person_notes', array['insert', 'update', 'delete'], null),
        ('segments', array['insert', 'update', 'delete'], null),
        ('segment_members', array['insert', 'update', 'delete'], null),
        ('reach_out_replies', array['insert', 'update', 'delete'], null)
      ) as watched (tbl, events, judged_by)
  loop
    foreach e in array array['insert', 'update', 'delete'] loop
      execute format('drop trigger if exists %I on public.%I', 'workspace_tell_' || e, w.tbl);
      if e = any (w.events) then
        execute format(
          'create trigger %I after %s on public.%I referencing %s table as changed '
          'for each statement execute function public.workspace_tell_changes(%s)',
          'workspace_tell_' || e, e, w.tbl, case e when 'delete' then 'old' else 'new' end,
          coalesce(quote_literal(w.judged_by), ''));
      end if;
    end loop;
  end loop;
end $$;

-- Realtime asks this once per join, as the member, with the topic the tab asked for (realtime.topic()) and a notice
-- it wrote on that topic. A row on any other topic is never admitted, whatever topic the caller says it asked for.
drop policy if exists workspace_changes_member_read on realtime.messages;
create policy workspace_changes_member_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and (select realtime.topic()) in (
      select 'workspace:' || m.tenant_id::text || ':changes'
        from public.memberships m
       where m.user_id = (select auth.uid()))
  );
