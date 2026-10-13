-- 00421 · A business connects the mailbox it writes from (decision 0056).
--
-- A cold email leaves from a mailbox the business connected, through its provider's own API (Gmail, or Microsoft
-- Graph), never through an account of the platform's. One row per mailbox:
--
--   mailbox_connections   the provider, the account's id there, the address and the name it sends as, its state
--                         (connected, reconnect: the provider signed it out; paused: its owner paused it; held: its
--                         own mail earned a hold; removed), the provider's day used up (resting_until), the owner's
--                         cap, the ramp's clock (clean_since, sent_days) and the count's (counted_since), what DNS
--                         says of its domain (dns, customer_domain), the sync's cursor and watch, and who connected it.
--                         Its tokens are never on the row: credentials_ref names the Vault secret.
--   put/get/drop_mailbox_credentials
--                         the only doors to the tokens, service role only, as 00364's for Google Business Profile:
--                         a refresh writes only over the grant it refreshed (p_if_refresh_token), under the row's lock.
--   mailbox_connections_within_limit
--                         ten live mailboxes a workspace, three on one domain.
--
--   the mailboxes clock  every five minutes ('mailboxes-sweep', /api/cron/mailboxes), only while a mailbox is live: each
--                        is read for what came back since its cursor, its watch renewed, its health judged hourly
--                        and its domain's records read daily. The domains clocks of the cold lane (domains-sweep,
--                        sending-domain-days) are taken off the clock with their rows in sweep_status: no domain is
--                        added any more, and production holds none.
--
-- An address is connected by one workspace at a time (mailbox_connections_live_address): two workspaces sending from one
-- mailbox would each spend its day without the other knowing. Members read their workspace's rows; only the service
-- role writes (the edge's connect, the sync and the clocks). The live feed hears the table (0019, 0047).
--
-- Additive: nothing reads or writes it before the code that comes with it. Re-runnable throughout.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------- 1. the table -- */

create table if not exists public.mailbox_connections (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  provider         text not null check (provider in ('google', 'microsoft')),
  -- The provider's own id for the account (Google's sub, Microsoft's oid): a reconnect finds its row by it.
  provider_account text not null check (char_length(provider_account) between 1 and 200),
  address          text not null check (
                     char_length(address) between 6 and 254
                     and address = lower(btrim(address))
                     and address ~ '^[a-z0-9._%+''-]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  host             text not null,
  from_name        text not null check (char_length(btrim(from_name)) between 1 and 80),
  signature        text check (signature is null or char_length(signature) <= 1000),
  scopes           text[] not null default '{}',
  state            text not null default 'connected'
                     check (state in ('connected', 'reconnect', 'paused', 'held', 'removed')),
  held_why         text check (held_why in ('bounces', 'complaint', 'unsubscribes')),
  held_at          timestamptz,
  -- The provider's own day used up (Gmail's sending limit, Graph's): its sends wait until then.
  resting_until    timestamptz,
  -- The owner's own ceiling; the ramp's share is never raised by it (contracts mailboxDailyCap).
  daily_cap        integer not null default 40 check (daily_cap between 1 and 50),
  -- Its domain is the business's own, the one its customers write to (its website's): kept to 20 a day.
  customer_domain  boolean not null default false,
  -- The ramp counts from here (days actually sent since, D15); the health count from counted_since.
  clean_since      timestamptz not null default now(),
  counted_since    timestamptz not null default now(),
  sent_days        integer not null default 0 check (sent_days >= 0),
  -- What DNS said of its domain at dns_checked_at: {spf, dkim, dmarc, mx}, each 'found' or 'missing'.
  dns              jsonb not null default '{}'::jsonb check (jsonb_typeof(dns) = 'object'),
  dns_checked_at   timestamptz,
  -- Where the sync left off: Gmail's historyId, Graph's delta link.
  sync_cursor      text check (sync_cursor is null or char_length(sync_cursor) <= 4000),
  -- Graph's subscription id; Gmail's watch has none of its own.
  watch_id         text check (watch_id is null or char_length(watch_id) <= 200),
  watch_expires_at timestamptz,
  synced_at        timestamptz,
  -- One sync at a time: a push and the clock that both reach a mailbox take turns (the edge's mailbox_sync_take).
  sync_lease_until timestamptz,
  -- When the clock last judged its health (mailbox_connection_counts): once an hour.
  judged_at        timestamptz,
  sent_at          timestamptz,
  -- What went wrong last, in the owner's words (never a provider's text), and when; cleared by the next success.
  last_error       text check (last_error is null or char_length(last_error) <= 300),
  last_error_at    timestamptz,
  credentials_ref  text,
  connected_by     uuid,
  connected_at     timestamptz not null default now(),
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint mailbox_connections_host_is_address check (host = split_part(address, '@', 2)),
  constraint mailbox_connections_held_is_whole
    check ((state = 'held') = (held_why is not null) and (held_why is null) = (held_at is null)),
  constraint mailbox_connections_removed_is_dated check ((state = 'removed') = (removed_at is not null)),
  -- The house fence (00279): a row that names one of this table's rows names it with its workspace.
  constraint mailbox_connections_tenant_id_id unique (tenant_id, id)
);

create unique index if not exists mailbox_connections_live_address
  on public.mailbox_connections (address) where state <> 'removed';
create unique index if not exists mailbox_connections_live_account
  on public.mailbox_connections (tenant_id, provider, provider_account) where state <> 'removed';
create index if not exists mailbox_connections_tenant on public.mailbox_connections (tenant_id, state);
-- The clocks' read: every live mailbox, by when its watch runs out.
create index if not exists mailbox_connections_watch
  on public.mailbox_connections (watch_expires_at) where state in ('connected', 'paused', 'held');

drop trigger if exists mailbox_connections_set_updated_at on public.mailbox_connections;
create trigger mailbox_connections_set_updated_at
  before update on public.mailbox_connections
  for each row execute function extensions.moddatetime('updated_at');

alter table public.mailbox_connections enable row level security;
drop policy if exists mailbox_connections_member_select on public.mailbox_connections;
create policy mailbox_connections_member_select on public.mailbox_connections
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- Members read; nothing of a session writes: every write is the edge's, as the service role.
revoke insert, update, delete on public.mailbox_connections from anon, authenticated;
grant select on public.mailbox_connections to authenticated;
grant all on public.mailbox_connections to service_role;

comment on table public.mailbox_connections is
  'A mailbox a business connected to write from (decision 0056): its provider (google or microsoft), its address and the name it sends as, its state, its day (the owner''s cap, the ramp''s clock, the provider''s own limit), its domain''s DNS, the sync''s cursor and watch. Tokens are in Vault (put/get/drop_mailbox_credentials), never here. Members read; the service role writes. One live row per address across every workspace.';
comment on column public.mailbox_connections.state is
  'connected: it sends and is read. reconnect: its provider signed it out (a revoked or expired grant): its sends wait and its owner is told once. paused: its owner paused it. held: its own mail earned a hold (held_why), lifted by its owner''s Resume. removed: gone; kept so a send and a report still name it.';
comment on column public.mailbox_connections.resting_until is
  'Set when the provider refused a send for its own day''s limit: the mailbox''s sends wait until then (the next midnight in its provider''s reckoning, or the wait it named). Null otherwise.';

/* --------------------------------------------------------------- 2. the limit -- */

create or replace function public.mailbox_connections_within_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.state = 'removed' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('mailbox_connections:' || new.tenant_id::text));
  if (select count(*) from public.mailbox_connections c
       where c.tenant_id = new.tenant_id and c.state <> 'removed' and c.id <> new.id) >= 10 then
    raise exception 'A workspace writes from 10 mailboxes at most.' using errcode = 'P0001', hint = 'too_many';
  end if;
  if (select count(*) from public.mailbox_connections c
       where c.tenant_id = new.tenant_id and c.host = new.host and c.state <> 'removed' and c.id <> new.id) >= 3 then
    raise exception 'A workspace writes from 3 mailboxes on one domain at most.' using errcode = 'P0001',
      hint = 'too_many_on_domain';
  end if;
  return new;
