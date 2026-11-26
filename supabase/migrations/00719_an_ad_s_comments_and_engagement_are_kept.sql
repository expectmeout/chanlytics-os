-- 00719: an ad's comments and its engagement are kept (Ruben, 25 Nov 2026: "why can't we count who this ad brings?").
--
-- An ad that opens a chat brings people Chanlytics counts by name: Meta marks their first message with the ad. An ad that
-- shows a post (a boost) brings no message, so its people were never named, and its numbers were a spend, times shown
-- and taps alone, none of which says what a post's ad did. Two things Meta already says are kept from here:
--
--   1. A comment on an ad. Meta's comment carries the ad it was left on (`media.ad_id`, the Instagram webhooks' comments
--      field). Where this workspace holds that ad, the comment is kept as the person's touch of the ad, whatever post the ad
--      shows, a post made by hand in the Instagram app among them: the ad's drawer then names who commented. A comment on a
--      post Chanlytics sent is kept on the post as before, and names the ad beside it. Only a post Chanlytics sent has AI
--      draft a public answer: a comment on an ad shown on a post made by hand is counted, and answered by its owner.
--   2. What a day of the ad did, as Meta counts it (`actions`, which the read already asks for each day): plays, engagement,
--      comments, reactions, saves and shares, kept on the day beside its spend. Theirs, labelled as theirs: never added to
--      Chanlytics' count of people.
--
-- Deploy order: this before the edge that hands a comment's ad id (the door before this takes no such argument, so that
-- edge's comments would be refused until it is applied; a day's engagement sent early is only left out). An edge before
-- it still lands on this: its nine named arguments reach the new door, whose tenth has a default. The dashboard reads
-- the new column and touches only where they are, so either order there.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------ 1. a touch may name an ad -- */

alter table public.touches drop constraint if exists touches_subject_type_check;
alter table public.touches
  add constraint touches_subject_type_check check (subject_type in ('post', 'link', 'ad'));

comment on column public.touches.subject_type is
  'What was touched: a post Chanlytics sent, a link, or an ad this workspace holds (00719: a comment Meta says was left on an ad). A message that came from an ad lives in ad_entries, a form''s entry in form_entries.';

/* ---------------------------------------------------------------------------------- 2. what a day of an ad did -- */

alter table public.ad_days
  add column if not exists engaged jsonb check (engaged is null or jsonb_typeof(engaged) = 'object');

comment on column public.ad_days.engaged is
  'What the day of the ad did as the platform counts it (00719): {plays, engaged, comments, reactions, saves, shares}, each a whole number, a part the platform gave none of left out; null where the read gave none. Theirs, labelled as theirs: never added to Chanlytics'' count of people.';

/* ------------------------------------------------------------------- 3. the read keeps a day's engagement too -- */

