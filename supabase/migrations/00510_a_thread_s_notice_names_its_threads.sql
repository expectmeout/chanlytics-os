-- 00510 · A thread's notice names its threads.
--
-- Decision 0019 as the page-open PRD of 3 November 2026 amends it (P3, lane L13). A notice names a table, never a row, so
-- one inbound message made every open tab of the workspace read the Inbox's hundred newest threads with up to forty
-- messages each, and each send's receipts did the same. A notice of the four tables a thread is made of (messages,
-- conversations, escalations, calls) now names the threads its transaction touched (`threads`, their conversations'
-- ids), at most 50; past that it names none, and a tab reads the list as before. An id is not a row: the topic is already
-- the workspace's members' alone (00265), and every one of them may read every thread. The Inbox reads those threads by
-- id and puts them in its list (inbox/surface.ts), where a message's notice alone moved them.
--
-- The threads gather across the transaction: a second statement that tells the same table and event adds its threads to
-- the notice kept for the commit (00507), rather than being dropped as told already.
--
-- Either deploy order works: a dashboard that does not read `threads` reads the list, as before. Re-runnable.

create or replace function public.workspace_tell_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What this transaction has told already. Its notices all go at its commit, together, so a second notice of a
  -- workspace's table and event (and a call's same statuses) would tell a tab nothing more: a loop of statements, as the
  -- lead finder's commits are, tells each workspace once, not once a row. A thread's notice gathers the threads instead
  -- (00510). A savepoint rolled back takes its notices and this memory of them back with it.
  told text := coalesce(current_setting('chanlytics.workspace_told', true), '');
  had text := told;
  w record;
  said text;
  v_topic text;
  threads jsonb;
begin
  -- A trigger's argument names the column its table's changes are judged by (calls: status), carried as the distinct
  -- values the statement left; every other table's notice is its name and the operation alone.
  for w in
    select c.tenant_id, null::jsonb as statuses from changed c where tg_nargs = 0 group by c.tenant_id
    union all
    select c.tenant_id, jsonb_agg(distinct to_jsonb(c) ->> tg_argv[0]) from changed c where tg_nargs > 0 group by c.tenant_id
  loop
    said := '|' || w.tenant_id::text || ' ' || tg_table_name || ' ' || tg_op || coalesce(' ' || w.statuses::text, '') || '|';
    v_topic := 'workspace:' || w.tenant_id::text || ':changes';
    -- The threads this statement touched in this workspace, where its table is one a thread is made of. Read through
    -- to_jsonb: the function serves every watched table, and a column one table lacks may not be named.
    threads := case
      when tg_table_name = 'conversations' then
        (select jsonb_agg(distinct to_jsonb(c) ->> 'id') from changed c where c.tenant_id = w.tenant_id)
      when tg_table_name in ('messages', 'escalations', 'calls') then
        (select jsonb_agg(distinct to_jsonb(c) ->> 'conversation_id') from changed c
          where c.tenant_id = w.tenant_id and to_jsonb(c) ->> 'conversation_id' is not null)
      else null
    end;
    if strpos(told, said) > 0 then
      -- Told already in this transaction: its threads join the notice kept for the commit, or the notice names none.
      if tg_table_name in ('messages', 'conversations', 'escalations', 'calls') then
        update public.workspace_notices_pending p
           set payload = case
             when threads is null or not (p.payload ? 'threads') then p.payload - 'threads'
             when (select count(*) from (select jsonb_array_elements_text(p.payload -> 'threads')
                                         union select jsonb_array_elements_text(threads)) u) > 50 then p.payload - 'threads'
             else jsonb_set(p.payload, '{threads}', (select jsonb_agg(distinct t) from (
                    select jsonb_array_elements_text(p.payload -> 'threads') as t
                    union select jsonb_array_elements_text(threads)) u))
           end
         where p.topic = v_topic
           and p.event = tg_op
           and p.payload ->> 'table' = tg_table_name
           and (p.payload -> 'statuses') is not distinct from w.statuses;
      end if;
      continue;
    end if;
    told := told || said;
    insert into public.workspace_notices_pending (topic, event, payload)
    values (
      v_topic,
      tg_op,
      jsonb_strip_nulls(jsonb_build_object(
        'table', tg_table_name,
        'op', tg_op,
        'statuses', w.statuses,
        'threads', case when jsonb_array_length(coalesce(threads, '[]')) between 1 and 50 then threads end)));
  end loop;
  if told <> had then
    perform set_config('chanlytics.workspace_told', told, true);
  end if;
  return null;
end $$;

comment on function public.workspace_tell_changes() is
  'Decision 0019: a notice on the private topic workspace:<tenant_id>:changes for each workspace a statement on a watched table changed, naming the table, the operation, where a trigger names a column its values, and for a thread''s four tables the threads touched (threads, at most 50, gathered across the transaction; 00510); once per transaction for each, kept in workspace_notices_pending and sent at the commit with the commit''s clock as `at` (00507). Never a row.';

revoke execute on function public.workspace_tell_changes() from public, anon, authenticated;
