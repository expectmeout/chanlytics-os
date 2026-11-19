-- 00648 · A business's ads are kept (decision 0049, step P1; the Ads build plan's step 2, part 2: the records).
--
-- Until now Chanlytics heard of an ad once, when someone tapped it and wrote (ad_entries, 00644). It held no ad account,
-- no ad and no day of spend, so a page could name the ad a person came through and nothing else about it. This is the
-- ground under Connect and under reading an owner's ads: three tables and the three functions that keep a token.
-- Nothing reads or writes them before the code of the parts that follow, each with its own doors.
--
--   ad_accounts   The owner's own account on one platform, connected once: the platform and its id for the account,
--                 its name, currency and time zone, where the connection stands (to be chosen, connected, access taken
--                 back by the platform, disconnected by the owner), what the platform says the account stands on,
--                 the platform's own ids beside it (the Page the ads run as among them), who connected it and when,
--                 and how its last read went. Its token is never on the row, and no column says where it is kept.
--   ads           An ad as its owner thinks of it: its account, whether Chanlytics or the owner made it, its name, what
--                 a tap on it opens, the platform's own ids, the budget it sits under and whether it shares it, when it
--                 starts and ends, and three words side by side, never folded into one: where Chanlytics is with making
--                 it, what the owner last asked of it, and the platform's own word, as the platform gave it. The badge a
--                 page says is read from the three in one place (contracts adStateOf, 0049 call 1) and is kept nowhere.
--   ad_days       The platform's day for one ad, in the account's own zone: spend, impressions, clicks and the
--                 platform's own count of what the ad asks for. The platform's half only: the people an ad brought and
--                 who booked are worked out from contacts and the visits record at each read (0049, call 3).
--
--   ad_credentials_put / _get / _drop   An ad account's token in Vault, under ad-creds-<account id>: the only way in,
--                 the service role's alone. They write no table. Which secret is an account's follows from the
--                 account's own id, so the row carries no pointer a member could read (0049 drew a credentials_ref
--                 column and a column grant to hide it; with no column there is nothing to hide, and the token has one
--                 writer that is not also a writer of the account).
--
-- Money is whole minor units of the account's currency, as ISO 4217 divides it, and the currency is the account's alone:
-- an amount is never converted and never added across accounts (0049, call 9). A platform that counts its own units
-- another way (Meta counts some currencies in whole units) is converted where its wire is read, and nowhere else.
--
-- Whose rows. Each table is a workspace's: members read their own workspace's rows, and nothing of a session writes.
-- Every write is a door's, with its event, arriving with the part that needs it. The house fence (00279) holds: an ad
-- names its account with its workspace and its platform, so the two can never differ, and a day names its ad with its
-- workspace. A workspace holds one live account a platform, and a platform's account is held by one workspace at a
-- time: the second to claim one is refused, as a WhatsApp number is.
--
-- An entry (00644) and an ad are joined by what they both hold, the platform and its own id for the ad, wherever one
-- is read: ad_entries.ad_id stays unwritten, so an entry keeps its one writer.
--
-- Additive. Deploy order: either (no app code names these before the parts that follow). Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------- 1. the ad account -- */

create table if not exists public.ad_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  platform        text not null check (platform in ('meta', 'google', 'tiktok')),
  -- The platform's own id for the account, bare (Meta's without its act_ prefix). Null only while it is to be chosen.
  external_id     text check (char_length(external_id) between 1 and 200),
  name            text check (char_length(name) between 1 and 500),
  -- ISO 4217, as the platform names it. Money on this account's ads and days is in its minor units.
  currency        text check (currency ~ '^[A-Z]{3}$'),
  -- IANA, as the platform names it: an ad's day of spend is a day in this zone.
  timezone        text check (char_length(timezone) between 1 and 100),
  status          text not null check (status in ('choosing', 'connected', 'revoked', 'disconnected')),
  -- What the platform says the account stands on, in typed words only (never a platform's sentence): one key a thing
  -- it can stand on. Empty until the first read.
  standing        jsonb not null default '{}'::jsonb check (jsonb_typeof(standing) = 'object'),
  -- The platform's own ids and facts beside the account, one shape a platform (contracts reads it): for Meta the
  -- business, the Page the ads run as, the number that Page is linked to, and the account's own spending limit.
  config          jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  -- When its token runs out, where the platform says it does. Null for one that does not.
  token_expires_at timestamptz,
  connected_by    uuid,
  connected_at    timestamptz,
  -- When the platform took access back, and when the owner disconnected: the page says each with its date.
  revoked_at      timestamptz,
  disconnected_at timestamptz,
  -- When the platform confirmed that access is withdrawn there. Until then no page says it is.
  withdrawn_at    timestamptz,
  read_at         timestamptz,
  -- How the last read went wrong, in Chanlytics' own words (never a platform's text); cleared by the next good read.
  read_error      text check (read_error is null or char_length(read_error) <= 300),
  -- The platform's pace: the share of its limit this account's calls had used when last told, when that was, and the
  -- moment before which the platform is not asked again.
  usage_pct       numeric(5, 2) check (usage_pct >= 0),
  usage_at        timestamptz,
  read_after      timestamptz,
  -- When the platform was last asked to send notices of this account's changes; null where it is not.
  notices_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Only an account still to be chosen names none.
  constraint ad_accounts_named_once_chosen check (status = 'choosing' or external_id is not null),
  -- The house fence (00279): a row that names one of this table's rows names it with its workspace. An ad names its
  -- platform too, so an ad and its account can never be of two platforms.
  constraint ad_accounts_tenant_id_id unique (tenant_id, id),
  constraint ad_accounts_tenant_id_id_platform unique (tenant_id, id, platform)
);

