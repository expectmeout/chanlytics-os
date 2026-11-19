-- 00652 · An owner pauses an ad and turns it back on (decision 0050, calls 1, 2 and 9, as the Ads build plan's C1
-- amends them; the plan's step 2, part 6).
--
-- Since 00650 an account's ads are read. These are the two presses an owner has on every ad Chanlytics holds: Pause,
-- always; and turning one back on, which for an ad made at the platform itself is allowed only where the platform
-- holds a total with an end date for that ad alone, so the press can name the most it may cost.
--
--   ad_may_resume   The rule, on an ad's row: whether an ad found in the owner's account may be turned back on from
--                   here (the plan's C1). Contracts' adResumeRule says the same to the page; this is what is enforced.
--   ad_set_intent   The owner's press: what they asked of the ad, kept with when, its version bumped, the decision
--                   and the event written with it. The owner alone, asked here whoever knocked. A press drawn from an
--                   old version is refused; the same press twice is answered once and changes once. A press that takes
--                   back one the platform was never told of leaves nothing to tell.
--   ad_told         The platform was told, or would not be: when, what it then said of the ad, and, where it refused,
--                   the ad put back as the platform holds it, with an event that says so. A press made while the one
--                   before it was on its way is kept on its way, or let go where it could not have been made.
--   ad_tell_ask     A press the platform will not take yet (one change an ad every thirty seconds): its account's read
--                   is asked for at the moment it will, and that read sends it first.
--
-- An ask newer than the telling is on its way (ads.intent_at, ads.told_at, 00648): that is the only state a pending
-- press has, so nothing is added to the ad's row.
--
-- Deploy order: this file first. An edge ahead of it gets PGRST202 from a door and says the press is not ready here;
-- nothing before it names these doors. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------------------------- 1. the rule -- */

create or replace function public.ad_may_resume(
  p_origin text, p_platform_state text, p_budget_kind text, p_ends_at timestamptz, p_budget_shared boolean,
  p_budget_left_minor bigint
)
returns boolean
language sql
stable
set search_path = public
as $$
  -- An ad made here is its owner's to turn back on. One made at the platform is, only where the platform holds a
  -- total with an end date for it alone, something is left of it, its end has not passed, and it is paused by its own
  -- switch (paused by its ad set or its campaign, turning the ad on would start nothing).
  select coalesce(
           p_origin = 'chanlytics'
           or (    p_platform_state = 'PAUSED'
               and p_budget_kind = 'total'
               and p_ends_at is not null and p_ends_at > now()
               and p_budget_shared is false
               and coalesce(p_budget_left_minor, 0) > 0),
           false)
$$;

revoke all on function public.ad_may_resume(text, text, text, timestamp with time zone, boolean, bigint) from public, anon, authenticated;
grant execute on function public.ad_may_resume(text, text, text, timestamp with time zone, boolean, bigint) to service_role;
comment on function public.ad_may_resume(text, text, text, timestamp with time zone, boolean, bigint) is
  'Whether an ad may be turned back on from Chanlytics (00652; the Ads plan''s C1, amending decision 0050 call 9), from its row''s own facts: always for one made here; for one made at the platform, only where the platform holds a total with an end date for it alone (budget_kind total, ends_at ahead, budget_shared false, something left) and it is paused by its own switch. The rule the press''s door enforces; contracts adResumeRule says the same to the page.';

/* ------------------------------------------------------------------------------------------ 2. the owner's press -- */

create or replace function public.ad_set_intent(
  p_tenant_id uuid, p_actor uuid, p_ad_id uuid, p_version integer, p_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad      public.ads;
  v_status  text;
  v_pending boolean;
begin
  if p_intent not in ('on', 'paused') then
    raise exception 'ad_set_intent: intent is on or paused' using errcode = '22023';
  end if;
  -- The owner alone pauses an ad or turns one back on (0050, call 2): asked here again, whoever knocked.
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
  if v_ad.status <> 'made' or v_ad.platform_ad_id is null then
    return jsonb_build_object('outcome', 'not_made');
  end if;
  v_pending := v_ad.intent_at is not null and (v_ad.told_at is null or v_ad.told_at < v_ad.intent_at);
  -- The same press again: what was asked already stands. Answered once, changed once.
  if v_ad.intent = p_intent then
    return jsonb_build_object('outcome', 'same', 'version', v_ad.version, 'pending', v_pending,
                              'account_id', v_ad.account_id, 'platform_ad_id', v_ad.platform_ad_id);
  end if;
  if v_ad.version <> p_version then
    return jsonb_build_object('outcome', 'stale', 'version', v_ad.version);
  end if;
  -- Turning back on an ad the platform holds paused is the press that can spend: the rule decides it. Taking back a
  -- pause the platform was never told of spends nothing new, and is always the owner's.
  if p_intent = 'on' and not v_pending
     and not public.ad_may_resume(v_ad.origin, v_ad.platform_state, v_ad.budget_kind, v_ad.ends_at,
                                  v_ad.budget_shared, v_ad.budget_left_minor) then
    return jsonb_build_object('outcome', 'cant_resume', 'version', v_ad.version);
  end if;

  update public.ads a
     set intent = p_intent,
         intent_at = now(),
         -- A press that takes back one the platform was never told of leaves nothing to tell.
         told_at = case when v_pending then now() else a.told_at end,
         version = a.version + 1
   where a.id = p_ad_id;

  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', p_ad_id, case p_intent when 'paused' then 'pause_ad' else 'resume_ad' end, 'user', p_actor,
          jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'took_back', v_pending,
                             'left_minor', v_ad.budget_left_minor, 'ends_at', v_ad.ends_at));
  if p_intent = 'paused' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.paused', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', p_actor));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.resumed', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'by', p_actor,
                               'left_minor', v_ad.budget_left_minor, 'ends_at', v_ad.ends_at));
  end if;
  return jsonb_build_object('outcome', 'asked', 'version', v_ad.version + 1, 'tell', not v_pending,
                            'account_id', v_ad.account_id, 'platform_ad_id', v_ad.platform_ad_id,
                            'told_at', v_ad.told_at);
