-- 00140 · The lead finder's engine: the data and the doors (release A1).
--
-- PRD v3 (docs/plans/2026-09-17-people-table-and-lead-finder.md) §0, §12.3,
-- §12.4; the plan is docs/plans/2026-09-19-lead-finder-A1-data.md. Nothing here
-- draws a screen and nothing here calls a provider: A2 brings the pipeline
-- (the three jobs, the webhook, the sweep's handler, the routes).
--
-- The shape, in one paragraph. A SEARCH is the saved object: its name, the
-- owner's words, its current plan. A ROUND is the unit of execution and of
-- money: the probe, each top-up, each Find new ones; it carries the exact plan
-- it ran, its reservation, its spend and one of nine endings, and it is final
-- once ended (lead_rounds_guard). A RUN is one provider execution, claimed
-- before the provider is called (lead_run_claim) and leased by owner token and
-- generation while a page is read (lead_run_lease). A LEAD is a place, one
-- physical location, unique by its place id in the workspace; a shared phone,
-- email or website host is a lookup and a mark, never a merge (25). A
-- MEMBERSHIP joins a lead to a search with that search's own judgment and
-- class. COUNTERS hold the month's allowance and searching budget and the two
-- day caps, reserved in one fixed order inside one transaction and settled as
-- pages commit (E2). OPERATIONS are the undo records (E9). Suppression is by
-- what happened (S8). The switch ships off: lead_platform.searches_on is
-- false, and only the workspaces listed in tenants_on may search (30).
--
-- Money is numeric(10,4). Every door is SECURITY DEFINER with search_path
-- pinned, checks the caller's membership and role through the existing
-- helpers, and returns a refusal as jsonb ({error: ...}) where the owner will
-- read a sentence, raising only for a caller's bug. Every service RPC runs as
-- one transaction and is the edge's alone (service_role). Members read their
-- workspace's rows through row-level security (the 00002 shape) and write
-- nothing directly.

-- Wait no longer than three seconds for any lock this file needs. Two
-- statements here take ACCESS EXCLUSIVE on a table a live workspace is
-- reading -- the trigger on contacts (a drop takes it even when the trigger
-- does not exist) and the CHECK on jobs -- and both are held until COMMIT
-- while the rest of the file runs. Behind a long read, that queues every
-- reader of contacts behind us: the receptionist stops answering. Better to
-- fail and be run again in a quiet minute.
--
-- SET LOCAL, not SET: the Supabase CLI applies each migration file inside one
-- transaction (with its own schema_migrations row), so LOCAL covers the whole
-- file and no later migration on the same connection inherits it. Applied any
-- other way -- a bare psql -f, say -- SET LOCAL does nothing, so the block
-- below says so out loud rather than letting the precaution go missing.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. tables -- */

-- The platform's switch, one row (13, 30). No member policy: read through
-- lead_searches_on().
create table if not exists public.lead_platform (
  id                boolean primary key default true check (id),
  searches_on       boolean not null default false,
  tenants_on        uuid[]  not null default '{}',
  note              text check (char_length(note) <= 200),
  prices_checked_at timestamptz,
  updated_at        timestamptz not null default now()
);
insert into public.lead_platform (id) values (true) on conflict (id) do nothing;
comment on table public.lead_platform is
  'One row. searches_on is the kill switch for every workspace; tenants_on lists the workspaces that may search while it is off (release A''s internal runs). Read through lead_searches_on(); written by hand.';

-- What past searches found for a kind of business, platform-wide (§7.1 the
-- likely line). No member policy: read through lead_niche_prior().
create table if not exists public.lead_niche_priors (
  category_key text primary key check (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  places       integer not null default 0 check (places >= 0),
  matched      integer not null default 0 check (matched >= 0),
  with_email   integer not null default 0 check (with_email >= 0),
  updated_at   timestamptz not null default now()
);
comment on table public.lead_niche_priors is
  'Platform-wide counts per kind of business: places judged, how many qualified, how many had an email. Aggregates only; nothing names a workspace or a place.';

create table if not exists public.lead_searches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  via        text not null check (via in ('people', 'ask')),
  card       text not null,
  name       text not null check (char_length(name) between 1 and 120),
  asked      text not null check (char_length(asked) <= 400),
  plan       jsonb not null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_searches_tenant_created on public.lead_searches (tenant_id, created_at desc);
comment on table public.lead_searches is
  'The saved object: who was asked for, in the owner''s words, and the current plan. No state and no counters: lead_searches_view derives both from the rounds and the members.';

create table if not exists public.lead_rounds (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  search_id          uuid not null references public.lead_searches (id) on delete cascade,
  seq                integer not null check (seq >= 1),
  purpose            text not null check (purpose in ('probe', 'main', 'topup', 'renew')),
  plan               jsonb not null,
  plan_version       integer not null check (plan_version >= 1),
  target             integer not null check (target >= 0),
  state              text not null default 'queued'
                     check (state in ('queued', 'probing', 'waiting_on_owner', 'running', 'checking', 'ended')),
  ending             text check (ending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused')),
  -- The ending a collect decided while the emails were still being checked;
  -- the check's last batch ends the round with it (17, S12).
  ending_pending     text check (ending_pending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused')),
  question           jsonb,
  answered           text check (answered in ('keep', 'include', 'stop')),
  waiting_since      timestamptz,
  allowance_reserved integer not null default 0 check (allowance_reserved >= 0),
  allowance_used     integer not null default 0 check (allowance_used >= 0),
  cost_reserved_usd  numeric(10,4) not null default 0 check (cost_reserved_usd >= 0),
  cost_usd           numeric(10,4) not null default 0 check (cost_usd >= 0),
  judge_tokens       integer not null default 0,
  judge_model        text,
  -- The counter rows this round reserved in: the month and the day of its
  -- creation, in the workspace's zone (the platform's day row is UTC).
  month              text not null check (month ~ '^\d{4}-\d{2}$'),
  day                text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz not null default now(),
  unique (search_id, seq),
  check ((state = 'ended') = (ending is not null))
);
create index if not exists lead_rounds_search_seq on public.lead_rounds (search_id, seq desc);
create index if not exists lead_rounds_live on public.lead_rounds (state) where state <> 'ended';
comment on table public.lead_rounds is
  'The unit of execution and of money: the probe (seq 1), each top-up and each Find new ones. Carries the plan it ran, its reservation and spend, one ending; final once ended (lead_rounds_guard). The search''s state is its latest round''s.';
comment on column public.lead_rounds.ending_pending is
  'Set by the collect that moved the round to checking, or by Stop during the checks; lead_check_commit''s last batch ends the round with it.';
-- The platform's day row this round reserved in, in UTC, beside the
-- workspace's own month and day. A round that crosses UTC midnight must
-- release and settle against the row it took from: releasing against today's
-- would drive the platform's reservation toward zero and weaken the $50 day
-- cap for every other workspace, and leave yesterday's row reserved for ever.
alter table public.lead_rounds add column if not exists platform_day text
  default to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
update public.lead_rounds set platform_day = to_char(now() at time zone 'UTC', 'YYYY-MM-DD') where platform_day is null;
alter table public.lead_rounds alter column platform_day set not null;
alter table public.lead_rounds drop constraint if exists lead_rounds_platform_day_check;
alter table public.lead_rounds add constraint lead_rounds_platform_day_check check (platform_day ~ '^\d{4}-\d{2}-\d{2}$');
comment on column public.lead_rounds.platform_day is
  'The platform-wide day counter (tenant_id null, UTC) this round reserved in, so every release and settle reaches the row it took from, whatever day it is when the round ends.';

create table if not exists public.lead_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  round_id           uuid not null references public.lead_rounds (id) on delete cascade,
  purpose            text not null check (purpose in ('discover', 'check')),
  term               text,
  actor              text not null,
  build              text not null,
  apify_run_id       text unique,
  dataset_id         text,
  state              text not null default 'claimed'
                     check (state in ('claimed', 'starting', 'running', 'succeeded', 'failed', 'aborted', 'timed_out', 'unknown')),
  claimed_by         text,
  claimed_at         timestamptz,
  webhook_token_hash text not null,
  lease_owner        text,
  lease_gen          integer not null default 0,
  lease_until        timestamptz,
  read_offset        integer not null default 0 check (read_offset >= 0),
  items_seen         integer not null default 0,
  cap_usd            numeric(10,4),
  usage_usd          numeric(10,4) not null default 0,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create index if not exists lead_runs_round on public.lead_runs (round_id);
create index if not exists lead_runs_live on public.lead_runs (state) where state in ('claimed', 'starting', 'running', 'unknown');
comment on table public.lead_runs is
  'One provider execution: a discover run per term, a check run per batch of addresses. Written ''claimed'' (the row exists), claimed by a dispatch token before the provider is called (E1), leased by owner token and generation while a page is read (E3); the webhook token is made with the row and never rewritten.';

create table if not exists public.lead_judgments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  round_id     uuid not null references public.lead_rounds (id) on delete cascade,
  batch        integer not null default 0,
  op_id        text not null unique,
  request_hash text,
  answer       jsonb not null,
  model        text,
  tokens       integer not null default 0,
  created_at   timestamptz not null default now()
);
comment on table public.lead_judgments is
  'The judge''s answer for one batch, kept by operation id (sha256 of run:offset:batch), so a replayed page finds it and pays nothing (E4). No member policy: the peek reads the member''s own judgment.';

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  place_id         text,
  business_name    text not null default '',
  category         text,
  street           text,
  city             text,
  region           text,
  postal_code      text,
  country          text not null default 'US',
  lat              double precision,
  lng              double precision,
  website_host     text,
  instagram_url    text,
  phone_e164       text,
  phone_sources    smallint not null default 0,
  phone_wrong      boolean not null default false,
  email            text,
  email_alternates jsonb not null default '[]'::jsonb,
  email_state      text not null default 'none' check (email_state in ('none', 'checking', 'ok', 'catch_all', 'unknown', 'invalid')),
  email_checked_at timestamptz,
  rating           numeric(2,1),
  reviews          integer,
  stage            text not null default 'ready' check (stage in ('ready', 'nurture', 'converted', 'archived')),
  closed_reason    text check (closed_reason in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed')),
  last_outcome     text,
  last_note        text,
  contacted_at     timestamptz,
  exported_at      timestamptz,
  contact_id       uuid references public.contacts (id) on delete set null,
  converted_at     timestamptz,
  found_at         timestamptz not null default now(),
  erased_at        timestamptz,
  blanked_at       timestamptz
);
-- A place is one lead in a workspace; a blanked lead has no place id, so the
-- same place found again is a new lead. No unique email or phone (25).
create unique index if not exists leads_tenant_place_uq on public.leads (tenant_id, place_id) where place_id is not null;
create index if not exists leads_tenant_phone on public.leads (tenant_id, phone_e164) where phone_e164 is not null;
create index if not exists leads_tenant_email on public.leads (tenant_id, email) where email is not null;
create index if not exists leads_tenant_host on public.leads (tenant_id, website_host) where website_host is not null;
create index if not exists leads_tenant_contact on public.leads (tenant_id, contact_id) where contact_id is not null;
-- purge_leads' first pass reads only leads nobody has worked, oldest first;
-- without this it scans every lead of every workspace every night.
create index if not exists leads_untouched_purge
  on public.leads (found_at)
  where stage = 'ready' and contact_id is null and contacted_at is null and exported_at is null
    and erased_at is null and blanked_at is null;
comment on table public.leads is
  'A place: one physical location, outside contacts. Unique by place id in the workspace; a shared phone, email or website is looked up and marked on the member, never merged (25). Stage is the relationship; class lives on the membership.';

create table if not exists public.lead_places (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid not null references public.leads (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  place_id  text not null,
  title     text,
  street    text,
  found_at  timestamptz not null default now(),
  unique (tenant_id, place_id)
);
comment on table public.lead_places is
  'A duplicate listing (the same name, address and phone) folded into the lead already held, so rediscovery maps back (E6).';

create table if not exists public.lead_search_members (
  id            uuid primary key default gen_random_uuid(),
  search_id     uuid not null references public.lead_searches (id) on delete cascade,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  round_id      uuid references public.lead_rounds (id) on delete set null,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  judgment      jsonb not null default '{}'::jsonb,
  class         text not null check (class in ('qualified', 'review', 'excluded')),
  excluded_by   text,
  fit           text check (fit in ('strong', 'look', 'long')),
  reason        text not null default '' check (char_length(reason) <= 120),
  distance_m    integer,
  counted       boolean not null default false,
  counted_month text check (counted_month ~ '^\d{4}-\d{2}$'),
  kept_at       timestamptz,
  kept_by       uuid,
  blanked_at    timestamptz,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  unique (search_id, lead_id),
  check (counted = (counted_month is not null))
);
create index if not exists lead_search_members_lead on public.lead_search_members (lead_id);
-- purge_leads' third pass reads only excluded memberships not yet blanked,
-- oldest first; without this it scans every membership every night.
create index if not exists lead_search_members_excluded_purge
  on public.lead_search_members (created_at) where class = 'excluded' and blanked_at is null;
create index if not exists lead_search_members_round on public.lead_search_members (round_id);
create index if not exists lead_search_members_page on public.lead_search_members (tenant_id, search_id, class, created_at desc);
comment on table public.lead_search_members is
  'One lead in one search, with that search''s judgment ({answer, reasons, shares}), class, fit and distance. counted_month is the month it counted in (S11). The round''s tallies are counts over this table, never stored twice. version guards Undo (E9).';

create table if not exists public.lead_counters (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants (id) on delete cascade,
  kind       text not null check (kind in ('allowance', 'budget', 'day')),
  period     text not null,
  used       numeric(10,4) not null default 0 check (used >= 0),
  reserved   numeric(10,4) not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, kind, period),
  check (kind = 'day' or tenant_id is not null),
  check (case kind when 'day' then period ~ '^\d{4}-\d{2}-\d{2}$' else period ~ '^\d{4}-\d{2}$' end)
);
comment on table public.lead_counters is
  'The month''s allowance (Qualified leads) and searching budget (usd) per workspace, and the day''s spend per workspace and for the platform (tenant_id null). Locked for update in one fixed order, allowance, budget, day, platform, inside one door, never across a provider or model call (E2).';

create table if not exists public.lead_operations (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind      text not null check (kind in ('undo_search', 'keep', 'exclude', 'put_back', 'include', 'stop')),
  search_id uuid references public.lead_searches (id) on delete cascade,
  lead_ids  uuid[] not null default '{}',
  before    jsonb not null default '{}'::jsonb,
  after     jsonb not null default '{}'::jsonb,
  version   integer not null,
  by        uuid,
  at        timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists lead_operations_search on public.lead_operations (search_id, at desc);
comment on table public.lead_operations is
  'Every undo-able act: what it changed, from what, by whom, when. lead_undo takes the id and the version the client saw and refuses when anyone changed the rows since (E9).';

create table if not exists public.lead_preferences (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  kind         text not null check (kind in ('chain', 'wrong_kind', 'too_far')),
  category_key text,
  example      text check (char_length(example) <= 120),
  from_lead_id uuid references public.leads (id) on delete set null,
  active       boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
comment on table public.lead_preferences is
  'Learned exclusions, scoped to the kind of business (P5). Release C draws them; A1 holds the rows.';

create table if not exists public.lead_suppressions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  kind       text not null check (kind in ('email', 'place', 'phone')),
  hash       text not null,
  what       text not null check (what in ('email_opt_out', 'customer', 'erased')),
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, hash)
);
comment on table public.lead_suppressions is
  'By what happened (S8): an email opt-out stops email to that address (calls stay); a customer is hidden from every search; an erasure hides the place, the number and the address for good. A bounce is email_state = invalid on the lead, never a row here. The hash is lead_suppression_hash().';

/* ------------------------------------------------------- 2. row security -- */

alter table public.lead_platform        enable row level security;
alter table public.lead_niche_priors    enable row level security;
alter table public.lead_searches        enable row level security;
alter table public.lead_rounds          enable row level security;
alter table public.lead_runs            enable row level security;
alter table public.lead_judgments       enable row level security;
alter table public.leads                enable row level security;
alter table public.lead_places          enable row level security;
alter table public.lead_search_members  enable row level security;
alter table public.lead_counters        enable row level security;
alter table public.lead_operations      enable row level security;
alter table public.lead_preferences     enable row level security;
alter table public.lead_suppressions    enable row level security;

-- Members read their workspace's rows (the 00002 shape); nobody signed in
-- writes a row directly. Every write goes through a door below.
drop policy if exists lead_searches_member_select on public.lead_searches;
create policy lead_searches_member_select on public.lead_searches
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_rounds_member_select on public.lead_rounds;
create policy lead_rounds_member_select on public.lead_rounds
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_runs_member_select on public.lead_runs;
create policy lead_runs_member_select on public.lead_runs
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists leads_member_select on public.leads;
create policy leads_member_select on public.leads
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_places_member_select on public.lead_places;
create policy lead_places_member_select on public.lead_places
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_search_members_member_select on public.lead_search_members;
create policy lead_search_members_member_select on public.lead_search_members
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_operations_member_select on public.lead_operations;
create policy lead_operations_member_select on public.lead_operations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_preferences_member_select on public.lead_preferences;
create policy lead_preferences_member_select on public.lead_preferences
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_suppressions_member_select on public.lead_suppressions;
create policy lead_suppressions_member_select on public.lead_suppressions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- The service role's tables: no policy, and the privilege itself refused
-- (tenancy.db.test.mjs wants 42501, not an empty list).
revoke all on public.lead_platform     from public, anon, authenticated;
revoke all on public.lead_niche_priors from public, anon, authenticated;
revoke all on public.lead_judgments    from public, anon, authenticated;
revoke all on public.lead_counters     from public, anon, authenticated;
-- The rest: read only for a session. Supabase's default grant hands
-- authenticated every verb; RLS with no write policy refuses the rows, and
-- the revoke refuses the verb.
revoke insert, update, delete on public.lead_searches, public.lead_rounds, public.lead_runs, public.leads, public.lead_places,
  public.lead_search_members, public.lead_operations, public.lead_preferences, public.lead_suppressions from anon, authenticated;
revoke all on public.lead_searches, public.lead_rounds, public.lead_runs, public.leads, public.lead_places,
  public.lead_search_members, public.lead_operations, public.lead_preferences, public.lead_suppressions from anon;

/* ------------------------------------------------------------- 3. jobs -- */

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check'));

-- A collect is scheduled once per page, however often the webhook, the sweep
-- and the commit each ask for it: the key is the run and the page's seq.
-- A failed one does not count (00135's rule for the intake): a collect that
-- failed for good -- the stop collect above all -- can be made again.
drop index if exists public.jobs_lead_collect_once;
create unique index if not exists jobs_lead_collect_once
  on public.jobs ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed';
comment on index public.jobs_lead_collect_once is
  'One live collect per page of a run, however often the webhook, the sweep and the commit each ask for it. A failed collect does not count, so a run whose stop collect failed can be stopped again.';

/* ----------------------------------------------------------- 4. helpers -- */

create or replace function public.lead_month(p_tenant_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(p_at at time zone t.timezone, 'YYYY-MM') from public.tenants t where t.id = p_tenant_id
$$;
comment on function public.lead_month(uuid, timestamptz) is
  'The workspace''s calendar month of an instant, YYYY-MM, in tenants.timezone: the month a lead counts in and the allowance renews on (15). contracts'' leadMonth() says the same.';
revoke execute on function public.lead_month(uuid, timestamptz) from public, anon;
grant execute on function public.lead_month(uuid, timestamptz) to authenticated, service_role;

create or replace function public.lead_day(p_tenant_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(p_at at time zone coalesce((select t.timezone from public.tenants t where t.id = p_tenant_id), 'UTC'), 'YYYY-MM-DD')
$$;
comment on function public.lead_day(uuid, timestamptz) is
  'The workspace''s calendar day of an instant, YYYY-MM-DD, in its zone; the platform''s day (tenant null) is UTC. The period of the day counters.';
revoke execute on function public.lead_day(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.lead_searches_on(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.searches_on or p_tenant_id = any (p.tenants_on) from public.lead_platform p where p.id), false)
$$;
comment on function public.lead_searches_on(uuid) is
  'Whether this workspace may search: the platform switch is on, or the workspace is listed in lead_platform.tenants_on (30). Read before every start; ships false for everyone.';
revoke execute on function public.lead_searches_on(uuid) from public, anon;
grant execute on function public.lead_searches_on(uuid) to authenticated, service_role;

create or replace function public.lead_niche_prior(p_category_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('places', n.places, 'matched', n.matched, 'with_email', n.with_email)
    from public.lead_niche_priors n where n.category_key = p_category_key
$$;
comment on function public.lead_niche_prior(text) is
  'The platform-wide prior for a kind of business ({places, matched, with_email}), or null when the kind was never searched. Aggregates only.';
revoke execute on function public.lead_niche_prior(text) from public, anon;
grant execute on function public.lead_niche_prior(text) to authenticated, service_role;

-- ROLE_PERMS (packages/contracts/src/config.ts) in SQL. One derivation per
-- side, held together by lead-engine.db.test.mjs: a permission added to one
-- without the other fails there by name.
create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_user and m.tenant_id = p_tenant_id
       and m.role = any (case p_permission
         when 'approve'    then array['owner', 'operator']
         when 'autonomy'   then array['owner', 'operator']
         when 'disconnect' then array['owner']
         when 'billing'    then array['owner']
         when 'team'       then array['owner']
         when 'settings'   then array['owner']
         when 'export'     then array['owner']
         when 'find'       then array['owner']
         else array[]::text[] end)
  )
$$;
comment on function public.has_permission(uuid, uuid, text) is
  'Whether this user may do this in this workspace, by role: contracts'' ROLE_PERMS, restated once in SQL. find (start a search, keep a lead from review, put one back: each spends the month''s allowance) is the owner''s alone.';
-- It takes an arbitrary user id, so a signed-in member could read anyone's
-- role with it. The doors call it as definer and need no grant of their own.
revoke execute on function public.has_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.has_permission(uuid, uuid, text) to service_role;

create or replace function public.lead_suppression_hash(p_tenant_id uuid, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_tenant_id::text || ':' || p_value, 'UTF8')), 'hex')
$$;
comment on function public.lead_suppression_hash(uuid, text) is
  'sha256 hex of "<tenant_id>:<value>", the keyed digest contracts'' erasure.ts computes (leadSuppressionHash), so a hash written here and one written on the edge agree byte for byte.';
revoke execute on function public.lead_suppression_hash(uuid, text) from public, anon, authenticated;

create or replace function public.lead_counter_take(p_tenant_id uuid, p_kind text, p_period text)
returns public.lead_counters
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.lead_counters;
begin
  insert into public.lead_counters (tenant_id, kind, period) values (p_tenant_id, p_kind, p_period)
  on conflict (tenant_id, kind, period) do nothing;
  select * into v from public.lead_counters
   where tenant_id is not distinct from p_tenant_id and kind = p_kind and period = p_period
   for update;
  return v;
end $$;
comment on function public.lead_counter_take(uuid, text, text) is
  'The counter row for a period, made if missing and locked for update. Callers take rows in one order only: allowance, budget, the workspace''s day, the platform''s day (E2).';
revoke execute on function public.lead_counter_take(uuid, text, text) from public, anon, authenticated;

create or replace function public.lead_renews_on(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(date_trunc('month', now() at time zone t.timezone) + interval '1 month', 'Mon FMDD') from public.tenants t where t.id = p_tenant_id
$$;
comment on function public.lead_renews_on(uuid) is 'The first day of the workspace''s next calendar month, as the sentence says it: "Oct 1".';
revoke execute on function public.lead_renews_on(uuid) from public, anon, authenticated;

-- Reserve a round's target and estimate, or say which cap binds. Counters are
-- taken in one fixed order and the whole reservation is one statement's
-- worth of locks; a refusal writes nothing but the counter rows themselves.
drop function if exists public.lead_reserve(uuid, text, text, integer, numeric);
create or replace function public.lead_reserve(p_tenant_id uuid, p_month text, p_day text, p_platform_day text, p_leads integer, p_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance public.lead_counters;
  v_budget    public.lead_counters;
  v_day       public.lead_counters;
  v_platform  public.lead_counters;
  v_left      numeric;
begin
  v_allowance := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  if v_allowance.used + v_allowance.reserved + p_leads > 500 then
    v_left := greatest(500 - v_allowance.used - v_allowance.reserved, 0);
    return jsonb_build_object('error', 'month_leads_used', 'left', v_left::integer,
      'sentence', case when v_left <= 0
        then 'You have found this month''s 500 leads. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
        else 'You have ' || v_left::integer || ' leads left this month. Find ' || v_left::integer || ' now, or all ' || p_leads || ' when your leads renew on ' || public.lead_renews_on(p_tenant_id) || '?' end);
  end if;
  v_budget := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  if v_budget.used + v_budget.reserved + p_usd > 25 then
    v_left := greatest(25 - v_budget.used - v_budget.reserved, 0);
    return jsonb_build_object('error', 'budget_used', 'left_usd', v_left,
      'sentence', 'This month''s searching is nearly used up. Try a smaller search, or a phone standard; it renews on ' || public.lead_renews_on(p_tenant_id) || '.');
  end if;
  v_day := public.lead_counter_take(p_tenant_id, 'day', p_day);
  if v_day.used + v_day.reserved + p_usd > 10 then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.');
  end if;
  v_platform := public.lead_counter_take(null, 'day', p_platform_day);
  if v_platform.used + v_platform.reserved + p_usd > 50 then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Searching is busy today. Try again tomorrow.');
  end if;
  update public.lead_counters set reserved = reserved + p_leads, updated_at = now() where id = v_allowance.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_budget.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_day.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_platform.id;
  return null;
end $$;
comment on function public.lead_reserve(uuid, text, text, text, integer, numeric) is
  'Reserves p_leads from the month''s allowance (500) and p_usd from the month''s budget ($25), the workspace''s day ($10) and the platform''s day ($50, the UTC day p_platform_day, which the round stores), in that lock order; null when reserved, else {error, sentence} naming the cap that binds (§0.2, §13.3).';
revoke execute on function public.lead_reserve(uuid, text, text, text, integer, numeric) from public, anon, authenticated;

drop function if exists public.lead_release(uuid, text, text, integer, numeric);
create or replace function public.lead_release(p_tenant_id uuid, p_month text, p_day text, p_platform_day text, p_leads integer, p_usd numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.lead_counters;
begin
  v := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  update public.lead_counters set reserved = greatest(reserved - p_leads, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'day', p_day);
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(null, 'day', p_platform_day);
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
end $$;
comment on function public.lead_release(uuid, text, text, text, integer, numeric) is
  'Gives back what a round reserved and did not use, to the four rows it took from -- the round''s own month, day and platform_day -- in the same lock order as lead_reserve. Never below zero.';
revoke execute on function public.lead_release(uuid, text, text, text, integer, numeric) from public, anon, authenticated;

-- Usage settles against the cost reservation: what was reserved moves to used
-- up to the reservation, and past it only used grows (retries and failed
-- runs included, 27).
drop function if exists public.lead_settle_usage(uuid, text, text, numeric, numeric);
create or replace function public.lead_settle_usage(p_tenant_id uuid, p_month text, p_day text, p_platform_day text, p_delta numeric, p_outstanding numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v      public.lead_counters;
  v_take numeric := least(greatest(p_delta, 0), greatest(p_outstanding, 0));
begin
  if p_delta <= 0 then return; end if;
  v := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'day', p_day);
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(null, 'day', p_platform_day);
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
end $$;
comment on function public.lead_settle_usage(uuid, text, text, text, numeric, numeric) is
  'A run''s new usage, settled against the month''s budget and both day counters -- the round''s own day and the platform_day it reserved in: used grows by the delta; reserved shrinks by what the round still had outstanding.';
revoke execute on function public.lead_settle_usage(uuid, text, text, text, numeric, numeric) from public, anon, authenticated;

-- What blanking clears, named once (§0.4 take the least; §12.4 retention). An
-- allow-list: what a lead KEEPS is listed here, and everything else goes.
create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now())
   where id = p_lead_id;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  return v_n;
end $$;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';
revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;

/* ------------------------------------------------------------ 5. guards -- */

create or replace function public.lead_rounds_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state <> 'queued' then
      raise exception 'a round starts queued (% refused)', NEW.state;
    end if;
    if exists (select 1 from public.lead_rounds r where r.search_id = NEW.search_id and r.state <> 'ended') then
      raise exception 'one live round per search';
    end if;
    -- Carry on, Try again, a top-up and Find new ones make a NEW round from an
    -- ended one, and only a signed-in person may: the edge and the sweep hold
    -- the service key, and they never revive a search (§12.3).
    if NEW.seq > 1 and auth.uid() is null then
      raise exception 'only a signed-in person may start a round after an ended one';
    end if;
    return NEW;
  end if;
  if OLD.state = 'ended' then
    raise exception 'a round is final once ended (% refused)', case when NEW.state is distinct from OLD.state then NEW.state else 'a change' end;
  end if;
  if NEW.state is distinct from OLD.state then
    if not (
         (OLD.state = 'queued'           and NEW.state in ('probing', 'running', 'ended'))
      or (OLD.state = 'probing'          and NEW.state in ('waiting_on_owner', 'running', 'checking', 'ended'))
      or (OLD.state = 'waiting_on_owner' and NEW.state in ('running', 'ended'))
      or (OLD.state = 'running'          and NEW.state in ('checking', 'ended'))
      or (OLD.state = 'checking'         and NEW.state in ('ended'))
    ) then
      raise exception 'lead_rounds.state % -> % refused', OLD.state, NEW.state;
    end if;
  end if;
  -- The plan a round runs is the plan it ran, except the one amendment
  -- Include makes while the round waits (§0.5 the only in-place change).
  if NEW.plan is distinct from OLD.plan or NEW.plan_version is distinct from OLD.plan_version then
    if OLD.state <> 'waiting_on_owner' or NEW.plan_version <> OLD.plan_version + 1 then
      raise exception 'a round''s plan changes only while it waits on the owner, as the next version';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists lead_rounds_guard on public.lead_rounds;
create trigger lead_rounds_guard before insert or update on public.lead_rounds
  for each row execute function public.lead_rounds_guard();
comment on function public.lead_rounds_guard() is
  'queued -> probing | running | ended; probing -> waiting_on_owner | running | checking | ended; waiting_on_owner -> running | ended; running -> checking | ended; checking -> ended; ended is final. One live round per search; a later round needs a signed-in person; the plan changes only while waiting, as version + 1.';
revoke execute on function public.lead_rounds_guard() from public, anon, authenticated;

create or replace function public.lead_runs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.claimed_by is not null and NEW.claimed_by is distinct from OLD.claimed_by then
    raise exception 'a run''s claim is never rewritten (E1)';
  end if;
  if NEW.webhook_token_hash is distinct from OLD.webhook_token_hash then
    raise exception 'a run''s webhook token is made once and never rewritten (E1)';
  end if;
  if OLD.state in ('succeeded', 'failed', 'aborted', 'timed_out') and NEW.state is distinct from OLD.state then
    raise exception 'lead_runs.state is terminal (% -> % refused)', OLD.state, NEW.state;
  end if;
  return NEW;
end $$;
drop trigger if exists lead_runs_guard on public.lead_runs;
create trigger lead_runs_guard before update on public.lead_runs
  for each row execute function public.lead_runs_guard();
comment on function public.lead_runs_guard() is
  'The claim and the webhook token are written once; succeeded, failed, aborted and timed_out are final. The offset, the lease and the usage still move on a finished run: the final collect reads what is left.';
revoke execute on function public.lead_runs_guard() from public, anon, authenticated;

-- An erased person takes their leads with them (§0.4): every lead linked to
-- the contact is blanked, and its place, number and address are hashed onto
-- the never-again list first, so no search finds them again.
create or replace function public.leads_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    for r in select l.id, l.place_id, l.phone_e164, l.email from public.leads l where l.tenant_id = NEW.tenant_id and l.contact_id = NEW.id loop
      if r.place_id is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'place', public.lead_suppression_hash(NEW.tenant_id, r.place_id), 'erased') on conflict do nothing;
      end if;
      if r.phone_e164 is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'phone', public.lead_suppression_hash(NEW.tenant_id, r.phone_e164), 'erased') on conflict do nothing;
      end if;
      if r.email is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'email', public.lead_suppression_hash(NEW.tenant_id, r.email), 'erased') on conflict do nothing;
      end if;
      perform public.lead_blank(r.id);
      update public.leads set erased_at = now() where id = r.id;
    end loop;
  end if;
  return NEW;
end $$;
revoke execute on function public.leads_erase_on_contact() from public, anon, authenticated;
drop trigger if exists contacts_erase_blanks_leads on public.contacts;
create trigger contacts_erase_blanks_leads
  after update of erased_at on public.contacts
  for each row execute function public.leads_erase_on_contact();
comment on function public.leads_erase_on_contact() is
  'When a person is erased, each lead linked to them is hashed onto lead_suppressions as erased (place, phone, email) and blanked through lead_blank.';

-- A person who writes or calls in, whose number or address a lead holds, IS
-- that lead: the lead links to them and converts (§0.4, 25). Only the edge
-- makes such a person (auth.uid() is null); the desk's Add a person never
-- links, and a stage click never converts.
create or replace function public.lead_link_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  begin
    if auth.uid() is not null then return null; end if;
    if NEW.erased_at is not null or NEW.merged_into_contact_id is not null then return null; end if;
    if NEW.phone_e164 is null and NEW.email is null then return null; end if;
    -- Two guarded single-column lookups, never one OR over two nullable
    -- parameters: this runs on EVERY contacts insert (the inbound hot path),
    -- and an OR of two nullable parameters plans as a sequential scan over
    -- leads. Each lookup reaches its own index (leads_tenant_phone,
    -- leads_tenant_email); the number is tried first, being the stronger
    -- identity.
    if NEW.phone_e164 is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.phone_e164 = NEW.phone_e164
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null and NEW.email is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.email = NEW.email
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null then return null; end if;
    update public.leads
       set contact_id = NEW.id, stage = 'converted', closed_reason = null, converted_at = now(), contacted_at = coalesce(contacted_at, now())
     where id = v_lead;
    if not exists (select 1 from public.events e where e.tenant_id = NEW.tenant_id and e.subject_type = 'contact' and e.subject_id = NEW.id and e.kind = 'contact.added') then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (NEW.tenant_id, 'contact.added', 'contact', 'contact', NEW.id, jsonb_build_object('source', 'lead'));
    end if;
  exception when others then
    raise warning 'lead_link_contact: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.lead_link_contact() from public, anon, authenticated;
drop trigger if exists contacts_link_lead on public.contacts;
create trigger contacts_link_lead after insert on public.contacts
  for each row execute function public.lead_link_contact();
comment on function public.lead_link_contact() is
  'A person the edge makes from a message or a call, whose number or address a lead holds, links that lead and converts it; the event that says where they came from reads "a lead you found". A signed-in caller''s insert never links.';

/* ----------------------------------------------------- 6. service RPCs -- */

create or replace function public.lead_run_claim(p_run_id uuid, p_owner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set claimed_by = p_owner, claimed_at = now(), state = 'starting'
   where id = p_run_id and claimed_by is null and state = 'claimed';
  return found;
end $$;
comment on function public.lead_run_claim(uuid, text) is
  'The dispatch claim (E1): the run row is taken by one owner token before any provider call; a second start finds it taken and does nothing. True once, for the claimer.';

create or replace function public.lead_run_record_start(p_run_id uuid, p_owner text, p_apify_run_id text, p_dataset_id text, p_cap_usd numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set apify_run_id = p_apify_run_id, dataset_id = p_dataset_id, cap_usd = p_cap_usd, state = 'running'
   where id = p_run_id and claimed_by = p_owner and state = 'starting';
  return found;
end $$;
comment on function public.lead_run_record_start(uuid, text, text, text, numeric) is
  'The claimer records the provider''s answer: the run id, its dataset and the cap it was started with. Only the claimer, only from starting.';

create or replace function public.lead_run_mark_unknown(p_run_id uuid, p_owner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set state = 'unknown'
   where id = p_run_id and claimed_by = p_owner and state = 'starting';
  return found;
end $$;
comment on function public.lead_run_mark_unknown(uuid, text) is
  'The start''s answer was lost: the run is unknown, reconciled by the sweep from the provider''s own list, never blindly started again (E1).';

create or replace function public.lead_run_reconcile(p_run_id uuid, p_apify_run_id text, p_dataset_id text, p_state text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('running', 'succeeded', 'failed', 'aborted', 'timed_out') then
    raise exception 'a reconciled run is running or finished (% refused)', p_state using errcode = '22023';
  end if;
  update public.lead_runs
     set apify_run_id = p_apify_run_id, dataset_id = p_dataset_id, state = p_state,
         finished_at = case when p_state = 'running' then null else coalesce(finished_at, now()) end
   where id = p_run_id and state = 'unknown';
  return found;
end $$;
comment on function public.lead_run_reconcile(uuid, text, text, text) is
  'The sweep found the unknown run in the provider''s list (ours carry the run row id in their input): record it and its state. Only from unknown.';

create or replace function public.lead_run_lease(p_run_id uuid, p_owner text, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gen integer;
begin
  update public.lead_runs
     set lease_owner = p_owner, lease_until = now() + make_interval(secs => p_seconds)
   where id = p_run_id and (lease_until is null or lease_until < now() or lease_owner = p_owner)
  returning lease_gen into v_gen;
  return v_gen;
end $$;
comment on function public.lead_run_lease(uuid, text, integer) is
  'Takes or renews the collect lease on a run: free, run out, or already this owner''s. Returns the generation the owner must present to commit; null when another owner holds it (E3).';

create or replace function public.lead_run_release(p_run_id uuid, p_owner text, p_gen integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set lease_owner = null, lease_until = null
   where id = p_run_id and lease_owner = p_owner and lease_gen = p_gen;
  return found;
end $$;
comment on function public.lead_run_release(uuid, text, integer) is
  'Releases a lease, conditional on the owner and the generation: an old collector cannot release a newer one''s (E3).';

create or replace function public.lead_round_end(p_round_id uuid, p_ending text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.lead_rounds;
begin
  if p_ending not in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused') then
    raise exception 'not one of the nine endings: %', p_ending using errcode = '22023';
  end if;
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or r.state = 'ended' then
    return false;
  end if;
  update public.lead_rounds
     set state = 'ended', ending = p_ending, ended_at = now(), waiting_since = null
   where id = p_round_id;
  perform public.lead_release(r.tenant_id, r.month, r.day, r.platform_day,
    greatest(r.allowance_reserved - r.allowance_used, 0), greatest(r.cost_reserved_usd - r.cost_usd, 0));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'lead.round', 'lead', 'lead_round', p_round_id,
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'ended', 'ending', p_ending,
                             'counted', r.allowance_used, 'cost_usd', r.cost_usd));
  return true;
end $$;
comment on function public.lead_round_end(uuid, text) is
  'Ends a round with one of the nine endings: state ended, ended_at, and what it reserved and did not use goes back to the counters. True once; false when already ended.';

-- One page of one run, as one transaction (E4): the lease and the offset are
-- checked first, then the judgment is kept by operation id, the places become
-- leads and members, Qualified members count against the round's reservation
-- up to what it reserved, the usage settles, the offset moves, the next job is
-- written once, the round moves, the events are appended.
create or replace function public.lead_collect_commit(p_run_id uuid, p_owner text, p_gen integer, p_from_offset integer, p_to_offset integer, p_page jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       public.lead_runs;
  v_round     public.lead_rounds;
  v_room      integer;
  v_counted   integer := 0;
  v_qualified integer := 0;
  v_review    integer := 0;
  v_excluded  integer := 0;
  v_month     text;
  v_usage     numeric;
  v_delta     numeric;
  v_n         integer;
  v_j         jsonb;
  v_el        jsonb;
  v_pl        jsonb;
  v_m         jsonb;
  v_dup       text;
  v_lead      uuid;
  v_class     text;
  v_next      jsonb;
  v_r         jsonb;
  v_state     text;
  v_counter   public.lead_counters;
begin
  -- One lock order everywhere: the ROUND first, then its runs, as
  -- lead_round_stop and lead_search_remove take them. So the run is read
  -- without a lock, only to learn which round it belongs to (a run never
  -- moves), and read again under lock once the round is held; a Stop arriving
  -- mid-page then waits instead of deadlocking (40P01). The lease and the
  -- offset are judged on the locked copy, so the compare-and-set still holds.
  select * into v_run from public.lead_runs where id = p_run_id;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  select * into v_round from public.lead_rounds where id = v_run.round_id for update;
  select * into v_run from public.lead_runs where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  if v_run.lease_owner is distinct from p_owner or v_run.lease_gen <> p_gen then
    return jsonb_build_object('ok', false, 'why', 'lease');
  end if;
  if v_run.read_offset <> p_from_offset then
    return jsonb_build_object('ok', false, 'why', 'offset');
  end if;
  if v_round.state = 'ended' then
    return jsonb_build_object('ok', false, 'why', 'ended');
  end if;
  v_month := v_round.month;
  v_room  := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);

  -- The judge's answers for the page's batches, kept once each by op_id.
  for v_j in select * from jsonb_array_elements(
      case jsonb_typeof(p_page->'judgment') when 'array' then p_page->'judgment'
           when 'object' then jsonb_build_array(p_page->'judgment') else '[]'::jsonb end) loop
    insert into public.lead_judgments (tenant_id, round_id, batch, op_id, request_hash, answer, model, tokens)
    values (v_round.tenant_id, v_round.id, coalesce((v_j->>'batch')::integer, 0), v_j->>'op_id', v_j->>'request_hash',
            coalesce(v_j->'answer', '{}'::jsonb), v_j->>'model', coalesce((v_j->>'tokens')::integer, 0))
    on conflict (op_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      update public.lead_rounds
         set judge_tokens = judge_tokens + coalesce((v_j->>'tokens')::integer, 0),
             judge_model  = coalesce(v_j->>'model', judge_model)
       where id = v_round.id;
    end if;
  end loop;

  -- The places: a lead by place id (once), a duplicate listing folded into
  -- the lead it belongs to, a membership (once), the count.
  for v_el in select * from jsonb_array_elements(coalesce(p_page->'places', '[]'::jsonb)) loop
    v_pl  := v_el->'place';
    v_m   := v_el->'member';
    v_dup := v_el->>'duplicate_of_place_id';
    if v_pl->>'place_id' is null then continue; end if;
    -- Never a place, number or address on the never-again list: a customer
    -- is hidden from every search, an erased person from everything (S8).
    if exists (select 1 from public.lead_suppressions s where s.tenant_id = v_round.tenant_id and (
           (s.kind = 'place' and s.what in ('customer', 'erased') and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'place_id'))
        or (s.kind = 'phone' and s.what = 'erased' and v_pl->>'phone_e164' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'phone_e164'))
        or (s.kind = 'email' and s.what = 'erased' and v_pl->>'email' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'email')))) then
      continue;
    end if;
    v_lead := null;
    if v_dup is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = v_round.tenant_id and l.blanked_at is null and l.erased_at is null
         and (l.place_id = v_dup or exists (select 1 from public.lead_places p where p.tenant_id = l.tenant_id and p.lead_id = l.id and p.place_id = v_dup))
       limit 1;
      if v_lead is not null then
        insert into public.lead_places (lead_id, tenant_id, place_id, title, street)
        values (v_lead, v_round.tenant_id, v_pl->>'place_id', left(v_pl->>'business_name', 200), left(v_pl->>'street', 200))
        on conflict (tenant_id, place_id) do nothing;
      end if;
    end if;
    if v_lead is null then
      insert into public.leads (tenant_id, place_id, business_name, category, street, city, region, postal_code, country, lat, lng,
                                website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer)
      on conflict (tenant_id, place_id) where place_id is not null do nothing;
      select l.id into v_lead from public.leads l where l.tenant_id = v_round.tenant_id and l.place_id = v_pl->>'place_id';
    end if;
    if v_lead is null then continue; end if;
    v_class := coalesce(v_m->>'class', 'review');
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, excluded_by, fit, reason, distance_m)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            coalesce(v_m->'judgment', '{}'::jsonb) || jsonb_build_object('shares', coalesce(v_el->'shares', '[]'::jsonb)),
            v_class, v_m->>'excluded_by', v_m->>'fit', coalesce(left(v_m->>'reason', 120), ''), (v_m->>'distance_m')::integer)
    on conflict (search_id, lead_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    if v_class = 'qualified' then
      v_qualified := v_qualified + 1;
      if v_room > 0 then
        update public.lead_search_members set counted = true, counted_month = v_month
         where search_id = v_round.search_id and lead_id = v_lead;
        v_room := v_room - 1;
        v_counted := v_counted + 1;
      end if;
    elsif v_class = 'review' then
      v_review := v_review + 1;
    else
      v_excluded := v_excluded + 1;
    end if;
  end loop;

  -- Delivery settles against the reservation (E2): the round's used grows,
  -- the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = v_round.id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;

  -- The run's usage so far, as the provider reports it; only what is new
  -- settles.
  v_usage := (p_page->>'usage_usd')::numeric;
  if v_usage is not null and v_usage > v_run.usage_usd then
    v_delta := v_usage - v_run.usage_usd;
    perform public.lead_settle_usage(v_round.tenant_id, v_month, v_round.day, v_round.platform_day, v_delta, v_round.cost_reserved_usd - v_round.cost_usd);
    update public.lead_rounds set cost_usd = cost_usd + v_delta where id = v_round.id;
    update public.lead_runs set usage_usd = v_usage where id = p_run_id;
  end if;

  -- The offset moves (compare-and-set held above), the run's state follows
  -- the provider's, and the next collect is written once.
  update public.lead_runs
     set read_offset = p_to_offset,
         items_seen  = coalesce((p_page->>'items_seen')::integer, items_seen),
         state       = coalesce(p_page->>'run_state', state),
         finished_at = case when coalesce(p_page->>'run_state', state) in ('succeeded', 'failed', 'aborted', 'timed_out') then coalesce(finished_at, now()) else finished_at end
   where id = p_run_id;
  v_next := p_page->'next';
  if v_next is not null and jsonb_typeof(v_next) = 'object' then
    if v_next->>'kind' = 'lead_check' then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_check', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'batch', coalesce((v_next->>'batch')::integer, 1)));
    else
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_collect', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('run_id', p_run_id, 'seq', coalesce(v_next->>'seq', 'p' || p_to_offset)))
      on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
    end if;
  end if;

  -- The round: a bigger target once the probe passed, the question, the
  -- pending ending, a state, or its ending (which releases and records).
  v_r := coalesce(p_page->'round', '{}'::jsonb);
  if v_r->>'target' is not null then
    update public.lead_rounds set target = greatest((v_r->>'target')::integer, target) where id = v_round.id;
  end if;
  if v_r->>'ending_pending' is not null then
    update public.lead_rounds set ending_pending = v_r->>'ending_pending' where id = v_round.id;
  end if;
  if v_r->'question' is not null and jsonb_typeof(v_r->'question') = 'object' then
    update public.lead_rounds set question = v_r->'question', waiting_since = now() where id = v_round.id;
  end if;
  if v_r->>'ending' is not null then
    perform public.lead_round_end(v_round.id, v_r->>'ending');
  elsif v_r->>'state' is not null and v_r->>'state' <> v_round.state then
    update public.lead_rounds
       set state = v_r->>'state', started_at = coalesce(started_at, now())
     where id = v_round.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_round.tenant_id, 'lead.round', 'lead', 'lead_round', v_round.id,
            jsonb_build_object('search_id', v_round.search_id, 'seq', v_round.seq, 'state', v_r->>'state'));
  end if;
  select state into v_state from public.lead_rounds where id = v_round.id;
  return jsonb_build_object('ok', true, 'counted', v_counted, 'qualified', v_qualified, 'review', v_review, 'excluded', v_excluded, 'round_state', v_state);
end $$;
comment on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) is
  'One page of one run, in one transaction (E4). Refuses {ok:false, why} on a stale lease, a wrong offset or an ended round. Keeps judgments by op_id, inserts leads (once per place id) and members (once per search), counts Qualified members up to the round''s reservation, settles usage, advances the offset, writes the next job once, moves the round, appends the events. Replayed with the same offset it does nothing twice; replayed after the offset moved it is refused.';

drop function if exists public.lead_check_commit(uuid, jsonb, numeric, boolean);
create or replace function public.lead_check_commit(p_round_id uuid, p_run_id uuid, p_results jsonb, p_usage_usd numeric, p_last boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   public.lead_rounds;
  v_r       jsonb;
  v_m       record;
  v_newly   integer := 0;
  v_counted integer := 0;
  v_room    integer;
  v_counter public.lead_counters;
  v_prev    numeric;
  v_delta   numeric;
  v_ended   boolean := false;
begin
  select * into v_round from public.lead_rounds where id = p_round_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'round');
  end if;
  v_room := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);
  for v_r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update public.leads
       set email_state = v_r->>'email_state', email_checked_at = coalesce((v_r->>'checked_at')::timestamptz, now())
     where id = (v_r->>'lead_id')::uuid and tenant_id = v_round.tenant_id
       and blanked_at is null and erased_at is null
       and (v_r->>'email_state') in ('ok', 'catch_all', 'unknown', 'invalid');
  end loop;
  -- A member the email standard alone held back, whose address now checks
  -- out, qualifies. It counts only through the round's reservation, the way
  -- lead_collect_commit counts a page's Qualified places: past the room the
  -- member is Qualified and uncounted, and no counter moves.
  for v_m in
    select m.search_id, m.lead_id, m.judgment
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.round_id = p_round_id and m.class = 'review' and m.blanked_at is null and l.email_state = 'ok'
       and jsonb_typeof(m.judgment->'reasons') = 'array'
       and jsonb_array_length(m.judgment->'reasons') > 0
       and not exists (select 1 from jsonb_array_elements_text(m.judgment->'reasons') x where x not like 'email:%')
  loop
    update public.lead_search_members
       set class = 'qualified', counted = (v_room > 0),
           counted_month = case when v_room > 0 then v_round.month else counted_month end,
           version = version + 1,
           judgment = judgment || jsonb_build_object('reasons', '[]'::jsonb)
     where search_id = v_m.search_id and lead_id = v_m.lead_id;
    v_newly := v_newly + 1;
    if v_room > 0 then
      v_room    := v_room - 1;
      v_counted := v_counted + 1;
    end if;
  end loop;
  -- Delivery settles inside the reservation, as lead_collect_commit's does:
  -- nothing counted past the room, so the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = p_round_id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_round.month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;
  -- The checker run's total so far, not this batch's delta: only what is new
  -- settles, so a check job tried again charges the batch once (E4, the rule
  -- lead_collect_commit takes). The run is locked after the round, never
  -- before it.
  if p_run_id is not null and coalesce(p_usage_usd, 0) > 0 then
    select r.usage_usd into v_prev from public.lead_runs r where r.id = p_run_id and r.round_id = p_round_id for update;
    if found and p_usage_usd > v_prev then
      v_delta := p_usage_usd - v_prev;
      perform public.lead_settle_usage(v_round.tenant_id, v_round.month, v_round.day, v_round.platform_day, v_delta, v_round.cost_reserved_usd - v_round.cost_usd);
      update public.lead_rounds set cost_usd = cost_usd + v_delta where id = p_round_id;
      update public.lead_runs set usage_usd = p_usage_usd where id = p_run_id;
    end if;
  end if;
  if p_last then
    select * into v_round from public.lead_rounds where id = p_round_id;
    v_ended := public.lead_round_end(p_round_id, coalesce(v_round.ending_pending,
      case when v_round.allowance_used >= v_round.target then 'target_reached' else 'searched_everything' end));
  end if;
  return jsonb_build_object('ok', true, 'qualified', v_newly, 'counted', v_counted, 'ended', v_ended);
end $$;
comment on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) is
  'A batch of mailbox answers ([{lead_id, email_state, checked_at}]) from the check run p_run_id: each lead''s state is set (never a blanked or erased one); a member of the round held in review by the email standard alone, now ok, qualifies, and counts only through the round''s reservation, the way lead_collect_commit counts a page (past the room the member is Qualified, counted stays false and no counter moves). p_usage_usd is that RUN''S TOTAL SO FAR, not this batch''s delta: only what is new settles, so a retried job charges once, and nothing settles without a check run of this round. The last batch ends the round with the ending the collect left pending.';