-- One row an account in a workspace: connecting it again finds its row, with its ads.
create unique index if not exists ad_accounts_one_a_workspace
  on public.ad_accounts (tenant_id, platform, external_id);
-- One live account a platform in a workspace (0049: one account per platform per workspace in the first version).
create unique index if not exists ad_accounts_one_live
  on public.ad_accounts (tenant_id, platform) where status <> 'disconnected';
-- A platform's account is held by one workspace at a time: a second to claim it is refused (ad_account_taken).
create unique index if not exists ad_accounts_held_once
  on public.ad_accounts (platform, external_id) where status in ('connected', 'revoked');

drop trigger if exists ad_accounts_set_updated_at on public.ad_accounts;
create trigger ad_accounts_set_updated_at
  before update on public.ad_accounts
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ad_accounts enable row level security;
drop policy if exists ad_accounts_member_select on public.ad_accounts;
create policy ad_accounts_member_select on public.ad_accounts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- Members read; nothing of a session writes. Every right is taken from a visitor and a member first, so the one
-- given back is all they hold, whatever a database grants by default.
revoke all on public.ad_accounts from anon, authenticated;
grant select on public.ad_accounts to authenticated;
grant all on public.ad_accounts to service_role;

comment on table public.ad_accounts is
  'The owner''s own ad account on one platform, connected once (decision 0049, 00648): the platform and its id for the account, its name, currency (ISO 4217) and time zone (IANA), where the connection stands, what the platform says the account stands on, the platform''s own ids beside it, who connected it and when, and how its last read went. Its token is a Vault secret, ad-creds-<id>, reached only through ad_credentials_put, _get and _drop: no column holds it or says where it is. One live account a platform in a workspace, and a platform''s account is held by one workspace at a time. Members read; every write is a door''s.';
comment on column public.ad_accounts.status is
  'choosing: signed in, and two accounts could both be the one, so the owner is asked. connected: read, and its ads can be paused. revoked: the platform took access back (revoked_at); the last numbers stay, and nothing is read or changed until it is connected again. disconnected: the owner disconnected it (disconnected_at); its ads stay as they last were.';
comment on column public.ad_accounts.standing is
  'What the platform says the account stands on, in typed words only: for Meta, account (active, disabled, unsettled, review, grace, closing, closed) and funding (ok, none). Empty until the first read. A check a page draws is read from this and from config in one place (contracts).';
comment on column public.ad_accounts.config is
  'The platform''s own ids and facts beside the account, one shape a platform, read by contracts: for Meta the business portfolio, the Page the ads run as and its name, the WhatsApp number and the Instagram account that Page is linked to, the account''s own spending limit and its least daily amount, the accounts to choose from while one is to be chosen, and what its token was granted. Never a token.';
comment on column public.ad_accounts.withdrawn_at is
  'When the platform confirmed that Chanlytics'' access is withdrawn there, after a disconnect. Null until it does: until then a page says where the owner can remove Chanlytics themselves, and never that access is withdrawn.';
comment on column public.ad_accounts.read_after is
  'The moment before which the platform is not asked about this account again: its own word of when a slowed caller may return, or what its usage figures leave. Null where nothing holds a read back.';

/* ------------------------------------------------------------------------------------------------------ 2. the ad -- */

