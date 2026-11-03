-- 00507 · A notice is told at its commit.
--
-- Decision 0019, as the page-open PRD of 3 November 2026 amends it (P2, lane L3). The database tells each workspace which
-- of its tables changed (00265), once a transaction for each table and event, and since 00408 the notice carries `at`,
-- the clock a tab judges it by: a surface whose last read began after `at` holds the change and reads nothing for it
-- (your own change is read once, 0047). But `at` was the clock of the first statement that told, and the notice only
-- becomes visible at the commit. A read that began between the two did not hold the change, and the notice that arrived
-- after the commit was taken for one it held: dropped, and the page stood stale until its next notice or the 15-minute
-- heal. The transactions that run longest were the ones it bit: an erasure, a batch of five hundred, an import.
--
-- Now a statement keeps what it would tell in this transaction's own rows (workspace_notices_pending), and a deferred
-- constraint trigger on them sends each at the commit, with the clock read there. A rollback, and a savepoint rolled
-- back, take their rows and the deferred sends with them, as they took the memory of having told (chanlytics.
-- workspace_told), so what was never committed is never told. The rows never outlive their transaction: each is
-- deleted as it is sent, so no other session ever sees one.
--
-- Either deploy order works: the notice keeps its shape ({table, op, statuses, at}), and `at` only moves later.
-- Re-runnable: the table if absent, the functions replaced, the trigger dropped and made again.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------- 1. the transaction's own rows -- */

-- Unlogged: a row lives for the length of its transaction and is never read by another, so the WAL would only carry it to
-- delete it again. A crash empties the table, which is what it holds at rest anyway.
create unlogged table if not exists public.workspace_notices_pending (
  id bigint generated always as identity primary key,
  topic text not null,
  event text not null,
  payload jsonb not null
);

comment on table public.workspace_notices_pending is
  'The notices a transaction will tell its workspaces at its commit (00507, decision 0019): written by workspace_tell_changes and workspace_tell_row_change, sent and deleted by workspace_tell_at_commit, a deferred constraint trigger, so a notice''s clock is its commit''s. Empty at rest; no session but the writing one ever sees a row.';

alter table public.workspace_notices_pending enable row level security;
revoke all on public.workspace_notices_pending from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_notices_pending to service_role;
grant usage, select on sequence public.workspace_notices_pending_id_seq to service_role;

/* ---------------------------------------------------------------------- 2. the send, at the commit -- */

create or replace function public.workspace_tell_at_commit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept record;
begin
  -- The row as it stands now, not as it was inserted: a deferred trigger is handed the inserted row, and a later statement
  -- of the transaction may have added to what it tells (00510's threads).
  delete from public.workspace_notices_pending where id = new.id returning topic, event, payload into kept;
  if not found then
    return null;
  end if;
  -- The clock now, at the commit: a read that began before it may not hold the change; one that began after it does.
  perform realtime.send(
    kept.payload || jsonb_build_object('at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    kept.event,
    kept.topic,
    true);
  return null;
end $$;

comment on function public.workspace_tell_at_commit() is
  'Decision 0019 (00507): sends one notice a statement kept for its workspace, at the commit, with the commit''s clock as `at`, and deletes its row. A deferred constraint trigger on workspace_notices_pending.';

revoke execute on function public.workspace_tell_at_commit() from public, anon, authenticated;

drop trigger if exists workspace_notices_told_at_commit on public.workspace_notices_pending;
create constraint trigger workspace_notices_told_at_commit
  after insert on public.workspace_notices_pending
  deferrable initially deferred
  for each row
  execute function public.workspace_tell_at_commit();

/* ------------------------------------------------------- 3. the statement and the row keep, not send -- */

create or replace function public.workspace_tell_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- What this transaction has told already. Its notices all go at its commit, together, so a second notice of a
  -- workspace's table and event (and a call's same statuses) would tell a tab nothing more: a loop of statements, as the
  -- lead finder's commits are, tells each workspace once, not once a row. A savepoint rolled back takes its notices and
  -- this memory of them back with it.
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
    insert into public.workspace_notices_pending (topic, event, payload)
    values (
      'workspace:' || w.tenant_id::text || ':changes',
      tg_op,
      jsonb_strip_nulls(jsonb_build_object('table', tg_table_name, 'op', tg_op, 'statuses', w.statuses)));
  end loop;
  if told <> had then
    perform set_config('chanlytics.workspace_told', told, true);
  end if;
  return null;
end $$;

comment on function public.workspace_tell_changes() is
  'Decision 0019: a notice on the private topic workspace:<tenant_id>:changes for each workspace a statement on a watched table changed, naming the table, the operation and, where a trigger names a column, its values; once per transaction for each, kept in workspace_notices_pending and sent at the commit with the commit''s clock as `at` (00507). Never a row.';

revoke execute on function public.workspace_tell_changes() from public, anon, authenticated;

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
  insert into public.workspace_notices_pending (topic, event, payload)
  values (
    'workspace:' || tenant::text || ':changes',
    tg_op,
    jsonb_build_object('table', tg_table_name, 'op', tg_op));
  return null;
end $$;

comment on function public.workspace_tell_row_change() is
  'Decision 0047: the notice of workspace_tell_changes, for an UPDATE a row trigger has narrowed to the columns a page draws (AFTER UPDATE OF them, WHEN one is distinct): the table and the operation, once per transaction for each workspace, table and event, kept in workspace_notices_pending and sent at the commit with the commit''s clock as `at` (00507). Never a row.';

revoke execute on function public.workspace_tell_row_change() from public, anon, authenticated;
