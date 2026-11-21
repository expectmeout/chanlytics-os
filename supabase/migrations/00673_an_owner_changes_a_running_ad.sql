-- 00673 · An owner changes a running ad made here (the Ads plan's step 4, item 6, 4.5 and 5.2; decision 0050, calls 3,
-- 4 and 10, and its Routes: budget, end-date, end).
--
-- Turn on made an ad at Meta (00666). These are what its owner changes of it from its drawer: its total, its last day,
-- the miles it is shown across, or ending it for good. A change is kept, then told. Meta takes one change to an ad every
-- thirty seconds and an ad set's amount four times an hour, so a change it will not take yet waits, and the account's
-- read sends it when it will (ad_tell_ask, 00652). A change sent and never answered is never sent again: the account's
-- job reads back what Meta holds and settles it.
--
--   ads.change       A change of the owner's on its way to Meta: what (total, end_day, miles, end), to what, what Meta
--                    held when it was pressed, when, by whom, and when it was sent where no answer came. Null where none.
--   ads.amounts_at   When the ad's amount was lately sent to Meta: four an hour at most.
--   ad_change_keep   The owner's door: the change kept with the decision (change_ad, end_ad) and the event
--                    (ad.change_asked), the ad's version bumped.
--                    The owner alone; an ad made here and at Meta; a press drawn from an old version, or from a total or
--                    a last day Meta no longer holds, is refused, so a press never puts back what the owner changed in
--                    Meta; the same press twice is answered once; one change at a time; four amounts an hour.
--   ad_change_told   What telling Meta came to: taken (the row says Meta's new total, last day or miles, and what was
--                    approved with it; an ad ended is ended), refused (nothing changed, Meta's words kept), sent with no
--                    answer (followed, never sent again), or found not taken when that was settled.
--   decisions.verb   Gains change_ad and end_ad.
--   workspace_tell_update   Re-made on ads: a change on its way is heard by the page.
--
-- Locks. Widening the CHECK on `decisions` reads the table once under a lock that holds its writers for that read;
-- adding columns to `ads` takes its lock for a moment. This file waits three seconds for each and no more. Run again on
-- a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. Code ahead of it gets PGRST202 from a door and says a change is not
-- ready here; nothing before it names these doors or columns. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------------------- 1. the ledger -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence', 'not_a_customer', 'reply_anyway', 'connect_ad_account',
  'disconnect_ad_account', 'pause_ad', 'resume_ad', 'turn_on_ad', 'change_ad', 'end_ad'
]));

/* ----------------------------------------------------------------------------------------- 2. the ad's columns -- */

alter table public.ads add column if not exists change jsonb;
alter table public.ads drop constraint if exists ads_change_check;
alter table public.ads add constraint ads_change_check
  check (change is null or (jsonb_typeof(change) = 'object' and octet_length(change::text) <= 2000));
alter table public.ads add column if not exists amounts_at timestamptz[];
alter table public.ads drop constraint if exists ads_amounts_at_check;
alter table public.ads add constraint ads_amounts_at_check check (amounts_at is null or cardinality(amounts_at) <= 20);

comment on column public.ads.change is
  'A change of the owner''s to a running ad made here, on its way to the platform (00673; decision 0050, Routes): what (total, end_day, miles, end), to what (total_minor; end_day with ends_at, its last moment in the account''s zone; miles), what the platform held when it was pressed (from_minor, from_ends_at, from_miles), asked_at, by, and sent_at where it was sent and no answer came (followed by a read back, never sent again). Null where none is on its way. Written by ad_change_keep and ad_change_told.';
comment on column public.ads.amounts_at is
  'When the ad''s amount was lately sent to the platform (00673): Meta changes an ad set''s amount at most four times an hour, so a fifth is refused at the press with when the next is taken. The last hour''s are kept.';

/* ----------------------------------------------------------------------------------------- 3. the owner's press -- */

