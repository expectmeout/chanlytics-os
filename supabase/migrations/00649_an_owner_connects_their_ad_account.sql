-- 00649 · An owner connects their ad account (decision 0049, step P1; decision 0050, calls 2 and 8; the Ads build
-- plan's step 2, part 3: Connect).
--
-- 00648 made the ground: the account's row and its token's place in Vault, with no door. These are the doors Connect
-- needs, each writing its fact and that fact's event in one transaction, each the service role's alone (the edge
-- calls them, after it has asked Meta), and each asking again whether the person may: connecting an ad account is the
-- owner's alone (the `ads` permission, 00645), whoever knocked.
--
--   ad_account_connect     The owner signed in at the platform, and this is the account they meant: its row made, or
--                          found and written over (the same account connected again is its row, never a second), its
--                          token put in Vault, the owner's decision and the event kept. Where two accounts could both
--                          be the one, the row waits as `choosing` with the two beside it, and the same door is asked
--                          again with the owner's answer. Refused, with nothing written: for anyone but the owner; where
--                          another workspace holds the account; and where this workspace has another account connected,
--                          since changing accounts is Disconnect, then Connect (the plan's G4).
--   ad_account_read_keep   What a read of the account at its platform learned: its name and zone, what it stands on,
--                          the platform's ids beside it, how the read went, and the platform's pace. An event only
--                          where what it stands on moved. The card's "Chanlytics looks again" is this, and so is the
--                          account's part of every read to come.
--   ad_account_revoked     The platform took access back: the account says so, with when. Its last numbers stay, and
--                          nothing is read or changed until the owner connects again. One that still waited for the
--                          owner's answer was never connected: it goes, with its token, and nothing is said of it.
--
-- The ledger learns two subjects (an ad account, an ad) and four verbs (connect and disconnect an ad account, pause and
-- resume an ad). Each CHECK lists its whole set, as every widening does: the sets are contracts' DECISION_SUBJECTS and
-- DECISION_VERBS. Pause, Resume and Disconnect are written by the parts that follow; their words are here so the two
-- sets are widened once.
--
-- Locks. Widening a CHECK on `decisions` reads the table once under a lock that holds its writers for that read. The
-- table is small beside messages and events (a row an act of a person's), and this file waits three seconds for the
-- lock and no more: run again on a quiet moment if it times out, since nothing was applied (one transaction).
--
-- Deploy order: this file first. An edge ahead of it gets PGRST202 from a door and says Connect is not ready here;
-- nothing before it names these doors. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------- 1. the ledger's sets -- */

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check check (subject_type = any (array[
  'conversation', 'escalation', 'draft', 'lead', 'message', 'agent', 'membership', 'invitation', 'contact', 'call',
  'channel', 'broadcast', 'playbook', 'review', 'workspace', 'deal', 'list', 'appointment', 'sequence', 'ad_account',
  'ad'
]));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence', 'not_a_customer', 'reply_anyway', 'connect_ad_account',
  'disconnect_ad_account', 'pause_ad', 'resume_ad'
]));

/* ------------------------------------------------------------------------------------------------ 2. connect -- */