create table if not exists public.ads (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  account_id           uuid not null,
  platform             text not null check (platform in ('meta', 'google', 'tiktok')),
  -- chanlytics: made here, on the owner's press. platform: found in the owner's account, read and never changed
  -- here, but for Pause and Resume (0049, call 10).
  origin               text not null check (origin in ('chanlytics', 'platform')),
  name                 text not null check (char_length(name) between 1 and 500),
  -- What a tap on it opens. Someone an ad brings is counted only where the tap ends in a message Chanlytics receives.
  door                 text not null
                         check (door in ('whatsapp', 'instagram', 'messenger', 'call', 'form', 'website', 'other')),
  -- The platform's own ids: the ad, the part above it that says who sees it, and the campaign above that. Null until
  -- the platform has made each.
  platform_ad_id       text check (char_length(platform_ad_id) between 1 and 200),
  platform_set_id      text check (char_length(platform_set_id) between 1 and 200),
  platform_campaign_id text check (char_length(platform_campaign_id) between 1 and 200),
  -- The budget it sits under, as the platform holds it: a total for the whole run or an amount a day, where it is
  -- held, what is left of a total, and whether other ads spend from the same budget (then "what is left" is not this
  -- ad's alone, and it is never turned back on from here).
  budget_kind          text check (budget_kind in ('total', 'daily')),
  budget_minor         bigint check (budget_minor >= 0),
  budget_left_minor    bigint check (budget_left_minor >= 0),
  budget_at            text check (budget_at in ('campaign', 'set')),
  budget_shared        boolean,
  starts_at            timestamptz,
  ends_at              timestamptz,
  -- Three words, side by side. Where Chanlytics is with making it; what the owner last asked of it; and the
  -- platform's own word for it, kept as the platform gave it (null until the platform has been read).
  status               text not null check (status in ('draft', 'sending', 'failed', 'made')),
  intent               text not null check (intent in ('on', 'paused', 'ended')),
  platform_state       text check (char_length(platform_state) between 1 and 100),
  -- Why the platform will not run it, in the platform's own words, verbatim: shown to the owner in quotes.
  platform_issue       text check (char_length(platform_issue) between 1 and 2000),
  -- What the ad says where it shows, as the platform holds it: headline, body, media_type and link, each present only
  -- where the platform said it soundly (the shape an entry keeps, contracts AdSaid).
  said                 jsonb check (said is null or jsonb_typeof(said) = 'object'),
  -- Bumped by every change of the owner's. A press carries the version it was drawn from, and a stale one is refused.
  version              integer not null default 1 check (version > 0),
  -- When the owner last asked something of it, and when the platform was last told. An ask newer than the telling is
  -- on its way: the platform takes one change to an ad every thirty seconds.
  intent_at            timestamptz,
  told_at              timestamptz,
  -- When the platform last listed it.
  read_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- An ad the platform holds names its id there; only one Chanlytics is still making names none.
  constraint ads_made_names_its_platform_id check (status <> 'made' or platform_ad_id is not null),
  -- A budget is said whole: its kind with its amount.
  constraint ads_budget_is_whole check ((budget_kind is null) = (budget_minor is null)),
  constraint ads_tenant_id_id unique (tenant_id, id),
  constraint ads_account_id_same_workspace
    foreign key (tenant_id, account_id, platform)
    references public.ad_accounts (tenant_id, id, platform) on delete cascade
);

-- One row an ad at its platform, in a workspace: a read written twice is one row, and a first touch finds its ad.
create unique index if not exists ads_one_at_its_platform on public.ads (tenant_id, platform, platform_ad_id);
-- An account's ads: the page's list, and a read's own.
create index if not exists ads_account on public.ads (tenant_id, account_id);

drop trigger if exists ads_set_updated_at on public.ads;
create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ads enable row level security;
drop policy if exists ads_member_select on public.ads;
create policy ads_member_select on public.ads
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ads from anon, authenticated;
grant select on public.ads to authenticated;
grant all on public.ads to service_role;

comment on table public.ads is
  'An ad as its owner thinks of it (decision 0049, 00648): its account and platform, whether Chanlytics made it or the owner did on the platform itself, its name, what a tap on it opens, the platform''s own ids, the budget it sits under, when it starts and ends, what it says, and three words side by side: where Chanlytics is with making it (status), what the owner last asked of it (intent) and the platform''s own word (platform_state). The badge a page says is read from the three by contracts adStateOf and kept nowhere. Money is whole minor units of its account''s currency. Members read; every write is a door''s.';
comment on column public.ads.origin is
  'chanlytics: made here, on the owner''s press. platform: found in the owner''s account and adopted (0049, call 10): drawn, counted, and open to Pause alone, and to Resume only where its budget is a total with an end date that it has to itself (0050, call 9).';
comment on column public.ads.door is
  'What a tap on the ad opens: a WhatsApp chat, an Instagram chat, a Messenger chat, a call, a form, a website, or something else. People are counted for an ad only where the tap ends in a message Chanlytics receives; for the others the page shows the platform''s spend and says that its people are not counted.';
comment on column public.ads.budget_shared is
  'Whether other ads spend from the budget this ad sits under (a campaign''s budget over several ads, or one the platform lets its parts pass between them). True means what is left is not this ad''s alone. Null where the platform has not been read.';
comment on column public.ads.platform_state is
  'The platform''s own word for the ad, kept as the platform gave it (Meta''s effective_status: ACTIVE, PAUSED, PENDING_REVIEW, DISAPPROVED and the rest). Read into Chanlytics'' words by contracts adStateOf: a word it does not know is never read as running.';
comment on column public.ads.intent_at is
  'When the owner last asked something of the ad here (a pause, a resume). Later than told_at means the platform has not been told yet: it is told when it will take the change, and the page says so until then.';

/* ---------------------------------------------------------------------------------------------- 3. an ad's days -- */

create table if not exists public.ad_days (
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  ad_id            uuid not null,
  -- A day in the account's own zone, as the platform counts it.
  day              date not null,
  spend_minor      bigint not null default 0 check (spend_minor >= 0),
  impressions      bigint not null default 0 check (impressions >= 0),
  clicks           bigint not null default 0 check (clicks >= 0),
  -- The platform's own count of what the ad asks for (the chats Meta says it started). Theirs, labelled as theirs:
  -- never added to Chanlytics' count of people, and null where the platform gave none.
  platform_results bigint check (platform_results >= 0),
  read_at          timestamptz not null default now(),
  -- Whether the platform's numbers for the day have stopped moving: set by the read that looks back fourteen days.
  settled          boolean not null default false,
  primary key (ad_id, day),
  constraint ad_days_ad_id_same_workspace
    foreign key (tenant_id, ad_id) references public.ads (tenant_id, id) on delete cascade
);

-- A workspace's days in a window: the page's and the report's totals.
create index if not exists ad_days_window on public.ad_days (tenant_id, day);

alter table public.ad_days enable row level security;
drop policy if exists ad_days_member_select on public.ad_days;
create policy ad_days_member_select on public.ad_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ad_days from anon, authenticated;
grant select on public.ad_days to authenticated;
grant all on public.ad_days to service_role;

comment on table public.ad_days is
  'The platform''s day for one ad, in the account''s own zone (decision 0049 call 3, 00648): what it spent, in whole minor units of the account''s currency, how often it was shown and tapped, and the platform''s own count of what the ad asks for. The platform''s half only: who an ad brought and who booked are worked out from contacts and the visits record at each read and kept nowhere. Kept 25 months. Members read; the read''s door writes.';
comment on column public.ad_days.settled is
  'Whether the platform''s numbers for the day have stopped moving. A platform keeps correcting a day for about two weeks, so a figure with an unsettled day in it says "so far" (contracts adCostRule).';

/* ------------------------------------------------------------------------------------- 4. an ad account's token -- */

create or replace function public.ad_credentials_put(p_account_id uuid, p_secret jsonb)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'ad-creds-' || p_account_id::text;
  v_id   uuid;
begin
  -- The row, held for the write: a token is kept only for an account that stands, and two writes of one account's
  -- token take their turns.
  perform 1 from public.ad_accounts where id = p_account_id for update;
  if not found then
    raise exception 'ad_credentials_put: no such account';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'An ad account''s token: ' || p_account_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  return v_name;
end $$;

revoke all on function public.ad_credentials_put(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_credentials_put(uuid, jsonb) to service_role;
comment on function public.ad_credentials_put(uuid, jsonb) is
  'Service-role only: stores an ad account''s token in Vault under ad-creds-<account id> (00648, decision 0049). The only write path for the token, and it writes no table: which secret is an account''s follows from the account''s id.';

create or replace function public.ad_credentials_get(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets
   where name = 'ad-creds-' || p_account_id::text;
  if v_secret is null then
    return null;
  end if;
  return v_secret::jsonb;
end $$;

revoke all on function public.ad_credentials_get(uuid) from public, anon, authenticated;
grant execute on function public.ad_credentials_get(uuid) to service_role;
comment on function public.ad_credentials_get(uuid) is
  'Service-role only: an ad account''s token from Vault, or null where none is kept (00648).';

create or replace function public.ad_credentials_drop(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'ad-creds-' || p_account_id::text;
  if v_id is null then
    return false;
  end if;
  delete from vault.secrets where id = v_id;
  return true;
end $$;

revoke all on function public.ad_credentials_drop(uuid) from public, anon, authenticated;
grant execute on function public.ad_credentials_drop(uuid) to service_role;
comment on function public.ad_credentials_drop(uuid) is
  'Service-role only: deletes an ad account''s token from Vault (00648). Called once the platform has confirmed that access is withdrawn, or when the wait for that is given up; true where one was kept.';