create or replace function public.ad_change_keep(
  p_tenant_id uuid, p_actor uuid, p_ad_id uuid, p_version integer, p_change jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad      public.ads;
  v_status  text;
  v_what    text := p_change ->> 'what';
  v_key     text;
  v_pending jsonb;
  v_held    boolean;
  v_lately  timestamptz[];
  v_miles   integer;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' or v_what is null
     or v_what not in ('total', 'end_day', 'miles', 'end')
     or (v_what = 'total' and coalesce((p_change ->> 'total_minor')::bigint, 0) <= 0)
     or (v_what = 'end_day' and ((p_change ->> 'end_day') is null or (p_change ->> 'ends_at') is null))
     or (v_what = 'miles' and coalesce((p_change ->> 'miles')::integer, 0) not between 1 and 50) then
    raise exception 'ad_change_keep: a change is a total, a last day with its moment, miles from 1 to 50, or the end'
      using errcode = '22023';
  end if;
  -- The owner alone changes an ad (0050, call 2): asked here again, whoever knocked.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- One press at a time for an ad: two that arrive together are taken in turn, and the second sees the first.
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select a.status into v_status from public.ad_accounts a where a.id = v_ad.account_id;
  if v_status is distinct from 'connected' then
    return jsonb_build_object('outcome', 'not_connected');
  end if;
  -- An ad made in Meta is changed there (0050, call 9): here it takes Pause, and Resume under its rule, alone.
  if v_ad.origin <> 'chanlytics' then
    return jsonb_build_object('outcome', 'not_here');
  end if;
  if v_ad.status <> 'made' or v_ad.platform_campaign_id is null or v_ad.platform_set_id is null then
    return jsonb_build_object('outcome', 'not_made');
  end if;
  if v_ad.intent = 'ended' then
    return jsonb_build_object('outcome', 'over', 'version', v_ad.version);
  end if;
  v_pending := v_ad.change;
  -- Meta never said whether it took the last change: nothing more is asked until a read back settles it.
  if v_pending ? 'sent_at' then
    return jsonb_build_object('outcome', 'unsure', 'version', v_ad.version);
  end if;
  v_key := case v_what when 'total' then 'total_minor' when 'end_day' then 'end_day' when 'miles' then 'miles' end;
  -- The same press again, on its way: answered once, changed once.
  if v_pending ->> 'what' = v_what and (v_what = 'end' or (v_pending -> v_key) = (p_change -> v_key)) then
    return jsonb_build_object('outcome', 'same', 'version', v_ad.version, 'pending', true);
  end if;
  v_miles := case when jsonb_typeof(v_ad.approved -> 'area') = 'object' then null
                  else (v_ad.approved ->> 'miles')::integer end;
  -- Whether Meta holds what is asked already.
  v_held := case v_what
              when 'total' then v_ad.budget_minor = (p_change ->> 'total_minor')::bigint
              when 'end_day' then v_ad.ends_at = (p_change ->> 'ends_at')::timestamptz
              when 'miles' then v_miles = (p_change ->> 'miles')::integer
              else false
            end;
  if coalesce(v_held, false) and v_pending is null then
    return jsonb_build_object('outcome', 'same', 'version', v_ad.version, 'pending', false);
  end if;
  if v_ad.version <> p_version then
    return jsonb_build_object('outcome', 'stale', 'version', v_ad.version);
  end if;
  -- Drawn from what Meta holds: a total or a last day changed in Meta since the page was read is never put back.
  if (v_what = 'total' and (p_change ->> 'from_minor')::bigint is distinct from v_ad.budget_minor)
     or (v_what = 'end_day' and (p_change ->> 'from_ends_at')::timestamptz is distinct from v_ad.ends_at) then
    return jsonb_build_object('outcome', 'stale', 'version', v_ad.version);
  end if;
  -- One change at a time: another on its way is sent first. Ending the ad takes the place of any.
  if v_pending is not null and v_pending ->> 'what' <> v_what and v_what <> 'end' then
    return jsonb_build_object('outcome', 'busy', 'version', v_ad.version);
  end if;
  -- Meta changes an ad set's amount at most four times an hour: a fifth waits, and the press says until when.
  if v_what = 'total' and not coalesce(v_held, false) then
    v_lately := array(select x from unnest(coalesce(v_ad.amounts_at, '{}'::timestamptz[])) as x
                       where x > now() - interval '1 hour' order by x);
    if cardinality(v_lately) >= 4 then
      return jsonb_build_object('outcome', 'amount_soon', 'version', v_ad.version,
                                'next_at', v_lately[cardinality(v_lately) - 3] + interval '1 hour');
    end if;
  end if;

  if coalesce(v_held, false) then
    -- It takes back one on its way that Meta was never told of: nothing is left to tell.
    update public.ads a set change = null, version = a.version + 1 where a.id = p_ad_id;
  else
    update public.ads a
       set change = jsonb_strip_nulls(jsonb_build_object(
             'what', v_what,
             'total_minor', case v_what when 'total' then (p_change ->> 'total_minor')::bigint end,
             'end_day', case v_what when 'end_day' then p_change ->> 'end_day' end,
             'ends_at', case v_what when 'end_day' then (p_change ->> 'ends_at')::timestamptz end,
             'miles', case v_what when 'miles' then (p_change ->> 'miles')::integer end,
             'from_minor', v_ad.budget_minor,
             'from_ends_at', v_ad.ends_at,
             'from_miles', v_miles,
             'asked_at', now(),
             'by', p_actor)),
           version = a.version + 1
     where a.id = p_ad_id;
  end if;

  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', p_ad_id, case v_what when 'end' then 'end_ad' else 'change_ad' end, 'user', p_actor,
          jsonb_strip_nulls(jsonb_build_object(
            'platform', v_ad.platform, 'name', v_ad.name, 'what', v_what, 'took_back', coalesce(v_held, false),
            'from_minor', v_ad.budget_minor, 'from_ends_at', v_ad.ends_at, 'from_miles', v_miles,
            'to', p_change -> v_key, 'most_minor', p_change -> 'expect_max_minor')));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad.change_asked', 'ads', 'ad', p_ad_id,
          jsonb_strip_nulls(jsonb_build_object(
            'platform', v_ad.platform, 'name', v_ad.name, 'what', v_what, 'by', p_actor, 'to', p_change -> v_key,
            'took_back', coalesce(v_held, false))));
  return jsonb_build_object('outcome', case when coalesce(v_held, false) then 'took_back' else 'asked' end,
                            'version', v_ad.version + 1, 'tell', not coalesce(v_held, false),
                            'account_id', v_ad.account_id, 'told_at', v_ad.told_at);
