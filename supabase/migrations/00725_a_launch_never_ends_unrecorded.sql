-- 00725 · A launch never ends unrecorded (the whole-system plan of 28 Nov 2026, lane 6, item 4; decision 0050, call 6:
-- nothing an owner approved runs without Chanlytics saying so).
--
-- When an ad account is let go, by its owner's disconnect or by Meta signing Chanlytics out, every launch of its ads
-- still on its way stops where it is (ad_accounts_stop_launches, 00666 and 00676): the ad is failed, and every part it
-- made is kept as left at the platform, "named and paused there". That holds for every launch but one. A launch whose
-- last switch, its campaign's, was already out or done may be running at Meta. Kept as failed it was said to be paused,
-- and a failed launch's parts are never read again (the read's fold leaves them out), so nothing here would ever have
-- said that it spends.
--
-- The edge now keeps each switch as going before it asks Meta for it (ads.launch `switching`), and as done once Meta
-- answered (`switched`), so the trigger can tell. A launch whose campaign's switch is out or done is kept as the ad it
-- is: made, with the platform's ids its parts hold, and the platform's word for it owed (`unknown_at`). Its page says it
-- couldn't confirm it's on and, with the account let go, that it may be on in Meta; the bell's ad_unconfirmed reads the
-- same moment. Its ad.made event says it is unconfirmed, and why. Every other launch stops as before.
--
--   ad_accounts_stop_launches   Re-made from its newest body (00676): the launches that may be running are made, never
--                               failed; the rest are failed with their parts left, as they were.
--
-- No table, no column, no new kind of event. Deploy order: either. An edge before this change keeps no `switching`, and
-- keeps `switched` only once a switch was answered: the trigger then reads what that edge kept, and is right where the
-- campaign's switch was answered, as it never was before.
set local lock_timeout = '3s';

create or replace function public.ad_accounts_stop_launches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_why text := case new.status when 'revoked' then 'signed_out' else 'disconnected' end;
begin
  -- Nothing more is sent to the platform for this account. A launch whose campaign's switch, the one that lets the ad
  -- start, is out or done may be running there: it is the ad it is, with the platform's ids its parts hold and the
  -- platform's word for it owed, never one that couldn't finish and was left paused. Any other launch on its way stops
  -- where it is, and whatever it made stays there, named and paused, for the owner to see and remove in Meta (the plan's
  -- 4.7, 8).
  with late as (
    select a.id, p.campaign_id, p.set_id, p.first_ad_id
      from public.ads a
      cross join lateral (
        select max(o.platform_id) filter (where o.kind = 'campaign' and o.version = 0) as campaign_id,
               max(o.platform_id) filter (where o.kind = 'set' and o.version = 0) as set_id,
               max(o.platform_id) filter (where o.kind = 'ad' and o.version = 1) as first_ad_id
          from public.ad_objects o
         where o.tenant_id = a.tenant_id and o.ad_id = a.id and o.state = 'made'
      ) p
     where a.tenant_id = new.tenant_id and a.account_id = new.id and a.status = 'sending'
       and (a.launch ->> 'switching' = 'campaign'
            or (jsonb_typeof(a.launch -> 'switched') = 'array' and a.launch -> 'switched' ? 'campaign'))
       and p.campaign_id is not null and p.set_id is not null and p.first_ad_id is not null
  ), made as (
    update public.ads a
       set status = 'made',
           platform_campaign_id = l.campaign_id,
           platform_set_id = l.set_id,
           platform_ad_id = l.first_ad_id,
           launch = (coalesce(a.launch, '{}'::jsonb) - 'switching')
                    || jsonb_build_object(
                         'step', 'done',
                         'unknown_at', case when jsonb_typeof(a.launch -> 'unknown_at') = 'string'
                                            then a.launch -> 'unknown_at' else to_jsonb(now()) end)
      from late l
     where a.id = l.id
    returning a.id, a.platform, a.name
  ), stopped as (
    update public.ads a
       set status = 'failed',
           launch = coalesce(a.launch, '{}'::jsonb) || jsonb_build_object('stopped', v_why, 'stopped_at', now())
     where a.tenant_id = new.tenant_id and a.account_id = new.id and a.status = 'sending'
       and a.id not in (select l.id from late l)
    returning a.id, a.platform, a.name
  ), left_there as (
    update public.ad_objects o
       set state = 'left'
     where o.tenant_id = new.tenant_id and o.ad_id in (select s.id from stopped s) and o.state in ('sent', 'made')
    returning o.ad_id
  ), told_made as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select new.tenant_id, 'ad.made', 'ads', 'ad', m.id,
           jsonb_build_object('platform', m.platform, 'name', m.name, 'unconfirmed', true, 'why', v_why)
      from made m
    returning 1
  )
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select new.tenant_id, 'ad.setup_stopped', 'ads', 'ad', s.id,
         jsonb_build_object('platform', s.platform, 'name', s.name, 'why', v_why,
                            'left', (select count(*) from left_there l where l.ad_id = s.id))
    from stopped s;
  return new;
end $$;

revoke all on function public.ad_accounts_stop_launches() from public, anon, authenticated;
comment on function public.ad_accounts_stop_launches() is
  'Trigger (00666, 00676, 00725): an ad account disconnected by its owner or signed out by the platform stops every launch of its ads still on its way, and nothing is sent to the platform after. A launch whose campaign''s switch is out or done (ads.launch switching, switched) may be running there: it is kept as the ad it is, made, with the platform''s ids its parts hold and the platform''s word for it owed (launch.unknown_at), and an ad.made event says it is unconfirmed and why. Every other launch is failed with why (disconnected, signed_out) and when (stopped_at), every part it made is kept as left at the platform (named and paused there), and an ad.setup_stopped event says so.';