create or replace function public.ad_account_connect(
  p_tenant_id uuid, p_actor uuid, p_platform text, p_account jsonb, p_secret jsonb, p_chosen boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_external text := nullif(btrim(p_account ->> 'external_id'), '');
  v_status   text := case when v_external is null then 'choosing' else 'connected' end;
  v_live     public.ad_accounts;
  v_id       uuid;
  v_key      text;
begin
  if p_secret is null or jsonb_typeof(p_secret) <> 'object' then
    raise exception 'ad_account_connect: a token is required' using errcode = '22023';
  end if;
  -- The owner alone connects an ad account (0050, call 2): asked here again, whoever knocked.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- One connect at a time for a workspace and a platform: two windows closing together write one row.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|ad_account|' || p_platform, 42));

  select * into v_live from public.ad_accounts a
   where a.tenant_id = p_tenant_id and a.platform = p_platform and a.status <> 'disconnected'
   for update;
  if found and v_live.status = 'connected' and v_live.external_id is distinct from v_external then
    return jsonb_build_object('outcome', 'another_connected', 'account_id', v_live.id);
  end if;
  -- A platform's account is held by one workspace at a time, as a WhatsApp number is.
  if v_external is not null and exists (
    select 1 from public.ad_accounts a
     where a.platform = p_platform and a.external_id = v_external
       and a.status in ('connected', 'revoked') and a.tenant_id <> p_tenant_id
  ) then
    return jsonb_build_object('outcome', 'taken');
  end if;

  -- The row to write: this account's own where the workspace has held it before, else the one that waits to be
  -- chosen, else a new one.
  if v_external is not null then
    select a.id into v_id from public.ad_accounts a
     where a.tenant_id = p_tenant_id and a.platform = p_platform and a.external_id = v_external;
  end if;
  if v_live.id is not null and v_live.id is distinct from v_id then
    if v_live.status = 'choosing' and v_id is null then
      v_id := v_live.id;
    elsif v_live.status = 'choosing' then
      -- The one that waited is answered by an account the workspace already holds: it goes, with its token.
      perform public.ad_credentials_drop(v_live.id);
      delete from public.ad_accounts where id = v_live.id;
    else
      -- Access to another account was taken back, and the owner now connects this one: the other is let go. Its
      -- token no longer opens anything.
      perform public.ad_credentials_drop(v_live.id);
      update public.ad_accounts set status = 'disconnected', disconnected_at = now() where id = v_live.id;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'ad_account.disconnected', 'setup', 'ad_account', v_live.id,
              jsonb_build_object('platform', p_platform, 'why', 'replaced', 'by', p_actor));
    end if;
  end if;

  if v_id is null then
    insert into public.ad_accounts (tenant_id, platform, status) values (p_tenant_id, p_platform, 'choosing')
    returning id into v_id;
  end if;
  update public.ad_accounts a
     set external_id = v_external,
         name = nullif(left(btrim(coalesce(p_account ->> 'name', '')), 500), ''),
         currency = p_account ->> 'currency',
         timezone = p_account ->> 'timezone',
         status = v_status,
         standing = case when jsonb_typeof(p_account -> 'standing') = 'object' then p_account -> 'standing' else '{}'::jsonb end,
         config = case when jsonb_typeof(p_account -> 'config') = 'object' then p_account -> 'config' else '{}'::jsonb end,
         token_expires_at = nullif(p_account ->> 'token_expires_at', '')::timestamptz,
         connected_by = p_actor,
         connected_at = now(),
         revoked_at = null,
         disconnected_at = null,
         withdrawn_at = null,
         read_at = case when v_status = 'connected' then now() end,
         read_error = null
   where a.id = v_id;
  perform public.ad_credentials_put(v_id, p_secret);

  -- Signing in is the owner's act, kept once: the answer to the one question is the same act, finished.
  if not p_chosen then
    insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
    values (p_tenant_id, 'ad_account', v_id, 'connect_ad_account', 'user', p_actor,
            jsonb_build_object('platform', p_platform, 'external_id', v_external, 'name', p_account ->> 'name'));
  end if;
  if p_chosen then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad_account.chosen', 'setup', 'ad_account', v_id,
            jsonb_build_object('platform', p_platform, 'external_id', v_external, 'name', p_account ->> 'name',
                               'by', p_actor));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad_account.connected', 'setup', 'ad_account', v_id,
            jsonb_build_object('platform', p_platform, 'external_id', v_external, 'name', p_account ->> 'name',
                               'status', v_status, 'by', p_actor));
  end if;
  return jsonb_build_object('outcome', v_status, 'account_id', v_id);
exception when unique_violation then
  -- Another workspace took the account between the look above and the write: the same answer as the look's. Any
  -- other key broken is a fault of this door's, and is raised as one.
  get stacked diagnostics v_key = constraint_name;
  if v_key = 'ad_accounts_held_once' then
    return jsonb_build_object('outcome', 'taken');
  end if;
  raise;
end $$;

