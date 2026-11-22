-- 00677 · A disconnected Instagram account is let go (decision 0143; amends 0117 and 0001 step 8).
--
-- An Instagram account's row (tenant_channels, kind 'instagram') is unique by the account's id, and Disconnect only
-- turned the row off: the row kept the id, and its token stayed in Vault. So an account disconnected in one workspace
-- could never be connected in another (21 Nov 2026: refused twice, for an account nobody had connected any more). A
-- connect was three writes (the row off, the token, the row on), and one that died between them left a row that was
-- off and still held the account. Each is now one door, all or nothing:
--
--   instagram_account_disconnect   The row off and let go: it gives up the account's id (its key becomes its own,
--                                  'let-go:<row id>', so the unique key frees), its token leaves Vault, and its
--                                  config keeps the handle, the account's id (account_id), when and who. A row that
--                                  was connected says so on the ledger (channel.disconnected), in the same
--                                  transaction. Answers let_go with the account's id, already for a row let go
--                                  before, gone for a row that is not this workspace's Instagram account.
--   instagram_account_connect      Under a lock for the workspace and one for the account: refused (taken, with the
--                                  workspace that holds it) while another workspace has the account connected; a row
--                                  of another workspace that is off and still holds it lets go first; refused
--                                  (another_here, with its handle) while this workspace has a different account
--                                  connected; then this workspace's own row for the account (the one that holds it,
--                                  else the one it let go last, so its threads keep the line they name) or a new one
--                                  takes the account, its config and its token, is turned on, and says so on the
--                                  ledger (channel.connected, which the edge wrote after the fact until now). A
--                                  token Vault will not keep raises, and everything is as it was.
--
-- A connected account can still never be taken by another workspace: only its own Disconnect lets it go, and a
-- connection Meta stopped accepting (lapsed) is still connected. The rows already off and still holding an account are
-- let go here, through the same door.
--
-- Service role alone: the edge's Instagram and Meta doors are the callers. Deploy order: this first. The code before it
-- keeps working beside it (it reads and writes the rows as it did; a row it turns off is let go by the next connect).
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.instagram_account_disconnect(p_tenant_id uuid, p_channel_id uuid, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_row public.tenant_channels%rowtype;
begin
  select * into v_row
    from public.tenant_channels c
   where c.id = p_channel_id and c.tenant_id = p_tenant_id and c.kind = 'instagram'
     for update;
  if not found then
    return jsonb_build_object('outcome', 'gone');
  end if;
  -- Let go before: it holds nothing, and nothing changes.
  if v_row.external_id = 'let-go:' || v_row.id::text then
    return jsonb_build_object('outcome', 'already');
  end if;
  update public.tenant_channels
     set status = 'disabled',
         external_id = 'let-go:' || v_row.id::text,
         credentials_ref = null,
         -- What was true of a token it no longer keeps goes; the handle stays, with the account, when and who.
         config = (config - array['scopes', 'token_checked_at', 'token_lapsed_at', 'token_refreshed_at', 'token_expires_at'])
                  || jsonb_strip_nulls(jsonb_build_object(
                       'account_id', v_row.external_id,
                       'disconnected_at', now(),
                       'disconnected_by', p_by))
   where id = v_row.id;
  -- put_channel_credentials (00042) keeps a channel's secret under this name; it leaves with the account.
  delete from vault.secrets where name = 'wa-creds-' || v_row.id::text;
  -- A connected account disconnected is a fact the ledger keeps, with it. A row that was off already (left by the code
  -- before this, or by a connect that never finished) was no connection to end: it lets go and says nothing.
  if v_row.status = 'active' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'channel.disconnected', 'system', 'channel', v_row.id,
            jsonb_build_object(
              'kind', 'instagram',
              'login', coalesce(v_row.config ->> 'login', 'instagram'),
              'account_id', v_row.external_id,
              'username', v_row.config ->> 'username',
              'by', p_by));
  end if;
  return jsonb_build_object('outcome', 'let_go', 'account_id', v_row.external_id, 'was', v_row.status);
end $$;

