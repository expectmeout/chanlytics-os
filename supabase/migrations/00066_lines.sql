-- 00066 · lines: a workspace's own phone number, provisioned by the product
-- (plan §7). One row per line; typed state columns, each with a CHECK, so a
-- state is a word the page can read and never a flag someone set by hand.
-- tenant_channels stays the runtime routing table; a line that answers has
-- a voice row there too (facts.channel_id points at it).
--
-- Secrets (the subaccount token, the SIP credential) live in Vault under
-- line-creds-<line id>, written and read only by the two functions below,
-- which only the service role may call — the same door tenant_channels has.

create table public.lines (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  e164                 text,
  kind                 text not null default 'chanlytics' check (kind in ('chanlytics', 'hosted', 'ported', 'forwarded')),
  provider             text not null check (provider in ('twilio', 'dry')),
  area_code            int,
  subaccount_sid       text,
  number_sid           text,
  trunk_sid            text,
  credential_list_sid  text,
  termination_uri      text,
  messaging_service_sid text,
  retell_agent_id      text,
  voice_state          text not null default 'none' check (voice_state in ('none', 'provisioning', 'answering', 'failed')),
  sms_state            text not null default 'none' check (sms_state in ('none', 'needs_record', 'otp_waiting', 'registering', 'approved', 'rejected', 'hosting', 'active', 'failed')),
  whatsapp_state       text not null default 'none' check (whatsapp_state in ('none', 'connecting', 'connected', 'coexistence', 'failed')),
  port_state           text not null default 'none' check (port_state in ('none', 'requested', 'scheduled', 'done', 'rejected')),
  forwarding_state     text not null default 'none' check (forwarding_state in ('none', 'instructed', 'verified')),
  step                 text check (step is null or step in ('subaccount', 'number', 'trunk', 'agent', 'import', 'channel')),
  last_error           text,
  state_since          timestamptz not null default now(),
  facts                jsonb not null default '{}'::jsonb,
  credentials_ref      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index lines_tenant_idx on public.lines (tenant_id, created_at);
create unique index lines_e164_live_idx on public.lines (e164) where e164 is not null and voice_state <> 'failed';
create trigger lines_set_updated_at
  before update on public.lines
  for each row execute function extensions.moddatetime('updated_at');

alter table public.lines enable row level security;
create policy lines_member_select on public.lines
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.lines is
  'A workspace''s own phone number as the product provisions it: provider ids, typed states per capability, the saga step and its last error. Members read; the edge writes.';

alter publication supabase_realtime add table public.lines;

create or replace function public.put_line_credentials(p_line_id uuid, p_secret jsonb)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'line-creds-' || p_line_id::text;
  v_id   uuid;
  v_old  jsonb;
begin
  if not exists (select 1 from public.lines where id = p_line_id) then
    raise exception 'put_line_credentials: no such line';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'Provider credentials for line ' || p_line_id::text);
  else
    -- Merge: the saga adds one secret per step (the subaccount token, then the SIP credential).
    select decrypted_secret::jsonb into v_old from vault.decrypted_secrets where id = v_id;
    perform vault.update_secret(v_id, (coalesce(v_old, '{}'::jsonb) || p_secret)::text);
  end if;
  update public.lines set credentials_ref = v_name where id = p_line_id;
  return v_name;
end $$;
revoke execute on function public.put_line_credentials(uuid, jsonb) from public, anon, authenticated;
comment on function public.put_line_credentials(uuid, jsonb) is
  'Service-role only: merges a line''s provider secrets into Vault under line-creds-<line id>. The only write path for a line credential.';

create or replace function public.get_line_credentials(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_ref    text;
  v_secret text;
begin
  select credentials_ref into v_ref from public.lines where id = p_line_id;
  if v_ref is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = v_ref;
  if v_secret is null then return null; end if;
  return v_secret::jsonb;
end $$;
revoke execute on function public.get_line_credentials(uuid) from public, anon, authenticated;
comment on function public.get_line_credentials(uuid) is
  'Service-role only: a line''s provider secrets from Vault, or null.';
