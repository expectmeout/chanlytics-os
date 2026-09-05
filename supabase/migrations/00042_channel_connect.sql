-- A business connects its own WhatsApp number.
--
-- Until now a channel row and its credentials were written by hand: the
-- one live number rides the environment token, and credentials_ref names a
-- Vault secret that only a migration ever created. Embedded Signup makes
-- the connection a flow the owner completes, so the write path needs a door
-- of its own: a definer function the service role alone may call, which
-- stores the business token in Vault under a name derived from the channel
-- and points the channel at it. The browser never sees a credential, with
-- or without RLS mistakes elsewhere; the session client cannot call this.

create or replace function public.put_channel_credentials(p_channel_id uuid, p_secret jsonb)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'wa-creds-' || p_channel_id::text;
  v_id   uuid;
begin
  if not exists (select 1 from public.tenant_channels where id = p_channel_id) then
    raise exception 'put_channel_credentials: no such channel';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret::text, v_name, 'WhatsApp business token for channel ' || p_channel_id::text);
  else
    perform vault.update_secret(v_id, p_secret::text);
  end if;
  update public.tenant_channels set credentials_ref = v_name where id = p_channel_id;
  return v_name;
end $$;
revoke execute on function public.put_channel_credentials(uuid, jsonb) from public, anon, authenticated;
comment on function public.put_channel_credentials(uuid, jsonb) is
  'Service-role only: stores a channel''s credentials in Vault under wa-creds-<channel id> and points credentials_ref at it. The only write path for a credential.';

-- The ledger records the connection: subject 'channel', verb 'connect_channel'.
-- packages/contracts/src/enums.ts carries the same lists, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.
-- Written with `in (...)` because that guard parses only this form.

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel'
  ));