revoke execute on function public.lead_run_claim(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_run_record_start(uuid, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.lead_run_mark_unknown(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_run_reconcile(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.lead_run_lease(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.lead_run_release(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.lead_round_end(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) from public, anon, authenticated;
grant execute on function public.lead_run_claim(uuid, text), public.lead_run_record_start(uuid, text, text, text, numeric),
  public.lead_run_mark_unknown(uuid, text), public.lead_run_reconcile(uuid, text, text, text), public.lead_run_lease(uuid, text, integer),
  public.lead_run_release(uuid, text, integer), public.lead_round_end(uuid, text), public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb),
  public.lead_check_commit(uuid, uuid, jsonb, numeric, boolean) to service_role;

/* ------------------------------------------------------------- 7. doors -- */

-- The plan's shape, as the door checks it: the route checked it with
-- LeadSearchPlanSchema already, and a shape the door will store is the door's
-- to refuse (a caller's bug: raised, not a sentence).
create or replace function public.lead_plan_check(p_plan jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then raise exception 'plan: an object' using errcode = '22023'; end if;
  if p_plan->>'card' is null then raise exception 'plan.card' using errcode = '22023'; end if;
  if coalesce(char_length(p_plan->>'name'), 0) not between 2 and 80 then raise exception 'plan.name' using errcode = '22023'; end if;
  if coalesce(char_length(p_plan->>'asked'), 0) not between 1 and 400 then raise exception 'plan.asked' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'terms') <> 'array' or jsonb_array_length(p_plan->'terms') not between 1 and 5 then raise exception 'plan.terms' using errcode = '22023'; end if;
  -- The same phrase twice is a term asked for nothing, and it is the provider
  -- who is asked twice. Case does not make a second phrase.
  if (select count(distinct lower(btrim(t))) from jsonb_array_elements_text(p_plan->'terms') t) <> jsonb_array_length(p_plan->'terms') then
    raise exception 'plan.terms' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'area') <> 'object' or p_plan->'area'->>'label' is null
     or p_plan->'area'->>'kind' not in ('zip', 'city', 'radius')
     or (jsonb_typeof(p_plan->'area'->'center') <> 'null' and (p_plan->'area'->'center'->>'lat' is null or p_plan->'area'->'center'->>'lng' is null)) then
    raise exception 'plan.area' using errcode = '22023';
  end if;
  -- A radius is drawn around a point, so it brings one. A ZIP ask may still
  -- arrive without a centre: release A2 derives it from the ZCTA table, and a
  -- city may wait for its own. LeadSearchPlanSchema says exactly this, and the
  -- door is the floor: it is granted to authenticated, so a plan that reaches
  -- it without the route must be held to the same rule.
  if p_plan->'area'->>'kind' = 'radius' and coalesce(jsonb_typeof(p_plan->'area'->'center'), 'null') = 'null' then
    raise exception 'plan.area.center' using errcode = '22023';
  end if;
  -- A whole number of metres, between the smallest area worth a run and the
  -- largest the provider takes.
  if jsonb_typeof(p_plan->'area'->'radius_m') <> 'number' or p_plan->'area'->>'radius_m' !~ '^\d+$'
     or (p_plan->'area'->>'radius_m')::integer not between 500 and 200000 then
    raise exception 'plan.area.radius_m' using errcode = '22023';
  end if;
  -- A real state or DC: the fifty and one LeadSearchPlanSchema holds. Two
  -- capitals are not a place.
  if p_plan->'area'->>'state' not in (
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY') then
    raise exception 'plan.area.state' using errcode = '22023';
  end if;
  -- The words the provider is actually given for the area.
  if coalesce(char_length(btrim(p_plan->'area'->>'query')), 0) not between 2 and 120 then
    raise exception 'plan.area.query' using errcode = '22023';
  end if;
  -- A ZIP ask needs its ZIP: A2 derives the centre from it.
  if p_plan->'area'->>'kind' = 'zip' and coalesce(p_plan->'area'->>'zip', '') !~ '^\d{5}$' then
    raise exception 'plan.area.zip' using errcode = '22023';
  end if;
  if coalesce((p_plan->>'count')::integer, 0) not between 1 and 1000 then raise exception 'plan.count' using errcode = '22023'; end if;
  if p_plan->>'contact' not in ('phone', 'email') then raise exception 'plan.contact' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'criteria') <> 'array' or jsonb_array_length(p_plan->'criteria') > 8 then raise exception 'plan.criteria' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_plan->'criteria') loop
    if v->>'key' !~ '^[a-z][a-z0-9_]{0,39}$' or v->>'text' is null or v->>'standard' not in ('likely', 'seen') or jsonb_typeof(v->'required') <> 'boolean' then
      raise exception 'plan.criteria[]' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_plan->'exclusions') <> 'array' or jsonb_array_length(p_plan->'exclusions') > 8 then raise exception 'plan.exclusions' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_plan->'exclusions') loop
    if v->>'key' !~ '^[a-z][a-z0-9_]{0,39}$' or v->>'text' is null or v->>'origin' not in ('claude', 'you_said') then
      raise exception 'plan.exclusions[]' using errcode = '22023';
    end if;
  end loop;
  -- Every criterion and every exclusion has a key of its own, across both:
  -- the judge answers by key, so two of a name is one answer lost.
  if (select count(distinct x.k) from (
        select v2->>'key' as k from jsonb_array_elements(p_plan->'criteria') v2
        union all
        select v2->>'key' from jsonb_array_elements(p_plan->'exclusions') v2) x)
     <> jsonb_array_length(p_plan->'criteria') + jsonb_array_length(p_plan->'exclusions') then
    raise exception 'plan.criteria[].key' using errcode = '22023';
  end if;
end $$;
comment on function public.lead_plan_check(jsonb) is 'Raises 22023 naming the key when a plan is not the shape LeadSearchPlanSchema describes: the same rules, including at most five terms and no phrase twice, at most eight criteria and eight exclusions with a key each, a radius of 500 to 200000 metres with a centre to draw it around, a real state, the area''s query, and a ZIP for a ZIP ask. The door is granted to authenticated, so this is what a plan is held to when the route is stepped around.';
revoke execute on function public.lead_plan_check(jsonb) from public, anon, authenticated;

create or replace function public.lead_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_count  integer;
  v_month  text;
  v_day    text;
  v_pday   text;
  v_err    jsonb;
  v_search uuid;
  v_round  uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can find businesses for you.' using errcode = '42501';
  end if;
  if p_via not in ('people', 'ask') then
    raise exception 'via is people or ask' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
  end if;
  perform public.lead_plan_check(p_plan);
  if coalesce((p_plan->>'version')::integer, 0) <> 1 then
    raise exception 'a new search starts at plan version 1' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- An unapproved card never runs for an owner (28). The ask is logged as
  -- demand: the words, never a place.
  if p_plan->>'card' <> 'local_businesses' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.no_card', 'lead', 'lead_search', null,
            jsonb_build_object('card', left(p_plan->>'card', 40), 'asked', left(p_plan->>'asked', 400), 'by', v_user));
    return jsonb_build_object('error', 'no_card', 'sentence', 'I can find local businesses for now.');
  end if;

  v_month := public.lead_month(p_tenant_id, now());
  v_day   := public.lead_day(p_tenant_id, now());
  v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_err   := public.lead_reserve(p_tenant_id, v_month, v_day, v_pday, v_count, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;

  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, v_user, p_via, p_plan->>'card', left(p_plan->>'name', 120), p_plan->>'asked', p_plan)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'probe', p_plan, 1, least(25, v_count), 'queued', v_count, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'queued', 'purpose', 'probe', 'target', least(25, v_count), 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;
comment on function public.lead_search_create(uuid, jsonb, text, numeric) is
  'Owner. Checks the plan (version 1, the shape), the switch ({error: paused}), the card ({error: no_card}, logged as demand), then in one transaction reserves the count from the month''s allowance and the estimate from the budget and both day caps ({error: month_leads_used | budget_used | day_cap}, each with a sentence), inserts the search, its probe round (seq 1, target least(25, count)), the start job and the event. Returns {search_id, round_id}.';

create or replace function public.lead_round_answer(p_round_id uuid, p_answer text, p_plan jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  r       public.lead_rounds;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_answer not in ('keep', 'include', 'stop') then
    raise exception 'answer is keep, include or stop' using errcode = '22023';
  end if;
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or not public.has_permission(v_user, r.tenant_id, 'find') then
    raise exception 'Round not found.' using errcode = 'P0002';
  end if;
  if r.state <> 'waiting_on_owner' then
    return jsonb_build_object('error', 'state', 'state', r.state);
  end if;
  if p_answer = 'stop' then
    update public.lead_rounds set answered = 'stop' where id = p_round_id;
    perform public.lead_round_end(p_round_id, 'stopped');
    return jsonb_build_object('round_id', p_round_id, 'state', 'ended');
  end if;
  if p_answer = 'include' then
    if p_plan is null then
      raise exception 'include carries the amended plan' using errcode = '22023';
    end if;
    perform public.lead_plan_check(p_plan);
    if coalesce((p_plan->>'version')::integer, 0) <> r.plan_version + 1 then
      raise exception 'the amended plan is version %', r.plan_version + 1 using errcode = '22023';
    end if;
    update public.lead_searches set plan = p_plan where id = r.search_id;
    update public.lead_rounds set plan = p_plan, plan_version = r.plan_version + 1 where id = p_round_id;
  end if;
  update public.lead_rounds
     set state = 'running', answered = p_answer, waiting_since = null,
         target = greatest(target, (coalesce(p_plan, r.plan)->>'count')::integer)
   where id = p_round_id;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (r.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', p_round_id, 'resume', true));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'lead.round', 'lead', 'lead_round', p_round_id,
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'running', 'answered', p_answer, 'by', v_user));
  return jsonb_build_object('round_id', p_round_id, 'state', 'running');
end $$;
comment on function public.lead_round_answer(uuid, text, jsonb) is
  'Owner answers the question after 25 on a round waiting on them. keep: the round runs on (a resume job for the same round); include: the amended plan (version + 1) is stored on the search and the round, then as keep; stop: the round ends stopped. {error: state} when the round is not waiting.';

create or replace function public.lead_round_stop(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  s        public.lead_searches;
  r        public.lead_rounds;
  v_rounds integer := 0;
  v_runs   integer := 0;
  v_live   integer;
  run      record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.is_acting_member(s.tenant_id) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  for r in select * from public.lead_rounds where search_id = p_search_id and state <> 'ended' for update loop
    v_rounds := v_rounds + 1;
    v_live := 0;
    for run in select * from public.lead_runs where round_id = r.id and purpose = 'discover' and state in ('claimed', 'starting', 'running', 'unknown') for update loop
      -- The generation moves: a late worker's commit is refused (E3).
      update public.lead_runs set lease_gen = lease_gen + 1 where id = run.id;
      if run.state = 'running' then
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (r.tenant_id, 'lead_collect', now(), jsonb_build_object('run_id', run.id, 'seq', 'stop'))
        on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
        v_live := v_live + 1;
      end if;
      v_runs := v_runs + 1;
    end loop;
    update public.lead_rounds set ending_pending = 'stopped' where id = r.id;
    -- Nothing running on the provider, and no emails being checked: the round
    -- ends now. Otherwise the collect that aborts the run, or the last check
    -- batch, ends it stopped (17: the emails of leads found are still checked).
    if v_live = 0 and r.state <> 'checking' then
      perform public.lead_round_end(r.id, 'stopped');
    end if;
  end loop;
  return jsonb_build_object('rounds', v_rounds, 'runs', v_runs);
end $$;
comment on function public.lead_round_stop(uuid) is
  'Operator. For every live round of the search: bumps the lease generation of its live runs, schedules a stop collect for each running discover run, records the ending as pending stopped; a round with nothing running and no checks out ends stopped at once. The strip says "Stopping · checking the emails" while the rest finish.';

create or replace function public.lead_search_more(p_search_id uuid, p_purpose text, p_plan jsonb, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  last      public.lead_rounds;
  v_count   integer;
  v_counted integer;
  v_target  integer;
  v_version integer;
  v_month   text;
  v_day     text;
  v_pday    text;
  v_err     jsonb;
  v_round   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_purpose not in ('topup', 'renew') then
    raise exception 'purpose is topup or renew' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  perform public.lead_plan_check(p_plan);
  select * into last from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if last.state <> 'ended' then
    return jsonb_build_object('error', 'live', 'state', last.state);
  end if;
  v_version := coalesce((p_plan->>'version')::integer, 0);
  if v_version not in ((s.plan->>'version')::integer, (s.plan->>'version')::integer + 1) then
    raise exception 'the plan is the current version or the next' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;
  if p_purpose = 'topup' then
    select count(*) into v_counted from public.lead_search_members m where m.search_id = p_search_id and m.counted;
    v_target := v_count - v_counted;
    if v_target <= 0 then
      return jsonb_build_object('error', 'nothing_to_add', 'counted', v_counted);
    end if;
  else
    v_target := v_count;
  end if;
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  v_month := public.lead_month(s.tenant_id, now());
  v_day   := public.lead_day(s.tenant_id, now());
  v_pday  := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_err   := public.lead_reserve(s.tenant_id, v_month, v_day, v_pday, v_target, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;
  if v_version <> (s.plan->>'version')::integer then
    update public.lead_searches set plan = p_plan where id = p_search_id;
  end if;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day, platform_day)
  values (s.tenant_id, p_search_id, last.seq + 1, p_purpose, p_plan, v_version, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day, v_pday)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', p_purpose, 'target', v_target, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target);
end $$;
comment on function public.lead_search_more(uuid, text, jsonb, numeric) is
  'Owner. A new round on an ended search: topup reserves the count minus what already counted, renew the whole count, through the same reservation as create; the plan is the current version or the next (stored on the search). {error: live} while a round is open; {error: nothing_to_add} when the count is already met.';

-- The three member doors share one body: the state they expect, what they
-- write, and the operation record Undo reads.
create or replace function public.lead_member_move(p_search_id uuid, p_lead_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  m         public.lead_search_members;
  l         public.leads;
  v_month   text;
  v_counter public.lead_counters;
  v_before  jsonb;
  v_after   jsonb;
  v_op      uuid;
  v_counts  boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  -- A removed search charges nobody: Keep and Put back each spend a lead of
  -- the month's allowance, and its members are blanked. lead_search_more says
  -- the same word.
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  select * into m from public.lead_search_members where search_id = p_search_id and lead_id = p_lead_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into l from public.leads where id = p_lead_id;
  if m.blanked_at is not null or l.blanked_at is not null or l.erased_at is not null then
    return jsonb_build_object('error', 'hidden');
  end if;
  v_before := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);

  if p_kind = 'exclude' then
    if m.class <> 'review' then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    update public.lead_search_members
       set class = 'excluded', excluded_by = 'owner', kept_at = null, kept_by = null, version = version + 1
     where id = m.id
    returning * into m;
  else
    if p_kind = 'put_back' then
      if m.class <> 'excluded' then
        return jsonb_build_object('error', 'state', 'class', m.class);
      end if;
      -- Neither Put back nor Keep revives a suppression or an out-of-area place (§0.1).
      if l.place_id is null or exists (select 1 from public.lead_suppressions x where x.tenant_id = s.tenant_id and x.kind = 'place'
                    and x.what in ('customer', 'erased') and x.hash = public.lead_suppression_hash(s.tenant_id, l.place_id)) then
        return jsonb_build_object('error', 'hidden');
      end if;
      if m.judgment->'reasons' ? 'out_of_area' then
        return jsonb_build_object('error', 'out_of_area');
      end if;
    elsif not (m.class = 'review' or (m.class = 'qualified' and not m.counted)) then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    -- Keep and Put back count, through the month's allowance (§0.2).
    if not m.counted then
      v_month := public.lead_month(s.tenant_id, now());
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', v_month);
      if v_counter.used + v_counter.reserved + 1 > 500 then
        return jsonb_build_object('error', 'month_leads_used', 'left', 0,
          'sentence', 'You have found this month''s 500 leads. Your leads renew on ' || public.lead_renews_on(s.tenant_id) || '.');
      end if;
      update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
      v_counts := true;
    end if;
    update public.lead_search_members
       set class = 'qualified', excluded_by = null,
           counted = true, counted_month = coalesce(counted_month, v_month),
           kept_at = now(), kept_by = v_user, version = version + 1
     where id = m.id
    returning * into m;
  end if;

  v_after := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, p_kind, p_search_id, array[p_lead_id], v_before, v_after, m.version, v_user)
  returning id into v_op;
  return jsonb_build_object('op_id', v_op, 'version', m.version, 'counted', v_counts);
end $$;
comment on function public.lead_member_move(uuid, uuid, text) is
  'The body of lead_member_keep, lead_member_exclude and lead_member_put_back: the state each expects, the change, the allowance when it counts, and one lead_operations row with the member''s new version. {error: removed} on a search that was removed, as lead_search_more says it.';
revoke execute on function public.lead_member_move(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.lead_member_keep(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'keep') $$;
comment on function public.lead_member_keep(uuid, uuid) is
  'Owner (permission find). A member in review, or qualified and not yet counted, is kept: Qualified, counted this month through the allowance ({error: month_leads_used} when none is left). Returns {op_id, version}.';

create or replace function public.lead_member_exclude(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'exclude') $$;
comment on function public.lead_member_exclude(uuid, uuid) is
  'Owner (permission find). A member in review is excluded by the owner; free. Returns {op_id, version}.';

create or replace function public.lead_member_put_back(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'put_back') $$;
comment on function public.lead_member_put_back(uuid, uuid) is
  'Owner (permission find). An excluded member goes back through keep''s path and counts; refused for a hidden place ({error: hidden}: a customer or an erasure) and for one outside the area ({error: out_of_area}). Returns {op_id, version}.';

create or replace function public.lead_undo(p_op_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found or not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'undo_search' then
    -- The search comes back with the memberships its removal blanked, except
    -- a lead exported or copied since: those are kept as they are and stay
    -- charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    update public.lead_search_members m2
       set blanked_at = null, version = version + 1
      from public.leads l
     where m2.search_id = op.search_id and m2.lead_id = l.id and m2.lead_id = any (op.lead_ids)
       and l.exported_at is null and l.blanked_at is null and l.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;
comment on function public.lead_undo(uuid, integer) is
  'Owner. Undoes one operation by its id and the version the client saw: {error: changed} when the operation or any touched member moved since; restores `before`; returns a counted lead to the allowance of the month it counted in, never the budget; a removed search comes back without the leads exported since.';

create or replace function public.lead_search_rename(p_search_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s      public.lead_searches;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'A name is 1 to 120 characters.' using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.is_acting_member(s.tenant_id) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  update public.lead_searches set name = v_name where id = p_search_id;
  return jsonb_build_object('search_id', p_search_id, 'name', v_name);
end $$;
comment on function public.lead_search_rename(uuid, text) is 'Operator. Renames a search; the plan and the rounds are untouched.';

create or replace function public.lead_search_remove(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  s       public.lead_searches;
  r       public.lead_rounds;
  run     record;
  v_ids   uuid[];
  v_op    uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  for r in select * from public.lead_rounds where search_id = p_search_id and state <> 'ended' for update loop
    for run in select * from public.lead_runs where round_id = r.id and state in ('claimed', 'starting', 'running', 'unknown') for update loop
      update public.lead_runs set lease_gen = lease_gen + 1 where id = run.id;
      if run.state = 'running' then
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (r.tenant_id, 'lead_collect', now(), jsonb_build_object('run_id', run.id, 'seq', 'stop'))
        on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
      end if;
    end loop;
    perform public.lead_round_end(r.id, 'stopped');
  end loop;
  -- Members whose lead is being worked (contacted, or a person now) stay;
  -- the rest of the memberships are blanked, and the operation remembers
  -- which, so Undo can bring them back.
  select coalesce(array_agg(m.lead_id), '{}') into v_ids
    from public.lead_search_members m join public.leads l on l.id = m.lead_id
   where m.search_id = p_search_id and m.blanked_at is null and l.stage not in ('nurture', 'converted');
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where search_id = p_search_id and lead_id = any (v_ids);
  update public.lead_searches set removed_at = now() where id = p_search_id;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'undo_search', p_search_id, v_ids, jsonb_build_object('removed_at', null), jsonb_build_object('removed_at', now()), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('op_id', v_op, 'version', 1, 'blanked', coalesce(array_length(v_ids, 1), 0));
end $$;
comment on function public.lead_search_remove(uuid) is
  'Owner. Removes a search: live rounds end stopped (their running runs get a stop collect), memberships of leads not being worked are blanked, the rest stay, and one undo_search operation records which. Returns {op_id, version}.';

revoke execute on function public.lead_search_create(uuid, jsonb, text, numeric) from public, anon;
revoke execute on function public.lead_round_answer(uuid, text, jsonb) from public, anon;
revoke execute on function public.lead_round_stop(uuid) from public, anon;
revoke execute on function public.lead_search_more(uuid, text, jsonb, numeric) from public, anon;
revoke execute on function public.lead_member_keep(uuid, uuid) from public, anon;
revoke execute on function public.lead_member_exclude(uuid, uuid) from public, anon;
revoke execute on function public.lead_member_put_back(uuid, uuid) from public, anon;
revoke execute on function public.lead_undo(uuid, integer) from public, anon;
revoke execute on function public.lead_search_rename(uuid, text) from public, anon;
revoke execute on function public.lead_search_remove(uuid) from public, anon;
grant execute on function public.lead_search_create(uuid, jsonb, text, numeric), public.lead_round_answer(uuid, text, jsonb),
  public.lead_round_stop(uuid), public.lead_search_more(uuid, text, jsonb, numeric), public.lead_member_keep(uuid, uuid),
  public.lead_member_exclude(uuid, uuid), public.lead_member_put_back(uuid, uuid), public.lead_undo(uuid, integer),
  public.lead_search_rename(uuid, text), public.lead_search_remove(uuid) to authenticated;

/* ------------------------------------------------------------- 8. reads -- */

-- The search with its latest round and its counts, under the reader's own
-- row security (security_invoker): a member sees their workspace's searches
-- and nothing else.
create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.question, r.answered, r.target, r.plan_version, r.judge_tokens, r.cost_usd,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded, coalesce(c.counted, 0) as counted
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.question, r.answered, r.target, r.plan_version, r.judge_tokens, r.cost_usd
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted
      from public.lead_search_members m where m.search_id = s.id
  ) c on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, question, answered, target, plan_version, judge_tokens, and cost_usd: what that round has spent, so cost per Qualified lead is read from here) and its counts over the members (qualified, review, excluded, counted). Excluded members stay counted after their details are blanked, so "40 left out" stays 40.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

-- One page of a search's members joined to their leads, keyset-paged on the
-- sort key: found (newest first), fit (strong, look, long, then newest) or
-- distance (nearest first). The key carries the id: "<k>|<id>".
create or replace function public.leads_page(p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified', p_sort text default 'found', p_after_key text default null, p_limit integer default 200)
returns table (
  member_id uuid, lead_id uuid, place_id text, search_id uuid, round_id uuid, class text, excluded_by text, fit text, reason text, distance_m integer,
  counted boolean, counted_month text, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision, lng double precision,
  website_host text, instagram_url text, phone_e164 text, phone_sources smallint, phone_wrong boolean, email text, email_state text,
  email_checked_at timestamptz, rating numeric, reviews integer, stage text, closed_reason text, contact_id uuid, found_at timestamptz,
  sort_key text
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select m.id as member_id, m.lead_id, l.place_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.contact_id, l.found_at,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.place_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.contact_id, b.found_at,
         b.k || '|' || b.member_id::text as sort_key
    from base b
   where p_after_key is null
      or (b.k, b.member_id::text) > (split_part(p_after_key, '|', 1), split_part(p_after_key, '|', 2))
   order by b.k, b.member_id::text
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;
comment on function public.leads_page(uuid, uuid, text, text, text, integer) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, each row carrying its lead''s place_id (the source''s own id for the place, which is how a labelled set names one), keyset-paged on sort_key (found newest first, fit best first, distance nearest first), under the caller''s row security. Pass the last row''s sort_key as p_after_key for the next page.';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer) to authenticated, service_role;

/* --------------------------------------------------------- 9. realtime -- */

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_rounds') then
    alter publication supabase_realtime add table public.lead_rounds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_search_members') then
    alter publication supabase_realtime add table public.lead_search_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

/* ----------------------------------------------- 10. the sweep's clock -- */

-- Every five minutes the clock looks for lead work the pipeline could have
-- left behind (a running run with no collect, one past its time, an unknown
-- start, a question unanswered for a day, a stale lease) and asks the edge
-- only when there is some, recording that it looked otherwise, the way the
-- ledger's heartbeat does (00098). Before A2 deploys the handler no round
-- exists, so the edge is never asked and nothing pages.
create or replace function public.trigger_leads_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Any round that has not ended, not only one waiting or checking: a round
  -- whose lead_round_start job died before it wrote a run sits in 'queued'
  -- with no run at all, and nothing but the sweep can end it and give its
  -- allowance and budget back (lead_rounds_live serves this predicate).
  if exists (select 1 from public.lead_runs r where r.state in ('claimed', 'starting', 'running', 'unknown'))
     or exists (select 1 from public.lead_rounds r where r.state <> 'ended') then
    return public.request_sweep('leads', '/api/cron/leads');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('leads', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_leads_sweep() from public, anon, authenticated;
comment on function public.trigger_leads_sweep() is
  'The lead finder''s clock. Calls the edge (/api/cron/leads) only when a run is live or a round has not ended -- a round whose start job died sits queued with no run, and its reservation comes back only when something ends it; otherwise records that it looked, so sweep_health() can tell a quiet engine from a stopped clock.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every five minutes, recording itself each time: fifteen minutes is three
  -- missed ticks. Seeded with a look so the first health run finds a row.
  ('leads',       'leads-sweep', interval '15 minutes', 'request', now()),
  -- the nightly purge, judged on its runs like the other purges (00107).
  ('purge_leads', 'purge-leads', interval '26 hours',   'run',     null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('leads-sweep') where exists (select 1 from cron.job where jobname = 'leads-sweep');
select cron.schedule('leads-sweep', '*/5 * * * *', $$select public.trigger_leads_sweep()$$);

/* ----------------------------------------------------- 11. retention -- */

create or replace function public.purge_leads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n     integer;
  r       record;
begin
  -- Untouched for 90 days: no person, no contact, no export. Set aside.
  update public.leads
     set stage = 'archived', closed_reason = 'stale'
   where stage = 'ready' and contact_id is null and contacted_at is null and exported_at is null
     and found_at < now() - interval '90 days' and erased_at is null and blanked_at is null;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  -- Set aside for 180 days since it was found: its details go.
  for r in select l.id from public.leads l
            where l.closed_reason = 'stale' and l.blanked_at is null and l.erased_at is null and l.found_at < now() - interval '180 days'
  loop
    v_total := v_total + public.lead_blank(r.id);
  end loop;
  -- A place a search left out, 30 days on: the membership's details go and
  -- the lead's with them when nothing else holds it; the membership stays,
  -- excluded, so the count of what was left out does not move.
  for r in select distinct m.lead_id from public.lead_search_members m
            where m.class = 'excluded' and m.blanked_at is null and m.created_at < now() - interval '30 days'
  loop
    if not exists (select 1 from public.lead_search_members m2 where m2.lead_id = r.lead_id and m2.class <> 'excluded' and m2.blanked_at is null)
       and not exists (select 1 from public.leads l where l.id = r.lead_id and (l.contact_id is not null or l.contacted_at is not null or l.exported_at is not null)) then
      v_total := v_total + public.lead_blank(r.lead_id);
    else
      update public.lead_search_members set judgment = '{}'::jsonb, reason = '', blanked_at = now()
       where lead_id = r.lead_id and class = 'excluded' and blanked_at is null;
    end if;
  end loop;
  -- The judge's answers outlive nothing they judged.
  delete from public.lead_judgments where created_at < now() - interval '180 days';
  return v_total;
end $$;
revoke execute on function public.purge_leads() from public, anon, authenticated;
comment on function public.purge_leads() is
  'Nightly. A lead untouched for 90 days is set aside (archived, stale); set aside and 180 days since it was found, its details are removed (lead_blank); a place a search left out loses its details after 30 days but stays counted as left out. Judgments older than 180 days go. Numbers: contracts'' RETENTION_DAYS.';

select cron.unschedule('purge-leads') where exists (select 1 from cron.job where jobname = 'purge-leads');
select cron.schedule('purge-leads', '47 4 * * *', $$select public.purge_leads()$$);