end $$;

revoke all on function public.ad_change_keep(uuid, uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ad_change_keep(uuid, uuid, uuid, integer, jsonb) to service_role;
comment on function public.ad_change_keep(uuid, uuid, uuid, integer, jsonb) is
  'Service-role only: an owner changes a running ad made here (00673; decision 0050, Routes budget, end-date, end): its total (total_minor), its last day (end_day, with ends_at), the miles it is shown across, or the end. Keeps the change on the ad (ads.change) with what the platform held, bumps its version, and writes the decision (change_ad, end_ad) and the event (ad.change_asked) in one transaction. Answers outcome: asked, with the new version and tell; same where it is on its way or the platform holds it already; took_back where it undid one on its way the platform was never told of; stale for a press drawn from an old version, or from a total or last day the platform no longer holds; busy while another change is on its way; amount_soon with next_at after four amounts in an hour; unsure while one sent was never answered; over for an ad ended; not_here for an ad made at the platform; not_allowed for anyone but the owner (has_permission ads, asked here); not_connected, not_made, not_found.';

/* ------------------------------------------------------------------------------- 4. what telling Meta came to -- */

create or replace function public.ad_change_told(
  p_tenant_id uuid, p_ad_id uuid, p_outcome text, p_said text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad     public.ads;
  v_change jsonb;
  v_what   text;
  v_lately timestamptz[];
  v_total  bigint;
begin
  if p_outcome not in ('told', 'refused', 'unknown', 'not_taken') then
    raise exception 'ad_change_told: outcome told, refused, unknown or not_taken' using errcode = '22023';
  end if;
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id
   for update;
  if not found then
    return 'not_found';
  end if;
  v_change := v_ad.change;
  if v_change is null then
    return 'nothing';
  end if;
  v_what := v_change ->> 'what';
  v_lately := array(select x from unnest(coalesce(v_ad.amounts_at, '{}'::timestamptz[])) as x
                     where x > now() - interval '1 hour' order by x);

  if p_outcome = 'unknown' then
    -- Sent, and no answer came: whether Meta took it is not known. Never sent again; a read back settles it.
    update public.ads a
       set change = v_change || jsonb_build_object('sent_at', now()),
           told_at = now(),
           amounts_at = case when v_what = 'total' then v_lately || now() else a.amounts_at end
     where a.id = p_ad_id;
    return 'unknown';
  end if;

  if p_outcome in ('refused', 'not_taken') then
    -- Meta holds what it held: the change goes, and an event says so, with Meta's own words where it gave them.
    update public.ads a
       set change = null,
           told_at = case when p_outcome = 'refused' then now() else a.told_at end
     where a.id = p_ad_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.press_refused', 'ads', 'ad', p_ad_id,
            jsonb_strip_nulls(jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'asked', v_what,
                                                 'said', nullif(left(coalesce(p_said, ''), 300), ''),
                                                 'unanswered', p_outcome = 'not_taken')));
    return p_outcome;
  end if;

  -- Taken: the row says what Meta now holds, and what was approved with it, until the account's next read says more.
  if v_what = 'total' then
    v_total := (v_change ->> 'total_minor')::bigint;
    update public.ads a
       set budget_left_minor = greatest(0, v_total - (a.budget_minor - coalesce(a.budget_left_minor, a.budget_minor))),
           budget_minor = v_total,
           approved = coalesce(a.approved, '{}'::jsonb)
                      || jsonb_build_object('total_minor', v_total, 'most_minor', v_total),
           amounts_at = case when v_change ? 'sent_at' then a.amounts_at else v_lately || now() end
     where a.id = p_ad_id;
  elsif v_what = 'end_day' then
    update public.ads a
       set ends_at = (v_change ->> 'ends_at')::timestamptz,
           approved = coalesce(a.approved, '{}'::jsonb)
                      || jsonb_build_object('end_day', v_change ->> 'end_day', 'ends_at', v_change ->> 'ends_at')
     where a.id = p_ad_id;
  elsif v_what = 'miles' then
    update public.ads a
       set approved = coalesce(a.approved, '{}'::jsonb) || jsonb_build_object('miles', (v_change ->> 'miles')::integer)
     where a.id = p_ad_id;
  else
    update public.ads a set intent = 'ended', intent_at = now() where a.id = p_ad_id;
  end if;
  update public.ads a set change = null, told_at = now() where a.id = p_ad_id;

  if v_what = 'end' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.ended', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', v_change ->> 'by'));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.changed', 'ads', 'ad', p_ad_id,
            jsonb_strip_nulls(jsonb_build_object(
              'platform', v_ad.platform, 'name', v_ad.name, 'what', v_what, 'by', v_change ->> 'by',
              'from_minor', v_change -> 'from_minor', 'to_minor', v_change -> 'total_minor',
              'from_ends_at', v_change -> 'from_ends_at', 'to_ends_at', v_change -> 'ends_at',
              'from_miles', v_change -> 'from_miles', 'to_miles', v_change -> 'miles')));
  end if;
  return 'told';