revoke all on function public.instagram_account_disconnect(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.instagram_account_disconnect(uuid, uuid, uuid) to service_role;
comment on function public.instagram_account_disconnect(uuid, uuid, uuid) is
  'Service-role only: a workspace''s Instagram account disconnected and let go (00677, decision 0143). The row is turned off, gives up the account''s id (external_id becomes let-go:<row id>, so another workspace may connect the account), its token is deleted from Vault and credentials_ref cleared, and its config keeps the handle with account_id, disconnected_at and disconnected_by; a row that was connected writes channel.disconnected { kind, login, account_id, username, by } with it. Answers let_go with the account''s id and the status it had, already for a row let go before, gone for a row that is not this workspace''s Instagram account. The edge''s Instagram and Meta doors call it (apps/edge/lib/instagram), and instagram_account_connect for a row that is off and still holds an account.';

create or replace function public.instagram_account_connect(p_tenant_id uuid, p_account_id text, p_config jsonb, p_secret jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_other record;
  v_here  record;
  v_id    uuid;
  v_was   text;
begin
  -- An Instagram account's id is 5 to 32 digits (contracts' own shape for it); anything else is no account.
  if p_account_id is null
     or length(p_account_id) not between 5 and 32
     or translate(p_account_id, '0123456789', '') <> '' then
    raise exception 'instagram_account_connect: not an account id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_secret) is distinct from 'object' then
    raise exception 'instagram_account_connect: a config and a secret, each an object' using errcode = '22023';
  end if;
  -- One connect at a time for a workspace, then for an account, always in that order: a second waits, then reads what
  -- the first wrote. Two workspaces never hold each other's lock, so nothing waits in a circle.
  perform pg_advisory_xact_lock(hashtextextended('instagram_workspace:' || p_tenant_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('instagram_account:' || p_account_id, 0));

  -- Another workspace's row for the account: connected, it holds it; off, it lets go now.
  select c.id, c.tenant_id, c.status into v_other
    from public.tenant_channels c
   where c.kind = 'instagram' and c.external_id = p_account_id and c.tenant_id <> p_tenant_id
     for update;
  if found then
    if v_other.status = 'active' then
      return jsonb_build_object('outcome', 'taken', 'held_by', v_other.tenant_id);
    end if;
    perform public.instagram_account_disconnect(v_other.tenant_id, v_other.id, null);
  end if;

  -- One account a workspace: a different one connected here stands until its own Disconnect.
  select c.id, c.config ->> 'username' as username into v_here
    from public.tenant_channels c
   where c.tenant_id = p_tenant_id and c.kind = 'instagram' and c.status = 'active'
     and c.external_id <> p_account_id
   order by c.created_at
   limit 1;
  if found then
    return jsonb_build_object('outcome', 'another_here', 'username', v_here.username);
  end if;

  -- This workspace's own row for the account: the one that holds it now, else the one it let go last.
  select c.id into v_id
    from public.tenant_channels c
   where c.tenant_id = p_tenant_id and c.kind = 'instagram'
     and (c.external_id = p_account_id
          or (c.external_id = 'let-go:' || c.id::text and c.config ->> 'account_id' = p_account_id))
   order by (c.external_id = p_account_id) desc, c.updated_at desc
   limit 1
     for update;
  if v_id is null then
    insert into public.tenant_channels (tenant_id, kind, external_id, status, config)
    values (p_tenant_id, 'instagram', p_account_id, 'disabled', p_config)
    returning id into v_id;
    v_was := 'new';
  else
    update public.tenant_channels set external_id = p_account_id, config = p_config where id = v_id;
    v_was := 'own';
  end if;
  -- The token, through the one door that writes a credential; it raises where Vault will not keep it, and the row,
  -- its key and its config are then as they were.
  perform public.put_channel_credentials(v_id, p_secret);
  update public.tenant_channels set status = 'active' where id = v_id;
  -- The connection, on the ledger with it: which account, through which login where the config names one, and who.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'channel.connected', 'system', 'channel', v_id,
          jsonb_build_object(
            'kind', 'instagram',
            'account_id', p_account_id,
            'username', p_config ->> 'username',
            'by', p_config ->> 'connected_by')
          || case when p_config ? 'login' then jsonb_build_object('login', p_config ->> 'login') else '{}'::jsonb end);
  return jsonb_build_object('outcome', 'connected', 'channel_id', v_id, 'was', v_was);
end $$;

revoke all on function public.instagram_account_connect(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.instagram_account_connect(uuid, text, jsonb, jsonb) to service_role;
comment on function public.instagram_account_connect(uuid, text, jsonb, jsonb) is
  'Service-role only: an Instagram account connected to a workspace in one write (00677, decision 0143). Under a lock for the workspace and one for the account: answers taken (with held_by, the workspace) while another workspace has the account connected, and lets go of another workspace''s row that is off and still holds it (instagram_account_disconnect); answers another_here (with its username) while this workspace has a different account connected; else this workspace''s own row for the account (the one holding it, or the one it let go last) or a new one takes the account''s id and the config, the secret is kept through put_channel_credentials, the row is turned on, and channel.connected { kind, account_id, username, by, login? } is written with it: connected, with channel_id and was (own or new). A secret Vault will not keep raises and nothing changes. Refuses (22023) an account id that is not 5 to 32 digits, or a config or secret that is not an object. The edge''s Instagram and Meta doors call it (apps/edge/lib/instagram).';

-- The rows already off and still holding an account (disconnected before this rule, or left by a connect that never
-- finished) are let go now, through the same door.
select public.instagram_account_disconnect(c.tenant_id, c.id, null)
  from public.tenant_channels c
 where c.kind = 'instagram' and c.status = 'disabled' and c.external_id <> 'let-go:' || c.id::text;
