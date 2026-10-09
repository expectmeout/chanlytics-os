-- 00364 · A member reads the configuration as their role may, and four writes keep to what is true.
--
-- Five changes, each safe whichever of this file and the dashboard reaches production first. 00365, which takes the
-- table's own read from everyone but the owner, waits for the dashboard that reads through the doors made here.
--
--   the configuration   tenant_config_member_read lets every member read the whole row, and the calendar feed's
--                       address in it grants read access to the owner's calendar. The dashboard shows it to the owner
--                       alone (readers/settings.ts feedVisibleTo), but a member's session in a browser could read the
--                       table itself. tenant_config_read is a session's door to the row of a workspace it is a member
--                       of: the address masked as the dashboard masks it unless the caller is the owner, and
--                       feed_hidden saying so. tenant_config_write is a session's versioned write, under the permission
--                       the table's update policy names (settings): an update reads the row it changes, so once 00365
--                       lets only the owner read the row a partner's update would find nothing. A dashboard from
--                       before this reads and writes the table as it did; the one after it uses these, and the table
--                       where a database has not run this yet.
--   a refund            partner_reverse looks for the invoice's share and, finding none, parks the reversal for
--                       partner_earn to apply when the share is written. A share written and not yet committed is
--                       invisible to it, so a refund racing the invoice's first share was parked after partner_earn
--                       had read what was parked: never applied, and forgotten after 120 days, the partner keeping a
--                       refunded invoice's share. Both now take the invoice's one lock for their transaction before
--                       they read, so each waits for the other and sees what it wrote.
--   a merge             merge_people moved a person's messages, calls, deals, leads, notes and ledger, and left their
--                       visits (appointments, 00345) on the merged record, which nothing shows. They move now, and the
--                       counts say how many. No key of appointments names its person, so nothing can clash.
--   a zone              tenants.timezone is the owner's to set, and the route judges it (contracts cleanTimezone); a
--                       write through the Data API was judged by nothing, and a name Postgres does not know raises in
--                       lead_month and lead_renews_on, and Intl throws on it. A zone written or changed is now one
--                       pg_timezone_names holds, as create_workspace_for asks at creation. A row whose zone is not
--                       changed is let be, so a workspace that holds an older name is never stopped saving the rest.
--   an assignee         conversations.assignee_user_id could name any account (its key is auth.users), so a member
--                       could give a thread to someone outside the workspace. A thread assigned or reassigned now names
--                       a member of its workspace. Every writer already does: a take-over and a reply name the member
--                       who made them, a merge keeps one of the two threads' members, and a member's departure and a
--                       partner's pause clear theirs (00132). A thread that names someone who is not a member, which
--                       only a write around the product could leave, is released here as a departure releases it.
--
-- Re-runnable: functions replaced, triggers dropped and made again, the release finding nothing the second time.

set local lock_timeout = '3s';

/* ---- THE CONFIGURATION: a session's door to read the row, and its versioned write. */

create or replace function public.tenant_config_read(p_tenant_id uuid)
returns table (tenant_id uuid, config jsonb, version integer, updated_at timestamptz, updated_by uuid,
               feed_hidden boolean)