revoke all on function public.ad_account_connect(uuid, uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ad_account_connect(uuid, uuid, text, jsonb, jsonb, boolean) to service_role;
comment on function public.ad_account_connect(uuid, uuid, text, jsonb, jsonb, boolean) is
  'Service-role only: an owner''s ad account connected (00649, decision 0049 step P1). Writes the account''s row (found by its platform id where this workspace has held it, else the one that waits to be chosen, else new), puts its token in Vault, and keeps the owner''s decision (connect_ad_account) and the event (ad_account.connected, or ad_account.chosen for the answer to which of two accounts is meant), in one transaction. With no external_id the row waits as choosing. Answers outcome: connected or choosing with account_id; not_allowed for anyone but the owner (has_permission ads, asked here); taken where another workspace holds the account; another_connected where this workspace has a different account connected, since changing accounts is Disconnect then Connect.';

/* ------------------------------------------------------------------------------- 3. what a read of it learned -- */

create or replace function public.ad_account_read_keep(p_tenant_id uuid, p_account_id uuid, p_read jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.ad_accounts;
  v_standing jsonb;
  v_config   jsonb;
  v_moved    boolean;
begin
  select * into v_row from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id
   for update;
  if not found or v_row.status <> 'connected' then
    return 'not_connected';
  end if;
  -- A read that failed says only that it did, and when the platform may be asked again: what stood, stands.
  if p_read ? 'error' and p_read ->> 'error' is not null then
    update public.ad_accounts a
       set read_error = left(p_read ->> 'error', 300),
           usage_pct = coalesce(least((p_read ->> 'usage_pct')::numeric, 999.99), a.usage_pct),
           usage_at = case when p_read ? 'usage_pct' then now() else a.usage_at end,
           read_after = nullif(p_read ->> 'read_after', '')::timestamptz
     where a.id = p_account_id;
    return 'failed';
  end if;

  v_standing := case when jsonb_typeof(p_read -> 'standing') = 'object' then p_read -> 'standing' else v_row.standing end;
  -- The platform's facts beside the account are written key by key: a read that looked at the Page alone leaves the
  -- limit as it was.
  v_config := v_row.config || case when jsonb_typeof(p_read -> 'config') = 'object' then p_read -> 'config' else '{}'::jsonb end;
  v_moved := v_standing is distinct from v_row.standing
          or (v_config - 'scopes') is distinct from (v_row.config - 'scopes');
  update public.ad_accounts a
     set name = coalesce(nullif(left(btrim(coalesce(p_read ->> 'name', '')), 500), ''), a.name),
         timezone = coalesce(nullif(p_read ->> 'timezone', ''), a.timezone),
         standing = v_standing,
         config = v_config,
         read_at = now(),
         read_error = null,
         usage_pct = coalesce(least((p_read ->> 'usage_pct')::numeric, 999.99), a.usage_pct),
         usage_at = case when p_read ? 'usage_pct' then now() else a.usage_at end,
         read_after = nullif(p_read ->> 'read_after', '')::timestamptz
   where a.id = p_account_id;
  if v_moved then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad_account.standing', 'setup', 'ad_account', p_account_id,
            jsonb_build_object('platform', v_row.platform, 'from', v_row.standing, 'to', v_standing));
    return 'moved';
  end if;
  return 'kept';
end $$;

revoke all on function public.ad_account_read_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_account_read_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ad_account_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what a read of a connected ad account at its platform learned (00649, decision 0049). Given standing and config it writes them (config key by key over what stood), with the account''s name and zone where given, stamps the read, clears the last failure and keeps the platform''s pace (usage_pct, read_after); an ad_account.standing event only where what the account stands on or the facts beside it moved. Given error, a read that failed: its words and the pace are kept and what stood, stands. Answers moved, kept, failed, or not_connected for an account that is not connected, where nothing is written.';

/* ---------------------------------------------------------------------------- 4. the platform took access back -- */

create or replace function public.ad_account_revoked(p_tenant_id uuid, p_account_id uuid, p_how text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ad_accounts;
begin
  select * into v_row from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id and a.status in ('connected', 'choosing')
   for update;
  if not found then
    return false;
  end if;
  if v_row.status = 'choosing' then
    -- Signed in, and the one question never answered: no account was connected, so there is none to mark. The row
    -- that waited goes, with the token that no longer opens anything.
    perform public.ad_credentials_drop(p_account_id);
    delete from public.ad_accounts a where a.id = p_account_id;
  else
    update public.ad_accounts a set status = 'revoked', revoked_at = now() where a.id = p_account_id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad_account.revoked', 'setup', 'ad_account', p_account_id,
          jsonb_build_object('platform', v_row.platform, 'how', left(coalesce(p_how, 'read'), 40),
                             'was', v_row.status));
  return true;
end $$;

revoke all on function public.ad_account_revoked(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ad_account_revoked(uuid, uuid, text) to service_role;
comment on function public.ad_account_revoked(uuid, uuid, text) is
  'Service-role only: the platform took Chanlytics'' access to an ad account back (00649, decision 0049): the account is revoked, with when, and an ad_account.revoked event says how it was learned (a read the platform refused, or the platform''s own call). Its last numbers stay; nothing is read or changed until the owner connects again. One that still waited to be chosen was never connected: its row goes with its token. True where it was connected or waiting to be chosen; false, and nothing written, otherwise.';
