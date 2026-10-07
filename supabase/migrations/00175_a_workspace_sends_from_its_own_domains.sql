-- 00175 · A workspace sends cold email from domains it owns.
--
-- Reach out, Part 2 (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6, §4.8): a reach-out leaves only from
-- a domain the business owns, several per workspace, each with its own identity, ramp and health. The edge creates
-- each at the cold mail account and writes this row; the account's key never reaches the dashboard. A ten-minute
-- clock reads each domain's verification and DMARC, and holds one that stops passing. A held domain sends nothing
-- (the send door, PR 4).
--
--   sending_domains   who it sends as, the records to publish, where it stands. Members read; the service role writes.
--   the domains clock every ten minutes, asking the edge only when a domain is being checked or can send.

create table if not exists public.sending_domains (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  -- getbestmovers.com: lower-case, a registrable name or a subdomain; unique across the platform, so a domain is
  -- one workspace's until it is removed.
  host               text not null
                       check (char_length(host) between 4 and 253
                              and host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  -- sam -> sam@getbestmovers.com, and the name beside it.
  from_local         text not null check (char_length(from_local) <= 40 and from_local ~ '^[a-z0-9]+([.-][a-z0-9]+)*$'),
  from_name          text not null check (char_length(btrim(from_name)) between 1 and 80),
  -- The mail provider's id. Null only between the reservation and the provider's answer, which the edge writes in
  -- the same request or removes the row.
  provider_domain_id text,
  -- The records to publish, as the provider returned them ({label, type, name, value, priority, status}).
  records            jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  state              text not null default 'records' check (state in ('records', 'verifying', 'verified', 'held')),
  -- The provider's own word, as it arrived; judged in contracts (sending-domains.ts judgeDomain).
  provider_status    text,
  -- A DMARC record at the host or a parent: found, missing, or null when never read.
  dmarc              text check (dmarc in ('found', 'missing')),
  held_why           text check (held_why in ('verification', 'dmarc', 'bounces', 'complaint')),
  held_at            timestamptz,
  verified_at        timestamptz,
  -- Since when it has been sending without trouble: the ramp's clock (contracts domainDailyCap).
  clean_since        timestamptz,
  checked_at         timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Held, and only held, carries a reason and a time, both or neither.
  constraint sending_domains_held_is_whole
    check ((state = 'held') = (held_why is not null) and (held_why is null) = (held_at is null)),
  constraint sending_domains_sending_is_dated
    check (state not in ('verified', 'held') or (verified_at is not null and clean_since is not null))
);

create unique index if not exists sending_domains_host_uq on public.sending_domains (host);
create unique index if not exists sending_domains_provider_uq on public.sending_domains (provider_domain_id)
  where provider_domain_id is not null;
create index if not exists sending_domains_tenant on public.sending_domains (tenant_id, created_at);
create index if not exists sending_domains_due on public.sending_domains (checked_at nulls first)
  where state in ('verifying', 'verified', 'held');

drop trigger if exists sending_domains_set_updated_at on public.sending_domains;
create trigger sending_domains_set_updated_at
  before update on public.sending_domains
  for each row execute function extensions.moddatetime('updated_at');

-- Five domains per workspace at most (contracts SENDING_DOMAINS_MAX; sending-domains.db.test.mjs holds the two to
-- one number). Held here rather than only counted before the insert: two adds pressed at once would both count
-- four. The lock is the workspace's own, for this transaction, so nobody else waits on it.
create or replace function public.sending_domains_within_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('sending_domains:' || new.tenant_id::text));
  if (select count(*) from public.sending_domains d where d.tenant_id = new.tenant_id) >= 5 then
    raise exception 'A workspace sends from 5 domains at most.' using errcode = 'P0001', hint = 'too_many';
  end if;
  return new;
end $$;
revoke execute on function public.sending_domains_within_limit() from public, anon, authenticated;
drop trigger if exists sending_domains_within_limit on public.sending_domains;
create trigger sending_domains_within_limit
  before insert on public.sending_domains
  for each row execute function public.sending_domains_within_limit();

alter table public.sending_domains enable row level security;
drop policy if exists sending_domains_member_select on public.sending_domains;
create policy sending_domains_member_select on public.sending_domains
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.sending_domains is
  'The domains a workspace sends cold email from (Reach out): the identity, the provider''s records, and where each stands. Members read; the service role writes (apps/edge lib/email/sending-domains.ts).';

-- A domain checked, verified or held by the sweep repaints Connections (packages/db realtime.ts). Re-runnably, as
-- 00169 adds its lists.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sending_domains'
  ) then
    alter publication supabase_realtime add table public.sending_domains;
  end if;
end $$;

/* ----------------------------------------------------------- the clock -- */

create or replace function public.trigger_domains_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.sending_domains d where d.state in ('verifying', 'verified', 'held')) then
    return public.request_sweep('domains', '/api/cron/domains', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('domains', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_domains_sweep() from public, anon, authenticated;
comment on function public.trigger_domains_sweep() is
  'The domains clock (Reach out). Calls the edge (/api/cron/domains) only when a domain is being checked or can send; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every ten minutes, recording itself each time: forty minutes is four missed ticks.
  ('domains', 'domains-sweep', interval '40 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

-- Minutes 2, 12, … 52: off the health check's grid (13, 43), the five-minute clocks, the lines sweep and the
-- stale-jobs sweep.
select cron.unschedule('domains-sweep') where exists (select 1 from cron.job where jobname = 'domains-sweep');
select cron.schedule('domains-sweep', '2,12,22,32,42,52 * * * *', $$select public.trigger_domains_sweep()$$);