language sql
stable
security definer
set search_path = public
as $$
  -- The feed's address is masked as the dashboard masks it (readers/settings.ts maskFeedUrl): its first 24 and last 6
  -- characters around an ellipsis, or the ellipsis alone for one of 30 or fewer. Anything stored there that is not a
  -- string is the ellipsis alone.
  select c.tenant_id,
         case when f.hidden
              then jsonb_set(c.config, '{calendar,ical_url}',
                             to_jsonb(case when jsonb_typeof(f.url) = 'string' and length(f.url #>> '{}') > 30
                                           then left(f.url #>> '{}', 24) || '…' || right(f.url #>> '{}', 6)
                                           else '…' end))
              else c.config end,
         c.version, c.updated_at, c.updated_by, f.hidden
    from public.tenant_config c
    join public.memberships m
      on m.tenant_id = c.tenant_id and m.user_id = (select auth.uid())
     -- A partner's seat counts once the session showed its second factor (0013), as every seat's door asks.
     and (m.role <> 'partner' or public.session_shows_second_factor())
   cross join lateral (
     select c.config -> 'calendar' -> 'ical_url' as url,
            m.role <> 'owner'
              and coalesce(c.config -> 'calendar' -> 'ical_url', 'null'::jsonb) <> 'null'::jsonb as hidden
   ) f
   where c.tenant_id = p_tenant_id
$$;

comment on function public.tenant_config_read(uuid) is 'A member''s read of their workspace''s configuration row (00364): every member reads it, and only the owner reads the calendar feed''s address whole, since it grants read access to the owner''s calendar. Anyone else is shown it masked as the dashboard masks it, with feed_hidden true. No row for a caller who is not a member, nor for a partner''s seat on a session that has not shown its second factor (0013). The session''s door to the row once 00365 lets only the owner read the table.';

revoke all on function public.tenant_config_read(uuid) from public, anon;
grant execute on function public.tenant_config_read(uuid) to authenticated, service_role;

create or replace function public.tenant_config_write(p_tenant_id uuid, p_config jsonb, p_version integer)
returns table (outcome text, version integer, updated_at timestamptz, updated_by uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_row  public.tenant_config;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Who may, as the table's update policy says it (tenant_config_owner_update): the settings permission, a partner's
  -- only on a session that showed its second factor.
  if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only a member who may change the settings can save them.' using errcode = '42501';
  end if;
  update public.tenant_config c
     set config = p_config, version = p_version + 1, updated_by = v_user
   where c.tenant_id = p_tenant_id and c.version = p_version
  returning c.* into v_row;
  if v_row.tenant_id is not null then
    return query select 'saved'::text, v_row.version, v_row.updated_at, v_row.updated_by;
  elsif exists (select 1 from public.tenant_config c where c.tenant_id = p_tenant_id) then
    -- Someone saved between the caller's read and this write.
    return query select 'stale'::text, null::integer, null::timestamptz, null::uuid;
  else
    -- The workspace was never given its row: nothing to update, and not a conflict.
    return query select 'missing'::text, null::integer, null::timestamptz, null::uuid;
  end if;
end $$;

comment on function public.tenant_config_write(p_tenant_id uuid, p_config jsonb, p_version integer) is 'A member''s versioned write of their workspace''s configuration (00364): the whole column, where the row is still at p_version, by a caller with the settings permission (a partner on a session that showed its second factor), recorded as theirs. outcome is saved (with the new version), stale (someone saved since) or missing (no row). The session''s write once 00365 lets only the owner read the table, which an update needs.';

revoke all on function public.tenant_config_write(uuid, jsonb, integer) from public, anon;
grant execute on function public.tenant_config_write(uuid, jsonb, integer) to authenticated, service_role;

/* ---- A REFUND: the invoice's one lock, in both doors. Each is copied whole as its latest migration (00207) left it,
   the lock alone added; the grants and comments stand. */

create or replace function public.partner_earn(p_tenant_id uuid, p_invoice_id text, p_event_id text,
                                               p_amount_cents bigint, p_currency text, p_paid_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link    public.partner_tenants;
  v_partner public.partners;
  v_earned  bigint;
  v_row     public.partner_earnings;
  v_wait    record;
begin
  -- The invoice's one lock, partner_reverse's too: a reversal of this invoice waits for this share to commit, or
  -- this waits for it to have parked, so the parked reversals read below are every one there is (00364).
  perform pg_advisory_xact_lock(hashtextextended('partner_invoice:' || p_invoice_id, 0));
  select * into v_link from public.partner_tenants where tenant_id = p_tenant_id;
  if v_link.tenant_id is null then
    return null;
  end if;
  if v_link.standing = 'disqualified' or coalesce(p_amount_cents, 0) <= 0 then
    return null;
  end if;
  select * into v_partner from public.partners where id = v_link.partner_id;
  if v_partner.status = 'closed' then
    return null;
  end if;
  -- A partner who owns the workspace is paying themselves (0012, decision 5): nothing is earned.
  if exists (select 1 from public.memberships m
              where m.tenant_id = p_tenant_id and m.user_id = v_partner.user_id and m.role = 'owner') then
    return null;
  end if;
  v_earned := floor(p_amount_cents::numeric * v_partner.share_bp / 10000);
  if v_earned <= 0 then
    return null;
  end if;
  insert into public.partner_earnings
    (partner_id, tenant_id, stripe_invoice_id, stripe_event_id, kind, amount_cents, currency, share_bp,
     earned_cents, paid_at, payable_at)
  values
    (v_partner.id, p_tenant_id, p_invoice_id, p_event_id, 'share', p_amount_cents, lower(p_currency),
     v_partner.share_bp, v_earned, p_paid_at, p_paid_at + interval '30 days')
  on conflict do nothing
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'partner.earned', 'billing', 'tenant', p_tenant_id,
          jsonb_build_object('partner_id', v_partner.id, 'invoice', p_invoice_id, 'amount_cents', p_amount_cents,
                             'earned_cents', v_earned, 'currency', lower(p_currency)));
  -- What arrived before the share is applied now, in the order it arrived.
  for v_wait in
    select * from public.partner_reversals_waiting where stripe_invoice_id = p_invoice_id order by created_at
  loop
    perform public.partner_reverse(v_wait.stripe_invoice_id, v_wait.stripe_event_id, v_wait.kind, v_wait.amount_cents);
    delete from public.partner_reversals_waiting where stripe_event_id = v_wait.stripe_event_id;
  end loop;
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_earned, 'payable_at', v_row.payable_at);
end $$;

create or replace function public.partner_reverse(p_invoice_id text, p_event_id text, p_kind text, p_amount_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share   public.partner_earnings;
  v_all     bigint;
  v_same    bigint;
  v_target  bigint;
  v_delta   bigint;
  v_state   text;
  v_at      timestamptz;
  v_row     public.partner_earnings;
begin
  if p_kind not in ('refund', 'dispute', 'dispute_won') then
    raise exception 'Unknown reversal: %', p_kind using errcode = '22023';
  end if;
  -- The invoice's one lock, partner_earn's too, taken before the share is looked for: a share written and not yet
  -- committed is invisible here, and a reversal parked beside it was never applied (00364).
  perform pg_advisory_xact_lock(hashtextextended('partner_invoice:' || p_invoice_id, 0));
  select * into v_share from public.partner_earnings
   where stripe_invoice_id = p_invoice_id and kind = 'share'
   for update;
  if v_share.id is null then
    -- No share yet: it may still come (a retried invoice.paid, a replay). Kept, and applied when it is written.
    insert into public.partner_reversals_waiting (stripe_event_id, stripe_invoice_id, kind, amount_cents)
    values (p_event_id, p_invoice_id, p_kind, greatest(coalesce(p_amount_cents, 0), 0))
    on conflict (stripe_event_id) do nothing;
    return null;
  end if;
  select coalesce(sum(e.earned_cents), 0) into v_all
    from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind <> 'share';

  if p_kind = 'refund' then
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind = 'refund';
    v_target := -floor(greatest(p_amount_cents, 0)::numeric * v_share.share_bp / 10000);
    v_delta := v_target - v_same;
  elsif p_kind = 'dispute' then
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind in ('dispute', 'dispute_won');
    v_target := -floor(greatest(p_amount_cents, 0)::numeric * v_share.share_bp / 10000);
    v_delta := v_target - v_same;
  else
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind in ('dispute', 'dispute_won');
    v_delta := -v_same;
  end if;

  -- A refund or a dispute only ever takes (00203).
  if p_kind in ('refund', 'dispute') and v_delta >= 0 then
    return null;
  end if;
  if v_share.earned_cents + v_all + v_delta < 0 then
    v_delta := -(v_share.earned_cents + v_all);
  end if;
  if v_share.earned_cents + v_all + v_delta > v_share.earned_cents then
    v_delta := -v_all;
  end if;
  if v_delta = 0 then
    return null;
  end if;

  if v_share.state = 'held' then
    v_state := 'held';
    v_at := v_share.payable_at;
  elsif v_share.state = 'void' then
    v_state := 'void';
    v_at := v_share.payable_at;
  else
    v_state := 'payable';
    v_at := now();
  end if;

  insert into public.partner_earnings
    (partner_id, tenant_id, stripe_invoice_id, stripe_event_id, kind, amount_cents, currency, share_bp,
     earned_cents, paid_at, payable_at, state)
  values
    (v_share.partner_id, v_share.tenant_id, p_invoice_id, p_event_id, p_kind, greatest(p_amount_cents, 0),
     v_share.currency, v_share.share_bp, v_delta, now(), v_at, v_state)
  on conflict (stripe_event_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  -- A workspace deleted since has no events to write to (events.tenant_id is not null).
  if v_share.tenant_id is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_share.tenant_id, 'partner.reversed', 'billing', 'tenant', v_share.tenant_id,
            jsonb_build_object('partner_id', v_share.partner_id, 'invoice', p_invoice_id, 'kind', p_kind,
                               'earned_cents', v_delta, 'currency', v_share.currency));
  end if;
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_delta, 'state', v_state);
end $$;

/* ---- A MERGE takes the visits. Copied whole as its latest migration (00326) left it, the visits alone added. */

create or replace function public.merge_people(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  k          public.contacts%rowtype;
  m          public.contacts%rowtype;
  k_conv     public.conversations%rowtype;
  m_conv     public.conversations%rowtype;
  v_stop     boolean;
  v_consent  text;
  v_offers   text;
  v_email    text;
  v_offers_ended boolean;
  v_email_ended  boolean;
  v_take_control boolean;
  v_n        int;
  v_counts   jsonb := '{}'::jsonb;
  v_decision uuid;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different records to merge.' using errcode = '22023';
  end if;

  -- Both rows, locked in id order, so two merges that name the same pair wait for each other and never deadlock.
  perform 1 from contacts c where c.id in (p_keep, p_merge) order by c.id for update;
  select * into k from contacts where id = p_keep;
  select * into m from contacts where id = p_merge;
  -- A stranger learns nothing: no such record, another workspace's, or not a member, all read as not found (00027).
  if k.id is null or m.id is null or k.tenant_id is distinct from m.tenant_id then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  v_tenant := k.tenant_id;
  if not exists (select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  -- OWNER, as erase_contact is: it cannot be undone.
  if not exists (
    select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user and s.role = 'owner'
  ) then
    raise exception 'Only an owner can merge two records.' using errcode = '42501';
  end if;

  if k.erased_at is not null or k.erasing_since is not null
     or m.erased_at is not null or m.erasing_since is not null then
    raise exception 'One of these people was deleted, so there is nothing to merge.' using errcode = '22023';
  end if;
  if k.merged_into_contact_id is not null or m.merged_into_contact_id is not null then
    raise exception 'One of these records was already merged into another.' using errcode = '22023';
  end if;
  if k.phone_e164 is not null and m.phone_e164 is not null and k.phone_e164 <> m.phone_e164 then
    raise exception 'These two records have different phone numbers, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if k.email is not null and m.email is not null and k.email <> m.email then
    raise exception 'These two records have different email addresses, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
      from deals a
      join deals b on b.tenant_id = a.tenant_id and coalesce(b.service, '') = coalesce(a.service, '')
     where a.tenant_id = v_tenant and a.contact_id = p_keep and b.contact_id = p_merge
       and a.stage in ('proposed', 'won') and b.stage in ('proposed', 'won')
  ) then
    raise exception 'Both records have an open deal for the same service. Close or move one of them first.'
      using errcode = '22023';
  end if;

  /* ---- THE MARK FIRST. From here the guard's exception is true for these two threads, and the merged row holds no
     number and no address: one address, one person (contacts_tenant_phone_uq, contacts_tenant_email_uq), and the
     inbound door, which finds a person by identity and then by number, cannot find the merged row again. Its
     answers are read into the kept record below (k and m hold them) and cleared here, so one person is counted
     once wherever a count reads the table. */
  update contacts
     set merged_into_contact_id = p_keep, phone_e164 = null, email = null,
         consent = 'unknown', consent_source = null, consent_updated_at = null, dnc = false,
         consent_channels = '{}'::text[],
         marketing_consent = 'unknown', marketing_consent_source = null, marketing_consent_updated_at = null,
         marketing_channels = '{}'::text[], offers_asked_at = null,
         email_marketing = 'unknown', email_marketing_source = null, email_marketing_updated_at = null
   where id = p_merge;

  update contact_identities set contact_id = p_keep
   where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('identities', v_n);

  /* ---- THE THREAD. One per person (conversations_tenant_id_contact_id_key). */
  select * into k_conv from conversations where tenant_id = v_tenant and contact_id = p_keep for update;
  select * into m_conv from conversations where tenant_id = v_tenant and contact_id = p_merge for update;
  if m_conv.id is not null and k_conv.id is null then
    -- The kept person had none: the merged one's thread is theirs, whole.
    update conversations set contact_id = p_keep where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'taken');
  elsif m_conv.id is not null then
    -- One open escalation per thread (escalations_one_open): where both had one, the kept thread's stands and the
    -- merged thread's is resolved by the owner who merged them.
    if exists (select 1 from escalations e where e.conversation_id = k_conv.id and e.state = 'open') then
      update escalations
         set state = 'resolved', resolved_by_user_id = v_user
       where tenant_id = v_tenant and conversation_id = m_conv.id and state = 'open';
    end if;
    update escalations set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update messages set conversation_id = k_conv.id, contact_id = p_keep
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('messages', v_n);
    update calls set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update reach_out_replies set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    -- The reply turn is the thread's own (one row per thread): a reply being written on the merged thread goes on
    -- as the kept thread's where the kept thread holds none, and the kept thread's own stands otherwise.
    update reply_turns set conversation_id = k_conv.id
     where conversation_id = m_conv.id
       and not exists (select 1 from reply_turns t where t.conversation_id = k_conv.id);
    delete from reply_turns where conversation_id = m_conv.id;
    -- Nothing scheduled or running may name a thread that is about to stop existing: it names the kept one.
    update jobs
       set payload = payload || jsonb_build_object('conversation_id', k_conv.id::text)
     where tenant_id = v_tenant and state in ('scheduled', 'fired')
       and payload->>'conversation_id' = m_conv.id::text;
    update decisions set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update events set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update notifications set subject_id = k_conv.id::text
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id::text;
    update notifications set route = 'inbox/th-' || k_conv.id::text
     where tenant_id = v_tenant and route = 'inbox/th-' || m_conv.id::text;
    -- The kept thread takes the later of each clock, stays held if either was (a hold with no end stays one), is
    -- as open as the more open one, keeps who it was assigned to, and is answered by whoever was answering either
    -- (the later hold on it wins: a person typing, or a call in progress).
    v_take_control := k_conv.control_kind is null
                      or (m_conv.control_until is not null and m_conv.control_until > k_conv.control_until);
    update conversations
       set last_message_at    = greatest(k_conv.last_message_at, m_conv.last_message_at),
           last_inbound_at    = greatest(k_conv.last_inbound_at, m_conv.last_inbound_at),
           last_wa_inbound_at = greatest(k_conv.last_wa_inbound_at, m_conv.last_wa_inbound_at),
           paused_until       = case
                                  when (k_conv.state = 'needs_human' and k_conv.paused_until is null)
                                    or (m_conv.state = 'needs_human' and m_conv.paused_until is null) then null
                                  else greatest(k_conv.paused_until, m_conv.paused_until)
                                end,
           assignee_user_id   = coalesce(k_conv.assignee_user_id, m_conv.assignee_user_id),
           control_kind       = case when v_take_control then m_conv.control_kind else k_conv.control_kind end,
           control_by         = case when v_take_control then m_conv.control_by else k_conv.control_by end,
           control_ref        = case when v_take_control then m_conv.control_ref else k_conv.control_ref end,
           control_until      = case when v_take_control then m_conv.control_until else k_conv.control_until end,
           state = case
                     when 'needs_human' in (k_conv.state, m_conv.state) then 'needs_human'
                     when 'open' in (k_conv.state, m_conv.state) then 'open'
                     when 'snoozed' in (k_conv.state, m_conv.state) then 'snoozed'
                     else 'archived'
                   end,
           snooze_until = case
                            when 'needs_human' in (k_conv.state, m_conv.state)
                              or 'open' in (k_conv.state, m_conv.state) then null
                            else greatest(k_conv.snooze_until, m_conv.snooze_until)
                          end
     where id = k_conv.id;
    delete from conversations where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'folded');
  end if;

  /* ---- THE PERSON'S OWN ROWS. */
  update messages set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update calls set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('calls', v_n);
  update deals set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('deals', v_n);
  update leads set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  -- Their visits (00345), whatever made them: no key of appointments names its person, so every one moves.
  update appointments set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('appointments', v_n);
  -- A reach-out's note is kept once per person and send (person_notes_reach_out_once): one the kept person already
  -- holds stays with the merged row.
  update person_notes n set contact_id = p_keep
   where n.tenant_id = v_tenant and n.contact_id = p_merge
     and not (n.source = 'reach_out' and exists (
       select 1 from person_notes h
        where h.contact_id = p_keep and h.source = 'reach_out' and h.source_id = n.source_id));
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', v_n);
  update reach_out_sends set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set lead_contact_id = p_keep where tenant_id = v_tenant and lead_contact_id = p_merge;
  -- A list holds a person once (segment_members_pkey): the kept person joins the lists they were not on.
  insert into segment_members (segment_id, contact_id, tenant_id, added_by, added_at)
  select s.segment_id, p_keep, s.tenant_id, s.added_by, s.added_at
    from segment_members s
   where s.tenant_id = v_tenant and s.contact_id = p_merge
  on conflict (segment_id, contact_id) do nothing;
  delete from segment_members where tenant_id = v_tenant and contact_id = p_merge;
  -- A run names a person once (broadcast_recipients_pkey): a run both were on keeps the merged row's line as it is.
  update broadcast_recipients r set contact_id = p_keep
   where r.tenant_id = v_tenant and r.contact_id = p_merge
     and not exists (
       select 1 from broadcast_recipients h where h.broadcast_id = r.broadcast_id and h.contact_id = p_keep);
  -- A person's own receptionist mode, one per class. A policy row keeps
  -- its subject for life (00029's guard), so the kept person gets a row of their own and the merged one's goes.
  insert into policies (tenant_id, class, mode, subject_type, subject_id, limits)
  select p.tenant_id, p.class, p.mode, 'contact', p_keep, p.limits
    from policies p
   where p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge
     and not exists (
       select 1 from policies h
        where h.tenant_id = v_tenant and h.class = p.class and h.subject_type = 'contact' and h.subject_id = p_keep);
  -- Where both set one for a class, the stricter stands (never over ask over veto over auto): the most careful answer.
  update policies h
     set mode = p.mode
    from policies p
   where h.tenant_id = v_tenant and h.subject_type = 'contact' and h.subject_id = p_keep
     and p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge and p.class = h.class
     and array_position(array['auto', 'veto', 'ask', 'never'], p.mode)
       > array_position(array['auto', 'veto', 'ask', 'never'], h.mode);
  delete from policies where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  -- The ledger and the audit are the person's: what the merged record answered, and what was decided about it.
  update events set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update decisions set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update notifications set subject_id = p_keep::text
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge::text;
  update jobs
     set payload = payload || jsonb_build_object('contact_id', p_keep::text)
   where tenant_id = v_tenant and state in ('scheduled', 'fired') and payload->>'contact_id' = p_merge::text;

  /* ---- CONSENT (D5): the most careful answer wins on each question. contracts' mergedAnswers is this, case by case. */
  v_stop := k.consent = 'opted_out' or k.dnc or m.consent = 'opted_out' or m.dnc;
  v_consent := case
                 when v_stop then 'opted_out'
                 when 'opted_in' in (k.consent, m.consent) then 'opted_in'
                 else 'unknown'
               end;
  v_offers := case
                when 'opted_out' in (k.marketing_consent, m.marketing_consent) then 'opted_out'
                when v_stop then 'unknown'
                when 'opted_in' in (k.marketing_consent, m.marketing_consent) then 'opted_in'
                else 'unknown'
              end;
  v_email := case
               when 'opted_out' in (k.email_marketing, m.email_marketing) then 'opted_out'
               when v_stop then 'unknown'
               when 'opted_in' in (k.email_marketing, m.email_marketing) then 'opted_in'
               else 'unknown'
             end;

  -- A yes that ends here because the merged person is stopped: how 00323 says a yes ended.
  v_offers_ended := v_offers = 'unknown' and 'opted_in' in (k.marketing_consent, m.marketing_consent);
  v_email_ended := v_email = 'unknown' and 'opted_in' in (k.email_marketing, m.email_marketing);

  -- The ledger first: 00297's trigger on each entry rewrites the channel lists, and the update below is the last word.
  if v_consent is distinct from k.consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('consent', v_consent, 'previous', k.consent, 'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_offers is distinct from k.marketing_consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'marketing', 'consent', v_offers, 'previous', k.marketing_consent,
                               'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_email is distinct from k.email_marketing then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'email_marketing', 'consent', v_email, 'previous', k.email_marketing,
                               'source', 'merge', 'merged_from', p_merge, 'channel', 'email'));
  end if;

  /* ---- THE KEPT RECORD, in one statement: what it lacked, and the answers. Each answer keeps how and when it was
     given from the record that gave it; a yes a stop ended says so as 00323 does; an answer neither record gave as it
     now stands (a stop held by do-not-contact alone) says the merge. */
  update contacts
     set phone_e164      = coalesce(k.phone_e164, m.phone_e164),
         email           = coalesce(k.email, m.email),
         display_name    = coalesce(k.display_name, m.display_name),
         wa_profile_name = coalesce(k.wa_profile_name, m.wa_profile_name),
         notes           = coalesce(k.notes, m.notes),
         proposal_url    = coalesce(k.proposal_url, m.proposal_url),
         first_seen_at   = least(k.first_seen_at, m.first_seen_at),
         last_seen_at    = greatest(k.last_seen_at, m.last_seen_at),
         acquired_via    = case when k.acquired_via is not null then k.acquired_via else m.acquired_via end,
         acquired_ref    = case when k.acquired_via is not null then k.acquired_ref else m.acquired_ref end,
         consent         = v_consent,
         dnc             = v_stop,
         consent_source  = case
                             when k.consent = v_consent then k.consent_source
                             when m.consent = v_consent then m.consent_source
                             else 'merge'
                           end,
         consent_updated_at = case
                                when k.consent = v_consent then k.consent_updated_at
                                when m.consent = v_consent then m.consent_updated_at
                                else now()
                              end,
         consent_channels = case
                              when v_consent <> 'opted_in' then '{}'::text[]
                              else public.consent_channels_union(
                                case when k.consent = 'opted_in' then coalesce(k.consent_channels, '{whatsapp}') end,
                                case when m.consent = 'opted_in' then coalesce(m.consent_channels, '{whatsapp}') end)
                            end,
         marketing_consent = v_offers,
         marketing_consent_source = case
                                      when v_offers_ended then 'stop'
                                      when k.marketing_consent = v_offers then k.marketing_consent_source
                                      else m.marketing_consent_source
                                    end,
         marketing_consent_updated_at = case
                                          when v_offers_ended then now()
                                          when k.marketing_consent = v_offers then k.marketing_consent_updated_at
                                          else m.marketing_consent_updated_at
                                        end,
         marketing_channels = case
                                when v_offers <> 'opted_in' then '{}'::text[]
                                else public.consent_channels_union(
                                  case when k.marketing_consent = 'opted_in'
                                       then coalesce(k.marketing_channels, '{whatsapp}') end,
                                  case when m.marketing_consent = 'opted_in'
                                       then coalesce(m.marketing_channels, '{whatsapp}') end)
                              end,
         email_marketing = v_email,
         email_marketing_source = case
                                    when v_email_ended then 'stop'
                                    when k.email_marketing = v_email then k.email_marketing_source
                                    else m.email_marketing_source
                                  end,
         email_marketing_updated_at = case
                                        when v_email_ended then now()
                                        when k.email_marketing = v_email then k.email_marketing_updated_at
                                        else m.email_marketing_updated_at
                                      end,
         offers_asked_at = least(k.offers_asked_at, m.offers_asked_at)
   where id = p_keep;
  -- A suppressed address stays suppressed. Taking the address clears the flag (a changed address is a new one to the
  -- trigger), so it is put back in a statement that does not name the address.
  if k.email is null and m.email is not null and m.email_suppressed_at is not null then
    update contacts
       set email_suppressed_at = m.email_suppressed_at, email_suppressed_reason = m.email_suppressed_reason
     where id = p_keep;
  end if;

  -- What the lists page by (0021), for both rows: the kept person's moments now hold the merged one's words and calls.
  perform public.person_moments_recompute(array[p_keep, p_merge]);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.merged', 'contact', 'contact', p_keep,
          v_counts || jsonb_build_object('merged', p_merge));
  insert into decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_keep, 'merge', 'user', v_user,
          jsonb_build_object('merged', p_merge, 'counts', v_counts))
  returning id into v_decision;

  return jsonb_build_object(
    'contact_id', p_keep, 'merged', p_merge, 'tenant_id', v_tenant, 'decision_id', v_decision,
    'consent', v_consent, 'marketing_consent', v_offers, 'email_marketing', v_email, 'counts', v_counts);