end $$;
revoke all on function public.mailbox_connections_within_limit() from public, anon, authenticated;

drop trigger if exists mailbox_connections_within_limit on public.mailbox_connections;
create trigger mailbox_connections_within_limit
  before insert or update of state, host on public.mailbox_connections
  for each row execute function public.mailbox_connections_within_limit();

/* ------------------------------------------------------------- 3. the tokens -- */

create or replace function public.put_mailbox_credentials(
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
  v_name text := 'mailbox-creds-' || p_connection_id::text;
  v_id   uuid;
  v_now  text;
begin
  -- The row, held for the write: every write of this mailbox's token takes it first, so a refresh's compare and its
  -- write are one step against a reconnect's.
  perform 1 from public.mailbox_connections where id = p_connection_id for update;
  if not found then
    raise exception 'put_mailbox_credentials: no such mailbox';
  end if;
  if p_if_refresh_token is not null then
    select (decrypted_secret::jsonb)->>'refresh_token' into v_now from vault.decrypted_secrets where name = v_name;
    if v_now is distinct from p_if_refresh_token then
      raise exception 'put_mailbox_credentials: the token changed since it was read' using errcode = '40001';
    end if;
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'A connected mailbox''s token: ' || p_connection_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  update public.mailbox_connections set credentials_ref = v_name where id = p_connection_id;
  return v_name;
end $$;
revoke all on function public.put_mailbox_credentials(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.put_mailbox_credentials(uuid, jsonb, text) to service_role;
comment on function public.put_mailbox_credentials(uuid, jsonb, text) is
  'Service-role only: stores a connected mailbox''s token in Vault under mailbox-creds-<id> and points credentials_ref at it. The only write path for the token. With p_if_refresh_token, only while the token stored still carries that refresh token, under a lock on the row every write takes; otherwise it raises 40001 and writes nothing (as 00364''s for Google).';

create or replace function public.get_mailbox_credentials(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select credentials_ref into v_ref from public.mailbox_connections where id = p_connection_id;
  if v_ref is null then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_ref;
  if v_secret is null then
    return null;
  end if;
  return v_secret::jsonb;
end $$;
revoke all on function public.get_mailbox_credentials(uuid) from public, anon, authenticated;
grant execute on function public.get_mailbox_credentials(uuid) to service_role;
comment on function public.get_mailbox_credentials(uuid) is
  'Service-role only: a connected mailbox''s token from Vault, or null.';

create or replace function public.drop_mailbox_credentials(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'mailbox-creds-' || p_connection_id::text;
  v_id   uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    return false;
  end if;
  delete from vault.secrets where id = v_id;
  update public.mailbox_connections set credentials_ref = null where id = p_connection_id;
  return true;
end $$;
revoke all on function public.drop_mailbox_credentials(uuid) from public, anon, authenticated;
grant execute on function public.drop_mailbox_credentials(uuid) to service_role;
comment on function public.drop_mailbox_credentials(uuid) is
  'Service-role only: deletes a connected mailbox''s token from Vault. Called when it is removed, after its provider was asked to revoke it.';

/* ----------------------------------------------------- 4. a connection, made -- */

create or replace function public.mailbox_connection_connect(
  p_tenant_id       uuid,
  p_user_id         uuid,
  p_provider        text,
  p_account         text,
  p_address         text,
  p_from_name       text,
  p_scopes          text[],
  p_customer_domain boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address text := lower(btrim(p_address));
  v_row     public.mailbox_connections;
  v_other   uuid;
begin
  -- The same account, connected again (a reconnect, or the owner pressed Connect twice): its row, back to connected.
  select * into v_row from public.mailbox_connections c
   where c.tenant_id = p_tenant_id and c.provider = p_provider and c.provider_account = p_account
     and c.state <> 'removed'
   for update;
  if found then
    update public.mailbox_connections
       set address = v_address, host = split_part(v_address, '@', 2), scopes = coalesce(p_scopes, '{}'),
           customer_domain = coalesce(p_customer_domain, false),
           state = case when state in ('reconnect') then 'connected' else state end,
           last_error = null, last_error_at = null, connected_by = coalesce(p_user_id, connected_by),
           connected_at = now()
     where id = v_row.id
     returning * into v_row;
    return jsonb_build_object('id', v_row.id, 'made', false, 'state', v_row.state);
  end if;
  -- An address another workspace writes from is that workspace's.
  select c.tenant_id into v_other from public.mailbox_connections c
   where c.address = v_address and c.state <> 'removed' and c.tenant_id <> p_tenant_id
   limit 1;
  if v_other is not null then
    raise exception 'Another workspace writes from this mailbox.' using errcode = 'P0001', hint = 'taken';
  end if;
  insert into public.mailbox_connections
    (tenant_id, provider, provider_account, address, host, from_name, scopes, customer_domain, connected_by)
  values
    (p_tenant_id, p_provider, p_account, v_address, split_part(v_address, '@', 2),
     left(coalesce(nullif(btrim(p_from_name), ''), split_part(v_address, '@', 1)), 80),
     coalesce(p_scopes, '{}'), coalesce(p_customer_domain, false), p_user_id)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'made', true, 'state', v_row.state);
end $$;
revoke all on function public.mailbox_connection_connect(uuid, uuid, text, text, text, text, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.mailbox_connection_connect(uuid, uuid, text, text, text, text, text[], boolean)
  to service_role;
comment on function public.mailbox_connection_connect(uuid, uuid, text, text, text, text, text[], boolean) is
  'Service-role only (the edge''s connect, once the provider''s grant is in hand): the mailbox''s row, made, or the same account''s row found again and back to connected. {id, made, state}. Raises P0001 hint taken when another workspace writes from the address, and the limit trigger''s too_many / too_many_on_domain.';

/* --------------------------------------------------------- 5. the live feed -- */

drop trigger if exists workspace_tell_insert on public.mailbox_connections;
create trigger workspace_tell_insert after insert on public.mailbox_connections
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
-- An update is told only when a column Connections draws holds something else (0047): never the sync's cursor, its
-- watch or the stamp of a send, which the clocks move all day.
create or replace trigger workspace_tell_update
  after update of state, held_why, resting_until, daily_cap, customer_domain, sent_days, dns, last_error, from_name,
                  signature, address
  on public.mailbox_connections
  for each row when (
    old.state is distinct from new.state or old.held_why is distinct from new.held_why
    or old.resting_until is distinct from new.resting_until or old.daily_cap is distinct from new.daily_cap
    or old.customer_domain is distinct from new.customer_domain or old.sent_days is distinct from new.sent_days
    or old.dns is distinct from new.dns or old.last_error is distinct from new.last_error
    or old.from_name is distinct from new.from_name or old.signature is distinct from new.signature
    or old.address is distinct from new.address)
  execute function public.workspace_tell_row_change();
drop trigger if exists workspace_tell_delete on public.mailbox_connections;
create trigger workspace_tell_delete after delete on public.mailbox_connections
  referencing old table as changed for each statement execute function public.workspace_tell_changes();

/* ---------------------------------------------------------------- 6. the clock -- */

create or replace function public.trigger_mailboxes_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.mailbox_connections c where c.state in ('connected', 'paused', 'held')) then
    return public.request_sweep('mailboxes', '/api/cron/mailboxes', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('mailboxes', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_mailboxes_sweep() from public, anon, authenticated;
comment on function public.trigger_mailboxes_sweep() is
  'The mailboxes clock (decision 0056). Calls the edge (/api/cron/mailboxes) only while a connected mailbox is live; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every five minutes, recording itself each time: twenty minutes is four missed ticks.
  ('mailboxes', 'mailboxes-sweep', interval '20 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

-- Minutes 2, 7, … 57: off the health check's grid (13, 43) and the five-minute clocks at 0, 5, … 55.
select cron.unschedule('mailboxes-sweep') where exists (select 1 from cron.job where jobname = 'mailboxes-sweep');
select cron.schedule('mailboxes-sweep', '2-59/5 * * * *', $$select public.trigger_mailboxes_sweep()$$);

-- The cold lane's domains clocks, off (decision 0056): their sweep rows go with them, so no silence is alarmed on.
select cron.unschedule('domains-sweep') where exists (select 1 from cron.job where jobname = 'domains-sweep');
select cron.unschedule('sending-domain-days') where exists (select 1 from cron.job where jobname = 'sending-domain-days');
delete from public.sweep_status where sweep in ('domains', 'sending_domain_days');

-- Sending domains are no longer added or written (decision 0056): the live feed stops hearing them (realtime.ts lists
-- mailbox_connections in their place). The table stays, inert, until the next change drops it.
drop trigger if exists workspace_tell_insert on public.sending_domains;
drop trigger if exists workspace_tell_update on public.sending_domains;
drop trigger if exists workspace_tell_delete on public.sending_domains;

-- What the retired lane leaves behind says so, for whoever reads the schema before the change that drops it.
comment on table public.sending_domains is
  'Retired (decision 0056, 00421): the domains a second Resend account sent cold email from. Nothing reads or writes it now; kept inert until a later migration drops it (docs/debt.md).';
comment on table public.sending_domain_days is
  'Retired (decision 0056, 00421): each sending domain''s day, filed nightly until its clock was unscheduled. Kept inert until a later migration drops it (docs/debt.md).';
