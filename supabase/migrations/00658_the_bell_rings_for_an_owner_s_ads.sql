-- 00658 · The bell rings for an owner's ads (decision 0050, call 15; the Ads build plan's 4.10 and G9).
--
-- Step 2 rang the bell for the connection: Meta signed Chanlytics out, or Meta can't charge the ad account. Call 15
-- adds five things about the ads themselves. Each is worked out from what the hourly read keeps (the ads, their days,
-- the account's standing) by the read's own door, in the read's own transaction:
--
--   ad_refused   Meta didn't approve an ad: Meta's own words, in quotes, and the one thing to do.
--   ad_unpaid    Meta couldn't charge the card for an ad. One cause with the account's own payment row (00653): the
--                two never ring for the same card, whichever Meta says first.
--   ad_ended     An ad that was on reached its last day.
--   ad_spent     The total an ad sits under is spent.
--   ad_quiet     An ad ran every one of the last seven days and nobody wrote from it (G9).
--
-- How one rings, and closes. A read measures what stands against what stood at the bell's last look at the account
-- (ad_accounts.rung_at): a cause that stands now and did not then rings, once, for each member who may run ads (the
-- owner: has_permission ads); a row whose cause no longer stands closes for everyone. So nothing rings again on the
-- next read, a cause that clears and comes back is told again, and a read that fails measures nothing. The first look
-- after an account connects rings nothing: what it already held is not news. An ad first seen by a later read rings
-- only for Meta's check of it, so an ad made in Meta rings the same as one made here.
--
-- One cause is one row. Ads under one ad set end together, ads under one budget spend it together, and one card stops
-- every ad of the account: each of those is one row, naming the first ad and how many more, and opening that ad.
--
--   notifications.kind     Gains the five, each a line on the bell (no email: which also email is Ruben's open call).
--   ad_accounts.rung_at    When the bell last looked at the account's ads.
--   ad_bell_cause          The one key a cause is known by: its ad, its account, its budget or its ad set.
--   ad_bell_causes         Every ad of an account under each of the five, at a moment.
--   ad_bell_hearers        Who is told: the members who may run ads.
--   ad_bell_words          A row's title and body.
--   ad_bell_ring           Rings what turned since the last look, closes what cleared, and closes the account's own
--                          rows once their cause has: a card Meta can charge again, an account read again.
--   ads_read_keep          Re-made: the same, measuring before it keeps and ringing after, never failing a read.
--   ad_account_read_keep   Re-made: the same, and the account's payment row is not rung where an ad's row already
--                          tells of the card.
--   ad_accounts_close_ad_bell   On disconnect, the account's ad rows close: nothing about those ads can be done here.
--
-- Locks. One nullable column with no default on ad_accounts, and a CHECK widened on notifications, which reads the
-- table once under a lock that holds its writers for that read; this file waits three seconds for each and no more.
-- Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: either. The rows are written by the database alone, and an older page draws an unknown kind as a
-- plain alert. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------- 1. the bell's kinds -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in',
                           'ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet']));

/* --------------------------------------------------------------------------- 2. when the bell last looked -- */

alter table public.ad_accounts add column if not exists rung_at timestamptz;
comment on column public.ad_accounts.rung_at is
  'When the bell last looked at the account''s ads (00658): each good read rings what turned since, and stamps it. Null, or older than connected_at, until the first look after a connect, which rings nothing.';

/* ------------------------------------------------------------------------------------------- 3. the causes -- */

