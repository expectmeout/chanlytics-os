-- 00408 · The silent records join the live feed.
--
-- Decision 0047, step 1 (docs/decisions/0047-a-page-hears-the-record-it-draws.md; amends 0019). The database tells a
-- workspace which of its tables changed (00265), and the list was set by what the pages read first. Nine tables a page
-- draws a record from were never on it: the person (contacts), the business's facts (tenant_config), the rules
-- (policies), a template's status (templates), the mailbox's pause on offers (mailboxes), a held booking email
-- (appointment_notices), the team (memberships, invitations) and the workspace's status (tenants). So a teammate's
-- rename of a person, a save of the hours, Replies turned to Ask first, Meta's approval of a template, a pause on
-- offers, a teammate who joined or a workspace that was paused reached another open tab only at a return or a reload,
-- while the receptionist, which asks one stamp over the settings, the rules and the workspace row before every message
-- (runtime_stamp, 00059 and 00330), knew at once. The pages and the receptionist heard different lists.
--
-- What the notice carries. `at`, the clock when the trigger told it (clock_timestamp(), in UTC, to the millisecond:
-- 2026-10-11T18:30:00.123Z), beside the table, the event and a call's or a message update's statuses. It is the
-- transaction's own clock and never a row's. A tab that has already started a read of the surface after `at` keeps its
-- answer and does not read the same change twice (step 2 of the decision). `at` is taken when the statement finishes, a
-- moment before the commit that makes the notice visible, and the database's clock is not the browser's: the reader of
-- `at` allows for both.
--
-- Which statements tell, and why two shapes.
--
--   contacts             INSERT                                   a person made: an import, a message, a calendar, a lead
--                        UPDATE of the identity, the answers      the name, the number, the address, a yes or a stop
--                                                                 on any channel, the address that stopped working, the
--                                                                 merge and the erasure
--   tenant_config        UPDATE when the version moved            a save of the settings; the hourly stamp on
--                                                                 calendar_checked_at moves no version and tells nothing
--   policies             INSERT, UPDATE, DELETE                   the Autonomy matrix, and a person's or a list's own rule
--   templates            INSERT; UPDATE of the status, the        Meta's answer, a sync, a hide; a template made or removed
--                        rejection, the quality and the words
--                        DELETE
--   mailboxes            UPDATE of the pause on offers            paused by the gate, resumed by the back office
--   appointment_notices  INSERT, UPDATE                           a booking email the reader held, or settled
--   memberships          INSERT, DELETE; UPDATE of the role       a seat taken, left or changed. Not the member's saved
--                                                                 views or push choices: those are one member's own
--                                                                 and change with every sort they press
--   invitations          INSERT, UPDATE, DELETE                   sent, renewed, accepted, revoked
--   tenants              UPDATE of the status                     paused or resumed (billing, the back office)
--
-- A statement trigger with a transition table is 00265's shape, and the right one wherever every change of a table is
-- one a page draws: an insert, a delete, an update of a table whose writes all matter. It cannot be narrowed to the
-- columns a page draws. Postgres refuses a transition table on a trigger with a column list, and a statement trigger's
-- WHEN cannot see a row. So the updates that must ignore stamps are row triggers: AFTER UPDATE OF the columns, WHEN
-- one of them is distinct (00402 made tenant_config's version trigger the same way). A write that names none of the
-- columns, the stamp every inbound message puts on a person's last_seen_at, is never considered; one that names them
-- and writes what was already there queues nothing. Both shapes tell through the same memory of the transaction
-- (chanlytics.workspace_told), so a loop of statements, or of rows, tells each workspace's table and event once.
--
--   workspace_tell_changes     replaced: the statement function of 00265, now with `at`. Everything else as it was.
--   workspace_tell_row_change  new: the row function of the narrowed updates. It names the workspace by the row's
--                              tenant_id, and by its id on tenants. Only for UPDATE: the narrowed events are updates.
--
-- packages/db realtime.ts lists the nine tables (WATCHED), and database/each-workspace-is-told-what-changed.db.test.mjs
-- holds the triggers equal to it, and the list to every table runtime_stamp reads.
--
-- What it costs. A notice is a row of Realtime's own partition and a broadcast to the workspace's open tabs, once for
-- each workspace, table and event a transaction changes. The narrowed updates are a few a day for a workspace (a
-- rename, an answer, a save, a status), and the people made by one import or one lead round are one statement, one
-- notice. Creating a workspace tells its policies once, to a topic nobody has joined yet.
--
-- Either deploy order works: a notice nobody hears is dropped with its day's partition, and a dashboard that listens
-- before this applies hears nothing new. The notice's new field is one an older dashboard does not read.
--
-- The lock. A trigger made on a table takes SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit, and
-- contacts is written by every message: the 3 s guard of 00259 and 00313. If it times out nothing was applied and the
-- owner runs it again when the line is quiet. `create or replace trigger` rather than a drop first, so the moment
-- between the two is never one a writer waits through. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------- 1. the statement function, with its clock -- */

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
  -- When this statement told (UTC, to the millisecond), the clock a tab compares with the read it started (0047).
  noted_at text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
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
      jsonb_strip_nulls(jsonb_build_object('table', tg_table_name, 'op', tg_op, 'statuses', w.statuses, 'at', noted_at)),
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
  'Decision 0019: a notice on the private topic workspace:<tenant_id>:changes for each workspace a statement on a watched table changed, naming the table, the operation, where a trigger names a column its values, and the clock when it was told (at, 0047); once per transaction for each. Never a row.';

revoke execute on function public.workspace_tell_changes() from public, anon, authenticated;

/* ----------------------------------------------- 2. the row function, for the narrowed updates -- */

create or replace function public.workspace_tell_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The memory workspace_tell_changes keeps, in the same words: a row trigger and a statement trigger of one
  -- transaction tell a workspace's table and event once between them.
  told text := coalesce(current_setting('chanlytics.workspace_told', true), '');
  tenant uuid;
  said text;
begin
  -- The workspace is the row's tenant_id; a workspace's own row (tenants) is its id.
  if tg_table_name = 'tenants' then
    tenant := new.id;
  else
    tenant := new.tenant_id;
  end if;
  said := '|' || tenant::text || ' ' || tg_table_name || ' ' || tg_op || '|';
  if strpos(told, said) > 0 then
    return null;
  end if;
  perform set_config('chanlytics.workspace_told', told || said, true);
  perform realtime.send(
    jsonb_build_object(
      'table', tg_table_name,
      'op', tg_op,
      'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    tg_op,
    'workspace:' || tenant::text || ':changes',
    true);
  return null;
end $$;

comment on function public.workspace_tell_row_change() is
  'Decision 0047: the notice of workspace_tell_changes, for an UPDATE a row trigger has narrowed to the columns a page draws (AFTER UPDATE OF them, WHEN one is distinct): the table, the operation and the clock when it was told, once per transaction for each workspace, table and event. Never a row.';

revoke execute on function public.workspace_tell_row_change() from public, anon, authenticated;

/* ------------------------------------------------------------------------- 3. the triggers -- */

do $$
declare
  w record;
  e text;
begin
  -- Statement triggers: every change of these is one a page draws. Named and made as 00265's are, the event on the
  -- table's own transition table; packages/db realtime.ts (WATCHED) lists the same events.
  for w in
    select *
      from (values
        ('contacts', array['insert']),
        ('policies', array['insert', 'update', 'delete']),
        ('templates', array['insert', 'delete']),
        ('appointment_notices', array['insert', 'update']),
        ('memberships', array['insert', 'delete']),
        ('invitations', array['insert', 'update', 'delete'])
      ) as watched (tbl, events)
  loop
    foreach e in array w.events loop
      execute format(
        'create or replace trigger %I after %s on public.%I referencing %s table as changed '
        'for each statement execute function public.workspace_tell_changes()',
        'workspace_tell_' || e, e, w.tbl, case e when 'delete' then 'old' else 'new' end);
    end loop;
  end loop;

  -- Row triggers: an update told only when one of the columns a page draws holds something else than it did.
  for w in
    select *
      from (values
        -- The identity, the answers and the merge and erasure of a person. Not last_seen_at, offers_asked_at or the
        -- first-touch stamps, which a message writes, and not updated_at, which every write moves.
        ('contacts', array[
          'display_name', 'wa_profile_name', 'phone_e164', 'email', 'notes', 'proposal_url',
          'consent', 'consent_source', 'consent_updated_at', 'dnc',
          'marketing_consent', 'marketing_consent_source', 'marketing_consent_updated_at',
          'email_marketing', 'email_marketing_source', 'email_marketing_updated_at',
          'consent_channels', 'marketing_channels',
          'email_suppressed_at', 'email_suppressed_reason',
          'merged_into_contact_id', 'erased_at']),
        -- What a template is to the owner: Meta's answer and why, its quality and category, whether the workspace
        -- hid it, and the words. Not synced_at, which every sync stamps on all of them.
        ('templates', array[
          'meta_status', 'rejected_reason', 'quality', 'category', 'hidden_at', 'title', 'body_preview',
          'components', 'variables']),
        -- The pause on offers by email, and its end.
        ('mailboxes', array['offers_paused_at', 'offers_paused_reason', 'offers_resumed_at']),
        -- A seat's role. Not the member's saved views or push choices, which are their own.
        ('memberships', array['role']),
        -- The workspace's status. The row is the workspace's own, so the notice goes to its id.
        ('tenants', array['status'])
      ) as narrowed (tbl, cols)
  loop
    execute format(
      'create or replace trigger workspace_tell_update after update of %s on public.%I '
      'for each row when (%s) execute function public.workspace_tell_row_change()',
      (select string_agg(format('%I', c), ', ') from unnest(w.cols) as c),
      w.tbl,
      (select string_agg(format('old.%1$I is distinct from new.%1$I', c), ' or ') from unnest(w.cols) as c));
  end loop;
end $$;

-- The settings: told when the version moved, not when the row was written. A write of the config takes the next version
-- in the BEFORE trigger of 00402 whatever it named in its SET, which an UPDATE OF list on this trigger would not see,
-- so there is no list: the WHEN alone is the rule, as 00402's tenant_config_version_kept has it. The hourly stamp of
-- calendar_checked_at (sweep-rotation.ts) moves no version, and its row queues no event.
create or replace trigger workspace_tell_update after update on public.tenant_config
  for each row when (old.version is distinct from new.version)
  execute function public.workspace_tell_row_change();
