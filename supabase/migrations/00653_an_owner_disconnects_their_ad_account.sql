-- 00653 · An owner disconnects their ad account, and the bell says when an account needs them (decision 0050, call
-- 8 as the Ads build plan amends it: Disconnect is never refused; the plan's 4.8, 4.9 and 4.10; step 2, part 7).
--
--   ad_account_disconnect   The owner lets the account go: it is marked disconnected with when, every press still on
--                           its way to the platform is let go with it (nothing is sent after a disconnect), and the
--                           owner's decision and the event are kept, naming the ads left running. Never refused for
--                           the owner: an ad still on is theirs to stop at the platform, and the page says so. The
--                           account's ads and what they brought stay.
--   notifications.kind      Gains ad_account: the bell's two lines for the connection.
--   ad_account_revoked      Re-made: the same, and a line on the bell that the platform signed Chanlytics out.
--   ad_account_read_keep    Re-made: the same, and a line on the bell the first time a read finds the platform cannot
--                           charge for the account (no payment method, or a payment that failed).
--
-- The bell's line is never the reason a door fails: one that cannot be written is a warning.
--
-- Locks. Widening the CHECK on `notifications` reads the table once under a lock that holds its writers for that read;
-- this file waits three seconds for it and no more. Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first. An edge ahead of it gets PGRST202 from the disconnect door and says it is not ready
-- here. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------- 1. the bell's kind -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account']));

/* -------------------------------------------------------------------------------------------- 2. disconnect -- */

create or replace function public.ad_account_disconnect(p_tenant_id uuid, p_actor uuid, p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.ad_accounts;
  v_running jsonb;
begin
  -- The owner alone disconnects an ad account (0050, call 2): asked here again, whoever knocked.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  select * into v_row from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.status = 'disconnected' then
    return jsonb_build_object('outcome', 'already');
  end if;
  -- The ads the platform last said were running, by name: what the owner is told stays on, and can only be stopped there.
  select coalesce(jsonb_agg(d.name order by d.name), '[]'::jsonb) into v_running
    from public.ads d
   where d.tenant_id = p_tenant_id and d.account_id = p_account_id
     and d.status = 'made' and d.platform_state = 'ACTIVE';
  -- Nothing is sent to the platform after a disconnect: a press still on its way is let go.
  update public.ads d
     set told_at = now()
   where d.tenant_id = p_tenant_id and d.account_id = p_account_id
     and d.intent_at is not null and (d.told_at is null or d.told_at < d.intent_at);
  update public.ad_accounts a
     set status = 'disconnected', disconnected_at = now(), read_after = null, next_read_at = null
   where a.id = p_account_id;
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad_account', p_account_id, 'disconnect_ad_account', 'user', p_actor,
          jsonb_build_object('platform', v_row.platform, 'external_id', v_row.external_id, 'name', v_row.name,
                             'left_running', v_running));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad_account.disconnected', 'setup', 'ad_account', p_account_id,
          jsonb_build_object('platform', v_row.platform, 'why', 'owner', 'by', p_actor, 'left_running', v_running));
  return jsonb_build_object('outcome', 'disconnected', 'left_running', v_running);
end $$;

revoke all on function public.ad_account_disconnect(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ad_account_disconnect(uuid, uuid, uuid) to service_role;
comment on function public.ad_account_disconnect(uuid, uuid, uuid) is
  'Service-role only: an owner disconnects their ad account (00653; decision 0050 call 8, as the Ads plan amends it: never refused). Marks the account disconnected with when, lets go every press still on its way to the platform, and keeps the owner''s decision (disconnect_ad_account) and the event (ad_account.disconnected, why owner), each naming the ads the platform last said were running. The account''s ads and what they brought stay. The caller drops the account''s token after. Answers outcome: disconnected with left_running; already; not_allowed for anyone but the owner (has_permission ads, asked here); not_found.';

/* ----------------------------------------------------------------- 3. the platform took access back, on the bell -- */

create or replace function public.ad_account_revoked(p_tenant_id uuid, p_account_id uuid, p_how text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform text;
begin
  update public.ad_accounts a
     set status = 'revoked', revoked_at = now()
   where a.id = p_account_id and a.tenant_id = p_tenant_id and a.status in ('connected', 'choosing')
  returning a.platform into v_platform;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad_account.revoked', 'setup', 'ad_account', p_account_id,
          jsonb_build_object('platform', v_platform, 'how', left(coalesce(p_how, 'read'), 40)));
  begin
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    values (p_tenant_id, 'ad_account', 'Meta signed Chanlytics out of your ad account',
            'Chanlytics can''t read or pause your ads until you connect again. An ad that was on keeps running, and Meta charges while it runs.',
            'campaigns/ads', 'ad_account', p_account_id::text);
  exception when others then
    -- The bell's line never costs the account its mark.
    raise warning 'ad_account_revoked: %', sqlerrm;
  end;
  return true;
end $$;

comment on function public.ad_account_revoked(uuid, uuid, text) is
  'Service-role only: the platform took Chanlytics'' access to an ad account back (00649, 00653; decision 0049): the account is revoked, with when, an ad_account.revoked event says how it was learned (a read the platform refused, or the platform''s own call), and a line on the bell tells the workspace. Its last numbers stay; nothing is read or changed until the owner connects again. True where it was connected or waiting to be chosen; false, and nothing written, otherwise.';

/* -------------------------------------------------------------- 4. what a read learned, and a payment problem -- */

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
  v_unpaid   boolean;
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
    -- The platform cannot charge for the account, and could before: said once on the bell, when it turns.
    v_unpaid := (v_standing ->> 'funding' = 'none' or v_standing ->> 'account' = 'unsettled')
            and not (v_row.standing ->> 'funding' = 'none' or v_row.standing ->> 'account' = 'unsettled');
    if coalesce(v_unpaid, false) then
      begin
        insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
        values (p_tenant_id, 'ad_account', 'Meta can''t charge your ad account',
                'No ad can be turned on until it can, and Meta may stop the ones running. Add or fix the payment method in Meta. Chanlytics looks again when you come back.',
                'campaigns/ads', 'ad_account', p_account_id::text);
      exception when others then
        -- The bell's line never costs a read what it learned.
        raise warning 'ad_account_read_keep: %', sqlerrm;
      end;
    end if;
    return 'moved';
  end if;
  return 'kept';
end $$;

comment on function public.ad_account_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what a read of a connected ad account at its platform learned (00649, 00653; decision 0049). Given standing and config it writes them (config key by key over what stood), with the account''s name and zone where given, stamps the read, clears the last failure and keeps the platform''s pace (usage_pct, read_after); an ad_account.standing event only where what the account stands on or the facts beside it moved, and a line on the bell the first time the platform cannot charge for it. Given error, a read that failed: its words and the pace are kept and what stood, stands. Answers moved, kept, failed, or not_connected for an account that is not connected, where nothing is written.';