end $$;

revoke all on function public.ad_set_intent(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.ad_set_intent(uuid, uuid, uuid, integer, text) to service_role;
comment on function public.ad_set_intent(uuid, uuid, uuid, integer, text) is
  'Service-role only: an owner pauses an ad or turns it back on (00652; decision 0050 calls 1, 2 and 9, the Ads plan''s C1). Keeps what was asked with when, bumps the ad''s version, and writes the decision (pause_ad, resume_ad) and the event (ad.paused, ad.resumed) in one transaction. Answers outcome: asked, with the new version and whether the platform is to be told (tell: false where the press took back one it was never told of); same where what was asked already stands (a repeated press, changed once); stale for a press drawn from an old version; cant_resume where ad_may_resume says no; not_allowed for anyone but the owner (has_permission ads, asked here); not_connected, not_made, not_found.';

/* ----------------------------------------------------------------------------------- 3. the platform was told -- */

create or replace function public.ad_told(
  p_tenant_id uuid, p_ad_id uuid, p_asked text, p_outcome text, p_platform_state text default null,
  p_said text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad public.ads;
begin
  if p_asked not in ('on', 'paused') or p_outcome not in ('told', 'refused', 'unknown') then
    raise exception 'ad_told: asked is on or paused, outcome told, refused or unknown' using errcode = '22023';
  end if;
  select * into v_ad from public.ads a
   where a.id = p_ad_id and a.tenant_id = p_tenant_id
   for update;
  if not found then
    return 'not_found';
  end if;

  if p_outcome = 'refused' then
    -- The platform would not take the change: the ad stands as the platform holds it, and says so.
    update public.ads a
       set intent = case when a.intent = p_asked then (case p_asked when 'paused' then 'on' else 'paused' end)
                         else a.intent end,
           told_at = now(), intent_at = now(),
           platform_state = coalesce(nullif(left(coalesce(p_platform_state, ''), 100), ''), a.platform_state)
     where a.id = p_ad_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ad.press_refused', 'ads', 'ad', p_ad_id,
            jsonb_build_object('platform', v_ad.platform, 'name', v_ad.name, 'asked', p_asked,
                               'said', nullif(left(coalesce(p_said, ''), 300), '')));
    return 'refused';
  end if;

  -- Told, or sent with no answer (never sent again: the next read says what stands at the platform, decision 0050).
  update public.ads a
     set told_at = now(),
         platform_state = coalesce(nullif(left(coalesce(p_platform_state, ''), 100), ''), a.platform_state)
   where a.id = p_ad_id
  returning * into v_ad;
  if p_outcome = 'told' and v_ad.intent <> p_asked then
    -- The owner pressed again while this one was on its way. Their newer ask is kept on its way where it could have
    -- been made of the ad as the platform now holds it, and let go where it could not.
    if v_ad.intent = 'paused'
       or public.ad_may_resume(v_ad.origin, v_ad.platform_state, v_ad.budget_kind, v_ad.ends_at,
                               v_ad.budget_shared, v_ad.budget_left_minor) then
      update public.ads a set intent_at = clock_timestamp() + interval '1 millisecond' where a.id = p_ad_id;
      return 'again';
    end if;
    update public.ads a set intent = p_asked, intent_at = now() where a.id = p_ad_id;
    return 'kept';
  end if;
  return p_outcome;
end $$;

revoke all on function public.ad_told(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.ad_told(uuid, uuid, text, text, text, text) to service_role;
comment on function public.ad_told(uuid, uuid, text, text, text, text) is
  'Service-role only: what telling a platform of an owner''s press came to (00652; decision 0050). told: when, and the platform''s word for the ad where it was read back. unknown: sent with no answer; it is never sent again, and the next read says what stands. refused: the platform would not take it; the ad is put back as the platform holds it and an ad.press_refused event says so with the platform''s words. A press made while this one was on its way answers again (kept on its way) or kept (let go: it could not have been made). Answers told, unknown, refused, again, kept or not_found.';

/* ----------------------------------------------------------------------- 4. a press the platform will take soon -- */

create or replace function public.ad_tell_ask(p_tenant_id uuid, p_ad_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asked integer;
begin
  -- The platform takes one change to an ad every thirty seconds. A press inside that time is kept, and its account's
  -- read is asked for at the moment the platform will take it: that read sends it first. One waiting already is it.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select a.tenant_id, 'ad_read',
         greatest(now(), coalesce(d.told_at, '-infinity'::timestamptz) + interval '31 seconds',
                  coalesce(a.read_after, '-infinity'::timestamptz)),
         jsonb_build_object('account_id', a.id::text)
    from public.ads d
    join public.ad_accounts a on a.id = d.account_id
   where d.id = p_ad_id and d.tenant_id = p_tenant_id and a.status = 'connected'
     and not exists (select 1 from public.job_kinds k where k.kind = 'ad_read' and k.paused_at is not null)
  on conflict do nothing;
  get diagnostics v_asked = row_count;
  return v_asked;
end $$;

revoke all on function public.ad_tell_ask(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ad_tell_ask(uuid, uuid) to service_role;
comment on function public.ad_tell_ask(uuid, uuid) is
  'Service-role only: an owner''s press that the platform will not take yet (00652). Puts the ad''s account''s ad_read on the ledger, due when the platform will take a change to that ad (thirty seconds after the last, and never before the platform allows a call); that read sends the press first. Nothing where a read waits already. Answers how many it asked for (0 or 1).';