end $$;

comment on function public.merge_people(p_keep uuid, p_merge uuid) is 'An owner merges two records of one person (decision 0028): the kept record takes the other''s identities, thread (folded into its own), deals, leads, visits, notes, lists, receptionist mode and ledger; the other is left marked merged_into_contact_id with no number or address. Consent is the most careful answer on each question (D5), each change written to the ledger with the source merge. Refuses two different phone numbers or email addresses, an erased or already merged record, and two open deals for one service. One transaction; never undone. The caller is auth.uid(); a stranger is told not found.';

revoke all on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated, service_role;

/* ---- A ZONE is one Postgres knows. */

create or replace function public.tenants_zone_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

comment on function public.tenants_zone_guard() is 'A workspace''s zone, written or changed, is one pg_timezone_names holds (00364), as create_workspace_for asks at creation: lead_month, lead_renews_on and Intl all raise on a name they do not know. A row whose zone is not changed is let be.';

revoke all on function public.tenants_zone_guard() from public, anon, authenticated;
grant execute on function public.tenants_zone_guard() to service_role;

drop trigger if exists tenants_zone_guard on public.tenants;
create trigger tenants_zone_guard
  before insert or update of timezone on public.tenants
  for each row execute function public.tenants_zone_guard();

/* ---- AN ASSIGNEE is a member of the thread's workspace. */

