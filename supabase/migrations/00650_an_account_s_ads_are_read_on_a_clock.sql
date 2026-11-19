-- 00650 · An account's ads are read on a clock (decision 0049, step P1; the Ads build plan's step 2, part 4: Reading).
--
-- 00648 made the ground and 00649 the doors Connect writes through. This is what keeps a connected account true: the
-- ads found in it adopted (0049, call 10), each with the budget it sits under, the platform's days for each kept, and a
-- clock that hands each account its own read when its row says one is due (the plan's 6.6: each account its own job,
-- spread, and left alone while the platform holds it back).
--
--   job_kinds        ad_read: one read of one ad account at its platform, held once an account while one waits or
--                    runs. In the bulk lane, so a customer's reply still goes first.
--   ad_accounts      gains when its next read is due and when its next fourteen-day look back is: both written by the
--                    read itself, from the edge's one setting of the pace. None is written here.
--   ads_read_keep    what one read learned, kept in one transaction: the account's own facts (ad_account_read_keep),
--                    each ad made or written over by its platform id, each day made or written over until it is
--                    settled, the days the look back has passed marked settled, and the next read's time. An event
--                    for an ad only where the platform's word for it moved.
--   ads_hand_out     the clock's one statement: an ad_read for each connected account whose time has come and that
--                    the platform is not holding back.
--   ads_read_ask     the platform said something changed in an account (its notice): that account's read, soon, and
--                    never sooner than two minutes after its last or than the platform allows.
--   ads_sweep_ask    the clock: asks the edge (/api/cron/ads) every five minutes while an account is connected.
--   purge_ad_days    nightly: a platform's day for an ad goes 760 days on, about 25 months (contracts RETENTION_DAYS.ad_days).
--   The live feed    a workspace is told when its ad account or an ad changes in what a page draws.
--
-- Locks. Two columns on ad_accounts, each nullable with no default: a catalog write under a lock the three-second wait
-- covers. Two indexes on tables with no rows before this step. Everything else is a function, a row or a trigger.
--
-- Deploy order: this file first. An edge ahead of it gets PGRST202 from a door and reads nothing; nothing before it
-- names these doors or the kind. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------------------- 1. the read's job kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('ad_read', 2, array['@tenant', 'account_id'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------------- 2. where an account's reads stand -- */

alter table public.ad_accounts
  add column if not exists next_read_at timestamptz,
  add column if not exists settle_at    timestamptz;

comment on column public.ad_accounts.next_read_at is
  'When the account is next read at its platform (00650): written by each read, an hour on, or fifteen minutes on while one of its ads is being checked or is in its first two days. Null until its first read, which is due at once.';
comment on column public.ad_accounts.settle_at is
  'When the account''s next fourteen-day look back is due (00650): once a day, at four in the morning in its own zone. The read that finds it due re-reads those days and marks the ones before them settled.';

-- The clock's question: which connected accounts are due.
create index if not exists ad_accounts_due on public.ad_accounts (next_read_at) where status = 'connected';
-- The nightly purge's question: which days are older than they are kept.
create index if not exists ad_days_day on public.ad_days (day);

/* ------------------------------------------------------------------------------------- 3. what one read learned -- */

