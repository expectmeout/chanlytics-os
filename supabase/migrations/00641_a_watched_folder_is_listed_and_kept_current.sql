-- A watched folder is listed and kept current (the footage sources plan's P2, 18 November 2026).
--
-- A business connects the place its photos and videos already live and chooses a folder (00639 made the three tables).
-- This is what keeps the list of that folder true: a first walk of the whole tree, then its provider's changes read from
-- a saved place, its provider's signal heard, a floor read for a quiet folder, and a re-walk that finds what the changes
-- missed. Nothing here moves a file's bytes: an item is listed and its state said, and taking it into the Library is the
-- next phase's.
--
--   job_kinds            source_walk: one step of a walk (a first listing, a re-walk, or a new folder's contents), held
--                        once per folder, run and step. source_read: one read of a folder's changes, held once per folder
--                        while one waits or runs. Both in the bulk lane, so a customer's reply still goes first.
--   media_sources        gains where its reads and walks stand: when it was last read and last signalled, when something
--                        inside it last changed, how many reads in a row found changes elsewhere in the account and none
--                        inside, when it is next walked, the walk in flight (its run, its kind, when it began and when it
--                        last wrote), the hold on a wave of removals, and its channel's resource id (what its provider
--                        asks for to stop the channel).
--   source_items         gains the walk's marks: the run that did not find it, the last run that saw it where its
--                        folder is too large to list in one step, and for a folder the last run that listed it whole
--                        and the page it stands at. And until when a video listed without its length is asked
--                        after again (a fresh upload is measured a few minutes after it is listed).
--   source_credentials_* a connected account's token in Vault, as a mailbox's is (00423): put (only over the grant it
--                        refreshed), get, drop.
--   sources_hand_out     the clock's one statement: a read for each folder whose time has come, a re-walk for each due
--                        one, and a walk whose steps stopped, or that never began, taken up.
--   sources_sweep_ask    the clock: asks the edge (/api/cron/sources) every five minutes while a folder is watched.
--
-- Every number of the read pace (decision D18 of the plan) is written onto a row by the edge from its one setting; none
-- is written here. Members read the tables as before; only the service role writes.
--
-- Additive. Deploy order: this migration first (the edge hands out kinds the ledger refuses without their rows; the old
-- edge names none of it). Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------ 1. the two job kinds -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('source_walk', 2, array['@tenant', 'source_id', 'run', 'step'], false),
  ('source_read', 2, array['@tenant', 'source_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------- 2. where a folder's reads and walks stand -- */

alter table public.media_sources
  add column if not exists channel_resource_id text,
  add column if not exists last_read_at        timestamptz,
  add column if not exists signalled_at        timestamptz,
  add column if not exists last_change_at      timestamptz,
  add column if not exists busy_reads          integer not null default 0,
  add column if not exists next_walk_at        timestamptz,
  add column if not exists walk_run            integer not null default 0,
  add column if not exists walk_kind           text,
  add column if not exists walk_started_at     timestamptz,
  add column if not exists walk_touched_at     timestamptz,
  add column if not exists hold_at             timestamptz,
  add column if not exists hold_count          integer,
  add column if not exists hold_confirmed_at   timestamptz,
  add column if not exists walk_units          integer not null default 0;

alter table public.media_sources drop constraint if exists media_sources_channel_resource_id_check;
alter table public.media_sources add constraint media_sources_channel_resource_id_check
  check (char_length(channel_resource_id) between 1 and 200);
alter table public.media_sources drop constraint if exists media_sources_busy_reads_check;
alter table public.media_sources add constraint media_sources_busy_reads_check check (busy_reads >= 0);
alter table public.media_sources drop constraint if exists media_sources_walk_run_check;
alter table public.media_sources add constraint media_sources_walk_run_check check (walk_run >= 0);
alter table public.media_sources drop constraint if exists media_sources_walk_units_check;
alter table public.media_sources add constraint media_sources_walk_units_check check (walk_units >= 0);
alter table public.media_sources drop constraint if exists media_sources_walk_kind_check;
alter table public.media_sources add constraint media_sources_walk_kind_check
  check (walk_kind in ('snapshot', 'reconcile', 'subtree'));
alter table public.media_sources drop constraint if exists media_sources_hold_count_check;
alter table public.media_sources add constraint media_sources_hold_count_check check (hold_count > 0);
-- A walk in flight says its kind, when it began and when it last wrote, or none of the three.
alter table public.media_sources drop constraint if exists media_sources_walk_is_whole;
alter table public.media_sources add constraint media_sources_walk_is_whole
  check ((walk_kind is null) = (walk_started_at is null) and (walk_kind is null) = (walk_touched_at is null));
-- A hold says when it began and how many items it holds, or neither.
alter table public.media_sources drop constraint if exists media_sources_hold_is_whole;
alter table public.media_sources add constraint media_sources_hold_is_whole
  check ((hold_at is null) = (hold_count is null));

comment on column public.media_sources.channel_resource_id is
  'The provider''s own id for what the push channel watches: asked for, with the channel''s id, to stop it.';
comment on column public.media_sources.busy_reads is
  'How many reads in a row found changes elsewhere in the account and none inside the folder: past the pace''s count, the folder is read less often until something inside changes.';
comment on column public.media_sources.walk_run is
  'The number of its newest walk: what an item''s seen_run and missed_run, and a folder''s walked_run, are counted in.';
comment on column public.media_sources.walk_kind is
  'The walk in flight, or null when none is. snapshot: the first listing of the whole tree. reconcile: a re-walk that finds what the changes missed. subtree: the contents of a folder that appeared or moved in.';
comment on column public.media_sources.hold_at is
  'When a read or a re-walk found more items gone at once than the pace lets leave: none was marked, and they wait for the next re-walk to agree or for a person to confirm (hold_confirmed_at).';
comment on column public.media_sources.walk_units is
  'The units its last whole walk spent at its provider, or has spent so far while one is in flight: the gap to its next routine re-walk is set from it, so a large tree is walked less often.';

alter table public.source_items
  add column if not exists seen_run   integer,
  add column if not exists missed_run integer,
  add column if not exists walked_run integer,
  add column if not exists walk_page  text,
  add column if not exists length_until timestamptz;

alter table public.source_items drop constraint if exists source_items_walk_page_check;
alter table public.source_items add constraint source_items_walk_page_check
  check (walk_page is null or char_length(walk_page) <= 4000);

comment on column public.source_items.seen_run is
  'The last walk run (media_sources.walk_run) that found it, written only where its folder takes more than one step to list: a folder listed in one step is compared in memory, so a re-walk writes nothing on an item that did not change.';
comment on column public.source_items.missed_run is
  'The walk run that did not find it where it was: asked of its provider when the run ends, and only then said gone, outside or no longer readable.';
comment on column public.source_items.walked_run is
  'A folder''s own: the last walk run that listed its contents whole. Null: never listed.';
comment on column public.source_items.walk_page is
  'A folder''s own: the provider''s token for the next page of its contents while a walk is part way through it.';
comment on column public.source_items.length_until is
  'A video its provider has listed without its length (a fresh upload is measured a few minutes later): its own record is asked again until then, and it is not taken into the Library before. Null: its length is known, it is no video, or its provider made it more than the wait ago.';

-- The push door finds a folder by its channel, and a channel is one folder's.
create unique index if not exists media_sources_channel
  on public.media_sources (channel_id) where channel_id is not null;
-- The clock's three reads: folders whose read is due, folders whose re-walk is due, walks in flight.
create index if not exists media_sources_read_due
  on public.media_sources (next_read_at) where state in ('watching', 'frozen');
create index if not exists media_sources_walk_due
  on public.media_sources (next_walk_at) where state = 'watching' and walk_kind is null;
create index if not exists media_sources_walking
  on public.media_sources (walk_touched_at) where walk_kind is not null;
-- A walk's next folder: the tree's folders, a source at a time.
create index if not exists source_items_folders on public.source_items (source_id) where kind = 'folder';
-- A read's second look: the videos of a folder whose length is still awaited.
create index if not exists source_items_length_awaited
  on public.source_items (source_id, length_until) where length_until is not null;

/* --------------------------------------------------------------------------------------------- 3. the account's token -- */

create or replace function public.source_credentials_put(
  p_connection_id    uuid,
  p_secret           jsonb,
  p_if_refresh_token text default null
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'source-creds-' || p_connection_id::text;
  v_id   uuid;
  v_now  text;
begin
  -- The row, held for the write: every write of this account's token takes it first, so a refresh's compare and its
  -- write are one step against a reconnect's.
  perform 1 from public.source_connections where id = p_connection_id for update;
  if not found then
    raise exception 'source_credentials_put: no such connection';
  end if;
  if p_if_refresh_token is not null then
    select (decrypted_secret::jsonb)->>'refresh_token' into v_now from vault.decrypted_secrets where name = v_name;
    if v_now is distinct from p_if_refresh_token then
      raise exception 'source_credentials_put: the token changed since it was read' using errcode = '40001';
    end if;
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'A footage account''s token: ' || p_connection_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  update public.source_connections set credentials_ref = v_name where id = p_connection_id;
  return v_name;
end $$;
revoke all on function public.source_credentials_put(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.source_credentials_put(uuid, jsonb, text) to service_role;
comment on function public.source_credentials_put(uuid, jsonb, text) is
  'Service-role only: stores a footage account''s token in Vault under source-creds-<id> and points credentials_ref at it (00641). The only write path for the token. With p_if_refresh_token, only while the token stored still carries that refresh token, under a lock on the row every write takes; otherwise it raises 40001 and writes nothing (as 00423''s for a mailbox).';

create or replace function public.source_credentials_get(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select credentials_ref into v_ref from public.source_connections where id = p_connection_id;
  if v_ref is null then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_ref;
  if v_secret is null then
    return null;
  end if;
  return v_secret::jsonb;
end $$;
revoke all on function public.source_credentials_get(uuid) from public, anon, authenticated;
grant execute on function public.source_credentials_get(uuid) to service_role;
comment on function public.source_credentials_get(uuid) is
  'Service-role only: a footage account''s token from Vault, or null (00641).';

create or replace function public.source_credentials_drop(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'source-creds-' || p_connection_id::text;
  v_id   uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    return false;
  end if;
  delete from vault.secrets where id = v_id;
  update public.source_connections set credentials_ref = null where id = p_connection_id;
  return true;
end $$;
revoke all on function public.source_credentials_drop(uuid) from public, anon, authenticated;
grant execute on function public.source_credentials_drop(uuid) to service_role;
comment on function public.source_credentials_drop(uuid) is
  'Service-role only: deletes a footage account''s token from Vault (00641). Called when the account is disconnected, after the rule that gives a grant back to its provider was asked.';

/* ------------------------------------------------------------------------------------------------- 4. the clock -- */

create or replace function public.sources_hand_out(p_spread_seconds integer, p_walk_stale_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reads integer;
  v_walks integer;
  v_again integer;
  v_begun integer;
begin
  -- A read for each folder whose time has come: one watched, or one frozen and asked after. The kind's own key holds
  -- one a folder while one waits or runs, so a clock that knocks twice costs nothing. A read asked for soon after
  -- the folder's last (its provider's signal, a fresh upload's length: due within one gap of that read) is handed at
  -- once; a floor read is spread, so ten thousand folders due the same hour do not start together. A kind an
  -- operator paused is handed nothing: what is due stays due on its row.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select s.tenant_id, 'source_read',
         case when s.last_read_at is not null
                   and s.next_read_at <= s.last_read_at
                       + make_interval(secs => greatest(coalesce(s.read_gap_seconds, 300), 300))
              then now()
              else now() + make_interval(secs => abs(hashtext(s.id::text)::bigint) % greatest(p_spread_seconds, 1))
         end,
         jsonb_build_object('source_id', s.id::text)
    from public.media_sources s
   where s.state in ('watching', 'frozen') and s.next_read_at <= now()
     and not exists (select 1 from public.job_kinds k where k.kind = 'source_read' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_reads = row_count;
  -- A re-walk for each watched folder whose own is due and that has none in flight: its first step, of the run after
  -- its newest.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select s.tenant_id, 'source_walk',
         now() + make_interval(secs => abs(hashtext(s.id::text)::bigint) % greatest(p_spread_seconds, 1)),
         jsonb_build_object('source_id', s.id::text, 'run', (s.walk_run + 1)::text, 'step', '0', 'walk', 'reconcile')
    from public.media_sources s
   where s.state = 'watching' and s.walk_kind is null and s.next_walk_at <= now()
     and not exists (select 1 from public.job_kinds k where k.kind = 'source_walk' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_walks = row_count;
  -- A walk whose steps stopped (a step failed for good, a write lost) is taken up where its rows say it stands: one
  -- step an hour at most, named for the hour.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select s.tenant_id, 'source_walk', now(),
         jsonb_build_object('source_id', s.id::text, 'run', s.walk_run::text,
                            'step', 'again-' || (extract(epoch from date_trunc('hour', now()))::bigint)::text,
                            'walk', s.walk_kind)
    from public.media_sources s
   where s.walk_kind is not null and s.state in ('setting_up', 'watching')
     and s.walk_touched_at < now() - make_interval(secs => greatest(p_walk_stale_seconds, 1))
     and not exists (select 1 from public.job_kinds k where k.kind = 'source_walk' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_again = row_count;
  -- A folder chosen whose first walk never began (its first step's write was lost, or its account was connected
  -- again before it had walked) is handed that step: its first listing, or a whole walk where it had walked before.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select s.tenant_id, 'source_walk', now(),
         jsonb_build_object('source_id', s.id::text, 'run', (s.walk_run + 1)::text, 'step', '0',
                            'walk', case when s.walk_run = 0 then 'snapshot' else 'reconcile' end)
    from public.media_sources s
   where s.state = 'setting_up' and s.walk_kind is null
     and s.updated_at < now() - make_interval(secs => greatest(p_walk_stale_seconds, 1))
     and not exists (select 1 from public.job_kinds k where k.kind = 'source_walk' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_begun = row_count;
  return jsonb_build_object('reads', v_reads, 'walks', v_walks, 'again', v_again + v_begun);
end $$;
revoke all on function public.sources_hand_out(integer, integer) from public, anon, authenticated;
grant execute on function public.sources_hand_out(integer, integer) to service_role;
comment on function public.sources_hand_out(integer, integer) is
  'The footage clock''s one statement (00641, decision 0115): a source_read for each watched or frozen folder whose next read is due, a source_walk for each watched folder whose re-walk is due and that has none in flight, and a walk whose steps stopped, or that never began, taken up. A re-walk and a floor read are due within the spread by a hash of their folder, a read asked for soon after the folder''s last (a signal, a fresh upload''s length) at once; none is written while one waits or runs, and none for a kind an operator paused. Answers {reads, walks, again}. The service role''s.';

create or replace function public.sources_sweep_ask()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.media_sources s where s.state in ('setting_up', 'watching', 'frozen')) then
    return public.request_sweep('sources', '/api/cron/sources');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('sources', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.sources_sweep_ask() from public, anon, authenticated;
comment on function public.sources_sweep_ask() is
  'The footage clock (00641): calls the edge (/api/cron/sources), which hands each watched folder its read or its re-walk when one is due, only while a folder is watched; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('sources', 'sources-sweep', interval '20 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('sources-sweep') where exists (select 1 from cron.job where jobname = 'sources-sweep');
select cron.schedule('sources-sweep', '3-59/5 * * * *', $$select public.sources_sweep_ask()$$);