-- The one key a cause is known by, read off one of its ads: an ad's own (not approved, nobody came), its account's
-- (a card), the budget it sits under (spent), or its ad set (ended). Both the ring and the close ask it.
create or replace function public.ad_bell_cause(p_kind text, p_ad_id uuid, p_account_id uuid, p_budget_at text,
                                                p_set_id text, p_campaign_id text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_kind
           when 'ad_unpaid' then p_account_id::text
           when 'ad_spent' then coalesce(p_budget_at || ':' || case p_budget_at
                                                                when 'set' then p_set_id
                                                                when 'campaign' then p_campaign_id
                                                              end,
                                         p_ad_id::text)
           when 'ad_ended' then coalesce('set:' || p_set_id, p_ad_id::text)
           else p_ad_id::text
         end
$$;

revoke all on function public.ad_bell_cause(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ad_bell_cause(text, uuid, uuid, text, text, text) to service_role;
comment on function public.ad_bell_cause(text, uuid, uuid, text, text, text) is
  'The key one of the bell''s five ad causes is known by, read off one of its ads (00658): the ad itself (ad_refused, ad_quiet), its account (ad_unpaid), the budget it sits under (ad_spent: set or campaign and the platform''s id), or its ad set (ad_ended). The ring and the close both ask it, so a row is matched to its cause whichever of the cause''s ads it names.';

-- What stands at a moment, read from the rows as they are. A run is over as contracts adStateOf says: its total
-- spent (what a total has spent is what is no longer left of it), ended by its owner, removed at the platform, or past
-- its last day in the account's zone (the day after the day of its end).
create or replace function public.ad_bell_causes(p_tenant_id uuid, p_account_id uuid, p_at timestamptz)
returns table (kind text, cause text, ad_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with account as (
    select a.id, coalesce(a.timezone, 'UTC') as zone,
           coalesce(a.standing ->> 'funding' = 'none' or a.standing ->> 'account' = 'unsettled', false) as unpaid
      from public.ad_accounts a
     where a.id = p_account_id and a.tenant_id = p_tenant_id
  ), held as (
    select d.id, d.platform, d.platform_ad_id, d.platform_state, d.intent, d.door, account.zone,
           public.ad_bell_cause('ad_refused', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as own_key,
           public.ad_bell_cause('ad_unpaid', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as card_key,
           public.ad_bell_cause('ad_spent', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as budget_key,
           public.ad_bell_cause('ad_ended', d.id, d.account_id, d.budget_at, d.platform_set_id,
                                d.platform_campaign_id) as set_key,
           (p_at at time zone account.zone)::date as today,
           coalesce(d.budget_kind = 'total'
                    and (case when d.budget_left_minor is null then 0
                              else d.budget_minor - d.budget_left_minor end) >= d.budget_minor, false) as finished,
           coalesce((d.ends_at at time zone account.zone)::date < (p_at at time zone account.zone)::date,
                    false) as past_end,
           coalesce(d.platform_state in ('ARCHIVED', 'DELETED'), false) as removed
      from public.ads d, account
     where d.tenant_id = p_tenant_id and d.account_id = p_account_id and d.status = 'made'
  ), ad as (
    select h.*, (h.finished or h.past_end or h.removed or h.intent = 'ended') as run_over from held h
  )
  -- Meta didn't approve it, and its run is not over.
  select 'ad_refused', a.own_key, a.id
    from ad a
   where a.platform_state = 'DISAPPROVED' and not a.run_over
  union all
  -- Meta couldn't charge the card for it, its run not over. The account's own standing says the same of every ad, so
  -- it is the same cause, kept without an ad: the ring tells of an ad's card only where the account does not.
  select 'ad_unpaid', a.card_key, a.id
    from ad a
   where a.platform_state = 'PENDING_BILLING_INFO' and not a.run_over
  union all
  select 'ad_unpaid', public.ad_bell_cause('ad_unpaid', null, account.id, null, null, null), null::uuid
    from account
   where account.unpaid
  union all
  -- The total it sits under is spent.
  select 'ad_spent', a.budget_key, a.id
    from ad a
   where a.finished and not a.removed
  union all
  -- It was on, and reached its last day with money left: ended by its run, not by its owner or the platform's bin.
  select 'ad_ended', a.set_key, a.id
    from ad a
   where a.past_end and not a.finished and not a.removed and a.intent = 'on'
  union all
  -- It ran every one of the seven days before today in its account's zone, it is still running, a tap on it opens a
  -- chat Chanlytics receives, and nobody wrote from it in those days or today so far.
  select 'ad_quiet', a.own_key, a.id
    from ad a
   where not a.run_over and a.platform_state = 'ACTIVE' and a.door in ('whatsapp', 'instagram')
     and (select count(*) from public.ad_days x
           where x.tenant_id = p_tenant_id and x.ad_id = a.id
             and x.day >= a.today - 7 and x.day < a.today and x.spend_minor > 0) = 7
     and not exists (select 1 from public.ad_entries e
                      where e.tenant_id = p_tenant_id and e.platform = a.platform
                        and e.platform_ad_id = a.platform_ad_id
                        and e.created_at >= ((a.today - 7)::timestamp at time zone a.zone)
                        and e.created_at < p_at)
$$;

revoke all on function public.ad_bell_causes(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ad_bell_causes(uuid, uuid, timestamptz) to service_role;
comment on function public.ad_bell_causes(uuid, uuid, timestamptz) is
  'Every made ad of one ad account under each of the bell''s five ad causes at a moment, with the cause''s key (00658): ad_refused (the platform''s word DISAPPROVED, its run not over), ad_unpaid (PENDING_BILLING_INFO, its run not over; and the account itself, with no ad, where its standing says the platform can''t charge it), ad_spent (its total spent), ad_ended (on, and past its last day with money left), ad_quiet (running, opening a chat Chanlytics receives, spending on each of the seven days before today in the account''s zone, and nobody wrote from it since the first of them). A run is over as contracts adStateOf says. Read from the rows as they stand; the read''s door asks it before and after it keeps.';

/* ------------------------------------------------------------------------------ 4. who is told, and in what words -- */

create or replace function public.ad_bell_hearers(p_tenant_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.user_id
    from public.memberships m
   where m.tenant_id = p_tenant_id
     and public.has_permission(m.user_id, p_tenant_id, 'ads')
$$;

revoke all on function public.ad_bell_hearers(uuid) from public, anon, authenticated;
grant execute on function public.ad_bell_hearers(uuid) to service_role;
comment on function public.ad_bell_hearers(uuid) is
  'Who hears the bell''s five ad notices (00658): the members who may run ads (has_permission ads: the owner alone, decision 0050 call 2). A partner, an operator or a viewer is never told.';

-- A row's words: what happened and to which ad, then what to do. An ad's name is quoted and cut to fit a title, and a
-- cause that holds several ads names the first and how many more.
create or replace function public.ad_bell_words(p_kind text, p_name text, p_many integer, p_said text,
                                                p_ends_at timestamptz, p_zone text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with n as (
    select '“' || case when char_length(p_name) > 80 then left(p_name, 79) || '…' else p_name end || '”'
             || case when p_many > 1 then ' and ' || (p_many - 1)::text || ' more' else '' end as named,
           p_many > 1 as several,
           nullif(left(btrim(coalesce(p_said, '')), 300), '') as said,
           to_char(p_ends_at at time zone coalesce(p_zone, 'UTC'), 'Dy FMDD Mon') as last_day
  )
  select case p_kind
           when 'ad_refused' then jsonb_build_object(
             'title', 'Meta didn''t approve ' || n.named,
             'body', coalesce('Meta said: “' || n.said || '” ', 'Meta didn''t say why. ')
                     || 'Fix it in Meta, and Meta checks it again.')
           when 'ad_unpaid' then jsonb_build_object(
             'title', 'Meta couldn''t charge your card for ' || n.named,
             'body', case when n.several then 'They don''t run' else 'It doesn''t run' end
                     || ' until Meta can. Fix the payment method in Meta.')
           when 'ad_ended' then jsonb_build_object(
             'title', n.named || ' ended',
             'body', case when n.several then 'They ran until ' || n.last_day || ', and Meta stopped showing them.'
                          else 'It ran until ' || n.last_day || ', and Meta stopped showing it.' end)
           when 'ad_spent' then jsonb_build_object(
             'title', n.named || case when n.several then ' spent their total' else ' spent its total' end,
             'body', case when n.several then 'Meta stopped showing them. Raise the total in Meta to run them longer.'
                          else 'Meta stopped showing it. Raise the total in Meta to run it longer.' end)
           when 'ad_quiet' then jsonb_build_object(
             'title', 'No one wrote from ' || n.named || ' in 7 days',
             'body', 'It ran all 7 days, and Meta charges while it runs. Pause it, or change it in Meta.')
         end
    from n
$$;

revoke all on function public.ad_bell_words(text, text, integer, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.ad_bell_words(text, text, integer, text, timestamptz, text) to service_role;
comment on function public.ad_bell_words(text, text, integer, text, timestamptz, text) is
  'The title and body of one of the bell''s five ad notices (00658): which ad, quoted and cut to fit, with how many more a cause holds; what happened, Meta''s own words in quotes where it refused one; and the one thing to do.';

/* --------------------------------------------------------------------------------------------- 5. the ring -- */

create or replace function public.ad_bell_ring(p_tenant_id uuid, p_account_id uuid, p_before text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_zone   text;
  v_now    text[];
  v_rung   integer := 0;
  v_closed integer := 0;
  v_n      integer;
begin
  select coalesce(a.timezone, 'UTC') into v_zone
    from public.ad_accounts a
   where a.id = p_account_id and a.tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object('rung', 0, 'closed', 0);
  end if;
  v_now := array(select distinct c.kind || ':' || c.cause
                   from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c);

  -- A row whose cause no longer stands closes, for everyone: the ad fixed, paid for, turned back on, written from,
  -- paused, or its total raised.
  with closing as (
    update public.notifications n
       set closed_at = now()
      from public.ads d
     where n.tenant_id = p_tenant_id
       and n.kind = any (array['ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet'])
       and n.closed_at is null
       and n.created_at >= now() - interval '30 days'
       and n.subject_type = 'ad' and n.subject_id = d.id::text
       and d.tenant_id = p_tenant_id and d.account_id = p_account_id
       and not (n.kind || ':' || public.ad_bell_cause(n.kind, d.id, d.account_id, d.budget_at, d.platform_set_id,
                                                      d.platform_campaign_id) = any (v_now))
    returning 1
  )
  select count(*) into v_closed from closing;
  -- The account's own rows (00653) close with their cause too: a card Meta can charge again, and an account read
  -- again, which is one Meta signed back in.
  if not ('ad_unpaid:' || p_account_id::text = any (v_now)) then
    v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                            p_account_id::text, 'Meta can''t charge your ad account');
  end if;
  v_closed := v_closed + public.notifications_close_about(p_tenant_id, array['ad_account'], 'ad_account',
                                                          p_account_id::text,
                                                          'Meta signed Chanlytics out of your ad account');

  -- What turned since the last look rings, once. Nothing rings on the first look after a connect.
  if p_before is not null then
    with now_causes as (
      select c.kind, c.cause, c.ad_id from public.ad_bell_causes(p_tenant_id, p_account_id, now()) c
    ), fresh as (
      select c.kind, c.cause
        from now_causes c
        left join public.ads d on d.id = c.ad_id
       where not (c.kind || ':' || c.cause = any (p_before))
       group by c.kind, c.cause
      -- A card the account's own standing tells of is the account's row (00653), never an ad's as well.
      having bool_and(c.ad_id is not null)
         -- An ad first seen by this read rings only for Meta's check of it: a run that ended, spent or went quiet
         -- before Chanlytics held it is not news.
         and (c.kind in ('ad_refused', 'ad_unpaid') or bool_or(d.created_at < now()))
    ), named as (
      select distinct on (c.kind, c.cause)
             c.kind, c.cause, d.id, d.name, d.platform_issue, d.ends_at,
             count(*) over (partition by c.kind, c.cause) as many
        from now_causes c
        join fresh f on f.kind = c.kind and f.cause = c.cause
        join public.ads d on d.id = c.ad_id
       order by c.kind, c.cause, d.name, d.id
    ), worded as (
      select w.kind, w.cause, w.id,
             public.ad_bell_words(w.kind, w.name, w.many::integer, w.platform_issue, w.ends_at, v_zone) as said
        from named w
    ), rung as (
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id,
                                        recipient_user_id)
      select p_tenant_id, w.kind, w.said ->> 'title', w.said ->> 'body', 'campaigns/ads:ad:' || w.id::text, 'ad',
             w.id::text, h.user_id
        from worded w
       cross join public.ad_bell_hearers(p_tenant_id) as h(user_id)
       -- Never a second open row for one cause.
       where not exists (
               select 1
                 from public.notifications o
                 join public.ads od on od.id::text = o.subject_id
                where o.tenant_id = p_tenant_id and o.kind = w.kind and o.recipient_user_id = h.user_id
                  and o.closed_at is null and o.subject_type = 'ad'
                  and o.created_at >= now() - interval '30 days'
                  and od.tenant_id = p_tenant_id
                  and public.ad_bell_cause(o.kind, od.id, od.account_id, od.budget_at, od.platform_set_id,
                                           od.platform_campaign_id) = w.cause)
      returning 1
    )
    select count(*) into v_n from rung;
    v_rung := v_n;
  end if;

  update public.ad_accounts a set rung_at = now() where a.id = p_account_id;
  return jsonb_build_object('rung', v_rung, 'closed', v_closed);
end $$;

revoke all on function public.ad_bell_ring(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.ad_bell_ring(uuid, uuid, text[]) to service_role;
comment on function public.ad_bell_ring(uuid, uuid, text[]) is
  'The bell''s five ad notices for one ad account, after a good read (00658, decision 0050 call 15): each cause that stands now (ad_bell_causes) and was not among p_before rings once, a row for each member who may run ads (ad_bell_hearers), naming its first ad and how many more and opening that ad; each open row whose cause no longer stands closes for everyone; the account''s own payment row closes once its card cause has, and its signed-out row once it is read again. p_before null is the first look after a connect: nothing rings. An ad first seen by this read rings only ad_refused and ad_unpaid; a card the account''s standing tells of is the account''s own row. Stamps ad_accounts.rung_at. Answers {rung, closed}. Service role; called by ads_read_keep.';

/* -------------------------------------------------- 6. the read measures before it keeps, and rings after -- */

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
        starts_at timestamptz, ends_at timestamptz, platform_state text, platform_issue text, intent text, said jsonb
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
        status, intent, platform_state, platform_issue, said, read_at
      )
      select p_tenant_id, p_account_id, v_account.platform, 'platform',
             coalesce(nullif(left(btrim(coalesce(g.name, '')), 500), ''), g.platform_ad_id),
             coalesce(g.door, 'other'), g.platform_ad_id, g.platform_set_id, g.platform_campaign_id,
             g.budget_kind, g.budget_minor, g.budget_left_minor, g.budget_at, g.budget_shared, g.starts_at, g.ends_at,
             'made', coalesce(g.intent, 'paused'), g.platform_state, nullif(left(coalesce(g.platform_issue, ''), 2000), ''),
             g.said, now()
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
    -- of an ad the read did not adopt is left out, never guessed a home.
    with given as (
      select d.* from jsonb_to_recordset(coalesce(p_read -> 'days', '[]'::jsonb)) as d(
        platform_ad_id text, day date, spend_minor bigint, impressions bigint, clicks bigint, platform_results bigint
      )
      where d.platform_ad_id is not null and d.day is not null
    ), written as (
      insert into public.ad_days as x (tenant_id, ad_id, day, spend_minor, impressions, clicks, platform_results, read_at)
      select p_tenant_id, a.id, g.day, greatest(coalesce(g.spend_minor, 0), 0), greatest(coalesce(g.impressions, 0), 0),
             greatest(coalesce(g.clicks, 0), 0), g.platform_results, now()
        from given g
        join public.ads a
          on a.tenant_id = p_tenant_id and a.platform = v_account.platform and a.platform_ad_id = g.platform_ad_id
      on conflict (ad_id, day) do update
         set spend_minor = excluded.spend_minor, impressions = excluded.impressions, clicks = excluded.clicks,
             platform_results = excluded.platform_results, read_at = now()
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
    exception when others then
      raise warning 'ads_read_keep: %', sqlerrm;
    end;
  end if;

  -- When it is read next, and looked back over next: the edge's pace, never before the platform allows. Whether the
  -- platform's notices are subscribed is kept as the read found it.
  update public.ad_accounts a
     set next_read_at = greatest(
           coalesce(nullif(p_read ->> 'next_read_at', '')::timestamptz, now() + interval '1 hour'),
           coalesce(a.read_after, '-infinity'::timestamptz)),
         settle_at = coalesce(nullif(p_read ->> 'settle_at', '')::timestamptz, a.settle_at),
         notices_at = case p_read ->> 'notices' when 'subscribed' then now() when 'dropped' then null else a.notices_at end
   where a.id = p_account_id;

  return jsonb_build_object('outcome', v_outcome, 'adopted', v_adopted, 'moved', v_moved, 'days', v_days);
end $$;

revoke all on function public.ads_read_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ads_read_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ads_read_keep(uuid, uuid, jsonb) is
  'Service-role only: what one read of a connected ad account learned, kept in one transaction (00650, 00658, decision 0049). account: handed to ad_account_read_keep (its standing and facts, or that the read failed). ads: each made on first sight as an adopted ad (origin platform) or written over by its platform id, with the budget it sits under; what the owner asked of an adopted ad follows the platform unless a press of theirs is still on its way; an ad.state_changed event only where the platform''s word moved. days: each made or written over until settled, for ads this workspace holds. settled_before: the account''s days before it are marked settled. Then, for a read that did not fail, the bell: what stood at its last look (ad_bell_causes, measured before anything is written) is handed to ad_bell_ring, and a bell that fails is a warning, never the read''s failure. next_read_at, settle_at and notices are kept on the account. Answers {outcome, adopted, moved, days}; outcome not_connected, and nothing written, for an account that is not connected.';

/* ------------------------------------------- 7. the account's payment row, never beside an ad's for one card -- */

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
    -- The platform cannot charge for the account, and could before: said once on the bell, when it turns. Not where
    -- the bell already tells of the card on an ad of this account (00658's ad_unpaid): one card, one row.
    v_unpaid := (v_standing ->> 'funding' = 'none' or v_standing ->> 'account' = 'unsettled')
            and not (v_row.standing ->> 'funding' = 'none' or v_row.standing ->> 'account' = 'unsettled');
    if coalesce(v_unpaid, false)
       and not exists (select 1
                         from public.notifications n
                         join public.ads d on d.id::text = n.subject_id
                        where n.tenant_id = p_tenant_id and n.kind = 'ad_unpaid' and n.closed_at is null
                          and n.subject_type = 'ad' and n.created_at >= now() - interval '30 days'
                          and d.tenant_id = p_tenant_id and d.account_id = p_account_id) then
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
  'Service-role only: what a read of a connected ad account at its platform learned (00649, 00653, 00658; decision 0049). Given standing and config it writes them (config key by key over what stood), with the account''s name and zone where given, stamps the read, clears the last failure and keeps the platform''s pace (usage_pct, read_after); an ad_account.standing event only where what the account stands on or the facts beside it moved, and a line on the bell the first time the platform cannot charge for it, unless an open ad_unpaid row already tells of the card on one of its ads. Given error, a read that failed: its words and the pace are kept and what stood, stands. Answers moved, kept, failed, or not_connected for an account that is not connected, where nothing is written.';

/* ------------------------------------------------------------------------- 8. a disconnect closes the ads' rows -- */

create or replace function public.ad_accounts_close_ad_bell()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    update public.notifications n
       set closed_at = now()
      from public.ads d
     where n.tenant_id = new.tenant_id
       and n.kind = any (array['ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet'])
       and n.closed_at is null
       and n.created_at >= now() - interval '30 days'
       and n.subject_type = 'ad' and n.subject_id = d.id::text
       and d.tenant_id = new.tenant_id and d.account_id = new.id;
  exception when others then
    -- The bell's close never costs the owner their disconnect.
    raise warning 'ad_accounts_close_ad_bell: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.ad_accounts_close_ad_bell() from public, anon, authenticated;
comment on function public.ad_accounts_close_ad_bell() is
  'A trigger on ad_accounts (00658): an account the owner disconnects closes every open row of the bell''s five ad notices about its ads, for everyone. Nothing about those ads can be done here any more, and the Ads page says what was left on.';

drop trigger if exists ad_accounts_close_ad_bell on public.ad_accounts;
create trigger ad_accounts_close_ad_bell after update of status on public.ad_accounts
  for each row when (new.status = 'disconnected' and old.status is distinct from 'disconnected')
  execute function public.ad_accounts_close_ad_bell();