create or replace function public.ads_read_keep(p_tenant_id uuid, p_account_id uuid, p_read jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.ad_accounts;
  v_outcome text;
  v_adopted integer := 0;
  v_moved   integer := 0;
  v_days    integer := 0;
  v_before  text[];
  v_rang    boolean := false;
begin
  select * into v_account from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id
   for update;
  if not found or v_account.status <> 'connected' then
    return jsonb_build_object('outcome', 'not_connected');
  end if;

  -- What stood for the bell at its last look (00658), measured before anything is written. None before the first look
  -- after a connect. The bell's measure never costs the read.
  if v_account.rung_at is not null and v_account.rung_at >= coalesce(v_account.connected_at, '-infinity'::timestamptz) then
    begin
      v_before := array(select distinct c.kind || ':' || c.cause
                          from public.ad_bell_causes(p_tenant_id, p_account_id, v_account.rung_at) c);
    exception when others then
      raise warning 'ads_read_keep: %', sqlerrm;
      v_before := null;
    end;
  end if;

  -- The account's own part first: its standing and facts, or that the read failed and when to ask again.
  v_outcome := public.ad_account_read_keep(p_tenant_id, p_account_id, coalesce(p_read -> 'account', '{}'::jsonb));

  if v_outcome <> 'failed' then
    -- Each ad the platform listed: made on first sight (adopted, 0049 call 10), written over after. What the owner
    -- asked of an ad found in their account follows what the platform holds, unless a press of theirs here is still
    -- on its way to the platform (an ask newer than the telling): that press wins until it is told.
    with given as (
      select g.* from jsonb_to_recordset(coalesce(p_read -> 'ads', '[]'::jsonb)) as g(
        platform_ad_id text, name text, door text, platform_set_id text, platform_campaign_id text,
        budget_kind text, budget_minor bigint, budget_left_minor bigint, budget_at text, budget_shared boolean,
        starts_at timestamptz, ends_at timestamptz, platform_state text, platform_issue text, intent text, said jsonb,
        shown_on text[]
      )
      where g.platform_ad_id is not null and g.platform_ad_id <> ''
    ), stood as (
      select a.id, a.platform_state from public.ads a
       where a.tenant_id = p_tenant_id and a.platform = v_account.platform
         and a.platform_ad_id in (select g.platform_ad_id from given g)
    ), written as (
      insert into public.ads as a (
        tenant_id, account_id, platform, origin, name, door, platform_ad_id, platform_set_id, platform_campaign_id,
        budget_kind, budget_minor, budget_left_minor, budget_at, budget_shared, starts_at, ends_at,
        status, intent, platform_state, platform_issue, said, shown_on, read_at
      )
      select p_tenant_id, p_account_id, v_account.platform, 'platform',
             coalesce(nullif(left(btrim(coalesce(g.name, '')), 500), ''), g.platform_ad_id),
             coalesce(g.door, 'other'), g.platform_ad_id, g.platform_set_id, g.platform_campaign_id,
             g.budget_kind, g.budget_minor, g.budget_left_minor, g.budget_at, g.budget_shared, g.starts_at, g.ends_at,
             'made', coalesce(g.intent, 'paused'), g.platform_state, nullif(left(coalesce(g.platform_issue, ''), 2000), ''),
             g.said, g.shown_on, now()
        from given g
      on conflict (tenant_id, platform, platform_ad_id) do update
         set name = case when a.origin = 'platform' then excluded.name else a.name end,
             door = case when a.origin = 'platform' then excluded.door else a.door end,
             platform_set_id = excluded.platform_set_id,
             platform_campaign_id = excluded.platform_campaign_id,
             budget_kind = excluded.budget_kind,
             budget_minor = excluded.budget_minor,
             budget_left_minor = excluded.budget_left_minor,
             budget_at = excluded.budget_at,
             budget_shared = excluded.budget_shared,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             intent = case when a.origin = 'platform' and (a.intent_at is null or a.told_at >= a.intent_at)
                           then excluded.intent else a.intent end,
             platform_state = excluded.platform_state,
             platform_issue = excluded.platform_issue,
             said = case when a.origin = 'platform' then excluded.said else a.said end,
             shown_on = coalesce(excluded.shown_on, a.shown_on),
             -- An ad made here whose last switch went unanswered is settled by this read: the platform has said.
             launch = case when a.origin = 'chanlytics' and a.launch ? 'unknown_at' then a.launch - 'unknown_at'
                           else a.launch end,
             read_at = now()
      returning a.id, a.name, a.platform_state, (xmax = 0) as made
    ), told as (
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      select p_tenant_id, 'ad.state_changed', 'ads', 'ad', w.id,
             jsonb_build_object('platform', v_account.platform, 'name', w.name, 'from', s.platform_state,
                                'to', w.platform_state)
        from written w join stood s on s.id = w.id
       where s.platform_state is distinct from w.platform_state
      returning 1
    )
    select (select count(*) from written w where w.made), (select count(*) from told)
      into v_adopted, v_moved;

    -- Each day the platform gave, for an ad this workspace holds: made, or written over until it is settled. A day
    -- of an ad the read did not adopt is left out, never guessed a home. What the day did (00719) is kept as the
    -- platform said it, an object or nothing.
    with given as (
      select d.* from jsonb_to_recordset(coalesce(p_read -> 'days', '[]'::jsonb)) as d(
        platform_ad_id text, day date, spend_minor bigint, impressions bigint, clicks bigint, platform_results bigint,
        engaged jsonb
      )
      where d.platform_ad_id is not null and d.day is not null
    ), written as (
      insert into public.ad_days as x (tenant_id, ad_id, day, spend_minor, impressions, clicks, platform_results,
                                       engaged, read_at)
      select p_tenant_id, a.id, g.day, greatest(coalesce(g.spend_minor, 0), 0), greatest(coalesce(g.impressions, 0), 0),
             greatest(coalesce(g.clicks, 0), 0), g.platform_results,
             case when jsonb_typeof(g.engaged) = 'object' then g.engaged end, now()
        from given g
        join public.ads a
          on a.tenant_id = p_tenant_id and a.platform = v_account.platform and a.platform_ad_id = g.platform_ad_id
      on conflict (ad_id, day) do update
         set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks,
             platform_results = excluded.platform_results, engaged = excluded.engaged, read_at = now()
       where not x.settled
      returning 1
    )
    select count(*) into v_days from written;

    -- The look back has passed these days: the platform's numbers for them have stopped moving.
    if nullif(p_read ->> 'settled_before', '') is not null then
      update public.ad_days x
         set settled = true
        from public.ads a
       where a.id = x.ad_id and a.tenant_id = p_tenant_id and a.account_id = p_account_id
         and x.tenant_id = p_tenant_id and x.day < (p_read ->> 'settled_before')::date and not x.settled;
    end if;

    -- The bell (00658): what turned since its last look rings, and what cleared closes. A ring that fails leaves the
    -- last look where it was, so the next good read rings it; it never costs this read what it learned.
    begin
      perform public.ad_bell_ring(p_tenant_id, p_account_id, v_before);
      v_rang := true;
    exception when others then
      raise warning 'ads_read_keep: %', sqlerrm;
    end;
  end if;

  -- When it is read next, and looked back over next: the edge's pace, never before the platform allows. Whether the
  -- platform's notices are subscribed is kept as the read found it, and when the bell last looked, where it rang.
  update public.ad_accounts a
     set next_read_at = greatest(
           coalesce(nullif(p_read ->> 'next_read_at', '')::timestamptz, now() + interval '1 hour'),
           coalesce(a.read_after, '-infinity'::timestamptz)),
         settle_at = coalesce(nullif(p_read ->> 'settle_at', '')::timestamptz, a.settle_at),
         notices_at = case p_read ->> 'notices' when 'subscribed' then now() when 'dropped' then null else a.notices_at end,
         rung_at = case when v_rang then now() else a.rung_at end
   where a.id = p_account_id;

  return jsonb_build_object('outcome', v_outcome, 'adopted', v_adopted, 'moved', v_moved, 'days', v_days);
end $$;

revoke all on function public.ads_read_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ads_read_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ads_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what one read of a connected ad account learned, kept in one transaction (00650, 00658, 00719, decision 0049). account: handed to ad_account_read_keep (its standing and facts, or that the read failed). ads: each made on first sight as an adopted ad (origin platform) or written over by its platform id, with the budget it sits under and where it shows (00666); a read of an ad made here settles a launch whose last switch went unanswered; what the owner asked of an adopted ad follows the platform unless a press of theirs is still on its way; an ad.state_changed event only where the platform''s word moved. days: each made or written over until settled, for ads this workspace holds, with what the day did as the platform counts it (engaged, 00719). settled_before: the account''s days before it are marked settled. Then, for a read that did not fail, the bell: what stood at its last look (ad_bell_causes, measured before anything is written) is handed to ad_bell_ring, and a bell that fails is a warning, never the read''s failure. next_read_at, settle_at and notices are kept on the account, and rung_at where the bell rang. Answers {outcome, adopted, moved, days}; outcome not_connected, and nothing written, for an account that is not connected.';

/* -------------------------------------------------------- 4. a comment on an ad is kept, by the ad Meta names -- */

drop function if exists public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz);

