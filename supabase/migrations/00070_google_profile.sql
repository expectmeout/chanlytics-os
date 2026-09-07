-- 00070 · Google Business Profile: the owner's own listing, connected.
--
-- Step one watched the public listing. This is the owner's side of it: a
-- Google account signed in once, the location chosen, and from then on
-- every review — not the five Google shows — and the right to answer them.
-- The refresh token lives in Vault under google-creds-<workspace>, written
-- and read only by the two functions below, which only the service role may
-- call: the same door the WhatsApp token and the line credentials have.
--
-- A connection may wait for its location (an account with several): then
-- location_name is null until the owner picks one. Reviews read this way
-- go into google_reviews with origin 'profile'; a reply is a verb on the
-- ledger, subject 'review'.

create table public.google_connections (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  google_email     text,
  google_sub       text,
  account_name     text not null check (account_name like 'accounts/%'),
  account_title    text,
  location_name    text check (location_name is null or location_name like 'locations/%'),
  location_title   text,
  scopes           text[] not null default '{}',
  connected_by     uuid,
  connected_at     timestamptz not null default now(),
  -- The last successful sync; the words of the last failure, null once a sync succeeds again.
  last_synced_at   timestamptz,
  sync_error       text,
  credentials_ref  text,
  facts            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function extensions.moddatetime('updated_at');

alter table public.google_connections enable row level security;
create policy google_connections_member_select on public.google_connections
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
grant select on public.google_connections to authenticated;
comment on table public.google_connections is
  'A workspace''s Google Business Profile, connected by its owner: the account, the location, whose Google account, when it last synced. The token is in Vault. Members read; the edge writes.';

alter publication supabase_realtime add table public.google_connections;

create or replace function public.put_google_credentials(p_tenant_id uuid, p_secret jsonb)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'google-creds-' || p_tenant_id::text;
  v_id   uuid;
begin
  if not exists (select 1 from public.google_connections where tenant_id = p_tenant_id) then
    raise exception 'put_google_credentials: no such connection';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'Google Business Profile token for workspace ' || p_tenant_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  update public.google_connections set credentials_ref = v_name where tenant_id = p_tenant_id;
  return v_name;
end $$;
revoke execute on function public.put_google_credentials(uuid, jsonb) from public, anon, authenticated;
comment on function public.put_google_credentials(uuid, jsonb) is
  'Service-role only: stores a workspace''s Google token in Vault under google-creds-<workspace> and points credentials_ref at it. The only write path for the token.';

create or replace function public.get_google_credentials(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select credentials_ref into v_ref from public.google_connections where tenant_id = p_tenant_id;
  if v_ref is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_ref;
  if v_secret is null then return null; end if;
  return v_secret::jsonb;
end $$;
revoke execute on function public.get_google_credentials(uuid) from public, anon, authenticated;
comment on function public.get_google_credentials(uuid) is
  'Service-role only: a workspace''s Google token from Vault, or null.';

-- Disconnecting forgets the token as well as the row: a secret nobody can
-- reach again must not stay in Vault.
create or replace function public.drop_google_credentials(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'google-creds-' || p_tenant_id::text;
  v_id   uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then return false; end if;
  delete from vault.secrets where id = v_id;
  update public.google_connections set credentials_ref = null where tenant_id = p_tenant_id;
  return true;
end $$;
revoke execute on function public.drop_google_credentials(uuid) from public, anon, authenticated;
comment on function public.drop_google_credentials(uuid) is
  'Service-role only: deletes a workspace''s Google token from Vault. Called on disconnect, after Google was asked to revoke it.';

-- The ledger records an answer to a review: subject 'review', verb 'reply_review'.
-- packages/contracts/src/enums.ts carries the same lists, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.
-- Written with `in (...)` because that guard parses only this form.

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast', 'playbook', 'review'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review'
  ));