create or replace function public.conversations_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_user_id is null
     or (tg_op = 'UPDATE' and new.assignee_user_id is not distinct from old.assignee_user_id
         and new.tenant_id is not distinct from old.tenant_id) then
    return new;
  end if;
  if not exists (
    select 1 from public.memberships m where m.tenant_id = new.tenant_id and m.user_id = new.assignee_user_id
  ) then
    raise exception 'A thread is assigned only to a member of its workspace.' using errcode = '23503';
  end if;
  return new;
end $$;

comment on function public.conversations_assignee_guard() is 'A thread assigned or reassigned names a member of its workspace (00364): the column''s key is auth.users, which any account satisfies. A member''s departure clears theirs (clear_control_of_departed_member).';

revoke all on function public.conversations_assignee_guard() from public, anon, authenticated;
grant execute on function public.conversations_assignee_guard() to service_role;

-- What a departure would have released, had the person been a member: a thread that names someone who is not.
update public.conversations c
   set assignee_user_id = null
 where c.assignee_user_id is not null
   and not exists (
     select 1 from public.memberships m where m.tenant_id = c.tenant_id and m.user_id = c.assignee_user_id);

drop trigger if exists conversations_assignee_guard on public.conversations;
create trigger conversations_assignee_guard
  before insert or update of assignee_user_id, tenant_id on public.conversations
  for each row execute function public.conversations_assignee_guard();