end $$;

revoke all on function public.ad_change_told(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ad_change_told(uuid, uuid, text, text) to service_role;
comment on function public.ad_change_told(uuid, uuid, text, text) is
  'Service-role only: what telling the platform of an owner''s change to an ad came to (00673; decision 0050). told: the row says the platform''s new total (and what is left of it), last day or miles, what was approved is kept with it, an ad ended is ended (intent ended), and an event says so (ad.changed, ad.ended). refused: nothing changed, and an ad.press_refused event keeps the platform''s words. unknown: sent with no answer; kept with sent_at, never sent again, settled by a read back. not_taken: that read back found the platform holds what it held. An amount sent is kept in amounts_at (four an hour). Answers the outcome, nothing where no change is on its way, or not_found.';

/* --------------------------------------------------------------------- 5. the page hears a change on its way -- */

create or replace trigger workspace_tell_update
  after update of name, intent, status, platform_state, platform_issue, budget_kind, budget_minor, budget_left_minor,
                  budget_shared, ends_at, intent_at, told_at, launch, shown_on, change
  on public.ads
  for each row when (
    old.name is distinct from new.name or old.intent is distinct from new.intent
    or old.status is distinct from new.status or old.platform_state is distinct from new.platform_state
    or old.platform_issue is distinct from new.platform_issue or old.budget_kind is distinct from new.budget_kind
    or old.budget_minor is distinct from new.budget_minor
    or old.budget_left_minor is distinct from new.budget_left_minor
    or old.budget_shared is distinct from new.budget_shared or old.ends_at is distinct from new.ends_at
    or old.intent_at is distinct from new.intent_at or old.told_at is distinct from new.told_at
    or old.launch is distinct from new.launch or old.shown_on is distinct from new.shown_on
    or old.change is distinct from new.change)
  execute function public.workspace_tell_row_change();