create or replace function public.ads_read_keep(p_tenant_id uuid, p_account_id uuid, p_read jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.ad_accounts;
  v_outcome text;
  v_adopted integer := 0;
  v_moved   integer := 0;
  v_days    integer := 0;
begin
  select * into v_account from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id
   for update;
  if not found or v_account.status <> 'connected' then
    return jsonb_build_object('outcome', 'not_connected');
  end if;

  -- The account's own part first: its standing and facts, or that the read failed and when to ask again.
  v_outcome := public.ad_account_read_keep(p_tenant_id, p_account_id, coalesce(p_read -> 'account', '{}'::jsonb));

  if v_outcome <> 'failed' then
    -- Each ad the platform listed: made on first sight (adopted, 0049 call 10), written over after. What the owner
    -- asked of an ad found in their account follows what the platform holds, unless a press of theirs here is still
    -- on its way to the platform (an ask newer than the telling): that press wins until it is told.
    with given as (
      select g.* from jsonb_to_recordset(coalesce(p_read -> 'ads', '[]'::jsonb)) as g(
        platform_ad_id text, name text, door text, platform_set_id text, platform_campaign_id text,
        budget_kind text, budget_minor bigint, budget_left_minor bigint, budget_at text, budget_shared boolean,
        starts_at timestamptz, ends_at timestamptz, platform_state text, platform_issue text, intent text, said jsonb
      )
      where g.platform_ad_id is not null and g.platform_ad_id <> ''
    ), stood as (
      select a.id, a.platform_state from public.ads a
       where a.tenant_id = p_tenant_id and a.platform = v_account.platform
         and a.platform_ad_id in (select g.platform_ad_id from given g)
    ), written as (
      insert into public.ads as a (
        tenant_id, account_id, platform, origin, name, door, platform_ad_id, platform_set_id, platform_campaign_id,
        budget_kind, budget_minor, budget_left_minor, budget_at, budget_shared, starts_at, ends_at,
        status, intent, platform_state, platform_issue, said, read_at
      )
      select p_tenant_id, p_account_id, v_account.platform, 'platform',
             coalesce(nullif(left(btrim(coalesce(g.name, '')), 500), ''), g.platform_ad_id),
             coalesce(g.door, 'other'), g.platform_ad_id, g.platform_set_id, g.platform_campaign_id,
             g.budget_kind, g.budget_minor, g.budget_left_minor, g.budget_at, g.budget_shared, g.starts_at, g.ends_at,
             'made', coalesce(g.intent, 'paused'), g.platform_state, nullif(left(coalesce(g.platform_issue, ''), 2000), ''),
             g.said, now()
        from given g
      on conflict (tenant_id, platform, platform_ad_id) do update
         set name = case when a.origin = 'platform' then excluded.name else a.name end,
             door = case when a.origin = 'platform' then excluded.door else a.door end,
             platform_set_id = excluded.platform_set_id,
             platform_campaign_id = excluded.platform_campaign_id,
             budget_kind = excluded.budget_kind,
             budget_minor = excluded.budget_minor,
             budget_left_minor = excluded.budget_left_minor,
             budget_at = excluded.budget_at,
             budget_shared = excluded.budget_shared,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             intent = case when a.origin = 'platform' and (a.intent_at is null or a.told_at >= a.intent_at)
                           then excluded.intent else a.intent end,
             platform_state = excluded.platform_state,
             platform_issue = excluded.platform_issue,
             said = case when a.origin = 'platform' then excluded.said else a.said end,
             read_at = now()
      returning a.id, a.name, a.platform_state, (xmax = 0) as made
    ), told as (
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      select p_tenant_id, 'ad.state_changed', 'ads', 'ad', w.id,
             jsonb_build_object('platform', v_account.platform, 'name', w.name, 'from', s.platform_state,
                                'to', w.platform_state)
        from written w join stood s on s.id = w.id
       where s.platform_state is distinct from w.platform_state
      returning 1
    )
    select (select count(*) from written w where w.made), (select count(*) from told)
      into v_adopted, v_moved;

    -- Each day the platform gave, for an ad this workspace holds: made, or written over until it is settled. A day
    -- of an ad the read did not adopt is left out, never guessed a home.
    with given as (
      select d.* from jsonb_to_recordset(coalesce(p_read -> 'days', '[]'::jsonb)) as d(
        platform_ad_id text, day date, spend_minor bigint, impressions bigint, clicks bigint, platform_results bigint
      )
      where d.platform_ad_id is not null and d.day is not null
    ), written as (
      insert into public.ad_days as x (tenant_id, ad_id, day, spend_minor, impressions, clicks, platform_results, read_at)
      select p_tenant_id, a.id, g.day, greatest(coalesce(g.spend_minor, 0), 0), greatest(coalesce(g.impressions, 0), 0),
             greatest(coalesce(g.clicks, 0), 0), g.platform_results, now()
        from given g
        join public.ads a
          on a.tenant_id = p_tenant_id and a.platform = v_account.platform and a.platform_ad_id = g.platform_ad_id
      on conflict (ad_id, day) do update
         set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks,
             platform_results = excluded.platform_results, read_at = now()
       where not x.settled
      returning 1
    )
    select count(*) into v_days from written;

    -- The look back has passed these days: the platform's numbers for them have stopped moving.
    if nullif(p_read ->> 'settled_before', '') is not null then
      update public.ad_days x
         set settled = true
        from public.ads a
       where a.id = x.ad_id and a.tenant_id = p_tenant_id and a.account_id = p_account_id
         and x.tenant_id = p_tenant_id and x.day < (p_read ->> 'settled_before')::date and not x.settled;
    end if;
  end if;

  -- When it is read next, and looked back over next: the edge's pace, never before the platform allows. Whether the
  -- platform's notices are subscribed is kept as the read found it.
  update public.ad_accounts a
     set next_read_at = greatest(
           coalesce(nullif(p_read ->> 'next_read_at', '')::timestamptz, now() + interval '1 hour'),
           coalesce(a.read_after, '-infinity'::timestamptz)),
         settle_at = coalesce(nullif(p_read ->> 'settle_at', '')::timestamptz, a.settle_at),
         notices_at = case p_read ->> 'notices' when 'subscribed' then now() when 'dropped' then null else a.notices_at end
   where a.id = p_account_id;

  return jsonb_build_object('outcome', v_outcome, 'adopted', v_adopted, 'moved', v_moved, 'days', v_days);
end $$;

revoke all on function public.ads_read_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ads_read_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ads_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what one read of a connected ad account learned, kept in one transaction (00650, decision 0049). account: handed to ad_account_read_keep (its standing and facts, or that the read failed). ads: each made on first sight as an adopted ad (origin platform) or written over by its platform id, with the budget it sits under; what the owner asked of an adopted ad follows the platform unless a press of theirs is still on its way; an ad.state_changed event only where the platform''s word moved. days: each made or written over until settled, for ads this workspace holds. settled_before: the account''s days before it are marked settled. next_read_at, settle_at and notices are kept on the account. Answers {outcome, adopted, moved, days}; outcome not_connected, and nothing written, for an account that is not connected.';

/* --------------------------------------------------------------------------------------------------- 4. the clock -- */

create or replace function public.ads_hand_out(p_spread_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reads integer;
begin
  -- A read for each connected account whose time has come and that its platform is not holding back. The kind's own key
  -- holds one an account while one waits or runs, so a clock that knocks twice costs nothing. An account never read, or
  -- on the quick pace (its next read set within twenty minutes of its last), is handed at once; an hourly read is
  -- spread by a hash of the account, so ten thousand accounts due the same hour do not start together. A kind an
  -- operator paused is handed nothing: what is due stays due on its row.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select a.tenant_id, 'ad_read',
         case when a.read_at is null or a.next_read_at is null
                   or a.next_read_at <= a.read_at + interval '20 minutes'
              then now()
              else now() + make_interval(secs => abs(hashtext(a.id::text)::bigint) % greatest(p_spread_seconds, 1))
         end,
         jsonb_build_object('account_id', a.id::text)
    from public.ad_accounts a
   where a.status = 'connected' and a.external_id is not null
     and coalesce(a.next_read_at, '-infinity'::timestamptz) <= now()
     and (a.read_after is null or a.read_after <= now())
     and not exists (select 1 from public.job_kinds k where k.kind = 'ad_read' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_reads = row_count;
  return jsonb_build_object('reads', v_reads);
end $$;
revoke all on function public.ads_hand_out(integer) from public, anon, authenticated;
grant execute on function public.ads_hand_out(integer) to service_role;
comment on function public.ads_hand_out(integer) is
  'The ads clock''s one statement (00650, decision 0049): an ad_read for each connected ad account whose next read is due and that its platform is not holding back (read_after). An hourly read is due within the spread by a hash of its account, a first read and one on the quick pace at once; none is written while one waits or runs, and none while an operator has paused the kind. Answers {reads}. The service role''s.';

create or replace function public.ads_read_ask(p_platform text, p_external_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asked integer;
begin
  -- The platform said something changed in this account. Its read, soon: never sooner than two minutes after its last
  -- (a burst of notices is one read), nor than the platform allows. One waiting or running already is the read.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select a.tenant_id, 'ad_read',
         greatest(now(), coalesce(a.read_at, '-infinity'::timestamptz) + interval '2 minutes',
                  coalesce(a.read_after, '-infinity'::timestamptz)),
         jsonb_build_object('account_id', a.id::text)
    from public.ad_accounts a
   where a.platform = p_platform and a.external_id = p_external_id and a.status = 'connected'
     and not exists (select 1 from public.job_kinds k where k.kind = 'ad_read' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_asked = row_count;
  return v_asked;
end $$;
revoke all on function public.ads_read_ask(text, text) from public, anon, authenticated;
grant execute on function public.ads_read_ask(text, text) to service_role;
comment on function public.ads_read_ask(text, text) is
  'Service-role only: a platform''s notice that something changed in an ad account, or a connect just finished (00650). Puts that account''s ad_read on the ledger, due no sooner than two minutes after its last read nor than the platform allows; nothing where one waits or runs already, where the account is not connected, or while the kind is paused. Answers how many it asked for (0 or 1).';

create or replace function public.ads_sweep_ask()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.ad_accounts a where a.status = 'connected') then
    return public.request_sweep('ads', '/api/cron/ads');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('ads', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.ads_sweep_ask() from public, anon, authenticated;
comment on function public.ads_sweep_ask() is
  'The ads clock (00650): calls the edge (/api/cron/ads), which hands each connected ad account its read when one is due, only while an account is connected; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('ads', 'ads-sweep', interval '20 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('ads-sweep') where exists (select 1 from cron.job where jobname = 'ads-sweep');
select cron.schedule('ads-sweep', '1-59/5 * * * *', $$select public.ads_sweep_ask()$$);

/* ------------------------------------------------------------------------------- 5. a day goes, 25 months on --- */

create or replace function public.purge_ad_days(p_keep interval default interval '760 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    with gone as (
      delete from public.ad_days x
       where (x.ad_id, x.day) in (
               select d.ad_id, d.day from public.ad_days d where d.day < (now() - p_keep)::date limit 1000)
      returning 1
    )
    select count(*) into v_n from gone;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;

revoke all on function public.purge_ad_days(interval) from public, anon, authenticated;
grant execute on function public.purge_ad_days(interval) to service_role;
comment on function public.purge_ad_days(interval) is
  'Nightly. Deletes a platform''s day for an ad 760 days on, about 25 months (contracts RETENTION_DAYS.ad_days; decision 0049, call 11), a thousand at a time. The ad and the people it brought stay. Answers how many.';

select cron.unschedule('purge-ad-days') where exists (select 1 from cron.job where jobname = 'purge-ad-days');
select cron.schedule('purge-ad-days', '52 4 * * *', $$select public.purge_ad_days()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_ad_days', 'purge-ad-days', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

/* ------------------------------------------------------------------------------------------- 6. the live feed -- */

drop trigger if exists workspace_tell_insert on public.ad_accounts;
create trigger workspace_tell_insert after insert on public.ad_accounts
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
-- An update is told only when something a page draws holds something else: the card's facts, and the read's stamp,
-- which is how a page learns that an hour's numbers are in. Never the platform's pace, which every read moves.
create or replace trigger workspace_tell_update
  after update of status, name, standing, config, read_at, read_error, withdrawn_at
  on public.ad_accounts
  for each row when (
    old.status is distinct from new.status or old.name is distinct from new.name
    or old.standing is distinct from new.standing or old.config is distinct from new.config
    or old.read_at is distinct from new.read_at or old.read_error is distinct from new.read_error
    or old.withdrawn_at is distinct from new.withdrawn_at)
  execute function public.workspace_tell_row_change();
drop trigger if exists workspace_tell_delete on public.ad_accounts;
create trigger workspace_tell_delete after delete on public.ad_accounts
  referencing old table as changed for each statement execute function public.workspace_tell_changes();

drop trigger if exists workspace_tell_insert on public.ads;
create trigger workspace_tell_insert after insert on public.ads
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
-- An ad's update is told when what its row draws moved: never the read's own stamp, which every hour writes.
create or replace trigger workspace_tell_update
  after update of name, intent, status, platform_state, platform_issue, budget_kind, budget_minor, budget_left_minor,
                  budget_shared, ends_at, intent_at, told_at
  on public.ads
  for each row when (
    old.name is distinct from new.name or old.intent is distinct from new.intent
    or old.status is distinct from new.status or old.platform_state is distinct from new.platform_state
    or old.platform_issue is distinct from new.platform_issue or old.budget_kind is distinct from new.budget_kind
    or old.budget_minor is distinct from new.budget_minor
    or old.budget_left_minor is distinct from new.budget_left_minor
    or old.budget_shared is distinct from new.budget_shared or old.ends_at is distinct from new.ends_at
    or old.intent_at is distinct from new.intent_at or old.told_at is distinct from new.told_at)
  execute function public.workspace_tell_row_change();
drop trigger if exists workspace_tell_delete on public.ads;
create trigger workspace_tell_delete after delete on public.ads
  referencing old table as changed for each statement execute function public.workspace_tell_changes();