create or replace function public.post_comment_keep(
  p_tenant_id uuid, p_account text, p_from text, p_username text, p_comment_id text, p_media_id text,
  p_parent_id text, p_words text, p_at timestamptz, p_ad_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post    public.posts%rowtype;
  v_ad      uuid;
  v_person  jsonb;
  v_contact uuid;
  v_new     boolean;
  v_kept    jsonb;
begin
  if nullif(btrim(coalesce(p_from, '')), '') is null or nullif(btrim(coalesce(p_comment_id, '')), '') is null then
    raise exception 'post_comment_keep: a comment has an author and an id' using errcode = '22004';
  end if;
  -- The ad it was left on, where Meta names one (its comment's media.ad_id) and this workspace holds it.
  if nullif(btrim(coalesce(p_ad_id, '')), '') is not null then
    select a.id into v_ad from public.ads a
     where a.tenant_id = p_tenant_id and a.platform = 'meta' and a.platform_ad_id = btrim(p_ad_id)
     limit 1;
  end if;
  -- A comment on a post Chanlytics sent, to the account it went to.
  select * into v_post from public.posts p
   where p.tenant_id = p_tenant_id and p.place = 'instagram' and p.external_id = p_media_id
     and (p.account_id is null or p.account_id = p_account)
   order by p.published_at desc nulls last
   limit 1;
  -- One on a post made by hand is kept only where it was left on an ad of this workspace's.
  if v_post.id is null and v_ad is null then
    return jsonb_build_object('kept', false, 'why', 'not_ours');
  end if;
  if exists (select 1 from public.touches t
              where t.tenant_id = p_tenant_id and t.place = 'instagram' and t.provider_event_id = p_comment_id) then
    return jsonb_build_object('kept', false, 'why', 'again', 'post_id', v_post.id, 'ad_id', v_ad);
  end if;
  -- The person by their Instagram-scoped id, the one a DM's sender carries: found, or made by this comment.
  v_person := public.resolve_person(p_tenant_id, 'instagram', btrim(p_from), null, null,
                                    nullif(btrim(coalesce(p_username, '')), ''), 'observed', 'inbound',
                                    '{}'::jsonb, now());
  v_contact := (v_person->>'contact_id')::uuid;
  v_new := not coalesce((v_person->>'existed')::boolean, true);
  if v_new then
    perform public.person_set_first_touch(p_tenant_id, v_contact, 'instagram', null, null);
  end if;
  -- Kept on the post where Chanlytics sent it, else on the ad; the ad named beside it either way.
  v_kept := public.touches_keep(p_tenant_id, 'comment',
                              case when v_post.id is not null then 'post' else 'ad' end,
                              coalesce(v_post.id, v_ad), v_contact, 'instagram', btrim(p_comment_id),
                              coalesce(p_at, now()), null, null, v_new,
                              jsonb_strip_nulls(jsonb_build_object(
                                'words', left(nullif(btrim(coalesce(p_words, '')), ''), 2200),
                                'username', nullif(btrim(coalesce(p_username, '')), ''),
                                'thread', nullif(btrim(coalesce(p_parent_id, '')), ''),
                                'ad', v_ad)));
  -- AI's draft of a public answer, in this transaction, for a post Chanlytics sent: a delivery Meta sends again finds the
  -- comment kept, and its job. A comment on an ad shown on a post made by hand is counted, and its owner answers it.
  if (v_kept->>'kept')::boolean and v_post.id is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'comment_reply', now(),
            jsonb_build_object('touch_id', v_kept->>'touch_id', 'step', 'draft'));
  end if;
  return v_kept || jsonb_strip_nulls(jsonb_build_object('post_id', v_post.id, 'ad_id', v_ad))
                || jsonb_build_object('contact_id', v_contact, 'new_person', v_new);
end $$;

revoke all on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz, text)
  to service_role;
comment on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz, text) is
  'A person''s comment on a post Chanlytics sent, or on an ad this workspace holds (00699, 00719; the content loop PRD''s 9.2, Appendix A.3 to A.5): the post by the id it keeps and the account it went to; the ad by the id Meta''s comment names (p_ad_id, its media.ad_id), whatever post it shows; the person by their Instagram-scoped id (resolve_person; made by the comment when new, first arrival instagram); the comment kept once as a touch with its words, its thread and its ad, on the post where Chanlytics sent it and on the ad otherwise; and, for a post Chanlytics sent, AI''s draft of a public answer asked for (comment_reply, step draft) in the same transaction. {kept, touch_id, post_id?, ad_id?, contact_id, new_person}, or {kept: false, why: not_ours | again}. The service role''s.';
