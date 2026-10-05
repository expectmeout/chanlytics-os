-- 00296 · A sending domain keeps each day's counters.
--
-- The Reports lenses spec, K9 (the domains' half). A domain's sent, bounced and complaint counts, the days it has sent on
-- and its state live on its own row, which the ten-minute domains sweep rewrites on every check and a Resume clears, so
-- how a domain's reputation went over the weeks could not be read, and a Resume erased the evidence of the episode it
-- answered. Now sending_domain_days_keep() writes one row per verified or held domain each night, under the day that has
-- just ended (UTC), copying what the last check left (pg_cron 'sending-domain-days', 00:23). It takes no day: the counters
-- are the row's now, so the only day they can honestly be filed under is the one that has just ended. Run again the same
-- night it replaces that day's row. A count the row never had (a domain verified and not yet counted, one just resumed) is
-- kept as null: absent, never zero. checked_at says when the sweep last read the domain, so a reader sees how stale a day
-- is. No foreign key from the domain: one taken off the workspace keeps the days it had, until the workspace goes.
--
-- Nothing is backfilled: the days before this night were never kept. Either deploy order works (nothing reads it yet).
-- The table is the members' to read (their own workspace's, as sending_domains is) and the service role's to write.
--
-- The lock. A new table and a function: nothing live is locked. The guard of 00259 is set all the same, and every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create table if not exists public.sending_domain_days (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  -- No foreign key: a domain taken off the workspace keeps the days it had.
  domain_id  uuid not null,
  day        date not null,
  host       text not null check (char_length(host) between 4 and 253),
  -- sending_domains.state, of the two states a domain is counted in.
  state      text not null check (state in ('verified', 'held')),
  held_why   text check (held_why is null or char_length(held_why) <= 40),
  sent       integer check (sent is null or sent >= 0),
  bounced    integer check (bounced is null or bounced >= 0),
  complaints integer check (complaints is null or complaints >= 0),
  sent_days  integer check (sent_days is null or sent_days >= 0),
  checked_at timestamptz,
  kept_at    timestamptz not null default now(),
  primary key (domain_id, day)
);
create index if not exists sending_domain_days_tenant_day on public.sending_domain_days (tenant_id, day desc);

alter table public.sending_domain_days enable row level security;
drop policy if exists sending_domain_days_member_select on public.sending_domain_days;
create policy sending_domain_days_member_select on public.sending_domain_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.sending_domain_days from anon, authenticated;
grant select on public.sending_domain_days to authenticated;
grant all on public.sending_domain_days to service_role;
comment on table public.sending_domain_days is
  'One row per sending domain per UTC day: its state and counters as the domains sweep''s last check left them (K9), written by sending_domain_days_keep at 00:23 for the day that ended. Null where the domain had no count; checked_at says how stale. Members read their workspace''s; the service role writes.';

create or replace function public.sending_domain_days_keep()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  v_n   integer;
begin
  with written as (
    insert into public.sending_domain_days
      (tenant_id, domain_id, day, host, state, held_why, sent, bounced, complaints, sent_days, checked_at, kept_at)
    select s.tenant_id, s.id, v_day, s.host, s.state, s.held_why, s.sent_recent, s.bounced_recent, s.complaints,
           s.sent_days, s.checked_at, now()
      from public.sending_domains s
     where s.state in ('verified', 'held')
    on conflict (domain_id, day) do update
       set host = excluded.host, state = excluded.state, held_why = excluded.held_why, sent = excluded.sent,
           bounced = excluded.bounced, complaints = excluded.complaints, sent_days = excluded.sent_days,
           checked_at = excluded.checked_at, kept_at = excluded.kept_at
    returning 1
  )
  select count(*)::integer into v_n from written;
  return v_n;
end $$;
revoke all on function public.sending_domain_days_keep() from public, anon, authenticated;
grant execute on function public.sending_domain_days_keep() to service_role;
comment on function public.sending_domain_days_keep() is
  'Keeps every verified or held sending domain''s state and counters, as the last check left them, under the UTC day that has just ended (K9); replaces that day''s row when run again; answers how many rows it wrote. The nightly clock''s (sending-domain-days, 00:23), and the service role''s to run.';

select cron.unschedule('sending-domain-days') where exists (select 1 from cron.job where jobname = 'sending-domain-days');
select cron.schedule('sending-domain-days', '23 0 * * *', $$select public.sending_domain_days_keep()$$);

-- Judged on its runs, like the nightly purges (00107) and the day's roll (00277): a night it does not run is a clock the
-- health sweep names.
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('sending_domain_days', 'sending-domain-days', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;
